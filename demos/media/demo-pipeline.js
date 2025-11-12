#!/usr/bin/env node

/**
 * Pipeline Setup Demonstration for WASM Foundation & Media Processing
 *
 * This demo shows:
 * - WASM module initialization with progress tracking
 * - Browser capability detection
 * - Strategy selection (wasm-worker, wasm-main, canvas-worker, canvas-main)
 * - Memory management and cleanup
 * - Fallback handling
 */

// Load Node.js browser API polyfills first
import './node-polyfills.js';

import { MediaProcessor, BrowserCompat, WASMLoader, CanvasMetadataExtractor } from '@julesl23/s5js/media';

console.log('🚀 Media Processing Pipeline Setup Demo\n');
console.log('=========================================\n');

// Track initialization steps
const pipelineSteps = [];

/**
 * Step 1: Browser/Environment Capability Detection
 */
async function demonstrateCapabilityDetection() {
  console.log('📋 Step 1: Detecting Environment Capabilities\n');

  const startTime = performance.now();
  const capabilities = await BrowserCompat.checkCapabilities();
  const detectionTime = performance.now() - startTime;

  console.log('Capabilities detected:');
  console.log('├── WebAssembly Support:', capabilities.webAssembly ? '✅ Available' : '❌ Not Available');
  console.log('├── WebAssembly Streaming:', capabilities.webAssemblyStreaming ? '✅ Available' : '❌ Not Available');
  console.log('├── SharedArrayBuffer:', capabilities.sharedArrayBuffer ? '✅ Available' : '❌ Not Available');
  console.log('├── Web Workers:', capabilities.webWorkers ? '✅ Available' : '❌ Not Available');
  console.log('├── OffscreenCanvas:', capabilities.offscreenCanvas ? '✅ Available' : '❌ Not Available');
  console.log('├── CreateImageBitmap:', capabilities.createImageBitmap ? '✅ Available' : '❌ Not Available');
  console.log('├── WebP Support:', capabilities.webP ? '✅ Available' : '❌ Not Available');
  console.log('├── AVIF Support:', capabilities.avif ? '✅ Available' : '❌ Not Available');
  console.log('├── WebGL:', capabilities.webGL ? '✅ Available' : '❌ Not Available');
  console.log('├── WebGL2:', capabilities.webGL2 ? '✅ Available' : '❌ Not Available');
  console.log('├── Performance API:', capabilities.performanceAPI ? '✅ Available' : '❌ Not Available');
  console.log('├── Memory Info:', capabilities.memoryInfo ? '✅ Available' : '❌ Not Available');
  console.log('└── Memory Limit:', `${capabilities.memoryLimit}MB`);

  console.log(`\n⏱️  Detection completed in ${detectionTime.toFixed(2)}ms\n`);

  pipelineSteps.push({
    step: 'Capability Detection',
    time: detectionTime,
    result: capabilities
  });

  return capabilities;
}

/**
 * Step 2: Strategy Selection
 */
function demonstrateStrategySelection(capabilities) {
  console.log('🎯 Step 2: Selecting Processing Strategy\n');

  const strategy = BrowserCompat.selectProcessingStrategy(capabilities);
  const recommendations = BrowserCompat.getOptimizationRecommendations(capabilities);

  console.log(`Selected Strategy: ${strategy}`);
  console.log('\nStrategy Decision Tree:');

  if (capabilities.webAssembly) {
    if (capabilities.webWorkers) {
      if (capabilities.offscreenCanvas) {
        console.log('  ✅ WASM + Workers + OffscreenCanvas → wasm-worker (optimal)');
      } else {
        console.log('  ✅ WASM + Workers → wasm-worker (good)');
      }
    } else {
      console.log('  ⚠️  WASM without Workers → wasm-main (may block UI)');
    }
  } else {
    if (capabilities.webWorkers && capabilities.offscreenCanvas) {
      console.log('  🎨 No WASM but Workers + OffscreenCanvas → canvas-worker');
    } else {
      console.log('  🎨 Fallback → canvas-main (basic compatibility)');
    }
  }

  if (recommendations.length > 0) {
    console.log('\n📝 Optimization Recommendations:');
    recommendations.forEach(rec => console.log(`  - ${rec}`));
  }

  console.log();

  pipelineSteps.push({
    step: 'Strategy Selection',
    strategy,
    recommendations
  });

  return strategy;
}

/**
 * Step 3: WASM Module Initialization
 */
async function demonstrateWASMInitialization() {
  console.log('🔧 Step 3: WASM Module Initialization\n');

  const initSteps = [];
  let lastProgress = 0;

  console.log('Initializing MediaProcessor with progress tracking:');

  const initStart = performance.now();

  try {
    await MediaProcessor.initialize({
      onProgress: (percent) => {
        // Show progress bar
        const filled = Math.floor(percent / 5);
        const empty = 20 - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        process.stdout.write(`\r  [${bar}] ${percent}%`);

        // Track progress steps
        if (percent > lastProgress) {
          initSteps.push({
            progress: percent,
            time: performance.now() - initStart
          });
          lastProgress = percent;
        }
      }
    });

    const initTime = performance.now() - initStart;
    console.log(`\n  ✅ WASM module initialized successfully in ${initTime.toFixed(2)}ms\n`);

    // Show initialization phases
    console.log('Initialization Phases:');
    console.log('├── Module Loading: ~10% (Fetching WASM binary)');
    console.log('├── Streaming Compilation: ~50% (WebAssembly.instantiateStreaming)');
    console.log('├── Memory Allocation: ~70% (256 pages initial, 4096 max)');
    console.log('├── Export Binding: ~90% (Linking WASM functions)');
    console.log('└── Ready: 100% (Module ready for use)\n');

    pipelineSteps.push({
      step: 'WASM Initialization',
      time: initTime,
      success: true,
      phases: initSteps
    });

    return true;
  } catch (error) {
    console.log('\n  ❌ WASM initialization failed:', error.message);
    console.log('  🎨 Falling back to Canvas implementation\n');

    pipelineSteps.push({
      step: 'WASM Initialization',
      success: false,
      fallback: 'canvas',
      error: error.message
    });

    return false;
  }
}

/**
 * Step 4: Memory Management Demo
 */
async function demonstrateMemoryManagement() {
  console.log('💾 Step 4: Memory Management\n');

  const initialMemory = process.memoryUsage();
  console.log('Initial Memory State:');
  console.log(`  Heap Used: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  console.log(`  Heap Total: ${(initialMemory.heapTotal / 1024 / 1024).toFixed(2)}MB`);

  // Process a test image to allocate memory
  console.log('\nProcessing test image to demonstrate memory allocation...');

  const testImageData = new Uint8Array(1024 * 100); // 100KB test image
  const blob = new Blob([testImageData], { type: 'image/jpeg' });

  await MediaProcessor.extractMetadata(blob);

  const afterProcessing = process.memoryUsage();
  console.log('\nAfter Processing:');
  console.log(`  Heap Used: ${(afterProcessing.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  console.log(`  Delta: +${((afterProcessing.heapUsed - initialMemory.heapUsed) / 1024).toFixed(2)}KB`);

  // Trigger garbage collection if available
  if (global.gc) {
    console.log('\nTriggering garbage collection...');
    global.gc();

    const afterGC = process.memoryUsage();
    console.log('After Cleanup:');
    console.log(`  Heap Used: ${(afterGC.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Reclaimed: ${((afterProcessing.heapUsed - afterGC.heapUsed) / 1024).toFixed(2)}KB`);
  }

  console.log('\n✅ Memory management demonstration complete\n');

  pipelineSteps.push({
    step: 'Memory Management',
    initialMemory: initialMemory.heapUsed,
    afterProcessing: afterProcessing.heapUsed,
    memoryDelta: afterProcessing.heapUsed - initialMemory.heapUsed
  });
}

/**
 * Step 5: Fallback Handling Demo
 */
async function demonstrateFallbackHandling() {
  console.log('🔄 Step 5: Fallback Handling\n');

  console.log('Testing fallback scenarios:\n');

  // Test 1: Force Canvas fallback
  console.log('1. Forcing Canvas fallback:');
  const blob = new Blob(['test'], { type: 'image/jpeg' });

  const canvasStart = performance.now();
  const canvasResult = await MediaProcessor.extractMetadata(blob, { useWASM: false });
  const canvasTime = performance.now() - canvasStart;

  console.log(`   ✅ Canvas extraction completed in ${canvasTime.toFixed(2)}ms`);
  console.log(`   Source: ${canvasResult?.source || 'unknown'}\n`);

  // Test 2: Timeout handling
  console.log('2. Testing timeout handling:');
  try {
    await MediaProcessor.extractMetadata(blob, { timeout: 1 });
    console.log('   Timeout test completed');
  } catch (error) {
    console.log('   ✅ Timeout properly triggered');
  }

  // Test 3: Invalid image handling
  console.log('\n3. Testing invalid image handling:');
  const invalidBlob = new Blob(['not an image'], { type: 'text/plain' });
  const invalidResult = await MediaProcessor.extractMetadata(invalidBlob);

  if (!invalidResult) {
    console.log('   ✅ Invalid image properly rejected');
  } else {
    console.log('   ⚠️  Unexpected result for invalid image');
  }

  console.log('\n✅ Fallback handling demonstration complete\n');

  pipelineSteps.push({
    step: 'Fallback Handling',
    canvasTime,
    testsCompleted: 3
  });
}

/**
 * Step 6: Pipeline Summary
 */
function showPipelineSummary() {
  console.log('📊 Pipeline Setup Summary\n');
  console.log('========================\n');

  let totalTime = 0;
  pipelineSteps.forEach((step, index) => {
    console.log(`${index + 1}. ${step.step}`);
    if (step.time) {
      console.log(`   Time: ${step.time.toFixed(2)}ms`);
      totalTime += step.time;
    }
    if (step.strategy) {
      console.log(`   Strategy: ${step.strategy}`);
    }
    if (step.success !== undefined) {
      console.log(`   Success: ${step.success ? '✅' : '❌'}`);
    }
    console.log();
  });

  console.log(`Total Setup Time: ${totalTime.toFixed(2)}ms\n`);

  // Show pipeline flow diagram
  console.log('Pipeline Flow Diagram:');
  console.log('┌─────────────────────┐');
  console.log('│ Environment Detect  │');
  console.log('└──────────┬──────────┘');
  console.log('           ▼');
  console.log('┌─────────────────────┐');
  console.log('│ Strategy Selection  │');
  console.log('└──────────┬──────────┘');
  console.log('           ▼');
  console.log('┌─────────────────────┐');
  console.log('│   WASM Available?   │');
  console.log('└────┬──────────┬─────┘');
  console.log('   Yes│         │No');
  console.log('      ▼         ▼');
  console.log('┌──────────┐ ┌──────────┐');
  console.log('│   WASM   │ │  Canvas  │');
  console.log('│  Module  │ │ Fallback │');
  console.log('└─────┬────┘ └─────┬────┘');
  console.log('      └──────┬──────┘');
  console.log('             ▼');
  console.log('   ┌─────────────────┐');
  console.log('   │  Image Process  │');
  console.log('   └─────────────────┘\n');
}

/**
 * Run the complete pipeline demonstration
 */
async function runPipelineDemo() {
  try {
    // Step 1: Capability Detection
    const capabilities = await demonstrateCapabilityDetection();

    // Step 2: Strategy Selection
    const strategy = demonstrateStrategySelection(capabilities);

    // Step 3: WASM Initialization
    const wasmInitialized = await demonstrateWASMInitialization();

    // Step 4: Memory Management
    await demonstrateMemoryManagement();

    // Step 5: Fallback Handling
    await demonstrateFallbackHandling();

    // Step 6: Summary
    showPipelineSummary();

    console.log('✅ Pipeline setup demonstration complete!\n');
    console.log(`🎯 Ready to process images with strategy: ${strategy}\n`);

  } catch (error) {
    console.error('❌ Pipeline demo error:', error);
    process.exit(1);
  }
}

// Run the demo
console.log('Starting pipeline demonstration...\n');
runPipelineDemo();