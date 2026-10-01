/**
 * P1 "no answer" through FS5 (beta.56, D3a + D3b + D4, owner conditions C1–C4).
 *
 * - D3a: a registry read that NO peer could answer (no local entry, zero connected peers) is
 *   "unavailable", never "absent" → S5DirectoryLoadError { retryable, reason: 'registry-unavailable' }.
 * - D3b: a directory reached through its parent's DirRef was published before it was linked,
 *   so a registry miss for it is "unavailable", never "absent"
 *   → S5DirectoryLoadError { retryable, reason: 'entry-unavailable' }. Reads AND writes.
 * - C1: neither failure may use the wording sdk-core reads as certain absence
 *   (`Directory "…" does not exist`, `Path not found`).
 * - C2: a child the parent does not link still throws `Directory "…" does not exist`.
 *
 * Devices/tabs: `X` writes with a connected peer; `Y` reads the same registry DB (a second
 * tab of the origin) or, with zero peers, stands in for an offline tab.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { FS5 } from "../../src/fs/fs5.js";
import { FS5Advanced } from "../../src/fs/fs5-advanced.js";
import { isS5DirectoryLoadError } from "../../src/fs/errors.js";
import { S5RegistryUnavailableError } from "../../src/node/errors.js";
import {
  MockIdentity,
  RevisionCheckingMockAPI,
  deepKeyHex,
  hex,
  snapshotRegistry,
  stub,
} from "./helpers/revision-mock.js";
import {
  FsTab,
  deleteRegistryEntry,
  names,
  newOriginName,
  openFsTab,
  storedRevision,
} from "./helpers/registry-tabs.js";

const CERTAIN_ABSENCE = /does not exist|Path not found|same name/;

/** Await a promise that must reject; return the rejection. */
async function rejection(p: Promise<unknown>): Promise<any> {
  return p.then(
    (v) => { throw new Error(`expected a rejection, got ${String(v)}`); },
    (e) => e
  );
}

function expectUnavailable(err: any, reason: string) {
  expect(isS5DirectoryLoadError(err)).toBe(true);
  expect(err.retryable).toBe(true);
  expect(err.reason).toBe(reason);
  expect(String(err.message)).not.toMatch(CERTAIN_ABSENCE);
}

describe("registry unavailable / linked entry unavailable (P1)", () => {
  let origin: string;
  let blobs: Map<string, Uint8Array>;
  let identity: MockIdentity;
  let X: FsTab;
  let aKey: string;

  beforeEach(async () => {
    origin = newOriginName();
    blobs = new Map();
    identity = new MockIdentity();
    X = await openFsTab(origin, blobs, identity);
    await X.fs.ensureIdentityInitialized();
    await X.fs.put("home/a/x.txt", "xdata");
    aKey = await deepKeyHex(X.api as any, identity, "home", "a");
  });

  test("T4.4 (D3a) an own-tree directory nobody could be asked about: list/get reject retryable 'registry-unavailable'", async () => {
    await deleteRegistryEntry(X.store, aKey); // this origin never received home/a's entry
    const Y = await openFsTab(origin, blobs, identity, 0); // …and has no peer to ask

    expectUnavailable(await rejection(names(Y.fs, "home/a")), "registry-unavailable");
    expectUnavailable(await rejection(Y.fs.get("home/a/x.txt")), "registry-unavailable");
  });

  test("T4.5 (D3a) ensureIdentityInitialized with the root unreadable and no peer: rejects retryable, writes nothing", async () => {
    const fresh = await openFsTab(newOriginName(), new Map(), new MockIdentity(9), 0);

    expectUnavailable(await rejection(fresh.fs.ensureIdentityInitialized()), "registry-unavailable");
    expect(fresh.api.sets).toEqual([]); // never concluded "new identity"
  });

  test("T4.6 (D3b, C1) a linked directory with no registry entry: get/list/getMetadata/pathToCID reject 'entry-unavailable'", async () => {
    await deleteRegistryEntry(X.store, aKey);
    const Y = await openFsTab(origin, blobs, identity, 1); // connected, but the peer stays silent

    expectUnavailable(await rejection(Y.fs.get("home/a/x.txt")), "entry-unavailable");
    expectUnavailable(await rejection(names(Y.fs, "home/a")), "entry-unavailable");
    expectUnavailable(await rejection(Y.fs.getMetadata("home/a")), "entry-unavailable");
    expectUnavailable(await rejection(Y.fs.getMetadata("home/a/x.txt")), "entry-unavailable");
    expectUnavailable(await rejection(new FS5Advanced(Y.fs).pathToCID("home/a/x.txt")), "entry-unavailable");
  });

  test("T4.7 (D3b, C3) put into a linked directory with no registry entry: rejects retryable and never writes that key", async () => {
    await deleteRegistryEntry(X.store, aKey);
    const Y = await openFsTab(origin, blobs, identity, 1);

    expectUnavailable(await rejection(Y.fs.put("home/a/new.txt", "n")), "entry-unavailable");
    expect(Y.api.sets).not.toContain(aKey);
    expect(await storedRevision(Y.store, aKey)).toBeUndefined(); // not rebuilt as an empty rev 1
  }, 15000);

  test("T4.8 (C2) genuine absence is exactly as before", async () => {
    const Y = await openFsTab(origin, blobs, identity, 1);
    await expect(Y.fs.get("home/unlinked/x.txt")).rejects.toThrow(/Directory ".*" does not exist/);
    await expect(names(Y.fs, "home/unlinked")).rejects.toThrow(/Directory ".*" does not exist/);
    expect(await Y.fs.getMetadata("home/unlinked")).toBeUndefined();
    expect(await Y.fs.get("home/a/nope.txt")).toBeUndefined();
  });

  test("T4.10 (D3a) creating a NEW directory with no peer refuses retryably and writes nothing", async () => {
    const Y = await openFsTab(origin, blobs, identity, 0);
    const homeKey = await deepKeyHex(X.api as any, identity, "home");
    const homeRev = await storedRevision(Y.store, homeKey);

    expectUnavailable(await rejection(Y.fs.put("home/newdir/f.txt", "f")), "registry-unavailable");
    expect(Y.api.sets).toEqual([]);
    expect(await storedRevision(Y.store, homeKey)).toBe(homeRev);
  }, 15000);

  test("T4.10b cross-identity public reads keep their best-effort contract with no peer (undefined, no throw)", async () => {
    const Y = await openFsTab(origin, blobs, identity, 0);
    const stranger = new Uint8Array(32).fill(0x55);
    expect(await Y.fs.readFromPublicDirectory(stranger, "a/b.txt")).toBeUndefined();
    expect(await Y.fs.getPublicDirectoryKeyFrom(stranger, "a")).toBeUndefined();
  });

  test("T4.12 (C4) with no peer, a put into an EXISTING directory still works", async () => {
    const Y = await openFsTab(origin, blobs, identity, 0);
    await Y.fs.put("home/a/y.txt", "ydata");
    const Z = await openFsTab(origin, blobs, identity, 1);
    expect(await names(Z.fs, "home/a")).toEqual(["x.txt", "y.txt"]);
  });

  test("T4.13 (C3) put under a linked directory whose entry is missing: retryable, zero writes, nothing re-created", async () => {
    await X.fs.put("home/a/b/deep.txt", "d");
    await deleteRegistryEntry(X.store, aKey);
    const bKey = await deepKeyHex(X.api as any, identity, "home", "a", "b");
    const bRev = await storedRevision(X.store, bKey);
    const Y = await openFsTab(origin, blobs, identity, 1);

    expectUnavailable(await rejection(Y.fs.put("home/a/b/f.txt", "f")), "entry-unavailable");
    expect(Y.api.sets).toEqual([]);
    expect(await storedRevision(Y.store, aKey)).toBeUndefined();
    expect(await storedRevision(Y.store, bKey)).toBe(bRev);
  }, 20000);
});

describe("repair only repairs blobs (D4)", () => {
  test("T4.9 a diagnostic read that is registry-unavailable never becomes a rebuild, even if the entry shows up right after", async () => {
    const api = new RevisionCheckingMockAPI();
    const identity = new MockIdentity();
    const fs = new FS5(api as any, identity as any);
    await fs.ensureIdentityInitialized();
    await fs.put("home/a/x.txt", "xdata");
    const aKey = await deepKeyHex(api, identity, "home", "a");
    const before = snapshotRegistry(api);

    // The diagnostic read (asks with requireAnswer) cannot reach anyone; the follow-up
    // plain registryGet then finds the entry — the race that must not trigger a rebuild.
    const restore = stub(api, "registryGet", (orig) => async (pk: Uint8Array, opts?: any) => {
      if (hex(pk) === aKey && opts?.requireAnswer) {
        throw new S5RegistryUnavailableError("test: no peer", { publicKey: aKey });
      }
      return orig(pk);
    });
    const cold = new FS5(api as any, identity as any);
    const err = await rejection(cold.repairDirectory("home/a"));
    restore();

    expectUnavailable(err, "registry-unavailable");
    expect(snapshotRegistry(api)).toEqual(before);
  });
});

describe("message discipline (C1)", () => {
  test("T4.11 the registry-unavailable error never uses certain-absence wording", () => {
    const e = new S5RegistryUnavailableError("x", {});
    expect(e.message).not.toMatch(CERTAIN_ABSENCE);
    const e2 = new S5RegistryUnavailableError(undefined, {});
    expect(e2.message).not.toMatch(CERTAIN_ABSENCE);
    expect(e2.message.length).toBeGreaterThan(0);
  });
});
