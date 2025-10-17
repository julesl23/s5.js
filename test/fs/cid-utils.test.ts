/**
 * Test suite for CID utilities
 *
 * Tests for formatting, parsing, and validating CIDs in various formats.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  formatCID,
  parseCID,
  verifyCID,
  cidToString,
} from '../../src/fs/cid-utils.js';
import { JSCryptoImplementation } from '../../src/api/crypto/js.js';

describe('CID Utilities', () => {
  let crypto: JSCryptoImplementation;
  let sampleCID: Uint8Array;
  let sampleData: Uint8Array;

  beforeEach(async () => {
    crypto = new JSCryptoImplementation();

    // Create sample data and its CID
    sampleData = new TextEncoder().encode('Hello, CID!');
    sampleCID = await crypto.hashBlake3(sampleData);
  });

  describe('formatCID', () => {
    test('should format CID in base32 by default', () => {
      const formatted = formatCID(sampleCID);

      expect(formatted).toBeTypeOf('string');
      expect(formatted.length).toBeGreaterThan(0);
      // Base32 should use lowercase letters and numbers 2-7
      expect(/^[a-z2-7]+$/.test(formatted)).toBe(true);
    });

    test('should format CID in base32 explicitly', () => {
      const formatted = formatCID(sampleCID, 'base32');

      expect(formatted).toBeTypeOf('string');
      expect(/^[a-z2-7]+$/.test(formatted)).toBe(true);
    });

    test('should format CID in base58btc', () => {
      const formatted = formatCID(sampleCID, 'base58btc');

      expect(formatted).toBeTypeOf('string');
      expect(formatted.length).toBeGreaterThan(0);
      // Base58 should use alphanumeric excluding 0OIl
      expect(/^[1-9A-HJ-NP-Za-km-z]+$/.test(formatted)).toBe(true);
    });

    test('should format CID in base64', () => {
      const formatted = formatCID(sampleCID, 'base64');

      expect(formatted).toBeTypeOf('string');
      expect(formatted.length).toBeGreaterThan(0);
      // Base64 uses A-Za-z0-9+/
      expect(/^[A-Za-z0-9+/=]+$/.test(formatted)).toBe(true);
    });

    test('should throw error for invalid CID (empty)', () => {
      const emptyCID = new Uint8Array(0);

      expect(() => formatCID(emptyCID)).toThrow();
    });

    test('should throw error for invalid CID (wrong size)', () => {
      const invalidCID = new Uint8Array(10); // Should be 32 bytes

      expect(() => formatCID(invalidCID)).toThrow();
    });

    test('should throw error for unsupported encoding', () => {
      expect(() => formatCID(sampleCID, 'base99' as any)).toThrow();
    });

    test('should produce different formats for same CID', () => {
      const base32 = formatCID(sampleCID, 'base32');
      const base58 = formatCID(sampleCID, 'base58btc');
      const base64 = formatCID(sampleCID, 'base64');

      // All should be different string representations
      expect(base32).not.toBe(base58);
      expect(base58).not.toBe(base64);
      expect(base32).not.toBe(base64);
    });

    test('should format consistently for same CID', () => {
      const formatted1 = formatCID(sampleCID, 'base32');
      const formatted2 = formatCID(sampleCID, 'base32');

      expect(formatted1).toBe(formatted2);
    });
  });

  describe('parseCID', () => {
    test('should parse base32 CID string', () => {
      const formatted = formatCID(sampleCID, 'base32');
      const parsed = parseCID(formatted);

      expect(parsed).toBeInstanceOf(Uint8Array);
      expect(parsed).toEqual(sampleCID);
    });

    test('should parse base58btc CID string', () => {
      const formatted = formatCID(sampleCID, 'base58btc');
      const parsed = parseCID(formatted);

      expect(parsed).toBeInstanceOf(Uint8Array);
      expect(parsed).toEqual(sampleCID);
    });

    test('should parse base64 CID string', () => {
      const formatted = formatCID(sampleCID, 'base64');
      const parsed = parseCID(formatted);

      expect(parsed).toBeInstanceOf(Uint8Array);
      expect(parsed).toEqual(sampleCID);
    });

    test('should auto-detect base32 format', () => {
      const formatted = formatCID(sampleCID, 'base32');
      const parsed = parseCID(formatted);

      expect(parsed).toEqual(sampleCID);
    });

    test('should auto-detect base58 format', () => {
      const formatted = formatCID(sampleCID, 'base58btc');
      const parsed = parseCID(formatted);

      expect(parsed).toEqual(sampleCID);
    });

    test('should parse multibase-prefixed strings', () => {
      // Test different multibase encodings with their prefixes
      // formatCID already returns multibase-prefixed strings
      const base32Formatted = formatCID(sampleCID, 'base32'); // 'b' prefix
      const base58Formatted = formatCID(sampleCID, 'base58btc'); // 'z' prefix
      const base64Formatted = formatCID(sampleCID, 'base64'); // 'm' prefix

      // All should parse correctly
      expect(parseCID(base32Formatted)).toEqual(sampleCID);
      expect(parseCID(base58Formatted)).toEqual(sampleCID);
      expect(parseCID(base64Formatted)).toEqual(sampleCID);
    });

    test('should throw error for invalid CID string', () => {
      expect(() => parseCID('invalid!@#$%')).toThrow();
    });

    test('should throw error for empty string', () => {
      expect(() => parseCID('')).toThrow();
    });

    test('should throw error for malformed base32', () => {
      expect(() => parseCID('89!!!invalid')).toThrow();
    });

    test('should handle round-trip conversion', () => {
      const formatted = formatCID(sampleCID);
      const parsed = parseCID(formatted);
      const reformatted = formatCID(parsed);

      expect(parsed).toEqual(sampleCID);
      expect(reformatted).toBe(formatted);
    });
  });

  describe('verifyCID', () => {
    test('should verify correct CID for data', async () => {
      const isValid = await verifyCID(sampleCID, sampleData, crypto);

      expect(isValid).toBe(true);
    });

    test('should reject incorrect CID for data', async () => {
      const wrongData = new TextEncoder().encode('Different data');

      const isValid = await verifyCID(sampleCID, wrongData, crypto);

      expect(isValid).toBe(false);
    });

    test('should handle binary data', async () => {
      const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
      const binaryCID = await crypto.hashBlake3(binaryData);

      const isValid = await verifyCID(binaryCID, binaryData, crypto);

      expect(isValid).toBe(true);
    });

    test('should verify large data correctly', async () => {
      const largeData = new Uint8Array(10000);
      // Use global crypto for random values
      if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(largeData);
      } else {
        // Fallback: fill with pseudo-random data
        for (let i = 0; i < largeData.length; i++) {
          largeData[i] = Math.floor(Math.random() * 256);
        }
      }

      const largeCID = await crypto.hashBlake3(largeData);

      const isValid = await verifyCID(largeCID, largeData, crypto);

      expect(isValid).toBe(true);
    });

    test('should handle empty data', async () => {
      const emptyData = new Uint8Array(0);
      const emptyCID = await crypto.hashBlake3(emptyData);

      const isValid = await verifyCID(emptyCID, emptyData, crypto);

      expect(isValid).toBe(true);
    });

    test('should reject CID with wrong length', async () => {
      const wrongSizeCID = new Uint8Array(16); // Should be 32 bytes

      await expect(verifyCID(wrongSizeCID, sampleData, crypto))
        .rejects.toThrow();
    });

    test('should be deterministic', async () => {
      const result1 = await verifyCID(sampleCID, sampleData, crypto);
      const result2 = await verifyCID(sampleCID, sampleData, crypto);

      expect(result1).toBe(result2);
      expect(result1).toBe(true);
    });

    test('should detect single byte difference', async () => {
      const modifiedData = new Uint8Array(sampleData);
      modifiedData[0] = modifiedData[0] ^ 0xFF; // Flip all bits of first byte

      const isValid = await verifyCID(sampleCID, modifiedData, crypto);

      expect(isValid).toBe(false);
    });
  });

  describe('cidToString', () => {
    test('should convert CID to readable string', () => {
      const str = cidToString(sampleCID);

      expect(str).toBeTypeOf('string');
      expect(str.length).toBeGreaterThan(0);
      // Should be hexadecimal representation
      expect(/^[0-9a-f]+$/.test(str)).toBe(true);
      // 32 bytes = 64 hex characters
      expect(str.length).toBe(64);
    });

    test('should be consistent for same CID', () => {
      const str1 = cidToString(sampleCID);
      const str2 = cidToString(sampleCID);

      expect(str1).toBe(str2);
    });

    test('should produce different strings for different CIDs', async () => {
      const data1 = new TextEncoder().encode('data1');
      const data2 = new TextEncoder().encode('data2');

      const cid1 = await crypto.hashBlake3(data1);
      const cid2 = await crypto.hashBlake3(data2);

      const str1 = cidToString(cid1);
      const str2 = cidToString(cid2);

      expect(str1).not.toBe(str2);
    });

    test('should handle all zeros', () => {
      const zeroCID = new Uint8Array(32); // All zeros

      const str = cidToString(zeroCID);

      expect(str).toBe('0'.repeat(64));
    });

    test('should handle all ones', () => {
      const onesCID = new Uint8Array(32).fill(0xFF);

      const str = cidToString(onesCID);

      expect(str).toBe('f'.repeat(64));
    });

    test('should throw error for invalid CID size', () => {
      const invalidCID = new Uint8Array(16);

      expect(() => cidToString(invalidCID)).toThrow();
    });

    test('should throw error for empty CID', () => {
      const emptyCID = new Uint8Array(0);

      expect(() => cidToString(emptyCID)).toThrow();
    });
  });

  describe('integration', () => {
    test('should handle complete CID workflow', async () => {
      const testData = new TextEncoder().encode('Integration test data');

      // 1. Hash data to get CID
      const cid = await crypto.hashBlake3(testData);

      // 2. Format CID to string
      const formatted = formatCID(cid);
      expect(formatted).toBeTypeOf('string');

      // 3. Parse string back to CID
      const parsed = parseCID(formatted);
      expect(parsed).toEqual(cid);

      // 4. Verify CID matches data
      const isValid = await verifyCID(parsed, testData, crypto);
      expect(isValid).toBe(true);

      // 5. Convert to readable string
      const readable = cidToString(cid);
      expect(readable).toBeTypeOf('string');
      expect(readable.length).toBe(64);
    });

    test('should work with different formats', async () => {
      const testData = new TextEncoder().encode('Format test');
      const cid = await crypto.hashBlake3(testData);

      // Test all formats
      const formats = ['base32', 'base58btc', 'base64'] as const;

      for (const format of formats) {
        const formatted = formatCID(cid, format);
        const parsed = parseCID(formatted);
        expect(parsed).toEqual(cid);

        const isValid = await verifyCID(parsed, testData, crypto);
        expect(isValid).toBe(true);
      }
    });

    test('should maintain CID integrity across conversions', async () => {
      const originalData = new TextEncoder().encode('Integrity check');
      const originalCID = await crypto.hashBlake3(originalData);

      // Multiple round trips
      for (let i = 0; i < 5; i++) {
        const formatted = formatCID(originalCID);
        const parsed = parseCID(formatted);

        expect(parsed).toEqual(originalCID);

        const isValid = await verifyCID(parsed, originalData, crypto);
        expect(isValid).toBe(true);
      }
    });

    test('should reject tampered CIDs', async () => {
      const testData = new TextEncoder().encode('Tamper test');
      const cid = await crypto.hashBlake3(testData);

      // Format and parse
      const formatted = formatCID(cid);

      // Tamper with the formatted string
      const tampered = formatted.slice(0, -2) + 'xx';

      // Parsing should fail or verification should fail
      try {
        const parsed = parseCID(tampered);
        const isValid = await verifyCID(parsed, testData, crypto);
        expect(isValid).toBe(false);
      } catch (error) {
        // Parsing failed, which is also acceptable
        expect(error).toBeDefined();
      }
    });
  });
});
