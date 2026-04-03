import { describe, test, expect, beforeEach, vi } from "vitest";
import { FS5 } from "../../src/fs/fs5.js";
import { JSCryptoImplementation } from "../../src/api/crypto/js.js";

/**
 * RevisionCheckingMockAPI — extends SimpleMockAPI pattern but enforces
 * revision checking in registrySet(), mirroring real registry.ts:119-122.
 *
 * Without this, SimpleMockAPI blindly stores entries and concurrency tests
 * would pass even without the mutex (no revision conflict ever thrown).
 */
class RevisionCheckingMockAPI {
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
    const existing = this.registry.get(key);
    // Mirror real registry.ts:119-122
    if (existing && existing.revision >= entry.revision) {
      throw new Error("Revision number too low");
    }
    this.registry.set(key, entry);
  }
}

class SimpleMockIdentity {
  fsRootKey = new Uint8Array(32).fill(42);
}

describe("FS5 Concurrency - Per-Directory Mutex", () => {
  let fs: FS5;
  let api: RevisionCheckingMockAPI;

  beforeEach(() => {
    api = new RevisionCheckingMockAPI();
    const identity = new SimpleMockIdentity();
    fs = new FS5(api as any, identity as any);
  });

  test("two concurrent puts to same directory succeed with strictly increasing revisions", async () => {
    // Track revisions per public key (hex-encoded)
    const revisionsByKey: Map<string, number[]> = new Map();
    const originalRegistrySet = api.registrySet.bind(api);
    vi.spyOn(api, "registrySet").mockImplementation(async (entry: any) => {
      const key = Buffer.from(entry.pk).toString("hex");
      if (!revisionsByKey.has(key)) revisionsByKey.set(key, []);
      revisionsByKey.get(key)!.push(entry.revision);
      return originalRegistrySet(entry);
    });

    // Two concurrent puts targeting the same directory ("home")
    const [res1, res2] = await Promise.all([
      fs.put("home/a.txt", "content-a"),
      fs.put("home/b.txt", "content-b"),
    ]);

    // Both should succeed (no thrown errors)
    expect(res1).toBeUndefined();
    expect(res2).toBeUndefined();

    // For each registry key, revision numbers should be strictly increasing.
    // Without the mutex, the "home" directory key would see duplicate revisions
    // like [1, 1, 2] instead of [1, 2, 3].
    for (const [, revisions] of revisionsByKey) {
      for (let i = 1; i < revisions.length; i++) {
        expect(revisions[i]).toBeGreaterThan(revisions[i - 1]);
      }
      const unique = new Set(revisions);
      expect(unique.size).toBe(revisions.length);
    }
  });

  test("error inside locked section does not block subsequent put", async () => {
    let callCount = 0;
    const originalRegistrySet = api.registrySet.bind(api);
    vi.spyOn(api, "registrySet").mockImplementation(async (entry: any) => {
      callCount++;
      // First registrySet call throws a non-revision error (network error).
      // This happens inside the locked section of runTransactionOnDirectory.
      if (callCount === 1) {
        throw new Error("network error");
      }
      return originalRegistrySet(entry);
    });

    // First put should fail (network error on first registrySet,
    // then revision conflict on retries since blob changed)
    const result1 = await fs.put("home/a.txt", "content-a").catch((e: any) => e);
    // It either throws or returns a DirectoryTransactionResult with error
    // Either way, the lock must be released.

    // Second put to SAME directory should succeed — proves lock was released
    await expect(fs.put("home/b.txt", "content-b")).resolves.toBeUndefined();
  });
});
