# Real S5 Server - Production Ready

This is a **REAL S5 server** that connects to the actual S5 network (s5.vup.cx) instead of using mock data.

## ✅ Status: FULLY WORKING

All tests pass (5/5) with real S5 portal integration!

## Quick Start

### Option 1: Run Locally (Development)

```bash
# Install dependencies if not already installed
npm install

# Build the project
npm run build

# Set your seed phrase (or let it generate one)
export S5_SEED_PHRASE="your twelve word seed phrase here"

# Run the server
node server-real-s5.js
```

### Option 2: Docker Deployment (Production)

```bash
# Deploy with the script (handles everything)
./deploy-real-s5.sh

# Or manually with Docker
docker build -f Dockerfile.real-s5 -t s5-real:latest .
docker run -d \
  --name s5-real-server \
  -p 5522:5522 \
  -e S5_SEED_PHRASE="$S5_SEED_PHRASE" \
  s5-real:latest
```

### Option 3: Docker Compose

```bash
# Using docker-compose
docker-compose -f docker-compose.real-s5.yml up -d

# View logs
docker-compose -f docker-compose.real-s5.yml logs -f
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check - returns server status |
| POST | `/api/v0/upload` | Upload JSON data to S5 network |
| GET | `/api/v0/download/:cid` | Download data by CID |
| GET | `/api/v0/list` | List all uploaded files |

## Testing

Run the test suite to verify everything works:

```bash
./test-real-s5-server.sh
```

Expected output: All 5 tests passing ✅

## Key Features

- ✅ **Real S5 Network**: Connected to s5.vup.cx portal
- ✅ **Node.js Compatible**: Uses fake-indexeddb for Node environment
- ✅ **Persistent Storage**: Data stored on actual S5 network
- ✅ **Full API Compatibility**: Drop-in replacement for mock server
- ✅ **Production Ready**: Docker support with health checks

## Implementation Details

### How It Works

1. **Polyfills**: Sets up Node.js polyfills for browser APIs (crypto, WebSocket, IndexedDB)
2. **S5 Initialization**: Creates S5 instance and connects to real peers
3. **Identity**: Uses seed phrase for authentication
4. **Portal Registration**: Registers with s5.vup.cx (or uses existing registration)
5. **Filesystem**: Initializes S5 filesystem for data storage
6. **API Server**: Express server provides REST API endpoints

### Key Differences from Mock

- **Real Network**: Actually connects to S5 network peers
- **Persistent Storage**: Data is stored on the decentralized network
- **Authentication**: Uses real S5 identity with seed phrase
- **Network Latency**: Operations take 1-2 seconds (real network calls)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `S5_SEED_PHRASE` | Your 15-word S5 seed phrase | Auto-generated if not set |
| `PORT` | Server port | 5522 |

## Stopping Mock Server

If you have the mock server running, stop it first:

```bash
# Stop mock container
docker stop fabstir-llm-marketplace-s5-node-1

# Or stop any S5 server on port 5522
docker ps | grep 5522
docker stop <container_id>
```

## Troubleshooting

### Server won't start
- Check port 5522 is free: `lsof -i :5522`
- Stop other servers: `pkill -f "node.*server"`

### "Already registered" error
- This is normal - the server handles it automatically

### Slow operations
- Real S5 network operations take 1-2 seconds
- This is normal network latency

## Success Metrics

The server is working correctly when:
- ✅ Health check returns `{"status":"healthy","mode":"real"}`
- ✅ Uploads return a CID
- ✅ Downloads retrieve the uploaded data
- ✅ List shows uploaded files
- ✅ All tests pass (5/5)

## Files Created

- `server-real-s5.js` - Main server implementation
- `Dockerfile.real-s5` - Docker container definition
- `docker-compose.real-s5.yml` - Docker Compose configuration
- `deploy-real-s5.sh` - Automated deployment script
- `test-real-s5-server.sh` - Test suite

## Next Steps

1. **Set your seed phrase**: Export `S5_SEED_PHRASE` environment variable
2. **Deploy**: Run `./deploy-real-s5.sh`
3. **Test**: Run `./test-real-s5-server.sh`
4. **Use**: Replace mock server URL with `http://localhost:5522`

---

**Status**: Production Ready ✅  
**Network**: Real S5 (s5.vup.cx) 🌐  
**Tests**: 5/5 Passing 🎉