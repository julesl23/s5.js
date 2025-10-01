# Browser Tests for S5.js Media Processing

This directory contains browser-based tests that demonstrate all 20 media processing tests passing in a real browser environment.

## Running the Tests

### Option 1: Using the Helper Script (Recommended)

```bash
./run-browser-tests.sh
```

This script will:
1. Build the S5.js project
2. Start a local HTTP server on port 8080
3. Automatically open your browser to the test page

### Option 2: Manual Setup

1. Build the project:
```bash
npm run build
```

2. Start any HTTP server from the project root:
```bash
# Using Python 3
python3 -m http.server 8080

# Using Node.js http-server
npx http-server -p 8080

# Using any other HTTP server
```

3. Open your browser and navigate to:
```
http://localhost:8080/demos/media/browser-tests.html
```

## What to Expect

In a browser environment, all 20 tests should pass:

- ✅ MediaProcessor initialization
- ✅ Browser capability detection
- ✅ Strategy selection
- ✅ PNG image processing with dimensions
- ✅ JPEG image processing with dimensions
- ✅ GIF image processing with dimensions
- ✅ BMP image processing with dimensions
- ✅ WebP image processing with dimensions
- ✅ Dominant color extraction
- ✅ Transparency detection
- ✅ Aspect ratio calculation
- ✅ Processing time tracking
- ✅ Processing speed classification
- ✅ WASM to Canvas fallback
- ✅ Invalid image handling
- ✅ Timeout option support
- ✅ Orientation detection
- ✅ Concurrent extractions
- ✅ WASM module validation
- ✅ Multiple format support

## Browser Requirements

- Modern browser with Canvas API support
- WebAssembly support (optional, will fall back to Canvas)
- JavaScript ES6+ support

## Differences from Node.js Tests

| Feature | Browser | Node.js |
|---------|---------|---------|
| Image Dimensions | ✅ Full support | ❌ Limited (0x0) |
| Color Extraction | ✅ Full support | ❌ Not available |
| Canvas API | ✅ Native | ❌ Limited |
| Web Workers | ✅ Available | ❌ Not available |
| WASM | ✅ Full support | ⚠️ Falls back to Canvas |

## Test Output

The browser test interface provides:
- Visual pass/fail indicators
- Real-time progress tracking
- Detailed error messages
- Console output for debugging
- Performance metrics for each test

## Troubleshooting

If tests fail in the browser:

1. **Check browser console** (F12) for detailed error messages
2. **Ensure project is built** - run `npm run build` first
3. **Check network tab** - ensure all modules load correctly
4. **Try different browser** - Chrome/Firefox/Safari recommended
5. **Check CORS** - some browsers restrict local file access

## Expected Results

- **All 20 tests passing** in modern browsers
- **Processing times < 50ms** for small test images
- **Both WASM and Canvas** strategies working
- **Actual image dimensions** extracted (not 0x0)
- **Dominant colors** properly identified