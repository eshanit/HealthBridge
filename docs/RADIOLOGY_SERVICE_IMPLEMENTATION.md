# Radiology Service Implementation Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [API Reference](#api-reference)
3. [Data Models](#data-models)
4. [Security Implementation](#security-implementation)
5. [Sync Worker](#sync-worker)
6. [Integration Points](#integration-points)
7. [Error Handling](#error-handling)
8. [Usage Examples](#usage-examples)
9. [Configuration](#configuration)
10. [UML Diagrams](#uml-diagrams)

---

## Architecture Overview

### Three-Tier Data Flow

The Radiology Service implements a three-tier data synchronization architecture:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        RADIOLOGY SERVICE ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐ │
│  │   nurse_mobile    │          │   healthbridge_   │          │                 │ │
│  │   (PouchDB)     │          │     core         │          │    CouchDB      │ │
│  │                  │          │   (Laravel)     │          │                 │ │
│  │  ┌────────────┐ │          │                  │          │  ┌────────────┐ │ │
│  │  │ radiology  │ │◄────────►│  ┌──────────┐   │◄────────►│  │ radiology  │ │ │
│  │  │  Service   │ │  HTTPS   │  │  CouchDB  │   │   REST   │  │  Study    │ │ │
│  │  └────────────┘ │          │  │  Proxy    │   │          │  └────────────┘ │ │
│  │                  │          │  └──────────┘   │          │                 │ │
│  │  ┌────────────┐ │          │        │        │          │                 │ │
│  │  │  SecureDB  │ │          │        ▼        │          │                 │ │
│  │  │ (Encrypted)│ │          │  ┌──────────┐   │          │                 │ │
│  │  └────────────┘ │          │  │  Sync    │   │          │                 │ │
│  │                  │          │  │ Service  │───┼─────────►│                 │ │
│  └──────────────────┘          │  └──────────┘   │          └────────┬────────┘ │
│                                 └────────┬─────────┘                    │          │
│                                          │                              ▼          │
│                                 ┌────────▼────────┐          ┌───────────────┐ │
│                                 │     MySQL       │          │               │ │
│                                 │                 │          │  Radiologist  │ │
│                                 │ ┌─────────────┐ │          │  Dashboard    │ │
│                                 │ │RadiologyStudy│◄──────────│               │ │
│                                 │ └─────────────┘ │          │               │ │
│                                 └─────────────────┘          └───────────────┘ │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **nurse_mobile** | Creates/edits radiology orders locally; syncs when online |
| **CouchProxyController** | Authenticates requests; proxies to CouchDB |
| **CouchDB** | Document storage; change tracking via `_changes` feed |
| **SyncService** | Polls CouchDB; syncs documents to MySQL |
| **MySQL** | Relational storage for queries/reporting |

---

## API Reference

### radiologyService.ts

All methods are available via the singleton export:

```typescript
import { radiologyService } from '~/services/radiologyService';
```

#### initialize()

Initializes the radiology service and establishes PouchDB connection.

```typescript
async initialize(): Promise<void>
```

**Details:**
- Initializes secure encrypted PouchDB connection
- Obtains encryption key from security store
- Sets up sync service reference

**Throws:** Error if encryption key is unavailable

---

#### createStudy(options)

Creates a new radiology study order in PouchDB.

```typescript
async createStudy(options: CreateRadiologyStudyOptions): Promise<RadiologyStudyDoc>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `patientCpt` | string | Yes | Patient CPT identifier |
| `sessionCouchId` | string | No | Link to clinical session |
| `modality` | `'XRAY' \| 'CT' \| 'MRI' \| 'ULTRASOUND' \| 'PET' \| 'MAMMO' \| 'FLUORO' \| 'ANGIO'` | Yes | Imaging modality |
| `bodyPart` | string | No | Body part being imaged |
| `studyType` | `'Diagnostic' \| 'Screening' \| 'Follow-up' \| 'Pre-operative' \| 'Emergency'` | No | Type of study |
| `clinicalIndication` | string | Yes | Clinical reason for study |
| `clinicalQuestion` | string | No | Specific question to answer |
| `priority` | `'stat' \| 'urgent' \| 'routine' \| 'scheduled'` | No | Defaults to 'routine' |
| `createdBy` | string | No | User ID of ordering nurse |

**Returns:** Created RadiologyStudyDoc with generated `_id` and `_rev`

**Example:**
```typescript
const study = await radiologyService.createStudy({
  patientCpt: 'CPT123',
  sessionCouchId: 'session:abc123',
  modality: 'XRAY',
  bodyPart: 'CHEST',
  clinicalIndication: 'Cough, difficulty breathing',
  priority: 'urgent',
  createdBy: 'nurse_001'
});
```

---

#### updateStudy(docId, updates)

Updates an existing radiology study.

```typescript
async updateStudy(docId: string, updates: Partial<RadiologyStudyDoc>): Promise<RadiologyStudyDoc>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `docId` | string | Yes | CouchDB document ID (format: `radiology:UUID`) |
| `updates` | Partial<RadiologyStudyDoc> | Yes | Fields to update |

**Returns:** Updated RadiologyStudyDoc

**Example:**
```typescript
const updated = await radiologyService.updateStudy(
  'radiology:550e8400-e29b-41d4-a716-446655440000',
  {
    status: 'completed',
    performedAt: new Date().toISOString(),
    aiCriticalFlag: true,
    aiPreliminaryReport: 'Possible infiltrate in right lower lobe'
  }
);
```

---

#### getStudy(docId)

Retrieves a radiology study by ID.

```typescript
async getStudy(docId: string): Promise<RadiologyStudyDoc | null>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `docId` | string | Yes | CouchDB document ID |

**Returns:** RadiologyStudyDoc or null if not found

**Example:**
```typescript
const study = await radiologyService.getStudy('radiology:550e8400-e29b-41d4-a716-446655440000');
if (study) {
  console.log(`Study status: ${study.status}`);
}
```

---

#### getStudiesForPatient(patientCpt)

Retrieves all radiology studies for a specific patient.

```typescript
async getStudiesForPatient(patientCpt: string): Promise<RadiologyStudyDoc[]>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `patientCpt` | string | Yes | Patient CPT identifier |

**Returns:** Array of RadiologyStudyDoc

---

#### getPendingStudies()

Retrieves all studies that haven't been synced to CouchDB.

```typescript
async getPendingStudies(): Promise<RadiologyStudyDoc[]>
```

**Returns:** Array of unsynced RadiologyStudyDoc

---

#### getSyncStatus()

Gets current synchronization status.

```typescript
async getSyncStatus(): Promise<SyncStatus>
```

**Returns:**

```typescript
interface SyncStatus {
  pending: number;      // Number of unsynced documents
  synced: number;      // Number of synced documents
  conflicts: number;   // Number of conflicts (reserved)
  lastSyncTime: string | null;  // Last successful sync timestamp
}
```

---

#### deleteStudy(docId)

Deletes a radiology study from local PouchDB.

```typescript
async deleteStudy(docId: string): Promise<void>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `docId` | string | Yes | CouchDB document ID to delete |

---

## Data Models

### RadiologyStudyDoc (TypeScript)

```typescript
interface RadiologyStudyDoc {
  // CouchDB System Fields
  _id: string;                    // Format: "radiology:UUID"
  _rev?: string;                  // CouchDB revision
  
  // Document Type (for SyncService routing)
  type: 'radiologyStudy';
  
  // Patient & Session Links
  patientCpt: string;             // Patient identifier
  sessionCouchId?: string;        // Link to clinical session
  
  // Study Details
  modality: 'XRAY' | 'CT' | 'MRI' | 'ULTRASOUND' | 'PET' | 'MAMMO' | 'FLUORO' | 'ANGIO';
  bodyPart?: string;
  studyType?: 'Diagnostic' | 'Screening' | 'Follow-up' | 'Pre-operative' | 'Emergency';
  clinicalIndication: string;
  clinicalQuestion?: string;
  
  // Status & Priority
  priority: 'stat' | 'urgent' | 'routine' | 'scheduled';
  status: 'pending' | 'ordered' | 'scheduled' | 'in_progress' | 'completed' | 'interpreted' | 'reported' | 'cancelled';
  
  // Timestamps
  createdBy?: string;
  orderedAt?: string;
  scheduledAt?: string;
  performedAt?: string;
  imagesAvailableAt?: string;
  studyCompletedAt?: string;
  
  // AI Analysis
  aiPriorityScore?: number;
  aiCriticalFlag?: boolean;
  aiPreliminaryReport?: string;
  
  // DICOM
  dicomSeriesCount?: number;
  dicomStoragePath?: string;
  
  // Assignment
  assignedRadiologistId?: number;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  synced: boolean;
}
```

### CouchDB Document Structure

```json
{
  "_id": "radiology:550e8400-e29b-41d4-a716-446655440000",
  "_rev": "2-abc123def456",
  "type": "radiologyStudy",
  "patientCpt": "CPT123",
  "sessionCouchId": "session:abc123",
  "modality": "XRAY",
  "bodyPart": "CHEST",
  "studyType": "Diagnostic",
  "clinicalIndication": "Cough, difficulty breathing",
  "priority": "urgent",
  "status": "ordered",
  "createdBy": "nurse_001",
  "orderedAt": "2026-02-22T10:00:00Z",
  "createdAt": "2026-02-22T10:00:00Z",
  "updatedAt": "2026-02-22T10:00:00Z",
  "synced": false
}
```

### MySQL RadiologyStudy Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | BIGINT | Primary key |
| `couch_id` | VARCHAR(255) | CouchDB document ID (unique) |
| `couch_rev` | VARCHAR(50) | CouchDB revision |
| `couch_updated_at` | TIMESTAMP | Last CouchDB update |
| `study_uuid` | VARCHAR(36) | Human-readable UUID |
| `session_couch_id` | VARCHAR(255) | Link to session |
| `patient_cpt` | VARCHAR(50) | Patient identifier |
| `modality` | VARCHAR(20) | Imaging type |
| `status` | VARCHAR(20) | Study status |
| `raw_document` | JSON | Full CouchDB doc |
| `synced_at` | TIMESTAMP | Last sync time |

---

## Security Implementation

### Encryption Key Management

The radiology service uses the same encryption infrastructure as other clinical data:

```typescript
// Initialize with security store
async initialize(): Promise<void> {
  const securityStore = await import('~/stores/security').then(m => m.useSecurityStore());
  
  // Ensure encryption key exists
  if (!securityStore.encryptionKey) {
    await securityStore.ensureEncryptionKey();
  }
  
  // Initialize secure database with encryption
  const key = securityStore.encryptionKey;
  this.db = getSecureDb(key);
}
```

### Security Flow

```
┌──────────────────┐
│  Security Store  │
│  (encryptionKey) │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────┐
│  getSecureDb()  │────►│  PouchDB     │
│    (key)        │     │  (encrypted) │
└──────────────────┘     └──────────────┘
```

### Authentication Chain

1. **nurse_mobile**: User authenticates via MobileAuthController → gets Sanctum token
2. **API Requests**: Token passed in `Authorization: Bearer <token>` header
3. **CouchProxyController**: Validates token, injects `X-User-ID` header
4. **CouchDB**: Validates credentials (server-side, never exposed to client)

---

## Sync Worker

### CouchSyncWorker.php

The sync worker polls CouchDB for changes and replicates them to MySQL.

```bash
# Run continuously (default 4-second interval)
php artisan sync:couch

# Run once
php artisan sync:couch --once

# Custom interval (in seconds)
php artisan sync:couch --interval=10

# Custom batch size
php artisan sync:couch --limit=50
```

### Conflict Resolution

The sync service implements **last-write-wins** conflict resolution:

```php
protected function syncRadiologyStudy(array $doc): void
{
    $existingStudy = RadiologyStudy::where('couch_id', $doc['_id'])->first();
    
    // Get revision for conflict detection
    $incomingRev = $doc['_rev'] ?? null;
    $existingRev = $existingStudy->couch_rev ?? null;
    
    // Conflict resolution: Last write wins based on updated timestamp
    if ($existingStudy && $incomingRev && $existingRev) {
        $incomingTime = isset($doc['updatedAt']) ? strtotime($doc['updatedAt']) : 0;
        $existingTime = $existingStudy->couch_updated_at ? 
            strtotime($existingStudy->couch_updated_at) : 0;
        
        // Skip if incoming is older
        if ($incomingTime < $existingTime) {
            Log::debug('Skipping older revision');
            return;
        }
    }
    
    // Proceed with upsert
    RadiologyStudy::updateOrCreate(['couch_id' => $doc['_id']], $data);
}
```

### Batch Processing

The worker processes documents in batches:

1. Fetch changes since last sequence (default: 100 docs)
2. Filter by allowed document types
3. Upsert each document to MySQL
4. Update sequence marker
5. Sleep for interval duration
6. Repeat

---

## Integration Points

### Existing Services Used

| Service | Purpose |
|---------|---------|
| **secureDb** | Encrypted PouchDB operations |
| **sync** | Bi-directional sync with CouchDB |
| **CouchDbService** | Server-side CouchDB operations |
| **SyncService** | Document upsert logic |

### SyncService Handler

The SyncService routes documents by type:

```php
public function upsert(array $doc): void
{
    $type = $doc['type'] ?? null;
    
    match ($type) {
        'clinicalPatient' => $this->syncPatient($doc),
        'clinicalSession' => $this->syncSession($doc),
        'clinicalForm' => $this->syncForm($doc),
        'radiologyStudy' => $this->syncRadiologyStudy($doc),  // ← New
        // ...
    };
}
```

---

## Error Handling

### Client-Side (radiologyService.ts)

| Error Type | Handling |
|-----------|----------|
| Network failure | Document saved locally; syncs when online |
| Encryption key missing | Throws error; user must re-authenticate |
| Document not found | Returns null; caller handles |
| Conflict | Skipped if older revision |

### Server-Side (CouchSyncWorker)

| Error Type | Handling |
|-----------|----------|
| CouchDB unavailable | Logs error; continues to next cycle |
| Document sync failure | Logs error; continues processing |
| MySQL error | Logs to laravel.log with document ID |

### Logging

```typescript
// Client-side
console.log('[RadiologyService] Created radiology study:', docId);
console.error('[RadiologyService] Failed to create study:', error);

// Server-side
Log::debug('SyncService: Synced radiology study', [...]);
Log::error('CouchSyncWorker: Document sync failed', [...]);
```

---

## Usage Examples

### Creating a Study After X-Ray Assessment

```typescript
import { radiologyService } from '~/services/radiologyService';

async function onXrayAssessmentComplete(sessionData: any, formData: any) {
  // Create radiology study order
  const study = await radiologyService.createStudy({
    patientCpt: sessionData.patientCpt,
    sessionCouchId: sessionData._id,
    modality: 'XRAY',
    bodyPart: formData.bodyPart || 'CHEST',
    clinicalIndication: formData.clinicalIndication,
    priority: formData.urgent ? 'urgent' : 'routine',
    createdBy: sessionData.userId
  });
  
  console.log('Study ordered:', study._id);
}
```

### Querying Patient's Studies

```typescript
async function getPatientRadiologyHistory(patientCpt: string) {
  const studies = await radiologyService.getStudiesForPatient(patientCpt);
  
  return studies.map(s => ({
    id: s._id,
    date: s.orderedAt,
    modality: s.modality,
    status: s.status,
    critical: s.aiCriticalFlag
  }));
}
```

### Checking Sync Status

```typescript
async function checkDataSync() {
  const status = await radiologyService.getSyncStatus();
  
  if (status.pending > 0) {
    console.log(`${status.pending} studies pending sync`);
    // Show warning to user
  } else {
    console.log('All data synced');
  }
}
```

---

## Configuration

### Environment Variables

#### nurse_mobile (.env)

```env
# API Base URL (Laravel backend)
NUXT_PUBLIC_API_BASE=http://localhost:8000

# Encryption (auto-generated on first run)
NUXT_ENCRYPTION_KEY=base64:abc123...
```

#### healthbridge_core (.env)

```env
# CouchDB Configuration
COUCHDB_HOST=http://localhost:5984
COUCHDB_DATABASE=healthbridge_clinic
COUCHDB_USERNAME=admin
COUCHDB_PASSWORD=your_password

# Sync Worker
SYNC_INTERVAL=4
SYNC_BATCH_SIZE=100
```

### Database Migration

Run the migration to add CouchDB fields:

```bash
php artisan migrate
```

---

## UML Diagrams

### Sequence Diagram: Creating a Study

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Nurse UI   │     │   Radiology  │     │   SecureDB   │     │    CouchDB   │
│              │     │   Service    │     │  (PouchDB)   │     │              │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │                    │
       │ Create Study      │                    │                    │
       │──────────────────►│                    │                    │
       │                    │                    │                    │
       │                    │ Initialize        │                    │
       │                    │──────────────────►│                    │
       │                    │                    │                    │
       │                    │  Create Document  │                    │
       │                    │──────────────────►│                    │
       │                    │                    │                    │
       │                    │   Return + Rev     │                    │
       │                    │◄───────────────────│                    │
       │                    │                    │                    │
       │                    │ Trigger Sync      │                    │
       │                    │────────────────────────────────────────►│
       │                    │                    │   Push to CouchDB │
       │                    │                    │◄─────────────────│
       │                    │                    │                    │
       │   Success Response │                    │                    │
       │◄───────────────────│                    │                    │
       │                    │                    │                    │
```

### Sequence Diagram: Sync Worker

```
┌─────────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CouchSyncWorker   │     │   CouchDB       │     │   SyncService   │     │      MySQL      │
│                     │     │                 │     │                 │     │                 │
└──────────┬──────────┘     └────────┬────────┘     └────────┬────────┘     └────────┬────────┘
           │                         │                        │                        │
           │  Fetch Changes         │                        │                        │
           │──────────────────────►│                        │                        │
           │                         │  _changes?since=123  │                        │
           │◄───────────────────────│                        │                        │
           │                         │                        │                        │
           │  Process Each Doc      │                        │                        │
           │         │               │                        │                        │
           │         ▼               │                        │                        │
           │                         │   upsert(radiology)   │                        │
           │                         │──────────────────────►│                        │
           │                         │                        │                        │
           │                         │                        │  findOrCreate()       │
           │                         │                        │──────────────────────►│
           │                         │                        │                        │
           │                         │                        │    (record created)   │
           │                         │                        │◄──────────────────────│
           │                         │                        │                        │
           │  Update Sequence        │                        │                        │
           │  (save last_seq)       │                        │                        │
           │                         │                        │                        │
           │  Sleep (interval)      │                        │                        │
           │         │               │                        │                        │
           │         ▼               │                        │                        │
```

### Class Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            radiologyService                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│ - db: PouchDB.Database | null                                                │
│ - syncService: SyncService | null                                             │
│ - syncListeners: Set<Function>                                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│ + initialize(): Promise<void>                                                 │
│ + createStudy(options): Promise<RadiologyStudyDoc>                           │
│ + updateStudy(docId, updates): Promise<RadiologyStudyDoc>                    │
│ + getStudy(docId): Promise<RadiologyStudyDoc | null>                        │
│ + getStudiesForPatient(patientCpt): Promise<RadiologyStudyDoc[]>            │
│ + getPendingStudies(): Promise<RadiologyStudyDoc[]>                          │
│ + getSyncStatus(): Promise<SyncStatus>                                       │
│ + markAsSynced(docId, revision): Promise<void>                              │
│ + deleteStudy(docId): Promise<void>                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ uses
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             RadiologyStudyDoc                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│ _id: string                     │ modality: Modality                         │
│ _rev?: string                   │ status: StudyStatus                        │
│ type: 'radiologyStudy'          │ aiCriticalFlag: boolean                    │
│ patientCpt: string             │ ...                                        │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SyncService (Backend)                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│ + upsert(doc): void           │ syncRadiologyStudy(doc): void               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

The Radiology Service implementation provides:

- **Offline-first**: Creates orders locally, syncs when online
- **Encrypted storage**: Uses AES-256 via SecureDB
- **Conflict resolution**: Last-write-wins with revision tracking
- **Automatic sync**: Background worker polls every 4 seconds
- **Full traceability**: Links to patient, session, and user
- **AI integration**: Supports AI triage scores and critical flags

The implementation follows the same patterns as other clinical document types (patients, sessions, forms), ensuring consistency across the HealthBridge platform.
