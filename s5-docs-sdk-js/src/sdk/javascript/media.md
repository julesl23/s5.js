# Media Processing

Enhanced s5.js includes comprehensive media processing capabilities for images, including metadata extraction, thumbnail generation, and progressive rendering.

## Overview

The media processing module provides:

- **Metadata Extraction** - Dimensions, format, dominant colors, aspect ratio
- **Thumbnail Generation** - Client-side thumbnail creation with smart cropping
- **Progressive Rendering** - Support for JPEG/PNG/WebP progressive loading
- **WASM-Powered** - Fast image processing with Canvas fallback
- **Browser Detection** - Automatic capability detection and strategy selection

> **Bundle Size**: The media module is only 9.79 KB (brotli) and can be lazy-loaded for optimal initial load times.

## Installation

```typescript
// Option 1: Import from main bundle
import { MediaProcessor } from '@s5-dev/s5js';

// Option 2: Import from media module (recommended for code-splitting)
import { MediaProcessor } from '@s5-dev/s5js/media';

// Option 3: Lazy load (optimal for initial bundle size)
const { MediaProcessor } = await import('@s5-dev/s5js/media');
```

## MediaProcessor

The `MediaProcessor` class provides unified image processing with automatic fallback between WASM and Canvas implementations.

### Initialization

```typescript
import { MediaProcessor } from '@s5-dev/s5js/media';

// Basic initialization (auto-detects best strategy)
await MediaProcessor.initialize();

// With progress tracking
await MediaProcessor.initialize({
  onProgress: (percent) => {
    console.log(`Loading: ${percent}%`);
  }
});

// Force specific strategy (for testing)
await MediaProcessor.initialize({
  preferredStrategy: 'canvas-main'  // 'wasm-worker' | 'wasm-main' | 'canvas-worker' | 'canvas-main'
});
```

### Extract Image Metadata

```typescript
// From Blob
const imageBlob = await fetch('/image.jpg').then(r => r.blob());
const metadata = await MediaProcessor.extractMetadata(imageBlob);

console.log(metadata);
// {
//   width: 1920,
//   height: 1080,
//   format: 'jpeg',
//   size: 245678,
//   hasAlpha: false,
//   dominantColors: [
//     { hex: '#3a5f8b', rgb: [58, 95, 139], percentage: 45.2 },
//     { hex: '#f0e6d2', rgb: [240, 230, 210], percentage: 32.1 },
//   ],
//   aspectRatio: 'landscape',
//   commonAspectRatio: '16:9',
//   aspectRatioValue: 1.77,
//   processingTime: 42,
//   source: 'wasm'  // or 'canvas'
// }
```

### Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `width` | number | Image width in pixels |
| `height` | number | Image height in pixels |
| `format` | string | Image format (`jpeg`, `png`, `webp`, `gif`, `bmp`) |
| `size` | number | File size in bytes |
| `hasAlpha` | boolean | True if image has transparency |
| `dominantColors` | Array | 3-5 dominant colors with hex, RGB, and percentage |
| `aspectRatio` | string | `landscape`, `portrait`, or `square` |
| `commonAspectRatio` | string | Common ratio like `16:9`, `4:3`, `1:1` |
| `aspectRatioValue` | number | Numeric aspect ratio (width/height) |
| `isMonochrome` | boolean | True if image is grayscale |
| `processingTime` | number | Processing time in milliseconds |
| `processingSpeed` | string | `fast`, `normal`, or `slow` |
| `source` | string | Processing engine used (`wasm` or `canvas`) |

## Image Upload with Thumbnails

The path-based API includes integrated thumbnail generation:

```typescript
// Upload image with automatic thumbnail
const result = await s5.fs.putImage('home/photos/vacation.jpg', imageBlob, {
  generateThumbnail: true,
  thumbnailMaxWidth: 200,
  thumbnailMaxHeight: 200
});

console.log(result);
// {
//   path: 'home/photos/vacation.jpg',
//   thumbnailPath: 'home/photos/vacation.thumbnail.jpg',
//   metadata: { width: 4032, height: 3024, ... }
// }

// Retrieve the thumbnail
const thumbnailBlob = await s5.fs.getThumbnail('home/photos/vacation.jpg');

// Get image metadata without downloading
const metadata = await s5.fs.getImageMetadata('home/photos/vacation.jpg');
```

### Thumbnail Options

```typescript
interface ImageUploadOptions {
  generateThumbnail?: boolean;        // Generate thumbnail (default: false)
  thumbnailMaxWidth?: number;         // Max thumbnail width (default: 200)
  thumbnailMaxHeight?: number;        // Max thumbnail height (default: 200)
  thumbnailQuality?: number;          // JPEG quality 0-1 (default: 0.8)
  preserveAspectRatio?: boolean;      // Preserve aspect ratio (default: true)
}
```

## Progressive Rendering

Enhanced s5.js supports progressive image rendering for better user experience:

```typescript
// Render progressive JPEG/PNG
async function renderProgressively(imagePath: string, imgElement: HTMLImageElement) {
  // 1. Load and display thumbnail immediately
  const thumbnail = await s5.fs.getThumbnail(imagePath);
  imgElement.src = URL.createObjectURL(thumbnail);

  // 2. Load full image in background
  const fullImage = await s5.fs.get(imagePath);
  imgElement.src = URL.createObjectURL(new Blob([fullImage]));
}
```

## Browser Compatibility Detection

The `BrowserCompat` class detects browser capabilities and recommends optimal processing strategies:

```typescript
import { BrowserCompat } from '@s5-dev/s5js/media';

// Check browser capabilities
const capabilities = await BrowserCompat.checkCapabilities();

console.log(capabilities);
// {
//   webAssembly: true,
//   webAssemblyStreaming: true,
//   webWorkers: true,
//   offscreenCanvas: true,
//   createImageBitmap: true,
//   webP: true,
//   avif: false,
//   performanceAPI: true,
//   memoryInfo: true,
//   memoryLimit: 2048  // MB
// }

// Get recommended strategy
const strategy = BrowserCompat.selectProcessingStrategy(capabilities);
console.log(strategy); // 'wasm-worker' (best) | 'wasm-main' | 'canvas-worker' | 'canvas-main'

// Get optimization recommendations
const recommendations = BrowserCompat.getOptimizationRecommendations(capabilities);
// ["Consider enabling SharedArrayBuffer for better WASM performance"]
// ["WebP support available - use for better compression"]
```

## Processing Strategies

The MediaProcessor automatically selects the best strategy:

| Strategy | Description | Performance | Use Case |
|----------|-------------|-------------|----------|
| `wasm-worker` | WASM in Web Worker | Excellent | Production (modern browsers) |
| `wasm-main` | WASM in main thread | Good | No Web Worker support |
| `canvas-worker` | Canvas in Web Worker | Moderate | No WASM support |
| `canvas-main` | Canvas in main thread | Baseline | Fallback for older browsers |

```typescript
// Check current strategy
const strategy = MediaProcessor.getProcessingStrategy();
console.log(`Using ${strategy} for image processing`);
```

## Image Gallery Example

Create an image gallery with metadata and thumbnails:

```typescript
async function createImageGallery(galleryPath: string) {
  const images = [];

  // Get all images
  for await (const item of s5.fs.list(galleryPath)) {
    if (item.type === 'file' && item.mediaType?.startsWith('image/')) {
      images.push(item);
    }
  }

  // Process each image
  for (const image of images) {
    const imagePath = `${galleryPath}/${image.name}`;

    // Get metadata
    const metadata = await s5.fs.getImageMetadata(imagePath);

    // Generate thumbnail if not exists
    try {
      await s5.fs.getThumbnail(imagePath);
    } catch {
      // Thumbnail doesn't exist, create it
      const imageBlob = await s5.fs.get(imagePath);
      await s5.fs.putImage(imagePath, imageBlob, {
        generateThumbnail: true
      });
    }

    console.log(`${image.name}: ${metadata.width}x${metadata.height}`);
  }

  return images;
}
```

## Batch Processing with Progress

Process multiple images with progress tracking:

```typescript
import { DirectoryWalker, MediaProcessor } from '@s5-dev/s5js';

async function processImageDirectory(dirPath: string) {
  await MediaProcessor.initialize();

  const walker = new DirectoryWalker(s5.fs);
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

  let processed = 0;
  const formats = new Map();

  for await (const entry of walker.walk(dirPath, { recursive: true })) {
    if (entry.type !== 'file') continue;

    const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
    if (!imageExtensions.includes(ext)) continue;

    // Extract metadata
    const blob = await s5.fs.get(entry.path);
    const metadata = await MediaProcessor.extractMetadata(
      new Blob([blob], { type: entry.mediaType })
    );

    // Track format usage
    formats.set(metadata.format, (formats.get(metadata.format) || 0) + 1);

    processed++;
    console.log(`Processed ${processed}: ${entry.name} (${metadata.width}x${metadata.height})`);
  }

  console.log('\nFormat Distribution:');
  formats.forEach((count, format) => {
    console.log(`  ${format.toUpperCase()}: ${count} images`);
  });
}
```

## Dominant Color Extraction

Extract dominant colors for UI themes or image categorization:

```typescript
async function extractThemeColors(imagePath: string) {
  const blob = await s5.fs.get(imagePath);
  const metadata = await MediaProcessor.extractMetadata(new Blob([blob]));

  if (metadata.dominantColors && metadata.dominantColors.length > 0) {
    const primary = metadata.dominantColors[0];
    const secondary = metadata.dominantColors[1];

    console.log('Theme colors:');
    console.log(`  Primary: ${primary.hex} (${primary.percentage.toFixed(1)}%)`);
    console.log(`  Secondary: ${secondary.hex} (${secondary.percentage.toFixed(1)}%)`);

    // Use in CSS
    document.documentElement.style.setProperty('--primary-color', primary.hex);
    document.documentElement.style.setProperty('--secondary-color', secondary.hex);
  }
}
```

## Performance Considerations

### Processing Speed

- **WASM**: 10-50ms for typical images (1920x1080)
- **Canvas**: 20-100ms for typical images
- **Large images** (4K+): May take 100-500ms

### Memory Usage

- **Image data**: Width × Height × 4 bytes (RGBA)
- **Example**: 1920×1080 = ~8 MB in memory
- **4K image**: 3840×2160 = ~33 MB in memory

### Optimization Tips

1. **Lazy Load Media Module**: Use dynamic import to reduce initial bundle
2. **Process in Batches**: Avoid processing hundreds of images simultaneously
3. **Use Web Workers**: Let browser select `wasm-worker` or `canvas-worker` strategy
4. **Cache Metadata**: Store metadata to avoid reprocessing
5. **Generate Thumbnails**: Use thumbnails for previews to reduce bandwidth

## Error Handling

```typescript
try {
  const metadata = await MediaProcessor.extractMetadata(blob);
} catch (error) {
  if (error.message.includes('Unsupported format')) {
    console.error('Image format not supported');
  } else if (error.message.includes('Failed to decode')) {
    console.error('Corrupted image file');
  } else {
    console.error('Processing error:', error);
  }
}
```

## Browser Support

### WebAssembly

- **Required for WASM strategies**: Chrome 57+, Firefox 52+, Safari 11+, Edge 16+
- **Automatically falls back** to Canvas if unavailable

### OffscreenCanvas

- **Enables worker strategies**: Chrome 69+, Firefox 105+, Edge 79+
- **Degradation**: Falls back to main thread processing

### Image Formats

| Format | Chrome | Firefox | Safari | Edge |
|--------|--------|---------|--------|------|
| JPEG | ✅ | ✅ | ✅ | ✅ |
| PNG | ✅ | ✅ | ✅ | ✅ |
| WebP | ✅ | ✅ | ✅ (14+) | ✅ |
| GIF | ✅ | ✅ | ✅ | ✅ |
| BMP | ✅ | ✅ | ✅ | ✅ |

## TypeScript Types

```typescript
interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  hasAlpha: boolean;
  dominantColors?: Array<{
    hex: string;
    rgb: [number, number, number];
    percentage: number;
  }>;
  aspectRatio?: 'landscape' | 'portrait' | 'square';
  commonAspectRatio?: string;
  aspectRatioValue?: number;
  isMonochrome?: boolean;
  processingTime?: number;
  processingSpeed?: 'fast' | 'normal' | 'slow';
  source: 'wasm' | 'canvas';
}

interface ImageUploadOptions {
  generateThumbnail?: boolean;
  thumbnailMaxWidth?: number;
  thumbnailMaxHeight?: number;
  thumbnailQuality?: number;
  preserveAspectRatio?: boolean;
}
```

## Next Steps

- **[Advanced CID API](./advanced-cid.md)** - Content-addressed storage for media
- **[Performance & Scaling](./performance.md)** - Optimize large image galleries
- **[Directory Utilities](./utilities.md)** - Batch process image directories
- **[GitHub Demos](https://github.com/s5-dev/s5.js/tree/main/demos/media)** - Working examples
