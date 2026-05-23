import { describe, test, expect, beforeEach, vi } from "vitest";
import { FS5 } from "../../src/fs/fs5.js";
import { JSCryptoImplementation } from "../../src/api/crypto/js.js";

/**
 * Directory-metadata cache tests.
 *
 * Build on the stateful, revision-enforcing mock from concurrency.test.ts, but
 * expose `registry`/`blobs` so individual tests can simulate out-of-band changes,
 * vanished entries, and propagating-blob 404s. Reads are counted by spying on
 * `registryGet` and keying by hex public key.
 *
 * Reference (no cache): reading `home/a/x.txt` then `home/b/y.txt` walks
 * root -> home -> a and root -> home -> b, so root and home are each fetched
 * TWICE (6 registryGet, 4 distinct). With the cache, each ancestor is fetched
 * once (4 registryGet, no duplicates).
 */
class RevisionCheckingMockAPI {
  crypto = new JSCryptoImplementation();
  blobs = new Map<string, Uint8Array>();
  registry = new Map<string, any>();

  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = await this.crypto.hashBlake3(data);
    this.blobs.set(Buffer.from(hash).toString("hex"), data);
    return { hash: new Uint8Array([0x1e, ...hash]), size: blob.size };
  }

  async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
    const actual = hash[0] === 0x1e ? hash.slice(1) : hash;
    const data = this.blobs.get(Buffer.from(actual).toString("hex"));
    if (!data) throw new Error("Blob not found");
    return data;
  }

  async registryGet(publicKey: Uint8Array): Promise<any> {
    return this.registry.get(Buffer.from(publicKey).toString("hex"));
  }

  async registrySet(entry: any): Promise<void> {
    const key = Buffer.from(entry.pk).toString("hex");
    const existing = this.registry.get(key);
    if (existing && existing.revision >= entry.revision) {
      throw new Error("Revision number too low");
    }
    this.registry.set(key, entry);
  }
}

class MockIdentity {
  fsRootKey = new Uint8Array(32).fill(42);
}

const hex = (u: Uint8Array) => Buffer.from(u).toString("hex");

/** Spy on registryGet; returns the array of hex public keys queried (live). */
function recordGets(api: RevisionCheckingMockAPI, opts: { delayMs?: number } = {}): string[] {
  const keys: string[] = [];
  const orig = api.registryGet.bind(api);
  vi.spyOn(api, "registryGet").mockImplementation(async (pk: Uint8Array) => {
    keys.push(hex(pk));
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    return orig(pk);
  });
  return keys;
}

/** Read `path` once on a throwaway FS5 and return the registry keys it touched. */
async function keysTouched(api: RevisionCheckingMockAPI, identity: MockIdentity, path: string): Promise<string[]> {
  const probe = new FS5(api as any, identity as any);
  const keys = recordGets(api);
  await probe.get(path).catch(() => undefined);
  vi.restoreAllMocks();
  return [...keys];
}

describe("FS5 directory-metadata cache", () => {
  let api: RevisionCheckingMockAPI;
  let identity: MockIdentity;
  let fs: FS5;

  beforeEach(async () => {
    api = new RevisionCheckingMockAPI();
    identity = new MockIdentity();
    fs = new FS5(api as any, identity as any);
    // Seed a small shared-prefix tree.
    await fs.put("home/a/x.txt", "xdata");
    await fs.put("home/b/y.txt", "ydata");
  });

  // ---- Sub-phase 1.1: cache hit + coalescing ----

  test("shared-ancestor reads fetch each ancestor exactly once", async () => {
    const cold = new FS5(api as any, identity as any);
    const keys = recordGets(api);

    expect(await cold.get("home/a/x.txt")).toBe("xdata");
    expect(await cold.get("home/b/y.txt")).toBe("ydata");

    // No registry key may be fetched more than once across the two reads.
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("in-flight coalescing: concurrent reads share one load per directory", async () => {
    const cold = new FS5(api as any, identity as any);
    const keys = recordGets(api, { delayMs: 5 });

    await Promise.all([cold.get("home/a/x.txt"), cold.get("home/b/y.txt")]);

    const counts = new Map<string, number>();
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const [, n] of counts) expect(n).toBe(1);
  });

  // ---- Sub-phase 1.2: write-path correctness ----

  test("three sequential puts to one dir succeed without a stale revision (live revision read)", async () => {
    // Each put must read the live revision; a stale cached revision would make
    // the second/third put loop on "Revision number too low" and fail.
    await expect(fs.put("home/seq/f.txt", "v1")).resolves.toBeUndefined();
    await expect(fs.put("home/seq/f.txt", "v2")).resolves.toBeUndefined();
    await expect(fs.put("home/seq/f.txt", "v3")).resolves.toBeUndefined();

    expect(await fs.get("home/seq/f.txt")).toBe("v3");
  });

  test("out-of-band revision bump between puts: second put still succeeds", async () => {
    await fs.put("home/seq/f.txt", "v1");
    const seqKey = (await keysTouched(api, identity, "home/seq/f.txt"))[2]; // seq dir key
    const stored = api.registry.get(seqKey);
    api.registry.set(seqKey, { ...stored, revision: stored.revision + 5 });

    await expect(fs.put("home/seq/f.txt", "v2")).resolves.toBeUndefined();
    expect(await fs.get("home/seq/f.txt")).toBe("v2");
  });

  test("read-your-writes: overwrite is visible to a later read", async () => {
    await fs.put("home/f.txt", "v1");
    expect(await fs.get("home/f.txt")).toBe("v1");
    await fs.put("home/f.txt", "v2");
    expect(await fs.get("home/f.txt")).toBe("v2");
  });

  test("per-key invalidation: a write evicts only its own directory key", async () => {
    // Warm both branches on one reused instance.
    await fs.get("home/a/x.txt");
    await fs.get("home/b/y.txt");

    await fs.put("home/a/new.txt", "n"); // writes (and invalidates) only the "a" directory

    const keys = recordGets(api);
    await fs.get("home/b/y.txt"); // sibling: fully cached
    const afterB = keys.length;
    keys.length = 0;
    await fs.get("home/a/x.txt"); // invalidated: must re-fetch the "a" entry
    const afterA = keys.length;

    expect(afterB).toBe(0);
    expect(afterA).toBeGreaterThan(0);
  });

  // ---- Sub-phase 1.3: cache policy (miss / synthetic-404 / TTL) ----

  test("a miss (no registry entry) is not pinned", async () => {
    const cKey = (await keysTouched(api, identity, "home/a/x.txt"))[2]; // "a" dir key
    const saved = api.registry.get(cKey);

    const cold = new FS5(api as any, identity as any);
    api.registry.delete(cKey);
    expect(await cold.get("home/a/x.txt")).toBeUndefined(); // miss

    api.registry.set(cKey, saved);
    expect(await cold.get("home/a/x.txt")).toBe("xdata"); // not pinned to the miss
  });

  test("synthetic empty-dir on blob-404 is not cached", async () => {
    const cold = new FS5(api as any, identity as any);
    let n = 0;
    const orig = api.downloadBlobAsBytes.bind(api);
    vi.spyOn(api, "downloadBlobAsBytes").mockImplementation(async (h: Uint8Array) => {
      n++;
      if (n === 3) throw new Error("404 not found"); // the "a" directory blob on the cold read
      return orig(h);
    });

    expect(await cold.get("home/a/x.txt")).toBeUndefined(); // 404 -> synthetic empty -> file not found
    expect(await cold.get("home/a/x.txt")).toBe("xdata"); // re-downloaded, not served from a pinned empty dir
  });

  test("entries expire after the configured TTL", async () => {
    const ttlFs = new FS5(api as any, identity as any, { directoryCacheTtlMs: 20 } as any);

    const keys = recordGets(api);
    await ttlFs.get("home/a/x.txt"); // cold: populates the cache
    keys.length = 0;
    await ttlFs.get("home/a/x.txt"); // within TTL: served from cache
    const within = keys.length;

    await new Promise((r) => setTimeout(r, 40)); // exceed the 20ms TTL
    keys.length = 0;
    await ttlFs.get("home/a/x.txt"); // expired: must re-fetch
    const afterExpiry = keys.length;

    expect(within).toBe(0);
    expect(afterExpiry).toBeGreaterThan(0);
  });
});
