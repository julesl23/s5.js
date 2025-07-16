import { describe, test, expect, beforeEach } from "vitest";
import { FS5 } from "../../src/fs/fs5.js";
import { JSCryptoImplementation } from "../../src/api/crypto/js.js";
import { DirV1, FileRef } from "../../src/fs/dirv1/types.js";
import { DirV1Serialiser } from "../../src/fs/dirv1/serialisation.js";
import { createRegistryEntry } from "../../src/registry/entry.js";

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

describe("Path-Based API - Simple Integration", () => {
  let fs: FS5;
  let api: SimpleMockAPI;
  let identity: SimpleMockIdentity;

  beforeEach(() => {
    api = new SimpleMockAPI();
    identity = new SimpleMockIdentity();
    fs = new FS5(api as any, identity as any);
  });

  test("should perform basic put and get operations", async () => {
    // Override internal methods to bypass complex registry operations
    const mockDir: DirV1 = {
      magic: "S5.pro",
      header: {},
      dirs: new Map(),
      files: new Map()
    };

    let currentDir = mockDir;

    // Mock _loadDirectory
    (fs as any)._loadDirectory = async (path: string) => {
      return currentDir;
    };

    // Mock _updateDirectory to just update our in-memory directory
    (fs as any)._updateDirectory = async (path: string, updater: any) => {
      const result = await updater(currentDir, new Uint8Array(32));
      if (result) {
        currentDir = result;
      }
    };

    // Test put
    await fs.put("test.txt", "Hello, world!");
    
    // Verify the file was added to the directory
    expect(currentDir.files.has("test.txt")).toBe(true);
    const fileRef = currentDir.files.get("test.txt")!;
    expect(fileRef.media_type).toBe("text/plain");
    
    // Test get
    const result = await fs.get("test.txt");
    expect(result).toBe("Hello, world!");
  });

  test("should handle nested paths", async () => {
    const directories: Map<string, DirV1> = new Map();
    
    // Initialize root directory
    directories.set("", {
      magic: "S5.pro",
      header: {},
      dirs: new Map([["home", { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } }]]),
      files: new Map()
    });
    
    directories.set("home", {
      magic: "S5.pro",
      header: {},
      dirs: new Map(),
      files: new Map()
    });

    // Mock _loadDirectory
    (fs as any)._loadDirectory = async (path: string) => {
      return directories.get(path || "");
    };

    // Mock _updateDirectory
    (fs as any)._updateDirectory = async (path: string, updater: any) => {
      // Handle intermediate directory creation
      const segments = path.split('/').filter(s => s);
      
      // Ensure all parent directories exist
      for (let i = 0; i < segments.length; i++) {
        const currentPath = segments.slice(0, i + 1).join('/');
        const parentPath = segments.slice(0, i).join('/') || '';
        const dirName = segments[i];
        
        if (!directories.has(currentPath)) {
          // Create the directory
          const newDir: DirV1 = {
            magic: "S5.pro",
            header: {},
            dirs: new Map(),
            files: new Map()
          };
          directories.set(currentPath, newDir);
          
          // Update parent to reference this directory
          const parent = directories.get(parentPath);
          if (parent) {
            parent.dirs.set(dirName, {
              link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) }
            });
          }
        }
      }
      
      // Now update the target directory
      const dir = directories.get(path || "") || {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map()
      };
      
      const result = await updater(dir, new Uint8Array(32));
      if (result) {
        directories.set(path || "", result);
      }
    };

    // Mock createDirectory to create intermediate directories
    (fs as any).createDirectory = async (parentPath: string, name: string) => {
      const parent = directories.get(parentPath || "");
      if (parent) {
        const newDir: DirV1 = {
          magic: "S5.pro",
          header: {},
          dirs: new Map(),
          files: new Map()
        };
        directories.set(parentPath ? `${parentPath}/${name}` : name, newDir);
        parent.dirs.set(name, { 
          link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } 
        });
      }
    };

    // Test nested put
    await fs.put("home/docs/readme.txt", "Documentation");
    
    // Verify intermediate directory was created
    const homeDir = directories.get("home");
    expect(homeDir?.dirs.has("docs")).toBe(true);
    
    // Verify file exists
    const docsDir = directories.get("home/docs");
    expect(docsDir?.files.has("readme.txt")).toBe(true);
    
    // Test get
    const content = await fs.get("home/docs/readme.txt");
    expect(content).toBe("Documentation");
  });

  test("should list files and directories", async () => {
    const testDir: DirV1 = {
      magic: "S5.pro",
      header: {},
      dirs: new Map([
        ["subdir1", { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } }],
        ["subdir2", { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } }]
      ]),
      files: new Map([
        ["file1.txt", { hash: new Uint8Array(32), size: 100, media_type: "text/plain" }],
        ["file2.json", { hash: new Uint8Array(32), size: 200, media_type: "application/json" }]
      ])
    };

    (fs as any)._loadDirectory = async () => testDir;

    const items = [];
    for await (const item of fs.list("home")) {
      items.push(item);
    }

    expect(items).toHaveLength(4);
    
    const files = items.filter(i => i.type === 'file');
    const dirs = items.filter(i => i.type === 'directory');
    
    expect(files).toHaveLength(2);
    expect(dirs).toHaveLength(2);
    
    expect(files.map(f => f.name).sort()).toEqual(["file1.txt", "file2.json"]);
    expect(dirs.map(d => d.name).sort()).toEqual(["subdir1", "subdir2"]);
  });

  test("should delete files and directories", async () => {
    const testDir: DirV1 = {
      magic: "S5.pro",
      header: {},
      dirs: new Map([["emptydir", { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } }]]),
      files: new Map([["deleteme.txt", { hash: new Uint8Array(32), size: 100 }]])
    };

    const emptyDir: DirV1 = {
      magic: "S5.pro",
      header: {},
      dirs: new Map(),
      files: new Map()
    };

    let currentDir = testDir;

    (fs as any)._loadDirectory = async (path: string) => {
      if (path === "home/emptydir") return emptyDir;
      return currentDir;
    };

    (fs as any)._updateDirectory = async (path: string, updater: any) => {
      const result = await updater(currentDir, new Uint8Array(32));
      if (result) {
        currentDir = result;
      }
    };

    // Delete file
    const deletedFile = await fs.delete("home/deleteme.txt");
    expect(deletedFile).toBe(true);
    expect(currentDir.files.has("deleteme.txt")).toBe(false);

    // Delete directory
    const deletedDir = await fs.delete("home/emptydir");
    expect(deletedDir).toBe(true);
    expect(currentDir.dirs.has("emptydir")).toBe(false);

    // Try to delete non-existent
    const notDeleted = await fs.delete("home/doesnotexist");
    expect(notDeleted).toBe(false);
  });

  test("should get metadata for files and directories", async () => {
    const testDir: DirV1 = {
      magic: "S5.pro",
      header: {},
      dirs: new Map([["subdir", { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) }, ts_seconds: 1234567890 }]]),
      files: new Map([
        ["test.txt", { 
          hash: new Uint8Array(32), 
          size: 42, 
          media_type: "text/plain",
          timestamp: 1234567890
        }]
      ])
    };

    const subDir: DirV1 = {
      magic: "S5.pro",
      header: {},
      dirs: new Map(),
      files: new Map([["inner.txt", { hash: new Uint8Array(32), size: 10 }]])
    };

    (fs as any)._loadDirectory = async (path: string) => {
      if (path === "home/subdir") return subDir;
      if (path === "home" || path === "") return testDir;
      return undefined;
    };

    // Get file metadata
    const fileMeta = await fs.getMetadata("home/test.txt");
    expect(fileMeta).toEqual({
      type: 'file',
      name: 'test.txt',
      size: 42,
      mediaType: 'text/plain',
      timestamp: 1234567890
    });

    // Get directory metadata
    const dirMeta = await fs.getMetadata("home/subdir");
    expect(dirMeta).toEqual({
      type: 'directory',
      name: 'subdir',
      fileCount: 1,
      directoryCount: 0,
      timestamp: 1234567890
    });

    // Get non-existent metadata
    const notFound = await fs.getMetadata("home/missing");
    expect(notFound).toBeUndefined();
  });
});