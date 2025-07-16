import { describe, test, expect, beforeEach } from "vitest";
import { DirV1Serialiser } from "../../../src/fs/dirv1/serialisation";
import { encodeS5, decodeS5, createOrderedMap } from "../../../src/fs/dirv1/cbor-config";
import type { 
  DirV1, 
  FileRef, 
  DirRef, 
  DirLink, 
  BlobLocation,
  DirHeader 
} from "../../../src/fs/dirv1/types";

describe("CBOR Serialisation", () => {
  describe("Basic CBOR encoding", () => {
    test("should encode strings deterministically", () => {
      const str = "S5.pro";
      const encoded = encodeS5(str);
      // CBOR text string: 0x66 (text length 6) + "S5.pro"
      expect(Array.from(encoded)).toEqual([0x66, 0x53, 0x35, 0x2e, 0x70, 0x72, 0x6f]);
    });

    test("should encode empty maps as 0xa0", () => {
      const emptyMap = new Map();
      const encoded = encodeS5(emptyMap);
      expect(Array.from(encoded)).toEqual([0xa0]);
    });

    test("should encode arrays with correct prefix", () => {
      const array4 = ["S5.pro", {}, {}, {}];
      const encoded = encodeS5(array4);
      expect(encoded[0]).toBe(0x84); // Array of 4 elements
    });

    test("should encode maps with integer keys", () => {
      const map = new Map<number, any>([
        [3, new Uint8Array(32).fill(0)],
        [4, 1024],
      ]);
      const encoded = encodeS5(map);
      const hex = Buffer.from(encoded).toString("hex");
      
      // Should contain: a2 (map-2), 03 (key), 5820 (bytes-32), ...
      expect(hex).toMatch(/^a203582000/);
    });

    test("should maintain deterministic ordering", () => {
      // Test that same data produces same encoding
      const data = { z: "last", a: "first", m: "middle" };
      const encoded1 = encodeS5(data);
      const encoded2 = encodeS5(data);
      
      expect(encoded1).toEqual(encoded2);
    });
  });

  describe("DirV1 structure serialisation", () => {
    test("should serialise empty directory", () => {
      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map(),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const hex = Buffer.from(serialised).toString("hex");
      
      // Should match Rust output exactly
      expect(hex).toBe("5f5d846653352e70726fa0a0a0");
    });

    test("should serialise directory with single file", () => {
      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          ["test.txt", {
            hash: new Uint8Array(32).fill(0),
            size: 1024,
          } as FileRef]
        ]),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const hex = Buffer.from(serialised).toString("hex");
      
      expect(hex).toBe("5f5d846653352e70726fa0a0a168746573742e747874a2035820000000000000000000000000000000000000000000000000000000000000000004190400");
    });

    test("should serialise directory with multiple files in correct order", () => {
      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          ["a.txt", { hash: new Uint8Array(32).fill(0x11), size: 100 } as FileRef],
          ["b.txt", { hash: new Uint8Array(32).fill(0x22), size: 200 } as FileRef],
          ["c.txt", { hash: new Uint8Array(32).fill(0x33), size: 300 } as FileRef],
        ]),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const hex = Buffer.from(serialised).toString("hex");
      
      expect(hex).toBe("5f5d846653352e70726fa0a0a365612e747874a2035820111111111111111111111111111111111111111111111111111111111111111104186465622e747874a203582022222222222222222222222222222222222222222222222222222222222222220418c865632e747874a203582033333333333333333333333333333333333333333333333333333333333333330419012c");
    });
  });

  describe("FileRef serialisation", () => {
    test("should serialise FileRef with only required fields", () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(0xaa),
        size: 1234,
      };

      // Test through a directory structure
      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([["test.txt", fileRef]]),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      expect(serialised).toBeDefined();
    });

    test("should serialise FileRef with all optional fields", () => {
      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(0x44),
        size: 999999,
        media_type: "application/octet-stream",
        timestamp: 1704067200, // 2024-01-01
        timestamp_subsec_nanos: 500000000,
        locations: [
          { type: "http", url: "https://example.com/file" },
          { type: "multihash_blake3", hash: new Uint8Array(32).fill(0x77) },
        ],
        extra: new Map([
          ["author", []],
          ["version", []],
        ]),
      };

      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([["complete.bin", fileRef]]),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const hex = Buffer.from(serialised).toString("hex");
      
      expect(hex).toBe("5f5d846653352e70726fa0a0a16c636f6d706c6574652e62696ea70358204444444444444444444444444444444444444444444444444444444444444444041a000f423f0678186170706c69636174696f6e2f6f637465742d73747265616d071a65920080081a1dcd650009828201781868747470733a2f2f6578616d706c652e636f6d2f66696c6582181e5820777777777777777777777777777777777777777777777777777777777777777716a266617574686f72806776657273696f6e80");
    });

    test("should serialise FileRef with previous version", () => {
      const prevFile: FileRef = {
        hash: new Uint8Array(32).fill(0x77),
        size: 1024,
        timestamp: 1704000000,
      };

      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(0x88),
        size: 2048,
        media_type: "text/plain",
        timestamp: 1704067200,
        prev: prevFile,
      };

      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([["versioned.txt", fileRef]]),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const hex = Buffer.from(serialised).toString("hex");
      
      expect(hex).toBe("5f5d846653352e70726fa0a0a16d76657273696f6e65642e747874a5035820888888888888888888888888888888888888888888888888888888888888888804190800066a746578742f706c61696e071a6592008017a3035820777777777777777777777777777777777777777777777777777777777777777704190400071a6590fa00");
    });
  });

  describe("DirRef serialisation", () => {
    test("should serialise DirRef with blake3 link", () => {
      const dirRef: DirRef = {
        link: {
          type: "fixed_hash_blake3",
          hash: new Uint8Array(32).fill(0xbb),
        } as DirLink,
      };

      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map([["src", dirRef]]),
        files: new Map(),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const hex = Buffer.from(serialised).toString("hex");
      
      expect(hex).toContain("0258211ebb"); // DirLink encoding
    });

    test("should serialise DirRef with mutable registry ed25519 link", () => {
      const dirRef: DirRef = {
        link: {
          type: "mutable_registry_ed25519",
          publicKey: new Uint8Array(32).fill(0xcc),
        } as DirLink,
        ts_seconds: 1234567890,
        ts_nanos: 123456789,
      };

      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map([["test", dirRef]]),
        files: new Map(),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const hex = Buffer.from(serialised).toString("hex");
      
      expect(hex).toContain("025821edcc"); // Registry link encoding
    });
  });

  describe("DirLink encoding", () => {
    test("should encode fixed_hash_blake3 as 33 bytes", () => {
      const link: DirLink = {
        type: "fixed_hash_blake3",
        hash: new Uint8Array(32).fill(0xaa),
      };

      const encoded = DirV1Serialiser.serialiseDirLink(link);
      
      expect(encoded.length).toBe(33);
      expect(encoded[0]).toBe(0x1e);
      expect(Array.from(encoded.slice(1))).toEqual(Array(32).fill(0xaa));
    });

    test("should encode mutable_registry_ed25519 as 33 bytes", () => {
      const link: DirLink = {
        type: "mutable_registry_ed25519",
        publicKey: new Uint8Array(32).fill(0xbb),
      };

      const encoded = DirV1Serialiser.serialiseDirLink(link);
      
      expect(encoded.length).toBe(33);
      expect(encoded[0]).toBe(0xed);
      expect(Array.from(encoded.slice(1))).toEqual(Array(32).fill(0xbb));
    });
  });

  describe("BlobLocation serialisation", () => {
    test("should serialise all BlobLocation types", () => {
      const locations: BlobLocation[] = [
        { type: "identity", data: new Uint8Array([0x01, 0x02, 0x03, 0x04]) },
        { type: "http", url: "https://cdn.example.com/data" },
        { type: "multihash_sha1", hash: new Uint8Array(20).fill(0x11) },
        { type: "multihash_sha2_256", hash: new Uint8Array(32).fill(0x22) },
        { type: "multihash_blake3", hash: new Uint8Array(32).fill(0x33) },
        { type: "multihash_md5", hash: new Uint8Array(16).fill(0x44) },
      ];

      const fileRef: FileRef = {
        hash: new Uint8Array(32).fill(0x55),
        size: 4096,
        locations,
      };

      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([["multi-location.dat", fileRef]]),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const hex = Buffer.from(serialised).toString("hex");
      
      expect(hex).toBe("5f5d846653352e70726fa0a0a1726d756c74692d6c6f636174696f6e2e646174a30358205555555555555555555555555555555555555555555555555555555555555555041910000986820044010203048201781c68747470733a2f2f63646e2e6578616d706c652e636f6d2f64617461821154111111111111111111111111111111111111111182125820222222222222222222222222222222222222222222222222222222222222222282181e582033333333333333333333333333333333333333333333333333333333333333338218d55044444444444444444444444444444444");
    });
  });
});