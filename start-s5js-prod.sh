#!/bin/bash

# Production S5.js Server Launcher
# Simple script to start the production server using Docker Compose

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
MODE="${1:-real}"  # Default to real mode

echo -e "${GREEN}🚀 S5.js Production Server Launcher${NC}"
echo "=================================="

# Check prerequisites
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "  Install: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    # Try docker compose (newer syntax)
    if ! docker compose version &> /dev/null; then
        echo -e "${RED}❌ Docker Compose is not installed${NC}"
        echo "  Install: https://docs.docker.com/compose/install/"
        exit 1
    fi
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo -e "${RED}❌ dist/ directory not found${NC}"
    echo "  Build the project first: npm run build"
    exit 1
fi

# Prepare seed file
SEED_FILE="$HOME/.s5-seed"
if [ -f "$SEED_FILE" ]; then
    echo -e "${GREEN}✅ Found seed file at: ${SEED_FILE}${NC}"
else
    echo -e "${YELLOW}⚠️  No seed file found at ${SEED_FILE}${NC}"
    echo "  A new seed will be generated on first run"
    echo "  To use existing seed, create file with:"
    echo "    S5_SEED_PHRASE=\"your twelve word seed phrase\""
    # Create empty file to avoid volume mount error
    touch "$SEED_FILE"
fi

# Set environment
export S5_MODE=$MODE

# Cleanup before starting
echo -e "${YELLOW}🧹 Cleaning up s5js-prod container...${NC}"

# 1. Stop and remove using docker-compose
echo "  Stopping docker-compose services..."
$COMPOSE_CMD -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true

# 2. Stop and remove s5js-prod container specifically (in case it exists outside compose)
if docker ps -a --format "{{.Names}}" | grep -q "^s5js-prod$"; then
    echo "  Removing existing s5js-prod container..."
    docker stop s5js-prod 2>/dev/null || true
    docker rm s5js-prod 2>/dev/null || true
fi

# 3. Check if dev container is running on same port
DEV_CONTAINER=$(docker ps --format "{{.Names}}" --filter "publish=5522" | grep "s5js-dev-container" || true)
if [ ! -z "$DEV_CONTAINER" ]; then
    echo -e "${YELLOW}⚠️  Warning: Development container is running on port 5522${NC}"
    echo "  Container: $DEV_CONTAINER"
    echo "  You may want to stop it first with: docker stop $DEV_CONTAINER"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}❌ Aborted to avoid conflicts${NC}"
        exit 1
    fi
fi

# 5. Check for non-Docker processes on port 5522
if command -v lsof &> /dev/null; then
    PID_ON_PORT=$(lsof -ti:5522 2>/dev/null || true)
    if [ ! -z "$PID_ON_PORT" ]; then
        echo -e "${YELLOW}⚠️  Warning: Process $PID_ON_PORT is using port 5522${NC}"
        echo -e "${RED}❌ Cannot start s5js-prod due to port conflict${NC}"
        echo "  Stop the process manually or use a different port"
        exit 1
    fi
elif command -v netstat &> /dev/null; then
    # Alternative for systems without lsof
    PID_ON_PORT=$(netstat -tlnp 2>/dev/null | grep :5522 | awk '{print $7}' | cut -d'/' -f1 || true)
    if [ ! -z "$PID_ON_PORT" ]; then
        echo -e "${YELLOW}⚠️  Warning: Process $PID_ON_PORT is using port 5522${NC}"
        echo -e "${RED}❌ Cannot start s5js-prod due to port conflict${NC}"
        echo "  Stop the process manually or use a different port"
        exit 1
    fi
fi

# Wait for cleanup to complete
echo "  Waiting for cleanup to complete..."
sleep 2

echo -e "${GREEN}✅ Cleanup complete${NC}"

# Build and start
echo -e "${YELLOW}🔨 Building and starting server...${NC}"
echo "  Mode: $MODE"
echo "  Port: 5522"

# Force recreate to ensure fresh start
$COMPOSE_CMD -f docker-compose.prod.yml up -d --build --force-recreate

# Wait for startup
echo -e "${YELLOW}⏳ Waiting for server to start...${NC}"
sleep 5

# Check status
if docker ps | grep -q s5js-prod; then
    if curl -s -f http://localhost:5522/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Server is healthy and running!${NC}"
        echo ""
        echo "📊 Server Information:"
        echo "  URL: http://localhost:5522"
        echo "  Health: http://localhost:5522/health"
        echo "  Mode: $MODE"
        echo ""
        echo "📝 Commands:"
        echo "  Logs:    docker logs -f s5js-prod"
        echo "  Stop:    docker-compose -f docker-compose.prod.yml down"
        echo "  Restart: docker-compose -f docker-compose.prod.yml restart"
    else
        echo -e "${YELLOW}⚠️  Server starting...${NC}"
        echo "  Check: docker logs s5js-prod"
    fi
else
    echo -e "${RED}❌ Container failed to start${NC}"
    echo "  Check: docker logs s5js-prod"
    exit 1
fi