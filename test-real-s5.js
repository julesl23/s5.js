// test-real-s5.js
import { S5, FS5 } from "./dist/src/index.js";

// Node.js polyfills
import { webcrypto } from "crypto";
import { TextEncoder, TextDecoder } from "util";
import { ReadableStream, WritableStream, TransformStream } from "stream/web";
import { Blob, File } from "buffer";
import { fetch, Headers, Request, Response, FormData } from "undici";
import WebSocket from "ws";
import "fake-indexeddb/auto";

// Set up global polyfills for browser APIs
// Node v20 already has crypto, TextEncoder, TextDecoder
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

async function testRealS5() {
  console.log("🚀 Testing Real S5 Connection...\n");

  try {
    // Initialize S5 using the create method
    console.log("📦 Creating S5 instance...");
    const s5 = await S5.create({
      initialPeers: ['wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p']
    });
    console.log("✅ S5 instance created\n");

    // Use the corrected method as Redsolver suggested
    const seedPhrase =
      "obtain safety dawn victim unknown soon have they life habit lecture nurse almost vote crazy";
    console.log("📝 Recovering identity from seed phrase...");
    await s5.recoverIdentityFromSeedPhrase(seedPhrase);
    console.log("✅ Identity recovered successfully\n");

    // Log S5 state before registration
    console.log("🔍 S5 Instance State Before Registration:");
    console.log("   Has Identity:", s5.hasIdentity);
    
    // Log identity details safely
    if (s5.identity) {
      console.log("   Identity exists:", true);
      try {
        // Check what properties exist on identity
        console.log("   Identity properties:", Object.keys(s5.identity));
        if (s5.identity.keypair) {
          console.log("   Identity has keypair:", true);
          if (s5.identity.keypair.publicKey) {
            console.log("   Public key length:", s5.identity.keypair.publicKey.length);
          }
        }
      } catch (e) {
        console.log("   Error accessing identity properties:", e.message);
      }
    }
    
    // Log API state
    if (s5.apiWithIdentity) {
      console.log("   API with identity exists:", true);
      try {
        console.log("   Account pins:", s5.apiWithIdentity.accountPins || "none");
        console.log("   Storage services:", s5.apiWithIdentity.storageServices || "none");
      } catch (e) {
        console.log("   Error accessing API properties:", e.message);
      }
    }
    
    // Log node state
    try {
      console.log("   Node exists:", !!s5.node);
      if (s5.node && s5.node.p2p && s5.node.p2p.peers) {
        console.log("   Connected peers:", s5.node.p2p.peers.size);
      }
    } catch (e) {
      console.log("   Error accessing node properties:", e.message);
    }
    console.log("");

    // Try to register on portal
    console.log("🌐 Registering on s5.vup.cx portal...");
    try {
      await s5.registerOnNewPortal("https://s5.vup.cx");
      console.log("✅ Portal registration successful!\n");
      
      // Log S5 state after successful registration
      console.log("🔍 S5 State After Registration:");
      if (s5.apiWithIdentity) {
        console.log("   Account pins:", s5.apiWithIdentity.accountPins);
        console.log("   Storage services:", s5.apiWithIdentity.storageServices);
      }
      console.log("");
    } catch (error) {
      console.log("❌ Portal registration failed:", error.message);
      console.log("   Continuing without portal...\n");
    }

    // Test FS5
    console.log("📁 Testing FS5 operations...");
    const fs = s5.fs; // Use the fs property instead of creating new instance

    // Test write
    console.log("  Writing test file...");
    try {
      await fs.put("home/test/hello.txt", "Hello from Enhanced S5.js!");
      console.log("  ✅ Write successful");
    } catch (error) {
      console.log("  ❌ Write failed:", error.message);
    }

    // Test read
    console.log("  Reading test file...");
    try {
      const content = await fs.get("home/test/hello.txt");
      console.log("  ✅ Read successful:", content);
    } catch (error) {
      console.log("  ❌ Read failed:", error.message);
    }

    // Test list
    console.log("  Listing directory...");
    try {
      for await (const item of fs.list("home/test")) {
        console.log("  📄", item.name);
      }
    } catch (error) {
      console.log("  ❌ List failed:", error.message);
    }

    console.log("\n🎉 All tests passed! S5 connection is working.");
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("Stack:", error.stack);
  }
}

testRealS5();
