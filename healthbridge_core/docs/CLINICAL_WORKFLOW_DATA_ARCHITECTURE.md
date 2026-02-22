# HealthBridge Clinical Workflow & Data Architecture

## Overview

This document provides a detailed technical walkthrough of the HealthBridge clinical workflow, from the moment a GP accepts a patient referral through to prescription finalization. It describes the database architecture, data persistence points, and relational integrity mechanisms.

---

## Data Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PATIENT PROFILE                                 │
│  Table: patients                                                             │
│  Primary Key: cpt (CouchDB Patient ID)                                       │
│  Identifier: couch_id (CouchDB Document ID)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Has Many (1:N)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLINICAL SESSION                                    │
│  Table: clinical_sessions                                                    │
│  Primary Key: id                                                             │
│  Identifier: couch_id (CouchDB Document ID)                                  │
│  Foreign Key: patient_cpt → patients.cpt                                     │
│  Workflow States: NEW → TRIAGED → REFERRED → IN_GP_REVIEW → UNDER_TREATMENT │
│                   → CLOSED                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
          │                    │                    │                    │
          │ Has Many           │ Has Many           │ Has Many           │ Has Many
          ▼                    ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ clinical_forms  │  │ referrals       │  │ case_comments   │  │ state_transitions│
│ (Assessment,    │  │                 │  │                 │  │                 │
│  Diagnostics,   │  │                 │  │                 │  │                 │
│  Treatment)     │  │                 │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## Database Tables

### 1. `patients` Table

The central patient registry.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Auto-increment primary key |
| `couch_id` | string | CouchDB document ID (unique) |
| `cpt` | string(20) | Patient CPT identifier (unique) |
| `short_code` | string(10) | Short display code |
| `external_id` | string | External system reference |
| `date_of_birth` | date | Patient DOB |
| `age_months` | integer | Age in months (for pediatric patients) |
| `gender` | enum | male, female, other |
| `weight_kg` | decimal(5,2) | Weight in kilograms |
| `phone` | string(30) | Contact phone |
| `visit_count` | integer | Number of visits |
| `is_active` | boolean | Active status |
| `raw_document` | json | Raw CouchDB document |
| `last_visit_at` | timestamp | Last visit datetime |

**Model:** [`App\Models\Patient`](../app/Models/Patient.php)

---

### 2. `clinical_sessions` Table

Represents a single clinical encounter/consultation.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Auto-increment primary key |
| `couch_id` | string | CouchDB document ID (unique) |
| `session_uuid` | string(50) | Session UUID (unique) |
| `patient_cpt` | string(20) | FK to patients.cpt |
| `stage` | enum | registration, assessment, treatment, discharge |
| `status` | enum | open, completed, archived, referred, cancelled |
| `workflow_state` | string | NEW, TRIAGED, REFERRED, IN_GP_REVIEW, UNDER_TREATMENT, CLOSED |
| `triage_priority` | enum | red, yellow, green, unknown |
| `chief_complaint` | string | Primary complaint |
| `notes` | text | Clinical notes |
| `treatment_plan` | json | Treatment plan data |
| `form_instance_ids` | json | Array of form IDs |
| `session_created_at` | timestamp | Session start time |
| `session_updated_at` | timestamp | Last update time |
| `completed_at` | timestamp | Completion time |
| `synced_at` | timestamp | Last CouchDB sync |

**Model:** [`App\Models\ClinicalSession`](../app/Models/ClinicalSession.php)

---

### 3. `clinical_forms` Table

Stores structured clinical form data (Assessment, Diagnostics, etc.).

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Auto-increment primary key |
| `couch_id` | string | CouchDB document ID (unique) |
| `form_uuid` | string(50) | Form UUID (unique) |
| `session_couch_id` | string | FK to clinical_sessions.couch_id |
| `patient_cpt` | string(20) | FK to patients.cpt |
| `schema_id` | string(50) | Form type identifier |
| `schema_version` | string(20) | Form schema version |
| `status` | enum | draft, completed, submitted, synced, error |
| `answers` | json | Form field values |
| `calculated` | json | Calculated fields |
| `audit_log` | json | Change audit trail |
| `completed_at` | timestamp | Completion time |

**Model:** [`App\Models\ClinicalForm`](../app/Models/ClinicalForm.php)

**Schema IDs:**
- `gp_assessment` - Clinical assessment form
- `gp_diagnostics` - Lab and imaging orders

---

### 4. `referrals` Table

Tracks patient referrals between providers.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Auto-increment primary key |
| `referral_uuid` | string(50) | Referral UUID (unique) |
| `session_couch_id` | string | FK to clinical_sessions.couch_id |
| `referring_user_id` | foreignId | FK to users.id |
| `assigned_to_user_id` | foreignId | FK to users.id |
| `assigned_to_role` | string(50) | Assigned role |
| `status` | enum | pending, accepted, rejected, completed, cancelled |
| `priority` | enum | red, yellow, green |
| `specialty` | string(50) | Target specialty |
| `reason` | text | Referral reason |
| `clinical_notes` | text | Clinical context |
| `accepted_at` | timestamp | Acceptance time |
| `completed_at` | timestamp | Completion time |

**Model:** [`App\Models\Referral`](../app/Models/Referral.php)

---

### 5. `case_comments` Table

Stores case discussion comments.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Auto-increment primary key |
| `session_couch_id` | string | FK to clinical_sessions.couch_id |
| `user_id` | foreignId | FK to users.id |
| `content` | text | Comment text |
| `visibility` | enum | internal, patient_visible |

---

### 6. `state_transitions` Table

Audit trail for workflow state changes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Auto-increment primary key |
| `session_id` | foreignId | FK to clinical_sessions.id |
| `from_state` | string | Previous state |
| `to_state` | string | New state |
| `reason` | string | Transition reason |
| `user_id` | foreignId | FK to users.id |
| `metadata` | json | Additional data |

---

## Clinical Workflow Stages

### Stage 1: Referral Acceptance

**User Action:** GP clicks "Accept" on a referral from the referral queue.

**Route:** `POST /gp/referrals/{couchId}/accept`

**Controller:** `GPDashboardController::acceptReferral()`

**Database Operations:**

| Table | Operation | Fields Updated |
|-------|-----------|----------------|
| `clinical_sessions` | UPDATE | `workflow_state` = 'IN_GP_REVIEW' |
| `referrals` | UPDATE | `status` = 'accepted', `assigned_to_user_id`, `accepted_at` |
| `state_transitions` | INSERT | `session_id`, `from_state`, `to_state`, `user_id`, `reason` |

**Data Linking:**
- `referrals.session_couch_id` → `clinical_sessions.couch_id`
- `clinical_sessions.patient_cpt` → `patients.cpt`

---

### Stage 2: Assessment Tab (Clinical History & Examination)

**User Action:** GP enters chief complaint, history, physical examination, symptoms, and assessment notes.

**Route:** `POST /gp/sessions/{couchId}/assessment`

**Controller:** `ClinicalSessionController::storeAssessment()`

**Database Operations:**

| Table | Operation | Fields |
|-------|-----------|--------|
| `clinical_forms` | INSERT/UPDATE | `couch_id`, `session_couch_id`, `patient_cpt`, `schema_id` = 'gp_assessment', `answers`, `status` = 'completed' |
| `clinical_sessions` | UPDATE | `chief_complaint` (if provided) |

**Data Persisted in `clinical_forms.answers` (JSON):**

```json
{
  "chief_complaint": "Fever and cough for 3 days",
  "history_present_illness": "Started with runny nose...",
  "past_medical_history": "No significant history",
  "allergies": "None known",
  "current_medications": "None",
  "review_of_systems": "...",
  "physical_exam": "Chest: bilateral crackles...",
  "assessment_notes": "Likely pneumonia",
  "symptoms": ["Fever", "Cough", "Difficulty breathing"],
  "exam_findings": ["Chest indrawing", "Wheezing"]
}
```

**Navigation:** Redirects to **Diagnostics Tab** after successful submission.

---

### Stage 3: Diagnostics Tab (Lab & Imaging Orders)

**User Action:** GP selects lab tests and imaging orders.

**Route:** `POST /gp/sessions/{couchId}/diagnostics`

**Controller:** `ClinicalSessionController::storeDiagnostics()`

**Database Operations:**

| Table | Operation | Fields |
|-------|-----------|--------|
| `clinical_forms` | INSERT/UPDATE | `couch_id`, `session_couch_id`, `patient_cpt`, `schema_id` = 'gp_diagnostics', `answers`, `status` = 'completed' |

**Data Persisted in `clinical_forms.answers` (JSON):**

```json
{
  "labs": ["cbc", "malaria", "blood_culture"],
  "imaging": ["chest_xray"],
  "other_lab": "Blood glucose fasting",
  "other_imaging": "",
  "specialist_notes": "Consider pediatric consultation if no improvement"
}
```

**Navigation:** Redirects to **Treatment Tab** after successful submission.

---

### Stage 4: Treatment Tab (Treatment Plan)

**User Action:** GP prescribes medications, IV fluids, oxygen therapy, and determines disposition.

**Route:** `PUT /gp/sessions/{couchId}/treatment-plan`

**Controller:** `ClinicalSessionController::updateTreatmentPlan()`

**Database Operations:**

| Table | Operation | Fields |
|-------|-----------|--------|
| `clinical_sessions` | UPDATE | `treatment_plan` (JSON) |

**Data Persisted in `clinical_sessions.treatment_plan` (JSON):**

```json
{
  "medications": [
    {
      "name": "Amoxicillin",
      "dose": "25-50 mg/kg/day",
      "route": "oral",
      "frequency": "TID",
      "duration": "7 days"
    }
  ],
  "fluids": [
    {
      "type": "Normal Saline",
      "volume": "500ml",
      "rate": "100ml/hr"
    }
  ],
  "oxygenRequired": true,
  "oxygenType": "nasal_cannula",
  "oxygenFlow": "2-4",
  "disposition": "admit",
  "admissionWard": "pediatric",
  "followUpInstructions": "Return in 3 days for review",
  "returnPrecautions": "Return immediately if difficulty breathing worsens"
}
```

**Navigation:** Redirects to **Prescription Tab** after successful submission.

---

### Stage 5: Prescription Tab (Structured Prescription)

**User Action:** GP reviews and finalizes the prescription with dosing calculations.

**Component:** `StructuredPrescription.vue`

**Data Source:** Reads from `clinical_sessions.treatment_plan.medications` and generates printable prescription.

---

## Relational Architecture

### Primary Linking Keys

| Relationship | Foreign Key | References |
|--------------|-------------|------------|
| Patient → Sessions | `clinical_sessions.patient_cpt` | `patients.cpt` |
| Session → Forms | `clinical_forms.session_couch_id` | `clinical_sessions.couch_id` |
| Session → Referrals | `referrals.session_couch_id` | `clinical_sessions.couch_id` |
| Session → Comments | `case_comments.session_couch_id` | `clinical_sessions.couch_id` |
| Session → Transitions | `state_transitions.session_id` | `clinical_sessions.id` |
| Form → Patient | `clinical_forms.patient_cpt` | `patients.cpt` |

### Eager Loading Example

```php
// Get patient with all clinical data
$session = ClinicalSession::with([
    'patient',           // Patient demographics
    'referrals',         // Referral history
    'forms',             // All clinical forms (assessment, diagnostics)
    'comments.user',     // Case comments with authors
    'aiRequests',        // AI assistance requests
    'stateTransitions.user',  // Workflow history
])->where('couch_id', $couchId)->first();
```

---

## Data Integrity Mechanisms

### 1. CouchDB Synchronization

All records have a `couch_id` field for synchronization with CouchDB mobile databases used by frontline health workers.

- **Offline-first:** Data can be created offline on mobile devices
- **Sync:** Changes sync to MySQL when connectivity is available
- **Conflict Resolution:** `raw_document` stores original CouchDB document for reference

### 2. UUID Identifiers

- `session_uuid` - Unique session identifier
- `referral_uuid` - Unique referral identifier
- `form_uuid` - Unique form identifier

These provide globally unique identifiers that work across distributed systems.

### 3. Workflow State Machine

The `WorkflowStateMachine` service enforces valid state transitions:

```php
// Valid transitions
NEW → TRIAGED
TRIAGED → REFERRED
REFERRED → IN_GP_REVIEW
IN_GP_REVIEW → UNDER_TREATMENT
UNDER_TREATMENT → CLOSED
```

Invalid transitions are rejected with appropriate error messages.

### 4. State Transitions Audit Trail

Every workflow state change is recorded in `state_transitions`:

- Who made the change (`user_id`)
- When it happened (`created_at`)
- Why it happened (`reason`)
- Previous and new states (`from_state`, `to_state`)
- Additional metadata (`metadata` JSON)

---

## Navigation Flow Summary

| Tab | Route | Redirects To |
|-----|-------|--------------|
| Assessment | `POST /gp/sessions/{couchId}/assessment` | Diagnostics Tab |
| Diagnostics | `POST /gp/sessions/{couchId}/diagnostics` | Treatment Tab |
| Treatment | `PUT /gp/sessions/{couchId}/treatment-plan` | Prescription Tab |

---

## Form State Persistence

The `ClinicalTabs.vue` component uses `v-show` instead of `v-if` to preserve form state across tab switches. This ensures:

1. **Form data persists** when users switch between tabs
2. **No re-rendering** of components, improving performance
3. **Seamless UX** - users can fill partial data, switch tabs, and return to continue

---

## Related Documentation

- [Architecture High-Level](./ARCHITECTURE_HIGHLEVEL.md)
- [Integration Roadmap](./INTEGRATION_ROADMAP.md)
- [Database Migrations Phase 0](./DATABASE_MIGRATIONS_PHASE0.md)
