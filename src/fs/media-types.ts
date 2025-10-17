import type { ImageMetadata, ThumbnailOptions, ProgressiveLoadingOptions } from '../media/types.js';
import type { PutOptions } from './dirv1/types.js';

/**
 * Options for putting an image with media processing
 */
export interface PutImageOptions extends PutOptions {
  /** Whether to generate a thumbnail (default: true) */
  generateThumbnail?: boolean;
  /** Thumbnail options */
  thumbnailOptions?: ThumbnailOptions;
  /** Whether to extract and store metadata (default: true) */
  extractMetadata?: boolean;
  /** Whether to create progressive encoding (default: false) */
  progressive?: boolean;
  /** Progressive loading options */
  progressiveOptions?: ProgressiveLoadingOptions;
}

/**
 * Reference to an uploaded image with metadata
 *
 * Uses path-based identifiers consistent with FS5's design philosophy.
 * Content identifiers (CIDs) are not exposed as they are implementation
 * details of the underlying content-addressed storage.
 */
export interface ImageReference {
  /** Path to the image */
  path: string;
  /** Path to the thumbnail (if generated) */
  thumbnailPath?: string;
  /** Extracted metadata */
  metadata?: ImageMetadata;
}

/**
 * Image to upload in a gallery
 */
export interface ImageUpload {
  /** Name/path for the image in the gallery */
  name: string;
  /** Image data */
  blob: Blob;
  /** Optional metadata override */
  metadata?: Partial<ImageMetadata>;
}

/**
 * Options for getting a thumbnail
 */
export interface GetThumbnailOptions {
  /** Thumbnail options if generating on-demand */
  thumbnailOptions?: ThumbnailOptions;
  /** Whether to cache the generated thumbnail (default: true) */
  cache?: boolean;
}

/**
 * Options for creating an image gallery
 */
export interface CreateImageGalleryOptions {
  /** Number of concurrent uploads (default: 4) */
  concurrency?: number;
  /** Whether to generate thumbnails for all images (default: true) */
  generateThumbnails?: boolean;
  /** Thumbnail options */
  thumbnailOptions?: ThumbnailOptions;
  /** Progress callback */
  onProgress?: (completed: number, total: number) => void;
  /** Whether to create a manifest.json file (default: true) */
  createManifest?: boolean;
}

/**
 * Gallery manifest entry
 *
 * Stores path-based references to images in a gallery.
 */
export interface GalleryManifestEntry {
  /** Image name */
  name: string;
  /** Image path */
  path: string;
  /** Thumbnail path */
  thumbnailPath?: string;
  /** Image metadata */
  metadata?: ImageMetadata;
}

/**
 * Gallery manifest structure
 */
export interface GalleryManifest {
  /** Gallery creation timestamp */
  created: string;
  /** Number of images */
  count: number;
  /** Gallery entries */
  images: GalleryManifestEntry[];
}
