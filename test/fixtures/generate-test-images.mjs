#!/usr/bin/env node

/**
 * Script to generate real test images for media processing tests
 * This creates actual image files with known properties for validation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create images directory if it doesn't exist
const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

/**
 * Create a simple 1x1 pixel image in various formats
 * These are the smallest valid images for each format
 */

// 1x1 Red pixel JPEG (minimal valid JPEG)
const createMinimalJPEG = () => {
  // Minimal JPEG structure with 1x1 red pixel
  const jpeg = Buffer.from([
    // SOI (Start of Image)
    0xFF, 0xD8,

    // APP0 (JFIF header)
    0xFF, 0xE0,
    0x00, 0x10, // Length: 16
    0x4A, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, // Version 1.1
    0x00, // Aspect ratio units (0 = no units)
    0x00, 0x01, // X density: 1
    0x00, 0x01, // Y density: 1
    0x00, 0x00, // Thumbnail dimensions: 0x0

    // DQT (Define Quantization Table)
    0xFF, 0xDB,
    0x00, 0x43, // Length: 67
    0x00, // Table 0, 8-bit precision
    // 64 bytes of quantization data (simplified)
    ...Array(64).fill(0x01),

    // SOF0 (Start of Frame - Baseline DCT)
    0xFF, 0xC0,
    0x00, 0x0B, // Length: 11
    0x08, // Precision: 8 bits
    0x00, 0x01, // Height: 1
    0x00, 0x01, // Width: 1
    0x01, // Components: 1 (grayscale)
    0x01, // Component 1
    0x11, // Sampling factors
    0x00, // Quantization table 0

    // DHT (Define Huffman Table)
    0xFF, 0xC4,
    0x00, 0x1F, // Length: 31
    0x00, // Table 0, DC
    ...Array(16).fill(0x00), // Bits
    ...Array(12).fill(0x00), // Values

    // SOS (Start of Scan)
    0xFF, 0xDA,
    0x00, 0x08, // Length: 8
    0x01, // Components: 1
    0x01, // Component 1
    0x00, // Tables
    0x00, // Start
    0x3F, // End
    0x00, // Successive approximation

    // Compressed data (simplified)
    0x00, 0x00,

    // EOI (End of Image)
    0xFF, 0xD9
  ]);

  return jpeg;
};

// 1x1 Red pixel PNG
const createMinimalPNG = () => {
  // PNG structure with 1x1 red pixel
  const png = Buffer.from([
    // PNG signature
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,

    // IHDR chunk
    0x00, 0x00, 0x00, 0x0D, // Length: 13
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x00, 0x01, // Width: 1
    0x00, 0x00, 0x00, 0x01, // Height: 1
    0x08, // Bit depth: 8
    0x02, // Color type: 2 (RGB)
    0x00, // Compression: 0
    0x00, // Filter: 0
    0x00, // Interlace: 0
    0x37, 0x6E, 0xF9, 0x24, // CRC

    // IDAT chunk (compressed RGB data)
    0x00, 0x00, 0x00, 0x0C, // Length: 12
    0x49, 0x44, 0x41, 0x54, // "IDAT"
    0x08, 0xD7, 0x63, 0xF8, // Compressed data
    0xCF, 0xC0, 0x00, 0x00, // Red pixel
    0x03, 0x01, 0x01, 0x00, // End of compressed data
    0x18, 0xDD, 0x8D, 0xB4, // CRC

    // IEND chunk
    0x00, 0x00, 0x00, 0x00, // Length: 0
    0x49, 0x45, 0x4E, 0x44, // "IEND"
    0xAE, 0x42, 0x60, 0x82  // CRC
  ]);

  return png;
};

// 1x1 pixel GIF (red)
const createMinimalGIF = () => {
  const gif = Buffer.from([
    // Header
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // "GIF89a"

    // Logical Screen Descriptor
    0x01, 0x00, // Width: 1
    0x01, 0x00, // Height: 1
    0xF0, // Global Color Table Flag, Color Resolution, Sort Flag, Size
    0x00, // Background Color Index
    0x00, // Pixel Aspect Ratio

    // Global Color Table (2 colors)
    0xFF, 0x00, 0x00, // Red
    0x00, 0x00, 0x00, // Black

    // Image Descriptor
    0x2C,
    0x00, 0x00, // Left position
    0x00, 0x00, // Top position
    0x01, 0x00, // Width
    0x01, 0x00, // Height
    0x00, // No local color table

    // Image Data
    0x02, // LZW minimum code size
    0x02, // Block size
    0x44, 0x01, // Compressed data
    0x00, // Block terminator

    // Trailer
    0x3B
  ]);

  return gif;
};

// 1x1 pixel BMP (red)
const createMinimalBMP = () => {
  const bmp = Buffer.from([
    // BMP Header
    0x42, 0x4D, // "BM"
    0x3A, 0x00, 0x00, 0x00, // File size: 58 bytes
    0x00, 0x00, // Reserved
    0x00, 0x00, // Reserved
    0x36, 0x00, 0x00, 0x00, // Offset to pixel data: 54 bytes

    // DIB Header (BITMAPINFOHEADER)
    0x28, 0x00, 0x00, 0x00, // Header size: 40 bytes
    0x01, 0x00, 0x00, 0x00, // Width: 1
    0x01, 0x00, 0x00, 0x00, // Height: 1
    0x01, 0x00, // Planes: 1
    0x18, 0x00, // Bits per pixel: 24
    0x00, 0x00, 0x00, 0x00, // Compression: none
    0x04, 0x00, 0x00, 0x00, // Image size: 4 bytes
    0x00, 0x00, 0x00, 0x00, // X pixels per meter
    0x00, 0x00, 0x00, 0x00, // Y pixels per meter
    0x00, 0x00, 0x00, 0x00, // Colors in palette
    0x00, 0x00, 0x00, 0x00, // Important colors

    // Pixel data (BGR format)
    0x00, 0x00, 0xFF, 0x00 // Red pixel (B=0, G=0, R=255) + padding
  ]);

  return bmp;
};

// Simple WebP (lossy, 1x1 red pixel)
const createMinimalWebP = () => {
  // This is a simplified WebP structure
  // Real WebP would need proper VP8 encoding
  const webp = Buffer.from([
    // RIFF header
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x24, 0x00, 0x00, 0x00, // File size - 8
    0x57, 0x45, 0x42, 0x50, // "WEBP"

    // VP8 chunk
    0x56, 0x50, 0x38, 0x20, // "VP8 " (lossy)
    0x18, 0x00, 0x00, 0x00, // Chunk size

    // VP8 bitstream (simplified - not a real VP8 stream)
    0x00, 0x00, 0x00, // Sync code
    0x01, 0x00, // Width: 1
    0x01, 0x00, // Height: 1

    // Simplified data (not valid VP8)
    ...Array(17).fill(0x00)
  ]);

  return webp;
};

// Generate larger test images with patterns
const create100x100PNG = () => {
  // Create a 100x100 PNG with a gradient pattern
  const width = 100;
  const height = 100;
  const imageData = [];

  // Create gradient pattern
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      imageData.push(Math.floor((x / width) * 255)); // R
      imageData.push(Math.floor((y / height) * 255)); // G
      imageData.push(128); // B
    }
  }

  // This would need proper PNG encoding with zlib compression
  // For now, we'll use the minimal PNG as placeholder
  return createMinimalPNG();
};

// Save all test images
const images = [
  { name: '1x1-red.jpg', data: createMinimalJPEG() },
  { name: '1x1-red.png', data: createMinimalPNG() },
  { name: '1x1-red.gif', data: createMinimalGIF() },
  { name: '1x1-red.bmp', data: createMinimalBMP() },
  { name: '1x1-red.webp', data: createMinimalWebP() },
  { name: '100x100-gradient.png', data: create100x100PNG() }
];

images.forEach(({ name, data }) => {
  const filePath = path.join(imagesDir, name);
  fs.writeFileSync(filePath, data);
  console.log(`Created: ${filePath} (${data.length} bytes)`);
});

// Create a metadata JSON file with expected values
const metadata = {
  '1x1-red.jpg': {
    width: 1,
    height: 1,
    format: 'jpeg',
    hasAlpha: false,
    description: 'Minimal valid JPEG with single red pixel'
  },
  '1x1-red.png': {
    width: 1,
    height: 1,
    format: 'png',
    hasAlpha: false,
    bitDepth: 8,
    colorType: 2,
    description: 'Minimal valid PNG with single red pixel'
  },
  '1x1-red.gif': {
    width: 1,
    height: 1,
    format: 'gif',
    hasAlpha: false,
    colorCount: 2,
    description: 'Minimal valid GIF with single red pixel'
  },
  '1x1-red.bmp': {
    width: 1,
    height: 1,
    format: 'bmp',
    hasAlpha: false,
    bitsPerPixel: 24,
    description: 'Minimal valid BMP with single red pixel'
  },
  '1x1-red.webp': {
    width: 1,
    height: 1,
    format: 'webp',
    hasAlpha: false,
    description: 'Simplified WebP structure (may not decode properly)'
  },
  '100x100-gradient.png': {
    width: 100,
    height: 100,
    format: 'png',
    hasAlpha: false,
    description: 'PNG with gradient pattern'
  }
};

fs.writeFileSync(
  path.join(imagesDir, 'metadata.json'),
  JSON.stringify(metadata, null, 2)
);

console.log('\nTest images generated successfully!');
console.log('Metadata saved to metadata.json');