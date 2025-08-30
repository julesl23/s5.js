import { describe, it, expect, beforeEach } from 'vitest';
import { BatchOperations, BatchOptions, BatchResult } from '../../../src/fs/utils/batch.js';
import { DirectoryWalker } from '../../../src/fs/utils/walker.js';
import { FileRef, DirRef } from '../../../src/fs/dirv1/types.js';

// Simple mock FS5 for testing
class MockFS5 {
  private files: Map<string, Uint8Array> = new Map();
  private directories: Set<string> = new Set();

  constructor() {
    // Initialize root directories
    this.directories.add('/');
    this.directories.add('home');
  }

  async put(path: string, data: string | Uint8Array, options?: any): Promise<void> {
    // Ensure parent directories exist
    const parts = path.split('/').filter(p => p);
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += (currentPath ? '/' : '') + parts[i];
      this.directories.add(currentPath);
    }
    
    const fullPath = parts.join('/');
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    this.files.set(fullPath, bytes);
  }

  async get(path: string): Promise<string> {
    const data = this.files.get(path);
    if (!data) throw new Error(`File not found: ${path}`);
    return new TextDecoder().decode(data);
  }

  async delete(path: string): Promise<void> {
    if (this.files.has(path)) {
      this.files.delete(path);
    } else if (this.directories.has(path)) {
      // Check if directory is empty
      const hasChildren = Array.from(this.files.keys()).some(f => f.startsWith(path + '/')) ||
                         Array.from(this.directories).some(d => d !== path && d.startsWith(path + '/'));
      if (hasChildren) {
        throw new Error(`Directory ${path} is not empty`);
      }
      this.directories.delete(path);
    } else {
      throw new Error(`Path not found: ${path}`);
    }
  }

  async createDirectory(path: string): Promise<void> {
    const parts = path.split('/').filter(p => p);
    let currentPath = '';
    for (const part of parts) {
      currentPath += (currentPath ? '/' : '') + part;
      this.directories.add(currentPath);
    }
  }

  async getMetadata(path: string): Promise<any> {
    if (this.files.has(path)) {
      return { type: 'file', path };
    } else if (this.directories.has(path)) {
      return { type: 'directory', path };
    }
    return null;
  }

  async *list(path: string, options?: any): AsyncIterableIterator<{ name: string; value: FileRef | DirRef }> {
    const prefix = path === '/' ? '' : path + '/';
    const yielded = new Set<string>();
    
    // List files
    for (const [filePath, data] of this.files.entries()) {
      if (filePath.startsWith(prefix)) {
        const relativePath = filePath.substring(prefix.length);
        const parts = relativePath.split('/');
        if (parts.length === 1) {
          // Direct child file
          yield {
            name: parts[0],
            value: { hash: new Uint8Array(32), size: data.length } as FileRef
          };
        } else {
          // Subdirectory
          const dirName = parts[0];
          if (!yielded.has(dirName)) {
            yielded.add(dirName);
            yield {
              name: dirName,
              value: { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } } as DirRef
            };
          }
        }
      }
    }
    
    // List directories
    for (const dir of this.directories) {
      if (dir.startsWith(prefix) && dir !== path) {
        const relativePath = dir.substring(prefix.length);
        const parts = relativePath.split('/');
        if (parts.length === 1 && !yielded.has(parts[0])) {
          yield {
            name: parts[0],
            value: { link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) } } as DirRef
          };
        }
      }
    }
  }

  // Mock API for compatibility
  api = {
    downloadBlobAsBytes: async (hash: Uint8Array): Promise<Uint8Array> => {
      // Find file by hash (mock - just return first matching file)
      for (const data of this.files.values()) {
        return data;
      }
      throw new Error('Blob not found');
    }
  };
}

describe('BatchOperations Simple Tests', () => {
  let fs: MockFS5;
  let batch: BatchOperations;

  beforeEach(async () => {
    fs = new MockFS5();
    batch = new BatchOperations(fs as any);
    
    // Create test directory structure
    await fs.put('home/source/file1.txt', 'content1');
    await fs.put('home/source/file2.txt', 'content2');
    await fs.put('home/source/subdir/file3.txt', 'content3');
    await fs.put('home/source/subdir/deep/file4.txt', 'content4');
  });

  describe('copyDirectory', () => {
    it('should copy entire directory structure', async () => {
      // First verify source files exist
      const sourceFile1 = await fs.get('home/source/file1.txt');
      expect(sourceFile1).toBe('content1');
      
      // Debug: list source directory
      console.log('Source directory contents:');
      for await (const item of fs.list('home/source')) {
        console.log('- ', item.name, 'link' in item.value ? 'DIR' : 'FILE');
      }
      
      // Test walker directly
      const walker = new DirectoryWalker(fs as any, 'home/source');
      console.log('Walker test:');
      for await (const item of walker.walk()) {
        console.log('Walked:', item.path, item.type);
      }
      
      const result = await batch.copyDirectory('home/source', 'home/destination');
      
      console.log('Copy result:', result);
      
      expect(result.success).toBeGreaterThanOrEqual(4); // All files
      expect(result.failed).toBe(0);
      
      // Verify files were copied
      const file1 = await fs.get('home/destination/file1.txt');
      expect(file1).toBe('content1');
      
      const file4 = await fs.get('home/destination/subdir/deep/file4.txt');
      expect(file4).toBe('content4');
    });

    it('should handle non-existent source directory', async () => {
      try {
        await batch.copyDirectory('home/non-existent', 'home/destination');
        expect.fail('Should throw error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should support progress callback', async () => {
      const progress: any[] = [];
      
      await batch.copyDirectory('home/source', 'home/destination', {
        onProgress: (p) => {
          progress.push({ processed: p.processed });
        }
      });
      
      expect(progress.length).toBeGreaterThan(0);
      expect(progress[progress.length - 1].processed).toBeGreaterThanOrEqual(4);
    });
  });

  describe('deleteDirectory', () => {
    it('should delete empty directory non-recursively', async () => {
      await fs.createDirectory('home/empty-dir');
      
      const result = await batch.deleteDirectory('home/empty-dir', {
        recursive: false
      });
      
      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should delete directory recursively', async () => {
      const result = await batch.deleteDirectory('home/source', {
        recursive: true
      });
      
      expect(result.success).toBeGreaterThanOrEqual(4); // All files and directories
      expect(result.failed).toBe(0);
      
      // Verify files are gone
      try {
        await fs.get('home/source/file1.txt');
        expect.fail('File should be deleted');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should fail on non-empty directory without recursive', async () => {
      const result = await batch.deleteDirectory('home/source', {
        recursive: false
      });
      
      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
    });
  });

  describe('_ensureDirectory', () => {
    it('should create nested directory structure', async () => {
      await batch._ensureDirectory('home/a/b/c/d/e');
      
      const meta = await fs.getMetadata('home/a/b/c');
      expect(meta).toBeDefined();
      expect(meta.type).toBe('directory');
    });
  });
});