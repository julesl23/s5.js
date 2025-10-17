// Main entry point for S5.js library
export { S5 } from './s5.js';
export { FS5 } from './fs/fs5.js';
export { S5UserIdentity } from './identity/identity.js';
export { S5Node } from './node/node.js';
export { S5APIInterface } from './api/s5.js';
export { CryptoImplementation } from './api/crypto.js';
export { JSCryptoImplementation } from './api/crypto/js.js';

// Export utility classes
export { DirectoryWalker } from './fs/utils/walker.js';
export { BatchOperations } from './fs/utils/batch.js';

// Export media processing classes
export { MediaProcessor } from './media/index.js';
export { CanvasMetadataExtractor } from './media/fallback/canvas.js';
export { WASMModule } from './media/wasm/module.js';
export { ThumbnailGenerator } from './media/thumbnail/generator.js';
export { ProgressiveImageLoader } from './media/progressive/loader.js';

// Export types
export type {
  DirV1,
  FileRef,
  DirRef,
  DirLink,
  PutOptions,
  GetOptions,
  ListOptions,
  ListResult,
  CursorData
} from './fs/dirv1/types.js';

// Export FS5 media integration types
export type {
  PutImageOptions,
  ImageReference,
  ImageUpload,
  GetThumbnailOptions,
  CreateImageGalleryOptions,
  GalleryManifest,
  GalleryManifestEntry
} from './fs/media-types.js';

// Export utility types
export type {
  WalkOptions,
  WalkResult,
  WalkStats
} from './fs/utils/walker.js';

export type {
  BatchOptions,
  BatchProgress,
  BatchResult
} from './fs/utils/batch.js';

// Export media types
export type {
  ImageMetadata,
  MediaOptions,
  InitializeOptions,
  ImageFormat,
  ColorSpace,
  ExifData,
  HistogramData,
  DominantColor,
  AspectRatio,
  Orientation,
  ProcessingSpeed,
  SamplingStrategy,
  ThumbnailOptions,
  ThumbnailResult,
  ProgressiveLoadingOptions,
  ProgressiveLayer
} from './media/types.js';