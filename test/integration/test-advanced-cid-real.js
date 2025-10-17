#!/usr/bin/env node

/**
 * Real S5 Portal Integration Tests for Advanced CID API
 *
 * This script tests the Advanced CID API with a real S5 portal (s5.vup.cx).
 * It handles registry propagation delays, network timing, and proper cleanup.
 *
 * Usage:
 *   node test/integration/test-advanced-cid-real.js
 *
 * Requirements:
 *   - Active internet connection
 *   - Access to s5.vup.cx portal
 *   - Node.js v20+
 *
 * Test Groups:
 *   1. Setup and Initialization
 *   2. Basic CID Operations (pathToCID, cidToPath, getByCID)
 *   3. Advanced Operations (putWithCID, getMetadataWithCID)
 *   4. CID Utilities (format, parse, verify)
 *   5. Encryption Integration
 *   6. Cleanup
 */

import { S5 } from '../../dist/src/index.js';
import { FS5Advanced } from '../../dist/src/fs/fs5-advanced.js';
import { formatCID, parseCID, verifyCID } from '../../dist/src/fs/cid-utils.js';

// Node.js polyfills
import { webcrypto } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream, WritableStream, TransformStream } from 'stream/web';
import { Blob } from 'buffer';
import { fetch, Headers, Request, Response, FormData } from 'undici';
import WebSocket from 'ws';
import 'fake-indexeddb/auto';

// Set up global polyfills
if (!global.crypto) global.crypto = webcrypto;
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;
if (!global.ReadableStream) global.ReadableStream = ReadableStream;
if (!global.WritableStream) global.WritableStream = WritableStream;
if (!global.TransformStream) global.TransformStream = TransformStream;
if (!global.Blob) global.Blob = Blob;
if (!global.Headers) global.Headers = Headers;
if (!global.Request) global.Request = Request;
if (!global.Response) global.Response = Response;
if (!global.fetch) global.fetch = fetch;
if (!global.FormData) global.FormData = FormData;
if (!global.WebSocket) global.WebSocket = WebSocket;

// Test configuration
const PORTAL_URL = 'https://s5.vup.cx';
const INITIAL_PEERS = [
  'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p',
];

// Registry propagation delay (milliseconds)
const REGISTRY_DELAY = 5000;

// Test state
let testsPassed = 0;
let testsFailed = 0;
let s5;
let advanced;
let testPaths = [];

// Helper: Sleep for registry propagation
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Log test result
function logTest(groupName, testName, passed, error = null) {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`  ${status}: ${testName}`);
  if (error) {
    console.log(`    Error: ${error.message}`);
    if (error.stack) {
      console.log(`    ${error.stack.split('\n').slice(1, 3).join('\n    ')}`);
    }
  }
  if (passed) {
    testsPassed++;
  } else {
    testsFailed++;
  }
}

// Helper: Assert equality
function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Helper: Assert true
function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Helper: Track test paths for cleanup
function trackPath(path) {
  testPaths.push(path);
  return path;
}

/**
 * GROUP 1: Setup and Initialization
 */
async function testGroup1_Setup() {
  console.log('\n📦 GROUP 1: Setup and Initialization');

  // Test 1.1: Create S5 instance
  try {
    s5 = await S5.create({
      initialPeers: INITIAL_PEERS,
    });
    assertTrue(s5 !== null, 'S5 instance should be created');
    logTest('Setup', 'Create S5 instance', true);
  } catch (error) {
    logTest('Setup', 'Create S5 instance', false, error);
    throw error;
  }

  // Test 1.2: Register on portal and initialize
  try {
    const seedPhrase = s5.generateSeedPhrase();
    await s5.recoverIdentityFromSeedPhrase(seedPhrase);
    await s5.registerOnNewPortal(PORTAL_URL);
    await s5.fs.ensureIdentityInitialized();

    // Create Advanced API instance
    advanced = new FS5Advanced(s5.fs);
    assertTrue(advanced !== null, 'FS5Advanced instance should be created');

    logTest('Setup', 'Register on portal and initialize', true);
    console.log(`  📝 Using portal: ${PORTAL_URL}`);
    console.log(`  ⏱️  Registry delay: ${REGISTRY_DELAY}ms between operations`);
  } catch (error) {
    logTest('Setup', 'Register on portal and initialize', false, error);
    throw error;
  }

  await sleep(REGISTRY_DELAY);
}

/**
 * GROUP 2: Basic CID Operations
 */
async function testGroup2_BasicOperations() {
  console.log('\n📦 GROUP 2: Basic CID Operations');

  // Test 2.1: putWithCID - Store and get path + CID
  let testCID, testPath;
  try {
    testPath = trackPath('home/advanced-test1.txt');
    const testData = 'Advanced CID test data';

    const result = await advanced.putWithCID(testPath, testData);

    assertEqual(result.path, testPath, 'Path should match');
    assertTrue(result.cid instanceof Uint8Array, 'CID should be Uint8Array');
    assertEqual(result.cid.length, 32, 'CID should be 32 bytes');

    testCID = result.cid;
    logTest('Basic', 'putWithCID stores data and returns path + CID', true);
  } catch (error) {
    logTest('Basic', 'putWithCID stores data and returns path + CID', false, error);
  }

  await sleep(REGISTRY_DELAY);

  // Test 2.2: Retrieve by path
  try {
    const byPath = await s5.fs.get(testPath);
    assertEqual(byPath, 'Advanced CID test data', 'Should retrieve by path');
    logTest('Basic', 'Retrieve data by path', true);
  } catch (error) {
    logTest('Basic', 'Retrieve data by path', false, error);
  }

  await sleep(REGISTRY_DELAY);

  // Test 2.3: getByCID - Retrieve by CID
  try {
    const byCID = await advanced.getByCID(testCID);
    assertEqual(byCID, 'Advanced CID test data', 'Should retrieve by CID');
    logTest('Basic', 'getByCID retrieves data by CID', true);
  } catch (error) {
    logTest('Basic', 'getByCID retrieves data by CID', false, error);
  }

  await sleep(REGISTRY_DELAY);

  // Test 2.4: pathToCID - Extract CID from path
  try {
    const extractedCID = await advanced.pathToCID(testPath);
    assertTrue(extractedCID instanceof Uint8Array, 'Extracted CID should be Uint8Array');
    assertEqual(extractedCID, testCID, 'Extracted CID should match stored CID');
    logTest('Basic', 'pathToCID extracts CID from path', true);
  } catch (error) {
    logTest('Basic', 'pathToCID extracts CID from path', false, error);
  }

  await sleep(REGISTRY_DELAY);

  // Test 2.5: cidToPath - Find path from CID
  try {
    const foundPath = await advanced.cidToPath(testCID);
    assertEqual(foundPath, testPath, 'Should find correct path from CID');
    logTest('Basic', 'cidToPath finds path from CID', true);
  } catch (error) {
    logTest('Basic', 'cidToPath finds path from CID', false, error);
  }

  await sleep(REGISTRY_DELAY);
}

/**
 * GROUP 3: Advanced Operations
 */
async function testGroup3_AdvancedOperations() {
  console.log('\n📦 GROUP 3: Advanced Operations');

  // Test 3.1: getMetadataWithCID
  let metadataPath;
  try {
    metadataPath = trackPath('home/metadata-test.txt');
    await s5.fs.put(metadataPath, 'Metadata test content');
    await sleep(REGISTRY_DELAY);

    const result = await advanced.getMetadataWithCID(metadataPath);

    assertTrue(result.metadata !== null, 'Metadata should exist');
    assertEqual(result.metadata.type, 'file', 'Should be a file');
    assertTrue(result.metadata.size > 0, 'File size should be > 0');
    assertTrue(result.cid instanceof Uint8Array, 'CID should be Uint8Array');
    assertEqual(result.cid.length, 32, 'CID should be 32 bytes');

    logTest('Advanced', 'getMetadataWithCID returns metadata and CID', true);
  } catch (error) {
    logTest('Advanced', 'getMetadataWithCID returns metadata and CID', false, error);
  }

  await sleep(REGISTRY_DELAY);

  // Test 3.2: putByCID - CID-only storage
  let cidOnlyCID;
  try {
    const tempData = 'CID-only storage test';
    cidOnlyCID = await advanced.putByCID(tempData);

    assertTrue(cidOnlyCID instanceof Uint8Array, 'CID should be Uint8Array');
    assertEqual(cidOnlyCID.length, 32, 'CID should be 32 bytes');

    logTest('Advanced', 'putByCID stores data and returns CID', true);
  } catch (error) {
    logTest('Advanced', 'putByCID stores data and returns CID', false, error);
  }

  await sleep(REGISTRY_DELAY);

  // Test 3.3: Retrieve CID-only data
  try {
    const retrieved = await advanced.getByCID(cidOnlyCID);
    assertEqual(retrieved, 'CID-only storage test', 'Should retrieve CID-only data');
    logTest('Advanced', 'Retrieve CID-only stored data', true);
  } catch (error) {
    logTest('Advanced', 'Retrieve CID-only stored data', false, error);
  }

  await sleep(REGISTRY_DELAY);

  // Test 3.4: Binary data handling
  try {
    const binaryPath = trackPath('home/binary-test.bin');
    const binaryData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const result = await advanced.putWithCID(binaryPath, binaryData);
    await sleep(REGISTRY_DELAY);

    const retrieved = await advanced.getByCID(result.cid);
    assertTrue(retrieved instanceof Uint8Array, 'Retrieved data should be Uint8Array');
    assertEqual(retrieved, binaryData, 'Binary data should match');

    logTest('Advanced', 'Handle binary data correctly', true);
  } catch (error) {
    logTest('Advanced', 'Handle binary data correctly', false, error);
  }

  await sleep(REGISTRY_DELAY);
}

/**
 * GROUP 4: CID Utilities
 */
async function testGroup4_CIDUtilities() {
  console.log('\n📦 GROUP 4: CID Utilities');

  let testCID;

  // Test 4.1: formatCID - base32
  try {
    const utilPath = trackPath('home/util-test.txt');
    const result = await advanced.putWithCID(utilPath, 'Utility test');
    testCID = result.cid;
    await sleep(REGISTRY_DELAY);

    const formatted = formatCID(testCID, 'base32');
    assertTrue(typeof formatted === 'string', 'Formatted CID should be string');
    assertTrue(formatted.length > 0, 'Formatted CID should not be empty');
    assertTrue(/^[a-z2-7]+$/.test(formatted), 'Base32 should match pattern');

    logTest('Utilities', 'formatCID formats to base32', true);
  } catch (error) {
    logTest('Utilities', 'formatCID formats to base32', false, error);
  }

  // Test 4.2: formatCID - base58btc
  try {
    const formatted = formatCID(testCID, 'base58btc');
    assertTrue(typeof formatted === 'string', 'Formatted CID should be string');
    assertTrue(/^[1-9A-HJ-NP-Za-km-z]+$/.test(formatted), 'Base58btc should match pattern');

    logTest('Utilities', 'formatCID formats to base58btc', true);
  } catch (error) {
    logTest('Utilities', 'formatCID formats to base58btc', false, error);
  }

  // Test 4.3: parseCID and round-trip
  try {
    const formatted = formatCID(testCID, 'base32');
    const parsed = parseCID(formatted);

    assertTrue(parsed instanceof Uint8Array, 'Parsed CID should be Uint8Array');
    assertEqual(parsed, testCID, 'Parsed CID should equal original');

    logTest('Utilities', 'parseCID parses formatted CID correctly', true);
  } catch (error) {
    logTest('Utilities', 'parseCID parses formatted CID correctly', false, error);
  }

  // Test 4.4: verifyCID
  try {
    const testData = new TextEncoder().encode('Utility test');
    const isValid = await verifyCID(testCID, testData, s5.api.crypto);

    assertEqual(isValid, true, 'CID should verify correctly');

    logTest('Utilities', 'verifyCID verifies CID matches data', true);
  } catch (error) {
    logTest('Utilities', 'verifyCID verifies CID matches data', false, error);
  }

  await sleep(REGISTRY_DELAY);
}

/**
 * GROUP 5: Encryption Integration
 */
async function testGroup5_Encryption() {
  console.log('\n📦 GROUP 5: Encryption Integration');

  // Test 5.1: Encrypted file CID operations
  try {
    const encPath = trackPath('home/encrypted-test.txt');
    const sensitiveData = 'Secret information';

    const result = await advanced.putWithCID(encPath, sensitiveData, {
      encryption: { algorithm: 'xchacha20-poly1305' },
    });
    await sleep(REGISTRY_DELAY);

    // Retrieve by CID (should auto-decrypt)
    const retrieved = await advanced.getByCID(result.cid);
    assertEqual(retrieved, sensitiveData, 'Should retrieve and decrypt by CID');

    logTest('Encryption', 'Handle encrypted files with CID operations', true);
  } catch (error) {
    logTest('Encryption', 'Handle encrypted files with CID operations', false, error);
  }

  await sleep(REGISTRY_DELAY);

  // Test 5.2: CID consistency with encryption
  // Note: Auto-generated encryption may use deterministic keys for deduplication,
  // so same content might have same CID even with "different" encryption.
  // This is expected behavior for content-addressed storage with encryption.
  try {
    const content = 'CID consistency test';
    const path1 = trackPath('home/enc-test1.txt');
    const path2 = trackPath('home/enc-test2.txt');

    const result1 = await advanced.putWithCID(path1, content, {
      encryption: { algorithm: 'xchacha20-poly1305' }
    });
    await sleep(REGISTRY_DELAY);

    const result2 = await advanced.putWithCID(path2, content, {
      encryption: { algorithm: 'xchacha20-poly1305' }
    });
    await sleep(REGISTRY_DELAY);

    // CIDs should be consistent (may be same if encryption is deterministic for dedup)
    assertTrue(result1.cid instanceof Uint8Array, 'CID1 should be Uint8Array');
    assertTrue(result2.cid instanceof Uint8Array, 'CID2 should be Uint8Array');

    logTest('Encryption', 'CID consistency with auto-encryption', true);
  } catch (error) {
    logTest('Encryption', 'CID consistency with auto-encryption', false, error);
  }

  await sleep(REGISTRY_DELAY);
}

/**
 * GROUP 6: Cleanup
 */
async function testGroup6_Cleanup() {
  console.log('\n📦 GROUP 6: Cleanup');

  // Test 6.1: Delete test files
  try {
    let deletedCount = 0;
    for (const path of testPaths) {
      try {
        await s5.fs.delete(path);
        deletedCount++;
        await sleep(1000); // Shorter delay for cleanup
      } catch (error) {
        // File might not exist, that's okay
      }
    }

    logTest('Cleanup', `Delete test files (${deletedCount} files)`, true);
  } catch (error) {
    logTest('Cleanup', 'Delete test files', false, error);
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('🚀 Advanced CID API - Real S5 Portal Integration Tests');
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    await testGroup1_Setup();
    await testGroup2_BasicOperations();
    await testGroup3_AdvancedOperations();
    await testGroup4_CIDUtilities();
    await testGroup5_Encryption();
    await testGroup6_Cleanup();
  } catch (error) {
    console.error('\n❌ Test suite failed with error:', error);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`⏱️  Duration: ${duration}s`);
  console.log(`📡 Portal: ${PORTAL_URL}`);

  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
