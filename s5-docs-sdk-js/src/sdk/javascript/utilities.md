# Directory Utilities

Enhanced s5.js provides utilities for recursive directory traversal and batch operations with progress tracking.

## DirectoryWalker

Recursively traverse directory trees with filtering and cursor support.

### Basic Usage

```typescript
import { DirectoryWalker } from '@s5-dev/s5js';

const walker = new DirectoryWalker(s5.fs);

// Recursive traversal
for await (const entry of walker.walk('home/photos', { recursive: true })) {
  console.log(`${entry.type}: ${entry.path}`);
}
```

### Walk Options

```typescript
interface WalkOptions {
  recursive?: boolean;        // Traverse subdirectories (default: false)
  maxDepth?: number;          // Maximum depth (default: Infinity)
  filter?: (entry) => boolean; // Filter function
  followSymlinks?: boolean;   // Follow symlinks (default: false)
}
```

### Examples

#### Filter Files by Extension

```typescript
for await (const entry of walker.walk('home/documents', {
  recursive: true,
  filter: (entry) => entry.type === 'file' && entry.name.endsWith('.pdf')
})) {
  console.log(`PDF: ${entry.path}`);
}
```

#### Limit Traversal Depth

```typescript
// Only go 2 levels deep
for await (const entry of walker.walk('home', {
  recursive: true,
  maxDepth: 2
})) {
  console.log(entry.path);
}
```

#### Count Files and Directories

```typescript
let fileCount = 0;
let dirCount = 0;

for await (const entry of walker.walk('home/project', { recursive: true })) {
  if (entry.type === 'file') fileCount++;
  else if (entry.type === 'directory') dirCount++;
}

console.log(`Files: ${fileCount}, Directories: ${dirCount}`);
```

## BatchOperations

Perform copy/delete operations on multiple files with progress tracking.

### Basic Usage

```typescript
import { BatchOperations } from '@s5-dev/s5js';

const batch = new BatchOperations(s5.fs);

// Copy directory
await batch.copyDirectory('home/source', 'archive/backup', {
  onProgress: (progress) => {
    console.log(`${progress.processed}/${progress.total} items`);
  }
});

// Delete directory
await batch.deleteDirectory('home/temp', {
  recursive: true,
  onProgress: (progress) => {
    console.log(`Deleting: ${progress.currentPath}`);
  }
});
```

### Copy Directory

```typescript
async copyDirectory(
  sourcePath: string,
  destPath: string,
  options?: BatchOptions
): Promise<BatchResult>
```

**Options:**
```typescript
interface BatchOptions {
  recursive?: boolean;
  onProgress?: (progress: BatchProgress) => void;
  onError?: 'stop' | 'continue' | ((error, path) => 'stop' | 'continue');
}
```

**Example:**

```typescript
const result = await batch.copyDirectory('home/photos', 'archive/photos-backup', {
  recursive: true,
  onProgress: (progress) => {
    const percent = (progress.processed / progress.total * 100).toFixed(1);
    console.log(`${percent}% - ${progress.currentPath}`);
  },
  onError: (error, path) => {
    console.error(`Failed to copy ${path}: ${error.message}`);
    return 'continue'; // Skip errors and continue
  }
});

console.log(`Copied ${result.success} files, ${result.failed} failed`);
```

### Delete Directory

```typescript
async deleteDirectory(
  path: string,
  options?: BatchOptions
): Promise<BatchResult>
```

**Example:**

```typescript
const result = await batch.deleteDirectory('home/cache', {
  recursive: true,
  onProgress: (progress) => {
    console.log(`Deleting: ${progress.currentPath}`);
  }
});

if (result.failed > 0) {
  console.error('Some files failed to delete:');
  result.errors.forEach(e => console.error(`  ${e.path}: ${e.error.message}`));
}
```

## Progress Tracking

All batch operations provide detailed progress information:

```typescript
interface BatchProgress {
  processed: number;     // Number of items processed
  total: number;         // Total items to process
  currentPath: string;   // Currently processing path
  success: number;       // Successfully processed
  failed: number;        // Failed items
}

interface BatchResult {
  success: number;
  failed: number;
  errors: Array<{ path: string; error: Error }>;
}
```

## Complete Examples

### Backup with Progress Bar

```typescript
async function backupWithProgress(source: string, dest: string) {
  const batch = new BatchOperations(s5.fs);
  const startTime = Date.now();

  console.log(`Starting backup of ${source}...`);

  const result = await batch.copyDirectory(source, dest, {
    recursive: true,
    onProgress: (progress) => {
      const percent = (progress.processed / progress.total * 100).toFixed(1);
      process.stdout.write(`\r[${percent}%] ${progress.currentPath.padEnd(50)}`);
    },
    onError: 'continue'
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n✅ Backup complete in ${duration}s`);
  console.log(`   Success: ${result.success}, Failed: ${result.failed}`);

  if (result.failed > 0) {
    // Save error log
    const errorLog = result.errors
      .map(e => `${e.path}: ${e.error.message}`)
      .join('\n');
    await s5.fs.put(`${dest}-errors.log`, errorLog);
    console.log(`   Error log: ${dest}-errors.log`);
  }
}
```

### Clean Temporary Files

```typescript
async function cleanupTempFiles(basePath: string) {
  const walker = new DirectoryWalker(s5.fs);
  let cleaned = 0;

  for await (const entry of walker.walk(basePath, { recursive: true })) {
    if (entry.type === 'file' && entry.name.endsWith('.tmp')) {
      const deleted = await s5.fs.delete(entry.path);
      if (deleted) {
        cleaned++;
        console.log(`Deleted: ${entry.path}`);
      }
    }
  }

  console.log(`Cleaned ${cleaned} temporary files`);
}
```

### Find Large Files

```typescript
async function findLargeFiles(basePath: string, minSize: number) {
  const walker = new DirectoryWalker(s5.fs);
  const largeFiles = [];

  for await (const entry of walker.walk(basePath, {
    recursive: true,
    filter: (e) => e.type === 'file' && e.size > minSize
  })) {
    largeFiles.push({
      path: entry.path,
      size: entry.size,
      sizeInMB: (entry.size / 1024 / 1024).toFixed(2)
    });
  }

  // Sort by size
  largeFiles.sort((a, b) => b.size - a.size);

  console.log(`Found ${largeFiles.length} files larger than ${minSize} bytes:`);
  largeFiles.slice(0, 10).forEach(f => {
    console.log(`  ${f.sizeInMB} MB - ${f.path}`);
  });

  return largeFiles;
}
```

### Synchronize Directories

```typescript
async function syncDirectories(source: string, dest: string) {
  const walker = new DirectoryWalker(s5.fs);
  const batch = new BatchOperations(s5.fs);

  // Get source files
  const sourceFiles = new Map();
  for await (const entry of walker.walk(source, { recursive: true })) {
    if (entry.type === 'file') {
      sourceFiles.set(entry.name, entry);
    }
  }

  // Get destination files
  const destFiles = new Map();
  for await (const entry of walker.walk(dest, { recursive: true })) {
    if (entry.type === 'file') {
      destFiles.set(entry.name, entry);
    }
  }

  // Copy new/modified files
  let copied = 0;
  for (const [name, sourceEntry] of sourceFiles) {
    const destEntry = destFiles.get(name);
    if (!destEntry || sourceEntry.timestamp > destEntry.timestamp) {
      const data = await s5.fs.get(sourceEntry.path);
      await s5.fs.put(`${dest}/${name}`, data);
      copied++;
      console.log(`Synced: ${name}`);
    }
  }

  // Delete removed files
  let deleted = 0;
  for (const [name, destEntry] of destFiles) {
    if (!sourceFiles.has(name)) {
      await s5.fs.delete(destEntry.path);
      deleted++;
      console.log(`Removed: ${name}`);
    }
  }

  console.log(`Sync complete: ${copied} copied, ${deleted} removed`);
}
```

## Error Handling

```typescript
// Stop on first error
const result1 = await batch.copyDirectory('home/source', 'archive/dest', {
  onError: 'stop'
});

// Continue on errors
const result2 = await batch.copyDirectory('home/source', 'archive/dest', {
  onError: 'continue'
});

// Custom error handling
const result3 = await batch.copyDirectory('home/source', 'archive/dest', {
  onError: (error, path) => {
    if (error.message.includes('permission')) {
      console.log(`Skipping protected file: ${path}`);
      return 'continue';
    }
    return 'stop';
  }
});
```

## Performance Tips

1. **Use filters early**: Filter in `walk()` options instead of checking each entry
2. **Batch operations**: Group related operations together
3. **Progress callbacks**: Don't perform heavy operations in progress callbacks
4. **Error handling**: Use 'continue' for non-critical errors to avoid interruption

## TypeScript Types

```typescript
interface WalkEntry {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  mediaType?: string;
  timestamp?: number;
}

interface WalkOptions {
  recursive?: boolean;
  maxDepth?: number;
  filter?: (entry: WalkEntry) => boolean;
}

interface BatchOptions {
  recursive?: boolean;
  onProgress?: (progress: BatchProgress) => void;
  onError?: 'stop' | 'continue' | ((error: Error, path: string) => 'stop' | 'continue');
}
```

## Next Steps

- **[Path-based API](./path-api.md)** - Core file operations
- **[Performance](./performance.md)** - Optimize for large directories
- **[GitHub Examples](https://github.com/julesl23/s5.js/tree/main/test/integration)** - More examples
