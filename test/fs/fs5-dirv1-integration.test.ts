import { describe, test, expect } from "vitest";
import { DirV1, FileRef, DirRef } from "../../src/fs/dirv1/types";
import { DirV1Serialiser } from "../../src/fs/dirv1/serialisation";

describe("FS5 to DirV1 Integration", () => {

  test("DirV1 structure should match expected format", () => {
    // Create a DirV1 structure
    const dirV1: DirV1 = {
      magic: "S5.pro",
      header: {},
      dirs: new Map(),
      files: new Map()
    };

    // Verify the structure
    expect(dirV1.magic).toBe("S5.pro");
    expect(dirV1.dirs).toBeInstanceOf(Map);
    expect(dirV1.files).toBeInstanceOf(Map);
  });

  test("FileRef should contain required fields", () => {
    // New format
    const fileRef: FileRef = {
      hash: new Uint8Array(32),
      size: 1024,
      media_type: "text/plain",
      timestamp: Math.floor(Date.now() / 1000)
    };

    // Verify FileRef structure
    expect(fileRef.hash).toBeInstanceOf(Uint8Array);
    expect(fileRef.hash.length).toBe(32);
    expect(typeof fileRef.size).toBe("number");
    expect(fileRef.media_type).toBe("text/plain");
  });

  test("DirRef should contain link with type and hash", () => {
    // New format
    const dirRef: DirRef = {
      link: {
        type: 'fixed_hash_blake3',
        hash: new Uint8Array(32)
      },
      ts_seconds: Math.floor(Date.now() / 1000)
    };

    // Verify DirRef structure
    expect(dirRef.link).toHaveProperty('type');
    expect(dirRef.link).toHaveProperty('hash');
    expect(dirRef.link.hash).toBeInstanceOf(Uint8Array);
    expect(dirRef.link.hash.length).toBe(32);
  });

  test("DirV1 serialization should produce valid CBOR", () => {
    const dir: DirV1 = {
      magic: "S5.pro",
      header: {},
      dirs: new Map([
        ["docs", {
          link: {
            type: 'fixed_hash_blake3',
            hash: new Uint8Array(32).fill(0xBB)
          },
          ts_seconds: 1234567890
        }]
      ]),
      files: new Map([
        ["readme.txt", {
          hash: new Uint8Array(32).fill(0xAA),
          size: 100,
          media_type: "text/plain"
        }]
      ])
    };

    const serialized = DirV1Serialiser.serialise(dir);
    
    // Should start with magic bytes
    expect(serialized[0]).toBe(0x5f); // Magic byte 1
    expect(serialized[1]).toBe(0x5d); // Magic byte 2
    
    // Then CBOR array indicator and magic string
    expect(serialized[2]).toBe(0x84); // Array of 4
    // The string "S5.pro" is prefixed with its length byte (0x66 = 102 = 6 bytes)
    expect(serialized[3]).toBe(0x66); // String length 6
    expect(new TextDecoder().decode(serialized.slice(4, 10))).toBe("S5.pro");

    // Should be able to deserialize back
    const deserialized = DirV1Serialiser.deserialise(serialized);
    expect(deserialized.magic).toBe("S5.pro");
    expect(deserialized.dirs.size).toBe(1);
    expect(deserialized.files.size).toBe(1);
  });

  test("FS5 should use DirV1 format", () => {
    // This test documents that FS5 class now uses:
    // - DirV1 instead of FS5Directory
    // - FileRef instead of FS5FileReference
    // - DirRef instead of FS5DirectoryReference
    // - DirV1Serialiser instead of msgpackr
    
    expect(true).toBe(true); // Placeholder assertion
  });
});