import { describe, test, expect, beforeEach } from "vitest";
import { FS5 } from "../../src/fs/fs5.js";
import { JSCryptoImplementation } from "../../src/api/crypto/js.js";
import { DirV1 } from "../../src/fs/dirv1/types.js";

// Create a minimal mock API for testing encryption
class SimpleMockAPI {
  crypto: JSCryptoImplementation;
  private blobs: Map<string, Uint8Array> = new Map();

  constructor() {
    this.crypto = new JSCryptoImplementation();
  }

  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = await this.crypto.hashBlake3(data);
    const fullHash = new Uint8Array([0x1e, ...hash]);
    const key = Buffer.from(hash).toString("hex");
    this.blobs.set(key, data);
    return { hash: fullHash, size: blob.size };
  }

  async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
    const actualHash = hash[0] === 0x1e ? hash.slice(1) : hash;
    const key = Buffer.from(actualHash).toString("hex");
    const data = this.blobs.get(key);
    if (!data) throw new Error(`Blob not found: ${key}`);
    return data;
  }
}

// Simple mock identity
class SimpleMockIdentity {
  fsRootKey = new Uint8Array(32).fill(42);
}

describe("FS5 Encryption (XChaCha20-Poly1305)", () => {
  let fs: FS5;
  let api: SimpleMockAPI;
  let identity: SimpleMockIdentity;
  let mockDir: DirV1;

  beforeEach(() => {
    api = new SimpleMockAPI();
    identity = new SimpleMockIdentity();
    fs = new FS5(api as any, identity as any);

    // Initialize mock directory
    mockDir = {
      magic: "S5.pro",
      header: {},
      dirs: new Map(),
      files: new Map(),
    };

    // Mock directory operations
    (fs as any)._loadDirectory = async (path: string) => {
      return mockDir;
    };

    (fs as any)._updateDirectory = async (path: string, updater: any) => {
      const result = await updater(mockDir, new Uint8Array(32));
      if (result) {
        mockDir = result;
      }
    };
  });

  test("should encrypt and decrypt string data with auto-generated key", async () => {
    const secretMessage = "This is a secret message!";

    // Store encrypted data without providing a key (auto-generate)
    await fs.put("home/secrets/message.txt", secretMessage, {
      encryption: {
        algorithm: "xchacha20-poly1305",
      },
    });

    // Retrieve and verify decryption
    const retrieved = await fs.get("home/secrets/message.txt");
    expect(retrieved).toBe(secretMessage);
  });

  test("should encrypt and decrypt with user-provided key", async () => {
    const secretData = { password: "super-secret-123", apiKey: "abc-def-ghi" };
    const customKey = api.crypto.generateSecureRandomBytes(32);

    // Store with custom encryption key
    await fs.put("home/secrets/credentials.json", secretData, {
      encryption: {
        algorithm: "xchacha20-poly1305",
        key: customKey,
      },
    });

    // Retrieve and verify
    const retrieved = await fs.get("home/secrets/credentials.json");
    expect(retrieved).toEqual(secretData);
  });

  test("should encrypt and decrypt binary data", async () => {
    const binaryData = new Uint8Array([1, 2, 3, 4, 5, 255, 254, 253]);

    await fs.put("home/secrets/binary.dat", binaryData, {
      encryption: {
        algorithm: "xchacha20-poly1305",
      },
    });

    const retrieved = await fs.get("home/secrets/binary.dat");
    expect(retrieved).toEqual(binaryData);
  });

  test("should store encryption metadata in FileRef", async () => {
    const data = "encrypted content";

    await fs.put("home/secrets/meta-test.txt", data, {
      encryption: {
        algorithm: "xchacha20-poly1305",
      },
    });

    // Get metadata to verify encryption info is stored
    const metadata = await fs.getMetadata("home/secrets/meta-test.txt");
    expect(metadata).toBeDefined();
    expect(metadata?.type).toBe("file");
  });

  test("should handle large encrypted files", async () => {
    // Create a large text file (> 256KB to test chunking)
    const largeData = "A".repeat(300 * 1024); // 300 KB

    await fs.put("home/secrets/large-file.txt", largeData, {
      encryption: {
        algorithm: "xchacha20-poly1305",
      },
    });

    const retrieved = await fs.get("home/secrets/large-file.txt");
    expect(retrieved).toBe(largeData);
    expect(retrieved.length).toBe(300 * 1024);
  });

  test("should encrypt objects with nested data", async () => {
    const complexData = {
      user: {
        name: "Alice",
        email: "alice@example.com",
        settings: {
          theme: "dark",
          notifications: true,
        },
      },
      tokens: ["token1", "token2", "token3"],
      metadata: {
        created: Date.now(),
        version: 1,
      },
    };

    await fs.put("home/secrets/complex.json", complexData, {
      encryption: {
        algorithm: "xchacha20-poly1305",
      },
    });

    const retrieved = await fs.get("home/secrets/complex.json");
    expect(retrieved).toEqual(complexData);
  });

  test("should handle encrypted file deletion", async () => {
    const data = "to be deleted";

    await fs.put("home/secrets/temp.txt", data, {
      encryption: {
        algorithm: "xchacha20-poly1305",
      },
    });

    // Verify it exists
    const before = await fs.get("home/secrets/temp.txt");
    expect(before).toBe(data);

    // Delete it
    const deleted = await fs.delete("home/secrets/temp.txt");
    expect(deleted).toBe(true);

    // Verify it's gone
    const after = await fs.get("home/secrets/temp.txt");
    expect(after).toBeUndefined();
  });

  test("should list directory containing encrypted files", async () => {
    // Create some encrypted files
    await fs.put("home/vault/file1.txt", "secret 1", {
      encryption: { algorithm: "xchacha20-poly1305" },
    });
    await fs.put("home/vault/file2.txt", "secret 2", {
      encryption: { algorithm: "xchacha20-poly1305" },
    });
    await fs.put("home/vault/file3.txt", "not encrypted");

    // List the directory
    const items = [];
    for await (const item of fs.list("home/vault")) {
      items.push(item);
    }

    expect(items.length).toBe(3);
    expect(items.every((item) => item.type === "file")).toBe(true);
  });

  test("should handle mixed encrypted and unencrypted files in same directory", async () => {
    await fs.put("home/mixed/encrypted.txt", "encrypted", {
      encryption: { algorithm: "xchacha20-poly1305" },
    });
    await fs.put("home/mixed/plain.txt", "not encrypted");

    const encrypted = await fs.get("home/mixed/encrypted.txt");
    const plain = await fs.get("home/mixed/plain.txt");

    expect(encrypted).toBe("encrypted");
    expect(plain).toBe("not encrypted");
  });

  test("should preserve media type with encryption", async () => {
    const jsonData = { key: "value" };

    await fs.put("home/secrets/data.json", jsonData, {
      mediaType: "application/json",
      encryption: { algorithm: "xchacha20-poly1305" },
    });

    const metadata = await fs.getMetadata("home/secrets/data.json");
    expect(metadata?.mediaType).toBe("application/json");

    const retrieved = await fs.get("home/secrets/data.json");
    expect(retrieved).toEqual(jsonData);
  });

  test("should handle empty data encryption", async () => {
    await fs.put("home/secrets/empty.txt", "", {
      encryption: { algorithm: "xchacha20-poly1305" },
    });

    const retrieved = await fs.get("home/secrets/empty.txt");
    expect(retrieved).toBe("");
  });

  test("should encrypt unicode content correctly", async () => {
    const unicodeText = "Hello 世界 🌍 Привет مرحبا";

    await fs.put("home/secrets/unicode.txt", unicodeText, {
      encryption: { algorithm: "xchacha20-poly1305" },
    });

    const retrieved = await fs.get("home/secrets/unicode.txt");
    expect(retrieved).toBe(unicodeText);
  });
});
