# Advanced CID API

The Advanced CID API provides direct access to Content Identifiers (CIDs) for power users who need content-addressed storage capabilities.

## Overview

Enhanced s5.js provides two APIs:

- **Path-based API** - Simple filesystem-like operations (recommended for most apps)
- **Advanced CID API** - Content-addressed storage for power users

> The Advanced CID API is exported separately (`@s5-dev/s5js/advanced`) and does not affect the simplicity of the standard path-based API.

## When to Use

**Use the Advanced CID API when you need:**
- Content-addressed storage (reference data by cryptographic hash)
- Content deduplication or verification
- Distributed systems that use CIDs
- Track content independently of file paths
- Build content-addressed applications

**Use the Path-based API for:**
- Simple file storage and retrieval (most use cases)
- Traditional file system operations
- User-facing applications
- When paths are more meaningful than hashes

## Installation

```typescript
import { S5 } from '@s5-dev/s5js';
import { FS5Advanced, formatCID, parseCID, verifyCID } from '@s5-dev/s5js/advanced';
```

**Bundle Size**: 60.60 KB (brotli) - includes core + CID utilities

## FS5Advanced Class

The `FS5Advanced` class wraps an `FS5` instance to provide CID-aware operations.

### Constructor

```typescript
const advanced = new FS5Advanced(s5.fs);
```

## Core Methods

### pathToCID(path)

Extract the CID (Content Identifier) from a file or directory path.

```typescript
async pathToCID(path: string): Promise<Uint8Array>
```

**Example:**

```typescript
// Store a file
await s5.fs.put('home/data.txt', 'Hello, World!');

// Extract its CID
const advanced = new FS5Advanced(s5.fs);
const cid = await advanced.pathToCID('home/data.txt');

// Format for display
const formatted = formatCID(cid, 'base32');
console.log(formatted); // "bafybeig..."
```

### cidToPath(cid)

Find the path for a given CID.

```typescript
async cidToPath(cid: Uint8Array): Promise<string | null>
```

**Example:**

```typescript
const cid = await advanced.pathToCID('home/data.txt');

// Find path from CID
const path = await advanced.cidToPath(cid);
console.log(path); // "home/data.txt"

// Returns null if CID not found
const missing = await advanced.cidToPath(someCID);
console.log(missing); // null
```

### getByCID(cid)

Retrieve data directly by its CID without knowing the path.

```typescript
async getByCID(cid: Uint8Array): Promise<any | undefined>
```

**Example:**

```typescript
// Retrieve data by CID
const data = await advanced.getByCID(cid);
console.log(data); // "Hello, World!"

// Works even if path is unknown
const cidString = 'bafybeig...';
const parsedCID = parseCID(cidString);
const content = await advanced.getByCID(parsedCID);
```

### putByCID(data)

Store data without assigning a path (content-only storage).

```typescript
async putByCID(data: any): Promise<Uint8Array>
```

**Example:**

```typescript
// Store content without path
const cid = await advanced.putByCID('Temporary data');
console.log(formatCID(cid)); // "bafybeig..."

// Retrieve later by CID
const data = await advanced.getByCID(cid);
console.log(data); // "Temporary data"
```

## CID Utility Functions

### formatCID(cid, format?)

Convert a CID from bytes to a formatted string.

```typescript
function formatCID(cid: Uint8Array, format?: 'base32' | 'base58btc' | 'hex'): string
```

**Formats:**
- `base32` - Multibase base32 with `bafyb` prefix (default)
- `base58btc` - Multibase base58btc with `zb2rh` prefix
- `hex` - Hexadecimal (for debugging)

**Example:**

```typescript
const cid = await advanced.pathToCID('home/file.txt');

// Base32 (IPFS/S5 standard)
console.log(formatCID(cid, 'base32'));
// "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"

// Base58btc (Bitcoin-style)
console.log(formatCID(cid, 'base58btc'));
// "zb2rhk6GMPQF8p1NMJEqvJ3XFfNBqJNfiXzJaJkPiA9kMvNaJ"

// Hex (debugging)
console.log(formatCID(cid, 'hex'));
// "1a2b3c..."
```

### parseCID(cidString)

Parse a formatted CID string back to bytes.

```typescript
function parseCID(cidString: string): Uint8Array
```

**Supported Formats:**
- Base32 with prefix: `"bafybei..."`
- Base32 without prefix: `"afybei..."`
- Base58btc with prefix: `"zb2rh..."`
- Base58btc without prefix: `"Qm..."`
- Base64 with prefix: `"mAXASI..."`
- Hex: `"1a2b3c..."`

**Example:**

```typescript
// Parse base32
const cid1 = parseCID('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');

// Parse base58btc
const cid2 = parseCID('zb2rhk6GMPQF8p1NMJEqvJ3XFfNBqJNfiXzJaJkPiA9kMvNaJ');

// Parse without prefix (auto-detect)
const cid3 = parseCID('afybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi');
```

### verifyCID(cid, data, crypto)

Verify that a CID matches the given data by recomputing the hash.

```typescript
async function verifyCID(
  cid: Uint8Array,
  data: Uint8Array,
  crypto: CryptoImplementation
): Promise<boolean>
```

**Example:**

```typescript
import { JSCryptoImplementation } from '@s5-dev/s5js';

const crypto = new JSCryptoImplementation();
const data = new TextEncoder().encode('Hello, World!');

// Verify CID matches
const isValid = await verifyCID(cid, data, s5.api.crypto);
console.log(isValid); // true

// Tampered data fails verification
const tamperedData = new TextEncoder().encode('Goodbye, World!');
const isInvalid = await verifyCID(cid, tamperedData, s5.api.crypto);
console.log(isInvalid); // false
```

### cidToString(cid)

Convert a CID to hexadecimal string for debugging.

```typescript
function cidToString(cid: Uint8Array): string
```

**Example:**

```typescript
const cid = await advanced.pathToCID('home/file.txt');
console.log(cidToString(cid));
// "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b"
```

## Complete Workflow Example

```typescript
import { S5 } from '@s5-dev/s5js';
import { FS5Advanced, formatCID, parseCID, verifyCID } from '@s5-dev/s5js/advanced';

// Initialize S5
const s5 = await S5.create();
const seedPhrase = generatePhrase(s5.api.crypto);
await s5.recoverIdentityFromSeedPhrase(seedPhrase);

// Create Advanced API
const advanced = new FS5Advanced(s5.fs);

// 1. Store data using path-based API
await s5.fs.put('home/document.txt', 'Important data');

// 2. Get the CID
const cid = await advanced.pathToCID('home/document.txt');
const cidString = formatCID(cid, 'base32');
console.log(`CID: ${cidString}`);

// 3. Verify the CID
const data = new TextEncoder().encode('Important data');
const isValid = await verifyCID(cid, data, s5.api.crypto);
console.log(`Valid: ${isValid}`); // true

// 4. Share the CID (someone else can retrieve)
const sharedCID = cidString;

// 5. Recipient: parse CID and retrieve data
const receivedCID = parseCID(sharedCID);
const retrievedData = await advanced.getByCID(receivedCID);
console.log(`Data: ${retrievedData}`); // "Important data"

// 6. Find path from CID
const path = await advanced.cidToPath(receivedCID);
console.log(`Path: ${path}`); // "home/document.txt"
```

## Composition Pattern

Combine path-based API with CID utilities:

```typescript
// Store with path
await s5.fs.put('home/photo.jpg', imageBlob);

// Get metadata and CID
const metadata = await s5.fs.getMetadata('home/photo.jpg');
const cid = await advanced.pathToCID('home/photo.jpg');

console.log({
  path: 'home/photo.jpg',
  size: metadata.size,
  cid: formatCID(cid)
});
```

## Use Cases

### Content Deduplication

```typescript
// Check if content already exists
const newFileCID = await advanced.putByCID(newFileData);
const existingPath = await advanced.cidToPath(newFileCID);

if (existingPath) {
  console.log(`Content already exists at: ${existingPath}`);
} else {
  // Store with path
  await s5.fs.put('home/new-file.txt', newFileData);
}
```

### Content Verification

```typescript
// Verify downloaded file matches expected CID
const expectedCID = parseCID('bafybei...');
const downloadedData = await advanced.getByCID(expectedCID);
const isValid = await verifyCID(expectedCID, downloadedData, s5.api.crypto);

if (!isValid) {
  throw new Error('Downloaded data corrupted!');
}
```

### Distributed File System

```typescript
// Share CID instead of path (content-addressed)
const cid = await advanced.pathToCID('home/shared-file.pdf');
const shareLink = `s5://${formatCID(cid, 'base32')}`;

// Anyone with the CID can retrieve
const data = await advanced.getByCID(parseCID(shareLink.slice(5)));
```

## TypeScript Types

```typescript
interface PutWithCIDResult {
  cid: Uint8Array;
}

interface MetadataWithCIDResult {
  type: 'file' | 'directory';
  name: string;
  size?: number;
  cid: Uint8Array;
}

type CIDFormat = 'base32' | 'base58btc' | 'hex';
```

## Performance

CID operations add minimal overhead:

- **pathToCID**: O(1) - reads directory metadata
- **cidToPath**: O(n) - searches directory tree
- **getByCID**: O(1) - direct retrieval
- **putByCID**: O(1) - direct storage
- **formatCID**: O(1) - base encoding
- **parseCID**: O(1) - base decoding
- **verifyCID**: O(n) - rehashes data

## Next Steps

- **[Path-based API](./path-api.md)** - Standard file operations
- **[Performance & Scaling](./performance.md)** - Optimize large datasets
- **[API Reference](./api-reference.md)** - Complete API documentation
- **[S5 CID Specification](../../specification/blobs.md)** - CID format details
