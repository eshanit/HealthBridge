# GP Dashboard Test Environment: CouchDB to MySQL Sync Guide

This comprehensive guide provides step-by-step instructions for synchronizing data from CouchDB to MySQL to populate the GP dashboard test environment.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Schema Transformation Mapping](#schema-transformation-mapping)
3. [Prerequisites](#prerequisites)
4. [Step-by-Step Setup](#step-by-step-setup)
5. [Data Migration Methods](#data-migration-methods)
6. [Automation Options](#automation-options)
7. [Testing & Verification](#testing--verification)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │  nurse_mobile   │     │ healthbridge_core│     │    CouchDB      │       │
│  │   (PouchDB)     │────▶│   (Laravel)      │◀───▶│  (healthbridge_ │       │
│  │                 │     │                  │     │   clinic)       │       │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘       │
│                                   │                                         │
│                                   │ SyncService                             │
│                                   ▼                                         │
│                            ┌─────────────────┐                             │
│                            │     MySQL       │                             │
│                            │  (healthbridge) │                             │
│                            │                 │                             │
│                            │  ┌───────────┐  │                             │
│                            │  │ patients  │  │                             │
│                            │  ├───────────┤  │                             │
│                            │  │ sessions  │  │                             │
│                            │  ├───────────┤  │                             │
│                            │  │ forms     │  │                             │
│                            │  ├───────────┤  │                             │
│                            │  │ referrals │  │                             │
│                            │  └───────────┘  │                             │
│                            └─────────────────┘                             │
│                                   │                                         │
│                                   ▼                                         │
│                            ┌─────────────────┐                             │
│                            │   GP Dashboard  │                             │
│                            │   (Vue/Inertia) │                             │
│                            └─────────────────┘                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| [`CouchDbService`](healthbridge_core/app/Services/CouchDbService.php) | PHP/Laravel | HTTP client for CouchDB API |
| [`SyncService`](healthbridge_core/app/Services/SyncService.php) | PHP/Laravel | Document transformation & MySQL upsert |
| [`CouchSyncWorker`](healthbridge_core/app/Console/Commands/CouchSyncWorker.php) | Artisan Command | Daemon process for continuous sync |
| [`GPDashboardTestSeeder`](healthbridge_core/database/seeders/GPDashboardTestSeeder.php) | Laravel Seeder | Test data generation |

---

## Schema Transformation Mapping

### Document Type to Table Mapping

| CouchDB Document Type | MySQL Table | Primary Key |
|-----------------------|-------------|-------------|
| `clinicalPatient` | `patients` | `couch_id` |
| `clinicalSession` | `clinical_sessions` | `couch_id` |
| `clinicalForm` | `clinical_forms` | `couch_id` |
| `aiLog` | `ai_requests` | `request_uuid` |

### Field Transformation: Patient Document

```javascript
// CouchDB Document (JSON)
{
  "_id": "patient:UASE",
  "_rev": "1-abc123",
  "type": "clinicalPatient",
  "encrypted": true,
  "data": "{\"ciphertext\":\"...\",\"iv\":\"...\",\"tag\":\"...\"}"
}

// OR Non-encrypted:
{
  "_id": "patient:UASE",
  "type": "clinicalPatient",
  "cpt": "UASE",
  "shortCode": "UASE",
  "dateOfBirth": "2023-04-11",
  "gender": "male",
  "weightKg": 12.5,
  "phone": "+263771234567",
  "visitCount": 3,
  "isActive": true
}
```

```sql
-- MySQL Record
INSERT INTO patients (
    couch_id,        -- "patient:UASE" (from _id)
    cpt,             -- "UASE" (extracted from _id prefix or doc.cpt)
    short_code,      -- doc.shortCode
    date_of_birth,   -- doc.dateOfBirth
    age_months,      -- CALCULATED from dateOfBirth
    gender,          -- doc.gender (enum: male/female/other)
    weight_kg,       -- doc.weightKg
    phone,           -- doc.phone
    visit_count,     -- doc.visitCount (default: 1)
    is_active,       -- doc.isActive (default: true)
    raw_document,    -- Full JSON document
    last_visit_at    -- doc.lastVisit
) VALUES (...);
```

### Field Transformation: Clinical Session Document

```javascript
// CouchDB Document (JSON)
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
  "workflowState": "REFERRED",
  "chiefComplaint": "Fever and cough",
  "notes": "Patient presented with...",
  "treatmentPlan": "Prescribed antibiotics...",
  "formInstanceIds": ["form_peds_respiratory_123"],
  "createdAt": 1771334055454,  // Unix timestamp (ms)
  "updatedAt": 1771334250092
}
```

```sql
-- MySQL Record
INSERT INTO clinical_sessions (
    couch_id,              -- doc._id
    session_uuid,          -- doc.id OR doc._id
    patient_cpt,           -- doc.patientId OR doc.patientCpt
    stage,                 -- doc.stage (enum: registration/assessment/treatment/discharge)
    status,                -- doc.status (enum: open/completed/archived/referred/cancelled)
    triage_priority,       -- doc.triage OR doc.triagePriority (enum: red/yellow/green/unknown)
    workflow_state,        -- doc.workflowState (default: NEW)
    chief_complaint,       -- doc.chiefComplaint
    notes,                 -- doc.notes
    treatment_plan,        -- doc.treatmentPlan
    form_instance_ids,     -- doc.formInstanceIds (JSON array)
    created_by_user_id,    -- RESOLVED from doc.createdBy/doc.providerId
    provider_role,         -- doc.providerRole
    session_created_at,    -- PARSED from doc.createdAt (timestamp ms to datetime)
    session_updated_at,    -- PARSED from doc.updatedAt
    raw_document,          -- Full JSON document
    synced_at              -- NOW()
) VALUES (...);
```

### Field Transformation: Clinical Form Document

```javascript
// CouchDB Document (JSON)
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
  "answers": {
    "chiefComplaint": "Cough",
    "symptoms": ["fever", "cough", "difficulty_breathing"],
    "duration": "3 days"
  },
  "calculated": {
    "triagePriority": "red",
    "hasDangerSign": true
  },
  "createdAt": "2026-02-17T13:14:15.454Z",
  "updatedAt": "2026-02-17T13:17:30.092Z"
}
```

```sql
-- MySQL Record
INSERT INTO clinical_forms (
    couch_id,           -- doc._id
    form_uuid,          -- doc._id
    session_couch_id,   -- doc.sessionId
    patient_cpt,        -- doc.patientId
    schema_id,          -- doc.schemaId
    schema_version,     -- doc.schemaVersion
    current_state_id,   -- doc.currentStateId
    status,             -- doc.status (enum: draft/completed/submitted/synced/error)
    sync_status,        -- 'synced'
    answers,            -- doc.answers (JSON)
    calculated,         -- doc.calculated (JSON)
    audit_log,          -- doc.auditLog (JSON)
    created_by_user_id, -- RESOLVED from doc.createdBy
    creator_role,       -- doc.creatorRole
    form_created_at,    -- doc.createdAt
    form_updated_at,    -- doc.updatedAt
    completed_at,       -- doc.completedAt
    synced_at,          -- NOW()
    raw_document        -- Full JSON document
) VALUES (...);
```

### Transformation Rules Summary

| Source Format | Target Format | Transformation |
|---------------|---------------|----------------|
| `camelCase` | `snake_case` | Field name conversion |
| Unix timestamp (ms) | `Y-m-d H:i:s` | [`parseTimestamp()`](healthbridge_core/app/Services/SyncService.php:293) |
| ISO 8601 string | `Y-m-d H:i:s` | Direct parse |
| Nested JSON object | JSON column | Store as-is |
| User ID reference | Foreign key | [`resolveUserId()`](healthbridge_core/app/Services/SyncService.php:341) |
| `_id` prefix | Extracted value | e.g., `patient:UASE` → `UASE` |

---

## Prerequisites

### Environment Requirements

```bash
# Software Requirements
- PHP >= 8.2
- Composer
- MySQL >= 8.0
- CouchDB >= 3.0
- Node.js >= 18 (for frontend assets)
```

### Configuration

1. **Environment Variables** (`.env`):

```env
# MySQL Configuration
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=healthbridge
DB_USERNAME=your_username
DB_PASSWORD=your_password

# CouchDB Configuration
COUCHDB_HOST=http://localhost:5984
COUCHDB_DATABASE=healthbridge_clinic
COUCHDB_USERNAME=admin
COUCHDB_PASSWORD=your_couchdb_password

# Cache Configuration (for sequence tracking)
CACHE_STORE=database
```

2. **Verify CouchDB is Running**:

```bash
curl http://localhost:5984/_up
# Expected: {"status":"ok",...}
```

3. **Verify MySQL Connection**:

```bash
cd healthbridge_core
php artisan tinker --execute="DB::connection()->getPdo(); echo 'Connected';"
```

---

## Step-by-Step Setup

### Step 1: Database Migrations

```bash
cd healthbridge_core

# Run migrations
php artisan migrate

# Verify tables created
php artisan tinker --execute="
    \$tables = ['patients', 'clinical_sessions', 'clinical_forms', 'ai_requests', 'referrals'];
    foreach (\$tables as \$table) {
        echo \$table . ': ' . DB::table(\$table)->count() . PHP_EOL;
    }
"
```

### Step 2: Seed Base Users and Roles

```bash
# Run role and user seeders
php artisan db:seed --class=RoleSeeder
php artisan db:seed --class=DatabaseSeeder

# Verify users created
php artisan tinker --execute="
    User::with('roles')->get()->each(function(\$u) {
        echo \$u->email . ' - ' . \$u->roles->pluck('name')->join(', ') . PHP_EOL;
    });
"
```

### Step 3: Configure CouchDB

```bash
# Option A: Use the setup command
php artisan couchdb:setup

# Option B: Manual setup via curl
curl -X PUT http://admin:password@localhost:5984/healthbridge_clinic
```

### Step 4: Run Initial Sync

```bash
# One-time full sync (from beginning)
php artisan couchdb:sync --reset

# Check sync results
php artisan tinker --execute="
    echo 'Patients: ' . App\Models\Patient::count() . PHP_EOL;
    echo 'Sessions: ' . App\Models\ClinicalSession::count() . PHP_EOL;
    echo 'Forms: ' . App\Models\ClinicalForm::count() . PHP_EOL;
    echo 'AI Logs: ' . App\Models\AiRequest::count() . PHP_EOL;
"
```

### Step 5: Seed Test Data (If No CouchDB Data)

If CouchDB is empty or you want additional test data:

```bash
# Run GP Dashboard test seeder
php artisan db:seed --class=GPDashboardTestSeeder

# This creates:
# - 10 test patients
# - 10 clinical sessions in various workflow states
# - Associated referrals and clinical forms
```

---

## Data Migration Methods

### Method 1: Real-time Sync (Recommended for Production)

The [`CouchSyncWorker`](healthbridge_core/app/Console/Commands/CouchSyncWorker.php) monitors CouchDB's `_changes` feed and syncs new documents automatically.

```bash
# Run as daemon
php artisan couchdb:sync --daemon --poll=4 --batch=100
```

**Options:**
- `--daemon` - Run continuously
- `--poll=4` - Polling interval in seconds
- `--batch=100` - Maximum documents per batch
- `--reset` - Reset sequence and process all documents

### Method 2: Scheduled Sync (Cron-based)

Add to `app/Console/Kernel.php`:

```php
protected function schedule(Schedule $schedule)
{
    $schedule->command('couchdb:sync')
        ->everyMinute()
        ->withoutOverlapping();
}
```

### Method 3: Manual Bulk Import

For initial population or test environments:

```bash
# Create a custom import command
php artisan make:command ImportCouchDbBulk

# Run the import
php artisan couchdb:import-bulk
```

### Method 4: Test Data Seeder

Use the [`GPDashboardTestSeeder`](healthbridge_core/database/seeders/GPDashboardTestSeeder.php) for development/testing:

```bash
php artisan db:seed --class=GPDashboardTestSeeder
```

---

## Automation Options

### Option 1: Supervisor (Linux/Production)

Create `/etc/supervisor/conf.d/healthbridge-couchdb-sync.conf`:

```ini
[program:healthbridge-couchdb-sync]
command=php /path/to/healthbridge_core/artisan couchdb:sync --daemon
process_name=%(program_name)s
numprocs=1
directory=/path/to/healthbridge_core
autostart=true
autorestart=true
startsecs=0
stopwaitsecs=30
user=www-data
redirect_stderr=true
stdout_logfile=/var/log/healthbridge/couchdb-sync.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=5
```

Apply configuration:

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start healthbridge-couchdb-sync
sudo supervisorctl status healthbridge-couchdb-sync
```

### Option 2: systemd (Linux)

Create `/etc/systemd/system/healthbridge-couchdb-sync.service`:

```ini
[Unit]
Description=HealthBridge CouchDB Sync Worker
After=network.target mysql.service couchdb.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/healthbridge_core
ExecStart=/usr/bin/php artisan couchdb:sync --daemon
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=healthbridge-sync

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable healthbridge-couchdb-sync
sudo systemctl start healthbridge-couchdb-sync
sudo systemctl status healthbridge-couchdb-sync
```

### Option 3: Windows Task Scheduler

1. Create `start-couchdb-sync.bat`:

```batch
@echo off
cd C:\path\to\healthbridge_core
php artisan couchdb:sync --daemon
```

2. Create a scheduled task:
   - Open Task Scheduler
   - Create Basic Task
   - Trigger: At system startup
   - Action: Start a program
   - Program: `C:\path\to\start-couchdb-sync.bat`

### Option 4: Laravel Horizon (Alternative)

For queue-based processing, modify the sync to use jobs:

```php
// In CouchSyncWorker, dispatch jobs instead of direct sync
foreach ($results as $change) {
    if (isset($change['doc'])) {
        dispatch(new SyncDocumentJob($change['doc']));
    }
}
```

---

## Testing & Verification

### Verify Sync Status

```bash
# Check current sequence
php artisan tinker --execute="echo Cache::get('couchdb_sync_sequence', '0');"

# Check record counts
php artisan tinker --execute="
    echo 'Patients: ' . App\Models\Patient::count() . PHP_EOL;
    echo 'Sessions: ' . App\Models\ClinicalSession::count() . PHP_EOL;
    echo 'Forms: ' . App\Models\ClinicalForm::count() . PHP_EOL;
    echo 'AI Logs: ' . App\Models\AiRequest::count() . PHP_EOL;
    echo 'Referrals: ' . App\Models\Referral::count() . PHP_EOL;
"

# View sample patient records
php artisan tinker --execute="
    print_r(App\Models\Patient::take(5)->get(['id', 'couch_id', 'cpt', 'is_active'])->toArray());
"
```

### Verify GP Dashboard Data

```bash
# Check sessions by workflow state
php artisan tinker --execute="
    App\Models\ClinicalSession::select('workflow_state', DB::raw('count(*) as total'))
        ->groupBy('workflow_state')
        ->get()
        ->each(fn(\$s) => print(\$s->workflow_state . ': ' . \$s->total . PHP_EOL));
"

# Check pending referrals
php artisan tinker --execute="
    App\Models\Referral::with('session.patient')
        ->where('status', 'pending')
        ->get()
        ->each(function(\$r) {
            print(\$r->session->patient_cpt . ' - ' . \$r->priority . PHP_EOL);
        });
"
```

### Test API Endpoints

```bash
# Test GP Dashboard endpoints
curl -H "Accept: application/json" http://localhost:8000/gp/dashboard
curl -H "Accept: application/json" http://localhost:8000/gp/referrals/json
curl -H "Accept: application/json" http://localhost:8000/gp/my-cases/json
```

### Run Test Suite

```bash
cd healthbridge_core
php artisan test --filter=Sync
```

---

## Troubleshooting

### Common Issues

#### 1. Documents Not Syncing

**Symptom**: Records exist in CouchDB but not in MySQL.

**Diagnosis**:
```bash
# Check if sync worker is running
ps aux | grep couchdb:sync

# Check CouchDB documents
curl http://admin:password@localhost:5984/healthbridge_clinic/_all_docs?include_docs=true

# Check for missing type fields
curl http://admin:password@localhost:5984/healthbridge_clinic/_all_docs?include_docs=true | jq '.rows[].doc | select(.type == null)'
```

**Solution**:
```bash
# Reset and reprocess all documents
php artisan couchdb:sync --reset

# Or add missing type fields
php artisan couchdb:migrate-types
```

#### 2. Integrity Constraint Violation

**Symptom**: `SQLSTATE[23000]: Integrity constraint violation: 1048 Column 'cpt' cannot be null`

**Cause**: Patient documents are encrypted and CPT cannot be extracted.

**Solution**: Ensure document `_id` follows the pattern `patient:CPT`:
```bash
# Check patient document structure
curl http://admin:password@localhost:5984/healthbridge_clinic/patient:UASE

# Verify _id format includes CPT
```

#### 3. Timestamp Parsing Errors

**Symptom**: Incorrect dates in MySQL.

**Diagnosis**:
```bash
# Check timestamp format in CouchDB
curl http://admin:password@localhost:5984/healthbridge_clinic/session:abc123 | jq '.createdAt'
```

**Solution**: The [`parseTimestamp()`](healthbridge_core/app/Services/SyncService.php:293) method handles both:
- Unix timestamps (milliseconds): `1771334055454`
- ISO 8601 strings: `"2026-02-17T13:14:15.454Z"`

#### 4. User ID Resolution Fails

**Symptom**: `created_by_user_id` is NULL in MySQL.

**Cause**: User ID in CouchDB doesn't match MySQL user.

**Solution**:
```bash
# Check user exists
php artisan tinker --execute="echo App\Models\User::find(5);"

# Verify user ID format in CouchDB matches
```

### Debug Mode

Enable detailed logging:

```php
// In SyncService.php
Log::debug('SyncService: Processing document', [
    'id' => $doc['_id'] ?? 'unknown',
    'type' => $type,
    'raw' => $doc,
]);
```

Monitor logs:
```bash
tail -f storage/logs/laravel.log | grep -E "(SyncService|CouchSyncWorker)"
```

### Health Check

```bash
# Check CouchDB health
curl http://localhost:8000/api/couchdb/health

# Expected response:
# {"status":"healthy","couchdb":"reachable","database":"healthbridge_clinic"}
```

---

## Quick Reference Commands

```bash
# Full reset and sync
php artisan cache:clear
php artisan couchdb:sync --reset

# Seed test data
php artisan db:seed --class=GPDashboardTestSeeder

# Check sync status
php artisan tinker --execute="echo Cache::get('couchdb_sync_sequence', '0');"

# Monitor in real-time
tail -f storage/logs/laravel.log | grep SyncService

# Start daemon (development)
php artisan couchdb:sync --daemon

# Start daemon (production with supervisor)
sudo supervisorctl start healthbridge-couchdb-sync
```

---

## Related Documentation

- [`COUCHDB_MYSQL_SYNC_GUIDE.md`](docs/COUCHDB_MYSQL_SYNC_GUIDE.md) - Detailed sync documentation
- [`DUAL_DATABASE_SYNC_ARCHITECTURE.md`](docs/DUAL_DATABASE_SYNC_ARCHITECTURE.md) - Architecture overview
- [`SYNC_TROUBLESHOOTING.md`](docs/SYNC_TROUBLESHOOTING.md) - Troubleshooting guide
- [`E2E_SYNC_TESTING_GUIDE.md`](docs/E2E_SYNC_TESTING_GUIDE.md) - End-to-end testing
