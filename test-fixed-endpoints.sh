#!/bin/bash

echo "================================================================"
echo "Testing Fixed S5 Server Endpoints"
echo "================================================================"

BASE_URL="http://localhost:5522"

echo -e "\n1. Testing Health Check..."
curl -s $BASE_URL/health | jq '.'

echo -e "\n2. Testing PUT /s5/fs/test-key..."
RESPONSE=$(curl -s -X PUT $BASE_URL/s5/fs/test-key -d "test-data" -H "Content-Type: text/plain")
echo "$RESPONSE" | jq '.'

echo -e "\n3. Testing GET /s5/fs/test-key..."
DATA=$(curl -s $BASE_URL/s5/fs/test-key)
echo "Retrieved: $DATA"
if [ "$DATA" = "test-data" ]; then
    echo "✅ GET test passed!"
else
    echo "❌ GET test failed! Expected 'test-data', got '$DATA'"
fi

echo -e "\n4. Testing PUT with path /s5/fs/folder/file..."
curl -s -X PUT $BASE_URL/s5/fs/folder/file -d "nested-data" -H "Content-Type: text/plain" | jq '.'

echo -e "\n5. Testing GET with path /s5/fs/folder/file..."
DATA=$(curl -s $BASE_URL/s5/fs/folder/file)
echo "Retrieved: $DATA"

echo -e "\n6. Testing DELETE /s5/fs/test-key..."
curl -s -X DELETE $BASE_URL/s5/fs/test-key | jq '.'

echo -e "\n7. Verifying DELETE worked..."
RESPONSE=$(curl -s $BASE_URL/s5/fs/test-key)
echo "$RESPONSE" | jq '.'

echo -e "\n================================================================"
echo "All tests completed!"
echo "================================================================"