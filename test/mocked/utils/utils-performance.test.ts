// test/fs/utils/utils-performance.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DirectoryWalker } from '../../../src/fs/utils/walker.js';
import { BatchOperations } from '../../../src/fs/utils/batch.js';
import { FS5 } from '../../../src/fs/fs5.js';
import { setupMockS5 } from '../../test-utils.js';

describe('Utility Functions Performance', () => {
  let fs: FS5;

  beforeEach(async () => {
    const { s5, identity } = await setupMockS5();
    fs = new FS5(s5, identity as any);
  });

  it('should handle walking 1000+ files efficiently', async () => {
    // Create directory with many files
    console.time('Create 1000 files');
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(fs.put(`perf/file${i}.txt`, `content${i}`));
    }
    await Promise.all(promises);
    console.timeEnd('Create 1000 files');

    // Walk and count
    console.time('Walk 1000 files');
    const walker = new DirectoryWalker(fs, 'perf');
    const stats = await walker.count();
    console.timeEnd('Walk 1000 files');

    expect(stats.files).toBe(1000);
    expect(stats.totalSize).toBeGreaterThan(0);
  });

  it('should copy large directories with progress tracking', async () => {
    // Create source with nested structure
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        await fs.put(`source/dir${i}/file${j}.txt`, `content ${i}-${j}`);
      }
    }

    // Copy with progress
    const batch = new BatchOperations(fs);
    const progressUpdates: number[] = [];
    
    console.time('Copy 100 files');
    const result = await batch.copyDirectory('source', 'destination', {
      onProgress: (progress) => {
        progressUpdates.push(progress.processed);
      }
    });
    console.timeEnd('Copy 100 files');

    expect(result.success).toBeGreaterThanOrEqual(100);
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[progressUpdates.length - 1]).toBe(result.success);
  });

  it('should handle cursor pagination for large listings', async () => {
    // Create files with predictable names for ordering
    for (let i = 0; i < 100; i++) {
      await fs.put(`paginated/file${i.toString().padStart(3, '0')}.txt`, `${i}`);
    }

    // Paginate through results
    const walker = new DirectoryWalker(fs, 'paginated');
    const pages: number[] = [];
    let cursor: string | undefined;
    let totalItems = 0;

    console.time('Paginate 100 files');
    while (totalItems < 100) {
      let pageItems = 0;
      
      for await (const item of walker.walk({ cursor, includeDirectories: false })) {
        cursor = item.cursor;
        pageItems++;
        totalItems++;
        
        if (pageItems >= 20) break; // 20 items per page
      }
      
      if (pageItems === 0) break;
      pages.push(pageItems);
    }
    console.timeEnd('Paginate 100 files');

    expect(pages.length).toBe(5); // 100 files / 20 per page
    expect(pages.every(count => count === 20)).toBe(true);
    expect(totalItems).toBe(100);
  });

  it('should efficiently delete large directory structures', async () => {
    // Create deeply nested structure
    let path = 'deep';
    for (let i = 0; i < 10; i++) {
      path += `/level${i}`;
      await fs.put(`${path}/file${i}.txt`, `depth ${i}`);
    }

    // Also create breadth
    for (let i = 0; i < 50; i++) {
      await fs.put(`deep/wide${i}/file.txt`, `wide ${i}`);
    }

    // Count before deletion
    const walker = new DirectoryWalker(fs, 'deep');
    const beforeStats = await walker.count();

    // Delete recursively
    const batch = new BatchOperations(fs);
    console.time('Delete complex structure');
    const result = await batch.deleteDirectory('deep', {
      recursive: true
    });
    console.timeEnd('Delete complex structure');

    expect(result.success).toBe(beforeStats.files + beforeStats.directories);
    expect(result.errors.length).toBe(0);

    // Verify deletion
    const afterStats = await walker.count();
    expect(afterStats.files).toBe(0);
    expect(afterStats.directories).toBe(0);
  });
});