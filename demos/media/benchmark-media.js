#!/usr/bin/env node

/**
 * Performance Benchmark Demo for WASM Foundation & Media Processing
 *
 * This demo:
 * - Loads test images from fixtures
 * - Processes each with both WASM and Canvas strategies
 * - Records baseline performance metrics
 * - Generates comparison reports
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MediaProcessor } from '../../dist/src/media/index.js';
import { BrowserCompat } from '../../dist/src/media/compat/browser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test images directory
const fixturesDir = path.join(__dirname, '../../test/fixtures/images');

// Performance results
const results = {
  timestamp: new Date().toISOString(),
  platform: process.platform,
  nodeVersion: process.version,
  strategies: {},
  formats: {},
  baseline: {}
};

/**
 * Load an image file as a Blob
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
 * Benchmark a single image with a specific strategy
 */
async function benchmarkImage(imagePath, strategy) {
  const imageName = path.basename(imagePath);
  const blob = loadImageAsBlob(imagePath);

  console.log(`  Processing ${imageName} with ${strategy}...`);

  // Force specific strategy
  const useWASM = strategy === 'wasm';

  // Measure processing time
  const startTime = performance.now();
  const startMemory = process.memoryUsage();

  try {
    const metadata = await MediaProcessor.extractMetadata(blob, { useWASM });

    const endTime = performance.now();
    const endMemory = process.memoryUsage();

    const processingTime = endTime - startTime;
    const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;

    return {
      success: true,
      image: imageName,
      strategy,
      format: metadata?.format || 'unknown',
      dimensions: metadata ? `${metadata.width}x${metadata.height}` : 'unknown',
      processingTime: processingTime.toFixed(2),
      processingSpeed: metadata?.processingSpeed || 'unknown',
      memoryUsed: Math.max(0, memoryUsed),
      source: metadata?.source || 'unknown',
      hasColors: !!(metadata?.dominantColors?.length > 0),
      fileSize: blob.size
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      success: false,
      image: imageName,
      strategy,
      processingTime: (endTime - startTime).toFixed(2),
      error: error.message
    };
  }
}

/**
 * Run benchmarks for all images
 */
async function runBenchmarks() {
  console.log('🚀 WASM Foundation & Media Processing Benchmark\n');
  console.log('================================================\n');

  // Check capabilities
  console.log('📊 Checking Browser/Node Capabilities...\n');
  const capabilities = await BrowserCompat.checkCapabilities();
  const strategy = BrowserCompat.selectProcessingStrategy(capabilities);

  console.log('Capabilities detected:');
  console.log(`  - WebAssembly: ${capabilities.webAssembly ? '✅' : '❌'}`);
  console.log(`  - WebAssembly Streaming: ${capabilities.webAssemblyStreaming ? '✅' : '❌'}`);
  console.log(`  - Web Workers: ${capabilities.webWorkers ? '✅' : '❌'}`);
  console.log(`  - Performance API: ${capabilities.performanceAPI ? '✅' : '❌'}`);
  console.log(`  - Recommended Strategy: ${strategy}\n`);

  results.capabilities = capabilities;
  results.recommendedStrategy = strategy;

  // Initialize MediaProcessor
  console.log('🔧 Initializing MediaProcessor...\n');
  const initStart = performance.now();

  await MediaProcessor.initialize({
    onProgress: (percent) => {
      process.stdout.write(`\r  Loading WASM: ${percent}%`);
    }
  });

  const initTime = performance.now() - initStart;
  console.log(`\n  ✅ Initialized in ${initTime.toFixed(2)}ms\n`);
  results.initializationTime = initTime;

  // Get test images
  const imageFiles = fs.readdirSync(fixturesDir)
    .filter(f => /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(f))
    .map(f => path.join(fixturesDir, f));

  console.log(`📁 Found ${imageFiles.length} test images\n`);

  // Benchmark each image with both strategies
  console.log('⚡ Running Performance Benchmarks...\n');

  const allResults = [];

  for (const strategy of ['wasm', 'canvas']) {
    console.log(`\n🔄 Testing with ${strategy.toUpperCase()} strategy:\n`);
    results.strategies[strategy] = [];

    for (const imagePath of imageFiles) {
      const result = await benchmarkImage(imagePath, strategy);
      allResults.push(result);
      results.strategies[strategy].push(result);

      // Track by format
      const format = result.format || 'unknown';
      if (!results.formats[format]) {
        results.formats[format] = [];
      }
      results.formats[format].push(result);
    }
  }

  // Calculate baselines
  console.log('\n\n📈 Calculating Baseline Metrics...\n');

  const wasmResults = results.strategies.wasm.filter(r => r.success);
  const canvasResults = results.strategies.canvas.filter(r => r.success);

  if (wasmResults.length > 0) {
    const wasmTimes = wasmResults.map(r => parseFloat(r.processingTime));
    results.baseline.wasm = {
      avgTime: (wasmTimes.reduce((a, b) => a + b, 0) / wasmTimes.length).toFixed(2),
      minTime: Math.min(...wasmTimes).toFixed(2),
      maxTime: Math.max(...wasmTimes).toFixed(2),
      successRate: ((wasmResults.length / results.strategies.wasm.length) * 100).toFixed(1)
    };
  }

  if (canvasResults.length > 0) {
    const canvasTimes = canvasResults.map(r => parseFloat(r.processingTime));
    results.baseline.canvas = {
      avgTime: (canvasTimes.reduce((a, b) => a + b, 0) / canvasTimes.length).toFixed(2),
      minTime: Math.min(...canvasTimes).toFixed(2),
      maxTime: Math.max(...canvasTimes).toFixed(2),
      successRate: ((canvasResults.length / results.strategies.canvas.length) * 100).toFixed(1)
    };
  }

  // Display results table
  console.log('📊 Performance Comparison:\n');
  console.log('┌─────────────────┬────────────┬────────────┬──────────┬──────────────┐');
  console.log('│ Image           │ Format     │ WASM (ms)  │ Canvas   │ Speed        │');
  console.log('├─────────────────┼────────────┼────────────┼──────────┼──────────────┤');

  for (const imagePath of imageFiles) {
    const imageName = path.basename(imagePath);
    const wasmResult = results.strategies.wasm.find(r => r.image === imageName);
    const canvasResult = results.strategies.canvas.find(r => r.image === imageName);

    const displayName = imageName.padEnd(15).substring(0, 15);
    const format = (wasmResult?.format || 'unknown').padEnd(10).substring(0, 10);
    const wasmTime = wasmResult?.success ?
      wasmResult.processingTime.padStart(10) :
      'Failed'.padStart(10);
    const canvasTime = canvasResult?.success ?
      canvasResult.processingTime.padStart(8) :
      'Failed'.padStart(8);
    const speed = wasmResult?.processingSpeed || 'unknown';

    console.log(`│ ${displayName} │ ${format} │ ${wasmTime} │ ${canvasTime} │ ${speed.padEnd(12)} │`);
  }

  console.log('└─────────────────┴────────────┴────────────┴──────────┴──────────────┘\n');

  // Display baseline summary
  console.log('📋 Baseline Performance Metrics:\n');

  if (results.baseline.wasm) {
    console.log('  WASM Strategy:');
    console.log(`    - Average: ${results.baseline.wasm.avgTime}ms`);
    console.log(`    - Min: ${results.baseline.wasm.minTime}ms`);
    console.log(`    - Max: ${results.baseline.wasm.maxTime}ms`);
    console.log(`    - Success Rate: ${results.baseline.wasm.successRate}%\n`);
  }

  if (results.baseline.canvas) {
    console.log('  Canvas Strategy:');
    console.log(`    - Average: ${results.baseline.canvas.avgTime}ms`);
    console.log(`    - Min: ${results.baseline.canvas.minTime}ms`);
    console.log(`    - Max: ${results.baseline.canvas.maxTime}ms`);
    console.log(`    - Success Rate: ${results.baseline.canvas.successRate}%\n`);
  }

  // Performance by format
  console.log('📐 Performance by Format:\n');
  for (const format of Object.keys(results.formats)) {
    const formatResults = results.formats[format].filter(r => r.success);
    if (formatResults.length > 0) {
      const times = formatResults.map(r => parseFloat(r.processingTime));
      const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2);
      console.log(`  ${format.toUpperCase()}: ${avg}ms average`);
    }
  }

  // Save results to file
  const outputPath = path.join(__dirname, 'baseline-performance.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log(`\n\n✅ Benchmark Complete!`);
  console.log(`📁 Results saved to: ${outputPath}\n`);

  // Summary
  const wasmFaster = results.baseline.wasm && results.baseline.canvas &&
    parseFloat(results.baseline.wasm.avgTime) < parseFloat(results.baseline.canvas.avgTime);

  if (wasmFaster) {
    const speedup = (parseFloat(results.baseline.canvas.avgTime) /
                    parseFloat(results.baseline.wasm.avgTime)).toFixed(2);
    console.log(`⚡ WASM is ${speedup}x faster than Canvas on average`);
  } else if (results.baseline.wasm && results.baseline.canvas) {
    const speedup = (parseFloat(results.baseline.wasm.avgTime) /
                    parseFloat(results.baseline.canvas.avgTime)).toFixed(2);
    console.log(`🎨 Canvas is ${speedup}x faster than WASM on average`);
  }

  console.log(`\n🎯 Recommended strategy for this environment: ${strategy}\n`);
}

// Run the benchmark
runBenchmarks().catch(console.error);