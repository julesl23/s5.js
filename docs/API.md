# Enhanced S5.js Path-Based API Documentation

## Table of Contents

- [Enhanced S5.js Path-Based API Documentation](#enhanced-s5js-path-based-api-documentation)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
  - [Core API Methods](#core-api-methods)
    - [get(path, options?)](#getpath-options)
      - [Parameters](#parameters)
      - [Returns](#returns)
      - [Data Decoding](#data-decoding)
      - [Example](#example)
    - [put(path, data, options?)](#putpath-data-options)
      - [Parameters](#parameters-1)
      - [Automatic Encoding](#automatic-encoding)
      - [Example](#example-1)
    - [getMetadata(path)](#getmetadatapath)
      - [Parameters](#parameters-2)
      - [Returns](#returns-1)
      - [File Metadata](#file-metadata)
      - [Directory Metadata](#directory-metadata)
      - [Example](#example-2)
    - [delete(path)](#deletepath)
      - [Parameters](#parameters-3)
      - [Returns](#returns-2)
      - [Notes](#notes)
      - [Example](#example-3)
    - [list(path, options?)](#listpath-options)
      - [Parameters](#parameters-4)
      - [Yields](#yields)
      - [Example](#example-4)
  - [Types and Interfaces](#types-and-interfaces)
    - [PutOptions](#putoptions)
    - [GetOptions](#getoptions)
    - [ListOptions](#listoptions)
    - [ListResult](#listresult)
  - [Path Resolution](#path-resolution)
  - [Cursor-Based Pagination](#cursor-based-pagination)
    - [How Cursors Work](#how-cursors-work)
    - [Pagination Example](#pagination-example)
    - [Cursor Stability](#cursor-stability)
  - [Error Handling](#error-handling)
    - [Common Errors](#common-errors)
    - [Invalid Cursor Errors](#invalid-cursor-errors)
  - [Examples](#examples)
    - [File Management](#file-management)
    - [Batch Operations with Progress](#batch-operations-with-progress)
    - [Clean-up Operations](#clean-up-operations)
  - [Integration with FS5 Class Methods](#integration-with-fs5-class-methods)
  - [Best Practices](#best-practices)
  - [Limitations](#limitations)
  - [Performance Considerations](#performance-considerations)
  - [Next Steps](#next-steps)

## Overview

The Enhanced S5.js Path-Based API provides developer-friendly methods for file and directory operations on the S5 decentralised storage network. This implementation uses a **new data format**:

- **CBOR serialization** instead of MessagePack
- **DirV1 specification** with deterministic encoding
- **No backward compatibility** with old S5 data formats

The API offers an intuitive interface using familiar path syntax while implementing this clean, new format.

## Installation

The enhanced path-based API features are currently in development as part of a Sia Foundation grant project.

**For production use:**

```bash
npm install @s5-dev/s5js
```

**To try the enhanced features:**

- Clone from: https://github.com/julesl23/s5.js
- See the [Development Setup](#development-setup) section for build instructions

**Status**: These features are pending review and have not been merged into the main S5.js repository.

## Quick Start

```typescript
import { S5Client } from "@s5-dev/s5js";

// Initialize S5 client with portal connection
const s5 = new S5Client("https://s5.cx"); // or another S5 portal

// Optional: Set up with authentication
const s5 = await S5Client.create({
  portal: "https://s5.cx",
  seed: "your-seed-phrase-here", // For authenticated operations
});

// Store data
await s5.fs.put("home/documents/hello.txt", "Hello, S5!");

// Retrieve data
const content = await s5.fs.get("home/documents/hello.txt");
console.log(content); // "Hello, S5!"

// List directory contents
for await (const item of s5.fs.list("home/documents")) {
  console.log(`${item.type}: ${item.name}`);
}
```

## Core API Methods

### get(path, options?)

Retrieve data from a file at the specified path.

```typescript
async get(path: string, options?: GetOptions): Promise<any | undefined>
```

#### Parameters

- **path** (string): The file path (e.g., "home/documents/file.txt")
- **options** (GetOptions, optional): Configuration options
  - `defaultMediaType` (string): Default media type for content interpretation

#### Returns

- The decoded file data (string, object, or Uint8Array)
- `undefined` if the file doesn't exist

#### Data Decoding

The method automatically detects and decodes data:

1. Attempts CBOR decoding first (for objects)
2. Falls back to JSON parsing
3. Then attempts UTF-8 text decoding
4. Returns raw Uint8Array if all decoding fails

#### Example

```typescript
// Get text file
const content = await s5.fs.get("home/readme.txt");
console.log(content); // "Hello, world!"

// Get JSON/CBOR data
const data = await s5.fs.get("home/config.json");
console.log(data); // { version: "1.0", settings: {...} }

// Get binary data
const image = await s5.fs.get("home/photo.jpg");
console.log(image); // Uint8Array[...]
```

### put(path, data, options?)

Store data at the specified path, creating intermediate directories as needed.

```typescript
async put(path: string, data: any, options?: PutOptions): Promise<void>
```

#### Parameters

- **path** (string): The file path where data will be stored
- **data** (any): The data to store (string, object, or Uint8Array)
- **options** (PutOptions, optional): Configuration options
  - `mediaType` (string): MIME type for the file
  - `timestamp` (number): Custom timestamp (milliseconds since epoch)

#### Automatic Encoding

- Objects are encoded as CBOR
- Strings are encoded as UTF-8
- Uint8Array stored as-is
- Media type auto-detected from file extension if not provided

#### Example

```typescript
// Store text
await s5.fs.put("home/notes.txt", "My notes here");

// Store JSON data (encoded as CBOR)
await s5.fs.put("home/data.json", {
  name: "Test",
  values: [1, 2, 3],
});

// Store with custom media type
await s5.fs.put("home/styles.css", cssContent, {
  mediaType: "text/css",
});

// Store with custom timestamp
await s5.fs.put("home/backup.txt", "content", {
  timestamp: Date.now() - 86400000, // 1 day ago
});
```

### getMetadata(path)

Retrieve metadata about a file or directory without downloading the content.

```typescript
async getMetadata(path: string): Promise<Record<string, any> | undefined>
```

#### Parameters

- **path** (string): The file or directory path

#### Returns

- Metadata object for the file/directory
- `undefined` if the path doesn't exist

#### File Metadata

```typescript
{
  type: "file",
  name: "example.txt",
  size: 1234,              // Size in bytes
  mediaType: "text/plain",
  timestamp: 1705432100000, // Milliseconds since epoch
  hash: "..."              // File hash
}
```

#### Directory Metadata

```typescript
{
  type: "directory",
  name: "documents",
  fileCount: 10,       // Number of files
  directoryCount: 3    // Number of subdirectories
}
```

#### Example

```typescript
const fileMeta = await s5.fs.getMetadata("home/document.pdf");
if (fileMeta) {
  console.log(`Size: ${fileMeta.size} bytes`);
  console.log(`Type: ${fileMeta.mediaType}`);
}

const dirMeta = await s5.fs.getMetadata("home/photos");
if (dirMeta) {
  console.log(`Contains ${dirMeta.fileCount} files`);
}
```

### delete(path)

Delete a file or empty directory.

```typescript
async delete(path: string): Promise<boolean>
```

#### Parameters

- **path** (string): The file or directory path to delete

#### Returns

- `true` if successfully deleted
- `false` if the path doesn't exist

#### Notes

- Only empty directories can be deleted
- Root directories ("home", "archive") cannot be deleted
- Parent directory must exist

#### Example

```typescript
// Delete a file
const deleted = await s5.fs.delete("home/temp.txt");
console.log(deleted ? "Deleted" : "Not found");

// Delete an empty directory
await s5.fs.delete("home/old-folder");

// Returns false for non-existent paths
const result = await s5.fs.delete("home/ghost.txt"); // false
```

### list(path, options?)

List contents of a directory with optional cursor-based pagination.

```typescript
async *list(path: string, options?: ListOptions): AsyncIterableIterator<ListResult>
```

#### Parameters

- **path** (string): The directory path
- **options** (ListOptions, optional): Configuration options
  - `limit` (number): Maximum items to return
  - `cursor` (string): Resume from a previous position

#### Yields

```typescript
interface ListResult {
  type: "file" | "directory";
  name: string;
  metadata: Record<string, any>;
  cursor?: string; // Pagination cursor
}
```

#### Example

```typescript
// List all items
for await (const item of s5.fs.list("home")) {
  console.log(`${item.type}: ${item.name}`);
}

// List with limit
for await (const item of s5.fs.list("home", { limit: 10 })) {
  console.log(item.name);
}

// Pagination example
const firstPage = [];
let lastCursor;

for await (const item of s5.fs.list("home/docs", { limit: 20 })) {
  firstPage.push(item);
  lastCursor = item.cursor;
}

// Get next page
for await (const item of s5.fs.list("home/docs", {
  cursor: lastCursor,
  limit: 20,
})) {
  console.log(item.name);
}
```

## Types and Interfaces

### PutOptions

```typescript
interface PutOptions {
  mediaType?: string; // MIME type (e.g., "text/plain", "image/jpeg")
  timestamp?: number; // Custom timestamp (milliseconds since epoch)
}
```

### GetOptions

```typescript
interface GetOptions {
  defaultMediaType?: string; // Default media type for content interpretation
}
```

### ListOptions

```typescript
interface ListOptions {
  limit?: number; // Maximum items to return
  cursor?: string; // Pagination cursor from previous result
}
```

### ListResult

```typescript
interface ListResult {
  type: "file" | "directory";
  name: string;
  metadata: Record<string, any>;
  cursor?: string; // Opaque cursor for pagination
}
```

## Path Resolution

- Paths use forward slashes (`/`) as separators
- Leading slash is optional: `"home/file.txt"` equals `"/home/file.txt"`
- Empty path (`""`) refers to the root directory
- Paths are case-sensitive
- UTF-8 characters are supported in file and directory names
- Avoid trailing slashes except for clarity

## Cursor-Based Pagination

The `list()` method supports efficient pagination through large directories using cursors.

### How Cursors Work

- Each item in a listing includes a `cursor` field
- The cursor encodes the position of that item deterministically
- To get the next page, pass the last item's cursor to the next `list()` call
- Cursors are stable - the same position produces the same cursor
- Cursors are opaque base64url-encoded strings - don't parse or modify them
- Invalid cursors will throw an "Invalid cursor" error

### Pagination Example

```typescript
async function listAllItems(path: string, pageSize: number = 100) {
  const allItems = [];
  let cursor: string | undefined;

  while (true) {
    let hasItems = false;

    for await (const item of s5.fs.list(path, { cursor, limit: pageSize })) {
      allItems.push(item);
      cursor = item.cursor;
      hasItems = true;
    }

    if (!hasItems) break;
  }

  return allItems;
}
```

### Cursor Stability

- Cursors remain valid as long as the directory structure is stable
- Adding items after the cursor position doesn't invalidate it
- Deleting items before the cursor may cause skipped entries
- Cursors encode position, type, and name for stability

## Error Handling

All methods handle errors gracefully:

### Common Errors

```typescript
try {
  await s5.fs.put("invalid/path", "content");
} catch (error) {
  if (error.message.includes("does not exist")) {
    // Parent directory doesn't exist
  }
}

try {
  await s5.fs.delete("home"); // Cannot delete root
} catch (error) {
  console.error("Cannot delete root directory");
}
```

### Invalid Cursor Errors

```typescript
try {
  for await (const item of s5.fs.list("home", { cursor: "invalid!" })) {
    // ...
  }
} catch (error) {
  if (error.message.includes("Invalid cursor")) {
    // Handle invalid cursor - start from beginning
    for await (const item of s5.fs.list("home")) {
      // ...
    }
  }
}
```

## Examples

### File Management

```typescript
// Create a project structure
const files = {
  "home/project/README.md": "# My Project\n\nDescription here",
  "home/project/src/index.js": "console.log('Hello');",
  "home/project/package.json": {
    name: "my-project",
    version: "1.0.0",
    main: "src/index.js",
  },
};

// Upload all files
for (const [path, content] of Object.entries(files)) {
  await s5.fs.put(path, content);
}

// Verify structure
async function printTree(path: string, indent = "") {
  for await (const item of s5.fs.list(path)) {
    console.log(
      `${indent}${item.type === "directory" ? "📁" : "📄"} ${item.name}`
    );
    if (item.type === "directory") {
      await printTree(`${path}/${item.name}`, indent + "  ");
    }
  }
}

await printTree("home/project");
```

### Batch Operations with Progress

```typescript
async function uploadDirectory(localPath: string, s5Path: string) {
  const files = await getLocalFiles(localPath); // Your implementation
  let uploaded = 0;

  for (const file of files) {
    const content = await readFile(file.path);
    await s5.fs.put(`${s5Path}/${file.relativePath}`, content, {
      mediaType: file.mimeType,
    });

    uploaded++;
    console.log(`Progress: ${uploaded}/${files.length}`);
  }
}
```

### Clean-up Operations

```typescript
async function cleanupTempFiles(basePath: string) {
  let cleaned = 0;

  for await (const item of s5.fs.list(basePath)) {
    if (item.type === "file" && item.name.endsWith(".tmp")) {
      const deleted = await s5.fs.delete(`${basePath}/${item.name}`);
      if (deleted) cleaned++;
    } else if (item.type === "directory") {
      // Recursively clean subdirectories
      await cleanupTempFiles(`${basePath}/${item.name}`);
    }
  }

  console.log(`Cleaned ${cleaned} temporary files`);
}
```

## Integration with FS5 Class Methods

The path-based API methods work alongside the existing FS5 class methods. Both use the same underlying DirV1 format:

```typescript
// Use existing FS5 methods (now using DirV1 format)
const fileVersion = await s5.fs.uploadBlobWithoutEncryption(blob);
await s5.fs.createFile("home", "newfile.txt", fileVersion, "text/plain");

// Access the same file via path API
const content = await s5.fs.get("home/newfile.txt");

// Mix approaches as needed - all using DirV1 format
await s5.fs.createDirectory("home", "newfolder");
await s5.fs.put("home/newfolder/data.json", { created: Date.now() });
```

**Note**: All methods now use the new CBOR/DirV1 format. There is no compatibility with old S5 data.

## Best Practices

1. **Path Format**: Use forward slashes (`/`) without leading slashes
2. **Error Handling**: Always wrap API calls in try-catch blocks
3. **Pagination**: Use cursors for directories with many items (>100)
4. **Media Types**: Explicitly specify media types for better content handling
5. **Batch Operations**: Group related operations when possible
6. **Directory Creation**: Intermediate directories are created automatically with `put()`
7. **Binary Data**: Use Uint8Array for binary content
8. **Timestamps**: Use milliseconds since epoch for consistency

## Limitations

- Cannot delete non-empty directories
- Cannot store data directly at the root path
- Cursor pagination is forward-only (no backwards navigation)
- Maximum file size depends on S5 network limits
- Path segments cannot contain forward slashes
- Root directories ("home", "archive") are immutable

## Performance Considerations

- **Directory Caching**: Directory metadata is cached during path traversal
- **Efficient Pagination**: Use cursors to avoid loading entire large directories
- **Batch Registry Updates**: Multiple operations in succession are optimised
- **Network Latency**: Operations require network round-trips to S5 portals
- **CBOR Efficiency**: Object data is stored efficiently using CBOR encoding

## Next Steps

- Review the [test suite](https://github.com/julesl23/s5.js/tree/main/test/fs) for comprehensive usage examples
- Check [TypeScript definitions](https://github.com/julesl23/s5.js/blob/main/src/fs/dirv1/types.ts) for complete type information
- Explore [S5 network documentation](https://docs.sfive.net/) for deeper understanding
- See the [grant proposal](https://github.com/julesl23/s5.js/blob/main/docs/MILESTONES.md) for upcoming features

---

_This documentation covers Phase 2 of the Enhanced S5.js grant project. Future phases will add HAMT support, recursive operations, and additional convenience methods._
