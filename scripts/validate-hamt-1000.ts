// Quick validation script to demonstrate HAMT with 1000+ entries
import { FS5 } from "../src/fs/fs5.js";
import type { S5APIInterface } from "../src/api/s5.js";

// Mock S5 API
class MockS5API {
  private storage: Map<string, Uint8Array> = new Map();
  private registry: Map<string, any> = new Map();
  
  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = new Uint8Array(32);
    crypto.getRandomValues(hash);
    const key = Buffer.from(hash).toString('hex');
    this.storage.set(key, data);
    return { hash, size: blob.size };
  }

  async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
    const key = Buffer.from(hash).toString('hex');
    const data = this.storage.get(key);
    if (!data) throw new Error("Blob not found");
    return data;
  }

  async registryGet(publicKey: Uint8Array): Promise<any> {
    const key = Buffer.from(publicKey).toString('hex');
    return this.registry.get(key);
  }

  async registrySet(entry: any): Promise<void> {
    const key = Buffer.from(entry.pk).toString('hex');
    this.registry.set(key, entry);
  }
}

// Mock Identity
class MockIdentity {
  fsRootKey = new Uint8Array(32).fill(1);
}

async function validateHAMT() {
  console.log("🚀 HAMT Validation with 1000+ entries\n");
  
  const fs = new FS5(new MockS5API() as any, new MockIdentity() as any);
  
  console.log("1️⃣ Creating directory with 1200 files...");
  const startInsert = Date.now();
  
  for (let i = 0; i < 1200; i++) {
    await fs.put(`demo/large/file${i}.txt`, `This is file ${i}`);
    if (i % 100 === 99) {
      console.log(`   Inserted ${i + 1} files...`);
    }
  }
  
  console.log(`✅ Inserted 1200 files in ${Date.now() - startInsert}ms\n`);
  
  console.log("2️⃣ Verifying automatic sharding...");
  const dir = await (fs as any)._loadDirectory("demo/large");
  
  if (dir.header.sharding) {
    console.log("✅ Directory is sharded!");
    console.log(`   - Total entries: ${dir.header.sharding.root.totalEntries}`);
    console.log(`   - Tree depth: ${dir.header.sharding.root.depth}`);
    console.log(`   - HAMT CID: ${Buffer.from(dir.header.sharding.root.cid).toString('hex').slice(0, 16)}...`);
  } else {
    console.log("❌ Directory is not sharded - something went wrong!");
  }
  
  console.log("\n3️⃣ Testing random access performance...");
  const testIndices = [0, 100, 500, 999, 1199];
  
  for (const idx of testIndices) {
    const start = Date.now();
    const content = await fs.get(`demo/large/file${idx}.txt`);
    const time = Date.now() - start;
    console.log(`   file${idx}.txt: "${content}" (${time}ms)`);
  }
  
  console.log("\n4️⃣ Testing cursor-based pagination...");
  let count = 0;
  let cursor: string | undefined;
  
  for await (const item of fs.list("demo/large", { limit: 10 })) {
    if (count === 0) console.log("   First 10 items:");
    console.log(`   - ${item.name}`);
    cursor = item.cursor;
    count++;
  }
  
  console.log("\n   Resuming from cursor...");
  count = 0;
  for await (const item of fs.list("demo/large", { limit: 5, cursor })) {
    console.log(`   - ${item.name}`);
    count++;
  }
  
  console.log("\n✅ HAMT validation complete!");
}

// Run validation
validateHAMT().catch(console.error);