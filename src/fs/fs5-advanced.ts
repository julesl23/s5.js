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
 * // Get CID for a file
 * const cid = await advanced.pathToCID('home/data.txt');
 *
 * // Retrieve by CID
 * const data = await advanced.getByCID(cid);
 *
 * // Store with both path and CID
 * const result = await advanced.putWithCID('home/file.txt', 'content');
 * console.log(result.path, result.cid);
 * ```
 */

import type { FS5 } from './fs5.js';
import type { PutOptions } from './dirv1/types.js';

/**
 * Result of putWithCID operation
 */
export interface PutWithCIDResult {
  path: string;
  cid: Uint8Array;
}

/**
 * Result of getMetadataWithCID operation
 */
export interface MetadataWithCIDResult {
  metadata: any;
  cid: Uint8Array;
}

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
      foundPath = await this._searchForCID(cid, '.cid', false);
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
   * Note: This stores the data in the content-addressed storage but does not
   * assign it a path. Use putWithCID if you want both a path and CID.
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
    // Use a special .cid/ directory to avoid conflicts
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const tempPath = `.cid/${timestamp}-${random}`;

    // Store the data
    await this.fs5.put(tempPath, data);

    // Extract and return the CID
    const cid = await this.pathToCID(tempPath);

    return cid;
  }

  /**
   * Store data at path and return both path and CID
   *
   * @param path - The path where to store the data
   * @param data - The data to store
   * @param options - Optional put options
   * @returns Object containing both path and CID
   *
   * @example
   * ```typescript
   * const result = await advanced.putWithCID('home/file.txt', 'content');
   * console.log(result.path); // 'home/file.txt'
   * console.log(result.cid);  // Uint8Array(32) [...]
   * ```
   */
  async putWithCID(
    path: string,
    data: any,
    options?: PutOptions
  ): Promise<PutWithCIDResult> {
    // Store using path-based API
    await this.fs5.put(path, data, options);

    // Extract CID
    const cid = await this.pathToCID(path);

    return {
      path,
      cid,
    };
  }

  /**
   * Get metadata with CID for a file or directory
   *
   * @param path - The file or directory path
   * @returns Object containing metadata and CID
   * @throws Error if path does not exist
   *
   * @example
   * ```typescript
   * const result = await advanced.getMetadataWithCID('home/file.txt');
   * console.log(result.metadata); // { type: 'file', size: 123, ... }
   * console.log(result.cid);      // Uint8Array(32) [...]
   * ```
   */
  async getMetadataWithCID(path: string): Promise<MetadataWithCIDResult> {
    // Get metadata using path-based API
    const metadata = await this.fs5.getMetadata(path);

    if (!metadata) {
      throw new Error(`Path not found: ${path}`);
    }

    // Extract CID
    const cid = await this.pathToCID(path);

    return {
      metadata,
      cid,
    };
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
