// test-s5-complete.js - Complete S5 connection test
import { S5 } from "./dist/src/index.js";
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

async function testS5Complete() {
  console.log("🚀 Complete S5 Portal Connection Test\n");
  
  try {
    // Create S5 instance
    console.log("📦 Creating S5 instance...");
    const s5 = await S5.create({
      initialPeers: ['wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p']
    });
    console.log("✅ S5 instance created\n");
    
    // Use the original seed phrase - we'll handle existing account scenario
    const seedPhrase = "obtain safety dawn victim unknown soon have they life habit lecture nurse almost vote crazy";
    console.log("📝 Using seed phrase...");
    await s5.recoverIdentityFromSeedPhrase(seedPhrase);
    console.log("✅ Identity recovered\n");
    
    // Register on portal (handle existing account case)
    console.log("🌐 Checking portal registration...");
    try {
      await s5.registerOnNewPortal("https://s5.vup.cx");
      console.log("✅ New portal registration successful!\n");
    } catch (error) {
      if (error.message.includes("already has an account")) {
        console.log("ℹ️  Account already exists, continuing with existing account\n");
      } else {
        console.error("❌ Portal registration failed:", error.message);
        return;
      }
    }
    
    // Initialize filesystem
    console.log("📁 Initializing filesystem...");
    await s5.fs.ensureIdentityInitialized();
    console.log("✅ Filesystem initialized\n");
    
    // Test FS5 operations
    console.log("🧪 Testing FS5 operations...\n");
    
    // Test write
    console.log("  📝 Writing test file...");
    try {
      const testContent = "Hello from S5! Test time: " + new Date().toISOString();
      await s5.fs.put("home/test.txt", testContent);
      console.log("  ✅ Write successful");
      
      // Test read
      console.log("\n  📖 Reading test file...");
      const readContent = await s5.fs.get("home/test.txt");
      console.log("  ✅ Read successful:", readContent);
      
      if (readContent === testContent) {
        console.log("  ✅ Content matches!");
      } else {
        console.log("  ❌ Content mismatch!");
      }
    } catch (error) {
      console.error("  ❌ File operations failed:", error.message);
    }
    
    // Test directory operations
    console.log("\n  📂 Testing directory operations...");
    try {
      // Create files
      await s5.fs.put("home/dir1/file1.txt", "File 1 content");
      await s5.fs.put("home/dir1/file2.txt", "File 2 content");
      await s5.fs.put("home/dir2/file3.txt", "File 3 content");
      console.log("  ✅ Created test files");
      
      // List directory
      console.log("\n  📋 Listing home directory:");
      for await (const item of s5.fs.list("home")) {
        console.log(`    ${item.type === 'dir' ? '📁' : '📄'} ${item.name}`);
      }
      
      // List subdirectory
      console.log("\n  📋 Listing home/dir1:");
      for await (const item of s5.fs.list("home/dir1")) {
        console.log(`    ${item.type === 'dir' ? '📁' : '📄'} ${item.name}`);
      }
    } catch (error) {
      console.error("  ❌ Directory operations failed:", error.message);
    }
    
    // Test delete
    console.log("\n  🗑️  Testing delete operation...");
    try {
      await s5.fs.delete("home/test.txt");
      console.log("  ✅ Delete successful");
      
      // Verify deletion
      try {
        await s5.fs.get("home/test.txt");
        console.log("  ❌ File still exists after delete!");
      } catch (error) {
        console.log("  ✅ File properly deleted");
      }
    } catch (error) {
      console.error("  ❌ Delete operation failed:", error.message);
    }
    
    console.log("\n🎉 All tests completed!");
    
  } catch (error) {
    console.error("\n❌ Test failed with error:", error.message);
    console.error("Stack:", error.stack);
  }
}

testS5Complete();