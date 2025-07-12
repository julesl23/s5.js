import { Encoder, addExtension } from 'cbor-x';

// Create encoder with Rust-compatible settings
const encoder = new Encoder({
  mapsAsObjects: false,
  useRecords: false,
  variableMapSize: false,
  useFloat32: 0,
  largeBigIntToNumber: false,
  tagUint8Array: false,
  pack: false,
  sequential: true,
  structuredClone: false,
  maxSharedStructures: 0,
  structures: [],
  saveStructures: false,
  bundleStrings: false,
  writeFunction: false,
});

// Helper to preprocess values before encoding
function preprocessValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map(item => preprocessValue(item));
  }
  
  // Convert plain objects to Maps for consistent encoding
  if (value && typeof value === 'object' && value.constructor === Object) {
    const entries = Object.entries(value).sort((a, b) => a[0].localeCompare(b[0]));
    return new Map(entries);
  }
  
  // Handle Maps - ensure proper sorting for string keys
  if (value instanceof Map) {
    // For string-keyed maps, sort by key
    if (value.size > 0 && typeof value.keys().next().value === 'string') {
      const sortedEntries = Array.from(value.entries()).sort((a, b) => {
        const aKey = a[0].toString();
        const bKey = b[0].toString();
        return aKey.localeCompare(bKey);
      });
      return new Map(sortedEntries);
    }
  }
  
  // Handle large integers - ensure they stay as bigints
  if (typeof value === 'number' && value > Number.MAX_SAFE_INTEGER) {
    return BigInt(value);
  }
  
  return value;
}

// Main encoding function
export function encodeS5(value: any): Uint8Array {
  const processed = preprocessValue(value);
  const result = encoder.encode(processed);
  // Ensure we return a Uint8Array, not a Buffer
  return new Uint8Array(result);
}

// Main decoding function
export function decodeS5(data: Uint8Array): any {
  return encoder.decode(data);
}