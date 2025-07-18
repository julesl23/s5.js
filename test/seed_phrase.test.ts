import { expect, test, describe } from "vitest";
import { JSCryptoImplementation } from "../src/api/crypto/js.js";
import { generatePhrase, hashToChecksumWords, validatePhrase } from "../src/identity/seed_phrase/seed_phrase.js";
import { bytesToHex } from "@noble/hashes/utils";

describe("seed_phrase", () => {
    const crypto = new JSCryptoImplementation();
    test("generatePhrase", () => {
        let phrase1 = generatePhrase(crypto);
        let phrase2 = generatePhrase(crypto);
        expect(phrase1).not.toBe(phrase2);
        expect(phrase1.split(" ").length).toBe(15);
    });
    test("validatePhrase", () => {
        const [valid, error, seed] = validatePhrase('sign weight spy quality sudden minute pizza great fear adapt nobody evident control alive crime', crypto);
        expect(valid).toBe(true);
        expect(error).toBe("");
        expect(bytesToHex(seed!)).toBe("cafe1d4accd7636ab5865140e97d2eb8");
    });
    test("hashToChecksumWords", () => {
        const hash = crypto.hashBlake3Sync(new Uint8Array(0));
        const checksumWords = hashToChecksumWords(hash);
        expect(checksumWords[0]).toBe(700);
        expect(checksumWords[1]).toBe(308);
    });
});