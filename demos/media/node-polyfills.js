/**
 * Node.js Browser API Polyfills for Media Processing Demos
 *
 * This module provides polyfills for browser APIs that are required
 * for media processing to work in Node.js environment.
 *
 * Usage:
 * ```javascript
 * import './node-polyfills.js';
 * ```
 *
 * Polyfills included:
 * - Image constructor
 * - document.createElement (Canvas)
 * - URL.createObjectURL / revokeObjectURL
 * - Canvas 2D context with getImageData
 */

import { URL as NodeURL } from 'url';

// Track last created blob for mock URL handling
let lastCreatedBlob = null;

/**
 * Parse image dimensions from image data (basic format detection)
 * This is a simplified parser that works for common formats
 */
function parseImageDimensions(data) {
  const view = new DataView(data);

  try {
    // PNG: Check signature and read IHDR chunk
    if (data.byteLength >= 24 &&
        view.getUint8(0) === 0x89 && view.getUint8(1) === 0x50 &&
        view.getUint8(2) === 0x4E && view.getUint8(3) === 0x47) {
      // PNG IHDR is at offset 16
      const width = view.getUint32(16);
      const height = view.getUint32(20);
      return { width, height };
    }

    // JPEG: Scan for SOF (Start of Frame) markers
    if (data.byteLength >= 2 &&
        view.getUint8(0) === 0xFF && view.getUint8(1) === 0xD8) {
      let offset = 2;
      while (offset < data.byteLength - 9) {
        if (view.getUint8(offset) === 0xFF) {
          const marker = view.getUint8(offset + 1);
          // SOF0 (0xC0) or SOF2 (0xC2) markers contain dimensions
          if (marker === 0xC0 || marker === 0xC2) {
            const height = view.getUint16(offset + 5);
            const width = view.getUint16(offset + 7);
            return { width, height };
          }
          // Skip to next marker
          const length = view.getUint16(offset + 2);
          offset += length + 2;
        } else {
          offset++;
        }
      }
    }

    // GIF: dimensions at offset 6-9
    if (data.byteLength >= 10 &&
        view.getUint8(0) === 0x47 && view.getUint8(1) === 0x49 &&
        view.getUint8(2) === 0x46) {
      const width = view.getUint16(6, true); // little-endian
      const height = view.getUint16(8, true);
      return { width, height };
    }

    // WebP: RIFF format
    if (data.byteLength >= 30 &&
        view.getUint8(0) === 0x52 && view.getUint8(1) === 0x49 &&
        view.getUint8(2) === 0x46 && view.getUint8(3) === 0x46 &&
        view.getUint8(8) === 0x57 && view.getUint8(9) === 0x45 &&
        view.getUint8(10) === 0x42 && view.getUint8(11) === 0x50) {
      // VP8/VP8L/VP8X formats have different structures
      const fourCC = String.fromCharCode(
        view.getUint8(12), view.getUint8(13),
        view.getUint8(14), view.getUint8(15)
      );
      if (fourCC === 'VP8 ' && data.byteLength >= 30) {
        const width = view.getUint16(26, true) & 0x3FFF;
        const height = view.getUint16(28, true) & 0x3FFF;
        return { width, height };
      } else if (fourCC === 'VP8L' && data.byteLength >= 25) {
        const bits = view.getUint32(21, true);
        const width = (bits & 0x3FFF) + 1;
        const height = ((bits >> 14) & 0x3FFF) + 1;
        return { width, height };
      }
    }

    // BMP: dimensions at offset 18-21 (little-endian)
    if (data.byteLength >= 26 &&
        view.getUint8(0) === 0x42 && view.getUint8(1) === 0x4D) {
      const width = view.getUint32(18, true);
      const height = Math.abs(view.getInt32(22, true)); // can be negative
      return { width, height };
    }
  } catch (e) {
    // Parsing failed, return default
  }

  // Default fallback dimensions
  return { width: 800, height: 600 };
}

/**
 * Mock Image constructor for Node.js
 * Simulates browser Image loading behavior
 * Attempts to parse real dimensions from image data
 */
if (typeof global.Image === 'undefined') {
  global.Image = class Image {
    constructor() {
      this._src = '';
      this.onload = null;
      this.onerror = null;
      this.width = 800;
      this.height = 600;
      this._loadPromise = null;
    }

    get src() {
      return this._src;
    }

    set src(value) {
      this._src = value;

      // Start async loading when src is set
      this._loadPromise = (async () => {
        if (this._src === 'blob:mock-url' && lastCreatedBlob) {
          // Fail for very small blobs (likely corrupt)
          if (lastCreatedBlob.size < 10) {
            setTimeout(() => {
              if (this.onerror) this.onerror();
            }, 0);
            return;
          }

          // Try to parse real dimensions from the blob
          try {
            const arrayBuffer = await lastCreatedBlob.arrayBuffer();
            const dimensions = parseImageDimensions(arrayBuffer);
            this.width = dimensions.width;
            this.height = dimensions.height;
          } catch (e) {
            // Keep default dimensions if parsing fails
          }
        }

        // Fire onload after dimensions are set
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      })();
    }
  };
}

/**
 * Mock URL.createObjectURL and revokeObjectURL
 * Override Node.js native implementation to track blobs for dimension parsing
 */
if (typeof URL !== 'undefined') {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  URL.createObjectURL = (blob) => {
    lastCreatedBlob = blob;
    return 'blob:mock-url';
  };

  URL.revokeObjectURL = (url) => {
    lastCreatedBlob = null;
  };
}

// Also set on global if not already there
if (typeof global.URL === 'undefined') {
  global.URL = URL;
}

/**
 * Mock document.createElement for Canvas
 * Provides minimal Canvas API implementation
 */
if (typeof global.document === 'undefined') {
  global.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        const canvas = {
          _width: 0,
          _height: 0,
          get width() { return this._width; },
          set width(val) { this._width = val; },
          get height() { return this._height; },
          set height(val) { this._height = val; },
          getContext: (type) => {
            if (type === '2d') {
              return {
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high',
                fillStyle: '',
                drawImage: () => {},
                fillRect: () => {},
                /**
                 * Mock getImageData - returns pixel data for color extraction
                 * Creates a gradient pattern for realistic color analysis
                 */
                getImageData: (x, y, w, h) => {
                  const pixelCount = w * h;
                  const data = new Uint8ClampedArray(pixelCount * 4);

                  // Generate gradient pixel data for color extraction testing
                  // This creates a red-dominant gradient from red to dark red
                  for (let i = 0; i < pixelCount; i++) {
                    const offset = i * 4;
                    const position = i / pixelCount;

                    // Red channel: 255 -> 128 (dominant)
                    data[offset] = Math.floor(255 - (position * 127));
                    // Green channel: 50 -> 30 (minimal)
                    data[offset + 1] = Math.floor(50 - (position * 20));
                    // Blue channel: 50 -> 30 (minimal)
                    data[offset + 2] = Math.floor(50 - (position * 20));
                    // Alpha channel: fully opaque
                    data[offset + 3] = 255;
                  }

                  return {
                    width: w,
                    height: h,
                    data
                  };
                },
                putImageData: () => {},
                createImageData: (w, h) => ({
                  width: w,
                  height: h,
                  data: new Uint8ClampedArray(w * h * 4)
                }),
                clearRect: () => {},
                save: () => {},
                restore: () => {},
                translate: () => {},
                rotate: () => {},
                scale: () => {}
              };
            }
            return null;
          },
          toDataURL: (type = 'image/png', quality = 0.92) => {
            // Return a minimal data URL
            return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
          },
          toBlob: (callback, type = 'image/png', quality = 0.92) => {
            // Simulate async blob creation
            setTimeout(() => {
              const blob = new Blob([new Uint8Array(100)], { type });
              callback(blob);
            }, 0);
          }
        };
        return canvas;
      }
      return null;
    }
  };
}

console.log('✅ Node.js browser API polyfills loaded');
