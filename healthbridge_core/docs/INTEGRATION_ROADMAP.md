# HealthBridge Platform Integration Roadmap

**Document Status:** Authoritative  
**Created:** February 15, 2026  
**Purpose:** Comprehensive roadmap for integrating the Nurse Mobile App with the Laravel Specialist Web App

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Data Models & Sync Strategy](#3-data-models--sync-strategy)
4. [Integration Points](#4-integration-points)
5. [Phased Implementation Roadmap](#5-phased-implementation-roadmap)
6. [Technical Specifications](#6-technical-specifications)
7. [Security & Governance](#7-security--governance)
8. [Testing Strategy](#8-testing-strategy)
9. [Deployment & Operations](#9-deployment--operations)

---

## 1. Executive Summary

### Platform Vision

HealthBridge is a **two-tier clinical system** designed for offline-first operation in resource-limited settings:

| Layer | Technology | Users | Purpose |
|-------|------------|-------|---------|
| **Mobile App** | Nuxt 4 + PouchDB + Capacitor | Nurses, VHWs, Frontline Staff | Data capture, IMCI workflows, AI explainability |
| **Web App** | Laravel 11 + Inertia + MySQL | Senior Nurses, Doctors, Specialists, Managers | Oversight, audit, governance, quality improvement |

### Key Integration Goals

1. **Near Real-Time Data Mirror** - MySQL updated within ~4 seconds of mobile sync
2. **Unified AI Gateway** - MedGemma (Ollama) accessible from both tiers with role-based policies
3. **Closed Learning Loop** - Clinical feedback improves rules and prompts
4. **Complete Audit Trail** - Every clinical action traceable across systems

---

## 2. System Architecture Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HEALTHBRIDGE PLATFORM                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐                    ┌─────────────────────────────┐│
│  │   MOBILE TIER       │                    │      WEB TIER               ││
│  │   (Nuxt 4 SPA)      │                    │   (Laravel 11 + Inertia)    ││
│  ├─────────────────────┤                    ├─────────────────────────────┤│
│  │ • Patient Reg       │                    │ • Clinical Dashboards       ││
│  │ • Clinical Forms    │                    │ • Case Review               ││
│  │ • Triage (IMCI)     │                    │ • Referral Management       ││
│  │ • Treatment Plans   │                    │ • AI Safety Console         ││
│  │ • Offline AI        │                    │ • Prompt Registry           ││
│  └──────────┬──────────┘                    └──────────────┬──────────────┘│
│             │                                              │               │
│             │ PouchDB                                      │ MySQL         │
│             │ (Encrypted)                                  │ (Operational) │
│             ▼                                              ▼               │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         SYNC LAYER                                   │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │                                                                      │  │
│  │   PouchDB ◄──────────────► CouchDB ◄──────────────► Sync Worker     │  │
│  │   (Mobile)     bi-dir       (Source     continuous    (Laravel      │  │
│  │                sync         of Truth)   _changes      Daemon)       │  │
│  │                             │                        │               │  │
│  │                             │                        │               │  │
│  └─────────────────────────────┼────────────────────────┼───────────────┘  │
│                                │                        │                   │
│                                │                        ▼                   │
│                                │              ┌─────────────────┐           │
│                                │              │  MySQL Mirror   │           │
│                                │              │  (Denormalized) │           │
│                                │              └────────┬────────┘           │
│                                │                       │                    │
│                                ▼                       ▼                    │
│                       ┌─────────────────────────────────────────┐          │
│                       │            AI GATEWAY                   │          │
│                       │         (Laravel + Ollama)              │          │
│                       │                                         │          │
│                       │  • MedGemma 27B                         │          │
│                       │  • Role-based prompts                   │          │
│                       │  • Safety enforcement                   │          │
│                       │  • Full audit logging                   │          │
│                       └─────────────────────────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow Summary

| Flow | Source | Destination | Mechanism | Latency |
|------|--------|-------------|-----------|---------|
| Clinical Data Capture | Mobile PouchDB | CouchDB | PouchDB Sync | Instant (online) |
| Data Mirroring | CouchDB | MySQL | Laravel Sync Worker | ~4 seconds |
| AI Requests | Both Tiers | Ollama | Laravel AI Gateway | Variable |
| Rule Updates | Web App | Mobile | CouchDB Sync Doc | Next sync |

---

## 3. Data Models & Sync Strategy

### 3.1 CouchDB Document Types (Source of Truth)

The mobile app stores the following document types in CouchDB:

#### 3.1.1 Patient Document

```json
{
  "_id": "pat_A7F3",
  "type": "clinicalPatient",
  "patient": {
    "id": "CP-7F3A-9B2C",
    "cpt": "CP-7F3A-9B2C",
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

#### 3.1.2 Clinical Session Document

```json
{
  "_id": "sess_8F2A9",
  "type": "clinicalSession",
  "id": "sess_8F2A9",
  "patientCpt": "CP-7F3A-9B2C",
  "patientId": "pat_A7F3",
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

#### 3.1.3 Clinical Form Instance Document

```json
{
  "_id": "form_001",
  "type": "clinicalForm",
  "schemaId": "peds_respiratory",
  "schemaVersion": "1.0.2",
  "sessionId": "sess_8F2A9",
  "patientId": "pat_A7F3",
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

#### 3.1.4 AI Log Document

```json
{
  "_id": "ai_19382",
  "type": "aiLog",
  "sessionId": "sess_8F2A9",
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

### 3.2 MySQL Mirror Schema (Laravel Migrations)

#### 3.2.1 patients Table

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

#### 3.2.2 clinical_sessions Table

```php
Schema::create('clinical_sessions', function (Blueprint $table) {
    $table->id();
    $table->string('couch_id')->unique();
    $table->string('session_uuid', 50)->unique();
    $table->string('patient_cpt', 20);
    $table->foreign('patient_cpt')->references('cpt')->on('patients');
    
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

#### 3.2.3 clinical_forms Table

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
    $table->enum('sync_status', ['pending', 'syncing', 'synced', 'error'])
          ->default('pending');
    
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
    
    $table->foreign('session_couch_id')
          ->references('couch_id')
          ->on('clinical_sessions')
          ->onDelete('cascade');
    $table->index(['schema_id', 'status']);
    $table->index('patient_cpt');
});
```

#### 3.2.4 ai_requests Table

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
    $table->string('triage_ruleset_version', 20)->nullable();
    
    // Input/Output
    $table->string('input_hash', 64);
    $table->text('prompt');
    $table->longText('response');
    $table->longText('safe_output')->nullable();
    
    // Model Info
    $table->string('model', 50);
    $table->string('model_version', 50)->nullable();
    $table->integer('latency_ms')->nullable();
    
    // Safety & Governance
    $table->boolean('was_overridden')->default(false);
    $table->json('risk_flags')->nullable();
    $table->json('blocked_phrases')->nullable();
    $table->text('override_reason')->nullable();
    
    // Timestamps
    $table->timestamp('requested_at');
    $table->timestamps();
    
    $table->index(['user_id', 'task']);
    $table->index(['session_couch_id']);
    $table->index('requested_at');
});
```

#### 3.2.5 referrals Table

```php
Schema::create('referrals', function (Blueprint $table) {
    $table->id();
    $table->string('referral_uuid', 50)->unique();
    
    // Session Reference
    $table->string('session_couch_id');
    $table->foreign('session_couch_id')
          ->references('couch_id')
          ->on('clinical_sessions');
    
    // Participants
    $table->foreignId('referring_user_id')->constrained('users');
    $table->foreignId('assigned_to_user_id')->nullable()->constrained('users');
    $table->string('assigned_to_role', 50)->nullable();
    
    // Status
    $table->enum('status', ['pending', 'accepted', 'rejected', 'completed', 'cancelled'])
          ->default('pending');
    $table->enum('priority', ['red', 'yellow', 'green']);
    
    // Clinical Context
    $table->string('specialty', 50)->nullable();
    $table->text('reason')->nullable();
    $table->text('clinical_notes')->nullable();
    $table->text('rejection_reason')->nullable();
    
    // Timestamps
    $table->timestamp('assigned_at')->nullable();
    $table->timestamp('accepted_at')->nullable();
    $table->timestamp('completed_at')->nullable();
    $table->timestamps();
    
    $table->index(['status', 'priority']);
    $table->index(['assigned_to_user_id', 'status']);
});
```

#### 3.2.6 prompt_versions Table

```php
Schema::create('prompt_versions', function (Blueprint $table) {
    $table->id();
    $table->string('task', 50);
    $table->string('version', 20);
    $table->text('content');
    $table->text('description')->nullable();
    $table->boolean('is_active')->default(false);
    $table->foreignId('created_by')->constrained('users');
    $table->timestamps();
    
    $table->unique(['task', 'version']);
    $table->index(['task', 'is_active']);
});
```

#### 3.2.7 case_comments Table

```php
Schema::create('case_comments', function (Blueprint $table) {
    $table->id();
    $table->string('session_couch_id');
    $table->foreign('session_couch_id')
          ->references('couch_id')
          ->on('clinical_sessions');
    
    $table->foreignId('user_id')->constrained();
    $table->text('comment');
    $table->enum('comment_type', ['clinical', 'administrative', 'feedback', 'flag'])
          ->default('clinical');
    
    // For feedback/suggestions
    $table->string('suggested_rule_change')->nullable();
    $table->boolean('requires_followup')->default(false);
    
    $table->timestamps();
    
    $table->index(['session_couch_id', 'created_at']);
});
```

### 3.3 Sync Worker Implementation

#### 3.3.1 Laravel Command Structure

```php
// app/Console/Commands/CouchSyncWorker.php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\CouchDbService;
use App\Services\SyncService;

class CouchSyncWorker extends Command
{
    protected $signature = 'couchdb:sync {--daemon}';
    protected $description = 'Sync CouchDB changes to MySQL';
    
    public function handle(CouchDbService $couch, SyncService $sync)
    {
        $lastSeq = $this->getLastSequence();
        
        if ($this->option('daemon')) {
            $this->runContinuous($couch, $sync, $lastSeq);
        } else {
            $this->runOnce($couch, $sync, $lastSeq);
        }
    }
    
    private function runContinuous($couch, $sync, $lastSeq)
    {
        while (true) {
            try {
                $lastSeq = $this->processChanges($couch, $sync, $lastSeq);
                $this->saveLastSequence($lastSeq);
            } catch (\Exception $e) {
                $this->error("Sync error: " . $e->getMessage());
                sleep(5); // Backoff on error
            }
            sleep(4); // Poll interval
        }
    }
    
    private function processChanges($couch, $sync, $since)
    {
        $changes = $couch->getChanges($since, [
            'include_docs' => true,
            'feed' => 'longpoll',
            'timeout' => 30000
        ]);
        
        foreach ($changes['results'] as $change) {
            if (isset($change['doc'])) {
                $sync->upsert($change['doc']);
            }
        }
        
        return $changes['last_seq'];
    }
}
```

#### 3.3.2 Sync Service

```php
// app/Services/SyncService.php

namespace App\Services;

use App\Models\Patient;
use App\Models\ClinicalSession;
use App\Models\ClinicalForm;
use App\Models\AiRequest;

class SyncService
{
    public function upsert(array $doc): void
    {
        $type = $doc['type'] ?? null;
        
        match ($type) {
            'clinicalPatient' => $this->syncPatient($doc),
            'clinicalSession' => $this->syncSession($doc),
            'clinicalForm' => $this->syncForm($doc),
            'aiLog' => $this->syncAiLog($doc),
            default => $this->handleUnknown($doc)
        };
    }
    
    private function syncPatient(array $doc): void
    {
        $patient = $doc['patient'] ?? $doc;
        
        Patient::updateOrCreate(
            ['couch_id' => $doc['_id']],
            [
                'cpt' => $patient['cpt'] ?? $patient['id'],
                'date_of_birth' => $patient['dateOfBirth'] ?? null,
                'age_months' => $this->calculateAgeMonths($patient['dateOfBirth'] ?? null),
                'gender' => $patient['gender'] ?? null,
                'weight_kg' => $patient['weightKg'] ?? null,
                'phone' => $patient['phone'] ?? null,
                'visit_count' => $patient['visitCount'] ?? 1,
                'is_active' => $patient['isActive'] ?? true,
                'raw_document' => $doc,
                'last_visit_at' => $patient['lastVisit'] ?? null,
            ]
        );
    }
    
    private function syncSession(array $doc): void
    {
        ClinicalSession::updateOrCreate(
            ['couch_id' => $doc['_id']],
            [
                'session_uuid' => $doc['id'],
                'patient_cpt' => $doc['patientCpt'] ?? null,
                'stage' => $doc['stage'] ?? 'registration',
                'status' => $doc['status'] ?? 'open',
                'triage_priority' => $doc['triage'] ?? 'unknown',
                'chief_complaint' => $doc['chiefComplaint'] ?? null,
                'notes' => $doc['notes'] ?? null,
                'form_instance_ids' => $doc['formInstanceIds'] ?? [],
                'session_created_at' => $this->timestampToDatetime($doc['createdAt']),
                'session_updated_at' => $this->timestampToDatetime($doc['updatedAt']),
                'raw_document' => $doc,
                'synced_at' => now(),
            ]
        );
    }
    
    private function syncForm(array $doc): void
    {
        ClinicalForm::updateOrCreate(
            ['couch_id' => $doc['_id']],
            [
                'form_uuid' => $doc['_id'],
                'session_couch_id' => $doc['sessionId'] ?? null,
                'patient_cpt' => $doc['patientId'] ?? null,
                'schema_id' => $doc['schemaId'] ?? null,
                'schema_version' => $doc['schemaVersion'] ?? null,
                'current_state_id' => $doc['currentStateId'] ?? null,
                'status' => $doc['status'] ?? 'draft',
                'sync_status' => 'synced',
                'answers' => $doc['answers'] ?? [],
                'calculated' => $doc['calculated'] ?? null,
                'audit_log' => $doc['auditLog'] ?? null,
                'form_created_at' => $doc['createdAt'] ?? null,
                'form_updated_at' => $doc['updatedAt'] ?? null,
                'completed_at' => $doc['completedAt'] ?? null,
                'raw_document' => $doc,
                'synced_at' => now(),
            ]
        );
    }
    
    private function syncAiLog(array $doc): void
    {
        AiRequest::updateOrCreate(
            ['request_uuid' => $doc['_id']],
            [
                'session_couch_id' => $doc['sessionId'] ?? null,
                'form_couch_id' => $doc['formInstanceId'] ?? null,
                'task' => $doc['task'] ?? null,
                'use_case' => $doc['useCase'] ?? null,
                'prompt_version' => $doc['promptVersion'] ?? null,
                'input_hash' => $doc['promptHash'] ?? null,
                'response' => $doc['output'] ?? null,
                'model' => $doc['model'] ?? null,
                'model_version' => $doc['modelVersion'] ?? null,
                'latency_ms' => $doc['latencyMs'] ?? null,
                'was_overridden' => $doc['wasOverridden'] ?? false,
                'risk_flags' => $doc['riskFlags'] ?? null,
                'requested_at' => $doc['createdAt'] ?? now(),
            ]
        );
    }
}
```

---

## 4. Integration Points

### 4.1 Mobile → Laravel Integration

| Integration Point | Mobile Component | Laravel Endpoint | Purpose |
|-------------------|------------------|------------------|---------|
| Data Sync | PouchDB → CouchDB | Sync Worker | Mirror clinical data |
| AI Requests | `clinicalAI.ts` | `/api/ai/medgemma` | AI completions |
| Auth | `useAuth.ts` | Sanctum API | Token-based auth |
| Rule Updates | `syncManager.ts` | CouchDB `_changes` | Receive rule changes |

### 4.2 AI Gateway Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AI GATEWAY FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Mobile/Web Request                                             │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐                                            │
│  │   AiGuard       │ ◄── Check role permissions                 │
│  │   Middleware    │     Check rate limits                      │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ ContextBuilder  │ ◄── Fetch patient/session from MySQL       │
│  │                 │     Build clinical context                 │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ PromptBuilder   │ ◄── Load prompt template from DB           │
│  │                 │     Inject context                         │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ Ollama Client   │ ◄── POST to Ollama API                     │
│  │                 │     Stream or batch response               │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ OutputValidator │ ◄── Block dangerous phrases                │
│  │                 │     Sanitize output                        │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ AuditLogger     │ ◄── Log to ai_requests table               │
│  │                 │     Store prompt version                   │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│     Safe Response                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Role-Based AI Access

```php
// config/ai_policy.php

return [
    'deny' => [
        'diagnose',
        'prescribe',
        'dosage',
        'replace doctor',
        'definitive treatment',
        'discharge patient'
    ],
    
    'roles' => [
        'nurse' => [
            'explain_triage',
            'caregiver_summary',
            'symptom_checklist'
        ],
        'senior-nurse' => [
            'explain_triage',
            'caregiver_summary',
            'symptom_checklist',
            'treatment_review'
        ],
        'doctor' => [
            'specialist_review',
            'red_case_analysis',
            'clinical_summary',
            'handoff_report'
        ],
        'radiologist' => [
            'imaging_interpretation',
            'xray_analysis'
        ],
        'dermatologist' => [
            'skin_lesion_analysis',
            'rash_assessment'
        ],
        'manager' => [], // No AI access
        'admin' => []    // No AI access
    ],
    
    'tasks' => [
        'explain_triage' => [
            'description' => 'Explain triage classification to nurse',
            'max_tokens' => 500,
            'temperature' => 0.2
        ],
        'specialist_review' => [
            'description' => 'Generate specialist review summary',
            'max_tokens' => 1000,
            'temperature' => 0.3
        ],
        'imaging_interpretation' => [
            'description' => 'Text-based imaging interpretation support',
            'max_tokens' => 800,
            'temperature' => 0.2
        ]
    ]
];
```

---

## 5. Phased Implementation Roadmap

### Phase 0: Foundation (Weeks 1-3)

**Objective:** Set up Laravel project, authentication, roles, and CouchDB → MySQL sync

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| 0.1 | Create Laravel 11 project with Inertia + Vue | Project runs, Vite builds successfully |
| 0.2 | Install and configure Laravel Sanctum | API token auth works |
| 0.3 | Install Spatie/laravel-permission | Roles can be assigned to users |
| 0.4 | Define user roles: `nurse`, `senior-nurse`, `doctor`, `radiologist`, `dermatologist`, `manager`, `admin` | Users can be assigned roles |
| 0.5 | Create MySQL migrations for all tables | `php artisan migrate` succeeds |
| 0.6 | Build CouchDB service class | Can connect to CouchDB, query documents |
| 0.7 | Build Sync Worker command | Worker processes changes from CouchDB |
| 0.8 | Set up Supervisor for sync worker | Worker restarts on failure, logs errors |
| 0.9 | Seed test data in CouchDB, verify MySQL mirror | Data appears in MySQL within 5 seconds |

**Deliverable:** Laravel app with authenticated users and continuously synced MySQL mirror

---

### Phase 1: AI Gateway (Weeks 4-6)

**Objective:** Build secure, role-based AI endpoint using Laravel + MedGemma

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| 1.1 | Configure Ollama connection in `.env` | Can reach Ollama from Laravel |
| 1.2 | Create `config/ai_policy.php` | Policy file defines role permissions |
| 1.3 | Build `AiGuard` middleware | Middleware blocks unauthorized tasks |
| 1.4 | Build `PromptBuilder` service | Prompts loaded from `prompt_versions` table |
| 1.5 | Build `ContextBuilder` service | Fetches patient/session data from MySQL |
| 1.6 | Build `OutputValidator` service | Blocks dangerous phrases |
| 1.7 | Build `MedGemmaController` | POST `/api/ai/medgemma` works |
| 1.8 | Apply rate limiting (`throttle:ai`) | Rate limit kicks in after limit |
| 1.9 | Write feature tests for AI safety | Tests pass for blocked phrases, role access |

**Deliverable:** Production-ready AI gateway with role-specific, audited completions

---

### Phase 2: Dashboards & Case Review (Weeks 7-9)

**Objective:** Provide UI for clinical oversight and AI monitoring

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| 2.1 | Build Clinical Quality Dashboard (managers) | Triage distribution, referral compliance charts |
| 2.2 | Build AI Safety Console (admins) | AI requests table, risk flags, export |
| 2.3 | Build Case Review page | Session list, detail view, comments |
| 2.4 | Implement case comments | Comments saved to `case_comments` table |
| 2.5 | Enforce RBAC on all pages | Managers see aggregated only, doctors see cases |

**Deliverable:** Functional web app with dashboards and case review

---

### Phase 3: Referral & RED-Case Workflow (Weeks 10-11)

**Objective:** Automate handoff of high-priority patients to specialists

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| 3.1 | Create `referrals` table migration | Migration runs successfully |
| 3.2 | Build referral auto-creation for RED cases | New referral appears when RED case synced |
| 3.3 | Build Specialist Workbench | Pending referrals list, accept/reject buttons |
| 3.4 | Implement notifications (database channel) | Specialists see in-app notifications |
| 3.5 | Add Pusher integration (optional) | Real-time alerts work |

**Deliverable:** RED cases automatically escalated, specialists can act on them

---

### Phase 4: Governance & Learning Loop (Weeks 12-14)

**Objective:** Close feedback loop from audits to rule/prompt updates

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| 4.1 | Add `prompt_version` and `triage_ruleset_version` to `ai_requests` | Columns populated |
| 4.2 | Build Prompt & Rule Registry UI | Admins can view, activate prompt versions |
| 4.3 | Build Learning Dashboard | Override rates per version, flagged cases |
| 4.4 | Add feedback form on case review | Suggestions saved to `rule_suggestions` |
| 4.5 | Build rule sync to mobile | New rules pushed to CouchDB for mobile sync |

**Deliverable:** Closed-loop system where clinical insights improve AI behavior

---

### Phase 5: Production Hardening (Ongoing)

**Objective:** Ensure reliability, security, and performance

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| 5.1 | Implement AI response caching | Identical prompts return cached response |
| 5.2 | Set up Prometheus/Grafana monitoring | Alerts fire on Ollama downtime |
| 5.3 | Run load tests on AI gateway | Response times acceptable under load |
| 5.4 | Conduct security audit | No critical vulnerabilities |
| 5.5 | Document disaster recovery | DR document reviewed |

---

## 6. Technical Specifications

### 6.1 Environment Configuration

```env
# .env (Laravel)

# Application
APP_NAME=HealthBridge
APP_ENV=production
APP_URL=https://healthbridge.org

# Database
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=healthbridge
DB_USERNAME=healthbridge
DB_PASSWORD=secret

# CouchDB
COUCHDB_HOST=http://localhost:5984
COUCHDB_DATABASE=healthbridge_clinic
COUCHDB_USERNAME=admin
COUCHDB_PASSWORD=secret

# Ollama / AI Gateway
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=medgemma:27b
AI_GATEWAY_SECRET=hb_internal_key
AI_RATE_LIMIT=30

# Sanctum
SANCTUM_STATEFUL_DOMAINS=healthbridge.org,nurse.healthbridge.org
```

### 6.2 API Endpoints

#### AI Gateway

```
POST /api/ai/medgemma
Authorization: Bearer <token>
Content-Type: application/json

{
  "task": "explain_triage",
  "context": {
    "sessionId": "sess_8F2A9",
    "triagePriority": "yellow",
    "findings": ["fast_breathing", "chest_indrawing"]
  }
}

Response:
{
  "text": "This 2-year-old presents with...",
  "metadata": {
    "model": "medgemma:27b",
    "promptVersion": "1.2.0",
    "latencyMs": 2500
  }
}
```

#### Clinical Data

```
GET /api/sessions
GET /api/sessions/{couch_id}
GET /api/sessions/{couch_id}/forms
GET /api/patients/{cpt}
GET /api/referrals
POST /api/referrals
PATCH /api/referrals/{id}/accept
PATCH /api/referrals/{id}/reject
```

### 6.3 Mobile App Integration Points

The mobile app should be updated to:

1. **Use Laravel AI Gateway** instead of direct Ollama calls
2. **Send auth token** with all API requests
3. **Log AI events** to CouchDB for sync to MySQL

```typescript
// nurse_mobile/app/services/clinicalAI.ts (update)

import { useAuthStore } from '~/stores/auth';

export async function askClinicalAI(
  record: ExplainabilityRecord,
  options: AIOptions
): Promise<AIResponse> {
  const authStore = useAuthStore();
  const config = useRuntimeConfig();
  
  // Route through Laravel AI Gateway
  const response = await $fetch(`${config.public.apiBase}/api/ai/medgemma`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authStore.token}`,
      'Content-Type': 'application/json'
    },
    body: {
      task: options.useCase,
      context: {
        sessionId: record.sessionId,
        triagePriority: record.triagePriority,
        findings: record.findings
      }
    }
  });
  
  return {
    answer: response.text,
    metadata: response.metadata
  };
}
```

---

## 7. Security & Governance

### 7.1 Security Principles

| Principle | Implementation |
|-----------|----------------|
| **Zero Trust** | All API requests require valid Sanctum token |
| **Role-Based Access** | Every endpoint checks user role |
| **Input Validation** | All inputs validated with Laravel rules |
| **Output Sanitization** | AI output filtered for dangerous phrases |
| **Audit Logging** | Every AI request logged with full context |
| **Encryption at Rest** | MySQL encrypted, CouchDB uses TLS |
| **Encryption in Transit** | HTTPS for all communications |

### 7.2 AI Safety Rules

```php
// app/Services/OutputValidator.php

class OutputValidator
{
    private const BLOCKED_PHRASES = [
        'diagnose',
        'prescribe',
        'dosage',
        'replace doctor',
        'definitive treatment',
        'discharge patient',
        'you should',
        'you must',
        'I recommend',
        'the treatment is'
    ];
    
    private const WARNING_PHRASES = [
        'consider',
        'may indicate',
        'possible',
        'suggestive of'
    ];
    
    public function validate(string $output): ValidationResult
    {
        $blocked = $this->findBlockedPhrases($output);
        $warnings = $this->findWarningPhrases($output);
        
        return new ValidationResult(
            safe: empty($blocked),
            blockedPhrases: $blocked,
            warningPhrases: $warnings,
            sanitizedOutput: $this->sanitize($output, $blocked)
        );
    }
    
    private function sanitize(string $output, array $blocked): string
    {
        // Remove or redact blocked phrases
        $sanitized = $output;
        foreach ($blocked as $phrase) {
            $sanitized = str_ireplace(
                $phrase,
                '[REDACTED]',
                $sanitized
            );
        }
        return $sanitized;
    }
}
```

### 7.3 Governance Boundaries

| Concern | Mobile | Laravel |
|---------|--------|---------|
| Patient care | ✅ | ❌ |
| AI advice (clinical) | ✅ | ❌ |
| AI advice (governance) | ❌ | ✅ |
| Audit | ❌ | ✅ |
| Prompt editing | ❌ | ✅ |
| Compliance reporting | ❌ | ✅ |
| Rule updates | ❌ | ✅ |

---

## 8. Testing Strategy

### 8.1 Unit Tests

- Sync Service: Document transformation
- Prompt Builder: Template rendering
- Output Validator: Phrase detection
- Context Builder: Data aggregation

### 8.2 Feature Tests

- AI Gateway: Full request/response cycle
- Role Access: Permission enforcement
- Rate Limiting: Throttle behavior
- Referral Workflow: End-to-end flow

### 8.3 Integration Tests

- CouchDB → MySQL sync
- Mobile → Laravel AI requests
- Notification delivery

### 8.4 Load Tests

- AI Gateway under concurrent requests
- Sync Worker throughput
- Dashboard query performance

---

## 9. Deployment & Operations

### 9.1 Supervisor Configuration

```ini
# /etc/supervisor/conf.d/healthbridge-sync.conf

[program:healthbridge-sync]
command=php /var/www/healthbridge/artisan couchdb:sync --daemon
user=www-data
numprocs=1
autostart=true
autorestart=true
stderr_logfile=/var/log/healthbridge/sync-error.log
stdout_logfile=/var/log/healthbridge/sync-out.log
```

### 9.2 Queue Workers

```ini
# /etc/supervisor/conf.d/healthbridge-worker.conf

[program:healthbridge-worker]
command=php /var/www/healthbridge/artisan queue:work --sleep=3 --tries=3
user=www-data
numprocs=2
autostart=true
autorestart=true
```

### 9.3 Monitoring Checklist

- [ ] Ollama health check endpoint
- [ ] CouchDB replication status
- [ ] MySQL sync lag (< 5 seconds)
- [ ] AI Gateway response time (< 5 seconds)
- [ ] Queue worker status
- [ ] Disk space (CouchDB compaction)

### 9.4 Backup Strategy

| Component | Frequency | Retention |
|-----------|-----------|-----------|
| CouchDB | Daily | 30 days |
| MySQL | Daily | 90 days |
| Prompt Versions | On change | Forever |
| AI Request Logs | Monthly archive | 7 years |

---

## Appendix A: Mobile App Data Types Reference

### Clinical Session Types

```typescript
// From nurse_mobile/app/types/clinical-session.ts

export type ClinicalSessionStage = 
  | 'registration' 
  | 'assessment' 
  | 'treatment' 
  | 'discharge';

export type ClinicalSessionTriage = 
  | 'red' 
  | 'yellow' 
  | 'green' 
  | 'unknown';

export type ClinicalSessionStatus = 
  | 'open' 
  | 'completed' 
  | 'archived'
  | 'referred' 
  | 'cancelled';
```

### Clinical Form Types

```typescript
// From nurse_mobile/app/types/clinical-form.ts

export type FieldType = 
  | 'text'
  | 'number'
  | 'boolean'
  | 'radio'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'timer'
  | 'calculated'
  | 'date'
  | 'time'
  | 'textarea';

export type TriagePriority = 'red' | 'yellow' | 'green';

export type FormStatus = 'draft' | 'completed' | 'submitted' | 'synced' | 'error';
```

---

## Appendix B: Quick Reference Commands

```bash
# Start sync worker (daemon)
php artisan couchdb:sync --daemon

# Run sync once
php artisan couchdb:sync

# Create new prompt version
php artisan prompt:create explain_triage --version=1.3.0

# Activate prompt version
php artisan prompt:activate explain_triage 1.3.0

# Sync rules to mobile
php artisan rules:sync

# Generate API token for mobile app
php artisan sanctum:token user@example.com

# Run tests
php artisan test --filter=AiGateway

# Check sync status
php artisan couchdb:status
```

---

**Document Version:** 1.0.0  
**Last Updated:** February 15, 2026  
**Maintained By:** HealthBridge Development Team
