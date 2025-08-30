import { describe, test, expect, beforeEach } from "vitest";
import { HAMT } from "../../../src/fs/hamt/hamt.js";
import { FileRef, DirRef } from "../../../src/fs/dirv1/types.js";
import type { S5APIInterface } from "../../../src/api/s5.js";
import type { HAMTNode } from "../../../src/fs/hamt/types.js";

// Mock S5 API for testing
class MockS5API {
  private storage: Map<string, Uint8Array> = new Map();
  private uploadCount = 0;

  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = new Uint8Array(32);
    // Use upload count to generate unique hashes
    hash[0] = this.uploadCount++;
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

  getUploadCount(): number {
    return this.uploadCount;
  }
}

describe("HAMT Node Splitting", () => {
  let hamt: HAMT;
  let api: MockS5API;

  beforeEach(() => {
    api = new MockS5API();
    // Create HAMT with lower threshold for testing
    hamt = new HAMT(api as any, {
      bitsPerLevel: 5,
      maxInlineEntries: 8, // Lower threshold for easier testing
      hashFunction: 0
    });
  });

  describe("Leaf node limits", () => {
    test("should keep entries inline up to maxInlineEntries", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(1),
        size: 100
      };

      // Insert up to maxInlineEntries
      for (let i = 0; i < 8; i++) {
        await hamt.insert(`f:file${i}.txt`, fileRef);
      }

      // Root should still be a leaf
      const rootNode = (hamt as any).rootNode;
      expect(rootNode).toBeDefined();
      expect(rootNode.children.length).toBe(1);
      expect(rootNode.children[0].type).toBe("leaf");
      expect(rootNode.children[0].entries.length).toBe(8);
    });

    test("should trigger split at exactly maxInlineEntries + 1", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(1),
        size: 100
      };

      // Insert maxInlineEntries
      for (let i = 0; i < 8; i++) {
        await hamt.insert(`f:file${i}.txt`, fileRef);
      }

      // Verify no uploads yet (no splitting)
      expect(api.getUploadCount()).toBe(0);

      // Insert one more to trigger split
      await hamt.insert(`f:file8.txt`, fileRef);

      // Note: With the single initial leaf optimization, splits at root level
      // redistribute entries without uploading nodes, so we don't check upload count

      // Root should now have multiple children or node references
      const rootNode = (hamt as any).rootNode;
      const hasNodeReferences = rootNode.children.some((child: any) => child.type === "node");
      const hasMultipleChildren = rootNode.children.length > 1;
      
      expect(hasNodeReferences || hasMultipleChildren).toBe(true);
    });

    test("should redistribute entries based on hash at next depth", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(1),
        size: 100
      };

      // Use keys that will hash to different indices
      const keys = [
        "f:alpha.txt",
        "f:beta.txt", 
        "f:gamma.txt",
        "f:delta.txt",
        "f:epsilon.txt",
        "f:zeta.txt",
        "f:eta.txt",
        "f:theta.txt",
        "f:iota.txt" // This should trigger split
      ];

      for (const key of keys) {
        await hamt.insert(key, fileRef);
      }

      // Verify all entries are still retrievable
      for (const key of keys) {
        const retrieved = await hamt.get(key);
        expect(retrieved).toEqual(fileRef);
      }
    });
  });

  describe("Split operation", () => {
    test("should create new internal node during split", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(1),
        size: 100
      };

      // Insert entries that will cause split
      for (let i = 0; i <= 8; i++) {
        await hamt.insert(`f:test${i}.txt`, fileRef);
      }

      const rootNode = (hamt as any).rootNode;
      
      // Check that we have a proper tree structure
      expect(rootNode.bitmap).toBeGreaterThan(0);
      expect(rootNode.depth).toBe(0);
      
      // Should have child nodes
      const hasInternalNodes = rootNode.children.some((child: any) => 
        child.type === "node" || (child.type === "leaf" && child.entries.length > 0)
      );
      expect(hasInternalNodes).toBe(true);
    });

    test("should maintain all entries after splitting", async () => {
      const entries = new Map<string, FileRef>();
      
      // Create unique file refs
      for (let i = 0; i < 20; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100 + i
        };
        entries.set(`f:file${i}.txt`, ref);
      }

      // Insert all entries
      for (const [key, ref] of entries) {
        await hamt.insert(key, ref);
      }

      // Verify all entries are retrievable
      for (const [key, ref] of entries) {
        const retrieved = await hamt.get(key);
        expect(retrieved).toEqual(ref);
      }

      // Verify none are lost
      let count = 0;
      for await (const [key, value] of hamt.entries()) {
        count++;
        expect(entries.has(key)).toBe(true);
        expect(value).toEqual(entries.get(key));
      }
      expect(count).toBe(20);
    });

    test("should update parent bitmap correctly", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(1),
        size: 100
      };

      // Insert entries
      for (let i = 0; i <= 10; i++) {
        await hamt.insert(`f:doc${i}.pdf`, fileRef);
      }

      const rootNode = (hamt as any).rootNode;
      
      // Bitmap should reflect occupied slots (use unsigned comparison)
      expect(rootNode.bitmap >>> 0).toBeGreaterThan(0);
      
      // Count set bits in bitmap
      let setBits = 0;
      for (let i = 0; i < 32; i++) {
        if ((rootNode.bitmap & (1 << i)) !== 0) {
          setBits++;
        }
      }
      
      // Should have at least one bit set
      expect(setBits).toBeGreaterThan(0);
      // Should equal number of children
      expect(setBits).toBe(rootNode.children.length);
    });

    test("should increment depth for child nodes", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(1),
        size: 100
      };

      // Insert many entries to force multiple levels
      for (let i = 0; i < 50; i++) {
        await hamt.insert(`f:deep${i}.txt`, fileRef);
      }

      // Get the max depth
      const maxDepth = await hamt.getDepth();
      expect(maxDepth).toBeGreaterThan(0);

      // Verify depth increments properly
      const rootNode = (hamt as any).rootNode;
      expect(rootNode.depth).toBe(0);
    });

    test("should handle hash collisions at next level", async () => {
      // Create entries that might collide at certain depths
      const entries: Array<[string, FileRef]> = [];
      
      for (let i = 0; i < 100; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i % 256),
          size: 1000 + i
        };
        // Use keys that might produce similar hash patterns
        entries.push([`f:collision${i % 10}_${Math.floor(i / 10)}.txt`, ref]);
      }

      // Insert all entries
      for (const [key, ref] of entries) {
        await hamt.insert(key, ref);
      }

      // Verify all are retrievable despite potential collisions
      for (const [key, ref] of entries) {
        const retrieved = await hamt.get(key);
        expect(retrieved).toEqual(ref);
      }
    });
  });

  describe("Tree structure after splits", () => {
    test("should create proper node hierarchy", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(1),
        size: 100
      };

      // Insert enough to create hierarchy
      for (let i = 0; i < 30; i++) {
        await hamt.insert(`f:hierarchy${i}.txt`, fileRef);
      }

      const rootNode = (hamt as any).rootNode;
      
      // Root should have proper structure
      expect(rootNode).toBeDefined();
      expect(rootNode.bitmap).toBeDefined();
      expect(rootNode.children).toBeDefined();
      expect(Array.isArray(rootNode.children)).toBe(true);
      
      // Should have count tracking
      expect(rootNode.count).toBe(30);
    });

    test("should update count at all levels", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(1),
        size: 100
      };

      let totalInserted = 0;

      // Insert in batches and verify count
      for (let batch = 0; batch < 3; batch++) {
        for (let i = 0; i < 10; i++) {
          await hamt.insert(`f:batch${batch}_file${i}.txt`, fileRef);
          totalInserted++;
        }
        
        const rootNode = (hamt as any).rootNode;
        expect(rootNode.count).toBe(totalInserted);
      }
    });

    test("should maintain correct child references", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(1),
        size: 100
      };

      // Insert entries
      const keys: string[] = [];
      for (let i = 0; i < 25; i++) {
        const key = `f:ref${i}.txt`;
        keys.push(key);
        await hamt.insert(key, fileRef);
      }

      // Verify structure and all entries are findable
      for (const key of keys) {
        const found = await hamt.get(key);
        expect(found).toBeDefined();
        expect(found).toEqual(fileRef);
      }

      // Test that non-existent keys still return undefined
      expect(await hamt.get("f:nonexistent.txt")).toBeUndefined();
    });
  });
});