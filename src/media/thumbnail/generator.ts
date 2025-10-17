import type { ThumbnailOptions, ThumbnailResult } from '../types.js';
import { BrowserCompat } from '../compat/browser.js';

/**
 * Sobel operators for edge detection
 */
const SOBEL_X = [
  [-1, 0, 1],
  [-2, 0, 2],
  [-1, 0, 1],
];

const SOBEL_Y = [
  [-1, -2, -1],
  [0, 0, 0],
  [1, 2, 1],
];

/**
 * ThumbnailGenerator provides high-quality thumbnail generation
 * with multiple processing strategies and smart features
 */
export class ThumbnailGenerator {
  /**
   * Generate a thumbnail from an image blob
   */
  static async generateThumbnail(
    blob: Blob,
    options: ThumbnailOptions = {}
  ): Promise<ThumbnailResult> {
    const startTime = performance.now();

    // Apply defaults
    const opts: Required<ThumbnailOptions> = {
      maxWidth: options.maxWidth ?? 256,
      maxHeight: options.maxHeight ?? 256,
      quality: options.quality ?? 85,
      format: options.format ?? 'jpeg',
      maintainAspectRatio: options.maintainAspectRatio ?? true,
      smartCrop: options.smartCrop ?? false,
      progressive: options.progressive ?? true,
      targetSize: options.targetSize ?? 0,
    };

    // Check browser capabilities
    const caps = await BrowserCompat.checkCapabilities();
    const strategy = BrowserCompat.selectProcessingStrategy(caps);

    // For now, use Canvas-based generation (WASM support to be added later)
    let result = await this.generateWithCanvas(blob, opts);

    // Optimize to target size if specified
    if (opts.targetSize && result.blob.size > opts.targetSize) {
      result = await this.optimizeToTargetSize(result, opts);
    }

    result.processingTime = performance.now() - startTime;

    return result;
  }

  /**
   * Generate thumbnail using Canvas API
   */
  private static async generateWithCanvas(
    blob: Blob,
    options: Required<ThumbnailOptions>
  ): Promise<ThumbnailResult> {
    return new Promise((resolve, reject) => {
      // Validate blob type
      if (!blob.type.startsWith('image/')) {
        reject(new Error('Invalid blob type: must be an image'));
        return;
      }

      if (blob.size === 0) {
        reject(new Error('Empty blob'));
        return;
      }

      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = async () => {
        URL.revokeObjectURL(url);

        try {
          // Calculate dimensions
          const { width, height } = this.calculateDimensions(
            img.width,
            img.height,
            options.maxWidth,
            options.maxHeight,
            options.maintainAspectRatio
          );

          // Create canvas
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d', {
            alpha: options.format === 'png',
          });

          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          // Apply image smoothing for better quality
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Determine source rectangle for cropping
          let sx = 0;
          let sy = 0;
          let sw = img.width;
          let sh = img.height;

          if (options.smartCrop && !options.maintainAspectRatio) {
            const crop = await this.calculateSmartCrop(img, width, height);
            ({ sx, sy, sw, sh } = crop);
          }

          // Draw image
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);

          // Convert to blob
          const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Failed to create blob'));
              },
              `image/${options.format}`,
              options.quality / 100
            );
          });

          resolve({
            blob: thumbnailBlob,
            width,
            height,
            format: options.format,
            quality: options.quality,
            processingTime: 0, // Will be set by caller
          });
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  }

  /**
   * Calculate thumbnail dimensions maintaining aspect ratio if requested
   */
  private static calculateDimensions(
    srcWidth: number,
    srcHeight: number,
    maxWidth: number,
    maxHeight: number,
    maintainAspectRatio: boolean
  ): { width: number; height: number } {
    if (!maintainAspectRatio) {
      return { width: maxWidth, height: maxHeight };
    }

    const aspectRatio = srcWidth / srcHeight;
    let width = maxWidth;
    let height = maxHeight;

    if (width / height > aspectRatio) {
      width = height * aspectRatio;
    } else {
      height = width / aspectRatio;
    }

    return {
      width: Math.round(width),
      height: Math.round(height),
    };
  }

  /**
   * Calculate smart crop region using edge detection
   */
  private static async calculateSmartCrop(
    img: HTMLImageElement,
    targetWidth: number,
    targetHeight: number
  ): Promise<{ sx: number; sy: number; sw: number; sh: number }> {
    // Sample the image at lower resolution for performance
    const sampleSize = 100;
    const canvas = document.createElement('canvas');
    canvas.width = sampleSize;
    canvas.height = sampleSize;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // Fallback to center crop
      return this.centerCrop(img.width, img.height, targetWidth, targetHeight);
    }

    ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
    const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);

    // Calculate energy map using edge detection
    const energyMap = this.calculateEnergyMap(imageData);

    // Find region with highest energy
    const targetAspect = targetWidth / targetHeight;
    const region = this.findBestRegion(energyMap, sampleSize, targetAspect);

    // Scale back to original dimensions
    const scale = img.width / sampleSize;

    return {
      sx: region.x * scale,
      sy: region.y * scale,
      sw: region.width * scale,
      sh: region.height * scale,
    };
  }

  /**
   * Calculate center crop (fallback for smart crop)
   */
  private static centerCrop(
    srcWidth: number,
    srcHeight: number,
    targetWidth: number,
    targetHeight: number
  ): { sx: number; sy: number; sw: number; sh: number } {
    const targetAspect = targetWidth / targetHeight;
    const srcAspect = srcWidth / srcHeight;

    let sw = srcWidth;
    let sh = srcHeight;
    let sx = 0;
    let sy = 0;

    if (srcAspect > targetAspect) {
      // Source is wider - crop horizontally
      sw = srcHeight * targetAspect;
      sx = (srcWidth - sw) / 2;
    } else {
      // Source is taller - crop vertically
      sh = srcWidth / targetAspect;
      sy = (srcHeight - sh) / 2;
    }

    return { sx, sy, sw, sh };
  }

  /**
   * Calculate energy map using Sobel edge detection
   */
  private static calculateEnergyMap(imageData: ImageData): Float32Array {
    const { width, height, data } = imageData;
    const energy = new Float32Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        // Calculate gradients using Sobel operators
        let gx = 0;
        let gy = 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nIdx = (y + dy) * width + (x + dx);
            const pixel = data[nIdx * 4]; // Use red channel

            gx += pixel * SOBEL_X[dy + 1][dx + 1];
            gy += pixel * SOBEL_Y[dy + 1][dx + 1];
          }
        }

        energy[idx] = Math.sqrt(gx * gx + gy * gy);
      }
    }

    return energy;
  }

  /**
   * Find region with highest energy (most interesting content)
   */
  private static findBestRegion(
    energyMap: Float32Array,
    size: number,
    targetAspect: number
  ): { x: number; y: number; width: number; height: number } {
    let bestRegion = { x: 0, y: 0, width: size, height: size };
    let maxEnergy = -Infinity;

    // Try different region sizes (50% to 100% of image)
    for (let heightRatio = 0.5; heightRatio <= 1.0; heightRatio += 0.1) {
      const h = Math.floor(size * heightRatio);
      const w = Math.floor(h * targetAspect);

      if (w > size) continue;

      // Slide window across image
      const stepSize = Math.max(1, Math.floor(size * 0.05));
      for (let y = 0; y <= size - h; y += stepSize) {
        for (let x = 0; x <= size - w; x += stepSize) {
          // Calculate total energy in region
          let energy = 0;
          for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
              const idx = (y + dy) * size + (x + dx);
              energy += energyMap[idx] || 0;
            }
          }

          if (energy > maxEnergy) {
            maxEnergy = energy;
            bestRegion = { x, y, width: w, height: h };
          }
        }
      }
    }

    return bestRegion;
  }

  /**
   * Optimize thumbnail to meet target size by adjusting quality
   */
  private static async optimizeToTargetSize(
    result: ThumbnailResult,
    options: Required<ThumbnailOptions>
  ): Promise<ThumbnailResult> {
    let quality = result.quality;
    let blob = result.blob;

    // Binary search for optimal quality
    let minQuality = 10;
    let maxQuality = quality;

    while (maxQuality - minQuality > 5) {
      const midQuality = Math.floor((minQuality + maxQuality) / 2);

      // Re-encode with new quality
      const tempBlob = await this.reencodeWithQuality(
        blob,
        midQuality,
        options.format
      );

      if (tempBlob.size <= options.targetSize) {
        minQuality = midQuality;
        blob = tempBlob;
        quality = midQuality;
      } else {
        maxQuality = midQuality;
      }
    }

    return {
      ...result,
      blob,
      quality,
    };
  }

  /**
   * Re-encode blob with specified quality
   */
  private static async reencodeWithQuality(
    blob: Blob,
    quality: number,
    format: string
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to re-encode'));
          },
          `image/${format}`,
          quality / 100
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image for re-encoding'));
      };

      img.src = url;
    });
  }
}
