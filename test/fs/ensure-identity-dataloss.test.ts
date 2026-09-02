import { describe, test, expect, beforeEach } from "vitest";
import { FS5 } from "../../src/fs/fs5.js";
import { DirectoryWalker } from "../../src/fs/utils/walker.js";
import { BatchOperations } from "../../src/fs/utils/batch.js";
import { FS5Advanced } from "../../src/fs/fs5-advanced.js";
import { isS5DirectoryLoadError, as404DirLoadError, S5DirectoryLoadError } from "../../src/fs/errors.js";
import {
  RevisionCheckingMockAPI,
  MockIdentity,
  hex,
  stub,
  snapshotRegistry,
  rootWriteKey,
  rootKeyHex,
  childKeyHex,
  deepKeyHex,
  stub404ForDir,
  recordSets,
  seedEmptyRoot,
} from "./helpers/revision-mock.js";

/**
 * Regression tests for the ensureIdentityInitialized data-loss bug.
 *
 * A transient 404 on the root (or any known) directory blob used to be returned
 * as a *synthetic empty directory*. ensureIdentityInitialized then saw
 * home/archive "missing" and re-published them empty at a valid next revision,
 * silently orphaning the entire user subtree.
 *
 * The fix is three independent layers:
 *   B - _fetchDirectoryMetadata throws a retryable S5DirectoryLoadError on a 404
 *       of a known directory, instead of synthesizing an empty dir.
 *   A - ensureIdentityInitialized only (re)creates home/archive for a genuinely
 *       new root; an existing-but-incomplete root throws a NON-retryable error
 *       unless { repair: true } is passed.
 *   C - _createDirectory refuses to overwrite an existing non-empty (or
 *       unconfirmable) directory with a fresh empty blob.
 *
 * Mock mirrors the revision-enforcing one from directory-metadata-cache.test.ts.
 */

describe("ensureIdentityInitialized data-loss protection", () => {
  let api: RevisionCheckingMockAPI;
  let identity: MockIdentity;
  let fs: FS5;

  beforeEach(() => {
    api = new RevisionCheckingMockAPI();
    identity = new MockIdentity();
    fs = new FS5(api as any, identity as any);
  });

  // ---------- Fix B: 404 of a known directory is retryable, not "empty" ----------

  describe("Fix B — transient 404 of a known directory", () => {
    beforeEach(async () => {
      await fs.put("home/a/x.txt", "xdata");
      await fs.put("home/b/y.txt", "ydata");
    });

    test("a 404 on a known directory throws a retryable S5DirectoryLoadError (not undefined)", async () => {
      const cold = new FS5(api as any, identity as any);
      const restore = stub(api, "downloadBlobAsBytes", (orig) => {
        let n = 0;
        return async (h: Uint8Array) => {
          n++;
          if (n === 3) throw new Error("404 not found"); // the "a" directory blob
          return orig(h);
        };
      });

      const err = await cold.get("home/a/x.txt").then(
        () => { throw new Error("expected get() to reject"); },
        (e) => e
      );
      expect(isS5DirectoryLoadError(err)).toBe(true);
      expect(err.retryable).toBe(true);
      restore();
    });

    test("a genuinely-absent directory (no registry entry) still returns undefined", async () => {
      // Remove the "a" directory's registry entry entirely (genuine absence).
      // Find it by reading once and capturing the third key touched.
      const probe = new FS5(api as any, identity as any);
      const touched: string[] = [];
      const restoreGet = stub(api, "registryGet", (orig) => async (pk: Uint8Array) => {
        touched.push(hex(pk));
        return orig(pk);
      });
      await probe.get("home/a/x.txt");
      restoreGet();
      const aRegKey = touched[2];
      api.registry.delete(aRegKey);

      const cold = new FS5(api as any, identity as any);
      expect(await cold.get("home/a/x.txt")).toBeUndefined();
    });

    test("write path recovers when a transient 404 clears on retry", async () => {
      const homeAKey = await deepKeyHex(api, identity, "home", "a");
      const beforeRev = api.registry.get(homeAKey).revision;

      const cold = new FS5(api as any, identity as any);
      const restore = stub(api, "downloadBlobAsBytes", (orig) => {
        let failed = false;
        return async (h: Uint8Array) => {
          if (!failed) {
            failed = true;
            throw new Error("404 not found"); // fail the very first load once
          }
          return orig(h);
        };
      });

      // The transaction retry loop must swallow the transient 404 and complete —
      // a wipe or a surfaced error would both be failures here.
      await expect(cold.put("home/a/z.txt", "zdata")).resolves.toBeUndefined();
      restore();

      // The write landed: home/a's registry entry advanced past its prior revision.
      expect(api.registry.get(homeAKey).revision).toBeGreaterThan(beforeRev);
    });
  });

  // ---------- Fix A: ensureIdentityInitialized never recreates over an existing root ----------

  describe("Fix A — ensureIdentityInitialized", () => {
    test("THE regression: root blob 404 must NOT overwrite home/archive, and must throw retryable", async () => {
      await fs.put("home/fabstir/operators/acme/content.txt", "important");
      await fs.put("archive/old.txt", "kept");

      const before = snapshotRegistry(api);
      const homeKey = await childKeyHex(api, identity, "home");
      const archiveKey = await childKeyHex(api, identity, "archive");

      const cold = new FS5(api as any, identity as any);
      const restoreDl = stub(api, "downloadBlobAsBytes", (orig) => {
        let n = 0;
        return async (h: Uint8Array) => {
          n++;
          if (n === 1) throw new Error("404 not found"); // the ROOT blob loads first
          return orig(h);
        };
      });
      const sets = recordSets(api);

      const err = await cold.ensureIdentityInitialized().then(
        () => { throw new Error("expected ensureIdentityInitialized to reject"); },
        (e) => e
      );

      // Retryable error surfaced — caller can retry the connect, not a silent success.
      expect(isS5DirectoryLoadError(err)).toBe(true);
      expect(err.retryable).toBe(true);

      // No write to home/archive — and in fact no registry mutation at all.
      expect(sets.keys).not.toContain(homeKey);
      expect(sets.keys).not.toContain(archiveKey);
      expect(snapshotRegistry(api)).toEqual(before);

      sets.restore();
      restoreDl();
    });

    test("a genuinely new identity initialises home and archive", async () => {
      const fresh = new MockIdentity(7);
      const freshFs = new FS5(api as any, fresh as any);

      await expect(freshFs.ensureIdentityInitialized()).resolves.toBeUndefined();

      expect(api.registry.has(await rootKeyHex(api, fresh))).toBe(true);
      expect(api.registry.has(await childKeyHex(api, fresh, "home"))).toBe(true);
      expect(api.registry.has(await childKeyHex(api, fresh, "archive"))).toBe(true);
    });

    test("partial root (home present, archive missing) heals the missing one without overwriting home", async () => {
      // A `put` under home before init ran leaves root with `home` but no `archive`.
      const partial = new MockIdentity(11);
      const pfs = new FS5(api as any, partial as any);
      await pfs.put("home/x.txt", "data"); // creates root + home, NOT archive

      const homeKey = await childKeyHex(api, partial, "home");
      const archiveKey = await childKeyHex(api, partial, "archive");
      const homeRevBefore = api.registry.get(homeKey).revision;
      expect(api.registry.has(archiveKey)).toBe(false); // archive genuinely absent

      await expect(pfs.ensureIdentityInitialized()).resolves.toBeUndefined();

      // The missing archive was created; home was NOT overwritten (revision unchanged).
      expect(api.registry.has(archiveKey)).toBe(true);
      expect(api.registry.get(homeKey).revision).toBe(homeRevBefore);
    });

    test("already-initialised identity is a no-op (no registry writes)", async () => {
      await fs.put("home/a.txt", "a");
      // Ensure the full home/archive scaffold exists.
      await fs.ensureIdentityInitialized();

      const cold = new FS5(api as any, identity as any);
      const sets = recordSets(api);
      await expect(cold.ensureIdentityInitialized()).resolves.toBeUndefined();
      expect(sets.keys).toEqual([]);
      sets.restore();
    });

    test("existing-but-incomplete root throws a NON-retryable error and does not overwrite", async () => {
      await seedEmptyRoot(api, identity, 5); // root exists, loads fine, but is empty
      const before = snapshotRegistry(api);

      const cold = new FS5(api as any, identity as any);
      const err = await cold.ensureIdentityInitialized().then(
        () => { throw new Error("expected reject"); },
        (e) => e
      );
      expect(isS5DirectoryLoadError(err)).toBe(true);
      expect(err.retryable).toBe(false);
      expect(snapshotRegistry(api)).toEqual(before);
    });

    test("incomplete root heals with { repair: true }", async () => {
      await seedEmptyRoot(api, identity, 5);

      const cold = new FS5(api as any, identity as any);
      await expect(cold.ensureIdentityInitialized({ repair: true })).resolves.toBeUndefined();

      expect(api.registry.has(await childKeyHex(api, identity, "home"))).toBe(true);
      expect(api.registry.has(await childKeyHex(api, identity, "archive"))).toBe(true);
    });

    test("a transient root registry MISS that resolves on retry must NOT recreate home/archive (no orphan)", async () => {
      // Existing, fully-initialised identity.
      await fs.put("home/data.txt", "x");
      await fs.ensureIdentityInitialized();
      const before = snapshotRegistry(api);
      const homeKey = await childKeyHex(api, identity, "home");
      const rootKey = await rootKeyHex(api, identity);

      // registryGet(root) returns undefined the FIRST time (transient lookup
      // miss), then the real entry — exactly the DHT absent-vs-unavailable
      // ambiguity. Treating the first miss as "new identity" would recreate
      // home/archive empty and orphan the data.
      let n = 0;
      const restoreGet = stub(api, "registryGet", (orig) => async (pk: Uint8Array) => {
        if (hex(pk) === rootKey) {
          n++;
          if (n === 1) return undefined; // first lookup "times out"
        }
        return orig(pk);
      });
      const cold = new FS5(api as any, identity as any);
      const sets = recordSets(api);

      await expect(cold.ensureIdentityInitialized()).resolves.toBeUndefined();

      sets.restore();
      restoreGet();

      // The bounded retry resolved the root → no recreation, no overwrite.
      expect(sets.keys).not.toContain(homeKey);
      expect(snapshotRegistry(api)).toEqual(before);
    });
  });

  // ---------- Fix C: _createDirectory never overwrites a live directory ----------

  describe("Fix C — _createDirectory write-site guard", () => {
    test("returns the existing ref instead of overwriting a non-empty directory", async () => {
      await fs.put("home/a/x.txt", "xdata"); // home is now non-empty
      const homeKey = await childKeyHex(api, identity, "home");
      const beforeRev = api.registry.get(homeKey).revision;

      const ref = await (fs as any)._createDirectory("home", rootWriteKey(api, identity));

      expect(ref?.link?.type).toBe("mutable_registry_ed25519");
      // Revision unchanged — no empty blob republished over the populated home.
      expect(api.registry.get(homeKey).revision).toBe(beforeRev);
      expect(await fs.get("home/a/x.txt")).toBe("xdata");
    });

    test("refuses (retryable) when the existing directory's blob 404s", async () => {
      await fs.put("home/a/x.txt", "xdata");

      const restore = stub(api, "downloadBlobAsBytes", () => async () => {
        throw new Error("404 not found"); // home blob can't be confirmed
      });

      const err = await (fs as any)
        ._createDirectory("home", rootWriteKey(api, identity))
        .then(() => { throw new Error("expected reject"); }, (e: any) => e);
      expect(isS5DirectoryLoadError(err)).toBe(true);
      expect(err.retryable).toBe(true);
      restore();
    });

    test("creates normally when the target key has no existing entry", async () => {
      const ref = await (fs as any)._createDirectory("brandnew", rootWriteKey(api, identity));
      expect(ref?.link?.type).toBe("mutable_registry_ed25519");
      const key = await childKeyHex(api, identity, "brandnew");
      expect(api.registry.get(key).revision).toBe(1);
    });
  });

  // ---------- Consumer-path propagation: the typed retryable error must reach
  // WRITE callers and the DirectoryWalker, not be swallowed/opaque. ----------

  describe("retryable error propagation to consumers", () => {
    test("a write (put) rejects with the typed retryable error — not an opaque wrapper — on a persistent ancestor 404, and does not wipe", async () => {
      await fs.put("home/a/x.txt", "xdata");
      const homeAKey = await deepKeyHex(api, identity, "home", "a");
      const before = api.registry.get(homeAKey).revision;

      const restore = stub404ForDir(api, homeAKey); // home/a blob persistently 404s

      const err = await fs.put("home/a/new.txt", "data").then(
        () => { throw new Error("expected put to reject"); },
        (e: any) => e
      );
      restore();

      // The typed marker survives through DirectoryTransactionResult.unwrap().
      expect(isS5DirectoryLoadError(err)).toBe(true);
      expect(err.retryable).toBe(true);
      // And the persistent 404 never overwrote home/a (no wipe).
      expect(api.registry.get(homeAKey).revision).toBe(before);
    });

    test("DirectoryWalker surfaces a retryable subtree 404 instead of silently skipping it", async () => {
      await fs.put("home/a/x.txt", "xdata");
      await fs.put("home/b/y.txt", "ydata");
      const homeAKey = await deepKeyHex(api, identity, "home", "a");

      const restore = stub404ForDir(api, homeAKey); // home/a blob persistently 404s

      const walker = new DirectoryWalker(fs as any, "home");
      const err = await (async () => {
        try {
          for await (const _ of walker.walk({ recursive: true })) { /* drain */ }
          return null;
        } catch (e) {
          return e;
        }
      })();
      restore();

      expect(isS5DirectoryLoadError(err)).toBe(true);
      expect((err as any).retryable).toBe(true);
    });

    test("BatchOperations.deleteDirectory rejects (retryable) on a subtree 404 instead of reporting clean success", async () => {
      await fs.put("home/a/x.txt", "xdata");
      await fs.put("home/b/y.txt", "ydata");
      const homeAKey = await deepKeyHex(api, identity, "home", "a");

      const restore = stub404ForDir(api, homeAKey);
      const batch = new BatchOperations(fs as any);
      const err = await batch.deleteDirectory("home").then(() => null, (e: any) => e);
      restore();

      // Must NOT return a {failed:0, errors:[]} result that hides the unreadable subtree.
      expect(isS5DirectoryLoadError(err)).toBe(true);
      expect((err as any).retryable).toBe(true);
    });

    test("BatchOperations.copyDirectory rejects (retryable) on a subtree 404 instead of reporting clean success", async () => {
      await fs.put("home/a/x.txt", "xdata");
      await fs.put("home/b/y.txt", "ydata");
      const homeAKey = await deepKeyHex(api, identity, "home", "a");

      const restore = stub404ForDir(api, homeAKey);
      const batch = new BatchOperations(fs as any);
      const err = await batch.copyDirectory("home", "archive/backup").then(() => null, (e: any) => e);
      restore();

      expect(isS5DirectoryLoadError(err)).toBe(true);
      expect((err as any).retryable).toBe(true);
    });

    test("FS5Advanced.cidToPath surfaces a retryable subtree 404 instead of returning a false 'not found'", async () => {
      await fs.put("home/a/x.txt", "xdata");
      const homeAKey = await deepKeyHex(api, identity, "home", "a");
      const advanced = new FS5Advanced(fs as any);
      const unknownCid = new Uint8Array(32).fill(7); // forces a full tree walk into home/a

      const restore = stub404ForDir(api, homeAKey);
      const outcome = await advanced.cidToPath(unknownCid).then(
        (v) => ({ resolved: v }),
        (e: any) => ({ error: e })
      );
      restore();

      // Must reject with the typed retryable error, NOT resolve to null ("not found").
      expect((outcome as any).error).toBeDefined();
      expect(isS5DirectoryLoadError((outcome as any).error)).toBe(true);
      expect((outcome as any).error.retryable).toBe(true);
    });

    test("a present file whose CONTENT blob transiently 404s throws retryable (not treated as absent)", async () => {
      await fs.put("home/f.txt", "filedata");
      // 404 the file's content blob (the FileRef exists, so this is "unavailable",
      // not "absent" — distinct from a missing file which returns undefined).
      const homeDir = await (fs as any)._loadDirectory("home");
      const fileHashHex = Buffer.from(homeDir.files.get("f.txt").hash).toString("hex");
      const restore = stub(api, "downloadBlobAsBytes", (orig) => async (h: Uint8Array) => {
        const actual = h[0] === 0x1e ? h.slice(1) : h;
        if (Buffer.from(actual).toString("hex") === fileHashHex) throw new Error("404 not found");
        return orig(h);
      });

      const err = await fs.get("home/f.txt").then(() => null, (e: any) => e);
      restore();

      expect(isS5DirectoryLoadError(err)).toBe(true);
      expect((err as any).retryable).toBe(true);

      // A genuinely-absent file still returns undefined (not a throw).
      expect(await fs.get("home/does-not-exist.txt")).toBeUndefined();
    });
  });

  // ---------- as404DirLoadError: gives HAMT shard/internal-node blob 404s the
  // same retryable typing as directory-metadata 404s. ----------

  describe("as404DirLoadError (HAMT blob 404 typing)", () => {
    test("converts a 404 / not-found error to a retryable S5DirectoryLoadError", () => {
      for (const m of ["Blob not found: 404 not found", "not found", "HTTP 404"]) {
        const out = as404DirLoadError(new Error(m), "HAMT node");
        expect(isS5DirectoryLoadError(out)).toBe(true);
        expect((out as any).retryable).toBe(true);
      }
    });

    test("passes a non-404 error through unchanged", () => {
      const e = new Error("decode failed: bad CBOR");
      expect(as404DirLoadError(e)).toBe(e);
    });

    test("returns an already-typed S5DirectoryLoadError unchanged (no double-wrap)", () => {
      const e = new S5DirectoryLoadError("x", { retryable: false });
      expect(as404DirLoadError(e)).toBe(e);
    });
  });
});
