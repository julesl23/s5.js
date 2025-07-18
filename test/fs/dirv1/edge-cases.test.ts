import { describe, test, expect } from "vitest";
import { DirV1Serialiser } from "../../../src/fs/dirv1/serialisation.js";
import type { DirV1, FileRef, DirRef } from "../../../src/fs/dirv1/types.js";

describe("Edge Cases", () => {
  describe("File and directory names", () => {
    test("should handle empty file name", () => {
      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          ["", { hash: new Uint8Array(32), size: 0 } as FileRef]
        ]),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const hex = Buffer.from(serialised).toString("hex");
      
      expect(hex).toBe("5f5d846653352e70726fa0a0a160a203582000000000000000000000000000000000000000000000000000000000000000000400");
    });

    test("should handle unicode characters in file names", () => {
      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          ["Hello 世界 🚀.txt", { 
            hash: new Uint8Array(32).fill(0xff), 
            size: 42 
          } as FileRef]
        ]),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const hex = Buffer.from(serialised).toString("hex");
      
      expect(hex).toBe("5f5d846653352e70726fa0a0a17548656c6c6f20e4b896e7958c20f09f9a802e747874a2035820ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff04182a");
    });

    test("should handle very long file names", () => {
      const longName = "very_long_name_with_many_characters_that_exceeds_typical_lengths_and_continues_even_further.txt";
      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          [longName, { 
            hash: new Uint8Array(32).fill(0x02), 
            size: 100 
          } as FileRef]
        ]),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      expect(serialised).toBeDefined();
      
      // Verify it can be deserialised
      const deserialised = DirV1Serialiser.deserialise(serialised);
      expect(deserialised.files.has(longName)).toBe(true);
    });

    test("should handle special characters in names", () => {
      const testNames = [
        "name/with/slashes.txt",
        "name\\with\\backslashes.txt",
        "name with spaces.txt",
        "名前.txt", // Japanese
        "🦀.rs", // Emoji
      ];

      testNames.forEach(name => {
        const dir: DirV1 = {
          magic: "S5.pro",
          header: {},
          dirs: new Map(),
          files: new Map([
            [name, { 
              hash: new Uint8Array(32).fill(0x01), 
              size: 100 
            } as FileRef]
          ]),
        };

        const serialised = DirV1Serialiser.serialise(dir);
        const deserialised = DirV1Serialiser.deserialise(serialised);
        
        expect(deserialised.files.has(name)).toBe(true);
      });
    });
  });

  describe("Numeric edge cases", () => {
    test("should handle zero-size file", () => {
      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          ["zero_size.bin", { 
            hash: new Uint8Array(32).fill(0x10), 
            size: 0 
          } as FileRef]
        ]),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const deserialised = DirV1Serialiser.deserialise(serialised);
      
      expect(deserialised.files.get("zero_size.bin")?.size).toBe(0);
    });

    test("should handle maximum file size (uint64 max)", () => {
      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          ["huge.bin", { 
            hash: new Uint8Array(32).fill(0x99), 
            size: 18446744073709551615n // Max uint64 as BigInt
          } as FileRef]
        ]),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const hex = Buffer.from(serialised).toString("hex");
      
      expect(hex).toBe("5f5d846653352e70726fa0a0a168687567652e62696ea20358209999999999999999999999999999999999999999999999999999999999999999041bffffffffffffffff");
    });

    test("should handle minimum and maximum timestamps", () => {
      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          ["min_timestamp.txt", {
            hash: new Uint8Array(32).fill(0x12),
            size: 1024,
            timestamp: 0,
          } as FileRef],
          ["max_timestamp.txt", {
            hash: new Uint8Array(32).fill(0x13),
            size: 2048,
            timestamp: 4294967295, // Max uint32
            timestamp_subsec_nanos: 999999999,
          } as FileRef],
        ]),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const deserialised = DirV1Serialiser.deserialise(serialised);
      
      expect(deserialised.files.get("min_timestamp.txt")?.timestamp).toBe(0);
      expect(deserialised.files.get("max_timestamp.txt")?.timestamp).toBe(4294967295);
    });
  });

  describe("Complex structures", () => {
    test("should handle directory with only subdirectories", () => {
      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map([
          ["bin", {
            link: {
              type: "fixed_hash_blake3",
              hash: new Uint8Array(32).fill(0x40),
            },
          } as DirRef],
          ["lib", {
            link: {
              type: "fixed_hash_blake3",
              hash: new Uint8Array(32).fill(0x41),
            },
          } as DirRef],
          ["etc", {
            link: {
              type: "mutable_registry_ed25519",
              publicKey: new Uint8Array(32).fill(0x42),
            },
            ts_seconds: 1704067200,
            ts_nanos: 0,
          } as DirRef],
        ]),
        files: new Map(),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const hex = Buffer.from(serialised).toString("hex");
      
      expect(hex).toBe("5f5d846653352e70726fa0a36362696ea10258211e404040404040404040404040404040404040404040404040404040404040404063657463a3025821ed4242424242424242424242424242424242424242424242424242424242424242071a659200800800636c6962a10258211e4141414141414141414141414141414141414141414141414141414141414141a0");
    });

    test("should handle deeply nested file references", () => {
      // Create a chain of file versions
      const version1: FileRef = {
        hash: new Uint8Array(32).fill(0x01),
        size: 100,
        timestamp: 1704000000,
      };

      const version2: FileRef = {
        hash: new Uint8Array(32).fill(0x02),
        size: 200,
        timestamp: 1704010000,
        prev: version1,
      };

      const version3: FileRef = {
        hash: new Uint8Array(32).fill(0x03),
        size: 300,
        timestamp: 1704020000,
        prev: version2,
      };

      const dir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([["versioned.txt", version3]]),
      };

      const serialised = DirV1Serialiser.serialise(dir);
      const deserialised = DirV1Serialiser.deserialise(serialised);
      
      const file = deserialised.files.get("versioned.txt");
      expect(file?.prev).toBeDefined();
      expect(file?.prev?.prev).toBeDefined();
      expect(file?.prev?.prev?.prev).toBeUndefined();
    });
  });
});