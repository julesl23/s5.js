import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserCompat } from '../../src/media/compat/browser.js';
import type { BrowserCapabilities, ProcessingStrategy, BrowserInfo } from '../../src/media/types.js';

describe('BrowserCompat', () => {
  beforeEach(() => {
    // Reset cached capabilities before each test
    BrowserCompat.resetCache();
  });

  describe('Capability Detection', () => {
    it('should detect WebAssembly support', async () => {
      const caps = await BrowserCompat.checkCapabilities();

      expect(caps).toBeDefined();
      expect(caps.webAssembly).toBeDefined();
      expect(typeof caps.webAssembly).toBe('boolean');
    });

    it('should detect WebAssembly streaming support', async () => {
      const caps = await BrowserCompat.checkCapabilities();

      expect(caps.webAssemblyStreaming).toBeDefined();
      expect(typeof caps.webAssemblyStreaming).toBe('boolean');

      // If WebAssembly is not supported, streaming should also be false
      if (!caps.webAssembly) {
        expect(caps.webAssemblyStreaming).toBe(false);
      }
    });

    it('should detect SharedArrayBuffer support', async () => {
      const caps = await BrowserCompat.checkCapabilities();

      expect(caps.sharedArrayBuffer).toBeDefined();
      expect(typeof caps.sharedArrayBuffer).toBe('boolean');
    });

    it('should detect Web Workers support', async () => {
      const caps = await BrowserCompat.checkCapabilities();

      expect(caps.webWorkers).toBeDefined();
      expect(typeof caps.webWorkers).toBe('boolean');
    });

    it('should detect OffscreenCanvas support', async () => {
      const caps = await BrowserCompat.checkCapabilities();

      expect(caps.offscreenCanvas).toBeDefined();
      expect(typeof caps.offscreenCanvas).toBe('boolean');
    });

    it('should detect WebP format support', async () => {
      const caps = await BrowserCompat.checkCapabilities();

      expect(caps.webP).toBeDefined();
      expect(typeof caps.webP).toBe('boolean');
    });

    it('should detect AVIF format support', async () => {
      const caps = await BrowserCompat.checkCapabilities();

      expect(caps.avif).toBeDefined();
      expect(typeof caps.avif).toBe('boolean');
    });

    it('should detect createImageBitmap support', async () => {
      const caps = await BrowserCompat.checkCapabilities();

      expect(caps.createImageBitmap).toBeDefined();
      expect(typeof caps.createImageBitmap).toBe('boolean');
    });

    it('should detect WebGL support', async () => {
      const caps = await BrowserCompat.checkCapabilities();

      expect(caps.webGL).toBeDefined();
      expect(typeof caps.webGL).toBe('boolean');
    });

    it('should detect WebGL2 support', async () => {
      const caps = await BrowserCompat.checkCapabilities();

      expect(caps.webGL2).toBeDefined();
      expect(typeof caps.webGL2).toBe('boolean');

      // WebGL2 cannot be supported without WebGL
      if (caps.webGL2) {
        expect(caps.webGL).toBe(true);
      }
    });

    it('should cache capabilities after first check', async () => {
      const caps1 = await BrowserCompat.checkCapabilities();
      const caps2 = await BrowserCompat.checkCapabilities();

      // Should return the same object reference (cached)
      expect(caps2).toBe(caps1);
    });

    it('should detect memory constraints', async () => {
      const caps = await BrowserCompat.checkCapabilities();

      expect(caps.memoryLimit).toBeDefined();
      expect(typeof caps.memoryLimit).toBe('number');
      expect(caps.memoryLimit).toBeGreaterThan(0);
    });

    it('should detect performance API availability', async () => {
      const caps = await BrowserCompat.checkCapabilities();

      expect(caps.performanceAPI).toBeDefined();
      expect(typeof caps.performanceAPI).toBe('boolean');
    });
  });

  describe('Strategy Selection', () => {
    it('should select wasm-worker strategy when both are available', () => {
      const caps: BrowserCapabilities = {
        webAssembly: true,
        webAssemblyStreaming: true,
        sharedArrayBuffer: true,
        webWorkers: true,
        offscreenCanvas: true,
        webP: true,
        avif: false,
        createImageBitmap: true,
        webGL: true,
        webGL2: true,
        memoryLimit: 4096,
        performanceAPI: true,
        memoryInfo: false
      };

      const strategy = BrowserCompat.selectProcessingStrategy(caps);
      expect(strategy).toBe('wasm-worker');
    });

    it('should select wasm-main strategy when workers unavailable', () => {
      const caps: BrowserCapabilities = {
        webAssembly: true,
        webAssemblyStreaming: true,
        sharedArrayBuffer: false,
        webWorkers: false,
        offscreenCanvas: false,
        webP: true,
        avif: false,
        createImageBitmap: true,
        webGL: true,
        webGL2: false,
        memoryLimit: 2048,
        performanceAPI: true,
        memoryInfo: false
      };

      const strategy = BrowserCompat.selectProcessingStrategy(caps);
      expect(strategy).toBe('wasm-main');
    });

    it('should select canvas-worker strategy when WASM unavailable but workers available', () => {
      const caps: BrowserCapabilities = {
        webAssembly: false,
        webAssemblyStreaming: false,
        sharedArrayBuffer: false,
        webWorkers: true,
        offscreenCanvas: true,
        webP: true,
        avif: false,
        createImageBitmap: true,
        webGL: false,
        webGL2: false,
        memoryLimit: 1024,
        performanceAPI: true,
        memoryInfo: false
      };

      const strategy = BrowserCompat.selectProcessingStrategy(caps);
      expect(strategy).toBe('canvas-worker');
    });

    it('should select canvas-main as fallback', () => {
      const caps: BrowserCapabilities = {
        webAssembly: false,
        webAssemblyStreaming: false,
        sharedArrayBuffer: false,
        webWorkers: false,
        offscreenCanvas: false,
        webP: false,
        avif: false,
        createImageBitmap: false,
        webGL: false,
        webGL2: false,
        memoryLimit: 512,
        performanceAPI: false,
        memoryInfo: false
      };

      const strategy = BrowserCompat.selectProcessingStrategy(caps);
      expect(strategy).toBe('canvas-main');
    });

    it('should consider memory constraints in strategy selection', () => {
      const caps: BrowserCapabilities = {
        webAssembly: true,
        webAssemblyStreaming: true,
        sharedArrayBuffer: true,
        webWorkers: true,
        offscreenCanvas: true,
        webP: true,
        avif: false,
        createImageBitmap: true,
        webGL: true,
        webGL2: true,
        memoryLimit: 256, // Very low memory
        performanceAPI: true,
        memoryInfo: false
      };

      const strategy = BrowserCompat.selectProcessingStrategy(caps);
      // Should avoid WASM with low memory
      expect(strategy).toBe('canvas-worker');
    });
  });

  describe('Browser Detection', () => {
    it('should detect browser info', () => {
      const info = BrowserCompat.getBrowserInfo();

      expect(info).toBeDefined();
      expect(info.name).toBeDefined();
      expect(info.version).toBeDefined();
      expect(info.platform).toBeDefined();
      expect(info.isMobile).toBeDefined();
    });

    it('should detect Chrome/Chromium', () => {
      const mockUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
      const info = BrowserCompat.parseBrowserInfo(mockUserAgent);

      expect(info.name).toBe('Chrome');
      expect(info.version).toBe('91.0.4472.124');
    });

    it('should detect Firefox', () => {
      const mockUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0';
      const info = BrowserCompat.parseBrowserInfo(mockUserAgent);

      expect(info.name).toBe('Firefox');
      expect(info.version).toBe('89.0');
    });

    it('should detect Safari', () => {
      const mockUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15';
      const info = BrowserCompat.parseBrowserInfo(mockUserAgent);

      expect(info.name).toBe('Safari');
      expect(info.version).toBe('14.1.1');
    });

    it('should detect Edge', () => {
      const mockUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59';
      const info = BrowserCompat.parseBrowserInfo(mockUserAgent);

      expect(info.name).toBe('Edge');
      expect(info.version).toBe('91.0.864.59');
    });

    it('should detect mobile browsers', () => {
      const mockMobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1';
      const info = BrowserCompat.parseBrowserInfo(mockMobileUA);

      expect(info.isMobile).toBe(true);
      expect(info.platform).toContain('iOS');
    });

    it('should detect Android browsers', () => {
      const mockAndroidUA = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36';
      const info = BrowserCompat.parseBrowserInfo(mockAndroidUA);

      expect(info.isMobile).toBe(true);
      expect(info.platform).toContain('Android');
    });
  });

  describe('Recommendations', () => {
    it('should provide optimization recommendations based on capabilities', async () => {
      const caps = await BrowserCompat.checkCapabilities();
      const recommendations = BrowserCompat.getOptimizationRecommendations(caps);

      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);

      // Should provide relevant recommendations
      if (!caps.webAssembly) {
        expect(recommendations.some(r => r.includes('WASM'))).toBe(true);
      }
      if (!caps.webWorkers) {
        expect(recommendations.some(r => r.includes('Worker'))).toBe(true);
      }
    });

    it('should suggest format preferences based on support', async () => {
      const caps = await BrowserCompat.checkCapabilities();
      const formats = BrowserCompat.getPreferredImageFormats(caps);

      expect(formats).toBeDefined();
      expect(Array.isArray(formats)).toBe(true);
      expect(formats.length).toBeGreaterThan(0);

      // Should always include JPEG/PNG as fallback
      expect(formats).toContain('jpeg');
      expect(formats).toContain('png');

      // Should include modern formats if supported
      if (caps.webP) {
        expect(formats.indexOf('webp')).toBeLessThan(formats.indexOf('jpeg'));
      }
      if (caps.avif) {
        expect(formats.indexOf('avif')).toBeLessThan(formats.indexOf('webp') || formats.indexOf('jpeg'));
      }
    });
  });

  describe('Environment Detection', () => {
    it('should detect Node.js environment', () => {
      const isNode = BrowserCompat.isNodeEnvironment();

      expect(typeof isNode).toBe('boolean');
      // In test environment (Node.js), this should be true
      expect(isNode).toBe(true);
    });

    it('should detect browser environment', () => {
      const isBrowser = BrowserCompat.isBrowserEnvironment();

      expect(typeof isBrowser).toBe('boolean');
      // In test environment (Node.js), this should be false
      expect(isBrowser).toBe(false);
    });

    it('should detect service worker context', () => {
      const isServiceWorker = BrowserCompat.isServiceWorkerContext();

      expect(typeof isServiceWorker).toBe('boolean');
    });

    it('should detect web worker context', () => {
      const isWebWorker = BrowserCompat.isWebWorkerContext();

      expect(typeof isWebWorker).toBe('boolean');
    });
  });
});