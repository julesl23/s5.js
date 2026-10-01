/**
 * P2 — delete() (beta.56, D6).
 *
 * - Nothing to delete ⇒ nothing written: a missing parent used to be CREATED on the way
 *   (the parent walk), re-creating directories another tab had just removed.
 * - Emptiness is judged fresh: a cached "empty" (a child another tab just added) deleted a
 *   non-empty directory; a cached "non-empty" refused a directory that was already empty.
 * - Emptiness includes sharding: a sharded directory's inline maps are always empty, so a
 *   non-empty sharded directory looked empty and was unlinked with its whole subtree.
 * - A directory inside a sharded parent is addressed through the HAMT, not through the
 *   (non-HAMT-aware) path resolver — and one that cannot be read is never judged empty.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { FS5 } from "../../src/fs/fs5.js";
import { isS5DirectoryLoadError } from "../../src/fs/errors.js";
import { MockIdentity, RevisionCheckingMockAPI, deepKeyHex, recordSets } from "./helpers/revision-mock.js";
import { names } from "./helpers/registry-tabs.js";

describe("delete() never writes when there is nothing to delete, and judges emptiness correctly (P2)", () => {
  let api: RevisionCheckingMockAPI;
  let identity: MockIdentity;
  let B: FS5; // the other tab
  const tab = () => new FS5(api as any, identity as any);

  beforeEach(async () => {
    api = new RevisionCheckingMockAPI();
    identity = new MockIdentity();
    B = tab();
    await B.ensureIdentityInitialized();
    await B.put("home/a/x.txt", "x");
  });

  /** Make home/<name> sharded (≥ 1000 entries): 999 planted in one transaction, then one put. */
  async function makeSharded(fs: FS5, name: string, beforeSharding?: () => Promise<void>) {
    await fs.createDirectory("home", name);
    if (beforeSharding) await beforeSharding();
    const uri = await (fs as any)._preprocessLocalPath(`home/${name}`);
    const res = await (fs as any).runTransactionOnDirectory(uri, async (dir: any) => {
      for (let i = 0; dir.files.size + dir.dirs.size < 999; i++) {
        dir.files.set(`planted-${i}.txt`, {
          hash: new Uint8Array(32).fill(i % 251),
          size: 1,
          media_type: "text/plain",
          timestamp: 1,
        });
      }
      return dir;
    });
    res.unwrap();
    await fs.put(`home/${name}/last.txt`, "last"); // the 1000th entry converts it
    const dir = await (fs as any)._loadDirectory(`home/${name}`, { fresh: true });
    expect(dir.header.sharding?.root?.cid).toBeDefined();
  }

  test("T6.1 deleting under a missing parent returns false and writes nothing (the parent is not created)", async () => {
    const sets = recordSets(api);
    try {
      expect(await tab().delete("home/missing/x.txt")).toBe(false);
      expect(sets.keys).toEqual([]);
    } finally {
      sets.restore();
    }
    expect(await tab().getMetadata("home/missing")).toBeUndefined();
  });

  test("T6.2 a directory this tab has cached as empty, but another tab just filled, is not deleted", async () => {
    await B.createDirectory("home", "t");
    const S = tab();
    expect(await names(S, "home/t")).toEqual([]); // S's cache: t is empty
    await B.put("home/t/c.txt", "c");

    expect(await S.delete("home/t")).toBe(false);
    expect(await tab().get("home/t/c.txt")).toBe("c");
  });

  test("T6.3 a directory this tab has cached as non-empty, but another tab just emptied, is deleted", async () => {
    await B.put("home/t/c.txt", "c");
    const S = tab();
    expect(await names(S, "home/t")).toEqual(["c.txt"]); // S's cache: t is non-empty
    expect(await B.delete("home/t/c.txt")).toBe(true);

    expect(await S.delete("home/t")).toBe(true);
    expect(await names(tab(), "home")).not.toContain("t");
  });

  test("T6.4 a non-empty SHARDED directory is never deleted (its inline maps are always empty)", async () => {
    await makeSharded(B, "big");

    expect(await tab().delete("home/big")).toBe(false);
    const C = tab();
    expect(await names(C, "home")).toContain("big");
    expect(await C.get("home/big/last.txt")).toBe("last");
  }, 60000);

  test("T6.5 (revised) a directory inside a sharded parent is never deleted on a guess", async () => {
    // Planned as "an empty directory inside a sharded parent can be deleted". Blocked by a
    // separate pre-existing bug (recorded, not fixed in beta.56): the HAMT leaf encoder keeps
    // only link.type/link.hash of a DirRef, so a child directory's public key is lost when its
    // parent shards and the child can no longer be read. What must hold regardless: a child
    // that cannot be read is never judged empty — nothing is deleted, nothing is written.
    await makeSharded(B, "big", () => B.createDirectory("home/big", "sub").then(() => undefined));
    expect(await names(tab(), "home/big")).toContain("sub");

    const sets = recordSets(api);
    try {
      expect(await tab().delete("home/big/sub")).toBe(false);
      expect(sets.keys).toEqual([]);
    } finally {
      sets.restore();
    }
    expect(await names(tab(), "home/big")).toContain("sub");
  }, 60000);

  test("T6.6 a file delete still works; a parent that cannot be loaded surfaces its retryable error (never 'false')", async () => {
    expect(await tab().delete("home/a/x.txt")).toBe(true);

    await B.put("home/a/y.txt", "y");
    api.registry.delete(await deepKeyHex(api, identity, "home", "a")); // linked, entry unavailable
    const err = await tab().delete("home/a/y.txt").then(
      (v) => { throw new Error(`expected a rejection, got ${v}`); },
      (e) => e
    );
    expect(isS5DirectoryLoadError(err)).toBe(true);
    expect(err.retryable).toBe(true);
  }, 20000);
});
