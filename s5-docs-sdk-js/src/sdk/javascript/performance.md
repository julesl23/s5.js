# Performance & Scaling

Enhanced s5.js implements HAMT (Hash Array Mapped Trie) sharding for efficient handling of directories with millions of entries.

## HAMT Sharding

**Problem**: Traditional flat directories become slow with thousands of entries (O(n) operations).

**Solution**: HAMT auto-sharding activates at 1000+ entries, providing O(log n) performance.

### How It Works

- **Threshold**: Automatically activates at 1000 entries
- **Structure**: 32-way branching tree using xxhash64 distribution
- **Transparent**: Path-based API works identically
- **Efficient**: List operations scale to millions of entries

### Performance Characteristics

| Directory Size | Flat Directory | HAMT Directory |
|---------------|---------------|---------------|
| 100 entries | ~10ms | ~12ms |
| 1,000 entries | ~100ms | ~15ms (auto-shards) |
| 10,000 entries | ~1,000ms | ~20ms |
| 100,000 entries | ~10,000ms | ~35ms |
| 1,000,000 entries | ❌ Impractical | ~50ms ✅ |

> Benchmark performed with real S5 portal. See [BENCHMARKS.md](https://github.com/s5-dev/s5.js/blob/main/docs/BENCHMARKS.md) for details.

## Cursor Pagination

For large directories, use cursor-based pagination:

```typescript
async function paginateLargeDirectory(path: string, pageSize: number = 100) {
  let cursor: string | undefined;
  let page = 1;

  while (true) {
    const items = [];

    // Get next page
    for await (const item of s5.fs.list(path, { cursor, limit: pageSize })) {
      items.push(item);
      cursor = item.cursor;
    }

    if (items.length === 0) break;

    console.log(`Page ${page}: ${items.length} items`);
    page++;
  }
}
```

### Cursor Properties

- **Stateless**: No server-side state; cursor contains position data
- **Deterministic**: Same cursor always returns same results
- **CBOR-encoded**: Encodes position, type, and name
- **Stable**: Valid as long as directory structure is unchanged

## Best Practices

### 1. Use Pagination for Large Directories

```typescript
// ❌ Don't load everything at once
const allItems = [];
for await (const item of s5.fs.list('home/photos')) {
  allItems.push(item); // May take minutes for 100K+ items
}

// ✅ Use pagination
for await (const item of s5.fs.list('home/photos', { limit: 100 })) {
  processItem(item); // Fast, constant memory
}
```

### 2. Use getMetadata() for Existence Checks

```typescript
// ❌ Don't download file just to check existence
const data = await s5.fs.get('home/large-file.mp4'); // Slow for large files

// ✅ Use metadata
const exists = await s5.fs.getMetadata('home/large-file.mp4') !== undefined;
```

### 3. Batch Operations with Progress

```typescript
import { BatchOperations } from '@s5-dev/s5js';

const batch = new BatchOperations(s5.fs);

await batch.copyDirectory('home/source', 'archive/backup', {
  onProgress: (progress) => {
    console.log(`${progress.processed}/${progress.total} - ${progress.currentPath}`);
  }
});
```

### 4. Organize Large Datasets

```typescript
// ❌ Don't put everything in one directory
await s5.fs.put('home/photos/IMG_0001.jpg', ...);
await s5.fs.put('home/photos/IMG_0002.jpg', ...);
// ... 100,000 files in one directory

// ✅ Use hierarchical structure
await s5.fs.put('home/photos/2024/01/IMG_0001.jpg', ...);
await s5.fs.put('home/photos/2024/01/IMG_0002.jpg', ...);
// Spread across year/month subdirectories
```

## Bundle Size Optimization

### Modular Imports

```typescript
// Full bundle: 61.14 KB
import { S5 } from '@s5-dev/s5js';

// Core only: 59.58 KB (no media)
import { S5 } from '@s5-dev/s5js/core';

// Media module: 9.79 KB (standalone)
import { MediaProcessor } from '@s5-dev/s5js/media';

// Advanced API: 60.60 KB (core + CID utils)
import { FS5Advanced } from '@s5-dev/s5js/advanced';
```

### Lazy Loading

```typescript
// Load core immediately
import { S5 } from '@s5-dev/s5js/core';

// Lazy load media when needed
async function processImage(blob: Blob) {
  const { MediaProcessor } = await import('@s5-dev/s5js/media');
  await MediaProcessor.initialize();
  return await MediaProcessor.extractMetadata(blob);
}
```

**Savings**: Initial bundle 9.79 KB smaller

## Network Performance

### Operation Latency

Typical latencies with broadband connection:

| Operation | Latency |
|-----------|---------|
| `getMetadata()` | 50-100ms |
| `get()` small file | 100-200ms |
| `get()` large file | 500ms-5s |
| `put()` small file | 200-500ms |
| `put()` large file | 1s-30s |
| `list()` (100 items) | 50-150ms |
| `delete()` | 100-200ms |

### Optimization Strategies

1. **Parallel Operations**: Use `Promise.all()` for independent operations
2. **Batch Uploads**: Group related files in single session
3. **Cache Metadata**: Store locally to avoid repeated fetches
4. **Progressive Loading**: Show thumbnails first, full images later

## Memory Management

### Efficient File Handling

```typescript
// ❌ Load everything into memory
const files = [];
for await (const item of s5.fs.list('home/photos')) {
  const data = await s5.fs.get(item.path);
  files.push({ name: item.name, data }); // Memory explosion!
}

// ✅ Process one at a time
for await (const item of s5.fs.list('home/photos')) {
  const data = await s5.fs.get(item.path);
  await processAndDiscard(data); // Constant memory
}
```

### Large File Streaming

For files >50MB, process in chunks:

```typescript
// Future feature: streaming API
// Currently: download entire file, then process
const largeFile = await s5.fs.get('home/video.mp4'); // May use significant memory
```

## Benchmark Results

From real S5 portal testing (Month 7):

**HAMT Activation Test:**
- 999 entries: 2.1 seconds (flat directory)
- 1000 entries: 2.3 seconds (HAMT auto-activates)
- 1500 entries: 2.8 seconds (HAMT efficiency visible)

**Scaling Performance:**
- 10,000 entries: O(log n) vs O(n) - 50x faster
- 100,000 entries: O(log n) vs O(n) - 500x faster

**Cursor Pagination:**
- No server state maintained
- Deterministic: same cursor = same results
- Efficient: O(1) memory regardless of directory size

See [docs/BENCHMARKS.md](https://github.com/s5-dev/s5.js/blob/main/docs/BENCHMARKS.md) for complete results.

## Performance Testing

Run your own benchmarks:

```bash
# HAMT activation threshold
node test/integration/test-hamt-activation-real.js

# Large directory performance
node test/integration/test-hamt-real-portal.js

# Pagination performance
node test/integration/test-pagination-real.js
```

## Next Steps

- **[Directory Utilities](./utilities.md)** - Batch operations and recursive traversal
- **[Path-based API](./path-api.md)** - Core file operations
- **[Media Processing](./media.md)** - Optimize image galleries
- **[Benchmarks](https://github.com/s5-dev/s5.js/blob/main/docs/BENCHMARKS.md)** - Complete performance data
