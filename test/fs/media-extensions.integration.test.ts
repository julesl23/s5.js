import { describe, it, expect, beforeEach } from 'vitest';
import { S5 } from '../../src/index.js';
import WebSocket from 'ws';
import { URL as NodeURL } from 'url';

// Polyfill WebSocket for Node.js environment
if (!global.WebSocket) {
  global.WebSocket = WebSocket as any;
}

// These integration tests use a REAL S5 instance with actual storage
// Unlike the unit tests which mock FS5 internals, these tests verify
// that media extensions work with real IndexedDB/memory-level and registry operations
//
// ⚠️  IMPORTANT: Real S5 portal testing is better suited for standalone scripts
// due to registry propagation delays, network timing, and test isolation challenges.
//
// For comprehensive media extension testing with real S5 portals, use:
//   node test/integration/test-media-real.js
//
// This standalone script properly handles:
// - Portal registration and authentication
// - Registry propagation delays between operations (5+ seconds)
// - Sequential execution with concurrency: 1 to avoid registry conflicts
// - All 14 tests organized into 4 logical groups:
//   • GROUP 1: Setup and Initialization (2 tests)
//   • GROUP 2: Basic Image Operations (5 tests)
//   • GROUP 3: Gallery Operations with delays (4 tests) - fully sequential
//   • GROUP 4: Directory and Cleanup Operations (3 tests)
//
// The vitest tests below are SKIPPED for automated CI and kept for reference.

// Mock browser APIs for media processing (needed in Node.js test environment)
let lastCreatedBlob: Blob | null = null;

global.Image = class Image {
  public src: string = '';
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public width: number = 800;
  public height: number = 600;

  constructor() {
    setTimeout(() => {
      if (this.src === 'blob:mock-url' && lastCreatedBlob) {
        if (lastCreatedBlob.size < 10) {
          if (this.onerror) this.onerror();
          return;
        }
      }
      if (this.onload) this.onload();
    }, 0);
  }
} as any;

// Preserve native URL constructor while adding blob URL methods for media processing
global.URL = Object.assign(NodeURL, {
  createObjectURL: (blob: Blob) => {
    lastCreatedBlob = blob;
    return 'blob:mock-url';
  },
  revokeObjectURL: (url: string) => {
    lastCreatedBlob = null;
  },
}) as any;

global.document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') {
      const canvas = {
        _width: 0,
        _height: 0,
        get width() { return this._width; },
        set width(val) { this._width = val; },
        get height() { return this._height; },
        set height(val) { this._height = val; },
        getContext: () => ({
          imageSmoothingEnabled: true,
          imageSmoothingQuality: 'high',
          fillStyle: '',
          drawImage: () => {},
          fillRect: () => {},
          getImageData: (x: number, y: number, w: number, h: number) => ({
            width: w,
            height: h,
            data: new Uint8ClampedArray(w * h * 4),
          }),
        }),
        toBlob: (callback: (blob: Blob | null) => void, type: string, quality?: number) => {
          const baseSize = Math.max(canvas._width * canvas._height, 100);
          const qualityFactor = quality !== undefined ? quality : 0.92;
          const size = Math.floor(baseSize * qualityFactor * 0.5) + 50;
          const mockBlob = new Blob([new Uint8Array(size)], { type });
          setTimeout(() => callback(mockBlob), 0);
        },
      };
      return canvas;
    }
    return {};
  },
} as any;

describe.skip('FS5 Media Extensions - Integration', () => {
  let s5: S5;

  // Helper to create test image blob
  const createTestImageBlob = (): Blob => {
    // Create a simple valid JPEG with actual image data
    const jpegData = new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0, // JPEG SOI and APP0
      0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00,
      0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xFF, 0xD9 // EOI
    ]);
    return new Blob([jpegData], { type: 'image/jpeg' });
  };

  beforeEach(async () => {
    // Create a real S5 instance with actual storage
    s5 = await S5.create({
      initialPeers: ["wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p"]
    });

    // Create an identity for file operations
    const seedPhrase = s5.generateSeedPhrase();
    await s5.recoverIdentityFromSeedPhrase(seedPhrase);

    // Register on portal to enable uploads (required for real S5 portal testing)
    await s5.registerOnNewPortal("https://s5.vup.cx");

    // Ensure identity is initialized for file operations
    await s5.fs.ensureIdentityInitialized();

    // Wait for registry propagation to avoid "Revision number too low" errors
    await new Promise(resolve => setTimeout(resolve, 3000));
  }, 40000); // 40 second timeout for S5 initialization + registry propagation

  describe('Real putImage Operations', () => {
    it('should upload image to real storage and retrieve it', async () => {
      const blob = createTestImageBlob();

      // Upload with real storage
      const result = await s5.fs.putImage('home/photos/test.jpg', blob);

      expect(result.path).toBe('home/photos/test.jpg');
      expect(result.metadata).toBeDefined();

      // Verify it's actually stored by retrieving it
      const retrieved = await s5.fs.get('home/photos/test.jpg');
      expect(retrieved).toBeDefined();
      expect(retrieved).toBeInstanceOf(Uint8Array);
    });

    it('should generate and store thumbnail in real storage', async () => {
      const blob = createTestImageBlob();

      const result = await s5.fs.putImage('home/photos/with-thumb.jpg', blob);

      expect(result.thumbnailPath).toBe('home/photos/.thumbnails/with-thumb.jpg');

      // Verify thumbnail is actually stored
      const thumbnail = await s5.fs.get('home/photos/.thumbnails/with-thumb.jpg');
      expect(thumbnail).toBeDefined();
    });

    it('should extract real metadata from image', async () => {
      const blob = createTestImageBlob();

      const result = await s5.fs.putImage('home/photos/metadata-test.jpg', blob);

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.format).toBe('jpeg');
      expect(result.metadata?.width).toBeGreaterThan(0);
      expect(result.metadata?.height).toBeGreaterThan(0);
    });
  });

  describe('Real getThumbnail Operations', () => {
    it('should retrieve pre-generated thumbnail from storage', async () => {
      const blob = createTestImageBlob();

      // Upload with thumbnail
      await s5.fs.putImage('home/photos/thumb-test.jpg', blob);

      // Get the thumbnail
      const thumbnail = await s5.fs.getThumbnail('home/photos/thumb-test.jpg');

      expect(thumbnail).toBeInstanceOf(Blob);
      expect(thumbnail.type).toContain('image');
    });

    it('should generate thumbnail on-demand when missing', async () => {
      const blob = createTestImageBlob();

      // Upload without thumbnail
      await s5.fs.putImage('home/photos/no-thumb.jpg', blob, {
        generateThumbnail: false
      });

      // Request thumbnail (should generate on-demand)
      const thumbnail = await s5.fs.getThumbnail('home/photos/no-thumb.jpg');

      expect(thumbnail).toBeInstanceOf(Blob);
    }, 20000); // 20 second timeout for on-demand generation

    it('should cache generated thumbnail in storage', async () => {
      const blob = createTestImageBlob();

      // Upload without thumbnail
      await s5.fs.putImage('home/photos/cache-test.jpg', blob, {
        generateThumbnail: false
      });

      // Generate thumbnail (should cache it)
      await s5.fs.getThumbnail('home/photos/cache-test.jpg', { cache: true });

      // Verify it's now cached in storage
      const cached = await s5.fs.get('home/photos/.thumbnails/cache-test.jpg');
      expect(cached).toBeDefined();
    });
  });

  describe('Real getImageMetadata Operations', () => {
    it('should extract metadata from stored image', async () => {
      const blob = createTestImageBlob();

      await s5.fs.putImage('home/photos/metadata.jpg', blob);

      const metadata = await s5.fs.getImageMetadata('home/photos/metadata.jpg');

      expect(metadata.format).toBe('jpeg');
      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
    }, 15000); // 15 second timeout for metadata extraction
  });

  describe('Real createImageGallery Operations', () => {
    it('should upload multiple images to real storage', async () => {
      const images = [
        { name: 'photo1.jpg', blob: createTestImageBlob() },
        { name: 'photo2.jpg', blob: createTestImageBlob() }
      ];

      const results = await s5.fs.createImageGallery('home/gallery', images);

      expect(results).toHaveLength(2);

      // Verify images are actually stored
      const img1 = await s5.fs.get('home/gallery/photo1.jpg');
      const img2 = await s5.fs.get('home/gallery/photo2.jpg');

      expect(img1).toBeDefined();
      expect(img2).toBeDefined();
    }, 30000); // 30 second timeout for gallery creation

    it('should create manifest.json in real storage', async () => {
      const images = [
        { name: 'photo1.jpg', blob: createTestImageBlob() },
        { name: 'photo2.jpg', blob: createTestImageBlob() }
      ];

      await s5.fs.createImageGallery('home/gallery2', images);

      // Retrieve and parse manifest
      const manifestData = await s5.fs.get('home/gallery2/manifest.json');
      expect(manifestData).toBeDefined();

      const manifest = typeof manifestData === 'object' && manifestData !== null
        ? manifestData
        : JSON.parse(typeof manifestData === 'string'
            ? manifestData
            : new TextDecoder().decode(manifestData as Uint8Array));

      expect(manifest.count).toBe(2);
      expect(manifest.images).toHaveLength(2);
      expect(manifest.images[0].path).toBe('home/gallery2/photo1.jpg');
    }, 30000); // 30 second timeout for gallery creation

    it('should handle concurrent uploads with real storage', async () => {
      const images = Array.from({ length: 5 }, (_, i) => ({
        name: `photo${i}.jpg`,
        blob: createTestImageBlob()
      }));

      const results = await s5.fs.createImageGallery('home/concurrent', images, {
        concurrency: 2
      });

      expect(results).toHaveLength(5);

      // Verify all images are stored
      for (let i = 0; i < 5; i++) {
        const img = await s5.fs.get(`home/concurrent/photo${i}.jpg`);
        expect(img).toBeDefined();
      }
    }, 40000); // 40 second timeout for concurrent uploads
  });

  describe('Real Directory Operations Integration', () => {
    it('should work with FS5 list() for real directory structure', async () => {
      const blob = createTestImageBlob();

      await s5.fs.putImage('home/photos/list-test.jpg', blob);

      // List directory contents
      const entries = [];
      for await (const entry of s5.fs.list('home/photos')) {
        entries.push(entry);
      }

      expect(entries.some(e => e.name === 'list-test.jpg')).toBe(true);
    });

    it('should support delete() operations on real storage', async () => {
      const blob = createTestImageBlob();

      await s5.fs.putImage('home/photos/delete-test.jpg', blob);

      // Verify it exists
      let data = await s5.fs.get('home/photos/delete-test.jpg');
      expect(data).toBeDefined();

      // Delete it
      const deleted = await s5.fs.delete('home/photos/delete-test.jpg');
      expect(deleted).toBe(true);

      // Verify it's gone
      data = await s5.fs.get('home/photos/delete-test.jpg');
      expect(data).toBeUndefined();
    }, 20000); // 20 second timeout for delete operations

    it('should maintain thumbnails directory structure in real storage', async () => {
      const blob = createTestImageBlob();

      await s5.fs.putImage('home/photos/structure-test.jpg', blob);

      // List thumbnails directory
      const entries = [];
      for await (const entry of s5.fs.list('home/photos/.thumbnails')) {
        entries.push(entry);
      }

      expect(entries.some(e => e.name === 'structure-test.jpg')).toBe(true);
    });
  });

  describe('Real Storage Persistence', () => {
    it('should persist data across operations', async () => {
      const blob = createTestImageBlob();

      // Upload image
      await s5.fs.putImage('home/photos/persist-test.jpg', blob);

      // Retrieve multiple times to verify persistence
      const data1 = await s5.fs.get('home/photos/persist-test.jpg');
      const data2 = await s5.fs.get('home/photos/persist-test.jpg');

      expect(data1).toBeDefined();
      expect(data2).toBeDefined();
      expect(data1).toEqual(data2);
    }, 20000); // 20 second timeout for persistence test
  });
});
