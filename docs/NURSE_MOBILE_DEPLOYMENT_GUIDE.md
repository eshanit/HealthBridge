# Nurse Mobile Integration Deployment Guide

**Version:** 1.0  
**Created:** February 16, 2026  
**Status:** Production Ready  

---

## Overview

This guide covers the deployment of the nurse_mobile ↔ healthbridge_core integration, including:
- CouchDB proxy configuration
- Mobile authentication endpoints
- Sync worker setup
- Security validation functions

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   nurse_mobile  │     │ healthbridge_   │     │    CouchDB      │
│   (Nuxt 4)      │────▶│    core         │────▶│  (Database)     │
│                 │     │   (Laravel)     │     │                 │
│   PouchDB       │     │                 │     │   _changes      │
│   Sync Manager  │     │ CouchProxy      │     │   _bulk_docs    │
│                 │     │ MobileAuth      │     │   Validation    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │   Sanctum Token      │    Sync Worker        │
        │   (Bearer Auth)      │    (Daemon)           │
        │                      │                       │
        └──────────────────────┴───────────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │     MySQL       │
                       │   (Mirror)      │
                       └─────────────────┘
```

---

## Prerequisites

### Server Requirements

| Component | Version | Notes |
|-----------|---------|-------|
| PHP | 8.2+ | Laravel 11 requirement |
| MySQL | 8.0+ | JSON column support |
| CouchDB | 3.3+ | `_changes` feed support |
| Redis | 6.0+ | Cache, sessions |
| Node.js | 20+ | Mobile app build |
| Supervisor | Latest | Process management |

### Network Requirements

| Port | Service | Access |
|------|---------|--------|
| 8000 | Laravel API | Internal + Mobile |
| 5984 | CouchDB | Internal only |
| 3306 | MySQL | Internal only |
| 6379 | Redis | Internal only |
| 11434 | Ollama | Internal only |

---

## Step 1: CouchDB Setup

### 1.1 Install CouchDB

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install couchdb

# Or use Docker
docker run -d --name couchdb \
  -p 5984:5984 \
  -e COUCHDB_USER=admin \
  -e COUCHDB_PASSWORD=your_secure_password \
  couchdb:3.3
```

### 1.2 Configure CouchDB

Create/update `local.ini`:

```ini
[couchdb]
single_node=true

[chttpd]
bind_address = 127.0.0.1
port = 5984

[admins]
admin = your_secure_password

[cors]
origins = *
methods = GET, PUT, POST, DELETE, OPTIONS
headers = accept, authorization, content-type, origin, referer
credentials = true
```

### 1.3 Create Database and Validation

```bash
cd healthbridge_core

# Create database and design documents with validation
php artisan couchdb:setup --create-db --design-docs

# Or reset everything (WARNING: deletes all data)
php artisan couchdb:setup --reset
```

### 1.4 Verify Setup

```bash
# Check database info
curl http://admin:password@localhost:5984/healthbridge_clinic

# Check validation document
curl http://admin:password@localhost:5984/healthbridge_clinic/_design/validation
```

---

## Step 2: Laravel Configuration

### 2.1 Environment Variables

Add to `healthbridge_core/.env`:

```env
# CouchDB Configuration
COUCHDB_HOST=http://127.0.0.1:5984
COUCHDB_DATABASE=healthbridge_clinic
COUCHDB_USERNAME=admin
COUCHDB_PASSWORD=your_secure_password

# Sanctum Configuration
SANCTUM_STATEFUL_DOMAINS=localhost:3000,localhost:8000
SESSION_DOMAIN=localhost

# CORS Configuration
SANCTUM_SUPPORT_COOKIE_AUTH=false
```

### 2.2 Run Migrations

```bash
cd healthbridge_core

# Run migrations
php artisan migrate

# Seed roles
php artisan db:seed --class=RoleSeeder

# Create a test user
php artisan tinker
```

```php
// In tinker
$user = \App\Models\User::create([
    'name' => 'Test Nurse',
    'email' => 'nurse@test.com',
    'password' => bcrypt('password123'),
]);
$user->assignRole('nurse');
```

### 2.3 Configure CORS

Update `config/cors.php`:

```php
return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => ['http://localhost:3000', 'http://localhost:8000'],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
```

---

## Step 3: Sync Worker Setup

### 3.1 Supervisor Configuration

Create `/etc/supervisor/conf.d/healthbridge-couchdb-sync.conf`:

```ini
[program:healthbridge-couchdb-sync]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/healthbridge/artisan couchdb:sync --daemon --poll=4 --batch=100

; Run as web server user
user=www-data
group=www-data

; Auto-start and auto-restart
autostart=true
autorestart=true

; Restart settings
startsecs=1
stopwaitsecs=10

; Logging
stdout_logfile=/var/www/healthbridge/storage/logs/couchdb-sync.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=5
stderr_logfile=/var/www/healthbridge/storage/logs/couchdb-sync-error.log
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

### 3.2 Start Sync Worker

```bash
# Reload supervisor configuration
sudo supervisorctl reread
sudo supervisorctl update

# Start the worker
sudo supervisorctl start healthbridge-couchdb-sync:*

# Check status
sudo supervisorctl status
```

---

## Step 4: Mobile App Configuration

### 4.1 Environment Variables

Create `nurse_mobile/.env`:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:8000

# AI Configuration (optional)
AI_ENABLED=true
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
```

### 4.2 Build Mobile App

```bash
cd nurse_mobile

# Install dependencies
npm install

# Build for development
npm run dev

# Build for production
npm run build

# Build for Android
npm run build
npx cap sync android
npx cap open android
```

---

## Step 5: Testing the Integration

### 5.1 Test Authentication

```bash
# Login to get token
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"nurse@test.com","password":"password123","device_name":"test_device"}'

# Response:
# {"success":true,"token":"1|abc123...","user":{"id":1,"email":"nurse@test.com",...}}
```

### 5.2 Test CouchDB Proxy

```bash
# Get database info through proxy
curl -X GET http://localhost:8000/api/couchdb \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create a test document
curl -X POST http://localhost:8000/api/couchdb \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "clinicalPatient",
    "created_by": "nurse@test.com",
    "created_at": "2026-02-16T10:00:00Z",
    "patient": {
      "cpt": "CP-TEST-001",
      "dateOfBirth": "2024-01-15",
      "gender": "male"
    }
  }'
```

### 5.3 Test Sync Worker

```bash
# Check sync worker logs
tail -f /var/www/healthbridge/storage/logs/couchdb-sync.log

# Verify MySQL mirror
mysql -u root -p healthbridge -e "SELECT * FROM patients LIMIT 5;"
```

---

## Step 6: Production Deployment

### 6.1 Security Checklist

- [ ] Change all default passwords
- [ ] Enable HTTPS for all endpoints
- [ ] Configure firewall rules (CouchDB internal only)
- [ ] Set up SSL certificates
- [ ] Enable rate limiting
- [ ] Configure backup schedules

### 6.2 Performance Tuning

**PHP-FPM Configuration** (`/etc/php/8.2/fpm/pool.d/www.conf`):

```ini
pm = dynamic
pm.max_children = 50
pm.start_servers = 10
pm.min_spare_servers = 5
pm.max_spare_servers = 20
pm.max_requests = 500
```

**CouchDB Configuration**:

```ini
[couchdb]
max_document_size = 8388608  ; 8MB

[chttpd]
max_http_request_size = 4294967296  ; 4GB

[query_server_config]
reduce_limit = true
```

### 6.3 Monitoring

**Health Check Endpoints**:

| Endpoint | Purpose |
|----------|---------|
| `/api/couchdb/health` | CouchDB connectivity |
| `/api/ai/health` | AI service status |
| `/api/auth/check` | Authentication status |

**Log Files**:

| Log | Location |
|-----|----------|
| Laravel | `storage/logs/laravel.log` |
| Sync Worker | `storage/logs/couchdb-sync.log` |
| Supervisor | `/var/log/supervisor/` |

---

## Troubleshooting

### Common Issues

#### 401 Unauthorized on Sync

**Cause:** Token expired or invalid  
**Solution:** Re-login to get new token

```bash
# Check token validity
curl -X GET http://localhost:8000/api/auth/user \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Sync Worker Not Starting

**Cause:** CouchDB not reachable  
**Solution:** Check CouchDB connection

```bash
# Test CouchDB connection
curl http://admin:password@localhost:5984/_up

# Check supervisor logs
sudo supervisorctl tail healthbridge-couchdb-sync
```

#### Document Validation Errors

**Cause:** Missing required fields  
**Solution:** Ensure documents have:

- `type` field
- `created_by` field
- `created_at` field
- Document-specific required fields

```json
// Example valid document
{
  "type": "clinicalSession",
  "created_by": "user@example.com",
  "created_at": "2026-02-16T10:00:00Z",
  "patientCpt": "CP-001",
  "triage": "yellow",
  "status": "open"
}
```

---

## Rollback Procedure

If issues arise, rollback steps:

1. **Stop sync worker:**
   ```bash
   sudo supervisorctl stop healthbridge-couchdb-sync:*
   ```

2. **Revert code:**
   ```bash
   cd healthbridge_core
   git checkout HEAD~1 -- app/Http/Controllers/Api/CouchProxyController.php
   git checkout HEAD~1 -- routes/api.php
   ```

3. **Clear cache:**
   ```bash
   php artisan cache:clear
   php artisan config:clear
   php artisan route:clear
   ```

4. **Restart services:**
   ```bash
   sudo supervisorctl start healthbridge-couchdb-sync:*
   sudo service php8.2-fpm restart
   ```

---

## Support

For issues or questions:
- Check logs in `storage/logs/`
- Review CouchDB logs at `/var/log/couchdb/`
- Consult `docs/NURSE_MOBILE_INTEGRATION_FEASIBILITY_REPORT.md`
