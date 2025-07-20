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
      maxInlineEntries: 1000, // Default value from design
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
      // Create root with a single leaf containing all entries initially
      const leaf: HAMTChild = {
        type: "leaf",
        entries: [[key, value]]
      };
      
      this.rootNode = {
        bitmap: 1, // Single leaf at index 0
        children: [leaf],
        count: 1,
        depth: 0
      };
    } else {
      await this._insertAtNode(this.rootNode, hash, 0, key, value);
    }
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
  ): Promise<boolean> {
    // Special case: if we have a single leaf at index 0, handle it specially
    if (node.children.length === 1 && 
        node.children[0].type === "leaf" && 
        node.bitmap === 1) {
      const leaf = node.children[0];
      
      // Check if key already exists
      const existingIndex = leaf.entries.findIndex(([k, _]) => k === key);
      if (existingIndex >= 0) {
        leaf.entries[existingIndex] = [key, value];
        return false;
      } else {
        // Add entry
        leaf.entries.push([key, value]);
        node.count++;
        
        // Check if we need to split
        if (leaf.entries.length > this.config.maxInlineEntries) {
          await this._splitLeaf(node, 0, depth);
        }
        
        return true;
      }
    }

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
      return true;
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
          return false; // No new entry added
        } else {
          // Add new entry
          child.entries.push([key, value]);
          node.count++;
          
          // Check if we need to split this leaf
          if (child.entries.length > this.config.maxInlineEntries) {
            await this._splitLeaf(node, childIndex, depth);
          }
          return true;
        }
      } else {
        // Navigate to child node
        const childNode = await this._loadNode(child.cid);
        const added = await this._insertAtNode(childNode, hash, depth + 1, key, value);
        if (added) {
          node.count++;
          // Update the stored node
          await this._storeNode(childNode, child.cid);
        }
        return added;
      }
    }
  }

  /**
   * Split a leaf node when it exceeds maxInlineEntries
   */
  private async _splitLeaf(
    parentNode: HAMTNode,
    leafIndex: number,
    depth: number
  ): Promise<void> {
    const leaf = parentNode.children[leafIndex];
    if (leaf.type !== "leaf") {
      throw new Error("Cannot split non-leaf node");
    }

    // Special case: if this is the initial single leaf at root
    if (parentNode.bitmap === 1 && parentNode.children.length === 1 && depth === 0) {
      // Clear the parent and redistribute all entries
      parentNode.bitmap = 0;
      parentNode.children = [];
      parentNode.count = 0;

      // Re-insert all entries at the current depth
      for (const [entryKey, entryValue] of leaf.entries) {
        const entryHash = await this.hasher.hashKey(entryKey, this.config.hashFunction);
        const entryIndex = this.bitmapOps.getIndex(entryHash, depth);
        
        if (!this.bitmapOps.hasBit(parentNode.bitmap, entryIndex)) {
          // Create new leaf for this index
          const childIndex = this.bitmapOps.getChildIndex(parentNode.bitmap, entryIndex);
          const newLeaf: HAMTChild = {
            type: "leaf",
            entries: [[entryKey, entryValue]]
          };
          parentNode.children.splice(childIndex, 0, newLeaf);
          parentNode.bitmap = this.bitmapOps.setBit(parentNode.bitmap, entryIndex);
          parentNode.count++;
        } else {
          // Add to existing leaf at this index
          const childIndex = this.bitmapOps.getChildIndex(parentNode.bitmap, entryIndex);
          const existingChild = parentNode.children[childIndex];
          if (existingChild.type === "leaf") {
            existingChild.entries.push([entryKey, entryValue]);
            parentNode.count++;
          }
        }
      }
    } else {
      // Normal case: create a new internal node to replace the leaf
      const newNode: HAMTNode = {
        bitmap: 0,
        children: [],
        count: leaf.entries.length,
        depth: depth + 1
      };

      // Re-insert all entries into the new node
      for (const [key, value] of leaf.entries) {
        const hash = await this.hasher.hashKey(key, this.config.hashFunction);
        await this._insertAtNode(newNode, hash, depth + 1, key, value);
      }

      // Store the new node and get its CID
      const cid = await this._storeNode(newNode);

      // Replace the leaf with a node reference
      parentNode.children[leafIndex] = {
        type: "node",
        cid: cid
      };
    }
  }

  /**
   * Store a node and return its CID
   */
  private async _storeNode(node: HAMTNode, existingCid?: Uint8Array): Promise<Uint8Array> {
    const serialized = this._serializeNode(node);
    const blob = new Blob([serialized]);
    const { hash } = await this.api.uploadBlob(blob);
    
    // Update cache
    const cacheKey = base64UrlNoPaddingEncode(hash);
    this.nodeCache.set(cacheKey, node);
    
    return hash;
  }

  /**
   * Load a node from its CID
   */
  private async _loadNode(cid: Uint8Array): Promise<HAMTNode> {
    const cacheKey = base64UrlNoPaddingEncode(cid);
    
    // Check cache first
    const cached = this.nodeCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Load from storage
    const data = await this.api.downloadBlobAsBytes(cid);
    const node = this._deserializeNode(data);
    
    // Add to cache
    this.nodeCache.set(cacheKey, node);
    
    return node;
  }

  /**
   * Serialize a single node
   */
  private _serializeNode(node: HAMTNode): Uint8Array {
    return encodeS5(this._prepareNodeForSerialization(node));
  }

  /**
   * Deserialize a single node
   */
  private _deserializeNode(data: Uint8Array): HAMTNode {
    const decoded = decodeS5(data);
    return this._reconstructNode(decoded);
  }

  /**
   * Reconstruct a HAMTNode from decoded data
   */
  private _reconstructNode(data: any): HAMTNode {
    const children: HAMTChild[] = data.children.map((child: any) => {
      if (child.type === "node") {
        return {
          type: "node",
          cid: child.cid
        };
      } else {
        // Reconstruct leaf entries
        const entries = child.entries.map(([k, v]: [string, any]) => {
          if (k.startsWith("f:")) {
            // FileRef
            return [k, { hash: v.hash, size: v.size, media_type: v.media_type }];
          } else {
            // DirRef
            return [k, { link: v.link }];
          }
        });
        
        return {
          type: "leaf",
          entries
        };
      }
    });
    
    return {
      bitmap: data.bitmap,
      children,
      count: data.count,
      depth: data.depth
    };
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
    // Special case: if we have a single leaf at index 0, search in it
    if (node.children.length === 1 && 
        node.children[0].type === "leaf" && 
        node.bitmap === 1) {
      const leaf = node.children[0];
      const entry = leaf.entries.find(([k, _]) => k === key);
      return entry ? entry[1] : undefined;
    }

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
      // Navigate to child node
      const childNode = await this._loadNode(child.cid);
      return this._getFromNode(childNode, hash, depth + 1, key);
    }
  }

  /**
   * Serialize the HAMT for storage
   */
  serialise(): Uint8Array {
    if (!this.rootNode) {
      // Return empty HAMT structure
      const emptyRoot = new Map<string, any>([
        ["bitmap", 0],
        ["children", []],
        ["count", 0],
        ["depth", 0]
      ]);
      
      const structure = new Map<string, any>([
        ["version", 1],
        ["config", new Map<string, any>([
          ["bitsPerLevel", this.config.bitsPerLevel],
          ["hashFunction", this.config.hashFunction],
          ["maxInlineEntries", this.config.maxInlineEntries]
        ])],
        ["root", emptyRoot]
      ]);
      
      return encodeS5(structure);
    }

    // Serialize root node with potential child references
    const structure = new Map<string, any>([
      ["version", 1],
      ["config", new Map<string, any>([
        ["bitsPerLevel", this.config.bitsPerLevel],
        ["hashFunction", this.config.hashFunction],
        ["maxInlineEntries", this.config.maxInlineEntries]
      ])],
      ["root", this._prepareNodeForSerialization(this.rootNode)]
    ]);
    
    return encodeS5(structure);
  }

  /**
   * Prepare a node for serialization (convert child nodes to CID references)
   */
  private _prepareNodeForSerialization(node: HAMTNode): Map<string, any> {
    const children = node.children.map(child => {
      if (child.type === "node") {
        return new Map<string, any>([
          ["type", "node"],
          ["cid", child.cid]
        ]);
      } else {
        // Leaf node
        const leafEntries = child.entries.map(([k, v]) => {
          if (k.startsWith("f:")) {
            // FileRef
            return [k, new Map<string, any>([
              ["hash", (v as any).hash],
              ["size", (v as any).size]
            ])];
          } else {
            // DirRef
            return [k, new Map<string, any>([
              ["link", new Map<string, any>([
                ["type", (v as any).link.type],
                ["hash", (v as any).link.hash]
              ])]
            ])];
          }
        });
        
        return new Map<string, any>([
          ["type", "leaf"],
          ["entries", leafEntries]
        ]);
      }
    });
    
    return new Map<string, any>([
      ["bitmap", node.bitmap],
      ["children", children],
      ["count", node.count],
      ["depth", node.depth]
    ]);
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
    await hamt.ensureInitialized();
    
    // Reconstruct the root node if it exists
    if (decoded.root && decoded.root.children) {
      hamt.rootNode = hamt._reconstructNode(decoded.root);
    }
    
    return hamt;
  }

  /**
   * Get async iterator for entries
   */
  async *entries(): AsyncIterableIterator<[string, FileRef | DirRef]> {
    if (!this.rootNode) {
      return;
    }

    yield* this._iterateNode(this.rootNode);
  }

  /**
   * Iterate entries from a specific cursor position
   */
  async *entriesFrom(cursor: number[]): AsyncIterableIterator<[string, FileRef | DirRef]> {
    if (!this.rootNode) {
      return;
    }

    yield* this._iterateNodeFrom(this.rootNode, cursor, 0);
  }

  /**
   * Recursively iterate through a node
   */
  private async *_iterateNode(node: HAMTNode): AsyncIterableIterator<[string, FileRef | DirRef]> {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      
      if (child.type === "leaf") {
        for (const entry of child.entries) {
          yield entry;
        }
      } else {
        // Load and iterate child node
        const childNode = await this._loadNode(child.cid);
        yield* this._iterateNode(childNode);
      }
    }
  }

  /**
   * Iterate from a specific cursor position
   */
  private async *_iterateNodeFrom(
    node: HAMTNode,
    cursor: number[],
    depth: number
  ): AsyncIterableIterator<[string, FileRef | DirRef]> {
    const startIndex = depth < cursor.length ? cursor[depth] : 0;

    for (let i = startIndex; i < node.children.length; i++) {
      const child = node.children[i];
      
      if (child.type === "leaf") {
        // For leaf nodes, skip entries if we're at the cursor depth
        const skipEntries = depth === cursor.length - 2 && i === startIndex;
        let startEntry = 0;
        
        if (skipEntries && cursor.length > depth + 1) {
          // Skip to the entry after the cursor position
          startEntry = cursor[depth + 1] + 1;
        } else if (i === startIndex && depth === cursor.length - 1) {
          // Skip entire leaf if it's the cursor leaf
          continue;
        }
        
        for (let j = startEntry; j < child.entries.length; j++) {
          yield child.entries[j];
        }
      } else {
        // Load and iterate child node
        const childNode = await this._loadNode(child.cid);
        
        if (i === startIndex && depth + 1 < cursor.length) {
          // Continue from cursor position
          yield* this._iterateNodeFrom(childNode, cursor, depth + 1);
        } else {
          // Iterate entire subtree
          yield* this._iterateNode(childNode);
        }
      }
    }
  }

  /**
   * Get the path to a specific key (for cursor support)
   */
  async getPathForKey(key: string): Promise<number[]> {
    if (!this.rootNode) {
      return [];
    }

    await this.ensureInitialized();
    const hash = await this.hasher.hashKey(key, this.config.hashFunction);
    const path: number[] = [];
    
    const found = await this._findPath(this.rootNode, hash, 0, key, path);
    return found ? path : [];
  }

  /**
   * Find the path to a key
   */
  private async _findPath(
    node: HAMTNode,
    hash: bigint,
    depth: number,
    key: string,
    path: number[]
  ): Promise<boolean> {
    const index = this.bitmapOps.getIndex(hash, depth);

    if (!this.bitmapOps.hasBit(node.bitmap, index)) {
      return false;
    }

    const childIndex = this.bitmapOps.getChildIndex(node.bitmap, index);
    path.push(childIndex);

    const child = node.children[childIndex];

    if (child.type === "leaf") {
      // Find entry index
      const entryIndex = child.entries.findIndex(([k, _]) => k === key);
      if (entryIndex >= 0) {
        path.push(entryIndex);
        return true;
      }
      return false;
    } else {
      // Navigate to child node
      const childNode = await this._loadNode(child.cid);
      return this._findPath(childNode, hash, depth + 1, key, path);
    }
  }

  /**
   * Get the maximum depth of the tree
   */
  async getDepth(): Promise<number> {
    if (!this.rootNode) {
      return 0;
    }

    return this._getMaxDepth(this.rootNode);
  }

  /**
   * Recursively find maximum depth
   */
  private async _getMaxDepth(node: HAMTNode): Promise<number> {
    let maxChildDepth = node.depth;

    for (const child of node.children) {
      if (child.type === "node") {
        const childNode = await this._loadNode(child.cid);
        const childDepth = await this._getMaxDepth(childNode);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      }
    }

    return maxChildDepth;
  }

  /**
   * Get the root node (for testing)
   */
  getRootNode(): HAMTNode | null {
    return this.rootNode;
  }
}