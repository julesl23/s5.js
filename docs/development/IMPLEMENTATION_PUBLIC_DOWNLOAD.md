# Public Download by CID Implementation Plan

## Overview

Add public download functionality to S5.js so users can download content by CID from S5 portals. This completes the public sharing workflow:

1. **User A uploads**: `fs5.put("home/file.txt", data)` → blob stored on S5 network
2. **User A gets CID**: `advanced.pathToCID("home/file.txt")` → returns 32-byte hash
3. **User A shares**: Convert CID to string format and share with User B
4. **User B downloads**: `api.downloadByCID(cidString)` → returns data (NEW)

## Current State

| Operation | Status | Implementation |
|-----------|--------|----------------|
| Upload to portal | ✅ Works | `POST /s5/upload` in `S5APIWithIdentity.uploadBlob()` |
| Get CID from path | ✅ Works | `FS5Advanced.pathToCID()` returns 32-byte hash |
| Format CID as string | ✅ Works | `formatCID()` returns 53-char base32 string |
| Download by CID | ❌ Missing | Need `GET /{cid}` portal endpoint |

## CID Format Analysis

S5.js has two CID formats:

| Format | Bytes | String Length | Structure |
|--------|-------|---------------|-----------|
| Raw Hash (cid-utils) | 32 | 53 chars | `b` + 52 base32 (raw BLAKE3) |
| BlobIdentifier | 36+ | ~59 chars | `b` + base32(prefix + hash + size) |

**Portal Download Endpoint**: `GET {portalUrl}/{cid}` accepts BlobIdentifier format (59 chars).

**Decision**: Support both formats. Detect format by length and convert if needed.

## API Design

### New Methods

```typescript
// In S5APIWithIdentity (src/identity/api.ts)
async downloadByCID(cid: string | Uint8Array): Promise<Uint8Array>

// In S5 class (src/s5.ts) - public convenience method
async downloadByCID(cid: string | Uint8Array): Promise<Uint8Array>
```

### Behavior

1. Accept CID as string (base32) or Uint8Array (raw bytes)
2. Validate CID format
3. Try each configured portal until success
4. Verify downloaded content matches CID hash
5. Return raw bytes

---

## Phase 1: Write Tests for Public Download ✅

**Test Results:** ✅ **22 tests passed** (43ms execution time)

### Sub-phase 1.1: Create Test Infrastructure ✅

**Goal**: Set up test file and mock HTTP infrastructure for testing portal downloads.

**Line Budget**: 80 lines

#### Tasks
- [x] Create test file `test/public-download.test.ts`
- [x] Create mock fetch function that returns configurable responses
- [x] Create helper to instantiate S5APIWithIdentity with mock portals
- [x] Write test: downloadByCID throws if no portals configured

**Test Files:**
- `test/public-download.test.ts` (NEW, ~80 lines)

**Success Criteria:**
- [x] Mock fetch can return success/error responses
- [x] S5APIWithIdentity can be instantiated with test portals
- [x] First test passes: throws when no portals configured

---

### Sub-phase 1.2: Write Tests for CID Validation ✅

**Goal**: Test CID format validation and conversion.

**Line Budget**: 60 lines

#### Tasks
- [x] Write test: accepts 53-char base32 CID string (raw hash format)
- [x] Write test: accepts 59-char base32 CID string (BlobIdentifier format)
- [x] Write test: accepts 32-byte Uint8Array CID
- [x] Write test: throws on invalid CID string (wrong length)
- [x] Write test: throws on invalid CID string (invalid characters)
- [x] Write test: throws on invalid Uint8Array CID (wrong length)

**Test Files:**
- `test/public-download.test.ts` (ADD ~60 lines)

**Success Criteria:**
- [x] 6 tests for CID validation
- [x] Both string and Uint8Array inputs tested
- [x] Both CID formats (53-char and 59-char) tested

---

### Sub-phase 1.3: Write Tests for Portal Download ✅

**Goal**: Test HTTP download from portals with fallback.

**Line Budget**: 100 lines

#### Tasks
- [x] Write test: downloads from first portal on success
- [x] Write test: falls back to second portal if first fails
- [x] Write test: tries all portals before throwing
- [x] Write test: throws if all portals fail
- [x] Write test: constructs correct URL: `{protocol}://{host}/{cid}`
- [x] Write test: handles HTTP 404 response gracefully
- [x] Write test: handles network error gracefully

**Test Files:**
- `test/public-download.test.ts` (ADD ~100 lines)

**Success Criteria:**
- [x] 7 tests for portal download logic
- [x] Fallback behavior tested
- [x] Error handling tested

---

### Sub-phase 1.4: Write Tests for Hash Verification ✅

**Goal**: Test that downloaded content is verified against CID.

**Line Budget**: 60 lines

#### Tasks
- [x] Write test: returns data when hash matches CID
- [x] Write test: throws when downloaded data hash doesn't match CID
- [x] Write test: verification uses BLAKE3 hash
- [x] Write test: verification works with both CID formats

**Test Files:**
- `test/public-download.test.ts` (ADD ~60 lines)

**Success Criteria:**
- [x] 4 tests for hash verification
- [x] Tampered data is rejected
- [x] Both CID formats verified correctly

---

## Phase 2: Implement CID Utilities ✅

### Sub-phase 2.1: Add CID Format Detection ✅

**Goal**: Add utility to detect and convert between CID formats.

**Line Budget**: 40 lines

#### Tasks
- [x] Add `detectCIDFormat(cid: string): 'raw' | 'blob'` function
- [x] Add `cidStringToHash(cid: string): Uint8Array` function
- [x] Handle 53-char raw hash format (decode base32, return 32 bytes)
- [x] Handle 59-char BlobIdentifier format (decode, extract hash)
- [x] Add validation for invalid formats

**Implementation Files:**
- `src/fs/cid-utils.ts` (ADD ~80 lines)

**Success Criteria:**
- [x] Can detect CID format from string length
- [x] Can extract raw 32-byte hash from either format
- [x] Tests pass

---

### Sub-phase 2.2: Add CID to Download URL Conversion ✅

**Goal**: Convert CID to the format expected by portal download endpoint.

**Line Budget**: 25 lines

#### Tasks
- [x] Add `cidToDownloadFormat(cid: string | Uint8Array): string` function
- [x] Handle string input (validate and return as-is)
- [x] Handle Uint8Array input (convert to base32 string)
- [x] Add validation for invalid inputs

**Implementation Files:**
- `src/fs/cid-utils.ts` (ADD ~40 lines)

**Success Criteria:**
- [x] CID converted to portal-compatible format
- [x] Both input formats handled

---

## Phase 3: Implement Portal Download ✅

### Sub-phase 3.1: Add downloadByCID to S5APIWithIdentity ✅

**Goal**: Implement the core download method.

**Line Budget**: 60 lines

#### Tasks
- [x] Add `async downloadByCID(cid: string | Uint8Array): Promise<Uint8Array>` method
- [x] Validate CID format
- [x] Get list of configured portals from `accountConfigs`
- [x] Throw if no portals configured
- [x] Convert CID to download format

**Implementation Files:**
- `src/identity/api.ts` (ADD ~110 lines)

**Success Criteria:**
- [x] Method signature matches design
- [x] CID validation works
- [x] Portal list retrieved correctly

---

### Sub-phase 3.2: Implement Portal Fallback Logic ✅

**Goal**: Try portals in sequence until success.

#### Tasks
- [x] Iterate through configured portals
- [x] Construct download URL: `${portal.protocol}://${portal.host}/${cid}`
- [x] Use `getHttpClient()` for fetch (environment-aware)
- [x] Handle HTTP errors (4xx, 5xx) - try next portal
- [x] Handle network errors - try next portal
- [x] Throw aggregate error if all portals fail

**Success Criteria:**
- [x] Downloads from first successful portal
- [x] Falls back on failure
- [x] Tests from Sub-phase 1.3 pass

---

### Sub-phase 3.3: Add Hash Verification ✅

**Goal**: Verify downloaded content matches CID.

#### Tasks
- [x] Hash downloaded bytes with BLAKE3
- [x] Compare hash with CID
- [x] Throw error if mismatch (data integrity failure)
- [x] Return verified bytes on success

**Success Criteria:**
- [x] Downloaded data is verified
- [x] Tampered data rejected
- [x] Tests from Sub-phase 1.4 pass

---

## Phase 4: Expose Public API ✅

### Sub-phase 4.1: Add downloadByCID to S5 Class ✅

**Goal**: Expose download method on main S5 class.

**Line Budget**: 20 lines

#### Tasks
- [x] Add `async downloadByCID(cid: string | Uint8Array): Promise<Uint8Array>` to S5 class
- [x] Delegate to `this.apiWithIdentity.downloadByCID()` if identity exists
- [x] Throw helpful error if no identity/portals configured

**Implementation Files:**
- `src/s5.ts` (ADD ~30 lines)

**Success Criteria:**
- [x] S5 class exposes downloadByCID method
- [x] Works when identity is configured
- [x] Clear error when not configured

---

### Sub-phase 4.2: Export from Entry Points ✅

**Goal**: Export new functionality from package entry points.

#### Tasks
- [x] Export `detectCIDFormat`, `cidStringToHash`, `cidToDownloadFormat` from `src/fs/cid-utils.ts`
- [x] Export `CIDFormat` type
- [x] Update exports in `src/index.ts`
- [x] Update exports in `src/exports/advanced.ts`

**Implementation Files:**
- `src/index.ts` (UPDATED)
- `src/exports/advanced.ts` (UPDATED)

**Success Criteria:**
- [x] All new utilities exported
- [x] TypeScript consumers can import

---

## Phase 5: Integration Testing and Documentation

### Sub-phase 5.1: Run All Tests ✅

**Goal**: Ensure all tests pass with no regressions.

#### Tasks
- [x] Run `npm run test:run test/public-download.test.ts`
- [x] Run full test suite `npm run test:run`
- [x] Run type check `npm run type-check`
- [x] Fix any failing tests

**Test Results:** ✅ **22 public download tests passed**, 478 total tests passed

**Success Criteria:**
- [x] All public download tests pass
- [x] No regressions in existing tests
- [x] TypeScript compilation succeeds

---

### Sub-phase 5.2: Update API Documentation

**Goal**: Document the new public download API.

**Status**: Pending - can be done as follow-up

#### Tasks
- [ ] Add downloadByCID to docs/API.md
- [ ] Add usage example for public sharing workflow
- [ ] Document CID format requirements

---

## Summary ✅

**Implementation Status**: COMPLETE (Phases 1-4)

**Files Created:**
- `test/public-download.test.ts` (~530 lines, 22 tests)

**Files Modified:**
- `src/fs/cid-utils.ts` (+120 lines: detectCIDFormat, cidStringToHash, cidToDownloadFormat)
- `src/identity/api.ts` (+110 lines: downloadByCID method)
- `src/s5.ts` (+30 lines: downloadByCID delegation)
- `src/index.ts` (+2 lines: exports)
- `src/exports/advanced.ts` (+7 lines: exports)

**Test Results:**
- 22 new tests for public download functionality
- All tests passing

**New API:**
```typescript
// S5 class method
s5.downloadByCID(cid: string | Uint8Array): Promise<Uint8Array>

// CID utilities
detectCIDFormat(cid: string): CIDFormat  // 'raw' | 'blob'
cidStringToHash(cid: string): Uint8Array  // Extract 32-byte hash
cidToDownloadFormat(cid: string | Uint8Array): string  // Convert to download URL format
```

**Public Sharing Workflow:**
```typescript
// User A: Upload and share
const s5 = await S5.create({ initialPeers: [...] });
await s5.recoverIdentityFromSeedPhrase(seedPhrase);
await s5.registerOnNewPortal('https://s5.ninja');

const fs5 = s5.fs;
await fs5.put("home/public/photo.jpg", imageData);

const advanced = new FS5Advanced(fs5);
const cid = await advanced.pathToCID("home/public/photo.jpg");
const cidString = formatCID(cid);
console.log("Share this CID:", cidString);

// User B: Download by CID
const s5b = await S5.create({ initialPeers: [...] });
await s5b.recoverIdentityFromSeedPhrase(seedPhrase);
await s5b.registerOnNewPortal('https://s5.ninja');

const data = await s5b.downloadByCID(cidString);
```
