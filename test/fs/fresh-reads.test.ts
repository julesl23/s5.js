/**
 * P1 fresh reads (beta.56, D5 + owner conditions C5/C6).
 *
 * FS5 caches directory metadata for 30 s (beta.49). Across tabs of one origin that cache is
 * stale by design, so:
 * - reads take `{ fresh: true }` (get / list / getMetadata / pathToCID), reaching EVERY
 *   directory read in the resolution chain, and a fresh read evicts what it proved stale;
 * - every write entry point resolves fresh (no write decides from a cached resolution);
 * - a content-addressed directory-blob cache keeps fresh reads of unchanged directories to a
 *   registry read, with no download.
 *
 * "Tabs" here are two FS5 instances over one coherent mock API: the registry itself is
 * coherent, so only the FS5 directory cache can be stale — which is what these tests isolate.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { FS5 } from "../../src/fs/fs5.js";
import { FS5Advanced } from "../../src/fs/fs5-advanced.js";
import { BatchOperations } from "../../src/fs/utils/batch.js";
import { S5DirectoryLoadError } from "../../src/fs/errors.js";
import { MockIdentity, RevisionCheckingMockAPI, deepKeyHex, stub404ForDir } from "./helpers/revision-mock.js";
import { names, newOriginName, openFsTab } from "./helpers/registry-tabs.js";

function countCalls(api: any, method: string): { n: number; restore: () => void } {
  const c = { n: 0, restore: () => {} };
  const orig = api[method].bind(api);
  api[method] = (...args: any[]) => {
    c.n++;
    return orig(...args);
  };
  c.restore = () => { api[method] = orig; };
  return c;
}

describe("fresh reads and fresh writes (P1 / D5)", () => {
  let api: RevisionCheckingMockAPI;
  let identity: MockIdentity;
  let A: FS5; // the tab whose cache goes stale
  let B: FS5; // the other tab

  beforeEach(async () => {
    api = new RevisionCheckingMockAPI();
    identity = new MockIdentity();
    A = new FS5(api as any, identity as any);
    B = new FS5(api as any, identity as any);
    await A.ensureIdentityInitialized();
    await A.put("home/d/x.txt", "x");
  });

  test("T5.1 get(path, { fresh }) sees a file another tab added to a directory this tab has cached", async () => {
    expect(await A.get("home/d/x.txt")).toBe("x"); // warm A's cache of home/d
    await B.put("home/d/y.txt", "y");

    expect(await A.get("home/d/y.txt")).toBeUndefined(); // default: 30 s cache (by design)
    expect(await A.get("home/d/y.txt", { fresh: true } as any)).toBe("y");
  });

  test("T5.2 list(path, { fresh }) resolves a directory another tab just created", async () => {
    await names(A, "home"); // warm A's cache of home
    await B.put("home/newdir/f.txt", "f");

    await expect(names(A, "home/newdir")).rejects.toThrow(/does not exist/); // stale parent
    expect(await names(A, "home/newdir", { fresh: true })).toEqual(["f.txt"]);
  });

  test("T5.3 getMetadata(path, { fresh }) on a directory another tab deleted → undefined", async () => {
    await B.createDirectory("home", "e");
    const S = new FS5(api as any, identity as any); // a tab that loads after "e" exists
    expect((await S.getMetadata("home/e"))?.type).toBe("directory"); // warm
    expect(await B.delete("home/e")).toBe(true);

    expect((await S.getMetadata("home/e"))?.type).toBe("directory"); // stale
    expect(await (S.getMetadata as any)("home/e", { fresh: true })).toBeUndefined();
  });

  test("T5.4 pathToCID(path, { fresh }) returns the CID of another tab's rewrite", async () => {
    const advA = new FS5Advanced(A);
    const before = await advA.pathToCID("home/d/x.txt");
    await B.put("home/d/x.txt", "rewritten by B");
    const expected = await new FS5Advanced(new FS5(api as any, identity as any)).pathToCID("home/d/x.txt");

    expect(Buffer.from(await advA.pathToCID("home/d/x.txt")).equals(Buffer.from(before))).toBe(true); // stale
    const fresh = await (advA.pathToCID as any)("home/d/x.txt", { fresh: true });
    expect(Buffer.from(fresh).equals(Buffer.from(expected))).toBe(true);
    expect(Buffer.from(fresh).equals(Buffer.from(before))).toBe(false);
  });

  test("T5.5 monotonic: after a fresh read, a default read of the same directory sees the fresh state", async () => {
    await names(A, "home/d"); // warm
    await B.put("home/d/y.txt", "y");

    expect(await names(A, "home/d", { fresh: true })).toEqual(["x.txt", "y.txt"]);
    expect(await A.get("home/d/y.txt")).toBe("y"); // no older than what A just saw
  });

  test("T5.6 a write into a directory another tab just created lands in that directory", async () => {
    await names(A, "home"); // A's cached home has no "x"
    await B.put("home/x/b.txt", "b");

    await expect(A.put("home/x/a.txt", "a")).resolves.toBeUndefined();
    const C = new FS5(api as any, identity as any);
    expect(await names(C, "home/x")).toEqual(["a.txt", "b.txt"]);
  });

  test("T5.7 a write into a directory another tab just deleted re-creates it (never lands unlinked)", async () => {
    await B.createDirectory("home", "z");
    const S = new FS5(api as any, identity as any); // a tab that loads after "z" exists
    await names(S, "home");
    await names(S, "home/z"); // S's cache: home links z, z is empty
    expect(await B.delete("home/z")).toBe(true);

    await S.put("home/z/f.txt", "f");
    const C = new FS5(api as any, identity as any);
    expect(await names(C, "home")).toContain("z");
    expect(await C.get("home/z/f.txt")).toBe("f");
  });

  test("T5.8 a fresh read of an unchanged directory asks the registry but downloads nothing", async () => {
    await names(A, "home/d"); // warm (downloads)
    const reg = countCalls(api, "registryGet");
    const dl = countCalls(api, "downloadBlobAsBytes");
    try {
      expect(await names(A, "home/d", { fresh: true })).toEqual(["x.txt"]);
      expect(reg.n).toBeGreaterThan(0); // it really is fresh
      expect(dl.n).toBe(0); // content-addressed: unchanged directories are not re-downloaded
    } finally {
      reg.restore();
      dl.restore();
    }
  });

  test("T5.9b unchanged ancestors stay cached across a write even when the download path rewrites hash[0] in place (as S5Node does)", async () => {
    // S5Node.downloadBlobAsBytes sets hash[0] = 0x1f on the caller's buffer, which aliases the
    // registry entry's data. A network download and a blob-cache hit then leave different
    // bytes in the entry — the "did this directory change?" check must not see that as change.
    const orig = api.downloadBlobAsBytes.bind(api);
    (api as any).downloadBlobAsBytes = async (hash: Uint8Array) => {
      const lookup = hash.slice(); // the mock indexes by the 0x1e form
      hash[0] = 0x1f; // …while the caller's buffer is rewritten, exactly as S5Node does
      return orig(lookup);
    };
    await A.put("home/b/y.txt", "y");
    const W = new FS5(api as any, identity as any); // cold: its first reads go to the network
    await W.get("home/d/x.txt");
    await W.get("home/b/y.txt"); // warm both branches (slots settle on network-downloaded entries)

    await W.put("home/d/new.txt", "n"); // fresh resolution re-reads root and home

    const reg = countCalls(api, "registryGet");
    try {
      await W.get("home/b/y.txt"); // sibling branch: must still be fully cached
      expect(reg.n).toBe(0);
    } finally {
      reg.restore();
    }
  });

  test("T5.10 a put into an existing directory reads each directory once (O(depth)) and creates nothing", async () => {
    await A.put("home/a/b/c/f0.txt", "0");
    const reg = countCalls(api, "registryGet");
    const mk = vi.spyOn(A, "createDirectory");
    try {
      await A.put("home/a/b/c/f1.txt", "1");
      // root, home, a, b (resolution) + c (the transaction's own read) = 5 ≤ depth(4) + 2
      expect(reg.n).toBeLessThanOrEqual(6);
      expect(mk).not.toHaveBeenCalled();
    } finally {
      reg.restore();
      mk.mockRestore();
    }
  });

  test("T5.12 repair still asks the network: a blob only this instance still holds is repaired, not 'loadable'", async () => {
    await A.put("home/a/x.txt", { v: "ax" });
    expect(await A.get("home/a/x.txt")).toEqual({ v: "ax" }); // A downloads (and may cache) home/a's blob
    const aKey = await deepKeyHex(api, identity, "home", "a");
    const restore = stub404ForDir(api, aKey); // the network lost it
    try {
      const res = await A.repairDirectory("home/a");
      expect(res.repaired).toBe(true);
    } finally {
      restore();
    }
  });

  describe("T5.13 (C5) every remaining write entry point decides from a fresh chain", () => {
    test("createDirectory / createFile into a directory another tab just created", async () => {
      await names(A, "home"); // stale: no "q"
      await B.createDirectory("home", "q");

      await expect(A.createDirectory("home/q", "sub")).resolves.toBeDefined();
      await expect(A.createFile("home/q", "f.txt", { ts: 1, data: "d" })).resolves.toBeDefined();
    });

    test("BatchOperations._ensureDirectory sees a directory another tab just created", async () => {
      await names(A, "home");
      await A.getMetadata("home/q"); // warm: absent
      await B.createDirectory("home", "q");

      const mk = vi.spyOn(A, "createDirectory");
      await expect(new BatchOperations(A)._ensureDirectory("home/q")).resolves.toBeUndefined();
      expect(mk).not.toHaveBeenCalled(); // decided from a fresh read, not from a failed create
      mk.mockRestore();
    });

    test("BatchOperations._ensureDirectory surfaces a typed load error instead of trying to create", async () => {
      const mk = vi.spyOn(A, "createDirectory");
      vi.spyOn(A, "getMetadata").mockRejectedValue(
        new S5DirectoryLoadError("unavailable", { retryable: true, reason: "blob-unavailable" })
      );
      await expect(new BatchOperations(A)._ensureDirectory("home/q")).rejects.toMatchObject({ retryable: true });
      expect(mk).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });

    test("BatchOperations.deleteDirectory (non-recursive) sees a child another tab just added", async () => {
      await B.createDirectory("home", "w");
      const S = new FS5(api as any, identity as any); // a tab that loads after "w" exists
      await names(S, "home/w"); // S's cache: w is empty
      await B.put("home/w/child.txt", "c");

      // The batch API reports "not empty" in its result rather than throwing.
      const result = await new BatchOperations(S).deleteDirectory("home/w", { recursive: false });
      expect(result.success).toBe(0);
      const C = new FS5(api as any, identity as any);
      expect(await names(C, "home")).toContain("w");
      expect(await C.get("home/w/child.txt")).toBe("c");
    });
  });
});

describe("T5.14 only a typed path miss can make a write create directories", () => {
  test("an untyped upstream error that merely mentions 'does not exist' fails the write and creates nothing", async () => {
    const api = new RevisionCheckingMockAPI();
    const identity = new MockIdentity();
    const seed = new FS5(api as any, identity as any);
    await seed.ensureIdentityInitialized();
    await seed.put("home/d/x.txt", "x");

    const cold = new FS5(api as any, identity as any);
    const mk = vi.spyOn(cold, "createDirectory");
    (api as any).downloadBlobAsBytes = async () => {
      throw new Error("upstream: storage bucket does not exist"); // not a 404, not a path miss
    };

    await expect(cold.put("home/d/y.txt", "y")).rejects.toThrow("storage bucket does not exist");
    expect(mk).not.toHaveBeenCalled();
  });
});

describe("T5.11 two tabs creating the same new parent chain at once", () => {
  test("both puts succeed and both files are listed", async () => {
    const origin = newOriginName();
    const blobs = new Map<string, Uint8Array>();
    const identity = new MockIdentity();
    const A = await openFsTab(origin, blobs, identity);
    const B = await openFsTab(origin, blobs, identity);
    await A.fs.ensureIdentityInitialized();
    await names(B.fs, "home"); // both tabs start from the same cached "home"

    await Promise.all([A.fs.put("home/n/x/a.txt", "a"), B.fs.put("home/n/x/b.txt", "b")]);

    const C = await openFsTab(origin, blobs, identity);
    expect(await names(C.fs, "home/n/x")).toEqual(["a.txt", "b.txt"]);
  }, 20000);
});
