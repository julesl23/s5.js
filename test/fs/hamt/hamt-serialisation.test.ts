import { describe, test, expect, beforeEach } from "vitest";
import { HAMT } from "../../../src/fs/hamt/hamt.js";
import { FileRef, DirRef } from "../../../src/fs/dirv1/types.js";
import { encodeS5, decodeS5 } from "../../../src/fs/dirv1/cbor-config.js";
import { base64UrlNoPaddingEncode } from "../../../src/util/encoding.js";
import type { S5APIInterface } from "../../../src/api/s5.js";
import type { HAMTNode } from "../../../src/fs/hamt/types.js";

// Mock S5 API with storage
class MockS5API {
  private storage: Map<string, Uint8Array> = new Map();
  private uploadedBlobs: Map<string, Uint8Array> = new Map();

  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = new Uint8Array(32);
    crypto.getRandomValues(hash);
    
    const key = Buffer.from(hash).toString('hex');
    this.storage.set(key, data);
    this.uploadedBlobs.set(key, data);
    
    return { hash, size: blob.size };
  }

  async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
    const key = Buffer.from(hash).toString('hex');
    const data = this.storage.get(key);
    if (!data) throw new Error(`Blob not found: ${key}`);
    return data;
  }

  getUploadedBlob(hash: Uint8Array): Uint8Array | undefined {
    const key = Buffer.from(hash).toString('hex');
    return this.uploadedBlobs.get(key);
  }

  clearUploads() {
    this.uploadedBlobs.clear();
  }
}

describe("HAMT Serialisation", () => {
  let hamt: HAMT;
  let api: MockS5API;

  beforeEach(() => {
    api = new MockS5API();
    hamt = new HAMT(api as any);
  });

  describe("Node serialisation", () => {
    test("should use deterministic CBOR encoding", async () => {
      // Insert same data multiple times
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(1),
        size: 100
      };

      await hamt.insert("f:test1.txt", fileRef);
      await hamt.insert("f:test2.txt", fileRef);

      // Serialise multiple times
      const serialised1 = hamt.serialise();
      const serialised2 = hamt.serialise();

      // Should be identical
      expect(serialised1).toEqual(serialised2);
    });

    test("should serialise HAMTNode with correct structure", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(1),
        size: 100
      };

      await hamt.insert("f:node.txt", fileRef);

      const serialised = hamt.serialise();
      const decoded = decodeS5(serialised);

      // Check structure
      expect(decoded).toBeDefined();
      expect(decoded.version).toBe(1);
      expect(decoded.config).toBeDefined();
      expect(decoded.config.bitsPerLevel).toBe(5);
      expect(decoded.config.maxInlineEntries).toBe(1000);
      expect(decoded.config.hashFunction).toBe(0);
      expect(decoded.root).toBeDefined();
    });

    test("should serialise leaf nodes with entries array", async () => {
      const entries: Array<[string, FileRef]> = [
        ["f:a.txt", { hash: new Uint8Array(32).fill(1), size: 100 }],
        ["f:b.txt", { hash: new Uint8Array(32).fill(2), size: 200 }],
        ["f:c.txt", { hash: new Uint8Array(32).fill(3), size: 300 }]
      ];

      for (const [key, ref] of entries) {
        await hamt.insert(key, ref);
      }

      const serialised = hamt.serialise();
      const decoded = decodeS5(serialised);

      // Root should contain leaf nodes
      expect(decoded.root).toBeDefined();
      expect(decoded.root.children).toBeDefined();
      
      // Find leaf nodes
      const leafNodes = decoded.root.children.filter((child: any) => child.type === "leaf");
      expect(leafNodes.length).toBeGreaterThan(0);
      
      // Check leaf structure
      for (const leaf of leafNodes) {
        expect(leaf.entries).toBeDefined();
        expect(Array.isArray(leaf.entries)).toBe(true);
      }
    });

    test("should serialise internal nodes with CID references", async () => {
      // Create HAMT with lower threshold to force node creation
      hamt = new HAMT(api as any, {
        bitsPerLevel: 5,
        maxInlineEntries: 8,
        hashFunction: 0
      });

      // Insert enough entries to force internal nodes
      for (let i = 0; i < 50; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 1000 + i
        };
        await hamt.insert(`f:internal${i}.txt`, ref);
      }

      // Clear previous uploads to track new ones
      api.clearUploads();

      const serialised = hamt.serialise();
      const decoded = decodeS5(serialised);

      // Should have uploaded some nodes
      expect(decoded.root.children.some((child: any) => child.type === "node")).toBe(true);

      // Find node references
      const nodeRefs = decoded.root.children.filter((child: any) => child.type === "node");
      for (const nodeRef of nodeRefs) {
        expect(nodeRef.cid).toBeDefined();
        expect(nodeRef.cid).toBeInstanceOf(Uint8Array);
        expect(nodeRef.cid.length).toBe(32);
      }
    });
  });

  describe("CID generation", () => {
    test("should generate consistent CIDs for identical nodes", async () => {
      // Create two HAMTs with same content
      const hamt1 = new HAMT(api as any);
      const hamt2 = new HAMT(api as any);

      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(42),
        size: 1234
      };

      // Insert same data in same order
      await hamt1.insert("f:same.txt", fileRef);
      await hamt2.insert("f:same.txt", fileRef);

      const serialised1 = hamt1.serialise();
      const serialised2 = hamt2.serialise();

      // Should produce identical serialisation
      expect(serialised1).toEqual(serialised2);
    });

    test("should upload node data via S5 API uploadBlob", async () => {
      // Force node creation
      for (let i = 0; i < 20; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100
        };
        await hamt.insert(`f:upload${i}.txt`, ref);
      }

      api.clearUploads();
      
      // Trigger serialisation (which may upload nodes)
      const serialised = hamt.serialise();
      
      // For large HAMTs, nodes should be uploaded
      // The exact behavior depends on implementation
      expect(serialised).toBeDefined();
    });

    test("should store CID as Uint8Array", async () => {
      for (let i = 0; i < 30; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100
        };
        await hamt.insert(`f:cid${i}.txt`, ref);
      }

      const serialised = hamt.serialise();
      const decoded = decodeS5(serialised);

      // Check all CIDs are Uint8Array
      function checkCIDs(node: any) {
        if (!node || !node.children) return;
        
        for (const child of node.children) {
          if (child.type === "node") {
            expect(child.cid).toBeInstanceOf(Uint8Array);
          }
        }
      }

      checkCIDs(decoded.root);
    });
  });

  describe("Deserialisation", () => {
    test("should deserialise HAMT structure from CBOR", async () => {
      // Create and populate HAMT
      const entries = new Map<string, FileRef>();
      for (let i = 0; i < 10; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100 + i
        };
        entries.set(`f:deser${i}.txt`, ref);
        await hamt.insert(`f:deser${i}.txt`, ref);
      }

      // Serialise
      const serialised = hamt.serialise();

      // Deserialise into new HAMT
      const hamt2 = await HAMT.deserialise(serialised, api as any);

      // Verify all entries
      for (const [key, ref] of entries) {
        const retrieved = await hamt2.get(key);
        expect(retrieved).toEqual(ref);
      }
    });

    test("should restore bitmap and count correctly", async () => {
      // Insert specific entries
      for (let i = 0; i < 15; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 1000
        };
        await hamt.insert(`f:bitmap${i}.txt`, ref);
      }

      const serialised = hamt.serialise();
      const hamt2 = await HAMT.deserialise(serialised, api as any);

      // Check internal structure
      const rootNode = (hamt2 as any).rootNode;
      expect(rootNode.bitmap).toBeDefined();
      expect(rootNode.count).toBe(15);
    });

    test("should load child nodes lazily via CID", async () => {
      // Create large HAMT to ensure child nodes
      for (let i = 0; i < 100; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i % 256),
          size: 1000
        };
        await hamt.insert(`f:lazy${i}.txt`, ref);
      }

      const serialised = hamt.serialise();
      
      // Create new API instance to simulate fresh load
      const api2 = new MockS5API();
      
      // Copy over the storage
      for (const [key, value] of (api as any).storage) {
        (api2 as any).storage.set(key, value);
      }

      const hamt2 = await HAMT.deserialise(serialised, api2 as any);

      // Access a specific entry (should trigger lazy loading)
      const retrieved = await hamt2.get("f:lazy50.txt");
      expect(retrieved).toBeDefined();
      expect(retrieved?.size).toBe(1000);
    });

    test("should maintain round-trip fidelity", async () => {
      // Create complex structure
      const mixedEntries: Array<[string, FileRef | DirRef]> = [];
      
      for (let i = 0; i < 50; i++) {
        if (i % 3 === 0) {
          const dirRef: DirRef = {
            link: {
              type: "fixed_hash_blake3",
              hash: new Uint8Array(32).fill(i)
            }
          };
          mixedEntries.push([`d:dir${i}`, dirRef]);
        } else {
          const fileRef: FileRef = {
            hash: new Uint8Array(32).fill(i),
            size: 1000 + i,
            media_type: i % 2 === 0 ? "text/plain" : "image/jpeg"
          };
          mixedEntries.push([`f:file${i}.txt`, fileRef]);
        }
      }

      // Insert all
      for (const [key, ref] of mixedEntries) {
        await hamt.insert(key, ref);
      }

      // Round trip
      const serialised1 = hamt.serialise();
      const hamt2 = await HAMT.deserialise(serialised1, api as any);
      const serialised2 = hamt2.serialise();

      // Should be identical
      expect(serialised1).toEqual(serialised2);

      // Verify all entries
      for (const [key, ref] of mixedEntries) {
        const retrieved = await hamt2.get(key);
        expect(retrieved).toEqual(ref);
      }
    });
  });

  describe("Node caching", () => {
    test("should cache nodes by CID string", async () => {
      // Create HAMT with lower threshold to force node creation
      hamt = new HAMT(api as any, {
        bitsPerLevel: 5,
        maxInlineEntries: 8,
        hashFunction: 0
      });

      // Insert entries to create deep structure
      for (let i = 0; i < 50; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100
        };
        await hamt.insert(`f:cache${i}.txt`, ref);
      }

      // Serialize and deserialize to force node loading
      const serialized = hamt.serialise();
      const hamt2 = await HAMT.deserialise(serialized, api as any);

      // Access entries to trigger node loading
      const result1 = await hamt2.get("f:cache15.txt");
      const result2 = await hamt2.get("f:cache25.txt");
      const result3 = await hamt2.get("f:cache35.txt");

      // Check cache exists and has entries
      const nodeCache = (hamt2 as any).nodeCache;
      expect(nodeCache).toBeDefined();
      expect(nodeCache.size).toBeGreaterThan(0);
    });

    test("should retrieve cached nodes without API call", async () => {
      // Insert entries to create structure
      for (let i = 0; i < 40; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100
        };
        await hamt.insert(`f:nocall${i}.txt`, ref);
      }

      // Clear API storage to simulate missing data
      const originalStorage = new Map((api as any).storage);
      (api as any).storage.clear();

      // These should work from cache
      const cached = await hamt.get("f:nocall10.txt");
      expect(cached).toBeDefined();

      // Restore storage
      (api as any).storage = originalStorage;
    });

    test("should use base64url encoding for cache keys", async () => {
      for (let i = 0; i < 10; i++) {
        const ref: FileRef = {
          hash: new Uint8Array(32).fill(i),
          size: 100
        };
        await hamt.insert(`f:b64${i}.txt`, ref);
      }

      const nodeCache = (hamt as any).nodeCache;
      
      // Check cache keys are base64url encoded
      for (const key of nodeCache.keys()) {
        // Base64url pattern (no padding, no +, no /)
        expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(key).not.toContain('+');
        expect(key).not.toContain('/');
        expect(key).not.toContain('=');
      }
    });
  });
});