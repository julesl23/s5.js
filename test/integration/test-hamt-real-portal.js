// test-hamt-real-portal.js - Real S5 Portal HAMT Performance Benchmarks
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

// Benchmark configuration - realistic counts for network operations
const BENCHMARKS = [
  { name: "Small (100 entries)", count: 100 },
  { name: "Medium (500 entries)", count: 500 },
  { name: "HAMT Trigger (1000 entries)", count: 1000 },
  { name: "Large (2000 entries)", count: 2000 }
];

// Network operation counter
class NetworkStats {
  constructor() {
    this.registryGets = 0;
    this.registrySets = 0;
    this.blobUploads = 0;
    this.blobDownloads = 0;
    this.startTime = Date.now();
  }

  recordRegistryGet() { this.registryGets++; }
  recordRegistrySet() { this.registrySets++; }
  recordBlobUpload() { this.blobUploads++; }
  recordBlobDownload() { this.blobDownloads++; }

  getStats() {
    const duration = (Date.now() - this.startTime) / 1000;
    return {
      registryGets: this.registryGets,
      registrySets: this.registrySets,
      blobUploads: this.blobUploads,
      blobDownloads: this.blobDownloads,
      totalOps: this.registryGets + this.registrySets + this.blobUploads + this.blobDownloads,
      duration: duration,
      opsPerSecond: (this.registryGets + this.registrySets + this.blobUploads + this.blobDownloads) / duration
    };
  }
}

// Monkey-patch to count network operations
function instrumentS5(s5, stats) {
  // Check if we have access to the API
  if (!s5.api) {
    console.log('Note: s5.api not accessible, network stats disabled');
    return;
  }

  // Intercept registry operations through the API
  if (s5.api.registryGet && s5.api.registrySet) {
    const originalGet = s5.api.registryGet.bind(s5.api);
    const originalSet = s5.api.registrySet.bind(s5.api);
    
    s5.api.registryGet = async (...args) => {
      stats.recordRegistryGet();
      return originalGet(...args);
    };
    
    s5.api.registrySet = async (...args) => {
      stats.recordRegistrySet();
      return originalSet(...args);
    };
  } else {
    console.log('Note: Registry methods not found, registry stats disabled');
  }

  // Intercept blob operations
  if (s5.api.uploadBlob && s5.api.downloadBlobAsBytes) {
    const originalUpload = s5.api.uploadBlob.bind(s5.api);
    const originalDownload = s5.api.downloadBlobAsBytes.bind(s5.api);
    
    s5.api.uploadBlob = async (...args) => {
      stats.recordBlobUpload();
      return originalUpload(...args);
    };
    
    s5.api.downloadBlobAsBytes = async (...args) => {
      stats.recordBlobDownload();
      return originalDownload(...args);
    };
  } else {
    console.log('Note: Blob methods not found, blob stats disabled');
  }
}

// Helper to format time
function formatTime(ms) {
  if (ms < 1000) return ms.toFixed(0) + 'ms';
  return (ms / 1000).toFixed(2) + 's';
}

// Main benchmark function
async function runBenchmarks() {
  const portalUrl = getPortalUrl();
  const initialPeers = getInitialPeers();

  console.log("🚀 Real S5 Portal HAMT Performance Benchmarks\n");
  console.log("=" .repeat(70) + "\n");
  console.log(`Portal: ${portalUrl}`);
  console.log("Network: Real S5 P2P network\n");

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
    
    const result = await runSingleBenchmark(s5, benchmark);
    results.push(result);
    
    // Clean up after each benchmark
    console.log("\nCleaning up...");
    try {
      await s5.fs.delete(`home/hamt-real-${benchmark.count}`);
    } catch (e) {
      // Directory might not exist if test failed
    }
    
    // Small delay between benchmarks to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Print summary
  printSummary(results);
}

async function runSingleBenchmark(s5, benchmark) {
  const { name, count } = benchmark;
  const dirPath = `home/hamt-real-${count}`;
  const stats = new NetworkStats();
  
  // Instrument S5 to count operations
  instrumentS5(s5, stats);
  
  const result = {
    name,
    count,
    insertTime: 0,
    insertAvg: 0,
    getTime: 0,
    getAvg: 0,
    listTime: 0,
    listCount: 0,
    networkStats: null,
    errors: []
  };

  try {
    // 1. INSERTION BENCHMARK
    console.log(`\n📝 Creating directory with ${count} entries...`);
    const insertStart = performance.now();
    
    // Insert files with progress tracking
    let lastProgress = 0;
    for (let i = 0; i < count; i++) {
      try {
        await s5.fs.put(`${dirPath}/file${i}.txt`, `Content for file ${i} - timestamp: ${Date.now()}`);
      } catch (error) {
        console.error(`Failed to insert file${i}:`, error.message);
        result.errors.push(`Insert file${i}: ${error.message}`);
      }
      
      // Progress indicator
      const progress = Math.floor((i + 1) / count * 100);
      if (progress > lastProgress && progress % 10 === 0) {
        process.stdout.write(`\r  Progress: ${progress}% (${stats.getStats().totalOps} network ops)`);
        lastProgress = progress;
      }
    }
    
    result.insertTime = performance.now() - insertStart;
    result.insertAvg = result.insertTime / count;
    console.log(`\n  ✅ Insertion completed in ${formatTime(result.insertTime)}`);
    console.log(`  Average: ${formatTime(result.insertAvg)} per insert`);

    // Check directory metadata
    const metadata = await s5.fs.getMetadata(dirPath);
    const isHAMT = !!(metadata?.directory?.header?.sharding);
    console.log(`  HAMT active: ${isHAMT ? 'YES ✅' : 'NO'}`);

    // 2. RETRIEVAL BENCHMARK
    console.log(`\n🔍 Testing random access (${Math.min(100, count)} operations)...`);
    const getCount = Math.min(100, count);
    const getStart = performance.now();
    let successfulGets = 0;
    
    for (let i = 0; i < getCount; i++) {
      const randomIndex = Math.floor(Math.random() * count);
      try {
        const content = await s5.fs.get(`${dirPath}/file${randomIndex}.txt`);
        if (content && content.includes(`file ${randomIndex}`)) {
          successfulGets++;
        } else {
          result.errors.push(`Get file${randomIndex}: content mismatch`);
        }
      } catch (error) {
        result.errors.push(`Get file${randomIndex}: ${error.message}`);
      }
      
      if ((i + 1) % 10 === 0) {
        process.stdout.write(`\r  Progress: ${i + 1}/${getCount} gets`);
      }
    }
    
    result.getTime = performance.now() - getStart;
    result.getAvg = result.getTime / getCount;
    console.log(`\n  ✅ Retrieval completed: ${successfulGets}/${getCount} successful`);
    console.log(`  Average: ${formatTime(result.getAvg)} per get`);

    // 3. LISTING BENCHMARK (only for smaller directories)
    if (count <= 1000) {
      console.log(`\n📋 Listing directory contents...`);
      const listStart = performance.now();
      
      try {
        for await (const item of s5.fs.list(dirPath)) {
          result.listCount++;
          if (result.listCount === 1) {
            console.log(`  First item retrieved in ${formatTime(performance.now() - listStart)}`);
          }
        }
        
        result.listTime = performance.now() - listStart;
        console.log(`  ✅ Listed ${result.listCount} items in ${formatTime(result.listTime)}`);
      } catch (error) {
        console.error(`  ❌ List failed: ${error.message}`);
        result.errors.push(`List: ${error.message}`);
      }
    }

    // Network statistics
    result.networkStats = stats.getStats();
    console.log(`\n📊 Network Operations:`);
    console.log(`  Registry GETs: ${result.networkStats.registryGets}`);
    console.log(`  Registry SETs: ${result.networkStats.registrySets}`);
    console.log(`  Blob uploads: ${result.networkStats.blobUploads}`);
    console.log(`  Blob downloads: ${result.networkStats.blobDownloads}`);
    console.log(`  Total operations: ${result.networkStats.totalOps}`);
    console.log(`  Operations/second: ${result.networkStats.opsPerSecond.toFixed(1)}`);

  } catch (error) {
    console.error(`\n❌ Benchmark failed:`, error.message);
    result.errors.push(error.message);
  }

  return result;
}

function printSummary(results) {
  console.log("\n" + "=".repeat(70));
  console.log("📊 REAL S5 PORTAL PERFORMANCE SUMMARY");
  console.log("=".repeat(70));
  
  console.log("\n### Insertion Performance (with network)");
  console.log("| Entries | Total Time | Avg/Insert | Network Ops | Ops/Sec |");
  console.log("|---------|------------|------------|-------------|---------|");
  
  for (const r of results) {
    if (r.insertTime > 0 && r.networkStats) {
      console.log(
        `| ${r.count.toString().padEnd(7)} | ` +
        `${formatTime(r.insertTime).padEnd(10)} | ` +
        `${formatTime(r.insertAvg).padEnd(10)} | ` +
        `${r.networkStats.totalOps.toString().padEnd(11)} | ` +
        `${r.networkStats.opsPerSecond.toFixed(1).padEnd(7)} |`
      );
    }
  }

  console.log("\n### Retrieval Performance (with network)");
  console.log("| Entries | Avg Time/Get | Success Rate |");
  console.log("|---------|--------------|--------------|");
  
  for (const r of results) {
    if (r.getTime > 0) {
      const getCount = Math.min(100, r.count);
      const successRate = ((getCount - r.errors.filter(e => e.startsWith('Get')).length) / getCount * 100).toFixed(0);
      console.log(
        `| ${r.count.toString().padEnd(7)} | ` +
        `${formatTime(r.getAvg).padEnd(12)} | ` +
        `${successRate}%`.padEnd(12) + ` |`
      );
    }
  }

  console.log("\n### Network Operation Breakdown");
  console.log("| Entries | Registry GET | Registry SET | Blob Up | Blob Down |");
  console.log("|---------|--------------|--------------|---------|-----------|");
  
  for (const r of results) {
    if (r.networkStats) {
      console.log(
        `| ${r.count.toString().padEnd(7)} | ` +
        `${r.networkStats.registryGets.toString().padEnd(12)} | ` +
        `${r.networkStats.registrySets.toString().padEnd(12)} | ` +
        `${r.networkStats.blobUploads.toString().padEnd(7)} | ` +
        `${r.networkStats.blobDownloads.toString().padEnd(9)} |`
      );
    }
  }

  // Error summary
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  console.log(`\n### Error Summary`);
  console.log(`Total errors encountered: ${totalErrors}`);
  
  if (totalErrors > 0) {
    console.log("\nSample errors:");
    const sampleErrors = results.flatMap(r => r.errors).slice(0, 5);
    sampleErrors.forEach(err => console.log(`  - ${err}`));
  }

  console.log("\n✅ Real S5 Portal HAMT benchmarks complete!");
}

// Run benchmarks
runBenchmarks().catch(console.error);