/**
 * CID Conversion Bug Diagnostic Tests
 *
 * Phase 6.1: Diagnose why cidToDownloadFormat() produces malformed CIDs
 * from BlobIdentifier format inputs.
 *
 * Bug: Input blobb... CID → Output bik... (wrong hash)
 */

import { describe, test, expect } from 'vitest';
import { base32 } from 'multiformats/bases/base32';
import { BlobIdentifier } from '../../src/identifier/blob.js';
import Multibase from '../../src/identifier/multibase.js';
import { MULTIHASH_BLAKE3 } from '../../src/constants.js';
import {
  detectCIDFormat,
  cidStringToHash,
  cidToDownloadFormat,
  formatCID,
  parseCID,
} from '../../src/fs/cid-utils.js';
import { concatBytes } from '@noble/hashes/utils';

// Production BlobIdentifier CID from SDK developer's bug report
const PRODUCTION_BLOB_CID = 'blobb4qvvwvlw3o7ybbwxomc3pdrzmpxvavxkyhyfgk5vgg6mmwu32kyqwihq';

describe('CID Conversion Bug - Phase 6.1 Diagnostics', () => {
  describe('Byte Structure Analysis', () => {
    test('should decode production BlobIdentifier CID and show byte structure', () => {
      // Decode using Multibase (with padding - the correct way)
      const decodedWithPadding = Multibase.decodeString(PRODUCTION_BLOB_CID);

      console.log('\n=== Production CID Byte Analysis ===');
      console.log('Input CID:', PRODUCTION_BLOB_CID);
      console.log('Input length:', PRODUCTION_BLOB_CID.length, 'chars');
      console.log('Decoded length:', decodedWithPadding.length, 'bytes');
      console.log('First 5 bytes (hex):', Array.from(decodedWithPadding.slice(0, 5)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

      // Expected structure: [0x5b, 0x82, 0x1e, ...32-byte-hash..., ...size...]
      expect(decodedWithPadding[0]).toBe(0x5b); // BlobIdentifier prefix byte 1
      expect(decodedWithPadding[1]).toBe(0x82); // BlobIdentifier prefix byte 2
      expect(decodedWithPadding[2]).toBe(MULTIHASH_BLAKE3); // Should be 0x1e

      console.log('Byte 0 (prefix 1):', '0x' + decodedWithPadding[0].toString(16), decodedWithPadding[0] === 0x5b ? '✓' : '✗');
      console.log('Byte 1 (prefix 2):', '0x' + decodedWithPadding[1].toString(16), decodedWithPadding[1] === 0x82 ? '✓' : '✗');
      console.log('Byte 2 (MULTIHASH):', '0x' + decodedWithPadding[2].toString(16), decodedWithPadding[2] === 0x1e ? '✓' : '✗');
      console.log('Bytes 3-34 (hash):', Array.from(decodedWithPadding.slice(3, 35)).map(b => b.toString(16).padStart(2, '0')).join(''));
      console.log('Bytes 35+ (size):', Array.from(decodedWithPadding.slice(35)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    });

    test('should compare decoding with and without padding', () => {
      console.log('\n=== Padding Comparison ===');

      // Method 1: Multibase.decodeString (adds padding)
      const withPadding = Multibase.decodeString(PRODUCTION_BLOB_CID);

      // Method 2: Direct base32.decode (current detectCIDFormat approach - no padding)
      const withoutPadding = base32.decode(PRODUCTION_BLOB_CID);

      console.log('With padding length:', withPadding.length);
      console.log('Without padding length:', withoutPadding.length);
      console.log('Lengths match:', withPadding.length === withoutPadding.length);

      // Compare bytes
      let bytesMatch = true;
      for (let i = 0; i < Math.min(withPadding.length, withoutPadding.length); i++) {
        if (withPadding[i] !== withoutPadding[i]) {
          console.log(`Byte mismatch at index ${i}: with=${withPadding[i]}, without=${withoutPadding[i]}`);
          bytesMatch = false;
        }
      }
      console.log('All bytes match:', bytesMatch);

      // This test documents the current behavior
      expect(withPadding.length).toBeGreaterThanOrEqual(36);
    });

    test('should verify BlobIdentifier.decode extracts correct hash structure', () => {
      console.log('\n=== BlobIdentifier.decode Analysis ===');

      const blobId = BlobIdentifier.decode(PRODUCTION_BLOB_CID);

      console.log('blobId.hash length:', blobId.hash.length);
      console.log('blobId.hash[0] (MULTIHASH):', '0x' + blobId.hash[0].toString(16));
      console.log('blobId.size:', blobId.size);

      // blobId.hash should be 33 bytes: [MULTIHASH_BLAKE3, ...32-byte-hash...]
      expect(blobId.hash.length).toBe(33);
      expect(blobId.hash[0]).toBe(MULTIHASH_BLAKE3); // 0x1e

      console.log('Hash bytes (first 8):', Array.from(blobId.hash.slice(0, 8)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
      console.log('Hash bytes (last 8):', Array.from(blobId.hash.slice(-8)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    });

    test('should verify subarray(1) extracts correct 32 bytes', () => {
      console.log('\n=== subarray(1) Extraction Analysis ===');

      const blobId = BlobIdentifier.decode(PRODUCTION_BLOB_CID);
      const extracted = blobId.hash.subarray(1);

      console.log('Original hash length:', blobId.hash.length);
      console.log('Extracted length:', extracted.length);
      console.log('Extracted first byte:', '0x' + extracted[0].toString(16));
      console.log('Extracted last byte:', '0x' + extracted[extracted.length - 1].toString(16));

      // Should be exactly 32 bytes
      expect(extracted.length).toBe(32);

      // The first byte should NOT be 0x1e (that's the prefix we're skipping)
      console.log('First byte is NOT 0x1e:', extracted[0] !== 0x1e ? '✓' : '✗');
    });

    test('should verify formatCID produces valid 53-char output', () => {
      console.log('\n=== formatCID Output Analysis ===');

      const blobId = BlobIdentifier.decode(PRODUCTION_BLOB_CID);
      const rawHash = blobId.hash.subarray(1);

      console.log('Raw hash to encode:', Array.from(rawHash.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('') + '...');

      const formatted = formatCID(rawHash, 'base32');

      console.log('Formatted CID:', formatted);
      console.log('Formatted length:', formatted.length);
      console.log('Starts with b:', formatted[0] === 'b' ? '✓' : '✗');

      expect(formatted.length).toBe(53);
      expect(formatted[0]).toBe('b');

      // Check it only contains valid base32lower chars
      const validChars = /^[a-z2-7]+$/;
      const isValidBase32 = validChars.test(formatted.slice(1));
      console.log('Valid base32 chars:', isValidBase32 ? '✓' : '✗');
      expect(isValidBase32).toBe(true);
    });
  });

  describe('Full Pipeline Analysis', () => {
    test('should trace cidToDownloadFormat with production CID', () => {
      console.log('\n=== cidToDownloadFormat Full Trace ===');

      // Step 1: Detect format
      const format = detectCIDFormat(PRODUCTION_BLOB_CID);
      console.log('Step 1 - detectCIDFormat:', format);
      expect(format).toBe('blob');

      // Step 2: Extract hash via cidStringToHash
      const extractedHash = cidStringToHash(PRODUCTION_BLOB_CID);
      console.log('Step 2 - cidStringToHash length:', extractedHash.length);
      console.log('Step 2 - hash (hex):', Array.from(extractedHash).map(b => b.toString(16).padStart(2, '0')).join(''));

      // Step 3: cidToDownloadFormat should return BlobIdentifier unchanged (portal requirement)
      const downloadCID = cidToDownloadFormat(PRODUCTION_BLOB_CID);
      console.log('Step 3 - cidToDownloadFormat:', downloadCID);
      console.log('Step 3 - length:', downloadCID.length);

      // Step 4: Verify BlobIdentifier CID is returned unchanged
      expect(downloadCID).toBe(PRODUCTION_BLOB_CID);
      console.log('Step 4 - BlobIdentifier passthrough:', downloadCID === PRODUCTION_BLOB_CID ? '✓' : '✗');

      // Step 5: Verify we can still extract hash from the returned CID
      const hashFromDownloadCID = cidStringToHash(downloadCID);
      const hashesMatch = extractedHash.length === hashFromDownloadCID.length &&
        extractedHash.every((b, i) => b === hashFromDownloadCID[i]);
      console.log('Step 5 - Hash can be extracted:', hashesMatch ? '✓' : '✗');

      expect(hashesMatch).toBe(true);
    });

    test('should verify hash extraction works correctly', () => {
      console.log('\n=== HASH EXTRACTION VERIFICATION ===');

      // Get the raw hash from BlobIdentifier directly
      const blobId = BlobIdentifier.decode(PRODUCTION_BLOB_CID);
      const expectedRawHash = blobId.hash.subarray(1); // Skip MULTIHASH prefix

      // Get what cidStringToHash returns
      const actualRawHash = cidStringToHash(PRODUCTION_BLOB_CID);

      console.log('Expected hash (from BlobIdentifier):', Array.from(expectedRawHash).map(b => b.toString(16).padStart(2, '0')).join(''));
      console.log('Actual hash (from cidStringToHash):', Array.from(actualRawHash).map(b => b.toString(16).padStart(2, '0')).join(''));

      // Compare byte by byte
      let firstMismatch = -1;
      for (let i = 0; i < 32; i++) {
        if (expectedRawHash[i] !== actualRawHash[i]) {
          firstMismatch = i;
          break;
        }
      }

      if (firstMismatch >= 0) {
        console.log(`MISMATCH at byte ${firstMismatch}:`);
        console.log(`  Expected: 0x${expectedRawHash[firstMismatch].toString(16).padStart(2, '0')}`);
        console.log(`  Actual:   0x${actualRawHash[firstMismatch].toString(16).padStart(2, '0')}`);
      } else {
        console.log('All bytes match ✓');
      }

      // Verify cidToDownloadFormat returns BlobIdentifier unchanged
      const actualCID = cidToDownloadFormat(PRODUCTION_BLOB_CID);
      console.log('cidToDownloadFormat output:', actualCID);
      console.log('BlobIdentifier passthrough:', actualCID === PRODUCTION_BLOB_CID ? '✓' : '✗');

      // Verify hash extraction is correct
      expect(actualRawHash).toEqual(expectedRawHash);
      // Verify BlobIdentifier passthrough
      expect(actualCID).toBe(PRODUCTION_BLOB_CID);
    });
  });
});

describe('CID Conversion Bug - Phase 6.2 Round-Trip', () => {
  test('should round-trip: create BlobIdentifier → string → extract hash → verify match', async () => {
    console.log('\n=== Round-Trip Verification ===');

    // Step 1: Create known 32-byte hash
    const originalHash = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      originalHash[i] = i; // Predictable pattern: 0, 1, 2, ..., 31
    }
    console.log('Original hash:', Array.from(originalHash.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('') + '...');

    // Step 2: Create BlobIdentifier with MULTIHASH prefix
    const hashWithPrefix = concatBytes(new Uint8Array([MULTIHASH_BLAKE3]), originalHash);
    const blobId = new BlobIdentifier(hashWithPrefix, 1000); // size = 1000 bytes
    console.log('BlobIdentifier hash length:', blobId.hash.length);
    console.log('BlobIdentifier size:', blobId.size);

    // Step 3: Encode to string
    const blobCIDString = blobId.toString();
    console.log('BlobIdentifier string:', blobCIDString);
    console.log('String length:', blobCIDString.length);

    // Step 4: Extract hash via cidStringToHash
    const extractedHash = cidStringToHash(blobCIDString);
    console.log('Extracted hash length:', extractedHash.length);
    console.log('Extracted hash:', Array.from(extractedHash.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('') + '...');

    // Step 5: Verify match
    const hashesMatch = originalHash.length === extractedHash.length &&
      originalHash.every((b, i) => b === extractedHash[i]);
    console.log('Original == Extracted:', hashesMatch ? '✓' : '✗ BUG!');

    // This assertion will fail if there's a bug
    expect(extractedHash).toEqual(originalHash);
  });
});

describe('CID Conversion Bug - Phase 6.3 Fix Verification', () => {
  test('should return BlobIdentifier CID unchanged (portal requirement)', () => {
    console.log('\n=== Sub-phase 6.3: BlobIdentifier Passthrough Test ===');

    const blobCID = PRODUCTION_BLOB_CID;
    console.log('Input BlobIdentifier CID:', blobCID);

    const result = cidToDownloadFormat(blobCID);
    console.log('Output CID:', result);

    // The BlobIdentifier CID should pass through UNCHANGED
    // (Portal requires BlobIdentifier format, not raw hash format)
    expect(result).toBe(blobCID);
    console.log('BlobIdentifier passthrough:', result === blobCID ? '✓' : '✗ BUG!');
  });

  test('should return raw hash CID string unchanged', () => {
    console.log('\n=== Raw Hash Passthrough Test ===');

    // Create a raw hash CID (53 chars)
    const rawHash = new Uint8Array(32).fill(0x42);
    const rawCID = formatCID(rawHash, 'base32');
    console.log('Input raw hash CID:', rawCID);
    console.log('Input length:', rawCID.length);

    const result = cidToDownloadFormat(rawCID);
    console.log('Output CID:', result);

    // Raw hash CID strings should also pass through unchanged
    expect(result).toBe(rawCID);
    console.log('Raw hash passthrough:', result === rawCID ? '✓' : '✗');
  });

  test('should handle Uint8Array input by encoding to base32', () => {
    console.log('\n=== Uint8Array Input Test ===');

    const rawHash = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      rawHash[i] = i;
    }
    console.log('Input Uint8Array:', Array.from(rawHash.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('') + '...');

    const result = cidToDownloadFormat(rawHash);
    console.log('Output CID:', result);
    console.log('Output length:', result.length);

    // Uint8Array should be encoded to base32 (53 chars)
    expect(result.length).toBe(53);
    expect(result[0]).toBe('b');
  });

  test('should preserve hash for verification after cidToDownloadFormat', () => {
    console.log('\n=== Hash Preservation Test ===');

    // Start with BlobIdentifier CID
    const blobCID = PRODUCTION_BLOB_CID;

    // Get the download CID
    const downloadCID = cidToDownloadFormat(blobCID);

    // Extract hash from download CID for verification
    const hashFromDownloadCID = cidStringToHash(downloadCID);
    const hashFromOriginalCID = cidStringToHash(blobCID);

    console.log('Hash from download CID:', Array.from(hashFromDownloadCID.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('') + '...');
    console.log('Hash from original CID:', Array.from(hashFromOriginalCID.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('') + '...');

    // Both should produce the same hash for verification
    const hashesMatch = hashFromDownloadCID.every((b, i) => b === hashFromOriginalCID[i]);
    expect(hashFromDownloadCID).toEqual(hashFromOriginalCID);
    console.log('Hash preserved:', hashesMatch ? '✓' : '✗');
  });
});
