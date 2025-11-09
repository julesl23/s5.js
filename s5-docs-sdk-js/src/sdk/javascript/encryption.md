# Encryption

Enhanced s5.js provides built-in encryption support using XChaCha20-Poly1305, an authenticated encryption algorithm that ensures both confidentiality and integrity.

## Overview

**Encryption Algorithm**: XChaCha20-Poly1305
- **Confidentiality**: XChaCha20 stream cipher
- **Authentication**: Poly1305 MAC (prevents tampering)
- **Key Size**: 256 bits (32 bytes)
- **Nonce**: 192 bits (24 bytes, auto-generated)

## Basic Usage

Files are automatically encrypted when `encrypt: true` is specified:

```typescript
// Store encrypted file
await s5.fs.put('home/private/secret.txt', 'Confidential data', {
  encrypt: true
});

// Retrieve (automatically decrypted)
const data = await s5.fs.get('home/private/secret.txt');
console.log(data); // "Confidential data"
```

## How It Works

1. **Key Derivation**: Encryption key derived from your identity seed
2. **Encryption**: Data encrypted with XChaCha20-Poly1305
3. **Storage**: Encrypted blob uploaded to S5
4. **Metadata**: Encryption flag stored in directory entry
5. **Retrieval**: Automatically decrypted when accessed

```typescript
// Path-based API handles encryption transparently
await s5.fs.put('home/document.pdf', pdfData, { encrypt: true });

// File is encrypted at rest, decrypted when retrieved
const decrypted = await s5.fs.get('home/document.pdf');
```

## User-Provided Encryption Keys

For advanced use cases, provide your own encryption key:

```typescript
import { randomBytes } from 'crypto';

// Generate 256-bit encryption key
const encryptionKey = randomBytes(32);

// Store with custom key
await s5.fs.put('home/sensitive.dat', data, {
  encrypt: true,
  encryptionKey
});

// Retrieve with same key
const decrypted = await s5.fs.get('home/sensitive.dat', {
  encryptionKey
});
```

> **Important**: If you lose the encryption key, the data cannot be recovered!

## Encryption Examples

### Encrypt Entire Directory

```typescript
import { DirectoryWalker, BatchOperations } from '@s5-dev/s5js';

async function encryptDirectory(path: string) {
  const walker = new DirectoryWalker(s5.fs);

  for await (const entry of walker.walk(path, { recursive: true })) {
    if (entry.type === 'file') {
      // Read unencrypted
      const data = await s5.fs.get(entry.path);

      // Delete original
      await s5.fs.delete(entry.path);

      // Re-upload encrypted
      await s5.fs.put(entry.path, data, { encrypt: true });
      console.log(`Encrypted: ${entry.path}`);
    }
  }
}
```

### Selective Encryption

```typescript
// Encrypt sensitive files, leave others unencrypted
const files = [
  { path: 'home/public/readme.txt', data: 'Public data', encrypt: false },
  { path: 'home/private/password.txt', data: 'secret123', encrypt: true },
  { path: 'home/private/keys.json', data: keysData, encrypt: true },
];

for (const file of files) {
  await s5.fs.put(file.path, file.data, { encrypt: file.encrypt });
}
```

### Check if File is Encrypted

```typescript
const metadata = await s5.fs.getMetadata('home/file.txt');
// Encryption status is in internal metadata (not exposed in path-based API)

// To check, try to retrieve with wrong key
try {
  await s5.fs.get('home/file.txt', { encryptionKey: wrongKey });
  console.log('Not encrypted or correct key');
} catch (error) {
  if (error.message.includes('decrypt')) {
    console.log('File is encrypted');
  }
}
```

## Security Considerations

### Key Management

**Seed-Based Keys (Default)**:
```typescript
// ✅ Encryption key derived from seed phrase
await s5.fs.put('home/file.txt', data, { encrypt: true });
// Key automatically managed by identity
```

**Custom Keys**:
```typescript
// ⚠️ You must securely store the encryption key
const customKey = randomBytes(32);
await s5.fs.put('home/file.txt', data, {
  encrypt: true,
  encryptionKey: customKey
});

// Store key securely (NOT in S5!)
localStorage.setItem('encryptionKey', Buffer.from(customKey).toString('base64'));
```

### Best Practices

1. **Backup Seed Phrase**: Your encryption keys are derived from it
2. **Use Custom Keys for Shared Data**: Different key per collaboration context
3. **Never Store Keys Unencrypted**: Use secure key storage (OS keychain, HSM)
4. **Rotate Keys Periodically**: Re-encrypt with new keys for long-term data
5. **Test Decryption**: Always verify you can decrypt before deleting originals

### What Gets Encrypted

- ✅ **File Content**: Data blob is encrypted
- ✅ **Metadata Integrity**: Protected by Poly1305 MAC
- ❌ **File Names**: Stored in directory metadata (not encrypted)
- ❌ **File Paths**: Visible in directory structure
- ❌ **File Sizes**: Metadata is not encrypted

**For maximum privacy, also encrypt filenames manually:**

```typescript
import { createHash } from 'crypto';

function hashFilename(name: string): string {
  return createHash('sha256').update(name).digest('hex').slice(0, 16);
}

// Store with hashed filename
await s5.fs.put(`home/private/${hashFilename('secret.txt')}`, data, {
  encrypt: true
});

// Keep a separate encrypted mapping of hash → filename
const mapping = { [hashFilename('secret.txt')]: 'secret.txt' };
await s5.fs.put('home/private/.filenames', mapping, { encrypt: true });
```

## Performance Impact

Encryption adds minimal overhead:

- **Small files (<1MB)**: +5-10ms
- **Large files (10MB)**: +50-100ms
- **Memory**: Same as unencrypted (streaming encryption)

```typescript
// Benchmark encryption overhead
const data = 'A'.repeat(1000000); // 1MB

const start1 = Date.now();
await s5.fs.put('home/unencrypted.txt', data);
console.log(`Unencrypted: ${Date.now() - start1}ms`);

const start2 = Date.now();
await s5.fs.put('home/encrypted.txt', data, { encrypt: true });
console.log(`Encrypted: ${Date.now() - start2}ms`);
// Typically +5-10ms
```

## Encryption Metadata

Encryption status is stored in internal metadata:

```typescript
// Internal structure (not exposed in path-based API)
{
  type: 'file',
  cid: Uint8Array,
  size: number,
  encrypted: true,      // Encryption flag
  nonce: Uint8Array,    // 24-byte nonce for decryption
  // ...
}
```

## Error Handling

```typescript
try {
  const data = await s5.fs.get('home/encrypted.txt', {
    encryptionKey: wrongKey
  });
} catch (error) {
  if (error.message.includes('Failed to decrypt')) {
    console.error('Wrong encryption key!');
  } else if (error.message.includes('Corrupted')) {
    console.error('Data corrupted or tampered');
  } else {
    throw error;
  }
}
```

## Advanced: Multiple Encryption Keys

For shared files with different access levels:

```typescript
// Team encryption key (shared)
const teamKey = await getTeamEncryptionKey();
await s5.fs.put('team/shared-doc.pdf', pdfData, {
  encrypt: true,
  encryptionKey: teamKey
});

// Personal encryption key (private)
await s5.fs.put('home/personal-notes.txt', notes, {
  encrypt: true  // Uses identity-derived key
});

// Anyone with teamKey can access shared doc
// Only you can access personal notes
```

## Limitations

1. **No Key Escrow**: Lost keys = lost data (by design)
2. **Filenames Not Encrypted**: Visible in directory listings
3. **File Sizes Visible**: Approximate size can be determined
4. **Directory Structure Visible**: Path hierarchy is not hidden
5. **No Built-in Key Rotation**: Manual re-encryption required

## Next Steps

- **[Path-based API](./path-api.md)** - Core file operations
- **[Advanced CID API](./advanced-cid.md)** - Content verification
- **[API Reference](./api-reference.md)** - Complete API documentation
- **[S5 Encryption Spec](../../specification/encryption.md)** - Technical details
