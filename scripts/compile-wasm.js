#!/usr/bin/env node

/**
 * Compile WebAssembly Text format to binary
 * This script compiles the WAT file to WASM using Node.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import wabt from 'wabt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function compileWat() {
  try {
    // Initialize wabt
    const wabtModule = await wabt();

    // Read the WAT file
    const watPath = join(__dirname, '..', 'src', 'media', 'wasm', 'image-metadata.wat');
    const watContent = readFileSync(watPath, 'utf8');

    console.log('Compiling WAT to WASM...');

    // Parse and compile
    const wasmModule = wabtModule.parseWat('image-metadata.wat', watContent);
    const { buffer } = wasmModule.toBinary({});

    // Write the WASM file
    const wasmPath = join(__dirname, '..', 'src', 'media', 'wasm', 'image-metadata.wasm');
    writeFileSync(wasmPath, buffer);

    console.log(`✅ WASM module compiled successfully!`);
    console.log(`   Size: ${buffer.length} bytes`);
    console.log(`   Output: ${wasmPath}`);

    // Also create a base64 encoded version for embedding
    const base64 = Buffer.from(buffer).toString('base64');
    const base64Path = join(__dirname, '..', 'src', 'media', 'wasm', 'image-metadata.wasm.base64');
    writeFileSync(base64Path, base64);
    console.log(`   Base64: ${base64Path}`);

  } catch (error) {
    console.error('❌ Failed to compile WASM:', error);
    process.exit(1);
  }
}

compileWat().catch(console.error);