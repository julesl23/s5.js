import { describe, test, expect, beforeEach } from "vitest";
import { FS5 } from "../../../src/fs/fs5.js";
import { DirV1, FileRef } from "../../../src/fs/dirv1/types.js";
import { HAMT } from "../../../src/fs/hamt/hamt.js";
import type { S5APIInterface } from "../../../src/api/s5.js";

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
      crypto.getRandomValues(bytes);
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
    const hash = new Uint8Array(33); // Include multihash prefix
    hash[0] = 0x1e; // MULTIHASH_BLAKE3
    crypto.getRandomValues(hash.subarray(1));
    // Store by the full hash
    const key = Buffer.from(hash).toString('hex');
    this.storage.set(key, data);
    return { hash, size: blob.size };
  }

  async downloadBlob(cid: Uint8Array): Promise<Blob> {
    const data = await this.downloadBlobAsBytes(cid);
    return new Blob([data as BlobPart]);
  }

  async downloadBlobAsBytes(cid: Uint8Array): Promise<Uint8Array> {
    // Try direct lookup first
    let key = Buffer.from(cid).toString('hex');
    let data = this.storage.get(key);
    
    if (!data && cid.length === 32) {
      // Try with MULTIHASH_BLAKE3 prefix
      const cidWithPrefix = new Uint8Array(33);
      cidWithPrefix[0] = 0x1e;
      cidWithPrefix.set(cid, 1);
      key = Buffer.from(cidWithPrefix).toString('hex');
      data = this.storage.get(key);
    }
    
    if (!data) throw new Error("Blob not found");
    return data;
  }

  async registryGet(publicKey: Uint8Array): Promise<any> {
    const key = Buffer.from(publicKey).toString('hex');
    const entry = this.registry.get(key);
    // Return proper registry entry structure
    if (!entry) {
      return { exists: false, data: null, revision: 0 };
    }
    return { 
      exists: true, 
      data: entry.data,
      revision: entry.revision || 1,
      signature: entry.signature || new Uint8Array(64)
    };
  }

  async registrySet(entry: any): Promise<void> {
    const key = Buffer.from(entry.pk).toString('hex');
    this.registry.set(key, {
      data: entry.data,
      revision: entry.revision || 1,
      signature: entry.signature || new Uint8Array(64)
    });
  }
  
  registryListen(publicKey: Uint8Array): AsyncIterator<any> {
    // Mock implementation - return empty async iterator
    return (async function* () {
      // Empty async generator
    })();
  }
}

// Mock Identity
class MockIdentity {
  fsRootKey = new Uint8Array(32).fill(1);
  
  // Add required properties for proper identity initialization
  get publicKey(): Uint8Array {
    return new Uint8Array(32).fill(2);
  }
  
  get privateKey(): Uint8Array {
    return new Uint8Array(64).fill(3);
  }
  
  // For registry operations
  keyPair = {
    publicKey: new Uint8Array(32).fill(2),
    privateKey: new Uint8Array(64).fill(3)
  };
}

describe("FS5 HAMT Integration", () => {
  let fs: FS5;
  let api: MockS5API;
  let identity: MockIdentity;

  beforeEach(async () => {
    api = new MockS5API();
    identity = new MockIdentity();
    fs = new FS5(api as any, identity as any);
    
    try {
      // Initialize the filesystem with root directories
      await fs.ensureIdentityInitialized();
    } catch (error) {
      // Silently handle initialization errors
      // Tests will fail appropriately if fs is not properly initialized
    }
  });

  // Helper to create a sharded directory
  async function createShardedDirectory(path: string, numFiles: number = 1100) {
    for (let i = 0; i < numFiles; i++) {
      await fs.put(`${path}/file${i}.txt`, `content ${i}`);
    }
  }

  describe("Automatic sharding trigger", () => {
    test("should not shard directory with less than 1000 entries", async () => {
      // Add 999 files
      for (let i = 0; i < 999; i++) {
        await fs.put(`home/noshard/file${i}.txt`, `content ${i}`);
      }

      // Get directory metadata
      const dirMeta = await fs.getMetadata("home/noshard");
      expect(dirMeta).toBeDefined();
      
      // Check that it's not sharded
      const dir = await (fs as any)._loadDirectory("home/noshard");
      expect(dir.header.sharding).toBeUndefined();
      expect(dir.files.size).toBe(999);
    });

    test("should automatically shard at exactly 1000 entries", async () => {
      // Add 999 files
      for (let i = 0; i < 999; i++) {
        await fs.put(`home/autoshard/file${i}.txt`, `content ${i}`);
      }

      // Directory should not be sharded yet
      let dir = await (fs as any)._loadDirectory("home/autoshard");
      expect(dir.header.sharding).toBeUndefined();

      // Add the 1000th file - should trigger sharding
      await fs.put(`home/autoshard/file999.txt`, "content 999");

      // Reload directory
      dir = await (fs as any)._loadDirectory("home/autoshard");
      
      // Should now be sharded
      expect(dir.header.sharding).toBeDefined();
      expect(dir.header.sharding.type).toBe("hamt");
      expect(dir.header.sharding.config.maxInlineEntries).toBe(1000);
      expect(dir.header.sharding.root).toBeDefined();
      expect(dir.header.sharding.root.cid).toBeInstanceOf(Uint8Array);
      expect(dir.header.sharding.root.totalEntries).toBe(1000);
      
      // Inline maps should be empty
      expect(dir.files.size).toBe(0);
      expect(dir.dirs.size).toBe(0);
    });

    test("should handle mixed files and directories when sharding", async () => {
      // Add 500 files and 500 directories
      for (let i = 0; i < 500; i++) {
        await fs.put(`home/mixed/file${i}.txt`, `content ${i}`);
        await fs.createDirectory("home/mixed", `dir${i}`);
      }

      // Should trigger sharding (1000 total entries)
      const dir = await (fs as any)._loadDirectory("home/mixed");
      
      expect(dir.header.sharding).toBeDefined();
      expect(dir.header.sharding.root.totalEntries).toBe(1000);
    });
  });

  describe("Operations on sharded directories", () => {

    test("should get files from sharded directory", async () => {
      await createShardedDirectory("home/sharded");

      // Get specific files
      const content500 = await fs.get("home/sharded/file500.txt");
      expect(content500).toBe("content 500");

      const content999 = await fs.get("home/sharded/file999.txt");
      expect(content999).toBe("content 999");

      const content1050 = await fs.get("home/sharded/file1050.txt");
      expect(content1050).toBe("content 1050");

      // Non-existent file
      const notFound = await fs.get("home/sharded/nonexistent.txt");
      expect(notFound).toBeUndefined();
    });

    test("should list sharded directory with cursor pagination", async () => {
      await createShardedDirectory("home/listtest", 1500);

      // First page
      const page1: string[] = [];
      let cursor: string | undefined;
      
      for await (const item of fs.list("home/listtest", { limit: 100 })) {
        page1.push(item.name);
        cursor = item.cursor;
      }

      expect(page1.length).toBe(100);
      expect(cursor).toBeDefined();

      // Second page using cursor
      const page2: string[] = [];
      for await (const item of fs.list("home/listtest", { limit: 100, cursor })) {
        page2.push(item.name);
        cursor = item.cursor;
      }

      expect(page2.length).toBe(100);
      
      // No duplicates between pages
      const intersection = page1.filter(name => page2.includes(name));
      expect(intersection.length).toBe(0);
    });

    test("should add new files to sharded directory", async () => {
      await createShardedDirectory("home/addtest");

      // Add new file
      await fs.put("home/addtest/newfile.txt", "new content");

      // Verify it's added
      const content = await fs.get("home/addtest/newfile.txt");
      expect(content).toBe("new content");

      // Check total count increased
      const dir = await (fs as any)._loadDirectory("home/addtest");
      expect(dir.header.sharding.root.totalEntries).toBe(1101);
    });

    test("should delete files from sharded directory", async () => {
      await createShardedDirectory("home/deletetest");

      // Delete a file
      const deleted = await fs.delete("home/deletetest/file500.txt");
      expect(deleted).toBe(true);

      // Verify it's gone
      const content = await fs.get("home/deletetest/file500.txt");
      expect(content).toBeUndefined();

      // Check total count decreased
      const dir = await (fs as any)._loadDirectory("home/deletetest");
      expect(dir.header.sharding.root.totalEntries).toBe(1099);
    });

    test("should get metadata for files in sharded directory", async () => {
      await createShardedDirectory("home/metatest");

      const meta = await fs.getMetadata("home/metatest/file100.txt");
      expect(meta).toBeDefined();
      expect(meta!.type).toBe("file");
      expect(meta!.size).toBeGreaterThan(0);
    });
  });

  describe("Edge cases and compatibility", () => {
    test("should handle empty sharded directory", async () => {
      // Create directory that will be sharded
      for (let i = 0; i < 1000; i++) {
        await fs.put(`home/empty/file${i}.txt`, `content ${i}`);
      }

      // Delete all files
      for (let i = 0; i < 1000; i++) {
        await fs.delete(`home/empty/file${i}.txt`);
      }

      // Should still be sharded but empty
      const dir = await (fs as any)._loadDirectory("home/empty");
      expect(dir.header.sharding).toBeDefined();
      expect(dir.header.sharding.root.totalEntries).toBe(0);

      // List should return empty
      const items: any[] = [];
      for await (const item of fs.list("home/empty")) {
        items.push(item);
      }
      expect(items.length).toBe(0);
    });

    test("should maintain compatibility with non-sharded directories", async () => {
      // Create both sharded and non-sharded directories
      await fs.put("home/regular/file1.txt", "content 1");
      await fs.put("home/regular/file2.txt", "content 2");

      await createShardedDirectory("home/sharded");

      // Both should work identically from API perspective
      const regular1 = await fs.get("home/regular/file1.txt");
      const sharded1 = await fs.get("home/sharded/file1.txt");

      expect(regular1).toBe("content 1");
      expect(sharded1).toBe("content 1");
    });

    test("should handle subdirectories in sharded directory", async () => {
      // Create sharded directory with subdirs
      for (let i = 0; i < 900; i++) {
        await fs.put(`home/subdirs/file${i}.txt`, `content ${i}`);
      }

      // Add subdirectories to push over 1000
      for (let i = 0; i < 101; i++) {
        await fs.createDirectory("home/subdirs", `subdir${i}`);
      }

      // Should be sharded
      const dir = await (fs as any)._loadDirectory("home/subdirs");
      expect(dir.header.sharding).toBeDefined();
      expect(dir.header.sharding.root.totalEntries).toBe(1001);

      // Can still access subdirectories
      await fs.put("home/subdirs/subdir50/nested.txt", "nested content");
      const nested = await fs.get("home/subdirs/subdir50/nested.txt");
      expect(nested).toBe("nested content");
    });
  });
});