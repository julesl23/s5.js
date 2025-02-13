import { S5APIInterface } from "../api/s5";
import { mkeyEd25519 } from "../constants";
import { decryptMutableBytes } from "../encryption/mutable";
import Multibase from "../identifier/multibase";
import { S5UserIdentity } from "../identity/identity";
import { RegistryEntry } from "../registry/entry";
import { FS5Directory } from "./directory";

const mhashBlake3 = 0x1e;
const mhashBlake3Default = 0x1f;

const CID_TYPE_FS5_DIRECTORY = 0x5d;
const CID_TYPE_ENCRYPTED_MUTABLE = 0x5e;

export class FS5 {
    readonly api: S5APIInterface;
    readonly identity?: S5UserIdentity;

    constructor(api: S5APIInterface, identity?: S5UserIdentity) {
        this.api = api;
        this.identity = identity;
    }

    public async ls(path: string): Promise<FS5Directory | undefined> {
        const ks = await this.getKeySet(
            await this._preprocessLocalPath(path),
        );
        const res = await this._getDirectoryMetadata(ks);

        return res?.directory;
    }

    private async getKeySet(uri: string): Promise<KeySet> {
        console.debug('getKeySet', uri);
        const url = new URL(uri);
        if (url.pathname.length < 2) {
            const cid = Multibase.decodeString(url.host);
            if (cid[0] != CID_TYPE_FS5_DIRECTORY) throw new Error('Invalid FS5 URI format');

            let writeKey: Uint8Array | undefined;

            if (url.username.length > 0) {
                if (url.username != 'write') throw new Error('Invalid FS5 URI format');

                writeKey = Multibase.decodeString(url.password).subarray(1);
            }

            if (cid[1] == mkeyEd25519) {
                // TODO Verify that writeKey matches
                return {
                    publicKey: cid.subarray(1),
                    writeKey: writeKey,
                    encryptionKey: undefined,
                };
            } else if (cid[1] == CID_TYPE_ENCRYPTED_MUTABLE) {
                // TODO Verify that writeKey matches
                return {
                    publicKey: cid.subarray(34),
                    writeKey: writeKey,
                    encryptionKey: cid.subarray(2, 34),
                };
            } else if (cid[1] == mhashBlake3Default) {
                return {
                    publicKey: cid.subarray(1),
                    writeKey: writeKey,
                    encryptionKey: undefined,
                };
            }
        }
        const pathSegments = uri.split('/');
        const lastPathSegment = pathSegments[pathSegments.length - 1];
        const parentKeySet = await this.getKeySet(
            uri.substring(0, uri.length - (lastPathSegment.length + 1)),
        );
        const parentDirectory = await this._getDirectoryMetadata(parentKeySet);

        // TODO Custom
        if (parentDirectory === undefined) {
            throw new Error(`Parent Directory of "${uri}" does not exist`);
        }

        const dir = parentDirectory.directory.directories[lastPathSegment];
        if (dir == null) {
            throw new Error(`Directory "${uri}" does not exist`);
        }
        let writeKey: Uint8Array | undefined;

        if (parentKeySet.writeKey !== undefined) {
            const nonce = dir.encryptedWriteKey.subarray(1, 25);
            writeKey = await this.api.crypto.decryptXChaCha20Poly1305(
                parentKeySet.writeKey!,
                nonce,
                dir.encryptedWriteKey.subarray(25),
            );
        }

        const ks = {
            publicKey: dir.publicKey,
            writeKey: writeKey,
            encryptionKey: dir.encryptionKey,
        };

        return ks;
    }

    private async _preprocessLocalPath(path: string): Promise<string> {
        if (path.startsWith('fs5://')) return path;
        if (`${path}/`.startsWith('home/')) {
            return `${await this._buildRootWriteURI()}/$path`;
        }
        if (`${path}/`.startsWith('archive/')) {
            return `${await this._buildRootWriteURI()}/$path`;
        }
        throw new Error('InvalidPathException');
    }

    private async _buildRootWriteURI(): Promise<string> {
        throw new Error("Method not implemented.");
    }

    private async _getDirectoryMetadata(
        ks: KeySet): Promise<{ directory: FS5Directory, entry?: RegistryEntry } | undefined> {
        let entry: RegistryEntry | undefined;

        let hash: Uint8Array;
        if (ks.publicKey[0] == mhashBlake3Default) {
            hash = ks.publicKey;
        } else {
            entry = await this.api.registryGet(ks.publicKey);

            if (entry === undefined) return undefined;

            const data = entry.data;
            if (data[0] == mhashBlake3) {
                hash = data.subarray(0, 33);
            } else {
                hash = data.subarray(2, 35);
            }
        }

        const metadataBytes = await this.api.downloadBlobAsBytes(hash);

        if (metadataBytes[0] == 0x8d) {
            if (ks.encryptionKey == null) {
                throw new Error('MissingEncryptionKey');
            }
            const decryptedMetadataBytes = await decryptMutableBytes(
                metadataBytes,
                ks.encryptionKey!,
                this.api.crypto,
            );
            return { directory: FS5Directory.deserialize(decryptedMetadataBytes), entry };
        } else {
            return { directory: FS5Directory.deserialize(metadataBytes), entry };
        }
    }
}
interface KeySet {
    // has multicodec prefix
    publicKey: Uint8Array;

    // do NOT have multicodec prefix
    writeKey?: Uint8Array;
    encryptionKey?: Uint8Array;
}