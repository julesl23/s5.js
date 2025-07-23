# S5.js Test Server

A minimal HTTP wrapper for enhanced S5.js to enable integration testing with external services (like Rust vector databases).

## Features

- Minimal Express server exposing S5.js filesystem operations via HTTP
- Mock storage backend (no S5 portal required)
- Binary data support (CBOR, etc.)
- Simple REST API for path-based operations

## Setup

1. Build the S5.js project first:
```bash
npm run build
```

2. Start the test server:
```bash
node test-server.js
```

The server will start on port 5522 (configurable via PORT environment variable).

## API Endpoints

### Health Check
```bash
GET /health
```
Returns server status and version info.

### Store Data
```bash
PUT /s5/fs/{path}
```
Store data at the specified path. Supports any content type.

Example:
```bash
curl -X PUT http://localhost:5522/s5/fs/test.txt -d "Hello World"
curl -X PUT http://localhost:5522/s5/fs/data.cbor -H "Content-Type: application/cbor" --data-binary @data.cbor
```

### Retrieve Data
```bash
GET /s5/fs/{path}
```
Retrieve data from the specified path.

Example:
```bash
curl http://localhost:5522/s5/fs/test.txt
```

### List Directory
```bash
GET /s5/fs/{path}/
```
List contents of a directory (note the trailing slash).

Example:
```bash
curl http://localhost:5522/s5/fs/
curl http://localhost:5522/s5/fs/data/
```

### Delete Data
```bash
DELETE /s5/fs/{path}
```
Delete data at the specified path.

Example:
```bash
curl -X DELETE http://localhost:5522/s5/fs/test.txt
```

## Testing

Run the included test script:
```bash
./test-server-examples.sh
```

## Integration with Rust Vector Database

Your Rust vector database can interact with this server using standard HTTP requests:

```rust
// Example Rust code
let client = reqwest::Client::new();

// Store CBOR data
let cbor_data = vec![...]; // Your CBOR-encoded vector
let response = client
    .put("http://localhost:5522/s5/fs/vectors/my-vector.cbor")
    .header("Content-Type", "application/cbor")
    .body(cbor_data)
    .send()
    .await?;

// Retrieve CBOR data
let data = client
    .get("http://localhost:5522/s5/fs/vectors/my-vector.cbor")
    .send()
    .await?
    .bytes()
    .await?;
```

## Notes

- This server uses mock storage (in-memory) and is intended for testing only
- All data is lost when the server restarts
- No authentication is implemented
- Maximum request size is 50MB (configurable in the code)
- The server automatically handles HAMT sharding for directories with 1000+ entries