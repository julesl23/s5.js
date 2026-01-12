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

## Phase 2: Implement CID Utilities

### Sub-phase 2.1: Add CID Format Detection

**Goal**: Add utility to detect and convert between CID formats.

**Line Budget**: 40 lines

#### Tasks
- [ ] Add `detectCIDFormat(cid: string): 'raw' | 'blob'` function
- [ ] Add `cidStringToHash(cid: string): Uint8Array` function
- [ ] Handle 53-char raw hash format (decode base32, return 32 bytes)
- [ ] Handle 59-char BlobIdentifier format (decode, extract hash)
- [ ] Add validation for invalid formats

**Implementation Files:**
- `src/fs/cid-utils.ts` (ADD ~40 lines)

**Success Criteria:**
- [ ] Can detect CID format from string length
- [ ] Can extract raw 32-byte hash from either format
- [ ] Tests from Sub-phase 1.2 pass

---

### Sub-phase 2.2: Add CID to Download URL Conversion

**Goal**: Convert CID to the format expected by portal download endpoint.

**Line Budget**: 25 lines

#### Tasks
- [ ] Add `cidToDownloadFormat(cid: string | Uint8Array): string` function
- [ ] If input is 59-char string, use as-is
- [ ] If input is 53-char string or 32-byte array, need to determine portal expectation
- [ ] Verify portal accepts raw hash format (may need BlobIdentifier wrapper)

**Implementation Files:**
- `src/fs/cid-utils.ts` (ADD ~25 lines)

**Success Criteria:**
- [ ] CID converted to portal-compatible format
- [ ] Both input formats handled

---

## Phase 3: Implement Portal Download

### Sub-phase 3.1: Add downloadByCID to S5APIWithIdentity

**Goal**: Implement the core download method.

**Line Budget**: 60 lines

#### Tasks
- [ ] Add `async downloadByCID(cid: string | Uint8Array): Promise<Uint8Array>` method
- [ ] Validate CID format
- [ ] Get list of configured portals from `accountConfigs`
- [ ] Throw if no portals configured
- [ ] Convert CID to download format

**Implementation Files:**
- `src/identity/api.ts` (ADD ~60 lines)

**Success Criteria:**
- [ ] Method signature matches design
- [ ] CID validation works
- [ ] Portal list retrieved correctly

---

### Sub-phase 3.2: Implement Portal Fallback Logic

**Goal**: Try portals in sequence until success.

**Line Budget**: 50 lines

#### Tasks
- [ ] Iterate through configured portals
- [ ] Construct download URL: `${portal.protocol}://${portal.host}/${cid}`
- [ ] Use `getHttpClient()` for fetch (environment-aware)
- [ ] Handle HTTP errors (4xx, 5xx) - try next portal
- [ ] Handle network errors - try next portal
- [ ] Throw aggregate error if all portals fail

**Implementation Files:**
- `src/identity/api.ts` (MODIFY downloadByCID, ~50 lines)

**Success Criteria:**
- [ ] Downloads from first successful portal
- [ ] Falls back on failure
- [ ] Tests from Sub-phase 1.3 pass

---

### Sub-phase 3.3: Add Hash Verification

**Goal**: Verify downloaded content matches CID.

**Line Budget**: 30 lines

#### Tasks
- [ ] Hash downloaded bytes with BLAKE3
- [ ] Compare hash with CID
- [ ] Throw error if mismatch (data integrity failure)
- [ ] Return verified bytes on success

**Implementation Files:**
- `src/identity/api.ts` (MODIFY downloadByCID, ~30 lines)

**Success Criteria:**
- [ ] Downloaded data is verified
- [ ] Tampered data rejected
- [ ] Tests from Sub-phase 1.4 pass

---

## Phase 4: Expose Public API

### Sub-phase 4.1: Add downloadByCID to S5 Class

**Goal**: Expose download method on main S5 class.

**Line Budget**: 20 lines

#### Tasks
- [ ] Add `async downloadByCID(cid: string | Uint8Array): Promise<Uint8Array>` to S5 class
- [ ] Delegate to `this.apiWithIdentity.downloadByCID()` if identity exists
- [ ] Throw helpful error if no identity/portals configured

**Implementation Files:**
- `src/s5.ts` (ADD ~20 lines)

**Success Criteria:**
- [ ] S5 class exposes downloadByCID method
- [ ] Works when identity is configured
- [ ] Clear error when not configured

---

### Sub-phase 4.2: Export from Entry Points

**Goal**: Export new functionality from package entry points.

**Line Budget**: 10 lines

#### Tasks
- [ ] Verify `cidStringToHash` exported from `src/fs/cid-utils.ts`
- [ ] Verify exports from `src/index.ts`
- [ ] Verify exports from `src/exports/core.ts`
- [ ] Verify exports from `src/exports/advanced.ts`

**Implementation Files:**
- `src/index.ts` (VERIFY/ADD exports)
- `src/exports/core.ts` (VERIFY/ADD exports)
- `src/exports/advanced.ts` (VERIFY/ADD exports)

**Success Criteria:**
- [ ] All new utilities exported
- [ ] TypeScript consumers can import

---

## Phase 5: Integration Testing and Documentation

### Sub-phase 5.1: Run All Tests

**Goal**: Ensure all tests pass with no regressions.

**Line Budget**: 0 lines (testing only)

#### Tasks
- [ ] Run `npm run test:run test/public-download.test.ts`
- [ ] Run full test suite `npm run test:run`
- [ ] Run type check `npm run type-check`
- [ ] Fix any failing tests

**Success Criteria:**
- [ ] All public download tests pass
- [ ] No regressions in existing tests
- [ ] TypeScript compilation succeeds

---

### Sub-phase 5.2: Update API Documentation

**Goal**: Document the new public download API.

**Line Budget**: 50 lines

#### Tasks
- [ ] Add downloadByCID to docs/API.md
- [ ] Add usage example for public sharing workflow
- [ ] Document CID format requirements

**Documentation Files:**
- `docs/API.md` (ADD ~50 lines)

**Success Criteria:**
- [ ] API documented with examples
- [ ] Public sharing workflow documented

---

## Summary

**Total Line Budget**: ~585 lines
- Tests: ~300 lines
- Implementation: ~225 lines
- Documentation: ~60 lines

**Files to Create:**
- `test/public-download.test.ts` (~300 lines)

**Files to Modify:**
- `src/fs/cid-utils.ts` (~65 lines added)
- `src/identity/api.ts` (~140 lines added)
- `src/s5.ts` (~20 lines added)
- `docs/API.md` (~60 lines added)

**Test Count**: ~24 new tests

**Public Sharing Workflow (After Implementation):**
```typescript
// User A: Upload and share
const s5 = await S5.create({ initialPeers: [...] });
await s5.login(seedPhrase);
await s5.registerPortal('https://s5.ninja');

const fs5 = s5.fs;
await fs5.put("home/public/photo.jpg", imageData);

const advanced = new FS5Advanced(fs5);
const cid = await advanced.pathToCID("home/public/photo.jpg");
const cidString = formatCID(cid);
console.log("Share this CID:", cidString);

// User B: Download by CID
const s5b = await S5.create({ initialPeers: [...] });
await s5b.login(seedPhrase);
await s5b.registerPortal('https://s5.ninja');

const data = await s5b.downloadByCID(cidString);
```
