import { FileRef, DirRef } from "../dirv1/types.js";

/**
 * HAMT node structure for efficient directory storage
 */
export interface HAMTNode {
  /** 32-bit bitmap indicating which children are present */
  bitmap: number;
  /** Sparse array of children (only populated positions) */
  children: Array<HAMTChild>;
  /** Total number of entries under this node */
  count: number;
  /** Depth in the tree (0 = root) */
  depth: number;
}

/**
 * HAMT child can be either a node reference or a leaf with entries
 */
export type HAMTChild =
  | { type: "node"; cid: Uint8Array }                              // Reference to child node
  | { type: "leaf"; entries: Array<[string, FileRef | DirRef]> };  // Inline entries

/**
 * Configuration for HAMT behavior
 */
export interface HAMTConfig {
  /** Number of bits used per level (default: 5 = 32-way branching) */
  bitsPerLevel: number;
  /** Maximum entries in a leaf before splitting (default: 8 for Week 1) */
  maxInlineEntries: number;
  /** Hash function to use: 0 = xxhash64, 1 = blake3 */
  hashFunction: 0 | 1;
}