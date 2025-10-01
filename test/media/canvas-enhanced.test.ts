import { describe, it, expect, beforeAll } from 'vitest';
import { CanvasMetadataExtractor } from '../../src/media/fallback/canvas.js';
import type { ImageMetadata, DominantColor, AspectRatio, Orientation } from '../../src/media/types.js';

// Mock canvas context for Node.js testing
class MockCanvasContext {
  private imageData: ImageData;
  private isMonochrome: boolean;

  constructor(width: number, height: number, isMonochrome: boolean = false) {
    // Create mock image data
    const data = new Uint8ClampedArray(width * height * 4);

    if (isMonochrome) {
      // Fill with monochrome data (all gray)
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 128;     // R
        data[i + 1] = 128; // G
        data[i + 2] = 128; // B
        data[i + 3] = 255; // A
      }
    } else {
      // Fill with test pattern (gradient)
      for (let i = 0; i < data.length; i += 4) {
        const pixelIndex = i / 4;
        const x = pixelIndex % width;
        const y = Math.floor(pixelIndex / width);

        // Create a gradient pattern
        data[i] = Math.floor((x / width) * 255);     // R
        data[i + 1] = Math.floor((y / height) * 255); // G
        data[i + 2] = 128;                             // B
        data[i + 3] = 255;                             // A
      }
    }

    this.imageData = { data, width, height, colorSpace: 'srgb' } as ImageData;
    this.isMonochrome = isMonochrome;
  }

  getImageData = (x: number, y: number, width: number, height: number): ImageData => {
    // Return subset of image data
    return this.imageData;
  }

  drawImage() {
    // Mock implementation
  }

  // Add this to make the context look like a real 2D context
  get canvas() {
    return { width: this.imageData.width, height: this.imageData.height };
  }
}

// Mock canvas for Node.js
class MockCanvas {
  width: number = 0;
  height: number = 0;
  isMonochrome: boolean = false;
  private context: MockCanvasContext | null = null;

  getContext(type: string): MockCanvasContext | null {
    if (type === '2d') {
      this.context = new MockCanvasContext(this.width, this.height, this.isMonochrome);
      return this.context;
    }
    return null;
  }
}

// Mock Image implementation
class MockImage {
  width = 0;
  height = 0;
  src = '';
  onload?: () => void;
  onerror?: (error: Error) => void;

  constructor() {
    setTimeout(() => {
      if (this.src.includes('timeout')) {
        // Don't call onload or onerror for timeout test
        return;
      }

      if (this.src.startsWith('data:image/')) {
        // Simulate different image sizes based on type
        if (this.src.includes('landscape')) {
          this.width = 1920;
          this.height = 1080;
        } else if (this.src.includes('portrait')) {
          this.width = 1080;
          this.height = 1920;
        } else if (this.src.includes('square')) {
          this.width = 1024;
          this.height = 1024;
        } else if (this.src.includes('monochrome')) {
          this.width = 800;
          this.height = 600;
          (this as any).src = 'data:image/monochrome'; // Mark for color detection
        } else {
          this.width = 800;
          this.height = 600;
        }
        this.onload?.();
      } else {
        this.onerror?.(new Error('Invalid image'));
      }
    }, 10);
  }
}

// Setup mocks
beforeAll(() => {
  (globalThis as any).Image = MockImage;
  (globalThis as any).__currentTestImage = null;
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        const canvas = new MockCanvas();
        // Check if this is for a monochrome test
        const currentImage = (globalThis as any).__currentTestImage;
        if (currentImage && currentImage.src && currentImage.src.includes('monochrome')) {
          canvas.isMonochrome = true;
        }
        return canvas;
      }
      return {};
    }
  };
  (globalThis as any).URL = {
    ...URL,
    createObjectURL: (blob: Blob) => {
      // Include type info in mock URL for testing
      let typeHint = 'default';
      const blobData = (blob as any).data?.[0] || '';

      if (blob.type.includes('landscape')) typeHint = 'landscape';
      else if (blob.type.includes('portrait')) typeHint = 'portrait';
      else if (blob.type.includes('square')) typeHint = 'square';
      else if (blob.type.includes('timeout')) typeHint = 'timeout';
      else if (blobData === 'monochrome-data' || blob.type.includes('monochrome')) typeHint = 'monochrome';

      return `data:${blob.type};${typeHint};base64,mock`;
    },
    revokeObjectURL: () => {}
  };
});

describe('CanvasMetadataExtractor Enhanced Features', () => {
  describe('Dominant Color Extraction', () => {
    it('should extract dominant colors from an image', async () => {
      const blob = new Blob(['fake-image-data'], { type: 'image/jpeg' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata).toBeDefined();
      expect(metadata?.dominantColors).toBeDefined();
      expect(metadata?.dominantColors).toBeInstanceOf(Array);
      expect(metadata?.dominantColors?.length).toBeGreaterThan(0);
      expect(metadata?.dominantColors?.length).toBeLessThanOrEqual(5);

      // Check color format
      const firstColor = metadata?.dominantColors?.[0];
      expect(firstColor).toHaveProperty('hex');
      expect(firstColor).toHaveProperty('rgb');
      expect(firstColor?.rgb).toHaveProperty('r');
      expect(firstColor?.rgb).toHaveProperty('g');
      expect(firstColor?.rgb).toHaveProperty('b');
      expect(firstColor).toHaveProperty('percentage');
    });

    it('should order colors by dominance', async () => {
      const blob = new Blob(['fake-image-data'], { type: 'image/png' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      const colors = metadata?.dominantColors || [];
      for (let i = 1; i < colors.length; i++) {
        expect(colors[i - 1].percentage).toBeGreaterThanOrEqual(colors[i].percentage);
      }
    });

    it('should handle monochrome images', async () => {
      // Create a blob with data that will be recognized as monochrome
      const blob = Object.assign(
        new Blob(['monochrome-data'], { type: 'image/jpeg' }),
        { data: ['monochrome-data'] }
      );

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata?.dominantColors).toBeDefined();
      expect(metadata?.dominantColors?.length).toBe(1);
      expect(metadata?.isMonochrome).toBe(true);
    });
  });

  describe('Aspect Ratio Calculation', () => {
    it('should detect landscape orientation', async () => {
      const blob = new Blob(['landscape'], { type: 'image/landscape' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata?.aspectRatio).toBe('landscape');
      expect(metadata?.aspectRatioValue).toBeCloseTo(1.78, 1); // 16:9
    });

    it('should detect portrait orientation', async () => {
      const blob = new Blob(['portrait'], { type: 'image/portrait' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata?.aspectRatio).toBe('portrait');
      expect(metadata?.aspectRatioValue).toBeCloseTo(0.56, 1); // 9:16
    });

    it('should detect square images', async () => {
      const blob = new Blob(['square'], { type: 'image/square' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata?.aspectRatio).toBe('square');
      expect(metadata?.aspectRatioValue).toBe(1);
    });

    it('should calculate common aspect ratios', async () => {
      const blob = new Blob(['landscape'], { type: 'image/landscape' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata?.commonAspectRatio).toBeDefined();
      expect(['16:9', '16:10', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16']).toContain(
        metadata?.commonAspectRatio
      );
    });
  });

  describe('Orientation Detection', () => {
    it('should detect normal orientation', async () => {
      const blob = new Blob(['normal'], { type: 'image/jpeg' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata?.orientation).toBe(1); // Normal
      expect(metadata?.needsRotation).toBe(false);
    });

    it('should detect images that need rotation', async () => {
      const rotatedBlob = new Blob(['rotated'], { type: 'image/jpeg' });

      const metadata = await CanvasMetadataExtractor.extract(rotatedBlob);

      // This would be 6 for 90° CW rotation
      expect(metadata?.orientation).toBeGreaterThan(1);
      expect(metadata?.needsRotation).toBe(true);
    });

    it('should provide rotation angle', async () => {
      const blob = new Blob(['rotated'], { type: 'image/jpeg' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata?.rotationAngle).toBeDefined();
      expect([0, 90, 180, 270]).toContain(metadata?.rotationAngle);
    });
  });

  describe('File Type Validation', () => {
    it('should validate real image data', async () => {
      const validBlob = new Blob(['valid'], { type: 'image/jpeg' });

      const metadata = await CanvasMetadataExtractor.extract(validBlob);

      expect(metadata?.isValidImage).toBe(true);
      expect(metadata?.validationErrors).toBeUndefined();
    });

    it('should detect corrupt image data', async () => {
      const corruptBlob = new Blob(['corrupt'], { type: 'application/octet-stream' });

      const metadata = await CanvasMetadataExtractor.extract(corruptBlob);

      expect(metadata?.isValidImage).toBe(false);
      expect(metadata?.validationErrors).toBeDefined();
      expect(metadata?.validationErrors).toContain('Invalid image format');
    });

    it('should detect unsupported formats', async () => {
      const unsupportedBlob = new Blob(['tiff'], { type: 'image/tiff' });

      const metadata = await CanvasMetadataExtractor.extract(unsupportedBlob);

      expect(metadata?.isValidImage).toBe(false);
      expect(metadata?.validationErrors).toContain('Unsupported format: tiff');
    });
  });

  describe('Performance Metrics', () => {
    it('should track processing time', async () => {
      const blob = new Blob(['image'], { type: 'image/jpeg' });

      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata?.processingTime).toBeDefined();
      expect(metadata?.processingTime).toBeGreaterThan(0);
      expect(metadata?.processingTime).toBeLessThan(1000); // Should be fast
    });

    it('should indicate if processing was fast', async () => {
      const smallBlob = new Blob(['small'], { type: 'image/jpeg' });

      const metadata = await CanvasMetadataExtractor.extract(smallBlob);

      expect(metadata?.processingSpeed).toBeDefined();
      expect(['fast', 'normal', 'slow']).toContain(metadata?.processingSpeed);
    });
  });

  describe('Memory Efficiency', () => {
    it('should handle large images without excessive memory', async () => {
      // Create a "large" image blob
      const largeData = new Uint8Array(10 * 1024 * 1024); // 10MB
      const largeBlob = new Blob([largeData], { type: 'image/jpeg' });

      const metadata = await CanvasMetadataExtractor.extract(largeBlob);

      expect(metadata).toBeDefined();
      expect(metadata?.memoryEfficient).toBe(true);
      expect(metadata?.samplingStrategy).toBe('adaptive'); // Should use sampling for large images
    });

    it('should use full analysis for small images', async () => {
      const smallBlob = new Blob(['small'], { type: 'image/jpeg' });

      const metadata = await CanvasMetadataExtractor.extract(smallBlob);

      expect(metadata?.samplingStrategy).toBe('full');
    });
  });

  describe('Error Recovery', () => {
    it('should gracefully handle canvas context errors', async () => {
      // Mock canvas context failure
      const oldCreateElement = (globalThis as any).document.createElement;
      (globalThis as any).document.createElement = (tag: string) => {
        if (tag === 'canvas') {
          const canvas = new MockCanvas();
          canvas.getContext = () => null; // Force context failure
          return canvas;
        }
        return {};
      };

      const blob = new Blob(['image'], { type: 'image/jpeg' });
      const metadata = await CanvasMetadataExtractor.extract(blob);

      expect(metadata).toBeDefined();
      expect(metadata?.processingErrors?.[0]).toMatch(/Failed to extract colors/);

      // Restore mock
      (globalThis as any).document.createElement = oldCreateElement;
    });

    it('should handle image load timeout', async () => {
      // Create a blob that will timeout
      const timeoutBlob = new Blob(['timeout'], { type: 'image/timeout' });

      // The timeout is handled by loadImage which has a 5-second timeout
      // We expect the extraction to fail gracefully
      const metadata = await CanvasMetadataExtractor.extract(timeoutBlob);

      expect(metadata).toBeDefined();
      // The image will fail to load due to timeout simulation
      expect(metadata?.isValidImage).toBe(false);
      expect(metadata?.processingErrors).toBeDefined();
      expect(metadata?.processingErrors).toContain('Image load timeout');
    }, 10000); // Increase test timeout to 10 seconds
  });
});