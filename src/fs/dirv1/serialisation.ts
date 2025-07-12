import { encodeS5, decodeS5 } from './cbor-config';
import type { DirV1, FileRef, DirRef, DirLink, BlobLocation } from './types';
import { FILE_REF_KEYS, DIR_REF_KEYS, DIR_LINK_TYPES, BLOB_LOCATION_TAGS } from './types';

export class DirV1Serialiser {
  // Serialise DirV1 to CBOR bytes with magic prefix
  static serialise(dir: DirV1): Uint8Array {
    // Convert to CBOR structure
    const cborStructure = this.toCborStructure(dir);
    
    // Encode to CBOR
    const cborBytes = encodeS5(cborStructure);
    
    // Add magic bytes prefix (0x5f 0x5d)
    const result = new Uint8Array(2 + cborBytes.length);
    result[0] = 0x5f;
    result[1] = 0x5d;
    result.set(cborBytes, 2);
    
    return result;
  }
  
  // Convert DirV1 to CBOR-ready structure
  private static toCborStructure(dir: DirV1): any[] {
    // Ensure header is a Map for proper encoding
    const headerMap = dir.header instanceof Map ? dir.header : 
      new Map(Object.entries(dir.header || {}));
    
    // DirV1 is encoded as a CBOR array with 4 elements
    return [
      dir.magic,                             // String "S5.pro"
      headerMap,                             // Header map (empty for now)
      this.serialiseDirs(dir.dirs),         // Dirs map
      this.serialiseFiles(dir.files),       // Files map
    ];
  }
  
  // Serialise directory map
  private static serialiseDirs(dirs: Map<string, DirRef>): Map<string, any> {
    const result = new Map<string, any>();
    
    // Sort entries by key for determinism
    const sortedEntries = Array.from(dirs.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    
    for (const [name, dirRef] of sortedEntries) {
      result.set(name, this.serialiseDirRef(dirRef));
    }
    
    return result;
  }
  
  // Serialise a single DirRef
  private static serialiseDirRef(dirRef: DirRef): Map<number, any> {
    const result = new Map<number, any>();
    
    // Key 2: link (33 bytes)
    result.set(DIR_REF_KEYS.LINK, this.serialiseDirLink(dirRef.link));
    
    // Key 7: ts_seconds (optional)
    if (dirRef.ts_seconds !== undefined) {
      result.set(DIR_REF_KEYS.TS_SECONDS, dirRef.ts_seconds);
    }
    
    // Key 8: ts_nanos (optional)
    if (dirRef.ts_nanos !== undefined) {
      result.set(DIR_REF_KEYS.TS_NANOS, dirRef.ts_nanos);
    }
    
    return result;
  }
  
  // Serialise DirLink as 33-byte array
  static serialiseDirLink(link: DirLink): Uint8Array {
    const result = new Uint8Array(33);
    
    // First byte is the type
    if (link.type === 'fixed_hash_blake3') {
      result[0] = DIR_LINK_TYPES.FIXED_HASH_BLAKE3;
    } else if (link.type === 'resolver_registry') {
      result[0] = DIR_LINK_TYPES.RESOLVER_REGISTRY;
    }
    
    // Copy the 32-byte hash
    result.set(link.hash, 1);
    
    return result;
  }
  
  // Serialise files map
  private static serialiseFiles(files: Map<string, FileRef>): Map<string, any> {
    const result = new Map<string, any>();
    
    // Sort entries by key for determinism
    const sortedEntries = Array.from(files.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    
    for (const [name, fileRef] of sortedEntries) {
      result.set(name, this.serialiseFileRef(fileRef));
    }
    
    return result;
  }
  
  // Serialise a single FileRef using integer keys
  private static serialiseFileRef(fileRef: FileRef): Map<number, any> {
    const result = new Map<number, any>();
    
    // Key 3: hash (required)
    result.set(FILE_REF_KEYS.HASH, fileRef.hash);
    
    // Key 4: size (required)
    result.set(FILE_REF_KEYS.SIZE, fileRef.size);
    
    // Key 6: media_type (optional)
    if (fileRef.media_type !== undefined) {
      result.set(FILE_REF_KEYS.MEDIA_TYPE, fileRef.media_type);
    }
    
    // Key 7: timestamp (optional)
    if (fileRef.timestamp !== undefined) {
      result.set(FILE_REF_KEYS.TIMESTAMP, fileRef.timestamp);
    }
    
    return result;
  }
  
  // Deserialise CBOR bytes to DirV1
  static deserialise(data: Uint8Array): DirV1 {
    let cborData = data;
    
    // Remove magic bytes if present
    if (data.length >= 2 && data[0] === 0x5f && data[1] === 0x5d) {
      cborData = data.slice(2);
    }
    
    // Decode CBOR
    const decoded = decodeS5(cborData);
    
    if (!Array.isArray(decoded) || decoded.length !== 4) {
      throw new Error('Invalid DirV1 CBOR structure');
    }
    
    const [magic, header, dirsMap, filesMap] = decoded;
    
    if (magic !== 'S5.pro') {
      throw new Error('Invalid DirV1 magic string');
    }
    
    // Convert header Map to object if needed
    const headerObj = header instanceof Map ? Object.fromEntries(header) : header;
    
    // Deserialise directories
    const dirs = this.deserialiseDirs(dirsMap);
    
    // Deserialise files
    const files = this.deserialiseFiles(filesMap);
    
    return {
      magic,
      header: headerObj,
      dirs,
      files
    };
  }
  
  // Deserialise directories map
  private static deserialiseDirs(dirsMap: Map<string, any>): Map<string, DirRef> {
    const result = new Map<string, DirRef>();
    
    if (!(dirsMap instanceof Map)) {
      return result;
    }
    
    for (const [name, dirRefMap] of dirsMap) {
      if (dirRefMap instanceof Map) {
        const dirRef = this.deserialiseDirRef(dirRefMap);
        result.set(name, dirRef);
      }
    }
    
    return result;
  }
  
  // Deserialise a single DirRef
  private static deserialiseDirRef(dirRefMap: Map<number, any>): DirRef {
    const linkBytes = dirRefMap.get(DIR_REF_KEYS.LINK);
    if (!linkBytes || !(linkBytes instanceof Uint8Array) || linkBytes.length !== 33) {
      throw new Error('Invalid DirRef link');
    }
    
    const link = this.deserialiseDirLink(linkBytes);
    
    const dirRef: DirRef = { link };
    
    // Optional fields
    const tsSeconds = dirRefMap.get(DIR_REF_KEYS.TS_SECONDS);
    if (tsSeconds !== undefined) {
      dirRef.ts_seconds = tsSeconds;
    }
    
    const tsNanos = dirRefMap.get(DIR_REF_KEYS.TS_NANOS);
    if (tsNanos !== undefined) {
      dirRef.ts_nanos = tsNanos;
    }
    
    return dirRef;
  }
  
  // Deserialise DirLink from 33-byte array
  static deserialiseDirLink(bytes: Uint8Array): DirLink {
    if (bytes.length !== 33) {
      throw new Error('DirLink must be exactly 33 bytes');
    }
    
    const typeBytes = bytes[0];
    const hash = bytes.slice(1);
    
    let type: DirLink['type'];
    if (typeBytes === DIR_LINK_TYPES.FIXED_HASH_BLAKE3) {
      type = 'fixed_hash_blake3';
    } else if (typeBytes === DIR_LINK_TYPES.RESOLVER_REGISTRY) {
      type = 'resolver_registry';
    } else {
      throw new Error(`Unknown DirLink type: 0x${typeBytes.toString(16)}`);
    }
    
    return { type, hash };
  }
  
  // Deserialise files map
  private static deserialiseFiles(filesMap: Map<string, any>): Map<string, FileRef> {
    const result = new Map<string, FileRef>();
    
    if (!(filesMap instanceof Map)) {
      return result;
    }
    
    for (const [name, fileRefMap] of filesMap) {
      if (fileRefMap instanceof Map) {
        const fileRef = this.deserialiseFileRef(fileRefMap);
        result.set(name, fileRef);
      }
    }
    
    return result;
  }
  
  // Deserialise a single FileRef
  private static deserialiseFileRef(fileRefMap: Map<number, any>): FileRef {
    const hash = fileRefMap.get(FILE_REF_KEYS.HASH);
    if (!hash || !(hash instanceof Uint8Array)) {
      throw new Error('Invalid FileRef hash');
    }
    
    const size = fileRefMap.get(FILE_REF_KEYS.SIZE);
    if (size === undefined) {
      throw new Error('Invalid FileRef size');
    }
    
    const fileRef: FileRef = { hash, size };
    
    // Optional fields
    const mediaType = fileRefMap.get(FILE_REF_KEYS.MEDIA_TYPE);
    if (mediaType !== undefined) {
      fileRef.media_type = mediaType;
    }
    
    const timestamp = fileRefMap.get(FILE_REF_KEYS.TIMESTAMP);
    if (timestamp !== undefined) {
      fileRef.timestamp = timestamp;
    }
    
    return fileRef;
  }
  
  // Serialise BlobLocation
  static serialiseBlobLocation(location: BlobLocation): [number, any] {
    switch (location.type) {
      case 'identity':
        return [BLOB_LOCATION_TAGS.IDENTITY, location.hash];
      case 'http':
        return [BLOB_LOCATION_TAGS.HTTP, location.url];
      case 'sha1':
        return [BLOB_LOCATION_TAGS.SHA1, location.hash];
      case 'sha256':
        return [BLOB_LOCATION_TAGS.SHA256, location.hash];
      case 'blake3':
        return [BLOB_LOCATION_TAGS.BLAKE3, location.hash];
      case 'md5':
        return [BLOB_LOCATION_TAGS.MD5, location.hash];
      default:
        throw new Error(`Unknown BlobLocation type: ${(location as any).type}`);
    }
  }
  
  // Deserialise BlobLocation
  static deserialiseBlobLocation(tag: number, value: any): BlobLocation {
    switch (tag) {
      case BLOB_LOCATION_TAGS.IDENTITY:
        if (!(value instanceof Uint8Array)) {
          throw new Error('Identity BlobLocation must have Uint8Array hash');
        }
        return { type: 'identity', hash: value };
      
      case BLOB_LOCATION_TAGS.HTTP:
        if (typeof value !== 'string') {
          throw new Error('HTTP BlobLocation must have string URL');
        }
        return { type: 'http', url: value };
      
      case BLOB_LOCATION_TAGS.SHA1:
        if (!(value instanceof Uint8Array)) {
          throw new Error('SHA1 BlobLocation must have Uint8Array hash');
        }
        return { type: 'sha1', hash: value };
      
      case BLOB_LOCATION_TAGS.SHA256:
        if (!(value instanceof Uint8Array)) {
          throw new Error('SHA256 BlobLocation must have Uint8Array hash');
        }
        return { type: 'sha256', hash: value };
      
      case BLOB_LOCATION_TAGS.BLAKE3:
        if (!(value instanceof Uint8Array)) {
          throw new Error('Blake3 BlobLocation must have Uint8Array hash');
        }
        return { type: 'blake3', hash: value };
      
      case BLOB_LOCATION_TAGS.MD5:
        if (!(value instanceof Uint8Array)) {
          throw new Error('MD5 BlobLocation must have Uint8Array hash');
        }
        return { type: 'md5', hash: value };
      
      default:
        throw new Error(`Unknown BlobLocation tag: ${tag}`);
    }
  }
}