# HealthBridge Data Synchronization Architecture

## Executive Summary

This document provides a comprehensive technical overview of the HealthBridge system's multi-database synchronization architecture. The system employs a sophisticated three-tier data flow: **nurse_mobile** (offline-first PouchDB) → **Laravel Proxy** → **CouchDB** → **MySQL**, designed to support rural healthcare environments with intermittent connectivity while maintaining data integrity for clinical operations.

---

## 1. System Architecture Overview

### 1.1 Multi-Database Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HEALTHBRIDGE ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐          ┌──────────────────┐                       │
│  │   nurse_mobile   │          │  healthbridge_    │                       │
│  │   (Nuxt/Vue)    │          │     core         │                       │
│  │                  │          │   (Laravel)     │                       │
│  │  ┌────────────┐ │          │                  │                       │
│  │  │  PouchDB   │ │◄────────►│  ┌──────────┐ │                       │
│  │  │ (Local DB) │ │  HTTPS   │  │  Couch   │ │                       │
│  │  └────────────┘ │          │  │Proxy API  │ │                       │
│  │                  │          │  └──────────┘ │                       │
│  │  ┌────────────┐ │          │        │       │                       │
│  │  │   Sync     │ │          │        ▼       │                       │
│  │  │  Service   │ │          │  ┌──────────┐ │                       │
│  │  └────────────┘ │          │  │  CouchDB │ │────┐                 │
│  │                  │          │  └──────────┘ │    │                 │
│  │  ┌────────────┐ │          │       ▲       │    │                 │
│  │  │  SecureDB  │ │          │       │       │    ▼                 │
│  │  │ (Encrypted)│ │          │  ┌────┴────┐ │ ┌──────────┐          │
│  │  └────────────┘ │          │  │ Sync     │ │ │  MySQL   │          │
│  └──────────────────┘          │  │ Worker   │─►│ Database │          │
│                               │  └──────────┘ │ └──────────┘          │
│                               └──────────────────┘                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Mobile App | Nuxt 3 / Vue 3 | Offline-first clinical data entry |
| Local Database | PouchDB (encrypted) | Secure offline storage |
| API Gateway | Laravel 11 | Authentication, proxy, business logic |
| Sync Bridge | CouchDB | Document-oriented sync database |
| Analytics DB | MySQL | Reporting, radiology, AI processing |
| AI Service | Ollama (MedGemma) | Clinical decision support |

---

## 2. Data Flow Mechanisms

### 2.1 nurse_mobile to CouchDB Flow

The nurse_mobile application uses PouchDB for offline-first data storage. When a nurse registers a patient or completes an assessment:

```typescript
// nurse_mobile/app/services/sync.ts - Simplified sync flow
export class SyncService {
  async startLiveSync(): Promise<void> {
    // Initialize PouchDB with encryption
    this.db = getSecureDb(encryptionKey);
    
    // Configure remote CouchDB connection
    this.remoteDb = new PouchDB(remoteUrl, {
      auth: { username, password }
    });
    
    // Start bidirectional replication
    this.db.sync(this.remoteDb, {
      live: true,
      retry: true,
      back_off_function: this.calculateBackoff
    });
  }
}
```

**Key Features:**
- **Bidirectional Sync**: Changes flow both ways (push and pull)
- **Conflict Resolution**: PouchDB handles conflicts automatically
- **Encryption**: Data encrypted at rest using AES-256
- **Retry Logic**: Exponential backoff for network failures

### 2.2 Authentication Flow (MobileAuthController)

```
┌──────────────┐     POST /api/auth/login      ┌──────────────────┐
│ nurse_mobile │ ───────────────────────────► │  MobileAuth      │
│              │                               │  Controller      │
│              │ ◄────────────────────────── │  (Laravel)       │
└──────────────┘     { token, user, role }    └──────────────────┘
                                                    │
                                                    ▼
                                            ┌──────────────────┐
                                            │  Sanctum Token   │
                                            │  Generation      │
                                            └──────────────────┘
```

**Token-Based Authentication:**

```php
// healthbridge_core/app/Http/Controllers/Api/Auth/MobileAuthController.php
public function login(Request $request): JsonResponse
{
    // Validate credentials
    $user = User::where('email', $request->email)->first();
    
    // Create device-specific token
    $token = $user->createToken($deviceName, ['*'])->plainTextToken;
    
    return response()->json([
        'token' => $token,
        'user' => [
            'id' => $user->id,
            'role' => $user->roles->first()?->name,
        ],
        'expires_at' => now()->addDays(30)->toIso8601String(),
    ]);
}
```

### 2.3 Laravel Proxy to CouchDB (CouchProxyController)

The CouchProxyController acts as a reverse proxy, forwarding requests from nurse_mobile to CouchDB while adding security context:

```
Request Flow:
nurse_mobile ──HTTPS+Bearer Token──► Laravel ──Basic Auth──► CouchDB
                    │                   │                     │
                    │                   ▼                     │
                    │            ┌──────────┐               │
                    │            │ Validate │               │
                    │            │  Token   │               │
                    │            └──────────┘               │
                    │                   │                     │
                    │                   ▼                     │
                    │            ┌──────────┐               │
                    │            │ Inject   │               │
                    │            │ X-User   │               │
                    │            │ Headers  │               │
                    │            └──────────┘               │
                    │                                     │
                    ◄────────────────────────────────────┘
                    (Response passes through)
```

**Key Proxy Features:**

```php
// healthbridge_core/app/Http/Controllers/Api/CouchProxyController.php
protected function buildHeaders($user, string $body): array
{
    $headers = [
        'Accept' => 'application/json',
        'Content-Type' => 'application/json',
    ];

    // Inject user context for CouchDB validation
    if ($user) {
        $headers['X-User-ID'] = (string) $user->id;
        $headers['X-User-Email'] = $user->email;
        $headers['X-User-Role'] = $this->getUserRole($user);
    }

    return $headers;
}
```

### 2.4 CouchDB to MySQL Synchronization

healthbridge_core runs a sync worker that polls CouchDB for changes and replicates them to MySQL:

```
┌──────────┐     _changes feed     ┌──────────┐     Upsert      ┌──────────┐
│ CouchDB  │ ◄──────────────────► │  Sync    │ ─────────────► │  MySQL   │
│          │   (every 4 seconds)  │  Worker  │                │          │
└──────────┘                       └──────────┘                └──────────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │ SyncService  │
                                  │              │
                                  │ - syncPatient│
                                  │ - syncSession│
                                  │ - syncForm   │
                                  │ - syncReport │
                                  └──────────────┘
```

**Document Type Handling:**

```php
// healthbridge_core/app/Services/SyncService.php
public function upsert(array $doc): void
{
    $type = $doc['type'] ?? null;

    match ($type) {
        'clinicalPatient' => $this->syncPatient($doc),
        'clinicalSession' => $this->syncSession($doc),
        'clinicalForm' => $this->syncForm($doc),
        'aiLog' => $this->syncAiLog($doc),
        'clinicalReport' => $this->syncReport($doc),
        // Radiology study sync would go here
        'radiologyStudy' => $this->syncRadiologyStudy($doc),
        default => $this->handleUnknown($doc),
    };
}
```

---

## 3. API Route Structure

### 3.1 Laravel API Endpoints

| Endpoint | Method | Middleware | Description |
|----------|--------|------------|-------------|
| `/api/auth/login` | POST | - | Authenticate and get token |
| `/api/auth/logout` | POST | auth:sanctum | Revoke current token |
| `/api/auth/user` | GET | auth:sanctum | Get current user info |
| `/api/couchdb/*` | * | auth:sanctum | Proxy to CouchDB |
| `/api/ai/stream` | POST | auth:sanctum, ai.guard | AI streaming |
| `/api/radiology/worklist` | GET | auth, role:radiologist | Radiologist worklist |
| `/api/radiology/studies` | POST | auth, role:radiologist | Create study |
| `/api/reports/*` | POST | auth:sanctum | Generate PDFs |

### 3.2 CouchDB Proxy Routes

All CouchDB operations are proxied through Laravel:

```
GET    /api/couchdb/              → Database info
GET    /api/couchdb/_all_docs     → List all documents
POST   /api/couchdb/_bulk_docs    → Bulk operations
GET    /api/couchdb/_changes      → Change feed
GET    /api/couchdb/{doc_id}      → Get document
PUT    /api/couchdb/{doc_id}      → Create/update document
DELETE /api/couchdb/{doc_id}      → Delete document
```

---

## 4. Radiology Data Flow

### 4.1 Current Architecture Gap

The radiology workflow currently has a **missing link** in the synchronization:

```
nurse_mobile          CouchDB              healthbridge_core       Radiologist
    │                    │                        │                      │
    │  Complete X-Ray    │                        │                      │
    │  Assessment       │                        │                      │
    │──────────────────►│                        │                      │
    │                    │  (Data synced)        │                      │
    │                    │──────────────────────►│                      │
    │                    │                        │   (No auto-creation) │
    │                    │                        │                      │
    │                    │                        │   ─────────────────► │
    │                    │                        │    (Manual entry)   │
    │                    │                        │                      │
```

### 4.2 Radiology Model (MySQL)

```php
// healthbridge_core/app/Models/RadiologyStudy.php
class RadiologyStudy extends Model
{
    protected $fillable = [
        'study_uuid',           // Unique study identifier
        'session_couch_id',    // Links to CouchDB session
        'patient_cpt',         // Patient identifier
        'modality',            // XRAY, CT, MRI, etc.
        'body_part',           // Chest, abdomen, etc.
        'clinical_indication', // Reason for study
        'priority',            // stat, urgent, routine
        'status',              // pending, ordered, completed
        'ai_priority_score',   // AI-generated priority
        'ai_critical_flag',   // AI critical finding flag
    ];
}
```

### 4.3 Required Implementation for X-Ray Handover

To enable automatic X-Ray study creation:

**Option A: CouchDB Listener (Recommended)**

1. Add document type `radiologyStudy` handling in SyncService
2. Create listener for new X-Ray order documents
3. Auto-create RadiologyStudy in MySQL

**Option B: Direct API Endpoint**

1. Add `/api/radiology/orders` endpoint (accessible to nurse role)
2. nurse_mobile calls API after X-Ray assessment completion
3. API creates RadiologyStudy directly

---

## 5. Security Architecture

### 5.1 Authentication Layers

| Layer | Mechanism | Protection |
|-------|-----------|------------|
| Transport | HTTPS/TLS | Encrypted network traffic |
| Application | Sanctum Token | Bearer token validation |
| Database | CouchDB Basic Auth | Server-side credentials |
| Data | AES-256 Encryption | Encrypted at rest (mobile) |
| Access | Role-Based | Document-level authorization |

### 5.2 User Context Injection

The proxy injects user context headers for CouchDB validation:

```php
// X-User-ID: 123
// X-User-Role: nurse
// X-User-Email: nurse@healthbridge.org
```

CouchDB validate_doc_update functions can then enforce access control:

```javascript
function(newDoc, oldDoc, userCtx) {
  if (newDoc.type === 'clinicalSession' && 
      newDoc.created_by !== userCtx.name) {
    throw({forbidden: 'Cannot modify another user\'s session'});
  }
}
```

---

## 6. Synchronization Issues and Optimization

### 6.1 Known Issues

| Issue | Impact | Mitigation |
|-------|--------|------------|
| **Conflict Resolution** | Data conflicts on concurrent edits | Last-write-wins or manual merge UI |
| **Offline Duration** | Long offline periods may cause sync delays | Queue-based sync with priority |
| **Large Documents** | Slow replication | Document versioning, delta sync |
| **Network Flakiness** | Intermittent connectivity | Exponential backoff, retry logic |
| **Encryption Key Sync** | New devices need key exchange | Secure key transfer protocol |

### 6.2 Optimization Opportunities

**1. Selective Replication**
```javascript
// Only sync specific document types
db.sync(remoteDb, {
  filter: 'doc.type',
  doc_ids: ['clinicalSession', 'clinicalForm']
});
```

**2. Chunked Uploads**
- Split large documents into smaller chunks
- Resume failed uploads

**3. Change Feed Optimization**
```php
// Use since parameter to track progress
$changes = $couchDb->getChanges($lastSequence, [
    'limit' => 100,
    'include_docs' => true
]);
```

**4. Connection Pooling**
- Reuse HTTP connections to CouchDB
- Keep-alive headers

---

## 7. Data Models

### 7.1 CouchDB Document Structure

```json
{
  "_id": "session:ABC123",
  "_rev": "2-abc123",
  "type": "clinicalSession",
  "patient_id": "patient:CPT123",
  "created_by": "nurse_456",
  "status": "triaged",
  "triage_priority": "red",
  "created_at": "2026-02-22T10:00:00Z",
  "updated_at": "2026-02-22T10:30:00Z",
  "synced": true
}
```

### 7.2 MySQL ClinicalSession Structure

```php
// healthbridge_core/app/Models/ClinicalSession.php
class ClinicalSession extends Model
{
    protected $fillable = [
        'couch_id',          // Links to CouchDB
        'patient_id',        // FK to patients table
        'status',            // triaged, assessed, treated, discharged
        'triage_priority',   // red, yellow, green
        'created_by',        // User ID
    ];
    
    public function patient() {
        return $this->belongsTo(Patient::class);
    }
}
```

---

## 8. Monitoring and Diagnostics

### 8.1 Health Check Endpoints

| Endpoint | Returns |
|----------|---------|
| `GET /api/couchdb/health` | CouchDB connectivity status |
| `GET /api/auth/check` | Token validity |
| `GET /api/ai/health` | Ollama/MedGemma status |

### 8.2 Logging Strategy

```php
// All proxy requests are logged
Log::debug('CouchDB proxy request', [
    'method' => $method,
    'path' => $path,
    'user_id' => $user?->id,
]);
```

---

## 9. Conclusion

The HealthBridge synchronization architecture provides a robust, secure, and scalable foundation for offline-first healthcare data collection. Key strengths include:

- **Offline-First Design**: nurses can work without connectivity
- **Security**: Multi-layer authentication and encryption
- **Scalability**: CouchDB handles high write loads
- **Analytics-Ready**: MySQL provides reporting capabilities

The primary area for improvement is the **radiology workflow**, where additional synchronization logic is needed to automatically create RadiologyStudy records when X-Ray assessments are completed in nurse_mobile.

---

## Appendix: File Reference

| File | Purpose |
|------|---------|
| `nurse_mobile/app/services/sync.ts` | PouchDB sync service |
| `nurse_mobile/app/services/secureDb.ts` | Encrypted local storage |
| `healthbridge_core/app/Http/Controllers/Api/CouchProxyController.php` | CouchDB proxy |
| `healthbridge_core/app/Http/Controllers/Api/Auth/MobileAuthController.php` | Authentication |
| `healthbridge_core/app/Services/CouchDbService.php` | CouchDB operations |
| `healthbridge_core/app/Services/SyncService.php` | CouchDB→MySQL sync |
| `healthbridge_core/app/Models/RadiologyStudy.php` | Radiology data model |
| `healthbridge_core/routes/api.php` | API route definitions |
| `GATEWAY.md` | Original architecture documentation |
