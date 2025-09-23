import { describe, it, expect, beforeAll } from 'vitest';
import { WASMLoader } from '../../src/media/wasm/loader.js';

describe('Advanced WASM Features', () => {
  beforeAll(async () => {
    await WASMLoader.initialize();
  });

  describe('Bit Depth Detection', () => {
    it('should detect PNG bit depth', () => {
      // Create PNG header with 16-bit depth
      const pngData = new Uint8Array(50);
      // PNG signature
      pngData[0] = 0x89;
      pngData[1] = 0x50;
      pngData[2] = 0x4E;
      pngData[3] = 0x47;
      pngData[4] = 0x0D;
      pngData[5] = 0x0A;
      pngData[6] = 0x1A;
      pngData[7] = 0x0A;

      // IHDR chunk
      pngData[12] = 0x49; // 'I'
      pngData[13] = 0x48; // 'H'
      pngData[14] = 0x44; // 'D'
      pngData[15] = 0x52; // 'R'

      // Bit depth at offset 24
      pngData[24] = 16; // 16-bit depth

      const bitDepth = WASMLoader.getPNGBitDepth(pngData);
      expect(bitDepth).toBe(16);
    });

    it('should return null for non-PNG data', () => {
      const jpegData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
      const bitDepth = WASMLoader.getPNGBitDepth(jpegData);
      expect(bitDepth).toBe(null);
    });
  });

  describe('Alpha Channel Detection', () => {
    it('should detect alpha channel in PNG', () => {
      // Create PNG with alpha channel (color type 6 = RGBA)
      const pngData = new Uint8Array(50);
      // PNG signature
      pngData[0] = 0x89;
      pngData[1] = 0x50;
      pngData[2] = 0x4E;
      pngData[3] = 0x47;
      pngData[4] = 0x0D;
      pngData[5] = 0x0A;
      pngData[6] = 0x1A;
      pngData[7] = 0x0A;

      // IHDR chunk
      pngData[12] = 0x49; // 'I'
      pngData[13] = 0x48; // 'H'
      pngData[14] = 0x44; // 'D'
      pngData[15] = 0x52; // 'R'

      // Color type at offset 25 (6 = RGBA)
      pngData[25] = 6;

      const hasAlpha = WASMLoader.hasAlpha(pngData);
      expect(hasAlpha).toBe(true);
    });

    it('should detect no alpha channel in JPEG', () => {
      const jpegData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
      const hasAlpha = WASMLoader.hasAlpha(jpegData);
      expect(hasAlpha).toBe(false);
    });
  });

  describe('JPEG Quality Estimation', () => {
    it('should estimate JPEG quality', () => {
      // Create JPEG with DQT marker
      const jpegData = new Uint8Array(200);
      jpegData[0] = 0xFF; // JPEG SOI
      jpegData[1] = 0xD8;
      jpegData[2] = 0xFF; // DQT marker
      jpegData[3] = 0xDB;

      // Add quantization table data
      jpegData[4] = 0x00; // Length high
      jpegData[5] = 0x43; // Length low
      jpegData[6] = 0x00; // Table info

      // Quantization values (lower = higher quality)
      for (let i = 7; i < 71; i++) {
        jpegData[i] = 10; // High quality values
      }

      const quality = WASMLoader.estimateJPEGQuality(jpegData);
      expect(quality).toBeGreaterThan(80); // Should detect high quality
    });

    it('should return null for non-JPEG', () => {
      const pngData = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
      const quality = WASMLoader.estimateJPEGQuality(pngData);
      expect(quality).toBe(null);
    });
  });

  describe('Progressive/Interlaced Detection', () => {
    it('should detect progressive JPEG', () => {
      // Create progressive JPEG with SOF2 marker
      const jpegData = new Uint8Array(10);
      jpegData[0] = 0xFF;
      jpegData[1] = 0xD8;
      jpegData[2] = 0xFF;
      jpegData[3] = 0xC2; // Progressive DCT marker

      const isProgressive = WASMLoader.isProgressive(jpegData, 'jpeg');
      expect(isProgressive).toBe(true);
    });

    it('should detect interlaced PNG', () => {
      // Create interlaced PNG
      const pngData = new Uint8Array(30);
      // PNG signature
      pngData[0] = 0x89;
      pngData[1] = 0x50;
      pngData[2] = 0x4E;
      pngData[3] = 0x47;
      pngData[4] = 0x0D;
      pngData[5] = 0x0A;
      pngData[6] = 0x1A;
      pngData[7] = 0x0A;

      // Interlace method at offset 28
      pngData[28] = 1; // Adam7 interlacing

      const isInterlaced = WASMLoader.isProgressive(pngData, 'png');
      expect(isInterlaced).toBe(true);
    });
  });

  describe('Histogram Calculation', () => {
    it('should calculate histogram statistics', () => {
      // Create test image data with known distribution
      const imageData = new Uint8Array(1000);

      // Create overexposed pixels (high values)
      for (let i = 0; i < 150; i++) {
        imageData[i] = 250 + (i % 6); // Values 250-255
      }

      // Create underexposed pixels (low values)
      for (let i = 150; i < 250; i++) {
        imageData[i] = i % 10; // Values 0-9
      }

      // Fill rest with mid-range values
      for (let i = 250; i < 1000; i++) {
        imageData[i] = 128 + ((i * 7) % 40) - 20; // Values around 128
      }

      const histogram = WASMLoader.calculateHistogram(imageData);
      expect(histogram).toBeDefined();
      expect(histogram?.avgLuminance).toBeGreaterThan(0);
      expect(histogram?.overexposed).toBeGreaterThan(0);
      expect(histogram?.underexposed).toBeGreaterThan(0);
    });
  });

  describe('EXIF Data Detection', () => {
    it('should find EXIF offset in JPEG', () => {
      // Create JPEG with EXIF APP1 marker
      const jpegData = new Uint8Array(100);
      jpegData[0] = 0xFF; // JPEG SOI
      jpegData[1] = 0xD8;
      jpegData[10] = 0xFF; // EXIF APP1 marker
      jpegData[11] = 0xE1;
      jpegData[12] = 0x00; // Length
      jpegData[13] = 0x10;
      jpegData[14] = 0x45; // 'E'
      jpegData[15] = 0x78; // 'x'
      jpegData[16] = 0x69; // 'i'
      jpegData[17] = 0x66; // 'f'
      jpegData[18] = 0x00; // null
      jpegData[19] = 0x00; // null

      const exifOffset = WASMLoader.findEXIFOffset(jpegData);
      expect(exifOffset).toBe(20); // EXIF data starts after header
    });

    it('should return null for images without EXIF', () => {
      const pngData = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
      const exifOffset = WASMLoader.findEXIFOffset(pngData);
      expect(exifOffset).toBe(null);
    });
  });

  describe('Complete Image Analysis', () => {
    it('should perform complete analysis using WASM', () => {
      // Create a test JPEG image
      const jpegData = new Uint8Array(200);
      jpegData[0] = 0xFF; // JPEG SOI
      jpegData[1] = 0xD8;
      jpegData[2] = 0xFF; // SOF0 marker
      jpegData[3] = 0xC0;
      jpegData[4] = 0x00; // Length
      jpegData[5] = 0x11;
      jpegData[6] = 0x08; // Data precision
      jpegData[7] = 0x00; // Height high
      jpegData[8] = 0x64; // Height low (100)
      jpegData[9] = 0x00; // Width high
      jpegData[10] = 0xC8; // Width low (200)

      const analysis = WASMLoader.analyzeImage(jpegData);
      expect(analysis).toBeDefined();
      expect(analysis?.format).toBe('jpeg');
      expect(analysis?.width).toBeGreaterThan(0);
      expect(analysis?.height).toBeGreaterThan(0);
    });
  });

  describe('Advanced Functions Availability', () => {
    it('should check if advanced functions are available', () => {
      const hasAdvanced = WASMLoader.hasAdvancedFunctions();
      // Should be true if advanced WASM loaded successfully
      expect(typeof hasAdvanced).toBe('boolean');
    });
  });
});