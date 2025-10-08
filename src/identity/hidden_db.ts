import { bytesToUtf8, utf8ToBytes } from "@noble/ciphers/utils";
import { S5APIInterface } from "../api/s5.js";
import { decryptMutableBytes, encryptMutableBytes } from "../encryption/mutable.js";
import { BlobIdentifier } from "../identifier/blob.js";
import { createRegistryEntry } from "../registry/entry.js";
import { deriveHashInt, deriveHashString } from "../util/derive_hash.js";

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
        const pathKey = this.derivePathKeyForPath(path);

        const res = await this.getHiddenRawDataImplementation(
            pathKey,
        );

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
        const pathKey = this.derivePathKeyForPath(path);
        const newCID = await this.setHiddenRawDataImplementation(
            pathKey,
            data,
            revision,
        );

        if (this.cidMap.has(path)) {
            await this.api.unpinHash(this.cidMap.get(path)!.hash);
        }
        this.cidMap.set(path, newCID);
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
        const res = await this.getRawData(path);

        if (!res.data) {
            return { cid: res.cid, revision: res.revision };
        }

        return {
            data: JSON.parse(bytesToUtf8(res.data)),
            revision: res.revision,
            cid: res.cid
        };
    }

    async setJSON(
        path: string,
        data: any,
        revision: number
    ): Promise<void> {
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
        const encryptionKey = deriveHashInt(
            pathKey,
            encryptionKeyDerivationTweak,
            this.api.crypto,
        );

        const cipherText = await encryptMutableBytes(
            data,
            encryptionKey,
            this.api.crypto,
        );

        const cid = await this.api.uploadBlob(new Blob([cipherText as BlobPart]));

        const writeKey = deriveHashInt(
            pathKey,
            writeKeyDerivationTweak,
            this.api.crypto
        );

        const keyPair = await this.api.crypto.newKeyPairEd25519(writeKey);

        const sre = await createRegistryEntry(
            keyPair,
            cid.hash,
            revision,
            this.api.crypto,
        );

        await this.api.registrySet(sre);
        return cid;
    }

    async getHiddenRawDataImplementation(
        pathKey: Uint8Array,
    ): Promise<HiddenRawDataResponse> {
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

        const sre = await this.api.registryGet(keyPair.publicKey);
        if (sre === undefined) {
            return { revision: -1 };
        }
        const hash = sre!.data.subarray(0, 33);
        const bytes = await this.api.downloadBlobAsBytes(hash);

        const plaintext = await decryptMutableBytes(
            bytes,
            encryptionKey,
            this.api.crypto,
        );

        return {
            data: plaintext,
            cid: new BlobIdentifier(hash, 0),
            revision: sre!.revision,
        };
    }

}
