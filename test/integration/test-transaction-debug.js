// test-transaction-debug.js - Debug the transaction error
import { S5 } from "../../dist/src/index.js";
import { generatePhrase } from "../../dist/src/identity/seed_phrase/seed_phrase.js";
import { DirV1Serialiser } from "../../dist/src/fs/dirv1/serialisation.js";
import { createRegistryEntry } from "../../dist/src/registry/entry.js";

// Node.js polyfills
import { webcrypto } from "crypto";
import { TextEncoder, TextDecoder } from "util";
import { ReadableStream, WritableStream, TransformStream } from "stream/web";
import { Blob, File } from "buffer";
import { fetch, Headers, Request, Response, FormData } from "undici";
import WebSocket from "ws";
import "fake-indexeddb/auto";

// Set up global polyfills
if (!global.crypto) global.crypto = webcrypto;
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;
if (!global.ReadableStream) global.ReadableStream = ReadableStream;
if (!global.WritableStream) global.WritableStream = WritableStream;
if (!global.TransformStream) global.TransformStream = TransformStream;
if (!global.Blob) global.Blob = Blob;
if (!global.File) global.File = File;
if (!global.Headers) global.Headers = Headers;
if (!global.Request) global.Request = Request;
if (!global.Response) global.Response = Response;
if (!global.fetch) global.fetch = fetch;
if (!global.FormData) global.FormData = FormData;
if (!global.WebSocket) global.WebSocket = WebSocket;

async function debugTransaction() {
  console.log("🔍 Transaction Debug\n");

  const s5 = await S5.create({
    initialPeers: ["wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p"]
  });

  // Generate fresh seed
  const freshSeedPhrase = generatePhrase(s5.api.crypto);
  console.log("Seed phrase:", freshSeedPhrase);
  await s5.recoverIdentityFromSeedPhrase(freshSeedPhrase);

  // Register
  await s5.registerOnNewPortal("https://s5.vup.cx");
  console.log("✅ Registered\n");

  // Get root info
  const rootURI = await s5.fs._buildRootWriteURI();
  const rootKS = await s5.fs.getKeySet(rootURI);
  
  console.log("1. Testing directory serialization...");
  try {
    const testDir = {
      magic: "S5.pro",
      header: {},
      dirs: new Map(),
      files: new Map()
    };
    
    const serialized = DirV1Serialiser.serialise(testDir);
    console.log("   ✅ Serialization successful");
    console.log("   Serialized length:", serialized.length);
    console.log("   First bytes:", Array.from(serialized.slice(0, 10)));
  } catch (error) {
    console.log("   ❌ Serialization failed:", error.message);
  }

  console.log("\n2. Testing blob upload...");
  try {
    const testData = new Uint8Array([1, 2, 3, 4, 5]);
    const blob = new Blob([testData]);
    const cid = await s5.api.uploadBlob(blob);
    console.log("   ✅ Blob upload successful");
    console.log("   CID hash length:", cid.hash.length);
  } catch (error) {
    console.log("   ❌ Blob upload failed:", error.message);
  }

  console.log("\n3. Testing key pair generation...");
  try {
    const kp = await s5.api.crypto.newKeyPairEd25519(rootKS.writeKey);
    console.log("   ✅ Key pair generated");
    console.log("   Public key length:", kp.publicKey.length);
    console.log("   Secret key length:", kp.secretKey.length);
  } catch (error) {
    console.log("   ❌ Key pair generation failed:", error.message);
  }

  console.log("\n4. Testing registry entry creation...");
  try {
    const testHash = new Uint8Array(33); // Dummy hash
    testHash[0] = 0x1e; // Blake3 prefix
    const kp = await s5.api.crypto.newKeyPairEd25519(rootKS.writeKey);
    const entry = await createRegistryEntry(kp, testHash, 1, s5.api.crypto);
    console.log("   ✅ Registry entry created");
    console.log("   Entry data length:", entry.data.length);
  } catch (error) {
    console.log("   ❌ Registry entry creation failed:", error.message);
    console.log("   Stack:", error.stack);
  }

  console.log("\n5. Testing full transaction flow...");
  try {
    // Create a simple directory
    const dir = {
      magic: "S5.pro",
      header: {},
      dirs: new Map(),
      files: new Map()
    };
    
    console.log("   Serializing directory...");
    const newBytes = DirV1Serialiser.serialise(dir);
    console.log("   ✅ Serialized");
    
    console.log("   Uploading blob...");
    const cid = await s5.api.uploadBlob(new Blob([newBytes]));
    console.log("   ✅ Uploaded, hash length:", cid.hash.length);
    
    console.log("   Creating key pair...");
    const kp = await s5.api.crypto.newKeyPairEd25519(rootKS.writeKey);
    console.log("   ✅ Key pair created");
    
    console.log("   Creating registry entry...");
    const entry = await createRegistryEntry(kp, cid.hash, 1, s5.api.crypto);
    console.log("   ✅ Registry entry created");
    
    console.log("   Setting registry entry...");
    await s5.api.registrySet(entry);
    console.log("   ✅ Registry set successful!");
    
  } catch (error) {
    console.log("   ❌ Transaction failed at:", error.message);
    console.log("   Type:", error.constructor.name);
    console.log("   Stack:", error.stack);
  }
}

debugTransaction().catch(console.error);