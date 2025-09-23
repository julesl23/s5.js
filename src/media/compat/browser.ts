/**
 * Browser compatibility detection and strategy selection
 */
export class BrowserCompatibility {
  /**
   * Check if WebAssembly is supported
   */
  static hasWebAssembly(): boolean {
    return typeof WebAssembly !== 'undefined' &&
           typeof WebAssembly.compile === 'function' &&
           typeof WebAssembly.instantiate === 'function';
  }

  /**
   * Check if Canvas API is supported
   */
  static hasCanvas(): boolean {
    if (typeof document === 'undefined') {
      return false;
    }

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      return ctx !== null;
    } catch {
      return false;
    }
  }

  /**
   * Check if Image constructor is available
   */
  static hasImage(): boolean {
    return typeof Image !== 'undefined';
  }

  /**
   * Check if Blob is supported
   */
  static hasBlob(): boolean {
    return typeof Blob !== 'undefined';
  }

  /**
   * Check if URL.createObjectURL is supported
   */
  static hasObjectURL(): boolean {
    return typeof URL !== 'undefined' &&
           typeof URL.createObjectURL === 'function' &&
           typeof URL.revokeObjectURL === 'function';
  }

  /**
   * Select the best strategy based on capabilities
   */
  static selectStrategy(options: {
    hasWebAssembly?: boolean;
    hasCanvas?: boolean;
    hasImage?: boolean;
    preferredStrategy?: 'wasm' | 'canvas' | 'basic' | 'none';
  }): 'wasm' | 'canvas' | 'basic' | 'none' {
    const {
      hasWebAssembly = this.hasWebAssembly(),
      hasCanvas = this.hasCanvas(),
      hasImage = this.hasImage(),
      preferredStrategy
    } = options;

    // If a preferred strategy is specified and available, use it
    if (preferredStrategy) {
      switch (preferredStrategy) {
        case 'wasm':
          if (hasWebAssembly) return 'wasm';
          break;
        case 'canvas':
          if (hasCanvas && hasImage) return 'canvas';
          break;
        case 'basic':
          if (hasImage) return 'basic';
          break;
        case 'none':
          return 'none';
      }
    }

    // Auto-select based on capabilities
    if (hasWebAssembly) {
      return 'wasm';
    } else if (hasCanvas && hasImage) {
      return 'canvas';
    } else if (hasImage) {
      return 'basic';
    } else {
      return 'none';
    }
  }

  /**
   * Get comprehensive capability report
   */
  static checkCapabilities(): CapabilityReport {
    const hasWebAssembly = this.hasWebAssembly();
    const hasCanvas = this.hasCanvas();
    const hasImage = this.hasImage();
    const hasBlob = this.hasBlob();
    const hasObjectURL = this.hasObjectURL();

    const recommendedStrategy = this.selectStrategy({
      hasWebAssembly,
      hasCanvas,
      hasImage
    });

    return {
      hasWebAssembly,
      hasCanvas,
      hasImage,
      hasBlob,
      hasObjectURL,
      recommendedStrategy
    };
  }

  /**
   * Detect browser type
   */
  static detectBrowser(): BrowserType {
    // Check if we're in Node.js
    if (typeof window === 'undefined' && typeof process !== 'undefined') {
      return 'node';
    }

    // Check for browser-specific features
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      return 'chrome';
    } else if (userAgent.includes('Firefox')) {
      return 'firefox';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      return 'safari';
    } else if (userAgent.includes('Edg')) {
      return 'edge';
    } else {
      return 'unknown';
    }
  }

  /**
   * Get browser-specific recommendations
   */
  static getRecommendations(): string[] {
    const browser = this.detectBrowser();
    const capabilities = this.checkCapabilities();
    const recommendations: string[] = [];

    // General recommendations
    if (!capabilities.hasWebAssembly) {
      recommendations.push('WebAssembly not supported. Using Canvas fallback for image processing.');
    }

    if (!capabilities.hasCanvas) {
      recommendations.push('Canvas API not available. Limited image processing capabilities.');
    }

    // Browser-specific recommendations
    switch (browser) {
      case 'safari':
        recommendations.push('Safari detected. Some WASM features may have reduced performance.');
        break;
      case 'firefox':
        recommendations.push('Firefox detected. Optimal WASM performance available.');
        break;
      case 'chrome':
      case 'edge':
        recommendations.push('Chromium-based browser detected. All features supported.');
        break;
      case 'node':
        recommendations.push('Node.js environment detected. Limited image processing without Canvas libraries.');
        break;
    }

    return recommendations;
  }

  /**
   * Get performance hints based on capabilities
   */
  static getPerformanceHints(options?: {
    hasWebAssembly?: boolean;
    hasCanvas?: boolean;
  }): PerformanceHints {
    const capabilities = options || this.checkCapabilities();

    return {
      useWASM: capabilities.hasWebAssembly ?? false,
      maxImageSize: capabilities.hasWebAssembly
        ? 50 * 1024 * 1024  // 50MB with WASM
        : 10 * 1024 * 1024, // 10MB with Canvas
      cacheStrategy: capabilities.hasWebAssembly ? 'aggressive' : 'conservative',
      parallelProcessing: capabilities.hasWebAssembly,
      preferredFormats: capabilities.hasWebAssembly
        ? ['webp', 'jpeg', 'png']
        : ['jpeg', 'png']
    };
  }
}

/**
 * Browser type enumeration
 */
export type BrowserType = 'chrome' | 'firefox' | 'safari' | 'edge' | 'node' | 'unknown';

/**
 * Capability report interface
 */
export interface CapabilityReport {
  hasWebAssembly: boolean;
  hasCanvas: boolean;
  hasImage: boolean;
  hasBlob: boolean;
  hasObjectURL: boolean;
  recommendedStrategy: 'wasm' | 'canvas' | 'basic' | 'none';
}

/**
 * Performance hints interface
 */
export interface PerformanceHints {
  useWASM: boolean;
  maxImageSize: number;
  cacheStrategy: 'aggressive' | 'conservative';
  parallelProcessing?: boolean;
  preferredFormats?: string[];
}