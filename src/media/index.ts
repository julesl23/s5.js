import type { ImageMetadata, MediaOptions, InitializeOptions, WASMModule, ProcessingStrategy } from './types.js';
import { BrowserCompat } from './compat/browser.js';
import { WASMModule as WASMModuleImpl } from './wasm/module.js';
import { CanvasMetadataExtractor } from './fallback/canvas.js';

// Export BrowserCompat for external use
export { BrowserCompat };

/**
 * Main media processing class with lazy WASM loading
 */
export class MediaProcessor {
  private static wasmModule?: WASMModule;
  private static loadingPromise?: Promise<WASMModule>;
  private static initialized = false;
  private static processingStrategy?: ProcessingStrategy;

  /**
   * Initialize the MediaProcessor and load WASM module
   */
  static async initialize(options?: InitializeOptions): Promise<void> {
    if (this.initialized) return;

    // Detect browser capabilities and select processing strategy
    const capabilities = await BrowserCompat.checkCapabilities();
    this.processingStrategy = BrowserCompat.selectProcessingStrategy(capabilities);

    // Load WASM module if the strategy includes WASM
    const shouldLoadWASM = this.processingStrategy.includes('wasm');

    if (shouldLoadWASM) {
      if (!this.loadingPromise) {
        this.loadingPromise = this.loadWASM(options);
      }
      this.wasmModule = await this.loadingPromise;
    }

    this.initialized = true;
  }

  /**
   * Load the WASM module dynamically
   */
  private static async loadWASM(options?: InitializeOptions): Promise<WASMModule> {
    // Report initial progress
    options?.onProgress?.(0);

    try {
      // Load the real WASM module
      const wasmModule = await WASMModuleImpl.initialize(options);
      return wasmModule;
    } catch (error) {
      console.warn('Failed to load WASM module, creating fallback:', error);

      // Return a fallback that uses Canvas API
      return {
        async initialize() {
          // No-op for canvas fallback
        },
        extractMetadata(data: Uint8Array): ImageMetadata | undefined {
          // Convert Uint8Array to Blob for Canvas API
          // Try to detect format from magic bytes
          let mimeType = 'application/octet-stream';
          if (data.length >= 4) {
            if (data[0] === 0xFF && data[1] === 0xD8) {
              mimeType = 'image/jpeg';
            } else if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
              mimeType = 'image/png';
            } else if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
              mimeType = 'image/gif';
            } else if (data[0] === 0x42 && data[1] === 0x4D) {
              mimeType = 'image/bmp';
            } else if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
                       data.length > 11 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) {
              mimeType = 'image/webp';
            }
          }

          const blob = new Blob([data], { type: mimeType });

          // Use the async Canvas extractor synchronously (this is a limitation of the interface)
          // In a real scenario, this should be async, but the WASMModule interface expects sync
          return {
            width: 0,
            height: 0,
            format: MediaProcessor.detectFormat(mimeType),
            size: data.length,
            source: 'canvas',
            isValidImage: false,
            validationErrors: ['Canvas fallback in WASM context - async extraction not available']
          };
        },
        cleanup() {
          // No-op for canvas fallback
        }
      };
    }
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

    // Check if we should use WASM based on strategy and options
    // If useWASM is explicitly true, force WASM usage
    // Otherwise, use WASM only if the strategy includes it
    const useWASM = options?.useWASM === true ||
                    (options?.useWASM !== false && this.processingStrategy?.includes('wasm'));

    if (!useWASM) {
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
      // Fallback to basic extraction on error (silently unless it's a real error)
      if (!(error instanceof Error) || !error.message.includes('WASM module not available')) {
        console.warn('WASM extraction failed, falling back to canvas:', error);
      }
      return this.basicMetadataExtraction(blob);
    }
  }

  /**
   * Extract metadata using WASM
   */
  private static async extractWithWASM(blob: Blob): Promise<ImageMetadata | undefined> {
    // If WASM module not loaded, try to load it now
    if (!this.wasmModule) {
      // Try to load WASM on demand
      try {
        if (!this.loadingPromise) {
          this.loadingPromise = this.loadWASM();
        }
        this.wasmModule = await this.loadingPromise;
      } catch (error) {
        console.warn('Failed to load WASM on demand:', error);
        throw new Error('WASM module not available');
      }
    }

    // Check if it's actually an image
    if (!blob.type.startsWith('image/')) {
      return undefined;
    }

    const arrayBuffer = await blob.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const metadata = this.wasmModule.extractMetadata(data);

    // Ensure format matches blob type and add blob size
    if (metadata) {
      // Only override format if it's unknown
      if (!metadata.format || metadata.format === 'unknown') {
        metadata.format = this.detectFormat(blob.type);
      }
      if (metadata.format === 'png') {
        metadata.hasAlpha = true;
      }
      // Add the actual blob size
      metadata.size = blob.size;
    }

    return metadata;
  }

  /**
   * Basic metadata extraction fallback using Canvas API
   */
  private static async basicMetadataExtraction(
    blob: Blob
  ): Promise<ImageMetadata | undefined> {
    try {
      // Use the real Canvas metadata extractor
      return await CanvasMetadataExtractor.extract(blob);
    } catch (error) {
      console.warn('Canvas extraction failed:', error);

      // Final fallback - return basic info from blob
      const format = this.detectFormat(blob.type);

      if (format === 'unknown' && !blob.type.startsWith('image/')) {
        return undefined;
      }

      return {
        width: 0,
        height: 0,
        format,
        hasAlpha: format === 'png',
        size: blob.size,
        source: 'canvas',
        isValidImage: false,
        validationErrors: ['Failed to extract metadata']
      };
    }
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
   * Get the current processing strategy
   */
  static getProcessingStrategy(): ProcessingStrategy | undefined {
    return this.processingStrategy;
  }

  /**
   * Reset the MediaProcessor (for testing)
   */
  static reset(): void {
    this.wasmModule = undefined;
    this.loadingPromise = undefined;
    this.initialized = false;
    this.processingStrategy = undefined;
  }

}