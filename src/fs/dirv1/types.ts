// DirV1 type definitions matching Rust S5 implementation

export interface FileRef {
  hash: Uint8Array; // 32 bytes
  size: number | bigint;
  media_type?: string;
  timestamp?: number;
  timestamp_subsec_nanos?: number;
  locations?: BlobLocation[];
  hash_type?: number;
  extra?: Map<string, any>;
  prev?: FileRef;
}

export interface DirLink {
  type: 'fixed_hash_blake3' | 'resolver_registry' | 'mutable_registry_ed25519';
  hash?: Uint8Array; // 32 bytes - for fixed_hash_blake3 and resolver_registry
  publicKey?: Uint8Array; // 32 bytes - for mutable_registry_ed25519
}

export interface DirRef {
  link: DirLink;
  ts_seconds?: number;
  ts_nanos?: number;
  extra?: Map<string, any>;
}

/**
 * HAMT sharding configuration for large directories
 */
export interface HAMTShardingConfig {
  type: "hamt";
  config: {
    bitsPerLevel: number;      // Default: 5 (32-way branching)
    maxInlineEntries: number;  // Default: 1000 (trigger point)
    hashFunction: 0 | 1;       // 0=xxhash64, 1=blake3
  };
  root?: {
    cid: Uint8Array;          // Root HAMT node CID
    totalEntries: number;      // Total entries in HAMT
    depth: number;            // Maximum depth of tree
  };
}

/**
 * Directory header with optional extensions
 */
export interface DirHeader {
  sharding?: HAMTShardingConfig;
  [key: string]: any;  // Allow other extensions
}

export interface DirV1 {
  magic: string; // "S5.pro"
  header: DirHeader;
  dirs: Map<string, DirRef>;
  files: Map<string, FileRef>;
}

// CBOR integer keys for FileRef
export const FILE_REF_KEYS = {
  HASH: 3,
  SIZE: 4,
  MEDIA_TYPE: 6,
  TIMESTAMP: 7,
  TIMESTAMP_SUBSEC_NANOS: 8,
  LOCATIONS: 9,
  HASH_TYPE: 22,
  PREV: 23
} as const;

// CBOR integer keys for DirRef
export const DIR_REF_KEYS = {
  LINK: 2,
  TS_SECONDS: 7,
  TS_NANOS: 8
} as const;

// DirLink type bytes
export const DIR_LINK_TYPES = {
  FIXED_HASH_BLAKE3: 0x1e,
  RESOLVER_REGISTRY: 0xed
} as const;

// BlobLocation types
export type BlobLocation = 
  | { type: 'identity'; data: Uint8Array }
  | { type: 'http'; url: string }
  | { type: 'multihash_sha1'; hash: Uint8Array }
  | { type: 'multihash_sha2_256'; hash: Uint8Array }
  | { type: 'multihash_blake3'; hash: Uint8Array }
  | { type: 'multihash_md5'; hash: Uint8Array };

// BlobLocation CBOR tags
export const BLOB_LOCATION_TAGS = {
  IDENTITY: 0,
  HTTP: 1,
  SHA1: 0x11,
  SHA256: 0x12,
  BLAKE3: 0x1e,
  MD5: 0xd5
} as const;

// Phase 2 types
export interface PutOptions {
  mediaType?: string;
  timestamp?: number;
}

export interface ListResult {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  mediaType?: string;
  timestamp?: number;
  cursor?: string;
}

export interface GetOptions {
  defaultMediaType?: string;
}

export interface ListOptions {
  limit?: number;
  cursor?: string;
  // filter?: (item: ListResult) => boolean; // Reserved for future
}

// Internal cursor data structure
export interface CursorData {
  position: string; // Current position (name of last item)
  type: 'file' | 'directory'; // Type of last item
  timestamp?: number; // For stability checks
  path?: number[]; // HAMT path for cursor positioning
}