import { describe, it, expect, beforeAll, vi } from 'vitest';
import { MediaProcessor, BrowserCompat } from '../../src/media/index.js';

describe('MediaProcessor', () => {
  // Helper function at the top level of describe block
  const createTestBlob = (content: string = 'test', type: string = 'image/jpeg'): Blob => {
    return new Blob([content], { type });
  };

  describe('initialization', () => {
    it('should be a class with static methods', () => {
      expect(MediaProcessor).toBeDefined();
      expect(typeof MediaProcessor.initialize).toBe('function');
      expect(typeof MediaProcessor.extractMetadata).toBe('function');
    });

    it('should initialize WASM module on first call', async () => {
      await MediaProcessor.initialize();
      expect(MediaProcessor.isInitialized()).toBe(true);
    });

    it('should only initialize once when called multiple times', async () => {
      await MediaProcessor.initialize();
      const firstModule = MediaProcessor.getModule();

      await MediaProcessor.initialize();
      const secondModule = MediaProcessor.getModule();

      expect(firstModule).toBe(secondModule);
    });
  });

  describe('extractMetadata', () => {

    it('should extract metadata from a JPEG blob', async () => {
      const jpegBlob = createTestBlob('fake-jpeg-data', 'image/jpeg');
      const metadata = await MediaProcessor.extractMetadata(jpegBlob);

      expect(metadata).toBeDefined();
      expect(metadata?.format).toBe('jpeg');
      expect(typeof metadata?.width).toBe('number');
      expect(typeof metadata?.height).toBe('number');
    });

    it('should extract metadata from a PNG blob', async () => {
      const pngBlob = createTestBlob('fake-png-data', 'image/png');
      const metadata = await MediaProcessor.extractMetadata(pngBlob);

      expect(metadata).toBeDefined();
      expect(metadata?.format).toBe('png');
      expect(metadata?.hasAlpha).toBeDefined();
    });

    it('should extract metadata from a WebP blob', async () => {
      const webpBlob = createTestBlob('fake-webp-data', 'image/webp');
      const metadata = await MediaProcessor.extractMetadata(webpBlob);

      expect(metadata).toBeDefined();
      expect(metadata?.format).toBe('webp');
    });

    it('should return undefined for non-image blobs', async () => {
      const textBlob = createTestBlob('not an image', 'text/plain');
      const metadata = await MediaProcessor.extractMetadata(textBlob);

      expect(metadata).toBeUndefined();
    });

    it('should initialize automatically when extractMetadata is called', async () => {
      MediaProcessor.reset(); // Reset for testing
      expect(MediaProcessor.isInitialized()).toBe(false);

      const blob = createTestBlob('test', 'image/jpeg');
      await MediaProcessor.extractMetadata(blob);

      expect(MediaProcessor.isInitialized()).toBe(true);
    });

    it('should handle errors gracefully and fallback to basic extraction', async () => {
      // Test with invalid image data that will cause extraction to fail
      MediaProcessor.reset();

      // Create a blob with invalid image data
      const invalidData = new Uint8Array([0, 1, 2, 3, 4]);
      const blob = new Blob([invalidData], { type: 'image/jpeg' });

      const metadata = await MediaProcessor.extractMetadata(blob);

      // Should still get metadata from fallback
      expect(metadata).toBeDefined();
      expect(metadata?.format).toBeDefined();
    });
  });

  describe('lazy loading', () => {
    it('should not load WASM module until needed', () => {
      MediaProcessor.reset();
      expect(MediaProcessor.getModule()).toBeUndefined();
    });

    it('should load WASM module on first initialize call', async () => {
      MediaProcessor.reset();

      // Mock browser capabilities to include WASM support
      const originalCheck = BrowserCompat.checkCapabilities;
      vi.spyOn(BrowserCompat, 'checkCapabilities').mockResolvedValue({
        webAssembly: true,
        webAssemblyStreaming: true,
        sharedArrayBuffer: false,
        webWorkers: true,
        offscreenCanvas: false,
        createImageBitmap: true,
        webP: true,
        avif: false,
        webGL: false,
        webGL2: false,
        memoryInfo: false,
        performanceAPI: true,
        memoryLimit: 1024
      });

      await MediaProcessor.initialize();
      expect(MediaProcessor.getModule()).toBeDefined();

      // Restore original
      BrowserCompat.checkCapabilities = originalCheck;
    });

    it('should support progress callback during WASM loading', async () => {
      MediaProcessor.reset();
      const progressValues: number[] = [];

      // Mock browser capabilities to include WASM support
      vi.spyOn(BrowserCompat, 'checkCapabilities').mockResolvedValue({
        webAssembly: true,
        webAssemblyStreaming: true,
        sharedArrayBuffer: false,
        webWorkers: true,
        offscreenCanvas: false,
        createImageBitmap: true,
        webP: true,
        avif: false,
        webGL: false,
        webGL2: false,
        memoryInfo: false,
        performanceAPI: true,
        memoryLimit: 1024
      });

      await MediaProcessor.initialize({
        onProgress: (percent) => progressValues.push(percent)
      });

      expect(progressValues.length).toBeGreaterThan(0);
      expect(progressValues[progressValues.length - 1]).toBe(100);

      vi.restoreAllMocks();
    });
  });

  describe('options', () => {
    it('should support disabling WASM through options', async () => {
      const blob = createTestBlob('test', 'image/jpeg');
      const metadata = await MediaProcessor.extractMetadata(blob, { useWASM: false });

      expect(metadata).toBeDefined();
      // Should have used fallback
      expect(metadata?.source).toBe('canvas');
    });

    it('should support timeout option', async () => {
      MediaProcessor.reset();

      // Mock browser capabilities to include WASM support for this test
      vi.spyOn(BrowserCompat, 'checkCapabilities').mockResolvedValue({
        webAssembly: true,
        webAssemblyStreaming: true,
        sharedArrayBuffer: false,
        webWorkers: true,
        offscreenCanvas: false,
        createImageBitmap: true,
        webP: true,
        avif: false,
        webGL: false,
        webGL2: false,
        memoryInfo: false,
        performanceAPI: true,
        memoryLimit: 1024
      });

      await MediaProcessor.initialize();

      // Create a more realistic JPEG blob with proper headers
      const jpegData = new Uint8Array([
        0xFF, 0xD8, 0xFF, 0xE0, // JPEG SOI and APP0
        0x00, 0x10, // Length
        0x4A, 0x46, 0x49, 0x46, 0x00, // JFIF
        0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
        0xFF, 0xC0, // SOF0 marker
        0x00, 0x11, // Length
        0x08, // Data precision
        0x00, 0x64, // Height (100)
        0x00, 0xC8, // Width (200)
        0x03, // Components
        0x01, 0x22, 0x00, // Component 1
        0x02, 0x11, 0x01, // Component 2
        0x03, 0x11, 0x01, // Component 3
        0xFF, 0xD9 // EOI
      ]);
      const blob = new Blob([jpegData], { type: 'image/jpeg' });

      const startTime = Date.now();
      const metadata = await MediaProcessor.extractMetadata(blob, { timeout: 100 });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(200);
      expect(metadata).toBeDefined();

      vi.restoreAllMocks();
    });
  });
});