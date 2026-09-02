# Changelog

All notable changes to Enhanced s5.js will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Post-grant releases are summarised below. For exhaustive per-version notes (including production-hardening fixes across beta.2–beta.44), see [`docs/POST_GRANT_UPDATE.md`](docs/POST_GRANT_UPDATE.md).

## [0.9.0-beta.55] - 2026-09-02

### Fixed

- **Critical liveness fix — `S5Node.downloadBlobAsBytes` could hang forever.** The 10s budget was evaluated only *between* `while` iterations while the `fetch` inside the `for` loop carried no `AbortSignal`, so a single P2P-advertised location that accepted the connection and never responded parked the `await` indefinitely. The function neither returned nor threw. Because it never threw, the `catch` in `identity/api.ts` never fired and the **portal fallback never ran** — a working route to the data (measured at 0.2s by the reporter) was there the whole time. A process restart cleared `p2p.blobLocations`, which is why fresh discovery worked until stale locations accumulated again. Reported by the Fabstir node/bridge developer.
  - This also **disabled beta.54's repair**: `repairDirectory` and `ensureIdentityInitialized({ repair: true })` await this same call, so a directory with a stale hanging location made them hang too — the same "no way back" symptom the repair was written to cure, one layer down.
  - Every wait on the blob path is now bounded, with a deliberate **connect/read split**: a per-attempt *headers* budget (3s — the reported failure is "accepts the connection but never responds") and a separate *body* budget (60s, armed only once headers arrive). The global `timeoutMs` continues to bound the discovery loop only, so an in-flight transfer is never killed by it. A single blunt per-attempt signal would have aborted the body too and cut off slow-but-alive peers mid-transfer — trading a hang for a data-availability regression on large files.
  - The thrown message still contains `not found`, so the FS layer still types it as a **retryable `S5DirectoryLoadError`** and beta.54's contract is preserved. Covered by a dedicated seam test.
- **A definitively-unavailable blob no longer costs the full `timeoutMs`.** Once every known location had been tried, the `for` body was skipped on each pass — the loop could make no progress — yet it kept spinning on `sleep(10)` until the deadline. With a directory node fanning out to many children, that was minutes. "Still discovering" and "every known location has failed" are now distinguished: the latter gets a short `exhaustedGraceMs` (default 1000) instead of the whole budget, and the grace **resets** whenever an untried location appears, so a late-arriving healthy peer is still used. Zero discovered locations is *not* exhaustion — that is discovery, and it keeps the full budget. Safe to keep short because a failure falls through to the portal fallback (0.2s measured). Raised by the Fabstir v2 developer on top of the node developer's report.
- **`S5Node.ensureInitialized()` no longer spins forever** — it now rejects after `timeoutMs` (default 30000), with a message distinguishing "never initialised" from "initialised but not connected". **Behaviour change:** `S5.create()` on a slow or absent network now rejects instead of hanging. `src/server.ts` already raced it with its own timeout and is unaffected.
- **Portal upload and the portal download fallback are bounded too** (`src/identity/api.ts`). The fallback is the escape hatch for a hung P2P download, so it must not be able to hang itself; an unbounded upload would hang every `put()`.
- **`npm run test:run` now exits 0.** `test/connection-api.test.ts` attached its rejection assertion *after* advancing fake timers, so the rejection was momentarily unhandled — vitest exits non-zero on that even with all tests passing, which silently truncated `type-check && test:run && build` before the build ever ran.

### Added

- **`abortable(promise, signal)`** (`src/util/abortable.ts`) — settles with the promise, or rejects the moment the signal fires. Passing a signal to `fetch` *asks* a runtime to abort the socket; it does not guarantee the call returns. Every network wait on the blob path is wrapped so the guarantee is ours rather than the runtime's.

### Known limitation

- `src/account/login.ts`, `src/account/register.ts` and `src/media/wasm/loader.ts` fetches remain **unbounded**. "Every network wait is bounded" is true of the blob path, not yet of the whole library. Deliberate: the auth path is the one thing that must not wobble in a release about to be live-tested, and no auth hang has been reported.

## [0.9.0-beta.54] - 2026-09-01

> Version numbers `beta.51`–`beta.53` are deliberately skipped: they were used by a downstream consumer for local `dist/`-only patches that were never built from this source.

### Fixed

- **The documented root repair was unreachable.** `ensureIdentityInitialized` read the root *before* consulting `opts.repair`, so the read threw and the repair branch never ran — `ensureIdentityInitialized({ repair: true })`, the remedy named in the guard's own error message, behaved identically to the plain call. An identity whose registry entry existed but whose root blob was gone could not be recovered through the public API. It now recovers in place, **losslessly**: the root is rebuilt with the *existing* `home`/`archive` re-linked (their keys are deterministic), in a single registry write, and neither child is written to.

### Added

- **`fs.repairDirectory(path)`** — a path-scoped escape hatch for a directory whose blob is genuinely unretrievable (a storage outage during which the registry advanced to a revision whose blob never persisted). One directory per call, used **reactively** with the path from an observed failure. Returns a `RepairResult` (exported type).
  - **Safety property (contract):** it re-reads the directory with the cache bypassed and returns `{ repaired: false, reason: "loadable" }` without writing if the blob has come back — a 404 that was genuinely transient can never be turned into a rebuild after the fact. Other no-write outcomes are `"absent"` (no registry entry) and `"not-derivable"` (the parent links a key we would not derive, i.e. an externally-linked directory).
  - A non-root repair is **lossy but not destructive**: the lost blob held the child names, so the replacement is empty — but child keys derive from the parent write key plus the name, so re-writing a known path re-links the surviving subtree. There is deliberately no recursive or bulk repair; a lost directory's children cannot be enumerated.
  - `repairDirectory("")` subsumes the root case, and `ensureIdentityInitialized({ repair: true })` delegates to it.
- **`S5DirectoryLoadError` now names its target:** `error.path` (the *directory* that failed — `""` for the root, not the path originally requested) and `error.publicKey` (hex registry key). Without attribution a path-scoped repair is not expressible, which is why the first consumer-side workaround reached for a session-wide "treat 404 as empty" mode. Attribution is additive: `retryable` and `code` are unchanged, and sites that cannot know the path (HAMT-internal blobs, cross-identity public reads) leave it `undefined` rather than guess.

### Changed

- **No guard was relaxed.** `_fetchDirectoryMetadata` still refuses to synthesise an empty directory on a 404, and `allowEmptyOn404` is still set by no caller. Repair performs its own diagnostic read and targeted write under the existing per-directory mutex, so the strict default holds on every other path.
- `_createDirectory` gained an internal `linkIfPresent` option (used only by repair) that links to whatever already exists at a child key — including an unloadable or empty one — without writing to it. Ordinary creates keep beta.50's loud refusal on an unconfirmable child.

## [0.9.0-beta.50] - 2026-06-15

### Fixed

- **Critical data-loss fix — `ensureIdentityInitialized` no longer orphans the filesystem on a transient root-load 404.** A momentary blob 404 during a routine login could make the root load as a synthetic *empty* directory, so `ensureIdentityInitialized` saw `home`/`archive` "missing" and re-published them empty at a valid next revision — silently orphaning the entire user subtree. Fixed with three independent layers:
  - **`_fetchDirectoryMetadata` no longer fakes "empty" on a 404.** A 404 of a *known* directory blob now throws a retryable `S5DirectoryLoadError` (the legacy behaviour is gated behind an off-by-default `allowEmptyOn404` no caller sets). The transaction retry loop handles transient cases; a persistent 404 surfaces as an error, never a wipe.
  - **`ensureIdentityInitialized({ repair? })` only initialises a genuinely new root.** It heals a partial root (exactly one of `home`/`archive` present), but a root that exists yet has *neither* throws a **non-retryable** error (opt-in `{ repair: true }` heal) instead of recreating both.
  - **`_createDirectory` never overwrites a live directory** — it links to an existing non-empty directory (or refuses on a 404) instead of republishing an empty blob.

### Added

- **`S5DirectoryLoadError`** (exported from `@julesl23/s5js`, `/core`, `/advanced`) with `retryable: boolean`, stable `code === "S5_DIRECTORY_LOAD_ERROR"`, and the `isS5DirectoryLoadError()` type guard. Consumers MUST treat `retryable` as "retry with backoff", never as "absent/empty".

### Changed

- **Typed retryable errors now propagate uniformly to consumers.** `fs.get()` throws on a transient 404 of a known directory (was silent `undefined`); a genuinely-absent directory (no registry entry) still returns `undefined`. Writes (`put`/`delete`/`createDirectory`/`createFile`) reject with the same typed error via `DirectoryTransactionResult.unwrap()`. `DirectoryWalker` and `BatchOperations.copyDirectory`/`deleteDirectory` re-throw a retryable error instead of silently reporting an incomplete walk/copy/delete as success. HAMT shard-root and internal-node blob 404s, and file-content blob 404s, are typed the same way.

> Consumer-side rollout: honour `retryable` (retry/backoff, never catch-and-treat-as-empty); `connect()` must fail-and-retry rather than proceed "logged in but empty." See `docs/development/MESSAGE-S5-DEVELOPER-DATALOSS-FIX.md`.

## [0.9.0-beta.49] - 2026-05-23

### Changed

- **Directory-Metadata Cache** — `FS5._getDirectoryMetadata()` now has an instance-scoped, read-through cache keyed by the directory's registry public key. Reads sharing a path prefix fetch each ancestor **once** instead of re-walking the whole prefix over the network on every read. Measured on a real consumer page: a 6-read landing page **36s → 6.5s (5.6×)**; a multi-creator page **53 → 29 directory loads**.
  - **In-flight coalescing**: N concurrent reads of the same uncached directory share ONE network load (the cache slot holds the pending promise, populated synchronously before the first `await`).
  - **`s5.fs` is now memoized** — the getter previously returned a new `FS5` on every access, so the cache (and the per-directory mutex) only helped callers that happened to reuse one reference. It now returns a stable instance, dropped on identity recovery so a new identity never serves another's cached directories. **Behavior change:** `s5.fs === s5.fs` now holds.
  - **Correctness**: the write path's revision read bypasses the cache (`{ fresh: true }`) so each retry reads a live revision; every `registrySet` invalidates only the written directory's key (siblings/ancestors stay valid). Misses and the synthetic empty-dir-on-blob-404 are never cached.

### Added

- `directoryCacheTtlMs` option on `S5.create(...)` and `new FS5(api, identity, { directoryCacheTtlMs })` (default **30s**) to tune the cross-identity staleness window.
- 11 new tests — 9 cache (hit/coalescing, write-path correctness, miss/404/TTL policy) + 2 `s5.fs` memoization/teardown (total: **559** passing).

### Notes

- Purely additive to the public API except the `s5.fs` identity (now a stable reference); no protocol or serialization changes.
- HAMT is unaffected: the cache holds only the `DirV1` + registry entry; HAMT nodes load downstream from the returned (content-addressed, immutable) DirV1.

## [0.9.0-beta.47] - 2026-04-19

### Added

- **Cross-Identity Directory Key Lookup** — `FS5.getPublicDirectoryKeyFrom(remotePubKey, subpath)` resolves the 32-byte Ed25519 registry pubkey for any sub-directory under another user's public tree. Returned pubkey is ready to pass to `api.registryListen(pk)` for push-based live subscriptions (no polling). No identity required on the caller side.
- Empty subpath (`""` or `"/"`) returns the input `remotePubKey` unchanged (pass-through).
- 8 new tests (total: 548 passing).

### Notes

- Purely additive; no breaking changes, no protocol changes.
- Returns `undefined` for missing segments, file-as-final, `fixed_hash_blake3` links, or encrypted intermediates.
- Throws on invalid `remotePubKey` length (must be exactly 32 bytes).

## [0.9.0-beta.46] - 2026-04-09

### Added

- **Cross-Identity Public Directory Read** — two new `FS5` methods enable multi-user data sharing via a shared Ed25519 public key:
  - `getPublicDirectoryKey(path)` — extract the 32-byte registry pubkey for one of your own directories (requires identity).
  - `readFromPublicDirectory(remotePubKey, subpath)` — read file content from another user's unencrypted directory tree (no identity required for the reader).
- Supports nested subpaths and both Map- and HAMT-backed directories.
- 11 new tests (total: 540 passing).

### Notes

- Purely additive; no breaking changes. FS5 child directories were already stored unencrypted, so no encryption changes were needed.

## [0.9.0-beta.45] - 2026-04-03

### Changed

- **Per-Directory Mutex** — concurrent `fs.put()` calls to the same directory now serialize via a keyed `AsyncMutex`, eliminating retry cascades (30–65s → 2–10s under contention). Different directories remain fully parallel. Zero external dependencies, automatic lock release on error.

### Added

- 123 concurrency tests and 108 mutex unit tests.

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
