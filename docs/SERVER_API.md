# S5.js Server API Documentation

## Overview
Node.js-compatible server wrapper for the S5.js library, providing REST API endpoints for storage operations and Vector DB integration.

## Server Implementation
- **File**: `src/server.ts`
- **Port**: 5522 (configurable via PORT env)
- **Environment Variables**:
  - `PORT` - Server port (default: 5522)
  - `S5_SEED_PHRASE` - Optional authentication seed phrase

## API Endpoints

### Health Check
- **GET** `/api/v1/health`
- Returns server status and S5 connection info
```json
{
  "status": "healthy",
  "s5": {
    "connected": boolean,
    "authenticated": boolean
  },
  "timestamp": "ISO-8601"
}
```

### Storage Operations (Vector DB Compatible)

#### Store Data
- **PUT** `/s5/fs/:type/:id`
- Stores JSON data by type and ID
- Body: JSON object
- Response: `{ "success": true, "key": "type/id" }`

#### Retrieve Data
- **GET** `/s5/fs/:type/:id`
- Retrieves stored data
- Response: Stored JSON object or 404

#### Delete Data
- **DELETE** `/s5/fs/:type/:id`
- Removes stored data
- Response: `{ "success": boolean }`

#### List Items
- **GET** `/s5/fs/:type`
- Lists all IDs for a given type
- Response: `{ "items": ["id1", "id2", ...] }`

### S5 Operations

#### Upload
- **POST** `/api/v1/upload`
- Uploads data to S5 network (when connected)
- Body: Binary data
- Response: `{ "cid": "...", "size": number }`

#### Download
- **GET** `/api/v1/download/:cid`
- Downloads data by CID
- Response: Binary data or error

## Implementation Details

### Storage Backend
- Uses MemoryLevelStore for Node.js compatibility (replaced IndexedDB)
- In-memory storage for development/testing
- Falls back to local storage when S5 network unavailable

### Network Connectivity
- Connects to S5 network peers:
  - s5.garden
  - node.sfive.net
- WebSocket polyfill for Node.js environment
- Graceful degradation when network unavailable

### Integration Points
- Designed for Fabstir Vector DB integration
- Provides storage backend for vector persistence
- Compatible with Phase 4.3.1 requirements

## Running the Server

```bash
# Build
npm run build

# Run
npm start

# With environment variables
PORT=5522 S5_SEED_PHRASE="your seed phrase" npm start
```

## Testing

```bash
# Health check
curl http://localhost:5522/api/v1/health

# Store data
curl -X PUT http://localhost:5522/s5/fs/vectors/test-1 \
  -H "Content-Type: application/json" \
  -d '{"data": "test"}'

# Retrieve data
curl http://localhost:5522/s5/fs/vectors/test-1
```

## Created for
Fabstir LLM Node - Phase 4.3.1: Real S5 Backend Integration
