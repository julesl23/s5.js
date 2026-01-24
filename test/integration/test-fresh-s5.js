// test-fresh-s5.js - Test with fresh identity to avoid old key issues
import { S5 } from "../../dist/src/index.js";
import { generatePhrase } from "../../dist/src/identity/seed_phrase/seed_phrase.js";
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

async function testFreshS5() {
  console.log("🚀 Testing Enhanced S5.js with Fresh Identity\n");
  console.log("═".repeat(60) + "\n");

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Test 1: Create S5 instance
    console.log("Test 1: Creating S5 instance...");
    const initialPeers = getInitialPeers();
    console.log(`   Using peers: ${initialPeers[0]}...`);
    const s5 = await S5.create({ initialPeers });
    console.log("✅ S5 instance created");
    testsPassed++;
    console.log();

    // Test 2: Generate NEW seed phrase
    console.log("Test 2: Generating fresh identity...");
    const freshSeedPhrase = generatePhrase(s5.api.crypto);
    console.log("📝 New seed phrase generated (save this for future tests):");
    console.log(`   "${freshSeedPhrase}"`);
    await s5.recoverIdentityFromSeedPhrase(freshSeedPhrase);
    console.log("✅ Fresh identity created");
    testsPassed++;
    console.log();

    // Test 3: Register on portal with fresh account
    const portalUrl = getPortalUrl();
    console.log(`Test 3: Registering fresh account on ${portalUrl}...`);
    try {
      await s5.registerOnNewPortal(portalUrl);
      console.log("✅ Fresh portal registration successful");
      testsPassed++;
    } catch (error) {
      console.log("❌ Portal registration failed:", error.message);
      testsFailed++;
    }
    console.log();

    // Test 4: Initialize filesystem
    console.log("Test 4: Initializing filesystem...");
    try {
      await s5.fs.ensureIdentityInitialized();
      console.log("✅ Filesystem initialized");
      testsPassed++;
      
      // Wait for registry propagation
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.log("❌ Filesystem initialization failed:", error.message);
      testsFailed++;
    }
    console.log();

    // Test 5: List root directory
    console.log("Test 5: Listing root directory...");
    try {
      const items = [];
      for await (const item of s5.fs.list("")) {
        items.push(item);
      }
      console.log(`✅ Root contains ${items.length} items:`);
      items.forEach(item => {
        console.log(`   - ${item.type}: ${item.name}`);
      });
      
      if (items.length >= 2) {
        testsPassed++;
      } else {
        console.log("❌ Expected at least 2 directories (home, archive)");
        testsFailed++;
      }
    } catch (error) {
      console.log("❌ List root failed:", error.message);
      testsFailed++;
    }
    console.log();

    // Test 6: Write file
    console.log("Test 6: Writing test file...");
    try {
      const content = "Hello from fresh Enhanced S5.js! " + new Date().toISOString();
      await s5.fs.put("home/test.txt", content);
      console.log("✅ File written successfully");
      testsPassed++;
    } catch (error) {
      console.log("❌ Write failed:", error.message);
      testsFailed++;
    }
    console.log();

    // Test 7: Read file
    console.log("Test 7: Reading test file...");
    try {
      const content = await s5.fs.get("home/test.txt");
      console.log("✅ File read successfully");
      console.log(`   Content: "${content}"`);
      testsPassed++;
    } catch (error) {
      console.log("❌ Read failed:", error.message);
      testsFailed++;
    }
    console.log();

    // Test 8: Create nested directory structure
    console.log("Test 8: Creating nested directories...");
    try {
      await s5.fs.put("home/projects/enhanced-s5/README.md", "# Enhanced S5.js\n\nWorking with real portal!");
      await s5.fs.put("home/projects/enhanced-s5/data.json", { status: "working", timestamp: Date.now() });
      console.log("✅ Nested directories created");
      testsPassed++;
    } catch (error) {
      console.log("❌ Nested directory creation failed:", error.message);
      testsFailed++;
    }
    console.log();

    // Test 9: List nested directory
    console.log("Test 9: Listing nested directory...");
    try {
      const items = [];
      for await (const item of s5.fs.list("home/projects/enhanced-s5")) {
        items.push(item);
      }
      console.log(`✅ Found ${items.length} items in nested directory:`);
      items.forEach(item => {
        console.log(`   - ${item.type}: ${item.name}`);
      });
      testsPassed++;
    } catch (error) {
      console.log("❌ List nested failed:", error.message);
      testsFailed++;
    }
    console.log();

    // Summary
    console.log("═".repeat(60));
    console.log("📊 Test Summary:");
    console.log(`  ✅ Passed: ${testsPassed}`);
    console.log(`  ❌ Failed: ${testsFailed}`);
    console.log(`  📈 Success Rate: ${(testsPassed / (testsPassed + testsFailed) * 100).toFixed(1)}%`);
    console.log();

    if (testsFailed === 0) {
      console.log("🎉 All tests passed! Enhanced S5.js is working with fresh identity!");
      console.log("\n💡 Save the seed phrase above to reuse this identity in future tests.");
    } else {
      console.log("⚠️  Some tests failed. The deterministic key system may need adjustment.");
    }

  } catch (error) {
    console.error("💥 Fatal error:", error.message);
    console.error("Stack:", error.stack);
  }
}

testFreshS5();