import { expect, test, describe } from "vitest";
import { BlobIdentifier } from "../src/identifier/blob";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

describe("blob_identifier", () => {
  describe("blob sizes", () => {
    const prefix = 'blobaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const testCases = new Map()
    testCases.set(0, 'aa',);
    testCases.set(1, 'ab',);
    testCases.set(42, 'bk',);
    testCases.set(255, 'h7',);
    testCases.set(256, 'aaae',);
    testCases.set(65535, 'h774',);
    testCases.set(65536, 'aaaaaq',);
    testCases.set(57124823, 'gxu5tqg');

    for (let [size, expected] of testCases) {
      test(`size ${size}`, () => {
        const blobIdentifier = new BlobIdentifier(
          new Uint8Array(32),
          size,
        );
        expect(blobIdentifier.toBase32()).toBe(prefix + expected);
      });
    }
  });
  describe("encoding", () => {
    const hashHex = '1ee40b877081c208036d451b898700b4bf938792ffa3e4426f2bf871aa057d992b';
    const hash = hexToBytes(hashHex);
    const size = 5050;
    const blobId = new BlobIdentifier(hash, size);

    test('hex', () => {
      const hexBlobId = 'f5b821ee40b877081c208036d451b898700b4bf938792ffa3e4426f2bf871aa057d992bba13';
      expect(blobId.toHex())
        .toBe(hexBlobId);
      const decoded = BlobIdentifier.decode(hexBlobId);
      expect(bytesToHex(decoded.hash)).toBe(hashHex);
      expect(decoded.size).toBe(size);
    });
    test('base32', () => {
      const base32BlobId = 'blobb5zalq5yidqqianwukg4jq4aljp4tq6jp7i7eijxsx6drvicx3gjlxijq';
      expect(blobId.toBase32())
        .toBe(base32BlobId);
      const decoded = BlobIdentifier.decode(base32BlobId);
      expect(bytesToHex(decoded.hash)).toBe(hashHex);
      expect(decoded.size).toBe(size);
    });
    test('base58', () => {
      const base58BlobId = 'z44t3p46N4Fmqc1STusbaEoZ2HeDCFNNFRGys8SJsDvV9kHyMUbt';
      expect(blobId.toBase58())
        .toBe(base58BlobId);
      const decoded = BlobIdentifier.decode(base58BlobId);
      expect(bytesToHex(decoded.hash)).toBe(hashHex);
      expect(decoded.size).toBe(size);
    });
    test('base64url', () => {
      const base64BlobId = 'uW4Ie5AuHcIHCCANtRRuJhwC0v5OHkv-j5EJvK_hxqgV9mSu6Ew';
      expect(blobId.toBase64Url())
        .toBe(base64BlobId);
      const decoded = BlobIdentifier.decode(base64BlobId);
      expect(bytesToHex(decoded.hash)).toBe(hashHex);
      expect(decoded.size).toBe(size);
    });
  });
});