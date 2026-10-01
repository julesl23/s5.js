/**
 * Registry coherence across tabs of one origin (beta.56, change request P0).
 *
 * Every tab has its own `S5RegistryService` with a 60 s `recentWrites` cache, and all tabs
 * share one IndexedDB registry store. Before beta.56 a tab answered reads of a key it wrote
 * in the last 60 s from that cache, checked its own writes against it too, and wrote in a
 * separate transaction from the check — so a newer entry another tab committed was invisible
 * to it and got overwritten (the lost update).
 *
 * Required behaviour: the higher revision wins wherever it is, and the check and the write
 * are one step.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { createRegistryEntry, deserializeRegistryEntry, serializeRegistryEntry, RegistryEntry } from "../../src/registry/entry.js";
import { S5RegistryService } from "../../src/node/registry.js";
import { P2P } from "../../src/node/p2p.js";
import { crypto, newOriginName, openRegistryTab, makeP2PStub } from "../fs/helpers/registry-tabs.js";

const seed = new Uint8Array(32).fill(7);

async function entry(revision: number, tag: number): Promise<RegistryEntry> {
  const kp = await crypto.newKeyPairEd25519(seed);
  return createRegistryEntry(kp, new Uint8Array([tag]), revision, crypto);
}

async function stored(tab: { store: any }, pk: Uint8Array): Promise<{ revision: number; tag: number } | undefined> {
  const raw = await tab.store.get(pk);
  if (!raw) return undefined;
  const e = deserializeRegistryEntry(raw);
  return { revision: e.revision, tag: e.data[0] };
}

describe("registry coherence across tabs (P0)", () => {
  test("T2.1 (req. 1) a newer entry another tab committed wins over this tab's cached older write", async () => {
    const origin = newOriginName();
    const A = await openRegistryTab(origin);
    const B = await openRegistryTab(origin);

    await B.registry.put(await entry(4, 0xb), true);
    await A.registry.put(await entry(5, 0xa), true);

    const got = await B.registry.get((await entry(5, 0)).pk);
    expect(got?.revision).toBe(5);
    expect(got?.data[0]).toBe(0xa);
  });

  test("T2.2 (req. 2) a put built on a stale revision is refused and the other tab's entry survives", async () => {
    const origin = newOriginName();
    const A = await openRegistryTab(origin);
    const B = await openRegistryTab(origin);

    await B.registry.put(await entry(4, 0xb), true);
    await A.registry.put(await entry(5, 0xa), true);

    // B still believes rev 4 is current and publishes its own rev 5.
    await expect(B.registry.put(await entry(5, 0xb), true)).rejects.toThrow("Revision number too low");
    expect(await stored(A, (await entry(5, 0)).pk)).toEqual({ revision: 5, tag: 0xa });
  });

  test("T2.3 (req. 3) two tabs putting the same revision concurrently: exactly one resolves, and it is the one stored", async () => {
    const origin = newOriginName();
    const C = await openRegistryTab(origin);
    await C.registry.put(await entry(5, 0xc), true);

    const A = await openRegistryTab(origin);
    const B = await openRegistryTab(origin);
    // Sign both BEFORE starting either put: signing is async, and computing the second entry
    // inside the array would let the first put finish before the second starts (no race).
    const [ea, eb] = [await entry(6, 0xa), await entry(6, 0xb)];
    const [ra, rb] = await Promise.allSettled([A.registry.put(ea, true), B.registry.put(eb, true)]);

    const fulfilled = [ra, rb].filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    const rejected = [ra, rb].find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason?.message)).toContain("Revision number too low");

    const winnerTag = ra.status === "fulfilled" ? 0xa : 0xb;
    expect(await stored(C, (await entry(6, 0)).pk)).toEqual({ revision: 6, tag: winnerTag });
  });

  test("T2.4 read-your-writes is kept: a tab reads its own newest write back without a P2P query", async () => {
    const origin = newOriginName();
    const A = await openRegistryTab(origin);
    await A.registry.put(await entry(7, 0xa), true);

    A.p2p.sent.length = 0;
    const got = await A.registry.get((await entry(7, 0)).pk);
    expect(got?.revision).toBe(7);
    expect(A.p2p.sent).toHaveLength(0);
  });

  test("T2.5 (req. 5b) a put the store refuses announces nothing on listen()", async () => {
    const origin = newOriginName();
    const A = await openRegistryTab(origin);
    const B = await openRegistryTab(origin);
    const pk = (await entry(1, 0)).pk;

    await B.registry.put(await entry(4, 0xb), true);
    await A.registry.put(await entry(5, 0xa), true);

    const seen: number[] = [];
    B.registry.listen(pk).subscribe((e) => seen.push(e.revision));

    await expect(B.registry.put(await entry(5, 0xb), true)).rejects.toThrow("Revision number too low");
    expect(seen).toEqual([]);
  });

  test("T2.6 an accepted put is announced only after the store holds it", async () => {
    const origin = newOriginName();
    const A = await openRegistryTab(origin);
    const pk = (await entry(1, 0)).pk;
    await A.registry.put(await entry(1, 0x1), true);

    let readInsideListener: Promise<any> | undefined;
    A.registry.listen(pk).subscribe(() => {
      // Issued synchronously from the announcement: it must observe the new entry.
      readInsideListener = stored(A, pk);
    });

    await A.registry.put(await entry(2, 0x2), true);
    expect(readInsideListener).toBeDefined();
    expect(await readInsideListener).toEqual({ revision: 2, tag: 0x2 });
  });

  describe("T2.7 (req. 5a) P2P path", () => {
    const origWS = (globalThis as any).WebSocket;
    afterEach(() => {
      (globalThis as any).WebSocket = origWS;
    });

    test("an older incoming entry never replaces a newer one another tab committed, and emits nothing", async () => {
      const origin = newOriginName();
      const A = await openRegistryTab(origin);
      const B = await openRegistryTab(origin);
      const pk = (await entry(1, 0)).pk;

      await B.registry.put(await entry(4, 0xb), true); // B's cache: rev 4 (stale soon)
      await A.registry.put(await entry(6, 0xa), true); // shared DB: rev 6

      const seen: number[] = [];
      B.registry.listen(pk).subscribe((e) => seen.push(e.revision));

      // Drive B's real P2P receive path with a validly signed, older rev 5 from the network.
      (globalThis as any).WebSocket = class {
        binaryType = "";
        onmessage: any; onopen: any; onclose: any; onerror: any;
        constructor(public url: string) {}
        send() {}
        close() {}
      };
      const p2p = await P2P.create(crypto);
      p2p.registry = B.registry;
      p2p.connectToNode("wss://peer.test");
      const peer: any = p2p.peers.get("wss://peer.test");
      await peer.onmessage(serializeRegistryEntry(await entry(5, 0xee)));

      expect(await stored(A, pk)).toEqual({ revision: 6, tag: 0xa });
      expect(seen).toEqual([]);
    });
  });

  test("T2.8 a store without putIfNewer (caller-supplied) still works through the fallback", async () => {
    const origin = newOriginName();
    const idb = (await openRegistryTab(origin)).store;
    const plain = {
      put: (k: Uint8Array, v: Uint8Array) => idb.put(k, v),
      get: (k: Uint8Array) => idb.get(k),
      contains: (k: Uint8Array) => idb.contains(k),
    };
    const reg = new S5RegistryService(makeP2PStub() as any, plain);
    (reg as any).delay = () => Promise.resolve();
    const pk = (await entry(1, 0)).pk;

    await reg.put(await entry(1, 0x1), true);
    expect((await reg.get(pk))?.revision).toBe(1);
    await expect(reg.put(await entry(1, 0x2), true)).rejects.toThrow("Revision number too low");
    await reg.put(await entry(2, 0x2), true);
    expect((await reg.get(pk))?.revision).toBe(2);
  });
});

/**
 * P1 "no answer" at the registry (D3a). The S5 protocol has no negative registry reply: a
 * peer that lacks an entry stays silent. So "no peer answered" only means "unavailable" when
 * NO peer could be asked at all — that is the one case `requireAnswer` turns into an error.
 */
describe("registry get with requireAnswer (P1 / D3a)", () => {
  const getRA = (reg: S5RegistryService, pk: Uint8Array) => (reg.get as any)(pk, { requireAnswer: true });

  test("T4.1 no local entry and no connected peer: rejects with a typed, retryable S5RegistryUnavailableError", async () => {
    const tab = await openRegistryTab(newOriginName(), 0);
    const pk = (await entry(1, 0)).pk;

    const err = await getRA(tab.registry, pk).then(
      () => { throw new Error("expected get() to reject"); },
      (e: any) => e
    );
    expect(err.code).toBe("S5_REGISTRY_UNAVAILABLE");
    expect(err.retryable).toBe(true);
    expect(err.name).toBe("S5RegistryUnavailableError");
  });

  test("T4.2 silence from a connected peer is the protocol's 'absent' → undefined; without requireAnswer, no peer → undefined", async () => {
    const pk = (await entry(1, 0)).pk;
    const withPeer = await openRegistryTab(newOriginName(), 1);
    expect(await getRA(withPeer.registry, pk)).toBeUndefined();
    expect(withPeer.p2p.sent.length).toBeGreaterThan(0); // it really asked

    const noPeer = await openRegistryTab(newOriginName(), 0);
    expect(await noPeer.registry.get(pk)).toBeUndefined();
  });

  test("T4.3 (C4) with no peer, a key that already has a local entry is returned — on first access and when subscribed", async () => {
    const origin = newOriginName();
    const writer = await openRegistryTab(origin, 1);
    await writer.registry.put(await entry(3, 0x3), true);

    const offline = await openRegistryTab(origin, 0);
    const pk = (await entry(1, 0)).pk;
    expect((await getRA(offline.registry, pk))?.revision).toBe(3); // first access
    expect((await getRA(offline.registry, pk))?.revision).toBe(3); // subscribed path
  });

  test("T4.1b with no peer to ask, requireAnswer fails fast instead of waiting out the P2P window", async () => {
    const tab = await openRegistryTab(newOriginName(), 0);
    const waits = vi.fn(() => Promise.resolve());
    (tab.registry as any).delay = waits;
    const pk = (await entry(1, 0)).pk;

    await expect(getRA(tab.registry, pk)).rejects.toMatchObject({ code: "S5_REGISTRY_UNAVAILABLE" });
    await expect(getRA(tab.registry, pk)).rejects.toMatchObject({ code: "S5_REGISTRY_UNAVAILABLE" });
    expect(waits).not.toHaveBeenCalled(); // no peer can answer: waiting only delays the error
  });

  test("T4.3c a key first read while no peer was connected is asked of the network once a peer is back", async () => {
    const origin = newOriginName();
    const tab = await openRegistryTab(origin, 0);
    const pk = (await entry(1, 0)).pk;
    expect(await tab.registry.get(pk)).toBeUndefined(); // offline first access: nobody asked

    const other = await openRegistryTab(origin, 1);
    await other.registry.put(await entry(1, 0x1), true); // shared DB now has an entry
    tab.p2p.peers.set("peer-late", { isConnected: true, send: (m: Uint8Array) => tab.p2p.sent.push(m) });

    tab.p2p.sent.length = 0;
    expect((await tab.registry.get(pk))?.revision).toBe(1);
    expect(tab.p2p.sent.length).toBeGreaterThan(0); // it asked the network instead of trusting the DB blindly
  });

  test("T4.3b the subscribed path also rejects when the entry is still missing and no peer is connected", async () => {
    const tab = await openRegistryTab(newOriginName(), 0);
    const pk = (await entry(1, 0)).pk;
    await tab.registry.get(pk); // first access (no requireAnswer): subscribes, returns undefined
    await expect(getRA(tab.registry, pk)).rejects.toMatchObject({ code: "S5_REGISTRY_UNAVAILABLE" });
  });
});
