#!/bin/bash

# Simple deployment that WORKS!

echo "🚀 Deploying Real S5 Server (Simple Version)"
echo "============================================"

# Set seed phrase if not already set
if [ -z "$S5_SEED_PHRASE" ]; then
    export S5_SEED_PHRASE="item busy those satisfy might cost cute duck ahead hire feel pump annual grip even"
    echo "Using default seed phrase"
fi

# Stop any existing containers on port 5522
echo "Stopping any existing containers..."
docker stop s5-working 2>/dev/null || true
docker rm s5-working 2>/dev/null || true

# Build the image (should be fast - no TypeScript compilation!)
echo "Building Docker image..."
docker build -f Dockerfile.working -t s5-working:latest .

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed!"
    exit 1
fi

echo "✅ Docker image built successfully"

# Run the container
echo "Starting container..."
docker run -d \
    --name s5-working \
    -p 5522:5522 \
    -e S5_SEED_PHRASE="$S5_SEED_PHRASE" \
    --restart unless-stopped \
    s5-working:latest

if [ $? -ne 0 ]; then
    echo "❌ Failed to start container!"
    exit 1
fi

# Wait for server to be ready
echo "Waiting for server to start..."
sleep 5

# Test the health endpoint
echo "Testing health endpoint..."
HEALTH=$(curl -s http://localhost:5522/health 2>/dev/null)

if echo "$HEALTH" | grep -q "healthy"; then
    echo "✅ Server is WORKING!"
    echo ""
    echo "Health check response:"
    echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"
    echo ""
    echo "Server is running at: http://localhost:5522"
    echo "View logs: docker logs -f s5-working"
else
    echo "❌ Server health check failed!"
    echo "Checking logs..."
    docker logs s5-working
    exit 1
fi