#!/usr/bin/env node

/**
 * Metadata Extraction Demo for WASM Foundation & Media Processing
 *
 * This demo shows:
 * - Processing all test image formats (JPEG, PNG, WebP, GIF, BMP)
 * - Extracting comprehensive metadata
 * - Dominant color analysis with k-means clustering
 * - Format detection from magic bytes
 * - HTML report generation with visual color palettes
 */

// Load Node.js browser API polyfills first
import './node-polyfills.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MediaProcessor } from '@julesl23/s5js/media';
import { BrowserCompat } from '@julesl23/s5js/media';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test images directory
const fixturesDir = path.join(__dirname, '../../test/fixtures/images');

// Store all extracted metadata
const extractedData = [];

/**
 * Load image file as Blob
 */
function loadImageAsBlob(filePath) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp'
  };

  const mimeType = mimeTypes[ext] || 'application/octet-stream';
  return new Blob([buffer], { type: mimeType });
}

/**
 * Detect format from magic bytes (demonstrating format detection)
 */
function detectFormatFromMagicBytes(buffer) {
  if (buffer.length < 4) return 'unknown';

  const bytes = new Uint8Array(buffer.slice(0, 12));

  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'png';
  }

  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'gif';
  }

  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
    return 'bmp';
  }

  // WebP: RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'webp';
  }

  return 'unknown';
}

/**
 * Extract metadata from an image
 */
async function extractImageMetadata(imagePath) {
  const imageName = path.basename(imagePath);
  const buffer = fs.readFileSync(imagePath);
  const blob = loadImageAsBlob(imagePath);

  console.log(`\n📷 Processing: ${imageName}`);
  console.log('─'.repeat(40));

  // Detect format from magic bytes
  const magicFormat = detectFormatFromMagicBytes(buffer);
  console.log(`  Magic bytes detected: ${magicFormat.toUpperCase()}`);

  try {
    const startTime = performance.now();
    const metadata = await MediaProcessor.extractMetadata(blob);
    const extractionTime = performance.now() - startTime;

    if (!metadata) {
      console.log('  ❌ No metadata extracted');
      return null;
    }

    // Display extracted metadata
    console.log(`  ✅ Metadata extracted in ${extractionTime.toFixed(2)}ms`);
    console.log(`  Source: ${metadata.source} (${metadata.source === 'wasm' ? 'WebAssembly' : 'Canvas API'})`);
    console.log('\n  Basic Information:');
    console.log(`    - Dimensions: ${metadata.width}x${metadata.height}`);
    console.log(`    - Format: ${metadata.format?.toUpperCase() || 'unknown'}`);
    console.log(`    - File Size: ${(blob.size / 1024).toFixed(2)} KB`);
    console.log(`    - Has Alpha: ${metadata.hasAlpha ? '✅' : '❌'}`);

    if (metadata.aspectRatio) {
      console.log('\n  Aspect Ratio:');
      console.log(`    - Type: ${metadata.aspectRatio}`);
      console.log(`    - Value: ${metadata.aspectRatioValue?.toFixed(2)}`);
      console.log(`    - Common: ${metadata.commonAspectRatio || 'non-standard'}`);
    }

    if (metadata.dominantColors && metadata.dominantColors.length > 0) {
      console.log('\n  🎨 Dominant Colors (k-means clustering):');
      metadata.dominantColors.forEach((color, index) => {
        const colorBox = '█';
        console.log(`    ${index + 1}. ${colorBox} ${color.hex} (${color.percentage.toFixed(1)}%)`);
      });
      console.log(`    Monochrome: ${metadata.isMonochrome ? '✅' : '❌'}`);
    }

    if (metadata.orientation) {
      console.log('\n  Orientation:');
      console.log(`    - ${metadata.orientation}`);
      if (metadata.needsRotation) {
        console.log(`    - Needs rotation: ${metadata.rotationAngle}°`);
      }
    }

    if (metadata.processingSpeed) {
      console.log('\n  Performance:');
      console.log(`    - Processing Speed: ${metadata.processingSpeed}`);
      console.log(`    - Processing Time: ${metadata.processingTime?.toFixed(2)}ms`);
      console.log(`    - Memory Efficient: ${metadata.memoryEfficient ? '✅' : '❌'}`);
      if (metadata.samplingStrategy) {
        console.log(`    - Sampling Strategy: ${metadata.samplingStrategy}`);
      }
    }

    // Additional advanced features (if implemented)
    if (metadata.bitDepth) {
      console.log(`    - Bit Depth: ${metadata.bitDepth}`);
    }

    if (metadata.isProgressive !== undefined) {
      console.log(`    - Progressive: ${metadata.isProgressive ? '✅' : '❌'}`);
    }

    if (metadata.estimatedQuality) {
      console.log(`    - Estimated Quality: ${metadata.estimatedQuality}/100`);
    }

    // Store for report generation
    extractedData.push({
      fileName: imageName,
      filePath: imagePath,
      magicFormat,
      metadata,
      extractionTime
    });

    return metadata;

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return null;
  }
}

/**
 * Generate HTML report with visual color palettes
 */
function generateHTMLReport() {
  const reportPath = path.join(__dirname, 'metadata-report.html');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Image Metadata Extraction Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 {
      color: #333;
      border-bottom: 3px solid #667eea;
      padding-bottom: 10px;
    }
    .timestamp {
      color: #666;
      font-size: 14px;
      margin-top: -10px;
      margin-bottom: 20px;
    }
    .image-card {
      background: white;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .image-card h2 {
      color: #667eea;
      margin: 0 0 15px 0;
      font-size: 20px;
    }
    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    .metadata-item {
      background: #f8f9fa;
      padding: 10px;
      border-radius: 5px;
    }
    .metadata-item .label {
      font-size: 12px;
      color: #666;
      margin-bottom: 5px;
    }
    .metadata-item .value {
      font-size: 16px;
      font-weight: bold;
      color: #333;
    }
    .color-palette {
      display: flex;
      gap: 10px;
      margin-top: 15px;
      flex-wrap: wrap;
    }
    .color-swatch {
      width: 80px;
      height: 80px;
      border-radius: 10px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
      font-size: 12px;
      font-weight: bold;
    }
    .performance-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 12px;
      font-weight: bold;
      margin-left: 10px;
    }
    .performance-fast {
      background: #28a745;
      color: white;
    }
    .performance-normal {
      background: #ffc107;
      color: black;
    }
    .performance-slow {
      background: #dc3545;
      color: white;
    }
    .summary {
      background: white;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .summary h2 {
      color: #333;
      margin-top: 0;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
    }
    .summary-stat {
      text-align: center;
      padding: 10px;
      background: #f8f9fa;
      border-radius: 5px;
    }
    .summary-stat .number {
      font-size: 24px;
      font-weight: bold;
      color: #667eea;
    }
    .summary-stat .label {
      font-size: 12px;
      color: #666;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <h1>🖼️ Image Metadata Extraction Report</h1>
  <div class="timestamp">Generated: ${new Date().toLocaleString()}</div>

  <div class="summary">
    <h2>Summary</h2>
    <div class="summary-grid">
      <div class="summary-stat">
        <div class="number">${extractedData.length}</div>
        <div class="label">Images Processed</div>
      </div>
      <div class="summary-stat">
        <div class="number">${extractedData.filter(d => d.metadata?.source === 'wasm').length}</div>
        <div class="label">WASM Processed</div>
      </div>
      <div class="summary-stat">
        <div class="number">${extractedData.filter(d => d.metadata?.source === 'canvas').length}</div>
        <div class="label">Canvas Processed</div>
      </div>
      <div class="summary-stat">
        <div class="number">${extractedData.reduce((sum, d) => sum + (d.extractionTime || 0), 0).toFixed(0)}ms</div>
        <div class="label">Total Time</div>
      </div>
    </div>
  </div>

  ${extractedData.map(data => {
    const m = data.metadata;
    if (!m) return '';

    const performanceClass = m.processingSpeed === 'fast' ? 'performance-fast' :
                            m.processingSpeed === 'slow' ? 'performance-slow' :
                            'performance-normal';

    return `
    <div class="image-card">
      <h2>
        ${data.fileName}
        <span class="performance-badge ${performanceClass}">${m.processingSpeed || 'unknown'}</span>
      </h2>

      <div class="metadata-grid">
        <div class="metadata-item">
          <div class="label">Dimensions</div>
          <div class="value">${m.width}x${m.height}</div>
        </div>
        <div class="metadata-item">
          <div class="label">Format</div>
          <div class="value">${m.format?.toUpperCase() || 'unknown'}</div>
        </div>
        <div class="metadata-item">
          <div class="label">File Size</div>
          <div class="value">${(m.size / 1024).toFixed(2)} KB</div>
        </div>
        <div class="metadata-item">
          <div class="label">Processing</div>
          <div class="value">${m.processingTime?.toFixed(2)}ms</div>
        </div>
        <div class="metadata-item">
          <div class="label">Source</div>
          <div class="value">${m.source?.toUpperCase() || 'unknown'}</div>
        </div>
        <div class="metadata-item">
          <div class="label">Has Alpha</div>
          <div class="value">${m.hasAlpha ? '✅' : '❌'}</div>
        </div>
        ${m.aspectRatio ? `
        <div class="metadata-item">
          <div class="label">Aspect Ratio</div>
          <div class="value">${m.commonAspectRatio || m.aspectRatio}</div>
        </div>` : ''}
        <div class="metadata-item">
          <div class="label">Magic Bytes</div>
          <div class="value">${data.magicFormat.toUpperCase()}</div>
        </div>
      </div>

      ${m.dominantColors && m.dominantColors.length > 0 ? `
      <div style="margin-top: 20px;">
        <strong>🎨 Dominant Colors (k-means clustering):</strong>
        <div class="color-palette">
          ${m.dominantColors.map(color => `
            <div class="color-swatch" style="background: ${color.hex};">
              <div>${color.hex}</div>
              <div>${color.percentage.toFixed(1)}%</div>
            </div>
          `).join('')}
        </div>
        ${m.isMonochrome ? '<p style="margin-top: 10px;">⚫ Image is monochrome</p>' : ''}
      </div>` : ''}
    </div>`;
  }).join('')}

</body>
</html>`;

  fs.writeFileSync(reportPath, html);
  return reportPath;
}

/**
 * Run the metadata extraction demo
 */
async function runMetadataDemo() {
  console.log('🎨 Image Metadata Extraction Demo\n');
  console.log('==================================\n');

  // Check capabilities
  console.log('📊 Checking capabilities...\n');
  const capabilities = await BrowserCompat.checkCapabilities();
  const strategy = BrowserCompat.selectProcessingStrategy(capabilities);
  console.log(`  Recommended strategy: ${strategy}\n`);

  // Initialize MediaProcessor
  console.log('🔧 Initializing MediaProcessor...\n');
  await MediaProcessor.initialize({
    onProgress: (percent) => {
      process.stdout.write(`\r  Loading: ${percent}%`);
    }
  });
  console.log('\n  ✅ Initialized\n');

  // Get test images
  const imageFiles = fs.readdirSync(fixturesDir)
    .filter(f => /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(f))
    .map(f => path.join(fixturesDir, f))
    .sort();

  console.log(`📁 Found ${imageFiles.length} test images`);
  console.log('  Formats: JPEG, PNG, WebP, GIF, BMP\n');
  console.log('Starting metadata extraction...');
  console.log('═'.repeat(40));

  // Process each image
  for (const imagePath of imageFiles) {
    await extractImageMetadata(imagePath);
  }

  // Generate HTML report
  console.log('\n═'.repeat(40));
  console.log('\n📊 Generating HTML Report...\n');

  const reportPath = generateHTMLReport();

  // Summary statistics
  const successCount = extractedData.filter(d => d.metadata).length;
  const totalTime = extractedData.reduce((sum, d) => sum + (d.extractionTime || 0), 0);
  const avgTime = successCount > 0 ? (totalTime / successCount).toFixed(2) : 0;

  const wasmCount = extractedData.filter(d => d.metadata?.source === 'wasm').length;
  const canvasCount = extractedData.filter(d => d.metadata?.source === 'canvas').length;

  console.log('📈 Summary:');
  console.log(`  - Images Processed: ${successCount}/${imageFiles.length}`);
  console.log(`  - WASM Processed: ${wasmCount}`);
  console.log(`  - Canvas Processed: ${canvasCount}`);
  console.log(`  - Average Time: ${avgTime}ms`);
  console.log(`  - Total Time: ${totalTime.toFixed(2)}ms\n`);

  console.log('✅ Metadata extraction complete!');
  console.log(`📄 HTML report saved to: ${reportPath}`);
  console.log('\nOpen the report in a browser to see visual color palettes.\n');
}

// Run the demo
runMetadataDemo().catch(console.error);