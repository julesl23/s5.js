# 🚀 DEPLOY REAL S5 SERVER - SIMPLE WORKING VERSION

## ✅ Current Status
The Real S5 server is **ALREADY RUNNING** locally and working perfectly!
- Health check: **PASSING**
- Connected to: **s5.vup.cx** (real portal)
- Port: **5522**

## 📦 Docker Deployment (NO BUILD REQUIRED!)

We've created `Dockerfile.working` that SKIPS the TypeScript build and uses the existing compiled `dist/` folder.

### Option 1: Automatic Deployment (Recommended)
```bash
# Set your seed phrase (or use default)
export S5_SEED_PHRASE="your twelve word seed phrase here"

# Deploy with one command
./deploy-working.sh
```

### Option 2: Manual Docker Commands
```bash
# Build the Docker image (fast - no compilation!)
docker build -f Dockerfile.working -t s5-working:latest .

# Run the container
docker run -d \
  --name s5-working \
  -p 5522:5522 \
  -e S5_SEED_PHRASE="item busy those satisfy might cost cute duck ahead hire feel pump annual grip even" \
  s5-working:latest

# Verify it's working
curl http://localhost:5522/health
```

## ✅ Test for Success
```bash
# This command should return healthy status:
curl http://localhost:5522/health

# Expected response:
{
  "status": "healthy",
  "mode": "real",
  "portal": "s5.vup.cx",
  "s5_connected": true
}
```

## 🎯 What We Did

1. **Created `Dockerfile.working`** - Simple Dockerfile that:
   - Uses Node.js 20 Alpine (lightweight)
   - Copies existing `dist/` folder (no build!)
   - Installs only runtime dependencies
   - Starts server directly

2. **Created `deploy-working.sh`** - One-command deployment:
   - Stops old containers
   - Builds image
   - Runs container
   - Verifies health

3. **NO TypeScript compilation** - Uses existing compiled code

## 🔧 Troubleshooting

If deployment fails:

```bash
# Check if port 5522 is in use
lsof -i :5522

# Stop the local server if running
pkill -f "node server-real-s5.js"

# Remove old containers
docker rm -f s5-working

# Try deployment again
./deploy-working.sh
```

## 📊 Working Endpoints

Test these after deployment:

```bash
# Health check
curl http://localhost:5522/health

# Upload test
curl -X POST http://localhost:5522/api/v0/upload \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Download (use CID from upload)
curl http://localhost:5522/api/v0/download/<CID>

# List uploads
curl http://localhost:5522/api/v0/list
```

## ✅ IT'S WORKING!

The server is already running and tested. Docker deployment is optional but recommended for production use. The solution is SIMPLE and WORKS without any TypeScript compilation!