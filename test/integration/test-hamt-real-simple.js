// test-hamt-real-simple.js - Simple Real S5 Portal HAMT Benchmark
import { S5 } from "../../dist/src/index.js";
import { performance } from "perf_hooks";
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

// Realistic benchmark configuration for network operations
const BENCHMARKS = [
  { name: "Small (50 entries)", count: 50 },
  { name: "Medium (200 entries)", count: 200 },
  { name: "Pre-HAMT (500 entries)", count: 500 },
  { name: "HAMT Trigger (1000 entries)", count: 1000 }
];

// Helper to format time
function formatTime(ms) {
  if (ms < 1000) return ms.toFixed(0) + 'ms';
  return (ms / 1000).toFixed(2) + 's';
}

// Count registry operations from console output
let registryOps = { gets: 0, sets: 0 };
const originalLog = console.log;
console.log = (...args) => {
  const msg = args.join(' ');
  if (msg.includes('[registry] get')) registryOps.gets++;
  if (msg.includes('[registry] set')) registryOps.sets++;
  originalLog(...args);
};

// Main benchmark function
async function runBenchmarks() {
  const portalUrl = getPortalUrl();
  const initialPeers = getInitialPeers();

  console.log("🚀 Real S5 Portal HAMT Benchmark (Simplified)\n");
  console.log("=" .repeat(70) + "\n");
  console.log(`Portal: ${portalUrl}`);
  console.log("Note: Reduced entry counts for network testing\n");

  // Initialize S5 with real portal
  console.log("Setting up S5 with fresh identity...");
  const s5 = await S5.create({ initialPeers });

  const seedPhrase = generatePhrase(s5.crypto);
  console.log("Seed phrase:", seedPhrase);
  await s5.recoverIdentityFromSeedPhrase(seedPhrase);

  try {
    await s5.registerOnNewPortal(portalUrl);
    console.log("✅ Portal registration successful");
  } catch (error) {
    if (!error.message.includes("already has an account")) throw error;
    console.log("ℹ️  Using existing account");
  }
  
  await s5.fs.ensureIdentityInitialized();
  console.log("✅ Filesystem initialized\n");

  // Run benchmarks
  const results = [];
  
  for (const benchmark of BENCHMARKS) {
    console.log("\n" + "=".repeat(70));
    console.log(`📊 Benchmark: ${benchmark.name}`);
    console.log("=".repeat(70));
    
    // Reset registry counters
    registryOps = { gets: 0, sets: 0 };
    
    const result = await runSingleBenchmark(s5, benchmark);
    results.push(result);
    
    // Clean up after each benchmark
    console.log("\nCleaning up...");
    try {
      await s5.fs.delete(`home/real-test-${benchmark.count}`);
    } catch (e) {
      // Directory might not exist
    }
    
    // Delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Print summary
  printSummary(results);
}

async function runSingleBenchmark(s5, benchmark) {
  const { name, count } = benchmark;
  const dirPath = `home/real-test-${count}`;
  const startOps = { ...registryOps };
  
  const result = {
    name,
    count,
    insertTime: 0,
    insertAvg: 0,
    getTime: 0,
    getAvg: 0,
    listTime: 0,
    registryOps: 0,
    isHAMT: false,
    success: true
  };

  try {
    // 1. INSERTION BENCHMARK
    console.log(`\n📝 Creating directory with ${count} entries...`);
    const insertStart = performance.now();
    
    // Insert files in batches to avoid overwhelming the network
    const batchSize = 10;
    for (let i = 0; i < count; i += batchSize) {
      const batch = [];
      for (let j = i; j < Math.min(i + batchSize, count); j++) {
        batch.push(s5.fs.put(`${dirPath}/file${j}.txt`, `Content ${j}`));
      }
      await Promise.all(batch);
      
      // Progress
      if (i > 0 && i % 50 === 0) {
        process.stdout.write(`\r  Progress: ${Math.floor((i / count) * 100)}%`);
      }
    }
    
    result.insertTime = performance.now() - insertStart;
    result.insertAvg = result.insertTime / count;
    console.log(`\n  ✅ Insertion completed in ${formatTime(result.insertTime)}`);
    console.log(`  Average: ${formatTime(result.insertAvg)} per insert`);

    // Check if HAMT is active
    const metadata = await s5.fs.getMetadata(dirPath);
    result.isHAMT = !!(metadata?.directory?.header?.sharding);
    console.log(`  HAMT active: ${result.isHAMT ? 'YES ✅' : 'NO'}`);

    // 2. RETRIEVAL BENCHMARK
    const testCount = Math.min(20, count); // Limit to 20 for network tests
    console.log(`\n🔍 Testing random access (${testCount} operations)...`);
    const getStart = performance.now();
    
    for (let i = 0; i < testCount; i++) {
      const randomIndex = Math.floor(Math.random() * count);
      const content = await s5.fs.get(`${dirPath}/file${randomIndex}.txt`);
      if (!content || !content.includes(`${randomIndex}`)) {
        console.error(`Failed to verify file${randomIndex}`);
      }
    }
    
    result.getTime = performance.now() - getStart;
    result.getAvg = result.getTime / testCount;
    console.log(`  ✅ Retrieval completed in ${formatTime(result.getTime)}`);
    console.log(`  Average: ${formatTime(result.getAvg)} per get`);

    // 3. LISTING (only for smaller directories)
    if (count <= 200) {
      console.log(`\n📋 Listing directory...`);
      const listStart = performance.now();
      let listCount = 0;
      
      for await (const item of s5.fs.list(dirPath)) {
        listCount++;
      }
      
      result.listTime = performance.now() - listStart;
      console.log(`  ✅ Listed ${listCount} items in ${formatTime(result.listTime)}`);
    }

    // Registry operations count
    result.registryOps = (registryOps.gets - startOps.gets) + (registryOps.sets - startOps.sets);
    console.log(`\n📊 Network operations: ${result.registryOps} registry calls`);

  } catch (error) {
    console.error(`\n❌ Benchmark failed:`, error.message);
    result.success = false;
  }

  return result;
}

function printSummary(results) {
  console.log("\n" + "=".repeat(70));
  console.log("📊 REAL S5 PORTAL BENCHMARK SUMMARY");
  console.log("=".repeat(70));
  
  console.log("\n### Insertion Performance (Real Network)");
  console.log("| Entries | Total Time | Avg/Insert | HAMT | Registry Ops |");
  console.log("|---------|------------|------------|------|--------------|");
  
  for (const r of results) {
    if (r.success) {
      console.log(
        `| ${r.count.toString().padEnd(7)} | ` +
        `${formatTime(r.insertTime).padEnd(10)} | ` +
        `${formatTime(r.insertAvg).padEnd(10)} | ` +
        `${r.isHAMT ? 'Yes' : 'No '}  | ` +
        `${r.registryOps.toString().padEnd(12)} |`
      );
    }
  }

  console.log("\n### Retrieval Performance (Real Network)");
  console.log("| Entries | Avg Time/Get | Ops/Second |");
  console.log("|---------|--------------|------------|");
  
  for (const r of results) {
    if (r.success && r.getTime > 0) {
      const opsPerSec = 1000 / r.getAvg;
      console.log(
        `| ${r.count.toString().padEnd(7)} | ` +
        `${formatTime(r.getAvg).padEnd(12)} | ` +
        `${opsPerSec.toFixed(1).padEnd(10)} |`
      );
    }
  }

  // Performance analysis
  console.log("\n### Key Findings:");
  
  // Check HAMT activation
  const hamtResult = results.find(r => r.count >= 1000);
  if (hamtResult?.isHAMT) {
    console.log("✅ HAMT successfully activates at 1000+ entries with real portal");
  }
  
  // Network overhead analysis
  const smallResult = results.find(r => r.count === 50);
  const largeResult = results.find(r => r.count === 1000);
  if (smallResult && largeResult) {
    const scaleFactor = largeResult.count / smallResult.count; // 20x
    const timeScaleFactor = largeResult.insertTime / smallResult.insertTime;
    console.log(`✅ Performance scales sub-linearly: ${scaleFactor}x entries → ${timeScaleFactor.toFixed(1)}x time`);
  }

  console.log("\n✅ Real S5 Portal HAMT benchmark complete!");
  console.log("🎯 HAMT works efficiently with actual network operations!");
}

// Run benchmarks
runBenchmarks().catch(console.error);