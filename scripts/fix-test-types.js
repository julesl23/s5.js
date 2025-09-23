#!/usr/bin/env node

/**
 * Fix missing memoryLimit and memoryInfo in test files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testFiles = [
  '../test/media/media-processor.test.ts',
  '../test/media/wasm-progress.test.ts',
  '../test/media/browser-compat.test.ts',
  '../test/media/browser-compat-integration.test.ts'
];

testFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  // Fix missing memoryLimit - add default 1024
  content = content.replace(
    /memoryInfo: false,\n(\s+)performanceAPI: true/g,
    'memoryInfo: false,\n$1performanceAPI: true,\n$1memoryLimit: 1024'
  );

  // Also fix cases where memoryLimit exists but memoryInfo is missing
  content = content.replace(
    /memoryLimit: (\d+),\n(\s+)performanceAPI: (true|false)/g,
    'memoryLimit: $1,\n$2performanceAPI: $3,\n$2memoryInfo: false'
  );

  // Fix cases where both are missing entirely
  content = content.replace(
    /performanceAPI: (true|false)\n(\s+)\}/g,
    'performanceAPI: $1,\n$2memoryLimit: 1024,\n$2memoryInfo: false\n$2}'
  );

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`Fixed: ${file}`);
});

console.log('Done fixing test types');