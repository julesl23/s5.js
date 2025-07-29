// test-s5-full-integration.js
import { S5 } from "./dist/src/index.js";

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

async function runFullIntegrationTest() {
  console.log("🚀 Enhanced S5.js Full Integration Test with Real Portal\n");
  console.log("═".repeat(60) + "\n");

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Test 1: S5 Instance Creation
    console.log("Test 1: Creating S5 instance...");
    const s5 = await S5.create({
      initialPeers: [
        "wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p",
      ],
    });
    console.log("✅ S5 instance created successfully");
    testsPassed++;
    console.log();

    // Test 2: Identity Recovery
    console.log("Test 2: Recovering identity from seed phrase...");
    const seedPhrase =
      "obtain safety dawn victim unknown soon have they life habit lecture nurse almost vote crazy";
    await s5.recoverIdentityFromSeedPhrase(seedPhrase);
    console.log("✅ Identity recovered successfully");
    testsPassed++;
    console.log();

    // Test 3: Portal Registration
    console.log("Test 3: Registering on s5.vup.cx portal...");
    try {
      await s5.registerOnNewPortal("https://s5.vup.cx");
      console.log("✅ Portal registration successful");
      testsPassed++;
    } catch (error) {
      if (error.message.includes("already has an account")) {
        console.log("ℹ️  Account already exists, continuing with existing account");
        testsPassed++;
      } else {
        console.log("❌ Portal registration failed:", error.message);
        testsFailed++;
      }
    }
    console.log();

    // Test 4: FS5 Write Operation (with correct path)
    console.log("Test 4: Writing file to FS5...");
    const testContent =
      "Hello from Enhanced S5.js! Time: " + new Date().toISOString();
    try {
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
      if (JSON.stringify(retrieved) === JSON.stringify(jsonData)) {
        console.log("✅ JSON data stored and retrieved successfully");
        testsPassed++;
      } else {
        console.log("❌ JSON data mismatch");
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
