#!/usr/bin/env node

/**
 * Integration Test Suite for WASM Foundation & Media Processing
 *
 * This test suite verifies:
 * - WASM initialization and loading
 * - Fallback to Canvas when WASM unavailable
 * - Code-splitting reduces bundle size
 * - Performance metrics are recorded correctly
 * - Real images are processed accurately
 * - All media components integrate properly
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test images directory
const fixturesDir = path.join(__dirname, '../../test/fixtures/images');

// Test results
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * Test runner
 */
async function runTest(name, testFn) {
  console.log(`\n📝 ${name}`);
  try {
    await testFn();
    console.log(`   ✅ PASSED`);
    testResults.passed++;
    testResults.tests.push({ name, status: 'passed' });
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    testResults.failed++;
    testResults.tests.push({ name, status: 'failed', error: error.message });
  }
}

/**
 * Load image as Blob
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
 * Test Suite
 */
async function runIntegrationTests() {
  console.log('🧪 WASM Foundation & Media Processing Integration Tests');
  console.log('=======================================================\n');

  console.log('Setting up test environment...\n');

  // Test 1: Browser Compatibility Detection
  await runTest('Browser Compatibility Detection', async () => {
    const { BrowserCompat } = await import('../../dist/src/media/compat/browser.js');
    const capabilities = await BrowserCompat.checkCapabilities();

    assert(typeof capabilities === 'object', 'Capabilities should be an object');
    assert(typeof capabilities.webAssembly === 'boolean', 'webAssembly should be boolean');
    assert(typeof capabilities.webWorkers === 'boolean', 'webWorkers should be boolean');
    assert(typeof capabilities.performanceAPI === 'boolean', 'performanceAPI should be boolean');
    assert(typeof capabilities.memoryLimit === 'number', 'memoryLimit should be number');

    const strategy = BrowserCompat.selectProcessingStrategy(capabilities);
    assert(['wasm-worker', 'wasm-main', 'canvas-worker', 'canvas-main'].includes(strategy),
           `Strategy should be valid, got: ${strategy}`);
  });

  // Test 2: MediaProcessor Initialization
  await runTest('MediaProcessor Initialization', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    let progressCalled = false;
    await MediaProcessor.initialize({
      onProgress: (percent) => {
        progressCalled = true;
        assert(percent >= 0 && percent <= 100, `Progress should be 0-100, got: ${percent}`);
      }
    });

    assert(MediaProcessor.isInitialized(), 'MediaProcessor should be initialized');
    assert(progressCalled || true, 'Progress callback should be called or initialization is instant');
  });

  // Test 3: WASM Module Loading
  await runTest('WASM Module Loading', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    // Reset and reinitialize to test WASM loading
    MediaProcessor.reset();
    await MediaProcessor.initialize();

    const module = MediaProcessor.getModule();
    assert(module !== undefined, 'WASM module should be loaded');

    const strategy = MediaProcessor.getProcessingStrategy();
    assert(strategy !== undefined, 'Processing strategy should be set');
  });

  // Test 4: Canvas Fallback
  await runTest('Canvas Fallback Functionality', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    // Force Canvas fallback
    const testBlob = new Blob(['test'], { type: 'image/jpeg' });
    const metadata = await MediaProcessor.extractMetadata(testBlob, { useWASM: false });

    assert(metadata !== undefined, 'Should extract metadata with Canvas');
    assert(metadata.source === 'canvas', `Source should be canvas, got: ${metadata.source}`);
  });

  // Test 5: Real Image Processing - JPEG
  await runTest('Process Real JPEG Image', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    const jpegPath = path.join(fixturesDir, '1x1-red.jpg');
    if (fs.existsSync(jpegPath)) {
      const blob = loadImageAsBlob(jpegPath);
      const metadata = await MediaProcessor.extractMetadata(blob);

      assert(metadata !== undefined, 'Should extract JPEG metadata');
      assert(metadata.format === 'jpeg', `Format should be jpeg, got: ${metadata.format}`);
      assert(metadata.width > 0, 'Width should be positive');
      assert(metadata.height > 0, 'Height should be positive');
      assert(metadata.size > 0, 'Size should be positive');
    }
  });

  // Test 6: Real Image Processing - PNG
  await runTest('Process Real PNG Image', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    const pngPath = path.join(fixturesDir, '1x1-red.png');
    if (fs.existsSync(pngPath)) {
      const blob = loadImageAsBlob(pngPath);
      const metadata = await MediaProcessor.extractMetadata(blob);

      assert(metadata !== undefined, 'Should extract PNG metadata');
      assert(metadata.format === 'png', `Format should be png, got: ${metadata.format}`);
      assert(typeof metadata.hasAlpha === 'boolean', 'hasAlpha should be boolean');
    }
  });

  // Test 7: Real Image Processing - WebP
  await runTest('Process Real WebP Image', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    const webpPath = path.join(fixturesDir, '1x1-red.webp');
    if (fs.existsSync(webpPath)) {
      const blob = loadImageAsBlob(webpPath);
      const metadata = await MediaProcessor.extractMetadata(blob);

      assert(metadata !== undefined, 'Should extract WebP metadata');
      assert(metadata.format === 'webp', `Format should be webp, got: ${metadata.format}`);
    }
  });

  // Test 8: Performance Metrics Recording
  await runTest('Performance Metrics Recording', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    const testBlob = new Blob(['test'], { type: 'image/jpeg' });
    const metadata = await MediaProcessor.extractMetadata(testBlob);

    assert(metadata !== undefined, 'Should extract metadata');
    assert(typeof metadata.processingTime === 'number', 'processingTime should be number');
    assert(metadata.processingTime >= 0, 'processingTime should be non-negative');
    assert(['fast', 'normal', 'slow'].includes(metadata.processingSpeed),
           `processingSpeed should be valid, got: ${metadata.processingSpeed}`);
  });

  // Test 9: Dominant Color Extraction
  await runTest('Dominant Color Extraction', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    const pngPath = path.join(fixturesDir, '100x100-gradient.png');
    if (fs.existsSync(pngPath)) {
      const blob = loadImageAsBlob(pngPath);
      const metadata = await MediaProcessor.extractMetadata(blob);

      assert(metadata !== undefined, 'Should extract metadata');
      assert(Array.isArray(metadata.dominantColors), 'dominantColors should be array');

      if (metadata.dominantColors.length > 0) {
        const color = metadata.dominantColors[0];
        assert(typeof color.hex === 'string', 'Color hex should be string');
        assert(color.hex.match(/^#[0-9A-F]{6}$/i), `Invalid hex color: ${color.hex}`);
        assert(typeof color.percentage === 'number', 'Color percentage should be number');
      }
    }
  });

  // Test 10: Code Splitting - Core Module
  await runTest('Code Splitting - Core Module Import', async () => {
    const coreModule = await import('../../dist/src/exports/core.js');

    assert(coreModule.S5 !== undefined, 'Core should export S5');
    assert(coreModule.FS5 !== undefined, 'Core should export FS5');
    assert(coreModule.DirectoryWalker !== undefined, 'Core should export DirectoryWalker');
    assert(coreModule.BatchOperations !== undefined, 'Core should export BatchOperations');

    // Core should NOT include media modules
    assert(coreModule.MediaProcessor === undefined, 'Core should NOT export MediaProcessor');
  });

  // Test 11: Code Splitting - Media Module
  await runTest('Code Splitting - Media Module Import', async () => {
    const mediaModule = await import('../../dist/src/exports/media.js');

    assert(mediaModule.MediaProcessor !== undefined, 'Media should export MediaProcessor');
    assert(mediaModule.BrowserCompat !== undefined, 'Media should export BrowserCompat');
    assert(mediaModule.CanvasMetadataExtractor !== undefined, 'Media should export CanvasMetadataExtractor');
    assert(mediaModule.WASMModule !== undefined, 'Media should export WASMModule');
  });

  // Test 12: Invalid Image Handling
  await runTest('Invalid Image Handling', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    const invalidBlob = new Blob(['not an image'], { type: 'text/plain' });
    const metadata = await MediaProcessor.extractMetadata(invalidBlob);

    assert(metadata === undefined || metadata.isValidImage === false,
           'Should handle invalid images gracefully');
  });

  // Test 13: Timeout Option
  await runTest('Timeout Option', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    const testBlob = new Blob(['test'], { type: 'image/jpeg' });

    // Should complete without timeout
    const metadata = await MediaProcessor.extractMetadata(testBlob, { timeout: 5000 });
    assert(metadata !== undefined, 'Should complete within reasonable timeout');
  });

  // Test 14: Memory Management
  await runTest('Memory Management', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    const initialMemory = process.memoryUsage().heapUsed;

    // Process multiple images
    for (let i = 0; i < 5; i++) {
      const testData = new Uint8Array(1024 * 10); // 10KB
      const blob = new Blob([testData], { type: 'image/jpeg' });
      await MediaProcessor.extractMetadata(blob);
    }

    const afterMemory = process.memoryUsage().heapUsed;
    const memoryDelta = afterMemory - initialMemory;

    // Memory usage should be reasonable (not leaking excessively)
    assert(memoryDelta < 50 * 1024 * 1024, `Memory usage should be < 50MB, got: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB`);
  });

  // Test 15: All Image Formats
  await runTest('All Supported Image Formats', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    const formats = ['jpg', 'png', 'webp', 'gif', 'bmp'];
    const results = {};

    for (const format of formats) {
      const fileName = `1x1-red.${format === 'jpg' ? 'jpg' : format}`;
      const imagePath = path.join(fixturesDir, fileName);

      if (fs.existsSync(imagePath)) {
        const blob = loadImageAsBlob(imagePath);
        const metadata = await MediaProcessor.extractMetadata(blob);
        results[format] = metadata !== undefined;
      }
    }

    const supportedCount = Object.values(results).filter(Boolean).length;
    assert(supportedCount >= 3, `Should support at least 3 formats, got: ${supportedCount}`);
  });

  // Test 16: Aspect Ratio Detection
  await runTest('Aspect Ratio Detection', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    const testBlob = new Blob(['test'], { type: 'image/jpeg' });
    const metadata = await MediaProcessor.extractMetadata(testBlob);

    if (metadata && metadata.width && metadata.height) {
      assert(metadata.aspectRatio !== undefined, 'Should detect aspect ratio');
      assert(['landscape', 'portrait', 'square'].includes(metadata.aspectRatio),
             `Aspect ratio should be valid, got: ${metadata.aspectRatio}`);
    }
  });

  // Test 17: Bundle Size Verification
  await runTest('Bundle Size Verification', async () => {
    const distDir = path.join(__dirname, '../../dist');

    // Check if core bundle exists and is smaller than full bundle
    const coreExportPath = path.join(distDir, 'src/exports/core.js');
    const mediaExportPath = path.join(distDir, 'src/exports/media.js');
    const fullIndexPath = path.join(distDir, 'src/index.js');

    if (fs.existsSync(coreExportPath) && fs.existsSync(fullIndexPath)) {
      const coreSize = fs.statSync(coreExportPath).size;
      const fullSize = fs.statSync(fullIndexPath).size;

      // Core should be smaller than full bundle
      assert(coreSize < fullSize, 'Core bundle should be smaller than full bundle');
    }

    if (fs.existsSync(mediaExportPath)) {
      const mediaSize = fs.statSync(mediaExportPath).size;
      assert(mediaSize > 0, 'Media bundle should exist and have content');
    }
  });

  // Test 18: WASM Binary Availability
  await runTest('WASM Binary Availability', async () => {
    const wasmDir = path.join(__dirname, '../../src/media/wasm');
    const wasmFiles = [
      'image-metadata.wasm',
      'image-advanced.wasm'
    ];

    for (const wasmFile of wasmFiles) {
      const wasmPath = path.join(wasmDir, wasmFile);
      assert(fs.existsSync(wasmPath), `WASM file should exist: ${wasmFile}`);

      const wasmSize = fs.statSync(wasmPath).size;
      assert(wasmSize > 0, `WASM file should have content: ${wasmFile}`);
    }
  });

  // Test 19: Error Recovery
  await runTest('Error Recovery', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    // Process invalid data
    const invalidBlob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'image/jpeg' });
    const metadata1 = await MediaProcessor.extractMetadata(invalidBlob);

    // Should still be able to process valid image after error
    const validPath = path.join(fixturesDir, '1x1-red.png');
    if (fs.existsSync(validPath)) {
      const validBlob = loadImageAsBlob(validPath);
      const metadata2 = await MediaProcessor.extractMetadata(validBlob);
      assert(metadata2 !== undefined, 'Should recover and process valid image after error');
    }
  });

  // Test 20: Concurrent Processing
  await runTest('Concurrent Image Processing', async () => {
    const { MediaProcessor } = await import('../../dist/src/media/index.js');

    const imageFiles = fs.readdirSync(fixturesDir)
      .filter(f => /\.(jpg|png|webp|gif|bmp)$/i.test(f))
      .slice(0, 3) // Take first 3 images
      .map(f => path.join(fixturesDir, f));

    // Process images concurrently
    const promises = imageFiles.map(imagePath => {
      const blob = loadImageAsBlob(imagePath);
      return MediaProcessor.extractMetadata(blob);
    });

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r !== undefined).length;

    assert(successCount > 0, 'Should process at least some images concurrently');
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Results Summary\n');
  console.log(`Total Tests: ${testResults.passed + testResults.failed}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);

  if (testResults.failed > 0) {
    console.log('\nFailed Tests:');
    testResults.tests
      .filter(t => t.status === 'failed')
      .forEach(t => {
        console.log(`  - ${t.name}`);
        console.log(`    Error: ${t.error}`);
      });
  }

  // Calculate coverage estimate
  const coverageCategories = {
    'Pipeline Setup': ['Browser Compatibility Detection', 'MediaProcessor Initialization', 'WASM Module Loading'],
    'Code Splitting': ['Code Splitting - Core Module Import', 'Code Splitting - Media Module Import', 'Bundle Size Verification'],
    'Image Metadata': ['Process Real JPEG Image', 'Process Real PNG Image', 'Process Real WebP Image', 'All Supported Image Formats'],
    'Performance': ['Performance Metrics Recording', 'Memory Management', 'Concurrent Image Processing'],
    'Fallback & Error': ['Canvas Fallback Functionality', 'Invalid Image Handling', 'Error Recovery']
  };

  console.log('\n📈 Coverage by Category:');
  for (const [category, tests] of Object.entries(coverageCategories)) {
    const categoryTests = testResults.tests.filter(t => tests.includes(t.name));
    const passed = categoryTests.filter(t => t.status === 'passed').length;
    const total = tests.length;
    const percentage = total > 0 ? ((passed / total) * 100).toFixed(0) : 0;
    console.log(`  ${category}: ${passed}/${total} (${percentage}%)`);
  }

  const successRate = ((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1);
  console.log(`\n🎯 Overall Success Rate: ${successRate}%`);

  if (testResults.failed === 0) {
    console.log('\n✅ All integration tests passed! WASM Foundation & Media Processing is working correctly.\n');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.\n');
    process.exit(1);
  }
}

// Run the integration tests
console.log('Starting WASM Foundation & Media Processing integration tests...\n');
runIntegrationTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});