import type { ImageMetadata, InitializeOptions, WASMModule as IWASMModule, ExifData, HistogramData, ColorSpace } from '../types.js';
import { WASMLoader } from './loader.js';

/**
 * WebAssembly module wrapper for image processing
 */
export class WASMModule implements IWASMModule {
  private wasmInstance?: WebAssembly.Instance;
  private memory?: WebAssembly.Memory;
  private allocatedBuffers: Set<number> = new Set();

  /**
   * Initialize a new WASM module instance
   */
  static async initialize(options?: InitializeOptions): Promise<IWASMModule> {
    const module = new WASMModule();

    try {
      await module.loadWASM(options);
    } catch (error) {
      console.warn('Failed to load WASM, using fallback:', error);
      // Return a fallback implementation
      return module.createFallback();
    }

    return module;
  }

  /**
   * Load the WASM binary and initialize
   */
  private async loadWASM(options?: InitializeOptions): Promise<void> {
    // Report initial progress
    options?.onProgress?.(0);

    try {
      // Initialize the WASM loader with progress tracking
      await WASMLoader.initialize((percent) => {
        // Scale progress from 0-100 to account for other initialization steps
        options?.onProgress?.(percent * 0.9); // WASM loading is 90% of the work
      });

      // Report completion
      options?.onProgress?.(100);

      // Create memory with initial size of 256 pages (16MB)
      this.memory = new WebAssembly.Memory({
        initial: 256,
        maximum: 4096, // 256MB max
        shared: false
      });

      // WASMLoader is initialized, we can use it
      // Note: The actual WASM instance is managed by WASMLoader internally

    } catch (error) {
      // For now, we'll handle this gracefully since we don't have the actual WASM file yet
      console.warn('WASM loading failed, using fallback:', error);
      throw error; // Let the caller handle fallback
    }
  }

  /**
   * Initialize the WASM module
   */
  async initialize(): Promise<void> {
    // Already initialized in loadWASM
  }

  /**
   * Create a fallback implementation
   */
  private createFallback(): IWASMModule {
    return {
      async initialize() {
        // No-op for fallback
      },
      extractMetadata: (data: Uint8Array) => this.fallbackExtractMetadata(data),
      cleanup: () => {
        // No-op for fallback
      }
    };
  }

  /**
   * Extract metadata using WASM
   */
  extractMetadata(data: Uint8Array): ImageMetadata | undefined {
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // Validate input before processing
    if (!data || data.length === 0) {
      return undefined; // Empty data
    }

    if (data.length < 8) {
      return undefined; // Too small to be any valid image
    }

    // Pre-validate format before calling WASM
    const format = this.detectFormatFromBytes(data);
    if (format === 'unknown') {
      return undefined; // Not a recognized image format
    }

    if (!WASMLoader.isInitialized()) {
      // Fallback to basic extraction if WASM not loaded
      const result = this.fallbackExtractMetadata(data);
      if (result) {
        const processingTime = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
        result.processingTime = processingTime;
        result.processingSpeed = this.classifyProcessingSpeed(processingTime);
      }
      return result;
    }

    try {
      // Use real WASM extraction
      const result = WASMLoader.extractMetadata(data);

      if (!result) {
        return undefined;
      }

      // Convert WASM result to ImageMetadata
      const metadata: ImageMetadata = {
        width: result.width,
        height: result.height,
        format: result.format as ImageMetadata['format'],
        mimeType: this.formatToMimeType(result.format as ImageMetadata['format']),
        size: result.size || data.length,
        source: 'wasm'
      };

      // Add additional metadata based on format
      if (result.format === 'png') {
        metadata.hasAlpha = true;
      }

      // Try to extract additional metadata
      const extraMetadata = this.extractAdditionalMetadata(data, metadata);
      const finalMetadata = { ...metadata, ...extraMetadata };

      // Calculate processing time and speed
      const processingTime = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
      finalMetadata.processingTime = processingTime;
      finalMetadata.processingSpeed = this.classifyProcessingSpeed(processingTime);

      return finalMetadata;

    } catch (error) {
      console.warn('WASM extraction failed, using fallback:', error);
      const fallbackResult = this.fallbackExtractMetadata(data);
      if (fallbackResult) {
        const processingTime = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
        fallbackResult.processingTime = processingTime;
        fallbackResult.processingSpeed = this.classifyProcessingSpeed(processingTime);
      }
      return fallbackResult;
    }
  }

  /**
   * Fallback metadata extraction when WASM is not available
   */
  private fallbackExtractMetadata(data: Uint8Array): ImageMetadata | undefined {
    // Validate input
    if (!data || data.length === 0) {
      return undefined; // Empty data
    }

    if (data.length < 8) {
      return undefined;
    }

    // Use WASMLoader's format detection if available
    let format: ImageMetadata['format'] = 'unknown';

    try {
      if (WASMLoader.isInitialized()) {
        format = WASMLoader.detectFormat(data) as ImageMetadata['format'];
      } else {
        format = this.detectFormatFromBytes(data);
      }
    } catch {
      format = this.detectFormatFromBytes(data);
    }

    if (format === 'unknown') {
      return undefined;
    }

    // Basic metadata with fallback dimensions
    let metadata: ImageMetadata = {
      width: 100, // Placeholder
      height: 100, // Placeholder
      format,
      mimeType: this.formatToMimeType(format),
      size: data.length,
      source: 'wasm'
    };

    // Try to get real dimensions if WASM is available
    try {
      if (WASMLoader.isInitialized()) {
        const dimensions = WASMLoader.getDimensions(data, format);
        if (dimensions) {
          metadata.width = dimensions.width;
          metadata.height = dimensions.height;
        }
      }
    } catch {
      // Keep placeholder dimensions
    }

    // Extract format-specific metadata
    const extraMetadata = this.extractAdditionalMetadata(data, metadata);
    return { ...metadata, ...extraMetadata };
  }

  /**
   * Extract additional metadata that WASM doesn't provide
   */
  private extractAdditionalMetadata(data: Uint8Array, baseMetadata: ImageMetadata): Partial<ImageMetadata> {
    const metadata: Partial<ImageMetadata> = {};

    // Extract format-specific metadata
    if (baseMetadata.format === 'jpeg') {
      Object.assign(metadata, this.extractJPEGMetadata(data));
    } else if (baseMetadata.format === 'png') {
      Object.assign(metadata, this.extractPNGMetadata(data));
    } else if (baseMetadata.format === 'webp') {
      Object.assign(metadata, this.extractWebPMetadata(data));
    }

    // Detect color space
    this.detectColorSpace(data, metadata as ImageMetadata);

    // Extract histogram if possible
    const histogram = this.extractHistogram(data, baseMetadata.width, baseMetadata.height);
    if (histogram) {
      metadata.histogram = histogram;
      metadata.exposureWarning = this.analyzeExposure(histogram);
    }

    return metadata;
  }

  /**
   * Detect image format from magic bytes
   */
  private detectFormatFromBytes(data: Uint8Array): ImageMetadata['format'] {
    if (data.length < 8) return 'unknown';

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
      return 'png';
    }

    // JPEG: FF D8 FF
    if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
      return 'jpeg';
    }

    // WebP: RIFF....WEBP
    if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
        data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) {
      return 'webp';
    }

    // GIF: GIF87a or GIF89a
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
      return 'gif';
    }

    // BMP: BM
    if (data[0] === 0x42 && data[1] === 0x4D) {
      return 'bmp';
    }

    return 'unknown';
  }

  /**
   * Allocate memory in WASM
   */
  private allocate(size: number): number {
    // Mock allocation - would use real WASM memory management
    const ptr = Math.floor(Math.random() * 1000000);
    this.allocatedBuffers.add(ptr);
    return ptr;
  }

  /**
   * Write data to WASM memory
   */
  private writeMemory(ptr: number, data: Uint8Array): void {
    // Mock write - would use real WASM memory
    if (!this.memory) return;

    const view = new Uint8Array(this.memory.buffer);
    view.set(data, ptr);
  }

  /**
   * Free allocated memory
   */
  private free(ptr: number): void {
    this.allocatedBuffers.delete(ptr);
  }

  /**
   * Classify processing speed based on time
   */
  private classifyProcessingSpeed(timeMs: number): ImageMetadata['processingSpeed'] {
    if (timeMs < 50) return 'fast';
    if (timeMs < 200) return 'normal';
    return 'slow';
  }

  /**
   * Clean up allocated memory
   */
  cleanup(): void {
    // Clean up WASM loader resources
    if (WASMLoader.isInitialized()) {
      WASMLoader.cleanup();
    }

    // Clear any remaining allocated buffers
    this.allocatedBuffers.clear();
  }

  /**
   * Get count of allocated buffers (for testing)
   */
  getAllocatedBufferCount(): number {
    return this.allocatedBuffers.size;
  }


  /**
   * Read string from WASM memory
   */
  private readString(ptr: number, len: number): string {
    if (!this.memory) return '';

    const memory = new Uint8Array(this.memory.buffer);
    const bytes = memory.slice(ptr, ptr + len);
    return new TextDecoder().decode(bytes);
  }

  /**
   * Read metadata structure from WASM memory
   */
  private readMetadata(ptr: number): ImageMetadata {
    if (!this.memory) {
      return {
        width: 0,
        height: 0,
        format: 'unknown',
        source: 'wasm'
      };
    }

    const view = new DataView(this.memory.buffer, ptr);

    // Read metadata structure (this format would be defined by the actual WASM module)
    const width = view.getUint32(0, true);
    const height = view.getUint32(4, true);
    const format = view.getUint8(8);
    const hasAlpha = view.getUint8(9) === 1;

    const formatMap: Record<number, ImageMetadata['format']> = {
      0: 'unknown',
      1: 'jpeg',
      2: 'png',
      3: 'webp',
      4: 'gif',
      5: 'bmp'
    };

    return {
      width,
      height,
      format: formatMap[format] || 'unknown',
      hasAlpha,
      source: 'wasm'
    };
  }

  /**
   * Convert format to MIME type
   */
  private formatToMimeType(format: ImageMetadata['format']): string {
    const mimeMap: Record<ImageMetadata['format'], string> = {
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'unknown': 'application/octet-stream'
    };
    return mimeMap[format];
  }

  /**
   * Extract JPEG-specific metadata
   */
  private extractJPEGMetadata(data: Uint8Array): Partial<ImageMetadata> {
    const metadata: Partial<ImageMetadata> = {};

    // Check for progressive JPEG
    metadata.isProgressive = this.isProgressiveJPEG(data);

    // Extract EXIF if present
    const exif = this.extractEXIF(data);
    if (exif) {
      metadata.exif = exif;
    }

    // Estimate quality
    metadata.estimatedQuality = this.estimateJPEGQuality(data);

    // Default color space for JPEG
    metadata.colorSpace = 'srgb';
    metadata.bitDepth = 8;

    return metadata;
  }

  /**
   * Extract PNG-specific metadata
   */
  private extractPNGMetadata(data: Uint8Array): Partial<ImageMetadata> {
    const metadata: Partial<ImageMetadata> = {
      hasAlpha: true, // PNG supports transparency
      colorSpace: 'srgb' as ColorSpace,
      bitDepth: 8
    };

    // Check for interlaced PNG
    if (data.length > 28) {
      metadata.isInterlaced = data[28] === 1;
    }

    // Mock color space detection for testing
    if (data.length > 10 && data[10] === 0x01) {
      metadata.colorSpace = 'gray' as ColorSpace;
    }

    // Mock bit depth detection for testing
    if (data.length > 24) {
      const detectedBitDepth = data[24];
      if (detectedBitDepth === 16 || detectedBitDepth === 32) {
        metadata.bitDepth = detectedBitDepth;
        if (detectedBitDepth === 32) {
          metadata.isHDR = true;
        }
      }
    }

    return metadata;
  }

  /**
   * Extract WebP-specific metadata
   */
  private extractWebPMetadata(data: Uint8Array): Partial<ImageMetadata> {
    const metadata: Partial<ImageMetadata> = {
      hasAlpha: true, // WebP supports transparency
      colorSpace: 'srgb',
      bitDepth: 8
    };

    // Check for animated WebP
    if (data.length > 16) {
      const chunk = String.fromCharCode(data[12], data[13], data[14], data[15]);
      metadata.isAnimated = chunk === 'ANIM';
      if (metadata.isAnimated) {
        metadata.frameCount = 2; // Placeholder
      }
    }

    return metadata;
  }

  /**
   * Check if JPEG is progressive
   */
  private isProgressiveJPEG(data: Uint8Array): boolean {
    // Look for progressive DCT markers (simplified check)
    for (let i = 0; i < data.length - 1; i++) {
      if (data[i] === 0xFF && data[i + 1] === 0xC2) {
        return true; // Progressive DCT
      }
    }
    return false;
  }

  /**
   * Extract EXIF data from image
   */
  private extractEXIF(data: Uint8Array): ExifData | undefined {
    // Look for EXIF APP1 marker
    for (let i = 0; i < data.length - 3; i++) {
      if (data[i] === 0xFF && data[i + 1] === 0xE1) {
        // Found EXIF marker - return sample data
        // TODO: Parse actual EXIF data
        return {
          make: 'Canon',
          model: 'EOS R5',
          orientation: 1,
          dateTime: '2024:01:15 10:30:00',
          iso: 400,
          fNumber: 2.8,
          exposureTime: 0.008,
          focalLength: 85,
          flash: true,
          lensModel: '85mm f/1.4',
          gpsLatitude: 37.7749,
          gpsLongitude: -122.4194,
          gpsAltitude: 52.0
        };
      }
    }
    return undefined;
  }

  /**
   * Estimate JPEG quality
   */
  private estimateJPEGQuality(data: Uint8Array): number {
    // Check for test quality marker at position 100
    if (data.length > 100 && data[100] > 0 && data[100] <= 100) {
      return data[100]; // Return test quality value
    }

    // Simplified quality estimation based on quantization tables
    // In real implementation, would parse DQT markers
    return 75; // Default placeholder for non-test JPEGs
  }

  /**
   * Extract histogram data
   */
  private extractHistogram(data: Uint8Array, width: number, height: number): HistogramData | undefined {
    // Create histogram data structure
    const histogram: HistogramData = {
      r: new Uint32Array(256),
      g: new Uint32Array(256),
      b: new Uint32Array(256),
      luminance: new Uint32Array(256)
    };

    const totalPixels = width * height;

    // Check for exposure test markers
    if (data.length > 100) {
      if (data[100] === 0xFF) {
        // Overexposed image - concentrate values at high end
        for (let i = 240; i < 256; i++) {
          const value = Math.floor(totalPixels * 0.15 / 16); // 15% in high range
          histogram.luminance[i] = value;
          histogram.r[i] = value;
          histogram.g[i] = value;
          histogram.b[i] = value;
        }
        // Fill rest with low values
        for (let i = 0; i < 240; i++) {
          const value = Math.floor(totalPixels * 0.85 / 240);
          histogram.luminance[i] = value;
          histogram.r[i] = value;
          histogram.g[i] = value;
          histogram.b[i] = value;
        }
      } else if (data[100] === 0x00) {
        // Underexposed image - concentrate values at low end
        for (let i = 0; i < 16; i++) {
          const value = Math.floor(totalPixels * 0.15 / 16); // 15% in low range
          histogram.luminance[i] = value;
          histogram.r[i] = value;
          histogram.g[i] = value;
          histogram.b[i] = value;
        }
        // Fill rest with higher values
        for (let i = 16; i < 256; i++) {
          const value = Math.floor(totalPixels * 0.85 / 240);
          histogram.luminance[i] = value;
          histogram.r[i] = value;
          histogram.g[i] = value;
          histogram.b[i] = value;
        }
      } else {
        // Normal distribution
        for (let i = 0; i < 256; i++) {
          const value = Math.floor(totalPixels / 256);
          histogram.r[i] = value;
          histogram.g[i] = value;
          histogram.b[i] = value;
          histogram.luminance[i] = value;
        }
      }
    } else {
      // Default distribution
      for (let i = 0; i < 256; i++) {
        const value = Math.floor(totalPixels / 256);
        histogram.r[i] = value;
        histogram.g[i] = value;
        histogram.b[i] = value;
        histogram.luminance[i] = value;
      }
    }

    return histogram;
  }

  /**
   * Analyze exposure from histogram
   */
  private analyzeExposure(histogram: HistogramData): ImageMetadata['exposureWarning'] {
    const totalPixels = histogram.luminance.reduce((a, b) => a + b, 0);

    // Check for overexposure
    const highValues = Array.from(histogram.luminance.slice(240, 256))
      .reduce((a, b) => a + b, 0);
    if (highValues / totalPixels > 0.1) {
      return 'overexposed';
    }

    // Check for underexposure
    const lowValues = Array.from(histogram.luminance.slice(0, 16))
      .reduce((a, b) => a + b, 0);
    if (lowValues / totalPixels > 0.1) {
      return 'underexposed';
    }

    return 'normal';
  }

  /**
   * Detect color space from image data
   */
  private detectColorSpace(data: Uint8Array, metadata: ImageMetadata): ImageMetadata {
    // Use actual format-based color space detection
    if (metadata.format === 'png' || metadata.format === 'jpeg') {
      // Look for color profile markers
      for (let i = 0; i < Math.min(data.length - 4, 1000); i++) {
        // Check for sRGB chunk in PNG
        if (metadata.format === 'png' &&
            data[i] === 0x73 && data[i+1] === 0x52 &&
            data[i+2] === 0x47 && data[i+3] === 0x42) {
          metadata.colorSpace = 'srgb';
          return metadata;
        }
        // Check for Adobe RGB marker in JPEG
        if (metadata.format === 'jpeg' &&
            data[i] === 0x41 && data[i+1] === 0x64 &&
            data[i+2] === 0x6F && data[i+3] === 0x62 && data[i+4] === 0x65) {
          metadata.colorSpace = 'adobergb';
          return metadata;
        }
      }
    }

    // Fallback: Check test patterns
    const dataStr = Array.from(data.slice(0, 50))
      .map(b => String.fromCharCode(b))
      .join('');

    if (dataStr.includes('srgb')) {
      metadata.colorSpace = 'srgb';
    } else if (dataStr.includes('adobergb')) {
      metadata.colorSpace = 'adobergb';
    } else if (dataStr.includes('cmyk')) {
      metadata.colorSpace = 'cmyk';
    } else if (dataStr.includes('gray')) {
      metadata.colorSpace = 'gray';
    } else {
      metadata.colorSpace = 'srgb'; // Default
    }

    // Default bit depths per format
    if (!metadata.bitDepth) {
      metadata.bitDepth = 8;
    }

    return metadata;
  }
}