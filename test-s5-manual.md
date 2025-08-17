# Manual Testing Guide for S5 Standard Protocol

## Start the Server
```bash
node server-real-s5.js
```

## Test S5 Standard Endpoints

### 1. S5 Filesystem Endpoints (Vector DB Compatible)

Store data at a path:
```bash
curl -X PUT http://localhost:5522/s5/fs/test-key \
  -H "Content-Type: text/plain" \
  -d "test-data"
```

Retrieve data from a path:
```bash
curl http://localhost:5522/s5/fs/test-key
```

Store JSON data:
```bash
curl -X PUT http://localhost:5522/s5/fs/config/settings \
  -H "Content-Type: application/json" \
  -d '{"theme": "dark", "language": "en"}'
```

Delete data at a path:
```bash
curl -X DELETE http://localhost:5522/s5/fs/test-key
```

### 2. S5 Blob Storage Endpoints

Store a blob with CID:
```bash
curl -X PUT http://localhost:5522/s5/blob/bafy123abc \
  -H "Content-Type: text/plain" \
  -d "This is my blob content"
```

Retrieve a blob:
```bash
curl http://localhost:5522/s5/blob/bafy123abc
```

Check if blob exists:
```bash
curl -I http://localhost:5522/s5/blob/bafy123abc
# Returns 200 if exists, 404 if not
```

### 3. Health Check
```bash
curl http://localhost:5522/health | jq '.'
```

The health endpoint now shows all available S5 standard endpoints.

### 4. Legacy Endpoints (Still Work but Deprecated)
```bash
# Old upload endpoint
curl -X POST http://localhost:5522/api/v0/upload \
  -H "Content-Type: application/json" \
  -d '{"data": "legacy"}'

# Returns deprecation notice with the CID
```

## Expected Responses

### Successful PUT to /s5/fs/
```json
{
  "path": "test-key",
  "cid": "b...",
  "stored": true
}
```

### Successful PUT to /s5/blob/
```json
{
  "cid": "bafy123abc",
  "stored": true
}
```

### Health Check Response
```json
{
  "status": "healthy",
  "mode": "real",
  "portal": "s5.vup.cx",
  "s5_connected": true,
  "protocol": "S5 Standard",
  "endpoints": {
    "blob": [
      "PUT /s5/blob/:cid",
      "GET /s5/blob/:cid",
      "HEAD /s5/blob/:cid"
    ],
    "filesystem": [
      "PUT /s5/fs/:path",
      "GET /s5/fs/:path",
      "DELETE /s5/fs/:path"
    ],
    "legacy": [
      "POST /api/v0/upload (deprecated)",
      "GET /api/v0/download/:cid (deprecated)"
    ]
  },
  "uploads_tracked": 0,
  "timestamp": "2025-08-17T..."
}
```