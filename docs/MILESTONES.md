## MILESTONES.md

```markdown
# Enhanced S5.js Grant Milestone Tracking

**Duration:** 8 months

## Milestone Overview

| Month | Target Date | Status         | Progress |
| ----- | ----------- | -------------- | -------- |
| 1     | 7/2/25      | ✅ Completed   | 100%     |
| 2     | 8/2/25      | ✅ Completed   | 100%     |
| 3     | 9/2/25      | 🚧 In Progress | 25%      |
| 4     | 10/2/25     | ⏳ Pending     | 0%       |
| 5     | 11/2/25     | ⏳ Pending     | 0%       |
| 6     | 12/2/25     | ⏳ Pending     | 0%       |
| 7     | 1/2/26      | ⏳ Pending     | 0%       |
| 8     | 2/2/26      | ⏳ Pending     | 0%       |

---

## Month 1: Project Setup & Design

**Target Date:** 7/2/25  
**Status:** ✅ Completed

### Deliverables

- [x] Fork s5.js repository
- [x] Setup development environment
- [x] Configure test framework (Vitest)
- [x] Verify existing functionality (21/21 tests passing)
- [x] Setup GitHub repository
- [x] Create FS5 test fixtures
- [x] Write code contribution guidelines
- [x] Setup project board
- [x] Complete design documentation review
- [x] One-off business overhead tasks

### Key Achievements

- Working TypeScript compilation with zero errors
- Vitest configured and operational
- All existing crypto tests passing
- Clean git history established
- CBOR serialization/deserialization implemented (Phase 1.3 & 1.4)
- DirV1 types and BlobLocation support complete
- All Rust test vectors passing (48/48 tests)
- Comprehensive documentation structure in place

### Blockers

- None

---

## Month 2: Path Helpers v0.1

**Target Date:** 8/2/25  
**Status:** ✅ Completed (Early - 2025-01-16)

### Deliverables

- [x] CBOR integration foundation ✅ 2025-01-16
- [x] DirV1 type definitions ✅ 2025-01-16
- [x] Comprehensive unit tests (66 Phase 1 tests) ✅ 2025-01-16
- [x] Basic get/put for single-level directories (Phase 2) ✅ 2025-01-16
- [x] Path-based API implementation (get, put, delete, list, getMetadata) ✅ 2025-01-16
- [x] Cursor-based pagination support (Phase 2.2) ✅ 2025-01-16
- [x] Initial API documentation ✅ 2025-01-16

### Success Criteria

- `get(path)` retrieves data correctly
- `put(path, data)` stores data with proper structure
- All tests passing
- TypeScript compilation clean

### Dependencies

- CBOR libraries installed
- Type definitions complete

---

## Month 3: Path-cascade Optimisation

**Target Date:** 9/2/25  
**Status:** 🚧 In Progress (Week 1 of 4 Complete)

### Planned Deliverables

- [x] Multi-level directory update with single `registrySet` ✅ 2025-01-16
- [x] LWW conflict resolution ✅ 2025-01-16
- [x] Cursor-based pagination ✅ 2025-01-16
- [ ] Documentation and examples
- [ ] HAMT integration (Week 1/4 Complete)
  - [x] Basic HAMT structure and operations ✅ 2025-01-20
  - [x] Bitmap operations and hash functions ✅ 2025-01-20
  - [ ] Node splitting and navigation (Week 2)
  - [ ] FS5 integration and auto-sharding (Week 3)
  - [ ] Performance benchmarks (Week 4)

### Progress Details

**Week 1 (2025-01-20):** ✅ Complete
- Created HAMT implementation with basic insert/get
- Implemented bitmap operations for 32-way branching
- Added xxhash64 and blake3 hash function support
- 32 new tests passing (183 total tests)

### Success Criteria

- Deep path updates result in exactly one `registrySet` call ✅
- Concurrent writes resolve correctly ✅
- HAMT activates at 1000+ entries (pending Week 3)
- Performance benchmarks established (pending Week 4)

### Dependencies

- Path helpers v0.1 complete ✅
- HAMT implementation ready (Week 1/4 complete)

---

## Month 4: WASM Foundation & Basic Media

**Target Date:** 10/2/25  
**Status:** ⏳ Pending

### Planned Deliverables

- [ ] WASM module setup with code splitting
- [ ] Lazy loading implementation
- [ ] Basic image metadata extraction
- [ ] Browser compatibility testing
- [ ] Performance baseline recorded

### Success Criteria

- WASM loads only when needed
- Metadata extraction works for JPEG/PNG/WebP
- Fallback to Canvas API when WASM unavailable
- Initial bundle size measured

### Dependencies

- Core FS5 implementation stable
- Build pipeline configured

---

## Month 5: Advanced Media Processing

**Target Date:** 11/2/25  
**Status:** ⏳ Pending

### Planned Deliverables

- [ ] JPEG/PNG/WebP thumbnail generation
- [ ] Progressive rendering support
- [ ] Browser test matrix complete
- [ ] Bundle ≤ 700 KB compressed

### Success Criteria

- Thumbnails average ≤ 64 KB (95th percentile)
- Generation completes in ≤ 500ms for 1MP image
- All major browsers supported
- Bundle size target achieved

### Dependencies

- WASM foundation complete
- Performance benchmarks established

---

## Month 6: Directory Utilities & Caching

**Target Date:** 12/2/25  
**Status:** ⏳ Pending

### Planned Deliverables

- [ ] Directory walker with limit/cursor pagination
- [ ] IndexedDB/in-memory cache implementation
- [ ] Filtered listings
- [ ] Batch operations
- [ ] Performance benchmarks

### Success Criteria

- 10,000 cached entries list in ≤ 2s
- Sub-100ms access for cached items
- Efficient bulk operations
- Memory usage optimised

### Dependencies

- HAMT implementation complete
- Cursor system operational

---

## Month 7: Sharding Groundwork

**Target Date:** 1/2/26  
**Status:** ⏳ Pending

### Planned Deliverables

- [ ] HAMT header fields implementation
- [ ] Split/merge helpers
- [ ] Integration tests
- [ ] Performance verification at scale

### Success Criteria

- Handle 1M+ entries efficiently
- O(log n) performance maintained
- Automatic sharding works correctly
- Cross-implementation compatibility

### Dependencies

- All core features implemented
- Test infrastructure complete

---

## Month 8: Documentation & PR Submission

**Target Date:** 2/2/26  
**Status:** ⏳ Pending

### Planned Deliverables

- [ ] Complete API documentation
- [ ] Migration guide from standard s5.js
- [ ] Demo applications
- [ ] Screencast recording
- [ ] Forum feedback incorporation
- [ ] Pull requests to upstream

### Success Criteria

- Documentation covers all new features
- Examples demonstrate key use cases
- Community feedback addressed
- PRs accepted by upstream maintainers

### Dependencies

- All implementation complete
- Testing comprehensive
- Performance verified

---

## Risk Register

| Risk                            | Impact | Mitigation                                    |
| ------------------------------- | ------ | --------------------------------------------- |
| WASM bundle size exceeds target | High   | Modular architecture, aggressive tree-shaking |
| Browser compatibility issues    | Medium | Comprehensive fallbacks, early testing        |
| Upstream API changes            | Medium | Regular sync with upstream, clear interfaces  |
| Performance regression          | High   | Continuous benchmarking, profiling            |

## Communication Plan

- Monthly progress reports in Sia Forum
- GitHub issues for technical discussions
- Pull requests for code review
- Discord for quick questions

## Success Metrics

- 90%+ test coverage
- Bundle size ≤ 700KB compressed
- <100ms directory access at all scales
- Compatible with all major browsers
- Zero breaking changes to existing API

## Notes

- All deliverables MIT licensed
- Code will be submitted as PRs to upstream s5.js repository
- Temporary fork at github.com/Fabstir/s5.js until merged
```
