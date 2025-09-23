/**
 * WebAssembly module loader for image metadata extraction
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// WASM module exports interface
export interface WASMExports {
  memory: WebAssembly.Memory;
  malloc: (size: number) => number;
  free: (ptr: number) => void;
  detect_format: (dataPtr: number, dataLen: number) => number;
  extract_png_dimensions: (dataPtr: number, dataLen: number) => [number, number];
  extract_jpeg_dimensions: (dataPtr: number, dataLen: number) => [number, number];
  extract_metadata: (dataPtr: number, dataLen: number) => number;
}

export class WASMLoader {
  private static instance?: WebAssembly.Instance;
  private static module?: WebAssembly.Module;
  private static exports?: WASMExports;
  private static memoryView?: Uint8Array;

  /**
   * Load and instantiate the WASM module
   */
  static async initialize(onProgress?: (percent: number) => void): Promise<void> {
    if (this.instance) return;

    try {
      const imports = {
        env: {
          // Add any required imports here
          abort: () => { throw new Error('WASM abort called'); }
        }
      };

      // Report initial progress
      onProgress?.(0);

      // Try streaming compilation first (faster)
      if (typeof WebAssembly.instantiateStreaming === 'function' && typeof fetch !== 'undefined') {
        try {
          const wasmUrl = await this.getWASMUrl();
          onProgress?.(10); // Fetching

          const response = await fetch(wasmUrl);

          if (response.ok) {
            onProgress?.(50); // Compiling
            const result = await WebAssembly.instantiateStreaming(response, imports);
            this.module = result.module;
            this.instance = result.instance;
            this.exports = this.instance.exports as unknown as WASMExports;
            this.updateMemoryView();
            onProgress?.(100); // Complete
            return;
          }
        } catch (streamError) {
          console.warn('Streaming compilation failed, falling back to ArrayBuffer:', streamError);
        }
      }

      // Fallback to ArrayBuffer compilation
      onProgress?.(20); // Loading buffer
      const wasmBuffer = await this.loadWASMBuffer();
      onProgress?.(60); // Compiling

      // Use compileStreaming if available and we have a Response
      if (typeof Response !== 'undefined' && typeof WebAssembly.compileStreaming === 'function') {
        try {
          const response = new Response(wasmBuffer, {
            headers: { 'Content-Type': 'application/wasm' }
          });
          this.module = await WebAssembly.compileStreaming(response);
        } catch {
          // Fallback to regular compile
          this.module = await WebAssembly.compile(wasmBuffer);
        }
      } else {
        this.module = await WebAssembly.compile(wasmBuffer);
      }

      onProgress?.(90); // Instantiating

      // Instantiate with imports
      this.instance = await WebAssembly.instantiate(this.module, imports);

      this.exports = this.instance.exports as unknown as WASMExports;
      this.updateMemoryView();
      onProgress?.(100); // Complete

    } catch (error) {
      console.error('Failed to initialize WASM:', error);
      throw new Error(`WASM initialization failed: ${error}`);
    }
  }

  /**
   * Get WASM URL for streaming compilation
   */
  private static async getWASMUrl(): Promise<string> {
    // In browser environment
    if (typeof window !== 'undefined' && window.location) {
      return new URL('/src/media/wasm/image-metadata.wasm', window.location.href).href;
    }

    // In Node.js environment
    if (typeof process !== 'undefined' && process.versions?.node) {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const wasmPath = join(__dirname, 'image-metadata.wasm');
      return `file://${wasmPath}`;
    }

    // Fallback
    return '/src/media/wasm/image-metadata.wasm';
  }

  /**
   * Load WASM buffer - tries multiple methods
   */
  private static async loadWASMBuffer(): Promise<ArrayBuffer> {
    // In Node.js environment
    if (typeof process !== 'undefined' && process.versions?.node) {
      try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const wasmPath = join(__dirname, 'image-metadata.wasm');
        const buffer = readFileSync(wasmPath);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      } catch (error) {
        console.warn('Failed to load WASM from file, trying base64 fallback:', error);
      }
    }

    // In browser environment or as fallback - use fetch
    if (typeof fetch !== 'undefined') {
      try {
        const response = await fetch('/src/media/wasm/image-metadata.wasm');
        if (response.ok) {
          return await response.arrayBuffer();
        }
      } catch (error) {
        console.warn('Failed to fetch WASM, trying base64 fallback:', error);
      }
    }

    // Final fallback: embedded base64 (we'll generate this)
    return this.loadEmbeddedWASM();
  }

  /**
   * Load embedded WASM from base64
   */
  private static async loadEmbeddedWASM(): Promise<ArrayBuffer> {
    // This will be populated with the base64 content during build
    const base64 = await this.getBase64WASM();
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Get base64 encoded WASM
   */
  private static async getBase64WASM(): Promise<string> {
    // Try to load from file first (Node.js)
    if (typeof process !== 'undefined' && process.versions?.node) {
      try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const base64Path = join(__dirname, 'image-metadata.wasm.base64');
        return readFileSync(base64Path, 'utf8');
      } catch (error) {
        // Fall through to embedded
      }
    }

    // Embedded base64 - this is a minimal fallback
    // In production, this would be replaced during build
    return 'AGFzbQEAAAABGAVgAX8Bf2ACf38Bf2ACf38CfwBgAABgA39/fwADCQgAAQECAgMEBAQFAwEAEAZPCn8AQQELfwBBAAt/AEEAC38AQYAICwF/AEGACAsBeAZtZW1vcnkCAIABAGV4cG9ydHMJbWFsbG9jAAEGZnJlZQACDmRldGVjdF9mb3JtYXQAAxdleHRyYWN0X3BuZ19kaW1lbnNpb25zAAQYZXh0cmFjdF9qcGVnX2RpbWVuc2lvbnMABRBleHRyYWN0X21ldGFkYXRhAAYHQ29uc3RhbnRzFEhFQVBfUFRSX0lOSVRJQUxJWkUDBwqYBAgUACABQQRJBEBBAA8LCzoAIAIgATYCBCACQQE2AgAgAkEANgIIIAJBADYCDAs=';
  }

  /**
   * Update memory view after potential growth
   */
  private static updateMemoryView(): void {
    if (this.exports?.memory) {
      this.memoryView = new Uint8Array(this.exports.memory.buffer);
    }
  }

  /**
   * Copy data to WASM memory with optimization for large images
   */
  static copyToWASM(data: Uint8Array): number {
    if (!this.exports || !this.memoryView) {
      throw new Error('WASM not initialized');
    }

    // For very large images, consider sampling instead of processing full image
    const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB limit
    let processData = data;

    if (data.length > MAX_IMAGE_SIZE) {
      console.warn(`Image too large (${data.length} bytes), will process only metadata`);
      // For metadata extraction, we only need the header
      processData = data.slice(0, 65536); // First 64KB should contain all metadata
    }

    // Check if memory needs to grow
    const requiredSize = processData.length + 4096; // Add buffer for alignment
    const currentSize = this.memoryView.length;

    if (requiredSize > currentSize) {
      // Grow memory (in pages of 64KB)
      const pagesNeeded = Math.ceil((requiredSize - currentSize) / 65536);
      try {
        this.exports.memory.grow(pagesNeeded);
        this.updateMemoryView();
      } catch (error) {
        throw new Error(`Failed to allocate memory: ${error}. Required: ${requiredSize} bytes`);
      }
    }

    // Allocate memory in WASM
    const ptr = this.exports.malloc(processData.length);

    if (ptr === 0) {
      throw new Error('Failed to allocate memory in WASM');
    }

    // Copy data
    try {
      this.memoryView!.set(processData, ptr);
    } catch (error) {
      this.exports.free(ptr);
      throw new Error(`Failed to copy data to WASM memory: ${error}`);
    }

    return ptr;
  }

  /**
   * Read data from WASM memory
   */
  static readFromWASM(ptr: number, length: number): Uint8Array {
    if (!this.memoryView) {
      throw new Error('WASM not initialized');
    }
    return new Uint8Array(this.memoryView.slice(ptr, ptr + length));
  }

  /**
   * Read 32-bit integer from WASM memory
   */
  static readInt32(ptr: number): number {
    if (!this.memoryView) {
      throw new Error('WASM not initialized');
    }
    const view = new DataView(this.memoryView.buffer, ptr, 4);
    return view.getInt32(0, true); // little-endian
  }

  /**
   * Extract metadata using WASM
   */
  static extractMetadata(imageData: Uint8Array): {
    format: string;
    width: number;
    height: number;
    size: number;
  } | null {
    if (!this.exports) {
      throw new Error('WASM not initialized');
    }

    const dataPtr = this.copyToWASM(imageData);

    try {
      // Call WASM function
      const resultPtr = this.exports.extract_metadata(dataPtr, imageData.length);

      if (resultPtr === 0) {
        return null;
      }

      // Read result from memory
      const format = this.readInt32(resultPtr);
      const width = this.readInt32(resultPtr + 4);
      const height = this.readInt32(resultPtr + 8);
      const size = this.readInt32(resultPtr + 12);

      // Map format number to string
      const formatMap: { [key: number]: string } = {
        1: 'jpeg',
        2: 'png',
        3: 'gif',
        4: 'bmp',
        5: 'webp',
        0: 'unknown'
      };

      return {
        format: formatMap[format] || 'unknown',
        width,
        height,
        size
      };

    } finally {
      // Free allocated memory
      this.exports.free(dataPtr);
    }
  }

  /**
   * Detect image format using WASM
   */
  static detectFormat(imageData: Uint8Array): string {
    if (!this.exports) {
      throw new Error('WASM not initialized');
    }

    const dataPtr = this.copyToWASM(imageData);

    try {
      const format = this.exports.detect_format(dataPtr, imageData.length);

      const formatMap: { [key: number]: string } = {
        1: 'jpeg',
        2: 'png',
        3: 'gif',
        4: 'bmp',
        5: 'webp',
        0: 'unknown'
      };

      return formatMap[format] || 'unknown';

    } finally {
      this.exports.free(dataPtr);
    }
  }

  /**
   * Get dimensions for specific format
   */
  static getDimensions(imageData: Uint8Array, format: string): { width: number; height: number } | null {
    if (!this.exports) {
      throw new Error('WASM not initialized');
    }

    const dataPtr = this.copyToWASM(imageData);

    try {
      let width = 0;
      let height = 0;

      if (format === 'png') {
        [width, height] = this.exports.extract_png_dimensions(dataPtr, imageData.length);
      } else if (format === 'jpeg') {
        [width, height] = this.exports.extract_jpeg_dimensions(dataPtr, imageData.length);
      }

      if (width === 0 && height === 0) {
        return null;
      }

      return { width, height };

    } finally {
      this.exports.free(dataPtr);
    }
  }

  /**
   * Clean up WASM resources
   */
  static cleanup(): void {
    this.instance = undefined;
    this.module = undefined;
    this.exports = undefined;
    this.memoryView = undefined;
  }

  /**
   * Check if WASM is initialized
   */
  static isInitialized(): boolean {
    return !!this.instance && !!this.exports;
  }
}