# Enhanced S5.js SDK

An enhanced JavaScript/TypeScript SDK for the S5 decentralized storage network, featuring a simple path-based API for file and directory operations.

## Features

- 🚀 **Path-based API**: Simple `get()`, `put()`, `delete()`, `list()` operations
- 📁 **Directory Support**: Full directory tree management with recursive operations
- 🔄 **Cursor Pagination**: Efficient handling of large directories
- 🔐 **Built-in Encryption**: Automatic encryption for private data
- 📦 **CBOR Serialization**: Deterministic encoding for cross-platform compatibility
- 🌐 **Browser & Node.js**: Works in both environments
- 🗂️ **HAMT Sharding**: Automatic directory sharding for millions of entries
- 🚶 **Directory Walker**: Recursive traversal with filters and resumable cursors
- 📋 **Batch Operations**: High-level copy/delete operations with progress tracking

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

// Large directories automatically use HAMT sharding
for (let i = 0; i < 5000; i++) {
  await s5.fs.put(`home/photos/image${i}.jpg`, imageData);
}
// Directory automatically shards at 1000+ entries for O(log n) performance

// Use directory utilities for recursive operations
import { DirectoryWalker, BatchOperations } from "@/fs/utils";

const walker = new DirectoryWalker(s5.fs);
const batch = new BatchOperations(s5.fs);

// Count files recursively
const stats = await walker.count("home/projects");
console.log(`Total files: ${stats.files}, Size: ${stats.totalSize}`);

// Copy directory with progress
await batch.copyDirectory("home/photos", "archive/photos-2024", {
  onProgress: (p) => console.log(`Copied ${p.processed} items`)
});
```

## Documentation

- [API Documentation](./docs/API.md) - Complete API reference with examples
- [Implementation Status](./docs/IMPLEMENTATION.md) - Development progress tracking
- [Milestones](./docs/MILESTONES.md) - Grant milestone tracking

## Development

This is an enhanced version of s5.js being developed under an 8-month grant from the Sia Foundation. The project implements a new format using:

- **New Format**: CBOR serialization with DirV1 specification (replaces MessagePack)
- **Path-based API**: Simple file operations with familiar syntax
- **HAMT sharding**: Automatic directory sharding for efficient large directory support
- **Directory utilities**: Recursive operations with progress tracking and error handling
- **Media processing**: Thumbnail generation and metadata extraction (coming in Phase 5)

**Note**: This is a clean implementation that does NOT maintain backward compatibility with old S5 data formats.

### Building

```bash
npm run build     # Compile TypeScript
npm run dev       # Watch mode
npm run test      # Run tests
```

### Project Status

- ✅ Month 1: Project Setup - Complete
- ✅ Month 2: Path Helpers v0.1 - Complete  
- ✅ Month 3: Path-cascade Optimization & HAMT - Complete
- ✅ Month 4: Directory Utilities - Complete
- 🚧 Month 5: Media Processing (Part 1) - In Progress
- ⏳ Months 6-8: Advanced features pending

See [MILESTONES.md](./docs/MILESTONES.md) for detailed progress.

## License

MIT
