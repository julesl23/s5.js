import express from 'express';
import { WebSocket } from 'ws';
import { S5Node } from './node/node.js';
import { S5UserIdentity } from './identity/identity.js';
import { S5APIWithIdentity } from './identity/api.js';
import { JSCryptoImplementation } from './api/crypto/js.js';
import { MemoryLevelStore } from './kv/memory_level.js';
import { BlobIdentifier } from './identifier/blob.js';
import type { Request, Response } from 'express';
import type { S5APIInterface } from './api/s5.js';

// Polyfill WebSocket for Node.js
(globalThis as any).WebSocket = WebSocket;

const app = express();
const PORT = process.env.PORT || 5522;
const S5_SEED_PHRASE = process.env.S5_SEED_PHRASE;

let s5Api: S5APIInterface;
let userIdentity: S5UserIdentity | undefined;

// Simple in-memory storage for demo purposes
// In production, use a proper database or file storage
const localBlobStorage = new Map<string, Buffer>();

// Add in-memory storage for vector-db compatibility
const storage = new Map<string, any>();

// Middleware to parse both JSON and raw binary data
app.use(express.json()); // Parse JSON bodies
app.use(express.raw({ type: '*/*', limit: '100mb' })); // Parse raw binary for other content types

// Initialize S5 client with Node.js-compatible storage
async function initializeS5() {
  try {
    // Create crypto implementation
    const crypto = new JSCryptoImplementation();
    
    // Create S5 node with memory storage (Node.js compatible)
    const node = new S5Node(crypto);
    
    // Initialize with memory-level store instead of IndexedDB
    await node.init(async (name: string) => {
      return await MemoryLevelStore.open();
    });
    
    // Connect to default peers with error handling
    const defaultPeers = [
      'wss://z2Das8aEF7oNoxkcrfvzerZ1iBPWfm6D7gy3hVE4ALGSpVB@node.sfive.net/s5/p2p',
      'wss://z2DdbxV4xyoqWck5pXXJdVzRnwQC6Gbv6o7xDvyZvzKUfuj@s5.vup.dev/s5/p2p',
      'wss://z2DWuWNZcdSyZLpXFK2uCU3haaWMXrDAgxzv17sDEMHstZb@s5.garden/s5/p2p',
    ];
    
    // Try to connect to peers but don't fail if connections fail
    // We'll wrap the connections to handle errors gracefully
    let connectedPeers = 0;
    for (const uri of defaultPeers) {
      try {
        // The connectToNode method doesn't throw immediately, but we can add error handling
        // to the WebSocket after it's created
        const peerName = uri.split('@')[1];
        console.log(`Attempting to connect to peer: ${peerName}`);
        
        // Connect to the node
        node.p2p.connectToNode(uri);
        
        // Get the peer and add error handling
        const peer = node.p2p.peers.get(uri);
        if (peer && peer.socket) {
          peer.socket.onerror = (error) => {
            console.warn(`WebSocket error for ${peerName}:`, error);
          };
          peer.socket.onclose = () => {
            console.log(`Disconnected from ${peerName}`);
          };
          // Track successful connections
          peer.socket.onopen = () => {
            connectedPeers++;
            console.log(`Connected to ${peerName}`);
          };
        }
      } catch (error) {
        console.warn(`Failed to initiate connection to peer:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    // Don't wait for network initialization if connections fail
    // The server can still work for local operations
    try {
      // Wait briefly for connections with a timeout
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Network initialization timeout')), 5000)
      );
      await Promise.race([node.ensureInitialized(), timeout]);
      console.log('Successfully connected to S5 network');
    } catch (error) {
      console.warn('Could not connect to S5 network, continuing in offline mode');
      console.warn('Note: Upload/download operations may be limited');
    }
    
    // Set up API with or without identity
    if (S5_SEED_PHRASE) {
      // Create user identity from seed phrase
      userIdentity = await S5UserIdentity.fromSeedPhrase(S5_SEED_PHRASE, crypto);
      
      // Create auth store
      const authStore = await MemoryLevelStore.open();
      
      // Create API with identity
      const apiWithIdentity = new S5APIWithIdentity(node, userIdentity, authStore);
      await apiWithIdentity.initStorageServices();
      
      s5Api = apiWithIdentity;
      console.log('User identity initialized from seed phrase');
    } else {
      // Use node directly as API
      s5Api = node;
    }

    console.log(`S5 client initialized and connected to network`);
    return true;
  } catch (error) {
    console.error('Failed to initialize S5 client:', error);
    return false;
  }
}

// Health check endpoint
app.get('/api/v1/health', async (req: Request, res: Response) => {
  try {
    const health = {
      status: 'healthy',
      s5: {
        connected: !!s5Api,
        authenticated: !!userIdentity
      },
      timestamp: new Date().toISOString()
    };
    res.json(health);
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Upload endpoint
app.post('/api/v1/upload', async (req: Request, res: Response) => {
  try {
    if (!s5Api) {
      return res.status(503).json({ error: 'S5 API not initialized' });
    }

    const data = req.body as Buffer;
    if (!data || data.length === 0) {
      return res.status(400).json({ error: 'No data provided' });
    }

    // Check if we have authentication (required for actual S5 uploads)
    if (!userIdentity) {
      // Without authentication, we can only store locally and generate a CID
      // This is a simplified implementation for testing
      const crypto = s5Api.crypto;
      // Ensure data is a Uint8Array
      const dataArray = new Uint8Array(data);
      const hash = crypto.hashBlake3Sync(dataArray);
      const blobId = new BlobIdentifier(
        new Uint8Array([0x1f, ...hash]), // MULTIHASH_BLAKE3 prefix
        dataArray.length
      );
      
      // Store locally in memory
      const cidString = blobId.toString();
      localBlobStorage.set(cidString, data);
      console.log(`Stored blob locally with CID: ${cidString}`);
      
      res.json({ 
        cid: cidString,
        size: data.length,
        timestamp: new Date().toISOString(),
        note: 'Stored locally (no S5 authentication)'
      });
    } else {
      // With authentication, upload to S5 network
      const blob = new Blob([data as BlobPart]);
      const blobId = await s5Api.uploadBlob(blob);
      
      res.json({ 
        cid: blobId.toString(),
        size: data.length,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    });
  }
});

// Download endpoint
app.get('/api/v1/download/:cid', async (req: Request, res: Response) => {
  try {
    if (!s5Api) {
      return res.status(503).json({ error: 'S5 API not initialized' });
    }

    const { cid } = req.params;
    if (!cid) {
      return res.status(400).json({ error: 'CID parameter required' });
    }

    // First check local storage
    if (localBlobStorage.has(cid)) {
      const data = localBlobStorage.get(cid)!;
      console.log(`Serving blob from local storage: ${cid}`);
      
      res.set('Content-Type', 'application/octet-stream');
      res.set('X-CID', cid);
      res.set('X-Source', 'local');
      res.send(data);
      return;
    }

    // If not in local storage, try to download from S5 network
    try {
      const blobId = BlobIdentifier.decode(cid);
      const data = await s5Api.downloadBlobAsBytes(blobId.hash);
      
      if (!data) {
        return res.status(404).json({ error: 'Content not found' });
      }

      // Set appropriate headers and send binary data
      res.set('Content-Type', 'application/octet-stream');
      res.set('X-CID', cid);
      res.set('X-Source', 's5-network');
      res.send(Buffer.from(data));
    } catch (downloadError) {
      // If download fails, return not found
      console.error('Download from S5 failed:', downloadError);
      res.status(404).json({ error: 'Content not found in local storage or S5 network' });
    }
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Download failed' 
    });
  }
});

// Storage endpoints for vector-db
app.put('/s5/fs/:type/:id', (req: Request, res: Response) => {
  const { type, id } = req.params;
  const key = `${type}/${id}`;
  storage.set(key, req.body);
  console.log(`Stored ${key}`);
  res.json({ success: true, key });
});

app.get('/s5/fs/:type/:id', (req: Request, res: Response) => {
  const { type, id } = req.params;
  const key = `${type}/${id}`;
  const data = storage.get(key);
  if (data) {
    res.json(data);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.delete('/s5/fs/:type/:id', (req: Request, res: Response) => {
  const { type, id } = req.params;
  const key = `${type}/${id}`;
  const deleted = storage.delete(key);
  res.json({ success: deleted });
});

// List endpoint
app.get('/s5/fs/:type', (req: Request, res: Response) => {
  const { type } = req.params;
  const items = Array.from(storage.keys())
    .filter(key => key.startsWith(`${type}/`))
    .map(key => key.split('/')[1]);
  res.json({ items });
});

// Start server
async function startServer() {
  const initialized = await initializeS5();
  
  if (!initialized) {
    console.error('Failed to initialize S5 client. Server will run with limited functionality.');
  }

  app.listen(PORT, () => {
    console.log(`S5 Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/v1/health`);
    if (S5_SEED_PHRASE) {
      console.log('Authentication: Enabled (seed phrase provided)');
    } else {
      console.log('Authentication: Disabled (no seed phrase provided)');
    }
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down S5 server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down S5 server...');
  process.exit(0);
});

// Start the server
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});