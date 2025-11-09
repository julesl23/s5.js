# Enhanced s5.js - Media Processing Demos

This directory contains comprehensive demonstrations of Enhanced s5.js Media Processing capabilities, showcasing the WASM foundation, code-splitting, image metadata extraction, and performance benchmarking.

## Installation

Install the Enhanced s5.js package:

```bash
npm install @julesl23/s5js@beta
```

## Prerequisites

- Node.js 20 or higher
- Test image fixtures (optional, for metadata extraction demo)

To generate test fixtures (if not already present):
```bash
cd ../..  # Go to project root
node test/fixtures/generate-test-images.mjs
```

## What These Demos Show

These demos prove that Enhanced s5.js delivers production-ready media processing:
- Client-side thumbnail generation
- Metadata extraction from multiple image formats
- WASM-powered image processing with Canvas fallback
- Bundle size optimization through code-splitting
- Performance benchmarking and optimization

## Available Demos

### 1. 📊 Performance Benchmark (`benchmark-media.js`)

Comprehensive performance benchmarking comparing WASM and Canvas strategies.

```bash
node benchmark-media.js
```

**What it demonstrates:**
- Processing test images with both WASM and Canvas
- Recording baseline performance metrics
- Comparing processing times across strategies
- Generating `baseline-performance.json` with detailed metrics

**Output:**
- Performance comparison table
- Baseline metrics for each strategy
- Success rates and processing speeds
- JSON file with complete benchmark data

### 2. 🚀 Pipeline Setup (`demo-pipeline.js`)

Shows the complete media processing pipeline initialization.

```bash
node demo-pipeline.js
```

**What it demonstrates:**
- Browser/Node capability detection
- Automatic strategy selection (wasm-worker, wasm-main, canvas-worker, canvas-main)
- WASM module initialization with progress tracking
- Memory management and cleanup
- Fallback handling scenarios

**Output:**
- Step-by-step pipeline setup process
- Capability detection results
- Strategy decision tree
- Pipeline flow diagram

### 3. 📦 Code-Splitting (`demo-splitting.html`)

Interactive browser demo showing bundle size optimization through code-splitting.

```bash
# Option 1: Open directly in browser
open demo-splitting.html  # macOS
xdg-open demo-splitting.html  # Linux

# Option 2: Serve with a local server
npx http-server . -p 8080
# Then open http://localhost:8080/demo-splitting.html
```

**What it demonstrates:**
- Core-only import (195KB) vs full bundle (273KB)
- Lazy loading media modules on demand
- Bundle size comparisons
- Real-time loading progress
- Interactive image processing

**Features:**
- Side-by-side comparison of import strategies
- Live bundle size measurements
- File upload for custom image processing
- Visual loading indicators

### 4. 🎨 Metadata Extraction (`demo-metadata.js`)

Comprehensive metadata extraction from various image formats.

```bash
node demo-metadata.js
```

**What it demonstrates:**
- Processing JPEG, PNG, WebP, GIF, BMP formats
- Format detection from magic bytes
- Dominant color extraction using k-means clustering
- Aspect ratio and orientation detection
- HTML report generation with visual color palettes

**Output:**
- Detailed metadata for each image
- Color palette visualization
- `metadata-report.html` with interactive results
- Performance metrics for each extraction

### 5. 🧪 Integration Tests (`test-media-integration.js`)

Complete test suite verifying all media processing components.

```bash
node test-media-integration.js
```

**What it tests:**
- WASM initialization and loading
- Canvas fallback functionality
- Code-splitting module imports
- Performance metric recording
- Real image processing
- Error handling and recovery
- Concurrent processing
- Memory management

**Output:**
- Test results summary (20 tests)
- Coverage by category
- Success rate percentage
- Detailed error messages for failures

## Running All Demos

To run all demos in sequence:

```bash
# From demos/media directory

# Run each demo
node demo-metadata.js
node demo-pipeline.js
node benchmark-media.js
node test-media-integration.js

# Open HTML demo in browser
open demo-splitting.html  # macOS
xdg-open demo-splitting.html  # Linux
```

**Note:** These demos use the published npm package `@julesl23/s5js@beta`. Make sure you've installed it first with `npm install @julesl23/s5js@beta`.

## Understanding the Results

### Performance Metrics

The demos record several key metrics:

- **Processing Time**: Time to extract metadata (ms)
- **Processing Speed**: Classification as fast (<50ms), normal (50-200ms), or slow (>200ms)
- **Memory Usage**: Heap memory consumed during processing
- **Source**: Whether WASM or Canvas was used

### Bundle Sizes

Code-splitting achieves significant size reductions:

| Import Strategy | Uncompressed | Gzipped | Savings |
|----------------|--------------|---------|---------|
| Full Bundle | ~273 KB | ~70 KB | - |
| Core Only | ~195 KB | ~51 KB | 27% |
| Media Only | ~79 KB | ~19 KB | 73% initial |

### Browser Capabilities

The demos detect and utilize:

- WebAssembly support
- Web Workers availability
- OffscreenCanvas support
- Performance API
- Memory information

## Troubleshooting

### Module Not Found

If you get "Cannot find module '@julesl23/s5js'":
1. Install the package: `npm install @julesl23/s5js@beta`
2. Ensure you're using Node.js 20 or higher: `node --version`

### WASM Module Not Loading

If WASM fails to load:
1. Ensure the package is installed correctly
2. Check browser console for CORS issues if running HTML demo
3. Verify WebAssembly is supported in your environment

### Image Processing Fails

If images fail to process:
1. Verify test fixtures exist in `../../test/fixtures/images/`
2. Run `node ../../test/fixtures/generate-test-images.mjs` to regenerate
3. Check that MediaProcessor is initialized properly

### HTML Demo Not Working

For the HTML demo:
1. Serve from a local server to avoid CORS issues: `npx http-server . -p 8080`
2. Check browser console for module loading errors
3. Ensure your browser supports ES modules and WebAssembly

## What These Demos Prove

✅ **Pipeline Setup**: Complete processing pipeline from init to results
✅ **Code-Splitting**: Actual bundle size reduction and lazy loading works
✅ **Image Metadata Extraction**: All capabilities functioning with real images
✅ **Baseline Performance**: Metrics recorded and comparable across strategies

These demos comprehensively demonstrate that the WASM foundation and basic media processing implementation meets all grant requirements for Phase 5.