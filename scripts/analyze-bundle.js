#!/usr/bin/env node

/**
 * Bundle size analysis script
 * Measures and reports the size of different build outputs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import zlib from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Get gzipped size
 */
function getGzippedSize(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    const gzipped = zlib.gzipSync(content);
    return gzipped.length;
  } catch {
    return 0;
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Analyze a directory
 */
function analyzeDirectory(dirPath, name) {
  const files = [];
  let totalSize = 0;
  let totalGzipped = 0;

  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;

    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (item.endsWith('.js')) {
        const size = getFileSize(fullPath);
        const gzipped = getGzippedSize(fullPath);
        const relative = path.relative(distDir, fullPath);

        files.push({
          path: relative,
          size,
          gzipped
        });

        totalSize += size;
        totalGzipped += gzipped;
      }
    }
  }

  walkDir(dirPath);

  return {
    name,
    files,
    totalSize,
    totalGzipped
  };
}

/**
 * Main analysis
 */
function analyze() {
  console.log('📊 Bundle Size Analysis\n');
  console.log('=' .repeat(60));

  // Build the project first
  console.log('Building project...');
  try {
    execSync('npm run build', { cwd: rootDir, stdio: 'pipe' });
    console.log('✅ Build complete\n');
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }

  // Analyze different parts
  const analyses = [
    analyzeDirectory(path.join(distDir, 'src'), 'Full Bundle'),
    analyzeDirectory(path.join(distDir, 'src', 'media'), 'Media Module'),
    analyzeDirectory(path.join(distDir, 'src', 'fs'), 'File System'),
    analyzeDirectory(path.join(distDir, 'src', 'api'), 'API Module'),
    analyzeDirectory(path.join(distDir, 'src', 'node'), 'Node Module'),
    analyzeDirectory(path.join(distDir, 'src', 'identity'), 'Identity Module')
  ];

  // Print results
  for (const analysis of analyses) {
    console.log(`\n📦 ${analysis.name}`);
    console.log('-'.repeat(40));

    if (analysis.files.length === 0) {
      console.log('No files found');
      continue;
    }

    // Sort files by size
    const topFiles = analysis.files
      .sort((a, b) => b.size - a.size)
      .slice(0, 5);

    console.log('Top files:');
    for (const file of topFiles) {
      console.log(`  ${file.path}`);
      console.log(`    Raw: ${formatBytes(file.size)} | Gzipped: ${formatBytes(file.gzipped)}`);
    }

    console.log(`\nTotal: ${formatBytes(analysis.totalSize)} (${formatBytes(analysis.totalGzipped)} gzipped)`);
    console.log(`Files: ${analysis.files.length}`);
  }

  // Bundle size recommendations
  console.log('\n' + '='.repeat(60));
  console.log('📈 Size Optimization Recommendations:\n');

  const fullBundle = analyses[0];
  const mediaModule = analyses[1];

  const mediaPercentage = ((mediaModule.totalSize / fullBundle.totalSize) * 100).toFixed(1);

  console.log(`• Media module is ${mediaPercentage}% of total bundle`);

  if (mediaModule.totalSize > 50000) {
    console.log(`  ⚠️  Consider lazy-loading media features (currently ${formatBytes(mediaModule.totalSize)})`);
  } else {
    console.log(`  ✅ Media module size is reasonable`);
  }

  if (fullBundle.totalGzipped > 200000) {
    console.log(`• ⚠️  Bundle size exceeds 200KB gzipped (${formatBytes(fullBundle.totalGzipped)})`);
    console.log('  Consider:');
    console.log('  - Code splitting with dynamic imports');
    console.log('  - Tree shaking unused exports');
    console.log('  - Minification in production');
  } else {
    console.log(`• ✅ Bundle size is within limits (${formatBytes(fullBundle.totalGzipped)} gzipped)`);
  }

  // Export paths analysis
  console.log('\n📤 Export Paths:');
  const exportPaths = [
    { path: 'Main (index.js)', file: path.join(distDir, 'src', 'index.js') },
    { path: 'Core only', file: path.join(distDir, 'src', 'exports', 'core.js') },
    { path: 'Media only', file: path.join(distDir, 'src', 'exports', 'media.js') }
  ];

  for (const exp of exportPaths) {
    const size = getFileSize(exp.file);
    const gzipped = getGzippedSize(exp.file);
    if (size > 0) {
      console.log(`  ${exp.path}: ${formatBytes(size)} (${formatBytes(gzipped)} gzipped)`);
    }
  }

  console.log('\n✨ Analysis complete!');
}

// Run analysis
analyze();