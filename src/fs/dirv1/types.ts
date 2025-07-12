// DirV1 type definitions matching Rust S5 implementation

export interface FileRef {
  hash: Uint8Array; // 32 bytes
  size: number | bigint;
  media_type?: string;
  timestamp?: number;
}

export interface DirLink {
  type: 'fixed_hash_blake3' | 'resolver_registry';
  hash: Uint8Array; // 32 bytes
}

export interface DirRef {
  link: DirLink;
  ts_seconds?: number;
  ts_nanos?: number;
}

export interface DirV1 {
  magic: string; // "S5.pro"
  header: Record<string, any>;
  dirs: Map<string, DirRef>;
  files: Map<string, FileRef>;
}

// CBOR integer keys for FileRef
export const FILE_REF_KEYS = {
  HASH: 3,
  SIZE: 4,
  MEDIA_TYPE: 6,
  TIMESTAMP: 7
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
  | { type: 'identity'; hash: Uint8Array }
  | { type: 'http'; url: string }
  | { type: 'sha1'; hash: Uint8Array }
  | { type: 'sha256'; hash: Uint8Array }
  | { type: 'blake3'; hash: Uint8Array }
  | { type: 'md5'; hash: Uint8Array };

// BlobLocation CBOR tags
export const BLOB_LOCATION_TAGS = {
  IDENTITY: 0,
  HTTP: 1,
  SHA1: 0x11,
  SHA256: 0x12,
  BLAKE3: 0x1e,
  MD5: 0xd5
} as const;