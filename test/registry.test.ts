import { expect, test, describe } from "bun:test";
import { JSCryptoImplementation } from "../src/api/crypto/js";
import { createRegistryEntry, deserializeRegistryEntry, serializeRegistryEntry, verifyRegistryEntry } from "../src/registry/entry";
import { bytesToHex } from "@noble/hashes/utils";

describe("registry", async () => {
  const crypto = new JSCryptoImplementation();

  const keyPair = await crypto.newKeyPairEd25519(new Uint8Array(32));

  test("signatures", async () => {
    const data = new Uint8Array(33);
    const revision = 1;
    const entry = await createRegistryEntry(keyPair, data, revision, crypto);
    expect(bytesToHex(entry.signature)).toBe("b5c2efc79193b5495838aaa6e9c4500ae685ab7d1f790ece3cb7244a63305c6b072a7190a088a81cc203e24cbd2cc1cf318022bdce4883d4a37600b3675a290f");
    const result = await verifyRegistryEntry(entry, crypto);
    expect(result).toBe(true);
  });

  test("serialization", async () => {
    const exampleHash = crypto.hashBlake3Sync(new Uint8Array(0))
    const data = new Uint8Array([0x1e, ...exampleHash]);
    const revision = 42;
    const entry = await createRegistryEntry(keyPair, data, revision, crypto);
    const serialized = serializeRegistryEntry(entry);
    expect(bytesToHex(serialized)).toBe("07ed3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da292a00000000000000211eaf1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f326280e4e006ceb0da7934bf6308ca6b17ab5f98f1593dee44644ea252a82f77cf5dd43db1833f64c6461bc5cd20dee4e4dfcca051381021da89396693af5cfc3e0c");

    const deserializedEntry = deserializeRegistryEntry(serialized);
    expect(bytesToHex(deserializedEntry.data)).toBe(bytesToHex(data));
    expect(bytesToHex(deserializedEntry.pk)).toBe(bytesToHex(keyPair.publicKey));
    expect(bytesToHex(deserializedEntry.signature)).toBe(bytesToHex(entry.signature));
    expect(deserializedEntry.revision).toBe(revision);
  });
});