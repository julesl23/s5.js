/**
 * Supported image formats for metadata extraction
 */
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'bmp' | 'unknown';

/**
 * Color space types
 */
export type ColorSpace = 'srgb' | 'adobergb' | 'rgb' | 'cmyk' | 'gray' | 'lab' | 'xyz';

/**
 * EXIF data structure
 */
export interface ExifData {
  /** Camera manufacturer */
  make?: string;
  /** Camera model */
  model?: string;
  /** Image orientation (1-8) */
  orientation?: number;
  /** Date and time of original capture */
  dateTime?: string;
  /** Exposure time in seconds */
  exposureTime?: number;
  /** F-number (aperture) */
  fNumber?: number;
  /** ISO speed rating */
  iso?: number;
  /** Focal length in mm */
  focalLength?: number;
  /** Flash fired */
  flash?: boolean;
  /** Lens model */
  lensModel?: string;
  /** GPS latitude */
  gpsLatitude?: number;
  /** GPS longitude */
  gpsLongitude?: number;
  /** GPS altitude in meters */
  gpsAltitude?: number;
  /** Copyright information */
  copyright?: string;
  /** Artist/photographer */
  artist?: string;
  /** Software used */
  software?: string;
}

/**
 * Histogram data for image analysis
 */
export interface HistogramData {
  /** Red channel histogram (256 values) */
  r: Uint32Array;
  /** Green channel histogram (256 values) */
  g: Uint32Array;
  /** Blue channel histogram (256 values) */
  b: Uint32Array;
  /** Luminance histogram (256 values) */
  luminance: Uint32Array;
}

/**
 * Metadata extracted from an image
 */
export interface ImageMetadata {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Detected image format */
  format: ImageFormat;
  /** MIME type */
  mimeType?: string;
  /** Whether the image has an alpha channel (transparency) */
  hasAlpha?: boolean;
  /** EXIF metadata if available */
  exif?: ExifData;
  /** File size in bytes */
  size?: number;
  /** Source of metadata extraction (for debugging) */
  source?: 'wasm' | 'canvas' | 'fallback';
  /** Color space of the image */
  colorSpace?: ColorSpace;
  /** Bit depth per channel */
  bitDepth?: number;
  /** Whether this is an HDR image */
  isHDR?: boolean;
  /** Histogram data for exposure analysis */
  histogram?: HistogramData;
  /** Exposure warning based on histogram analysis */
  exposureWarning?: 'overexposed' | 'underexposed' | 'normal';
  /** Whether the image uses progressive/interlaced encoding */
  isProgressive?: boolean;
  /** Whether the image uses interlaced encoding (PNG) */
  isInterlaced?: boolean;
  /** Whether the image is animated */
  isAnimated?: boolean;
  /** Number of frames (for animated images) */
  frameCount?: number;
  /** Estimated JPEG quality (0-100) */
  estimatedQuality?: number;
  /** Dominant colors extracted from the image */
  dominantColors?: DominantColor[];
  /** Whether the image is monochrome */
  isMonochrome?: boolean;
  /** Aspect ratio classification */
  aspectRatio?: AspectRatio;
  /** Numerical aspect ratio value (width/height) */
  aspectRatioValue?: number;
  /** Common aspect ratio format (e.g., "16:9") */
  commonAspectRatio?: string;
  /** Image orientation (EXIF-style, 1-8) */
  orientation?: Orientation;
  /** Whether the image needs rotation based on orientation */
  needsRotation?: boolean;
  /** Rotation angle needed (0, 90, 180, 270) */
  rotationAngle?: number;
  /** Whether the image data is valid */
  isValidImage?: boolean;
  /** Validation errors if any */
  validationErrors?: string[];
  /** Processing time in milliseconds */
  processingTime?: number;
  /** Processing speed classification */
  processingSpeed?: ProcessingSpeed;
  /** Whether memory-efficient processing was used */
  memoryEfficient?: boolean;
  /** Sampling strategy used for analysis */
  samplingStrategy?: SamplingStrategy;
  /** Processing errors if any */
  processingErrors?: string[];
}

/**
 * Options for media processing operations
 */
export interface MediaOptions {
  /** Whether to use WASM for processing (default: true) */
  useWASM?: boolean;
  /** Timeout in milliseconds for processing operations */
  timeout?: number;
  /** Progress callback for long operations */
  onProgress?: (percent: number) => void;
}

/**
 * Options specifically for initialization
 */
export interface InitializeOptions {
  /** Progress callback during WASM loading */
  onProgress?: (percent: number) => void;
  /** Custom WASM module URL */
  wasmUrl?: string;
}

/**
 * Dominant color information
 */
export interface DominantColor {
  /** Hex color code */
  hex: string;
  /** RGB values */
  rgb: {
    r: number;
    g: number;
    b: number;
  };
  /** Percentage of image this color represents */
  percentage: number;
}

/**
 * Aspect ratio types
 */
export type AspectRatio = 'landscape' | 'portrait' | 'square';

/**
 * Image orientation values (EXIF-style)
 */
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Processing speed indicator
 */
export type ProcessingSpeed = 'fast' | 'normal' | 'slow';

/**
 * Sampling strategy for large images
 */
export type SamplingStrategy = 'full' | 'adaptive' | 'minimal';

/**
 * Browser capabilities for media processing
 */
export interface BrowserCapabilities {
  /** WebAssembly support */
  webAssembly: boolean;
  /** WebAssembly streaming compilation support */
  webAssemblyStreaming: boolean;
  /** SharedArrayBuffer support (may be disabled due to Spectre) */
  sharedArrayBuffer: boolean;
  /** Web Workers support */
  webWorkers: boolean;
  /** OffscreenCanvas support for worker-based rendering */
  offscreenCanvas: boolean;
  /** WebP image format support */
  webP: boolean;
  /** AVIF image format support */
  avif: boolean;
  /** createImageBitmap API support */
  createImageBitmap: boolean;
  /** WebGL support */
  webGL: boolean;
  /** WebGL2 support */
  webGL2: boolean;
  /** Available memory limit in MB */
  memoryLimit: number;
  /** Performance API availability */
  performanceAPI: boolean;
  /** Memory info availability (Chrome-specific) */
  memoryInfo: boolean;
}

/**
 * Processing strategy based on capabilities
 */
export type ProcessingStrategy =
  | 'wasm-worker'    // Best: WASM in Web Worker
  | 'wasm-main'      // Good: WASM in main thread
  | 'canvas-worker'  // OK: Canvas in Web Worker
  | 'canvas-main';   // Fallback: Canvas in main thread

/**
 * Browser information
 */
export interface BrowserInfo {
  /** Browser name (Chrome, Firefox, Safari, Edge, etc.) */
  name: string;
  /** Browser version */
  version: string;
  /** Platform (Windows, macOS, Linux, iOS, Android, etc.) */
  platform: string;
  /** Whether this is a mobile browser */
  isMobile: boolean;
}

/**
 * WASM module interface
 */
export interface WASMModule {
  /** Initialize the WASM module */
  initialize(): Promise<void>;
  /** Extract metadata from image data */
  extractMetadata(data: Uint8Array): ImageMetadata | undefined;
  /** Free allocated memory */
  cleanup(): void;
  /** Get count of allocated buffers (for testing) */
  getAllocatedBufferCount?(): number;
}

/**
 * Options for thumbnail generation
 */
export interface ThumbnailOptions {
  /** Maximum width in pixels (default: 256) */
  maxWidth?: number;
  /** Maximum height in pixels (default: 256) */
  maxHeight?: number;
  /** Quality 0-100 (default: 85) */
  quality?: number;
  /** Output format (default: 'jpeg') */
  format?: 'jpeg' | 'webp' | 'png';
  /** Maintain aspect ratio (default: true) */
  maintainAspectRatio?: boolean;
  /** Use smart cropping with edge detection (default: false) */
  smartCrop?: boolean;
  /** Generate progressive encoding (default: true) */
  progressive?: boolean;
  /** Target size in bytes (will adjust quality to meet target) */
  targetSize?: number;
}

/**
 * Result from thumbnail generation
 */
export interface ThumbnailResult {
  /** Generated thumbnail blob */
  blob: Blob;
  /** Actual width of thumbnail */
  width: number;
  /** Actual height of thumbnail */
  height: number;
  /** Format used */
  format: string;
  /** Actual quality used (may differ from requested if targetSize specified) */
  quality: number;
  /** Processing time in milliseconds */
  processingTime: number;
}