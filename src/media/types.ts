/**
 * Supported image formats for metadata extraction
 */
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'bmp' | 'unknown';

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
  /** Whether the image has an alpha channel (transparency) */
  hasAlpha?: boolean;
  /** EXIF metadata if available */
  exif?: Record<string, any>;
  /** File size in bytes */
  size?: number;
  /** Source of metadata extraction (for debugging) */
  source?: 'wasm' | 'canvas' | 'fallback';
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
}