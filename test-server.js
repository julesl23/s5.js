// Minimal HTTP wrapper for testing vector database integration
import express from 'express';
import { webcrypto } from 'crypto';
import { FS5 } from './dist/src/fs/fs5.js';
import { JSCryptoImplementation } from './dist/src/api/crypto/js.js';

// Make webcrypto available globally for crypto operations
if (!global.crypto) {
  global.crypto = webcrypto;
}

// Mock S5 API implementation (adapted from test-utils.ts)
class MockS5API {
  constructor() {
    this.crypto = {
      ...new JSCryptoImplementation(),
      hashBlake3Sync: (data) => {
        // Simple mock hash - just use first 32 bytes or pad
        const hash = new Uint8Array(32);
        for (let i = 0; i < Math.min(data.length, 32); i++) {
          hash[i] = data[i];
        }
        return hash;
      },
      hashBlake3Blob: async (blob) => {
        const data = new Uint8Array(await blob.arrayBuffer());
        return this.crypto.hashBlake3Sync(data);
      },
      generateSecureRandomBytes: (size) => {
        const bytes = new Uint8Array(size);
        crypto.getRandomValues(bytes);
        return bytes;
      },
      newKeyPairEd25519: async (seed) => {
        return {
          publicKey: seed,
          privateKey: seed
        };
      },
      encryptXChaCha20Poly1305: async (key, nonce, plaintext) => {
        // Simple mock - just return plaintext with 16-byte tag
        return new Uint8Array([...plaintext, ...new Uint8Array(16)]);
      },
      decryptXChaCha20Poly1305: async (key, nonce, ciphertext) => {
        // Simple mock - remove tag
        return ciphertext.subarray(0, ciphertext.length - 16);
      },
      signRawRegistryEntry: async (keyPair, entry) => {
        // Simple mock signature
        return new Uint8Array(64);
      },
      signEd25519: async (keyPair, message) => {
        // Simple mock signature
        return new Uint8Array(64);
      }
    };
    
    this.storage = new Map();
    this.registryEntries = new Map();
  }

  async uploadBlob(blob) {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = this.crypto.hashBlake3Sync(data);
    const key = Buffer.from(hash).toString('hex');
    this.storage.set(key, data);
    return { hash: new Uint8Array([0x1e, ...hash]), size: blob.size };
  }

  async downloadBlobAsBytes(hash) {
    // If hash has multihash prefix, remove it
    const actualHash = hash[0] === 0x1e ? hash.slice(1) : hash;
    const key = Buffer.from(actualHash).toString('hex');
    const data = this.storage.get(key);
    if (!data) throw new Error("Blob not found");
    return data;
  }

  async registryGet(publicKey) {
    const key = Buffer.from(publicKey).toString('hex');
    const entry = this.registryEntries.get(key);
    return entry || undefined;
  }

  async registrySet(entry) {
    const key = Buffer.from(entry.pk).toString('hex');
    this.registryEntries.set(key, entry);
  }
  
  async registryListenOnEntry(publicKey, callback) {
    // Mock implementation - just return a no-op unsubscribe function
    return () => {};
  }
}

// Mock identity for testing
class MockIdentity {
  constructor() {
    this.fsRootKey = new Uint8Array(32).fill(1);
  }
}

// Initialize S5 with mock storage
const api = new MockS5API();
const identity = new MockIdentity();
const fs = new FS5(api, identity);

// Create Express app
const app = express();

// Middleware to handle raw binary data
app.use(express.raw({ 
  type: '*/*', 
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mockStorage: true,
    server: 's5.js test server',
    version: '0.1.0'
  });
});

// Helper to extract path from URL
function extractPath(url) {
  // Remove /s5/fs/ prefix
  const match = url.match(/^\/s5\/fs\/(.*)$/);
  return match ? match[1] : '';
}

// PUT /s5/fs/* - Store data at path
app.put(/^\/s5\/fs\/(.*)$/, async (req, res) => {
  try {
    const path = extractPath(req.path);
    if (!path) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    // Get the raw body data
    const data = req.rawBody || req.body;
    if (!data) {
      return res.status(400).json({ error: 'No data provided' });
    }

    // Get content type from header or default to application/octet-stream
    const contentType = req.get('content-type') || 'application/octet-stream';
    
    // Store the data
    await fs.put(path, data, {
      metadata: {
        contentType: contentType,
        timestamp: Date.now()
      }
    });

    res.status(201).json({ 
      success: true, 
      path: path,
      size: data.length
    });
  } catch (error) {
    console.error('PUT error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /s5/fs/* - Retrieve data or list directory
app.get(/^\/s5\/fs\/(.*)$/, async (req, res) => {
  try {
    const path = extractPath(req.path);
    
    // Check if this is a list operation (ends with /)
    if (req.path.endsWith('/')) {
      // List directory
      const results = [];
      for await (const item of fs.list(path)) {
        results.push({
          name: item.name,
          type: item.type,
          size: item.size,
          created: item.created,
          modified: item.modified
        });
      }
      
      res.json({
        path: path,
        entries: results
      });
    } else {
      // Get file
      const data = await fs.get(path);
      
      if (data === null) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Determine content type from path extension
      const ext = path.split('.').pop().toLowerCase();
      let contentType = 'application/octet-stream';
      
      const contentTypes = {
        'txt': 'text/plain',
        'json': 'application/json',
        'cbor': 'application/cbor',
        'bin': 'application/octet-stream'
      };
      
      if (contentTypes[ext]) {
        contentType = contentTypes[ext];
      }

      // Send binary data
      res.set('Content-Type', contentType);
      res.send(Buffer.from(data));
    }
  } catch (error) {
    console.error('GET error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Path not found' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// DELETE /s5/fs/* - Delete path
app.delete(/^\/s5\/fs\/(.*)$/, async (req, res) => {
  try {
    const path = extractPath(req.path);
    if (!path) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    await fs.delete(path);
    
    res.json({ 
      success: true, 
      path: path,
      deleted: true
    });
  } catch (error) {
    console.error('DELETE error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Path not found' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 5522;
app.listen(PORT, () => {
  console.log(`S5.js test server running on http://localhost:${PORT}`);
  console.log('Mock storage: enabled');
  console.log('Available endpoints:');
  console.log('  GET  /health');
  console.log('  PUT  /s5/fs/*');
  console.log('  GET  /s5/fs/*');
  console.log('  DELETE /s5/fs/*');
});