import { describe, test, expect } from "vitest";
import { HAMTBitmapOps } from "../../../src/fs/hamt/utils.js";

describe("HAMT Bitmap Operations", () => {
  const ops = new HAMTBitmapOps(5); // 5 bits per level

  describe("Index calculation", () => {
    test("should extract correct 5-bit index at depth 0", () => {
      // Test various hash values
      const testCases = [
        { hash: 0n, depth: 0, expected: 0 },
        { hash: 1n, depth: 0, expected: 1 },
        { hash: 31n, depth: 0, expected: 31 },
        { hash: 32n, depth: 0, expected: 0 }, // wraps around
        { hash: 33n, depth: 0, expected: 1 },
      ];

      for (const tc of testCases) {
        const index = ops.getIndex(tc.hash, tc.depth);
        expect(index).toBe(tc.expected);
      }
    });

    test("should extract correct 5-bit index at various depths", () => {
      const hash = 0b11111_01010_10101_00000_11011n; // Binary representation
      
      expect(ops.getIndex(hash, 0)).toBe(0b11011); // bits 0-4
      expect(ops.getIndex(hash, 1)).toBe(0b00000); // bits 5-9
      expect(ops.getIndex(hash, 2)).toBe(0b10101); // bits 10-14
      expect(ops.getIndex(hash, 3)).toBe(0b01010); // bits 15-19
      expect(ops.getIndex(hash, 4)).toBe(0b11111); // bits 20-24
    });

    test("should handle all 32 possible positions (0-31)", () => {
      // Create hash that produces each index
      for (let i = 0; i < 32; i++) {
        const hash = BigInt(i);
        const index = ops.getIndex(hash, 0);
        expect(index).toBe(i);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(32);
      }
    });

    test("should mask correctly with 0x1F", () => {
      // Test that only 5 bits are extracted
      const hash = 0b111111111n; // 9 bits set
      const index = ops.getIndex(hash, 0);
      expect(index).toBe(0b11111); // Only lower 5 bits
      expect(index).toBe(31);
    });
  });

  describe("Bitmap manipulation", () => {
    test("should check bit presence with hasBit", () => {
      let bitmap = 0;
      
      // Initially no bits set
      for (let i = 0; i < 32; i++) {
        expect(ops.hasBit(bitmap, i)).toBe(false);
      }
      
      // Set some bits
      bitmap = 0b10101; // bits 0, 2, 4 set
      expect(ops.hasBit(bitmap, 0)).toBe(true);
      expect(ops.hasBit(bitmap, 1)).toBe(false);
      expect(ops.hasBit(bitmap, 2)).toBe(true);
      expect(ops.hasBit(bitmap, 3)).toBe(false);
      expect(ops.hasBit(bitmap, 4)).toBe(true);
    });

    test("should set bits correctly with setBit", () => {
      let bitmap = 0;
      
      // Set bit 0
      bitmap = ops.setBit(bitmap, 0);
      expect(bitmap).toBe(1);
      
      // Set bit 5
      bitmap = ops.setBit(bitmap, 5);
      expect(bitmap).toBe(0b100001);
      
      // Set bit 31
      bitmap = ops.setBit(bitmap, 31);
      // JavaScript uses signed 32-bit integers, so we need to compare the unsigned value
      expect(bitmap >>> 0).toBe(0x80000021);
      
      // Setting already set bit should not change
      bitmap = ops.setBit(bitmap, 0);
      expect(bitmap >>> 0).toBe(0x80000021);
    });

    test("should calculate popcount for child index", () => {
      const bitmap = 0b10110101; // bits 0,2,4,5,7 set
      
      expect(ops.popcount(bitmap, 0)).toBe(0);  // No bits before 0
      expect(ops.popcount(bitmap, 1)).toBe(1);  // bit 0 before 1
      expect(ops.popcount(bitmap, 2)).toBe(1);  // bit 0 before 2
      expect(ops.popcount(bitmap, 3)).toBe(2);  // bits 0,2 before 3
      expect(ops.popcount(bitmap, 4)).toBe(2);  // bits 0,2 before 4
      expect(ops.popcount(bitmap, 5)).toBe(3);  // bits 0,2,4 before 5
      expect(ops.popcount(bitmap, 6)).toBe(4);  // bits 0,2,4,5 before 6
      expect(ops.popcount(bitmap, 7)).toBe(4);  // bits 0,2,4,5 before 7
      expect(ops.popcount(bitmap, 8)).toBe(5);  // bits 0,2,4,5,7 before 8
    });

    test("should handle empty bitmap (0)", () => {
      const bitmap = 0;
      
      expect(ops.hasBit(bitmap, 0)).toBe(false);
      expect(ops.hasBit(bitmap, 31)).toBe(false);
      expect(ops.popcount(bitmap, 15)).toBe(0);
      expect(ops.countBits(bitmap)).toBe(0);
    });

    test("should handle full bitmap (0xFFFFFFFF)", () => {
      const bitmap = 0xFFFFFFFF;
      
      expect(ops.hasBit(bitmap, 0)).toBe(true);
      expect(ops.hasBit(bitmap, 31)).toBe(true);
      expect(ops.popcount(bitmap, 0)).toBe(0);
      expect(ops.popcount(bitmap, 16)).toBe(16);
      expect(ops.popcount(bitmap, 31)).toBe(31);
      expect(ops.countBits(bitmap)).toBe(32);
    });
  });

  describe("Child index calculation", () => {
    test("should return 0 for first set bit", () => {
      const bitmap = 0b1; // Only bit 0 set
      expect(ops.getChildIndex(bitmap, 0)).toBe(0);
    });

    test("should count preceding bits correctly", () => {
      const bitmap = 0b10101; // bits 0,2,4 set
      
      expect(ops.getChildIndex(bitmap, 0)).toBe(0);  // First child
      expect(ops.getChildIndex(bitmap, 2)).toBe(1);  // Second child
      expect(ops.getChildIndex(bitmap, 4)).toBe(2);  // Third child
    });

    test("should handle sparse bitmaps", () => {
      const bitmap = 0x80000001; // bits 0 and 31 set
      
      expect(ops.getChildIndex(bitmap, 0)).toBe(0);
      expect(ops.getChildIndex(bitmap, 31)).toBe(1);
      
      // Test middle positions that aren't set
      expect(ops.hasBit(bitmap, 15)).toBe(false);
    });
  });
});

