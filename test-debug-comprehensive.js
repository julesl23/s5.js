// test-debug-comprehensive.js - Comprehensive debugging for S5 portal issues
import { S5 } from "./dist/src/index.js";
import { generatePhrase } from "./dist/src/identity/seed_phrase/seed_phrase.js";
import { DirV1Serialiser } from "./dist/src/fs/dirv1/serialisation.js";
import { createRegistryEntry } from "./dist/src/registry/entry.js";

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

// Helper to log with timestamp
function log(message, data = null) {
  const timestamp = new Date().toISOString().split("T")[1];
  console.log(`[${timestamp}] ${message}`);
  if (data !== null) {
    if (data instanceof Uint8Array) {
      console.log(
        `   Uint8Array(${data.length}): ${Buffer.from(data)
          .toString("hex")
          .substring(0, 64)}...`
      );
    } else if (typeof data === "object") {
      console.log(`   ${JSON.stringify(data, null, 2)}`);
    } else {
      console.log(`   ${data}`);
    }
  }
}

async function comprehensiveDebug() {
  console.log("\n🔍 COMPREHENSIVE S5 PORTAL DEBUG TEST");
  console.log("=".repeat(70) + "\n");

  try {
    // STEP 1: Create S5 instance
    log("STEP 1: Creating S5 instance...");
    const s5 = await S5.create({
      initialPeers: [
        "wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p",
      ],
    });
    log("✅ S5 instance created");

    // STEP 2: Create fresh identity
    log("\nSTEP 2: Creating fresh identity...");
    const freshSeed = generatePhrase(s5.api.crypto);
    log("Generated seed phrase:", freshSeed);

    await s5.recoverIdentityFromSeedPhrase(freshSeed);
    log("✅ Identity recovered");

    // Debug identity properties
    if (s5.identity) {
      log("Identity properties:", {
        hasKeypair: !!s5.identity.keypair,
        hasFsRootKey: !!s5.identity.fsRootKey,
        hasPortalAccountSeed: !!s5.identity.portalAccountSeed,
      });

      if (s5.identity.fsRootKey) {
        log("fsRootKey:", s5.identity.fsRootKey);
      }
    }

    // STEP 3: Portal registration
    log("\nSTEP 3: Registering on portal...");
    try {
      await s5.registerOnNewPortal("https://s5.vup.cx");
      log("✅ Portal registration successful");
    } catch (error) {
      log("❌ Portal registration failed:", error.message);
      if (error.stack) log("Stack trace:", error.stack);
    }

    // STEP 4: Get root URI and key set
    log("\nSTEP 4: Getting root directory info...");
    const rootURI = await s5.fs._buildRootWriteURI();
    log("Root URI:", rootURI);

    const rootKeySet = await s5.fs.getKeySet(rootURI);
    log("Root key set obtained:", {
      hasWriteKey: !!rootKeySet.writeKey,
      hasEncryptionKey: !!rootKeySet.encryptionKey,
      writeKeyLength: rootKeySet.writeKey?.length,
      encryptionKeyLength: rootKeySet.encryptionKey?.length,
    });

    if (rootKeySet.writeKey) {
      log("Root write key:", rootKeySet.writeKey);
    }

    // STEP 5: Manual directory transaction with extensive logging
    log("\nSTEP 5: Running manual directory transaction...");

    try {
      const result = await s5.fs.runTransactionOnDirectory(
        rootURI,
        async (dir, writeKey) => {
          log("\n📂 TRANSACTION START");
          log("Directory state:", {
            magic: dir.magic,
            dirsCount: dir.dirs.size,
            filesCount: dir.files.size,
            dirNames: Array.from(dir.dirs.keys()),
          });
          log("Write key for transaction:", writeKey);

          // Try to create home directory
          log("\nCreating 'home' directory...");

          // Debug key derivation
          if (s5.fs._deriveWriteKeyForChildDirectory) {
            try {
              const childKey = await s5.fs._deriveWriteKeyForChildDirectory(
                writeKey,
                "home"
              );
              log("Derived child write key:", childKey);
            } catch (error) {
              log("❌ Error deriving child key:", error.message);
              log("Error type:", error.constructor.name);
              log("Error stack:", error.stack);
            }
          } else {
            log("⚠️  _deriveWriteKeyForChildDirectory method not found");
          }

          // Try the actual directory creation
          try {
            const homeRef = await s5.fs._createDirectory("home", writeKey);
            log("✅ Created home directory reference:", {
              linkType: homeRef.link.type,
              hasPublicKey: !!homeRef.link.publicKey,
              timestamp: homeRef.ts_seconds,
            });

            dir.dirs.set("home", homeRef);
            log("Added home to parent directory");
          } catch (error) {
            log("❌ Error creating home directory:", error.message);
            log("Error details:", error);
          }

          log("\n📂 TRANSACTION END");
          log("Modified directory:", {
            dirsCount: dir.dirs.size,
            dirNames: Array.from(dir.dirs.keys()),
          });

          return dir; // Always return to force update
        }
      );

      log("\nTransaction result:", result.type);
      if (result.error) {
        log("Transaction error:", result.error);
      }
    } catch (error) {
      log("❌ Transaction failed:", error.message);
      log("Error type:", error.constructor.name);
      log("Full error:", error);
    }

    // STEP 6: Check if directories were created
    log("\nSTEP 6: Checking directory creation...");

    // Wait for propagation
    log("Waiting 3 seconds for registry propagation...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      const items = [];
      for await (const item of s5.fs.list("")) {
        items.push(item);
      }
      log(`Root directory contains ${items.length} items:`, items);
    } catch (error) {
      log("❌ Error listing root:", error.message);
    }

    // STEP 7: Debug CBOR encoding/decoding
    log("\nSTEP 7: Testing CBOR encoding/decoding...");

    const testDir = {
      magic: "S5.pro",
      header: {},
      dirs: new Map([
        [
          "test",
          {
            link: {
              type: "mutable_registry_ed25519",
              publicKey: new Uint8Array(32).fill(0xaa),
            },
            ts_seconds: Math.floor(Date.now() / 1000),
          },
        ],
      ]),
      files: new Map(),
    };

    try {
      const encoded = DirV1Serialiser.serialise(testDir);
      log("CBOR encoded length:", encoded.length);
      log("CBOR hex:", Buffer.from(encoded).toString("hex"));

      const decoded = DirV1Serialiser.deserialise(encoded);
      log("CBOR decoded successfully:", {
        magic: decoded.magic,
        dirsCount: decoded.dirs.size,
        dirNames: Array.from(decoded.dirs.keys()),
      });
    } catch (error) {
      log("❌ CBOR test failed:", error.message);
    }

    // STEP 8: Check crypto operations
    log("\nSTEP 8: Testing crypto operations...");

    try {
      // Test key derivation
      const testKey = s5.fs.api.crypto.generateSecureRandomBytes(32);
      log("Generated test key:", testKey);

      // Test blake3 hash
      const testData = new TextEncoder().encode("test");
      const hash = await s5.fs.api.crypto.hashBlake3(testData);
      log("Blake3 hash of 'test':", hash);

      // Test key pair generation
      const kp = await s5.fs.api.crypto.newKeyPairEd25519(testKey);
      log("Generated keypair:", {
        publicKeyLength: kp.publicKey.length,
        secretKeyLength: kp.secretKey?.length || 0,
      });
    } catch (error) {
      log("❌ Crypto operation failed:", error.message);
      log("Error details:", error);
    }
  } catch (error) {
    log("\n💥 FATAL ERROR:", error.message);
    log("Error type:", error.constructor.name);
    log("Stack trace:", error.stack);

    // Additional error details
    if (error.cause) {
      log("Error cause:", error.cause);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log(
    "Debug test complete. Please analyze the output above to identify issues.\n"
  );
}

comprehensiveDebug();
