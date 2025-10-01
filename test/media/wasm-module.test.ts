import { describe, it, expect, vi } from 'vitest';
import { WASMModule } from '../../src/media/wasm/module.js';

describe('WASMModule', () => {
  describe('initialization', () => {
    it('should be a class with required methods', () => {
      expect(WASMModule).toBeDefined();
      expect(typeof WASMModule.initialize).toBe('function');
    });

    it('should initialize WebAssembly module', async () => {
      const module = await WASMModule.initialize();
      expect(module).toBeDefined();
      expect(module.extractMetadata).toBeDefined();
      expect(module.cleanup).toBeDefined();
    });

    it('should track loading progress', async () => {
      const progressValues: number[] = [];

      await WASMModule.initialize({
        onProgress: (percent) => progressValues.push(percent)
      });

      expect(progressValues.length).toBeGreaterThan(0);
      expect(progressValues[0]).toBe(0);
      expect(progressValues[progressValues.length - 1]).toBe(100);

      // Verify progress increases monotonically
      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
      }
    });

    it('should handle custom WASM URL', async () => {
      const customUrl = './custom-media.wasm';
      const module = await WASMModule.initialize({ wasmUrl: customUrl });

      expect(module).toBeDefined();
    });
  });

  describe('memory management', () => {
    it('should allocate and free memory correctly', async () => {
      const module = await WASMModule.initialize();

      // Test allocating memory for image data
      const testData = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG header
      const metadata = module.extractMetadata(testData);

      // Should not throw
      module.cleanup();
    });

    it('should track allocated buffers', async () => {
      const module = await WASMModule.initialize();

      // Extract metadata multiple times
      const data1 = new Uint8Array(100);
      const data2 = new Uint8Array(200);

      module.extractMetadata(data1);
      module.extractMetadata(data2);

      // Cleanup should free all allocated buffers
      module.cleanup();

      // Should be safe to call cleanup multiple times
      module.cleanup();
    });

    it('should handle memory limits gracefully', async () => {
      const module = await WASMModule.initialize();

      // Try to allocate a very large buffer (should handle gracefully)
      const largeData = new Uint8Array(100 * 1024 * 1024); // 100MB

      // Should either succeed or return undefined, not crash
      const metadata = module.extractMetadata(largeData);

      if (metadata) {
        expect(metadata).toHaveProperty('width');
        expect(metadata).toHaveProperty('height');
      }

      module.cleanup();
    });
  });

  describe('metadata extraction', () => {
    let module: Awaited<ReturnType<typeof WASMModule.initialize>>;

    beforeAll(async () => {
      module = await WASMModule.initialize();
    });

    afterAll(() => {
      module.cleanup();
    });

    it('should detect PNG format', async () => {
      // PNG magic bytes
      const pngHeader = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
      ]);

      const metadata = module.extractMetadata(pngHeader);

      expect(metadata).toBeDefined();
      if (metadata) {
        expect(metadata.format).toBe('png');
      }
    });

    it('should detect JPEG format', async () => {
      // JPEG magic bytes
      const jpegHeader = new Uint8Array([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46
      ]);

      const metadata = module.extractMetadata(jpegHeader);

      expect(metadata).toBeDefined();
      if (metadata) {
        expect(metadata.format).toBe('jpeg');
      }
    });

    it('should detect WebP format', async () => {
      // WebP magic bytes (RIFF....WEBP)
      const webpHeader = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00, // file size (placeholder)
        0x57, 0x45, 0x42, 0x50  // WEBP
      ]);

      const metadata = module.extractMetadata(webpHeader);

      expect(metadata).toBeDefined();
      if (metadata) {
        expect(metadata.format).toBe('webp');
      }
    });

    it('should return undefined for non-image data', async () => {
      const textData = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello"

      const metadata = module.extractMetadata(textData);

      expect(metadata).toBeUndefined();
    });

    it('should extract image dimensions', async () => {
      // Use a minimal valid PNG for testing
      const pngData = createMinimalPNG();

      const metadata = module.extractMetadata(pngData);

      expect(metadata).toBeDefined();
      if (metadata) {
        expect(typeof metadata.width).toBe('number');
        expect(typeof metadata.height).toBe('number');
        expect(metadata.width).toBeGreaterThan(0);
        expect(metadata.height).toBeGreaterThan(0);
      }
    });
  });

  describe('error handling', () => {
    it('should handle initialization errors gracefully', async () => {
      // Force an error by using invalid URL
      const module = await WASMModule.initialize({ wasmUrl: 'invalid://url' });

      // Should fallback gracefully
      expect(module).toBeDefined();
      expect(module.extractMetadata).toBeDefined();
    });

    it('should handle corrupt image data', async () => {
      const module = await WASMModule.initialize();

      const corruptData = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
      const metadata = module.extractMetadata(corruptData);

      // Should return undefined or minimal metadata
      if (metadata) {
        expect(metadata.format).toBeDefined();
      }

      module.cleanup();
    });

    it('should handle empty data', async () => {
      const module = await WASMModule.initialize();

      const emptyData = new Uint8Array(0);
      const metadata = module.extractMetadata(emptyData);

      expect(metadata).toBeUndefined();

      module.cleanup();
    });
  });
});

// Helper function to create a minimal valid PNG
function createMinimalPNG(): Uint8Array {
  // This creates a minimal 1x1 transparent PNG
  return new Uint8Array([
    // PNG header
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    // IHDR chunk
    0x00, 0x00, 0x00, 0x0D, // chunk length
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, 0x06, // bit depth: 8, color type: 6 (RGBA)
    0x00, 0x00, 0x00, // compression, filter, interlace
    0x1F, 0x15, 0xC4, 0x89, // CRC
    // IDAT chunk (compressed image data)
    0x00, 0x00, 0x00, 0x0A,
    0x49, 0x44, 0x41, 0x54,
    0x78, 0x9C, 0x62, 0x00, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x05,
    // IEND chunk
    0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4E, 0x44,
    0xAE, 0x42, 0x60, 0x82
  ]);
}