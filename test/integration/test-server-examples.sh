#!/bin/bash

# Example usage of the S5.js test server
# Run this after starting the server with: node test-server.js

echo "Testing S5.js HTTP server..."
echo ""

# 1. Health check
echo "1. Health check:"
curl -s http://localhost:5522/health
echo -e "\n"

# 2. Store text data
echo "2. Storing text data:"
curl -X PUT http://localhost:5522/s5/fs/test.txt \
  -H "Content-Type: text/plain" \
  -d "Hello S5.js!" \
  -s
echo ""

# 3. Retrieve text data
echo "3. Retrieving text data:"
curl -s http://localhost:5522/s5/fs/test.txt
echo -e "\n"

# 4. Store binary data (CBOR example)
echo "4. Storing binary data (simulated CBOR):"
echo -n "Binary CBOR data" | curl -X PUT http://localhost:5522/s5/fs/vectors/sample.cbor \
  -H "Content-Type: application/cbor" \
  --data-binary @- \
  -s
echo ""

# 5. Store JSON data
echo "5. Storing JSON data:"
curl -X PUT http://localhost:5522/s5/fs/data/config.json \
  -H "Content-Type: application/json" \
  -d '{"version": 1, "enabled": true}' \
  -s
echo ""

# 6. List directory
echo "6. Listing directory (/):"
curl -s http://localhost:5522/s5/fs/
echo ""

# 7. List subdirectory
echo "7. Listing subdirectory (/data/):"
curl -s http://localhost:5522/s5/fs/data/
echo ""

# 8. Delete a file
echo "8. Deleting a file:"
curl -X DELETE http://localhost:5522/s5/fs/test.txt -s
echo ""

# 9. Try to get deleted file (should return 404)
echo "9. Trying to get deleted file (should fail):"
curl -s -w "\nHTTP Status: %{http_code}\n" http://localhost:5522/s5/fs/test.txt
echo ""

# 10. Test with larger binary data
echo "10. Storing larger binary data:"
dd if=/dev/urandom bs=1024 count=10 2>/dev/null | curl -X PUT http://localhost:5522/s5/fs/vectors/large.bin \
  -H "Content-Type: application/octet-stream" \
  --data-binary @- \
  -s
echo ""

echo "Testing complete!"