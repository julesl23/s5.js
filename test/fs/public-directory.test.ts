import { describe, test, expect, beforeEach } from "vitest";
import { FS5 } from "../../src/fs/fs5.js";
import { JSCryptoImplementation } from "../../src/api/crypto/js.js";
import { mkeyEd25519 } from "../../src/constants.js";
import { concatBytes } from "@noble/hashes/utils";

// Reuse SimpleMockAPI pattern from path-api-simple.test.ts
class SimpleMockAPI {
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

  async registryGet(publicKey: Uint8Array): Promise<any> {
    const key = Buffer.from(publicKey).toString("hex");
    return this.registry.get(key);
  }

  async registrySet(entry: any): Promise<void> {
    const key = Buffer.from(entry.pk).toString("hex");
    this.registry.set(key, entry);
  }
}

class SimpleMockIdentity {
  fsRootKey = new Uint8Array(32).fill(42);
}

// --- Sub-phase 1.1: getPublicDirectoryKey tests ---

describe("getPublicDirectoryKey", () => {
  let operatorFs: FS5;
  let api: SimpleMockAPI;
  let identity: SimpleMockIdentity;

  beforeEach(async () => {
    api = new SimpleMockAPI();
    identity = new SimpleMockIdentity();
    operatorFs = new FS5(api as any, identity as any);
    await operatorFs.ensureIdentityInitialized();
    // Create test directory by writing a seed file
    await operatorFs.put("home/testdir/seed.txt", "x");
  });

  test("returns a Uint8Array of exactly 32 bytes", async () => {
    const key = await operatorFs.getPublicDirectoryKey("home/testdir");
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  test("calling twice on same path returns identical bytes", async () => {
    const key1 = await operatorFs.getPublicDirectoryKey("home/testdir");
    const key2 = await operatorFs.getPublicDirectoryKey("home/testdir");
    expect(key1).toEqual(key2);
  });

  test("different paths return different keys", async () => {
    await operatorFs.put("home/other/seed.txt", "y");
    const keyA = await operatorFs.getPublicDirectoryKey("home/testdir");
    const keyB = await operatorFs.getPublicDirectoryKey("home/other");
    expect(keyA).not.toEqual(keyB);
  });
});

// --- Sub-phase 1.2: readFromPublicDirectory tests ---

describe("readFromPublicDirectory", () => {
  let operatorFs: FS5;
  let viewerFs: FS5;
  let api: SimpleMockAPI;
  let identity: SimpleMockIdentity;

  beforeEach(async () => {
    api = new SimpleMockAPI();
    identity = new SimpleMockIdentity();
    operatorFs = new FS5(api as any, identity as any);
    await operatorFs.ensureIdentityInitialized();

    // Viewer shares same API (same network) but has NO identity
    viewerFs = new FS5(api as any);
  });

  test("reads a single file from another user's public directory", async () => {
    await operatorFs.put("home/testdir/file.txt", "Hello");
    const key = await operatorFs.getPublicDirectoryKey("home/testdir");
    const result = await viewerFs.readFromPublicDirectory(key, "file.txt");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(result!)).toBe("Hello");
  });

  test("reads a file at a nested subpath", async () => {
    await operatorFs.put("home/testdir/sub/deep.txt", "Nested");
    const key = await operatorFs.getPublicDirectoryKey("home/testdir");
    const result = await viewerFs.readFromPublicDirectory(key, "sub/deep.txt");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(result!)).toBe("Nested");
  });

  test("returns undefined when file does not exist", async () => {
    await operatorFs.put("home/testdir/seed.txt", "x");
    const key = await operatorFs.getPublicDirectoryKey("home/testdir");
    const result = await viewerFs.readFromPublicDirectory(key, "nonexistent.txt");
    expect(result).toBeUndefined();
  });

  test("returns undefined when directory segment in subpath does not exist", async () => {
    await operatorFs.put("home/testdir/seed.txt", "x");
    const key = await operatorFs.getPublicDirectoryKey("home/testdir");
    const result = await viewerFs.readFromPublicDirectory(key, "no/such/file.txt");
    expect(result).toBeUndefined();
  });

  test("returns undefined when remotePubKey is a random 32-byte key", async () => {
    const randomKey = new Uint8Array(32);
    randomKey.fill(99);
    const result = await viewerFs.readFromPublicDirectory(randomKey, "file.txt");
    expect(result).toBeUndefined();
  });

  test("throws when remotePubKey is not 32 bytes", async () => {
    const badKey = new Uint8Array(16);
    await expect(
      viewerFs.readFromPublicDirectory(badKey, "file.txt")
    ).rejects.toThrow();
  });

  test("returns undefined for empty subpath", async () => {
    await operatorFs.put("home/testdir/seed.txt", "x");
    const key = await operatorFs.getPublicDirectoryKey("home/testdir");
    const result = await viewerFs.readFromPublicDirectory(key, "");
    expect(result).toBeUndefined();
  });

  test("binary data round-trip", async () => {
    const binaryData = new Uint8Array([1, 2, 3, 4]);
    await operatorFs.put("home/testdir/bin.dat", binaryData);
    const key = await operatorFs.getPublicDirectoryKey("home/testdir");
    const result = await viewerFs.readFromPublicDirectory(key, "bin.dat");
    expect(result).toEqual(binaryData);
  });
});

// --- Sub-phase 1.1: getPublicDirectoryKeyFrom tests ---

describe("getPublicDirectoryKeyFrom", () => {
  let operatorFs: FS5;
  let viewerFs: FS5;
  let api: SimpleMockAPI;
  let identity: SimpleMockIdentity;
  let testdirKey: Uint8Array;

  beforeEach(async () => {
    api = new SimpleMockAPI();
    identity = new SimpleMockIdentity();
    operatorFs = new FS5(api as any, identity as any);
    await operatorFs.ensureIdentityInitialized();
    await operatorFs.put("home/testdir/seed.txt", "x");
    viewerFs = new FS5(api as any);
    testdirKey = await operatorFs.getPublicDirectoryKey("home/testdir");
  });

  test("happy path — returns pubkey matching operator's getPublicDirectoryKey for same path", async () => {
    await operatorFs.put("home/testdir/followers/alice/follow/marker.txt", "m");
    const result = await viewerFs.getPublicDirectoryKeyFrom(testdirKey, "followers/alice/follow");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result!.length).toBe(32);
    const expected = await operatorFs.getPublicDirectoryKey("home/testdir/followers/alice/follow");
    expect(result).toEqual(expected);
  });

  test("empty subpath returns the remote root pubkey unchanged", async () => {
    const result1 = await viewerFs.getPublicDirectoryKeyFrom(testdirKey, "");
    expect(result1).toEqual(testdirKey);
    const result2 = await viewerFs.getPublicDirectoryKeyFrom(testdirKey, "/");
    expect(result2).toEqual(testdirKey);
  });

  test("missing intermediate segment returns undefined", async () => {
    const result = await viewerFs.getPublicDirectoryKeyFrom(testdirKey, "nonexistent/follow");
    expect(result).toBeUndefined();
  });

  test("missing final segment returns undefined", async () => {
    await operatorFs.put("home/testdir/followers/alice/follow/marker.txt", "m");
    const result = await viewerFs.getPublicDirectoryKeyFrom(testdirKey, "followers/alice/nonexistent");
    expect(result).toBeUndefined();
  });

  test("final segment is a file returns undefined", async () => {
    await operatorFs.put("home/testdir/followers/alice/follow/marker.txt", "m");
    const result = await viewerFs.getPublicDirectoryKeyFrom(testdirKey, "followers/alice/follow/marker.txt");
    expect(result).toBeUndefined();
  });

  test("random remote pubkey returns undefined", async () => {
    const randomKey = new Uint8Array(32);
    randomKey.fill(99);
    const result = await viewerFs.getPublicDirectoryKeyFrom(randomKey, "followers");
    expect(result).toBeUndefined();
  });

  test("invalid remote pubkey length throws", async () => {
    await expect(
      viewerFs.getPublicDirectoryKeyFrom(new Uint8Array(16), "x")
    ).rejects.toThrow();
    await expect(
      viewerFs.getPublicDirectoryKeyFrom(new Uint8Array(33), "x")
    ).rejects.toThrow();
  });

  test("returned pubkey locates the correct registry entry via registryGet", async () => {
    await operatorFs.put("home/testdir/followers/alice/follow/marker.txt", "m");
    const pubkey = await viewerFs.getPublicDirectoryKeyFrom(testdirKey, "followers/alice/follow");
    expect(pubkey).toBeInstanceOf(Uint8Array);
    const prefixed = concatBytes(new Uint8Array([mkeyEd25519]), pubkey!);
    const entry = await api.registryGet(prefixed);
    expect(entry).toBeDefined();
  });
});
