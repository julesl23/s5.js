/**
 * Two-tabs-of-one-origin harness for the registry-coherence suites (beta.56).
 *
 * Browser tabs of one origin share exactly two things: the `s5_registry` IndexedDB database
 * and the network. Each tab has its own `S5RegistryService` (its own 60 s `recentWrites`
 * cache) and its own `FS5` (its own 30 s directory cache). So a "tab" here is:
 *   - an `IDBStore` connection to a database name shared with the other tabs
 *     (`fake-indexeddb` gives real cross-connection transaction semantics),
 *   - its own `S5RegistryService` over that connection, with a stubbed P2P layer,
 *   - optionally an `FS5` over a `TabAPI` whose blobs live in one map shared by all tabs.
 *
 * The registry's P2P waits (250 ms / 2.5 s) are real `setTimeout`s in a private `delay`;
 * they are replaced with an immediate resolve so the suites stay fast. Nothing else about
 * the service is altered.
 */
import { JSCryptoImplementation } from "../../../src/api/crypto/js.js";
import { IDBStore } from "../../../src/kv/idb.js";
import { S5RegistryService } from "../../../src/node/registry.js";
import { FS5 } from "../../../src/fs/fs5.js";
import { MockIdentity } from "./revision-mock.js";
import { deserializeRegistryEntry } from "../../../src/registry/entry.js";

export const crypto = new JSCryptoImplementation();

export interface P2PStub {
  crypto: JSCryptoImplementation;
  peers: Map<string, { isConnected: boolean; send: (m: Uint8Array) => void }>;
  sent: Uint8Array[];
}

/** A P2P stand-in with `connectedPeers` silent peers (they receive, never answer). */
export function makeP2PStub(connectedPeers = 1): P2PStub {
  const sent: Uint8Array[] = [];
  const peers = new Map();
  for (let i = 0; i < connectedPeers; i++) {
    peers.set(`peer-${i}`, { isConnected: true, send: (m: Uint8Array) => sent.push(m) });
  }
  return { crypto, peers, sent };
}

export interface RegistryTab {
  store: IDBStore;
  p2p: P2PStub;
  registry: S5RegistryService;
}

export function newOriginName(): string {
  return `s5_registry-test-${Math.random().toString(36).slice(2)}`;
}

/** Open one tab's registry over a (shared) registry database name. */
export async function openRegistryTab(dbName: string, connectedPeers = 1): Promise<RegistryTab> {
  const store = await IDBStore.open(dbName);
  const p2p = makeP2PStub(connectedPeers);
  const registry = new S5RegistryService(p2p as any, store);
  (registry as any).delay = () => Promise.resolve();
  return { store, p2p, registry };
}

/** S5 API surface FS5 needs, backed by one tab's registry and a blob map shared by every tab. */
export class TabAPI {
  crypto = crypto;
  /** Hex public keys of every registry write this tab committed, in order. */
  sets: string[] = [];
  constructor(public registry: S5RegistryService, public blobs: Map<string, Uint8Array>) {}

  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = await this.crypto.hashBlake3(data);
    this.blobs.set(Buffer.from(hash).toString("hex"), data);
    return { hash: new Uint8Array([0x1e, ...hash]), size: blob.size };
  }

  async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
    const digest = hash.length === 33 ? hash.slice(1) : hash;
    const data = this.blobs.get(Buffer.from(digest).toString("hex"));
    if (!data) throw new Error("Blob not found: 404 not found");
    return data.slice();
  }

  registryGet(pk: Uint8Array, opts?: any) {
    return (this.registry.get as any)(pk, opts);
  }

  async registrySet(entry: any) {
    await this.registry.put(entry, true);
    this.sets.push(Buffer.from(entry.pk).toString("hex"));
  }
}

export interface FsTab extends RegistryTab {
  api: TabAPI;
  fs: FS5;
}

/**
 * A browser tab running FS5 for `identity`: own registry service + own FS5 over the shared
 * registry DB `dbName` and the shared blob map `blobs`.
 */
export async function openFsTab(
  dbName: string,
  blobs: Map<string, Uint8Array>,
  identity: MockIdentity,
  connectedPeers = 1
): Promise<FsTab> {
  const tab = await openRegistryTab(dbName, connectedPeers);
  const api = new TabAPI(tab.registry, blobs);
  const fs = new FS5(api as any, identity as any);
  return { ...tab, api, fs };
}

/** Collect a directory listing's names (sorted). */
export async function names(fs: FS5, path: string, opts?: any): Promise<string[]> {
  const out: string[] = [];
  for await (const item of (fs.list as any)(path, opts)) out.push(item.name);
  return out.sort();
}

/** Remove one registry entry from a (shared) registry store — simulates an entry this origin never received. */
export async function deleteRegistryEntry(store: IDBStore, pkHex: string): Promise<void> {
  await (store as any).db.delete("kv", Array.from(Buffer.from(pkHex, "hex")));
}

/** Read one registry entry's revision straight from a store (undefined if absent). */
export async function storedRevision(store: IDBStore, pkHex: string): Promise<number | undefined> {
  const raw = await store.get(new Uint8Array(Buffer.from(pkHex, "hex")));
  return raw === undefined ? undefined : deserializeRegistryEntry(raw).revision;
}
