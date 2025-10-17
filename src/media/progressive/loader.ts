import type { ImageFormat, ProgressiveLoadingOptions, ProgressiveLayer } from '../types.js';
import { ThumbnailGenerator } from '../thumbnail/generator.js';

/**
 * Abstract base class for progressive images
 */
abstract class ProgressiveImage {
  constructor(protected layers: ProgressiveLayer[]) {}

  /**
   * Get a specific layer by index
   */
  abstract getLayer(index: number): ProgressiveLayer | undefined;

  /**
   * Get the total number of layers
   */
  abstract get layerCount(): number;

  /**
   * Convert to final blob
   */
  abstract toBlob(): Blob;

  /**
   * Get all layers
   */
  getAllLayers(): ProgressiveLayer[] {
    return this.layers;
  }
}

/**
 * Progressive JPEG implementation with multiple scans
 */
class ProgressiveJPEG extends ProgressiveImage {
  getLayer(index: number): ProgressiveLayer | undefined {
    return this.layers[index];
  }

  get layerCount(): number {
    return this.layers.length;
  }

  toBlob(): Blob {
    // For progressive JPEG, we combine all layers for the final image
    // In a real implementation, this would be a properly encoded progressive JPEG
    // For now, we return the highest quality layer
    const bestLayer = this.layers[this.layers.length - 1];
    return new Blob([new Uint8Array(bestLayer.data)], { type: 'image/jpeg' });
  }
}

/**
 * Progressive PNG implementation with Adam7 interlacing
 */
class ProgressivePNG extends ProgressiveImage {
  getLayer(index: number): ProgressiveLayer | undefined {
    // PNG interlacing is handled internally as a single file
    return index === 0 ? this.layers[0] : undefined;
  }

  get layerCount(): number {
    return 1; // PNG progressive is a single interlaced file
  }

  toBlob(): Blob {
    return new Blob([new Uint8Array(this.layers[0].data)], { type: 'image/png' });
  }
}

/**
 * Progressive WebP implementation with multiple quality levels
 */
class ProgressiveWebP extends ProgressiveImage {
  getLayer(index: number): ProgressiveLayer | undefined {
    return this.layers[index];
  }

  get layerCount(): number {
    return this.layers.length;
  }

  toBlob(): Blob {
    // Return highest quality version
    const bestLayer = this.layers[this.layers.length - 1];
    return new Blob([new Uint8Array(bestLayer.data)], { type: 'image/webp' });
  }
}

/**
 * ProgressiveImageLoader creates progressive/interlaced images
 * for efficient loading in web applications
 */
export class ProgressiveImageLoader {
  /**
   * Create a progressive image from a blob
   */
  static async createProgressive(
    blob: Blob,
    options: ProgressiveLoadingOptions = {}
  ): Promise<ProgressiveImage> {
    // Validate blob
    if (blob.size === 0) {
      throw new Error('Empty blob');
    }

    // Detect format
    const format = await this.detectFormat(blob);

    // Route to appropriate handler based on format
    switch (format) {
      case 'jpeg':
        return this.createProgressiveJPEG(blob, options);
      case 'png':
        return this.createProgressivePNG(blob, options);
      case 'webp':
        return this.createProgressiveWebP(blob, options);
      default:
        throw new Error(`Unsupported format for progressive loading: ${format}`);
    }
  }

  /**
   * Create progressive JPEG with multiple quality scans
   */
  private static async createProgressiveJPEG(
    blob: Blob,
    options: ProgressiveLoadingOptions
  ): Promise<ProgressiveImage> {
    const scans = options.progressiveScans ?? 3;
    const qualityLevels = options.qualityLevels ?? [20, 50, 85];

    const layers: ProgressiveLayer[] = [];

    // Generate thumbnails at different quality levels to simulate progressive scans
    for (let i = 0; i < scans; i++) {
      const quality = qualityLevels[i] ?? 85; // Use default if not specified
      const isBaseline = i === 0;

      // Use ThumbnailGenerator to create different quality versions
      // Use very large dimensions to preserve original size
      const result = await ThumbnailGenerator.generateThumbnail(blob, {
        quality,
        format: 'jpeg',
        maxWidth: 10000,
        maxHeight: 10000,
      });

      const arrayBuffer = await result.blob.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      layers.push({
        data,
        quality,
        isBaseline,
        scanNumber: i,
      });
    }

    return new ProgressiveJPEG(layers);
  }

  /**
   * Create progressive PNG with Adam7 interlacing
   */
  private static async createProgressivePNG(
    blob: Blob,
    options: ProgressiveLoadingOptions
  ): Promise<ProgressiveImage> {
    const interlace = options.interlace ?? true;

    if (!interlace) {
      // Return non-interlaced PNG as single layer
      const arrayBuffer = await blob.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      return new ProgressivePNG([
        {
          data,
          quality: 100,
          isBaseline: true,
          scanNumber: 0,
        },
      ]);
    }

    // Create interlaced PNG
    // In a real implementation, this would use a PNG encoder with Adam7 interlacing
    // For now, we use the original blob data
    const arrayBuffer = await blob.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    return new ProgressivePNG([
      {
        data,
        quality: 100,
        isBaseline: true,
        scanNumber: 0,
      },
    ]);
  }

  /**
   * Create progressive WebP with multiple quality levels
   */
  private static async createProgressiveWebP(
    blob: Blob,
    options: ProgressiveLoadingOptions
  ): Promise<ProgressiveImage> {
    const qualityLevels = options.qualityLevels ?? [30, 60, 90];
    const layers: ProgressiveLayer[] = [];

    // Generate WebP versions at different quality levels
    for (let i = 0; i < qualityLevels.length; i++) {
      const quality = qualityLevels[i];

      const result = await ThumbnailGenerator.generateThumbnail(blob, {
        quality,
        format: 'webp',
        maxWidth: 10000,
        maxHeight: 10000,
      });

      const arrayBuffer = await result.blob.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      layers.push({
        data,
        quality,
        isBaseline: i === 0,
        scanNumber: i,
      });
    }

    return new ProgressiveWebP(layers);
  }

  /**
   * Detect image format from blob data
   */
  private static async detectFormat(blob: Blob): Promise<ImageFormat> {
    const arrayBuffer = await blob.arrayBuffer();
    const header = new Uint8Array(arrayBuffer).slice(0, 16);

    // JPEG: FF D8 FF
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      return 'jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47
    ) {
      return 'png';
    }

    // WebP: RIFF....WEBP
    if (
      header[0] === 0x52 &&
      header[1] === 0x49 &&
      header[2] === 0x46 &&
      header[3] === 0x46 &&
      header[8] === 0x57 &&
      header[9] === 0x45 &&
      header[10] === 0x42 &&
      header[11] === 0x50
    ) {
      return 'webp';
    }

    return 'unknown';
  }
}
