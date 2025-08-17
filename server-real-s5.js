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
app.use(express.json());
app.use(express.raw({ type: 'application/octet-stream', limit: '100mb' }));

let s5Instance = null;
const uploadedFiles = new Map(); // Track uploaded files by CID -> path mapping

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

// Upload endpoint - compatible with vector-db expectations
app.post('/api/v0/upload', async (req, res) => {
    try {
        if (!s5Instance) {
            return res.status(503).json({ error: 'S5 not initialized' });
        }
        
        // Generate unique path and CID
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const filename = `upload_${timestamp}_${randomId}.json`;
        const path = `home/uploads/${filename}`;
        
        // Determine what data to store
        let dataToStore;
        if (req.body && Object.keys(req.body).length > 0) {
            dataToStore = JSON.stringify(req.body);
        } else if (req.rawBody) {
            dataToStore = req.rawBody;
        } else {
            dataToStore = JSON.stringify({ timestamp, empty: true });
        }
        
        // Store data in S5
        console.log(`Uploading to S5: ${path}`);
        await s5Instance.fs.put(path, dataToStore);
        
        // Generate a CID (using path hash for consistency)
        const encoder = new TextEncoder();
        const data = encoder.encode(path);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const cid = 'b' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
        
        // Store mapping
        uploadedFiles.set(cid, path);
        
        console.log(`✅ Uploaded: ${cid} -> ${path}`);
        res.json({ cid });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Download endpoint
app.get('/api/v0/download/:cid', async (req, res) => {
    try {
        if (!s5Instance) {
            return res.status(503).json({ error: 'S5 not initialized' });
        }
        
        const { cid } = req.params;
        const path = uploadedFiles.get(cid);
        
        if (!path) {
            console.log(`CID not found: ${cid}`);
            return res.status(404).json({ error: 'CID not found' });
        }
        
        console.log(`Downloading from S5: ${cid} -> ${path}`);
        const content = await s5Instance.fs.get(path);
        
        // Try to parse as JSON, otherwise return as-is
        try {
            const data = JSON.parse(content);
            res.json({ data });
        } catch {
            res.json({ data: content });
        }
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: s5Instance ? 'healthy' : 'initializing',
        mode: 'real',
        portal: 's5.vup.cx',
        s5_connected: s5Instance !== null,
        uploads_tracked: uploadedFiles.size,
        timestamp: new Date().toISOString()
    });
});

// List uploaded files (useful for debugging)
app.get('/api/v0/list', async (req, res) => {
    try {
        if (!s5Instance) {
            return res.status(503).json({ error: 'S5 not initialized' });
        }
        
        const uploads = [];
        for await (const item of s5Instance.fs.list('home/uploads')) {
            uploads.push({
                name: item.name,
                type: item.type,
                size: item.size
            });
        }
        
        res.json({
            tracked_cids: Array.from(uploadedFiles.entries()).map(([cid, path]) => ({ cid, path })),
            s5_files: uploads
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