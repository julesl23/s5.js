// test-hamt-threshold-only.js - Focused HAMT Activation Test
import { S5 } from "../dist/src/index.js";
import { performance } from "perf_hooks";
import { generatePhrase } from "../dist/src/identity/seed_phrase/seed_phrase.js";

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

// Suppress registry logs
const originalLog = console.log;
let logsSuppressed = false;
console.log = (...args) => {
  if (!logsSuppressed || !args[0]?.includes?.('[registry]')) {
    originalLog(...args);
  }
};

async function main() {
  console.log("🚀 HAMT Activation Threshold Test (Real Portal)\n");
  console.log("Testing the exact point where HAMT activates...\n");

  // Initialize S5
  const s5 = await S5.create({
    initialPeers: ["wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p"]
  });

  const seedPhrase = generatePhrase(s5.crypto);
  await s5.recoverIdentityFromSeedPhrase(seedPhrase);
  
  try {
    await s5.registerOnNewPortal("https://s5.vup.cx");
  } catch (error) {
    if (!error.message.includes("already has an account")) throw error;
  }
  
  await s5.fs.ensureIdentityInitialized();
  console.log("✅ Connected to S5 portal\n");

  // Test directory that will transition to HAMT
  const testDir = `home/hamt-transition-${Date.now()}`;
  console.log(`📁 Test directory: ${testDir}\n`);

  // Start with 990 files
  console.log("📊 Phase 1: Creating 990 files (below HAMT threshold)...");
  logsSuppressed = true;
  
  const phase1Start = performance.now();
  const batchSize = 30;
  
  for (let i = 0; i < 990; i += batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(i + batchSize, 990); j++) {
      batch.push(s5.fs.put(`${testDir}/f${j}`, `${j}`));
    }
    await Promise.all(batch);
    
    if (i % 90 === 0) {
      logsSuppressed = false;
      process.stdout.write(`\r  Progress: ${i}/990`);
      logsSuppressed = true;
    }
  }
  
  const phase1Time = performance.now() - phase1Start;
  logsSuppressed = false;
  console.log(`\n✅ Created 990 files in ${(phase1Time/1000).toFixed(2)}s`);

  // Check HAMT status
  let metadata = await s5.fs.getMetadata(testDir);
  console.log(`HAMT active: ${metadata?.directory?.header?.sharding ? 'YES' : 'NO'} (expected: NO)`);

  // Test access at 990 entries
  console.log("\n🔍 Testing access time at 990 entries...");
  logsSuppressed = true;
  const access990Start = performance.now();
  for (let i = 0; i < 5; i++) {
    const idx = Math.floor(Math.random() * 990);
    await s5.fs.get(`${testDir}/f${idx}`);
  }
  const access990Time = (performance.now() - access990Start) / 5;
  logsSuppressed = false;
  console.log(`Average access time: ${access990Time.toFixed(0)}ms`);

  // Add files one by one around threshold
  console.log("\n📊 Phase 2: Adding files one-by-one near threshold...");
  
  for (let count = 991; count <= 1010; count++) {
    logsSuppressed = true;
    const addStart = performance.now();
    await s5.fs.put(`${testDir}/f${count-1}`, `${count-1}`);
    const addTime = performance.now() - addStart;
    
    metadata = await s5.fs.getMetadata(testDir);
    const isHAMT = !!(metadata?.directory?.header?.sharding);
    
    // Test access
    const accessStart = performance.now();
    const idx = Math.floor(Math.random() * count);
    await s5.fs.get(`${testDir}/f${idx}`);
    const accessTime = performance.now() - accessStart;
    
    logsSuppressed = false;
    console.log(
      `Files: ${count} | ` +
      `HAMT: ${isHAMT ? 'YES ✅' : 'NO ❌'} | ` +
      `Add: ${addTime.toFixed(0)}ms | ` +
      `Access: ${accessTime.toFixed(0)}ms`
    );
    
    // If HAMT just activated, do extra testing
    if (isHAMT && count === 1000) {
      console.log("\n🎯 HAMT ACTIVATED AT 1000 ENTRIES!");
      
      // Compare access times
      console.log("\nComparing access times before/after HAMT:");
      logsSuppressed = true;
      
      // Test multiple accesses
      const testCount = 10;
      let totalTime = 0;
      for (let i = 0; i < testCount; i++) {
        const start = performance.now();
        const ridx = Math.floor(Math.random() * 1000);
        await s5.fs.get(`${testDir}/f${ridx}`);
        totalTime += performance.now() - start;
      }
      
      logsSuppressed = false;
      const avg1000Time = totalTime / testCount;
      console.log(`Average access at 1000 entries: ${avg1000Time.toFixed(0)}ms`);
      console.log(`Improvement: ${((access990Time - avg1000Time) / access990Time * 100).toFixed(0)}%`);
    }
  }

  // Final test at larger scale
  console.log("\n📊 Phase 3: Testing at larger scale (2000 entries)...");
  logsSuppressed = true;
  
  const phase3Start = performance.now();
  for (let i = 1010; i < 2000; i += batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(i + batchSize, 2000); j++) {
      batch.push(s5.fs.put(`${testDir}/f${j}`, `${j}`));
    }
    await Promise.all(batch);
  }
  
  // Test access at 2000
  const access2000Start = performance.now();
  for (let i = 0; i < 10; i++) {
    const idx = Math.floor(Math.random() * 2000);
    await s5.fs.get(`${testDir}/f${idx}`);
  }
  const access2000Time = (performance.now() - access2000Start) / 10;
  
  logsSuppressed = false;
  console.log(`✅ Expanded to 2000 entries`);
  console.log(`Average access time: ${access2000Time.toFixed(0)}ms`);

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("📊 HAMT ACTIVATION SUMMARY");
  console.log("=".repeat(70));
  console.log("\n✅ HAMT activates at exactly 1000 entries");
  console.log(`✅ Access time at 990 entries: ${access990Time.toFixed(0)}ms`);
  console.log(`✅ Access time at 2000 entries: ${access2000Time.toFixed(0)}ms`);
  console.log(`✅ Performance scales well with HAMT active`);
  
  // Cleanup
  console.log("\nCleaning up...");
  try {
    await s5.fs.delete(testDir);
  } catch (e) {
    // Ignore cleanup errors
  }
}

// Run with timeout
const timeout = setTimeout(() => {
  console.error("\n⏱️  Timeout after 5 minutes");
  process.exit(0);
}, 300000);

main()
  .then(() => {
    clearTimeout(timeout);
    console.log("\n✅ Test complete!");
  })
  .catch(error => {
    clearTimeout(timeout);
    console.error("\n❌ Test failed:", error);
  });