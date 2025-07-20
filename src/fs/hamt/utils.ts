import { blake3 } from "@noble/hashes/blake3";
import xxhashInit from "xxhash-wasm";

/**
 * Bitmap operations for HAMT nodes
 */
export class HAMTBitmapOps {
  constructor(private bitsPerLevel: number) {}

  /**
   * Extract index at given depth from hash
   * @param hash 64-bit hash value
   * @param depth Current depth in tree
   * @returns Index (0-31 for 5 bits per level)
   */
  getIndex(hash: bigint, depth: number): number {
    const shift = BigInt(depth * this.bitsPerLevel);
    const mask = BigInt((1 << this.bitsPerLevel) - 1);
    return Number((hash >> shift) & mask);
  }

  /**
   * Check if bit is set at index
   */
  hasBit(bitmap: number, index: number): boolean {
    return (bitmap & (1 << index)) !== 0;
  }

  /**
   * Set bit at index
   */
  setBit(bitmap: number, index: number): number {
    return bitmap | (1 << index);
  }

  /**
   * Count bits set before index (popcount)
   * Used to find child position in sparse array
   */
  popcount(bitmap: number, index: number): number {
    const mask = (1 << index) - 1;
    return this.countBits(bitmap & mask);
  }

  /**
   * Count total bits set in number
   * Efficient bit counting using parallel bit manipulation
   */
  countBits(n: number): number {
    // Fix for JavaScript's signed 32-bit integers
    n = n >>> 0; // Convert to unsigned 32-bit
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return (((n + (n >>> 4)) & 0xf0f0f0f) * 0x1010101) >>> 24;
  }

  /**
   * Get child index in sparse array for given bitmap position
   */
  getChildIndex(bitmap: number, index: number): number {
    return this.popcount(bitmap, index);
  }
}

/**
 * Hash functions for HAMT
 */
export class HAMTHasher {
  private xxhash: any = null;
  private initialized = false;

  /**
   * Initialize the hasher (load xxhash WASM)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const xxhash = await xxhashInit();
      this.xxhash = xxhash;
      this.initialized = true;
    } catch (error) {
      console.warn("Failed to load xxhash-wasm, using fallback hash", error);
      // Use fallback implementation
      this.xxhash = {
        h64: (input: string) => {
          // Simple hash for fallback/testing
          let hash = 0n;
          const bytes = new TextEncoder().encode(input);
          for (let i = 0; i < bytes.length; i++) {
            hash = (hash << 5n) - hash + BigInt(bytes[i]);
            hash = hash & 0xFFFFFFFFFFFFFFFFn;
          }
          // Ensure non-zero hash
          return hash || 1n;
        }
      };
      this.initialized = true;
    }
  }

  /**
   * Hash a key using the specified hash function
   * @param key Key to hash
   * @param hashFunction 0 = xxhash64, 1 = blake3
   * @returns 64-bit hash as bigint
   */
  async hashKey(key: string, hashFunction: number): Promise<bigint> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (hashFunction === 0) {
      // xxhash64
      const hash = this.xxhash.h64(key);
      // Ensure we return a bigint
      return typeof hash === 'bigint' ? hash : BigInt(hash);
    } else {
      // blake3 - extract first 64 bits
      const hash = blake3(new TextEncoder().encode(key));
      const view = new DataView(hash.buffer, hash.byteOffset, hash.byteLength);
      return view.getBigUint64(0, false); // big-endian
    }
  }
}