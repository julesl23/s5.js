/**
 * Test helper utilities for loading real image fixtures
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the directory path for fixtures
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const IMAGES_DIR = join(__dirname, 'images');

/**
 * Load a test image as a Buffer
 */
export function loadTestImageBuffer(filename: string): Buffer {
  const filePath = join(IMAGES_DIR, filename);
  return readFileSync(filePath);
}

/**
 * Load a test image as a Blob
 */
export function loadTestImageBlob(filename: string): Blob {
  const buffer = loadTestImageBuffer(filename);
  const mimeType = getMimeType(filename);
  return new Blob([buffer as BlobPart], { type: mimeType });
}

/**
 * Load a test image as Uint8Array
 */
export function loadTestImageUint8Array(filename: string): Uint8Array {
  const buffer = loadTestImageBuffer(filename);
  return new Uint8Array(buffer);
}

/**
 * Get MIME type from filename extension
 */
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp'
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Load expected metadata for test images
 */
export async function loadExpectedMetadata(): Promise<Record<string, any>> {
  const metadataPath = join(IMAGES_DIR, 'metadata.json');
  const content = readFileSync(metadataPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Get list of all test images
 */
export function getTestImages(): string[] {
  return [
    '1x1-red.jpg',
    '1x1-red.png',
    '1x1-red.gif',
    '1x1-red.bmp',
    '1x1-red.webp',
    '100x100-gradient.png'
  ];
}

/**
 * Test image metadata interface
 */
export interface TestImageMetadata {
  width: number;
  height: number;
  format: string;
  hasAlpha: boolean;
  description: string;
  bitDepth?: number;
  colorType?: number;
  colorCount?: number;
  bitsPerPixel?: number;
}