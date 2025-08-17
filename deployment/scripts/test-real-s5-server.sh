#!/bin/bash

# Test Real S5 Server Script

echo "🧪 Testing Real S5 Server"
echo "═══════════════════════════════════════════"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ️  $1${NC}"; }

SERVER_URL="http://localhost:5522"
TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: Health Check
echo ""
echo "Test 1: Health Check"
echo "─────────────────────"
HEALTH=$(curl -s ${SERVER_URL}/health)
if [ $? -eq 0 ]; then
    echo "Response: $HEALTH"
    if echo "$HEALTH" | grep -q "healthy"; then
        print_success "Server is healthy"
        ((TESTS_PASSED++))
    else
        print_error "Server not healthy"
        ((TESTS_FAILED++))
    fi
else
    print_error "Failed to connect to server"
    ((TESTS_FAILED++))
    echo "Make sure the server is running on port 5522"
    exit 1
fi

# Test 2: Upload Data
echo ""
echo "Test 2: Upload Data"
echo "─────────────────────"
TEST_DATA='{"test": "data", "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
echo "Uploading: $TEST_DATA"

UPLOAD_RESPONSE=$(curl -s -X POST ${SERVER_URL}/api/v0/upload \
    -H "Content-Type: application/json" \
    -d "$TEST_DATA")

if [ $? -eq 0 ]; then
    CID=$(echo "$UPLOAD_RESPONSE" | grep -o '"cid":"[^"]*' | cut -d'"' -f4)
    if [ -n "$CID" ]; then
        print_success "Upload successful! CID: $CID"
        ((TESTS_PASSED++))
    else
        print_error "Upload failed - no CID returned"
        echo "Response: $UPLOAD_RESPONSE"
        ((TESTS_FAILED++))
    fi
else
    print_error "Upload request failed"
    ((TESTS_FAILED++))
fi

# Test 3: Download Data
if [ -n "$CID" ]; then
    echo ""
    echo "Test 3: Download Data"
    echo "─────────────────────"
    echo "Downloading CID: $CID"
    
    DOWNLOAD_RESPONSE=$(curl -s ${SERVER_URL}/api/v0/download/${CID})
    
    if [ $? -eq 0 ]; then
        if echo "$DOWNLOAD_RESPONSE" | grep -q "test.*data"; then
            print_success "Download successful!"
            echo "Retrieved: $DOWNLOAD_RESPONSE"
            ((TESTS_PASSED++))
        else
            print_error "Downloaded data doesn't match"
            echo "Response: $DOWNLOAD_RESPONSE"
            ((TESTS_FAILED++))
        fi
    else
        print_error "Download request failed"
        ((TESTS_FAILED++))
    fi
else
    echo ""
    print_info "Skipping download test (no CID from upload)"
fi

# Test 4: List Uploads
echo ""
echo "Test 4: List Uploads"
echo "─────────────────────"
LIST_RESPONSE=$(curl -s ${SERVER_URL}/api/v0/list)

if [ $? -eq 0 ]; then
    print_success "List endpoint works"
    echo "Response: $LIST_RESPONSE" | head -c 200
    echo "..."
    ((TESTS_PASSED++))
else
    print_error "List request failed"
    ((TESTS_FAILED++))
fi

# Test 5: Multiple Uploads
echo ""
echo "Test 5: Multiple Uploads"
echo "─────────────────────"
CIDS=()
for i in {1..3}; do
    DATA='{"batch": '$i', "time": "'$(date +%s)'"}'
    RESPONSE=$(curl -s -X POST ${SERVER_URL}/api/v0/upload \
        -H "Content-Type: application/json" \
        -d "$DATA")
    CID=$(echo "$RESPONSE" | grep -o '"cid":"[^"]*' | cut -d'"' -f4)
    if [ -n "$CID" ]; then
        CIDS+=($CID)
        echo "  Upload $i: CID=$CID"
    fi
done

if [ ${#CIDS[@]} -eq 3 ]; then
    print_success "All batch uploads successful"
    ((TESTS_PASSED++))
else
    print_error "Some batch uploads failed"
    ((TESTS_FAILED++))
fi

# Summary
echo ""
echo "═══════════════════════════════════════════"
echo "Test Summary"
echo "─────────────────────"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"

if [ $TESTS_FAILED -eq 0 ]; then
    print_success "All tests passed! 🎉"
else
    print_error "Some tests failed"
fi

echo "═══════════════════════════════════════════"