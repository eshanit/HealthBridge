# Technical Feasibility Analysis: Nurse Mobile Integration with HealthBridge Core

**Document Status:** Authoritative  
**Created:** February 16, 2026  
**Version:** 1.0  
**Classification:** Technical Architecture  

---

## Executive Summary

This report provides a comprehensive technical feasibility analysis for integrating the `nurse_mobile` application with the `healthbridge_core` system. Based on the architectural reference in `GATEWAY.md` and analysis of existing implementations, the integration is **technically viable** with a recommended phased approach.

### Key Findings

| Area | Status | Confidence | Enhanceable |
|------|--------|------------|-------------|
| API Compatibility | ✅ Viable | High | N/A |
| Data Synchronization | ✅ Viable | High | N/A |
| Security Protocols | ⚠️ Requires Enhancement | Medium | ✅ **Yes** |
| Infrastructure | ✅ Viable | High | N/A |
| Overall Feasibility | ✅ **Viable** | High | N/A |

> **Note on Security Protocols:** The "Requires Enhancement" status is **fully addressable** through implementation. The existing security foundation (Sanctum authentication, AI output validation, rate limiting, encrypted local storage) is solid. The identified gaps—user context injection, document-level access control, and token refresh—are well-understood and have clear implementation paths detailed in Section 4 of this report.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [API Compatibility Analysis](#2-api-compatibility-analysis)
3. [Data Synchronization Strategy](#3-data-synchronization-strategy)
4. [Security Protocol Evaluation](#4-security-protocol-evaluation)
5. [Infrastructure Requirements](#5-infrastructure-requirements)
6. [Risk Assessment](#6-risk-assessment)
7. [Implementation Roadmap](#7-implementation-roadmap)
8. [Recommendations](#8-recommendations)

---

## 1. Architecture Overview

### 1.1 Current System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HEALTHBRIDGE PLATFORM                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────┐      ┌─────────────────────────────────┐   │
│  │    NURSE MOBILE (Nuxt 4)    │      │   HEALTHBRIDGE CORE (Laravel)   │   │
│  ├─────────────────────────────┤      ├─────────────────────────────────┤   │
│  │ • PouchDB (Encrypted)       │      │ • MySQL (Operational Mirror)    │   │
│  │ • PIN-based Auth            │      │ • Fortify/Sanctum Auth          │   │
│  │ • Offline-first             │      │ • AI Gateway (MedGemma)         │   │
│  │ • Clinical Forms Engine     │      │ • Role-based Access Control     │   │
│  │ • Local AI (Ollama)         │      │ • Sync Worker (CouchDB→MySQL)   │   │
│  └──────────────┬──────────────┘      └────────────────┬────────────────┘   │
│                 │                                      │                     │
│                 │         PouchDB ↔ CouchDB Sync       │                     │
│                 │              (Proposed)              │                     │
│                 ▼                                      ▼                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         COUCHDB LAYER                                 │   │
│  │                       (Source of Truth)                               │   │
│  │                                                                       │   │
│  │   Document Types: clinicalPatient, clinicalSession, clinicalForm,    │   │
│  │                   aiLog, ruleVersions                                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Proposed Integration Architecture (from GATEWAY.md)

```
Mobile App (PouchDB)  →  Laravel API (/api/couchdb/*)  →  CouchDB
                              ↓
                        [auth:sanctum]
                              ↓
                        CouchProxyController
                              ↓
                        Basic Auth to CouchDB
```

### 1.3 Component Mapping

| Nurse Mobile Component | HealthBridge Core Equivalent | Integration Point |
|------------------------|------------------------------|-------------------|
| [`secureDb.ts`](nurse_mobile/app/services/secureDb.ts) | [`CouchDbService.php`](healthbridge_core/app/Services/CouchDbService.php) | PouchDB ↔ CouchDB Sync |
| [`sync.ts`](nurse_mobile/app/services/sync.ts) | [`CouchSyncWorker.php`](healthbridge_core/app/Console/Commands/CouchSyncWorker.php) | Bi-directional sync |
| [`useAuth.ts`](nurse_mobile/app/composables/useAuth.ts) | Fortify + Sanctum | Token-based API auth |
| [`clinicalAI.ts`](nurse_mobile/app/services/clinicalAI.ts) | [`MedGemmaController.php`](healthbridge_core/app/Http/Controllers/Api/Ai/MedGemmaController.php) | AI Gateway |

---

## 2. API Compatibility Analysis

### 2.1 Authentication Mechanisms

#### Current State

| System | Auth Method | Token Storage |
|--------|-------------|---------------|
| nurse_mobile | PIN-based local auth | localStorage (encrypted) |
| healthbridge_core | Fortify (web) + Sanctum (API) | Database (tokens table) |

#### Gap Analysis

The mobile app currently uses **local PIN authentication** without server-side validation. The proposed integration requires:

1. **Sanctum Token Generation** - Mobile app needs to obtain API tokens after authentication
2. **Token Refresh Mechanism** - Handle token expiration gracefully
3. **Offline Auth Bridge** - Maintain local PIN auth while syncing with server

#### Recommended Approach

```typescript
// Proposed: Enhanced auth flow in nurse_mobile
interface AuthBridge {
  // Local PIN verification (existing)
  verifyLocalPin(pin: string): Promise<boolean>;
  
  // NEW: Server token acquisition
  acquireServerToken(credentials: Credentials): Promise<SanctumToken>;
  
  // NEW: Token refresh
  refreshToken(): Promise<SanctumToken>;
  
  // NEW: Sync auth state
  syncAuthState(): Promise<void>;
}
```

### 2.2 API Endpoint Compatibility

#### Existing healthbridge_core API Routes

| Endpoint | Method | Purpose | Mobile Compatibility |
|----------|--------|---------|---------------------|
| `/api/ai/medgemma` | POST | AI completions | ✅ Compatible |
| `/api/ai/health` | GET | AI service health | ✅ Compatible |
| `/api/ai/tasks` | GET | Available AI tasks | ✅ Compatible |

#### Required New Endpoints (from GATEWAY.md)

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/couchdb/{path?}` | ANY | CouchDB proxy | ⚠️ Needs Implementation |
| `/api/auth/login` | POST | Mobile login | ⚠️ Needs Implementation |
| `/api/auth/logout` | POST | Mobile logout | ⚠️ Needs Implementation |
| `/api/auth/user` | GET | Current user info | ⚠️ Needs Implementation |

### 2.3 Data Format Compatibility

#### CouchDB Document Types (Both Systems)

```json
// Patient Document - Compatible ✅
{
  "_id": "pat_A7F3",
  "type": "clinicalPatient",
  "patient": {
    "cpt": "CP-7F3A-9B2C",
    "dateOfBirth": "2024-01-15",
    "gender": "male"
  }
}

// Clinical Session Document - Compatible ✅
{
  "_id": "sess_8F2A9",
  "type": "clinicalSession",
  "patientCpt": "CP-7F3A-9B2C",
  "triage": "yellow",
  "status": "open"
}

// Clinical Form Document - Compatible ✅
{
  "_id": "form_001",
  "type": "clinicalForm",
  "sessionId": "sess_8F2A9",
  "answers": { ... },
  "calculated": { ... }
}
```

**Verdict:** Data formats are fully compatible. Both systems use identical document structures.

---

## 3. Data Synchronization Strategy

### 3.1 Existing Sync Infrastructure

#### nurse_mobile Sync Service ([`sync.ts`](nurse_mobile/app/services/sync.ts))

```typescript
// Current capabilities:
- Bi-directional PouchDB ↔ CouchDB sync
- Exponential backoff retry logic
- Live sync with automatic reconnection
- Sync event logging and monitoring
- Encryption key management integration
```

**Strengths:**
- Mature retry mechanism with configurable backoff
- Comprehensive event logging via `SyncLogger` class
- Integration with secure encryption key management

**Gaps:**
- No authentication token injection in sync requests
- Direct CouchDB connection (no proxy layer)

#### healthbridge_core Sync Worker ([`CouchSyncWorker.php`](healthbridge_core/app/Console/Commands/CouchSyncWorker.php))

```php
// Current capabilities:
- Continuous CouchDB → MySQL mirroring
- Document type routing (patient, session, form, aiLog)
- Sequence tracking via Cache
- Supervisor-managed daemon process
```

**Strengths:**
- Near real-time sync (~4 second polling interval)
- Robust error handling with backoff
- Raw document preservation for audit

### 3.2 Proposed Sync Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         SYNC DATA FLOW                                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────┐    │
│  │   Mobile    │     │    Laravel      │     │      CouchDB        │    │
│  │   PouchDB   │────▶│    Proxy        │────▶│   (Source of        │    │
│  │             │     │ /api/couchdb/*  │     │    Truth)           │    │
│  └─────────────┘     └─────────────────┘     └──────────┬──────────┘    │
│         │                   ▲                           │                │
│         │                   │                           │                │
│         │            Sanctum Token              _changes feed           │
│         │                   │                           │                │
│         │                   │                           ▼                │
│         │                   │              ┌─────────────────────┐      │
│         │                   │              │   Sync Worker       │      │
│         │                   │              │   (Daemon)          │      │
│         │                   │              └──────────┬──────────┘      │
│         │                   │                         │                  │
│         │                   │                         ▼                  │
│         │                   │              ┌─────────────────────┐      │
│         │                   └──────────────│      MySQL          │      │
│         │                                  │   (Mirror)          │      │
│         │                                  └─────────────────────┘      │
│         │                                                               │
│         │         Live Sync (PouchDB API)                               │
│         └─────────────────────────────────────────────────────────────▶ │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Sync Configuration Requirements

#### Mobile App Configuration

```typescript
// nurse_mobile/app/services/sync.ts - Required modifications
const syncConfig: SyncConfig = {
  remoteUrl: `${config.public.apiBase}/api/couchdb`,
  // Remove direct credentials - use token auth
  retryInterval: 1000,
  maxRetries: 5,
  backoffMultiplier: 2,
  maxBackoff: 60000
};

// Token injection in fetch
const remoteDB = new PouchDB(remoteUrl, {
  fetch: (url, opts) => {
    opts.headers.set('Authorization', `Bearer ${authStore.token}`);
    return PouchDB.fetch(url, opts);
  }
});
```

#### Laravel Proxy Configuration (from GATEWAY.md)

```php
// app/Http/Controllers/CouchProxyController.php
class CouchProxyController extends Controller
{
    protected $couchDbUrl;

    public function proxy(Request $request, string $path = '')
    {
        $url = $this->couchDbUrl . ($path ? '/' . $path : '');
        
        $response = Http::withBasicAuth(
                env('COUCHDB_USER', 'admin'),
                env('COUCHDB_PASSWORD', 'password')
            )
            ->withOptions([
                'stream' => true,
                'decode_content' => true,  // Gzip support
            ])
            ->timeout(10)
            ->retry(3, 200)
            ->send($request->method(), $url, [
                'query' => $request->query(),
                'body' => $request->getContent(),
            ]);

        return response($response->body(), $response->status());
    }
}
```

### 3.4 Conflict Resolution Strategy

| Scenario | Resolution | Implementation |
|----------|------------|----------------|
| Same document edited offline | Last-write-wins with audit | CouchDB revision system + `audit_log` field |
| Deleted on mobile, updated on server | Preserve deletion, log conflict | Soft delete flag in MySQL |
| Schema version mismatch | Version-aware merge | `schema_version` field validation |

---

## 4. Security Protocol Evaluation

### 4.1 Current Security Measures

#### nurse_mobile Security

| Measure | Implementation | Status |
|---------|----------------|--------|
| Local encryption | AES-256-GCM via Web Crypto API | ✅ Implemented |
| PIN authentication | PBKDF2 key derivation (100k iterations) | ✅ Implemented |
| Key management | [`useKeyManager.ts`](nurse_mobile/app/composables/useKeyManager.ts) | ✅ Implemented |
| Audit logging | [`auditLogger.ts`](nurse_mobile/app/services/auditLogger.ts) | ✅ Implemented |

#### healthbridge_core Security

| Measure | Implementation | Status |
|---------|----------------|--------|
| API authentication | Laravel Sanctum | ✅ Implemented |
| Role-based access | Spatie Permission + [`AiGuard`](healthbridge_core/app/Http/Middleware/AiGuard.php) | ✅ Implemented |
| AI output validation | [`OutputValidator`](healthbridge_core/app/Services/Ai/OutputValidator.php) | ✅ Implemented |
| Rate limiting | `throttle:ai` middleware | ✅ Implemented |

### 4.2 Security Gaps Identified

#### Critical Gaps

1. **No User Identity Injection in CouchDB Requests**
   - Current: Any valid token can access all documents
   - Risk: Nurse A could access Nurse B's patients
   - Mitigation: Implement user context in proxy layer

2. **CouchDB Credentials Exposed to Laravel Only**
   - Current: Basic auth credentials in `.env`
   - Risk: Low (server-side only)
   - Status: ✅ Acceptable

3. **No Document-Level Access Control**
   - Current: CouchDB has no `validate_doc_update` functions
   - Risk: Unauthorized document modifications
   - Mitigation: Implement CouchDB validation functions

#### Recommended Security Enhancements

```javascript
// CouchDB validate_doc_update function
function(newDoc, oldDoc, userCtx) {
  // Require user context
  if (!userCtx.name) {
    throw({forbidden: 'Authentication required'});
  }
  
  // Enforce created_by ownership
  if (newDoc.created_by && newDoc.created_by !== userCtx.name) {
    throw({forbidden: 'Cannot modify documents created by other users'});
  }
  
  // Validate document type
  var validTypes = ['clinicalPatient', 'clinicalSession', 'clinicalForm', 'aiLog'];
  if (newDoc.type && validTypes.indexOf(newDoc.type) === -1) {
    throw({forbidden: 'Invalid document type'});
  }
}
```

```php
// Enhanced proxy with user context injection
public function proxy(Request $request, string $path = '')
{
    $user = $request->user();
    
    $response = Http::withBasicAuth(...)
        ->withHeaders([
            'X-User-ID' => $user->id,
            'X-User-Role' => $user->roles->first()?->name,
            'X-Session-ID' => session()->getId(),
        ])
        ->send(...);
}
```

### 4.3 Security Compliance Matrix

| Requirement | Status | Notes |
|-------------|--------|-------|
| Data encryption at rest | ✅ | AES-256-GCM (mobile), MySQL encryption (server) |
| Data encryption in transit | ✅ | HTTPS required, Sanctum tokens |
| Authentication | ⚠️ | Needs server-side token integration |
| Authorization | ⚠️ | Needs document-level access control |
| Audit trail | ✅ | Both systems have comprehensive logging |
| Session management | ✅ | Fortify 2FA + token expiration |

---

## 5. Infrastructure Requirements

### 5.1 Server Infrastructure

| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| PHP | 8.2+ | 8.3+ | Laravel 11 requirement |
| MySQL | 8.0+ | 8.0+ | JSON column support |
| CouchDB | 3.3+ | 3.3+ | `_changes` feed support |
| Redis | 6.0+ | 7.0+ | Cache, queues, sessions |
| Ollama | Latest | Latest | MedGemma model |

### 5.2 Network Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          NETWORK TOPOLOGY                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌───────────────┐         ┌───────────────┐         ┌───────────────┐ │
│  │   Mobile      │   HTTPS │   Nginx/      │   HTTP  │   CouchDB     │ │
│  │   Devices     │────────▶│   Apache      │────────▶│   :5984       │ │
│  └───────────────┘         └───────┬───────┘         └───────────────┘ │
│                                    │                                     │
│                                    │ PHP-FPM                             │
│                                    ▼                                     │
│                            ┌───────────────┐                             │
│                            │   Laravel     │                             │
│                            │   Application │                             │
│                            └───────┬───────┘                             │
│                                    │                                     │
│                    ┌───────────────┼───────────────┐                     │
│                    │               │               │                     │
│                    ▼               ▼               ▼                     │
│            ┌───────────────┐ ┌───────────────┐ ┌───────────────┐        │
│            │   MySQL       │ │   Redis       │ │   Ollama      │        │
│            │   :3306       │ │   :6379       │ │   :11434      │        │
│            └───────────────┘ └───────────────┘ └───────────────┘        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Process Management

#### Supervisor Configuration (Existing)

```ini
[program:healthbridge-couchdb-sync]
command=php /var/www/healthbridge/artisan couchdb:sync --daemon --poll=4 --batch=100
user=www-data
autostart=true
autorestart=true
stdout_logfile=/var/www/healthbridge/storage/logs/couchdb-sync.log
stderr_logfile=/var/www/healthbridge/storage/logs/couchdb-sync-error.log
numprocs=1
```

#### Additional Processes Required

| Process | Purpose | Management |
|---------|---------|------------|
| Laravel Queue Worker | Job processing | Supervisor |
| Laravel Scheduler | Cron tasks | System cron |
| Ollama Service | AI inference | systemd |

### 5.4 Resource Estimation

| Resource | Development | Staging | Production |
|----------|-------------|---------|------------|
| CPU | 2 cores | 4 cores | 8+ cores |
| RAM | 4 GB | 8 GB | 16+ GB |
| Storage | 50 GB | 100 GB | 500+ GB SSD |
| Bandwidth | 10 Mbps | 50 Mbps | 100+ Mbps |

---

## 6. Risk Assessment

### 6.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Sync conflicts during offline operation | Medium | High | Implement conflict resolution UI + last-write-wins |
| Token expiration during sync | Medium | Medium | Auto-refresh mechanism with retry queue |
| CouchDB performance degradation | Low | High | Index optimization, read replicas |
| AI Gateway latency | Medium | Medium | Response caching, async processing |
| Data model divergence | Low | High | Schema versioning, migration scripts |

### 6.2 Security Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Unauthorized document access | Medium | Critical | Implement `validate_doc_update` |
| Token theft | Low | Critical | Short token lifetime, secure storage |
| Man-in-the-middle attack | Low | Critical | Enforce HTTPS, certificate pinning |
| Offline data breach | Low | High | Strong encryption, secure key storage |

### 6.3 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Sync worker failure | Medium | High | Supervisor auto-restart, monitoring |
| Database corruption | Low | Critical | Regular backups, point-in-time recovery |
| Network partition | Medium | Medium | Offline-first design, sync queue |
| Resource exhaustion | Medium | Medium | Monitoring, auto-scaling |

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

**Objective:** Establish core integration infrastructure

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Implement `CouchProxyController` | Critical | 2 days | None |
| Add Sanctum token endpoints | Critical | 1 day | None |
| Create mobile auth bridge | Critical | 2 days | Token endpoints |
| Configure CORS for mobile app | High | 0.5 days | None |
| Write integration tests | High | 2 days | All above |

**Deliverables:**
- Working CouchDB proxy with Sanctum auth
- Mobile app can authenticate and sync
- Basic integration test suite

### Phase 2: Security Hardening (Weeks 3-4)

**Objective:** Implement document-level security

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Add user context injection | Critical | 1 day | Phase 1 |
| Implement `validate_doc_update` | Critical | 2 days | None |
| Add document ownership tracking | High | 1 day | None |
| Implement token refresh flow | High | 1 day | Phase 1 |
| Security audit | Critical | 2 days | All above |

**Deliverables:**
- Document-level access control
- User context in all CouchDB operations
- Security audit report

### Phase 3: Sync Enhancement (Weeks 5-6)

**Objective:** Optimize sync performance and reliability

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Implement conflict resolution UI | High | 3 days | Phase 2 |
| Add sync status dashboard | Medium | 2 days | None |
| Optimize sync batch processing | Medium | 1 day | None |
| Add sync monitoring/alerting | High | 2 days | None |
| Load testing | High | 2 days | All above |

**Deliverables:**
- Conflict resolution interface
- Real-time sync monitoring
- Performance benchmarks

### Phase 4: Production Readiness (Weeks 7-8)

**Objective:** Prepare for production deployment

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Infrastructure provisioning | Critical | 2 days | None |
| CI/CD pipeline setup | High | 2 days | None |
| Monitoring integration | High | 2 days | None |
| Documentation | Medium | 2 days | All above |
| UAT testing | Critical | 3 days | All above |

**Deliverables:**
- Production infrastructure
- Automated deployment pipeline
- Complete documentation

---

## 8. Recommendations

### 8.1 Immediate Actions (Priority 1)

1. **Implement CouchProxyController** as specified in GATEWAY.md
   - Use existing [`CouchDbService.php`](healthbridge_core/app/Services/CouchDbService.php) as foundation
   - Add Sanctum middleware for authentication
   - Implement streaming for large documents

2. **Create Mobile Auth Bridge**
   - Extend [`useAuth.ts`](nurse_mobile/app/composables/useAuth.ts) with server token management
   - Implement secure token storage using existing encryption infrastructure
   - Add token refresh mechanism

3. **Add User Context Injection**
   - Modify proxy to inject `X-User-ID` and `X-User-Role` headers
   - Create CouchDB `validate_doc_update` function

### 8.2 Short-term Actions (Priority 2)

1. **Implement Conflict Resolution**
   - Add conflict detection in [`SyncService.php`](healthbridge_core/app/Services/SyncService.php)
   - Create UI for manual conflict resolution
   - Implement automatic resolution for common cases

2. **Enhance Monitoring**
   - Add sync metrics to Laravel Telescope
   - Create Grafana dashboard for CouchDB metrics
   - Set up alerts for sync failures

3. **Performance Optimization**
   - Implement response caching for AI requests
   - Add database indexes for common queries
   - Configure CouchDB compaction

### 8.3 Long-term Actions (Priority 3)

1. **Implement Closed Learning Loop**
   - Create feedback mechanism from clinical reviews
   - Build prompt version management UI
   - Implement rule sync to mobile devices

2. **Add Advanced Features**
   - Real-time notifications via WebSockets
   - Offline AI model updates
   - Multi-clinic support

### 8.4 Technical Debt Items

| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| Migrate deprecated `pouchdb.ts` to `secureDb.ts` fully | Medium | Low | P2 |
| Add API versioning | Low | Medium | P3 |
| Implement GraphQL alternative | Low | High | P4 |
| Add comprehensive E2E tests | High | High | P2 |

---

## Appendix A: API Endpoint Specifications

### A.1 CouchDB Proxy Endpoints

```yaml
# OpenAPI Specification
paths:
  /api/couchdb/{path}:
    get:
      summary: Proxy GET to CouchDB
      security:
        - bearerAuth: []
      parameters:
        - name: path
          in: path
          required: true
          schema:
            type: string
      responses:
        200:
          description: CouchDB response
        401:
          description: Unauthorized
        500:
          description: Proxy error
    
    post:
      summary: Proxy POST to CouchDB
      security:
        - bearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
      responses:
        201:
          description: Document created
        409:
          description: Conflict
    
    put:
      summary: Proxy PUT to CouchDB
      security:
        - bearerAuth: []
    
    delete:
      summary: Proxy DELETE to CouchDB
      security:
        - bearerAuth: []
```

### A.2 Authentication Endpoints

```yaml
paths:
  /api/auth/login:
    post:
      summary: Mobile login
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                email:
                  type: string
                password:
                  type: string
                device_name:
                  type: string
      responses:
        200:
          description: Returns Sanctum token
          content:
            application/json:
              schema:
                type: object
                properties:
                  token:
                    type: string
                  user:
                    type: object
  
  /api/auth/logout:
    post:
      summary: Mobile logout
      security:
        - bearerAuth: []
      responses:
        204:
          description: Logged out
  
  /api/auth/user:
    get:
      summary: Get current user
      security:
        - bearerAuth: []
      responses:
        200:
          description: User details
```

---

## Appendix B: Data Model Reference

### B.1 Document Type Hierarchy

```
CouchDB Documents
├── clinicalPatient
│   ├── _id: "pat_{shortCode}"
│   ├── type: "clinicalPatient"
│   └── patient: { cpt, dateOfBirth, gender, ... }
│
├── clinicalSession
│   ├── _id: "sess_{uuid}"
│   ├── type: "clinicalSession"
│   ├── patientCpt: string
│   ├── triage: "red" | "yellow" | "green" | "unknown"
│   └── status: "open" | "completed" | "referred" | ...
│
├── clinicalForm
│   ├── _id: "form_{uuid}"
│   ├── type: "clinicalForm"
│   ├── sessionId: string
│   ├── answers: object
│   └── calculated: object
│
└── aiLog
    ├── _id: "ai_{uuid}"
    ├── type: "aiLog"
    ├── task: string
    └── output: string
```

### B.2 MySQL Mirror Schema

See existing migrations:
- [`2026_02_15_000002_create_patients_table.php`](healthbridge_core/database/migrations/2026_02_15_000002_create_patients_table.php)
- [`2026_02_15_000003_create_clinical_sessions_table.php`](healthbridge_core/database/migrations/2026_02_15_000003_create_clinical_sessions_table.php)
- [`2026_02_15_000004_create_clinical_forms_table.php`](healthbridge_core/database/migrations/2026_02_15_000004_create_clinical_forms_table.php)

---

## Appendix C: Testing Strategy

### C.1 Unit Tests

| Component | Test Coverage Target |
|-----------|---------------------|
| CouchProxyController | 90% |
| SyncService | 85% |
| Auth Bridge | 90% |
| OutputValidator | 95% |

### C.2 Integration Tests

```php
// Example: Sync Integration Test
class CouchDbSyncIntegrationTest extends TestCase
{
    public function test_mobile_can_sync_patient_document()
    {
        $user = User::factory()->create()->assignRole('nurse');
        $token = $user->createToken('mobile')->plainTextToken;
        
        $response = $this->withToken($token)
            ->postJson('/api/couchdb', [
                '_id' => 'pat_TEST',
                'type' => 'clinicalPatient',
                'patient' => [
                    'cpt' => 'CP-TEST-001',
                    'dateOfBirth' => '2024-01-15',
                ]
            ]);
        
        $response->assertStatus(201);
        
        // Verify MySQL mirror
        $this->assertDatabaseHas('patients', [
            'cpt' => 'CP-TEST-001'
        ]);
    }
}
```

### C.3 E2E Tests

| Scenario | Priority |
|----------|----------|
| Offline patient registration → sync | Critical |
| Conflict resolution flow | High |
| Token refresh during sync | High |
| AI request with sync | Medium |

---

## 9. Architecture Decision Record: Shared Clinic Database

### 9.1 Decision

**Adopt shared clinic database with Laravel proxy and Sanctum authentication.**

This decision was made after analyzing the trade-offs between per-device databases and a shared clinic database approach.

### 9.2 Rationale

| Aspect | Shared Clinic DB | Per-Device DB (Rejected) |
|--------|------------------|--------------------------|
| **Data aggregation** | ✅ Single source of truth – sync worker listens to one DB | ❌ Must listen to many DBs or replicate each device DB |
| **Access control** | Document-level via validation functions | Isolated by DB but still need device auth |
| **Conflict handling** | Higher chance but manageable with revision system | Lower but data siloed |
| **Governance alignment** | ✅ Perfect – specialists see all data | ❌ Harder – data is siloed |
| **Scalability** | ✅ Scales well; CouchDB handles many clients | Many DBs harder to manage |
| **Migration effort** | Moderate | Similar but aggregation remains a problem |

### 9.3 Implementation Requirements

#### Mobile App Changes

```typescript
// nurse_mobile/app/services/syncManager.ts - Required changes

// BEFORE (current):
const remoteUrl = `${import.meta.env.VITE_SYNC_SERVER_URL || 'http://localhost:5984'}/healthbridge_${deviceId}`;

// AFTER (proposed):
const remoteUrl = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/api/couchdb`;

// Add token injection:
const remoteDB = new PouchDB(remoteUrl, {
  fetch: (url, opts) => {
    const authStore = useAuthStore();
    opts.headers.set('Authorization', `Bearer ${authStore.serverToken}`);
    return PouchDB.fetch(url, opts);
  }
});
```

#### Laravel Proxy Implementation

```php
// app/Http/Controllers/CouchProxyController.php
// (As specified in GATEWAY.md with user context injection)
```

#### CouchDB Validation Functions

```javascript
// _design/validation/validate_doc_update
function(newDoc, oldDoc, userCtx) {
  if (!userCtx.name) {
    throw({forbidden: 'Authentication required'});
  }
  
  if (newDoc.created_by && newDoc.created_by !== userCtx.name) {
    throw({forbidden: 'Cannot modify documents created by other users'});
  }
}
```

### 9.4 Migration Path

**Phase 0.5 (Concurrent with Phase 1):**
1. Set up new clinic database in CouchDB (`healthbridge_clinic01`)
2. Deploy Laravel proxy endpoint (`/api/couchdb/*`)
3. Update mobile app to use proxy and token auth
4. Keep old device DBs as read-only backup
5. Add validation functions to CouchDB
6. Test with small group of devices

**Phase 1:**
- Fully switch all devices to new sync URL
- Retire per-device DBs after confirming data is mirrored

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-16 | Technical Architecture Team | Initial release |
| 1.1 | 2026-02-16 | Technical Architecture Team | Added Architecture Decision Record: Shared Clinic Database |

---

**End of Document**
