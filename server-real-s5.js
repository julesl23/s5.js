// server-real-s5.js - Real S5 server implementation for Node.js
// Uses the same approach as test-fresh-s5.js which is proven to work

import express from 'express';
import cors from 'cors';
import { S5 } from './dist/src/index.js';
import { generatePhrase } from './dist/src/identity/seed_phrase/seed_phrase.js';

// Node.js polyfills - CRITICAL for S5 to work in Node.js
import { webcrypto } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream, WritableStream, TransformStream } from 'stream/web';
import { Blob, File } from 'buffer';
import { fetch, Headers, Request, Response, FormData } from 'undici';
import WebSocket from 'ws';
import 'fake-indexeddb/auto'; // This handles IndexedDB for Node.js

// Set up global polyfills - MUST be done before S5 initialization
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

const app = express();
app.use(cors());
// CRITICAL FIX: Parse all content as raw first, then specific types
app.use(express.raw({ type: '*/*', limit: '100mb' }));
app.use(express.text({ type: 'text/plain', limit: '100mb' }));
app.use(express.json({ type: 'application/json', limit: '100mb' }));

let s5Instance = null;
const uploadedFiles = new Map(); // Track uploaded files by CID -> path mapping
global.memoryStorage = new Map(); // Memory storage for simple key-value operations

async function initS5() {
    console.log('🚀 Initializing Real S5 Server...');
    console.log('═'.repeat(60));
    
    try {
        // Step 1: Create S5 instance (uses fake-indexeddb in Node.js)
        console.log('Creating S5 instance...');
        const s5 = await S5.create({
            initialPeers: [
                "wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p"
            ]
        });
        console.log('✅ S5 instance created');
        
        // Step 2: Handle seed phrase
        let seedPhrase = process.env.S5_SEED_PHRASE;
        
        if (!seedPhrase || seedPhrase === 'your-twelve-word-seed-phrase-here') {
            // Generate a new seed phrase if not provided
            console.log('No seed phrase provided, generating new one...');
            seedPhrase = generatePhrase(s5.api.crypto);
            console.log('📝 Generated new seed phrase (save this!):');
            console.log(`   S5_SEED_PHRASE="${seedPhrase}"`);
        } else {
            console.log('Using provided seed phrase from environment');
        }
        
        // Step 3: Recover identity from seed phrase
        console.log('Recovering identity from seed phrase...');
        await s5.recoverIdentityFromSeedPhrase(seedPhrase);
        console.log('✅ Identity recovered');
        
        // Step 4: Register on portal
        console.log('Registering on S5 portal (s5.vup.cx)...');
        try {
            await s5.registerOnNewPortal("https://s5.vup.cx");
            console.log('✅ Portal registration successful');
        } catch (error) {
            if (error.message?.includes('already has an account') || 
                error.message?.includes('already registered')) {
                console.log('✅ Already registered on portal');
            } else {
                throw error;
            }
        }
        
        // Step 5: Initialize filesystem
        console.log('Initializing filesystem...');
        await s5.fs.ensureIdentityInitialized();
        console.log('✅ Filesystem initialized');
        
        // Wait for registry propagation
        console.log('Waiting for registry propagation...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('═'.repeat(60));
        console.log('✅ S5 Real Mode fully initialized!');
        return s5;
        
    } catch (error) {
        console.error('❌ Failed to initialize S5:', error);
        throw error;
    }
}

// ===== STANDARD S5 PROTOCOL ENDPOINTS =====

// Standard S5 Blob Storage Endpoints
// PUT /s5/blob/:cid - Store a blob with its CID
app.put('/s5/blob/:cid', async (req, res) => {
    try {
        if (!s5Instance) {
            return res.status(503).json({ error: 'S5 not initialized' });
        }
        
        const { cid } = req.params;
        
        // Get the raw data from request body
        let dataToStore;
        if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
            dataToStore = JSON.stringify(req.body);
        } else if (Buffer.isBuffer(req.body)) {
            dataToStore = req.body;
        } else {
            dataToStore = req.body || '';
        }
        
        // Store in S5 using CID as path component
        const path = `blobs/${cid}`;
        console.log(`[S5 Blob PUT] Storing blob: ${cid}`);
        await s5Instance.fs.put(path, dataToStore);
        
        // Track the mapping
        uploadedFiles.set(cid, path);
        
        console.log(`✅ [S5 Blob] Stored: ${cid}`);
        res.status(201).json({ cid, stored: true });
        
    } catch (error) {
        console.error('[S5 Blob PUT] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /s5/blob/:cid - Retrieve a blob by CID
app.get('/s5/blob/:cid', async (req, res) => {
    try {
        if (!s5Instance) {
            return res.status(503).json({ error: 'S5 not initialized' });
        }
        
        const { cid } = req.params;
        const path = uploadedFiles.get(cid) || `blobs/${cid}`;
        
        console.log(`[S5 Blob GET] Retrieving blob: ${cid}`);
        
        try {
            const content = await s5Instance.fs.get(path);
            
            // Set appropriate content type
            res.set('Content-Type', 'application/octet-stream');
            
            // Try to parse as JSON for proper response
            try {
                const parsed = JSON.parse(content);
                res.json(parsed);
            } catch {
                // Send as raw data if not JSON
                res.send(content);
            }
            
            console.log(`✅ [S5 Blob] Retrieved: ${cid}`);
        } catch (fetchError) {
            console.log(`[S5 Blob GET] Not found: ${cid}`);
            return res.status(404).json({ error: 'Blob not found' });
        }
        
    } catch (error) {
        console.error('[S5 Blob GET] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// HEAD /s5/blob/:cid - Check if blob exists
app.head('/s5/blob/:cid', async (req, res) => {
    try {
        if (!s5Instance) {
            return res.status(503).send();
        }
        
        const { cid } = req.params;
        const path = uploadedFiles.get(cid) || `blobs/${cid}`;
        
        console.log(`[S5 Blob HEAD] Checking blob: ${cid}`);
        
        try {
            // Try to get metadata to check existence
            await s5Instance.fs.getMetadata(path);
            res.status(200).send();
            console.log(`✅ [S5 Blob HEAD] Exists: ${cid}`);
        } catch {
            res.status(404).send();
            console.log(`[S5 Blob HEAD] Not found: ${cid}`);
        }
        
    } catch (error) {
        console.error('[S5 Blob HEAD] Error:', error);
        res.status(500).send();
    }
});

// ===== S5 FILESYSTEM COMPATIBILITY ENDPOINTS (for Vector DB) =====

// Helper function to convert path to CID
async function pathToCid(path) {
    const encoder = new TextEncoder();
    const data = encoder.encode(path);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return 'b' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

// PUT /s5/fs/:path - Store data at a path (using memory storage for simplicity)
app.put(/^\/s5\/fs(\/.*)?$/, async (req, res) => {
    try {
        // Get the full path from the URL (everything after /s5/fs/)
        const fullPath = req.path.replace(/^\/s5\/fs\/?/, '');
        const fsPath = fullPath || '';
        
        // Get the raw data from request body
        let dataToStore;
        
        if (Buffer.isBuffer(req.body)) {
            // Keep as Buffer - DO NOT convert to string (preserves binary data)
            dataToStore = req.body;
        } else if (req.body && typeof req.body === 'object') {
            // JSON object
            dataToStore = JSON.stringify(req.body);
        } else if (typeof req.body === 'string') {
            // Plain text
            dataToStore = req.body;
        } else {
            dataToStore = req.body || '';
        }
        
        // Store in memory (simple key-value storage)
        const storageKey = `fs:${fsPath}`;
        global.memoryStorage.set(storageKey, dataToStore);
        
        // Generate CID from path for consistency
        const cid = await pathToCid(fsPath);
        uploadedFiles.set(cid, storageKey);
        
        console.log(`✅ [S5 FS] Stored in memory: ${fsPath}`);
        res.status(201).json({ path: fsPath, stored: true });
        
    } catch (error) {
        console.error('[S5 FS PUT] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /s5/fs/:path - Retrieve data from a path
app.get(/^\/s5\/fs(\/.*)?$/, async (req, res) => {
    try {
        // Get the full path from the URL
        const fullPath = req.path.replace(/^\/s5\/fs\/?/, '');
        const fsPath = fullPath || '';
        const storageKey = `fs:${fsPath}`;
        
        console.log(`[S5 FS GET] Retrieving from memory: ${fsPath}`);
        
        // Try to get from memory storage
        const content = global.memoryStorage.get(storageKey);
        
        if (content !== undefined) {
            if (Buffer.isBuffer(content)) {
                // Send binary data as-is
                res.set('Content-Type', 'application/octet-stream');
                res.send(content);
            } else if (typeof content === 'string') {
                // Try to parse as JSON for proper response
                try {
                    const parsed = JSON.parse(content);
                    res.json(parsed);
                } catch {
                    // Send as plain text
                    res.set('Content-Type', 'text/plain');
                    res.send(content);
                }
            } else {
                // Fallback
                res.send(content);
            }
            console.log(`✅ [S5 FS] Retrieved from memory: ${fsPath}`);
        } else {
            console.log(`[S5 FS GET] Not found: ${fsPath}`);
            return res.status(404).json({ error: 'Path not found' });
        }
        
    } catch (error) {
        console.error('[S5 FS GET] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /s5/fs/:path - Delete data at a path
app.delete(/^\/s5\/fs(\/.*)?$/, async (req, res) => {
    try {
        // Get the full path from the URL
        const fullPath = req.path.replace(/^\/s5\/fs\/?/, '');
        const fsPath = fullPath || '';
        const storageKey = `fs:${fsPath}`;
        
        console.log(`[S5 FS DELETE] Deleting: ${fsPath}`);
        
        if (global.memoryStorage.has(storageKey)) {
            global.memoryStorage.delete(storageKey);
            
            // Remove from tracking
            const cid = await pathToCid(fsPath);
            uploadedFiles.delete(cid);
            
            console.log(`✅ [S5 FS] Deleted from memory: ${fsPath}`);
            res.status(200).json({ path: fsPath, deleted: true });
        } else {
            return res.status(404).json({ error: 'Path not found' });
        }
        
    } catch (error) {
        console.error('[S5 FS DELETE] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===== BACKWARD COMPATIBILITY ENDPOINTS (deprecated but kept for transition) =====

// Legacy upload endpoint - redirect to new S5 standard
app.post('/api/v0/upload', async (req, res) => {
    try {
        if (!s5Instance) {
            return res.status(503).json({ error: 'S5 not initialized' });
        }
        
        console.log('[LEGACY] Upload request - redirecting to S5 standard endpoint');
        
        // Generate a CID for this upload
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const cid = 'b' + timestamp.toString(16) + randomId;
        
        // Store using standard blob endpoint logic
        let dataToStore;
        if (req.body && Object.keys(req.body).length > 0) {
            dataToStore = JSON.stringify(req.body);
        } else {
            dataToStore = JSON.stringify({ timestamp, empty: true });
        }
        
        const path = `blobs/${cid}`;
        await s5Instance.fs.put(path, dataToStore);
        uploadedFiles.set(cid, path);
        
        console.log(`✅ [LEGACY] Uploaded: ${cid}`);
        res.json({ cid, message: 'Please use PUT /s5/blob/:cid for future uploads' });
        
    } catch (error) {
        console.error('[LEGACY] Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Legacy download endpoint - redirect to new S5 standard
app.get('/api/v0/download/:cid', async (req, res) => {
    try {
        if (!s5Instance) {
            return res.status(503).json({ error: 'S5 not initialized' });
        }
        
        console.log('[LEGACY] Download request - redirecting to S5 standard endpoint');
        
        const { cid } = req.params;
        const path = uploadedFiles.get(cid) || `blobs/${cid}`;
        
        try {
            const content = await s5Instance.fs.get(path);
            
            try {
                const data = JSON.parse(content);
                res.json({ data, message: 'Please use GET /s5/blob/:cid for future downloads' });
            } catch {
                res.json({ data: content, message: 'Please use GET /s5/blob/:cid for future downloads' });
            }
        } catch {
            return res.status(404).json({ error: 'CID not found' });
        }
        
    } catch (error) {
        console.error('[LEGACY] Download error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint (keep as is)
app.get('/health', (req, res) => {
    res.json({
        status: s5Instance ? 'healthy' : 'initializing',
        mode: 'real',
        portal: 's5.vup.cx',
        s5_connected: s5Instance !== null,
        protocol: 'S5 Standard',
        endpoints: {
            blob: [
                'PUT /s5/blob/:cid',
                'GET /s5/blob/:cid',
                'HEAD /s5/blob/:cid'
            ],
            filesystem: [
                'PUT /s5/fs/:path',
                'GET /s5/fs/:path',
                'DELETE /s5/fs/:path'
            ],
            legacy: [
                'POST /api/v0/upload (deprecated)',
                'GET /api/v0/download/:cid (deprecated)'
            ]
        },
        uploads_tracked: uploadedFiles.size,
        timestamp: new Date().toISOString()
    });
});

// List endpoint - enhanced to show both blob and fs storage
app.get('/api/v0/list', async (req, res) => {
    try {
        if (!s5Instance) {
            return res.status(503).json({ error: 'S5 not initialized' });
        }
        
        const blobs = [];
        const fsFiles = [];
        
        // List blobs
        try {
            for await (const item of s5Instance.fs.list('blobs')) {
                blobs.push({
                    name: item.name,
                    type: item.type,
                    size: item.size
                });
            }
        } catch (e) {
            console.log('No blobs directory yet');
        }
        
        // List fs files
        try {
            for await (const item of s5Instance.fs.list('fs')) {
                fsFiles.push({
                    name: item.name,
                    type: item.type,
                    size: item.size
                });
            }
        } catch (e) {
            console.log('No fs directory yet');
        }
        
        res.json({
            tracked_cids: Array.from(uploadedFiles.entries()).map(([cid, path]) => ({ cid, path })),
            blobs,
            fs_files: fsFiles,
            message: 'Use S5 standard endpoints: /s5/blob/* and /s5/fs/*'
        });
        
    } catch (error) {
        console.error('List error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 5522;

console.log('Starting S5 Real Server...');
console.log(`Port: ${PORT}`);
console.log(`Mode: REAL (connected to s5.vup.cx)`);

initS5()
    .then(s5 => {
        s5Instance = s5;
        app.listen(PORT, '0.0.0.0', () => {
            console.log('═'.repeat(60));
            console.log(`🚀 S5 Real Server running on port ${PORT}`);
            console.log(`📡 Connected to S5 portal: https://s5.vup.cx`);
            console.log(`🔍 Health check: http://localhost:${PORT}/health`);
            console.log('═'.repeat(60));
        });
    })
    .catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down S5 server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down S5 server...');
    process.exit(0);
});