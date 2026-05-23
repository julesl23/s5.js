# Enhanced S5.js — Post-Grant Community Update

**Author:** Jules Lai
**Date:** 23 May 2026
**Grant Completed:** 4 December 2025
**Current Version:** v0.9.0-beta.49
**Package:** `@julesl23/s5js@beta`
**Tests Passing:** 559

---

## Introduction

The Enhanced S5.js grant, funded by the Sia Foundation, was successfully completed on 4 December 2025. All eight phases of the grant were delivered: path-based API, HAMT sharding, media processing, Advanced CID API, testing and performance, and documentation.

This document summarises the work that has continued since grant completion. Enhanced S5.js remains actively maintained and improved, driven by real-world production usage and community feedback.

---

## Summary of Post-Grant Improvements

Since December 2025, **17 commits** have landed across roughly five and a half months of continued development, delivering new features, production-hardening fixes, and developer experience improvements. The test suite has grown from 490 to 559 passing tests.

### New Features

| Feature | Version | Date | Description |
|---------|---------|------|-------------|
| **Connection API** | beta.5 | 2025-12-09 | WebSocket lifecycle management for mobile apps — `getConnectionStatus()`, `onConnectionChange()`, `reconnect()` with timeout and race protection |
| **Public Download by CID** | beta.10–13 | 2026-01-12 | `s5.downloadByCID(cid)` enables public content sharing between users via P2P discovery with BLAKE3 hash verification |
| **Identity Signing API** | beta.32–35 | 2026-01-26 | Ed25519 signing for backend-mediated portal registration — `getSigningPublicKey()`, `sign()`, `setPortalAuth()`, `storePortalCredentials()` |
| **Encrypted Blob Hash Access** | beta.42 | 2026-03-21 | `uploadBlobEncrypted()` now returns `encryptedBlobHash` and `padding`, enabling callers to construct encrypted CIDs externally |
| **Per-Directory Mutex** | beta.45 | 2026-04-03 | Concurrent writes to the same directory now serialize via keyed `AsyncMutex`, eliminating retry cascades (30–65s down to 2–10s under contention) |
| **Cross-Identity Public Directory Read** | beta.46 | 2026-04-09 | `getPublicDirectoryKey()` and `readFromPublicDirectory()` enable reading files from another user's unencrypted directory tree via a shared 32-byte Ed25519 public key — no identity required for the reader |
| **Cross-Identity Directory Key Lookup** | beta.47 | 2026-04-19 | `getPublicDirectoryKeyFrom()` resolves the 32-byte Ed25519 registry pubkey for any sub-directory under another user's tree — ready to pass to `api.registryListen(pk)` for live push subscriptions without polling |
| **Directory-Metadata Cache** | beta.49 | 2026-05-23 | Instance-scoped read-through cache with in-flight coalescing — reads sharing a path prefix fetch each ancestor once instead of re-walking the whole prefix. A real landing page dropped from 36s to 6.5s (5.6×). `s5.fs` is now memoized so the cache (and the per-directory mutex) is shared across calls; configurable TTL via `directoryCacheTtlMs` |
| **Runtime Debug Logging** | beta.37 | 2026-01-27 | Standard `debug` package integration with namespaced loggers — enable with `DEBUG=s5js:*` (Node.js) or `localStorage.debug = 's5js:*'` (browser) |

### Production-Hardening Fixes

These fixes were identified and resolved through real-world production deployment:

| Fix | Version | Date | Description |
|-----|---------|------|-------------|
| **Portal Blob Persistence** | beta.17–29 | 2026-01-25–26 | Comprehensive fix for blob download reliability — portal fallback when P2P hasn't propagated, read-your-writes consistency via in-memory registry and blob caches, correct z-prefix (base58btc) CID format for portal downloads |
| **Registry Revision Conflicts** | beta.18–20 | 2026-01-25 | Fixed "Revision number too low" errors when registry has stale entries from another portal — proper revision preservation on 404, retry with re-fetch, and `_createDirectory()` now queries existing revisions |
| **Error Handling Hardening** | beta.41, 44 | 2026-02-03, 2026-03-22 | Fixed `dbgError()` crash on non-Error objects, prevented error masking in `runTransactionOnDirectory` catch block, `createFile()` now throws proper Error instances |
| **CID Format Fixes** | beta.43 | 2026-03-21 | Fixed `detectCIDFormat()` and `parseCID()` using wrong base64 decoder for u-prefix CIDs — was causing `downloadByCID` failures with encrypted CIDs |
| **Login Failure Surfacing** | beta.48 | 2026-04-24 | `setupAccount()` now re-throws portal login failures instead of silently leaving a half-configured account (`Bearer undefined`) that returned 401 on every authenticated upload — callers can now detect the failure and re-login |
| **Console Log Cleanup** | beta.2 | 2025-12-06 | Removed seed phrase from console output (security), reduced active log statements by 45% |

---

## Feature Details

### Connection API (beta.5)

Mobile and React Native applications need explicit control over WebSocket connections — reconnecting after backgrounding, detecting offline state, and cleaning up on unmount. The Connection API provides this:

```typescript
const status = s5.getConnectionStatus();
// { connected: true, peers: 3, totalPeers: 3 }

const unsubscribe = s5.onConnectionChange((status) => {
  if (!status.connected) showOfflineBanner();
});

await s5.reconnect(); // Force reconnect with 10s timeout
```

19 tests added. Full documentation in `docs/API.md`.

### Public Download by CID (beta.10–13)

Enables public content sharing across users without requiring both parties to be authenticated:

```typescript
// User A: upload and share
await s5.fs.put("public/report.pdf", data);
const cid = await advanced.pathToCID("public/report.pdf");
const cidString = formatCID(cid); // Share this string

// User B: download (no auth needed)
const data = await s5.downloadByCID(cidString);
```

Supports both 53-char raw hash and 59-char BlobIdentifier CID formats. Downloads are verified with BLAKE3 hashing. 22 tests added.

### Identity Signing API (beta.32–35)

Enables secure portal registration where master authentication tokens stay server-side while browsers handle Ed25519 signing:

```typescript
const pubKey = s5.getSigningPublicKey(seed);  // With 0xed multikey prefix
const signature = await s5.sign(challenge, seed);
s5.setPortalAuth(portalUrl, authToken);  // Immediate session use
```

Exports `CHALLENGE_TYPE_REGISTER` and `CHALLENGE_TYPE_LOGIN` constants. 19 tests added.

### Per-Directory Mutex (beta.45)

When multiple concurrent `fs.put()` calls target the same directory, they previously raced on the registry revision number, causing cascading retries costing 2 HTTP round-trips each. The keyed `AsyncMutex` serializes writes to the same directory while allowing different directories to proceed in parallel:

- Same directory: serialized (no retry cascades)
- Different directories: fully parallel (no unnecessary blocking)
- Zero external dependencies, Promise-chain pattern
- Lock automatically released on error (no deadlock risk)

123 concurrency tests and 108 mutex unit tests added.

### Cross-Identity Public Directory Access (beta.46, beta.47)

Enables multi-user workflows where one identity publishes data and other identities read it (and now *subscribe* to it) using only a shared public key. FS5 child directories are already stored unencrypted — only the root is encrypted — so no encryption changes were needed.

**beta.46** introduced the read half of the API. **beta.47** completed it with sub-directory key resolution, enabling push-based live subscriptions via `api.registryListen(pk)` — a primitive the SDK already exposed but which couldn't be used cross-identity until now.

```typescript
// Operator: extract and share the directory's public key
const pubKey = await operatorFs.getPublicDirectoryKey("home/storefront");
// Share pubKey with viewers (e.g., store in platform config)

// Viewer A: read from operator's directory (no identity needed)
const viewerFs = new FS5(api); // No identity
const data = await viewerFs.readFromPublicDirectory(pubKey, "catalogue.json");
const catalogue = JSON.parse(new TextDecoder().decode(data!));

// Viewer B (beta.47): resolve a sub-directory's pubkey for live subscription
const newsPk = await viewerFs.getPublicDirectoryKeyFrom(pubKey, "news");
for await (const entry of api.registryListen(newsPk!)) {
  refreshNewsFeed(entry);  // push updates, no polling
}
```

**Three FS5 methods**:

- `getPublicDirectoryKey(path)` — returns 32-byte Ed25519 public key for a directory's registry entry (requires identity)
- `readFromPublicDirectory(remotePubKey, subpath)` — reads file content as raw `Uint8Array` from another user's directory tree (no identity required)
- `getPublicDirectoryKeyFrom(remotePubKey, subpath)` — resolves the 32-byte Ed25519 registry pubkey for any sub-directory under another user's tree; empty subpath returns the input pubkey unchanged (pass-through)

**Use cases unblocked**: creator/operator platforms, follower fan-out, cross-persona data sharing, public content indexes, reactive UIs without polling.

**Behaviour**:
- Returns `undefined` for missing files/directories, encrypted content without key, immutable (`fixed_hash_blake3`) links, or invalid keys
- Throws on invalid `remotePubKey` length (must be exactly 32 bytes)
- Supports nested subpaths and both Map and HAMT-backed directories
- 19 tests added across both betas (11 + 8)

### Directory-Metadata Cache (beta.49)

`FS5._getDirectoryMetadata()` is the universal directory-read primitive — a `registryGet` plus a `downloadBlobAsBytes`, two network round-trips per directory — and it was previously uncached. Any two reads sharing a path prefix re-fetched the entire shared prefix (`root`, `home`, …) over the network every time, so a page doing N reads paid roughly N × prefix-depth round-trips. A real consumer landing page doing ~6 reads under a shared prefix took **36 seconds**; an instance-scoped read-through cache cut it to **6.5 seconds (5.6×)**, and a multi-creator page dropped from **53 to 29** directory loads.

```typescript
// Optional: tune the cross-identity staleness window (default 30s)
const s5 = await S5.create({ initialPeers: [...], directoryCacheTtlMs: 30000 });
```

Key properties:

- **In-flight coalescing**: N concurrent reads of the same uncached directory share ONE network load — the cache stores the pending promise, populated synchronously before the first `await`.
- **`s5.fs` is now memoized**: previously `get fs()` returned a new `FS5` on every access, so an instance cache (or the per-directory mutex) only helped callers that happened to reuse one reference. The getter now returns a stable instance, dropped on identity recovery so a new identity never serves another's cached directories. This also makes the beta.45 per-directory mutex effective process-wide for `s5.fs` callers. **Behaviour change:** `s5.fs === s5.fs` now holds.
- **Correctness**: the write path reads revisions live (`{ fresh: true }`, bypassing the cache) so retries never spin on a stale revision, and every `registrySet` invalidates only the written directory's key (siblings/ancestors stay valid); misses and the synthetic empty-directory-on-404 are never cached. HAMT is unaffected — the cache holds only the `DirV1` + registry entry, and HAMT nodes load downstream from the content-addressed, immutable directory.

11 tests added (9 cache + 2 `s5.fs` memoization).

---

## Metrics

| Metric | At Grant Completion | Current | Change |
|--------|-------------------|---------|--------|
| **Tests passing** | 490 | 559 | +69 |
| **Beta version** | beta.2 | beta.49 | +47 releases |
| **Bundle size** | 60.09 KB (brotli) | 69.81 KB (brotli) | +9.72 KB |
| **Features added** | — | 9 | — |
| **Production fixes** | — | 6 categories | — |

Bundle size remains well under the 700 KB grant target at 69.81 KB (630.19 KB margin). The increase since grant completion reflects the cross-identity directory APIs (beta.46–47) and the directory-metadata cache (beta.49).

---

## Production Validation

Enhanced S5.js is deployed in production as part of the Fabstir platform (Platformless AI). The post-grant fixes listed above were identified and validated through this production deployment, covering:

- WebSocket reconnection on mobile devices
- Portal registration with Ed25519 signing
- Blob upload, download, and P2P propagation
- Registry consistency across browser sessions
- Concurrent directory writes from multiple AI agents
- Directory read latency on multi-read pages (the cache was driven by a real 36s → 6.5s page-load measurement)

---

## Ongoing Commitment

Enhanced S5.js will continue to be maintained and improved. Current areas of focus:

- **Stability**: Continued production-hardening based on real-world usage
- **Performance**: Concurrency and caching improvements (the directory-metadata cache and per-directory mutex are the latest examples)
- **Developer experience**: Better error messages, debug logging, and documentation
- **Ecosystem**: Supporting adoption beyond the initial Fabstir deployment

Community contributions, bug reports, and feature requests are welcome via the [GitHub repository](https://github.com/julesl23/s5.js).

---

## Acknowledgements

Thank you to the Sia Foundation for funding the original grant that made Enhanced S5.js possible. The continued post-grant development demonstrates the lasting value of that investment in the Sia/S5 ecosystem.

---

**Jules Lai**
Enhanced S5.js Maintainer
