/**
 * Test suite for FS5Advanced - CID-aware API
 *
 * This test suite follows TDD principles - tests are written first to define
 * the expected behavior of the Advanced CID API.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { FS5 } from '../../src/fs/fs5.js';
import { FS5Advanced } from '../../src/fs/fs5-advanced.js';
import { JSCryptoImplementation } from '../../src/api/crypto/js.js';
import { DirV1 } from '../../src/fs/dirv1/types.js';

// Mock API for testing without S5 infrastructure
class MockAPI {
  crypto: JSCryptoImplementation;
  private blobs: Map<string, Uint8Array> = new Map();
  private registry: Map<string, any> = new Map();

  constructor() {
    this.crypto = new JSCryptoImplementation();
  }

  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = await this.crypto.hashBlake3(data);
    const fullHash = new Uint8Array([0x1e, ...hash]);
    const key = Buffer.from(hash).toString('hex');
    this.blobs.set(key, data);
    return { hash: fullHash, size: blob.size };
  }

  async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
    const actualHash = hash[0] === 0x1e ? hash.slice(1) : hash;
    const key = Buffer.from(actualHash).toString('hex');
    const data = this.blobs.get(key);
    if (!data) throw new Error(`Blob not found: ${key}`);
    return data;
  }

  async registryGet(publicKey: Uint8Array): Promise<any> {
    const key = Buffer.from(publicKey).toString('hex');
    return this.registry.get(key);
  }

  async registrySet(entry: any): Promise<void> {
    const key = Buffer.from(entry.pk).toString('hex');
    this.registry.set(key, entry);
  }
}

// Mock identity
class MockIdentity {
  fsRootKey = new Uint8Array(32).fill(42);
}

describe('FS5Advanced', () => {
  let fs5: FS5;
  let fs5Advanced: FS5Advanced;
  let api: MockAPI;
  let identity: MockIdentity;
  let directories: Map<string, DirV1>;

  beforeEach(() => {
    api = new MockAPI();
    identity = new MockIdentity();
    fs5 = new FS5(api as any, identity as any);

    // Initialize directory storage
    directories = new Map();
    directories.set('', {
      magic: 'S5.pro',
      header: {},
      dirs: new Map(),
      files: new Map()
    });

    // Mock FS5 internal methods for testing
    (fs5 as any)._loadDirectory = async (path: string) => {
      const dir = directories.get(path || '');
      if (!dir) {
        throw new Error(`Directory not found: ${path}`);
      }
      return dir;
    };

    (fs5 as any)._updateDirectory = async (path: string, updater: any) => {
      // Ensure all parent directories exist
      const segments = path.split('/').filter(s => s);

      for (let i = 0; i < segments.length; i++) {
        const currentPath = segments.slice(0, i + 1).join('/');
        const parentPath = segments.slice(0, i).join('/') || '';
        const dirName = segments[i];

        if (!directories.has(currentPath)) {
          const newDir: DirV1 = {
            magic: 'S5.pro',
            header: {},
            dirs: new Map(),
            files: new Map()
          };
          directories.set(currentPath, newDir);

          const parent = directories.get(parentPath);
          if (parent) {
            parent.dirs.set(dirName, {
              link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) }
            });
          }
        }
      }

      const dir = directories.get(path || '') || {
        magic: 'S5.pro',
        header: {},
        dirs: new Map(),
        files: new Map()
      };

      const result = await updater(dir, new Uint8Array(32));
      if (result) {
        directories.set(path || '', result);
      }
    };

    // Create FS5Advanced instance
    fs5Advanced = new FS5Advanced(fs5);
  });

  describe('constructor', () => {
    test('should create FS5Advanced instance from FS5', () => {
      expect(fs5Advanced).toBeInstanceOf(FS5Advanced);
      expect(fs5Advanced).toHaveProperty('pathToCID');
      expect(fs5Advanced).toHaveProperty('cidToPath');
      expect(fs5Advanced).toHaveProperty('getByCID');
      expect(fs5Advanced).toHaveProperty('putByCID');
      expect(fs5Advanced).toHaveProperty('putWithCID');
      expect(fs5Advanced).toHaveProperty('getMetadataWithCID');
    });

    test('should throw error if FS5 instance is null', () => {
      expect(() => new FS5Advanced(null as any)).toThrow();
    });
  });

  describe('pathToCID', () => {
    test('should extract CID from file path', async () => {
      // Store a file first
      const testData = 'Hello, CID World!';
      await fs5.put('home/test.txt', testData);

      // Get CID for that file
      const cid = await fs5Advanced.pathToCID('home/test.txt');

      expect(cid).toBeInstanceOf(Uint8Array);
      expect(cid.length).toBeGreaterThan(0);
      // CID should be 32 bytes (blake3 hash)
      expect(cid.length).toBe(32);
    });

    test('should extract CID from directory path', async () => {
      // Create a directory with content
      await fs5.put('home/docs/readme.md', '# README');

      // Get CID for the directory
      const cid = await fs5Advanced.pathToCID('home/docs');

      expect(cid).toBeInstanceOf(Uint8Array);
      expect(cid.length).toBeGreaterThan(0);
    });

    test('should throw error for non-existent path', async () => {
      await expect(fs5Advanced.pathToCID('home/nonexistent.txt'))
        .rejects.toThrow();
    });

    test('should handle root path', async () => {
      // Root directory should have a CID
      const cid = await fs5Advanced.pathToCID('');

      expect(cid).toBeInstanceOf(Uint8Array);
      expect(cid.length).toBeGreaterThan(0);
    });

    test('should return consistent CID for same content', async () => {
      const testData = 'Consistent content';
      await fs5.put('home/file1.txt', testData);
      await fs5.put('home/file2.txt', testData);

      const cid1 = await fs5Advanced.pathToCID('home/file1.txt');
      const cid2 = await fs5Advanced.pathToCID('home/file2.txt');

      // Same content should have same CID
      expect(cid1).toEqual(cid2);
    });
  });

  describe('cidToPath', () => {
    test('should find path for file CID', async () => {
      const testData = 'Find me by CID';
      await fs5.put('home/findme.txt', testData);

      const cid = await fs5Advanced.pathToCID('home/findme.txt');
      const path = await fs5Advanced.cidToPath(cid);

      expect(path).toBe('home/findme.txt');
    });

    test('should find path for directory CID', async () => {
      await fs5.put('home/mydir/file.txt', 'content');

      const cid = await fs5Advanced.pathToCID('home/mydir');
      const path = await fs5Advanced.cidToPath(cid);

      expect(path).toBe('home/mydir');
    });

    test('should return null for unknown CID', async () => {
      // Create a random CID that doesn't exist
      const randomCID = new Uint8Array(32);
      crypto.getRandomValues(randomCID);

      const path = await fs5Advanced.cidToPath(randomCID);

      expect(path).toBeNull();
    });

    test('should find first path if multiple paths have same CID', async () => {
      const testData = 'Duplicate content';
      await fs5.put('home/first.txt', testData);
      await fs5.put('home/second.txt', testData);

      const cid = await fs5Advanced.pathToCID('home/first.txt');
      const foundPath = await fs5Advanced.cidToPath(cid);

      // Should find one of the paths (implementation may vary)
      expect(foundPath === 'home/first.txt' || foundPath === 'home/second.txt').toBe(true);
    });

    test('should throw error for invalid CID', async () => {
      const invalidCID = new Uint8Array(10); // Wrong size

      await expect(fs5Advanced.cidToPath(invalidCID))
        .rejects.toThrow();
    });
  });

  describe('getByCID', () => {
    test('should retrieve file data by CID', async () => {
      const testData = 'Retrieve by CID';
      await fs5.put('home/data.txt', testData);

      const cid = await fs5Advanced.pathToCID('home/data.txt');
      const retrievedData = await fs5Advanced.getByCID(cid);

      expect(retrievedData).toBe(testData);
    });

    test('should retrieve binary data by CID', async () => {
      const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
      await fs5.put('home/binary.bin', binaryData);

      const cid = await fs5Advanced.pathToCID('home/binary.bin');
      const retrievedData = await fs5Advanced.getByCID(cid);

      expect(retrievedData).toBeInstanceOf(Uint8Array);
      expect(retrievedData).toEqual(binaryData);
    });

    test('should retrieve JSON data by CID', async () => {
      const jsonData = { message: 'Hello', count: 42 };
      await fs5.put('home/data.json', jsonData);

      const cid = await fs5Advanced.pathToCID('home/data.json');
      const retrievedData = await fs5Advanced.getByCID(cid);

      expect(retrievedData).toEqual(jsonData);
    });

    test('should throw error for invalid CID', async () => {
      const invalidCID = new Uint8Array(32);
      crypto.getRandomValues(invalidCID);

      await expect(fs5Advanced.getByCID(invalidCID))
        .rejects.toThrow();
    });

    test('should handle large files', async () => {
      // Create a larger file (~10KB)
      const largeData = 'x'.repeat(10000);
      await fs5.put('home/large.txt', largeData);

      const cid = await fs5Advanced.pathToCID('home/large.txt');
      const retrievedData = await fs5Advanced.getByCID(cid);

      expect(retrievedData).toBe(largeData);
      expect(retrievedData.length).toBe(10000);
    });
  });

  describe('putByCID', () => {
    test('should store data and return CID', async () => {
      const testData = 'Store and get CID';

      const cid = await fs5Advanced.putByCID(testData);

      expect(cid).toBeInstanceOf(Uint8Array);
      expect(cid.length).toBe(32);

      // Verify we can retrieve it
      const retrieved = await fs5Advanced.getByCID(cid);
      expect(retrieved).toBe(testData);
    });

    test('should handle binary data', async () => {
      const binaryData = new Uint8Array([10, 20, 30, 40, 50]);

      const cid = await fs5Advanced.putByCID(binaryData);

      expect(cid).toBeInstanceOf(Uint8Array);

      const retrieved = await fs5Advanced.getByCID(cid);
      expect(retrieved).toEqual(binaryData);
    });

    test('should handle JSON/CBOR data', async () => {
      const objectData = {
        name: 'Test Object',
        value: 12345,
        nested: { key: 'value' }
      };

      const cid = await fs5Advanced.putByCID(objectData);

      expect(cid).toBeInstanceOf(Uint8Array);

      const retrieved = await fs5Advanced.getByCID(cid);
      expect(retrieved).toEqual(objectData);
    });

    test('should return consistent CID for same content', async () => {
      const testData = 'Same content';

      const cid1 = await fs5Advanced.putByCID(testData);
      const cid2 = await fs5Advanced.putByCID(testData);

      // Content-addressing: same content = same CID
      expect(cid1).toEqual(cid2);
    });

    test('should handle empty data', async () => {
      const emptyData = '';

      const cid = await fs5Advanced.putByCID(emptyData);

      expect(cid).toBeInstanceOf(Uint8Array);
      expect(cid.length).toBe(32);
    });
  });

  describe('putWithCID', () => {
    test('should store at path and return both path and CID', async () => {
      const testData = 'Store with path and CID';

      const result = await fs5Advanced.putWithCID('home/test.txt', testData);

      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('cid');
      expect(result.path).toBe('home/test.txt');
      expect(result.cid).toBeInstanceOf(Uint8Array);
      expect(result.cid.length).toBe(32);
    });

    test('should match CID from pathToCID after storage', async () => {
      const testData = 'Verify CID consistency';

      const result = await fs5Advanced.putWithCID('home/verify.txt', testData);

      // Get CID using pathToCID
      const cidFromPath = await fs5Advanced.pathToCID('home/verify.txt');

      // Both should be the same
      expect(result.cid).toEqual(cidFromPath);
    });

    test('should allow retrieval by both path and CID', async () => {
      const testData = 'Dual access test';

      const result = await fs5Advanced.putWithCID('home/dual.txt', testData);

      // Retrieve by path (normal FS5 API)
      const dataByPath = await fs5.get('home/dual.txt');
      expect(dataByPath).toBe(testData);

      // Retrieve by CID (advanced API)
      const dataByCID = await fs5Advanced.getByCID(result.cid);
      expect(dataByCID).toBe(testData);
    });

    test('should accept PutOptions', async () => {
      const testData = 'With options';

      const result = await fs5Advanced.putWithCID('home/withopt.txt', testData, {
        mediaType: 'text/plain',
        timestamp: Date.now()
      });

      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('cid');

      // Verify metadata
      const metadata = await fs5.getMetadata('home/withopt.txt');
      expect(metadata?.mediaType).toBe('text/plain');
    });

    test('should handle nested paths', async () => {
      const testData = 'Nested path data';

      const result = await fs5Advanced.putWithCID('home/level1/level2/file.txt', testData);

      expect(result.path).toBe('home/level1/level2/file.txt');
      expect(result.cid).toBeInstanceOf(Uint8Array);

      // Verify file exists
      const retrieved = await fs5.get('home/level1/level2/file.txt');
      expect(retrieved).toBe(testData);
    });
  });

  describe('getMetadataWithCID', () => {
    test('should return metadata with CID for files', async () => {
      const testData = 'File with metadata';
      await fs5.put('home/metafile.txt', testData, {
        mediaType: 'text/plain',
        timestamp: Date.now()
      });

      const result = await fs5Advanced.getMetadataWithCID('home/metafile.txt');

      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('cid');
      expect(result.cid).toBeInstanceOf(Uint8Array);
      expect(result.metadata).toHaveProperty('type', 'file');
      expect(result.metadata).toHaveProperty('mediaType');
    });

    test('should return metadata with CID for directories', async () => {
      await fs5.put('home/mydir/file.txt', 'content');

      const result = await fs5Advanced.getMetadataWithCID('home/mydir');

      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('cid');
      expect(result.metadata).toHaveProperty('type', 'directory');
    });

    test('should throw error for non-existent path', async () => {
      await expect(fs5Advanced.getMetadataWithCID('home/nonexistent.txt'))
        .rejects.toThrow();
    });

    test('should include FileRef hash for files', async () => {
      await fs5.put('home/hashtest.txt', 'test hash');

      const result = await fs5Advanced.getMetadataWithCID('home/hashtest.txt');

      expect(result.cid).toBeInstanceOf(Uint8Array);
      expect(result.cid.length).toBe(32);

      // Verify CID matches pathToCID
      const directCID = await fs5Advanced.pathToCID('home/hashtest.txt');
      expect(result.cid).toEqual(directCID);
    });

    test('should handle root directory', async () => {
      const result = await fs5Advanced.getMetadataWithCID('');

      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('cid');
      expect(result.metadata).toHaveProperty('type', 'directory');
    });
  });

  describe('integration tests', () => {
    test('should maintain data integrity across CID and path operations', async () => {
      const testData = 'Integrity test';

      // Store using path
      await fs5.put('home/integrity.txt', testData);

      // Get CID
      const cid = await fs5Advanced.pathToCID('home/integrity.txt');

      // Retrieve by CID
      const dataByCID = await fs5Advanced.getByCID(cid);

      // Retrieve by path
      const dataByPath = await fs5.get('home/integrity.txt');

      // All should be consistent
      expect(dataByCID).toBe(testData);
      expect(dataByPath).toBe(testData);
      expect(dataByCID).toBe(dataByPath);
    });

    test('should handle CID-based workflow', async () => {
      // 1. Store data without path
      const data = 'CID-first workflow';
      const cid = await fs5Advanced.putByCID(data);

      // 2. Retrieve by CID
      const retrieved = await fs5Advanced.getByCID(cid);
      expect(retrieved).toBe(data);

      // 3. Store at path with same CID result
      const result = await fs5Advanced.putWithCID('home/linked.txt', data);
      expect(result.cid).toEqual(cid);

      // 4. Find path from CID
      const foundPath = await fs5Advanced.cidToPath(cid);
      expect(foundPath).toBe('home/linked.txt');
    });

    test('should work with different data types', async () => {
      // String
      const stringData = 'string test';
      const stringResult = await fs5Advanced.putWithCID('home/string.txt', stringData);
      expect(stringResult.cid).toBeInstanceOf(Uint8Array);

      // Binary
      const binaryData = new Uint8Array([1, 2, 3]);
      const binaryResult = await fs5Advanced.putWithCID('home/binary.bin', binaryData);
      expect(binaryResult.cid).toBeInstanceOf(Uint8Array);

      // JSON object
      const objectData = { key: 'value' };
      const objectResult = await fs5Advanced.putWithCID('home/object.json', objectData);
      expect(objectResult.cid).toBeInstanceOf(Uint8Array);

      // All should be retrievable
      expect(await fs5Advanced.getByCID(stringResult.cid)).toBe(stringData);
      expect(await fs5Advanced.getByCID(binaryResult.cid)).toEqual(binaryData);
      expect(await fs5Advanced.getByCID(objectResult.cid)).toEqual(objectData);
    });

    test('should not affect existing FS5 API functionality', async () => {
      // Use advanced API
      await fs5Advanced.putWithCID('home/advanced.txt', 'advanced data');

      // Use regular FS5 API
      await fs5.put('home/regular.txt', 'regular data');

      // Both should work
      expect(await fs5.get('home/advanced.txt')).toBe('advanced data');
      expect(await fs5.get('home/regular.txt')).toBe('regular data');

      // Advanced API should work with regular files
      const cid = await fs5Advanced.pathToCID('home/regular.txt');
      expect(await fs5Advanced.getByCID(cid)).toBe('regular data');
    });
  });
});
