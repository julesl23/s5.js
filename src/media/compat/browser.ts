import type { BrowserCapabilities, ProcessingStrategy, BrowserInfo } from '../types.js';

/**
 * Browser compatibility detection and strategy selection
 */
export class BrowserCompat {
  private static capabilities?: BrowserCapabilities;
  private static browserInfo?: BrowserInfo;

  /**
   * Reset cached capabilities (mainly for testing)
   */
  static resetCache(): void {
    this.capabilities = undefined;
    this.browserInfo = undefined;
  }

  /**
   * Check browser capabilities
   */
  static async checkCapabilities(): Promise<BrowserCapabilities> {
    if (this.capabilities) {
      return this.capabilities;
    }

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
      memoryLimit: 512, // Default 512MB
      performanceAPI: false,
      memoryInfo: false
    };

    // Check WebAssembly support
    try {
      if (typeof WebAssembly === 'object' && WebAssembly !== null) {
        caps.webAssembly = true;
        caps.webAssemblyStreaming = typeof WebAssembly.instantiateStreaming === 'function';
      }
    } catch {
      // WebAssembly not supported
    }

    // Check SharedArrayBuffer (may be disabled due to Spectre mitigations)
    try {
      if (typeof SharedArrayBuffer !== 'undefined') {
        new SharedArrayBuffer(1);
        caps.sharedArrayBuffer = true;
      }
    } catch {
      // SharedArrayBuffer not supported or disabled
    }

    // Check Web Workers
    caps.webWorkers = typeof Worker !== 'undefined';

    // Check OffscreenCanvas
    caps.offscreenCanvas = typeof OffscreenCanvas !== 'undefined';

    // Check createImageBitmap
    caps.createImageBitmap = typeof createImageBitmap === 'function';

    // Check WebGL support
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        caps.webGL = !!gl;

        const gl2 = canvas.getContext('webgl2');
        caps.webGL2 = !!gl2;
      } catch {
        // WebGL not supported
      }
    }

    // Check Performance API
    caps.performanceAPI = typeof performance !== 'undefined' &&
                          typeof performance.now === 'function';

    // Check memory constraints
    caps.memoryLimit = this.detectMemoryLimit();
    caps.memoryInfo = typeof performance !== 'undefined' && !!(performance as any).memory;

    // Check image format support
    if (this.isBrowserEnvironment()) {
      caps.webP = await this.checkImageFormatSupport('image/webp');
      caps.avif = await this.checkImageFormatSupport('image/avif');
    }

    this.capabilities = caps;
    return caps;
  }

  /**
   * Check if a specific image format is supported
   */
  private static checkImageFormatSupport(mimeType: string): Promise<boolean> {
    return new Promise((resolve) => {
      // In Node.js environment, return false
      if (!this.isBrowserEnvironment()) {
        resolve(false);
        return;
      }

      const img = new Image();

      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);

      // 1x1 pixel test images
      if (mimeType === 'image/webp') {
        // Minimal WebP image
        img.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
      } else if (mimeType === 'image/avif') {
        // Minimal AVIF image
        img.src = 'data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZgAAAPBtZXRhAAAA';
      } else {
        resolve(false);
      }
    });
  }

  /**
   * Detect available memory limit
   */
  private static detectMemoryLimit(): number {
    // In Node.js, use process.memoryUsage
    if (this.isNodeEnvironment()) {
      try {
        const usage = process.memoryUsage();
        return Math.floor(usage.heapTotal / 1048576); // Convert to MB
      } catch {
        return 512; // Default
      }
    }

    // In browser, try to use performance.memory (Chrome only)
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      if (memory.jsHeapSizeLimit) {
        return Math.floor(memory.jsHeapSizeLimit / 1048576); // Convert to MB
      }
    }

    // Try to estimate based on navigator.deviceMemory (Chrome only)
    if (typeof navigator !== 'undefined' && (navigator as any).deviceMemory) {
      return (navigator as any).deviceMemory * 1024; // Convert GB to MB
    }

    // Default fallback
    return 512; // 512MB default
  }

  /**
   * Select optimal processing strategy based on capabilities
   */
  static selectProcessingStrategy(caps: BrowserCapabilities): ProcessingStrategy {
    // Consider memory constraints - avoid WASM with very low memory
    const lowMemory = caps.memoryLimit < 512;

    // Best: WASM in Web Worker
    if (caps.webAssembly && caps.webWorkers && !lowMemory) {
      return 'wasm-worker';
    }

    // Good: WASM in main thread
    if (caps.webAssembly && !lowMemory) {
      return 'wasm-main';
    }

    // OK: Canvas in Web Worker
    if (caps.webWorkers && caps.offscreenCanvas) {
      return 'canvas-worker';
    }

    // Fallback: Canvas in main thread
    return 'canvas-main';
  }

  /**
   * Get browser information
   */
  static getBrowserInfo(): BrowserInfo {
    if (this.browserInfo) {
      return this.browserInfo;
    }

    const userAgent = this.getUserAgent();
    this.browserInfo = this.parseBrowserInfo(userAgent);
    return this.browserInfo;
  }

  /**
   * Parse browser info from user agent string
   */
  static parseBrowserInfo(userAgent: string): BrowserInfo {
    const info: BrowserInfo = {
      name: 'Unknown',
      version: '0',
      platform: 'Unknown',
      isMobile: false
    };

    // Detect mobile
    info.isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent);

    // Detect platform - iOS first since it contains "Mac OS X" in user agent
    if (/iPhone|iPad|iPod/i.test(userAgent)) {
      info.platform = 'iOS';
    } else if (/Android/i.test(userAgent)) {
      info.platform = 'Android';
    } else if (/Mac OS X/i.test(userAgent)) {
      info.platform = 'macOS';
    } else if (/Windows/i.test(userAgent)) {
      info.platform = 'Windows';
    } else if (/Linux/i.test(userAgent)) {
      info.platform = 'Linux';
    }

    // Detect browser - order matters!
    if (/Edg\/(\d+\.\d+\.\d+\.\d+)/i.test(userAgent)) {
      info.name = 'Edge';
      info.version = RegExp.$1;
    } else if (/Chrome\/(\d+\.\d+\.\d+\.\d+)/i.test(userAgent)) {
      info.name = 'Chrome';
      info.version = RegExp.$1;
    } else if (/Firefox\/(\d+\.\d+)/i.test(userAgent)) {
      info.name = 'Firefox';
      info.version = RegExp.$1;
    } else if (/Version\/(\d+\.\d+\.\d+).*Safari/i.test(userAgent)) {
      info.name = 'Safari';
      info.version = RegExp.$1;
    } else if (/Safari/i.test(userAgent)) {
      info.name = 'Safari';
      // Try to extract version from Version/ tag
      const versionMatch = userAgent.match(/Version\/(\d+\.\d+)/);
      if (versionMatch) {
        info.version = versionMatch[1];
      }
    }

    return info;
  }

  /**
   * Get user agent string
   */
  private static getUserAgent(): string {
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      return navigator.userAgent;
    }
    return '';
  }

  /**
   * Get optimization recommendations based on capabilities
   */
  static getOptimizationRecommendations(caps: BrowserCapabilities): string[] {
    const recommendations: string[] = [];

    if (!caps.webAssembly) {
      recommendations.push('Consider upgrading to a browser with WASM support for better performance');
    }

    if (!caps.webWorkers) {
      recommendations.push('Web Workers are not available - processing will block the main thread');
    }

    if (!caps.sharedArrayBuffer) {
      recommendations.push('SharedArrayBuffer is disabled - parallel processing capabilities are limited');
    }

    if (caps.memoryLimit < 512) {
      recommendations.push('Low memory detected - consider closing other applications');
    }

    if (!caps.webP) {
      recommendations.push('WebP format not supported - using fallback formats');
    }

    if (!caps.avif) {
      recommendations.push('AVIF format not supported - using older formats');
    }

    if (!caps.offscreenCanvas) {
      recommendations.push('OffscreenCanvas not available - worker-based rendering is limited');
    }

    return recommendations;
  }

  /**
   * Get preferred image formats based on support
   */
  static getPreferredImageFormats(caps: BrowserCapabilities): string[] {
    const formats: string[] = [];

    // Add in order of preference
    if (caps.avif) {
      formats.push('avif');
    }
    if (caps.webP) {
      formats.push('webp');
    }

    // Always include fallbacks
    formats.push('jpeg');
    formats.push('png');

    return formats;
  }

  /**
   * Check if running in Node.js environment
   */
  static isNodeEnvironment(): boolean {
    return typeof process !== 'undefined' &&
           process.versions != null &&
           process.versions.node != null;
  }

  /**
   * Check if running in browser environment
   */
  static isBrowserEnvironment(): boolean {
    return typeof window !== 'undefined' &&
           typeof document !== 'undefined' &&
           !this.isNodeEnvironment();
  }

  /**
   * Check if running in service worker context
   */
  static isServiceWorkerContext(): boolean {
    return typeof self !== 'undefined' &&
           'ServiceWorkerGlobalScope' in self;
  }

  /**
   * Check if running in web worker context
   */
  static isWebWorkerContext(): boolean {
    return typeof self !== 'undefined' &&
           typeof (globalThis as any).importScripts === 'function' &&
           !this.isServiceWorkerContext();
  }
}