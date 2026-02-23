# HealthBridge Troubleshooting Guide

**Version:** 1.0  
**Last Updated:** February 2026  
**Status:** Authoritative Reference

---

## Table of Contents

1. [Overview](#1-overview)
2. [Sync Issues](#2-sync-issues)
3. [WebSocket Issues](#3-websocket-issues)
4. [AI Issues](#4-ai-issues)
5. [Database Issues](#5-database-issues)
6. [Authentication Issues](#6-authentication-issues)
7. [Performance Issues](#7-performance-issues)

---

## 1. Overview

This guide provides solutions to common issues encountered when operating HealthBridge. For deployment issues, see the [Deployment Guide](../deployment/docker-deployment.md).

### Diagnostic Commands

```bash
# Check all service status
docker compose ps

# View logs for all services
docker compose logs -f

# View logs for specific service
docker compose logs -f healthbridge_core

# Check application health
curl http://localhost/api/health

# Check database connection
docker compose exec healthbridge_core php artisan tinker
>>> DB::connection()->getPdo();

# Check CouchDB status
curl http://localhost:5984/_up

# Check Redis status
docker compose exec redis redis-cli ping
```

---

## 2. Sync Issues

### Symptoms

- MySQL data is stale or outdated
- Changes from mobile app not appearing in web dashboard
- Sync worker not running

### Diagnosis

```bash
# Check sync worker status
sudo supervisorctl status healthbridge-couchdb-sync:*

# View sync worker logs
tail -f healthbridge_core/storage/logs/couchdb-sync.log

# Check CouchDB changes feed
curl http://admin:password@couchdb:5984/healthbridge_clinic/_changes?since=0&limit=10

# Check last sync sequence
docker compose exec healthbridge_core php artisan tinker
>>> Cache::get('couchdb_last_seq');
```

### Solutions

#### Sync Worker Not Running

```bash
# Start the worker
sudo supervisorctl start healthbridge-couchdb-sync:*

# If it fails to start, check logs
tail -f healthbridge_core/storage/logs/couchdb-sync-error.log

# Restart the worker
sudo supervisorctl restart healthbridge-couchdb-sync:*
```

#### Sync Worker Crashes Repeatedly

```bash
# Check for database connection issues
docker compose exec healthbridge_core php artisan tinker
>>> DB::connection()->getPdo();

# Check CouchDB connectivity
curl http://admin:password@couchdb:5984/healthbridge_clinic

# Reset sync checkpoint (caution: will re-sync all documents)
docker compose exec healthbridge_core php artisan couchdb:sync --reset
```

#### Documents Not Syncing

```bash
# Check for conflicts in CouchDB
curl http://admin:password@couchdb:5984/healthbridge_clinic/_conflicts

# Manual sync run with verbose output
docker compose exec healthbridge_core php artisan couchdb:sync -v

# Check specific document
curl http://admin:password@couchdb:5984/healthbridge_clinic/session_abc123
```

#### High Sync Latency

1. Reduce polling interval:
   ```ini
   ; /etc/supervisor/conf.d/healthbridge-couchdb-sync.conf
   command=php /var/www/html/artisan couchdb:sync --daemon --poll=2 --batch=100
   ```

2. Increase batch size:
   ```ini
   command=php /var/www/html/artisan couchdb:sync --daemon --poll=4 --batch=200
   ```

3. Check CouchDB performance:
   ```bash
   curl http://admin:password@couchdb:5984/_node/_local/_system
   ```

---

## 3. WebSocket Issues

### Symptoms

- Real-time updates not working
- Dashboard not refreshing automatically
- "WebSocket connection failed" errors in browser console

### Diagnosis

```bash
# Check Reverb status
docker compose exec healthbridge_core php artisan reverb:start --debug

# Check if Reverb is listening
netstat -tlnp | grep 8080

# Test WebSocket connection
wscat -c ws://localhost:8080

# Check nginx WebSocket proxy configuration
cat docker/nginx/conf.d/healthbridge.conf | grep -A 20 "location /app"
```

### Solutions

#### Reverb Not Starting

```bash
# Check if port is already in use
lsof -i :8080

# Kill existing process
kill -9 <PID>

# Start Reverb manually
docker compose exec healthbridge_core php artisan reverb:start

# Check for configuration errors
docker compose exec healthbridge_core php artisan config:show broadcasting
```

#### WebSocket Connection Failing

1. Check nginx configuration:
   ```nginx
   location /app {
       proxy_pass http://healthbridge_core:8080;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "Upgrade";
       proxy_set_header Host $host;
   }
   ```

2. Check CORS configuration:
   ```php
   // config/cors.php
   'paths' => ['api/*', 'sanctum/csrf-cookie', '_reverb/*'],
   'allowed_origins' => ['*'],
   'allowed_methods' => ['*'],
   'allowed_headers' => ['*'],
   ```

3. Verify broadcasting configuration:
   ```php
   // config/broadcasting.php
   'connections' => [
       'reverb' => [
           'driver' => 'reverb',
           'key' => env('REVERB_APP_KEY'),
           'secret' => env('REVERB_APP_SECRET'),
           'app_id' => env('REVERB_APP_ID'),
           'options' => [
               'host' => env('REVERB_HOST'),
               'port' => env('REVERB_PORT'),
               'scheme' => env('REVERB_SCHEME'),
           ],
       ],
   ],
   ```

#### Real-Time Updates Not Working

```bash
# Check if queues are running
docker compose exec healthbridge_core php artisan queue:work --once

# Check Redis connection
docker compose exec redis redis-cli ping

# Verify event broadcasting
docker compose exec healthbridge_core php artisan tinker
>>> event(new \App\Events\SessionStateChanged($session));
```

---

## 4. AI Issues

### Symptoms

- AI requests timing out
- "AI service unavailable" errors
- Slow AI response times
- AI returning unexpected results

### Diagnosis

```bash
# Check Ollama status
docker compose ps ollama

# Check Ollama logs
docker compose logs ollama

# Verify model is loaded
docker compose exec ollama ollama list

# Test Ollama directly
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "gemma3:4b", "prompt": "test", "stream": false}'
```

### Solutions

#### Ollama Not Responding

```bash
# Restart Ollama container
docker compose restart ollama

# Check GPU availability
docker compose exec ollama nvidia-smi

# Pull model if not present
docker compose exec ollama ollama pull gemma3:4b
```

#### AI Requests Timing Out

1. Increase timeout:
   ```env
   AI_TIMEOUT=120000
   ```

2. Check model memory usage:
   ```bash
   docker compose exec ollama nvidia-smi
   ```

3. Use smaller model:
   ```env
   OLLAMA_MODEL=gemma3:4b
   ```

#### AI Rate Limiting

```bash
# Check current rate limits
docker compose exec healthbridge_core php artisan tinker
>>> Cache::get('ai_rate_limit:user:1');

# Clear rate limit cache
docker compose exec healthbridge_core php artisan cache:clear --tags=ai
```

#### AI Output Validation Failures

```bash
# Check validation logs
docker compose exec healthbridge_core php artisan tinker
>>> \App\Models\AiRequest::where('was_overridden', true)->latest()->take(10)->get();

# Review blocked phrases
cat healthbridge_core/config/ai_policy.php | grep -A 20 "'deny'"
```

---

## 5. Database Issues

### Symptoms

- "Database connection refused" errors
- Slow queries
- Deadlocks

### Diagnosis

```bash
# Check MySQL status
docker compose ps mysql

# Check MySQL logs
docker compose logs mysql

# Test connection
docker compose exec healthbridge_core php artisan tinker
>>> DB::connection()->getPdo();

# Check MySQL processes
docker compose exec mysql mysql -e "SHOW PROCESSLIST;"

# Check table sizes
docker compose exec mysql mysql -e "
SELECT table_name, 
       ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
FROM information_schema.TABLES
WHERE table_schema = 'healthbridge'
ORDER BY size_mb DESC;
"
```

### Solutions

#### MySQL Connection Refused

```bash
# Check MySQL is running
docker compose ps mysql

# Restart MySQL
docker compose restart mysql

# Check credentials
docker compose exec healthbridge_core php artisan tinker
>>> config('database.connections.mysql');
```

#### Slow Queries

1. Enable query log:
   ```php
   // In AppServiceProvider::boot()
   if (config('app.debug')) {
       DB::listen(function ($query) {
           logger()->debug('SQL', [
               'sql' => $query->sql,
               'bindings' => $query->bindings,
               'time' => $query->time,
           ]);
       });
   }
   ```

2. Add indexes:
   ```bash
   docker compose exec healthbridge_core php artisan migrate
   ```

3. Check for missing indexes:
   ```sql
   EXPLAIN SELECT * FROM clinical_sessions WHERE status = 'open';
   ```

#### Deadlocks

```bash
# Check for locks
docker compose exec mysql mysql -e "SHOW ENGINE INNODB STATUS\G" | grep -A 50 "LATEST DETECTED DEADLOCK"

# Kill long-running queries
docker compose exec mysql mysql -e "SHOW PROCESSLIST;"
docker compose exec mysql mysql -e "KILL <id>;"
```

---

## 6. Authentication Issues

### Symptoms

- "Unauthenticated" errors
- Session not persisting
- Token invalid errors

### Diagnosis

```bash
# Check if user exists
docker compose exec healthbridge_core php artisan tinker
>>> User::where('email', 'user@example.com')->first();

# Check user roles
>>> User::find(1)->roles;

# Check session configuration
>>> config('session');
```

### Solutions

#### Session Not Persisting

1. Check session configuration:
   ```php
   // config/session.php
   'driver' => env('SESSION_DRIVER', 'redis'),
   'connection' => env('SESSION_CONNECTION', 'default'),
   ```

2. Verify Redis connection:
   ```bash
   docker compose exec redis redis-cli ping
   ```

3. Check CORS and Sanctum configuration:
   ```php
   // config/sanctum.php
   'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', '')),
   ```

#### Token Invalid

```bash
# Revoke all tokens for user
docker compose exec healthbridge_core php artisan tinker
>>> User::find(1)->tokens()->delete();

# Create new token
>>> User::find(1)->createToken('mobile-app')->plainTextToken;
```

#### Role Permission Denied

```bash
# Check user roles
docker compose exec healthbridge_core php artisan tinker
>>> User::find(1)->roles;
>>> User::find(1)->permissions;

# Assign role
>>> User::find(1)->assignRole('doctor');
```

---

## 7. Performance Issues

### Symptoms

- Slow page loads
- High CPU/memory usage
- Timeouts

### Diagnosis

```bash
# Check container resource usage
docker stats

# Check PHP-FPM status
docker compose exec healthbridge_core php -i | grep memory_limit

# Check OPcache status
docker compose exec healthbridge_core php -i | grep opcache

# Check queue backlog
docker compose exec healthbridge_core php artisan queue:monitor
```

### Solutions

#### High Memory Usage

1. Increase PHP memory limit:
   ```ini
   ; php.ini
   memory_limit = 512M
   ```

2. Optimize OPcache:
   ```ini
   opcache.memory_consumption = 256
   opcache.interned_strings_buffer = 16
   opcache.max_accelerated_files = 10000
   ```

3. Clear application cache:
   ```bash
   docker compose exec healthbridge_core php artisan cache:clear
   docker compose exec healthbridge_core php artisan config:clear
   docker compose exec healthbridge_core php artisan view:clear
   ```

#### Slow Page Loads

1. Enable application caching:
   ```bash
   docker compose exec healthbridge_core php artisan config:cache
   docker compose exec healthbridge_core php artisan route:cache
   docker compose exec healthbridge_core php artisan view:cache
   ```

2. Optimize autoloader:
   ```bash
   docker compose exec healthbridge_core composer install --optimize-autoloader --no-dev
   ```

3. Check for N+1 queries:
   ```php
   // Enable debugbar in development
   // Check for eager loading opportunities
   ClinicalSession::with(['patient', 'forms', 'referrals'])->get();
   ```

#### Queue Backlog

```bash
# Check queue size
docker compose exec healthbridge_core php artisan queue:monitor

# Process queue manually
docker compose exec healthbridge_core php artisan queue:work --once

# Scale workers
docker compose exec healthbridge_core php artisan queue:work --daemon
```

---

## Related Documentation

- [System Overview](../architecture/system-overview.md)
- [Deployment Guide](../deployment/docker-deployment.md)
- [Data Synchronization](../architecture/data-synchronization.md)
