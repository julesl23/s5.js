/**
 * Shared test harness for the directory-load / repair suites.
 *
 * A revision-enforcing in-memory S5 API (registry rejects a revision <= the one
 * it holds, exactly like the real registry) plus the key-derivation helpers the
 * tests need to address a directory by path without going through `getKeySet`
 * (which cannot address a descendant of an unloadable directory).
 */
import { FS5 } from "../../../src/fs/fs5.js";
import { JSCryptoImplementation } from "../../../src/api/crypto/js.js";
import { DirV1Serialiser } from "../../../src/fs/dirv1/serialisation.js";
import { encryptMutableBytes } from "../../../src/encryption/mutable.js";
import { createRegistryEntry } from "../../../src/registry/entry.js";
import { deriveHashInt } from "../../../src/util/derive_hash.js";

export class RevisionCheckingMockAPI {
  crypto = new JSCryptoImplementation();
  blobs = new Map<string, Uint8Array>();
  registry = new Map<string, any>();

  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = await this.crypto.hashBlake3(data);
    this.blobs.set(Buffer.from(hash).toString("hex"), data);
    return { hash: new Uint8Array([0x1e, ...hash]), size: blob.size };
  }

  async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
    const actual = hash[0] === 0x1e ? hash.slice(1) : hash;
    const data = this.blobs.get(Buffer.from(actual).toString("hex"));
    if (!data) throw new Error("Blob not found");
    return data.slice(); // copy: a real network API never hands back its own buffer
  }

  async registryGet(publicKey: Uint8Array): Promise<any> {
    const e = this.registry.get(Buffer.from(publicKey).toString("hex"));
    // Defensive copy: the read path mutates the hash in place (`hash[0] = mhashBlake3`).
    return e ? { ...e, data: (e.data as Uint8Array).slice() } : e;
  }

  async registrySet(entry: any): Promise<void> {
    const key = Buffer.from(entry.pk).toString("hex");
    const existing = this.registry.get(key);
    if (existing && existing.revision >= entry.revision) {
      throw new Error("Revision number too low");
    }
    this.registry.set(key, entry);
  }
}

export class MockIdentity {
  fsRootKey: Uint8Array;
  constructor(fill = 42) {
    this.fsRootKey = new Uint8Array(32).fill(fill);
  }
}

export const hex = (u: Uint8Array) => Buffer.from(u).toString("hex");

/** Temporarily replace an api method with a plain function (returns a restore fn). */
export function stub(api: any, name: string, make: (orig: any) => any): () => void {
  const orig = api[name].bind(api);
  api[name] = make(orig);
  return () => { api[name] = orig; };
}

/** Snapshot every registry entry's (revision, data) so overwrites are detectable. */
export function snapshotRegistry(api: RevisionCheckingMockAPI): Map<string, string> {
  const snap = new Map<string, string>();
  for (const [k, e] of api.registry) snap.set(k, `${e.revision}:${hex(e.data)}`);
  return snap;
}

/** Derive the filesystem-root write seed (parent write key of home/archive). */
export function rootWriteKey(api: RevisionCheckingMockAPI, identity: MockIdentity): Uint8Array {
  return deriveHashInt(identity.fsRootKey, 1, api.crypto);
}

/** Hex registry key (33-byte, ed-prefixed) for the root directory. */
export async function rootKeyHex(api: RevisionCheckingMockAPI, identity: MockIdentity): Promise<string> {
  const kp = await api.crypto.newKeyPairEd25519(rootWriteKey(api, identity));
  return hex(kp.publicKey);
}

/** Hex registry key for a descendant path, e.g. ("home","a") => home/a. */
export async function deepKeyHex(
  api: RevisionCheckingMockAPI,
  identity: MockIdentity,
  ...names: string[]
): Promise<string> {
  const fs = new FS5(api as any, identity as any);
  let wk = rootWriteKey(api, identity);
  for (const name of names) {
    wk = await (fs as any)._deriveWriteKeyForChildDirectory(wk, name);
  }
  const kp = await api.crypto.newKeyPairEd25519(wk);
  return hex(kp.publicKey);
}

/** Hex registry key for a direct child of root (e.g. "home"). */
export async function childKeyHex(
  api: RevisionCheckingMockAPI,
  identity: MockIdentity,
  name: string
): Promise<string> {
  return deepKeyHex(api, identity, name);
}

/** Persistently 404 the blob of ONE directory (by its registry key); leave others. */
export function stub404ForDir(api: RevisionCheckingMockAPI, dirKeyHex: string): () => void {
  const entry = api.registry.get(dirKeyHex);
  const targetHex = Buffer.from((entry.data as Uint8Array).slice(1)).toString("hex");
  return stub(api, "downloadBlobAsBytes", (orig) => async (h: Uint8Array) => {
    const actual = h[0] === 0x1e ? h.slice(1) : h;
    if (Buffer.from(actual).toString("hex") === targetHex) throw new Error("404 not found");
    return orig(h);
  });
}

/**
 * Record the pubkeys handed to registrySet (the live array grows as writes happen).
 * Lets a test assert the no-overwrite invariant via registry state rather than a
 * blob round-trip read-back.
 */
export function recordSets(api: RevisionCheckingMockAPI): { keys: string[]; restore: () => void } {
  const keys: string[] = [];
  const restore = stub(api, "registrySet", (orig) => async (entry: any) => {
    keys.push(hex(entry.pk));
    return orig(entry);
  });
  return { keys, restore };
}

/** Plant a valid (downloadable) but EMPTY root directory at the given revision. */
export async function seedEmptyRoot(
  api: RevisionCheckingMockAPI,
  identity: MockIdentity,
  revision: number
): Promise<void> {
  const frk = rootWriteKey(api, identity);
  const kp = await api.crypto.newKeyPairEd25519(frk);
  const encKey = deriveHashInt(frk, 1, api.crypto);
  const emptyDir = { magic: "S5.pro", header: {}, dirs: new Map(), files: new Map() };
  const serialized = DirV1Serialiser.serialise(emptyDir as any);
  const encrypted = await encryptMutableBytes(serialized, encKey, api.crypto);
  const { hash } = await api.uploadBlob(new Blob([encrypted as BlobPart]));
  const entry = await createRegistryEntry(kp, hash, revision, api.crypto);
  api.registry.set(hex(kp.publicKey), entry);
}
