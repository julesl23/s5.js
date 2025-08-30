import { JSCryptoImplementation } from "../src/api/crypto/js.js";
import { S5APIInterface } from "../src/api/s5.js";
import { BlobIdentifier } from "../src/identifier/blob.js";
import { webcrypto } from "crypto";

// Mock S5 API interface for testing
class MockS5API implements Partial<S5APIInterface> {
  crypto: any;
  private storage: Map<string, Uint8Array> = new Map();
  private registryEntries: Map<string, any> = new Map();

  constructor() {
    this.crypto = {
      ...new JSCryptoImplementation(),
      hashBlake3Sync: (data: Uint8Array): Uint8Array => {
        // Simple mock hash - just use first 32 bytes or pad
        const hash = new Uint8Array(32);
        for (let i = 0; i < Math.min(data.length, 32); i++) {
          hash[i] = data[i];
        }
        return hash;
      },
      hashBlake3Blob: async (blob: Blob): Promise<Uint8Array> => {
        const data = new Uint8Array(await blob.arrayBuffer());
        return MockS5API.prototype.crypto.hashBlake3Sync(data);
      },
      generateSecureRandomBytes: (size: number): Uint8Array => {
        const bytes = new Uint8Array(size);
        (webcrypto as any).getRandomValues(bytes);
        return bytes;
      },
      newKeyPairEd25519: async (seed: Uint8Array): Promise<any> => {
        return {
          publicKey: seed,
          privateKey: seed
        };
      },
      encryptXChaCha20Poly1305: async (key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> => {
        // Simple mock - just return plaintext with 16-byte tag
        return new Uint8Array([...plaintext, ...new Uint8Array(16)]);
      },
      decryptXChaCha20Poly1305: async (key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> => {
        // Simple mock - remove tag
        return ciphertext.subarray(0, ciphertext.length - 16);
      },
      signRawRegistryEntry: async (keyPair: any, entry: any): Promise<Uint8Array> => {
        // Simple mock signature
        return new Uint8Array(64);
      },
      signEd25519: async (keyPair: any, message: Uint8Array): Promise<Uint8Array> => {
        // Simple mock signature
        return new Uint8Array(64);
      }
    };
  }

  async uploadBlob(blob: Blob): Promise<BlobIdentifier> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = this.crypto.hashBlake3Sync(data);
    const key = Buffer.from(hash).toString('hex');
    this.storage.set(key, data);
    return new BlobIdentifier(new Uint8Array([0x1e, ...hash]), blob.size);
  }

  async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
    // If hash has multihash prefix, remove it
    const actualHash = hash[0] === 0x1e ? hash.slice(1) : hash;
    const key = Buffer.from(actualHash).toString('hex');
    const data = this.storage.get(key);
    if (!data) throw new Error("Blob not found");
    return data;
  }

  async registryGet(publicKey: Uint8Array): Promise<any> {
    const key = Buffer.from(publicKey).toString('hex');
    const entry = this.registryEntries.get(key);
    // Return proper registry entry structure
    if (!entry) {
      return { exists: false, data: null, revision: 0 };
    }
    return { 
      exists: true, 
      data: entry.data,
      revision: entry.revision || 1,
      signature: entry.signature || new Uint8Array(64)
    };
  }

  async registrySet(entry: any): Promise<void> {
    const key = Buffer.from(entry.pk).toString('hex');
    this.registryEntries.set(key, {
      data: entry.data,
      revision: entry.revision || 1,
      signature: entry.signature || new Uint8Array(64)
    });
  }
  
  registryListen(publicKey: Uint8Array): AsyncIterator<any> {
    // Mock implementation - return empty async iterator
    return (async function* () {
      // Empty async generator
    })();
  }
  
  async registryListenOnEntry(publicKey: Uint8Array, callback: (entry: any) => void): Promise<() => void> {
    // Mock implementation - just return a no-op unsubscribe function
    return () => {};
  }
}

// Mock identity for testing
class MockIdentity {
  fsRootKey = new Uint8Array(32).fill(1);
  
  // Add required properties for proper identity initialization
  get publicKey(): Uint8Array {
    return new Uint8Array(32).fill(2);
  }
  
  get privateKey(): Uint8Array {
    return new Uint8Array(64).fill(3);
  }
  
  // For registry operations
  keyPair = {
    publicKey: new Uint8Array(32).fill(2),
    privateKey: new Uint8Array(64).fill(3)
  };
}

export async function setupMockS5() {
  const s5 = new MockS5API() as any;
  const identity = new MockIdentity();
  
  return { s5, identity };
}