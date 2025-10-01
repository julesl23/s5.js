import { describe, it, expect, beforeAll } from 'vitest';
import { CanvasMetadataExtractor } from '../../src/media/fallback/canvas.js';

// Mock canvas implementation for Node.js testing
class MockImage {
  width = 0;
  height = 0;
  src = '';
  onload?: () => void;
  onerror?: (error: Error) => void;

  constructor() {
    // Simulate async image loading
    setTimeout(() => {
      if (this.src.startsWith('data:image/')) {
        // Simulate successful load
        this.width = 800;
        this.height = 600;
        this.onload?.();
      } else {
        // Simulate error
        this.onerror?.(new Error('Invalid image'));
      }
    }, 10);
  }
}

// Mock global Image for testing
(globalThis as any).Image = MockImage;

// Mock URL.createObjectURL and revokeObjectURL for Node.js
(globalThis as any).URL = {
  ...URL,
  createObjectURL: (blob: Blob) => `data:${blob.type};base64,mock`,
  revokeObjectURL: () => {}
};

describe('CanvasMetadataExtractor', () => {
  describe('extract method', () => {
    it('should extract metadata from JPEG blob', async () => {
      const blob = new Blob(['fake-jpeg-data'], { type: 'image/jpeg' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata).toBeDefined();
      expect(metadata?.format).toBe('jpeg');
      expect(metadata?.width).toBe(800);
      expect(metadata?.height).toBe(600);
      expect(metadata?.source).toBe('canvas');
    });

    it('should extract metadata from PNG blob', async () => {
      const blob = new Blob(['fake-png-data'], { type: 'image/png' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata).toBeDefined();
      expect(metadata?.format).toBe('png');
      expect(metadata?.hasAlpha).toBe(true);
    });

    it('should extract metadata from WebP blob', async () => {
      const blob = new Blob(['fake-webp-data'], { type: 'image/webp' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata).toBeDefined();
      expect(metadata?.format).toBe('webp');
    });

    it('should extract metadata from GIF blob', async () => {
      const blob = new Blob(['fake-gif-data'], { type: 'image/gif' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata).toBeDefined();
      expect(metadata?.format).toBe('gif');
    });

    it('should extract metadata from BMP blob', async () => {
      const blob = new Blob(['fake-bmp-data'], { type: 'image/bmp' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata).toBeDefined();
      expect(metadata?.format).toBe('bmp');
    });

    it('should return undefined for non-image blobs', async () => {
      const blob = new Blob(['text content'], { type: 'text/plain' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata).toBeUndefined();
    });

    it('should include file size in metadata', async () => {
      const content = 'x'.repeat(1234);
      const blob = new Blob([content], { type: 'image/png' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata?.size).toBe(1234);
    });

    it('should handle blob without explicit type', async () => {
      const blob = new Blob(['image-data']);

      const metadata = await CanvasMetadataExtractor.extract(blob);

      // Should try to detect or return unknown
      if (metadata) {
        expect(metadata.format).toBeDefined();
      }
    });
  });

  describe('format detection', () => {
    it('should detect format from MIME type', () => {
      expect(CanvasMetadataExtractor.detectFormat('image/jpeg')).toBe('jpeg');
      expect(CanvasMetadataExtractor.detectFormat('image/png')).toBe('png');
      expect(CanvasMetadataExtractor.detectFormat('image/webp')).toBe('webp');
      expect(CanvasMetadataExtractor.detectFormat('image/gif')).toBe('gif');
      expect(CanvasMetadataExtractor.detectFormat('image/bmp')).toBe('bmp');
      expect(CanvasMetadataExtractor.detectFormat('text/plain')).toBe('unknown');
    });

    it('should handle image/jpg alias for JPEG', () => {
      expect(CanvasMetadataExtractor.detectFormat('image/jpg')).toBe('jpeg');
    });
  });

  describe('transparency detection', () => {
    it('should detect transparency for PNG', () => {
      expect(CanvasMetadataExtractor.hasTransparency('png')).toBe(true);
    });

    it('should detect transparency for WebP', () => {
      expect(CanvasMetadataExtractor.hasTransparency('webp')).toBe(true);
    });

    it('should detect transparency for GIF', () => {
      expect(CanvasMetadataExtractor.hasTransparency('gif')).toBe(true);
    });

    it('should detect no transparency for JPEG', () => {
      expect(CanvasMetadataExtractor.hasTransparency('jpeg')).toBe(false);
    });

    it('should detect no transparency for BMP', () => {
      expect(CanvasMetadataExtractor.hasTransparency('bmp')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle corrupt image data gracefully', async () => {
      // Override MockImage to simulate error
      const originalImage = (globalThis as any).Image;

      class ErrorImage extends MockImage {
        constructor() {
          super();
          setTimeout(() => {
            this.onerror?.(new Error('Corrupt image'));
          }, 10);
        }
      }

      (globalThis as any).Image = ErrorImage;

      const blob = new Blob(['corrupt'], { type: 'image/jpeg' });
      const metadata = await CanvasMetadataExtractor.extract(blob);

      // Should still return basic metadata from blob
      expect(metadata).toBeDefined();
      expect(metadata?.format).toBe('jpeg');
      expect(metadata?.size).toBe(7); // 'corrupt'.length

      // Restore original
      (globalThis as any).Image = originalImage;
    });

    it('should handle empty blob', async () => {
      const blob = new Blob([], { type: 'image/png' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata).toBeDefined();
      expect(metadata?.size).toBe(0);
    });

    it('should handle very large images', async () => {
      // Override MockImage to simulate large image
      const originalImage = (globalThis as any).Image;

      (globalThis as any).Image = class LargeImage {
        width = 10000;
        height = 10000;
        src = '';
        onload?: () => void;
        onerror?: (error: Error) => void;

        constructor() {
          setTimeout(() => {
            this.onload?.();
          }, 10);
        }
      };

      const blob = new Blob(['large'], { type: 'image/jpeg' });
      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata?.width).toBe(10000);
      expect(metadata?.height).toBe(10000);

      // Restore original
      (globalThis as any).Image = originalImage;
    });
  });
});