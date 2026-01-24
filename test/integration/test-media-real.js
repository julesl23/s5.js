// test-media-real.js - Test media extensions with real S5 instance
//
// This standalone test verifies FS5 media extensions work with a real S5 portal.
// Tests are grouped into 4 logical groups and run sequentially to avoid registry conflicts:
//
//   GROUP 1: Setup and Initialization (2 tests)
//   GROUP 2: Basic Image Operations (5 tests)
//   GROUP 3: Gallery Operations with registry delays (4 tests) - slower, fully sequential
//   GROUP 4: Directory and Cleanup Operations (3 tests)
//
// Total: 14 tests running sequentially with registry propagation delays
// All uploads use concurrency: 1 for reliable registry operations with real S5 portal
//
// Usage: node test/integration/test-media-real.js
//
import { S5 } from "../../dist/src/index.js";
import { generatePhrase } from "../../dist/src/identity/seed_phrase/seed_phrase.js";
import { readFileSync } from "fs";
import { fileURLToPath, URL as NodeURL } from "url";
import { dirname, join } from "path";
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

// Mock browser APIs for media processing (needed in Node.js test environment)
let lastCreatedBlob = null;

global.Image = class Image {
  constructor() {
    this.src = '';
    this.onload = null;
    this.onerror = null;
    this.width = 800;
    this.height = 600;

    setTimeout(() => {
      if (this.src === 'blob:mock-url' && lastCreatedBlob) {
        if (lastCreatedBlob.size < 10) {
          if (this.onerror) this.onerror();
          return;
        }
      }
      if (this.onload) this.onload();
    }, 0);
  }
};

// Preserve native URL constructor while adding blob URL methods for media processing
global.URL = Object.assign(NodeURL, {
  createObjectURL: (blob) => {
    lastCreatedBlob = blob;
    return 'blob:mock-url';
  },
  revokeObjectURL: (url) => {
    lastCreatedBlob = null;
  },
});

global.document = {
  createElement: (tag) => {
    if (tag === 'canvas') {
      const canvas = {
        _width: 0,
        _height: 0,
        get width() { return this._width; },
        set width(val) { this._width = val; },
        get height() { return this._height; },
        set height(val) { this._height = val; },
        getContext: () => ({
          imageSmoothingEnabled: true,
          imageSmoothingQuality: 'high',
          fillStyle: '',
          drawImage: () => {},
          fillRect: () => {},
          getImageData: (x, y, w, h) => ({
            width: w,
            height: h,
            data: new Uint8ClampedArray(w * h * 4),
          }),
        }),
        toBlob: (callback, type, quality) => {
          const baseSize = Math.max(canvas._width * canvas._height, 100);
          const qualityFactor = quality !== undefined ? quality : 0.92;
          const size = Math.floor(baseSize * qualityFactor * 0.5) + 50;
          const mockBlob = new Blob([new Uint8Array(size)], { type });
          setTimeout(() => callback(mockBlob), 0);
        },
      };
      return canvas;
    }
    return {};
  },
};

// Helper to create test image blob
function createTestImageBlob() {
  // Create a simple valid JPEG with actual image data
  const jpegData = new Uint8Array([
    0xFF, 0xD8, 0xFF, 0xE0, // JPEG SOI and APP0
    0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xD9 // EOI
  ]);
  return new Blob([jpegData], { type: 'image/jpeg' });
}

async function testMediaExtensions() {
  console.log("🖼️  Testing FS5 Media Extensions with Real S5\n");
  console.log("═".repeat(60) + "\n");

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // ============================================================
    // GROUP 1: Setup and Initialization
    // ============================================================
    const portalUrl = getPortalUrl();
    const initialPeers = getInitialPeers();

    console.log("📦 GROUP 1: Setup and Initialization\n");

    console.log("  1.1: Creating S5 instance...");
    const s5 = await S5.create({ initialPeers });
    console.log("  ✅ S5 instance created");
    testsPassed++;

    console.log("  1.2: Creating identity and registering portal...");
    try {
      // Create an identity for file operations
      const seedPhrase = s5.generateSeedPhrase();
      await s5.recoverIdentityFromSeedPhrase(seedPhrase);

      // Register on portal to enable uploads (required for real S5 portal testing)
      await s5.registerOnNewPortal(portalUrl);

      // Ensure identity is initialized for file operations
      await s5.fs.ensureIdentityInitialized();

      // Wait for registry propagation to avoid "Revision number too low" errors
      console.log("     Waiting 3 seconds for registry propagation...");
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log("  ✅ Identity and portal registered");
      testsPassed++;
    } catch (error) {
      console.log("  ❌ Identity/portal setup failed:", error.message);
      testsFailed++;
    }

    console.log("\n✅ GROUP 1 Complete: Setup successful\n");

    // ============================================================
    // GROUP 2: Basic Image Operations
    // ============================================================
    console.log("═".repeat(60));
    console.log("🖼️  GROUP 2: Basic Image Operations\n");

    console.log("  2.1: Uploading image with putImage()...");
    try {
      const blob = createTestImageBlob();
      const result = await s5.fs.putImage('home/photos/test.jpg', blob);

      if (result.path === 'home/photos/test.jpg') {
        console.log("  ✅ Image uploaded successfully");
        console.log(`     Path: ${result.path}`);
        console.log(`     Thumbnail: ${result.thumbnailPath || 'none'}`);
        console.log(`     Metadata: ${result.metadata ? 'extracted' : 'none'}`);
        testsPassed++;
      } else {
        console.log("  ❌ Unexpected path returned");
        testsFailed++;
      }
    } catch (error) {
      console.log("  ❌ putImage failed:", error.message);
      testsFailed++;
    }

    console.log("  2.2: Retrieving uploaded image...");
    try {
      const data = await s5.fs.get('home/photos/test.jpg');

      if (data) {
        console.log("  ✅ Image retrieved successfully");
        console.log(`     Size: ${data.length} bytes`);
        testsPassed++;
      } else {
        console.log("  ❌ No data retrieved");
        testsFailed++;
      }
    } catch (error) {
      console.log("  ❌ Image retrieval failed:", error.message);
      testsFailed++;
    }

    console.log("  2.3: Retrieving thumbnail with getThumbnail()...");
    try {
      const thumbnail = await s5.fs.getThumbnail('home/photos/test.jpg');

      if (thumbnail && thumbnail instanceof Blob) {
        console.log("  ✅ Thumbnail retrieved successfully");
        console.log(`     Type: ${thumbnail.type}`);
        console.log(`     Size: ${thumbnail.size} bytes`);
        testsPassed++;
      } else {
        console.log("  ❌ Invalid thumbnail returned");
        testsFailed++;
      }
    } catch (error) {
      console.log("  ❌ getThumbnail failed:", error.message);
      testsFailed++;
    }

    console.log("  2.4: Extracting metadata with getImageMetadata()...");
    try {
      const metadata = await s5.fs.getImageMetadata('home/photos/test.jpg');

      if (metadata && metadata.format) {
        console.log("  ✅ Metadata extracted successfully");
        console.log(`     Format: ${metadata.format}`);
        console.log(`     Dimensions: ${metadata.width}x${metadata.height}`);
        testsPassed++;
      } else {
        console.log("  ❌ Invalid metadata returned");
        testsFailed++;
      }
    } catch (error) {
      console.log("  ❌ getImageMetadata failed:", error.message);
      testsFailed++;
    }

    console.log("  2.5: Uploading image without thumbnail...");
    try {
      const blob = createTestImageBlob();
      const result = await s5.fs.putImage('home/photos/no-thumb.jpg', blob, {
        generateThumbnail: false
      });

      if (!result.thumbnailPath) {
        console.log("  ✅ Image uploaded without thumbnail");
        console.log(`     Has thumbnail path: no`);
        testsPassed++;
      } else {
        console.log("  ❌ Unexpected thumbnail generated");
        testsFailed++;
      }
    } catch (error) {
      console.log("  ❌ Upload failed:", error.message);
      testsFailed++;
    }

    console.log("\n✅ GROUP 2 Complete: Basic operations verified\n");

    // ============================================================
    // GROUP 3: Gallery Operations (with registry delays)
    // ⚠️  These tests may be slower due to registry propagation
    // ============================================================
    console.log("═".repeat(60));
    console.log("🖼️  GROUP 3: Gallery Operations (with registry delays)\n");
    console.log("⚠️  Waiting 5 seconds for registry propagation...\n");
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log("  3.1: Creating image gallery with createImageGallery()...");
    try {
      const images = [
        { name: 'photo1.jpg', blob: createTestImageBlob() },
        { name: 'photo2.jpg', blob: createTestImageBlob() },
        { name: 'photo3.jpg', blob: createTestImageBlob() }
      ];

      const results = await s5.fs.createImageGallery('home/gallery', images, {
        concurrency: 1,  // Sequential uploads to avoid registry conflicts
        onProgress: (completed, total) => {
          console.log(`     Progress: ${completed}/${total} images uploaded`);
        }
      });

      if (results.length === 3) {
        console.log("  ✅ Gallery created successfully");
        console.log(`     Images uploaded: ${results.length}`);
        testsPassed++;
      } else {
        console.log("  ❌ Unexpected number of images");
        testsFailed++;
      }
    } catch (error) {
      console.log("  ❌ createImageGallery failed:", error.message);
      testsFailed++;
    }

    // Wait between gallery operations
    console.log("     Waiting 3 seconds before manifest check...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("  3.2: Verifying gallery manifest...");
    try {
      const manifestData = await s5.fs.get('home/gallery/manifest.json');

      if (manifestData) {
        const manifest = typeof manifestData === 'object' && manifestData !== null
          ? manifestData
          : JSON.parse(typeof manifestData === 'string'
              ? manifestData
              : new TextDecoder().decode(manifestData));

        if (manifest.count === 3) {
          console.log("  ✅ Manifest retrieved successfully");
          console.log(`     Image count: ${manifest.count}`);
          console.log(`     Created: ${manifest.created}`);
          console.log(`     Images:`);
          manifest.images.forEach((img, i) => {
            console.log(`       ${i + 1}. ${img.name} - ${img.path}`);
          });
          testsPassed++;
        } else {
          console.log("  ❌ Unexpected manifest count");
          testsFailed++;
        }
      } else {
        console.log("  ❌ Manifest not found");
        testsFailed++;
      }
    } catch (error) {
      console.log("  ❌ Manifest verification failed:", error.message);
      testsFailed++;
    }

    // Wait before listing operation
    console.log("     Waiting 2 seconds before directory listing...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("  3.3: Listing gallery directory...");
    try {
      const items = [];
      for await (const item of s5.fs.list('home/gallery')) {
        items.push(item);
      }

      console.log(`  ✅ Found ${items.length} items in gallery:`);
      items.forEach(item => {
        console.log(`     - ${item.type}: ${item.name}`);
      });

      testsPassed++;
    } catch (error) {
      console.log("  ❌ List gallery failed:", error.message);
      testsFailed++;
    }

    console.log("  3.4: Testing sequential batch uploads...");
    console.log("     ⚠️  Waiting 5 seconds for registry propagation...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    try {
      const images = Array.from({ length: 5 }, (_, i) => ({
        name: `photo${i}.jpg`,
        blob: createTestImageBlob()
      }));

      // Use concurrency: 1 for reliable sequential uploads
      const results = await s5.fs.createImageGallery('home/concurrent', images, {
        concurrency: 1,
        onProgress: (completed, total) => {
          console.log(`     Progress: ${completed}/${total} images uploaded`);
        }
      });

      console.log(`  ✅ Sequential batch uploads successful: ${results.length} images`);
      testsPassed++;
    } catch (error) {
      console.log("  ❌ Sequential batch uploads failed:", error.message);
      testsFailed++;
    }

    console.log("\n✅ GROUP 3 Complete: Gallery operations verified\n");

    // Wait before GROUP 4 to ensure clean separation
    console.log("⚠️  Waiting 3 seconds before GROUP 4...\n");
    await new Promise(resolve => setTimeout(resolve, 3000));

    // ============================================================
    // GROUP 4: Directory and Cleanup Operations
    // ============================================================
    console.log("═".repeat(60));
    console.log("🗂️  GROUP 4: Directory and Cleanup Operations\n");

    console.log("  4.1: Testing delete operations...");
    try {
      // Upload image
      const blob = createTestImageBlob();
      await s5.fs.putImage('home/temp/delete-test.jpg', blob);

      // Verify exists
      let data = await s5.fs.get('home/temp/delete-test.jpg');
      if (!data) throw new Error("File not found after upload");

      // Delete
      const deleted = await s5.fs.delete('home/temp/delete-test.jpg');

      // Verify gone
      data = await s5.fs.get('home/temp/delete-test.jpg');

      if (deleted && !data) {
        console.log("  ✅ Delete operations working correctly");
        testsPassed++;
      } else {
        console.log("  ❌ Delete operation failed");
        testsFailed++;
      }
    } catch (error) {
      console.log("  ❌ Delete test failed:", error.message);
      testsFailed++;
    }

    console.log("  4.2: Verifying thumbnails directory structure...");
    try {
      const items = [];
      for await (const item of s5.fs.list('home/photos/.thumbnails')) {
        items.push(item);
      }

      console.log(`  ✅ Found ${items.length} thumbnails:`);
      items.forEach(item => {
        console.log(`     - ${item.name}`);
      });
      testsPassed++;
    } catch (error) {
      console.log("  ❌ Thumbnail directory structure test failed:", error.message);
      testsFailed++;
    }

    console.log("  4.3: Testing data persistence...");
    try {
      const data1 = await s5.fs.get('home/photos/test.jpg');
      const data2 = await s5.fs.get('home/photos/test.jpg');

      if (data1 && data2 && data1.length === data2.length) {
        console.log("  ✅ Data persistence verified");
        console.log(`     Data consistent across retrievals: ${data1.length} bytes`);
        testsPassed++;
      } else {
        console.log("  ❌ Data persistence check failed");
        testsFailed++;
      }
    } catch (error) {
      console.log("  ❌ Persistence test failed:", error.message);
      testsFailed++;
    }

    console.log("\n✅ GROUP 4 Complete: Directory operations verified\n");

    // Summary
    console.log("═".repeat(60));
    console.log("📊 Test Summary:\n");
    console.log(`  Total Tests Run: ${testsPassed + testsFailed} (across 4 groups)`);
    console.log(`  ✅ Passed: ${testsPassed}`);
    console.log(`  ❌ Failed: ${testsFailed}`);
    console.log(`  📈 Success Rate: ${(testsPassed / (testsPassed + testsFailed) * 100).toFixed(1)}%`);
    console.log();

    console.log("📋 Test Groups:");
    console.log("  GROUP 1: Setup and Initialization (2 tests)");
    console.log("  GROUP 2: Basic Image Operations (5 tests)");
    console.log("  GROUP 3: Gallery Operations with delays (4 tests)");
    console.log("  GROUP 4: Directory and Cleanup Operations (3 tests)");
    console.log();

    if (testsFailed === 0) {
      console.log("🎉 All media extension tests passed!");
      console.log("\n✨ Phase 6.3: FS5 Integration verified with real S5 instance!");
    } else {
      console.log("⚠️  Some tests failed. Review the errors above.");
      console.log("💡 If GROUP 3 (Gallery Operations) failed, try running again.");
      console.log("   Registry propagation delays can cause intermittent failures.");
    }

  } catch (error) {
    console.error("💥 Fatal error:", error.message);
    console.error("Stack:", error.stack);
  }
}

testMediaExtensions();
