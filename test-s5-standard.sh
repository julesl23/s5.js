#!/bin/bash

# Test script for S5 standard protocol endpoints
# Usage: ./test-s5-standard.sh

SERVER_URL="http://localhost:5522"

echo "========================================="
echo "Testing S5 Standard Protocol Endpoints"
echo "========================================="
echo ""

# Test health endpoint
echo "1. Testing health endpoint..."
curl -s "$SERVER_URL/health" | jq '.'
echo ""

# Test S5 filesystem endpoints (for Vector DB compatibility)
echo "2. Testing /s5/fs/ endpoints..."
echo "   PUT /s5/fs/test-key"
RESPONSE=$(curl -s -X PUT "$SERVER_URL/s5/fs/test-key" \
  -H "Content-Type: text/plain" \
  -d "test-data-123")
echo "   Response: $RESPONSE"
echo ""

echo "   GET /s5/fs/test-key"
curl -s "$SERVER_URL/s5/fs/test-key"
echo -e "\n"

echo "   PUT /s5/fs/nested/path/data"
curl -s -X PUT "$SERVER_URL/s5/fs/nested/path/data" \
  -H "Content-Type: application/json" \
  -d '{"message": "nested data", "value": 42}' | jq '.'
echo ""

echo "   GET /s5/fs/nested/path/data"
curl -s "$SERVER_URL/s5/fs/nested/path/data" | jq '.'
echo ""

# Test S5 blob endpoints
echo "3. Testing /s5/blob/ endpoints..."
TEST_CID="bafy2bzaceaabbccddee112233445566778899"

echo "   PUT /s5/blob/$TEST_CID"
curl -s -X PUT "$SERVER_URL/s5/blob/$TEST_CID" \
  -H "Content-Type: text/plain" \
  -d "This is blob content" | jq '.'
echo ""

echo "   GET /s5/blob/$TEST_CID"
curl -s "$SERVER_URL/s5/blob/$TEST_CID"
echo -e "\n"

echo "   HEAD /s5/blob/$TEST_CID (checking existence)"
if curl -s -I "$SERVER_URL/s5/blob/$TEST_CID" | grep -q "200 OK"; then
  echo "   ✓ Blob exists (200 OK)"
else
  echo "   ✗ Blob not found"
fi
echo ""

# Test with non-existent blob
echo "   HEAD /s5/blob/nonexistent (should return 404)"
if curl -s -I "$SERVER_URL/s5/blob/nonexistent" | grep -q "404"; then
  echo "   ✓ Correctly returns 404 for non-existent blob"
else
  echo "   ✗ Should return 404"
fi
echo ""

# Test DELETE on filesystem endpoint
echo "4. Testing DELETE /s5/fs/test-key"
curl -s -X DELETE "$SERVER_URL/s5/fs/test-key" | jq '.'
echo ""

echo "   Verifying deletion (should return 404)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/s5/fs/test-key")
if [ "$HTTP_CODE" = "404" ]; then
  echo "   ✓ Successfully deleted (404 on GET)"
else
  echo "   ✗ Delete may have failed (HTTP $HTTP_CODE)"
fi
echo ""

# Test legacy endpoints (should still work but with deprecation notice)
echo "5. Testing legacy endpoints (deprecated)..."
echo "   POST /api/v0/upload"
curl -s -X POST "$SERVER_URL/api/v0/upload" \
  -H "Content-Type: application/json" \
  -d '{"legacy": "data"}' | jq '.'
echo ""

# List all stored items
echo "6. Listing all stored items..."
curl -s "$SERVER_URL/api/v0/list" | jq '.'
echo ""

echo "========================================="
echo "S5 Standard Protocol Tests Complete!"
echo "========================================="