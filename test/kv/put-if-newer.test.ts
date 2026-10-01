/**
 * Phase 1 (registry coherence, beta.56): atomic compare-and-put in the key-value stores.
 *
 * The registry's revision check and its write must be ONE step. `s5_registry` is a single
 * IndexedDB database shared by every tab of an origin, so a check in one transaction and a
 * write in another lets two tabs both pass the check and the later write silently replace
 * the earlier one (the lost update). `putIfNewer` runs the comparison and the write inside
 * one `readwrite` transaction; IndexedDB serialises those across every connection.
 *
 * Values here are `[revision, tag]` so "who won" is observable.
 */
import { describe, expect, test } from "vitest";
import { IDBStore } from "../../src/kv/idb.js";
import { MemoryLevelStore } from "../../src/kv/memory_level.js";

const KEY = new Uint8Array([1, 2, 3]);
const val = (rev: number, tag: number) => new Uint8Array([rev, tag]);
const newerThan = (rev: number) => (existing?: Uint8Array) => !existing || existing[0] < rev;

async function twoConnections() {
  const name = `put-if-newer-${Math.random().toString(36).slice(2)}`;
  return [await IDBStore.open(name), await IDBStore.open(name)] as const;
}

describe("IDBStore.putIfNewer", () => {
  test("T1.1 two connections racing on one revision: exactly one wins, and the store holds the winner", async () => {
    const [a, b] = await twoConnections();
    await a.put(KEY, val(5, 0));

    const results = await Promise.all([
      a.putIfNewer!(KEY, val(6, 0xa), newerThan(6)),
      b.putIfNewer!(KEY, val(6, 0xb), newerThan(6)),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const winnerTag = results[0] ? 0xa : 0xb;
    expect(Array.from((await b.get(KEY))!)).toEqual([6, winnerTag]);
  });

  test("T1.1b many racers across two connections: still exactly one winner", async () => {
    const [a, b] = await twoConnections();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).putIfNewer!(KEY, val(1, i), newerThan(1)))
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test("T1.2 refused when isNewer is false (value unchanged); absent key is offered undefined and stored", async () => {
    const [a] = await twoConnections();

    let seen: Uint8Array | undefined | null = null;
    const stored = await a.putIfNewer!(KEY, val(3, 1), (existing) => {
      seen = existing;
      return true;
    });
    expect(stored).toBe(true);
    expect(seen).toBeUndefined();

    expect(await a.putIfNewer!(KEY, val(3, 2), newerThan(3))).toBe(false);
    expect(await a.putIfNewer!(KEY, val(2, 3), newerThan(2))).toBe(false);
    expect(Array.from((await a.get(KEY))!)).toEqual([3, 1]);
  });

  test("T1.3 isNewer throws: the call rejects and nothing is written", async () => {
    const [a] = await twoConnections();
    await a.put(KEY, val(1, 1));

    await expect(
      a.putIfNewer!(KEY, val(9, 9), () => {
        throw new Error("comparator exploded");
      })
    ).rejects.toThrow("comparator exploded");

    expect(Array.from((await a.get(KEY))!)).toEqual([1, 1]);
    // The store is still usable afterwards (the aborted transaction left nothing behind).
    expect(await a.putIfNewer!(KEY, val(2, 2), newerThan(2))).toBe(true);
  });
});

describe("IDBStore.putIfNewer when the write itself fails", () => {
  test("T1.5 the call rejects and the aborted transaction leaves no unhandled rejection", async () => {
    const [a] = await twoConnections();
    await a.put(KEY, val(1, 1));

    // Make the write request fail asynchronously (as quota exhaustion does): route put() through
    // add() onto an existing key → ConstraintError → the transaction aborts.
    const proto = (globalThis as any).IDBObjectStore.prototype;
    const origPut = proto.put;
    proto.put = function (value: any, key: any) { return this.add(value, key); };
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      await expect(a.putIfNewer!(KEY, val(2, 2), newerThan(2))).rejects.toBeTruthy();
      await new Promise((r) => setTimeout(r, 20)); // let any orphaned rejection surface
      expect(unhandled).toEqual([]);
    } finally {
      proto.put = origPut;
      process.off("unhandledRejection", onUnhandled);
    }
    expect(Array.from((await a.get(KEY))!)).toEqual([1, 1]);
  });
});

describe("MemoryLevelStore.putIfNewer", () => {
  test("T1.4 concurrent calls on one instance: exactly one wins (memory-level get/put are async — not atomic by themselves)", async () => {
    const store = await MemoryLevelStore.open();
    await store.put(KEY, val(5, 0));

    const results = await Promise.all([
      store.putIfNewer!(KEY, val(6, 0xa), newerThan(6)),
      store.putIfNewer!(KEY, val(6, 0xb), newerThan(6)),
      store.putIfNewer!(KEY, val(6, 0xc), newerThan(6)),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const winnerTag = [0xa, 0xb, 0xc][results.indexOf(true)];
    expect(Array.from((await store.get(KEY))!)).toEqual([6, winnerTag]);
  });

  test("T1.4b a throwing comparator rejects, writes nothing, and does not wedge the lock", async () => {
    const store = await MemoryLevelStore.open();
    await store.put(KEY, val(1, 1));
    await expect(
      store.putIfNewer!(KEY, val(9, 9), () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(Array.from((await store.get(KEY))!)).toEqual([1, 1]);
    expect(await store.putIfNewer!(KEY, val(2, 2), newerThan(2))).toBe(true);
  });
});
