/**
 * FS5Advanced - Advanced CID-aware API for Enhanced S5.js
 *
 * Provides CID-level access for advanced developers who need content-addressed storage
 * while maintaining compatibility with the simple path-based API.
 *
 * @example
 * ```typescript
 * import { S5 } from 's5';
 * import { FS5Advanced } from 's5/advanced';
 *
 * const s5 = await S5.create();
 * await s5.recoverIdentityFromSeedPhrase(seedPhrase);
 *
 * const advanced = new FS5Advanced(s5.fs);
 *
 * // Store content and get CID
 * await s5.fs.put('home/file.txt', 'content');
 * const cid = await advanced.pathToCID('home/file.txt');
 *
 * // Retrieve by CID
 * const data = await advanced.getByCID(cid);
 *
 * // Store content-only (without path)
 * const cidOnly = await advanced.putByCID('anonymous content');
 * ```
 */

import type { FS5 } from './fs5.js';

/**
 * Advanced CID-aware file system operations
 *
 * Provides direct access to CIDs (Content Identifiers) for advanced use cases
 * without affecting the simplicity of the path-based API.
 */
export class FS5Advanced {
  private fs5: FS5;

  /**
   * Create an FS5Advanced instance
   *
   * @param fs5 - The FS5 instance to wrap
   * @throws Error if fs5 is null or undefined
   */
  constructor(fs5: FS5) {
    if (!fs5) {
      throw new Error('FS5 instance is required');
    }
    this.fs5 = fs5;
  }

  /**
   * Extract CID from a file or directory path
   *
   * @param path - The file or directory path
   * @returns The CID as Uint8Array (32 bytes)
   * @throws Error if path does not exist
   *
   * @example
   * ```typescript
   * const cid = await advanced.pathToCID('home/data.txt');
   * console.log(cid); // Uint8Array(32) [...]
   * ```
   */
  async pathToCID(path: string): Promise<Uint8Array> {
    // Get metadata for the path
    const metadata = await this.fs5.getMetadata(path);

    if (!metadata) {
      throw new Error(`Path not found: ${path}`);
    }

    // For files, extract CID from FileRef hash
    if (metadata.type === 'file') {
      // FileRef contains the file data hash as CID
      const fileRef = await this._getFileRef(path);
      if (!fileRef || !fileRef.hash) {
        throw new Error(`Failed to extract CID for file: ${path}`);
      }
      return fileRef.hash;
    }

    // For directories, compute CID from directory structure
    if (metadata.type === 'directory') {
      const dirCID = await this._getDirectoryCID(path);
      if (!dirCID) {
        throw new Error(`Failed to extract CID for directory: ${path}`);
      }
      return dirCID;
    }

    throw new Error(`Unknown metadata type: ${metadata.type}`);
  }

  /**
   * Get the full BlobIdentifier CID for a file path (for portal downloads)
   *
   * Unlike pathToCID which returns just the raw 32-byte hash, this method
   * returns the full BlobIdentifier string that includes the file size,
   * which is required by S5 portals for downloading.
   *
   * @param path - The file path
   * @returns The BlobIdentifier CID as a base32 string (59 chars)
   * @throws Error if path does not exist or is not a file
   *
   * @example
   * ```typescript
   * const blobCID = await advanced.pathToBlobCID('home/photo.jpg');
   * console.log(blobCID); // "uaah6c..." (59 chars)
   *
   * // Use with downloadByCID
   * const data = await s5.downloadByCID(blobCID);
   * ```
   */
  async pathToBlobCID(path: string): Promise<string> {
    // Get metadata for the path
    const metadata = await this.fs5.getMetadata(path);

    if (!metadata) {
      throw new Error(`Path not found: ${path}`);
    }

    if (metadata.type !== 'file') {
      throw new Error(`pathToBlobCID only works for files, not directories: ${path}`);
    }

    // Get FileRef which contains both hash and size
    const fileRef = await this._getFileRef(path);
    if (!fileRef || !fileRef.hash) {
      throw new Error(`Failed to extract CID for file: ${path}`);
    }

    // Import BlobIdentifier and create the full CID with size
    const { BlobIdentifier } = await import('../identifier/blob.js');
    const blobId = new BlobIdentifier(fileRef.hash, Number(fileRef.size));
    return blobId.toString();
  }

  /**
   * Find path for a given CID
   *
   * @param cid - The CID to search for (32 bytes)
   * @returns The path if found, null if not found
   * @throws Error if CID is invalid
   *
   * @example
   * ```typescript
   * const cid = await advanced.pathToCID('home/data.txt');
   * const path = await advanced.cidToPath(cid);
   * console.log(path); // 'home/data.txt'
   * ```
   */
  async cidToPath(cid: Uint8Array): Promise<string | null> {
    // Validate CID size
    if (cid.length !== 32) {
      throw new Error(`Invalid CID size: expected 32 bytes, got ${cid.length} bytes`);
    }

    // Search in two passes:
    // 1. First, search for non-.cid paths (user paths)
    // 2. If not found, search .cid directory (temporary paths)

    // First pass: exclude .cid directory
    let foundPath = await this._searchForCID(cid, '', true);

    // Second pass: if not found, search .cid directory only
    if (!foundPath) {
      foundPath = await this._searchForCID(cid, 'home/.cid', false);
    }

    return foundPath;
  }

  /**
   * Retrieve data by CID
   *
   * @param cid - The CID to retrieve (32 bytes)
   * @returns The data associated with the CID
   * @throws Error if CID is not found or invalid
   *
   * @example
   * ```typescript
   * const data = await advanced.getByCID(cid);
   * console.log(data);
   * ```
   */
  async getByCID(cid: Uint8Array): Promise<any> {
    // Validate CID
    if (cid.length !== 32) {
      throw new Error(`Invalid CID size: expected 32 bytes, got ${cid.length} bytes`);
    }

    // Find path for this CID
    const path = await this.cidToPath(cid);

    if (!path) {
      throw new Error('CID not found in file system');
    }

    // Retrieve data using path-based API
    return await this.fs5.get(path);
  }

  /**
   * Store data and return its CID
   *
   * Stores data in content-addressed storage without requiring a user-specified path.
   * Useful for content-only storage where you only care about the CID.
   *
   * @param data - The data to store
   * @returns The CID of the stored data
   *
   * @example
   * ```typescript
   * const cid = await advanced.putByCID('Hello, World!');
   * console.log(cid); // Uint8Array(32) [...]
   * ```
   */
  async putByCID(data: any): Promise<Uint8Array> {
    // Generate a temporary unique path for CID-only storage
    // Use home/.cid/ directory (paths must start with home/ or archive/)
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const tempPath = `home/.cid/${timestamp}-${random}`;

    // Store the data
    await this.fs5.put(tempPath, data);

    // Extract and return the CID
    const cid = await this.pathToCID(tempPath);

    return cid;
  }

  // Private helper methods

  /**
   * Get FileRef for a file path
   */
  private async _getFileRef(path: string): Promise<any> {
    // Navigate to parent directory
    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop() || '';
    const parentPath = parts.join('/');

    // Load parent directory using the private method
    const dir = await (this.fs5 as any)._loadDirectory(parentPath);

    if (!dir || !dir.files) {
      return null;
    }

    // Find file entry (supports HAMT)
    return await (this.fs5 as any)._getFileFromDirectory(dir, fileName);
  }

  /**
   * Get CID for a directory
   */
  private async _getDirectoryCID(path: string): Promise<Uint8Array | null> {
    // Load directory
    const dir = await (this.fs5 as any)._loadDirectory(path);

    if (!dir) {
      return null;
    }

    // Compute hash from directory structure
    // Import DirV1Serialiser to serialize the directory
    const { DirV1Serialiser } = await import('./dirv1/serialisation.js');
    const serialized = DirV1Serialiser.serialise(dir);

    // Hash the serialized directory data
    const hash = await this.fs5.api.crypto.hashBlake3(serialized);

    return hash;
  }

  /**
   * Recursively search for a CID in the file system
   * @param cid - The CID to search for
   * @param basePath - The base path to start searching from
   * @param excludeCidDir - Whether to exclude the .cid directory from search
   */
  private async _searchForCID(cid: Uint8Array, basePath: string, excludeCidDir: boolean = false): Promise<string | null> {
    try {
      // List entries in current directory
      const entries: string[] = [];
      for await (const entry of this.fs5.list(basePath)) {
        entries.push(entry.name);
      }

      // Check each entry
      for (const entryName of entries) {
        // Skip the temporary .cid directory if requested
        if (excludeCidDir && entryName === '.cid') {
          continue;
        }

        const entryPath = basePath ? `${basePath}/${entryName}` : entryName;

        try {
          // Get metadata to determine type
          const metadata = await this.fs5.getMetadata(entryPath);

          if (!metadata) {
            continue;
          }

          // Check if this entry's CID matches
          const entryCID = await this.pathToCID(entryPath);

          if (this._compareCIDs(cid, entryCID)) {
            return entryPath;
          }

          // If directory, search recursively
          if (metadata.type === 'directory') {
            const foundPath = await this._searchForCID(cid, entryPath, excludeCidDir);
            if (foundPath) {
              return foundPath;
            }
          }
        } catch (error) {
          // Skip entries that cause errors
          continue;
        }
      }

      return null;
    } catch (error) {
      // If directory doesn't exist or can't be read, return null
      return null;
    }
  }

  /**
   * Compare two CIDs for equality
   */
  private _compareCIDs(cid1: Uint8Array, cid2: Uint8Array): boolean {
    if (cid1.length !== cid2.length) {
      return false;
    }

    for (let i = 0; i < cid1.length; i++) {
      if (cid1[i] !== cid2[i]) {
        return false;
      }
    }

    return true;
  }
}
