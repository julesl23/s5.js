import { bytesToUtf8, utf8ToBytes } from "@noble/ciphers/utils";
import { S5APIInterface } from "../api/s5.js";
import { decryptMutableBytes, encryptMutableBytes } from "../encryption/mutable.js";
import { BlobIdentifier } from "../identifier/blob.js";
import { createRegistryEntry } from "../registry/entry.js";
import { deriveHashInt, deriveHashString } from "../util/derive_hash.js";
import { dbg, dbgError } from "../util/debug.js";

interface HiddenRawDataResponse {
    data?: Uint8Array;
    revision: number;
    cid?: BlobIdentifier;
}

export interface HiddenJSONResponse {
    data?: any;
    revision: number;
    cid?: BlobIdentifier;
}

const pathKeyDerivationTweak = 1;
const writeKeyDerivationTweak = 2;
const encryptionKeyDerivationTweak = 3;

abstract class HiddenDBProvider {
    abstract setRawData(
        path: string,
        data: Uint8Array,
        revision: number,
    ): Promise<void>;

    abstract getRawData(
        path: string
    ): Promise<HiddenRawDataResponse>;

    abstract setJSON(
        path: string,
        data: any,
        revision: number
    ): Promise<void>;

    abstract getJSON(
        path: string
    ): Promise<HiddenJSONResponse>;
}

export class TrustedHiddenDBProvider extends HiddenDBProvider {
    private hiddenRootKey: Uint8Array;
    private api: S5APIInterface;
    private cidMap: Map<string, BlobIdentifier> = new Map();

    constructor(hiddenRootKey: Uint8Array, api: S5APIInterface) {
        super();
        this.hiddenRootKey = hiddenRootKey;
        this.api = api;
    }

    async getRawData(path: string): Promise<HiddenRawDataResponse> {
        dbg('HIDDEN_DB', 'getRawData', 'ENTER', { path });
        const pathKey = this.derivePathKeyForPath(path);

        const res = await this.getHiddenRawDataImplementation(
            pathKey,
        );
        dbg('HIDDEN_DB', 'getRawData', 'Got result', {
            hasData: !!res.data,
            revision: res.revision,
            hasCid: !!res.cid
        });

        if (res.cid) {
            this.cidMap.set(path, res.cid);
        }

        return res;
    }

    async setRawData(
        path: string,
        data: Uint8Array,
        revision: number
    ): Promise<void> {
        dbg('HIDDEN_DB', 'setRawData', 'ENTER', { path, dataLength: data.length, revision });
        const pathKey = this.derivePathKeyForPath(path);
        dbg('HIDDEN_DB', 'setRawData', 'Calling setHiddenRawDataImplementation...');
        const newCID = await this.setHiddenRawDataImplementation(
            pathKey,
            data,
            revision,
        );
        dbg('HIDDEN_DB', 'setRawData', 'Data saved', { cidHash: newCID.hash });

        if (this.cidMap.has(path)) {
            await this.api.unpinHash(this.cidMap.get(path)!.hash);
        }
        this.cidMap.set(path, newCID);
        dbg('HIDDEN_DB', 'setRawData', 'SUCCESS');
    }

    private derivePathKeyForPath(path: string): Uint8Array {
        const pathSegments = path
            .split('/')
            .map(e => e.trim())
            .filter(element => element.length > 0);

        const key = this.deriveKeyForPathSegments(pathSegments);
        return deriveHashInt(
            key,
            pathKeyDerivationTweak,
            this.api.crypto
        );
    }

    deriveKeyForPathSegments(pathSegments: string[]): Uint8Array {
        if (pathSegments.length === 0) {
            return this.hiddenRootKey;
        }

        const parentKey = this.deriveKeyForPathSegments(
            pathSegments.slice(0, pathSegments.length - 1)
        );

        return deriveHashString(
            parentKey,
            utf8ToBytes(pathSegments[pathSegments.length - 1]),
            this.api.crypto,
        );
    }

    async getJSON(path: string): Promise<HiddenJSONResponse> {
        dbg('HIDDEN_DB', 'getJSON', 'ENTER', { path });
        const res = await this.getRawData(path);

        if (!res.data) {
            dbg('HIDDEN_DB', 'getJSON', 'No data found', { revision: res.revision });
            return { cid: res.cid, revision: res.revision };
        }

        const parsed = JSON.parse(bytesToUtf8(res.data));
        dbg('HIDDEN_DB', 'getJSON', 'SUCCESS', { revision: res.revision, hasData: true });
        return {
            data: parsed,
            revision: res.revision,
            cid: res.cid
        };
    }

    async setJSON(
        path: string,
        data: any,
        revision: number
    ): Promise<void> {
        dbg('HIDDEN_DB', 'setJSON', 'ENTER', { path, revision });
        return this.setRawData(
            path,
            utf8ToBytes(JSON.stringify(data)),
            revision,
        );
    }
    async setHiddenRawDataImplementation(

        pathKey: Uint8Array,
        data: Uint8Array,
        revision: number,
    ): Promise<BlobIdentifier> {
        dbg('HIDDEN_DB', 'setHiddenRawDataImpl', 'ENTER', { dataLength: data.length, revision });

        const encryptionKey = deriveHashInt(
            pathKey,
            encryptionKeyDerivationTweak,
            this.api.crypto,
        );

        dbg('HIDDEN_DB', 'setHiddenRawDataImpl', 'Encrypting...');
        const cipherText = await encryptMutableBytes(
            data,
            encryptionKey,
            this.api.crypto,
        );

        dbg('UPLOAD', 'setHiddenRawDataImpl', 'Uploading encrypted blob...');
        const cid = await this.api.uploadBlob(new Blob([cipherText as BlobPart]));
        dbg('UPLOAD', 'setHiddenRawDataImpl', 'Upload complete', { cidHash: cid.hash });

        const writeKey = deriveHashInt(
            pathKey,
            writeKeyDerivationTweak,
            this.api.crypto
        );

        const keyPair = await this.api.crypto.newKeyPairEd25519(writeKey);

        dbg('REGISTRY', 'setHiddenRawDataImpl', 'Creating registry entry', {
            revision,
            publicKey: keyPair.publicKey
        });
        const sre = await createRegistryEntry(
            keyPair,
            cid.hash,
            revision,
            this.api.crypto,
        );

        dbg('REGISTRY', 'setHiddenRawDataImpl', 'Setting registry entry...');
        await this.api.registrySet(sre);
        dbg('HIDDEN_DB', 'setHiddenRawDataImpl', 'SUCCESS');
        return cid;
    }

    async getHiddenRawDataImplementation(
        pathKey: Uint8Array,
    ): Promise<HiddenRawDataResponse> {
        dbg('HIDDEN_DB', 'getHiddenRawDataImpl', 'ENTER');

        const encryptionKey = deriveHashInt(
            pathKey,
            encryptionKeyDerivationTweak,
            this.api.crypto,
        );
        const writeKey = deriveHashInt(
            pathKey,
            writeKeyDerivationTweak,
            this.api.crypto,
        );
        const keyPair = await this.api.crypto.newKeyPairEd25519(writeKey);

        dbg('REGISTRY', 'getHiddenRawDataImpl', 'Fetching registry entry...', { publicKey: keyPair.publicKey });
        const sre = await this.api.registryGet(keyPair.publicKey);
        if (sre === undefined) {
            dbg('HIDDEN_DB', 'getHiddenRawDataImpl', 'No registry entry found - returning revision -1');
            return { revision: -1 };
        }
        dbg('REGISTRY', 'getHiddenRawDataImpl', 'Got registry entry', { revision: sre.revision });

        const hash = sre!.data.subarray(0, 33);

        // Handle 404/not found errors when blob doesn't exist
        let bytes: Uint8Array;
        try {
            dbg('DOWNLOAD', 'getHiddenRawDataImpl', 'Downloading blob...', { hash });
            bytes = await this.api.downloadBlobAsBytes(hash);
            dbg('DOWNLOAD', 'getHiddenRawDataImpl', 'Download complete', { byteLength: bytes.length });
        } catch (error: any) {
            // Registry entry exists but blob is gone/unreachable - return existing revision
            // This ensures next write uses (revision + 1) instead of starting from 1
            const message = error?.message?.toLowerCase() || '';
            dbgError('DOWNLOAD', 'getHiddenRawDataImpl', 'Download failed', error);

            if (message.includes('404') ||
                message.includes('not found') ||
                error?.status === 404) {
                dbg('HIDDEN_DB', 'getHiddenRawDataImpl', '404 detected - returning existing revision', {
                    revision: sre!.revision
                });
                return { revision: sre!.revision };
            }
            throw error;
        }

        dbg('HIDDEN_DB', 'getHiddenRawDataImpl', 'Decrypting...');
        const plaintext = await decryptMutableBytes(
            bytes,
            encryptionKey,
            this.api.crypto,
        );

        dbg('HIDDEN_DB', 'getHiddenRawDataImpl', 'SUCCESS', {
            dataLength: plaintext.length,
            revision: sre!.revision
        });
        return {
            data: plaintext,
            cid: new BlobIdentifier(hash, 0),
            revision: sre!.revision,
        };
    }

}
