#!/usr/bin/env node

/**
 * Script to update source files to use .js extensions in relative imports
 * This ensures proper ES module compatibility
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, extname } from 'path';

const SRC_DIR = './src';
const TEST_DIR = './test';

// Regex to match relative imports/exports (including parent directory)
const IMPORT_EXPORT_REGEX = /(\bimport\s+(?:[\s\S]*?\s+from\s+)?['"])(\.\.?\/[^'"]+)(['"])/g;
const EXPORT_FROM_REGEX = /(\bexport\s+(?:[\s\S]*?\s+from\s+)?['"])(\.\.?\/[^'"]+)(['"])/g;
const DYNAMIC_IMPORT_REGEX = /(\bimport\s*\(['"])(\.\.?\/[^'"]+)(['"]\))/g;

async function* walkDirectory(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      yield* walkDirectory(fullPath);
    } else if (entry.isFile() && extname(entry.name) === '.ts') {
      yield fullPath;
    }
  }
}

function addJsExtension(match, prefix, importPath, suffix) {
  // Skip if already has an extension
  if (extname(importPath)) {
    return match;
  }
  
  // Add .js extension (TypeScript will understand this refers to the .ts file)
  return `${prefix}${importPath}.js${suffix}`;
}

async function processFile(filePath) {
  try {
    let content = await readFile(filePath, 'utf-8');
    let modified = false;
    
    // Process import statements
    const newContent = content
      .replace(IMPORT_EXPORT_REGEX, (match, prefix, importPath, suffix) => {
        const result = addJsExtension(match, prefix, importPath, suffix);
        if (result !== match) modified = true;
        return result;
      })
      .replace(EXPORT_FROM_REGEX, (match, prefix, importPath, suffix) => {
        const result = addJsExtension(match, prefix, importPath, suffix);
        if (result !== match) modified = true;
        return result;
      })
      .replace(DYNAMIC_IMPORT_REGEX, (match, prefix, importPath, suffix) => {
        const result = addJsExtension(match, prefix, importPath, suffix);
        if (result !== match) modified = true;
        return result;
      });
    
    if (modified) {
      await writeFile(filePath, newContent, 'utf-8');
      console.log(`✓ Updated imports in ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

async function main() {
  console.log('Updating TypeScript source imports to include .js extensions...');
  
  try {
    let fileCount = 0;
    
    // Process src directory
    console.log('\nProcessing src directory...');
    for await (const filePath of walkDirectory(SRC_DIR)) {
      await processFile(filePath);
      fileCount++;
    }
    
    // Process test directory
    console.log('\nProcessing test directory...');
    for await (const filePath of walkDirectory(TEST_DIR)) {
      await processFile(filePath);
      fileCount++;
    }
    
    console.log(`\n✅ Processed ${fileCount} files`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();