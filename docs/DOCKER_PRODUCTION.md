# S5.js Production Docker Setup

This repository includes a production-ready Docker setup for running the S5.js server.

## Features

- 🏔️ **Lightweight Alpine Linux** base image (node:20-alpine)
- 🔒 **Security-focused** with non-root user execution
- 📦 **Optimized build** with .dockerignore for minimal image size
- 🔑 **Seed management** via mounted volume from ~/.s5-seed
- 🌐 **Dual mode support** for real and mock S5 networks
- ❤️ **Health checks** for container monitoring
- 🔄 **Auto-restart** on failure
- 🚦 **Resource limits** (512MB RAM, 1 CPU)

## Quick Start

### Prerequisites

1. Install Docker: https://docs.docker.com/get-docker/
2. Install Docker Compose: https://docs.docker.com/compose/install/
3. Build the project: `npm run build`

### Using Docker Compose (Recommended)

```bash
# Make the script executable
chmod +x start-prod.sh

# Start in real mode (default)
./start-prod.sh

# Start in mock mode
./start-prod.sh mock
```

### Manual Docker Commands

```bash
# Build the image
docker build -f Dockerfile.prod -t s5js-server:prod .

# Run in real mode
docker run -d \
  --name s5js-prod \
  -p 5522:5522 \
  -v ~/.s5-seed:/home/nodejs/.s5-seed:ro \
  -e S5_MODE=real \
  -e S5_SEED_FILE=/home/nodejs/.s5-seed \
  --restart unless-stopped \
  s5js-server:prod

# Run in mock mode
docker run -d \
  --name s5js-prod \
  -p 5522:5522 \
  -e S5_MODE=mock \
  --restart unless-stopped \
  s5js-server:prod
```

## Seed Phrase Management

### Using an Existing Seed

Create a file at `~/.s5-seed` with your seed phrase:

```bash
echo 'S5_SEED_PHRASE="your twelve word seed phrase here"' > ~/.s5-seed
```

Or just the seed phrase directly:

```bash
echo "your twelve word seed phrase here" > ~/.s5-seed
```

### Generating a New Seed

If no seed file is provided, the server will generate a new one on first run. Check the logs to save it:

```bash
docker logs s5js-prod | grep "Generated new seed phrase" -A 1
```

## Container Management

### View Logs
```bash
docker logs -f s5js-prod
```

### Stop Server
```bash
docker stop s5js-prod
# or with compose
docker-compose -f docker-compose.prod.yml down
```

### Restart Server
```bash
docker restart s5js-prod
# or with compose
docker-compose -f docker-compose.prod.yml restart
```

### Shell Access
```bash
docker exec -it s5js-prod sh
```

### Remove Container
```bash
docker rm -f s5js-prod
```

## Health Check

The server exposes a health endpoint at:
```
http://localhost:5522/health
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `S5_MODE` | Server mode: `real` or `mock` | `real` |
| `PORT` | Server port | `5522` |
| `S5_SEED_PHRASE` | 12-word seed phrase | (generated) |
| `S5_SEED_FILE` | Path to seed file | `/home/nodejs/.s5-seed` |
| `NODE_ENV` | Node environment | `production` |

## Files

- `Dockerfile.prod` - Production Docker image definition
- `docker-compose.prod.yml` - Docker Compose configuration
- `.dockerignore` - Files to exclude from Docker build
- `start-prod.sh` - Simple launcher script
- `server-real-s5.js` - Main server application

## Resource Limits

The container is configured with:
- Memory: 512MB (swap: 1GB)
- CPU: 1.0 core
- Restart policy: unless-stopped

## Security

- Runs as non-root user (nodejs:1001)
- Read-only mount for seed file
- No unnecessary packages in Alpine image
- Health checks for monitoring

## Troubleshooting

### Container won't start
Check logs: `docker logs s5js-prod`

### Port already in use
Stop other containers: `docker ps` and `docker stop <container>`

### Permission denied
Ensure dist/ exists: `npm run build`

### Seed file not found
Create it: `touch ~/.s5-seed`

## Production Deployment

For production deployment:

1. Use a proper seed phrase (save it securely!)
2. Consider using Docker Swarm or Kubernetes for orchestration
3. Set up monitoring with the health endpoint
4. Use a reverse proxy (nginx/traefik) for SSL
5. Configure log aggregation
6. Set up automated backups of the seed file