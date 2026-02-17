# HealthBridge End-to-End Data Synchronization Testing Guide

**Document Type:** Testing Guide  
**Created:** February 16, 2026  
**Scope:** PouchDB → CouchDB → Laravel → MySQL Data Pipeline  
**Target Workflow:** Patient Registration → Assessment → Red Triage → Treatment → GP Referral → Discharge

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Architecture Reference](#3-architecture-reference)
4. [Test Environment Setup](#4-test-environment-setup)
5. [Clinical Workflow Test Scenario](#5-clinical-workflow-test-scenario)
6. [Step-by-Step Testing Procedures](#6-step-by-step-testing-procedures)
7. [Verification Commands Reference](#7-verification-commands-reference)
8. [Troubleshooting Guide](#8-troubleshooting-guide)
9. [Test Checklist](#9-test-checklist)

---

## 1. Overview

### 1.1 Purpose

This guide provides step-by-step instructions for testing the complete data synchronization pipeline in HealthBridge, from the nurse mobile app (PouchDB) through CouchDB to the Laravel web application (MySQL). It covers verification at each layer to ensure data integrity and proper workflow state transitions.

### 1.2 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           HEALTHBRIDGE SYNC PIPELINE                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  NURSE MOBILE │    │   COUCHDB    │    │   LARAVEL    │    │    MYSQL     │ │
│  │   (PouchDB)   │───▶│  (Source of  │───▶│ Sync Worker  │───▶│   (Mirror)   │ │
│  │               │◀───│    Truth)    │◀───│  (Daemon)    │◀───│              │ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘ │
│        │                    │                    │                    │        │
│        │                    │                    │                    │        │
│   Local DB             Central DB           Sync Layer           Relational   │
│   (IndexedDB)          (HTTP API)           (4s poll)              DB         │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Key Components

| Component | Technology | Role |
|-----------|------------|------|
| PouchDB | Nuxt 4 + IndexedDB | Local offline storage on mobile |
| CouchDB | Apache CouchDB 3.x | Central sync server, source of truth |
| Sync Worker | Laravel Artisan Command | Polls CouchDB `_changes` feed |
| MySQL | MySQL 8.x | Relational mirror for web app |
| Laravel | Laravel 11 + Inertia | Web application backend |

---

## 2. Prerequisites

### 2.1 System Requirements

- **CouchDB 3.x** running on `http://localhost:5984`
- **MySQL 8.x** database configured
- **Laravel 11** application running
- **Nuxt 4** nurse mobile app running
- **Node.js 18+** for mobile app
- **PHP 8.2+** for Laravel

### 2.2 Required Credentials

```env
# CouchDB Configuration (healthbridge_core/.env)
COUCHDB_HOST=http://localhost:5984
COUCHDB_DATABASE=healthbridge
COUCHDB_USERNAME=admin
COUCHDB_PASSWORD=your_password

# MySQL Configuration
DB_HOST=127.0.0.1
DB_DATABASE=healthbridge
DB_USERNAME=healthbridge
DB_PASSWORD=your_password
```

### 2.3 Test User Accounts

Create the following test users before testing:

| Role | Email | Purpose |
|------|-------|---------|
| Nurse | nurse@test.com | Mobile app operations |
| Doctor | doctor@test.com | GP dashboard operations |
| Admin | admin@test.com | System verification |

---

## 3. Architecture Reference

### 3.1 Document Types

The following document types are synchronized:

| Type | CouchDB `type` field | MySQL Table | Description |
|------|---------------------|-------------|-------------|
| Patient | `clinicalPatient` | `patients` | Patient demographics |
| Session | `clinicalSession` | `clinical_sessions` | Clinical encounter |
| Form | `clinicalForm` | `clinical_forms` | Assessment/treatment forms |
| AI Log | `aiLog` | `ai_requests` | AI interaction records |

### 3.2 Workflow States

Session workflow states tracked across systems:

```
registration → assessment → treatment → discharge
     │              │            │           │
     └──────────────┴────────────┴───────────┘
                          │
                    status: open/completed/referred/cancelled
```

### 3.3 Triage Priority Mapping

| Priority | Color | MySQL Value | Condition |
|----------|-------|-------------|-----------|
| Emergency | RED | `red` | Danger signs present |
| Urgent | YELLOW | `yellow` | Fast breathing, chest indrawing |
| Normal | GREEN | `green` | No danger signs |
| Unknown | UNKNOWN | `unknown` | Not yet assessed |

---

## 4. Test Environment Setup

### 4.1 Start All Services

```bash
# 1. Start CouchDB
# Windows: Run CouchDB service
# Linux/Mac: 
sudo systemctl start couchdb

# Verify CouchDB is running
curl http://localhost:5984/_up

# 2. Start MySQL
# Windows: Start MySQL service
# Linux/Mac:
sudo systemctl start mysql

# 3. Start Laravel backend
cd healthbridge_core
php artisan serve

# 4. Start CouchDB Sync Worker (in separate terminal)
cd healthbridge_core
php artisan couchdb:sync --daemon --poll=4

# 5. Start Nurse Mobile App
cd nurse_mobile
npm run dev
```

### 4.2 Verify Database Connections

```bash
# Test CouchDB connection
curl -X GET http://admin:password@localhost:5984/healthbridge

# Test MySQL connection
cd healthbridge_core
php artisan tinker
>>> DB::connection()->getPdo();

# Test CouchDB from Laravel
>>> app(App\Services\CouchDbService::class)->databaseExists();
```

### 4.3 Clear Test Data (Optional)

```bash
# Clear MySQL test data
cd healthbridge_core
php artisan db:wipe --force
php artisan migrate
php artisan db:seed --class=RoleSeeder

# Clear CouchDB database (recreate)
curl -X DELETE http://admin:password@localhost:5984/healthbridge
curl -X PUT http://admin:password@localhost:5984/healthbridge
```

---

## 5. Clinical Workflow Test Scenario

### 5.1 Complete Workflow Under Test

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLINICAL WORKFLOW TEST SCENARIO                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 1: Patient Registration                                               │
│  ───────────────────────────                                                │
│  Nurse registers new patient → PouchDB stores patient document              │
│                                                                             │
│  STEP 2: Clinical Assessment                                                │
│  ───────────────────────────                                                │
│  Nurse performs IMCI assessment → Form created, triage calculated           │
│                                                                             │
│  STEP 3: Red Triage Assignment                                              │
│  ───────────────────────────                                                │
│  Danger signs detected → Triage = RED → Priority escalation                 │
│                                                                             │
│  STEP 4: Treatment Administration                                           │
│  ───────────────────────────                                                │
│  Nurse administers initial treatment → Treatment form completed             │
│                                                                             │
│  STEP 5: GP Referral                                                        │
│  ───────────────────────────                                                │
│  RED case triggers referral → Referral created, doctor assigned             │
│                                                                             │
│  STEP 6: Doctor Review                                                      │
│  ───────────────────────────                                                │
│  Doctor sees referral in queue → Accepts case → Reviews patient             │
│                                                                             │
│  STEP 7: Patient Discharge                                                  │
│  ───────────────────────────                                                │
│  Treatment completed → Session closed → Patient discharged                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Step-by-Step Testing Procedures

### STEP 1: Patient Registration

#### 1.1 Nurse Action (Mobile App)

1. Open nurse mobile app at `http://localhost:3000`
2. Navigate to Dashboard
3. Click "New Patient" button
4. Fill in patient details:
   - First Name: `Test`
   - Last Name: `Patient`
   - Date of Birth: `2024-01-15` (2-year-old)
   - Gender: `male`
   - Weight: `12.5` kg
5. Click "Save"

#### 1.2 Verify PouchDB Storage

**Browser Console (F12):**
```javascript
// Open browser console on mobile app
// Query local PouchDB
const db = window.__HEALTHBRIDGE_DB__;

// Get all patients
db.allDocs({ include_docs: true, startkey: 'patient_', endkey: 'patient_\ufff0' })
  .then(result => console.table(result.rows.map(r => r.doc)));

// Expected output: Patient document with type='clinicalPatient'
```

**Expected Document Structure:**
```json
{
  "_id": "patient_abc123",
  "type": "clinicalPatient",
  "cpt": "P-00001",
  "shortCode": "P-00001",
  "patient": {
    "firstName": "Test",
    "lastName": "Patient",
    "dateOfBirth": "2024-01-15",
    "gender": "male",
    "weightKg": 12.5
  },
  "createdAt": 1739692800000,
  "updatedAt": 1739692800000
}
```

#### 1.3 Verify CouchDB Replication

**CouchDB HTTP API:**
```bash
# Check if patient document exists in CouchDB
curl -X GET "http://admin:password@localhost:5984/healthbridge/patient_abc123"

# Query all patients by type
curl -X GET "http://admin:password@localhost:5984/healthbridge/_all_docs?include_docs=true&startkey=\"patient_\"&endkey=\"patient_\ufff0\""
```

**Expected Response:**
```json
{
  "_id": "patient_abc123",
  "_rev": "1-abc123...",
  "type": "clinicalPatient",
  "cpt": "P-00001",
  ...
}
```

#### 1.4 Verify MySQL Mirror

**Laravel Tinker:**
```php
php artisan tinker

>>> App\Models\Patient::where('cpt', 'P-00001')->first();
=> App\Models\Patient {#1234
     cpt: "P-00001",
     short_code: "P-00001",
     date_of_birth: "2024-01-15",
     gender: "male",
     weight_kg: 12.5,
   }
```

**MySQL Direct Query:**
```sql
SELECT * FROM patients WHERE cpt = 'P-00001';

-- Expected: 1 row with patient data
```

---

### STEP 2: Clinical Assessment

#### 2.1 Nurse Action (Mobile App)

1. From Dashboard, find patient "Test Patient"
2. Click "Start Assessment"
3. Select "Pediatric Respiratory Assessment"
4. Fill in assessment form:
   - **Section 1 - Vital Signs:**
     - Respiratory Rate: `48` breaths/min (elevated)
     - Temperature: `37.5` °C
     - Weight: `12.5` kg
   - **Section 2 - Danger Signs:**
     - Unable to drink: `Yes` ⚠️
     - Convulsions: `No`
     - Lethargic: `Yes` ⚠️
     - Vomiting everything: `No`
   - **Section 3 - Respiratory:**
     - Cough: `Yes`
     - Chest indrawing: `Yes` ⚠️
     - Stridor: `No`
5. Click "Complete Assessment"

#### 2.2 Verify PouchDB Storage

**Browser Console:**
```javascript
// Get clinical session
db.allDocs({ include_docs: true, startkey: 'session_', endkey: 'session_\ufff0' })
  .then(result => console.table(result.rows.map(r => ({
    id: r.id,
    stage: r.doc.stage,
    triage: r.doc.triage,
    status: r.doc.status
  }))));

// Get clinical form
db.allDocs({ include_docs: true, startkey: 'form_', endkey: 'form_\ufff0' })
  .then(result => console.table(result.rows.map(r => ({
    id: r.id,
    schemaId: r.doc.schemaId,
    status: r.doc.status,
    triagePriority: r.doc.calculated?.triagePriority
  }))));
```

**Expected Session Document:**
```json
{
  "_id": "session_xyz789",
  "type": "clinicalSession",
  "patientCpt": "P-00001",
  "stage": "assessment",
  "status": "open",
  "triage": "red",
  "formInstanceIds": ["form_def456"],
  "createdAt": 1739693100000,
  "updatedAt": 1739693400000
}
```

**Expected Form Document:**
```json
{
  "_id": "form_def456",
  "type": "clinicalForm",
  "sessionId": "session_xyz789",
  "patientId": "P-00001",
  "schemaId": "peds-respiratory-v1",
  "status": "completed",
  "calculated": {
    "triagePriority": "red",
    "matchedTriageRule": {
      "id": "danger-signs-present",
      "priority": "red",
      "actions": ["Immediate referral", "Oxygen if available"]
    },
    "ruleMatches": [
      { "ruleId": "unable-to-drink", "condition": "unableToDrink === true", "matched": true },
      { "ruleId": "lethargic", "condition": "lethargic === true", "matched": true }
    ]
  }
}
```

#### 2.3 Verify CouchDB Replication

```bash
# Check session document
curl -X GET "http://admin:password@localhost:5984/healthbridge/session_xyz789"

# Check form document
curl -X GET "http://admin:password@localhost:5984/healthbridge/form_def456"

# Verify triage priority
curl -X GET "http://admin:password@localhost:5984/healthbridge/session_xyz789" | jq '.triage'
# Expected: "red"
```

#### 2.4 Verify MySQL Mirror

```php
php artisan tinker

// Check clinical session
>>> $session = App\Models\ClinicalSession::where('patient_cpt', 'P-00001')->first();
>>> $session->stage;
=> "assessment"
>>> $session->triage_priority;
=> "red"
>>> $session->status;
=> "open"

// Check clinical form
>>> $form = App\Models\ClinicalForm::where('patient_cpt', 'P-00001')->first();
>>> $form->status;
=> "completed"
>>> $form->calculated['triagePriority'];
=> "red"
```

---

### STEP 3: Red Triage Verification

#### 3.1 Verify Triage Logic

**Browser Console:**
```javascript
// Check calculated triage
db.get('form_def456').then(doc => {
  console.log('Triage Priority:', doc.calculated.triagePriority);
  console.log('Matched Rules:', doc.calculated.ruleMatches);
  console.log('Actions:', doc.calculated.matchedTriageRule.actions);
});

// Expected output:
// Triage Priority: red
// Matched Rules: [{ruleId: "unable-to-drink", matched: true}, ...]
// Actions: ["Immediate referral", "Oxygen if available"]
```

#### 3.2 Verify Session Triage Update

```bash
# CouchDB session should have triage = red
curl -s "http://admin:password@localhost:5984/healthbridge/session_xyz789" | jq '{
  id: ._id,
  stage: .stage,
  triage: .triage,
  status: .status
}'

# Expected:
# {
#   "id": "session_xyz789",
#   "stage": "assessment",
#   "triage": "red",
#   "status": "open"
# }
```

#### 3.3 Verify MySQL Triage

```sql
SELECT 
  session_uuid,
  triage_priority,
  stage,
  status
FROM clinical_sessions 
WHERE patient_cpt = 'P-00001';

-- Expected: triage_priority = 'red'
```

---

### STEP 4: Treatment Administration

#### 4.1 Nurse Action (Mobile App)

1. After assessment completion, click "Continue to Treatment"
2. Treatment form opens with pre-filled data from assessment
3. Fill in treatment details:
   - **Medications:**
     - Amoxicillin: `250mg` - `3 times daily` - `5 days`
     - Paracetamol: `125mg` - `as needed` - `fever`
   - **Procedures:**
     - Oxygen therapy: `Yes` - `2 L/min`
     - IV fluids: `No`
   - **Education:**
     - Return precautions explained: `Yes`
     - Medication instructions given: `Yes`
4. Click "Complete Treatment"

#### 4.2 Verify PouchDB Storage

**Browser Console:**
```javascript
// Check session stage progression
db.get('session_xyz789').then(doc => {
  console.log('Stage:', doc.stage);
  console.log('Status:', doc.status);
  // Expected: stage = 'treatment', status = 'open'
});

// Check treatment form
db.allDocs({ 
  include_docs: true, 
  startkey: 'form_treatment_', 
  endkey: 'form_treatment_\ufff0' 
}).then(result => console.table(result.rows.map(r => r.doc)));
```

#### 4.3 Verify CouchDB Replication

```bash
# Check session stage
curl -s "http://admin:password@localhost:5984/healthbridge/session_xyz789" | jq '.stage'
# Expected: "treatment"

# Check treatment form exists
curl -s "http://admin:password@localhost:5984/healthbridge/_all_docs?include_docs=true&startkey=\"form_treatment_\"&endkey=\"form_treatment_\ufff0\"" | jq '.rows[].doc.schemaId'
# Expected: "treatment-v1" or similar
```

#### 4.4 Verify MySQL Mirror

```php
php artisan tinker

>>> $session = App\Models\ClinicalSession::where('patient_cpt', 'P-00001')->first();
>>> $session->stage;
=> "treatment"

>>> $session->form_instance_ids;
=> ["form_def456", "form_treatment_ghi789"]
```

---

### STEP 5: GP Referral

#### 5.1 Nurse Action (Mobile App)

1. After treatment completion, click "Refer to GP"
2. Select referral reason: `RED case - requires specialist review`
3. Add clinical notes: `Patient showing danger signs, requires immediate GP evaluation`
4. Select specialty: `General Practitioner`
5. Click "Submit Referral"

#### 5.2 Verify PouchDB Storage

**Browser Console:**
```javascript
// Check referral document
db.allDocs({ 
  include_docs: true, 
  startkey: 'referral_', 
  endkey: 'referral_\ufff0' 
}).then(result => console.table(result.rows.map(r => ({
  id: r.id,
  sessionId: r.doc.sessionId,
  status: r.doc.status,
  priority: r.doc.priority,
  specialty: r.doc.specialty
}))));
```

**Expected Referral Document:**
```json
{
  "_id": "referral_ref123",
  "type": "referral",
  "sessionId": "session_xyz789",
  "patientCpt": "P-00001",
  "status": "pending",
  "priority": "red",
  "specialty": "General Practitioner",
  "reason": "RED case - requires specialist review",
  "clinicalNotes": "Patient showing danger signs...",
  "createdAt": 1739694000000
}
```

#### 5.3 Verify CouchDB Replication

```bash
# Check referral exists
curl -s "http://admin:password@localhost:5984/healthbridge/referral_ref123" | jq '{
  id: ._id,
  status: .status,
  priority: .priority,
  specialty: .specialty
}'

# Expected:
# {
#   "id": "referral_ref123",
#   "status": "pending",
#   "priority": "red",
#   "specialty": "General Practitioner"
# }
```

#### 5.4 Verify MySQL Mirror

```php
php artisan tinker

>>> $referral = App\Models\Referral::where('priority', 'red')->first();
>>> $referral->status;
=> "pending"
>>> $referral->specialty;
=> "General Practitioner"
>>> $referral->session->patient_cpt;
=> "P-00001"
```

#### 5.5 Verify Session Workflow State

```php
php artisan tinker

>>> $session = App\Models\ClinicalSession::where('patient_cpt', 'P-00001')->first();
>>> $session->workflow_state;
=> "referred"  // or WORKFLOW_REFERRED constant value
>>> $session->status;
=> "referred"
```

---

### STEP 6: Doctor Review

#### 6.1 Doctor Action (Web App)

1. Open Laravel web app at `http://localhost:8000`
2. Login as doctor: `doctor@test.com`
3. Navigate to GP Dashboard
4. Verify patient appears in "Pending Referrals" queue
5. Click on patient row to open workspace
6. Review patient details, assessment, and treatment
7. Click "Accept Case"
8. Add case notes if needed
9. Click "Start Review"

#### 6.2 Verify GP Dashboard Display

**Laravel Tinker:**
```php
php artisan tinker

// Check referral queue for doctor
>>> $doctor = App\Models\User::where('email', 'doctor@test.com')->first();
>>> App\Models\Referral::where('assigned_to_user_id', $doctor->id)
...     ->where('status', 'pending')->count();
=> 1

// Check session workflow state
>>> $session = App\Models\ClinicalSession::where('patient_cpt', 'P-00001')->first();
>>> $session->workflow_state;
=> "in_gp_review"
```

#### 6.3 Verify Real-time Notification

**Check Laravel Logs:**
```bash
tail -f healthbridge_core/storage/logs/laravel.log | grep -i referral
```

**Expected Log Entry:**
```
[2026-02-16 10:30:15] production.INFO: Referral created {"referral_id":"referral_ref123","session_id":"session_xyz789","priority":"red"}
```

#### 6.4 Verify Doctor Can Access Patient Data

**MySQL Queries:**
```sql
-- Verify doctor can see referral
SELECT r.*, cs.triage_priority, p.date_of_birth
FROM referrals r
JOIN clinical_sessions cs ON r.session_couch_id = cs.couch_id
JOIN patients p ON cs.patient_cpt = p.cpt
WHERE r.status = 'pending' AND r.priority = 'red';

-- Verify clinical forms are accessible
SELECT cf.*, cs.triage_priority
FROM clinical_forms cf
JOIN clinical_sessions cs ON cf.session_couch_id = cs.couch_id
WHERE cs.patient_cpt = 'P-00001';
```

---

### STEP 7: Patient Discharge

#### 7.1 Doctor Action (Web App)

1. In patient workspace, click "Complete Treatment"
2. Fill in discharge summary:
   - Diagnosis: `Severe Pneumonia`
   - Treatment Given: `Amoxicillin 250mg TDS x 5 days, Oxygen therapy`
   - Outcome: `Improved`
   - Follow-up: `Clinic review in 3 days`
3. Click "Discharge Patient"

#### 7.2 Verify Session Closure

**Laravel Tinker:**
```php
php artisan tinker

>>> $session = App\Models\ClinicalSession::where('patient_cpt', 'P-00001')->first();
>>> $session->workflow_state;
=> "closed"
>>> $session->status;
=> "completed"
>>> $session->stage;
=> "discharge"
```

#### 7.3 Verify Referral Completion

```php
php artisan tinker

>>> $referral = App\Models\Referral::where('session_couch_id', $session->couch_id)->first();
>>> $referral->status;
=> "completed"
>>> $referral->completed_at->format('Y-m-d');
=> "2026-02-16"
```

#### 7.4 Verify Complete Audit Trail

**MySQL Query:**
```sql
-- Get complete patient journey
SELECT 
  'Patient Registration' as step,
  p.created_at as timestamp
FROM patients p
WHERE p.cpt = 'P-00001'

UNION ALL

SELECT 
  CONCAT('Session: ', cs.stage, ' (', cs.status, ')') as step,
  cs.session_created_at as timestamp
FROM clinical_sessions cs
WHERE cs.patient_cpt = 'P-00001'

UNION ALL

SELECT 
  CONCAT('Form: ', cf.schema_id, ' - ', cf.status) as step,
  cf.form_created_at as timestamp
FROM clinical_forms cf
WHERE cf.patient_cpt = 'P-00001'

UNION ALL

SELECT 
  CONCAT('Referral: ', r.status) as step,
  r.created_at as timestamp
FROM referrals r
JOIN clinical_sessions cs ON r.session_couch_id = cs.couch_id
WHERE cs.patient_cpt = 'P-00001'

ORDER BY timestamp;
```

---

## 7. Verification Commands Reference

### 7.1 PouchDB Verification (Mobile App)

```javascript
// Open browser console on mobile app (F12)

// Get database instance
const db = window.__HEALTHBRIDGE_DB__;

// List all documents
db.allDocs({ include_docs: true }).then(r => console.table(r.rows));

// Get documents by type
db.query('main/by_type', { key: 'clinicalSession', include_docs: true })
  .then(r => console.table(r.rows));

// Check sync status
console.log(window.__HEALTHBRIDGE_SYNC_STATUS__);

// Force sync
window.__HEALTHBRIDGE_SYNC__();
```

### 7.2 CouchDB Verification

```bash
# Database info
curl -s "http://admin:password@localhost:5984/healthbridge" | jq

# All documents
curl -s "http://admin:password@localhost:5984/healthbridge/_all_docs?include_docs=true" | jq

# Changes feed
curl -s "http://admin:password@localhost:5984/healthbridge/_changes?include_docs=true" | jq

# Specific document
curl -s "http://admin:password@localhost:5984/healthbridge/DOCUMENT_ID" | jq

# Query by type (requires view)
curl -s "http://admin:password@localhost:5984/healthbridge/_design/main/_view/by_type?key=\"clinicalSession\"" | jq

# Check last sequence
curl -s "http://admin:password@localhost:5984/healthbridge/_changes?limit=0" | jq '.last_seq'
```

### 7.3 Laravel Sync Worker Verification

```bash
# Check sync worker status
cd healthbridge_core
php artisan couchdb:sync

# Run continuous sync
php artisan couchdb:sync --daemon --poll=4

# Check sync logs
tail -f storage/logs/laravel.log | grep -i sync

# Reset sync sequence (re-sync all)
php artisan tinker
>>> Cache::forget('couchdb_sync_sequence');
```

### 7.4 MySQL Verification

```sql
-- Check patients
SELECT * FROM patients ORDER BY created_at DESC LIMIT 10;

-- Check sessions with patient info
SELECT 
  cs.*,
  p.date_of_birth,
  p.gender
FROM clinical_sessions cs
LEFT JOIN patients p ON cs.patient_cpt = p.cpt
ORDER BY cs.session_created_at DESC;

-- Check forms with session info
SELECT 
  cf.form_uuid,
  cf.schema_id,
  cf.status,
  cs.triage_priority,
  cs.stage
FROM clinical_forms cf
LEFT JOIN clinical_sessions cs ON cf.session_couch_id = cs.couch_id
ORDER BY cf.form_created_at DESC;

-- Check referrals
SELECT 
  r.*,
  cs.triage_priority,
  u.name as assigned_to_name
FROM referrals r
LEFT JOIN clinical_sessions cs ON r.session_couch_id = cs.couch_id
LEFT JOIN users u ON r.assigned_to_user_id = u.id
ORDER BY r.created_at DESC;

-- Check sync status
SELECT 
  couch_id,
  synced_at,
  TIMESTAMPDIFF(SECOND, synced_at, NOW()) as seconds_since_sync
FROM clinical_sessions
ORDER BY synced_at DESC
LIMIT 10;
```

### 7.5 End-to-End Latency Test

```bash
# Run this script to measure sync latency
cat << 'EOF' > /tmp/sync_latency_test.sh
#!/bin/bash

# Create test document in CouchDB
echo "Creating test document..."
TEST_ID="test_$(date +%s)"
curl -X PUT "http://admin:password@localhost:5984/healthbridge/$TEST_ID" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"test\",\"createdAt\":$(date +%s%3N)}"

START_TIME=$(date +%s%3N)
echo "Start time: $START_TIME"

# Poll MySQL for document
echo "Waiting for sync to MySQL..."
for i in {1..30}; do
  RESULT=$(mysql -u healthbridge -pyour_password healthbridge -se \
    "SELECT COUNT(*) FROM clinical_sessions WHERE couch_id='$TEST_ID'" 2>/dev/null)
  
  if [ "$RESULT" -gt 0 ]; then
    END_TIME=$(date +%s%3N)
    LATENCY=$((END_TIME - START_TIME))
    echo "✓ Document synced in ${LATENCY}ms"
    
    # Cleanup
    curl -X DELETE "http://admin:password@localhost:5984/healthbridge/$TEST_ID?rev=$(curl -s http://admin:password@localhost:5984/healthbridge/$TEST_ID | jq -r '._rev')"
    exit 0
  fi
  
  sleep 1
done

echo "✗ Sync timeout after 30 seconds"
exit 1
EOF

chmod +x /tmp/sync_latency_test.sh
/tmp/sync_latency_test.sh
```

---

## 8. Troubleshooting Guide

### 8.1 PouchDB → CouchDB Sync Issues

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| Documents not syncing | Network offline | Check `navigator.onLine` in browser console |
| Sync errors in console | CORS issues | Verify CouchDB CORS configuration |
| Conflict errors | Multiple device edits | Check conflict resolution in `syncManager.ts` |
| Documents stuck in pending | CouchDB unreachable | Verify CouchDB URL and credentials |

**Debug Commands:**
```javascript
// Browser console
navigator.onLine  // Should be true

// Check sync status
window.__HEALTHBRIDGE_SYNC_STATUS__

// Force push
window.__HEALTHBRIDGE_PUSH__()

// Check for conflicts
db.query('main/conflicts', { include_docs: true })
```

### 8.2 CouchDB → MySQL Sync Issues

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| MySQL not updating | Sync worker not running | Start `php artisan couchdb:sync --daemon` |
| Missing documents | Sequence cache issue | Reset sequence: `Cache::forget('couchdb_sync_sequence')` |
| Field mapping errors | Document type mismatch | Check `SyncService.php` mapping logic |
| Duplicate key errors | Race condition | Use `updateOrCreate` instead of `create` |

**Debug Commands:**
```bash
# Check sync worker logs
tail -f healthbridge_core/storage/logs/laravel.log | grep -i "SyncService"

# Manual sync test
cd healthbridge_core
php artisan tinker
>>> $couch = app(App\Services\CouchDbService::class);
>>> $changes = $couch->getChanges('0', ['limit' => 10]);
>>> print_r($changes);

# Check sequence position
>>> Cache::get('couchdb_sync_sequence');
```

### 8.3 GP Dashboard Issues

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| Referrals not showing | Workflow state not set | Check `workflow_state` field in session |
| Patient data missing | Patient not synced | Verify patient in `patients` table |
| Accept button not working | Permission issue | Check user has `doctor` role |
| Real-time updates not working | WebSocket not connected | Check Laravel Reverb configuration |

**Debug Commands:**
```php
php artisan tinker

// Check user roles
>>> $user = App\Models\User::where('email', 'doctor@test.com')->first();
>>> $user->roles->pluck('name');

// Check referral visibility
>>> App\Models\Referral::with('session.patient')->pending()->get();

// Check workflow states
>>> App\Models\ClinicalSession::select('workflow_state', DB::raw('count(*)'))
...     ->groupBy('workflow_state')->get();
```

---

## 9. Test Checklist

### Pre-Test Checklist

- [ ] CouchDB running and accessible
- [ ] MySQL database connected
- [ ] Laravel application running
- [ ] Sync worker started (`php artisan couchdb:sync --daemon`)
- [ ] Nurse mobile app running
- [ ] Test users created (nurse, doctor, admin)

### Step-by-Step Verification Checklist

#### STEP 1: Patient Registration
- [ ] Patient created in PouchDB (browser console check)
- [ ] Patient synced to CouchDB (curl check)
- [ ] Patient mirrored to MySQL (tinker/query check)
- [ ] Patient visible in mobile app dashboard

#### STEP 2: Clinical Assessment
- [ ] Session created in PouchDB
- [ ] Form instance created in PouchDB
- [ ] Triage calculated correctly (RED for danger signs)
- [ ] Session synced to CouchDB with triage
- [ ] Form synced to CouchDB with calculated values
- [ ] Session mirrored to MySQL with correct triage_priority
- [ ] Form mirrored to MySQL with calculated JSON

#### STEP 3: Red Triage Verification
- [ ] Triage priority = 'red' in PouchDB
- [ ] Triage priority = 'red' in CouchDB
- [ ] Triage priority = 'red' in MySQL
- [ ] Matched rules stored correctly

#### STEP 4: Treatment Administration
- [ ] Treatment form created in PouchDB
- [ ] Session stage = 'treatment' in PouchDB
- [ ] Treatment form synced to CouchDB
- [ ] Session stage updated in MySQL
- [ ] Treatment form visible in MySQL

#### STEP 5: GP Referral
- [ ] Referral created in PouchDB
- [ ] Referral synced to CouchDB
- [ ] Referral mirrored to MySQL
- [ ] Session workflow_state = 'referred'
- [ ] Session status = 'referred'

#### STEP 6: Doctor Review
- [ ] Doctor can login to web app
- [ ] Patient appears in GP Dashboard referral queue
- [ ] Doctor can view patient details
- [ ] Doctor can view assessment form
- [ ] Doctor can view treatment form
- [ ] Doctor can accept case
- [ ] Session workflow_state = 'in_gp_review'

#### STEP 7: Patient Discharge
- [ ] Doctor can complete treatment
- [ ] Session workflow_state = 'closed'
- [ ] Session status = 'completed'
- [ ] Session stage = 'discharge'
- [ ] Referral status = 'completed'
- [ ] Complete audit trail available

### Performance Benchmarks

| Metric | Target | Actual |
|--------|--------|--------|
| PouchDB → CouchDB sync | < 2 seconds | _____ |
| CouchDB → MySQL sync | < 4 seconds | _____ |
| Total end-to-end latency | < 6 seconds | _____ |
| GP Dashboard load time | < 1 second | _____ |
| Referral notification | < 5 seconds | _____ |

---

## Appendix A: Test Data Generator

```php
// Laravel Tinker script to generate test data
php artisan tinker

>>> $patient = App\Models\Patient::create([
...     'cpt' => 'TEST-' . rand(1000, 9999),
...     'date_of_birth' => '2024-01-15',
...     'gender' => 'male',
...     'weight_kg' => 12.5,
... ]);

>>> $session = App\Models\ClinicalSession::create([
...     'couch_id' => 'session_test_' . time(),
...     'session_uuid' => 'sess_' . Str::random(8),
...     'patient_cpt' => $patient->cpt,
...     'stage' => 'assessment',
...     'status' => 'open',
...     'triage_priority' => 'red',
...     'workflow_state' => 'referred',
... ]);

>>> $referral = App\Models\Referral::create([
...     'referral_uuid' => 'ref_' . Str::random(8),
...     'session_couch_id' => $session->couch_id,
...     'status' => 'pending',
...     'priority' => 'red',
...     'specialty' => 'General Practitioner',
... ]);
```

---

## Appendix B: CouchDB View Setup

```javascript
// Create design document for views
// PUT http://admin:password@localhost:5984/healthbridge/_design/main

{
  "_id": "_design/main",
  "views": {
    "by_type": {
      "map": "function(doc) { if (doc.type) emit(doc.type, doc); }"
    },
    "by_session": {
      "map": "function(doc) { if (doc.sessionId) emit(doc.sessionId, doc); }"
    },
    "pending_referrals": {
      "map": "function(doc) { if (doc.type === 'referral' && doc.status === 'pending') emit([doc.priority, doc.createdAt], doc); }"
    },
    "conflicts": {
      "map": "function(doc) { if (doc._conflicts) emit(doc._id, doc._conflicts); }"
    }
  }
}
```

---

**Document Version:** 1.0  
**Last Updated:** February 16, 2026  
**Author:** HealthBridge Development Team
