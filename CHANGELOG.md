# Changelog

All notable changes to Enhanced s5.js will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0-beta.1] - 2025-10-31

### Major Features - Sia Foundation Grant Implementation

This release represents the culmination of an 8-month Sia Foundation grant to enhance s5.js with a comprehensive set of features for decentralized storage applications.

#### Path-based API (Phases 2-3)
- **Added** simplified filesystem API with `get()`, `put()`, `delete()`, `list()`, and `getMetadata()` operations
- **Added** automatic path normalization and Unicode support
- **Added** CBOR-based DirV1 directory format for deterministic serialization
- **Added** DAG-CBOR encoding for cross-implementation compatibility
- **Added** cursor-based pagination for efficient large directory iteration
- **Added** directory creation and management utilities

#### HAMT Sharding (Phase 3)
- **Added** Hash Array Mapped Trie (HAMT) for scalable directory storage
- **Added** automatic sharding at 1000+ entries per directory
- **Added** 32-way branching with xxhash64 distribution
- **Added** transparent fallback between flat and sharded directories
- **Added** O(log n) performance for directories with millions of entries

#### Directory Utilities (Phase 4)
- **Added** `DirectoryWalker` class for recursive directory traversal
- **Added** configurable depth limits and filtering options
- **Added** resumable traversal with cursor support
- **Added** `BatchOperations` class for high-level copy/delete operations
- **Added** progress tracking and error handling for batch operations

#### Media Processing (Phases 5-6)
- **Added** `MediaProcessor` for image metadata extraction
- **Added** WebAssembly (WASM) based image processing with Canvas fallback
- **Added** automatic browser capability detection
- **Added** support for JPEG, PNG, WebP formats
- **Added** thumbnail generation with smart cropping
- **Added** dominant color extraction and color palette generation
- **Added** progressive image loading support
- **Added** FS5 integration: `putImage()`, `getThumbnail()`, `getImageMetadata()`, `createImageGallery()`

#### Advanced CID API (Phase 6)
- **Added** `FS5Advanced` class for content-addressed operations
- **Added** `pathToCID()` - convert filesystem paths to CIDs
- **Added** `cidToPath()` - resolve CIDs to filesystem paths
- **Added** `getByCID()` - retrieve data directly by CID
- **Added** `putByCID()` - store data with explicit CID
- **Added** CID utility functions: `formatCID()`, `parseCID()`, `verifyCID()`, `cidToString()`
- **Added** 74 comprehensive tests for CID operations

#### Bundle Optimization (Phase 6)
- **Added** modular exports for code-splitting
- **Added** `@s5-dev/s5js` - full bundle (61 KB brotli)
- **Added** `@s5-dev/s5js/core` - core functionality without media (60 KB)
- **Added** `@s5-dev/s5js/media` - media processing standalone (10 KB)
- **Added** `@s5-dev/s5js/advanced` - core + CID utilities (61 KB)
- **Achievement**: 61 KB compressed - **10× under the 700 KB grant requirement**

#### Testing & Documentation (Phases 7-8)
- **Added** 437 comprehensive tests across all features
- **Added** real S5 portal integration testing (s5.vup.cx)
- **Added** browser compatibility testing (Chrome, Firefox, Safari)
- **Added** performance benchmarks for HAMT operations
- **Added** comprehensive API documentation
- **Added** getting-started tutorial and demo scripts
- **Added** mdBook documentation for docs.sfive.net integration

### Core Improvements

#### Compatibility
- **Fixed** browser bundling by removing Node.js-specific dependencies
- **Fixed** replaced undici with native `globalThis.fetch` for universal compatibility
- **Added** support for Node.js 18+ native fetch API
- **Added** dual browser/Node.js environment support

#### Architecture
- **Added** dual MIT/Apache-2.0 licensing matching s5-rs ecosystem
- **Improved** TypeScript type definitions and IDE support
- **Improved** error handling and validation across all APIs
- **Improved** test coverage to 437 tests passing

#### Bundle Exports
- **Fixed** export architecture to properly include all functionality
- **Fixed** advanced bundle now correctly includes core features
- **Fixed** media bundle can be used standalone or lazy-loaded

### Breaking Changes

- **Path API**: New primary interface for file operations (legacy CID-based API still available)
- **Directory Format**: Uses DirV1 CBOR format (not compatible with old MessagePack format)
- **Package Name**: Published as `@s5-dev/s5js` (replaces `s5-js`)
- **Node.js**: Requires Node.js 20+ (for native fetch support)

### Grant Context

This release fulfills Milestones 2-8 of the Sia Foundation grant for Enhanced s5.js:
- **Month 2-3**: Path-based API and HAMT integration
- **Month 4**: Directory utilities (walker, batch operations)
- **Month 5**: Media processing foundation
- **Month 6**: Advanced media features and CID API
- **Month 7**: Testing and performance validation
- **Month 8**: Documentation and upstream integration

**Total Grant Value**: $49,600 USD (8 months × $6,200/month)

### Performance

- **HAMT Sharding**: O(log n) operations on directories with millions of entries
- **Bundle Size**: 61 KB (brotli) - 10× under budget
- **Cursor Pagination**: Memory-efficient iteration over large directories
- **Media Processing**: Thumbnail generation in ~50ms (WASM) or ~100ms (Canvas)

### Known Limitations

- Browser tests require Python 3 for local HTTP server
- WebAssembly media processing requires modern browser support
- HAMT sharding threshold set at 1000 entries (configurable)

### Contributors

- **Jules Lai (julesl23)** - Grant implementation
- **redsolver** - Original s5.js architecture and guidance
- **Lume Web** - S5 protocol development

### Links

- **Grant Proposal**: [Sia Foundation Grant - Enhanced s5.js](docs/grant/Sia%20Standard%20Grant%20-%20Enhanced%20s5_js.md)
- **API Documentation**: [docs/API.md](docs/API.md)
- **Design Documents**:
  - [Enhanced S5.js - Revised Code Design](docs/design/Enhanced%20S5_js%20-%20Revised%20Code%20Design.md)
  - [Enhanced S5.js - Revised Code Design - Part II](docs/design/Enhanced%20S5_js%20-%20Revised%20Code%20Design%20-%20part%20II.md)
- **Testing Guide**: [docs/testing/MILESTONE5_TESTING_GUIDE.md](docs/testing/MILESTONE5_TESTING_GUIDE.md)
- **Bundle Analysis**: [docs/BUNDLE_ANALYSIS.md](docs/BUNDLE_ANALYSIS.md)
- **Benchmarks**: [docs/BENCHMARKS.md](docs/BENCHMARKS.md)

---

## Pre-Grant History

For changes prior to the Enhanced s5.js grant project, see the original s5.js repository history.
