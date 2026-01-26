// test-s5-full-integration.js
import { S5 } from "../../dist/src/index.js";
import { getPortalUrl, getInitialPeers } from "../test-config.js";

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

// Deep equality check for objects
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  
  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    
    return true;
  }
  
  return false;
}

async function runFullIntegrationTest() {
  console.log("🚀 Enhanced S5.js Full Integration Test with Real Portal\n");
  console.log("═".repeat(60) + "\n");

  let testsPassed = 0;
  let testsFailed = 0;

  const portalUrl = getPortalUrl();
  const initialPeers = getInitialPeers();

  try {
    // Test 1: S5 Instance Creation
    console.log("Test 1: Creating S5 instance...");
    const s5 = await S5.create({ initialPeers });
    console.log("✅ S5 instance created successfully");
    testsPassed++;
    console.log();

    // Test 2: Identity Recovery
    console.log("Test 2: Recovering identity from seed phrase...");
    const seedPhrase =
      "physics observe friend coin name kick walk buck poor blood library spy affect care copy";
    await s5.recoverIdentityFromSeedPhrase(seedPhrase);
    console.log("✅ Identity recovered successfully");
    testsPassed++;
    console.log();

    // Test 3: Portal Registration
    console.log(`Test 3: Registering on ${portalUrl} portal...`);
    try {
      await s5.registerOnNewPortal(portalUrl);
      console.log("✅ Portal registration successful");
      testsPassed++;
    } catch (error) {
      if (error.message.includes("already has an account")) {
        console.log(
          "ℹ️  Account already exists, continuing with existing account"
        );
        testsPassed++;
      } else {
        console.log("❌ Portal registration failed:", error.message);
        testsFailed++;
      }
    }
    console.log();

    // Test 3.5: Initialize filesystem directories (home, archive)
    console.log("Test 3.5: Initializing filesystem directories...");
    try {
      await s5.fs.ensureIdentityInitialized();
      console.log("✅ Filesystem directories initialized successfully");
      testsPassed++;

      // Small delay to ensure registry propagation
      console.log("   Waiting for registry propagation...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.log("❌ Filesystem initialization failed:", error.message);
      testsFailed++;
    }
    console.log();

    // Test 4: FS5 Write Operation (with correct path)
    console.log("Test 4: Writing file to FS5...");
    const testContent =
      "Hello from Enhanced S5.js! Time: " + new Date().toISOString();
    try {
      // First try to create the test directory explicitly
      try {
        await s5.fs.createDirectory("home", "test");
        console.log("   📁 Created test directory");
      } catch (error) {
        if (!error.message.includes("already contains")) {
          console.log("   ⚠️  Could not create test directory:", error.message);
        }
      }

      await s5.fs.put("home/test/hello.txt", testContent);
      console.log("✅ File written successfully");
      testsPassed++;
    } catch (error) {
      console.log("❌ Write failed:", error.message);
      testsFailed++;
    }
    console.log();

    // Test 5: FS5 Read Operation
    console.log("Test 5: Reading file from FS5...");
    try {
      const content = await s5.fs.get("home/test/hello.txt");
      if (content === testContent) {
        console.log("✅ File read successfully, content matches");
        testsPassed++;
      } else {
        console.log("❌ File read but content doesn't match");
        console.log("  Expected:", testContent);
        console.log("  Got:", content);
        testsFailed++;
      }
    } catch (error) {
      console.log("❌ Read failed:", error.message);
      testsFailed++;
    }
    console.log();

    // Test 6: FS5 Directory Listing
    console.log("Test 6: Listing directory contents...");
    try {
      const items = [];
      for await (const item of s5.fs.list("home/test")) {
        items.push(item);
      }
      console.log(
        `✅ Directory listed successfully, found ${items.length} items`
      );
      items.forEach((item) => {
        console.log(`  - ${item.type}: ${item.name}`);
      });
      testsPassed++;
    } catch (error) {
      console.log("❌ List failed:", error.message);
      testsFailed++;
    }
    console.log();

    // Test 7: Binary Data Upload
    console.log("Test 7: Uploading binary data...");
    try {
      const binaryData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello" in bytes
      await s5.fs.put("home/test/binary.bin", binaryData);
      console.log("✅ Binary data uploaded successfully");
      testsPassed++;
    } catch (error) {
      console.log("❌ Binary upload failed:", error.message);
      testsFailed++;
    }
    console.log();

    // Test 8: JSON/CBOR Data
    console.log("Test 8: Storing and retrieving JSON data...");
    try {
      const jsonData = {
        name: "Enhanced S5.js Test",
        timestamp: Date.now(),
        features: ["HAMT", "Sharding", "Path-based API"],
      };
      await s5.fs.put("home/test/data.json", jsonData);
      const retrieved = await s5.fs.get("home/test/data.json");
      // Use deep equality check instead of string comparison
      // CBOR serialization may change property order
      if (deepEqual(retrieved, jsonData)) {
        console.log("✅ JSON data stored and retrieved successfully");
        console.log("   (Property order may differ due to CBOR serialization)");
        testsPassed++;
      } else {
        console.log("❌ JSON data mismatch");
        console.log("   Original:", JSON.stringify(jsonData));
        console.log("   Retrieved:", JSON.stringify(retrieved));
        testsFailed++;
      }
    } catch (error) {
      console.log("❌ JSON test failed:", error.message);
      testsFailed++;
    }
    console.log();

    // Summary
    console.log("═".repeat(60));
    console.log("📊 Test Summary:");
    console.log(`  ✅ Passed: ${testsPassed}`);
    console.log(`  ❌ Failed: ${testsFailed}`);
    console.log(
      `  📈 Success Rate: ${(
        (testsPassed / (testsPassed + testsFailed)) *
        100
      ).toFixed(1)}%`
    );
    console.log();

    if (testsFailed === 0) {
      console.log(
        "🎉 All tests passed! Enhanced S5.js is working with real S5 portal!"
      );
    } else {
      console.log("⚠️  Some tests failed. Check the output above for details.");
    }
  } catch (error) {
    console.error("💥 Fatal error:", error.message);
    console.error("Stack:", error.stack);
  }
}

runFullIntegrationTest();
