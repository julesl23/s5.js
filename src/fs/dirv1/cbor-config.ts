import { Encoder, addExtension } from 'cbor-x';

// Create encoder with Rust-compatible settings
const encoder = new Encoder({
  mapsAsObjects: false,
  useRecords: false,
  variableMapSize: false,
  useFloat32: 0,
  tagUint8Array: false,
  pack: false,
  sequential: true,
  structuredClone: false,
  maxSharedStructures: 0,
  structures: [],
  saveStructures: () => false,
  bundleStrings: false
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
  
  // Handle Maps - keep them as-is to preserve insertion order
  if (value instanceof Map) {
    // For Maps, CBOR will encode them with their natural order
    // We don't sort them to preserve insertion order
    return value;
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

// Helper to postprocess decoded values
function postprocessValue(value: any): any {
  // Keep Maps as Maps - don't convert to objects
  if (value instanceof Map) {
    // Process Map values recursively but keep the Map structure
    const processedMap = new Map();
    for (const [k, v] of value) {
      processedMap.set(k, postprocessValue(v));
    }
    return processedMap;
  }
  
  if (Array.isArray(value)) {
    return value.map(item => postprocessValue(item));
  }
  
  return value;
}

// Main decoding function
export function decodeS5(data: Uint8Array): any {
  const decoded = encoder.decode(data);
  return decoded; // Return decoded value directly without postprocessing
}

// Helper to create ordered map from object
export function createOrderedMap<V>(obj: Record<string, V>): Map<string, V> {
  const entries = Object.entries(obj).sort((a, b) => a[0].localeCompare(b[0]));
  return new Map(entries);
}

// Export encoder instances for testing
export const s5Encoder = encoder;
export const s5Decoder = encoder; // Same instance handles both