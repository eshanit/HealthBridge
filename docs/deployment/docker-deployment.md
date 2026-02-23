# UtanoBridge Deployment Guide

**Version:** 1.0  
**Last Updated:** February 2026  
**Status:** Authoritative Reference

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Docker Deployment](#3-docker-deployment)
4. [Supervisor Configuration](#4-supervisor-configuration)
5. [Environment Configuration](#5-environment-configuration)
6. [Post-Deployment Setup](#6-post-deployment-setup)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Overview

UtanoBridge uses Docker for containerized deployment with the following services:

| Service | Container | Purpose |
|---------|-----------|---------|
| `nginx` | Reverse Proxy | SSL termination, static files |
| `healthbridge_core` | Laravel App | Web application backend |
| `nurse_mobile` | Nuxt App | Mobile application frontend |
| `mysql` | Database | Operational data store |
| `couchdb` | Document Store | Clinical document sync |
| `ollama` | AI Inference | MedGemma model hosting |
| `redis` | Cache/Broadcast | Session, cache, WebSocket |

---

## 2. Prerequisites

### System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16+ GB |
| Storage | 50 GB | 100+ GB SSD |
| Docker | 24.0+ | Latest |
| Docker Compose | 2.20+ | Latest |

### Software Dependencies

- Docker Engine 24.0+
- Docker Compose 2.20+
- Git
- OpenSSL (for certificate generation)

### GPU Requirements (AI)

For local AI inference with MedGemma:

| Model | GPU Memory | Recommended GPU |
|-------|------------|-----------------|
| MedGemma 4B | 8 GB | RTX 3070 or better |
| MedGemma 27B | 24 GB | RTX 4090 or A5000 |

---

## 3. Docker Deployment

### Quick Start

```bash
# Clone repository
git clone https://github.com/healthbridge/healthbridge.git
cd healthbridge

# Copy environment files
cp .env.example .env
cp healthbridge_core/.env.example healthbridge_core/.env
cp nurse_mobile/.env.example nurse_mobile/.env

# Generate application key
docker run --rm -v $(pwd)/healthbridge_core:/app composer:latest php artisan key:generate

# Start services
docker compose up -d

# Run migrations
docker compose exec healthbridge_core php artisan migrate

# Seed roles and permissions
docker compose exec healthbridge_core php artisan db:seed --class=RoleSeeder
```

### Docker Compose Configuration

```yaml
# docker-compose.yml (excerpt)

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./docker/nginx/conf.d:/etc/nginx/conf.d
      - ./healthbridge_core/public:/var/www/html/public
      - ./nurse_mobile/.output/public:/var/www/nurse
    depends_on:
      - healthbridge_core
      - nurse_mobile
    networks:
      - healthbridge-network

  healthbridge_core:
    build:
      context: ./docker/healthbridge_core
      dockerfile: Dockerfile
    volumes:
      - ./healthbridge_core:/var/www/html
      - ./healthbridge_core/storage:/var/www/html/storage
    environment:
      - DB_HOST=mysql
      - DB_DATABASE=healthbridge
      - DB_USERNAME=healthbridge
      - DB_PASSWORD=${DB_PASSWORD}
      - COUCHDB_HOST=http://couchdb:5984
      - OLLAMA_URL=http://ollama:11434
    depends_on:
      mysql:
        condition: service_healthy
      couchdb:
        condition: service_healthy
    networks:
      - healthbridge-network

  nurse_mobile:
    build:
      context: ./docker/nurse_mobile
      dockerfile: Dockerfile
    volumes:
      - ./nurse_mobile:/app
    environment:
      - NUXT_PUBLIC_API_URL=http://healthbridge_core
      - OLLAMA_URL=http://ollama:11434
    networks:
      - healthbridge-network

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MYSQL_DATABASE: healthbridge
      MYSQL_USER: healthbridge
      MYSQL_PASSWORD: ${DB_PASSWORD}
    volumes:
      - mysql_data:/var/lib/mysql
      - ./docker/mysql/init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - healthbridge-network

  couchdb:
    image: couchdb:3
    environment:
      COUCHDB_USER: ${COUCHDB_USERNAME}
      COUCHDB_PASSWORD: ${COUCHDB_PASSWORD}
    volumes:
      - couchdb_data:/opt/couchdb/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5984/_up"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - healthbridge-network

  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    networks:
      - healthbridge-network

  redis:
    image: redis:alpine
    volumes:
      - redis_data:/data
    networks:
      - healthbridge-network

volumes:
  mysql_data:
  couchdb_data:
  ollama_data:
  redis_data:

networks:
  healthbridge-network:
    driver: bridge
```

### Building Images

```bash
# Build all images
docker compose build

# Build specific service
docker compose build healthbridge_core

# Build with no cache
docker compose build --no-cache
```

### Starting Services

```bash
# Start all services
docker compose up -d

# Start specific service
docker compose up -d healthbridge_core

# View logs
docker compose logs -f healthbridge_core

# View logs for all services
docker compose logs -f
```

---

## 4. Supervisor Configuration

Supervisor manages the CouchDB sync worker process to ensure continuous operation.

### Installation

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install supervisor

# Verify installation
sudo systemctl status supervisor
```

### Configuration File

```ini
# /etc/supervisor/conf.d/healthbridge-couchdb-sync.conf

[program:healthbridge-couchdb-sync]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/html/artisan couchdb:sync --daemon --poll=4 --batch=100

; Run as the web server user
user=www-data
group=www-data

; Auto-start and auto-restart
autostart=true
autorestart=true

; Restart settings
startsecs=1
stopwaitsecs=10

; Logging
stdout_logfile=/var/www/html/storage/logs/couchdb-sync.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=5
stderr_logfile=/var/www/html/storage/logs/couchdb-sync-error.log
stderr_logfile_maxbytes=10MB
stderr_logfile_backups=5

; Environment
environment=APP_ENV="production"

; Single instance (avoid sync conflicts)
numprocs=1
priority=999
stopsignal=SIGTERM
redirect_stderr=false
```

### Managing Supervisor

```bash
# Reload configuration
sudo supervisorctl reread
sudo supervisorctl update

# Start the worker
sudo supervisorctl start healthbridge-couchdb-sync:*

# Stop the worker
sudo supervisorctl stop healthbridge-couchdb-sync:*

# Restart the worker
sudo supervisorctl restart healthbridge-couchdb-sync:*

# Check status
sudo supervisorctl status
```

### Command Options

| Option | Default | Description |
|--------|---------|-------------|
| `--daemon` | false | Run continuously (required for Supervisor) |
| `--poll` | 4 | Polling interval in seconds |
| `--batch` | 100 | Maximum documents per poll |

---

## 5. Environment Configuration

### Main Application (.env)

```env
# Application
APP_NAME=UtanoBridge
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://healthbridge.example.com

# Database
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=healthbridge
DB_USERNAME=healthbridge
DB_PASSWORD=your_secure_password

# CouchDB
COUCHDB_HOST=http://couchdb:5984
COUCHDB_DATABASE=healthbridge_clinic
COUCHDB_USERNAME=admin
COUCHDB_PASSWORD=your_couchdb_password

# Redis
REDIS_HOST=redis
REDIS_PASSWORD=null
REDIS_PORT=6379

# AI Configuration
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=gemma3:4b
AI_ENABLED=true
AI_RATE_LIMIT=30
AI_TIMEOUT=60000

# Broadcasting
BROADCAST_DRIVER=reverb
REVERB_HOST=0.0.0.0
REVERB_PORT=8080
REVERB_SCHEME=http

# Mail
MAIL_MAILER=smtp
MAIL_HOST=mailpit
MAIL_PORT=1025
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_ENCRYPTION=null
MAIL_FROM_ADDRESS="noreply@healthbridge.example.com"
MAIL_FROM_NAME="${APP_NAME}"
```

### Mobile Application (.env)

```env
# Application
NUXT_PUBLIC_APP_NAME=UtanoBridge Nurse
NUXT_PUBLIC_APP_URL=https://nurse.healthbridge.example.com

# API Configuration
NUXT_PUBLIC_API_URL=https://api.healthbridge.example.com

# AI Configuration
AI_ENABLED=true
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=gemma3:4b
AI_RATE_LIMIT=30
AI_TIMEOUT=60000
AI_AUTH_TOKEN=your_secure_token

# CouchDB Sync
COUCHDB_URL=http://couchdb:5984
COUCHDB_DATABASE=healthbridge_clinic
```

---

## 6. Post-Deployment Setup

### Database Setup

```bash
# Run migrations
docker compose exec healthbridge_core php artisan migrate

# Seed roles and permissions
docker compose exec healthbridge_core php artisan db:seed --class=RoleSeeder

# Create admin user
docker compose exec healthbridge_core php artisan tinker
>>> User::create([
    'name' => 'Admin User',
    'email' => 'admin@example.com',
    'password' => bcrypt('secure_password'),
])->assignRole('admin');
```

### CouchDB Setup

```bash
# Initialize CouchDB database
docker compose exec healthbridge_core php artisan couchdb:setup --create-db --design-docs

# Verify setup
curl http://admin:password@couchdb:5984/healthbridge_clinic
```

### Ollama Setup

```bash
# Pull MedGemma model
docker compose exec ollama ollama pull gemma3:4b

# Verify model
docker compose exec ollama ollama list

# Test inference
docker compose exec ollama ollama run gemma3:4b "Hello, test"
```

### SSL Configuration

```bash
# Generate self-signed certificate (development)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout docker/nginx/ssl/server.key \
  -out docker/nginx/ssl/server.crt

# For production, use Let's Encrypt
certbot certonly --standalone -d healthbridge.example.com
```

---

## 7. Troubleshooting

### Common Issues

#### Container Won't Start

```bash
# Check logs
docker compose logs healthbridge_core

# Check container status
docker compose ps

# Restart container
docker compose restart healthbridge_core
```

#### Database Connection Failed

```bash
# Verify MySQL is running
docker compose ps mysql

# Check MySQL logs
docker compose logs mysql

# Test connection
docker compose exec healthbridge_core php artisan tinker
>>> DB::connection()->getPdo();
```

#### CouchDB Sync Not Working

```bash
# Check sync worker status
sudo supervisorctl status healthbridge-couchdb-sync:*

# Check sync logs
tail -f healthbridge_core/storage/logs/couchdb-sync.log

# Manual sync run
docker compose exec healthbridge_core php artisan couchdb:sync
```

#### AI Not Responding

```bash
# Check Ollama status
docker compose ps ollama

# Check Ollama logs
docker compose logs ollama

# Verify model is loaded
docker compose exec ollama ollama list

# Test AI endpoint
curl -X POST http://localhost:11434/api/generate \
  -d '{"model": "gemma3:4b", "prompt": "test"}'
```

#### WebSocket Connection Failed

```bash
# Check Reverb status
docker compose exec healthbridge_core php artisan reverb:start --debug

# Check nginx WebSocket proxy
cat docker/nginx/conf.d/healthbridge.conf | grep -A 10 websocket

# Test WebSocket connection
wscat -c ws://localhost:8080
```

### Health Checks

```bash
# Application health
curl http://localhost/api/health

# Database health
docker compose exec mysql mysqladmin ping -h localhost

# CouchDB health
curl http://localhost:5984/_up

# Redis health
docker compose exec redis redis-cli ping
```

---

## Related Documentation

- [System Overview](../architecture/system-overview.md)
- [Data Synchronization](../architecture/data-synchronization.md)
- [Troubleshooting Guide](../troubleshooting/overview.md)
