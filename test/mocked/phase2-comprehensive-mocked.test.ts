// test/fs/phase2-comprehensive-mocked.test.ts
import { describe, test, expect, beforeEach } from "vitest";
import { FS5 } from "../../src/fs/fs5.js";
import { JSCryptoImplementation } from "../../src/api/crypto/js.js";
import { DirV1, FileRef, DirRef } from "../../src/fs/dirv1/types.js";
import { DirV1Serialiser } from "../../src/fs/dirv1/serialisation.js";
import type { ListOptions, ListResult, PutOptions } from "../../src/fs/dirv1/types.js";

// Mock S5 API for comprehensive testing
class MockS5API {
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

// Mock identity
class MockIdentity {
  fsRootKey = new Uint8Array(32).fill(42);
}

// Extended FS5 with mocked directory operations
// @ts-ignore - overriding private methods for testing
class MockedFS5 extends FS5 {
  private directories: Map<string, DirV1> = new Map();
  private writeKeys: Map<string, Uint8Array> = new Map();

  constructor(api: any, identity: any) {
    super(api, identity);
    this.initializeRoot();
  }

  private initializeRoot() {
    // Create root directory
    const rootDir: DirV1 = {
      magic: "S5.pro",
      header: {},
      dirs: new Map([
        ["home", this.createDirRef()],
        ["archive", this.createDirRef()]
      ]),
      files: new Map()
    };
    this.directories.set('', rootDir);
    this.writeKeys.set('', new Uint8Array(32).fill(1));

    // Create home and archive directories
    const emptyDir: DirV1 = {
      magic: "S5.pro",
      header: {},
      dirs: new Map(),
      files: new Map()
    };
    this.directories.set('home', { ...emptyDir });
    this.directories.set('archive', { ...emptyDir });
  }

  private createDirRef(): DirRef {
    return {
      link: {
        type: 'fixed_hash_blake3',
        hash: new Uint8Array(32).fill(0)
      },
      ts_seconds: Math.floor(Date.now() / 1000)
    };
  }

  // Override _loadDirectory to use our mock
  // @ts-ignore - accessing private method for testing
  async _loadDirectory(path: string): Promise<DirV1 | undefined> {
    return this.directories.get(path);
  }

  // Override _updateDirectory to use our mock
  // @ts-ignore - accessing private method for testing
  async _updateDirectory(
    path: string,
    updater: (dir: DirV1, writeKey: Uint8Array) => Promise<DirV1 | undefined>
  ): Promise<void> {
    // Ensure parent directories exist
    const segments = path.split('/').filter(s => s);
    let currentPath = '';
    
    for (let i = 0; i < segments.length; i++) {
      const parentPath = currentPath;
      currentPath = segments.slice(0, i + 1).join('/');
      
      if (!this.directories.has(currentPath)) {
        // Create directory
        const newDir: DirV1 = {
          magic: "S5.pro",
          header: {},
          dirs: new Map(),
          files: new Map()
        };
        this.directories.set(currentPath, newDir);
        
        // Update parent
        const parent = this.directories.get(parentPath);
        if (parent) {
          parent.dirs.set(segments[i], this.createDirRef());
        }
      }
    }

    // Now update the target directory
    const dir = this.directories.get(path) || {
      magic: "S5.pro",
      header: {},
      dirs: new Map(),
      files: new Map()
    };
    
    const writeKey = this.writeKeys.get(path) || new Uint8Array(32).fill(1);
    const updated = await updater(dir, writeKey);
    
    if (updated) {
      this.directories.set(path, updated);
    }
  }

  // Override createDirectory
  async createDirectory(parentPath: string, name: string): Promise<DirRef> {
    const fullPath = parentPath ? `${parentPath}/${name}` : name;
    
    if (!this.directories.has(fullPath)) {
      const newDir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map()
      };
      this.directories.set(fullPath, newDir);
      
      // Update parent
      const parent = this.directories.get(parentPath || '');
      if (parent) {
        const dirRef = this.createDirRef();
        parent.dirs.set(name, dirRef);
        return dirRef;
      }
    }
    
    return this.createDirRef();
  }

  // Override to avoid permission issues
  async ensureIdentityInitialized(): Promise<void> {
    // Already initialized in constructor
  }
}

describe("Phase 2 - Comprehensive Tests", () => {
  let fs: MockedFS5;
  let api: MockS5API;

  beforeEach(async () => {
    api = new MockS5API();
    const identity = new MockIdentity();
    fs = new MockedFS5(api as any, identity as any);
  });

  describe("Unicode and Special Characters", () => {
    test("handles Chinese characters in paths", async () => {
      const chinesePath = "home/文档/我的文件.txt";
      const content = "Hello 你好";
      
      await fs.put(chinesePath, content);
      const retrieved = await fs.get(chinesePath);
      
      expect(retrieved).toBe(content);
      
      // Verify it appears in listing
      const items = [];
      for await (const item of fs.list("home/文档")) {
        items.push(item);
      }
      
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe("我的文件.txt");
    });

    test("handles Japanese characters in filenames", async () => {
      const files = [
        "home/docs/ファイル.txt",
        "home/docs/ドキュメント.json",
        "home/docs/画像.png"
      ];
      
      for (const path of files) {
        await fs.put(path, `Content of ${path}`);
      }
      
      const items = [];
      for await (const item of fs.list("home/docs")) {
        items.push(item);
      }
      
      expect(items).toHaveLength(3);
      expect(items.map(i => i.name)).toContain("ファイル.txt");
    });

    test("handles emoji in filenames", async () => {
      const emojiFiles = [
        "home/emoji/🚀rocket.txt",
        "home/emoji/❤️heart.json",
        "home/emoji/🎉party🎊.md"
      ];
      
      for (const path of emojiFiles) {
        await fs.put(path, "emoji content");
      }
      
      // Test retrieval
      const content = await fs.get("home/emoji/🚀rocket.txt");
      expect(content).toBe("emoji content");
      
      // Test listing
      const items = [];
      for await (const item of fs.list("home/emoji")) {
        items.push(item);
      }
      
      expect(items).toHaveLength(3);
    });

    test("handles RTL text (Arabic/Hebrew) in paths", async () => {
      const arabicPath = "home/مستندات/ملف.txt";
      const hebrewPath = "home/מסמכים/קובץ.txt";
      
      await fs.put(arabicPath, "Arabic content مرحبا");
      await fs.put(hebrewPath, "Hebrew content שלום");
      
      expect(await fs.get(arabicPath)).toBe("Arabic content مرحبا");
      expect(await fs.get(hebrewPath)).toBe("Hebrew content שלום");
    });

    test("handles special characters in filenames", async () => {
      const specialFiles = [
        "home/special/file@email.txt",
        "home/special/report#1.pdf",
        "home/special/data$money.json",
        "home/special/test%percent.md",
        "home/special/doc&report.txt",
        "home/special/file(1).txt",
        "home/special/file[bracket].txt",
        "home/special/file{brace}.txt"
      ];
      
      for (const path of specialFiles) {
        await fs.put(path, `Content: ${path}`);
      }
      
      // Verify all files can be retrieved
      for (const path of specialFiles) {
        const content = await fs.get(path);
        // PDF files should return as binary
        if (path.endsWith('.pdf')) {
          expect(content).toBeInstanceOf(Uint8Array);
          // Verify the content is correct by decoding it
          const text = new TextDecoder().decode(content);
          expect(text).toBe(`Content: ${path}`);
        } else {
          expect(content).toBe(`Content: ${path}`);
        }
      }
      
      // Check listing
      const items = [];
      for await (const item of fs.list("home/special")) {
        items.push(item);
      }
      
      expect(items).toHaveLength(specialFiles.length);
    });

    test("handles files with spaces in names", async () => {
      const spacedFiles = [
        "home/spaced/my file.txt",
        "home/spaced/another  file.txt", // double space
        "home/spaced/ leading.txt",
        "home/spaced/trailing .txt"
      ];
      
      for (const path of spacedFiles) {
        await fs.put(path, "spaced content");
      }
      
      for (const path of spacedFiles) {
        expect(await fs.get(path)).toBe("spaced content");
      }
    });

    test("handles mixed character sets in single path", async () => {
      const mixedPath = "home/mixed/Hello世界_مرحبا_שלום🌍.txt";
      
      await fs.put(mixedPath, "Global content");
      expect(await fs.get(mixedPath)).toBe("Global content");
      
      const metadata = await fs.getMetadata(mixedPath);
      expect(metadata?.name).toBe("Hello世界_مرحبا_שלום🌍.txt");
    });
  });

  describe("Path Resolution Edge Cases", () => {
    test("handles paths with multiple consecutive slashes", async () => {
      const paths = [
        "home///documents///file.txt",
        "home//test//nested//deep.json",
        "//home/files//data.bin"
      ];
      
      for (const messyPath of paths) {
        await fs.put(messyPath, "content");
        
        // Should be accessible via normalized path
        const normalizedPath = messyPath.replace(/\/+/g, '/').replace(/^\//, '');
        const content = await fs.get(normalizedPath);
        
        // .bin files should return as binary
        if (normalizedPath.endsWith('.bin')) {
          expect(content).toBeInstanceOf(Uint8Array);
          // Verify the content is correct by decoding it
          const text = new TextDecoder().decode(content);
          expect(text).toBe("content");
        } else {
          expect(content).toBe("content");
        }
      }
    });

    test("handles paths with trailing slashes", async () => {
      await fs.put("home/trail/file.txt", "trailing test");
      
      // Directory paths with trailing slash
      const items1 = [];
      for await (const item of fs.list("home/trail/")) {
        items1.push(item);
      }
      
      const items2 = [];
      for await (const item of fs.list("home/trail")) {
        items2.push(item);
      }
      
      expect(items1).toHaveLength(items2.length);
      expect(items1[0]?.name).toBe(items2[0]?.name);
    });

    test("handles dots in filenames and paths", async () => {
      const dotFiles = [
        "home/dots/.hidden",
        "home/dots/..doubledot",
        "home/dots/file.tar.gz",
        "home/dots/file...multiple.dots"
      ];
      
      for (const path of dotFiles) {
        await fs.put(path, "dot content");
      }
      
      const items = [];
      for await (const item of fs.list("home/dots")) {
        items.push(item.name);
      }
      
      expect(items).toContain(".hidden");
      expect(items).toContain("..doubledot");
      expect(items).toContain("file.tar.gz");
      expect(items).toContain("file...multiple.dots");
    });

    test("preserves case sensitivity", async () => {
      const casePaths = [
        "home/case/File.txt",
        "home/case/file.txt",
        "home/case/FILE.txt",
        "home/case/FiLe.txt"
      ];
      
      // Store different content in each
      for (let i = 0; i < casePaths.length; i++) {
        await fs.put(casePaths[i], `Content ${i}`);
      }
      
      // Verify each has unique content
      for (let i = 0; i < casePaths.length; i++) {
        const content = await fs.get(casePaths[i]);
        expect(content).toBe(`Content ${i}`);
      }
      
      // List should show all variants
      const items = [];
      for await (const item of fs.list("home/case")) {
        items.push(item.name);
      }
      
      expect(items).toHaveLength(4);
      expect(new Set(items).size).toBe(4);
    });
  });

  describe("Error Handling and Edge Cases", () => {
    test("handles non-existent parent directories gracefully", async () => {
      const result = await fs.get("home/does/not/exist/file.txt");
      expect(result).toBeUndefined();
      
      const metadata = await fs.getMetadata("home/does/not/exist");
      expect(metadata).toBeUndefined();
      
      const deleted = await fs.delete("home/does/not/exist/file.txt");
      expect(deleted).toBe(false);
    });

    test("handles empty string paths appropriately", async () => {
      // Empty path should list root
      const rootItems = [];
      for await (const item of fs.list("")) {
        rootItems.push(item.name);
      }
      
      expect(rootItems).toContain("home");
      expect(rootItems).toContain("archive");
    });

    test("handles null and undefined data gracefully", async () => {
      // These should be converted to empty strings
      await fs.put("home/null.txt", null as any);
      await fs.put("home/undefined.txt", undefined as any);
      
      const content1 = await fs.get("home/null.txt");
      expect(content1).toBe('');
      
      const content2 = await fs.get("home/undefined.txt");
      expect(content2).toBe('');
    });

    test("handles corrupted cursor gracefully", async () => {
      // Create some files
      for (let i = 0; i < 10; i++) {
        await fs.put(`home/corrupt-test/file${i}.txt`, `content${i}`);
      }
      
      const corruptedCursors = [
        "not-base64!@#$",
        btoa("invalid-cbor-data"),
        btoa(JSON.stringify({ wrong: "format" })),
        "SGVsbG8gV29ybGQ", // Valid base64 but not cursor data
      ];
      
      for (const badCursor of corruptedCursors) {
        let error: Error | undefined;
        try {
          const items = [];
          for await (const item of fs.list("home/corrupt-test", { cursor: badCursor })) {
            items.push(item);
          }
        } catch (e) {
          error = e as Error;
        }
        
        expect(error).toBeDefined();
        expect(error?.message).toContain("cursor");
      }
    });
  });

  describe("Data Type Handling", () => {
    test("correctly handles various object types", async () => {
      const testObjects = [
        { simple: "object" },
        { nested: { deep: { value: 42 } } },
        { array: [1, 2, 3, 4, 5] },
        { mixed: { str: "hello", num: 123, bool: true, nil: null } },
        { date: new Date().toISOString() },
        { unicode: { text: "Hello 世界 🌍" } },
        { empty: {} },
        { bigNumber: 9007199254740991 }, // MAX_SAFE_INTEGER
      ];
      
      for (let i = 0; i < testObjects.length; i++) {
        const path = `home/objects/test${i}.json`;
        await fs.put(path, testObjects[i]);
        
        const retrieved = await fs.get(path);
        expect(retrieved).toEqual(testObjects[i]);
      }
    });

    test("handles binary data of various sizes", async () => {
      const sizes = [0, 1, 100, 1024, 65536]; // Skip 1MB for speed
      
      for (const size of sizes) {
        const data = new Uint8Array(size);
        // Fill with pattern
        for (let i = 0; i < size; i++) {
          data[i] = i % 256;
        }
        
        const path = `home/binary/size_${size}.bin`;
        await fs.put(path, data);
        
        const retrieved = await fs.get(path);
        expect(retrieved).toBeInstanceOf(Uint8Array);
        expect(new Uint8Array(retrieved)).toEqual(data);
      }
    });

    test("preserves data types through round trips", async () => {
      const typeTests = [
        { path: "home/types/string.txt", data: "plain string", expectedType: "string" },
        { path: "home/types/number.json", data: { value: 42 }, expectedType: "object" },
        { path: "home/types/binary.bin", data: new Uint8Array([1, 2, 3]), expectedType: "Uint8Array" },
        { path: "home/types/boolean.json", data: { flag: true }, expectedType: "object" },
        { path: "home/types/array.json", data: [1, "two", { three: 3 }], expectedType: "object" },
      ];
      
      for (const test of typeTests) {
        await fs.put(test.path, test.data);
        const retrieved = await fs.get(test.path);
        
        if (test.expectedType === "Uint8Array") {
          expect(retrieved).toBeInstanceOf(Uint8Array);
        } else if (test.expectedType === "object") {
          expect(typeof retrieved).toBe("object");
          expect(retrieved).toEqual(test.data);
        } else {
          expect(typeof retrieved).toBe(test.expectedType);
        }
      }
    });
  });

  describe("Media Type and Metadata", () => {
    test("correctly infers media types from extensions", async () => {
      const files = [
        { path: "home/media/doc.pdf", expectedType: "application/pdf" },
        { path: "home/media/image.jpg", expectedType: "image/jpeg" },
        { path: "home/media/image.jpeg", expectedType: "image/jpeg" },
        { path: "home/media/image.png", expectedType: "image/png" },
        { path: "home/media/page.html", expectedType: "text/html" },
        { path: "home/media/style.css", expectedType: "text/css" },
        { path: "home/media/script.js", expectedType: "application/javascript" },
        { path: "home/media/data.json", expectedType: "application/json" },
        { path: "home/media/video.mp4", expectedType: "video/mp4" },
        { path: "home/media/audio.mp3", expectedType: "audio/mpeg" },
        { path: "home/media/archive.zip", expectedType: "application/zip" },
      ];
      
      for (const file of files) {
        await fs.put(file.path, "dummy content");
        const metadata = await fs.getMetadata(file.path);
        expect(metadata?.mediaType).toBe(file.expectedType);
      }
    });

    test("preserves custom timestamps", async () => {
      const timestamps = [
        Date.now() - 86400000 * 365, // 1 year ago
        Date.now() - 86400000 * 30,  // 30 days ago
        Date.now() - 3600000,         // 1 hour ago
        Date.now(),                   // now
        Date.now() + 3600000,         // 1 hour future
      ];
      
      for (let i = 0; i < timestamps.length; i++) {
        await fs.put(`home/timestamps/file${i}.txt`, "content", {
          timestamp: timestamps[i]
        });
        
        const metadata = await fs.getMetadata(`home/timestamps/file${i}.txt`);
        // S5 stores timestamps in seconds, so we lose millisecond precision
        // We need to compare at second precision
        const expectedTimestamp = new Date(Math.floor(timestamps[i] / 1000) * 1000).toISOString();
        expect(metadata?.timestamp).toBe(expectedTimestamp);
      }
    });

    test("handles files with no extension", async () => {
      const noExtFiles = [
        "home/noext/README",
        "home/noext/Makefile",
        "home/noext/LICENSE",
        "home/noext/CHANGELOG"
      ];
      
      for (const path of noExtFiles) {
        await fs.put(path, "content without extension");
        const metadata = await fs.getMetadata(path);
        expect(metadata).toBeDefined();
        expect(metadata?.name).toBe(path.split('/').pop());
      }
    });
  });

  describe("Cursor Pagination", () => {
    test("handles cursor at exact page boundaries", async () => {
      // Create exactly 30 files
      for (let i = 0; i < 30; i++) {
        await fs.put(`home/boundaries/file_${i.toString().padStart(2, '0')}.txt`, `${i}`);
      }
      
      // Get pages of exactly 10 items
      const pages: string[][] = [];
      let cursor: string | undefined;
      
      for (let page = 0; page < 3; page++) {
        const pageItems: string[] = [];
        
        for await (const item of fs.list("home/boundaries", { cursor, limit: 10 })) {
          pageItems.push(item.name);
          cursor = item.cursor;
        }
        
        pages.push(pageItems);
      }
      
      expect(pages[0]).toHaveLength(10);
      expect(pages[1]).toHaveLength(10);
      expect(pages[2]).toHaveLength(10);
      
      // Verify no duplicates across pages
      const allItems = pages.flat();
      expect(new Set(allItems).size).toBe(30);
    });

    test("cursor remains valid after new files added", async () => {
      // Create initial files
      for (let i = 0; i < 10; i++) {
        await fs.put(`home/dynamic/initial_${i}.txt`, `Initial ${i}`);
      }
      
      // Get cursor at position 5
      let cursor: string | undefined;
      let count = 0;
      
      for await (const item of fs.list("home/dynamic")) {
        if (count === 5) {
          cursor = item.cursor;
          break;
        }
        count++;
      }
      
      expect(cursor).toBeDefined();
      
      // Add new files that sort after cursor position
      for (let i = 0; i < 5; i++) {
        await fs.put(`home/dynamic/new_${i}.txt`, `New ${i}`);
      }
      
      // Resume from cursor - should see remaining initials plus new files
      const remainingItems: string[] = [];
      for await (const item of fs.list("home/dynamic", { cursor })) {
        remainingItems.push(item.name);
      }
      
      expect(remainingItems.length).toBeGreaterThanOrEqual(9); // 4 initial + 5 new
      expect(remainingItems).toContain("new_0.txt");
    });
  });
});