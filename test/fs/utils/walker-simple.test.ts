import { describe, it, expect, beforeEach } from 'vitest';
import { DirectoryWalker, WalkOptions, WalkResult, WalkStats } from '../../../src/fs/utils/walker.js';
import { FS5 } from '../../../src/fs/fs5.js';
import { FileRef, DirRef, ListOptions } from '../../../src/fs/dirv1/types.js';

// Create a mock FS5 that simulates a directory structure
class MockFS5 {
  private structure: Map<string, { files: Map<string, FileRef>, dirs: Map<string, DirRef> }> = new Map();

  constructor() {
    // Initialize with test data
    this.structure.set('home/test', { 
      files: new Map([
        ['file1.txt', { hash: new Uint8Array(32), size: 8 }],
        ['file2.txt', { hash: new Uint8Array(32), size: 8 }]
      ]),
      dirs: new Map([
        ['dir1', { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } }],
        ['dir2', { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } }],
        ['empty', { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } }]
      ])
    });
    
    this.structure.set('home/test/dir1', {
      files: new Map([
        ['file3.txt', { hash: new Uint8Array(32), size: 8 }],
        ['file4.txt', { hash: new Uint8Array(32), size: 8 }]
      ]),
      dirs: new Map([
        ['subdir', { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } }]
      ])
    });
    
    this.structure.set('home/test/dir1/subdir', {
      files: new Map([
        ['file5.txt', { hash: new Uint8Array(32), size: 8 }]
      ]),
      dirs: new Map()
    });
    
    this.structure.set('home/test/dir2', {
      files: new Map([
        ['file6.txt', { hash: new Uint8Array(32), size: 8 }]
      ]),
      dirs: new Map()
    });
    
    this.structure.set('home/test/empty', {
      files: new Map([
        ['.gitkeep', { hash: new Uint8Array(32), size: 0 }]
      ]),
      dirs: new Map()
    });
  }

  async *list(path: string, options?: ListOptions): AsyncIterableIterator<{ name: string; value: FileRef | DirRef; cursor?: Uint8Array }> {
    const dir = this.structure.get(path);
    if (!dir) {
      throw new Error(`Directory ${path} not found`);
    }
    
    let allEntries: Array<[string, FileRef | DirRef]> = [];
    
    // Add files
    for (const [name, file] of dir.files.entries()) {
      allEntries.push([name, file]);
    }
    
    // Add directories
    for (const [name, dirRef] of dir.dirs.entries()) {
      allEntries.push([name, dirRef]);
    }
    
    // Sort for consistent ordering
    allEntries.sort((a, b) => a[0].localeCompare(b[0]));
    
    // Apply cursor if provided
    let startIndex = 0;
    if (options?.cursor) {
      // Simple cursor implementation - just store index
      startIndex = parseInt(new TextDecoder().decode(options.cursor)) + 1;
    }
    
    // Yield entries
    for (let i = startIndex; i < allEntries.length; i++) {
      const [name, value] = allEntries[i];
      yield {
        name,
        value,
        cursor: new TextEncoder().encode(i.toString())
      };
    }
  }
}

describe('DirectoryWalker Simple Tests', () => {
  let fs: MockFS5;

  beforeEach(() => {
    fs = new MockFS5();
  });

  describe('walk async iterator', () => {
    it('should walk all files and directories recursively by default', async () => {
      const walker = new DirectoryWalker(fs as any, 'home/test');
      const results: WalkResult[] = [];
      
      for await (const item of walker.walk()) {
        results.push(item);
      }
      
      // Should include all files and directories
      expect(results.length).toBeGreaterThanOrEqual(9); // At least 6 files + 3 directories
      
      // Check for specific items
      const paths = results.map(r => r.path);
      expect(paths).toContain('home/test/file1.txt');
      expect(paths).toContain('home/test/dir1/file3.txt');
      expect(paths).toContain('home/test/dir1/subdir/file5.txt');
      expect(paths).toContain('home/test/dir1');
      expect(paths).toContain('home/test/dir1/subdir');
    });

    it('should respect includeFiles option', async () => {
      const walker = new DirectoryWalker(fs as any, 'home/test');
      const results: WalkResult[] = [];
      
      for await (const item of walker.walk({ includeFiles: false })) {
        results.push(item);
      }
      
      // Should only include directories
      expect(results.every(r => r.type === 'directory')).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(3); // dir1, dir1/subdir, dir2
    });

    it('should respect includeDirectories option', async () => {
      const walker = new DirectoryWalker(fs as any, 'home/test');
      const results: WalkResult[] = [];
      
      for await (const item of walker.walk({ includeDirectories: false })) {
        results.push(item);
      }
      
      // Should only include files
      expect(results.every(r => r.type === 'file')).toBe(true);
      expect(results.length).toBe(7); // All files including .gitkeep
    });

    it('should respect maxDepth option', async () => {
      const walker = new DirectoryWalker(fs as any, 'home/test');
      const results: WalkResult[] = [];
      
      for await (const item of walker.walk({ maxDepth: 2 })) {
        results.push(item);
      }
      
      // Should not include deeply nested items (depth 2+)
      const paths = results.map(r => r.path);
      expect(paths).not.toContain('home/test/dir1/subdir/file5.txt');
      
      // Should include depth 0 and 1 items
      expect(paths).toContain('home/test/file1.txt');
      expect(paths).toContain('home/test/dir1');
      expect(paths).toContain('home/test/dir1/file3.txt');
      expect(paths).toContain('home/test/dir1/subdir'); // depth 1
    });

    it('should handle non-recursive walking', async () => {
      const walker = new DirectoryWalker(fs as any, 'home/test');
      const results: WalkResult[] = [];
      
      for await (const item of walker.walk({ recursive: false })) {
        results.push(item);
      }
      
      // Should only include direct children
      const paths = results.map(r => r.path);
      expect(paths).toContain('home/test/file1.txt');
      expect(paths).toContain('home/test/file2.txt');
      expect(paths).toContain('home/test/dir1');
      expect(paths).toContain('home/test/dir2');
      
      // Should not include nested items
      expect(paths).not.toContain('home/test/dir1/file3.txt');
      expect(paths).not.toContain('home/test/dir1/subdir');
    });
  });

  describe('count method', () => {
    it('should count all files and directories with total size', async () => {
      const walker = new DirectoryWalker(fs as any, 'home/test');
      const stats = await walker.count();
      
      expect(stats.files).toBe(7);
      expect(stats.directories).toBeGreaterThanOrEqual(3);
      expect(stats.totalSize).toBe(48); // 6 files * 8 bytes + 1 empty file
    });

    it('should count with filter applied', async () => {
      const walker = new DirectoryWalker(fs as any, 'home/test');
      const filter = (name: string, type: 'file' | 'directory') => {
        return type === 'directory' || name.endsWith('.txt');
      };
      
      const stats = await walker.count({ filter });
      
      expect(stats.files).toBe(6); // Should not count .gitkeep
      expect(stats.directories).toBeGreaterThanOrEqual(3);
    });

    it('should count non-recursively', async () => {
      const walker = new DirectoryWalker(fs as any, 'home/test');
      const stats = await walker.count({ recursive: false });
      
      expect(stats.files).toBe(2); // file1.txt, file2.txt
      expect(stats.directories).toBe(3); // dir1, dir2, empty
      expect(stats.totalSize).toBe(16); // 2 files * 8 bytes
    });
  });
});