import { describe, test, expect } from "vitest";
import { DirV1Serialiser } from "../../../src/fs/dirv1/serialisation.js";
import { createOrderedMap } from "../../../src/fs/dirv1/cbor-config.js";
import type { DirV1, FileRef, DirRef } from "../../../src/fs/dirv1/types.js";

describe("Integration Tests", () => {
  describe("Real-world scenarios", () => {
    test("should handle a typical project directory structure", () => {
      const projectDir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map([
          ["src", {
            link: {
              type: "fixed_hash_blake3",
              hash: new Uint8Array(32).fill(0x01),
            },
            ts_seconds: 1704067200,
          }],
          ["test", {
            link: {
              type: "fixed_hash_blake3",
              hash: new Uint8Array(32).fill(0x02),
            },
            ts_seconds: 1704067200,
          }],
          ["docs", {
            link: {
              type: "fixed_hash_blake3",
              hash: new Uint8Array(32).fill(0x03),
            },
            ts_seconds: 1704067200,
          }],
        ]),
        files: new Map([
          ["README.md", {
            hash: new Uint8Array(32).fill(0x10),
            size: 4096,
            media_type: "text/markdown",
            timestamp: 1704067200,
          }],
          ["package.json", {
            hash: new Uint8Array(32).fill(0x11),
            size: 1024,
            media_type: "application/json",
            timestamp: 1704067200,
          }],
          [".gitignore", {
            hash: new Uint8Array(32).fill(0x12),
            size: 256,
            media_type: "text/plain",
            timestamp: 1704067200,
          }],
        ]),
      };

      const serialised = DirV1Serialiser.serialise(projectDir);
      const deserialised = DirV1Serialiser.deserialise(serialised);

      expect(deserialised.dirs.size).toBe(3);
      expect(deserialised.files.size).toBe(3);
      expect(deserialised.files.get("README.md")?.media_type).toBe("text/markdown");
    });

    test("should handle a media gallery structure", () => {
      const galleryDir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map([
          ["thumbnails", {
            link: {
              type: "mutable_registry_ed25519",
              publicKey: new Uint8Array(32).fill(0x20),
            },
          }],
          ["originals", {
            link: {
              type: "mutable_registry_ed25519",
              publicKey: new Uint8Array(32).fill(0x21),
            },
          }],
        ]),
        files: new Map(),
      };

      // Add image files with metadata
      const imageExtensions = [".jpg", ".png", ".webp"];
      const imageSizes = [1048576, 2097152, 524288]; // 1MB, 2MB, 512KB

      imageExtensions.forEach((ext, index) => {
        for (let i = 1; i <= 3; i++) {
          const filename = `image${i}${ext}`;
          galleryDir.files.set(filename, {
            hash: new Uint8Array(32).fill(index * 10 + i),
            size: imageSizes[index],
            media_type: `image/${ext.slice(1)}`,
            timestamp: 1704067200 + i * 3600,
            locations: [
              { 
                type: "http", 
                url: `https://cdn.example.com/gallery/${filename}` 
              },
            ],
          });
        }
      });

      const serialised = DirV1Serialiser.serialise(galleryDir);
      const deserialised = DirV1Serialiser.deserialise(serialised);

      expect(deserialised.files.size).toBe(9);
      expect(deserialised.dirs.size).toBe(2);
      
      // Verify image metadata
      const image1 = deserialised.files.get("image1.jpg");
      expect(image1?.media_type).toBe("image/jpg");
      expect(image1?.size).toBe(1048576);
      expect(image1?.locations?.[0].type).toBe("http");
    });
  });

  describe("Performance considerations", () => {
    test("should handle large directories efficiently", () => {
      const largeDir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map(),
      };

      // Add 1000 files
      const startTime = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        largeDir.files.set(`file${i.toString().padStart(4, '0')}.txt`, {
          hash: new Uint8Array(32).fill(i % 256),
          size: 1024 + i,
          media_type: "text/plain",
          timestamp: 1704067200 + i,
        });
      }

      const serialised = DirV1Serialiser.serialise(largeDir);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
      expect(largeDir.files.size).toBe(1000);

      // Verify deserialisation
      const deserialised = DirV1Serialiser.deserialise(serialised);
      expect(deserialised.files.size).toBe(1000);
    });
  });

  describe("Compatibility checks", () => {
    test("should match exact byte output from test_encode.rs", () => {
      // Test 1: Empty Directory
      const emptyDir: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map(),
      };

      let serialised = DirV1Serialiser.serialise(emptyDir);
      expect(Buffer.from(serialised).toString("hex")).toBe("5f5d846653352e70726fa0a0a0");

      // Test 2: Directory with one file
      const dirWithFile: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          ["test.txt", {
            hash: new Uint8Array(32),
            size: 1024,
          }]
        ]),
      };

      serialised = DirV1Serialiser.serialise(dirWithFile);
      expect(Buffer.from(serialised).toString("hex")).toBe(
        "5f5d846653352e70726fa0a0a168746573742e747874a2035820000000000000000000000000000000000000000000000000000000000000000004190400"
      );

      // Test 3: Directory with file + metadata
      const dirWithMetadata: DirV1 = {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map([
          ["photo.jpg", {
            hash: new Uint8Array(32).fill(0xff),
            size: 2048,
            media_type: "image/jpeg",
            timestamp: 1234567890,
          }]
        ]),
      };

      serialised = DirV1Serialiser.serialise(dirWithMetadata);
      expect(Buffer.from(serialised).toString("hex")).toBe(
        "5f5d846653352e70726fa0a0a16970686f746f2e6a7067a4035820ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff04190800066a696d6167652f6a706567071a499602d2"
      );
    });
  });
});