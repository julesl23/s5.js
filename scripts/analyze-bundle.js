#!/usr/bin/env node

/**
 * Bundle Analysis Script for S5.js
 *
 * This script analyzes bundle sizes for different entry points:
 * - Core: File system operations without media processing
 * - Media: Media processing modules only
 * - Full: Complete SDK with all features
 *
 * Requirements from grant:
 * - Bundle size ≤ 700KB compressed (brotli)
 * - Code splitting for media modules
 * - Tree-shakeable exports
 */

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { gzipSync, brotliCompressSync, constants } from 'zlib';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Ensure dist directory exists
const distDir = join(rootDir, 'dist');
if (!existsSync(distDir)) {
  console.error('❌ Error: dist directory not found. Run `npm run build` first.');
  process.exit(1);
}

// Bundle configurations
const bundles = [
  {
    name: 'Core',
    entryPoint: 'dist/src/exports/core.js',
    description: 'File system operations without media processing',
    expectedMaxSizeKB: 400, // Core should be smaller
  },
  {
    name: 'Media',
    entryPoint: 'dist/src/exports/media.js',
    description: 'Media processing modules only',
    expectedMaxSizeKB: 300, // Media processing
  },
  {
    name: 'Advanced',
    entryPoint: 'dist/src/exports/advanced.js',
    description: 'Advanced CID-aware API with core functionality',
    expectedMaxSizeKB: 450, // Core + CID utilities
  },
  {
    name: 'Full',
    entryPoint: 'dist/src/index.js',
    description: 'Complete SDK with all features',
    expectedMaxSizeKB: 700, // Total budget from grant
  },
];

// Size formatting helper
function formatBytes(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(2)} KB`;
  }
  return `${(kb / 1024).toFixed(2)} MB`;
}

// Compression helpers
function compressGzip(content) {
  return gzipSync(content, { level: 9 });
}

function compressBrotli(content) {
  return brotliCompressSync(content, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
    }
  });
}

// Bundle a single entry point
async function bundleEntryPoint(config) {
  const { name, entryPoint, description } = config;
  const entryPath = resolve(rootDir, entryPoint);

  console.log(`\n📦 Bundling ${name}...`);
  console.log(`   Entry: ${entryPoint}`);

  try {
    const result = await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      minify: true,
      treeShaking: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      write: false,
      metafile: true,
      splitting: false, // For single bundle analysis
      // External Node.js dependencies (browser bundles don't include these)
      external: [
        'node:*', // All node: imports
        'url', // Node.js built-in
        'path', // Node.js built-in
        'fs', // Node.js built-in
        'undici', // Node.js HTTP client
        'ws', // WebSocket (Node.js)
        'memory-level', // Node.js storage
        'axios', // HTTP client (can be external)
        'express', // Server-only
        'cors', // Server-only
        'dotenv', // Server-only
      ],
      logLevel: 'warning',
    });

    if (result.outputFiles.length === 0) {
      throw new Error('No output files generated');
    }

    const output = result.outputFiles[0];
    const content = output.contents;

    // Calculate sizes
    const raw = content.length;
    const gzipped = compressGzip(content).length;
    const brotli = compressBrotli(content).length;

    // Extract metadata
    const inputs = Object.keys(result.metafile.inputs).length;

    return {
      name,
      description,
      entryPoint,
      sizes: {
        raw,
        gzipped,
        brotli,
      },
      metadata: {
        inputs,
        modules: Object.keys(result.metafile.outputs).length,
      },
      metafile: result.metafile,
    };
  } catch (error) {
    console.error(`❌ Failed to bundle ${name}:`, error.message);
    throw error;
  }
}

// Analyze tree-shaking effectiveness
function analyzeTreeShaking(results) {
  const full = results.find(r => r.name === 'Full');
  const core = results.find(r => r.name === 'Core');
  const media = results.find(r => r.name === 'Media');

  if (!full || !core || !media) {
    return null;
  }

  const coreSize = core.sizes.brotli;
  const mediaSize = media.sizes.brotli;
  const fullSize = full.sizes.brotli;

  // If tree-shaking works perfectly, full should be roughly core + media
  // In practice, there's some shared code, so full should be less
  const combined = coreSize + mediaSize;
  const savings = combined - fullSize;
  const efficiency = (savings / combined) * 100;

  return {
    coreSize,
    mediaSize,
    fullSize,
    combined,
    savings,
    efficiency,
  };
}

// Generate detailed report
function generateReport(results) {
  const reportDir = join(rootDir, 'docs');
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  let report = `# S5.js Bundle Analysis Report

**Generated:** ${timestamp}

## Executive Summary

This report analyzes bundle sizes for different entry points of the S5.js library to ensure compliance with the grant requirement of ≤ 700KB compressed.

`;

  // Summary table
  report += `## Bundle Sizes

| Bundle | Raw | Gzip | Brotli | Status |
|--------|-----|------|--------|--------|
`;

  results.forEach(result => {
    const { name, sizes } = result;
    const expectedMax = bundles.find(b => b.name === name)?.expectedMaxSizeKB || 700;
    const brotliKB = sizes.brotli / 1024;
    const status = brotliKB <= expectedMax ? '✅ Pass' : '❌ Fail';

    report += `| ${name} | ${formatBytes(sizes.raw)} | ${formatBytes(sizes.gzipped)} | ${formatBytes(sizes.brotli)} | ${status} |\n`;
  });

  // Tree-shaking analysis
  const treeShaking = analyzeTreeShaking(results);
  if (treeShaking) {
    report += `\n## Tree-Shaking Analysis

The modular export structure enables consumers to import only what they need:

- **Core only:** ${formatBytes(treeShaking.coreSize)} (excludes media processing)
- **Media only:** ${formatBytes(treeShaking.mediaSize)} (media processing modules)
- **Full bundle:** ${formatBytes(treeShaking.fullSize)} (all features)
- **Combined (Core + Media):** ${formatBytes(treeShaking.combined)}
- **Shared code savings:** ${formatBytes(treeShaking.savings)} (${treeShaking.efficiency.toFixed(1)}% efficiency)

`;
  }

  // Detailed breakdown
  report += `## Detailed Breakdown

`;

  results.forEach(result => {
    const { name, description, entryPoint, sizes, metadata } = result;
    report += `### ${name}

**Description:** ${description}

**Entry Point:** \`${entryPoint}\`

**Sizes:**
- Raw: ${formatBytes(sizes.raw)}
- Gzipped: ${formatBytes(sizes.gzipped)} (${((sizes.gzipped / sizes.raw) * 100).toFixed(1)}% of raw)
- Brotli: ${formatBytes(sizes.brotli)} (${((sizes.brotli / sizes.raw) * 100).toFixed(1)}% of raw)

**Metadata:**
- Input files: ${metadata.inputs}
- Output modules: ${metadata.modules}

`;
  });

  // Recommendations
  report += `## Recommendations

`;

  const fullBundle = results.find(r => r.name === 'Full');
  const fullBrotliKB = fullBundle ? fullBundle.sizes.brotli / 1024 : 0;

  if (fullBrotliKB <= 700) {
    report += `✅ **Full bundle size is within the 700KB limit** (${formatBytes(fullBundle.sizes.brotli)})\n\n`;
  } else {
    report += `❌ **Full bundle exceeds 700KB limit** (${formatBytes(fullBundle.sizes.brotli)})\n\n`;
    report += `### Optimization Suggestions:\n`;
    report += `1. Review large dependencies in the metafile\n`;
    report += `2. Consider lazy-loading additional modules\n`;
    report += `3. Audit imported utilities for redundancy\n`;
    report += `4. Check for duplicate code across modules\n\n`;
  }

  report += `### For Application Developers:

1. **Use modular imports** to reduce bundle size:
   \`\`\`javascript
   // Import only what you need
   import { S5, FS5 } from 's5/core';  // Smaller bundle
   import { MediaProcessor } from 's5/media';  // Add media when needed
   \`\`\`

2. **Lazy-load media processing** for optimal initial load:
   \`\`\`javascript
   // Media modules use dynamic imports internally
   const media = await import('s5/media');
   await media.MediaProcessor.initialize();
   \`\`\`

3. **Tree-shaking is enabled** - modern bundlers will eliminate unused code automatically.

`;

  // Grant compliance
  report += `## Grant Compliance

**Requirement:** Bundle size ≤ 700KB compressed (brotli)

**Status:** ${fullBrotliKB <= 700 ? '✅ **COMPLIANT**' : '❌ **NOT COMPLIANT**'}

- Full bundle (brotli): ${formatBytes(fullBundle.sizes.brotli)}
- Target: 700 KB
- ${fullBrotliKB <= 700 ? `Margin: ${formatBytes((700 * 1024) - fullBundle.sizes.brotli)} under budget` : `Overage: ${formatBytes(fullBundle.sizes.brotli - (700 * 1024))}`}

`;

  // Technical details
  report += `## Technical Implementation

### Code Splitting

The library uses a modular export structure with separate entry points:

1. **Main export** (\`s5\`): Full SDK with all features
2. **Core export** (\`s5/core\`): File system operations only
3. **Media export** (\`s5/media\`): Media processing with lazy loading
4. **Advanced export** (\`s5/advanced\`): CID-aware API for power users

### Lazy Loading

Media processing modules use dynamic imports to enable code splitting:

- \`MediaProcessorLazy\` loads the actual implementation on first use
- WASM modules are loaded only when needed
- Canvas fallback loads separately from WASM

### Tree-Shaking

- Package.json includes \`"sideEffects": false\`
- ES modules with proper export structure
- Modern bundlers can eliminate unused code

### Build Configuration

- **Target:** ES2022
- **Format:** ESM (ES modules)
- **Minification:** Enabled
- **Source maps:** Available for debugging
- **TypeScript:** Declarations generated

`;

  // Footer
  report += `---

*This report was automatically generated by \`scripts/analyze-bundle.js\`*
`;

  // Write report
  const reportPath = join(reportDir, 'BUNDLE_ANALYSIS.md');
  writeFileSync(reportPath, report, 'utf8');

  return reportPath;
}

// Generate JSON data for programmatic access
function generateJSON(results) {
  const reportDir = join(rootDir, 'docs');
  const jsonPath = join(reportDir, 'bundle-analysis.json');

  const data = {
    timestamp: new Date().toISOString(),
    bundles: results.map(r => ({
      name: r.name,
      description: r.description,
      entryPoint: r.entryPoint,
      sizes: {
        raw: r.sizes.raw,
        gzipped: r.sizes.gzipped,
        brotli: r.sizes.brotli,
      },
      metadata: r.metadata,
    })),
    treeShaking: analyzeTreeShaking(results),
    compliance: {
      target: 700 * 1024, // 700KB in bytes
      actual: results.find(r => r.name === 'Full')?.sizes.brotli || 0,
      status: (results.find(r => r.name === 'Full')?.sizes.brotli || Infinity) <= 700 * 1024,
    },
  };

  writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
  return jsonPath;
}

// Main execution
async function main() {
  console.log('🔍 S5.js Bundle Analysis');
  console.log('========================\n');

  const results = [];

  // Bundle each entry point
  for (const config of bundles) {
    try {
      const result = await bundleEntryPoint(config);
      results.push(result);
    } catch (error) {
      console.error(`Failed to bundle ${config.name}`);
      process.exit(1);
    }
  }

  console.log('\n📊 Generating reports...\n');

  // Generate reports
  const reportPath = generateReport(results);
  const jsonPath = generateJSON(results);

  console.log(`✅ Bundle analysis complete!\n`);
  console.log(`📄 Markdown report: ${reportPath}`);
  console.log(`📋 JSON data: ${jsonPath}\n`);

  // Print summary
  console.log('📊 Summary:');
  console.log('═══════════\n');

  results.forEach(result => {
    const expectedMax = bundles.find(b => b.name === result.name)?.expectedMaxSizeKB || 700;
    const brotliKB = result.sizes.brotli / 1024;
    const status = brotliKB <= expectedMax ? '✅' : '❌';

    console.log(`${status} ${result.name}: ${formatBytes(result.sizes.brotli)} (target: ${expectedMax} KB)`);
  });

  // Final verdict
  const fullBundle = results.find(r => r.name === 'Full');
  const fullBrotliKB = fullBundle.sizes.brotli / 1024;

  console.log('\n');
  if (fullBrotliKB <= 700) {
    console.log('🎉 Grant Compliance: PASSED');
    console.log(`   Full bundle is ${formatBytes(fullBundle.sizes.brotli)} (under 700 KB limit)`);
  } else {
    console.log('⚠️  Grant Compliance: FAILED');
    console.log(`   Full bundle is ${formatBytes(fullBundle.sizes.brotli)} (exceeds 700 KB limit)`);
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
