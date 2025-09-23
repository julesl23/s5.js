import type { ImageMetadata, MediaOptions, InitializeOptions, WASMModule } from './types.js';

/**
 * Main media processing class with lazy WASM loading
 */
export class MediaProcessor {
  private static wasmModule?: WASMModule;
  private static loadingPromise?: Promise<WASMModule>;
  private static initialized = false;
  private static forceError = false; // For testing

  /**
   * Initialize the MediaProcessor and load WASM module
   */
  static async initialize(options?: InitializeOptions): Promise<void> {
    if (this.initialized) return;

    if (!this.loadingPromise) {
      this.loadingPromise = this.loadWASM(options);
    }

    this.wasmModule = await this.loadingPromise;
    this.initialized = true;
  }

  /**
   * Load the WASM module dynamically
   */
  private static async loadWASM(options?: InitializeOptions): Promise<WASMModule> {
    // Report initial progress
    options?.onProgress?.(0);

    // Simulate loading for now (will be replaced with actual dynamic import)
    // Dynamic import will enable code splitting
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      options?.onProgress?.((i / steps) * 100);
    }

    // For now, return a mock module (will be replaced with actual WASM module)
    const mockModule: WASMModule = {
      async initialize() {
        // Mock initialization
      },
      extractMetadata(data: Uint8Array): ImageMetadata | undefined {
        // Mock metadata extraction
        if (MediaProcessor.forceError) {
          throw new Error('Forced WASM error for testing');
        }
        return {
          width: 1920,
          height: 1080,
          format: 'jpeg',
          source: 'wasm'
        };
      },
      cleanup() {
        // Mock cleanup
      }
    };

    await mockModule.initialize();
    return mockModule;
  }

  /**
   * Extract metadata from an image blob
   */
  static async extractMetadata(
    blob: Blob,
    options?: MediaOptions
  ): Promise<ImageMetadata | undefined> {
    // Auto-initialize if needed
    if (!this.initialized) {
      await this.initialize();
    }

    // Check if we should use WASM
    if (options?.useWASM === false) {
      return this.basicMetadataExtraction(blob);
    }

    try {
      // Apply timeout if specified
      const extractPromise = this.extractWithWASM(blob);

      if (options?.timeout) {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), options.timeout)
        );

        return await Promise.race([extractPromise, timeoutPromise]);
      }

      return await extractPromise;
    } catch (error) {
      // Fallback to basic extraction on error
      console.warn('WASM extraction failed, falling back to canvas:', error);
      return this.basicMetadataExtraction(blob);
    }
  }

  /**
   * Extract metadata using WASM
   */
  private static async extractWithWASM(blob: Blob): Promise<ImageMetadata | undefined> {
    if (!this.wasmModule) {
      throw new Error('WASM module not initialized');
    }

    // Check if it's actually an image
    if (!blob.type.startsWith('image/')) {
      return undefined;
    }

    const arrayBuffer = await blob.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const metadata = this.wasmModule.extractMetadata(data);

    // Override format based on blob type for mock
    if (metadata) {
      metadata.format = this.detectFormat(blob.type);
      if (metadata.format === 'png') {
        metadata.hasAlpha = true;
      }
    }

    return metadata;
  }

  /**
   * Basic metadata extraction fallback using Canvas API
   */
  private static async basicMetadataExtraction(
    blob: Blob
  ): Promise<ImageMetadata | undefined> {
    // Detect format from MIME type
    const format = this.detectFormat(blob.type);

    if (format === 'unknown' && !blob.type.startsWith('image/')) {
      return undefined;
    }

    // For now, return mock data (will be replaced with actual Canvas implementation)
    return {
      width: 800,
      height: 600,
      format,
      hasAlpha: format === 'png',
      size: blob.size,
      source: 'canvas'
    };
  }

  /**
   * Detect image format from MIME type
   */
  private static detectFormat(mimeType: string): ImageMetadata['format'] {
    const typeMap: Record<string, ImageMetadata['format']> = {
      'image/jpeg': 'jpeg',
      'image/jpg': 'jpeg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/bmp': 'bmp'
    };

    return typeMap[mimeType] || 'unknown';
  }

  /**
   * Check if the MediaProcessor is initialized
   */
  static isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the loaded WASM module (for testing)
   */
  static getModule(): WASMModule | undefined {
    return this.wasmModule;
  }

  /**
   * Reset the MediaProcessor (for testing)
   */
  static reset(): void {
    this.wasmModule = undefined;
    this.loadingPromise = undefined;
    this.initialized = false;
    this.forceError = false;
  }

  /**
   * Force WASM error (for testing)
   */
  static forceWASMError(force: boolean): void {
    this.forceError = force;
  }
}