# Milestone 5 Testing & Validation Guide

This guide explains how to validate all Milestone 5 deliverables for the Sia Foundation grant review.

---

## Quick Validation Checklist

- [ ] Run unit test suite (437 tests)
- [ ] Run integration test with real S5 network
- [ ] Open browser demo for visual validation
- [ ] Review bundle size analysis
- [ ] Review comprehensive evidence document

**Estimated Time:** 15-20 minutes

---

## 1. Unit Test Suite

### Run All Tests

```bash
cd /home/developer/s5.js
npm run test:run
```

**Expected Output:**

```
✓ test/media/thumbnail-generator.test.ts (21 tests) 30ms
✓ test/media/progressive-loader.test.ts (27 tests) 2012ms
✓ test/media/browser-compat.test.ts (31 tests) 7ms
✓ test/media/canvas-enhanced.test.ts (19 tests) 5188ms
... (30 test files)
↓ test/fs/fs5-advanced.integration.test.ts (13 tests | 13 skipped)
↓ test/fs/media-extensions.integration.test.ts (14 tests | 14 skipped)

Test Files  30 passed | 2 skipped (32)
Tests  437 passed | 27 skipped (464)
Duration  5.61s
```

**Note on Skipped Tests:**

- 27 integration tests are intentionally skipped (2 test files)
- These require real S5 portal with registry propagation delays (5+ seconds)
- Not suitable for automated test suites - designed for standalone scripts
- Full integration testing: `node test/integration/test-media-real.js` and `node test/integration/test-advanced-cid-real.js`

### Run Media-Specific Tests Only

```bash
npm run test:run -- media
```

**Expected Output:**

```
✓ test/media/thumbnail-generator.test.ts (21 tests)
✓ test/media/progressive-loader.test.ts (27 tests)
✓ test/media/browser-compat.test.ts (31 tests)
✓ test/media/browser-compat-integration.test.ts (11 tests)
✓ test/media/canvas-enhanced.test.ts (19 tests)
✓ test/media/canvas-fallback.test.ts (18 tests)
✓ test/media/media-processor.test.ts (14 tests)
✓ test/media/wasm-module.test.ts (15 tests)
✓ test/media/wasm-advanced.test.ts (13 tests)
✓ test/media/wasm-progress.test.ts (2 tests)
✓ test/media/real-images.test.ts (25 tests)
✓ test/media/types.test.ts (8 tests)
✓ test/fs/media-extensions.test.ts (29 tests)
↓ test/fs/media-extensions.integration.test.ts (14 tests | 14 skipped)

Test Files  13 passed | 1 skipped (14)
Tests  233 passed | 14 skipped (247)
```

**Note on Skipped Tests:**

- 14 integration tests are intentionally skipped (`describe.skip()`)
- These tests require real S5 portal with network delays and sequential execution
- Not suitable for automated CI/CD pipelines
- Full integration validation uses: `node test/integration/test-media-real.js`

**Validates:**

- ✅ Thumbnail generation (JPEG/PNG/WebP)
- ✅ Progressive rendering (3 strategies)
- ✅ Browser compatibility detection
- ✅ Size constraints (≤64 KB)

---

## 2. Real S5 Network Integration Test

### Prerequisites

- S5 portal access (uses https://s5.vup.cx)
- Network connection
- ~2-3 minutes runtime

### Run Integration Test

```bash
cd /home/developer/s5.js
npm run build  # Ensure dist/ is up-to-date
node test/integration/test-media-real.js
```

**Expected Output:**

```
🎨 Enhanced S5.js Media Integration Test
========================================
Testing with real S5 portal (s5.vup.cx)

GROUP 1: Setup and Initialization
----------------------------------
  ✓ Should create S5 instance and connect to portal
  ✓ Should initialize identity and filesystem

GROUP 2: Basic Image Operations
--------------------------------
  ✓ Should upload image with putImage()
    - Path: home/test-photo.jpg
    - Thumbnail size: 24.3 KB (✓ under 64 KB)

  ✓ Should retrieve thumbnail with getThumbnail()
    - Format: image/jpeg
    - Dimensions: 256×192

  ✓ Should extract metadata with getImageMetadata()
    - Original size: 1920×1440
    - Format: JPEG

  ✓ Should handle WebP images
  ✓ Should handle PNG images

GROUP 3: Gallery Operations
----------------------------
  ✓ Should create image gallery
    - 3 images uploaded
    - Total gallery size: 68.5 KB

  ✓ Should retrieve gallery items
  ✓ Should list gallery contents
  ✓ Should validate gallery structure

GROUP 4: Cleanup
----------------
  ✓ Should delete test images
  ✓ Should verify cleanup

========================================
✅ All 14 tests passed!
Duration: 142.8s
```

**Validates:**

- ✅ Real S5 network connectivity
- ✅ Thumbnail generation on real portal
- ✅ Size constraints in production environment
- ✅ Multi-image gallery creation
- ✅ Full workflow integration

### Troubleshooting

**If portal is unreachable:**

```
❌ Error: Cannot connect to s5.vup.cx
```

- Check network connection
- Verify portal is online
- Try alternative portal if needed

**If build fails:**

```bash
npm run build
# Verify dist/ directory contains compiled files
ls -la dist/src/
```

---

## 3. Browser Demo - Progressive Rendering

### Opening the Demo

**Recommended: Use the Launch Script**

```bash
cd /home/developer/s5.js
./test/browser/run-demo.sh
```

The script will:

- ✅ Start HTTP server automatically (port 8080 or 8081)
- ✅ Open the demo in your default browser
- ✅ Display helpful instructions
- ✅ Handle cross-platform compatibility

**Alternative Methods:**

```bash
# Option 1: Direct file open (may have security restrictions)
open test/browser/progressive-rendering-demo.html

# Option 2: Manual server (if script doesn't work)
npx http-server test/browser -p 8080
# Then open: http://localhost:8080/progressive-rendering-demo.html
```

### Using the Demo

1. **Select an image file** (JPEG, PNG, or WebP)
2. **Set number of progressive scans** (1-10, default: 5)
3. **Click "Load Image with Progressive Rendering"**

4. **Observe three rendering strategies:**

   - **Blur Strategy**: Image appears blurred, gradually sharpens
   - **Scan Lines**: Image reveals from top to bottom
   - **Interlaced**: Image appears with alternating lines

5. **Watch progress indicators:**
   - Progress bar shows scan completion
   - Scan counter (e.g., "3/5")
   - Loading time in milliseconds

### What to Verify

✅ **Blur Strategy**

- Starts with strong blur effect
- Gradually becomes sharp over multiple scans
- Final image is crystal clear

✅ **Scan Lines Strategy**

- Image reveals vertically (top-to-bottom)
- Each scan reveals more of the image
- Final image is complete

✅ **Interlaced Strategy**

- Image appears with varying opacity
- Each scan increases clarity
- Simulates classic interlaced rendering

✅ **Browser Compatibility**

- Test in multiple browsers:
  - Chrome/Chromium
  - Firefox
  - Safari (if on macOS)
  - Edge

### Screenshot Locations (for grant submission)

Save screenshots showing:

1. Demo page loaded (before image)
2. All three strategies mid-rendering (scan 2/5)
3. All three strategies completed (scan 5/5)
4. Different browsers running the demo

---

## 4. Bundle Size Verification

### Check Compressed Bundle Size

```bash
cd /home/developer/s5.js
npm run build

# Check main bundle
du -h dist/src/index.js

# Create brotli-compressed bundle for measurement
brotli -f -k dist/src/index.js
du -h dist/src/index.js.br
```

**Expected Output:**

```
60.09 KB    dist/src/index.js.br
```

### Verify Modular Exports

```bash
# Check individual export sizes
ls -lh dist/src/exports/

# Expected:
# core.js     ~200 KB (uncompressed)
# media.js    ~35 KB (uncompressed)
# advanced.js ~205 KB (uncompressed)
```

### Bundle Analysis Report

```
Full bundle:  60.09 KB (brotli)  ✅ 639.91 KB under 700 KB budget
Core only:    59.61 KB
Media only:   9.79 KB (lazy-loaded)
Advanced:     59.53 KB
```

**Validates:**

- ✅ Bundle ≤700 KB requirement
- ✅ 10x under budget (60.09 KB vs 700 KB)
- ✅ Modular architecture with tree-shaking

---

## 5. Review Evidence Document

### Open Evidence Document

```bash
# View in terminal
cat docs/MILESTONE5_EVIDENCE.md

# Or open in editor
code docs/MILESTONE5_EVIDENCE.md
```

### Document Contents

The comprehensive evidence document includes:

1. **Executive Summary**

   - All 4 grant requirements met
   - Achievement highlights

2. **Thumbnail Generation Evidence**

   - Implementation details
   - Format support (JPEG/PNG/WebP)
   - Size optimization features
   - Test evidence

3. **Progressive Rendering Evidence**

   - Three strategies implemented
   - Test coverage (27 tests)
   - Browser demo reference

4. **Browser Compatibility Matrix**

   - 10 capabilities tested
   - 4 browsers/environments tested
   - Graceful fallback system

5. **Bundle Size Analysis**

   - 60.09 KB vs 700 KB requirement
   - Modular architecture
   - 10x under budget

6. **Test Suite Summary**

   - 437 tests passing
   - 225+ media-specific tests
   - Integration test details

7. **Performance Metrics**

   - Thumbnail generation times
   - Average sizes (29.5 KB average)
   - Progressive loading performance

8. **Deliverables Checklist**
   - All requirements marked complete

---

## 6. Browser Compatibility Testing

### Recommended Test Matrix

Test in the following browsers to verify compatibility:

| Browser         | Version | Priority | Test Focus            | Status    |
| --------------- | ------- | -------- | --------------------- | --------- |
| Chrome/Chromium | 90+     | High     | Full feature set      | ✅ Tested |
| Firefox         | 88+     | High     | WASM + WebP           | ✅ Tested |
| Edge            | 90+     | High     | Windows compatibility | ✅ Tested |
| Node.js         | 20+     | High     | Server-side rendering | ✅ Tested |

### Quick Browser Test

1. Run `./test/browser/run-demo.sh`
2. Load a test image in the browser
3. Verify all three strategies work
4. Check console for any errors
5. Screenshot each browser for documentation

### Expected Results

All tested browsers should:

- ✅ Load the demo page without errors
- ✅ Accept image file uploads
- ✅ Render all three progressive strategies
- ✅ Display progress indicators correctly
- ✅ Show final sharp images

Some browsers may have minor differences in:

- Blur rendering quality (WebGL vs. filter)
- Progressive animation smoothness
- Initial load times

---

## 7. Milestone Submission Package

### Files to Include in Grant Submission

1. **Evidence Document**

   - `docs/MILESTONE5_EVIDENCE.md`

2. **Test Results**

   - Terminal output from `npm run test:run`
   - Output from `node test/integration/test-media-real.js`

3. **Browser Screenshots**

   - Progressive rendering demo in different browsers
   - Before/during/after progressive loading

4. **Bundle Analysis**

   - Output from bundle size verification
   - Comparison to 700 KB requirement

5. **Code References**
   - Link to source files:
     - `src/media/thumbnail/generator.ts`
     - `src/media/progressive/loader.ts`
     - `src/media/compat/browser.ts`

### Quick Submission Checklist

- [ ] All 437 unit tests passing
- [ ] Integration test successful on real S5 network
- [ ] Browser demo works in 3+ browsers
- [ ] Bundle size verified (60.09 KB < 700 KB)
- [ ] Screenshots captured
- [ ] Evidence document reviewed
- [ ] Browser compatibility matrix complete

---

## Troubleshooting Common Issues

### Tests Fail with "Cannot find module"

```bash
# Rebuild the project
npm run build

# Verify dist/ exists
ls -la dist/src/
```

### Integration Test Fails with Network Error

```bash
# Check portal availability
curl https://s5.vup.cx

# Try different portal
# Edit test file to use alternative portal if needed
```

### Browser Demo Not Loading

```bash
# Use local server instead of file://
npx http-server test/browser -p 8080

# Open http://localhost:8080/progressive-rendering-demo.html
```

### Bundle Size Different

```bash
# Clean rebuild
rm -rf dist/
npm run build

# Recheck size
brotli -f -k dist/src/index.js
du -h dist/src/index.js.br
```

---

## Contact & Support

**Project**: Enhanced S5.js
**Grant**: Sia Foundation - Month 5 Deliverables
**Phase**: Advanced Media Processing

**For issues:**

1. Check test output for specific errors
2. Review `docs/MILESTONE5_EVIDENCE.md` for context
3. Verify all dependencies installed (`npm install`)
4. Ensure build is up-to-date (`npm run build`)

---

**Last Updated:** October 23, 2025
**Status:** All Milestone 5 deliverables ready for review
