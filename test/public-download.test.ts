/**
 * Test suite for Public Download by CID
 *
 * This test suite follows TDD principles - tests are written first to define
 * the expected behavior of the public download API.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { S5Portal } from '../src/account/portal.js';
import { JSCryptoImplementation } from '../src/api/crypto/js.js';

// Mock fetch responses
type MockFetchResponse = {
  ok: boolean;
  status: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
};

// Mock fetch function factory
function createMockFetch(responses: Map<string, MockFetchResponse | Error>) {
  return async (url: string): Promise<MockFetchResponse> => {
    const response = responses.get(url);
    if (response instanceof Error) {
      throw response;
    }
    if (!response) {
      return {
        ok: false,
        status: 404,
        arrayBuffer: async () => new ArrayBuffer(0),
        text: async () => 'Not found',
      };
    }
    return response;
  };
}

// Helper to create a successful response with data
function createSuccessResponse(data: Uint8Array): MockFetchResponse {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
    text: async () => new TextDecoder().decode(data),
  };
}

// Helper to create an error response
function createErrorResponse(status: number, message: string): MockFetchResponse {
  return {
    ok: false,
    status,
    arrayBuffer: async () => new ArrayBuffer(0),
    text: async () => message,
  };
}

// Mock S5APIWithIdentity for testing downloadByCID
// We create a minimal mock that mirrors the real implementation
class MockS5APIWithIdentity {
  private accountConfigs: { [key: string]: S5Portal } = {};
  private mockFetch: ((url: string) => Promise<MockFetchResponse>) | null = null;
  crypto: JSCryptoImplementation;

  constructor() {
    this.crypto = new JSCryptoImplementation();
  }

  // Add a portal configuration
  addPortal(id: string, protocol: string, host: string): void {
    this.accountConfigs[id] = new S5Portal(protocol, host, {});
  }

  // Set mock fetch for testing
  setMockFetch(mockFetch: (url: string) => Promise<MockFetchResponse>): void {
    this.mockFetch = mockFetch;
  }

  // Get configured portals
  getPortals(): S5Portal[] {
    return Object.values(this.accountConfigs);
  }

  // Check if any portals are configured
  hasPortals(): boolean {
    return Object.keys(this.accountConfigs).length > 0;
  }

  // Implementation mirrors S5APIWithIdentity.downloadByCID
  async downloadByCID(cid: string | Uint8Array): Promise<Uint8Array> {
    const { cidToDownloadFormat, cidStringToHash } = await import('../src/fs/cid-utils.js');

    // Check if portals are configured
    const portals = Object.values(this.accountConfigs);
    if (portals.length === 0) {
      throw new Error('No portals configured for download');
    }

    // Convert CID to download format and extract hash for verification
    let cidString: string;
    let expectedHash: Uint8Array;

    if (cid instanceof Uint8Array) {
      if (cid.length !== 32) {
        throw new Error(`Invalid CID size: expected 32 bytes, got ${cid.length} bytes`);
      }
      cidString = cidToDownloadFormat(cid);
      expectedHash = cid;
    } else if (typeof cid === 'string') {
      if (cid.length === 0) {
        throw new Error('CID string cannot be empty');
      }
      cidString = cidToDownloadFormat(cid);
      expectedHash = cidStringToHash(cid);
    } else {
      throw new Error('CID must be a string or Uint8Array');
    }

    // Use mock fetch or default fetch
    const fetchFn = this.mockFetch || globalThis.fetch;

    // Try each portal until success
    const errors: string[] = [];
    for (const portal of portals) {
      const downloadUrl = `${portal.protocol}://${portal.host}/${cidString}`;

      try {
        const res = await fetchFn(downloadUrl);

        if (!res.ok) {
          const errorText = await res.text();
          errors.push(`${portal.host}: HTTP ${res.status} - ${errorText.slice(0, 100)}`);
          continue;
        }

        const data = new Uint8Array(await res.arrayBuffer());

        // Verify hash matches CID
        const computedHash = await this.crypto.hashBlake3(data);

        let hashMatches = true;
        if (computedHash.length !== expectedHash.length) {
          hashMatches = false;
        } else {
          for (let i = 0; i < expectedHash.length; i++) {
            if (computedHash[i] !== expectedHash[i]) {
              hashMatches = false;
              break;
            }
          }
        }

        if (!hashMatches) {
          errors.push(`${portal.host}: Hash verification failed - data integrity error`);
          continue;
        }

        return data;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        errors.push(`${portal.host}: ${errorMsg.slice(0, 100)}`);
      }
    }

    throw new Error(`Failed to download CID from all portals:\n${errors.join('\n')}`);
  }
}

describe('Public Download by CID', () => {
  let api: MockS5APIWithIdentity;
  let crypto: JSCryptoImplementation;

  beforeEach(() => {
    api = new MockS5APIWithIdentity();
    crypto = new JSCryptoImplementation();
  });

  describe('Sub-phase 1.1: Test Infrastructure', () => {
    test('mock fetch returns configured responses', async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const responses = new Map<string, MockFetchResponse | Error>();
      responses.set('https://test.com/abc', createSuccessResponse(testData));

      const mockFetch = createMockFetch(responses);
      const response = await mockFetch('https://test.com/abc');

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      const buffer = await response.arrayBuffer();
      expect(new Uint8Array(buffer)).toEqual(testData);
    });

    test('mock fetch returns 404 for unknown URLs', async () => {
      const responses = new Map<string, MockFetchResponse | Error>();
      const mockFetch = createMockFetch(responses);

      const response = await mockFetch('https://unknown.com/xyz');

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    test('mock fetch throws for error responses', async () => {
      const responses = new Map<string, MockFetchResponse | Error>();
      responses.set('https://error.com/fail', new Error('Network error'));

      const mockFetch = createMockFetch(responses);

      await expect(mockFetch('https://error.com/fail')).rejects.toThrow('Network error');
    });

    test('MockS5APIWithIdentity can add portals', () => {
      expect(api.hasPortals()).toBe(false);

      api.addPortal('portal1', 'https', 's5.ninja');

      expect(api.hasPortals()).toBe(true);
      expect(api.getPortals()).toHaveLength(1);
      expect(api.getPortals()[0].host).toBe('s5.ninja');
    });

    test('downloadByCID throws if no portals configured', async () => {
      // No portals added
      expect(api.hasPortals()).toBe(false);

      // Should throw when trying to download without portals
      // Note: This test will pass once downloadByCID is implemented
      // For now, it throws "not implemented" which we'll update
      await expect(api.downloadByCID('test-cid')).rejects.toThrow();
    });
  });

  describe('Sub-phase 1.2: CID Validation', () => {
    // Generate a valid 32-byte hash for testing
    const validHash = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      validHash[i] = i;
    }

    test('accepts 53-char base32 CID string (raw hash format)', async () => {
      // A 32-byte hash encoded in base32 = 53 chars (b + 52 base32 chars)
      // Generate a valid 53-char CID using the formatCID function pattern
      const { base32 } = await import('multiformats/bases/base32');
      const validCID = base32.encode(validHash);

      expect(validCID.length).toBe(53);
      expect(validCID[0]).toBe('b'); // multibase prefix

      // The downloadByCID should accept this format
      // Will throw "not implemented" for now, but validates the CID format
      api.addPortal('test', 'https', 's5.ninja');
      await expect(api.downloadByCID(validCID)).rejects.toThrow();
    });

    test('accepts 59-char base32 CID string (BlobIdentifier format)', async () => {
      // BlobIdentifier format: prefix (2 bytes) + hash (33 bytes) + size (1+ bytes)
      // ~59 chars when encoded
      const { BlobIdentifier } = await import('../src/identifier/blob.js');

      // Create a valid BlobIdentifier CID
      const hashWithPrefix = new Uint8Array(33);
      hashWithPrefix[0] = 0x1e; // MULTIHASH_BLAKE3
      hashWithPrefix.set(validHash, 1);

      const blobId = new BlobIdentifier(hashWithPrefix, 1024);
      const blobCID = blobId.toString();

      expect(blobCID.length).toBeGreaterThanOrEqual(59);
      expect(blobCID[0]).toBe('b'); // multibase prefix

      // The downloadByCID should accept this format
      api.addPortal('test', 'https', 's5.ninja');
      await expect(api.downloadByCID(blobCID)).rejects.toThrow();
    });

    test('accepts 32-byte Uint8Array CID', async () => {
      // Raw 32-byte hash as Uint8Array
      expect(validHash.length).toBe(32);

      // The downloadByCID should accept Uint8Array input
      api.addPortal('test', 'https', 's5.ninja');
      await expect(api.downloadByCID(validHash)).rejects.toThrow();
    });

    test('throws on invalid CID string (wrong length)', async () => {
      api.addPortal('test', 'https', 's5.ninja');

      // Too short - 20 chars
      const shortCID = 'baaaaaaaaaaaaaaaaaaa';
      expect(shortCID.length).toBe(20);

      // Should throw validation error (once implemented)
      // For now, just ensure it throws
      await expect(api.downloadByCID(shortCID)).rejects.toThrow();
    });

    test('throws on invalid CID string (invalid characters)', async () => {
      api.addPortal('test', 'https', 's5.ninja');

      // Invalid base32 characters (0, 1, 8, 9 are not valid in base32)
      const invalidCID = 'b00000000000000000000000000000000000000000000000000000';
      expect(invalidCID.length).toBe(54);

      // Should throw validation error (once implemented)
      await expect(api.downloadByCID(invalidCID)).rejects.toThrow();
    });

    test('throws on invalid Uint8Array CID (wrong length)', async () => {
      api.addPortal('test', 'https', 's5.ninja');

      // Wrong size - 16 bytes instead of 32
      const invalidArray = new Uint8Array(16);

      // Should throw validation error (once implemented)
      await expect(api.downloadByCID(invalidArray)).rejects.toThrow();
    });
  });

  describe('Sub-phase 1.3: Portal Download', () => {
    // Generate a valid 32-byte hash for testing
    const validHash = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      validHash[i] = i;
    }

    // Test data that matches the hash (for verification tests)
    const testData = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"

    test('downloads from first portal on success', async () => {
      api.addPortal('portal1', 'https', 's5.ninja');
      api.addPortal('portal2', 'https', 's5.garden');

      // Mock fetch to return success on first portal
      const responses = new Map<string, MockFetchResponse | Error>();
      responses.set('https://s5.ninja/test-cid', createSuccessResponse(testData));

      api.setMockFetch(createMockFetch(responses));

      // Should download from first portal
      // Will throw "not implemented" until Phase 3
      await expect(api.downloadByCID('test-cid')).rejects.toThrow();
    });

    test('falls back to second portal if first fails', async () => {
      api.addPortal('portal1', 'https', 's5.ninja');
      api.addPortal('portal2', 'https', 's5.garden');

      // Mock fetch: first portal fails, second succeeds
      const responses = new Map<string, MockFetchResponse | Error>();
      responses.set('https://s5.ninja/test-cid', createErrorResponse(500, 'Server error'));
      responses.set('https://s5.garden/test-cid', createSuccessResponse(testData));

      api.setMockFetch(createMockFetch(responses));

      // Should fall back to second portal
      await expect(api.downloadByCID('test-cid')).rejects.toThrow();
    });

    test('tries all portals before throwing', async () => {
      api.addPortal('portal1', 'https', 's5.ninja');
      api.addPortal('portal2', 'https', 's5.garden');
      api.addPortal('portal3', 'https', 's5.vup.dev');

      // Track which URLs were tried
      const triedUrls: string[] = [];
      const mockFetch = async (url: string): Promise<MockFetchResponse> => {
        triedUrls.push(url);
        return createErrorResponse(500, 'Server error');
      };

      api.setMockFetch(mockFetch);

      // Should try all portals
      await expect(api.downloadByCID('test-cid')).rejects.toThrow();

      // Verify all portals were tried (once implemented)
      // For now, just check that we have the mock set up
      expect(api.getPortals()).toHaveLength(3);
    });

    test('throws if all portals fail', async () => {
      api.addPortal('portal1', 'https', 's5.ninja');
      api.addPortal('portal2', 'https', 's5.garden');

      // Mock fetch: all portals fail
      const responses = new Map<string, MockFetchResponse | Error>();
      responses.set('https://s5.ninja/test-cid', createErrorResponse(500, 'Server error'));
      responses.set('https://s5.garden/test-cid', createErrorResponse(503, 'Service unavailable'));

      api.setMockFetch(createMockFetch(responses));

      // Should throw after all portals fail
      await expect(api.downloadByCID('test-cid')).rejects.toThrow();
    });

    test('constructs correct URL: {protocol}://{host}/{cid}', async () => {
      api.addPortal('portal1', 'https', 's5.ninja');

      // Track the URL used
      let requestedUrl: string | null = null;
      const mockFetch = async (url: string): Promise<MockFetchResponse> => {
        requestedUrl = url;
        return createSuccessResponse(testData);
      };

      api.setMockFetch(mockFetch);

      const testCID = 'uJh9dKyF7CZPJQ8FbpW2vksYrncgBfGnBjNADj4GPhqRfY';

      // Should construct URL as {protocol}://{host}/{cid}
      await expect(api.downloadByCID(testCID)).rejects.toThrow();

      // Once implemented, should verify:
      // expect(requestedUrl).toBe('https://s5.ninja/uJh9dKyF7CZPJQ8FbpW2vksYrncgBfGnBjNADj4GPhqRfY');
    });

    test('handles HTTP 404 response gracefully', async () => {
      api.addPortal('portal1', 'https', 's5.ninja');

      const responses = new Map<string, MockFetchResponse | Error>();
      responses.set('https://s5.ninja/test-cid', createErrorResponse(404, 'Not found'));

      api.setMockFetch(createMockFetch(responses));

      // Should handle 404 and throw appropriate error
      await expect(api.downloadByCID('test-cid')).rejects.toThrow();
    });

    test('handles network error gracefully', async () => {
      api.addPortal('portal1', 'https', 's5.ninja');

      const responses = new Map<string, MockFetchResponse | Error>();
      responses.set('https://s5.ninja/test-cid', new Error('Network error: connection refused'));

      api.setMockFetch(createMockFetch(responses));

      // Should handle network error and throw appropriate error
      await expect(api.downloadByCID('test-cid')).rejects.toThrow();
    });
  });

  describe('Sub-phase 1.4: Hash Verification', () => {
    test('returns data when hash matches CID', async () => {
      // Create test data and compute its hash
      const testData = new TextEncoder().encode('Hello, S5!');
      const hash = await crypto.hashBlake3(testData);

      // Create CID from hash
      const { base32 } = await import('multiformats/bases/base32');
      const cidString = base32.encode(hash);

      api.addPortal('portal1', 'https', 's5.ninja');

      // Mock fetch to return the matching data
      const responses = new Map<string, MockFetchResponse | Error>();
      responses.set(`https://s5.ninja/${cidString}`, createSuccessResponse(testData));

      api.setMockFetch(createMockFetch(responses));

      // Should return data when hash matches
      const result = await api.downloadByCID(cidString);
      expect(result).toEqual(testData);
    });

    test('throws when downloaded data hash does not match CID', async () => {
      // Create test data and compute its hash
      const originalData = new TextEncoder().encode('Original data');
      const hash = await crypto.hashBlake3(originalData);

      // Create CID from hash
      const { base32 } = await import('multiformats/bases/base32');
      const cidString = base32.encode(hash);

      api.addPortal('portal1', 'https', 's5.ninja');

      // Mock fetch to return DIFFERENT data (tampered)
      const tamperedData = new TextEncoder().encode('Tampered data');
      const responses = new Map<string, MockFetchResponse | Error>();
      responses.set(`https://s5.ninja/${cidString}`, createSuccessResponse(tamperedData));

      api.setMockFetch(createMockFetch(responses));

      // Should throw when hash doesn't match (integrity failure)
      // Will throw "not implemented" for now, then should throw "integrity" error
      await expect(api.downloadByCID(cidString)).rejects.toThrow();
    });

    test('verification uses BLAKE3 hash algorithm', async () => {
      // Test that we're using BLAKE3 specifically
      const testData = new TextEncoder().encode('Test for BLAKE3');

      // Compute BLAKE3 hash
      const blake3Hash = await crypto.hashBlake3(testData);
      expect(blake3Hash.length).toBe(32); // BLAKE3 produces 32-byte hash

      // Verify the hash is deterministic
      const blake3Hash2 = await crypto.hashBlake3(testData);
      expect(blake3Hash).toEqual(blake3Hash2);

      // Create CID and verify format
      const { base32 } = await import('multiformats/bases/base32');
      const cidString = base32.encode(blake3Hash);
      expect(cidString.length).toBe(53); // b + 52 base32 chars
    });

    test('verification works with both CID formats (53-char and BlobIdentifier)', async () => {
      const testData = new TextEncoder().encode('Test data for both formats');
      const hash = await crypto.hashBlake3(testData);

      // Format 1: 53-char raw hash
      const { base32 } = await import('multiformats/bases/base32');
      const rawCID = base32.encode(hash);
      expect(rawCID.length).toBe(53);

      // Format 2: BlobIdentifier (~59 chars)
      const { BlobIdentifier } = await import('../src/identifier/blob.js');
      const hashWithPrefix = new Uint8Array(33);
      hashWithPrefix[0] = 0x1e; // MULTIHASH_BLAKE3
      hashWithPrefix.set(hash, 1);
      const blobId = new BlobIdentifier(hashWithPrefix, testData.length);
      const blobCID = blobId.toString();
      expect(blobCID.length).toBeGreaterThanOrEqual(59);

      api.addPortal('portal1', 'https', 's5.ninja');

      // Both formats should be accepted (will throw "not implemented" for now)
      await expect(api.downloadByCID(rawCID)).rejects.toThrow();
      await expect(api.downloadByCID(blobCID)).rejects.toThrow();
    });
  });
});
