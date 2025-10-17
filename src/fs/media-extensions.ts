import type { FS5 } from './fs5.js';
import type {
  PutImageOptions,
  ImageReference,
  GetThumbnailOptions,
  ImageUpload,
  CreateImageGalleryOptions,
  GalleryManifest,
  GalleryManifestEntry
} from './media-types.js';
import type { ImageMetadata } from '../media/types.js';
import { MediaProcessor } from '../media/index.js';
import { ThumbnailGenerator } from '../media/thumbnail/generator.js';

/**
 * Media extensions for FS5
 * These methods integrate media processing with the file system
 */
export class FS5MediaExtensions {
  constructor(private fs5: FS5) {}

  /**
   * Upload an image with automatic metadata extraction and thumbnail generation
   */
  async putImage(
    path: string,
    blob: Blob,
    options: PutImageOptions = {}
  ): Promise<ImageReference> {
    const {
      generateThumbnail = true,
      thumbnailOptions = {},
      extractMetadata = true,
      progressive = false,
      progressiveOptions,
      ...putOptions
    } = options;

    // Extract metadata if requested
    let metadata: ImageMetadata | undefined;
    if (extractMetadata) {
      metadata = await MediaProcessor.extractMetadata(blob);
    }

    // Upload the original image
    const arrayBuffer = await blob.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    await this.fs5.put(path, data, {
      ...putOptions,
      mediaType: blob.type
    });

    const result: ImageReference = {
      path,
      metadata
    };

    // Generate and upload thumbnail if requested
    if (generateThumbnail) {
      const thumbnailPath = this.getThumbnailPath(path);

      try {
        const thumbnailResult = await ThumbnailGenerator.generateThumbnail(blob, {
          maxWidth: 256,
          maxHeight: 256,
          quality: 85,
          format: 'jpeg',
          ...thumbnailOptions
        });

        const thumbnailBuffer = await thumbnailResult.blob.arrayBuffer();
        const thumbnailData = new Uint8Array(thumbnailBuffer);

        await this.fs5.put(thumbnailPath, thumbnailData, {
          mediaType: thumbnailResult.blob.type
        });

        result.thumbnailPath = thumbnailPath;
      } catch (error) {
        // Thumbnail generation failed, but original upload succeeded
        console.warn('Thumbnail generation failed:', error);
      }
    }

    return result;
  }

  /**
   * Get a thumbnail for an image, generating on-demand if needed
   */
  async getThumbnail(
    path: string,
    options: GetThumbnailOptions = {}
  ): Promise<Blob> {
    const { thumbnailOptions = {}, cache = true } = options;

    // Check for pre-generated thumbnail
    const thumbnailPath = this.getThumbnailPath(path);
    let thumbnailData: Uint8Array | string | undefined;

    try {
      thumbnailData = await this.fs5.get(thumbnailPath);
    } catch (error) {
      // Thumbnail directory might not exist yet, which is fine
      thumbnailData = undefined;
    }

    if (thumbnailData) {
      // Found existing thumbnail
      const metadata = await this.fs5.getMetadata(thumbnailPath);
      const mimeType = metadata?.mediaType || 'image/jpeg';
      return new Blob([new Uint8Array(thumbnailData as Uint8Array)], { type: mimeType });
    }

    // No thumbnail exists, generate on-demand
    const imageData = await this.fs5.get(path);
    if (!imageData) {
      throw new Error(`Image not found: ${path}`);
    }

    const metadata = await this.fs5.getMetadata(path);
    const mimeType = metadata?.mediaType;

    if (!mimeType || !mimeType.startsWith('image/')) {
      throw new Error(`File is not an image: ${path}`);
    }

    const blob = new Blob([new Uint8Array(imageData as Uint8Array)], { type: mimeType });

    const thumbnailResult = await ThumbnailGenerator.generateThumbnail(blob, {
      maxWidth: 256,
      maxHeight: 256,
      quality: 85,
      format: 'jpeg',
      ...thumbnailOptions
    });

    // Cache the generated thumbnail if requested
    if (cache) {
      const thumbnailBuffer = await thumbnailResult.blob.arrayBuffer();
      const thumbnailDataArr = new Uint8Array(thumbnailBuffer);

      try {
        await this.fs5.put(thumbnailPath, thumbnailDataArr, {
          mediaType: thumbnailResult.blob.type
        });
      } catch (error) {
        // Cache write failed, but we still have the thumbnail
        console.warn('Failed to cache thumbnail:', error);
      }
    }

    return thumbnailResult.blob;
  }

  /**
   * Get metadata for an image
   */
  async getImageMetadata(path: string): Promise<ImageMetadata> {
    // Get the image data
    const imageData = await this.fs5.get(path);
    if (!imageData) {
      throw new Error(`Image not found: ${path}`);
    }

    const metadata = await this.fs5.getMetadata(path);
    const mimeType = metadata?.mediaType;

    if (!mimeType || !mimeType.startsWith('image/')) {
      throw new Error(`File is not an image: ${path}`);
    }

    const blob = new Blob([new Uint8Array(imageData as Uint8Array)], { type: mimeType });

    return await MediaProcessor.extractMetadata(blob) as ImageMetadata;
  }

  /**
   * Create an image gallery by uploading multiple images
   */
  async createImageGallery(
    galleryPath: string,
    images: ImageUpload[],
    options: CreateImageGalleryOptions = {}
  ): Promise<ImageReference[]> {
    const {
      concurrency = 4,
      generateThumbnails = true,
      thumbnailOptions = {},
      onProgress,
      createManifest = true
    } = options;

    if (images.length === 0) {
      return [];
    }

    const results: ImageReference[] = [];
    let completed = 0;

    // Process images in batches based on concurrency
    for (let i = 0; i < images.length; i += concurrency) {
      const batch = images.slice(i, i + concurrency);

      const batchResults = await Promise.all(
        batch.map(async (image) => {
          const imagePath = `${galleryPath}/${image.name}`;

          const result = await this.putImage(imagePath, image.blob, {
            generateThumbnail: generateThumbnails,
            thumbnailOptions,
            extractMetadata: true
          });

          // Merge any provided metadata
          if (image.metadata && result.metadata) {
            result.metadata = {
              ...result.metadata,
              ...image.metadata
            } as ImageMetadata;
          } else if (image.metadata) {
            result.metadata = image.metadata as ImageMetadata;
          }

          completed++;
          if (onProgress) {
            onProgress(completed, images.length);
          }

          return result;
        })
      );

      results.push(...batchResults);
    }

    // Create manifest.json if requested
    if (createManifest) {
      const manifest: GalleryManifest = {
        created: new Date().toISOString(),
        count: results.length,
        images: results.map((result): GalleryManifestEntry => ({
          name: result.path.split('/').pop() || '',
          path: result.path,
          thumbnailPath: result.thumbnailPath,
          metadata: result.metadata
        }))
      };

      const manifestData = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
      await this.fs5.put(`${galleryPath}/manifest.json`, manifestData, {
        mediaType: 'application/json'
      });
    }

    return results;
  }

  /**
   * Get the thumbnail path for a given image path
   */
  private getThumbnailPath(imagePath: string): string {
    const parts = imagePath.split('/');
    const filename = parts.pop() || '';
    const directory = parts.join('/');

    if (directory) {
      return `${directory}/.thumbnails/${filename}`;
    } else {
      return `.thumbnails/${filename}`;
    }
  }
}
