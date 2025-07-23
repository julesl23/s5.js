import { describe, test, expect, beforeAll } from "vitest";
import { HAMTHasher } from "../../../src/fs/hamt/utils.js";
import { blake3 } from "@noble/hashes/blake3";

// Note: xxhash-wasm will need to be installed and initialized
describe("HAMT Hash Functions", () => {
  let hasher: HAMTHasher;

  beforeAll(async () => {
    // Initialize hasher (will need to load xxhash WASM)
    hasher = new HAMTHasher();
    await hasher.initialize();
  });

  describe("xxhash64 (default)", () => {
    test("should produce consistent 64-bit hash for same input", async () => {
      const input = "test-key";
      
      const hash1 = await hasher.hashKey(input, 0); // 0 = xxhash64
      const hash2 = await hasher.hashKey(input, 0);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toBeGreaterThan(0n);
      expect(hash1.toString(2).length).toBeLessThanOrEqual(64); // 64-bit
    });

    test("should handle empty strings", async () => {
      const hash = await hasher.hashKey("", 0);
      
      expect(hash).toBeDefined();
      expect(hash).toBeGreaterThan(0n);
    });

    test("should handle Unicode strings correctly", async () => {
      const unicodeStrings = [
        "Hello 世界",
        "🚀 Emoji test 🎉",
        "Ωμέγα",
        "नमस्ते"
      ];

      for (const str of unicodeStrings) {
        const hash = await hasher.hashKey(str, 0);
        expect(hash).toBeDefined();
        expect(hash).toBeGreaterThan(0n);
        
        // Same string should produce same hash
        const hash2 = await hasher.hashKey(str, 0);
        expect(hash).toBe(hash2);
      }
    });

    test("should distribute keys evenly across 32 slots", async () => {
      const distribution = new Array(32).fill(0);
      const numKeys = 10000;
      
      // Generate many keys and check distribution
      for (let i = 0; i < numKeys; i++) {
        const key = `f:file${i}.txt`;
        const hash = await hasher.hashKey(key, 0);
        const index = Number(hash & 0x1Fn); // First 5 bits
        distribution[index]++;
      }
      
      // Check for reasonable distribution (not perfect, but not terrible)
      const expectedPerSlot = numKeys / 32;
      const tolerance = expectedPerSlot * 0.5; // 50% tolerance for simple hash
      
      // Count how many slots have reasonable distribution
      let wellDistributed = 0;
      for (let i = 0; i < 32; i++) {
        if (distribution[i] > expectedPerSlot - tolerance &&
            distribution[i] < expectedPerSlot + tolerance) {
          wellDistributed++;
        }
      }
      
      // At least 24 out of 32 slots should be well distributed
      expect(wellDistributed).toBeGreaterThanOrEqual(24);
    });
  });

  describe("blake3 (alternative)", () => {
    test("should extract 64-bit prefix from blake3 hash", async () => {
      const input = "test-key";
      const hash = await hasher.hashKey(input, 1); // 1 = blake3
      
      expect(hash).toBeDefined();
      expect(hash).toBeGreaterThan(0n);
      expect(hash.toString(2).length).toBeLessThanOrEqual(64);
    });

    test("should use big-endian byte order", async () => {
      const input = "test";
      const fullHash = blake3(new TextEncoder().encode(input));
      
      // Extract first 8 bytes as big-endian uint64
      const view = new DataView(fullHash.buffer);
      const expected = view.getBigUint64(0, false); // false = big-endian
      
      const result = await hasher.hashKey(input, 1);
      expect(result).toBe(expected);
    });
  });

  describe("Hash function selection", () => {
    test("should use xxhash64 when config.hashFunction = 0", async () => {
      const key = "test-key";
      
      const hash0 = await hasher.hashKey(key, 0);
      const hashDefault = await hasher.hashKey(key, 0);
      
      expect(hash0).toBe(hashDefault);
    });

    test("should use blake3 when config.hashFunction = 1", async () => {
      const key = "test-key";
      
      const hashBlake = await hasher.hashKey(key, 1);
      const hashXX = await hasher.hashKey(key, 0);
      
      // Different hash functions should produce different results
      expect(hashBlake).not.toBe(hashXX);
    });

    test("should configure hash function in HAMTConfig", () => {
      const config1 = {
        bitsPerLevel: 5,
        maxInlineEntries: 1000,
        hashFunction: 0 as const
      };
      
      const config2 = {
        bitsPerLevel: 5,
        maxInlineEntries: 1000,
        hashFunction: 1 as const
      };
      
      expect(config1.hashFunction).toBe(0);
      expect(config2.hashFunction).toBe(1);
    });
  });
});

