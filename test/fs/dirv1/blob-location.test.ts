import { describe, test, expect } from "vitest";
import { DirV1Serialiser } from "../../../src/fs/dirv1/serialisation";
import type { BlobLocation } from "../../../src/fs/dirv1/types";

describe("BlobLocation Serialisation", () => {
  test("should serialise identity location", () => {
    const location: BlobLocation = {
      type: 'identity',
      hash: new Uint8Array(32).fill(0xaa)
    };
    
    const [tag, value] = DirV1Serialiser.serialiseBlobLocation(location);
    expect(tag).toBe(0); // IDENTITY tag
    expect(value).toEqual(new Uint8Array(32).fill(0xaa));
  });

  test("should serialise http location", () => {
    const location: BlobLocation = {
      type: 'http',
      url: 'https://example.com/blob'
    };
    
    const [tag, value] = DirV1Serialiser.serialiseBlobLocation(location);
    expect(tag).toBe(1); // HTTP tag
    expect(value).toBe('https://example.com/blob');
  });

  test("should serialise sha1 location", () => {
    const location: BlobLocation = {
      type: 'sha1',
      hash: new Uint8Array(20).fill(0x11) // SHA1 is 20 bytes
    };
    
    const [tag, value] = DirV1Serialiser.serialiseBlobLocation(location);
    expect(tag).toBe(0x11); // SHA1 tag
    expect(value).toEqual(new Uint8Array(20).fill(0x11));
  });

  test("should serialise sha256 location", () => {
    const location: BlobLocation = {
      type: 'sha256',
      hash: new Uint8Array(32).fill(0x22)
    };
    
    const [tag, value] = DirV1Serialiser.serialiseBlobLocation(location);
    expect(tag).toBe(0x12); // SHA256 tag
    expect(value).toEqual(new Uint8Array(32).fill(0x22));
  });

  test("should serialise blake3 location", () => {
    const location: BlobLocation = {
      type: 'blake3',
      hash: new Uint8Array(32).fill(0x33)
    };
    
    const [tag, value] = DirV1Serialiser.serialiseBlobLocation(location);
    expect(tag).toBe(0x1e); // BLAKE3 tag
    expect(value).toEqual(new Uint8Array(32).fill(0x33));
  });

  test("should serialise md5 location", () => {
    const location: BlobLocation = {
      type: 'md5',
      hash: new Uint8Array(16).fill(0x55) // MD5 is 16 bytes
    };
    
    const [tag, value] = DirV1Serialiser.serialiseBlobLocation(location);
    expect(tag).toBe(0xd5); // MD5 tag
    expect(value).toEqual(new Uint8Array(16).fill(0x55));
  });
});

describe("BlobLocation Deserialisation", () => {
  test("should deserialise identity location", () => {
    const hash = new Uint8Array(32).fill(0xaa);
    const location = DirV1Serialiser.deserialiseBlobLocation(0, hash);
    
    expect(location.type).toBe('identity');
    expect((location as any).hash).toEqual(hash);
  });

  test("should deserialise http location", () => {
    const url = 'https://example.com/blob';
    const location = DirV1Serialiser.deserialiseBlobLocation(1, url);
    
    expect(location.type).toBe('http');
    expect((location as any).url).toBe(url);
  });

  test("should deserialise sha1 location", () => {
    const hash = new Uint8Array(20).fill(0x11);
    const location = DirV1Serialiser.deserialiseBlobLocation(0x11, hash);
    
    expect(location.type).toBe('sha1');
    expect((location as any).hash).toEqual(hash);
  });

  test("should deserialise sha256 location", () => {
    const hash = new Uint8Array(32).fill(0x22);
    const location = DirV1Serialiser.deserialiseBlobLocation(0x12, hash);
    
    expect(location.type).toBe('sha256');
    expect((location as any).hash).toEqual(hash);
  });

  test("should deserialise blake3 location", () => {
    const hash = new Uint8Array(32).fill(0x33);
    const location = DirV1Serialiser.deserialiseBlobLocation(0x1e, hash);
    
    expect(location.type).toBe('blake3');
    expect((location as any).hash).toEqual(hash);
  });

  test("should deserialise md5 location", () => {
    const hash = new Uint8Array(16).fill(0x55);
    const location = DirV1Serialiser.deserialiseBlobLocation(0xd5, hash);
    
    expect(location.type).toBe('md5');
    expect((location as any).hash).toEqual(hash);
  });

  test("should throw error for unknown tag", () => {
    expect(() => {
      DirV1Serialiser.deserialiseBlobLocation(0xff, new Uint8Array(32));
    }).toThrow('Unknown BlobLocation tag: 255');
  });

  test("should throw error for invalid value types", () => {
    expect(() => {
      DirV1Serialiser.deserialiseBlobLocation(0, "not-a-uint8array");
    }).toThrow('Identity BlobLocation must have Uint8Array hash');
    
    expect(() => {
      DirV1Serialiser.deserialiseBlobLocation(1, 123);
    }).toThrow('HTTP BlobLocation must have string URL');
  });
});

describe("BlobLocation Round-trip", () => {
  const testCases: BlobLocation[] = [
    { type: 'identity', hash: new Uint8Array(32).fill(0xaa) },
    { type: 'http', url: 'https://example.com/blob' },
    { type: 'sha1', hash: new Uint8Array(20).fill(0x11) },
    { type: 'sha256', hash: new Uint8Array(32).fill(0x22) },
    { type: 'blake3', hash: new Uint8Array(32).fill(0x33) },
    { type: 'md5', hash: new Uint8Array(16).fill(0x55) },
  ];

  testCases.forEach(originalLocation => {
    test(`should round-trip ${originalLocation.type} location`, () => {
      const [tag, value] = DirV1Serialiser.serialiseBlobLocation(originalLocation);
      const deserialised = DirV1Serialiser.deserialiseBlobLocation(tag, value);
      
      expect(deserialised).toEqual(originalLocation);
    });
  });
});