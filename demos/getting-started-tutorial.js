// ====================================================================
// Enhanced S5.js - Comprehensive Getting Started Tutorial
// ====================================================================
//
// This tutorial demonstrates the complete workflow from setup to
// advanced features. Follow along to learn how to:
//
// 1. Set up S5 instance and connect to the network
// 2. Create or recover user identity with seed phrases
// 3. Register on S5 portal
// 4. Perform basic file operations (put, get, list, delete)
// 5. Upload images with automatic thumbnail generation
// 6. Navigate directories and handle pagination
// 7. Use encryption for private data
// 8. Leverage advanced CID API for content-addressed storage
//
// Prerequisites: Node.js 20+ or modern browser with ES modules
// ====================================================================

import { S5, generatePhrase } from "@julesl23/s5js";

// Node.js polyfills (not needed in browser)
import { webcrypto } from "crypto";
import { TextEncoder, TextDecoder } from "util";
import { ReadableStream, WritableStream, TransformStream } from "stream/web";
import { Blob, File } from "buffer";
import WebSocket from "ws";
import "fake-indexeddb/auto";

// Set up global polyfills for Node.js environment
if (typeof window === 'undefined') {
  if (!global.crypto) global.crypto = webcrypto;
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  if (!global.ReadableStream) global.ReadableStream = ReadableStream;
  if (!global.WritableStream) global.WritableStream = WritableStream;
  if (!global.TransformStream) global.TransformStream = TransformStream;
  if (!global.Blob) global.Blob = Blob;
  if (!global.File) global.File = File;
  if (!global.WebSocket) global.WebSocket = WebSocket;
}

// ====================================================================
// Tutorial Execution
// ====================================================================

async function runTutorial() {
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║   Enhanced S5.js - Comprehensive Getting Started Tutorial     ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  // ----------------------------------------------------------------
  // SECTION 1: S5 Instance Setup
  // ----------------------------------------------------------------
  console.log("📌 SECTION 1: S5 Instance Setup");
  console.log("─".repeat(60));
  console.log("Creating an S5 instance and connecting to the peer network...\n");

  const s5 = await S5.create({
    initialPeers: [
      "wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p",
      "wss://z2Das8aEF7oNoxkcrfvzerZ1iBPWfm6D7gy3hVE4ALGSpVB@node.sfive.net/s5/p2p"
    ]
  });

  console.log("✅ S5 instance created successfully");
  console.log("   The instance will automatically connect to default peers");
  console.log("   for decentralized file storage and retrieval.\n");

  // ----------------------------------------------------------------
  // SECTION 2: Identity Management
  // ----------------------------------------------------------------
  console.log("📌 SECTION 2: Identity Management (Seed Phrases)");
  console.log("─".repeat(60));
  console.log("Your identity controls access to your files on S5.\n");

  // Option A: Generate a NEW seed phrase (for first-time users)
  console.log("Generating a new 12-word seed phrase...");
  const seedPhrase = generatePhrase(s5.api.crypto);

  console.log("✅ Seed phrase generated:");
  console.log(`   "${seedPhrase}"`);
  console.log("\n   ⚠️  IMPORTANT: Save this seed phrase securely!");
  console.log("   You'll need it to recover your identity and access your files.\n");

  // Option B: Recover from existing seed phrase (for returning users)
  // Uncomment the line below and comment out the generation above:
  // const seedPhrase = "your twelve word seed phrase goes here in quotes";

  await s5.recoverIdentityFromSeedPhrase(seedPhrase);
  console.log("✅ Identity loaded from seed phrase");
  console.log("   All files uploaded will be associated with this identity.\n");

  // ----------------------------------------------------------------
  // SECTION 3: Portal Registration
  // ----------------------------------------------------------------
  console.log("📌 SECTION 3: Portal Registration");
  console.log("─".repeat(60));
  console.log("Registering on the S5 portal for enhanced features...\n");

  try {
    await s5.registerOnNewPortal("https://s5.vup.cx");
    console.log("✅ Successfully registered on s5.vup.cx");
    console.log("   This portal provides reliable access to the S5 network.\n");
  } catch (error) {
    console.log("⚠️  Portal registration failed:", error.message);
    console.log("   Continuing with limited functionality...\n");
  }

  // ----------------------------------------------------------------
  // SECTION 4: File System Initialization
  // ----------------------------------------------------------------
  console.log("📌 SECTION 4: File System Initialization");
  console.log("─".repeat(60));
  console.log("Setting up your personal file system structure...\n");

  await s5.fs.ensureIdentityInitialized();
  console.log("✅ File system initialized");
  console.log("   Created default directories: 'home' and 'archive'\n");

  // Wait for registry propagation (S5 network needs time to sync)
  console.log("⏳ Waiting for network synchronization (5 seconds)...");
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log("✅ Network synchronized\n");

  // ----------------------------------------------------------------
  // SECTION 5: Basic File Operations
  // ----------------------------------------------------------------
  console.log("📌 SECTION 5: Basic File Operations");
  console.log("─".repeat(60));
  console.log("Learning put(), get(), list(), and delete() operations...\n");

  // PUT: Upload a text file
  console.log("📤 PUT: Uploading a text file...");
  const textData = "Hello, S5! This is my first file on the decentralized network.";
  await s5.fs.put("home/documents/hello.txt", textData);
  console.log('✅ Uploaded: "home/documents/hello.txt"');
  console.log(`   Content: "${textData}"\n`);

  await new Promise(resolve => setTimeout(resolve, 5000));

  // GET: Retrieve the file
  console.log("📥 GET: Retrieving the file...");
  const retrievedData = await s5.fs.get("home/documents/hello.txt");
  console.log(`✅ Retrieved: "${retrievedData}"`);
  console.log(`   Match: ${retrievedData === textData ? "✓" : "✗"}\n`);

  // PUT: Upload JSON data (auto-encoded)
  console.log("📤 PUT: Uploading JSON data...");
  const userData = {
    name: "Enhanced S5.js User",
    joined: new Date().toISOString(),
    favorites: ["decentralization", "privacy", "web3"]
  };
  await s5.fs.put("home/profile.json", userData);
  console.log("✅ Uploaded: home/profile.json");
  console.log(`   Data: ${JSON.stringify(userData, null, 2)}\n`);

  await new Promise(resolve => setTimeout(resolve, 5000));

  // GET: Retrieve JSON (auto-decoded)
  console.log("📥 GET: Retrieving JSON data...");
  const retrievedProfile = await s5.fs.get("home/profile.json");
  console.log("✅ Retrieved and auto-decoded:");
  console.log(`   ${JSON.stringify(retrievedProfile, null, 2)}\n`);

  // LIST: Browse directory contents
  console.log("📋 LIST: Browsing home directory...");
  const homeItems = [];
  for await (const item of s5.fs.list("home")) {
    homeItems.push(item);
    console.log(`   - ${item.type.padEnd(9)} ${item.name.padEnd(20)} (${item.size || 0} bytes)`);
  }
  console.log(`✅ Found ${homeItems.length} items\n`);

  // GET METADATA: Check file info without downloading
  console.log("ℹ️  GET METADATA: Checking file info...");
  const metadata = await s5.fs.getMetadata("home/documents/hello.txt");
  console.log(`✅ File metadata:`);
  console.log(`   Size: ${metadata.size} bytes`);
  console.log(`   Created: ${new Date(metadata.ts).toISOString()}\n`);

  // DELETE: Remove a file
  console.log("🗑️  DELETE: Removing a file...");
  await s5.fs.delete("home/documents/hello.txt");
  console.log("✅ Deleted: home/documents/hello.txt\n");

  await new Promise(resolve => setTimeout(resolve, 5000));

  // ----------------------------------------------------------------
  // SECTION 6: Media Operations (Images & Thumbnails)
  // ----------------------------------------------------------------
  console.log("📌 SECTION 6: Media Operations");
  console.log("─".repeat(60));
  console.log("Uploading images with automatic thumbnail generation...\n");

  // Create a simple test image blob
  console.log("🎨 Creating a test image...");
  const imageData = new Uint8Array([
    // PNG header + minimal valid PNG data (1x1 red pixel)
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
    0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
    0x44, 0xAE, 0x42, 0x60, 0x82
  ]);
  const imageBlob = new Blob([imageData], { type: 'image/png' });
  console.log("✅ Test image created (1x1 red pixel PNG)\n");

  console.log("📤 PUT IMAGE: Uploading with thumbnail generation...");
  try {
    const imageResult = await s5.fs.putImage("home/photos/test.png", imageBlob, {
      generateThumbnail: true,
      thumbnailMaxWidth: 200,
      thumbnailMaxHeight: 200
    });
    console.log("✅ Image uploaded with thumbnail:");
    console.log(`   Original: ${imageResult.original.path}`);
    console.log(`   Thumbnail: ${imageResult.thumbnail?.path || 'N/A'}\n`);
  } catch (error) {
    console.log(`⚠️  Image upload failed: ${error.message}`);
    console.log("   This is normal in test environments without full media setup.\n");
  }

  // ----------------------------------------------------------------
  // SECTION 7: Directory Utilities
  // ----------------------------------------------------------------
  console.log("📌 SECTION 7: Directory Utilities (Walker, Pagination)");
  console.log("─".repeat(60));
  console.log("Exploring advanced directory traversal...\n");

  // Import directory utilities
  const { DirectoryWalker } = await import("../dist/src/index.js");

  console.log("🚶 WALKER: Recursively traversing home directory...");
  const walker = new DirectoryWalker(s5.fs, "/");
  let walkedCount = 0;

  try {
    for await (const entry of walker.walk("home", { maxDepth: 3 })) {
      console.log(`   ${entry.type.padEnd(9)} ${entry.path}`);
      walkedCount++;
    }
    console.log(`✅ Walked ${walkedCount} entries\n`);
  } catch (error) {
    console.log(`⚠️  Walker error: ${error.message}\n`);
  }

  // Pagination example (useful for large directories)
  console.log("📄 PAGINATION: Fetching items in batches...");
  let cursor = null;
  let page = 1;
  let totalItems = 0;

  do {
    const items = [];
    for await (const item of s5.fs.list("home", { limit: 10, cursor })) {
      items.push(item);
      totalItems++;
    }

    if (items.length > 0) {
      console.log(`   Page ${page}: ${items.length} items`);
      cursor = items[items.length - 1].cursor;
      page++;
    } else {
      cursor = null; // No more items
    }
  } while (cursor);

  console.log(`✅ Total items across all pages: ${totalItems}\n`);

  // ----------------------------------------------------------------
  // SECTION 8: Encryption
  // ----------------------------------------------------------------
  console.log("📌 SECTION 8: Encryption (Private Data)");
  console.log("─".repeat(60));
  console.log("Storing encrypted data with XChaCha20-Poly1305...\n");

  console.log("🔐 ENCRYPT: Uploading encrypted file...");
  const privateData = "This is private information, encrypted end-to-end.";

  try {
    await s5.fs.put("home/secrets/private.txt", privateData, {
      encryption: "on" // Automatic encryption
    });
    console.log("✅ Encrypted file uploaded: home/secrets/private.txt");
    console.log("   Data is encrypted before leaving your device.\n");

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Retrieve and auto-decrypt
    console.log("🔓 DECRYPT: Retrieving encrypted file...");
    const decryptedData = await s5.fs.get("home/secrets/private.txt");
    console.log(`✅ Retrieved and decrypted: "${decryptedData}"`);
    console.log(`   Match: ${decryptedData === privateData ? "✓" : "✗"}\n`);
  } catch (error) {
    console.log(`⚠️  Encryption error: ${error.message}\n`);
  }

  // ----------------------------------------------------------------
  // SECTION 9: Advanced CID API
  // ----------------------------------------------------------------
  console.log("📌 SECTION 9: Advanced CID API (Content-Addressed Storage)");
  console.log("─".repeat(60));
  console.log("For power users: Direct content identifier operations...\n");

  // Import advanced utilities
  const { FS5Advanced, formatCID } = await import("../dist/src/exports/advanced.js");

  console.log("🔍 CID API: Extracting content identifiers...");
  const advanced = new FS5Advanced(s5.fs);

  try {
    // Get CID for uploaded file
    const cid = await advanced.pathToCID("home/profile.json");
    const formattedCID = formatCID(cid, 'base32');
    console.log(`✅ CID extracted from path:`);
    console.log(`   Path: home/profile.json`);
    console.log(`   CID:  ${formattedCID}\n`);

    // Retrieve content by CID (bypassing path resolution)
    console.log("📥 Retrieving content directly by CID...");
    const dataFromCID = await advanced.getByCID(cid);
    console.log(`✅ Retrieved by CID:`, dataFromCID);
    console.log(`   This enables content deduplication and verification.\n`);
  } catch (error) {
    console.log(`⚠️  CID API error: ${error.message}\n`);
  }

  // ----------------------------------------------------------------
  // SECTION 10: Performance & Scaling (HAMT)
  // ----------------------------------------------------------------
  console.log("📌 SECTION 10: Performance & Scaling (HAMT Sharding)");
  console.log("─".repeat(60));
  console.log("Enhanced s5.js automatically shards large directories...\n");

  console.log("📊 HAMT (Hash Array Mapped Trie):");
  console.log("   - Activates at 1,000+ entries");
  console.log("   - 32-way branching for O(log n) lookup");
  console.log("   - Tested up to 100,000+ entries");
  console.log("   - No configuration needed (automatic)");
  console.log("\n   Example: A directory with 10,000 files:");
  console.log("   - Without HAMT: O(n) = 10,000 operations");
  console.log("   - With HAMT:    O(log n) = ~4-5 operations ✨\n");

  // ----------------------------------------------------------------
  // Tutorial Complete
  // ----------------------------------------------------------------
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║                   Tutorial Complete! 🎉                        ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  console.log("🎓 What you learned:");
  console.log("   ✅ Set up S5 instance and connect to network");
  console.log("   ✅ Manage identity with seed phrases");
  console.log("   ✅ Perform basic file operations (put, get, list, delete)");
  console.log("   ✅ Upload images with automatic thumbnails");
  console.log("   ✅ Navigate directories with walker and pagination");
  console.log("   ✅ Encrypt private data automatically");
  console.log("   ✅ Use advanced CID API for content addressing");
  console.log("   ✅ Understand HAMT sharding for large directories\n");

  console.log("📚 Next steps:");
  console.log("   - Read full API documentation: docs/API.md");
  console.log("   - Explore example apps: examples/");
  console.log("   - Check performance benchmarks: docs/BENCHMARKS.md");
  console.log("   - View test scripts for more examples: test/integration/\n");

  console.log("🔗 Resources:");
  console.log("   - npm package: @julesl23/s5js@beta");
  console.log("   - GitHub: https://github.com/julesl23/s5.js");
  console.log("   - S5 Documentation: https://docs.sfive.net/\n");

  console.log("💡 Tip: Save your seed phrase securely!");
  console.log(`   Your seed phrase: "${seedPhrase}"\n`);
}

// ====================================================================
// Run the tutorial
// ====================================================================

runTutorial().catch(error => {
  console.error("❌ Tutorial failed:", error);
  process.exit(1);
});
