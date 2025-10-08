import { base32 } from "multiformats/bases/base32";
import { S5APIInterface } from "../api/s5.js";
import { mkeyEd25519, MULTIHASH_BLAKE3 } from "../constants.js";
import {
  decryptMutableBytes,
  encryptMutableBytes,
} from "../encryption/mutable.js";
import Multibase from "../identifier/multibase.js";
import { S5UserIdentity } from "../identity/identity.js";
import { createRegistryEntry, RegistryEntry } from "../registry/entry.js";
import { base64UrlNoPaddingEncode } from "../util/base64.js";
import { deriveHashInt, deriveHashString } from "../util/derive_hash.js";
import { DirV1, FileRef, DirRef, DirLink } from "./dirv1/types.js";
import { DirV1Serialiser } from "./dirv1/serialisation.js";
import { concatBytes } from "@noble/hashes/utils";
import { encodeLittleEndian } from "../util/little_endian.js";
import { BlobIdentifier } from "../identifier/blob.js";
import { padFileSize } from "../encryption/padding.js";
import {
  PutOptions,
  ListResult,
  GetOptions,
  ListOptions,
  CursorData,
} from "./dirv1/types.js";
import { encodeS5, decodeS5 } from "./dirv1/cbor-config.js";
import { base64UrlNoPaddingDecode } from "../util/base64.js";
import { HAMT } from "./hamt/hamt.js";

// Media type mappings
const MEDIA_TYPE_MAP: Record<string, string> = {
  // Images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",

  // Documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  // Text
  txt: "text/plain",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  json: "application/json",
  xml: "application/xml",
  md: "text/markdown",

  // Media
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  avi: "video/x-msvideo",
  wav: "audio/wav",
  ogg: "audio/ogg",

  // Archives
  zip: "application/zip",
  tar: "application/x-tar",
  gz: "application/gzip",
  "7z": "application/x-7z-compressed",

  // Other
  bin: "application/octet-stream",
  exe: "application/x-msdownload",
  csv: "text/csv",
  yaml: "text/yaml",
  yml: "text/yaml",
};

const mhashBlake3 = 0x1e;
const mhashBlake3Default = 0x1f;

const CID_TYPE_FS5_DIRECTORY = 0x5d;
const CID_TYPE_ENCRYPTED_MUTABLE = 0x5e;

const ENCRYPTION_ALGORITHM_XCHACHA20POLY1305 = 0xa6;

type DirectoryTransactionFunction = (
  dir: DirV1,
  writeKey: Uint8Array
) => Promise<DirV1 | undefined>;

// Helper function to get media type from file extension
function getMediaTypeFromExtension(filename: string): string | undefined {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return undefined;

  const ext = filename.substring(lastDot + 1).toLowerCase();
  return MEDIA_TYPE_MAP[ext];
}

// Helper function to normalize path
function normalizePath(path: string): string {
  // Remove leading slashes
  path = path.replace(/^\/+/, "");
  // Replace multiple consecutive slashes with single slash
  path = path.replace(/\/+/g, "/");
  // Remove trailing slashes
  path = path.replace(/\/+$/, "");
  return path;
}

// Helper function to convert Map to plain object recursively
function mapToObject(value: any): any {
  if (value instanceof Map) {
    const obj: any = {};
    for (const [k, v] of value) {
      obj[k] = mapToObject(v);
    }
    return obj;
  } else if (Array.isArray(value)) {
    return value.map((v) => mapToObject(v));
  } else if (
    value &&
    typeof value === "object" &&
    !(value instanceof Uint8Array)
  ) {
    const obj: any = {};
    for (const k in value) {
      if (value.hasOwnProperty(k)) {
        obj[k] = mapToObject(value[k]);
      }
    }
    return obj;
  }
  return value;
}

export class FS5 {
  readonly api: S5APIInterface;
  readonly identity?: S5UserIdentity;

  constructor(api: S5APIInterface, identity?: S5UserIdentity) {
    this.api = api;
    this.identity = identity;
  }

  // Phase 2: Path-based API methods

  /**
   * Get data at the specified path
   * @param path Path to the file (e.g., "home/file.txt")
   * @returns The decoded data or undefined if not found
   */
  public async get(
    path: string,
    options?: GetOptions
  ): Promise<any | undefined> {
    path = normalizePath(path);
    const segments = path.split("/").filter((s) => s);

    if (segments.length === 0) {
      return undefined; // Root directory doesn't have data
    }

    const fileName = segments[segments.length - 1];
    const dirPath = segments.slice(0, -1).join("/") || "";

    // Load the parent directory
    const dir = await this._loadDirectory(dirPath);
    if (!dir) {
      return undefined;
    }

    // Find the file (supports HAMT)
    const fileRef = await this._getFileFromDirectory(dir, fileName);
    if (!fileRef) {
      return undefined;
    }

    // Download the file data
    const data = await this.api.downloadBlobAsBytes(
      new Uint8Array([MULTIHASH_BLAKE3, ...fileRef.hash])
    );

    // Check if this is binary data based on media type
    const isBinaryType =
      fileRef.media_type &&
      (fileRef.media_type === "application/octet-stream" ||
        fileRef.media_type.startsWith("image/") ||
        fileRef.media_type.startsWith("audio/") ||
        fileRef.media_type.startsWith("video/") ||
        fileRef.media_type === "application/zip" ||
        fileRef.media_type === "application/gzip" ||
        fileRef.media_type === "application/x-tar" ||
        fileRef.media_type === "application/x-7z-compressed" ||
        fileRef.media_type === "application/pdf" ||
        fileRef.media_type === "application/x-msdownload");

    // If it's marked as binary, return as-is
    if (isBinaryType) {
      return data;
    }

    // Try to decode the data
    try {
      // First try CBOR
      const decoded = decodeS5(data);
      // Convert Map to plain object if needed
      return mapToObject(decoded);
    } catch {
      // If CBOR fails, try JSON
      try {
        const text = new TextDecoder().decode(data);
        return JSON.parse(text);
      } catch {
        // If JSON fails, check if it's valid UTF-8 text
        try {
          const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
          // Additional check: if the text contains control characters (except tab/newline), treat as binary
          let hasControlChars = false;
          for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
              hasControlChars = true;
              break;
            }
          }

          if (hasControlChars) {
            return data; // Return as binary
          }

          return text;
        } catch {
          // Otherwise return as binary
          return data;
        }
      }
    }
  }

  /**
   * Store data at the specified path
   * @param path Path where to store the data (e.g., "home/file.txt")
   * @param data The data to store (string, object, or Uint8Array)
   * @param options Optional parameters like mediaType
   */
  public async put(
    path: string,
    data: any,
    options?: PutOptions
  ): Promise<void> {
    path = normalizePath(path);
    const segments = path.split("/").filter((s) => s);

    if (segments.length === 0) {
      throw new Error("Cannot put data at root directory");
    }

    const fileName = segments[segments.length - 1];
    const dirPath = segments.slice(0, -1).join("/") || "";

    // Handle null/undefined data
    if (data === null || data === undefined) {
      data = "";
    }

    // Encode the data
    let encodedData: Uint8Array;
    let mediaType = options?.mediaType;

    if (data instanceof Uint8Array) {
      encodedData = data;
      mediaType =
        mediaType ||
        getMediaTypeFromExtension(fileName) ||
        "application/octet-stream";
    } else if (typeof data === "string") {
      encodedData = new TextEncoder().encode(data);
      mediaType =
        mediaType || getMediaTypeFromExtension(fileName) || "text/plain";
    } else {
      // Use CBOR for objects
      encodedData = encodeS5(data);
      mediaType =
        mediaType || getMediaTypeFromExtension(fileName) || "application/cbor";
    }

    // Upload the blob
    const blob = new Blob([encodedData as BlobPart]);
    const { hash, size } = await this.uploadBlobWithoutEncryption(blob);

    // Create FileRef
    const fileRef: FileRef = {
      hash: hash,
      size: size,
      media_type: mediaType,
      timestamp: options?.timestamp
        ? Math.floor(options.timestamp / 1000)
        : Math.floor(Date.now() / 1000),
    };

    // Update the parent directory
    await this._updateDirectory(dirPath, async (dir, writeKey) => {
      // Create directory if it doesn't exist
      if (!dir) {
        // Create an empty directory structure
        dir = {
          magic: "S5.pro",
          header: {},
          dirs: new Map(),
          files: new Map(),
        };
      }

      // Check if directory is sharded
      if (dir.header.sharding?.root?.cid) {
        // Load HAMT, insert, and save
        const hamtData = await this.api.downloadBlobAsBytes(
          dir.header.sharding.root.cid
        );
        const hamt = await HAMT.deserialise(hamtData, this.api);

        await hamt.insert(`f:${fileName}`, fileRef);

        // Save updated HAMT
        const newHamtData = hamt.serialise();
        const { hash } = await this.api.uploadBlob(new Blob([newHamtData as BlobPart]));
        dir.header.sharding.root.cid = hash;
        dir.header.sharding.root.totalEntries++;
      } else {
        // Regular directory - add file and check if sharding needed
        dir.files.set(fileName, fileRef);

        // Check if we need to convert to sharded
        await this._checkAndConvertToSharded(dir);
      }

      return dir;
    });
  }

  /**
   * Get metadata for a file or directory at the specified path
   * @param path Path to the file or directory
   * @returns Metadata object or undefined if not found
   */
  public async getMetadata(
    path: string
  ): Promise<Record<string, any> | undefined> {
    path = normalizePath(path);
    const segments = path.split("/").filter((s) => s);

    if (segments.length === 0) {
      // Root directory metadata
      const dir = await this._loadDirectory("");
      if (!dir) return undefined;

      const oldestTimestamp = this._getOldestTimestamp(dir);
      const newestTimestamp = this._getNewestTimestamp(dir);

      return {
        type: "directory",
        name: "root",
        fileCount: dir.header.sharding?.root?.totalEntries
          ? Math.floor(dir.header.sharding.root.totalEntries) // Approximate split
          : dir.files.size,
        directoryCount: dir.header.sharding?.root?.totalEntries
          ? Math.floor(dir.header.sharding.root.totalEntries) // Approximate split
          : dir.dirs.size,
        sharding: dir.header.sharding,
        created: oldestTimestamp
          ? new Date(oldestTimestamp * 1000).toISOString()
          : undefined,
        modified: newestTimestamp
          ? new Date(newestTimestamp * 1000).toISOString()
          : undefined,
      };
    }

    const itemName = segments[segments.length - 1];
    const parentPath = segments.slice(0, -1).join("/") || "";

    // Load parent directory
    const parentDir = await this._loadDirectory(parentPath);
    if (!parentDir) return undefined;

    // Check if it's a file (supports HAMT)
    const fileRef = await this._getFileFromDirectory(parentDir, itemName);
    if (fileRef) {
      const metadata = this._extractFileMetadata(fileRef);
      return {
        type: "file",
        name: itemName,
        ...metadata,
      };
    }

    // Check if it's a directory (supports HAMT)
    const dirRef = await this._getDirectoryFromDirectory(parentDir, itemName);
    if (dirRef) {
      // Load the directory to get its metadata
      const dir = await this._loadDirectory(segments.join("/"));
      if (!dir) return undefined;

      const oldestTimestamp = this._getOldestTimestamp(dir);
      const newestTimestamp = this._getNewestTimestamp(dir);
      const dirMetadata = this._extractDirMetadata(dirRef);

      return {
        type: "directory",
        name: itemName,
        fileCount: dir.header.sharding?.root?.totalEntries
          ? Math.floor(dir.header.sharding.root.totalEntries) // Approximate split
          : dir.files.size,
        directoryCount: dir.header.sharding?.root?.totalEntries
          ? Math.floor(dir.header.sharding.root.totalEntries) // Approximate split
          : dir.dirs.size,
        sharding: dir.header.sharding,
        created: oldestTimestamp
          ? new Date(oldestTimestamp * 1000).toISOString()
          : undefined,
        modified: newestTimestamp
          ? new Date(newestTimestamp * 1000).toISOString()
          : undefined,
        ...dirMetadata,
      };
    }

    return undefined;
  }

  /**
   * Delete a file or empty directory at the specified path
   * @param path Path to the file or directory to delete
   * @returns true if deleted, false if not found
   */
  public async delete(path: string): Promise<boolean> {
    path = normalizePath(path);
    const segments = path.split("/").filter((s) => s);

    if (segments.length === 0) {
      throw new Error("Cannot delete root directory");
    }

    const itemName = segments[segments.length - 1];
    const parentPath = segments.slice(0, -1).join("/") || "";

    let deleted = false;

    await this._updateDirectory(parentPath, async (dir, writeKey) => {
      if (!dir) {
        return undefined; // Parent doesn't exist
      }

      // Check if directory is sharded
      if (dir.header.sharding?.root?.cid) {
        // Load HAMT
        const hamtData = await this.api.downloadBlobAsBytes(
          dir.header.sharding.root.cid
        );
        const hamt = await HAMT.deserialise(hamtData, this.api);

        // Try to delete as file first
        const fileKey = `f:${itemName}`;
        const fileRef = await hamt.get(fileKey);
        if (fileRef) {
          deleted = await hamt.delete(fileKey);
          if (deleted) {
            // Save updated HAMT
            const newHamtData = hamt.serialise();
            const { hash } = await this.api.uploadBlob(new Blob([newHamtData as BlobPart]));
            dir.header.sharding.root.cid = hash;
            dir.header.sharding.root.totalEntries--;
          }
          return dir;
        }

        // Try to delete as directory
        const dirKey = `d:${itemName}`;
        const dirRef = await hamt.get(dirKey);
        if (dirRef) {
          // Check if directory is empty
          const targetDir = await this._loadDirectory(segments.join("/"));
          if (
            targetDir &&
            targetDir.files.size === 0 &&
            targetDir.dirs.size === 0
          ) {
            deleted = await hamt.delete(dirKey);
            if (deleted) {
              // Save updated HAMT
              const newHamtData = hamt.serialise();
              const { hash } = await this.api.uploadBlob(
                new Blob([newHamtData as BlobPart])
              );
              dir.header.sharding.root.cid = hash;
              dir.header.sharding.root.totalEntries--;
            }
            return dir;
          }
        }
      } else {
        // Regular directory handling
        // Check if it's a file
        if (dir.files.has(itemName)) {
          dir.files.delete(itemName);
          deleted = true;
          return dir;
        }

        // Check if it's a directory
        if (dir.dirs.has(itemName)) {
          // Check if directory is empty
          const targetDir = await this._loadDirectory(segments.join("/"));
          if (
            targetDir &&
            targetDir.files.size === 0 &&
            targetDir.dirs.size === 0
          ) {
            dir.dirs.delete(itemName);
            deleted = true;
            return dir;
          }
        }
      }

      return undefined; // No changes
    });

    return deleted;
  }

  /**
   * List files and directories at the specified path
   * @param path Path to the directory
   * @returns Async iterator of ListResult items
   */
  public async *list(
    path: string,
    options?: ListOptions
  ): AsyncIterableIterator<ListResult> {
    path = normalizePath(path);
    const dir = await this._loadDirectory(path);

    if (!dir) {
      return; // Directory doesn't exist - return empty iterator
    }

    // Check if this is a sharded directory
    if (dir.header.sharding?.root?.cid) {
      // Use HAMT-based listing
      const hamtData = await this.api.downloadBlobAsBytes(
        dir.header.sharding.root.cid
      );
      const hamt = await HAMT.deserialise(hamtData, this.api);

      let count = 0;
      for await (const item of this._listWithHAMT(hamt, options?.cursor)) {
        yield item;
        count++;
        if (options?.limit && count >= options.limit) {
          break;
        }
      }
      return;
    }

    // Regular directory listing
    // Parse cursor if provided
    let startPosition: CursorData | undefined;
    if (options?.cursor !== undefined) {
      try {
        startPosition = this._parseCursor(options.cursor);
      } catch (e) {
        throw new Error(`Invalid cursor: ${e}`);
      }
    }

    // Collect all items for consistent ordering
    const allItems: Array<{
      name: string;
      type: "file" | "directory";
      data: any;
    }> = [];

    // Add all files
    for (const [name, fileRef] of dir.files) {
      allItems.push({ name, type: "file", data: fileRef });
    }

    // Add all directories
    for (const [name, dirRef] of dir.dirs) {
      allItems.push({ name, type: "directory", data: dirRef });
    }

    // Sort items for consistent ordering (files first, then by name)
    allItems.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "file" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    // Find start position if cursor provided
    let startIndex = 0;
    if (startPosition) {
      const foundIndex = allItems.findIndex(
        (item) =>
          item.name === startPosition.position &&
          item.type === startPosition.type
      );
      if (foundIndex >= 0) {
        startIndex = foundIndex + 1; // Start after the cursor position
      }
    }

    // Apply limit if provided
    const limit = options?.limit;
    let count = 0;

    // Yield items starting from cursor position
    for (let i = startIndex; i < allItems.length; i++) {
      if (limit && count >= limit) {
        break;
      }

      const item = allItems[i];
      const result: ListResult = {
        name: item.name,
        type: item.type,
        cursor: this._encodeCursor({
          position: item.name,
          type: item.type,
          timestamp: Date.now(),
        }),
      };

      if (item.type === "file") {
        result.size = Number(item.data.size);
        result.mediaType = item.data.media_type;
        result.timestamp = item.data.timestamp
          ? item.data.timestamp * 1000
          : undefined; // Convert to milliseconds
      } else {
        result.timestamp = item.data.ts_seconds
          ? item.data.ts_seconds * 1000
          : undefined; // Convert to milliseconds
      }

      yield result;
      count++;
    }
  }

  public async uploadBlobWithoutEncryption(
    blob: Blob
  ): Promise<{ hash: Uint8Array; size: number }> {
    const blobIdentifier = await this.api.uploadBlob(blob);
    return {
      hash: blobIdentifier.hash.subarray(1), // Remove multihash prefix
      size: blob.size,
    };
  }

  public async uploadBlobEncrypted(
    blob: Blob
  ): Promise<{ hash: Uint8Array; size: number; encryptionKey: Uint8Array }> {
    const plaintextBlake3Hash = await this.api.crypto.hashBlake3Blob(blob);
    const size = blob.size;
    const plaintextBlobIdentifier = new BlobIdentifier(
      new Uint8Array([MULTIHASH_BLAKE3, ...plaintextBlake3Hash]),
      size
    );

    const maxChunkSizeAsPowerOf2 = 18;
    const maxChunkSize = 262144; // 256 KiB
    const chunkCount = Math.ceil(size / maxChunkSize);
    const totalSizeWithEncryptionOverhead = size + chunkCount * 16;
    let padding =
      padFileSize(totalSizeWithEncryptionOverhead) -
      totalSizeWithEncryptionOverhead;
    const lastChunkSize = size % maxChunkSize;
    if (padding + lastChunkSize >= maxChunkSize) {
      padding = maxChunkSize - lastChunkSize;
    }

    const encryptionKey = this.api.crypto.generateSecureRandomBytes(32);

    let encryptedBlob = new Blob();

    for (let chunkIndex = 0; chunkIndex < chunkCount - 1; chunkIndex++) {
      const plaintext = new Uint8Array(
        await blob
          .slice(chunkIndex * maxChunkSize, (chunkIndex + 1) * maxChunkSize)
          .arrayBuffer()
      );
      const encrypted = await this.api.crypto.encryptXChaCha20Poly1305(
        encryptionKey,
        encodeLittleEndian(chunkIndex, 24),
        plaintext
      );
      encryptedBlob = new Blob([encryptedBlob as BlobPart, encrypted as BlobPart]);
    }
    const lastChunkPlaintext = new Uint8Array([
      ...new Uint8Array(
        await blob.slice((chunkCount - 1) * maxChunkSize).arrayBuffer()
      ),
      ...new Uint8Array(padding),
    ]);

    const lastChunkEncrypted = await this.api.crypto.encryptXChaCha20Poly1305(
      encryptionKey,
      encodeLittleEndian(chunkCount - 1, 24),
      lastChunkPlaintext
    );
    encryptedBlob = new Blob([encryptedBlob as BlobPart, lastChunkEncrypted as BlobPart]);

    const encryptedBlobIdentifier = await this.api.uploadBlob(encryptedBlob);

    const plaintextCID = new Uint8Array([
      0x26,
      ...plaintextBlobIdentifier.toBytes().subarray(2),
    ]);
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
    ]);

    return {
      hash: plaintextBlake3Hash,
      size: size,
      encryptionKey: encryptionKey,
    };
  }

  async createDirectory(path: string, name: string): Promise<DirRef> {
    // TODO validateFileSystemEntityName(name);

    let dirReference: DirRef | undefined;

    const res = await this.runTransactionOnDirectory(
      await this._preprocessLocalPath(path),
      async (dir, writeKey) => {
        // Check if directory is sharded
        if (dir.header.sharding?.root?.cid) {
          // Load HAMT
          const hamtData = await this.api.downloadBlobAsBytes(
            dir.header.sharding.root.cid
          );
          const hamt = await HAMT.deserialise(hamtData, this.api);

          // Check if already exists
          const existingDir = await hamt.get(`d:${name}`);
          if (existingDir) {
            throw new Error(
              "Directory already contains a subdirectory with the same name"
            );
          }

          // Create new directory and add to HAMT
          const newDir = await this._createDirectory(name, writeKey);
          await hamt.insert(`d:${name}`, newDir);

          // Save updated HAMT
          const newHamtData = hamt.serialise();
          const { hash } = await this.api.uploadBlob(new Blob([newHamtData as BlobPart]));
          dir.header.sharding.root.cid = hash;
          dir.header.sharding.root.totalEntries++;

          dirReference = newDir;
        } else {
          // Regular directory
          if (dir.dirs.has(name)) {
            throw new Error(
              "Directory already contains a subdirectory with the same name"
            );
          }
          const newDir = await this._createDirectory(name, writeKey);
          dir.dirs.set(name, newDir);
          dirReference = newDir;

          // Check if we need to convert to sharded
          await this._checkAndConvertToSharded(dir);
        }
        return dir;
      }
    );
    res.unwrap();
    return dirReference!;
  }
  public async createFile(
    directoryPath: string,
    fileName: string,
    fileVersion: { ts: number; data: any },
    mediaType?: string
  ): Promise<FileRef> {
    // TODO validateFileSystemEntityName(name);

    let fileReference: FileRef | undefined;

    const res = await this.runTransactionOnDirectory(
      await this._preprocessLocalPath(directoryPath),
      async (dir, _) => {
        if (dir.files.has(fileName)) {
          throw "Directory already contains a file with the same name";
        }
        const file: FileRef = {
          hash: new Uint8Array(32), // Placeholder - should be computed from data
          size: 0,
          media_type: mediaType,
          timestamp: fileVersion.ts,
        };
        dir.files.set(fileName, file);
        fileReference = file;

        return dir;
      }
    );
    res.unwrap();
    return fileReference!;
  }

  private async runTransactionOnDirectory(
    uri: string,
    transaction: DirectoryTransactionFunction
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
          files: new Map(),
        },
        ks.writeKey!
      );
      if (transactionRes == null) {
        return new DirectoryTransactionResult(
          DirectoryTransactionResultType.NotModified
        );
      }

      // TODO Make sure this is secure
      const newBytes =
        ks.encryptionKey !== undefined
          ? await encryptMutableBytes(
              DirV1Serialiser.serialise(transactionRes),
              ks.encryptionKey!,
              this.api.crypto
            )
          : DirV1Serialiser.serialise(transactionRes);

      const cid = await this.api.uploadBlob(new Blob([newBytes as BlobPart]));

      const kp = await this.api.crypto.newKeyPairEd25519(ks.writeKey!);

      const entry = await createRegistryEntry(
        kp,
        cid.hash,
        (dir?.entry?.revision ?? 0) + 1,
        this.api.crypto
      );

      await this.api.registrySet(entry);

      return new DirectoryTransactionResult(DirectoryTransactionResultType.Ok);
    } catch (e) {
      return new DirectoryTransactionResult(
        DirectoryTransactionResultType.Error,
        e
      );
    }
  }

  // In ensureIdentityInitialized method
  public async ensureIdentityInitialized(): Promise<void> {
    const res = await this.runTransactionOnDirectory(
      await this._buildRootWriteURI(),
      async (dir, writeKey) => {
        const names = ["home", "archive"];
        let hasChanges = false;

        for (const name of names) {
          if (!dir.dirs.has(name)) {
            // Create the subdirectory and get its reference
            const dirRef = await this._createDirectory(name, writeKey);
            dir.dirs.set(name, dirRef);
            hasChanges = true;
          } else {
            // Verify the existing reference is valid
            const existingRef = dir.dirs.get(name);
            if (!existingRef || !existingRef.link) {
              // Fix broken reference
              const dirRef = await this._createDirectory(name, writeKey);
              dir.dirs.set(name, dirRef);
              hasChanges = true;
            }
          }
        }

        // Always return the directory if we made changes
        return hasChanges ? dir : undefined;
      }
    );
    res.unwrap();
  }

  /**
   * Derive a write key for a child directory deterministically
   * @param parentWriteKey Parent directory's write key
   * @param childName Name of the child directory
   * @returns Write key for the child directory
   */
  private async _deriveWriteKeyForChildDirectory(
    parentWriteKey: Uint8Array,
    childName: string
  ): Promise<Uint8Array> {
    // Derive child write key by hashing parent write key + child name
    const childNameBytes = new TextEncoder().encode(childName);
    
    // Use deriveHashString which accepts variable-length tweak data
    return deriveHashString(parentWriteKey, childNameBytes, this.api.crypto);
  }

  async _createDirectory(
    name: string,
    parentWriteKey: Uint8Array
  ): Promise<DirRef> {
    // Derive write key deterministically from parent
    const newWriteKey = await this._deriveWriteKeyForChildDirectory(parentWriteKey, name);

    const ks = await this._deriveKeySetFromWriteKey(newWriteKey);

    // Create empty DirV1
    const emptyDir: DirV1 = {
      magic: "S5.pro",
      header: {},
      dirs: new Map(),
      files: new Map(),
    };

    // Serialize and upload
    const serialized = DirV1Serialiser.serialise(emptyDir);
    const cid = await this.api.uploadBlob(new Blob([serialized as BlobPart]));

    // Create registry entry for the new directory
    const kp = await this.api.crypto.newKeyPairEd25519(newWriteKey);
    const entry = await createRegistryEntry(
      kp,
      cid.hash,
      1, // Initial revision
      this.api.crypto
    );
    await this.api.registrySet(entry);

    // Create DirRef pointing to the new directory with mutable registry link
    const dirRef: DirRef = {
      link: {
        type: "mutable_registry_ed25519",
        publicKey: kp.publicKey.subarray(1), // Remove multicodec prefix
      },
      ts_seconds: Math.floor(Date.now() / 1000),
    };

    return dirRef;
  }
  async _deriveKeySetFromWriteKey(writeKey: Uint8Array): Promise<KeySet> {
    const publicKey = (await this.api.crypto.newKeyPairEd25519(writeKey))
      .publicKey;
    const encryptionKey = deriveHashInt(writeKey, 0x5e, this.api.crypto);
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
      if (cid[0] != CID_TYPE_FS5_DIRECTORY)
        throw new Error("Invalid FS5 URI format");

      let writeKey: Uint8Array | undefined;

      if (url.username.length > 0) {
        if (url.username != "write") throw new Error("Invalid FS5 URI format");

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
    const pathSegments = uri.split("/");
    const lastPathSegment = pathSegments[pathSegments.length - 1];
    const parentKeySet = await this.getKeySet(
      uri.substring(0, uri.length - (lastPathSegment.length + 1))
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
    let publicKey: Uint8Array;

    // Handle different directory link types
    if (dir.link.type === "mutable_registry_ed25519") {
      if (!dir.link.publicKey) {
        throw new Error("Missing public key for mutable registry link");
      }
      publicKey = concatBytes(
        new Uint8Array([mkeyEd25519]),
        dir.link.publicKey
      );
      // Derive write key from parent's write key if available
      if (parentKeySet.writeKey) {
        writeKey = await this._deriveWriteKeyForChildDirectory(
          parentKeySet.writeKey,
          lastPathSegment
        );
      }
    } else if (dir.link.type === "fixed_hash_blake3") {
      if (!dir.link.hash) {
        throw new Error("Missing hash for fixed hash link");
      }
      // For fixed hash links, we don't have a public key
      publicKey = new Uint8Array([mhashBlake3Default, ...dir.link.hash]);
    } else {
      throw new Error(`Unsupported directory link type: ${dir.link.type}`);
    }

    const ks = {
      publicKey: publicKey,
      writeKey: writeKey,
      encryptionKey: undefined,
    };

    return ks;
  }

  private async _preprocessLocalPath(path: string): Promise<string> {
    if (path.startsWith("fs5://")) return path;
    if (path === "" || path === "/") {
      // Root directory
      return await this._buildRootWriteURI();
    }
    if (`${path}/`.startsWith("home/")) {
      return `${await this._buildRootWriteURI()}/${path}`;
    }
    if (`${path}/`.startsWith("archive/")) {
      return `${await this._buildRootWriteURI()}/${path}`;
    }
    throw new Error("InvalidPathException");
  }

  private async _buildRootWriteURI(): Promise<string> {
    if (this.identity === undefined) throw new Error("No Identity");
    const filesystemRootKey = deriveHashInt(
      this.identity!.fsRootKey,
      1,
      this.api.crypto
    );

    const rootPublicKey = (
      await this.api.crypto.newKeyPairEd25519(filesystemRootKey)
    ).publicKey;

    const rootEncryptionKey = deriveHashInt(
      filesystemRootKey,
      1,
      this.api.crypto
    );

    const rootWriteKey = `u${base64UrlNoPaddingEncode(
      new Uint8Array([0x00, ...filesystemRootKey])
    )}`;

    const rootCID = this._buildEncryptedDirectoryCID(
      rootPublicKey,
      rootEncryptionKey
    );

    return `fs5://write:${rootWriteKey}@${base32
      .encode(rootCID)
      .replace(/=/g, "")
      .toLowerCase()}`;
  }

  /// publicKey: 33 bytes (with multicodec prefix byte)
  /// encryptionKey: 32 bytes
  private _buildEncryptedDirectoryCID(
    publicKey: Uint8Array,
    encryptionKey: Uint8Array
  ): Uint8Array {
    return new Uint8Array([
      CID_TYPE_FS5_DIRECTORY,
      CID_TYPE_ENCRYPTED_MUTABLE,
      ENCRYPTION_ALGORITHM_XCHACHA20POLY1305,
      ...encryptionKey,
      ...publicKey,
    ]);
  }

  private async _getDirectoryMetadata(
    ks: KeySet
  ): Promise<{ directory: DirV1; entry?: RegistryEntry } | undefined> {
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
        throw new Error("MissingEncryptionKey");
      }
      const decryptedMetadataBytes = await decryptMutableBytes(
        metadataBytes,
        ks.encryptionKey!,
        this.api.crypto
      );
      return {
        directory: DirV1Serialiser.deserialise(decryptedMetadataBytes),
        entry,
      };
    } else {
      return { directory: DirV1Serialiser.deserialise(metadataBytes), entry };
    }
  }

  // Phase 2 helper methods

  /**
   * Encode cursor data to a base64url string
   * @param data Cursor data to encode
   * @returns Base64url-encoded cursor string
   */
  private _encodeCursor(data: CursorData): string {
    const encoded = encodeS5(data);
    return base64UrlNoPaddingEncode(encoded);
  }

  /**
   * Parse a cursor string back to cursor data
   * @param cursor Base64url-encoded cursor string
   * @returns Decoded cursor data
   */
  private _parseCursor(cursor: string): CursorData {
    if (!cursor || cursor.length === 0) {
      throw new Error("Cursor cannot be empty");
    }

    try {
      const decoded = base64UrlNoPaddingDecode(cursor);
      const data = decodeS5(decoded);

      // Validate cursor data - check if it has the expected properties
      if (!data || typeof data !== "object") {
        throw new Error("Invalid cursor structure");
      }

      let position: string;
      let type: "file" | "directory";
      let timestamp: number | undefined;

      // Handle both Map and plain object formats
      if (data instanceof Map) {
        position = data.get("position");
        type = data.get("type");
        timestamp = data.get("timestamp");
      } else {
        const cursorData = data as any;
        position = cursorData.position;
        type = cursorData.type;
        timestamp = cursorData.timestamp;
      }

      if (
        typeof position !== "string" ||
        (type !== "file" && type !== "directory")
      ) {
        throw new Error("Invalid cursor structure");
      }

      return {
        position,
        type,
        timestamp,
      };
    } catch (e) {
      throw new Error(`Failed to parse cursor: ${e}`);
    }
  }

  /**
   * Load a directory at the specified path
   * @param path Path to the directory (e.g., "home/docs")
   * @returns The DirV1 object or undefined if not found
   */
  private async _loadDirectory(path: string): Promise<DirV1 | undefined> {
    const preprocessedPath = await this._preprocessLocalPath(path);
    const ks = await this.getKeySet(preprocessedPath);
    const metadata = await this._getDirectoryMetadata(ks);
    return metadata?.directory;
  }

  /**
   * Update a directory at the specified path
   * @param path Path to the directory
   * @param updater Function to update the directory
   */
  private async _updateDirectory(
    path: string,
    updater: DirectoryTransactionFunction
  ): Promise<void> {
    // Create intermediate directories if needed
    const segments = path.split("/").filter((s) => s);

    // First ensure all parent directories exist
    for (let i = 1; i <= segments.length; i++) {
      const currentPath = segments.slice(0, i).join("/");
      const parentPath = segments.slice(0, i - 1).join("/") || "";
      const dirName = segments[i - 1];

      // Check if this directory exists
      try {
        const dir = await this._loadDirectory(currentPath);
        if (!dir) {
          // Create this directory
          await this.createDirectory(parentPath, dirName);
        }
      } catch (error) {
        // Directory doesn't exist, create it
        await this.createDirectory(parentPath, dirName);
      }
    }

    // Now perform the update
    const preprocessedPath = await this._preprocessLocalPath(path || "home");
    const result = await this.runTransactionOnDirectory(
      preprocessedPath,
      updater
    );
    result.unwrap();
  }

  /**
   * Get the oldest timestamp from all files and subdirectories in a directory
   * @param dir Directory to scan
   * @returns Oldest timestamp in seconds, or undefined if no timestamps found
   */
  private _getOldestTimestamp(dir: DirV1): number | undefined {
    let oldest: number | undefined;

    // Check all files
    for (const [_, file] of dir.files) {
      if (file.timestamp && (!oldest || file.timestamp < oldest)) {
        oldest = file.timestamp;
      }
    }

    // Check all subdirectories
    for (const [_, subdir] of dir.dirs) {
      if (subdir.ts_seconds && (!oldest || subdir.ts_seconds < oldest)) {
        oldest = subdir.ts_seconds;
      }
    }

    return oldest;
  }

  /**
   * Get the newest timestamp from all files and subdirectories in a directory
   * @param dir Directory to scan
   * @returns Newest timestamp in seconds, or undefined if no timestamps found
   */
  private _getNewestTimestamp(dir: DirV1): number | undefined {
    let newest: number | undefined;

    // Check all files
    for (const [_, file] of dir.files) {
      if (file.timestamp && (!newest || file.timestamp > newest)) {
        newest = file.timestamp;
      }
    }

    // Check all subdirectories
    for (const [_, subdir] of dir.dirs) {
      if (subdir.ts_seconds && (!newest || subdir.ts_seconds > newest)) {
        newest = subdir.ts_seconds;
      }
    }

    return newest;
  }

  /**
   * Extract detailed metadata from a FileRef
   * @param file FileRef to extract metadata from
   * @returns Metadata object with all file properties
   */
  private _extractFileMetadata(file: FileRef): Record<string, any> {
    const metadata: Record<string, any> = {
      size: Number(file.size),
      mediaType: file.media_type || "application/octet-stream",
      timestamp: file.timestamp
        ? new Date(file.timestamp * 1000).toISOString()
        : undefined,
      custom: file.extra ? Object.fromEntries(file.extra) : undefined,
    };

    // Add optional fields if present
    if (file.locations && file.locations.length > 0) {
      metadata.locations = file.locations;
    }

    if (file.prev) {
      metadata.hasHistory = true;
    }

    return metadata;
  }

  /**
   * Extract metadata from a DirRef
   * @param dir DirRef to extract metadata from
   * @returns Metadata object with directory properties
   */
  private _extractDirMetadata(dir: DirRef): Record<string, any> {
    return {
      timestamp: dir.ts_seconds
        ? new Date(dir.ts_seconds * 1000).toISOString()
        : undefined,
      extra: dir.extra,
    };
  }

  // HAMT Integration Methods (Week 3)

  /**
   * Serialize a directory with HAMT backing
   * @param dir Directory to serialize
   * @param hamt HAMT instance containing the entries
   * @returns Serialized directory bytes
   */
  private async _serialiseShardedDirectory(
    dir: DirV1,
    hamt: HAMT
  ): Promise<Uint8Array> {
    // Store HAMT structure
    const hamtData = hamt.serialise();
    const { hash } = await this.api.uploadBlob(new Blob([hamtData as BlobPart]));

    // Update directory to reference HAMT
    dir.header.sharding = {
      type: "hamt",
      config: {
        bitsPerLevel: 5,
        maxInlineEntries: 1000,
        hashFunction: 0,
      },
      root: {
        cid: hash,
        totalEntries: dir.files.size + dir.dirs.size,
        depth: await hamt.getDepth(),
      },
    };

    // Clear inline maps for sharded directory
    dir.files.clear();
    dir.dirs.clear();

    // Serialize using DirV1Serialiser
    return DirV1Serialiser.serialise(dir);
  }

  /**
   * List entries from a HAMT-backed directory
   * @param hamt HAMT instance
   * @param cursor Optional cursor for pagination
   * @returns Async iterator of directory entries
   */
  private async *_listWithHAMT(
    hamt: HAMT,
    cursor?: string
  ): AsyncIterableIterator<ListResult> {
    const parsedCursor = cursor ? this._parseCursor(cursor) : undefined;
    const iterator = parsedCursor?.path
      ? hamt.entriesFrom(parsedCursor.path)
      : hamt.entries();

    for await (const [key, value] of iterator) {
      if (key.startsWith("f:")) {
        // File entry
        const name = key.substring(2);
        const fileRef = value as FileRef;
        const metadata = this._extractFileMetadata(fileRef);

        yield {
          name,
          type: "file",
          size: metadata.size,
          mediaType: metadata.mediaType,
          timestamp: metadata.timestamp,
          cursor: this._encodeCursor({
            position: name,
            type: "file",
            timestamp: metadata.timestamp,
            path: await hamt.getPathForKey(key),
          }),
        };
      } else if (key.startsWith("d:")) {
        // Directory entry
        const name = key.substring(2);
        const dirRef = value as DirRef;

        yield {
          name,
          type: "directory",
          cursor: this._encodeCursor({
            position: name,
            type: "directory",
            timestamp: dirRef.ts_seconds,
            path: await hamt.getPathForKey(key),
          }),
        };
      }
    }
  }

  /**
   * Get a file from a directory (supports both regular and HAMT-backed)
   * @param dir Directory to search
   * @param fileName Name of the file
   * @returns FileRef or undefined if not found
   */
  private async _getFileFromDirectory(
    dir: DirV1,
    fileName: string
  ): Promise<FileRef | undefined> {
    if (dir.header.sharding?.root?.cid) {
      // Load HAMT and query
      const hamtData = await this.api.downloadBlobAsBytes(
        dir.header.sharding.root.cid
      );
      const hamt = await HAMT.deserialise(hamtData, this.api);
      return (await hamt.get(`f:${fileName}`)) as FileRef | undefined;
    } else {
      // Regular lookup
      return dir.files.get(fileName);
    }
  }

  /**
   * Get a directory reference from a directory (supports both regular and HAMT-backed)
   * @param dir Directory to search
   * @param dirName Name of the subdirectory
   * @returns DirRef or undefined if not found
   */
  private async _getDirectoryFromDirectory(
    dir: DirV1,
    dirName: string
  ): Promise<DirRef | undefined> {
    if (dir.header.sharding?.root?.cid) {
      // Load HAMT and query
      const hamtData = await this.api.downloadBlobAsBytes(
        dir.header.sharding.root.cid
      );
      const hamt = await HAMT.deserialise(hamtData, this.api);
      return (await hamt.get(`d:${dirName}`)) as DirRef | undefined;
    } else {
      // Regular lookup
      return dir.dirs.get(dirName);
    }
  }


  /**
   * Check and convert directory to sharded if it exceeds threshold
   * @param dir Directory to check
   * @returns Updated directory if sharding was applied
   */
  private async _checkAndConvertToSharded(dir: DirV1): Promise<DirV1> {
    const totalEntries = dir.files.size + dir.dirs.size;

    if (!dir.header.sharding && totalEntries >= 1000) {
      // Create new HAMT
      const hamt = new HAMT(this.api, {
        bitsPerLevel: 5,
        maxInlineEntries: 1000,
        hashFunction: 0,
      });

      // Migrate all file entries
      for (const [name, ref] of dir.files) {
        await hamt.insert(`f:${name}`, ref);
      }

      // Migrate all directory entries
      for (const [name, ref] of dir.dirs) {
        await hamt.insert(`d:${name}`, ref);
      }

      // Update directory to use HAMT
      const hamtData = hamt.serialise();
      const { hash } = await this.api.uploadBlob(new Blob([hamtData as BlobPart]));

      dir.header.sharding = {
        type: "hamt",
        config: {
          bitsPerLevel: 5,
          maxInlineEntries: 1000,
          hashFunction: 0,
        },
        root: {
          cid: hash,
          totalEntries,
          depth: await hamt.getDepth(),
        },
      };

      // Clear inline maps
      dir.files.clear();
      dir.dirs.clear();
    }

    return dir;
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
  NotModified = "notModified",
}

class DirectoryTransactionResult extends Error {
  readonly type: DirectoryTransactionResultType;
  readonly e?: any;

  constructor(type: DirectoryTransactionResultType, e?: any) {
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
