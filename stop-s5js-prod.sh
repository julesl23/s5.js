#!/bin/bash

# Production S5.js Server Stop Script
# Cleanly stops and removes the production server container

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🛑 Stopping S5.js Production Server${NC}"
echo "=================================="

# Detect docker-compose command
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD=""
fi

# Function to stop all S5 containers
stop_all() {
    local stopped=false
    
    # 1. Try docker-compose first if available
    if [ ! -z "$COMPOSE_CMD" ] && [ -f "docker-compose.prod.yml" ]; then
        echo "  Stopping via docker-compose..."
        $COMPOSE_CMD -f docker-compose.prod.yml down --remove-orphans 2>/dev/null && stopped=true || true
    fi
    
    # 2. Stop container directly
    if docker ps -a | grep -q s5js-prod; then
        echo "  Stopping s5js-prod container..."
        docker stop s5js-prod 2>/dev/null || true
        docker rm s5js-prod 2>/dev/null || true
        stopped=true
    fi    
   
    # 4. Kill any non-Docker process on port 5522
    if command -v lsof &> /dev/null; then
        PID_ON_PORT=$(lsof -ti:5522 2>/dev/null || true)
        if [ ! -z "$PID_ON_PORT" ]; then
            echo "  Found process $PID_ON_PORT on port 5522"
            for pid in $PID_ON_PORT; do
                echo "    Killing process $pid..."
                kill -TERM $pid 2>/dev/null || true
                sleep 1
                kill -9 $pid 2>/dev/null || true
            done
            stopped=true
        fi
    fi
    
    if [ "$stopped" = true ]; then
        echo -e "${GREEN}✅ All S5 services stopped${NC}"
    else
        echo -e "${YELLOW}ℹ️  No S5 services were running${NC}"
    fi
}

# Main execution
echo -e "${YELLOW}🧹 Stopping all S5 services...${NC}"
stop_all

# Optional: Clean up volumes
read -t 5 -p "Clean up Docker volumes? (y/N) " -n 1 -r || true
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "  Cleaning up volumes..."
    docker volume prune -f 2>/dev/null || true
    echo -e "${GREEN}✅ Volumes cleaned${NC}"
fi

echo ""
echo -e "${GREEN}✅ S5.js server stopped successfully${NC}"
echo ""
echo "To restart, run: ./start-prod.sh"