# Quick Start

This 5-minute tutorial will get you started with Enhanced s5.js, from installation to uploading your first file.

## Prerequisites

- Node.js 20+ or modern browser
- Basic JavaScript/TypeScript knowledge
- npm or yarn package manager

## Step 1: Install

```bash
npm install @s5-dev/s5js@beta
```

## Step 2: Create S5 Instance

```typescript
import { S5, generatePhrase } from '@s5-dev/s5js';

// Create S5 instance and connect to network
const s5 = await S5.create({
  initialPeers: [
    "wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p",
    "wss://z2Das8aEF7oNoxkcrfvzerZ1iBPWfm6D7gy3hVE4ALGSpVB@node.sfive.net/s5/p2p"
  ]
});
```

The S5 instance automatically connects to the network using the provided peer list.

## Step 3: Create or Recover Identity

Your identity controls access to your files. Enhanced s5.js uses 12-word seed phrases compatible with BIP-39.

### Generate New Identity

```typescript
// Generate a new seed phrase
const seedPhrase = generatePhrase(s5.api.crypto);
console.log('Save this seed phrase:', seedPhrase);

// Load the identity
await s5.recoverIdentityFromSeedPhrase(seedPhrase);
```

> **Important**: Save your seed phrase securely! You'll need it to recover your files.

### Recover Existing Identity

```typescript
// Use your existing seed phrase
const existingSeedPhrase = "word1 word2 word3 ... word12";
await s5.recoverIdentityFromSeedPhrase(existingSeedPhrase);
```

## Step 4: Register on Portal

S5 portals provide upload services. Register on a portal to enable file uploads:

```typescript
// Register on s5.vup.cx (supports Enhanced s5.js)
await s5.registerOnNewPortal("https://s5.vup.cx");
```

This creates an account on the portal using your identity. The portal will store your uploaded files.

## Step 5: Initialize Filesystem

```typescript
// Create initial directory structure
await s5.fs.ensureIdentityInitialized();
```

This creates `home` and `archive` directories in your S5 storage.

## Step 6: Upload Your First File

```typescript
// Store a text file
await s5.fs.put('home/documents/hello.txt', 'Hello, S5!');
console.log('✅ File uploaded!');
```

## Step 7: Retrieve the File

```typescript
// Get the file back
const content = await s5.fs.get('home/documents/hello.txt');
console.log('File content:', content); // "Hello, S5!"
```

## Step 8: List Directory Contents

```typescript
// List all files in home/documents
for await (const item of s5.fs.list('home/documents')) {
  console.log(`${item.type}: ${item.name} (${item.size} bytes)`);
}
```

## Complete Example

Here's a complete working example combining all steps:

```typescript
import { S5, generatePhrase } from '@s5-dev/s5js';

async function quickStart() {
  // 1. Create S5 instance
  const s5 = await S5.create({
    initialPeers: [
      "wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p"
    ]
  });

  // 2. Generate seed phrase (save this!)
  const seedPhrase = generatePhrase(s5.api.crypto);
  console.log('🔑 Seed phrase:', seedPhrase);

  // 3. Load identity
  await s5.recoverIdentityFromSeedPhrase(seedPhrase);

  // 4. Register on portal
  await s5.registerOnNewPortal("https://s5.vup.cx");

  // 5. Initialize filesystem
  await s5.fs.ensureIdentityInitialized();

  // 6. Upload files
  await s5.fs.put('home/hello.txt', 'Hello, S5!');
  await s5.fs.put('home/data.json', { message: 'JSON works too!' });

  // 7. Read files back
  const text = await s5.fs.get('home/hello.txt');
  const json = await s5.fs.get('home/data.json');

  console.log('Text file:', text);
  console.log('JSON file:', json);

  // 8. List directory
  console.log('\n📁 Files in home:');
  for await (const item of s5.fs.list('home')) {
    console.log(`  ${item.type}: ${item.name}`);
  }
}

quickStart().catch(console.error);
```

## What's Happening Under the Hood?

1. **P2P Connection**: Your S5 instance connects to peers via WebSocket
2. **Identity**: Ed25519 keypair derived from your seed phrase
3. **Portal Registration**: Creates authenticated account for uploads
4. **Blob Upload**: Files are split into blobs and uploaded to portal
5. **Registry**: Metadata stored in distributed registry (like DNS for files)
6. **CBOR Encoding**: Directory structures use DAG-CBOR serialization

## Next Steps

### Store Different Data Types

```typescript
// Text
await s5.fs.put('home/readme.txt', 'Some text');

// JSON/Objects (automatically encoded as CBOR)
await s5.fs.put('home/config.json', { version: '1.0' });

// Binary data (images, PDFs, etc.)
const imageBlob = new Blob([imageData], { type: 'image/jpeg' });
await s5.fs.put('home/photo.jpg', imageBlob);
```

### Upload Images with Thumbnails

```typescript
// Automatically generate thumbnail
const result = await s5.fs.putImage('home/photos/sunset.jpg', imageBlob, {
  generateThumbnail: true,
  thumbnailMaxWidth: 200,
  thumbnailMaxHeight: 200
});

// Get the thumbnail
const thumbnail = await s5.fs.getThumbnail('home/photos/sunset.jpg');
```

### Work with Directories

```typescript
// Create nested structure
await s5.fs.put('home/projects/app/src/index.ts', 'console.log("hi")');

// List recursively
import { DirectoryWalker } from '@s5-dev/s5js';

const walker = new DirectoryWalker(s5.fs);
for await (const item of walker.walk('home/projects', { recursive: true })) {
  console.log(item.path);
}
```

### Delete Files

```typescript
// Delete a file
await s5.fs.delete('home/old-file.txt');

// Delete a directory (recursive)
await s5.fs.delete('home/old-folder');
```

## Common Patterns

### Check if File Exists

```typescript
const content = await s5.fs.get('home/file.txt');
if (content !== undefined) {
  console.log('File exists!');
}
```

### Get File Metadata Without Downloading

```typescript
const metadata = await s5.fs.getMetadata('home/large-file.mp4');
console.log('Size:', metadata.size);
console.log('CID:', metadata.cid);
```

### Paginate Large Directories

```typescript
let cursor = undefined;

do {
  const results = [];
  for await (const item of s5.fs.list('home/photos', { limit: 100, cursor })) {
    results.push(item);
  }

  console.log(`Batch: ${results.length} items`);
  cursor = results[results.length - 1]?.cursor;
} while (cursor);
```

## Troubleshooting

### Portal Registration Fails

- Check your internet connection
- Verify the portal URL is correct (`https://s5.vup.cx`)
- Ensure you've generated/recovered an identity first

### Files Not Uploading

- Ensure you've registered on a portal
- Check portal quota/limits
- Verify file size is reasonable (<100 MB for beta)

### Cannot Retrieve Files

- Verify the path is correct (case-sensitive)
- Ensure you're using the same identity that uploaded the file
- Check network connectivity to peers

## Further Reading

- **[Path-based API Guide](./path-api.md)** - Complete API documentation
- **[Media Processing](./media.md)** - Image thumbnails and metadata
- **[Performance & Scaling](./performance.md)** - HAMT for large directories
- **[Encryption](./encryption.md)** - Secure your data

## Example Projects

Check out the [demos folder](https://github.com/julesl23/s5.js/tree/main/demos) for more examples:
- Complete tutorial with all features
- Media processing demos
- Performance benchmarks
- Integration tests
