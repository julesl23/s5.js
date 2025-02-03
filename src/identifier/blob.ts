///
/// This implementation follows the S5 v1 spec at https://docs.sfive.net/spec/blobs.html
///

import { concatBytes } from "@noble/ciphers/utils";
import { blobIdentifierPrefixBytes } from "../constants"
import { decodeLittleEndian, encodeLittleEndian } from "../util/little_endian";
import Multibase from "./multibase.js";

export class BlobIdentifier extends Multibase {
    readonly hash: Uint8Array;
    readonly size: number;

    constructor(hash: Uint8Array, size: number) {
        super();
        this.hash = hash;
        this.size = size;
    }

    static decode(cid: string): BlobIdentifier {
        const decodedBytes = Multibase.decodeString(cid);
        return BlobIdentifier._fromBytes(decodedBytes);
    }

    static fromBytes(bytes: Uint8Array): BlobIdentifier {
        return BlobIdentifier._fromBytes(bytes);
    }

    private static _fromBytes(bytes: Uint8Array): BlobIdentifier {
        // TODO Do some checks first

        let hash = bytes.subarray(2, 35);
        let sizeBytes = bytes.subarray(35);
        let size = decodeLittleEndian(sizeBytes);

        return new BlobIdentifier(hash, size);
    }

    toBytes(): Uint8Array {
        let sizeBytes = encodeLittleEndian(this.size, 8);

        while (sizeBytes.length > 1 && sizeBytes[sizeBytes.length - 1] === 0) {
            sizeBytes = sizeBytes.slice(0, -1);
        }

        return concatBytes(
            blobIdentifierPrefixBytes,
            this.hash,
            sizeBytes,
        );
    }

    override toString(): string {
        return this.toBase32();
    }
}
