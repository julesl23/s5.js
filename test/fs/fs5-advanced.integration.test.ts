import { describe, it, expect, beforeEach } from 'vitest';
import { S5 } from '../../src/index.js';
import { FS5Advanced } from '../../src/fs/fs5-advanced.js';
import { formatCID, parseCID } from '../../src/fs/cid-utils.js';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js environment
if (!global.WebSocket) {
  global.WebSocket = WebSocket as any;
}

// These integration tests use a REAL S5 instance with actual storage
// Unlike the unit tests which mock FS5 internals, these tests verify
// that the Advanced CID API works with real IndexedDB/memory-level and registry operations
//
// ⚠️  IMPORTANT: Real S5 portal testing is better suited for standalone scripts
// due to registry propagation delays, network timing, and test isolation challenges.
//
// For comprehensive Advanced CID API testing with real S5 portals, use:
//   node test/integration/test-advanced-cid-real.js
//
// This standalone script properly handles:
// - Portal registration and authentication
// - Registry propagation delays between operations (5+ seconds)
// - Sequential execution with concurrency: 1 to avoid registry conflicts
// - All integration scenarios:
//   • putWithCID and dual retrieval (path + CID)
//   • pathToCID extraction from stored files
//   • cidToPath lookup and verification
//   • getByCID without path knowledge
//   • CID consistency and verification
//   • Integration with encryption
//
// The vitest tests below are SKIPPED for automated CI and kept for reference.

describe.skip('FS5Advanced Integration Tests', () => {
  let s5: S5;
  let advanced: FS5Advanced;
  let testPath: string;

  beforeEach(async () => {
    // Create S5 instance with in-memory storage
    s5 = await S5.create({});

    // Generate and recover identity
    const seedPhrase = s5.generateSeedPhrase();
    await s5.recoverIdentityFromSeedPhrase(seedPhrase);
    await s5.fs.ensureIdentityInitialized();

    // Create Advanced API instance
    advanced = new FS5Advanced(s5.fs);

    // Use unique path for each test
    testPath = `home/test-${Date.now()}.txt`;
  });

  describe('putWithCID Integration', () => {
    it('should store data and return both path and CID', async () => {
      const testData = 'Integration test data';

      const result = await advanced.putWithCID(testPath, testData);

      expect(result.path).toBe(testPath);
      expect(result.cid).toBeInstanceOf(Uint8Array);
      expect(result.cid.length).toBe(32);

      // Verify we can retrieve by path
      const byPath = await s5.fs.get(testPath);
      expect(byPath).toBe(testData);

      // Verify we can retrieve by CID
      const byCID = await advanced.getByCID(result.cid);
      expect(byCID).toBe(testData);
    });

    it('should work with binary data', async () => {
      const binaryData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      const result = await advanced.putWithCID(testPath, binaryData);

      const retrieved = await advanced.getByCID(result.cid);
      expect(retrieved).toEqual(binaryData);
    });

    it('should work with JSON data', async () => {
      const jsonData = { key: 'value', nested: { data: 123 } };

      const result = await advanced.putWithCID(testPath, jsonData);

      const retrieved = await advanced.getByCID(result.cid);
      expect(retrieved).toEqual(jsonData);
    });
  });

  describe('pathToCID Integration', () => {
    it('should extract CID from stored file', async () => {
      const testData = 'Extract CID test';
      await s5.fs.put(testPath, testData);

      const cid = await advanced.pathToCID(testPath);

      expect(cid).toBeInstanceOf(Uint8Array);
      expect(cid.length).toBe(32);

      // Verify CID works for retrieval
      const retrieved = await advanced.getByCID(cid);
      expect(retrieved).toBe(testData);
    });

    it('should extract CID from directory', async () => {
      const dirPath = 'home/testdir';
      await s5.fs.put(`${dirPath}/file.txt`, 'content');

      const cid = await advanced.pathToCID(dirPath);

      expect(cid).toBeInstanceOf(Uint8Array);
      expect(cid.length).toBe(32);
    });

    it('should return consistent CID for same content', async () => {
      const content = 'Consistent content';
      const path1 = 'home/file1.txt';
      const path2 = 'home/file2.txt';

      await s5.fs.put(path1, content);
      await s5.fs.put(path2, content);

      const cid1 = await advanced.pathToCID(path1);
      const cid2 = await advanced.pathToCID(path2);

      // Same content should have same CID
      expect(cid1).toEqual(cid2);
    });
  });

  describe('cidToPath Integration', () => {
    it('should find path from CID', async () => {
      const testData = 'Find path test';
      await s5.fs.put(testPath, testData);

      const cid = await advanced.pathToCID(testPath);
      const foundPath = await advanced.cidToPath(cid);

      expect(foundPath).toBe(testPath);
    });

    it('should return null for unknown CID', async () => {
      const unknownCID = new Uint8Array(32).fill(99);

      const foundPath = await advanced.cidToPath(unknownCID);

      expect(foundPath).toBeNull();
    });

    it('should prefer user paths over .cid paths', async () => {
      const testData = 'Preference test';
      const userPath = 'home/userfile.txt';

      // Store at user path
      const result = await advanced.putWithCID(userPath, testData);

      // Also store via putByCID (creates .cid/ path)
      await advanced.putByCID(testData);

      // cidToPath should return user path, not .cid/ path
      const foundPath = await advanced.cidToPath(result.cid);

      expect(foundPath).toBe(userPath);
      expect(foundPath).not.toContain('.cid/');
    });
  });

  describe('getByCID Integration', () => {
    it('should retrieve data without knowing path', async () => {
      const testData = 'Retrieve by CID test';
      const result = await advanced.putWithCID(testPath, testData);

      // Retrieve without using path
      const retrieved = await advanced.getByCID(result.cid);

      expect(retrieved).toBe(testData);
    });

    it('should throw error for non-existent CID', async () => {
      const nonExistentCID = new Uint8Array(32).fill(255);

      await expect(advanced.getByCID(nonExistentCID)).rejects.toThrow('CID not found');
    });
  });

  describe('getMetadataWithCID Integration', () => {
    it('should return metadata and CID for file', async () => {
      const testData = 'Metadata test';
      await s5.fs.put(testPath, testData);

      const result = await advanced.getMetadataWithCID(testPath);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.type).toBe('file');
      expect(result.metadata.size).toBeGreaterThan(0);
      expect(result.cid).toBeInstanceOf(Uint8Array);
      expect(result.cid.length).toBe(32);
    });

    it('should return metadata and CID for directory', async () => {
      const dirPath = 'home/metadir';
      await s5.fs.put(`${dirPath}/file.txt`, 'content');

      const result = await advanced.getMetadataWithCID(dirPath);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.type).toBe('directory');
      expect(result.cid).toBeInstanceOf(Uint8Array);
      expect(result.cid.length).toBe(32);
    });
  });

  describe('CID Utilities Integration', () => {
    it('should format and parse CID correctly', async () => {
      const testData = 'Format parse test';
      const result = await advanced.putWithCID(testPath, testData);

      // Format CID
      const formatted = formatCID(result.cid, 'base32');
      expect(formatted).toBeTypeOf('string');
      expect(formatted.length).toBeGreaterThan(0);

      // Parse it back
      const parsed = parseCID(formatted);
      expect(parsed).toEqual(result.cid);

      // Should be able to retrieve with parsed CID
      const retrieved = await advanced.getByCID(parsed);
      expect(retrieved).toBe(testData);
    });

    it('should work with different encoding formats', async () => {
      const result = await advanced.putWithCID(testPath, 'Encoding test');

      // Test all three encodings
      const base32 = formatCID(result.cid, 'base32');
      const base58 = formatCID(result.cid, 'base58btc');
      const base64 = formatCID(result.cid, 'base64');

      // All should parse back to same CID
      expect(parseCID(base32)).toEqual(result.cid);
      expect(parseCID(base58)).toEqual(result.cid);
      expect(parseCID(base64)).toEqual(result.cid);
    });
  });

  describe('Encryption Integration', () => {
    it('should handle encrypted files with CID operations', async () => {
      const sensitiveData = 'Secret information';

      // Store with encryption
      const result = await advanced.putWithCID(testPath, sensitiveData, {
        encryption: { algorithm: 'xchacha20-poly1305' },
      });

      expect(result.cid).toBeInstanceOf(Uint8Array);

      // Should be able to retrieve by CID (will auto-decrypt)
      const retrieved = await advanced.getByCID(result.cid);
      expect(retrieved).toBe(sensitiveData);

      // Should find path from CID
      const foundPath = await advanced.cidToPath(result.cid);
      expect(foundPath).toBe(testPath);
    });

    it('should have different CIDs for same content with different encryption', async () => {
      const content = 'Same content, different encryption';
      const path1 = 'home/encrypted1.txt';
      const path2 = 'home/encrypted2.txt';

      // Store with different encryption keys
      const result1 = await advanced.putWithCID(path1, content, {
        encryption: { algorithm: 'xchacha20-poly1305' }
      });
      const result2 = await advanced.putWithCID(path2, content, {
        encryption: { algorithm: 'xchacha20-poly1305' }
      });

      // Encrypted files should have different CIDs (different keys = different ciphertext)
      expect(result1.cid).not.toEqual(result2.cid);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should support complete CID-based workflow', async () => {
      const originalData = 'Complete workflow test';

      // 1. Store data and get CID
      const { path, cid } = await advanced.putWithCID(testPath, originalData);

      // 2. Format CID for sharing
      const cidString = formatCID(cid, 'base58btc');

      // 3. Recipient: parse CID from string
      const receivedCID = parseCID(cidString);

      // 4. Recipient: retrieve data by CID
      const retrievedData = await advanced.getByCID(receivedCID);
      expect(retrievedData).toBe(originalData);

      // 5. Recipient: find path from CID
      const foundPath = await advanced.cidToPath(receivedCID);
      expect(foundPath).toBe(path);

      // 6. Verify metadata includes CID
      if (foundPath) {
        const metadata = await advanced.getMetadataWithCID(foundPath);
        expect(metadata.cid).toEqual(cid);
      }
    });
  });
});
