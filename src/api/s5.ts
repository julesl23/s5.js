///
/// This implementation follows the S5 v1 spec at https://docs.sfive.net/spec/api-interface.html
///

import { BlobIdentifier } from "../identifier/blob.js";
import { RegistryEntry } from "../registry/entry.js";
import { StreamMessage } from "../stream/message.js";
import { CryptoImplementation } from "./crypto.js";

export interface S5APIInterface {
    /// Blocks until the S5 API is initialized and ready to be used
    ensureInitialized(): Promise<void>;

    /// Upload a blob
    ///
    /// Returns the Blob Identifier of the uploaded raw blob or file
    ///
    /// Does not have a file size limit and can handle large files efficiently
    uploadBlob(blob: Blob): Promise<BlobIdentifier>;

    /// Downloads a full file blob to memory, you should only use this if they are smaller than 1 MB
    downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array>;

    pinHash(hash: Uint8Array): Promise<void>;
    unpinHash(hash: Uint8Array): Promise<void>;

    registryGet(pk: Uint8Array): Promise<RegistryEntry | undefined>;
    registryListen(pk: Uint8Array): AsyncIterator<RegistryEntry>;
    registrySet(entry: RegistryEntry): Promise<void>;

    streamSubscribe(
        pk: Uint8Array,
        afterTimestamp?: number,
        beforeTimestamp?: number,
    ): AsyncIterator<StreamMessage>;
    streamPublish(msg: StreamMessage): Promise<void>;

    get crypto(): CryptoImplementation;
}