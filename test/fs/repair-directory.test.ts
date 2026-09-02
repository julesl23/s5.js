import { describe, test, expect, beforeEach } from "vitest";
import { FS5 } from "../../src/fs/fs5.js";
import { isS5DirectoryLoadError } from "../../src/fs/errors.js";
import {
  RevisionCheckingMockAPI,
  MockIdentity,
  hex,
  stub,
  stub404ForDir,
  snapshotRegistry,
  recordSets,
  deepKeyHex,
  childKeyHex,
  rootKeyHex,
  rootWriteKey,
} from "./helpers/revision-mock.js";

/**
 * Path-scoped directory repair (beta.54).
 *
 * beta.50's guard correctly refuses to synthesise an empty directory on a blob
 * 404 — but left no reachable way back for an identity whose blob is genuinely
 * gone. See docs/development/ORPHANED-ROOT-REPAIR-UNREACHABLE.md.
 *
 * Two halves:
 *   1. Attribution — the typed error names the directory that failed (path +
 *      registry public key), without which a path-scoped repair is unusable.
 *   2. repairDirectory(path) — reactive, one directory per call, and it
 *      RE-CHECKS at repair time so a 404 that has since cleared is a no-op.
 */
describe("path-scoped directory repair", () => {
  let api: RevisionCheckingMockAPI;
  let identity: MockIdentity;
  let fs: FS5;

  beforeEach(() => {
    api = new RevisionCheckingMockAPI();
    identity = new MockIdentity();
    fs = new FS5(api as any, identity as any);
  });

  // ---------- Phase 1: the typed error names its target ----------

  describe("error attribution", () => {
    test("a failing READ names the directory that failed, not the requested path", async () => {
      await fs.put("home/fabstir/operators/acme/c.txt", "important");
      const opsKey = await deepKeyHex(api, identity, "home", "fabstir", "operators");
      const restore = stub404ForDir(api, opsKey);

      const cold = new FS5(api as any, identity as any);
      const err: any = await cold.get("home/fabstir/operators/acme/c.txt").then(
        () => { throw new Error("expected get() to reject"); },
        (e) => e
      );
      restore();

      expect(isS5DirectoryLoadError(err)).toBe(true);
      expect(err.retryable).toBe(true);
      // The DIRECTORY that failed — not "home/fabstir/operators/acme/c.txt".
      expect(err.path).toBe("home/fabstir/operators");
      expect(err.publicKey).toBe(opsKey);
    });

    test("a failing WRITE names the failing ancestor", async () => {
      await fs.put("home/fabstir/operators/acme/c.txt", "important");
      const opsKey = await deepKeyHex(api, identity, "home", "fabstir", "operators");
      const restore = stub404ForDir(api, opsKey);

      const cold = new FS5(api as any, identity as any);
      const err: any = await cold
        .put("home/fabstir/operators/summary.txt", "x")
        .then(() => { throw new Error("expected put() to reject"); }, (e) => e);
      restore();

      expect(isS5DirectoryLoadError(err)).toBe(true);
      expect(err.path).toBe("home/fabstir/operators");
      expect(err.publicKey).toBe(opsKey);
    });

    test("a failing ROOT read is attributed to the empty path", async () => {
      await fs.put("home/a.txt", "a");
      const restore = stub404ForDir(api, await rootKeyHex(api, identity));

      const cold = new FS5(api as any, identity as any);
      const err: any = await cold.ensureIdentityInitialized().then(
        () => { throw new Error("expected reject"); },
        (e) => e
      );
      restore();

      expect(isS5DirectoryLoadError(err)).toBe(true);
      expect(err.path).toBe("");
      expect(err.publicKey).toBe(await rootKeyHex(api, identity));
    });

    test("attribution is additive: retryable/code semantics are unchanged", async () => {
      await fs.put("home/a/x.txt", "xdata");
      const aKey = await deepKeyHex(api, identity, "home", "a");
      const restore = stub404ForDir(api, aKey);

      const cold = new FS5(api as any, identity as any);
      const err: any = await cold.get("home/a/x.txt").then(() => null, (e) => e);
      restore();

      expect(err.code).toBe("S5_DIRECTORY_LOAD_ERROR");
      expect(err.retryable).toBe(true);
      expect(typeof err.path).toBe("string");
      expect(typeof err.publicKey).toBe("string");
    });
  });

  // ---------- Phase 3: repairDirectory core ----------

  describe("repairDirectory", () => {
    test("THE safety property: a 404 that has cleared by repair time is a no-op", async () => {
      await fs.put("home/a/x.txt", "xdata");
      const aKey = await deepKeyHex(api, identity, "home", "a");

      // The failure is observed, then resolves before repair is called.
      const restore = stub404ForDir(api, aKey);
      const cold = new FS5(api as any, identity as any);
      const err: any = await cold.get("home/a/x.txt").then(() => null, (e) => e);
      expect(isS5DirectoryLoadError(err)).toBe(true);
      restore(); // propagation catches up

      const before = snapshotRegistry(api);
      const sets = recordSets(api);
      const result = await cold.repairDirectory(err.path);
      sets.restore();

      expect(result).toMatchObject({ repaired: false, reason: "loadable", path: "home/a" });
      expect(sets.keys).toEqual([]);                 // ZERO writes
      expect(snapshotRegistry(api)).toEqual(before); // nothing touched
      expect(await cold.get("home/a/x.txt")).toBe("xdata");
    });

    test("a directory with no registry entry reports 'absent' and writes nothing", async () => {
      await fs.put("home/a/x.txt", "xdata");
      const sets = recordSets(api);
      const result = await fs.repairDirectory("home/never-existed");
      sets.restore();

      expect(result).toMatchObject({ repaired: false, reason: "absent" });
      expect(sets.keys).toEqual([]);
    });

    test("a persistently-404'd directory is repaired: revision +1, only that key written", async () => {
      await fs.put("home/a/x.txt", "xdata");
      const aKey = await deepKeyHex(api, identity, "home", "a");
      const beforeRev = api.registry.get(aKey).revision;

      const restore = stub404ForDir(api, aKey);
      const cold = new FS5(api as any, identity as any);
      const sets = recordSets(api);
      const result: any = await cold.repairDirectory("home/a");
      sets.restore();
      restore();

      expect(result.repaired).toBe(true);
      expect(result.path).toBe("home/a");
      expect(result.publicKey).toBe(aKey);
      expect(result.previousRevision).toBe(beforeRev);
      expect(result.newRevision).toBe(beforeRev + 1);
      expect(api.registry.get(aKey).revision).toBe(beforeRev + 1);
      expect(sets.keys).toEqual([aKey]); // ONLY the repaired directory
    });

    test("repairs at depth even when the target's ancestors are also unloadable", async () => {
      await fs.put("home/fabstir/operators/acme/c.txt", "important");
      const fabstirKey = await deepKeyHex(api, identity, "home", "fabstir");
      const opsKey = await deepKeyHex(api, identity, "home", "fabstir", "operators");
      const opsRev = api.registry.get(opsKey).revision;

      // BOTH the target and its parent 404 — getKeySet cannot address this at all.
      const targets = new Set(
        [fabstirKey, opsKey].map((k) =>
          Buffer.from((api.registry.get(k).data as Uint8Array).slice(1)).toString("hex")
        )
      );
      const restore = stub(api, "downloadBlobAsBytes", (orig) => async (h: Uint8Array) => {
        const a = h[0] === 0x1e ? h.slice(1) : h;
        if (targets.has(Buffer.from(a).toString("hex"))) throw new Error("404 not found");
        return orig(h);
      });

      const cold = new FS5(api as any, identity as any);
      const result: any = await cold.repairDirectory("home/fabstir/operators");
      restore();

      expect(result.repaired).toBe(true);
      expect(result.publicKey).toBe(opsKey);
      expect(api.registry.get(opsKey).revision).toBe(opsRev + 1);
    });

    test("self-healing: after repairing a directory, re-writing a known path re-links the surviving subtree", async () => {
      await fs.put("home/x/y/keep.txt", "survivor");
      const xKey = await deepKeyHex(api, identity, "home", "x");
      const yKey = await deepKeyHex(api, identity, "home", "x", "y");
      const yRevBefore = api.registry.get(yKey).revision;

      const restore = stub404ForDir(api, xKey); // only home/x's own blob is gone
      const cold = new FS5(api as any, identity as any);
      expect((await cold.repairDirectory("home/x")).repaired).toBe(true);
      restore();

      // home/x is now empty — but writing a known path re-links the intact y subtree.
      const fresh = new FS5(api as any, identity as any);
      await fresh.put("home/x/y/new.txt", "added");

      expect(api.registry.get(yKey).revision).toBeGreaterThanOrEqual(yRevBefore);
      expect(await fresh.get("home/x/y/keep.txt")).toBe("survivor"); // original data reachable again
      expect(await fresh.get("home/x/y/new.txt")).toBe("added");
    });

    test("a non-404 load failure is rethrown and never repaired", async () => {
      await fs.put("home/a/x.txt", "xdata");
      const restore = stub(api, "downloadBlobAsBytes", () => async () => {
        throw new Error("connection reset by peer");
      });

      const cold = new FS5(api as any, identity as any);
      const sets = recordSets(api);
      const err: any = await cold.repairDirectory("home/a").then(
        () => { throw new Error("expected repairDirectory to reject"); },
        (e) => e
      );
      sets.restore();
      restore();

      expect(err.message).toContain("connection reset");
      expect(sets.keys).toEqual([]);
    });

    test("root repair re-links the EXISTING home/archive rather than resetting to empty", async () => {
      await fs.put("home/fabstir/operators/acme/c.txt", "important");
      await fs.put("archive/old.txt", "kept");
      await fs.ensureIdentityInitialized();

      const rootKey = await rootKeyHex(api, identity);
      const homeKey = await childKeyHex(api, identity, "home");
      const archiveKey = await childKeyHex(api, identity, "archive");
      const rootRev = api.registry.get(rootKey).revision;
      const homeRev = api.registry.get(homeKey).revision;
      const archiveRev = api.registry.get(archiveKey).revision;

      const restore = stub404ForDir(api, rootKey); // only the ROOT blob is gone
      const cold = new FS5(api as any, identity as any);
      const sets = recordSets(api);
      const result: any = await cold.repairDirectory("");
      sets.restore();
      restore();

      expect(result.repaired).toBe(true);
      expect(result.relinked).toEqual(["home", "archive"]);
      expect(result.previousRevision).toBe(rootRev);
      expect(result.newRevision).toBe(rootRev + 1);

      // Exactly ONE registry write — the root. home/archive were linked, not rewritten.
      expect(sets.keys).toEqual([rootKey]);
      expect(api.registry.get(homeKey).revision).toBe(homeRev);
      expect(api.registry.get(archiveKey).revision).toBe(archiveRev);

      // Lossless: the original data is reachable again.
      const after = new FS5(api as any, identity as any);
      expect(await after.get("home/fabstir/operators/acme/c.txt")).toBe("important");
      expect(await after.get("archive/old.txt")).toBe("kept");
    });

    test("root repair links home even when home's blob is ALSO missing (never republishes it empty)", async () => {
      await fs.put("home/keep.txt", "survivor");
      await fs.ensureIdentityInitialized();

      const rootKey = await rootKeyHex(api, identity);
      const homeKey = await childKeyHex(api, identity, "home");
      const homeRev = api.registry.get(homeKey).revision;

      const gone = new Set(
        [rootKey, homeKey].map((k) =>
          Buffer.from((api.registry.get(k).data as Uint8Array).slice(1)).toString("hex")
        )
      );
      const restore = stub(api, "downloadBlobAsBytes", (orig) => async (h: Uint8Array) => {
        const a = h[0] === 0x1e ? h.slice(1) : h;
        if (gone.has(Buffer.from(a).toString("hex"))) throw new Error("404 not found");
        return orig(h);
      });

      const cold = new FS5(api as any, identity as any);
      const sets = recordSets(api);
      const result: any = await cold.repairDirectory("");
      sets.restore();
      restore();

      expect(result.repaired).toBe(true);
      expect(sets.keys).toEqual([rootKey]);            // home NOT written
      expect(api.registry.get(homeKey).revision).toBe(homeRev);
      // home's data is intact once its blob comes back.
      expect(await new FS5(api as any, identity as any).get("home/keep.txt")).toBe("survivor");
    });

    test("refuses to write when the parent links a key we would not derive", async () => {
      await fs.put("home/a/x.txt", "xdata");

      // Rewrite home's entry for "a" to point at a foreign (externally-linked) key,
      // as an imported/mounted directory would.
      const foreign = new Uint8Array(32).fill(9);
      await (fs as any)._updateDirectory("home", async (d: any) => {
        const ref = d.dirs.get("a");
        d.dirs.set("a", { ...ref, link: { type: "mutable_registry_ed25519", publicKey: foreign } });
        return d;
      });

      const cold = new FS5(api as any, identity as any);
      const sets = recordSets(api);
      const result = await cold.repairDirectory("home/a");
      sets.restore();

      expect(result).toMatchObject({ repaired: false, reason: "not-derivable" });
      expect(sets.keys).toEqual([]);
    });
  });

  // ---------- Phase 5: ensureIdentityInitialized delegates (Findings 1 + 2) ----------

  describe("ensureIdentityInitialized({ repair: true }) — the reported bug", () => {
    let rootKey: string;
    let homeKey: string;
    let archiveKey: string;

    beforeEach(async () => {
      await fs.put("home/fabstir/operators/acme/c.txt", "important");
      await fs.put("archive/old.txt", "kept");
      await fs.ensureIdentityInitialized();
      rootKey = await rootKeyHex(api, identity);
      homeKey = await childKeyHex(api, identity, "home");
      archiveKey = await childKeyHex(api, identity, "archive");
    });

    test("beta.50 regression: a persistently-404'd root blob is now RECOVERABLE with { repair: true }", async () => {
      const rootRev = api.registry.get(rootKey).revision;
      const restore = stub404ForDir(api, rootKey);

      const cold = new FS5(api as any, identity as any);
      const sets = recordSets(api);
      // beta.50 threw here — identically to the plain call — making the remedy
      // named in its own error message unreachable.
      await expect(cold.ensureIdentityInitialized({ repair: true })).resolves.toBeUndefined();
      sets.restore();
      restore();

      expect(sets.keys).toEqual([rootKey]);
      expect(api.registry.get(rootKey).revision).toBe(rootRev + 1);
    });

    test("recovery is lossless — the original subtree is readable afterwards", async () => {
      const restore = stub404ForDir(api, rootKey);
      const cold = new FS5(api as any, identity as any);
      await cold.ensureIdentityInitialized({ repair: true });
      restore();

      const after = new FS5(api as any, identity as any);
      expect(await after.get("home/fabstir/operators/acme/c.txt")).toBe("important");
      expect(await after.get("archive/old.txt")).toBe("kept");
      // And writes work again.
      await after.put("home/fabstir/operators/summary.txt", "new");
      expect(await after.get("home/fabstir/operators/summary.txt")).toBe("new");
    });

    test("the guard is unchanged: WITHOUT repair a 404'd root still throws retryable and writes nothing", async () => {
      const before = snapshotRegistry(api);
      const restore = stub404ForDir(api, rootKey);

      const cold = new FS5(api as any, identity as any);
      const sets = recordSets(api);
      const err: any = await cold.ensureIdentityInitialized().then(
        () => { throw new Error("expected reject"); },
        (e) => e
      );
      sets.restore();
      restore();

      expect(isS5DirectoryLoadError(err)).toBe(true);
      expect(err.retryable).toBe(true);
      expect(sets.keys).toEqual([]);
      expect(snapshotRegistry(api)).toEqual(before);
    });

    test("a transient root 404 that clears before repair is a no-op, not a rebuild", async () => {
      const before = snapshotRegistry(api);
      const restore = stub404ForDir(api, rootKey);
      const cold = new FS5(api as any, identity as any);
      await cold.ensureIdentityInitialized().catch(() => {});
      restore(); // propagation catches up before the operator acts

      const sets = recordSets(api);
      await expect(cold.ensureIdentityInitialized({ repair: true })).resolves.toBeUndefined();
      sets.restore();

      expect(sets.keys).toEqual([]);
      expect(snapshotRegistry(api)).toEqual(before);
    });

    test("home/archive revisions are untouched by the repair", async () => {
      const homeRev = api.registry.get(homeKey).revision;
      const archiveRev = api.registry.get(archiveKey).revision;
      const restore = stub404ForDir(api, rootKey);

      const cold = new FS5(api as any, identity as any);
      await cold.ensureIdentityInitialized({ repair: true });
      restore();

      expect(api.registry.get(homeKey).revision).toBe(homeRev);
      expect(api.registry.get(archiveKey).revision).toBe(archiveRev);
    });
  });
});
