# Browser Test Demos

This directory contains browser-based demonstrations for Enhanced S5.js features.

## Quick Start

**Launch the progressive rendering demo with one command:**

```bash
./test/browser/run-demo.sh
```

This will automatically:
- Start an HTTP server (port 8080 or 8081)
- Open the demo in your default browser
- Display instructions and tips

---

## Progressive Rendering Demo

**File:** `progressive-rendering-demo.html`

### Purpose

Visual demonstration of the three progressive rendering strategies implemented for Milestone 5:

1. **Blur Strategy** - Image starts blurred and gradually sharpens
2. **Scan Lines Strategy** - Image reveals from top to bottom
3. **Interlaced Strategy** - Image appears with alternating lines

### How to Use

#### Recommended: Use the Launch Script

```bash
# From the s5.js root directory
./test/browser/run-demo.sh
```

**What it does:**
- Checks Python availability
- Starts HTTP server on port 8080 (or 8081 if in use)
- Auto-opens demo in your default browser
- Provides clear instructions
- Cross-platform (Linux/macOS/Windows)

#### Alternative: Manual Methods

**Option 1: Direct File Open (may have restrictions)**

```bash
# macOS
open test/browser/progressive-rendering-demo.html

# Linux
xdg-open test/browser/progressive-rendering-demo.html

# Windows
start test/browser/progressive-rendering-demo.html
```

**Option 2: Manual Server**

```bash
# From the s5.js root directory
npx http-server test/browser -p 8080

# Then open in browser:
# http://localhost:8080/progressive-rendering-demo.html
```

### Features

- **Real-time visualization** of all three rendering strategies side-by-side
- **Configurable scan count** (1-10 progressive passes)
- **Progress indicators** showing scan progress and timing
- **Multiple format support** (JPEG, PNG, WebP)
- **Cross-browser compatible** (Chrome, Firefox, Safari, Edge)

### Grant Deliverable

This demo is part of **Milestone 5** evidence for the Sia Foundation grant:

- ✅ Progressive Rendering (Requirement)
- ✅ Browser Compatibility Testing (Requirement)
- ✅ Visual Validation of Media Processing

### Screenshots

For grant submission, capture screenshots showing:

1. Demo page initial state
2. Mid-render (scan 2/5) - all three strategies
3. Complete render (scan 5/5) - all three strategies
4. Different browsers running the same demo

### Technical Details

**Rendering Strategies:**

- **Blur**: Uses CSS `filter: blur()` with progressive reduction
- **Scan Lines**: Uses CSS `clip-path: inset()` for progressive reveal
- **Interlaced**: Uses CSS `opacity` to simulate interlaced rendering

**Browser Support (Tested):**

| Browser | Version | Status |
|---------|---------|--------|
| Chrome  | 90+     | ✅ Tested - Full support |
| Firefox | 88+     | ✅ Tested - Full support |
| Edge    | 90+     | ✅ Tested - Full support |

**Testing Platform:** Windows 11 (WSL2)
**Date Tested:** October 23, 2025

### Related Documentation

- **Implementation**: `src/media/progressive/loader.ts`
- **Tests**: `test/media/progressive-loader.test.ts` (27 tests)
- **Evidence**: `docs/MILESTONE5_EVIDENCE.md`
- **Testing Guide**: `docs/MILESTONE5_TESTING_GUIDE.md`

---

**Enhanced S5.js** - Milestone 5: Advanced Media Processing
**Sia Foundation Grant** - October 2025
