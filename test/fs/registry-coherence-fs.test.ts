/**
 * Same-origin tabs through FS5 (beta.56, change request P0 test 4 + the C1 reproduction).
 *
 * Each tab is a full FS5 with its own registry service and directory cache; tabs share the
 * registry IndexedDB and the blob store, as browser tabs of one origin do. Before beta.56 a
 * tab rebuilt a directory on its own 60 s-cached registry entry and overwrote the newer one
 * another tab had committed — dropping that tab's file (or a whole database directory).
 *
 * No FS5 change is needed for these: once the registry refuses a stale revision,
 * `runTransactionOnDirectory` re-reads and re-applies (a merge, not a lost update).
 */
import { beforeEach, describe, expect, test } from "vitest";
import { MockIdentity } from "./helpers/revision-mock.js";
import { FsTab, names, newOriginName, openFsTab } from "./helpers/registry-tabs.js";

describe("same-origin tabs through FS5 (P0)", () => {
  let origin: string;
  let blobs: Map<string, Uint8Array>;
  let identity: MockIdentity;
  let A: FsTab;
  let B: FsTab;

  const freshTab = () => openFsTab(origin, blobs, identity);

  beforeEach(async () => {
    origin = newOriginName();
    blobs = new Map();
    identity = new MockIdentity();
    A = await openFsTab(origin, blobs, identity);
    B = await openFsTab(origin, blobs, identity);
    await A.fs.ensureIdentityInitialized();
  });

  test("T3.1 (req. 4) A, then B, then A put files into one directory within 60 s: a fresh tab lists all three", async () => {
    await A.fs.put("home/d/a0.txt", "a0");
    await B.fs.put("home/d/b0.txt", "b0");
    await A.fs.put("home/d/a1.txt", "a1");

    const C = await freshTab();
    expect(await names(C.fs, "home/d")).toEqual(["a0.txt", "a1.txt", "b0.txt"]);
  });

  test("T3.2 (C1) A, B, A each create a database directory under one parent: none disappears", async () => {
    await A.fs.put("home/rag/v1/dbA/meta.json", { n: "A" });
    await B.fs.put("home/rag/v1/dbB/meta.json", { n: "B" });
    await A.fs.put("home/rag/v1/dbC/meta.json", { n: "C" });

    const C = await freshTab();
    expect(await names(C.fs, "home/rag/v1")).toEqual(["dbA", "dbB", "dbC"]);
    expect(await C.fs.get("home/rag/v1/dbB/meta.json")).toEqual({ n: "B" });
  });

  test("T3.3 (guard) both tabs' puts into one directory in flight at once: both files survive", async () => {
    await A.fs.put("home/d/seed.txt", "s");
    await B.fs.get("home/d/seed.txt");

    await Promise.all([A.fs.put("home/d/x.txt", "x"), B.fs.put("home/d/y.txt", "y")]);

    const C = await freshTab();
    expect(await names(C.fs, "home/d")).toEqual(["seed.txt", "x.txt", "y.txt"]);
  });
});
