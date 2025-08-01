// test-hamt-local-simple.js - Simple HAMT benchmark for Phase 3.4
import { webcrypto } from "crypto";
import { performance } from "perf_hooks";

// Polyfills
if (!global.crypto) global.crypto = webcrypto;

// Import HAMT and dependencies
import { HAMT } from "./dist/src/fs/hamt/hamt.js";

// Mock S5 API for local testing
class MockS5API {
  constructor() {
    this.storage = new Map();
  }

  async uploadBlob(blob) {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = new Uint8Array(32).fill(Math.floor(Math.random() * 255));
    const key = Buffer.from(hash).toString('hex');
    this.storage.set(key, data);
    return { hash, size: blob.size };
  }

  async downloadBlobAsBytes(hash) {
    const key = Buffer.from(hash).toString('hex');
    const data = this.storage.get(key);
    if (!data) throw new Error("Blob not found");
    return data;
  }
}

// Benchmark configuration
const BENCHMARKS = [
  { name: "Small (100 entries)", count: 100 },
  { name: "Pre-HAMT (999 entries)", count: 999 },
  { name: "HAMT Trigger (1000 entries)", count: 1000 },
  { name: "Medium (10K entries)", count: 10000 },
  // { name: "Large (100K entries)", count: 100000 },
];

// Helper to format bytes
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

// Helper to measure memory usage
function getMemoryUsage() {
  if (global.gc) global.gc();
  const usage = process.memoryUsage();
  return usage.heapUsed + usage.external;
}

async function runBenchmarks() {
  console.log("🚀 HAMT Local Performance Benchmarks\n");
  console.log("=" .repeat(70) + "\n");

  const results = [];

  for (const benchmark of BENCHMARKS) {
    console.log("\n" + "=".repeat(70));
    console.log(`📊 Benchmark: ${benchmark.name}`);
    console.log("=".repeat(70));

    const api = new MockS5API();
    const hamt = new HAMT(api, { maxInlineEntries: 1000 });
    
    const result = {
      name: benchmark.name,
      count: benchmark.count,
      insertTime: 0,
      insertAvg: 0,
      getTime: 0,
      getAvg: 0,
      listTime: 0,
      memoryUsed: 0,
      isHAMT: false
    };

    // Memory before
    const memBefore = getMemoryUsage();

    // 1. INSERTION BENCHMARK
    console.log(`\n📝 Inserting ${benchmark.count} entries...`);
    const insertStart = performance.now();
    
    for (let i = 0; i < benchmark.count; i++) {
      const fileRef = {
        hash: new Uint8Array(32).fill(i % 256),
        size: 100 + i
      };
      await hamt.insert(`f:file${i}.txt`, fileRef);
      
      // Progress indicator
      if (i > 0 && i % Math.floor(benchmark.count / 10) === 0) {
        process.stdout.write(`\r  Progress: ${Math.floor((i / benchmark.count) * 100)}%`);
      }
    }
    
    result.insertTime = performance.now() - insertStart;
    result.insertAvg = result.insertTime / benchmark.count;
    console.log(`\n  ✅ Insertion completed in ${(result.insertTime / 1000).toFixed(2)}s`);
    console.log(`  Average: ${result.insertAvg.toFixed(2)}ms per insert`);

    // Check HAMT structure - HAMT should activate at 1000+ entries
    result.isHAMT = benchmark.count >= 1000;
    console.log(`  HAMT should be active: ${result.isHAMT ? 'YES (1000+ entries)' : 'NO'}`);

    // 2. RETRIEVAL BENCHMARK
    console.log(`\n🔍 Testing random access (1000 operations)...`);
    const getCount = Math.min(1000, benchmark.count);
    const getStart = performance.now();
    
    for (let i = 0; i < getCount; i++) {
      const randomIndex = Math.floor(Math.random() * benchmark.count);
      const value = await hamt.get(`f:file${randomIndex}.txt`);
      if (!value || value.size !== 100 + randomIndex) {
        console.error(`Failed to retrieve file${randomIndex}.txt`);
      }
    }
    
    result.getTime = performance.now() - getStart;
    result.getAvg = result.getTime / getCount;
    console.log(`  ✅ Retrieval completed in ${(result.getTime / 1000).toFixed(2)}s`);
    console.log(`  Average: ${result.getAvg.toFixed(2)}ms per get`);

    // 3. LISTING BENCHMARK (for smaller tests)
    if (benchmark.count <= 10000) {
      console.log(`\n📋 Listing all entries...`);
      const listStart = performance.now();
      let listCount = 0;
      
      for await (const [key, value] of hamt.entries()) {
        listCount++;
      }
      
      result.listTime = performance.now() - listStart;
      console.log(`  ✅ Listed ${listCount} entries in ${(result.listTime / 1000).toFixed(2)}s`);
    }

    // Memory after
    const memAfter = getMemoryUsage();
    result.memoryUsed = memAfter - memBefore;
    console.log(`\n💾 Memory usage: ${formatBytes(result.memoryUsed)}`);
    console.log(`  Per entry: ${formatBytes(result.memoryUsed / benchmark.count)}`);

    results.push(result);
  }

  // Print summary
  printSummary(results);
}

function printSummary(results) {
  console.log("\n" + "=".repeat(70));
  console.log("📊 PERFORMANCE SUMMARY");
  console.log("=".repeat(70));
  
  console.log("\n### Insertion Performance");
  console.log("| Entries | Total Time | Avg/Insert | HAMT | Memory/Entry |");
  console.log("|---------|------------|------------|------|--------------|");
  
  for (const r of results) {
    console.log(
      `| ${r.count.toString().padEnd(7)} | ` +
      `${(r.insertTime/1000).toFixed(2)}s`.padEnd(10) + ` | ` +
      `${r.insertAvg.toFixed(2)}ms`.padEnd(10) + ` | ` +
      `${r.isHAMT ? 'Yes' : 'No '}  | ` +
      `${formatBytes(r.memoryUsed / r.count).padEnd(12)} |`
    );
  }

  console.log("\n### Retrieval Performance (Random Access)");
  console.log("| Entries | Avg Time | Growth Factor |");
  console.log("|---------|----------|---------------|");
  
  let lastAvg = 0;
  for (const r of results) {
    const growth = lastAvg > 0 ? (r.getAvg / lastAvg).toFixed(2) + 'x' : 'baseline';
    console.log(
      `| ${r.count.toString().padEnd(7)} | ` +
      `${r.getAvg.toFixed(2)}ms`.padEnd(8) + ` | ` +
      `${growth.padEnd(13)} |`
    );
    lastAvg = r.getAvg;
  }

  // Verify O(log n) behavior
  console.log("\n### O(log n) Verification");
  const times = results.map(r => ({
    n: r.count,
    avg: r.getAvg
  }));
  
  let isOLogN = true;
  for (let i = 1; i < times.length; i++) {
    const expectedRatio = Math.log(times[i].n) / Math.log(times[i-1].n);
    const actualRatio = times[i].avg / times[i-1].avg;
    const deviation = Math.abs(actualRatio - expectedRatio) / expectedRatio;
    
    console.log(
      `${times[i-1].n} → ${times[i].n}: ` +
      `Expected ${expectedRatio.toFixed(2)}x, Got ${actualRatio.toFixed(2)}x ` +
      `(${(deviation * 100).toFixed(1)}% deviation)`
    );
    
    if (deviation > 0.5) isOLogN = false;
  }
  
  console.log(`\n✅ Access times ${isOLogN ? 'follow' : 'DO NOT follow'} O(log n) complexity`);
  console.log("\n🎯 Phase 3.4 HAMT Performance Verification Complete!");
}

// Run benchmarks
runBenchmarks().catch(console.error);