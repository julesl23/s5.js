# S5.js Docker Scripts Documentation

## Production Scripts

### 🚀 start-prod.sh
**Purpose**: Starts the S5.js production server with comprehensive cleanup

**Features**:
- ✅ **Idempotent**: Safe to run multiple times
- ✅ **Comprehensive cleanup** before starting:
  - Stops docker-compose services
  - Removes existing s5js-prod container
  - Cleans up any container on port 5522
  - Kills non-Docker processes on port 5522
  - Prunes Docker volumes
  - Waits 2 seconds for cleanup completion
- ✅ **Force recreates** container for fresh start
- ✅ **Handles seed file** mounting from ~/.s5-seed
- ✅ **Health checks** after startup

**Usage**:
```bash
# Start in real mode (default)
./start-prod.sh

# Start in mock mode
./start-prod.sh mock
```

### 🛑 stop-prod.sh
**Purpose**: Cleanly stops all S5.js services

**Features**:
- Stops docker-compose services
- Removes containers by name
- Cleans up containers on port 5522
- Kills non-Docker processes on port
- Optional volume cleanup (with prompt)

**Usage**:
```bash
./stop-prod.sh
```

### 🧪 test-docker-cleanup.sh
**Purpose**: Tests that Docker cleanup is working correctly

**Tests**:
1. Clean start with no existing containers
2. Handling conflicting container names
3. Idempotency (multiple runs)
4. Port conflicts with non-Docker processes
5. Other containers are not affected

**Usage**:
```bash
./test-docker-cleanup.sh
```

## Cleanup Logic Flow

The start-prod.sh script performs cleanup in this order:

1. **Docker Compose Down**
   ```bash
   docker-compose -f docker-compose.prod.yml down --remove-orphans
   ```

2. **Direct Container Removal**
   ```bash
   docker stop s5js-prod
   docker rm s5js-prod
   ```

3. **Port-based Cleanup**
   - Finds all containers publishing to port 5522
   - Stops and removes each one

4. **Process Cleanup**
   - Uses `lsof` or `netstat` to find processes on port 5522
   - Kills any non-Docker processes

5. **Volume Cleanup**
   ```bash
   docker volume prune -f
   ```

6. **Wait Period**
   - 2-second delay for cleanup to complete

## Why This Approach?

### Problem Solved
The original script would fail with:
```
Error response from daemon: Conflict. The container name "/s5js-prod" is already in use
```

### Solution Benefits
- **No manual intervention**: Script handles all cleanup automatically
- **Production-ready**: Can be used in CI/CD pipelines
- **Fault-tolerant**: Uses `|| true` to continue even if commands fail
- **Cross-platform**: Works with both `lsof` and `netstat`
- **Docker-compose aware**: Handles both compose and direct Docker commands

## Environment Variables

Scripts respect these environment variables:
- `S5_MODE`: Server mode (real/mock)
- `HOME`: Location of .s5-seed file
- `COMPOSE_CMD`: Override docker-compose command

## Troubleshooting

### Container still exists after cleanup
Check for:
- Docker daemon issues: `docker ps -a`
- Permissions: Run with `sudo` if needed
- Zombie containers: `docker system prune`

### Port still in use
Check for:
- Other services: `lsof -i:5522` or `netstat -tlnp | grep 5522`
- Firewall rules: `iptables -L`
- Docker proxy: `docker ps --all`

### Script hangs during cleanup
- Add timeout: `timeout 30 ./start-prod.sh`
- Check Docker daemon: `docker info`
- Review logs: `docker logs s5js-prod`

## Best Practices

1. **Always use the scripts** instead of direct Docker commands
2. **Check logs** after starting: `docker logs -f s5js-prod`
3. **Monitor health**: `curl http://localhost:5522/health`
4. **Save seed phrases** from first run
5. **Use stop-prod.sh** for clean shutdown
6. **Run tests** after modifying scripts: `./test-docker-cleanup.sh`

## Integration Examples

### Systemd Service
```ini
[Unit]
Description=S5.js Production Server
After=docker.service
Requires=docker.service

[Service]
Type=forking
WorkingDirectory=/path/to/s5.js
ExecStart=/path/to/s5.js/start-prod.sh real
ExecStop=/path/to/s5.js/stop-prod.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Cron Job
```bash
# Restart daily at 3 AM
0 3 * * * cd /path/to/s5.js && ./stop-prod.sh && ./start-prod.sh
```

### CI/CD Pipeline
```yaml
deploy:
  script:
    - ./stop-prod.sh
    - npm run build
    - ./start-prod.sh real
    - curl --retry 10 --retry-delay 2 http://localhost:5522/health
```