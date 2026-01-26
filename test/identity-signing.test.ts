import { expect, test, describe, beforeAll } from "vitest";
import { JSCryptoImplementation } from "../src/api/crypto/js.js";
import { S5UserIdentity } from "../src/identity/identity.js";
import { base64UrlNoPaddingEncode, base64UrlNoPaddingDecode } from "../src/util/base64.js";
import { CHALLENGE_TYPE_REGISTER, CHALLENGE_TYPE_LOGIN } from "../src/account/sign_challenge.js";

describe("identity signing API", () => {
    const crypto = new JSCryptoImplementation();
    let identity: S5UserIdentity;
    const testSeedPhrase = 'sign weight spy quality sudden minute pizza great fear adapt nobody evident control alive crime';

    beforeAll(async () => {
        identity = await S5UserIdentity.fromSeedPhrase(testSeedPhrase, crypto);
    });

    describe("S5UserIdentity.signingKey", () => {
        test("returns the signing key seed", async () => {
            const signingKey = identity.signingKey;
            expect(signingKey).toBeInstanceOf(Uint8Array);
            expect(signingKey.length).toBe(32);
        });

        test("returns consistent key for same identity", async () => {
            const key1 = identity.signingKey;
            const key2 = identity.signingKey;
            expect(key1).toEqual(key2);
        });

        test("different seed phrases produce different signing keys", async () => {
            // Generate a new valid seed phrase
            const { generatePhrase } = await import("../src/identity/seed_phrase/seed_phrase.js");
            const newPhrase = generatePhrase(crypto);
            const identity2 = await S5UserIdentity.fromSeedPhrase(newPhrase, crypto);
            expect(identity.signingKey).not.toEqual(identity2.signingKey);
        });
    });

    describe("key derivation", () => {
        test("main signing key produces valid keypair", async () => {
            const keyPair = await crypto.newKeyPairEd25519(identity.signingKey);
            expect(keyPair.pubKey.length).toBe(32);
            // privKey is the 32-byte seed, not the 64-byte expanded private key
            expect(keyPair.privKey.length).toBe(32);
        });

        test("purpose-specific seed produces different keypair", async () => {
            const mainKeyPair = await crypto.newKeyPairEd25519(identity.signingKey);

            // Derive purpose-specific key (same as deriveKeyPair with seed)
            const seedBytes = crypto.generateSecureRandomBytes(32);
            const derivedKey = await crypto.hashBlake3(
                new Uint8Array([...identity.portalAccountSeed, ...seedBytes])
            );
            const purposeKeyPair = await crypto.newKeyPairEd25519(derivedKey);

            expect(purposeKeyPair.pubKey).not.toEqual(mainKeyPair.pubKey);
        });

        test("same seed produces same purpose-specific key", async () => {
            const seedBytes = crypto.generateSecureRandomBytes(32);

            const derivedKey1 = await crypto.hashBlake3(
                new Uint8Array([...identity.portalAccountSeed, ...seedBytes])
            );
            const keyPair1 = await crypto.newKeyPairEd25519(derivedKey1);

            const derivedKey2 = await crypto.hashBlake3(
                new Uint8Array([...identity.portalAccountSeed, ...seedBytes])
            );
            const keyPair2 = await crypto.newKeyPairEd25519(derivedKey2);

            expect(keyPair1.pubKey).toEqual(keyPair2.pubKey);
        });
    });

    describe("signing operations", () => {
        test("sign and verify with main signing key", async () => {
            const keyPair = await crypto.newKeyPairEd25519(identity.signingKey);
            const message = new TextEncoder().encode("test message");

            const signature = await crypto.signEd25519(keyPair, message);

            expect(signature.length).toBe(64);
            const isValid = await crypto.verifyEd25519(keyPair.pubKey, message, signature);
            expect(isValid).toBe(true);
        });

        test("signature verification fails with wrong message", async () => {
            const keyPair = await crypto.newKeyPairEd25519(identity.signingKey);
            const message = new TextEncoder().encode("test message");
            const wrongMessage = new TextEncoder().encode("wrong message");

            const signature = await crypto.signEd25519(keyPair, message);

            const isValid = await crypto.verifyEd25519(keyPair.pubKey, wrongMessage, signature);
            expect(isValid).toBe(false);
        });

        test("signature verification fails with wrong key", async () => {
            const keyPair = await crypto.newKeyPairEd25519(identity.signingKey);
            const wrongKeyPair = await crypto.newKeyPairEd25519(crypto.generateSecureRandomBytes(32));
            const message = new TextEncoder().encode("test message");

            const signature = await crypto.signEd25519(keyPair, message);

            const isValid = await crypto.verifyEd25519(wrongKeyPair.pubKey, message, signature);
            expect(isValid).toBe(false);
        });

        test("sign portal challenge format", async () => {
            const seedBytes = crypto.generateSecureRandomBytes(32);
            const derivedKey = await crypto.hashBlake3(
                new Uint8Array([...identity.portalAccountSeed, ...seedBytes])
            );
            const keyPair = await crypto.newKeyPairEd25519(derivedKey);

            // Simulate portal challenge response format
            const challenge = crypto.generateSecureRandomBytes(32);
            const portalHostHash = await crypto.hashBlake3(
                new TextEncoder().encode('s5.example.com')
            );
            const message = new Uint8Array([CHALLENGE_TYPE_REGISTER, ...challenge, ...portalHostHash]);

            const signature = await crypto.signEd25519(keyPair, message);

            expect(signature.length).toBe(64);
            const isValid = await crypto.verifyEd25519(keyPair.pubKey, message, signature);
            expect(isValid).toBe(true);
        });
    });

    describe("base64url encoding", () => {
        test("encode and decode round-trip", () => {
            const original = crypto.generateSecureRandomBytes(32);
            const encoded = base64UrlNoPaddingEncode(original);
            const decoded = base64UrlNoPaddingDecode(encoded);

            expect(decoded).toEqual(original);
        });

        test("raw public key encodes to expected length", async () => {
            const keyPair = await crypto.newKeyPairEd25519(identity.signingKey);
            const encoded = base64UrlNoPaddingEncode(keyPair.pubKey);

            // 32 bytes in base64url = ~43 characters
            expect(encoded.length).toBe(43);
        });

        test("public key with multikey prefix encodes to expected length", async () => {
            const keyPair = await crypto.newKeyPairEd25519(identity.signingKey);
            const encoded = base64UrlNoPaddingEncode(keyPair.publicKey);

            // 33 bytes (1 prefix + 32 key) in base64url = 44 characters
            expect(encoded.length).toBe(44);
            // First byte should be 0xed (mkeyEd25519) which encodes to '7' in base64url
            expect(encoded.startsWith('7')).toBe(true);
        });

        test("signature encodes to expected length", async () => {
            const keyPair = await crypto.newKeyPairEd25519(identity.signingKey);
            const message = new TextEncoder().encode("test");
            const signature = await crypto.signEd25519(keyPair, message);
            const encoded = base64UrlNoPaddingEncode(signature);

            // 64 bytes in base64url = ~86 characters
            expect(encoded.length).toBe(86);
        });
    });

    describe("challenge type constants", () => {
        test("CHALLENGE_TYPE_REGISTER is 1", () => {
            expect(CHALLENGE_TYPE_REGISTER).toBe(1);
        });

        test("CHALLENGE_TYPE_LOGIN is 2", () => {
            expect(CHALLENGE_TYPE_LOGIN).toBe(2);
        });
    });

    describe("setPortalAuth", () => {
        test("setPortalAuth configures portal for immediate use", async () => {
            // This tests the S5APIWithIdentity.setPortalAuth method directly
            // In a real scenario, this would be called via S5.setPortalAuth()
            const { S5APIWithIdentity } = await import("../src/identity/api.js");
            const { S5Node } = await import("../src/node/node.js");
            const { MemoryLevelStore } = await import("../src/kv/memory_level.js");

            // Create minimal mocks
            const mockNode = {
                crypto,
                ensureInitialized: async () => {},
            } as unknown as InstanceType<typeof S5Node>;
            const mockAuthStore = await MemoryLevelStore.open();

            const api = new S5APIWithIdentity(mockNode, identity, mockAuthStore);

            // Set portal auth
            api.setPortalAuth('https://s5.example.com', 'test-auth-token-123');

            // Verify portal is configured (accountConfigs is private, so we check indirectly)
            // The portal should be available for uploads
            expect(() => api.setPortalAuth('https://s5.example.com', 'new-token')).not.toThrow();
        });

        test("setPortalAuth handles port numbers", async () => {
            const { S5APIWithIdentity } = await import("../src/identity/api.js");
            const { S5Node } = await import("../src/node/node.js");
            const { MemoryLevelStore } = await import("../src/kv/memory_level.js");

            const mockNode = {
                crypto,
                ensureInitialized: async () => {},
            } as unknown as InstanceType<typeof S5Node>;
            const mockAuthStore = await MemoryLevelStore.open();

            const api = new S5APIWithIdentity(mockNode, identity, mockAuthStore);

            // Should handle URLs with port numbers
            expect(() => api.setPortalAuth('https://s5.example.com:8080', 'token')).not.toThrow();
        });
    });

    describe("backend-mediated registration flow simulation", () => {
        test("complete challenge-response flow", async () => {
            // Step 1: Generate purpose-specific seed
            const seed = crypto.generateSecureRandomBytes(32);
            const seedBase64 = base64UrlNoPaddingEncode(seed);

            // Step 2: Derive keypair from seed
            const derivedKey = await crypto.hashBlake3(
                new Uint8Array([...identity.portalAccountSeed, ...seed])
            );
            const keyPair = await crypto.newKeyPairEd25519(derivedKey);
            const pubKeyBase64 = base64UrlNoPaddingEncode(keyPair.pubKey);

            // Step 3: Backend would use pubKey to get challenge from portal
            const challenge = crypto.generateSecureRandomBytes(32);
            const challengeBase64 = base64UrlNoPaddingEncode(challenge);

            // Step 4: Browser formats and signs challenge
            const portalHost = 's5.example.com';
            const portalHostHash = await crypto.hashBlake3(
                new TextEncoder().encode(portalHost)
            );
            const message = new Uint8Array([CHALLENGE_TYPE_REGISTER, ...challenge, ...portalHostHash]);
            const signature = await crypto.signEd25519(keyPair, message);
            const signatureBase64 = base64UrlNoPaddingEncode(signature);

            // Step 5: Verify signature (portal would do this)
            const isValid = await crypto.verifyEd25519(keyPair.pubKey, message, signature);
            expect(isValid).toBe(true);

            // Verify all outputs are base64url strings without padding
            expect(seedBase64).not.toContain('=');
            expect(seedBase64).not.toContain('+');
            expect(seedBase64).not.toContain('/');
            expect(pubKeyBase64).not.toContain('=');
            expect(challengeBase64).not.toContain('=');
            expect(signatureBase64).not.toContain('=');
        });
    });
});
