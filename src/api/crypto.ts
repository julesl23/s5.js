///
/// This implementation follows the S5 v1 spec at https://docs.sfive.net/spec/api-interface.html
///

import { mkeyEd25519 } from "../constants";

export interface CryptoImplementation {
    generateSecureRandomBytes(length: number): Uint8Array;

    hashBlake3(input: Uint8Array): Promise<Uint8Array>;
    hashBlake3Sync(input: Uint8Array): Uint8Array;
    hashBlake3Blob(blob: Blob): Promise<Uint8Array>;

    verifyEd25519(
        publicKey: Uint8Array,
        message: Uint8Array,
        signature: Uint8Array,
    ): Promise<boolean>;
    signEd25519(
        keyPair: KeyPairEd25519,
        message: Uint8Array,
    ): Promise<Uint8Array>;
    newKeyPairEd25519(
        seed: Uint8Array,
    ): Promise<KeyPairEd25519>;

    encryptXChaCha20Poly1305(
        key: Uint8Array,
        nonce: Uint8Array,
        plaintext: Uint8Array,
    ): Promise<Uint8Array>;
    decryptXChaCha20Poly1305(
        key: Uint8Array,
        nonce: Uint8Array,
        ciphertext: Uint8Array,
    ): Promise<Uint8Array>;
}

export class KeyPairEd25519 {
    private readonly _bytes: Uint8Array;

    constructor(bytes: Uint8Array) {
        this._bytes = bytes;
    }

    public get publicKey(): Uint8Array {
        return new Uint8Array([mkeyEd25519, ...this._bytes.subarray(32)]);
    }

    extractBytes(): Uint8Array {
        return this._bytes;
    }
}
