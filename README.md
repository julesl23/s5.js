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

This enhanced version is currently in development as part of a Sia Foundation grant project.

### For Production Use

```bash
npm install @s5-dev/s5js
```

### For Development/Testing

```bash
# Clone the repository
git clone https://github.com/julesl23/s5.js
cd s5.js

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm run test
```

## Quick Start

```typescript
import { S5 } from "@s5-dev/s5js";

// Create S5 instance and connect to peers
const s5 = await S5.create({
  initialPeers: [
    "wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p"
  ]
});

// Generate a new seed phrase
const seedPhrase = s5.generateSeedPhrase();

// Or recover from existing seed phrase
await s5.recoverIdentityFromSeedPhrase(seedPhrase);

// Register on S5 portal (s5.vup.cx supports the new API)
await s5.registerOnNewPortal("https://s5.vup.cx");

// Initialize filesystem (creates home and archive directories)
await s5.fs.ensureIdentityInitialized();

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

## Core API

### Path-based Operations

```typescript
// Store files with automatic directory creation
await s5.fs.put("home/photos/vacation.jpg", imageData, {
  mediaType: "image/jpeg"
});

// Retrieve files with automatic decoding
const data = await s5.fs.get("home/config.json");

// Delete files or empty directories
await s5.fs.delete("home/temp/cache.txt");

// Get metadata without downloading content
const meta = await s5.fs.getMetadata("home/video.mp4");
console.log(`Size: ${meta.size} bytes`);

// List with pagination
for await (const item of s5.fs.list("home", { limit: 100 })) {
  console.log(`${item.name} (${item.type})`);
}
```

### Directory Utilities

```typescript
import { DirectoryWalker, BatchOperations } from "@s5-dev/s5js";

// Recursive directory traversal
const walker = new DirectoryWalker(s5.fs, "home");
for await (const entry of walker.walk({ maxDepth: 3 })) {
  console.log(`${entry.path} (${entry.type})`);
}

// Batch operations with progress
const batch = new BatchOperations(s5.fs);
const result = await batch.copyDirectory("home/source", "home/backup", {
  onProgress: (progress) => {
    console.log(`Copied ${progress.processed} items...`);
  }
});
```

## Documentation

- [API Documentation](./docs/API.md) - Complete API reference with examples
- [Implementation Status](./docs/IMPLEMENTATION.md) - Development progress tracking
- [Milestones](./docs/MILESTONES.md) - Grant milestone tracking
- [Benchmarks](./docs/BENCHMARKS.md) - Performance analysis and results

## Development

### Build Commands

```bash
npm run build       # Compile TypeScript to JavaScript
npm run dev         # Watch mode for development
npm run type-check  # Run TypeScript type checking
```

### Testing

```bash
npm run test        # Run tests in watch mode
npm run test:run    # Run tests once
npm run test:ui     # Run tests with UI
npm run test:coverage # Generate coverage report
```

### Test Server

For integration testing with mock S5 services:

```bash
node test-server.js  # Start mock server on port 3000
```

See [test-server-README.md](./test-server-README.md) for details.

## Project Architecture

### Technology Stack

- **Language**: TypeScript (ES2022 target, ESNext modules)
- **Runtime**: Dual-targeted for Browser and Node.js
- **Test Framework**: Vitest with global test functions
- **Crypto**: @noble libraries for cryptographic operations
- **Storage**: IndexedDB (browser) and memory-level (Node.js)
- **Serialization**: CBOR via cbor-x
- **Networking**: WebSocket-based P2P connections

### Module Structure

- `src/api/` - Core S5 API interfaces and crypto implementations
- `src/fs/` - File system operations (FS5 implementation)
  - `dirv1/` - CBOR-based directory format implementation
  - `hamt/` - Hash Array Mapped Trie for large directories
  - `utils/` - Directory walker and batch operations
- `src/identity/` - User identity and authentication
- `src/node/` - P2P networking and registry operations
- `src/kv/` - Key-value storage abstractions
- `src/encryption/` - Encryption utilities
- `src/identifier/` - Content identifiers and multibase encoding
- `src/util/` - Utility functions

## Implementation Status

### Completed Phases ✅

- **Phase 1**: Core Infrastructure (CBOR, DirV1 types)
- **Phase 2**: Path-Based API (get, put, delete, list, getMetadata)
- **Phase 3**: HAMT Integration (auto-sharding at 1000+ entries)
- **Phase 4**: Directory Utilities (walker, batch operations)

### In Progress 🚧

- **Phase 5**: Media Processing Foundation (WASM setup)

### Upcoming ⏳

- **Phase 6**: Thumbnail Generation
- **Phase 7**: Progressive Image Loading
- **Phase 8**: Final Integration and Testing

## Performance

The implementation has been benchmarked to ensure efficient operation:

- **HAMT activation**: Automatic at 1000+ entries
- **Scaling**: O(log n) performance verified up to 100K+ entries
- **Memory usage**: ~650 bytes per directory entry
- **Network latency**: ~800ms per operation on real S5 network

See [BENCHMARKS.md](./docs/BENCHMARKS.md) for detailed results.

## Important Notes

- **Format**: Uses new CBOR/DirV1 format - NOT compatible with old S5 data
- **Paths**: Must start with `home/` or `archive/`
- **Portal**: Use `https://s5.vup.cx` for testing (has updated API)
- **Identity**: Requires fresh seed phrases (old accounts incompatible)

## Contributing

This project is being developed under a Sia Foundation grant. For contributions or issues, please refer to the [grant proposal](./docs/grant/Sia-Standard-Grant-Enhanced-s5js.md).

## License

MIT

---

*This is an enhanced version of s5.js being developed under an 8-month grant from the Sia Foundation. The project implements a new format using CBOR serialization with the DirV1 specification.*