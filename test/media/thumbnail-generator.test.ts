import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThumbnailGenerator } from '../../src/media/thumbnail/generator.js';
import type { ThumbnailOptions } from '../../src/media/types.js';

// Mock browser APIs for Node.js environment
let lastCreatedBlob: Blob | null = null;

global.Image = class Image {
  public src: string = '';
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public width: number = 100;
  public height: number = 100;

  constructor() {
    // Simulate image loading
    setTimeout(async () => {
      // Check if this is a corrupted blob (very small size indicates corruption)
      if (this.src === 'blob:mock-url' && lastCreatedBlob) {
        // For corrupted images (less than 10 bytes), trigger error
        if (lastCreatedBlob.size < 10) {
          if (this.onerror) {
            this.onerror();
          }
          return;
        }
      }

      if (this.onload) {
        this.onload();
      }
    }, 0);
  }
} as any;

global.URL = {
  createObjectURL: (blob: Blob) => {
    lastCreatedBlob = blob;
    return 'blob:mock-url';
  },
  revokeObjectURL: (url: string) => {
    lastCreatedBlob = null;
  },
} as any;

// Mock document and canvas
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
        getContext: (type: string, options?: any) => ({
          imageSmoothingEnabled: true,
          imageSmoothingQuality: 'high',
          fillStyle: '',
          drawImage: () => {},
          fillRect: () => {}, // Add fillRect for test helper
          getImageData: (x: number, y: number, w: number, h: number) => ({
            width: w,
            height: h,
            data: new Uint8ClampedArray(w * h * 4),
          }),
        }),
        toBlob: (callback: (blob: Blob | null) => void, type: string, quality?: number) => {
          // Create a mock blob with realistic size based on dimensions and quality
          // Ensure minimum size for valid images
          const baseSize = Math.max(canvas._width * canvas._height, 100);
          const qualityFactor = quality !== undefined ? quality : 0.92; // default quality
          const size = Math.floor(baseSize * qualityFactor * 0.5) + 50; // Rough estimate of compressed size
          const mockBlob = new Blob([new Uint8Array(size)], { type });
          setTimeout(() => callback(mockBlob), 0);
        },
      };
      return canvas;
    }
    return {};
  },
} as any;

describe('ThumbnailGenerator', () => {
  // Helper to create a simple test image blob (1x1 red pixel PNG)
  const createTestImageBlob = (): Blob => {
    // 1x1 red pixel PNG (base64 decoded)
    const pngData = new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
      0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
      0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
      0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
      0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    return new Blob([pngData], { type: 'image/png' });
  };

  // Helper to create a larger test image (100x100 checkerboard pattern)
  const createLargeTestImageBlob = async (): Promise<Blob> => {
    // In Node.js environment, we'll create a simple colored PNG
    // For browser environment, we could use Canvas API
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Draw checkerboard pattern
      for (let y = 0; y < 100; y += 10) {
        for (let x = 0; x < 100; x += 10) {
          ctx.fillStyle = (x + y) % 20 === 0 ? '#000' : '#FFF';
          ctx.fillRect(x, y, 10, 10);
        }
      }

      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('Failed to create blob')),
          'image/png'
        );
      });
    } else {
      // For Node.js, return a simple test blob
      return createTestImageBlob();
    }
  };

  describe('Basic thumbnail generation', () => {
    it('should generate a thumbnail with default options', async () => {
      const blob = createTestImageBlob();
      const result = await ThumbnailGenerator.generateThumbnail(blob);

      expect(result).toBeDefined();
      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.format).toBe('jpeg');
      expect(result.quality).toBe(85); // default
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should respect maxWidth and maxHeight options', async () => {
      const blob = await createLargeTestImageBlob();
      const options: ThumbnailOptions = {
        maxWidth: 50,
        maxHeight: 50
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      expect(result.width).toBeLessThanOrEqual(50);
      expect(result.height).toBeLessThanOrEqual(50);
    });

    it('should maintain aspect ratio by default', async () => {
      const blob = await createLargeTestImageBlob();
      const options: ThumbnailOptions = {
        maxWidth: 50,
        maxHeight: 100
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      // Original is 100x100 (1:1 ratio), so thumbnail should also be 1:1
      // Given max 50x100, it should be 50x50 to maintain ratio
      expect(result.width).toBe(50);
      expect(result.height).toBe(50);
    });

    it('should allow disabling aspect ratio maintenance', async () => {
      const blob = await createLargeTestImageBlob();
      const options: ThumbnailOptions = {
        maxWidth: 50,
        maxHeight: 100,
        maintainAspectRatio: false
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      expect(result.width).toBe(50);
      expect(result.height).toBe(100);
    });

    it('should support custom quality setting', async () => {
      const blob = createTestImageBlob();
      const options: ThumbnailOptions = {
        quality: 50
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      expect(result.quality).toBe(50);
    });
  });

  describe('Format support', () => {
    it('should generate JPEG thumbnails', async () => {
      const blob = createTestImageBlob();
      const options: ThumbnailOptions = {
        format: 'jpeg'
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      expect(result.format).toBe('jpeg');
      expect(result.blob.type).toContain('jpeg');
    });

    it('should generate PNG thumbnails', async () => {
      const blob = createTestImageBlob();
      const options: ThumbnailOptions = {
        format: 'png'
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      expect(result.format).toBe('png');
      expect(result.blob.type).toContain('png');
    });

    it('should generate WebP thumbnails', async () => {
      const blob = createTestImageBlob();
      const options: ThumbnailOptions = {
        format: 'webp'
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      expect(result.format).toBe('webp');
      expect(result.blob.type).toContain('webp');
    });
  });

  describe('Target size optimization', () => {
    it('should adjust quality to meet target size', async () => {
      const blob = await createLargeTestImageBlob();
      const targetSize = 2048; // 2KB target
      const options: ThumbnailOptions = {
        targetSize,
        quality: 95 // Start high, should be reduced
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      expect(result.blob.size).toBeLessThanOrEqual(targetSize);
      expect(result.quality).toBeLessThan(95); // Quality should be reduced
    });

    it('should not increase quality above requested value', async () => {
      const blob = createTestImageBlob();
      const options: ThumbnailOptions = {
        targetSize: 1024 * 1024, // 1MB - very large target
        quality: 50
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      expect(result.quality).toBeLessThanOrEqual(50);
    });

    it('should handle target size larger than result', async () => {
      const blob = createTestImageBlob();
      const options: ThumbnailOptions = {
        targetSize: 1024 * 1024, // 1MB
        quality: 85
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      expect(result.blob.size).toBeLessThanOrEqual(1024 * 1024);
      expect(result.quality).toBe(85); // Should keep original quality
    });
  });

  describe('Smart cropping', () => {
    it('should support smart crop option', async () => {
      const blob = await createLargeTestImageBlob();
      const options: ThumbnailOptions = {
        maxWidth: 50,
        maxHeight: 50,
        maintainAspectRatio: false,
        smartCrop: true
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      expect(result.width).toBe(50);
      expect(result.height).toBe(50);
    });

    it('should work without smart crop', async () => {
      const blob = await createLargeTestImageBlob();
      const options: ThumbnailOptions = {
        maxWidth: 50,
        maxHeight: 50,
        maintainAspectRatio: false,
        smartCrop: false
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      expect(result.width).toBe(50);
      expect(result.height).toBe(50);
    });
  });

  describe('Performance', () => {
    it('should complete processing within reasonable time', async () => {
      const blob = await createLargeTestImageBlob();

      const startTime = performance.now();
      const result = await ThumbnailGenerator.generateThumbnail(blob);
      const duration = performance.now() - startTime;

      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(5000); // 5 seconds max
    });

    it('should handle concurrent thumbnail generation', async () => {
      const blobs = await Promise.all([
        createLargeTestImageBlob(),
        createLargeTestImageBlob(),
        createLargeTestImageBlob()
      ]);

      const startTime = performance.now();
      const results = await Promise.all(
        blobs.map(blob => ThumbnailGenerator.generateThumbnail(blob, {
          maxWidth: 128,
          maxHeight: 128
        }))
      );
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(3);
      expect(results.every(r => r.blob.size > 0)).toBe(true);
      expect(duration).toBeLessThan(10000); // 10 seconds for 3 images
    });
  });

  describe('Error handling', () => {
    it('should handle invalid blob gracefully', async () => {
      const invalidBlob = new Blob(['not an image'], { type: 'text/plain' });

      await expect(
        ThumbnailGenerator.generateThumbnail(invalidBlob)
      ).rejects.toThrow();
    });

    it('should handle empty blob', async () => {
      const emptyBlob = new Blob([], { type: 'image/png' });

      await expect(
        ThumbnailGenerator.generateThumbnail(emptyBlob)
      ).rejects.toThrow();
    });

    it('should handle corrupted image data', async () => {
      // Create a blob that looks like an image but has corrupted data
      const corruptedData = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, // PNG signature
        0x00, 0x00, 0x00, 0x00  // Invalid data
      ]);
      const corruptedBlob = new Blob([corruptedData], { type: 'image/png' });

      await expect(
        ThumbnailGenerator.generateThumbnail(corruptedBlob)
      ).rejects.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle very small images', async () => {
      const blob = createTestImageBlob(); // 1x1 image
      const options: ThumbnailOptions = {
        maxWidth: 256,
        maxHeight: 256
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should handle quality at minimum (1)', async () => {
      const blob = createTestImageBlob();
      const options: ThumbnailOptions = {
        quality: 1
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      expect(result.quality).toBe(1);
      expect(result.blob.size).toBeGreaterThan(0);
    });

    it('should handle quality at maximum (100)', async () => {
      const blob = createTestImageBlob();
      const options: ThumbnailOptions = {
        quality: 100
      };

      const result = await ThumbnailGenerator.generateThumbnail(blob, options);

      expect(result.quality).toBe(100);
      expect(result.blob.size).toBeGreaterThan(0);
    });
  });
});
