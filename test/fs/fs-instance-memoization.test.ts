import { describe, test, expect, vi } from "vitest";
import { S5 } from "../../src/s5.js";
import { FS5 } from "../../src/fs/fs5.js";
import { S5Node } from "../../src/node/node.js";
import { JSCryptoImplementation } from "../../src/api/crypto/js.js";
import { IDBStore } from "../../src/kv/idb.js";
import { S5APIWithIdentity } from "../../src/identity/api.js";

/**
 * `s5.fs` memoization + identity teardown.
 *
 * NOTE on the test environment: `S5.create()` cannot be used here because
 * `S5Node.ensureInitialized()` loops until a live P2P peer connects, which never
 * happens with `initialPeers: []`. We therefore build an `S5` through its private
 * constructor (no network) — sufficient to exercise the `fs` getter and the
 * teardown in `recoverIdentityFromSeedPhrase`. `initStorageServices()` (the only
 * network-dependent step inside recovery) is stubbed; identity derivation,
 * authStore writes, and the getter are all offline-safe.
 */
async function makeOfflineS5(): Promise<S5> {
  const crypto = new JSCryptoImplementation();
  const node = new S5Node(crypto);
  await node.init((name: string) => IDBStore.open(name));
  const authStore = await IDBStore.open("auth-memo-" + Math.random());
  return new (S5 as any)({ node, authStore, identity: undefined });
}

describe("s5.fs memoization", () => {
  test("s5.fs returns a stable FS5 instance across accesses", async () => {
    const s5 = await makeOfflineS5();
    const a = s5.fs;
    expect(a).toBeInstanceOf(FS5);
    expect(s5.fs).toBe(a);
    expect(s5.fs).toBe(a);
  });

  test("identity recovery drops the memoized fs, then re-stabilises", async () => {
    vi.spyOn(S5APIWithIdentity.prototype, "initStorageServices").mockResolvedValue(undefined as any);
    const s5 = await makeOfflineS5();

    const before = s5.fs;
    expect(s5.fs).toBe(before); // memoized before recovery

    await s5.recoverIdentityFromSeedPhrase(s5.generateSeedPhrase());

    const after = s5.fs;
    expect(after).not.toBe(before); // teardown dropped the stale instance
    expect(s5.fs).toBe(after); // stable again under the new identity
  });
});
