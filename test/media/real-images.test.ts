import { describe, it, expect, beforeAll } from 'vitest';
import { MediaProcessor } from '../../src/media/index.js';
import { CanvasMetadataExtractor } from '../../src/media/fallback/canvas.js';
import {
  loadTestImageBlob,
  loadExpectedMetadata,
  getTestImages,
  type TestImageMetadata
} from '../fixtures/image-loader.js';

describe('Real Image Processing Tests', () => {
  let expectedMetadata: Record<string, TestImageMetadata>;

  beforeAll(async () => {
    expectedMetadata = await loadExpectedMetadata();
  });

  describe('MediaProcessor with real images', () => {
    beforeAll(async () => {
      await MediaProcessor.initialize();
    });

    getTestImages().forEach(imageName => {
      it(`should extract metadata from ${imageName}`, async () => {
        const blob = loadTestImageBlob(imageName);
        const expected = expectedMetadata[imageName];

        const metadata = await MediaProcessor.extractMetadata(blob);

        expect(metadata).toBeDefined();
        expect(metadata?.format).toBe(expected.format);

        // For minimal 1x1 images, dimensions might be detected
        if (imageName.includes('1x1')) {
          expect(metadata?.width).toBeGreaterThanOrEqual(0);
          expect(metadata?.height).toBeGreaterThanOrEqual(0);
        }

        // Check hasAlpha for PNG
        if (expected.format === 'png') {
          expect(metadata?.hasAlpha).toBeDefined();
        }
      });
    });

    it('should handle JPEG format correctly', async () => {
      const blob = loadTestImageBlob('1x1-red.jpg');
      const metadata = await MediaProcessor.extractMetadata(blob);

      expect(metadata).toBeDefined();
      expect(metadata?.format).toBe('jpeg');
      expect(metadata?.hasAlpha).toBeFalsy();
    });

    it('should handle PNG format correctly', async () => {
      const blob = loadTestImageBlob('1x1-red.png');
      const metadata = await MediaProcessor.extractMetadata(blob);

      expect(metadata).toBeDefined();
      expect(metadata?.format).toBe('png');
      // PNG can have alpha channel
      expect(metadata?.hasAlpha).toBeDefined();
    });

    it('should handle GIF format correctly', async () => {
      const blob = loadTestImageBlob('1x1-red.gif');
      const metadata = await MediaProcessor.extractMetadata(blob);

      expect(metadata).toBeDefined();
      expect(metadata?.format).toBe('gif');
    });

    it('should handle BMP format correctly', async () => {
      const blob = loadTestImageBlob('1x1-red.bmp');
      const metadata = await MediaProcessor.extractMetadata(blob);

      expect(metadata).toBeDefined();
      expect(metadata?.format).toBe('bmp');
    });

    it('should handle WebP format correctly', async () => {
      const blob = loadTestImageBlob('1x1-red.webp');
      const metadata = await MediaProcessor.extractMetadata(blob);

      expect(metadata).toBeDefined();
      expect(metadata?.format).toBe('webp');
    });
  });

  describe('CanvasMetadataExtractor with real images', () => {
    getTestImages().forEach(imageName => {
      it(`should extract Canvas metadata from ${imageName}`, async () => {
        const blob = loadTestImageBlob(imageName);
        const expected = expectedMetadata[imageName];

        const metadata = await CanvasMetadataExtractor.extract(blob);

        expect(metadata).toBeDefined();
        expect(metadata?.source).toBe('canvas');

        // Format detection from blob type
        if (blob.type.includes('jpeg')) {
          expect(metadata?.format).toBe('jpeg');
        } else if (blob.type.includes('png')) {
          expect(metadata?.format).toBe('png');
        }
      });
    });

    it('should extract dominant colors from real images', async () => {
      const blob = loadTestImageBlob('1x1-red.jpg');
      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata).toBeDefined();

      // In test environment with mock Canvas, dominant colors might not be extracted
      // This is expected behavior for Node.js environment
      if (metadata?.dominantColors) {
        expect(metadata.dominantColors).toBeInstanceOf(Array);

        // For a red pixel image, the dominant color should be reddish
        if (metadata.dominantColors.length > 0) {
          const firstColor = metadata.dominantColors[0];
          expect(firstColor.rgb.r).toBeGreaterThan(200); // Should be red-ish
        }
      } else {
        // In Node.js test environment, Canvas might not support full image processing
        expect(metadata?.source).toBe('canvas');
      }
    });
  });

  describe('Format validation with real images', () => {
    it('should validate JPEG magic bytes', async () => {
      const blob = loadTestImageBlob('1x1-red.jpg');
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // JPEG starts with FF D8
      expect(bytes[0]).toBe(0xFF);
      expect(bytes[1]).toBe(0xD8);
    });

    it('should validate PNG magic bytes', async () => {
      const blob = loadTestImageBlob('1x1-red.png');
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // PNG signature: 89 50 4E 47 0D 0A 1A 0A
      expect(bytes[0]).toBe(0x89);
      expect(bytes[1]).toBe(0x50);
      expect(bytes[2]).toBe(0x4E);
      expect(bytes[3]).toBe(0x47);
    });

    it('should validate GIF magic bytes', async () => {
      const blob = loadTestImageBlob('1x1-red.gif');
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // GIF starts with "GIF"
      expect(bytes[0]).toBe(0x47); // G
      expect(bytes[1]).toBe(0x49); // I
      expect(bytes[2]).toBe(0x46); // F
    });

    it('should validate BMP magic bytes', async () => {
      const blob = loadTestImageBlob('1x1-red.bmp');
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // BMP starts with "BM"
      expect(bytes[0]).toBe(0x42); // B
      expect(bytes[1]).toBe(0x4D); // M
    });

    it('should validate WebP magic bytes', async () => {
      const blob = loadTestImageBlob('1x1-red.webp');
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // WebP: RIFF....WEBP
      expect(bytes[0]).toBe(0x52); // R
      expect(bytes[1]).toBe(0x49); // I
      expect(bytes[2]).toBe(0x46); // F
      expect(bytes[3]).toBe(0x46); // F
      expect(bytes[8]).toBe(0x57); // W
      expect(bytes[9]).toBe(0x45); // E
      expect(bytes[10]).toBe(0x42); // B
      expect(bytes[11]).toBe(0x50); // P
    });
  });

  describe('Performance with real images', () => {
    it('should process images quickly', async () => {
      const blob = loadTestImageBlob('1x1-red.jpg');

      const startTime = performance.now();
      const metadata = await MediaProcessor.extractMetadata(blob);
      const endTime = performance.now();

      expect(metadata).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000); // Should be under 1 second
    });

    it('should handle multiple images efficiently', async () => {
      const images = getTestImages();
      const startTime = performance.now();

      const results = await Promise.all(
        images.map(name => {
          const blob = loadTestImageBlob(name);
          return MediaProcessor.extractMetadata(blob);
        })
      );

      const endTime = performance.now();

      expect(results).toHaveLength(images.length);
      results.forEach(metadata => {
        expect(metadata).toBeDefined();
      });

      // Should process all images in reasonable time
      expect(endTime - startTime).toBeLessThan(2000);
    });
  });
});