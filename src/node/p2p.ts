import { areArraysEqual } from '../util/arrays.js';
import { base64UrlNoPaddingEncode } from '../util/base64.js';
import { bytesToHex, bytesToUtf8 } from '@noble/ciphers/utils';
import { CryptoImplementation, KeyPairEd25519 } from '../api/crypto.js';
import { decodeLittleEndian } from '../util/little_endian.js';
import { deserializeRegistryEntry } from '../registry/entry.js';
import { mkeyEd25519, RECORD_TYPE_REGISTRY_ENTRY, RECORD_TYPE_STORAGE_LOCATION } from '../constants.js';
import { S5RegistryService } from './registry.js';
import * as msgpackr from 'msgpackr';

export class P2P {
    crypto!: CryptoImplementation;
    keyPair!: KeyPairEd25519;
    nodePubKey!: Uint8Array;
    peers: Map<string, WebSocketPeer> = new Map();
    registry!: S5RegistryService;

    public get isConnectedToNetwork(): boolean {
        for (const [_, peer] of this.peers) {
            if (peer.isConnected) return true;
        }
        return false;
    };

    public static async create(crypto: CryptoImplementation) {
        const p2p = new P2P();
        p2p.crypto = crypto;
        p2p.keyPair = await crypto.newKeyPairEd25519(crypto.generateSecureRandomBytes(32));
        p2p.nodePubKey = p2p.keyPair.publicKey;
        return p2p;
    }

    connectToNode(uri: string) {
        if (this.peers.has(uri)) return;
        const ws = new WebSocket(uri);
        ws.binaryType = 'arraybuffer';
        const peer = new WebSocketPeer(ws, this);
        this.peers.set(uri, peer);
    }

    blobLocations: Map<string, StorageLocation[]> = new Map();

    sendHashRequest(hash: Uint8Array, types: number[]) {
        const hashQueryPayload = msgpackr.pack([
            protocolMethodHashQuery,
            hash,
            types,
        ]).subarray(1);
        for (const peer of this.peers.values()) {
            if (peer.isConnected) {
                peer.send(hashQueryPayload)
            }
        }
    }

    addStorageLocation(
        hash: Uint8Array,
        location: StorageLocation,
    ): void {
        const array: StorageLocation[] = this.blobLocations.get(base64UrlNoPaddingEncode(hash)) ?? [];
        array.push(location);
        this.blobLocations.set(base64UrlNoPaddingEncode(hash), array);
    }
}

interface StorageLocation {
    nodePubKey: Uint8Array, type: number; parts: string[]; expiry: number;
}

const protocolMethodHandshakeOpen = 1;
const protocolMethodHandshakeDone = 2;
const protocolMethodHashQuery = 4;
const protocolMethodSignedMessage = 10;

class WebSocketPeer {
    displayName: string;
    nodePubKey!: Uint8Array;
    isConnected: boolean = false;

    p2p: P2P;
    challenge!: Uint8Array;


    constructor(public socket: WebSocket, p2p: P2P) {
        this.p2p = p2p;
        this.displayName = socket.url;
        socket.onmessage = async (event) => {
            const buffer: ArrayBuffer = event.data;
            this.onmessage(new Uint8Array(buffer));
        };
        socket.onopen = (event) => {
            // TODO Re-implement handshake and include URI used to connect to node in challenge
            const p2pChallenge = p2p.crypto.generateSecureRandomBytes(64);
            p2pChallenge.set(p2p.nodePubKey, 31);
            const initialAuthPayload = msgpackr.pack([
                protocolMethodHandshakeOpen,
                p2pChallenge,
            ]).subarray(1);
            this.challenge = p2pChallenge;
            this.send(initialAuthPayload);
        };
    }

    async onmessage(data: Uint8Array) {
        if (data[0] === protocolMethodHandshakeOpen) {
            const msg = msgpackr.unpack(new Uint8Array(
                [0x91, ...data.subarray(1)]
            ));
            const challengeResponse = msgpackr.pack([
                protocolMethodHandshakeDone,
                msg[0],
                3,
                0
            ]).subarray(1);
            this.sendSigned(challengeResponse);
        } else if (data[0] === RECORD_TYPE_STORAGE_LOCATION) {
            const hash = data.subarray(1, 34);
            const type = data[34];
            const expiry = decodeLittleEndian(data.subarray(35, 39));
            const partCount = data[39];
            let cursor = 40;
            let parts: string[] = [];
            for (let i = 0; i < partCount; i++) {
                const length = decodeLittleEndian(data.subarray(cursor, cursor + 2));
                cursor += 2;
                parts.push(bytesToUtf8(data.subarray(cursor, cursor + length)));
                cursor += length;
            }
            cursor++;
            const publicKey = data.subarray(cursor, cursor + 33);
            const signature = data.subarray(cursor + 33);
            if (publicKey[0] != mkeyEd25519) {
                throw new Error(`Public key type ${publicKey[0]} not supported`);
            }
            const isValid = await this.p2p.crypto.verifyEd25519(
                publicKey.subarray(1), data.subarray(0, cursor), signature,
            );
            if (isValid !== true) {
                throw new Error(`Invalid signature found in storage location record`);
            }
            this.p2p.addStorageLocation(hash, {
                nodePubKey: publicKey, type, parts, expiry
            });

        } else if (data[0] === RECORD_TYPE_REGISTRY_ENTRY) {
            const entry = deserializeRegistryEntry(data);
            try {
                await this.p2p.registry.put(entry);
            } catch (_) { }
        } else if (data[0] === protocolMethodSignedMessage) {
            const msg = msgpackr.unpack(new Uint8Array(
                [0x94, ...data]
            ));
            const nodePublicKey: Uint8Array = msg[1];
            const signature: Uint8Array = msg[2];
            const message: Uint8Array = msg[3];

            const isValid = await this.p2p.crypto.verifyEd25519(nodePublicKey.subarray(1), message, signature);
            if (isValid !== true) {
                throw new Error(`Invalid signature found in signed p2p message`);
            }
            const method = message[0];

            if (method === protocolMethodHandshakeDone) {
                const challengeResponse = msgpackr.unpack(new Uint8Array(
                    [0x93, ...message.subarray(0, 68)]
                ));
                if (!areArraysEqual(this.challenge, challengeResponse[1])) {
                    throw new Error(`Invalid challenge found in p2p handshake`);
                }
                this.nodePubKey = nodePublicKey;
                this.isConnected = true;
            }

        }

    }
    async sendSigned(message: Uint8Array) {
        const signature = await this.p2p.crypto.signEd25519(this.p2p.keyPair, message);
        const signedMessage = msgpackr.pack([
            protocolMethodSignedMessage,
            this.p2p.nodePubKey,
            signature,
            message,
        ]).subarray(1);
        this.socket.send(signedMessage);
    }

    send(data: Uint8Array) {
        this.socket.send(data);
    }
}
