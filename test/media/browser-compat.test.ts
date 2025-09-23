import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrowserCompatibility } from '../../src/media/compat/browser.js';

describe('BrowserCompatibility', () => {
  describe('capability detection', () => {
    const originalWindow = (globalThis as any).window;
    const originalDocument = (globalThis as any).document;
    const originalWebAssembly = (globalThis as any).WebAssembly;
    const originalImage = (globalThis as any).Image;

    afterEach(() => {
      // Restore globals
      (globalThis as any).window = originalWindow;
      (globalThis as any).document = originalDocument;
      (globalThis as any).WebAssembly = originalWebAssembly;
      (globalThis as any).Image = originalImage;
    });

    it('should detect WebAssembly support', () => {
      // Simulate WebAssembly available
      (globalThis as any).WebAssembly = {
        compile: () => {},
        instantiate: () => {}
      };

      expect(BrowserCompatibility.hasWebAssembly()).toBe(true);

      // Simulate no WebAssembly
      (globalThis as any).WebAssembly = undefined;
      expect(BrowserCompatibility.hasWebAssembly()).toBe(false);
    });

    it('should detect Canvas support', () => {
      // Simulate browser environment with Canvas
      (globalThis as any).document = {
        createElement: (tag: string) => {
          if (tag === 'canvas') {
            return {
              getContext: (type: string) => type === '2d' ? {} : null
            };
          }
        }
      };

      expect(BrowserCompatibility.hasCanvas()).toBe(true);

      // Simulate no Canvas support
      (globalThis as any).document = undefined;
      expect(BrowserCompatibility.hasCanvas()).toBe(false);
    });

    it('should detect Image support', () => {
      // Simulate Image available
      (globalThis as any).Image = class {};
      expect(BrowserCompatibility.hasImage()).toBe(true);

      // Simulate no Image
      (globalThis as any).Image = undefined;
      expect(BrowserCompatibility.hasImage()).toBe(false);
    });

    it('should detect Blob support', () => {
      // Blob should be available in modern environments
      expect(BrowserCompatibility.hasBlob()).toBe(true);
    });

    it('should detect URL.createObjectURL support', () => {
      expect(BrowserCompatibility.hasObjectURL()).toBe(true);
    });
  });

  describe('strategy selection', () => {
    it('should select WASM strategy when available', () => {
      const strategy = BrowserCompatibility.selectStrategy({
        hasWebAssembly: true,
        hasCanvas: true,
        hasImage: true
      });

      expect(strategy).toBe('wasm');
    });

    it('should select Canvas strategy when WASM unavailable', () => {
      const strategy = BrowserCompatibility.selectStrategy({
        hasWebAssembly: false,
        hasCanvas: true,
        hasImage: true
      });

      expect(strategy).toBe('canvas');
    });

    it('should select basic strategy when Canvas unavailable', () => {
      const strategy = BrowserCompatibility.selectStrategy({
        hasWebAssembly: false,
        hasCanvas: false,
        hasImage: true
      });

      expect(strategy).toBe('basic');
    });

    it('should select none when no capabilities available', () => {
      const strategy = BrowserCompatibility.selectStrategy({
        hasWebAssembly: false,
        hasCanvas: false,
        hasImage: false
      });

      expect(strategy).toBe('none');
    });

    it('should allow forcing specific strategy', () => {
      const strategy = BrowserCompatibility.selectStrategy({
        hasWebAssembly: true,
        hasCanvas: true,
        hasImage: true,
        preferredStrategy: 'canvas'
      });

      expect(strategy).toBe('canvas');
    });
  });

  describe('full capability check', () => {
    it('should return comprehensive capability report', () => {
      const capabilities = BrowserCompatibility.checkCapabilities();

      expect(capabilities).toHaveProperty('hasWebAssembly');
      expect(capabilities).toHaveProperty('hasCanvas');
      expect(capabilities).toHaveProperty('hasImage');
      expect(capabilities).toHaveProperty('hasBlob');
      expect(capabilities).toHaveProperty('hasObjectURL');
      expect(capabilities).toHaveProperty('recommendedStrategy');

      expect(typeof capabilities.hasWebAssembly).toBe('boolean');
      expect(typeof capabilities.hasCanvas).toBe('boolean');
      expect(typeof capabilities.hasImage).toBe('boolean');
      expect(typeof capabilities.hasBlob).toBe('boolean');
      expect(typeof capabilities.hasObjectURL).toBe('boolean');
      expect(typeof capabilities.recommendedStrategy).toBe('string');
    });
  });

  describe('browser detection', () => {
    it('should detect browser type', () => {
      const browser = BrowserCompatibility.detectBrowser();

      // In Node.js environment, should return 'node'
      expect(browser).toBeDefined();
      expect(['chrome', 'firefox', 'safari', 'edge', 'node', 'unknown'].includes(browser)).toBe(true);
    });

    it('should provide browser-specific recommendations', () => {
      const recommendations = BrowserCompatibility.getRecommendations();

      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });

  describe('performance hints', () => {
    it('should provide performance hints based on capabilities', () => {
      const hints = BrowserCompatibility.getPerformanceHints({
        hasWebAssembly: true,
        hasCanvas: true
      });

      expect(hints).toBeDefined();
      expect(hints).toHaveProperty('useWASM');
      expect(hints).toHaveProperty('maxImageSize');
      expect(hints).toHaveProperty('cacheStrategy');
    });

    it('should adjust hints for limited capabilities', () => {
      const hints = BrowserCompatibility.getPerformanceHints({
        hasWebAssembly: false,
        hasCanvas: true
      });

      expect(hints.useWASM).toBe(false);
      expect(hints.maxImageSize).toBeLessThanOrEqual(10 * 1024 * 1024); // 10MB max for Canvas
    });
  });
});