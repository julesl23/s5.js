import { describe, test, expect, beforeEach } from "vitest";
import { HAMT } from "../../../src/fs/hamt/hamt.js";
import { FileRef, DirRef } from "../../../src/fs/dirv1/types.js";
import type { S5APIInterface } from "../../../src/api/s5.js";

// Mock S5 API
class MockS5API {
  private storage: Map<string, Uint8Array> = new Map();

  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = new Uint8Array(32);
    crypto.getRandomValues(hash);
    const key = Buffer.from(hash).toString('hex');
    this.storage.set(key, data);
    return { hash, size: blob.size };
  }

  async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
    const key = Buffer.from(hash).toString('hex');
    const data = this.storage.get(key);
    if (!data) throw new Error("Blob not found");
    return data;
  }
}

describe("HAMT Iteration", () => {
  let hamt: HAMT;
  let api: MockS5API;

  beforeEach(() => {
    api = new MockS5API();
    hamt = new HAMT(api as any);
  });

  describe("Basic iteration", () => {
    test("should iterate all entries with async iterator", async () => {
      const entries = new Map<string, FileRef>();
      
      // Add test entries
      for (let i = 0; i < 10; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100 + i
        };
        const key = `f:iter${i}.txt`;
        entries.set(key, ref);
        await hamt.insert(key, ref);
      }

      // Iterate and collect
      const collected = new Map<string, FileRef | DirRef>();
      for await (const [key, value] of hamt.entries()) {
        collected.set(key, value);
      }

      // Verify all entries were iterated
      expect(collected.size).toBe(10);
      for (const [key, ref] of entries) {
        expect(collected.has(key)).toBe(true);
        expect(collected.get(key)).toEqual(ref);
      }
    });

    test("should yield [key, value] tuples", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(42),
        size: 1234
      };
      
      const dirRef: DirRef = {
        link: {
          type: "fixed_hash_blake3",
          hash: new Uint8Array(32).fill(43)
        }
      };

      await hamt.insert("f:test.txt", fileRef);
      await hamt.insert("d:testdir", dirRef);

      const results: Array<[string, any]> = [];
      for await (const entry of hamt.entries()) {
        results.push(entry);
      }

      expect(results.length).toBe(2);
      
      // Check tuple structure
      for (const [key, value] of results) {
        expect(typeof key).toBe("string");
        expect(value).toBeDefined();
        
        if (key.startsWith("f:")) {
          expect(value.size).toBeDefined();
        } else if (key.startsWith("d:")) {
          expect(value.link).toBeDefined();
        }
      }
    });

    test("should handle empty HAMT", async () => {
      const results: any[] = [];
      
      for await (const entry of hamt.entries()) {
        results.push(entry);
      }

      expect(results.length).toBe(0);
    });

    test("should traverse leaf and internal nodes correctly", async () => {
      // Insert enough entries to create internal nodes
      const entries = new Map<string, FileRef>();
      
      for (let i = 0; i < 50; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 1000 + i,
          media_type: "text/plain"
        };
        const key = `f:traverse${i}.txt`;
        entries.set(key, ref);
        await hamt.insert(key, ref);
      }

      // Collect all via iteration
      const collected = new Set<string>();
      for await (const [key] of hamt.entries()) {
        collected.add(key);
      }

      // Verify all were found
      expect(collected.size).toBe(50);
      for (const key of entries.keys()) {
        expect(collected.has(key)).toBe(true);
      }
    });
  });

  describe("Cursor support", () => {
    test("should generate path array with getPathForKey", async () => {
      // Insert some entries
      for (let i = 0; i < 20; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100
        };
        await hamt.insert(`f:path${i}.txt`, ref);
      }

      // Get path for an existing key
      const path = await hamt.getPathForKey("f:path10.txt");
      
      expect(Array.isArray(path)).toBe(true);
      expect(path.length).toBeGreaterThan(0);
      
      // Path should contain indices
      for (const idx of path) {
        expect(typeof idx).toBe("number");
        expect(idx).toBeGreaterThanOrEqual(0);
      }
    });

    test("should return empty path for non-existent key", async () => {
      // Insert some entries
      for (let i = 0; i < 5; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100
        };
        await hamt.insert(`f:exists${i}.txt`, ref);
      }

      // Get path for non-existent key
      const path = await hamt.getPathForKey("f:doesnotexist.txt");
      
      expect(Array.isArray(path)).toBe(true);
      expect(path.length).toBe(0);
    });

    test("should track child indices in path", async () => {
      // Insert entries to create some structure
      for (let i = 0; i < 30; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100
        };
        await hamt.insert(`f:track${i}.txt`, ref);
      }

      // Get paths for multiple keys
      const paths = new Map<string, number[]>();
      for (let i = 0; i < 5; i++) {
        const key = `f:track${i * 5}.txt`;
        const path = await hamt.getPathForKey(key);
        paths.set(key, path);
      }

      // Paths should be unique for different keys (in most cases)
      const pathStrings = new Set<string>();
      for (const path of paths.values()) {
        pathStrings.add(JSON.stringify(path));
      }
      
      // At least some paths should be different
      expect(pathStrings.size).toBeGreaterThan(1);
    });
  });

  describe("entriesFrom cursor", () => {
    test("should resume from exact cursor position", async () => {
      // Insert ordered entries
      const allKeys: string[] = [];
      for (let i = 0; i < 20; i++) {
        const key = `f:cursor${i.toString().padStart(2, '0')}.txt`;
        allKeys.push(key);
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100
        };
        await hamt.insert(key, ref);
      }

      // Get path for middle entry
      const middleKey = allKeys[10];
      const hamtPath = await hamt.getPathForKey(middleKey);
      
      // Resume from cursor
      const resumedKeys: string[] = [];
      for await (const [key] of hamt.entriesFrom(hamtPath)) {
        resumedKeys.push(key);
        if (resumedKeys.length >= 5) break; // Just get a few
      }

      // Should start from or after the cursor position
      expect(resumedKeys.length).toBeGreaterThan(0);
      
      // First resumed key should be at or after middle position
      const firstResumedIdx = allKeys.indexOf(resumedKeys[0]);
      expect(firstResumedIdx).toBeGreaterThanOrEqual(10);
    });

    test("should skip already-seen entries", async () => {
      // Insert entries
      const entries = new Map<string, number>();
      for (let i = 0; i < 30; i++) {
        const key = `f:skip${i}.txt`;
        entries.set(key, i);
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100 + i
        };
        await hamt.insert(key, ref);
      }

      // First, collect some entries
      const firstBatch: string[] = [];
      for await (const [key] of hamt.entries()) {
        firstBatch.push(key);
        if (firstBatch.length >= 10) break;
      }

      // Get cursor for last entry in first batch
      const lastKey = firstBatch[firstBatch.length - 1];
      const cursor = await hamt.getPathForKey(lastKey);

      // Resume from cursor
      const secondBatch: string[] = [];
      for await (const [key] of hamt.entriesFrom(cursor)) {
        secondBatch.push(key);
      }

      // No duplicates between batches
      const firstSet = new Set(firstBatch);
      for (const key of secondBatch) {
        expect(firstSet.has(key)).toBe(false);
      }
    });

    test("should handle cursor at leaf node", async () => {
      // Create a small HAMT that will have leaf nodes
      for (let i = 0; i < 5; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100
        };
        await hamt.insert(`f:leaf${i}.txt`, ref);
      }

      // Get path to a leaf entry
      const path = await hamt.getPathForKey("f:leaf2.txt");
      
      // Resume from this leaf position
      const resumed: string[] = [];
      for await (const [key] of hamt.entriesFrom(path)) {
        resumed.push(key);
      }

      // Should get remaining entries
      expect(resumed.length).toBeGreaterThan(0);
      expect(resumed.length).toBeLessThanOrEqual(3); // At most 3 entries after leaf2
    });

    test("should handle cursor at internal node", async () => {
      // Insert many entries to ensure internal nodes
      for (let i = 0; i < 100; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i % 256),
          size: 1000 + i
        };
        await hamt.insert(`f:internal${i}.txt`, ref);
      }

      // Get a path that likely points to internal node
      const path = await hamt.getPathForKey("f:internal50.txt");
      
      // Truncate path to point to internal node
      const internalPath = path.slice(0, -1);
      
      // Resume from internal node
      const resumed: string[] = [];
      for await (const [key] of hamt.entriesFrom(internalPath)) {
        resumed.push(key);
        if (resumed.length >= 10) break;
      }

      expect(resumed.length).toBe(10);
    });

    test("should complete iteration when path exhausted", async () => {
      // Insert entries
      const total = 25;
      for (let i = 0; i < total; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100
        };
        await hamt.insert(`f:exhaust${i}.txt`, ref);
      }

      // Get path near the end
      const nearEndPath = await hamt.getPathForKey("f:exhaust20.txt");
      
      // Count remaining entries
      let remaining = 0;
      for await (const _ of hamt.entriesFrom(nearEndPath)) {
        remaining++;
      }

      // Should have some but not all entries
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThan(total);
    });
  });
});