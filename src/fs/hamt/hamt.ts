import { FileRef, DirRef } from "../dirv1/types.js";
import { HAMTNode, HAMTChild, HAMTConfig } from "./types.js";
import { HAMTBitmapOps, HAMTHasher } from "./utils.js";
import { S5APIInterface } from "../../api/s5.js";
import { encodeS5, decodeS5 } from "../dirv1/cbor-config.js";
import { base64UrlNoPaddingEncode } from "../../util/base64.js";

/**
 * Hash Array Mapped Trie implementation for efficient large directory storage
 */
export class HAMT {
  private rootNode: HAMTNode | null = null;
  private config: HAMTConfig;
  private nodeCache: Map<string, HAMTNode> = new Map();
  private bitmapOps: HAMTBitmapOps;
  private hasher: HAMTHasher;
  private initialized = false;

  constructor(
    private api: S5APIInterface,
    config?: Partial<HAMTConfig>
  ) {
    // Default configuration
    this.config = {
      bitsPerLevel: 5,
      maxInlineEntries: 8, // Small for Week 1 testing
      hashFunction: 0,
      ...config
    };

    this.bitmapOps = new HAMTBitmapOps(this.config.bitsPerLevel);
    this.hasher = new HAMTHasher();
  }

  /**
   * Initialize the HAMT (ensure hasher is ready)
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.hasher.initialize();
      this.initialized = true;
    }
  }

  /**
   * Insert a key-value pair into the HAMT
   */
  async insert(key: string, value: FileRef | DirRef): Promise<void> {
    await this.ensureInitialized();
    
    const hash = await this.hasher.hashKey(key, this.config.hashFunction);

    if (!this.rootNode) {
      // Create root as leaf node
      this.rootNode = {
        bitmap: 0,
        children: [],
        count: 0,
        depth: 0
      };
    }

    await this._insertAtNode(this.rootNode, hash, 0, key, value);
  }

  /**
   * Retrieve a value by key
   */
  async get(key: string): Promise<FileRef | DirRef | undefined> {
    await this.ensureInitialized();
    
    if (!this.rootNode) {
      return undefined;
    }

    const hash = await this.hasher.hashKey(key, this.config.hashFunction);
    return this._getFromNode(this.rootNode, hash, 0, key);
  }

  /**
   * Insert at a specific node
   */
  private async _insertAtNode(
    node: HAMTNode,
    hash: bigint,
    depth: number,
    key: string,
    value: FileRef | DirRef
  ): Promise<void> {
    const index = this.bitmapOps.getIndex(hash, depth);

    if (!this.bitmapOps.hasBit(node.bitmap, index)) {
      // No child at this position - create new leaf
      const childIndex = this.bitmapOps.getChildIndex(node.bitmap, index);
      const leaf: HAMTChild = {
        type: "leaf",
        entries: [[key, value]]
      };

      // Insert into sparse array
      node.children.splice(childIndex, 0, leaf);
      node.bitmap = this.bitmapOps.setBit(node.bitmap, index);
      node.count++;
    } else {
      // Child exists at this position
      const childIndex = this.bitmapOps.getChildIndex(node.bitmap, index);
      const child = node.children[childIndex];

      if (child.type === "leaf") {
        // Check if key already exists
        const existingIndex = child.entries.findIndex(([k, _]) => k === key);
        
        if (existingIndex >= 0) {
          // Update existing entry
          child.entries[existingIndex] = [key, value];
        } else {
          // Add new entry
          child.entries.push([key, value]);
          node.count++;
          
          // Note: Node splitting will be implemented in Week 2
          // For now, we allow leaves to grow beyond maxInlineEntries
        }
      } else {
        // Navigate to child node (Week 2 feature)
        // For Week 1, this shouldn't happen as we don't split nodes yet
        throw new Error("Node navigation not implemented in Week 1");
      }
    }
  }

  /**
   * Get from a specific node
   */
  private async _getFromNode(
    node: HAMTNode,
    hash: bigint,
    depth: number,
    key: string
  ): Promise<FileRef | DirRef | undefined> {
    const index = this.bitmapOps.getIndex(hash, depth);

    if (!this.bitmapOps.hasBit(node.bitmap, index)) {
      // No child at this position
      return undefined;
    }

    const childIndex = this.bitmapOps.getChildIndex(node.bitmap, index);
    const child = node.children[childIndex];

    if (child.type === "leaf") {
      // Search for key in entries
      const entry = child.entries.find(([k, _]) => k === key);
      return entry ? entry[1] : undefined;
    } else {
      // Navigate to child node (Week 2 feature)
      throw new Error("Node navigation not implemented in Week 1");
    }
  }

  /**
   * Serialize the HAMT for storage
   */
  serialise(): Uint8Array {
    if (!this.rootNode) {
      throw new Error("Cannot serialize empty HAMT");
    }

    // Use deterministic encoding for HAMT nodes
    return encodeS5({
      version: 1,
      config: this.config,
      root: this.rootNode
    });
  }

  /**
   * Deserialize a HAMT from storage
   */
  static async deserialise(
    data: Uint8Array,
    api: S5APIInterface
  ): Promise<HAMT> {
    const decoded = decodeS5(data);
    const hamt = new HAMT(api, decoded.config);
    hamt.rootNode = decoded.root;
    return hamt;
  }

  /**
   * Get async iterator for entries (Week 2 feature)
   */
  async *entries(): AsyncIterableIterator<[string, FileRef | DirRef]> {
    if (!this.rootNode) {
      return;
    }

    // Simple implementation for Week 1 - just iterate all leaves
    for (const child of this.rootNode.children) {
      if (child.type === "leaf") {
        for (const entry of child.entries) {
          yield entry;
        }
      }
    }
  }

  /**
   * Get the root node (for testing)
   */
  getRootNode(): HAMTNode | null {
    return this.rootNode;
  }
}