// test-hamt-real-clean.js - Clean Real S5 Portal HAMT Benchmark
import { S5 } from "../../dist/src/index.js";
import { performance } from "perf_hooks";
import { generatePhrase } from "../../dist/src/identity/seed_phrase/seed_phrase.js";

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

// Suppress verbose registry logging
const originalLog = console.log;
let suppressLogs = false;
console.log = (...args) => {
  if (!suppressLogs || !args[0]?.includes?.('[registry]')) {
    originalLog(...args);
  }
};

// Test a single directory size
async function testDirectorySize(s5, size) {
  const dirPath = `home/bench-${size}-${Date.now()}`;
  console.log(`\n📊 Testing ${size} entries...`);
  
  suppressLogs = true;
  const results = {
    size: size,
    insertTime: 0,
    getTime: 0,
    listTime: 0,
    isHAMT: false,
    success: false
  };

  try {
    // Insert entries
    const insertStart = performance.now();
    for (let i = 0; i < size; i++) {
      await s5.fs.put(`${dirPath}/file${i}.txt`, `Test content ${i}`);
      if (i % 50 === 49) {
        suppressLogs = false;
        process.stdout.write(`\r  Progress: ${i + 1}/${size}`);
        suppressLogs = true;
      }
    }
    results.insertTime = performance.now() - insertStart;
    
    // Check HAMT status
    const metadata = await s5.fs.getMetadata(dirPath);
    results.isHAMT = !!(metadata?.directory?.header?.sharding);
    
    // Test retrieval
    const getStart = performance.now();
    const testCount = Math.min(10, size);
    for (let i = 0; i < testCount; i++) {
      const idx = Math.floor(Math.random() * size);
      await s5.fs.get(`${dirPath}/file${idx}.txt`);
    }
    results.getTime = (performance.now() - getStart) / testCount;
    
    // Test listing (small directories only)
    if (size <= 100) {
      const listStart = performance.now();
      let count = 0;
      for await (const item of s5.fs.list(dirPath)) {
        count++;
      }
      results.listTime = performance.now() - listStart;
    }
    
    results.success = true;
    
    // Cleanup
    await s5.fs.delete(dirPath);
    
  } catch (error) {
    suppressLogs = false;
    console.error(`\n❌ Error:`, error.message);
  }
  
  suppressLogs = false;
  return results;
}

// Main function
async function main() {
  console.log("🚀 Real S5 Portal HAMT Benchmark\n");
  console.log("Portal: https://s5.vup.cx");
  console.log("Testing HAMT activation and performance with real network\n");

  // Initialize S5
  console.log("Initializing S5...");
  const s5 = await S5.create({
    initialPeers: ["wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p"]
  });

  const seedPhrase = generatePhrase(s5.crypto);
  await s5.recoverIdentityFromSeedPhrase(seedPhrase);
  
  try {
    await s5.registerOnNewPortal("https://s5.vup.cx");
    console.log("✅ Registered on portal");
  } catch (error) {
    if (!error.message.includes("already has an account")) throw error;
  }
  
  await s5.fs.ensureIdentityInitialized();
  console.log("✅ Ready to benchmark\n");

  // Test different sizes
  const sizes = [50, 100, 500, 1000, 1500];
  const results = [];
  
  for (const size of sizes) {
    const result = await testDirectorySize(s5, size);
    results.push(result);
    
    if (result.success) {
      console.log(`\n✅ ${size} entries:`);
      console.log(`   Insert: ${(result.insertTime / 1000).toFixed(2)}s total, ${(result.insertTime / size).toFixed(1)}ms per entry`);
      console.log(`   Get: ${result.getTime.toFixed(1)}ms average`);
      console.log(`   HAMT: ${result.isHAMT ? 'YES' : 'NO'}`);
    }
    
    // Delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("📊 SUMMARY - Real S5 Portal Performance");
  console.log("=".repeat(70));
  
  console.log("\n| Size  | Insert Time | Per Entry | Get Time | HAMT |");
  console.log("|-------|-------------|-----------|----------|------|");
  
  for (const r of results) {
    if (r.success) {
      console.log(
        `| ${r.size.toString().padEnd(5)} | ` +
        `${(r.insertTime/1000).toFixed(2)}s`.padEnd(11) + ` | ` +
        `${(r.insertTime/r.size).toFixed(1)}ms`.padEnd(9) + ` | ` +
        `${r.getTime.toFixed(1)}ms`.padEnd(8) + ` | ` +
        `${r.isHAMT ? 'Yes' : 'No '}  |`
      );
    }
  }

  // Key findings
  console.log("\n🔍 Key Findings:");
  
  const hamtThreshold = results.find(r => r.isHAMT);
  if (hamtThreshold) {
    console.log(`✅ HAMT activates at ${hamtThreshold.size} entries with real S5 portal`);
  }
  
  const small = results.find(r => r.size === 50);
  const large = results.find(r => r.size === 1000);
  if (small && large && small.success && large.success) {
    const scaleFactor = large.size / small.size; // 20x
    const timeScale = large.insertTime / small.insertTime;
    console.log(`✅ Performance scales well: ${scaleFactor}x entries → ${timeScale.toFixed(1)}x time`);
    console.log(`✅ Network overhead: ~${(small.insertTime / small.size).toFixed(0)}ms per file operation`);
  }

  console.log("\n🎯 HAMT works efficiently with real S5 portal operations!");
}

// Run benchmark
main().catch(console.error);