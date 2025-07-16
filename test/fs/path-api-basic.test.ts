import { describe, test, expect, beforeEach } from "vitest";
import { FS5 } from "../../src/fs/fs5.js";
import { JSCryptoImplementation } from "../../src/api/crypto/js.js";
import { DirV1 } from "../../src/fs/dirv1/types.js";

// Mock S5 API interface for testing
class MockS5API {
  crypto: JSCryptoImplementation;
  private storage: Map<string, Uint8Array> = new Map();
  private registryEntries: Map<string, any> = new Map();

  constructor() {
    this.crypto = new JSCryptoImplementation();
  }

  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = await this.crypto.hashBlake3(data);
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
    return this.registryEntries.get(key);
  }

  async registrySet(entry: any): Promise<void> {
    const key = Buffer.from(entry.pk).toString('hex');
    this.registryEntries.set(key, entry);
  }
}

// Mock identity for testing
class MockIdentity {
  fsRootKey = new Uint8Array(32).fill(1);
}

describe("Path-Based API - Basic Test", () => {
  let fs: FS5;
  let api: MockS5API;
  let identity: MockIdentity;

  beforeEach(async () => {
    api = new MockS5API();
    identity = new MockIdentity();
    fs = new FS5(api as any, identity as any);
  });

  test("should handle basic operations without full S5 setup", async () => {
    // First, let's test the existing uploadBlobWithoutEncryption
    const testData = new TextEncoder().encode("Hello, world!");
    const blob = new Blob([testData]);
    
    const result = await fs.uploadBlobWithoutEncryption(blob);
    expect(result.hash).toBeInstanceOf(Uint8Array);
    expect(result.size).toBe(testData.length);
    
    // Now test downloading
    const downloaded = await api.downloadBlobAsBytes(new Uint8Array([0x1e, ...result.hash]));
    expect(downloaded).toEqual(testData);
  });

  test("should load directory with mocked _loadDirectory", async () => {
    // Create a simple directory structure
    const testDir: DirV1 = {
      magic: "S5.pro",
      header: {},
      dirs: new Map(),
      files: new Map([
        ["test.txt", {
          hash: new Uint8Array(32).fill(2),
          size: 100,
          media_type: "text/plain"
        }]
      ])
    };

    // Mock the _loadDirectory method temporarily
    const originalLoad = (fs as any)._loadDirectory;
    (fs as any)._loadDirectory = async (path: string) => {
      if (path === "" || path === "home") {
        return testDir;
      }
      return undefined;
    };

    // Upload some test data first
    const testContent = "Test file content";
    const testBlob = new Blob([testContent]);
    const uploaded = await api.uploadBlob(testBlob);
    
    // Update the test directory with the correct hash (without prefix)
    testDir.files.set("test.txt", {
      hash: uploaded.hash.slice(1), // Remove multihash prefix
      size: uploaded.size,
      media_type: "text/plain"
    });
    
    // Test the get method
    const result = await (fs as any).get("test.txt");
    expect(result).toBe(testContent);

    // Restore original method
    (fs as any)._loadDirectory = originalLoad;
  });
});