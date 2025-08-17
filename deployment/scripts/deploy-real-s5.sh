#!/bin/bash

# Deploy Real S5 Server Script

echo "🚀 Deploying Real S5 Server"
echo "═══════════════════════════════════════════"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }

# Check if seed phrase is set
if [ -z "$S5_SEED_PHRASE" ] || [ "$S5_SEED_PHRASE" == "your-twelve-word-seed-phrase-here" ]; then
    print_warning "No S5_SEED_PHRASE environment variable set!"
    echo "The server will generate a new seed phrase on startup."
    echo ""
    echo "To use an existing seed phrase, set it like this:"
    echo "  export S5_SEED_PHRASE=\"your twelve word seed phrase here\""
    echo ""
    read -p "Continue with new seed phrase generation? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 1
    fi
fi

# Stop existing mock server if running
echo ""
echo "Checking for existing S5 containers..."
if docker ps -q -f name=fabstir-llm-marketplace-s5-node-1 > /dev/null 2>&1; then
    print_warning "Found mock S5 server running"
    echo "Stopping mock server..."
    docker stop fabstir-llm-marketplace-s5-node-1 2>/dev/null
    print_success "Mock server stopped"
fi

if docker ps -q -f name=s5-real-server > /dev/null 2>&1; then
    print_warning "Found existing real S5 server"
    echo "Stopping existing server..."
    docker stop s5-real-server 2>/dev/null
    docker rm s5-real-server 2>/dev/null
    print_success "Existing server stopped"
fi

# Build the Docker image
echo ""
echo "Building Docker image..."
docker build -f Dockerfile.real-s5 -t s5-real:latest . || {
    print_error "Docker build failed!"
    exit 1
}
print_success "Docker image built"

# Run the container
echo ""
echo "Starting Real S5 Server..."
docker run -d \
    --name s5-real-server \
    -p 5522:5522 \
    -e S5_SEED_PHRASE="${S5_SEED_PHRASE:-your-twelve-word-seed-phrase-here}" \
    -e PORT=5522 \
    --restart unless-stopped \
    s5-real:latest || {
    print_error "Failed to start container!"
    exit 1
}

# Wait for server to be ready
echo ""
echo "Waiting for server to initialize..."
sleep 5

# Check if server is healthy
for i in {1..10}; do
    if curl -s http://localhost:5522/health > /dev/null 2>&1; then
        print_success "Server is healthy!"
        break
    fi
    echo "Waiting... ($i/10)"
    sleep 2
done

# Show server status
echo ""
echo "═══════════════════════════════════════════"
print_success "Real S5 Server Deployed!"
echo ""
echo "Server Details:"
echo "  • URL: http://localhost:5522"
echo "  • Health: http://localhost:5522/health"
echo "  • Mode: REAL (connected to s5.vup.cx)"
echo ""
echo "API Endpoints:"
echo "  • POST /api/v0/upload    - Upload data"
echo "  • GET  /api/v0/download/:cid - Download data"
echo "  • GET  /api/v0/list      - List uploads"
echo "  • GET  /health           - Health check"
echo ""
echo "Container Commands:"
echo "  • View logs:  docker logs -f s5-real-server"
echo "  • Stop:       docker stop s5-real-server"
echo "  • Start:      docker start s5-real-server"
echo "  • Remove:     docker rm -f s5-real-server"
echo ""

# Show the seed phrase if it was generated
docker logs s5-real-server 2>&1 | grep "S5_SEED_PHRASE=" | head -1 && {
    echo ""
    print_warning "⚠️  IMPORTANT: Save the seed phrase shown above!"
}

echo "═══════════════════════════════════════════"