/**
 * Sharded directories must survive a real serialise → deserialise round trip (beta.56).
 *
 * Found while implementing registry coherence: cbor-x (`mapsAsObjects: false`) decodes every
 * CBOR map as a `Map`, and `deserialise` converted only the TOP level of the header back to
 * an object — so `header.sharding` came back as a `Map` and every `sharding.root.cid` check
 * in FS5 missed it. Once a directory crossed 1000 entries (auto-sharding), every fresh
 * instance listed 0 entries, `get` returned undefined, and the next `put` rewrote the
 * directory with a single file — orphaning all the others.
 *
 * The fix is decode-side only: the bytes on disk (and Rust compatibility) do not change.
 */
import { describe, expect, test } from "vitest";
import { DirV1Serialiser } from "../../../src/fs/dirv1/serialisation.js";
import type { DirV1 } from "../../../src/fs/dirv1/types.js";
import { FS5 } from "../../../src/fs/fs5.js";
import { MockIdentity, RevisionCheckingMockAPI } from "../helpers/revision-mock.js";

const cid = new Uint8Array(33).map((_, i) => (i * 7) & 0xff);

function shardedDir(): DirV1 {
  return {
    magic: "S5.pro",
    header: {
      sharding: {
        type: "hamt",
        config: { bitsPerLevel: 5, maxInlineEntries: 1000, hashFunction: 0 },
        root: { cid, totalEntries: 1000, depth: 1 },
      },
    },
    dirs: new Map(),
    files: new Map(),
  } as DirV1;
}

describe("DirV1 sharding header round trip", () => {
  test("the sharding header deserialises to the shape FS5 reads (plain objects, cid bytes intact)", () => {
    const back = DirV1Serialiser.deserialise(DirV1Serialiser.serialise(shardedDir()));
    const sh: any = back.header.sharding;

    expect(sh instanceof Map).toBe(false);
    expect(sh.type).toBe("hamt");
    expect(sh.config).toEqual({ bitsPerLevel: 5, maxInlineEntries: 1000, hashFunction: 0 });
    expect(sh.root.totalEntries).toBe(1000);
    expect(sh.root.depth).toBe(1);
    expect(Array.from(sh.root.cid)).toEqual(Array.from(cid));
  });

  test("(guard) the fix is decode-only: re-serialising a decoded directory reproduces the exact bytes", () => {
    const bytes = DirV1Serialiser.serialise(shardedDir());
    const again = DirV1Serialiser.serialise(DirV1Serialiser.deserialise(bytes));
    expect(Buffer.from(again).equals(Buffer.from(bytes))).toBe(true);
  });

  test("(guard) a header without sharding is unchanged", () => {
    const plain: DirV1 = { magic: "S5.pro", header: {}, dirs: new Map(), files: new Map() };
    expect(DirV1Serialiser.deserialise(DirV1Serialiser.serialise(plain)).header).toEqual({});
  });
});

describe("a sharded directory through FS5, read by a fresh instance", () => {
  test("lists every entry, reads a file, and a further put keeps them all", async () => {
    const api = new RevisionCheckingMockAPI();
    const identity = new MockIdentity();
    const fs = new FS5(api as any, identity as any);
    await fs.ensureIdentityInitialized();

    // 999 entries in one transaction, then one ordinary put crosses the 1000 threshold.
    await fs.createDirectory("home", "big");
    const uri = await (fs as any)._preprocessLocalPath("home/big");
    (
      await (fs as any).runTransactionOnDirectory(uri, async (dir: any) => {
        for (let i = 0; dir.files.size < 999; i++) {
          dir.files.set(`planted-${i}.txt`, {
            hash: new Uint8Array(32).fill(i % 251),
            size: 1,
            media_type: "text/plain",
            timestamp: 1,
          });
        }
        return dir;
      })
    ).unwrap();
    await fs.put("home/big/last.txt", "last");

    const count = async (f: FS5) => {
      let n = 0;
      for await (const _ of f.list("home/big")) n++;
      return n;
    };

    const cold = new FS5(api as any, identity as any);
    expect(await count(cold)).toBe(1000);
    expect(await cold.get("home/big/last.txt")).toBe("last");

    await cold.put("home/big/after.txt", "after");
    expect(await count(new FS5(api as any, identity as any))).toBe(1001);
  }, 60000);
});
