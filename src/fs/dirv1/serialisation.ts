import { encodeS5, decodeS5 } from './cbor-config.js';
import { debug } from '../../util/debug.js';
import type { DirV1, FileRef, DirRef, DirLink, BlobLocation } from './types.js';
import { FILE_REF_KEYS, DIR_REF_KEYS, DIR_LINK_TYPES, BLOB_LOCATION_TAGS } from './types.js';

export class DirV1Serialiser {
  // Serialise DirV1 to CBOR bytes with magic prefix
  static serialise(dir: DirV1): Uint8Array {
    // Convert to CBOR structure
    const cborStructure = this.toCborStructure(dir);

    const fileCount = (dir.files instanceof Map) ? dir.files.size : 0;
    const dirCount = (dir.dirs instanceof Map) ? dir.dirs.size : 0;
    debug.cbor(' CBOR: Serializing directory', {
      files: fileCount,
      directories: dirCount,
      sharded: !!dir.header?.sharding,
      format: 'DirV1'
    });

    // Encode to CBOR
    const cborBytes = encodeS5(cborStructure);
    
    // Add magic bytes prefix (0x5f 0x5d)
    const result = new Uint8Array(2 + cborBytes.length);
    result[0] = 0x5f;
    result[1] = 0x5d;
    result.set(cborBytes, 2);

    // Estimate JSON size for comparison (simple approximation)
    const estimatedJsonSize = JSON.stringify({
      files: fileCount,
      dirs: dirCount
    }).length * (fileCount + dirCount + 10);
    const compressionRatio = estimatedJsonSize > 0
      ? ((1 - result.length / estimatedJsonSize) * 100).toFixed(1)
      : '0.0';

    debug.cbor(' CBOR: Serialization complete', {
      inputEntries: fileCount + dirCount,
      cborBytes: cborBytes.length,
      withMagic: result.length,
      compressionVsJson: compressionRatio + '%',
      deterministic: true
    });

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
      if (link.hash) result.set(link.hash, 1);
    } else if (link.type === 'resolver_registry') {
      result[0] = DIR_LINK_TYPES.RESOLVER_REGISTRY;
      if (link.hash) result.set(link.hash, 1);
    } else if (link.type === 'mutable_registry_ed25519') {
      result[0] = DIR_LINK_TYPES.RESOLVER_REGISTRY; // 0xed
      if (link.publicKey) result.set(link.publicKey, 1);
    }
    
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
    
    // Key 8: timestamp_subsec_nanos (optional)
    if (fileRef.timestamp_subsec_nanos !== undefined) {
      result.set(FILE_REF_KEYS.TIMESTAMP_SUBSEC_NANOS, fileRef.timestamp_subsec_nanos);
    }
    
    // Key 9: locations (optional)
    if (fileRef.locations !== undefined) {
      const serialisedLocations = fileRef.locations.map(loc => 
        this.serialiseBlobLocation(loc)
      );
      result.set(FILE_REF_KEYS.LOCATIONS, serialisedLocations);
    }
    
    // Key 22: hash_type + extra fields (optional)
    if (fileRef.hash_type !== undefined || fileRef.extra !== undefined) {
      // In the rust test vectors, key 22 contains a map with extra fields
      if (fileRef.extra !== undefined && fileRef.extra.size > 0) {
        result.set(FILE_REF_KEYS.HASH_TYPE, fileRef.extra);
      } else if (fileRef.hash_type !== undefined) {
        result.set(FILE_REF_KEYS.HASH_TYPE, fileRef.hash_type);
      }
    }
    
    // Key 23: prev (optional)
    if (fileRef.prev !== undefined) {
      result.set(FILE_REF_KEYS.PREV, this.serialiseFileRef(fileRef.prev));
    }
    
    return result;
  }
  
  // Deserialise CBOR bytes to DirV1
  static deserialise(data: Uint8Array): DirV1 {
    // Check minimum length for magic bytes
    if (data.length < 2) {
      throw new Error('Data too short to be valid DirV1');
    }
    
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

    const filesSize = (files instanceof Map) ? files.size : 0;
    const dirsSize = (dirs instanceof Map) ? dirs.size : 0;
    debug.cbor(' CBOR: Deserialization complete', {
      inputBytes: cborData.length,
      files: filesSize,
      directories: dirsSize,
      magic: magic,
      verified: true
    });

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
    const hashOrKey = bytes.slice(1);
    
    let type: DirLink['type'];
    if (typeBytes === DIR_LINK_TYPES.FIXED_HASH_BLAKE3) {
      return { type: 'fixed_hash_blake3', hash: hashOrKey };
    } else if (typeBytes === DIR_LINK_TYPES.RESOLVER_REGISTRY) {
      // 0xed can be either resolver_registry or mutable_registry_ed25519
      // In the test vectors, 0xed is used for mutable_registry_ed25519
      return { type: 'mutable_registry_ed25519', publicKey: hashOrKey };
    } else {
      throw new Error(`Unknown DirLink type: 0x${typeBytes.toString(16)}`);
    }
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
    
    const timestampSubsecNanos = fileRefMap.get(FILE_REF_KEYS.TIMESTAMP_SUBSEC_NANOS);
    if (timestampSubsecNanos !== undefined) {
      fileRef.timestamp_subsec_nanos = timestampSubsecNanos;
    }
    
    const locations = fileRefMap.get(FILE_REF_KEYS.LOCATIONS);
    if (locations !== undefined && Array.isArray(locations)) {
      fileRef.locations = locations.map(([tag, value]) => 
        this.deserialiseBlobLocation(tag, value)
      );
    }
    
    const hashType = fileRefMap.get(FILE_REF_KEYS.HASH_TYPE);
    if (hashType !== undefined) {
      fileRef.hash_type = hashType;
    }
    
    const prev = fileRefMap.get(FILE_REF_KEYS.PREV);
    if (prev !== undefined && prev instanceof Map) {
      fileRef.prev = this.deserialiseFileRef(prev);
    }
    
    // Handle key 22 which might contain extra fields map
    const key22Value = fileRefMap.get(FILE_REF_KEYS.HASH_TYPE);
    if (key22Value !== undefined) {
      if (key22Value instanceof Map) {
        // Key 22 contains the extra fields map
        fileRef.extra = key22Value;
      } else {
        // Key 22 contains just hash_type
        fileRef.hash_type = key22Value;
      }
    }
    
    return fileRef;
  }
  
  // Serialise BlobLocation
  static serialiseBlobLocation(location: BlobLocation): [number, any] {
    switch (location.type) {
      case 'identity':
        return [BLOB_LOCATION_TAGS.IDENTITY, location.data];
      case 'http':
        return [BLOB_LOCATION_TAGS.HTTP, location.url];
      case 'multihash_sha1':
        return [BLOB_LOCATION_TAGS.SHA1, location.hash];
      case 'multihash_sha2_256':
        return [BLOB_LOCATION_TAGS.SHA256, location.hash];
      case 'multihash_blake3':
        return [BLOB_LOCATION_TAGS.BLAKE3, location.hash];
      case 'multihash_md5':
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
          throw new Error('Identity BlobLocation must have Uint8Array data');
        }
        return { type: 'identity', data: value };
      
      case BLOB_LOCATION_TAGS.HTTP:
        if (typeof value !== 'string') {
          throw new Error('HTTP BlobLocation must have string URL');
        }
        return { type: 'http', url: value };
      
      case BLOB_LOCATION_TAGS.SHA1:
        if (!(value instanceof Uint8Array)) {
          throw new Error('SHA1 BlobLocation must have Uint8Array hash');
        }
        return { type: 'multihash_sha1', hash: value };
      
      case BLOB_LOCATION_TAGS.SHA256:
        if (!(value instanceof Uint8Array)) {
          throw new Error('SHA256 BlobLocation must have Uint8Array hash');
        }
        return { type: 'multihash_sha2_256', hash: value };
      
      case BLOB_LOCATION_TAGS.BLAKE3:
        if (!(value instanceof Uint8Array)) {
          throw new Error('Blake3 BlobLocation must have Uint8Array hash');
        }
        return { type: 'multihash_blake3', hash: value };
      
      case BLOB_LOCATION_TAGS.MD5:
        if (!(value instanceof Uint8Array)) {
          throw new Error('MD5 BlobLocation must have Uint8Array hash');
        }
        return { type: 'multihash_md5', hash: value };
      
      default:
        throw new Error(`Unknown BlobLocation tag: ${tag}`);
    }
  }
}