# Enhanced s5.js Demos

This directory contains comprehensive demonstrations of Enhanced s5.js capabilities, showing you how to build decentralized applications with S5 storage.

## Installation

To run these demos, first install the Enhanced s5.js package:

```bash
npm install @julesl23/s5js@beta
```

## Prerequisites

- **Node.js**: Version 20 or higher
- **Modern Browser**: For browser-based demos (Chrome, Firefox, Safari, Edge)

## Available Demos

### 1. Getting Started Tutorial (`getting-started-tutorial.js`)

**What this demo shows:**
Comprehensive walkthrough from setup to production deployment, covering all major Enhanced s5.js features in a single tutorial.

**Topics covered:**
- S5 instance setup and peer connections
- Identity management with seed phrases
- Portal registration
- File system operations (put, get, list, delete, getMetadata)
- Media processing (image upload with thumbnails)
- Directory utilities (walker, batch operations, pagination)
- Encryption for private data
- Advanced CID API for content-addressed storage
- HAMT sharding for large directories

**Run it:**
```bash
cd demos
node getting-started-tutorial.js
```

**Perfect for:** Developers new to Enhanced s5.js who want to understand the complete workflow.

### 2. Media Processing Demos (`media/`)

**What these demos show:**
Advanced media processing capabilities including thumbnail generation, metadata extraction, and progressive rendering.

See [`media/README.md`](./media/README.md) for detailed documentation of:
- Performance benchmarking (WASM vs Canvas strategies)
- Pipeline setup and initialization
- Metadata extraction from JPEG, PNG, WebP, GIF, BMP
- Code-splitting and bundle optimization
- Integration testing

**Run them:**
```bash
cd demos/media
node demo-metadata.js      # Extract metadata from images
node demo-pipeline.js       # Show pipeline initialization
node benchmark-media.js     # Performance benchmarks
```

**Perfect for:** Applications that need to process, analyze, or optimize images before uploading to S5.

## Key Features Demonstrated

### Path-based API
Simple filesystem-like operations:
```javascript
import { S5 } from '@julesl23/s5js';

const s5 = await S5.create();
await s5.fs.put('home/documents/hello.txt', 'Hello, S5!');
const content = await s5.fs.get('home/documents/hello.txt');
```

### HAMT Sharding
Automatic directory sharding for millions of entries (activates at 1000+ entries):
```javascript
// Efficiently handles large directories
for await (const item of s5.fs.list('home/photos', { limit: 100 })) {
  console.log(item.name, item.size);
}
```

### Media Processing
Thumbnail generation and metadata extraction:
```javascript
import { MediaProcessor } from '@julesl23/s5js/media';

const result = await s5.fs.putImage('gallery/photo.jpg', imageBlob, {
  generateThumbnail: true,
  thumbnailMaxWidth: 200
});
```

### Advanced CID API
Content-addressed storage for power users:
```javascript
import { FS5Advanced, formatCID } from '@julesl23/s5js/advanced';

const advanced = new FS5Advanced(s5.fs);
const cid = await advanced.pathToCID('home/data.txt');
console.log(formatCID(cid, 'base32'));
```

## Bundle Size Optimization

Enhanced s5.js uses modular exports for optimal bundle sizes:

| Import Path | Size (brotli) | Use Case |
|-------------|--------------|----------|
| `@julesl23/s5js` | 61.14 KB | Full functionality |
| `@julesl23/s5js/core` | 59.58 KB | Basic storage only |
| `@julesl23/s5js/media` | 9.79 KB | Media processing (standalone) |
| `@julesl23/s5js/advanced` | 60.60 KB | Core + CID utilities |

**Recommendation:** Import from `@julesl23/s5js/core` and lazy-load media features on demand for optimal initial bundle size.

## Running Demos in Browser

Some demos have HTML versions for browser testing:

```bash
cd demos/media
npx http-server . -p 8080
# Open http://localhost:8080/demo-splitting.html
```

## What's Next?

After exploring these demos:

1. **Read the API Documentation**: [`docs/API.md`](../docs/API.md) - Complete API reference
2. **Check the Examples**: [`test/integration/`](../test/integration/) - More advanced usage patterns
3. **Review Performance**: [`docs/BENCHMARKS.md`](../docs/BENCHMARKS.md) - Performance characteristics
4. **Build Your App**: Use Enhanced s5.js in your own project!

## Troubleshooting

### Module Not Found Error

If you get "Cannot find module '@julesl23/s5js'":
1. Ensure you've installed the package: `npm install @julesl23/s5js@beta`
2. Check that you're using Node.js 20 or higher: `node --version`

### WebSocket Connection Issues

If peer connections fail:
1. Check your internet connection
2. Verify firewall isn't blocking WebSocket connections
3. Try alternative peers from the [S5 Protocol Discord](https://discord.gg/s5protocol)

### Browser Compatibility

For browser usage, ensure:
- ES modules are supported
- WebAssembly is available (for media processing)
- IndexedDB is enabled (for local caching)

## Contributing

Found an issue or have an improvement? Open an issue or PR at:
https://github.com/julesl23/s5.js

## Resources

- **npm Package**: https://www.npmjs.com/package/@julesl23/s5js
- **GitHub Repository**: https://github.com/julesl23/s5.js
- **API Documentation**: https://github.com/julesl23/s5.js/blob/main/docs/API.md
- **S5 Protocol**: https://docs.sfive.net/
- **Community Discord**: https://discord.gg/s5protocol

## License

Enhanced s5.js is dual-licensed under MIT OR Apache-2.0.
