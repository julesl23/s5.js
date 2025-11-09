# JavaScript/TypeScript (Enhanced s5.js)

Enhanced s5.js is a comprehensive TypeScript SDK for building S5 applications in browsers and Node.js environments.

## Key Features

- **Path-based API** - Familiar filesystem-like operations (`get`, `put`, `delete`, `list`)
- **Media Processing** - Client-side thumbnail generation and metadata extraction
- **HAMT Sharding** - Efficient handling of directories with millions of entries
- **Advanced CID API** - Content-addressed storage for power users
- **Bundle Optimization** - Modular imports for optimal bundle sizes (61 KB compressed)
- **TypeScript Support** - Full type definitions and IDE autocomplete
- **Dual Environment** - Works in both browser and Node.js 20+

## Package Information

- **npm**: [@s5-dev/s5js](https://www.npmjs.com/package/@s5-dev/s5js)
- **GitHub**: [julesl23/s5.js](https://github.com/julesl23/s5.js)
- **License**: MIT OR Apache-2.0
- **Version**: 0.9.0-beta.1

## Architecture

Enhanced s5.js implements the [S5 Protocol Specifications](../../specification/index.md) with developer-friendly abstractions:

- **CBOR Serialization** - Uses DAG-CBOR for deterministic cross-implementation compatibility
- **DirV1 Format** - Clean directory format with optional HAMT sharding for large directories
- **XChaCha20-Poly1305** - Modern encryption for private data
- **Cursor Pagination** - Stateless iteration through large directories

## Quick Example

```typescript
import { S5 } from '@s5-dev/s5js';

// Create instance and connect to network
const s5 = await S5.create({
  initialPeers: [
    "wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p"
  ]
});

// Generate or recover identity
await s5.recoverIdentityFromSeedPhrase(seedPhrase);

// Store and retrieve data
await s5.fs.put('home/hello.txt', 'Hello, S5!');
const content = await s5.fs.get('home/hello.txt');
```

## Documentation Structure

- **[Installation & Setup](./installation.md)** - Get started with npm installation and configuration
- **[Quick Start](./quick-start.md)** - 5-minute tutorial from setup to first upload
- **[Path-based API](./path-api.md)** - File operations with filesystem-like interface
- **[Media Processing](./media.md)** - Image thumbnails and metadata extraction
- **[Advanced CID API](./advanced-cid.md)** - Content-addressed storage utilities
- **[Performance & Scaling](./performance.md)** - HAMT sharding for large directories
- **[Directory Utilities](./utilities.md)** - Batch operations and recursive traversal
- **[Encryption](./encryption.md)** - Secure your data with XChaCha20-Poly1305
- **[API Reference](./api-reference.md)** - Complete API documentation

## Browser and Node.js Support

### Browser

- Modern browsers with ES2022 support (Chrome 94+, Firefox 93+, Safari 15+)
- WebAssembly support (for media processing)
- IndexedDB for local caching
- Native fetch and WebSocket APIs

### Node.js

- **Version**: Node.js 20 or higher required
- Uses native `globalThis.fetch` (no external HTTP client needed)
- Memory-level storage for development
- Full TypeScript support

## Bundle Sizes

Enhanced s5.js uses modular exports for optimal bundle sizes:

| Import Path | Size (brotli) | Use Case |
|-------------|--------------|----------|
| `@s5-dev/s5js` | 61.14 KB | Full functionality |
| `@s5-dev/s5js/core` | 59.58 KB | Storage only (no media) |
| `@s5-dev/s5js/media` | 9.79 KB | Media processing standalone |
| `@s5-dev/s5js/advanced` | 60.60 KB | Core + CID utilities |

> **Bundle Size Achievement**: At 61 KB compressed, Enhanced s5.js is 10× under the 700 KB grant requirement, making it suitable for production web applications.

## Next Steps

1. **[Install the package](./installation.md)** - npm installation and setup
2. **[Follow the Quick Start](./quick-start.md)** - Build your first S5 app
3. **[Explore the API](./path-api.md)** - Learn the core operations
4. **[Join the Community](https://discord.gg/s5protocol)** - Get help and share feedback

## Implementation Status

Enhanced s5.js is currently in **beta** (v0.9.0-beta.1):

- ✅ All grant milestones completed (Months 1-7)
- ✅ 437 tests passing
- ✅ Real S5 portal integration validated
- ✅ Production-ready bundle size
- 🔄 Community beta testing and feedback
- 📅 Upstream PR submission planned (Month 8)

Found a bug or have feedback? [Open an issue on GitHub](https://github.com/julesl23/s5.js/issues).
