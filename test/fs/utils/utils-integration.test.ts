// test/fs/utils/utils-integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DirectoryWalker } from '../../../src/fs/utils/walker.js';
import { BatchOperations } from '../../../src/fs/utils/batch.js';
import { FS5 } from '../../../src/fs/fs5.js';
import { setupMockS5 } from '../../test-utils.js';

describe('Utility Functions Integration', () => {
  let fs: FS5;

  beforeEach(async () => {
    const { s5 } = await setupMockS5();
    fs = new FS5(s5);
  });

  it('should combine walker and batch operations for selective copy', async () => {
    // Create source structure
    await fs.put('project/src/index.ts', 'export default {}');
    await fs.put('project/src/utils.ts', 'export function util() {}');
    await fs.put('project/test/index.test.ts', 'test()');
    await fs.put('project/node_modules/package/index.js', 'module');
    await fs.put('project/README.md', '# Project');
    await fs.put('project/.gitignore', 'node_modules');

    // Walk and filter to find only source files
    const walker = new DirectoryWalker(fs, 'project');
    const sourceFiles: string[] = [];
    
    for await (const item of walker.walk({
      filter: (name, type) => {
        if (type === 'directory') return !name.includes('node_modules');
        return name.endsWith('.ts') || name.endsWith('.md');
      }
    })) {
      if (item.type === 'file') {
        sourceFiles.push(item.path);
      }
    }

    // Copy only source files
    const batch = new BatchOperations(fs);
    for (const sourcePath of sourceFiles) {
      const relativePath = sourcePath.substring('project'.length);
      const destPath = `backup${relativePath}`;
      
      const content = await fs.get(sourcePath);
      const metadata = await fs.getMetadata(sourcePath);
      
      await fs.put(destPath, content!, {
        mediaType: metadata?.mediaType,
        metadata: metadata?.custom
      });
    }

    // Verify selective copy
    expect(await fs.get('backup/src/index.ts')).toBe('export default {}');
    expect(await fs.get('backup/README.md')).toBe('# Project');
    expect(await fs.get('backup/node_modules/package/index.js')).toBeUndefined();
  });

  it('should use walker to verify batch copy completeness', async () => {
    // Create complex source
    for (let i = 0; i < 20; i++) {
      await fs.put(`data/batch${i}/file${i}.dat`, `data${i}`);
    }

    // Copy with batch operations
    const batch = new BatchOperations(fs);
    const copyResult = await batch.copyDirectory('data', 'backup');

    // Walk both directories to compare
    const sourceWalker = new DirectoryWalker(fs, 'data');
    const sourceStats = await sourceWalker.count();
    
    const destWalker = new DirectoryWalker(fs, 'backup');
    const destStats = await destWalker.count();

    // Verify complete copy
    expect(destStats.files).toBe(sourceStats.files);
    expect(destStats.directories).toBe(sourceStats.directories);
    expect(copyResult.errors).toBe(0);
  });

  it('should handle large directory operations with cursors', async () => {
    // Create large directory
    const files: string[] = [];
    for (let i = 0; i < 100; i++) {
      const path = `large/file${i.toString().padStart(3, '0')}.txt`;
      await fs.put(path, `content ${i}`);
      files.push(path);
    }

    // Walk with batches using cursor
    const walker = new DirectoryWalker(fs, 'large');
    const batches: string[][] = [];
    let cursor: string | undefined;
    
    while (true) {
      const batch: string[] = [];
      let count = 0;
      
      for await (const item of walker.walk({ cursor })) {
        batch.push(item.name);
        cursor = item.cursor;
        count++;
        if (count >= 10) break; // 10 items per batch
      }
      
      if (batch.length === 0) break;
      batches.push(batch);
    }

    // Verify we got all files in order
    expect(batches.length).toBe(10); // 100 files / 10 per batch
    const allFiles = batches.flat();
    expect(allFiles.length).toBe(100);
    expect(allFiles[0]).toBe('file000.txt');
    expect(allFiles[99]).toBe('file099.txt');
  });

  it('should clean up failed operations', async () => {
    // Create source
    await fs.put('source/important.txt', 'important data');
    await fs.put('source/temp/cache.tmp', 'cache');

    // Partial copy that "fails"
    const batch = new BatchOperations(fs);
    try {
      await batch.copyDirectory('source', 'dest', {
        onProgress: (copied, total) => {
          // Simulate failure on temp files during copy
          if (copied > 1) {
            throw new Error('Simulated failure');
          }
        },
        stopOnError: true
      });
    } catch (error) {
      // Expected error
    }

    // Clean up partial destination
    const deleteResult = await batch.deleteDirectory('dest', {
      recursive: true
    });

    // Verify cleanup
    expect(deleteResult.errors).toBe(0);
    const destMeta = await fs.getMetadata('dest');
    expect(destMeta).toBeUndefined();
  });
});