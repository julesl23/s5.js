import { describe, test, expect, beforeEach } from "vitest";
import { FS5 } from "../../../src/fs/fs5.js";

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
    return new Blob([data]);
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
    return this.registry.get(key);
  }

  async registrySet(entry: any): Promise<void> {
    const key = Buffer.from(entry.pk).toString('hex');
    this.registry.set(key, entry);
  }
}

// Mock Identity
class MockIdentity {
  fsRootKey = new Uint8Array(32).fill(1);
}

describe("FS5 HAMT Performance", () => {
  let fs: FS5;

  beforeEach(async () => {
    // Setup mock API and identity
    fs = new FS5(new MockS5API() as any, new MockIdentity() as any);
    
    // Initialize the filesystem with root directories
    await fs.ensureIdentityInitialized();
  });

  test("should handle 10K entries efficiently", async () => {
    const start = Date.now();
    
    // Add 10K files
    for (let i = 0; i < 10000; i++) {
      await fs.put(`home/perf10k/file${i}.txt`, `content ${i}`);
    }
    
    const insertTime = Date.now() - start;
    console.log(`Insert 10K entries: ${insertTime}ms`);

    // Test random access
    const accessStart = Date.now();
    for (let i = 0; i < 100; i++) {
      const idx = Math.floor(Math.random() * 10000);
      const content = await fs.get(`home/perf10k/file${idx}.txt`);
      expect(content).toBe(`content ${idx}`);
    }
    const accessTime = Date.now() - accessStart;
    console.log(`100 random accesses: ${accessTime}ms (${accessTime/100}ms per access)`);
    
    // Should be under 100ms per access
    expect(accessTime / 100).toBeLessThan(100);
  });

  test("should maintain O(log n) performance at scale", async () => {
    const sizes = [1000, 5000, 10000];
    const accessTimes: number[] = [];

    for (const size of sizes) {
      // Create directory with 'size' entries
      for (let i = 0; i < size; i++) {
        await fs.put(`home/scale${size}/file${i}.txt`, `content ${i}`);
      }

      // Measure access time
      const start = Date.now();
      for (let i = 0; i < 50; i++) {
        const idx = Math.floor(Math.random() * size);
        await fs.get(`home/scale${size}/file${idx}.txt`);
      }
      const avgTime = (Date.now() - start) / 50;
      accessTimes.push(avgTime);
      
      console.log(`Size ${size}: ${avgTime}ms average access`);
    }

    // Access time should not grow linearly
    // With O(log n), doubling size should add constant time
    const growth1 = accessTimes[1] - accessTimes[0];
    const growth2 = accessTimes[2] - accessTimes[1];
    
    // Growth should be relatively constant (allowing 50% variance)
    expect(growth2).toBeLessThan(growth1 * 1.5);
  });
});