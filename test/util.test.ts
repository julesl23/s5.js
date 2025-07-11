import { expect, test, describe } from "vitest";
import { deriveHashInt, deriveHashString } from "../src/util/derive_hash";
import { JSCryptoImplementation } from "../src/api/crypto/js";
import { bytesToHex } from "@noble/hashes/utils";

describe("derive_hash", () => {
  const crypto = new JSCryptoImplementation();
  test("deriveHashString", () => {
    let hash = deriveHashString(
      new Uint8Array(32),
      new Uint8Array(32),
      crypto,
    );
    expect(bytesToHex(hash)).toBe(
      "e40b877081c208036d451b898700b4bf938792ffa3e4426f2bf871aa057d992b",
    );
  });

  test("deriveHashInt", () => {
    let hash = deriveHashInt(
      new Uint8Array(32),
      0,
      crypto,
    );
    expect(bytesToHex(hash)).toBe(
      "4d006976636a8696d909a630a4081aad4d7c50f81afdee04020bf05086ab6a55",
    );
  });
});