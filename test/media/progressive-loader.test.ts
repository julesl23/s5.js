import { describe, it, expect, vi } from 'vitest';
import { ProgressiveImageLoader } from '../../src/media/progressive/loader.js';
import type { ProgressiveLoadingOptions } from '../../src/media/types.js';

// Mock browser APIs (reuse from thumbnail tests)
let lastCreatedBlob: Blob | null = null;

global.Image = class Image {
  public src: string = '';
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public width: number = 100;
  public height: number = 100;

  constructor() {
    setTimeout(async () => {
      if (this.src === 'blob:mock-url' && lastCreatedBlob) {
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

describe('ProgressiveImageLoader', () => {
  // Helper to create test image blobs
  const createJPEGBlob = (): Blob => {
    const jpegData = new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0, // JPEG SOI and APP0
      0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00,
      0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xFF, 0xD9 // EOI
    ]);
    return new Blob([jpegData], { type: 'image/jpeg' });
  };

  const createPNGBlob = (): Blob => {
    const pngData = new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
      0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    return new Blob([pngData], { type: 'image/png' });
  };

  const createWebPBlob = (): Blob => {
    const webpData = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // 'RIFF'
      0x00, 0x00, 0x00, 0x00, // File size
      0x57, 0x45, 0x42, 0x50, // 'WEBP'
      0x56, 0x50, 0x38, 0x20 // 'VP8 '
    ]);
    return new Blob([webpData], { type: 'image/webp' });
  };

  describe('Format detection', () => {
    it('should detect JPEG format', async () => {
      const blob = createJPEGBlob();
      const progressive = await ProgressiveImageLoader.createProgressive(blob);

      expect(progressive).toBeDefined();
      // JPEG should have the format detected
    });

    it('should detect PNG format', async () => {
      const blob = createPNGBlob();
      const progressive = await ProgressiveImageLoader.createProgressive(blob);

      expect(progressive).toBeDefined();
    });

    it('should detect WebP format', async () => {
      const blob = createWebPBlob();
      const progressive = await ProgressiveImageLoader.createProgressive(blob);

      expect(progressive).toBeDefined();
    });

    it('should reject unsupported formats', async () => {
      const blob = new Blob(['not an image'], { type: 'text/plain' });

      await expect(
        ProgressiveImageLoader.createProgressive(blob)
      ).rejects.toThrow();
    });
  });

  describe('Progressive JPEG', () => {
    it('should create progressive JPEG with default settings', async () => {
      const blob = createJPEGBlob();
      const progressive = await ProgressiveImageLoader.createProgressive(blob);

      expect(progressive).toBeDefined();
      expect(progressive.layerCount).toBeGreaterThan(0);
    });

    it('should create progressive JPEG with custom scans', async () => {
      const blob = createJPEGBlob();
      const options: ProgressiveLoadingOptions = {
        progressiveScans: 3,
        qualityLevels: [20, 50, 85]
      };

      const progressive = await ProgressiveImageLoader.createProgressive(blob, options);

      expect(progressive.layerCount).toBe(3);
    });

    it('should have layers with correct quality levels', async () => {
      const blob = createJPEGBlob();
      const options: ProgressiveLoadingOptions = {
        progressiveScans: 3,
        qualityLevels: [20, 50, 85]
      };

      const progressive = await ProgressiveImageLoader.createProgressive(blob, options);
      const layers = progressive.getAllLayers();

      expect(layers).toHaveLength(3);
      expect(layers[0].quality).toBe(20);
      expect(layers[0].isBaseline).toBe(true);
      expect(layers[1].quality).toBe(50);
      expect(layers[2].quality).toBe(85);
    });

    it('should have increasing scan numbers', async () => {
      const blob = createJPEGBlob();
      const options: ProgressiveLoadingOptions = {
        progressiveScans: 3
      };

      const progressive = await ProgressiveImageLoader.createProgressive(blob, options);
      const layers = progressive.getAllLayers();

      expect(layers[0].scanNumber).toBe(0);
      expect(layers[1].scanNumber).toBe(1);
      expect(layers[2].scanNumber).toBe(2);
    });

    it('should convert to final blob', async () => {
      const blob = createJPEGBlob();
      const progressive = await ProgressiveImageLoader.createProgressive(blob);

      const finalBlob = progressive.toBlob();

      expect(finalBlob).toBeInstanceOf(Blob);
      expect(finalBlob.type).toContain('jpeg');
      expect(finalBlob.size).toBeGreaterThan(0);
    });

    it('should access individual layers', async () => {
      const blob = createJPEGBlob();
      const progressive = await ProgressiveImageLoader.createProgressive(blob, {
        progressiveScans: 3
      });

      const layer0 = progressive.getLayer(0);
      const layer1 = progressive.getLayer(1);
      const layer2 = progressive.getLayer(2);

      expect(layer0).toBeDefined();
      expect(layer1).toBeDefined();
      expect(layer2).toBeDefined();
      expect(layer0?.isBaseline).toBe(true);
    });
  });

  describe('Progressive PNG', () => {
    it('should create interlaced PNG', async () => {
      const blob = createPNGBlob();
      const options: ProgressiveLoadingOptions = {
        interlace: true
      };

      const progressive = await ProgressiveImageLoader.createProgressive(blob, options);

      expect(progressive).toBeDefined();
      expect(progressive.layerCount).toBe(1); // PNG uses single interlaced file
    });

    it('should create non-interlaced PNG when disabled', async () => {
      const blob = createPNGBlob();
      const options: ProgressiveLoadingOptions = {
        interlace: false
      };

      const progressive = await ProgressiveImageLoader.createProgressive(blob, options);

      expect(progressive).toBeDefined();
      expect(progressive.layerCount).toBe(1);
    });

    it('should have baseline layer for PNG', async () => {
      const blob = createPNGBlob();
      const progressive = await ProgressiveImageLoader.createProgressive(blob);

      const layer = progressive.getLayer(0);

      expect(layer).toBeDefined();
      expect(layer?.isBaseline).toBe(true);
      expect(layer?.scanNumber).toBe(0);
    });

    it('should convert PNG to final blob', async () => {
      const blob = createPNGBlob();
      const progressive = await ProgressiveImageLoader.createProgressive(blob);

      const finalBlob = progressive.toBlob();

      expect(finalBlob).toBeInstanceOf(Blob);
      expect(finalBlob.type).toContain('png');
    });
  });

  describe('Progressive WebP', () => {
    it('should create progressive WebP with quality levels', async () => {
      const blob = createWebPBlob();
      const options: ProgressiveLoadingOptions = {
        qualityLevels: [30, 60, 90]
      };

      const progressive = await ProgressiveImageLoader.createProgressive(blob, options);

      expect(progressive).toBeDefined();
      expect(progressive.layerCount).toBe(3);
    });

    it('should have layers with correct quality levels for WebP', async () => {
      const blob = createWebPBlob();
      const options: ProgressiveLoadingOptions = {
        qualityLevels: [30, 60, 90]
      };

      const progressive = await ProgressiveImageLoader.createProgressive(blob, options);
      const layers = progressive.getAllLayers();

      expect(layers[0].quality).toBe(30);
      expect(layers[0].isBaseline).toBe(true);
      expect(layers[1].quality).toBe(60);
      expect(layers[1].isBaseline).toBe(false);
      expect(layers[2].quality).toBe(90);
    });

    it('should convert WebP to final blob with highest quality', async () => {
      const blob = createWebPBlob();
      const progressive = await ProgressiveImageLoader.createProgressive(blob, {
        qualityLevels: [30, 60, 90]
      });

      const finalBlob = progressive.toBlob();

      expect(finalBlob).toBeInstanceOf(Blob);
      expect(finalBlob.type).toContain('webp');
    });
  });

  describe('Layer access', () => {
    it('should return undefined for invalid layer index', async () => {
      const blob = createJPEGBlob();
      const progressive = await ProgressiveImageLoader.createProgressive(blob, {
        progressiveScans: 2
      });

      const invalidLayer = progressive.getLayer(10);

      expect(invalidLayer).toBeUndefined();
    });

    it('should return all layers', async () => {
      const blob = createJPEGBlob();
      const progressive = await ProgressiveImageLoader.createProgressive(blob, {
        progressiveScans: 3
      });

      const allLayers = progressive.getAllLayers();

      expect(allLayers).toHaveLength(3);
      expect(allLayers.every(layer => layer.data instanceof Uint8Array)).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle empty blob', async () => {
      const emptyBlob = new Blob([], { type: 'image/jpeg' });

      await expect(
        ProgressiveImageLoader.createProgressive(emptyBlob)
      ).rejects.toThrow();
    });

    it('should handle corrupted image data', async () => {
      const corruptedData = new Uint8Array([0xFF, 0xD8, 0x00, 0x00]); // Truncated JPEG
      const corruptedBlob = new Blob([corruptedData], { type: 'image/jpeg' });

      // Should either throw or handle gracefully
      await expect(
        ProgressiveImageLoader.createProgressive(corruptedBlob)
      ).rejects.toThrow();
    });

    it('should handle missing quality levels', async () => {
      const blob = createJPEGBlob();
      const options: ProgressiveLoadingOptions = {
        progressiveScans: 5,
        qualityLevels: [20, 50] // Only 2 levels for 5 scans
      };

      const progressive = await ProgressiveImageLoader.createProgressive(blob, options);

      // Should use default quality for missing levels
      expect(progressive.layerCount).toBe(5);
    });
  });

  describe('Performance', () => {
    it('should complete processing within reasonable time', async () => {
      const blob = createJPEGBlob();

      const startTime = performance.now();
      await ProgressiveImageLoader.createProgressive(blob, {
        progressiveScans: 3
      });
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(5000); // 5 seconds max
    });

    it('should handle concurrent progressive creation', async () => {
      const blobs = [
        createJPEGBlob(),
        createPNGBlob(),
        createWebPBlob()
      ];

      const startTime = performance.now();
      const results = await Promise.all(
        blobs.map(blob => ProgressiveImageLoader.createProgressive(blob))
      );
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(3);
      expect(results.every(r => r.layerCount > 0)).toBe(true);
      expect(duration).toBeLessThan(10000); // 10 seconds for 3 images
    });
  });

  describe('Edge cases', () => {
    it('should handle single scan JPEG', async () => {
      const blob = createJPEGBlob();
      const options: ProgressiveLoadingOptions = {
        progressiveScans: 1
      };

      const progressive = await ProgressiveImageLoader.createProgressive(blob, options);

      expect(progressive.layerCount).toBe(1);
      expect(progressive.getLayer(0)?.isBaseline).toBe(true);
    });

    it('should handle high number of scans', async () => {
      const blob = createJPEGBlob();
      const options: ProgressiveLoadingOptions = {
        progressiveScans: 10
      };

      const progressive = await ProgressiveImageLoader.createProgressive(blob, options);

      expect(progressive.layerCount).toBe(10);
    });

    it('should handle quality levels at extremes', async () => {
      const blob = createWebPBlob();
      const options: ProgressiveLoadingOptions = {
        qualityLevels: [1, 100]
      };

      const progressive = await ProgressiveImageLoader.createProgressive(blob, options);

      expect(progressive.layerCount).toBe(2);
      const layers = progressive.getAllLayers();
      expect(layers[0].quality).toBe(1);
      expect(layers[1].quality).toBe(100);
    });
  });
});
