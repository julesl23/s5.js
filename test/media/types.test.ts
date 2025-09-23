import { describe, it, expect } from 'vitest';
import type { ImageMetadata, MediaOptions, ImageFormat } from '../../src/media/types.js';

describe('Media Types', () => {
  describe('ImageMetadata', () => {
    it('should have required properties', () => {
      const metadata: ImageMetadata = {
        width: 1920,
        height: 1080,
        format: 'jpeg'
      };

      expect(metadata.width).toBe(1920);
      expect(metadata.height).toBe(1080);
      expect(metadata.format).toBe('jpeg');
    });

    it('should support optional properties', () => {
      const metadata: ImageMetadata = {
        width: 800,
        height: 600,
        format: 'png',
        hasAlpha: true,
        exif: {
          make: 'Canon',
          iso: 100
        },
        size: 12345,
        source: 'wasm'
      };

      expect(metadata.hasAlpha).toBe(true);
      expect(metadata.exif).toEqual({ make: 'Canon', iso: 100 });
      expect(metadata.size).toBe(12345);
      expect(metadata.source).toBe('wasm');
    });

    it('should support all image formats', () => {
      const formats: ImageFormat[] = ['jpeg', 'png', 'webp', 'gif', 'bmp', 'unknown'];

      formats.forEach(format => {
        const metadata: ImageMetadata = {
          width: 100,
          height: 100,
          format
        };
        expect(metadata.format).toBe(format);
      });
    });
  });

  describe('MediaOptions', () => {
    it('should have all optional properties', () => {
      const options: MediaOptions = {};
      expect(options).toEqual({});
    });

    it('should support useWASM option', () => {
      const options: MediaOptions = {
        useWASM: false
      };
      expect(options.useWASM).toBe(false);
    });

    it('should support timeout option', () => {
      const options: MediaOptions = {
        timeout: 5000
      };
      expect(options.timeout).toBe(5000);
    });

    it('should support onProgress callback', () => {
      let lastProgress = 0;
      const options: MediaOptions = {
        onProgress: (percent) => {
          lastProgress = percent;
        }
      };

      options.onProgress!(50);
      expect(lastProgress).toBe(50);
    });

    it('should support all options together', () => {
      const options: MediaOptions = {
        useWASM: true,
        timeout: 10000,
        onProgress: (percent) => console.log(percent)
      };

      expect(options.useWASM).toBe(true);
      expect(options.timeout).toBe(10000);
      expect(typeof options.onProgress).toBe('function');
    });
  });
});