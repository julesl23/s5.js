/**
 * Media processing exports
 * Separate entry point for media-related functionality
 */

// Export lazy-loaded versions for code-splitting
export {
  MediaProcessorLazy as MediaProcessor,
  CanvasMetadataExtractorLazy as CanvasMetadataExtractor,
  WASMModuleLazy as WASMModule
} from '../media/index.lazy.js';

// Export browser compatibility utilities
export { BrowserCompat } from '../media/compat/browser.js';

// Export all media types
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
  BrowserCapabilities,
  ProcessingStrategy,
  WASMModule as WASMModuleType
} from '../media/types.js';