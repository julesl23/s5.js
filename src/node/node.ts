import { CryptoImplementation } from "../api/crypto";
import { S5APIInterface } from "../api/s5";
import { BlobIdentifier } from "../identifier/blob";
import { KeyValueStore } from "../kv/kv";
import { RegistryEntry } from "../registry/entry";
import { StreamMessage } from "../stream/message";
import { areArraysEqual } from "../util/arrays";
import { base64UrlNoPaddingEncode } from "../util/base64";
import { P2P } from "./p2p";
import { S5RegistryService } from "./registry";

type OpenKeyValueStoreFunction = (name: string) => Promise<KeyValueStore>;

export class S5Node implements S5APIInterface {
    readonly crypto: CryptoImplementation;
    p2p!: P2P;
    registry!: S5RegistryService;
    private blobDB!: KeyValueStore;

    constructor(crypto: CryptoImplementation) {
        this.crypto = crypto;
    }

    async init(openKeyValueStore: OpenKeyValueStoreFunction): Promise<void> {
        const p2p = await P2P.create(this.crypto);
        this.blobDB = await openKeyValueStore("s5_blob");
        const registryDB = await openKeyValueStore("s5_registry");
        this.p2p = p2p;
        this.registry = new S5RegistryService(p2p, registryDB);
        p2p.registry = this.registry;
    }

    async ensureInitialized(): Promise<void> {
        // TODO Add timeout
        while (this.p2p === undefined || !this.p2p.isConnectedToNetwork) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
        hash[0] = 0x1f;
        this.p2p.sendHashRequest(hash, [3, 5]);
        const hashStr = base64UrlNoPaddingEncode(hash);

        let urlsAlreadyTried: Set<string> = new Set([]);
        while (true) {
            for (const location of this.p2p.blobLocations.get(hashStr) ?? []) {
                const url = location.parts[0];
                if (!urlsAlreadyTried.has(url)) {
                    urlsAlreadyTried.add(url);
                    try {
                        const res = await fetch(url);
                        if (res.status >= 200 && res.status < 300) {
                            const bytes = new Uint8Array(await res.arrayBuffer())
                            const bytesHash = await this.crypto.hashBlake3(bytes);
                            if (areArraysEqual(bytesHash, hash.subarray(1))) {
                                return bytes;
                            }
                        }
                    } catch (e) {
                        console.debug('downloadBlobAsBytes', hash, e);
                    }
                }
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    registryGet(pk: Uint8Array): Promise<RegistryEntry | undefined> {
        return this.registry.get(pk);
    }

    registryListen(pk: Uint8Array): AsyncIterator<RegistryEntry> {
        throw new Error("Method not implemented.");
    }
    registrySet(entry: RegistryEntry): Promise<void> {
        return this.registry.put(entry, true);
    }
    uploadBlob(blob: Blob): Promise<BlobIdentifier> {
        throw new Error("Method not implemented.");
    }
    pinHash(hash: Uint8Array): Promise<void> {
        throw new Error("Method not implemented.");
    }
    unpinHash(hash: Uint8Array): Promise<void> {
        throw new Error("Method not implemented.");
    }
    streamSubscribe(pk: Uint8Array, afterTimestamp?: number, beforeTimestamp?: number): AsyncIterator<StreamMessage> {
        throw new Error("Method not implemented.");
    }
    streamPublish(msg: StreamMessage): Promise<void> {
        throw new Error("Method not implemented.");
    }
}