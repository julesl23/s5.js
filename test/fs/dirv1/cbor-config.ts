import { Encoder, Decoder } from "cbor-x";

// Stub implementation - just enough to compile
export function encodeS5(data: any): Uint8Array {
  // TODO: Implement proper encoding
  const encoder = new Encoder();
  return encoder.encode(data);
}

export function decodeS5(data: Uint8Array): any {
  const decoder = new Decoder();
  return decoder.decode(data);
}

export function createS5Encoder() {
  return new Encoder({
    sequential: true,
    bundleStrings: false,
    mapsAsObjects: false,
  });
}
