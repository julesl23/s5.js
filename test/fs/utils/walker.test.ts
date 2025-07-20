// test/fs/utils/walker.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DirectoryWalker, WalkOptions, WalkResult, WalkStats } from '../../../src/fs/utils/walker.js';
import { FS5 } from '../../../src/fs/fs5.js';
import type { S5APIInterface } from '../../../src/api/s5.js';
import { webcrypto } from 'crypto';

// Mock S5 API
class MockS5API {
  private storage: Map<string, Uint8Array> = new Map();
  private registry: Map<string, any> = new Map();
  
  crypto = {
    hashBlake3Sync: (data: Uint8Array): Uint8Array => {
      // Simple mock hash - just use first 32 bytes or pad
      const hash = new Uint8Array(32);
      for (let i = 0; i < Math.min(data.length, 32); i++) {
        hash[i] = data[i];
      }
      return hash;
    },
    hashBlake3Blob: async (blob: Blob): Promise<Uint8Array> => {
      const data = new Uint8Array(await blob.arrayBuffer());
      return MockS5API.prototype.crypto.hashBlake3Sync(data);
    },
    generateSecureRandomBytes: (size: number): Uint8Array => {
      const bytes = new Uint8Array(size);
      (webcrypto as any).getRandomValues(bytes);
      return bytes;
    },
    newKeyPairEd25519: async (seed: Uint8Array): Promise<any> => {
      return {
        publicKey: seed,
        privateKey: seed
      };
    },
    encryptXChaCha20Poly1305: async (key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> => {
      // Simple mock - just return plaintext with 16-byte tag
      return new Uint8Array([...plaintext, ...new Uint8Array(16)]);
    },
    decryptXChaCha20Poly1305: async (key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> => {
      // Simple mock - remove tag
      return ciphertext.subarray(0, ciphertext.length - 16);
    },
    signRawRegistryEntry: async (keyPair: any, entry: any): Promise<Uint8Array> => {
      // Simple mock signature
      return new Uint8Array(64);
    },
    signEd25519: async (keyPair: any, message: Uint8Array): Promise<Uint8Array> => {
      // Simple mock signature
      return new Uint8Array(64);
    }
  };

  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = this.crypto.hashBlake3Sync(data);
    const key = Buffer.from(hash).toString('hex');
    this.storage.set(key, data);
    return { hash: new Uint8Array([0x1e, ...hash]), size: blob.size };
  }

  async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
    // If hash has multihash prefix, remove it
    const actualHash = hash[0] === 0x1e ? hash.slice(1) : hash;
    const key = Buffer.from(actualHash).toString('hex');
    const data = this.storage.get(key);
    if (!data) throw new Error("Blob not found");
    return data;
  }

  async registryGet(publicKey: Uint8Array): Promise<any> {
    const key = Buffer.from(publicKey).toString('hex');
    const entry = this.registry.get(key);
    return entry;
  }

  async registrySet(entry: any): Promise<void> {
    const key = Buffer.from(entry.pk).toString('hex');
    this.registry.set(key, entry);
  }
  
  async registryListenOnEntry(publicKey: Uint8Array, callback: (entry: any) => void): Promise<() => void> {
    // Mock implementation - just return a no-op unsubscribe function
    return () => {};
  }
}

class MockIdentity {
  fsRootKey = new Uint8Array(32).fill(1);
}

describe('DirectoryWalker', () => {
  let fs: FS5;
  let api: MockS5API;
  let identity: MockIdentity;

  beforeEach(async () => {
    api = new MockS5API();
    identity = new MockIdentity();
    fs = new FS5(api as any, identity as any);
    
    // Initialize the filesystem with root directories
    await fs.ensureIdentityInitialized();
    
    // Create test directory structure
    await fs.put('home/test/file1.txt', 'content1');
    await fs.put('home/test/file2.txt', 'content2');
    await fs.put('home/test/dir1/file3.txt', 'content3');
    await fs.put('home/test/dir1/file4.txt', 'content4');
    await fs.put('home/test/dir1/subdir/file5.txt', 'content5');
    await fs.put('home/test/dir2/file6.txt', 'content6');
    await fs.put('home/test/empty/.gitkeep', '');
  });

  describe('walk async iterator', () => {
    it('should walk all files and directories recursively by default', async () => {
      const walker = new DirectoryWalker(fs, 'home/test');
      const results: WalkResult[] = [];
      
      for await (const item of walker.walk()) {
        results.push(item);
      }
      
      // Should include all files and directories
      expect(results.length).toBeGreaterThanOrEqual(9); // At least 6 files + 3 directories
      
      // Check for specific items
      const paths = results.map(r => r.path);
      expect(paths).toContain('home/test/file1.txt');
      expect(paths).toContain('home/test/dir1/file3.txt');
      expect(paths).toContain('home/test/dir1/subdir/file5.txt');
      expect(paths).toContain('home/test/dir1');
      expect(paths).toContain('home/test/dir1/subdir');
    });

    it('should respect includeFiles option', async () => {
      const walker = new DirectoryWalker(fs, 'home/test');
      const results: WalkResult[] = [];
      
      for await (const item of walker.walk({ includeFiles: false })) {
        results.push(item);
      }
      
      // Should only include directories
      expect(results.every(r => r.type === 'directory')).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(3); // dir1, dir1/subdir, dir2
    });

    it('should respect includeDirectories option', async () => {
      const walker = new DirectoryWalker(fs, 'home/test');
      const results: WalkResult[] = [];
      
      for await (const item of walker.walk({ includeDirectories: false })) {
        results.push(item);
      }
      
      // Should only include files
      expect(results.every(r => r.type === 'file')).toBe(true);
      expect(results.length).toBe(7); // All files including .gitkeep
    });

    it('should apply custom filter function', async () => {
      const walker = new DirectoryWalker(fs, 'home/test');
      const results: WalkResult[] = [];
      
      const filter = (name: string, type: 'file' | 'directory') => {
        // Only include .txt files and directories
        return type === 'directory' || name.endsWith('.txt');
      };
      
      for await (const item of walker.walk({ filter })) {
        results.push(item);
      }
      
      // Should not include .gitkeep
      const fileNames = results.filter(r => r.type === 'file').map(r => r.name);
      expect(fileNames).not.toContain('.gitkeep');
      expect(fileNames.every(name => name.endsWith('.txt'))).toBe(true);
    });

    it('should respect maxDepth option', async () => {
      const walker = new DirectoryWalker(fs, 'home/test');
      const results: WalkResult[] = [];
      
      for await (const item of walker.walk({ maxDepth: 1 })) {
        results.push(item);
      }
      
      // Should not include deeply nested items
      const paths = results.map(r => r.path);
      expect(paths).not.toContain('home/test/dir1/subdir/file5.txt');
      expect(paths).not.toContain('home/test/dir1/subdir');
      
      // Should include depth 0 and 1 items
      expect(paths).toContain('home/test/file1.txt');
      expect(paths).toContain('home/test/dir1');
      expect(paths).toContain('home/test/dir1/file3.txt');
    });

    it('should handle non-recursive walking', async () => {
      const walker = new DirectoryWalker(fs, 'home/test');
      const results: WalkResult[] = [];
      
      for await (const item of walker.walk({ recursive: false })) {
        results.push(item);
      }
      
      // Should only include direct children
      const paths = results.map(r => r.path);
      expect(paths).toContain('home/test/file1.txt');
      expect(paths).toContain('home/test/file2.txt');
      expect(paths).toContain('home/test/dir1');
      expect(paths).toContain('home/test/dir2');
      
      // Should not include nested items
      expect(paths).not.toContain('home/test/dir1/file3.txt');
      expect(paths).not.toContain('home/test/dir1/subdir');
    });

    it('should support cursor resume', async () => {
      const walker = new DirectoryWalker(fs, 'home/test');
      
      // First, get some items and a cursor
      const firstBatch: WalkResult[] = [];
      let lastCursor: string | undefined;
      
      for await (const item of walker.walk({ maxDepth: 1 })) {
        firstBatch.push(item);
        lastCursor = item.cursor;
        if (firstBatch.length >= 3) break; // Stop after 3 items
      }
      
      expect(lastCursor).toBeDefined();
      
      // Resume from cursor
      const resumedBatch: WalkResult[] = [];
      for await (const item of walker.walk({ cursor: lastCursor, maxDepth: 1 })) {
        resumedBatch.push(item);
      }
      
      // Should not include items from first batch
      const firstPaths = firstBatch.map(r => r.path);
      const resumedPaths = resumedBatch.map(r => r.path);
      expect(firstPaths.some(path => resumedPaths.includes(path))).toBe(false);
    });

    it('should include depth information', async () => {
      const walker = new DirectoryWalker(fs, 'home/test');
      const results: WalkResult[] = [];
      
      for await (const item of walker.walk()) {
        results.push(item);
      }
      
      // Check depth values
      const file1 = results.find(r => r.path === 'home/test/file1.txt');
      expect(file1?.depth).toBe(0);
      
      const dir1 = results.find(r => r.path === 'home/test/dir1');
      expect(dir1?.depth).toBe(0);
      
      const file3 = results.find(r => r.path === 'home/test/dir1/file3.txt');
      expect(file3?.depth).toBe(1);
      
      const subdir = results.find(r => r.path === 'home/test/dir1/subdir');
      expect(subdir?.depth).toBe(1);
      
      const file5 = results.find(r => r.path === 'home/test/dir1/subdir/file5.txt');
      expect(file5?.depth).toBe(2);
    });

    it('should handle empty directories', async () => {
      const walker = new DirectoryWalker(fs, 'home/test/empty');
      const results: WalkResult[] = [];
      
      for await (const item of walker.walk()) {
        results.push(item);
      }
      
      // Should only contain .gitkeep
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('.gitkeep');
    });

    it('should handle non-existent directories gracefully', async () => {
      const walker = new DirectoryWalker(fs, 'home/non-existent');
      const results: WalkResult[] = [];
      
      try {
        for await (const item of walker.walk()) {
          results.push(item);
        }
      } catch (error) {
        // Should handle gracefully
        expect(error).toBeDefined();
      }
      
      expect(results.length).toBe(0);
    });
  });

  describe('count method', () => {
    it('should count all files and directories with total size', async () => {
      const walker = new DirectoryWalker(fs, 'home/test');
      const stats = await walker.count();
      
      expect(stats.files).toBe(7);
      expect(stats.directories).toBeGreaterThanOrEqual(3);
      expect(stats.totalSize).toBeGreaterThan(0);
    });

    it('should count with filter applied', async () => {
      const walker = new DirectoryWalker(fs, 'home/test');
      const stats = await walker.count({
        filter: (name) => name.endsWith('.txt')
      });
      
      expect(stats.files).toBe(6); // Excluding .gitkeep
      expect(stats.directories).toBe(0); // Filter excludes directories
    });

    it('should count non-recursively', async () => {
      const walker = new DirectoryWalker(fs, 'home/test');
      const stats = await walker.count({ recursive: false });
      
      expect(stats.files).toBe(2); // file1.txt, file2.txt
      expect(stats.directories).toBe(2); // dir1, dir2
    });

    it('should count with maxDepth', async () => {
      const walker = new DirectoryWalker(fs, 'home/test');
      const stats = await walker.count({ maxDepth: 1 });
      
      expect(stats.files).toBe(6); // All except file5.txt in subdir
      expect(stats.directories).toBe(2); // dir1, dir2 (not subdir)
    });

    it('should handle empty directory count', async () => {
      const walker = new DirectoryWalker(fs, 'home/test/empty');
      const stats = await walker.count();
      
      expect(stats.files).toBe(1); // .gitkeep
      expect(stats.directories).toBe(0);
      expect(stats.totalSize).toBe(0); // .gitkeep is empty
    });
  });
});