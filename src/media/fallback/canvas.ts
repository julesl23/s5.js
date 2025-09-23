import type { ImageMetadata } from '../types.js';

/**
 * Canvas-based fallback for metadata extraction
 * Works in browsers without WASM support
 */
export class CanvasMetadataExtractor {
  /**
   * Extract metadata from an image blob using Canvas API
   */
  static async extract(blob: Blob): Promise<ImageMetadata | undefined> {
    // Check if it's likely an image
    const format = this.detectFormat(blob.type);

    if (!blob.type.startsWith('image/') && format === 'unknown') {
      return undefined;
    }

    // Try to load the image to get dimensions
    try {
      const dimensions = await this.getImageDimensions(blob);

      return {
        width: dimensions.width,
        height: dimensions.height,
        format,
        hasAlpha: this.hasTransparency(format),
        size: blob.size,
        source: 'canvas'
      };
    } catch (error) {
      // If image loading fails, return basic metadata
      console.warn('Failed to load image for metadata extraction:', error);

      return {
        width: 0,
        height: 0,
        format,
        hasAlpha: this.hasTransparency(format),
        size: blob.size,
        source: 'canvas'
      };
    }
  }

  /**
   * Get image dimensions using the Image API
   */
  private static async getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({
          width: img.width,
          height: img.height
        });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  }

  /**
   * Detect image format from MIME type
   */
  static detectFormat(mimeType: string): ImageMetadata['format'] {
    const typeMap: Record<string, ImageMetadata['format']> = {
      'image/jpeg': 'jpeg',
      'image/jpg': 'jpeg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/bmp': 'bmp',
      'image/bitmap': 'bmp',
      'image/x-bmp': 'bmp',
      'image/x-ms-bmp': 'bmp'
    };

    return typeMap[mimeType.toLowerCase()] || 'unknown';
  }

  /**
   * Check if a format typically supports transparency
   */
  static hasTransparency(format: ImageMetadata['format']): boolean {
    return format === 'png' || format === 'webp' || format === 'gif';
  }

  /**
   * Advanced metadata extraction using Canvas (if needed in future)
   */
  static async extractAdvanced(blob: Blob): Promise<ImageMetadata | undefined> {
    const basicMetadata = await this.extract(blob);

    if (!basicMetadata) {
      return undefined;
    }

    // In the future, we could use Canvas to analyze the image data
    // For example:
    // - Detect if PNG actually uses transparency
    // - Extract color profile information
    // - Analyze image content for optimization hints

    return basicMetadata;
  }

  /**
   * Check Canvas API availability
   */
  static isAvailable(): boolean {
    // Check for Image constructor
    if (typeof Image === 'undefined') {
      return false;
    }

    // Check for URL.createObjectURL
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return false;
    }

    // Check for Canvas element (for future advanced features)
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        return ctx !== null;
      } catch {
        return false;
      }
    }

    // In Node.js environment, we have basic Image support
    return true;
  }
}