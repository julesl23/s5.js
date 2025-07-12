import { describe, test, expect } from "vitest";
import { DirV1Serialiser } from "../../../src/fs/dirv1/serialisation";
import { encodeS5 } from "../../../src/fs/dirv1/cbor-config";
import type { DirV1, FileRef, DirRef, DirLink } from "../../../src/fs/dirv1/types";
import { RUST_TEST_VECTORS } from "./rust-test-vectors";

describe("Rust CBOR Test Vectors", () => {
  // Convert Rust test vectors to test structures
  const TEST_VECTORS = {
    emptyDir: {
      description: RUST_TEST_VECTORS.emptyDir.description,
      hex: RUST_TEST_VECTORS.emptyDir.hex,
      structure: {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map(),
      },
    },
    singleFile: {
      description: RUST_TEST_VECTORS.singleFile.description,
      hex: RUST_TEST_VECTORS.singleFile.hex,
      structure: {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          [
            "test.txt",
            {
              hash: new Uint8Array(32), // 32 zero bytes
              size: 1024,
            },
          ],
        ]),
      },
    },
    multipleFiles: {
      description: RUST_TEST_VECTORS.multipleFiles.description,
      hex: RUST_TEST_VECTORS.multipleFiles.hex,
      structure: {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          ["a.txt", {
            hash: new Uint8Array(32).fill(0x11),
            size: 100,
          }],
          ["b.txt", {
            hash: new Uint8Array(32).fill(0x22),
            size: 200,
          }],
          ["c.txt", {
            hash: new Uint8Array(32).fill(0x33),
            size: 300,
          }],
        ]),
      },
    },
    filesAndDirs: {
      description: RUST_TEST_VECTORS.filesAndDirs.description,
      hex: RUST_TEST_VECTORS.filesAndDirs.hex,
      structure: {
        magic: "S5.pro",
        header: {},
        dirs: new Map([
          ["src", {
            link: {
              type: "fixed_hash_blake3",
              hash: new Uint8Array(32).fill(0xbb),
            },
          }],
          ["test", {
            link: {
              type: "resolver_registry",
              hash: new Uint8Array(32).fill(0xcc),
            },
            ts_seconds: 1234567890,
            ts_nanos: 123456789,
          }],
        ]),
        files: new Map([
          ["readme.md", {
            hash: new Uint8Array(32).fill(0xaa),
            size: 1234,
          }],
        ]),
      },
    },
    emptyFileName: {
      description: RUST_TEST_VECTORS.emptyFileName.description,
      hex: RUST_TEST_VECTORS.emptyFileName.hex,
      structure: {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          ["", {
            hash: new Uint8Array(32), // 32 zero bytes
            size: 0,
          }],
        ]),
      },
    },
    unicodeFileName: {
      description: RUST_TEST_VECTORS.unicodeFileName.description,
      hex: RUST_TEST_VECTORS.unicodeFileName.hex,
      structure: {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          ["Hello 世界 🚀.txt", {
            hash: new Uint8Array(32).fill(0xff),
            size: 42,
          }],
        ]),
      },
    },
    largeFile: {
      description: RUST_TEST_VECTORS.largeFile.description,
      hex: RUST_TEST_VECTORS.largeFile.hex,
      structure: {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          ["huge.bin", {
            hash: new Uint8Array(32).fill(0x99),
            size: 18446744073709551615n, // Max uint64 as BigInt
          }],
        ]),
      },
    },
  };

  describe("Exact Match Tests", () => {
    Object.entries(TEST_VECTORS).forEach(([name, vector]) => {
      test(`should match Rust output for: ${vector.description}`, () => {
        const serialised = DirV1Serialiser.serialise(vector.structure as DirV1);
        const hex = Buffer.from(serialised).toString("hex");

        // Remove magic bytes if your implementation adds them
        const hexWithoutMagic = hex.startsWith("5f5d") ? hex.substring(4) : hex;

        expect(hexWithoutMagic).toBe(vector.hex);
      });
    });
  });

  describe("Encoding Components", () => {
    test('should encode "S5.pro" as CBOR text string', () => {
      // CBOR text string: 0x66 (text length 6) + "S5.pro"
      const expected = Buffer.from([0x66, 0x53, 0x35, 0x2e, 0x70, 0x72, 0x6f]);

      // Your encoder should produce this for the magic string
      const encoded = encodeS5("S5.pro");
      expect(Buffer.from(encoded)).toEqual(expected);
    });

    test("should encode empty map as 0xa0", () => {
      const expected = Buffer.from([0xa0]);

      // Test with an actual Map, not a plain object
      const encoded = encodeS5(new Map());
      expect(Buffer.from(encoded)).toEqual(expected);
    });

    test("should encode array of 4 elements with 0x84", () => {
      const array = ["S5.pro", {}, {}, {}];
      const encoded = encodeS5(array);

      // Should start with 0x84 (array of 4)
      expect(encoded[0]).toBe(0x84);
    });

    test("should encode FileRef with integer keys", () => {
      // FileRef should use: key 3 for hash, key 4 for size
      const fileMap = new Map<number, any>([
        [3, new Uint8Array(32)], // hash
        [4, 1024], // size
      ]);

      const encoded = encodeS5(fileMap);
      const hex = Buffer.from(encoded).toString("hex");

      // Should contain: a2 (map-2), 03 (key), 5820 (bytes-32), 04 (key), 190400 (1024)
      expect(hex).toContain("a203582000");
    });
  });

  describe("DirLink Encoding", () => {
    test("should encode DirLink as 33-byte raw bytes", () => {
      const link: DirLink = {
        type: "fixed_hash_blake3",
        hash: new Uint8Array(32).fill(0xaa),
      };

      // Should be encoded as 33 bytes: [0x1e, ...32 hash bytes]
      const encoded = DirV1Serialiser.serialiseDirLink(link);

      expect(encoded.length).toBe(33);
      expect(encoded[0]).toBe(0x1e);
      expect(encoded.slice(1)).toEqual(new Uint8Array(32).fill(0xaa));
    });
  });
});
