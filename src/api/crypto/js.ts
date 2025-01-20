import { BLAKE3, blake3 } from '@noble/hashes/blake3';
import { CryptoImplementation, KeyPairEd25519 } from "../crypto";
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import * as ed from '@noble/ed25519';


export class JSCryptoImplementation implements CryptoImplementation {
    generateSecureRandomBytes(length: number): Uint8Array {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return array;
    }
    async hashBlake3(input: Uint8Array): Promise<Uint8Array> {
        return blake3(input);
    }
    hashBlake3Sync(input: Uint8Array): Uint8Array {
        return blake3(input);
    }
    async hashBlake3Blob(blob: Blob): Promise<Uint8Array> {
        const blake3Hasher = new BLAKE3();
        // TODO Adjust chunk size
        const chunkSize = 256 * 1024;
        for (let i = 0; i < blob.size; i += chunkSize) {
            const chunk = blob.slice(i, i + chunkSize);
            blake3Hasher.update(new Uint8Array(await chunk.arrayBuffer()));
        }
        return blake3Hasher.digest();
    }
    // TODO(perf): use ed25519 web APIs if available
    async verifyEd25519(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): Promise<boolean> {
        return await ed.verifyAsync(signature, message, publicKey);
    }
    async signEd25519(keyPair: KeyPairEd25519, message: Uint8Array): Promise<Uint8Array> {
        return await ed.signAsync(message, keyPair.privKey);
    }
    async newKeyPairEd25519(seed: Uint8Array): Promise<KeyPairEd25519> {
        const pubKey = await ed.getPublicKeyAsync(seed);
        return new KeyPairEd25519(seed, pubKey);
    }
    async encryptXChaCha20Poly1305(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
        const chacha = xchacha20poly1305(key, nonce);
        return chacha.encrypt(plaintext);
    }
    async decryptXChaCha20Poly1305(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
        const chacha = xchacha20poly1305(key, nonce);
        return chacha.decrypt(ciphertext);
    }
}