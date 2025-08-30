import { describe, test, expect, beforeEach } from "vitest";
import { HAMT } from "../../../src/fs/hamt/hamt.js";
import { FileRef, DirRef } from "../../../src/fs/dirv1/types.js";
import type { S5APIInterface } from "../../../src/api/s5.js";

// Mock S5 API for testing
class MockS5API {
  private storage: Map<string, Uint8Array> = new Map();

  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = new Uint8Array(32).fill(Math.random() * 255);
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

describe("HAMT Basic Operations", () => {
  let hamt: HAMT;
  let api: MockS5API;

  beforeEach(() => {
    api = new MockS5API();
    hamt = new HAMT(api as any);
  });

  describe("Node creation and structure", () => {
    test("should create empty HAMT with correct initial state", () => {
      expect(hamt).toBeDefined();
      expect(hamt.constructor.name).toBe("HAMT");
      // The root should be null initially
      expect((hamt as any).rootNode).toBeNull();
    });

    test("should create root node as leaf on first insert", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(1),
        size: 100
      };

      await hamt.insert("f:test.txt", fileRef);

      const rootNode = (hamt as any).rootNode;
      expect(rootNode).toBeDefined();
      expect(rootNode.bitmap).toBeGreaterThan(0); // Should have at least one bit set
      expect(rootNode.children).toBeDefined();
      expect(rootNode.count).toBe(1);
      expect(rootNode.depth).toBe(0);
    });

    test("should maintain correct node structure (bitmap, children, count, depth)", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(1),
        size: 100
      };

      await hamt.insert("f:file1.txt", fileRef);
      await hamt.insert("f:file2.txt", fileRef);

      const rootNode = (hamt as any).rootNode;
      expect(rootNode).toBeDefined();
      expect(rootNode.bitmap).toBeGreaterThan(0); // Should have bits set
      expect(rootNode.children.length).toBeGreaterThan(0);
      expect(rootNode.count).toBe(2);
      expect(rootNode.depth).toBe(0);
    });
  });

  describe("Insert and retrieve", () => {
    test("should insert single entry with f: prefix for files", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(1),
        size: 100,
        media_type: "text/plain"
      };

      await hamt.insert("f:test.txt", fileRef);
      const retrieved = await hamt.get("f:test.txt");

      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(fileRef);
    });

    test("should insert single entry with d: prefix for directories", async () => {
      const dirRef: DirRef = {
        link: {
          type: "fixed_hash_blake3",
          hash: new Uint8Array(32).fill(2)
        },
        ts_seconds: 1234567890
      };

      await hamt.insert("d:subdir", dirRef);
      const retrieved = await hamt.get("d:subdir");

      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(dirRef);
    });

    test("should retrieve existing entries by exact key", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(3),
        size: 200
      };

      await hamt.insert("f:document.pdf", fileRef);
      
      // Should find with exact key
      const found = await hamt.get("f:document.pdf");
      expect(found).toEqual(fileRef);

      // Should not find without prefix
      const notFound = await hamt.get("document.pdf");
      expect(notFound).toBeUndefined();
    });

    test("should return undefined for non-existent keys", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(4),
        size: 300
      };

      await hamt.insert("f:exists.txt", fileRef);

      const result1 = await hamt.get("f:doesnotexist.txt");
      expect(result1).toBeUndefined();

      const result2 = await hamt.get("d:doesnotexist");
      expect(result2).toBeUndefined();
    });

    test("should handle mixed file and directory entries", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(5),
        size: 400
      };

      const dirRef: DirRef = {
        link: {
          type: "mutable_registry_ed25519",
          publicKey: new Uint8Array(32).fill(6)
        }
      };

      // Insert mix of files and directories
      await hamt.insert("f:readme.md", fileRef);
      await hamt.insert("d:src", dirRef);
      await hamt.insert("f:package.json", fileRef);
      await hamt.insert("d:tests", dirRef);

      // Retrieve them
      expect(await hamt.get("f:readme.md")).toEqual(fileRef);
      expect(await hamt.get("d:src")).toEqual(dirRef);
      expect(await hamt.get("f:package.json")).toEqual(fileRef);
      expect(await hamt.get("d:tests")).toEqual(dirRef);
    });
  });

  describe("Key prefixing", () => {
    test("should prefix file entries with 'f:'", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(7),
        size: 500
      };

      // This test verifies the key is stored with prefix
      await hamt.insert("f:data.json", fileRef);
      
      // Should find with prefix
      expect(await hamt.get("f:data.json")).toBeDefined();
      
      // Should not find without prefix
      expect(await hamt.get("data.json")).toBeUndefined();
    });

    test("should prefix directory entries with 'd:'", async () => {
      const dirRef: DirRef = {
        link: {
          type: "fixed_hash_blake3",
          hash: new Uint8Array(32).fill(8)
        }
      };

      // This test verifies the key is stored with prefix
      await hamt.insert("d:lib", dirRef);
      
      // Should find with prefix
      expect(await hamt.get("d:lib")).toBeDefined();
      
      // Should not find without prefix
      expect(await hamt.get("lib")).toBeUndefined();
    });

    test("should prevent collision between file and dir with same name", async () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(9),
        size: 600,
        media_type: "text/plain"
      };

      const dirRef: DirRef = {
        link: {
          type: "fixed_hash_blake3",
          hash: new Uint8Array(32).fill(10)
        }
      };

      // Insert both file and directory with same base name
      await hamt.insert("f:config", fileRef);
      await hamt.insert("d:config", dirRef);

      // Both should be retrievable with their prefixes
      const retrievedFile = await hamt.get("f:config");
      const retrievedDir = await hamt.get("d:config");

      expect(retrievedFile).toEqual(fileRef);
      expect(retrievedDir).toEqual(dirRef);
      
      // They should be different entries
      expect(retrievedFile).not.toEqual(retrievedDir);
    });
  });
});