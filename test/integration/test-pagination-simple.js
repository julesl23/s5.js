// test-pagination-simple.js - Simple Real S5 Pagination Test
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

async function main() {
  const portalUrl = getPortalUrl();
  const initialPeers = getInitialPeers();

  console.log("🚀 Simple S5 Pagination Test\n");
  console.log(`Portal: ${portalUrl}`);
  console.log("Testing basic pagination features\n");

  try {
    // Initialize S5
    console.log("Initializing S5...");
    const s5 = await S5.create({ initialPeers });

    // Suppress verbose logging
    const originalLog = console.log;
    let logBuffer = [];
    console.log = (...args) => {
      const msg = args.join(' ');
      if (msg.includes('[registry]')) {
        logBuffer.push(msg);
      } else {
        originalLog(...args);
      }
    };

    const seedPhrase = generatePhrase(s5.crypto);
    await s5.recoverIdentityFromSeedPhrase(seedPhrase);

    try {
      await s5.registerOnNewPortal(portalUrl);
      originalLog("✅ Registered on portal");
    } catch (error) {
      if (!error.message.includes("already has an account")) throw error;
    }
    
    await s5.fs.ensureIdentityInitialized();
    originalLog("✅ Ready\n");
    
    // Re-enable logging
    console.log = originalLog;
    
    // Test directory
    const timestamp = Date.now();
    const testDir = `home/test-pagination-${timestamp}`;
    console.log(`Test directory: ${testDir}\n`);
    
    // Test 1: Create a few files
    console.log("📊 Test 1: Creating test files");
    console.log("=" + "=".repeat(40));
    
    const fileCount = 5;
    for (let i = 0; i < fileCount; i++) {
      await s5.fs.put(`${testDir}/file${i}.txt`, `Content ${i}`);
      console.log(`  Created file${i}.txt`);
    }
    console.log(`✅ Created ${fileCount} files\n`);
    
    // Test 2: List with limit
    console.log("📊 Test 2: List with limit=3");
    console.log("=" + "=".repeat(40));
    
    const items = [];
    for await (const item of s5.fs.list(testDir, { limit: 3 })) {
      items.push(item);
      console.log(`  ${item.name} - cursor: ${item.cursor ? 'yes' : 'no'}`);
    }
    console.log(`✅ Listed ${items.length} items with limit=3\n`);
    
    // Test 3: Resume from cursor
    if (items.length > 0 && items[0].cursor) {
      console.log("📊 Test 3: Resume from cursor");
      console.log("=" + "=".repeat(40));
      
      const cursor = items[items.length - 1].cursor;
      console.log(`Resuming from cursor of ${items[items.length - 1].name}...`);
      
      const resumedItems = [];
      for await (const item of s5.fs.list(testDir, { cursor, limit: 3 })) {
        resumedItems.push(item);
        console.log(`  ${item.name}`);
      }
      
      if (resumedItems.length > 0) {
        console.log(`✅ Resumed and got ${resumedItems.length} more items\n`);
      } else {
        console.log(`ℹ️  No more items after cursor\n`);
      }
    }
    
    // Test 4: List all without limit
    console.log("📊 Test 4: List all without limit");
    console.log("=" + "=".repeat(40));
    
    const allItems = [];
    for await (const item of s5.fs.list(testDir)) {
      allItems.push(item);
    }
    console.log(`✅ Total files in directory: ${allItems.length}\n`);
    
    console.log("=" + "=".repeat(40));
    console.log("✅ All tests completed successfully!");
    console.log("=" + "=".repeat(40));
    
    // Exit cleanly
    process.exit(0);
    
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
main().catch(console.error);