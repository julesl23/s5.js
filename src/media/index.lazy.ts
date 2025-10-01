/**
 * Lazy-loading wrapper for MediaProcessor
 * This module enables code-splitting and dynamic imports
 */

import type { ImageMetadata, MediaOptions, InitializeOptions } from './types.js';

/**
 * Lazy-loaded MediaProcessor class
 * Uses dynamic imports to load the actual implementation on-demand
 */
export class MediaProcessorLazy {
  private static loadingPromise?: Promise<typeof import('./index.js')>;
  private static module?: typeof import('./index.js');

  /**
   * Load the MediaProcessor module dynamically
   */
  private static async loadModule(): Promise<typeof import('./index.js')> {
    if (this.module) {
      return this.module;
    }

    if (!this.loadingPromise) {
      this.loadingPromise = import('./index.js');
    }

    this.module = await this.loadingPromise;
    return this.module;
  }

  /**
   * Initialize the MediaProcessor (lazy-loaded)
   */
  static async initialize(options?: InitializeOptions): Promise<void> {
    const module = await this.loadModule();
    return module.MediaProcessor.initialize(options);
  }

  /**
   * Extract metadata from an image blob (lazy-loaded)
   */
  static async extractMetadata(
    blob: Blob,
    options?: MediaOptions
  ): Promise<ImageMetadata | undefined> {
    const module = await this.loadModule();
    return module.MediaProcessor.extractMetadata(blob, options);
  }

  /**
   * Check if the MediaProcessor is initialized
   */
  static async isInitialized(): Promise<boolean> {
    if (!this.module) {
      return false;
    }
    const module = await this.loadModule();
    return module.MediaProcessor.isInitialized();
  }

  /**
   * Reset the MediaProcessor
   */
  static async reset(): Promise<void> {
    if (this.module) {
      this.module.MediaProcessor.reset();
    }
    this.module = undefined;
    this.loadingPromise = undefined;
  }
}

/**
 * Lazy-loaded Canvas metadata extractor
 */
export class CanvasMetadataExtractorLazy {
  private static module?: typeof import('./fallback/canvas.js');

  private static async loadModule(): Promise<typeof import('./fallback/canvas.js')> {
    if (!this.module) {
      this.module = await import('./fallback/canvas.js');
    }
    return this.module;
  }

  /**
   * Extract metadata using Canvas API (lazy-loaded)
   */
  static async extract(blob: Blob): Promise<ImageMetadata | undefined> {
    const module = await this.loadModule();
    return module.CanvasMetadataExtractor.extract(blob);
  }
}

/**
 * Lazy-loaded WASM module
 */
export class WASMModuleLazy {
  private static module?: typeof import('./wasm/module.js');

  private static async loadModule(): Promise<typeof import('./wasm/module.js')> {
    if (!this.module) {
      this.module = await import('./wasm/module.js');
    }
    return this.module;
  }

  /**
   * Initialize WASM module (lazy-loaded)
   */
  static async initialize(options?: InitializeOptions): Promise<any> {
    const module = await this.loadModule();
    return module.WASMModule.initialize(options);
  }
}