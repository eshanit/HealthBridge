# HealthBridge Platform - Docker Deployment Guide

This guide provides comprehensive instructions for deploying the HealthBridge platform using Docker Compose. The deployment includes all services required for a production-ready healthcare application.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Configuration](#configuration)
5. [Service Management](#service-management)
6. [Data Persistence](#data-persistence)
7. [Networking](#networking)
8. [SSL/HTTPS Setup](#sslhttps-setup)
9. [Troubleshooting](#troubleshooting)
10. [Backup & Recovery](#backup--recovery)

---

## Architecture Overview

The HealthBridge platform consists of the following services:

| Service | Description | Internal Port |
|---------|-------------|---------------|
| **nginx** | Reverse proxy for unified access | 80, 443 |
| **nurse_mobile** | Nuxt.js frontend for nurses | 3000 |
| **healthbridge** | Laravel backend API & GP dashboard | 8000, 8080 |
| **mysql** | Primary relational database | 3306 |
| **couchdb** | Document store for offline sync | 5984 |
| **redis** | Caching and queue backend | 6379 |
| **ollama** | Local AI inference engine | 11434 |

### Service Dependencies

```
nginx
├── nurse_mobile (depends on: healthbridge, couchdb)
├── healthbridge (depends on: mysql, couchdb, redis)
├── couchdb
└── ollama
```

### Network Architecture

```
                    ┌─────────────────────────────────────┐
                    │           NGINX (Port 80)           │
                    │         Reverse Proxy               │
                    └───────────────┬─────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│  Nurse Mobile │         │  HealthBridge │         │    Ollama     │
│   (Nuxt.js)   │         │   (Laravel)   │         │   (AI/LLM)    │
│   Port 3000   │         │  Port 80/8080 │         │   Port 11434  │
└───────┬───────┘         └───────┬───────┘         └───────────────┘
        │                         │
        │         ┌───────────────┼───────────────┐
        │         │               │               │
        │         ▼               ▼               ▼
        │  ┌───────────┐   ┌───────────┐   ┌───────────┐
        │  │   MySQL   │   │  CouchDB  │   │   Redis   │
        │  │  Port 3306│   │Port 5984  │   │Port 6379  │
        │  └───────────┘   └───────────┘   └───────────┘
        │
        └──────────────────▶ PouchDB Sync (Offline Support)
```

---

## Prerequisites

### System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16+ GB |
| Storage | 50 GB | 100+ GB SSD |
| GPU | Optional | NVIDIA GPU for AI acceleration |

### Software Requirements

- **Docker Engine**: 24.0+
- **Docker Compose**: 2.20+
- **Git**: For cloning the repository

### Installation

#### Linux (Ubuntu/Debian)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Add current user to docker group
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
```

#### Windows

1. Install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)
2. Enable WSL 2 backend for better performance
3. Ensure Docker Desktop is running

#### macOS

1. Install [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop)
2. Ensure Docker Desktop is running

### GPU Support (Optional - for AI acceleration)

For NVIDIA GPU support:

```bash
# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
    sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

---

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd HealthBridge
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.docker.example .env

# Edit the environment file with your settings
nano .env
```

**Required Changes:**

```bash
# Generate secure passwords and keys
# You can use: openssl rand -base64 32

DB_PASSWORD=your_secure_mysql_password
MYSQL_ROOT_PASSWORD=your_secure_root_password
COUCHDB_PASSWORD=your_secure_couchdb_password
REVERB_APP_KEY=your_reverb_key
REVERB_APP_SECRET=your_reverb_secret
AI_GATEWAY_SECRET=your_ai_secret
```

### 3. Generate Application Key

```bash
# Generate Laravel application key
docker compose run --rm healthbridge php artisan key:generate --show
# Copy the output to APP_KEY in your .env file
```

### 4. Launch the Platform

```bash
# Build and start all services
docker compose up -d

# Follow the logs
docker compose logs -f
```

### 5. Verify Deployment

```bash
# Check service status
docker compose ps

# Test endpoints
curl http://localhost/health
curl http://localhost/api/health
```

### 6. Access the Application

- **Nurse Mobile**: http://localhost
- **GP Dashboard**: http://localhost/admin
- **CouchDB Fauxton**: http://localhost/couchdb/_utils/

---

## Configuration

### Environment Variables

The `.env` file contains all configuration options. Key sections:

#### Application Settings

```bash
APP_NAME=HealthBridge
APP_ENV=production
APP_DEBUG=false
APP_URL=http://localhost
APP_KEY=base64:your-generated-key
```

#### Database Configuration

```bash
# MySQL
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=healthbridge
DB_USERNAME=healthbridge
DB_PASSWORD=secure_password

# CouchDB
COUCHDB_HOST=http://couchdb:5984
COUCHDB_DATABASE=healthbridge_clinic
COUCHDB_USERNAME=admin
COUCHDB_PASSWORD=secure_password
```

#### WebSocket Configuration

```bash
REVERB_APP_ID=healthbridge
REVERB_APP_KEY=your_key
REVERB_APP_SECRET=your_secret
REVERB_HOST=localhost
REVERB_PORT=8080
```

#### AI Configuration

```bash
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=gemma3:4b
AI_PROVIDER=ollama
```

### Customizing Services

#### Adjusting Resource Limits

Edit `docker-compose.yml` to add resource constraints:

```yaml
services:
  healthbridge:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

#### Scaling Services

```bash
# Scale queue workers
docker compose up -d --scale healthbridge-queue=3
```

---

## Service Management

### Starting Services

```bash
# Start all services
docker compose up -d

# Start specific service
docker compose up -d nginx healthbridge

# Start with build
docker compose up -d --build
```

### Stopping Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (WARNING: destroys data)
docker compose down -v

# Stop specific service
docker compose stop nginx
```

### Restarting Services

```bash
# Restart all services
docker compose restart

# Restart specific service
docker compose restart healthbridge
```

### Viewing Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f healthbridge

# Last 100 lines
docker compose logs --tail=100 healthbridge
```

### Executing Commands

```bash
# Run artisan command
docker compose exec healthbridge php artisan migrate

# Access container shell
docker compose exec healthbridge bash

# Run composer
docker compose exec healthbridge composer install
```

### Health Checks

```bash
# Check all service health
docker compose ps

# Manual health check
curl http://localhost/health
curl http://localhost/api/health
curl http://localhost/couchdb/_up
curl http://localhost/ollama/api/tags
```

---

## Data Persistence

### Volume Overview

| Volume | Purpose | Location |
|--------|---------|----------|
| `healthbridge-mysql-data` | MySQL database | `/var/lib/mysql` |
| `healthbridge-couchdb-data` | CouchDB documents | `/opt/couchdb/data` |
| `healthbridge-redis-data` | Redis persistence | `/data` |
| `healthbridge-ollama-data` | AI models | `/root/.ollama` |
| `healthbridge-storage` | Laravel storage | `/var/www/html/storage` |
| `healthbridge-logs` | Application logs | `/var/www/html/storage/logs` |

### Volume Management

```bash
# List volumes
docker volume ls | grep healthbridge

# Inspect volume
docker volume inspect healthbridge-mysql-data

# Backup volume
docker run --rm -v healthbridge-mysql-data:/data -v $(pwd):/backup \
    alpine tar czf /backup/mysql-backup.tar.gz -C /data .

# Restore volume
docker run --rm -v healthbridge-mysql-data:/data -v $(pwd):/backup \
    alpine tar xzf /backup/mysql-backup.tar.gz -C /data
```

---

## Networking

### Network Configuration

All services communicate through the `healthbridge-network` bridge network:

```yaml
networks:
  healthbridge-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

### Service Discovery

Services can reference each other by service name:
- `mysql:3306` - MySQL database
- `couchdb:5984` - CouchDB
- `redis:6379` - Redis
- `ollama:11434` - Ollama AI
- `healthbridge:80` - Laravel API
- `nurse_mobile:3000` - Nuxt frontend

### Port Mapping

| External Port | Internal Service | Purpose |
|---------------|------------------|---------|
| 80 | nginx | HTTP |
| 443 | nginx | HTTPS |
| 3000 | nurse_mobile | Direct frontend access (optional) |
| 8000 | healthbridge | Direct API access (optional) |

---

## SSL/HTTPS Setup

### Using Let's Encrypt (Certbot)

1. **Install Certbot**

```bash
sudo apt-get install certbot python3-certbot-nginx
```

2. **Obtain Certificate**

```bash
sudo certbot certonly --standalone -d your-domain.com
```

3. **Copy Certificates**

```bash
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem docker/nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem docker/nginx/ssl/
```

4. **Enable HTTPS in nginx config**

Edit `docker/nginx/conf.d/healthbridge.conf` and uncomment the HTTPS server block.

5. **Update Environment**

```bash
APP_URL=https://your-domain.com
VITE_REVERB_SCHEME=https
SESSION_SECURE_COOKIE=true
```

6. **Restart Services**

```bash
docker compose restart nginx
```

### Self-Signed Certificate (Development)

```bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout docker/nginx/ssl/privkey.pem \
    -out docker/nginx/ssl/fullchain.pem \
    -subj "/CN=localhost"
```

---

## Troubleshooting

### Common Issues

#### Services Won't Start

```bash
# Check logs
docker compose logs

# Check for port conflicts
netstat -tlnp | grep -E ':(80|443|3306|5984|11434)'

# Remove orphaned containers
docker compose down --remove-orphans
docker compose up -d
```

#### Database Connection Errors

```bash
# Verify MySQL is running
docker compose ps mysql

# Check MySQL logs
docker compose logs mysql

# Test connection
docker compose exec healthbridge php artisan tinker
>>> DB::connection()->getPdo();
```

#### CouchDB Sync Issues

```bash
# Check CouchDB status
curl http://localhost/couchdb/_up

# Verify database exists
curl -u admin:password http://localhost/couchdb/healthbridge_clinic

# Check CouchDB logs
docker compose logs couchdb
```

#### Ollama/AI Issues

```bash
# Check Ollama status
curl http://localhost/ollama/api/tags

# Pull model manually
docker compose exec ollama ollama pull gemma3:4b

# Check GPU access
docker compose exec ollama nvidia-smi
```

#### WebSocket Connection Issues

```bash
# Check Reverb status
docker compose logs healthbridge | grep reverb

# Verify WebSocket endpoint
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Key: test" -H "Sec-WebSocket-Version: 13" \
    http://localhost/app/your_app_key
```

### Debug Mode

Enable debug mode for troubleshooting:

```bash
# In .env
APP_DEBUG=true
LOG_LEVEL=debug

# Restart services
docker compose restart healthbridge
```

### Reset Everything

```bash
# WARNING: This destroys all data!
docker compose down -v --remove-orphans
docker compose up -d --build
```

---

## Backup & Recovery

### Automated Backup Script

Create `scripts/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# MySQL backup
docker compose exec -T mysql mysqldump -u root -p${MYSQL_ROOT_PASSWORD} \
    healthbridge > "$BACKUP_DIR/mysql.sql"

# CouchDB backup
curl -s -u admin:${COUCHDB_PASSWORD} \
    http://localhost:5984/healthbridge_clinic/_all_docs?include_docs=true \
    > "$BACKUP_DIR/couchdb.json"

# Compress
tar czf "$BACKUP_DIR.tar.gz" -C "$(dirname $BACKUP_DIR)" "$(basename $BACKUP_DIR)"
rm -rf "$BACKUP_DIR"

echo "Backup completed: $BACKUP_DIR.tar.gz"
```

### Recovery

```bash
# Restore MySQL
cat backup/mysql.sql | docker compose exec -T mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} healthbridge

# Restore CouchDB
curl -X POST -H "Content-Type: application/json" \
    -u admin:${COUCHDB_PASSWORD} \
    --data @backup/couchdb.json \
    http://localhost:5984/healthbridge_clinic/_bulk_docs
```

---

## Production Checklist

Before deploying to production:

- [ ] Change all default passwords
- [ ] Generate secure APP_KEY
- [ ] Set APP_DEBUG=false
- [ ] Configure SSL/HTTPS
- [ ] Set up automated backups
- [ ] Configure firewall rules
- [ ] Set up monitoring and alerts
- [ ] Review and adjust resource limits
- [ ] Enable log rotation
- [ ] Test disaster recovery procedure

---

## Support

For issues and support:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review service logs: `docker compose logs -f`
3. Check GitHub issues for known problems
4. Contact the development team

---

*Last updated: 2026-02-23*
