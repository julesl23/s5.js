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