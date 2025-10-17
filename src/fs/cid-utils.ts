/**
 * CID (Content Identifier) utilities for advanced S5.js users
 *
 * Provides functions for formatting, parsing, and verifying CIDs in various encodings.
 */

import { base32 } from 'multiformats/bases/base32';
import { base58btc } from 'multiformats/bases/base58';
import { base64 } from 'multiformats/bases/base64';
import type { CryptoImplementation } from '../api/crypto.js';

/**
 * CID size in bytes (blake3 hash)
 */
const CID_SIZE = 32;

/**
 * Format a CID using the specified multibase encoding
 *
 * @param cid - The CID as Uint8Array (32 bytes)
 * @param encoding - The multibase encoding to use (default: 'base32')
 * @returns Formatted CID string
 *
 * @example
 * ```typescript
 * const cid = new Uint8Array(32);
 * const formatted = formatCID(cid, 'base32');
 * console.log(formatted); // "bafybei..."
 * ```
 */
export function formatCID(cid: Uint8Array, encoding: 'base32' | 'base58btc' | 'base64' = 'base32'): string {
  // Validate CID
  if (!cid || cid.length === 0) {
    throw new Error('CID cannot be empty');
  }

  if (cid.length !== CID_SIZE) {
    throw new Error(`Invalid CID size: expected ${CID_SIZE} bytes, got ${cid.length} bytes`);
  }

  // Select encoder based on encoding type
  let encoder;
  switch (encoding) {
    case 'base32':
      encoder = base32;
      break;
    case 'base58btc':
      encoder = base58btc;
      break;
    case 'base64':
      encoder = base64;
      break;
    default:
      throw new Error(`Unsupported encoding: ${encoding}`);
  }

  // Encode the CID
  return encoder.encode(cid);
}

/**
 * Parse a CID string in various formats back to Uint8Array
 *
 * Supports multibase-prefixed strings and auto-detection of common formats.
 *
 * @param cidString - The CID string to parse
 * @returns Parsed CID as Uint8Array
 *
 * @example
 * ```typescript
 * const cidString = "bafybei...";
 * const cid = parseCID(cidString);
 * console.log(cid); // Uint8Array(32) [...]
 * ```
 */
export function parseCID(cidString: string): Uint8Array {
  if (!cidString || cidString.length === 0) {
    throw new Error('CID string cannot be empty');
  }

  let parsed: Uint8Array;

  try {
    // Try to detect and parse based on multibase prefix or content

    // Check for multibase prefix
    const firstChar = cidString[0];

    if (firstChar === 'b' && /^[a-z2-7]+$/.test(cidString.slice(1))) {
      // Multibase base32 with prefix 'b'
      parsed = base32.decode(cidString);
    } else if (firstChar === 'z') {
      // Multibase base58btc with prefix 'z'
      parsed = base58btc.decode(cidString);
    } else if (firstChar === 'm' || firstChar === 'M' || firstChar === 'u') {
      // Multibase base64 variants with prefix
      parsed = base64.decode(cidString);
    } else if (/^[a-z2-7]+$/.test(cidString)) {
      // Base32 without prefix - add it
      parsed = base32.decode('b' + cidString);
    } else if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(cidString)) {
      // Base58 without prefix - add it
      parsed = base58btc.decode('z' + cidString);
    } else if (/^[A-Za-z0-9+/=]+$/.test(cidString)) {
      // Base64 without prefix - add it
      parsed = base64.decode('m' + cidString);
    } else {
      throw new Error('Unable to detect CID format');
    }

    // Validate parsed CID size
    if (parsed.length !== CID_SIZE) {
      throw new Error(`Parsed CID has invalid size: expected ${CID_SIZE} bytes, got ${parsed.length} bytes`);
    }

    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse CID string: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Verify that a CID matches the given data
 *
 * Computes the blake3 hash of the data and compares it to the provided CID.
 *
 * @param cid - The CID to verify
 * @param data - The data that should match the CID
 * @param crypto - Crypto implementation for hashing
 * @returns true if CID matches data, false otherwise
 *
 * @example
 * ```typescript
 * const data = new TextEncoder().encode("Hello");
 * const cid = await crypto.hashBlake3(data);
 * const isValid = await verifyCID(cid, data, crypto);
 * console.log(isValid); // true
 * ```
 */
export async function verifyCID(
  cid: Uint8Array,
  data: Uint8Array,
  crypto: CryptoImplementation
): Promise<boolean> {
  // Validate CID size
  if (cid.length !== CID_SIZE) {
    throw new Error(`Invalid CID size: expected ${CID_SIZE} bytes, got ${cid.length} bytes`);
  }

  // Compute hash of data
  const computedHash = await crypto.hashBlake3(data);

  // Compare CID with computed hash
  if (computedHash.length !== cid.length) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  let result = 0;
  for (let i = 0; i < cid.length; i++) {
    result |= cid[i] ^ computedHash[i];
  }

  return result === 0;
}

/**
 * Convert a CID to a human-readable hexadecimal string
 *
 * @param cid - The CID to convert
 * @returns Hexadecimal string representation
 *
 * @example
 * ```typescript
 * const cid = new Uint8Array(32);
 * const hex = cidToString(cid);
 * console.log(hex); // "000000000000000000000000000000000000000000000000000000000000000"
 * ```
 */
export function cidToString(cid: Uint8Array): string {
  // Validate CID size
  if (!cid || cid.length === 0) {
    throw new Error('CID cannot be empty');
  }

  if (cid.length !== CID_SIZE) {
    throw new Error(`Invalid CID size: expected ${CID_SIZE} bytes, got ${cid.length} bytes`);
  }

  // Convert to hexadecimal
  return Array.from(cid)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}
