import { describe, test, expect } from "vitest";
import { DirV1Serialiser } from "../../../src/fs/dirv1/serialisation";
import type { DirV1 } from "../../../src/fs/dirv1/types";
import { RUST_TEST_VECTORS } from "./rust-test-vectors";

describe("DirV1 Deserialisation", () => {
  describe("Round-trip tests", () => {
    test("should deserialise empty directory", () => {
      const hex = RUST_TEST_VECTORS.emptyDir.hex;
      const bytes = Buffer.from(hex, 'hex');
      
      // Add magic bytes
      const withMagic = new Uint8Array(bytes.length + 2);
      withMagic[0] = 0x5f;
      withMagic[1] = 0x5d;
      withMagic.set(bytes, 2);
      
      const deserialised = DirV1Serialiser.deserialise(withMagic);
      
      expect(deserialised.magic).toBe("S5.pro");
      expect(deserialised.header).toEqual({});
      expect(deserialised.dirs.size).toBe(0);
      expect(deserialised.files.size).toBe(0);
    });

    test("should deserialise single file", () => {
      const hex = RUST_TEST_VECTORS.singleFile.hex;
      const bytes = Buffer.from(hex, 'hex');
      
      const withMagic = new Uint8Array(bytes.length + 2);
      withMagic[0] = 0x5f;
      withMagic[1] = 0x5d;
      withMagic.set(bytes, 2);
      
      const deserialised = DirV1Serialiser.deserialise(withMagic);
      
      expect(deserialised.magic).toBe("S5.pro");
      expect(deserialised.files.size).toBe(1);
      expect(deserialised.files.has("test.txt")).toBe(true);
      
      const file = deserialised.files.get("test.txt")!;
      expect(file.hash).toEqual(new Uint8Array(32));
      expect(file.size).toBe(1024);
      expect(file.media_type).toBeUndefined();
      expect(file.timestamp).toBeUndefined();
    });

    test("should deserialise multiple files", () => {
      const hex = RUST_TEST_VECTORS.multipleFiles.hex;
      const bytes = Buffer.from(hex, 'hex');
      
      const withMagic = new Uint8Array(bytes.length + 2);
      withMagic[0] = 0x5f;
      withMagic[1] = 0x5d;
      withMagic.set(bytes, 2);
      
      const deserialised = DirV1Serialiser.deserialise(withMagic);
      
      expect(deserialised.files.size).toBe(3);
      
      const fileA = deserialised.files.get("a.txt")!;
      expect(fileA.hash).toEqual(new Uint8Array(32).fill(0x11));
      expect(fileA.size).toBe(100);
      
      const fileB = deserialised.files.get("b.txt")!;
      expect(fileB.hash).toEqual(new Uint8Array(32).fill(0x22));
      expect(fileB.size).toBe(200);
      
      const fileC = deserialised.files.get("c.txt")!;
      expect(fileC.hash).toEqual(new Uint8Array(32).fill(0x33));
      expect(fileC.size).toBe(300);
    });

    test("should deserialise mixed files and directories", () => {
      const hex = RUST_TEST_VECTORS.filesAndDirs.hex;
      const bytes = Buffer.from(hex, 'hex');
      
      const withMagic = new Uint8Array(bytes.length + 2);
      withMagic[0] = 0x5f;
      withMagic[1] = 0x5d;
      withMagic.set(bytes, 2);
      
      const deserialised = DirV1Serialiser.deserialise(withMagic);
      
      expect(deserialised.dirs.size).toBe(2);
      expect(deserialised.files.size).toBe(1);
      
      // Check src directory
      const srcDir = deserialised.dirs.get("src")!;
      expect(srcDir.link.type).toBe("fixed_hash_blake3");
      expect(srcDir.link.hash).toEqual(new Uint8Array(32).fill(0xbb));
      expect(srcDir.ts_seconds).toBeUndefined();
      expect(srcDir.ts_nanos).toBeUndefined();
      
      // Check test directory with timestamps
      const testDir = deserialised.dirs.get("test")!;
      expect(testDir.link.type).toBe("resolver_registry");
      expect(testDir.link.hash).toEqual(new Uint8Array(32).fill(0xcc));
      expect(testDir.ts_seconds).toBe(1234567890);
      expect(testDir.ts_nanos).toBe(123456789);
      
      // Check readme file
      const readme = deserialised.files.get("readme.md")!;
      expect(readme.hash).toEqual(new Uint8Array(32).fill(0xaa));
      expect(readme.size).toBe(1234);
    });

    test("should deserialise unicode filename", () => {
      const hex = RUST_TEST_VECTORS.unicodeFileName.hex;
      const bytes = Buffer.from(hex, 'hex');
      
      const withMagic = new Uint8Array(bytes.length + 2);
      withMagic[0] = 0x5f;
      withMagic[1] = 0x5d;
      withMagic.set(bytes, 2);
      
      const deserialised = DirV1Serialiser.deserialise(withMagic);
      
      expect(deserialised.files.size).toBe(1);
      expect(deserialised.files.has("Hello 世界 🚀.txt")).toBe(true);
      
      const file = deserialised.files.get("Hello 世界 🚀.txt")!;
      expect(file.hash).toEqual(new Uint8Array(32).fill(0xff));
      expect(file.size).toBe(42);
    });

    test("should deserialise large file size", () => {
      const hex = RUST_TEST_VECTORS.largeFile.hex;
      const bytes = Buffer.from(hex, 'hex');
      
      const withMagic = new Uint8Array(bytes.length + 2);
      withMagic[0] = 0x5f;
      withMagic[1] = 0x5d;
      withMagic.set(bytes, 2);
      
      const deserialised = DirV1Serialiser.deserialise(withMagic);
      
      const file = deserialised.files.get("huge.bin")!;
      expect(file.size).toBe(18446744073709551615n);
    });

    test("should handle CBOR without magic bytes", () => {
      const hex = RUST_TEST_VECTORS.emptyDir.hex;
      const bytes = Buffer.from(hex, 'hex');
      
      const deserialised = DirV1Serialiser.deserialise(bytes);
      
      expect(deserialised.magic).toBe("S5.pro");
      expect(deserialised.header).toEqual({});
      expect(deserialised.dirs.size).toBe(0);
      expect(deserialised.files.size).toBe(0);
    });
  });

  describe("Full round-trip verification", () => {
    Object.entries(RUST_TEST_VECTORS).forEach(([name, vector]) => {
      test(`should round-trip: ${vector.description}`, () => {
        const originalBytes = Buffer.from(vector.hex, 'hex');
        
        // Add magic bytes for deserialisation
        const withMagic = new Uint8Array(originalBytes.length + 2);
        withMagic[0] = 0x5f;
        withMagic[1] = 0x5d;
        withMagic.set(originalBytes, 2);
        
        // Deserialise
        const dirV1 = DirV1Serialiser.deserialise(withMagic);
        
        // Re-serialise
        const reserialised = DirV1Serialiser.serialise(dirV1);
        
        // Compare (remove magic bytes from reserialised)
        const reserialisedHex = Buffer.from(reserialised.slice(2)).toString('hex');
        expect(reserialisedHex).toBe(vector.hex);
      });
    });
  });
});