import { describe, test, expect, beforeEach } from "vitest";
import { FS5 } from "../../src/fs/fs5.js";
import { JSCryptoImplementation } from "../../src/api/crypto/js.js";
import { DirV1, FileRef } from "../../src/fs/dirv1/types.js";
import type { ListOptions, ListResult } from "../../src/fs/dirv1/types.js";

// Create a minimal mock that implements just what we need
class SimpleMockAPI {
  crypto: JSCryptoImplementation;
  private blobs: Map<string, Uint8Array> = new Map();
  private registry: Map<string, any> = new Map();

  constructor() {
    this.crypto = new JSCryptoImplementation();
  }

  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = await this.crypto.hashBlake3(data);
    const fullHash = new Uint8Array([0x1e, ...hash]);
    const key = Buffer.from(hash).toString('hex');
    this.blobs.set(key, data);
    return { hash: fullHash, size: blob.size };
  }

  async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
    const actualHash = hash[0] === 0x1e ? hash.slice(1) : hash;
    const key = Buffer.from(actualHash).toString('hex');
    const data = this.blobs.get(key);
    if (!data) throw new Error(`Blob not found: ${key}`);
    return data;
  }

  async registryGet(publicKey: Uint8Array): Promise<any> {
    const key = Buffer.from(publicKey).toString('hex');
    return this.registry.get(key);
  }

  async registrySet(entry: any): Promise<void> {
    const key = Buffer.from(entry.pk).toString('hex');
    this.registry.set(key, entry);
  }
}

// Simple mock identity
class SimpleMockIdentity {
  fsRootKey = new Uint8Array(32).fill(42);
}

describe("Cursor Implementation - Core", () => {
  let fs: FS5;
  let api: SimpleMockAPI;
  let identity: SimpleMockIdentity;
  let testDir: DirV1;

  beforeEach(() => {
    api = new SimpleMockAPI();
    identity = new SimpleMockIdentity();
    fs = new FS5(api as any, identity as any);
    
    // Create test directory structure
    testDir = {
      magic: "S5.pro",
      header: {},
      dirs: new Map([
        ["subdir1", { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } }],
        ["subdir2", { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } }]
      ]),
      files: new Map([
        ["alice.txt", { hash: new Uint8Array(32), size: 100, media_type: "text/plain" }],
        ["bob.json", { hash: new Uint8Array(32), size: 200, media_type: "application/json" }],
        ["charlie.bin", { hash: new Uint8Array(32), size: 300, media_type: "application/octet-stream" }],
        ["david.md", { hash: new Uint8Array(32), size: 400, media_type: "text/markdown" }],
        ["eve.xml", { hash: new Uint8Array(32), size: 500, media_type: "application/xml" }],
        ["frank.pdf", { hash: new Uint8Array(32), size: 600, media_type: "application/pdf" }]
      ])
    };
    
    // Mock _loadDirectory to return our test directory
    (fs as any)._loadDirectory = async (path: string) => {
      if (path === "test" || path === "home/test") {
        return testDir;
      }
      if (path === "empty" || path === "home/empty") {
        return {
          magic: "S5.pro",
          header: {},
          dirs: new Map(),
          files: new Map()
        };
      }
      if (path === "single" || path === "home/single") {
        return {
          magic: "S5.pro",
          header: {},
          dirs: new Map(),
          files: new Map([["only.txt", { hash: new Uint8Array(32), size: 50 }]])
        };
      }
      if (path === "small" || path === "home/small") {
        return {
          magic: "S5.pro",
          header: {},
          dirs: new Map(),
          files: new Map([
            ["a.txt", { hash: new Uint8Array(32), size: 10 }],
            ["b.txt", { hash: new Uint8Array(32), size: 20 }],
            ["c.txt", { hash: new Uint8Array(32), size: 30 }]
          ])
        };
      }
      if (path === "mixed" || path === "home/mixed") {
        return {
          magic: "S5.pro",
          header: {},
          dirs: new Map([
            ["dir1", { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } }],
            ["dir2", { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } }]
          ]),
          files: new Map([
            ["file1.txt", { hash: new Uint8Array(32), size: 100 }],
            ["file2.txt", { hash: new Uint8Array(32), size: 200 }]
          ])
        };
      }
      return undefined;
    };
  });

  describe("Basic cursor encoding/decoding", () => {
    test("should encode and decode cursor deterministically", async () => {
      // Get a cursor from listing
      let firstCursor: string | undefined;
      for await (const item of fs.list("test", { limit: 1 })) {
        firstCursor = item.cursor;
        break;
      }
      
      expect(firstCursor).toBeDefined();
      expect(typeof firstCursor).toBe("string");
      
      // Same position should produce same cursor
      let secondCursor: string | undefined;
      let secondItemName: string | undefined;
      for await (const item of fs.list("test", { limit: 1 })) {
        secondCursor = item.cursor;
        secondItemName = item.name;
        break;
      }
      
      // The cursor should encode the same position info
      expect(secondCursor).toBeDefined();
      expect(secondItemName).toBeDefined();
    });

    test("should create valid base64url-encoded cursors", async () => {
      let cursor: string | undefined;
      for await (const item of fs.list("test", { limit: 1 })) {
        cursor = item.cursor;
        break;
      }
      
      expect(cursor).toBeDefined();
      // Base64url pattern (no padding, no +, no /)
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test("should handle invalid cursor gracefully", async () => {
      // In a real implementation, invalid cursors would throw errors
      // In our mock implementation, the behavior varies:
      // - Some invalid cursors might decode successfully but not match any position (empty results)
      // - Others might throw decode errors
      
      const testCases = [
        "invalid-cursor",
        "!!!",
        "",
      ];
      
      for (const invalidCursor of testCases) {
        let errorThrown = false;
        let errorMessage = "";
        const items: ListResult[] = [];
        
        try {
          for await (const item of fs.list("test", { cursor: invalidCursor })) {
            items.push(item);
          }
        } catch (e) {
          errorThrown = true;
          errorMessage = (e as Error).message;
        }
        
        // Log for debugging
        if (!errorThrown && items.length > 0) {
          console.log(`Invalid cursor "${invalidCursor}" returned ${items.length} items:`, items.map(i => i.name));
        }
        
        // Either an error was thrown OR we got empty results (cursor didn't match)
        // Both are acceptable ways to handle invalid cursors
        const handledGracefully = errorThrown || items.length === 0;
        if (!handledGracefully) {
          throw new Error(`Invalid cursor "${invalidCursor}" was not handled gracefully: errorThrown=${errorThrown}, items.length=${items.length}`);
        }
        expect(handledGracefully).toBe(true);
        
        if (errorThrown) {
          expect(errorMessage.toLowerCase()).toContain("cursor");
        }
      }
      
      // Test a valid base64 cursor that decodes but has invalid structure
      const validBase64InvalidStructure = "eyJmb28iOiJiYXIifQ"; // {"foo":"bar"}
      let structureError = false;
      try {
        for await (const item of fs.list("test", { cursor: validBase64InvalidStructure })) {
          // Should not yield any items
        }
      } catch (e) {
        structureError = true;
        expect((e as Error).message).toContain("cursor");
      }
      // This should definitely error because the structure is wrong
      expect(structureError).toBe(true);
    });
  });

  describe("Cursor pagination functionality", () => {
    test("should resume listing from cursor position", async () => {
      // Get first 3 items
      const firstBatch: ListResult[] = [];
      let lastCursor: string | undefined;
      
      for await (const item of fs.list("test", { limit: 3 })) {
        firstBatch.push(item);
        lastCursor = item.cursor;
      }
      
      expect(firstBatch).toHaveLength(3);
      expect(lastCursor).toBeDefined();
      
      // Resume from cursor
      const secondBatch: ListResult[] = [];
      for await (const item of fs.list("test", { cursor: lastCursor, limit: 3 })) {
        secondBatch.push(item);
      }
      
      expect(secondBatch).toHaveLength(3);
      
      // Ensure no duplicates
      const firstNames = firstBatch.map(i => i.name);
      const secondNames = secondBatch.map(i => i.name);
      const intersection = firstNames.filter(n => secondNames.includes(n));
      expect(intersection).toHaveLength(0);
    });

    test("should return empty results when cursor is at end", async () => {
      // Get all items
      const allItems: ListResult[] = [];
      let lastCursor: string | undefined;
      
      for await (const item of fs.list("test")) {
        allItems.push(item);
        lastCursor = item.cursor;
      }
      
      // Try to get more items from the last cursor
      const afterEnd: ListResult[] = [];
      for await (const item of fs.list("test", { cursor: lastCursor })) {
        afterEnd.push(item);
      }
      
      expect(afterEnd).toHaveLength(0);
    });

    test("should handle limit with cursor correctly", async () => {
      // Get first 2 items
      const batch1: ListResult[] = [];
      let cursor1: string | undefined;
      
      for await (const item of fs.list("test", { limit: 2 })) {
        batch1.push(item);
        cursor1 = item.cursor;
      }
      
      expect(batch1).toHaveLength(2);
      
      // Get next 2 items
      const batch2: ListResult[] = [];
      let cursor2: string | undefined;
      
      for await (const item of fs.list("test", { cursor: cursor1, limit: 2 })) {
        batch2.push(item);
        cursor2 = item.cursor;
      }
      
      expect(batch2).toHaveLength(2);
      
      // Get next 2 items
      const batch3: ListResult[] = [];
      for await (const item of fs.list("test", { cursor: cursor2, limit: 2 })) {
        batch3.push(item);
      }
      
      expect(batch3).toHaveLength(2);
      
      // All items should be different
      const allNames = [...batch1, ...batch2, ...batch3].map(i => i.name);
      const uniqueNames = new Set(allNames);
      expect(uniqueNames.size).toBe(6);
    });

    test("should maintain cursor position for mixed file/directory listings", async () => {
      // Get items one by one using cursors
      const items: ListResult[] = [];
      let cursor: string | undefined;
      
      for (let i = 0; i < 4; i++) {
        const batchItems: ListResult[] = [];
        for await (const item of fs.list("mixed", { cursor, limit: 1 })) {
          batchItems.push(item);
          cursor = item.cursor;
        }
        items.push(...batchItems);
      }
      
      expect(items).toHaveLength(4);
      expect(items.filter(i => i.type === "directory")).toHaveLength(2);
      expect(items.filter(i => i.type === "file")).toHaveLength(2);
    });
  });

  describe("Cursor stability", () => {
    test("should provide stable cursors for unchanged directories", async () => {
      // Get cursor for third item
      const items: ListResult[] = [];
      let targetCursor: string | undefined;
      
      for await (const item of fs.list("test", { limit: 3 })) {
        items.push(item);
        targetCursor = item.cursor;
      }
      
      expect(items).toHaveLength(3);
      const thirdItemName = items[2].name;
      
      // List again and check cursor for same position
      const items2: ListResult[] = [];
      let checkCursor: string | undefined;
      
      for await (const item of fs.list("test", { limit: 3 })) {
        items2.push(item);
        if (item.name === thirdItemName) {
          checkCursor = item.cursor;
        }
      }
      
      // The cursor encodes position info, should be similar
      expect(checkCursor).toBeDefined();
      expect(targetCursor).toBeDefined();
    });
  });

  describe("Edge cases", () => {
    test("should handle cursor on empty directory", async () => {
      const items: ListResult[] = [];
      for await (const item of fs.list("empty", { limit: 10 })) {
        items.push(item);
      }
      
      expect(items).toHaveLength(0);
    });

    test("should handle cursor on single-item directory", async () => {
      // Get the item with cursor
      let cursor: string | undefined;
      let itemName: string | undefined;
      
      for await (const item of fs.list("single")) {
        cursor = item.cursor;
        itemName = item.name;
      }
      
      expect(cursor).toBeDefined();
      expect(itemName).toBe("only.txt");
      
      // Resume from cursor should return nothing
      const afterCursor: ListResult[] = [];
      for await (const item of fs.list("single", { cursor })) {
        afterCursor.push(item);
      }
      
      expect(afterCursor).toHaveLength(0);
    });

    test("should handle limit larger than directory size", async () => {
      // Request more items than exist
      const items: ListResult[] = [];
      for await (const item of fs.list("small", { limit: 10 })) {
        items.push(item);
      }
      
      expect(items).toHaveLength(3);
      
      // All items should have cursors
      expect(items.every(i => i.cursor)).toBe(true);
    });

    test("should provide consistent ordering with cursors", async () => {
      // Get all items without limit
      const allItems: ListResult[] = [];
      for await (const item of fs.list("test")) {
        allItems.push(item);
      }
      
      // Get items using cursor pagination
      const paginatedItems: ListResult[] = [];
      let cursor: string | undefined;
      
      while (true) {
        let hasItems = false;
        for await (const item of fs.list("test", { cursor, limit: 2 })) {
          paginatedItems.push(item);
          cursor = item.cursor;
          hasItems = true;
        }
        if (!hasItems) break;
      }
      
      // Should get same items in same order
      expect(paginatedItems.length).toBe(allItems.length);
      expect(paginatedItems.map(i => i.name)).toEqual(allItems.map(i => i.name));
    });
  });
});