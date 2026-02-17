# CouchDB to MySQL Sync Guide

This document provides comprehensive documentation for the CouchDB to MySQL synchronization system in HealthBridge.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Document Type Requirements](#document-type-requirements)
3. [Sync Worker Configuration](#sync-worker-configuration)
4. [Running the Sync Worker](#running-the-sync-worker)
5. [Troubleshooting](#troubleshooting)
6. [Migration Guide for Existing Data](#migration-guide-for-existing-data)

---

## Architecture Overview

The HealthBridge system uses a dual-database architecture:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  nurse_mobile   │     │ healthbridge_core│     │    CouchDB      │
│   (PouchDB)     │────▶│   (Laravel)      │◀───▶│  (healthbridge_ │
│                 │     │                  │     │   clinic)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │     MySQL       │
                        │  (healthbridge) │
                        └─────────────────┘
```

### Data Flow

1. **nurse_mobile** creates clinical documents (sessions, forms, patients)
2. Documents sync to **CouchDB** via Laravel proxy (`/api/couchdb/*`)
3. **CouchSyncWorker** reads CouchDB changes feed
4. **SyncService** transforms and inserts documents into MySQL

### Encrypted Patient Data

Patient documents are encrypted in CouchDB for privacy. The sync handles this specially:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Encrypted Patient Document                    │
├─────────────────────────────────────────────────────────────────┤
│  {                                                              │
│    "_id": "patient:UASE",                                       │
│    "type": "clinicalPatient",                                   │
│    "encrypted": true,                                           │
│    "data": "{\"ciphertext\":\"...\",\"iv\":\"...\",\"tag\":\"...\"}" │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MySQL Patient Record                          │
├─────────────────────────────────────────────────────────────────┤
│  couch_id: "patient:UASE"                                       │
│  cpt: "UASE" (extracted from _id)                               │
│  is_active: true                                                │
│  raw_document: {full encrypted document}                        │
│  (other fields NULL - data is encrypted)                        │
└─────────────────────────────────────────────────────────────────┘
```

The CPT (Community Patient ID) is extracted from the document ID prefix `patient:`.

---

## Document Type Requirements

All documents in CouchDB **MUST** have a `type` field for proper sync routing:

| Document Type | `type` Value | MySQL Table |
|---------------|--------------|-------------|
| Clinical Session | `clinicalSession` | `clinical_sessions` |
| Clinical Form | `clinicalForm` | `clinical_forms` |
| Patient | `clinicalPatient` | `patients` |
| AI Log | `aiLog` | `ai_requests` |

### Example Documents

#### Clinical Session
```json
{
  "_id": "session:abc123",
  "type": "clinicalSession",
  "patientId": "UASE",
  "createdBy": 5,
  "providerId": 5,
  "providerRole": "nurse",
  "triage": "red",
  "status": "completed",
  "stage": "discharge",
  "formInstanceIds": ["form_peds_respiratory_123"],
  "createdAt": 1771334055454,
  "updatedAt": 1771334250092
}
```

> **Note:** The `createdBy`, `providerId`, and `providerRole` fields track which nurse or frontline worker created the session. These are synced to MySQL for audit and attribution purposes.

#### Clinical Form
```json
{
  "_id": "form_peds_respiratory_123",
  "type": "clinicalForm",
  "schemaId": "peds_respiratory",
  "schemaVersion": "1.0.2",
  "sessionId": "session:abc123",
  "patientId": "UASE",
  "createdBy": 5,
  "creatorRole": "nurse",
  "status": "completed",
  "answers": { ... },
  "createdAt": "2026-02-17T13:14:15.454Z",
  "updatedAt": "2026-02-17T13:17:30.092Z"
}
```

> **Note:** The `createdBy` and `creatorRole` fields track which nurse or frontline worker filled out the form.

#### AI Log
```json
{
  "_id": "aiLog:def456",
  "type": "aiLog",
  "sessionId": "session:abc123",
  "formInstanceId": "form_peds_respiratory_123",
  "userId": 5,
  "role": "nurse",
  "task": "triage_assessment",
  "useCase": "pediatric_respiratory",
  "prompt": "...",
  "output": "...",
  "model": "medgemma",
  "latencyMs": 1250,
  "createdAt": "2026-02-17T13:15:00.000Z"
}
```

> **Note:** The `userId` and `role` fields track which nurse or frontline worker requested the AI assistance. This ensures AI-generated content is properly attributed.

#### Patient (Non-Encrypted)
```json
{
  "_id": "patient:UASE",
  "type": "clinicalPatient",
  "cpt": "UASE",
  "shortCode": "UASE",
  "dateOfBirth": "2023-04-11",
  "gender": "male"
}
```

#### Patient (Encrypted - Default)
Patient documents are typically encrypted in CouchDB for privacy. The sync service handles this by extracting the CPT from the document ID:

```json
{
  "_id": "patient:UASE",
  "type": "clinicalPatient",
  "encrypted": true,
  "data": "{\"ciphertext\":\"...\",\"iv\":\"...\",\"tag\":\"...\"}",
  "encryptedAt": "2026-02-10T13:08:39.205Z"
}
```

When encrypted:
- CPT is extracted from `_id` (e.g., `patient:UASE` → `UASE`)
- Only `couch_id`, `cpt`, `is_active`, and `raw_document` are stored in MySQL
- Decryption happens client-side (nurse_mobile app) when needed

---

## Sync Worker Configuration

### Environment Variables

Add to your `.env` file:

```env
# CouchDB Configuration
COUCHDB_HOST=http://localhost:5984
COUCHDB_DATABASE=healthbridge_clinic
COUCHDB_USERNAME=admin
COUCHDB_PASSWORD=your_password

# Cache Configuration (for sequence tracking)
CACHE_STORE=database
```

### Cache Configuration

The sync worker uses Laravel's cache to track the last processed sequence. The sequence is stored with the key `couchdb_sync_sequence`.

For database cache, ensure the `cache` table exists:
```bash
php artisan cache:table
php artisan migrate
```

---

## Running the Sync Worker

### One-time Sync

Process all pending changes once:

```bash
php artisan couchdb:sync
```

Options:
- `--batch=100` - Maximum documents per batch (default: 100)
- `--reset` - Reset sequence and process all documents from beginning

### Continuous Sync (Daemon Mode)

Run continuously as a daemon:

```bash
php artisan couchdb:sync --daemon
```

Options:
- `--poll=4` - Polling interval in seconds (default: 4)
- `--batch=100` - Maximum documents per batch

### Using Supervisor (Production)

Create `/etc/supervisor/conf.d/healthbridge-couchdb-sync.conf`:

```ini
[program:healthbridge-couchdb-sync]
command=php /path/to/healthbridge_core/artisan couchdb:sync --daemon
numprocs=1
autostart=true
autorestart=true
user=www-data
redirect_stderr=true
stdout_logfile=/var/log/healthbridge/couchdb-sync.log
```

Apply configuration:
```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start healthbridge-couchdb-sync
```

### Using systemd (Linux)

Create `/etc/systemd/system/healthbridge-couchdb-sync.service`:

```ini
[Unit]
Description=HealthBridge CouchDB Sync Worker
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/healthbridge_core
ExecStart=/usr/bin/php artisan couchdb:sync --daemon
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable healthbridge-couchdb-sync
sudo systemctl start healthbridge-couchdb-sync
```

### Using Windows Task Scheduler

Create a batch file `start-couchdb-sync.bat`:

```batch
@echo off
cd C:\path\to\healthbridge_core
php artisan couchdb:sync --daemon
```

Create a scheduled task to run at system startup.

---

## Troubleshooting

### Check Sync Status

```bash
# Check current sequence
php artisan tinker --execute="echo Cache::get('couchdb_sync_sequence', '0');"

# Check record counts
php artisan tinker --execute="echo 'Patients: ' . App\Models\Patient::count() . PHP_EOL; echo 'Sessions: ' . App\Models\ClinicalSession::count() . PHP_EOL; echo 'Forms: ' . App\Models\ClinicalForm::count() . PHP_EOL;"

# View sample patient records
php artisan tinker --execute="print_r(App\Models\Patient::take(5)->get(['id', 'couch_id', 'cpt', 'is_active'])->toArray());"
```

### Common Issues

#### 1. Documents Not Syncing

**Symptom**: Records exist in CouchDB but not in MySQL.

**Causes**:
- Missing `type` field in document
- Sync worker not running
- Sequence cache ahead of actual changes

**Solutions**:
```bash
# Reset sequence and reprocess all
php artisan couchdb:sync --reset

# Check logs
tail -f storage/logs/laravel.log | grep SyncService
```

#### 2. Integrity Constraint Violation

**Symptom**: `SQLSTATE[23000]: Integrity constraint violation`

**Cause**: Required field is NULL in document but NOT NULL in database.

**Solution**: Check the SyncService mapping and ensure all required fields have defaults.

#### 3. Patient Sync Fails with "Column 'cpt' cannot be null"

**Symptom**: Patient documents fail to sync with error:
```
SQLSTATE[23000]: Integrity constraint violation: 1048 Column 'cpt' cannot be null
```

**Cause**: Patient documents are encrypted in CouchDB. The `cpt` field cannot be extracted from encrypted data.

**Solution**: The SyncService automatically handles encrypted patients by extracting CPT from the document ID. Ensure:
- Document `_id` follows the pattern `patient:CPT` (e.g., `patient:UASE`)
- The `encrypted` field is set to `true` in the document

If you have legacy patient documents without proper ID format, update them:
```bash
# Check patient document structure
curl -X GET http://localhost:5984/healthbridge_clinic/patient:UASE -u admin:password

# Verify encryption flag exists
# If missing, add it via Fauxton or bulk update
```

#### 4. Cache Not Clearing

**Symptom**: `--reset` option doesn't reset sequence.

**Solution**:
```bash
# Clear cache manually
php artisan cache:clear

# Or delete specific key
php artisan tinker --execute="Cache::forget('couchdb_sync_sequence');"
```

### Debug Mode

Enable debug logging in `SyncService.php`:

```php
Log::debug('SyncService: Processing document', [
    'id' => $doc['_id'] ?? 'unknown',
    'type' => $type,
]);
```

---

## Migration Guide for Existing Data

If you have existing CouchDB documents without the `type` field, you need to migrate them.

### Option 1: Update Documents in CouchDB

Use Fauxton (CouchDB web UI) or curl to add `type` fields:

```bash
# Example: Add type to all sessions
curl -X POST http://localhost:5984/healthbridge_clinic/_bulk_docs \
  -H "Content-Type: application/json" \
  -u admin:password \
  -d '{
    "docs": [
      {"_id": "session:abc", "type": "clinicalSession", ...}
    ]
  }'
```

### Option 2: Create Migration Script

Create `healthbridge_core/app/Console/Commands/MigrateCouchDbTypes.php`:

```php
<?php

namespace App\Console\Commands;

use App\Services\CouchDbService;
use Illuminate\Console\Command;

class MigrateCouchDbTypes extends Command
{
    protected $signature = 'couchdb:migrate-types';
    protected $description = 'Add type field to documents missing it';

    public function handle(CouchDbService $couchDb)
    {
        $this->info('Fetching all documents...');
        
        $result = $couchDb->getAllDocs();
        $updated = 0;
        
        foreach ($result['rows'] as $row) {
            $doc = $row['doc'] ?? null;
            if (!$doc) continue;
            
            $id = $doc['_id'] ?? '';
            $type = $doc['type'] ?? null;
            
            if ($type) continue;
            
            // Infer type from _id prefix
            if (str_starts_with($id, 'session:')) {
                $doc['type'] = 'clinicalSession';
            } elseif (str_starts_with($id, 'form_')) {
                $doc['type'] = 'clinicalForm';
            } elseif (str_starts_with($id, 'patient:')) {
                $doc['type'] = 'clinicalPatient';
            } elseif (str_starts_with($id, 'timeline:')) {
                $doc['type'] = 'timeline';
            } else {
                continue;
            }
            
            $couchDb->saveDocument($doc);
            $updated++;
            $this->info("Updated: {$id} -> {$doc['type']}");
        }
        
        $this->info("Migration complete. Updated {$updated} documents.");
    }
}
```

Run migration:
```bash
php artisan couchdb:migrate-types
php artisan couchdb:sync --reset
```

---

## Monitoring

### Health Check Endpoint

The CouchDB proxy provides a health check:

```bash
curl http://localhost:8000/api/couchdb/health
```

Response:
```json
{
  "status": "healthy",
  "couchdb": "reachable",
  "database": "healthbridge_clinic"
}
```

### Log Monitoring

Monitor sync activity:

```bash
# Real-time log monitoring
tail -f storage/logs/laravel.log | grep -E "(SyncService|CouchSyncWorker)"

# Count synced documents by type
grep "Synced session" storage/logs/laravel.log | wc -l
grep "Synced form" storage/logs/laravel.log | wc -l
```

---

## Related Documentation

- [DUAL_DATABASE_SYNC_ARCHITECTURE.md](./DUAL_DATABASE_SYNC_ARCHITECTURE.md) - Detailed sync architecture
- [SYNC_TROUBLESHOOTING.md](./SYNC_TROUBLESHOOTING.md) - Additional troubleshooting
- [NURSE_MOBILE_DEPLOYMENT_GUIDE.md](./NURSE_MOBILE_DEPLOYMENT_GUIDE.md) - Mobile app deployment
