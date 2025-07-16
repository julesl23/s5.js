import { base32 } from "multiformats/bases/base32";
import { S5APIInterface } from "../api/s5";
import { mkeyEd25519, MULTIHASH_BLAKE3 } from "../constants";
import { decryptMutableBytes, encryptMutableBytes } from "../encryption/mutable";
import Multibase from "../identifier/multibase";
import { S5UserIdentity } from "../identity/identity";
import { createRegistryEntry, RegistryEntry } from "../registry/entry";
import { base64UrlNoPaddingEncode } from "../util/base64";
import { deriveHashInt } from "../util/derive_hash";
import { DirV1, FileRef, DirRef, DirLink } from "./dirv1/types";
import { DirV1Serialiser } from "./dirv1/serialisation";
import { concatBytes } from "@noble/hashes/utils";
import { encodeLittleEndian } from "../util/little_endian";
import { BlobIdentifier } from "../identifier/blob";
import { padFileSize } from "../encryption/padding";

const mhashBlake3 = 0x1e;
const mhashBlake3Default = 0x1f;

const CID_TYPE_FS5_DIRECTORY = 0x5d;
const CID_TYPE_ENCRYPTED_MUTABLE = 0x5e;

const ENCRYPTION_ALGORITHM_XCHACHA20POLY1305 = 0xa6;

type DirectoryTransactionFunction = (dir: DirV1, writeKey: Uint8Array) => Promise<DirV1 | undefined>;

export class FS5 {
    readonly api: S5APIInterface;
    readonly identity?: S5UserIdentity;

    constructor(api: S5APIInterface, identity?: S5UserIdentity) {
        this.api = api;
        this.identity = identity;
    }


    public async list(path: string): Promise<DirV1 | undefined> {
        const ks = await this.getKeySet(
            await this._preprocessLocalPath(path),
        );
        const res = await this._getDirectoryMetadata(ks);

        return res?.directory;
    }


    public async uploadBlobWithoutEncryption(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
        const blobIdentifier = await this.api.uploadBlob(blob);
        return {
            hash: blobIdentifier.hash.subarray(1), // Remove multihash prefix
            size: blob.size
        };
    }

    public async uploadBlobEncrypted(blob: Blob): Promise<{ hash: Uint8Array; size: number; encryptionKey: Uint8Array }> {
        const plaintextBlake3Hash = await this.api.crypto.hashBlake3Blob(blob);
        const size = blob.size;
        const plaintextBlobIdentifier = new BlobIdentifier(new Uint8Array([MULTIHASH_BLAKE3, ...plaintextBlake3Hash]), size)

        const maxChunkSizeAsPowerOf2 = 18;
        const maxChunkSize = 262144; // 256 KiB
        const chunkCount = Math.ceil(size / maxChunkSize);
        const totalSizeWithEncryptionOverhead = size + chunkCount * 16;
        let padding = padFileSize(totalSizeWithEncryptionOverhead) - totalSizeWithEncryptionOverhead;
        const lastChunkSize = size % maxChunkSize;
        if ((padding + lastChunkSize) >= maxChunkSize) {
            padding = maxChunkSize - lastChunkSize;
        }

        const encryptionKey = this.api.crypto.generateSecureRandomBytes(32);

        let encryptedBlob = new Blob();

        for (let chunkIndex = 0; chunkIndex < (chunkCount - 1); chunkIndex++) {
            const plaintext = new Uint8Array(await blob.slice(chunkIndex * maxChunkSize, (chunkIndex + 1) * maxChunkSize).arrayBuffer());
            const encrypted = await this.api.crypto.encryptXChaCha20Poly1305(encryptionKey, encodeLittleEndian(chunkIndex, 24), plaintext);
            encryptedBlob = new Blob([encryptedBlob, encrypted]);
        }
        const lastChunkPlaintext = new Uint8Array([
            ...(new Uint8Array(await blob.slice((chunkCount - 1) * maxChunkSize).arrayBuffer())),
            ...(new Uint8Array(padding))
        ]);

        const lastChunkEncrypted = await this.api.crypto.encryptXChaCha20Poly1305(encryptionKey, encodeLittleEndian(chunkCount - 1, 24), lastChunkPlaintext);
        encryptedBlob = new Blob([encryptedBlob, lastChunkEncrypted]);

        const encryptedBlobIdentifier = await this.api.uploadBlob(encryptedBlob);

        const plaintextCID = new Uint8Array([0x26, ...plaintextBlobIdentifier.toBytes().subarray(2)]);
        plaintextCID[1] = 0x1f;

        const cidTypeEncryptedStatic = 0xae;
        const encryptedCIDBytes = new Uint8Array([
            cidTypeEncryptedStatic,
            ENCRYPTION_ALGORITHM_XCHACHA20POLY1305,
            maxChunkSizeAsPowerOf2,
            0x1f,
            ...encryptedBlobIdentifier.hash.subarray(1),
            ...encryptionKey,
            ...encodeLittleEndian(padding, 4),
            ...plaintextCID,
        ])

        return {
            hash: plaintextBlake3Hash,
            size: size,
            encryptionKey: encryptionKey
        };
    }

    async createDirectory(
        path: string,
        name: string,
    ): Promise<DirRef> {
        // TODO validateFileSystemEntityName(name);

        let dirReference: DirRef | undefined;

        const res = await this.runTransactionOnDirectory(
            await this._preprocessLocalPath(path),
            async (dir, writeKey) => {
                if (dir.dirs.has(name)) {
                    throw new Error('Directory already contains a subdirectory with the same name');
                }
                const newDir = await this._createDirectory(name, writeKey);
                dir.dirs.set(name, newDir);
                dirReference = newDir;
                return dir;
            },
        );
        res.unwrap();
        return dirReference!;
    }
    public async createFile(
        directoryPath: string,
        fileName: string,
        fileVersion: FS5FileVersion,
        mediaType?: string,
    ): Promise<FS5FileReference> {
        // TODO validateFileSystemEntityName(name);

        let fileReference: FS5FileReference | undefined;

        const res = await this.runTransactionOnDirectory(
            await this._preprocessLocalPath(directoryPath),
            async (dir, _) => {
                if (dir.files.has(fileName)) {
                    throw 'Directory already contains a file with the same name';
                }
                const file = new FS5FileReference(
                    {
                        1: fileName,
                        2: fileVersion.ts,
                        6: mediaType, // TODO ?? lookupMimeType(fileName),
                        5: 0,
                        4: fileVersion.data,
                        // TODO 7: fileVersion.ext,
                    }
                );
                // file.file.ext = null;
                dir.files.set(fileName, file);
                fileReference = file;

                return dir;
            },
        );
        res.unwrap();
        return fileReference!;
    }


    private async runTransactionOnDirectory(
        uri: string,
        transaction: DirectoryTransactionFunction,
    ): Promise<DirectoryTransactionResult> {
        const ks = await this.getKeySet(uri);
        const dir = await this._getDirectoryMetadata(ks);
        if (ks.writeKey == null) throw new Error(`Missing write access for ${uri}`);
        try {
            const transactionRes = await transaction(
                dir?.directory ?? {
                    magic: "S5.pro",
                    header: {},
                    dirs: new Map(),
                    files: new Map()
                },
                ks.writeKey!,
            );
            if (transactionRes == null) {
                return new DirectoryTransactionResult(
                    DirectoryTransactionResultType.NotModified,
                );
            }

            // TODO Make sure this is secure
            const newBytes = ks.encryptionKey !== undefined
                ? await encryptMutableBytes(
                    DirV1Serialiser.serialise(transactionRes),
                    ks.encryptionKey!,
                    this.api.crypto,
                )
                : DirV1Serialiser.serialise(transactionRes);

            const cid = await this.api.uploadBlob(new Blob([newBytes]));

            const kp = await this.api.crypto.newKeyPairEd25519(ks.writeKey!);

            const entry = await createRegistryEntry(
                kp,
                cid.hash,
                (dir?.entry?.revision ?? 0) + 1,
                this.api.crypto,
            );

            await this.api.registrySet(entry);

            return new DirectoryTransactionResult(
                DirectoryTransactionResultType.Ok,
            );
        } catch (e) {
            return new DirectoryTransactionResult(
                DirectoryTransactionResultType.Error,
                e,
            );
        }
    }

    public async ensureIdentityInitialized(): Promise<void> {
        const res = await this.runTransactionOnDirectory(
            await this._buildRootWriteURI(),
            async (dir, writeKey) => {
                const names = ['home', 'archive'];
                let hasChanges = false;
                for (const name of names) {
                    if (dir.dirs.has(name)) continue;
                    dir.dirs.set(name, await this._createDirectory(name, writeKey));
                    hasChanges = true;
                }
                if (!hasChanges) return undefined;
                return dir;
            },
        );
        res.unwrap();
    }

    async _createDirectory(
        name: string,
        writeKey: Uint8Array,
    ): Promise<DirRef> {
        const newWriteKey = this.api.crypto.generateSecureRandomBytes(32);

        const ks = await this._deriveKeySetFromWriteKey(newWriteKey);

        // Create empty DirV1
        const emptyDir: DirV1 = {
            magic: "S5.pro",
            header: {},
            dirs: new Map(),
            files: new Map()
        };
        
        // Serialize and upload
        const serialized = DirV1Serialiser.serialise(emptyDir);
        const cid = await this.api.uploadBlob(new Blob([serialized]));

        // Create DirRef pointing to the new directory
        const dirRef: DirRef = {
            link: {
                type: 'fixed_hash_blake3',
                hash: cid.hash.subarray(1) // Remove multihash prefix
            },
            ts_seconds: Math.floor(Date.now() / 1000)
        };

        return dirRef;
    }
    async _deriveKeySetFromWriteKey(writeKey: Uint8Array): Promise<KeySet> {
        const publicKey =
            (await this.api.crypto.newKeyPairEd25519(writeKey)).publicKey;
        const encryptionKey = deriveHashInt(
            writeKey,
            0x5e,
            this.api.crypto,
        );
        return {
            publicKey: publicKey,
            writeKey: writeKey,
            encryptionKey: encryptionKey,
        };
    }

    private async getKeySet(uri: string): Promise<KeySet> {
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
                const encryptionAlgorithm = cid[2];
                // TODO Verify that writeKey matches
                return {
                    publicKey: cid.subarray(35),
                    writeKey: writeKey,
                    encryptionKey: cid.subarray(3, 35),
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

        const dir = parentDirectory.directory.dirs.get(lastPathSegment);
        if (dir == undefined) {
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
            return `${await this._buildRootWriteURI()}/${path}`;
        }
        if (`${path}/`.startsWith('archive/')) {
            return `${await this._buildRootWriteURI()}/${path}`;
        }
        throw new Error('InvalidPathException');
    }

    private async _buildRootWriteURI(): Promise<string> {
        if (this.identity === undefined) throw new Error('No Identity');
        const filesystemRootKey = deriveHashInt(
            this.identity!.fsRootKey,
            1,
            this.api.crypto,
        );

        const rootPublicKey =
            (await this.api.crypto.newKeyPairEd25519(filesystemRootKey))
                .publicKey;

        const rootEncryptionKey = deriveHashInt(
            filesystemRootKey,
            1,
            this.api.crypto,
        );

        const rootWriteKey = `u${base64UrlNoPaddingEncode(new Uint8Array([
            0x00, ...filesystemRootKey
        ]))}`;

        const rootCID =
            this._buildEncryptedDirectoryCID(rootPublicKey, rootEncryptionKey);

        return `fs5://write:${rootWriteKey}@${base32.encode(rootCID).replace(/=/g, "").toLowerCase()}`;
    }

    /// publicKey: 33 bytes (with multicodec prefix byte)
    /// encryptionKey: 32 bytes
    private _buildEncryptedDirectoryCID(
        publicKey: Uint8Array,
        encryptionKey: Uint8Array,
    ): Uint8Array {
        return new Uint8Array(
            [
                CID_TYPE_FS5_DIRECTORY,
                CID_TYPE_ENCRYPTED_MUTABLE,
                ENCRYPTION_ALGORITHM_XCHACHA20POLY1305,
                ...encryptionKey,
                ...publicKey,
            ]
        );
    }

    private async _getDirectoryMetadata(
        ks: KeySet): Promise<{ directory: DirV1, entry?: RegistryEntry } | undefined> {
        let entry: RegistryEntry | undefined;

        let hash: Uint8Array;
        if (ks.publicKey[0] == mhashBlake3Default) {
            hash = ks.publicKey;
        } else {
            entry = await this.api.registryGet(ks.publicKey);

            if (entry === undefined) return undefined;

            const data = entry.data;
            if (data[0] == mhashBlake3 || data[0] == mhashBlake3Default) {
                hash = data.subarray(0, 33);
            } else {
                hash = data.subarray(2, 35);
            }
            hash[0] = mhashBlake3;
        }

        const metadataBytes = await this.api.downloadBlobAsBytes(hash);

        if (metadataBytes[0] == 0x8d) {
            if (ks.encryptionKey == undefined) {
                throw new Error('MissingEncryptionKey');
            }
            const decryptedMetadataBytes = await decryptMutableBytes(
                metadataBytes,
                ks.encryptionKey!,
                this.api.crypto,
            );
            return { directory: DirV1Serialiser.deserialise(decryptedMetadataBytes), entry };
        } else {
            return { directory: DirV1Serialiser.deserialise(metadataBytes), entry };
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

enum DirectoryTransactionResultType {
    Ok = "ok",
    Error = "error",
    NotModified = "notModified"
}

class DirectoryTransactionResult extends Error {
    readonly type: DirectoryTransactionResultType;
    readonly e?: any;

    constructor(
        type: DirectoryTransactionResultType,
        e?: any,
    ) {
        super();
        this.type = type;
        this.e = e;
    }

    unwrap(): void {
        if (this.type === DirectoryTransactionResultType.Error) {
            throw this;
        }
    }

    toString(): string {
        if (this.type === DirectoryTransactionResultType.Error) {
            return `DirectoryTransactionException: ${this.e}`;
        }
        return `${this.type}`;
    }
}
