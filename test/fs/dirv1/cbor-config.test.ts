import { describe, test, expect } from "vitest";
import { 
  encodeS5, 
  decodeS5, 
  createOrderedMap,
  s5Encoder,
  s5Decoder 
} from "../../../src/fs/dirv1/cbor-config";

describe("CBOR Configuration", () => {
  describe("Deterministic encoding", () => {
    test("should produce identical output for same input", () => {
      const data = {
        z: "last",
        a: "first",
        m: "middle",
        nested: { y: 2, x: 1 },
        array: [3, 1, 2],
      };

      const encoded1 = encodeS5(data);
      const encoded2 = encodeS5(data);
      const encoded3 = encodeS5(data);

      expect(encoded1).toEqual(encoded2);
      expect(encoded2).toEqual(encoded3);
    });

    test("should encode Maps deterministically", () => {
      const map1 = new Map([["z", 1], ["a", 2], ["m", 3]]);
      const map2 = new Map([["z", 1], ["a", 2], ["m", 3]]);
      
      const encoded1 = encodeS5(map1);
      const encoded2 = encodeS5(map2);
      
      expect(encoded1).toEqual(encoded2);
    });

    test("should handle Uint8Array correctly", () => {
      const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const encoded = encodeS5(bytes);
      
      // CBOR byte string: 0x44 (bytes length 4) + data
      expect(Array.from(encoded)).toEqual([0x44, 0x01, 0x02, 0x03, 0x04]);
    });

    test("should not tag Uint8Arrays", () => {
      const bytes = new Uint8Array(32).fill(0xaa);
      const encoded = encodeS5(bytes);
      
      // Should be: 0x58 0x20 (bytes-32) + data, not tagged
      expect(encoded[0]).toBe(0x58);
      expect(encoded[1]).toBe(0x20);
      expect(encoded.length).toBe(34); // 2 header bytes + 32 data bytes
    });
  });

  describe("Ordered maps", () => {
    test("should create maps with sorted keys", () => {
      const obj = { z: 1, a: 2, m: 3, b: 4 };
      const orderedMap = createOrderedMap(obj);
      
      const keys = Array.from(orderedMap.keys());
      expect(keys).toEqual(["a", "b", "m", "z"]);
    });

    test("should maintain order through serialisation", () => {
      const obj1 = { z: 1, a: 2 };
      const obj2 = { a: 2, z: 1 };
      
      const map1 = createOrderedMap(obj1);
      const map2 = createOrderedMap(obj2);
      
      const encoded1 = encodeS5(map1);
      const encoded2 = encodeS5(map2);
      
      expect(encoded1).toEqual(encoded2);
    });
  });

  describe("Round-trip encoding/decoding", () => {
    test("should preserve basic types", () => {
      const testCases = [
        null,
        true,
        false,
        42,
        -42,
        3.14,
        "hello world",
        "",
        new Uint8Array([1, 2, 3]),
        new Map([["key", "value"]]),
        { a: 1, b: 2 },
        [1, 2, 3],
      ];

      testCases.forEach(original => {
        const encoded = encodeS5(original);
        const decoded = decodeS5(encoded);
        
        if (original instanceof Uint8Array) {
          expect(new Uint8Array(decoded)).toEqual(original);
        } else if (original instanceof Map) {
          expect(decoded).toBeInstanceOf(Map);
          expect(decoded).toEqual(original);
        } else if (typeof original === 'object' && original !== null && !Array.isArray(original)) {
          // Objects are converted to Maps during encoding
          expect(decoded).toBeInstanceOf(Map);
          expect(Object.fromEntries(decoded)).toEqual(original);
        } else {
          expect(decoded).toEqual(original);
        }
      });
    });

    test("should handle large integers correctly", () => {
      const largeInt = 18446744073709551615n; // Max uint64
      const encoded = encodeS5(largeInt);
      const decoded = decodeS5(encoded);
      
      expect(decoded).toBe(largeInt);
    });

    test("should preserve Map entry order", () => {
      const map = new Map([
        ["z", 1],
        ["a", 2],
        ["m", 3],
      ]);
      
      const encoded = encodeS5(map);
      const decoded = decodeS5(encoded) as Map<string, number>;
      
      expect(Array.from(decoded.keys())).toEqual(["z", "a", "m"]);
    });
  });

  describe("Encoder configuration", () => {
    test("should have correct settings for S5", () => {
      // Verify encoder settings
      expect(s5Encoder.sequential).toBe(true);
      expect(s5Encoder.mapsAsObjects).toBe(false);
      expect(s5Encoder.bundleStrings).toBe(false);
      expect(s5Encoder.variableMapSize).toBe(false);
      expect(s5Encoder.useRecords).toBe(false);
      expect(s5Encoder.tagUint8Array).toBe(false);
    });

    test("should have matching decoder settings", () => {
      expect(s5Decoder.mapsAsObjects).toBe(false);
      expect(s5Decoder.variableMapSize).toBe(false);
      expect(s5Decoder.useRecords).toBe(false);
      expect(s5Decoder.tagUint8Array).toBe(false);
    });
  });
});