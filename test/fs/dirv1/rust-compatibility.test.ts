import { describe, test, expect } from "vitest";

describe("Rust CBOR Compatibility Tests", () => {
  describe("Known CBOR Encodings", () => {
    test("empty DirV1 structure", () => {
      // DirV1 is encoded as array [magic, header, dirs, files]
      // Empty dir should be: [magic="S5.pro", header={}, dirs={}, files={}]

      const expected = Buffer.concat([
        Buffer.from([0x5f, 0x5d]), // S5 magic bytes
        Buffer.from([
          0x84, // Array of 4 elements
          0x66,
          0x53,
          0x35,
          0x2e,
          0x70,
          0x72,
          0x6f, // "S5.pro" (text string length 6)
          0xa0, // Empty map (header)
          0xa0, // Empty map (dirs)
          0xa0, // Empty map (files)
        ]),
      ]);

      console.log("Expected hex:", expected.toString("hex"));
      // Should output: 5f5d846653352e70726fa0a0a0
    });

    test("DirV1 with single file", () => {
      // FileRef in CBOR uses integer keys in a map
      // Map key 3 = hash (32 bytes)
      // Map key 4 = size (integer)

      const fileName = Buffer.from("test.txt");
      const fileHash = Buffer.alloc(32, 0); // 32 zero bytes
      const fileSize = 1024;

      // Build CBOR manually to understand structure
      const fileCbor = Buffer.concat([
        Buffer.from([0xa2]), // Map with 2 entries
        Buffer.from([0x03]), // Key: 3
        Buffer.from([0x58, 0x20]), // Byte string of length 32
        fileHash,
        Buffer.from([0x04]), // Key: 4
        Buffer.from([0x19, 0x04, 0x00]), // Unsigned int 1024
      ]);

      console.log("File CBOR:", fileCbor.toString("hex"));
    });
  });
});
