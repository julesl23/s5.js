export interface DirV1 {
  magic: string;
  header: DirHeader;
  dirs: Map<string, DirRef>;
  files: Map<string, FileRef>;
}

export interface DirHeader {
  // Empty for now, matching Rust
}

export interface DirRef {
  link: DirLink;
  ts_seconds?: number;
  ts_nanos?: number;
  extra?: any;
}

export interface FileRef {
  hash: Uint8Array;
  size: number;
  media_type?: string;
  timestamp?: number;
  timestamp_subsec_nanos?: number;
  locations?: BlobLocation[];
  hash_type?: number;
  extra?: Map<string, any>;
  prev?: FileRef;
}

export type DirLink =
  | { type: "fixed_hash_blake3"; hash: Uint8Array }
  | { type: "mutable_registry_ed25519"; publicKey: Uint8Array };

export type BlobLocation =
  | { type: "identity"; data: Uint8Array }
  | { type: "http"; url: string };
