# UtanoBridge Data Synchronization Architecture

**Version:** 1.0  
**Last Updated:** February 2026  
**Status:** Authoritative Reference

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Pattern](#2-architecture-pattern)
3. [CouchDB Document Types](#3-couchdb-document-types)
4. [MySQL Mirror Schema](#4-mysql-mirror-schema)
5. [Sync Worker Implementation](#5-sync-worker-implementation)
6. [Conflict Resolution](#6-conflict-resolution)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Overview

UtanoBridge uses a **dual-database architecture** with CouchDB as the source of truth for clinical documents and MySQL as the operational mirror for dashboards and reporting. This design enables:

- **Offline-First Operation**: Mobile devices can work without connectivity
- **Near Real-Time Sync**: MySQL updated within ~4 seconds of mobile sync
- **Conflict Tolerance**: Built-in conflict resolution for distributed edits
- **Audit Trail**: Complete change history in both systems

### Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │     │   CouchDB       │     │   MySQL         │
│   (Nuxt+Pouch)  │────▶│ (source of truth│◀────│ (operational    │
│                 │     │  for clinical   │     │  mirror)        │
└─────────────────┘     │  documents)     │     └────────┬────────┘
                        └────────┬────────┘              │
                                 │                       │
                                 │ changes feed          │
                                 ▼                       │
                        ┌─────────────────┐              │
                        │   Sync Worker   │──────────────┘
                        │ (Laravel daemon)│
                        └─────────────────┘
```

---

## 2. Architecture Pattern

### Laravel Proxy Pattern

UtanoBridge uses a **Laravel proxy pattern** instead of direct CouchDB connections from the web frontend. This approach provides:

| Benefit | Description |
|---------|-------------|
| **Security** | CouchDB credentials never exposed to frontend |
| **Validation** | Server-side validation before CouchDB writes |
| **Audit** | All writes logged through Laravel middleware |
| **Flexibility** | Can switch databases without frontend changes |

### Why Not Direct CouchDB Connection?

1. **Credential Exposure**: Direct connections would expose CouchDB credentials in browser code
2. **CORS Complexity**: CouchDB CORS configuration is complex and error-prone
3. **Validation Gap**: No server-side validation layer for direct writes
4. **Audit Gap**: No centralized logging of database operations

### Sync Layer Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `CouchDbService` | `app/Services/CouchDbService.php` | HTTP client for CouchDB API |
| `SyncService` | `app/Services/SyncService.php` | Document transformation and sync logic |
| `CouchSyncWorker` | `app/Console/Commands/CouchSyncWorker.php` | Daemon listening to `_changes` feed |
| `CouchDbSetup` | `app/Console/Commands/CouchDbSetup.php` | Database and design document setup |

---

## 3. CouchDB Document Types

### 3.1 Patient Document

```json
{
  "_id": "patient:AB12",
  "type": "clinicalPatient",
  "patient": {
    "id": "AB12",
    "cpt": "AB12",
    "firstName": "Optional",
    "lastName": "Optional",
    "dateOfBirth": "2024-01-15",
    "gender": "male",
    "weightKg": 12.5,
    "phone": "+263...",
    "createdAt": "2026-02-14T10:00:00Z",
    "updatedAt": "2026-02-14T10:30:00Z",
    "visitCount": 2,
    "isActive": true
  }
}
```

**Key Fields for MySQL Mirror:**
- `cpt` - Clinical Patient Token (de-identified reference)
- `dateOfBirth` - For age calculations
- `gender` - For clinical logic
- `weightKg` - For dosage calculations

### 3.2 Clinical Session Document

```json
{
  "_id": "session_8F2A9",
  "type": "clinicalSession",
  "id": "session_8F2A9",
  "patientCpt": "AB12",
  "patientId": "patient:AB12",
  "patientName": "Baby Boy",
  "dateOfBirth": "2024-01-15",
  "gender": "male",
  "chiefComplaint": "Cough and difficulty breathing",
  "triage": "yellow",
  "status": "open",
  "stage": "assessment",
  "formInstanceIds": ["form_001", "form_002"],
  "createdAt": 1739527200000,
  "updatedAt": 1739529000000
}
```

**Key Fields for MySQL Mirror:**
- `triage` - Priority (red/yellow/green/unknown)
- `stage` - Workflow position (registration/assessment/treatment/discharge)
- `status` - Session state (open/completed/archived/referred/cancelled)
- `formInstanceIds` - Links to clinical forms

### 3.3 Clinical Form Instance Document

```json
{
  "_id": "form_001",
  "type": "clinicalForm",
  "schemaId": "peds_respiratory",
  "schemaVersion": "1.0.2",
  "sessionId": "session_8F2A9",
  "patientId": "patient:AB12",
  "currentStateId": "assessment_complete",
  "status": "completed",
  "answers": {
    "respiratory_rate": 48,
    "chest_indrawing": true,
    "danger_sign_unable_drink": false,
    "danger_sign_convulsions": false,
    "oxygen_saturation": 94
  },
  "calculated": {
    "fast_breathing": true,
    "has_danger_sign": false,
    "triagePriority": "yellow",
    "triageScore": 65
  },
  "auditLog": [
    {
      "timestamp": "2026-02-14T10:15:00Z",
      "action": "field_change",
      "fieldId": "respiratory_rate",
      "newValue": 48
    }
  ],
  "syncStatus": "synced",
  "createdAt": "2026-02-14T10:00:00Z",
  "updatedAt": "2026-02-14T10:30:00Z"
}
```

**Key Fields for MySQL Mirror:**
- `answers` - Clinical assessment data (JSON)
- `calculated` - Derived clinical values (JSON)
- `schemaId` / `schemaVersion` - For prompt/rule versioning
- `auditLog` - Complete change history

### 3.4 AI Log Document

```json
{
  "_id": "ai_19382",
  "type": "aiLog",
  "sessionId": "session_8F2A9",
  "formInstanceId": "form_001",
  "task": "explain_triage",
  "useCase": "TRIAGE_EXPLANATION",
  "promptHash": "sha256:abc123...",
  "promptVersion": "1.2.0",
  "input": {
    "triagePriority": "yellow",
    "findings": ["fast_breathing", "chest_indrawing"]
  },
  "output": "This 2-year-old presents with...",
  "model": "medgemma:27b",
  "modelVersion": "27b-v1",
  "latencyMs": 2500,
  "wasOverridden": false,
  "riskFlags": [],
  "createdAt": "2026-02-14T10:35:00Z"
}
```

---

## 4. MySQL Mirror Schema

### 4.1 patients Table

```php
Schema::create('patients', function (Blueprint $table) {
    $table->id();
    $table->string('couch_id')->unique()->nullable();
    $table->string('cpt', 20)->unique();
    $table->string('short_code', 10)->nullable();
    $table->string('external_id')->nullable();
    $table->date('date_of_birth')->nullable();
    $table->integer('age_months')->nullable();
    $table->enum('gender', ['male', 'female', 'other'])->nullable();
    $table->decimal('weight_kg', 5, 2)->nullable();
    $table->string('phone', 30)->nullable();
    $table->integer('visit_count')->default(1);
    $table->boolean('is_active')->default(true);
    $table->json('raw_document')->nullable();
    $table->timestamp('last_visit_at')->nullable();
    $table->timestamps();
    
    $table->index(['cpt', 'is_active']);
    $table->index('age_months');
});
```

### 4.2 clinical_sessions Table

```php
Schema::create('clinical_sessions', function (Blueprint $table) {
    $table->id();
    $table->string('couch_id')->unique();
    $table->string('session_uuid', 50)->unique();
    $table->string('patient_cpt', 20);
    
    // Workflow State
    $table->enum('stage', ['registration', 'assessment', 'treatment', 'discharge'])
          ->default('registration');
    $table->enum('status', ['open', 'completed', 'archived', 'referred', 'cancelled'])
          ->default('open');
    $table->enum('triage_priority', ['red', 'yellow', 'green', 'unknown'])
          ->default('unknown');
    
    // Clinical Context
    $table->string('chief_complaint')->nullable();
    $table->text('notes')->nullable();
    $table->json('form_instance_ids')->nullable();
    $table->json('treatment_plan')->nullable();
    
    // Timestamps (from CouchDB)
    $table->timestamp('session_created_at');
    $table->timestamp('session_updated_at');
    $table->timestamp('completed_at')->nullable();
    $table->timestamp('synced_at')->nullable();
    
    // Audit
    $table->json('raw_document')->nullable();
    $table->timestamps();
    
    $table->index(['status', 'triage_priority']);
    $table->index(['patient_cpt', 'status']);
    $table->index('session_created_at');
});
```

### 4.3 clinical_forms Table

```php
Schema::create('clinical_forms', function (Blueprint $table) {
    $table->id();
    $table->string('couch_id')->unique();
    $table->string('form_uuid', 50)->unique();
    $table->string('session_couch_id');
    $table->string('patient_cpt', 20);
    
    // Schema Reference
    $table->string('schema_id', 50);
    $table->string('schema_version', 20);
    
    // Workflow State
    $table->string('current_state_id')->nullable();
    $table->enum('status', ['draft', 'completed', 'submitted', 'synced', 'error'])
          ->default('draft');
    
    // Clinical Data
    $table->json('answers');
    $table->json('calculated')->nullable();
    $table->json('audit_log')->nullable();
    
    // Timestamps
    $table->timestamp('form_created_at');
    $table->timestamp('form_updated_at');
    $table->timestamp('completed_at')->nullable();
    $table->timestamp('synced_at')->nullable();
    
    // Audit
    $table->json('raw_document')->nullable();
    $table->timestamps();
    
    $table->index(['schema_id', 'status']);
    $table->index('patient_cpt');
});
```

### 4.4 ai_requests Table

```php
Schema::create('ai_requests', function (Blueprint $table) {
    $table->id();
    $table->uuid('request_uuid')->unique();
    
    // User & Role
    $table->foreignId('user_id')->constrained();
    $table->string('role', 50);
    
    // Context
    $table->string('session_couch_id')->nullable();
    $table->string('form_couch_id')->nullable();
    $table->string('patient_cpt', 20)->nullable();
    
    // Request Details
    $table->string('task', 50);
    $table->string('use_case', 50)->nullable();
    $table->string('prompt_version', 20)->nullable();
    
    // Input/Output
    $table->string('input_hash', 64);
    $table->text('prompt');
    $table->longText('response');
    $table->longText('safe_output')->nullable();
    
    // Model Info
    $table->string('model', 50);
    $table->integer('latency_ms')->nullable();
    
    // Safety & Governance
    $table->boolean('was_overridden')->default(false);
    $table->json('risk_flags')->nullable();
    $table->json('blocked_phrases')->nullable();
    
    // Timestamps
    $table->timestamp('requested_at');
    $table->timestamps();
    
    $table->index(['user_id', 'task']);
    $table->index(['session_couch_id']);
    $table->index('requested_at');
});
```

---

## 5. Sync Worker Implementation

### 5.1 Command Structure

```php
// app/Console/Commands/CouchSyncWorker.php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\CouchDbService;
use App\Services\SyncService;

class CouchSyncWorker extends Command
{
    protected $signature = 'couchdb:sync 
                            {--daemon : Run continuously} 
                            {--poll=4 : Polling interval in seconds}
                            {--batch=100 : Maximum documents per poll}';
    
    protected $description = 'Sync CouchDB changes to MySQL';
    
    public function handle(
        CouchDbService $couchDb,
        SyncService $syncService
    ): int {
        $daemon = $this->option('daemon');
        $pollInterval = (int) $this->option('poll');
        $batchSize = (int) $this->option('batch');
        
        // Get last sequence number
        $lastSeq = $this->getLastSequence();
        
        while (true) {
            try {
                // Fetch changes since last sequence
                $changes = $couchDb->getChanges($lastSeq, $batchSize);
                
                foreach ($changes['results'] as $change) {
                    $this->processChange($change, $syncService);
                    $lastSeq = $change['seq'];
                }
                
                // Save checkpoint
                $this->saveLastSequence($lastSeq);
                
                if (!$daemon) {
                    break;
                }
                
                sleep($pollInterval);
                
            } catch (\Exception $e) {
                $this->error("Sync error: {$e->getMessage()}");
                Log::error('CouchDB sync error', [
                    'error' => $e->getMessage(),
                    'last_seq' => $lastSeq,
                ]);
                
                if (!$daemon) {
                    return 1;
                }
                
                sleep($pollInterval * 2); // Back off on error
            }
        }
        
        return 0;
    }
    
    private function processChange(array $change, SyncService $syncService): void
    {
        $docId = $change['id'];
        
        if ($change['deleted'] ?? false) {
            $syncService->handleDelete($docId);
            return;
        }
        
        // Fetch full document
        $doc = $this->couchDb->getDocument($docId);
        
        // Route to appropriate handler
        $syncService->syncDocument($doc);
    }
}
```

### 5.2 SyncService Document Processing

```php
// app/Services/SyncService.php

class SyncService
{
    public function syncDocument(array $doc): void
    {
        $type = $doc['type'] ?? null;
        
        match ($type) {
            'clinicalPatient' => $this->syncPatient($doc),
            'clinicalSession' => $this->syncSession($doc),
            'clinicalForm' => $this->syncForm($doc),
            'aiLog' => $this->syncAiLog($doc),
            default => Log::warning("Unknown document type: {$type}"),
        };
    }
    
    private function syncPatient(array $doc): void
    {
        $patient = $doc['patient'] ?? $doc;
        
        Patient::updateOrCreate(
            ['couch_id' => $doc['_id']],
            [
                'cpt' => $patient['cpt'],
                'date_of_birth' => $patient['dateOfBirth'] ?? null,
                'gender' => $patient['gender'] ?? null,
                'weight_kg' => $patient['weightKg'] ?? null,
                'phone' => $patient['phone'] ?? null,
                'visit_count' => $patient['visitCount'] ?? 1,
                'is_active' => $patient['isActive'] ?? true,
                'raw_document' => $doc,
                'last_visit_at' => $patient['updatedAt'] ?? null,
            ]
        );
    }
    
    private function syncSession(array $doc): void
    {
        ClinicalSession::updateOrCreate(
            ['couch_id' => $doc['_id']],
            [
                'session_uuid' => $doc['id'],
                'patient_cpt' => $doc['patientCpt'],
                'stage' => $doc['stage'] ?? 'registration',
                'status' => $doc['status'] ?? 'open',
                'triage_priority' => $doc['triage'] ?? 'unknown',
                'chief_complaint' => $doc['chiefComplaint'] ?? null,
                'form_instance_ids' => $doc['formInstanceIds'] ?? [],
                'session_created_at' => $this->timestampToDatetime($doc['createdAt']),
                'session_updated_at' => $this->timestampToDatetime($doc['updatedAt']),
                'raw_document' => $doc,
                'synced_at' => now(),
            ]
        );
    }
}
```

### 5.3 Supervisor Configuration

```ini
[program:healthbridge-couchdb-sync]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/healthbridge/artisan couchdb:sync --daemon --poll=4 --batch=100

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
stdout_logfile=/var/www/healthbridge/storage/logs/couchdb-sync.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=5
stderr_logfile=/var/www/healthbridge/storage/logs/couchdb-sync-error.log
stderr_logfile_maxbytes=10MB
stderr_logfile_backups=5

; Single instance (avoid sync conflicts)
numprocs=1
priority=999
stopsignal=SIGTERM
```

---

## 6. Conflict Resolution

### Strategy: Last-Write-Wins with Flagging

When the same document is modified in multiple places before sync:

1. **Detection**: CouchDB returns conflict markers in `_conflicts` array
2. **Resolution**: Latest `updatedAt` timestamp wins
3. **Flagging**: Losing revision stored in `conflicts` field for manual review
4. **Logging**: All conflicts logged for audit

```php
private function resolveConflict(array $doc): array
{
    if (!isset($doc['_conflicts'])) {
        return $doc;
    }
    
    $winningRev = $doc;
    $conflicts = [];
    
    foreach ($doc['_conflicts'] as $conflictingRev) {
        $conflictingDoc = $this->couchDb->getDocument($doc['_id'], $conflictingRev);
        
        // Compare timestamps
        if ($conflictingDoc['updatedAt'] > $winningRev['updatedAt']) {
            $conflicts[] = $winningRev;
            $winningRev = $conflictingDoc;
        } else {
            $conflicts[] = $conflictingDoc;
        }
    }
    
    // Store conflicts for review
    $winningRev['conflicts'] = $conflicts;
    
    Log::warning('Document conflict resolved', [
        'doc_id' => $doc['_id'],
        'winning_rev' => $winningRev['_rev'],
        'conflict_count' => count($conflicts),
    ]);
    
    return $winningRev;
}
```

---

## 7. Troubleshooting

### Common Issues

| Issue | Symptoms | Solution |
|-------|----------|----------|
| Sync not running | MySQL data stale | Check Supervisor status: `sudo supervisorctl status` |
| High latency | Updates delayed >10s | Reduce `--poll` interval, check CouchDB load |
| Missing documents | Documents in CouchDB but not MySQL | Check sync worker logs for errors |
| Conflicts | Data inconsistency | Review `conflicts` field, manual merge if needed |

### Diagnostic Commands

```bash
# Check sync worker status
sudo supervisorctl status healthbridge-couchdb-sync:*

# View sync logs
tail -f /var/www/healthbridge/storage/logs/couchdb-sync.log

# Manual sync run
php artisan couchdb:sync --poll=1 --batch=10

# Check CouchDB connection
php artisan couchdb:setup

# Reset sync checkpoint (caution: will re-sync all)
php artisan couchdb:sync --reset
```

### Monitoring

Key metrics to monitor:

- **Sync Lag**: Time between CouchDB update and MySQL mirror
- **Conflict Rate**: Number of conflicts per hour
- **Error Rate**: Failed syncs per hour
- **Queue Depth**: Unprocessed changes in CouchDB

---

## Related Documentation

- [System Overview](./system-overview.md)
- [Deployment Guide](../deployment/docker-deployment.md)
- [Sync Troubleshooting](../troubleshooting/sync-troubleshooting.md)
