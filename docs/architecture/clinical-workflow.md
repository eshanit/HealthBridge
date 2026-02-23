# UtanoBridge Clinical Workflow Architecture

**Version:** 1.0  
**Last Updated:** February 2026  
**Status:** Authoritative Reference

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Architecture](#2-data-architecture)
3. [Workflow Stages](#3-workflow-stages)
4. [Session Lifecycle](#4-session-lifecycle)
5. [Patient Identity System](#5-patient-identity-system)
6. [Radiology Integration](#6-radiology-integration)
7. [Database Schema](#7-database-schema)

---

## 1. Overview

UtanoBridge clinical workflow is designed around **session-based patient encounters** that progress through defined stages from registration to discharge. The system supports WHO IMCI (Integrated Management of Childhood Illness) protocols for pediatric patients.

### Core Principles

1. **Session-Centric**: Every patient interaction is captured as a clinical session
2. **Stage-Based Workflow**: Clear progression through registration → assessment → treatment → discharge
3. **Triage-Driven**: Color-coded priority system (red/yellow/green) guides urgency
4. **Offline-First**: Full functionality without network connectivity
5. **Audit Complete**: Every action logged for compliance and quality improvement

---

## 2. Data Architecture

### Entity Relationship Diagram

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

### Primary Linking Keys

| Relationship | Foreign Key | References |
|--------------|-------------|------------|
| Patient → Sessions | `clinical_sessions.patient_cpt` | `patients.cpt` |
| Session → Forms | `clinical_forms.session_couch_id` | `clinical_sessions.couch_id` |
| Session → Referrals | `referrals.session_couch_id` | `clinical_sessions.couch_id` |
| Session → Comments | `case_comments.session_couch_id` | `clinical_sessions.couch_id` |
| Session → Transitions | `state_transitions.session_id` | `clinical_sessions.id` |
| Form → Patient | `clinical_forms.patient_cpt` | `patients.cpt` |

---

## 3. Workflow Stages

### Stage Overview

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  REGISTRATION │───▶│  ASSESSMENT  │───▶│  TREATMENT   │───▶│  DISCHARGE   │
│              │    │              │    │              │    │              │
│ • Patient ID │    │ • Vitals     │    │ • Medications│    │ • Summary    │
│ • Demographics│   │ • Symptoms   │    │ • Referrals  │    │ • Follow-up  │
│ • Chief      │    │ • IMCI Class │    │ • Prescripts │    │ • Education  │
│   Complaint  │    │ • Triage     │    │ • Orders     │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### Stage 1: Registration

**User Action:** Nurse registers a new patient or looks up returning patient.

**Database Operations:**

| Table | Operation | Fields |
|-------|-----------|--------|
| `patients` | INSERT/UPDATE | `cpt`, `date_of_birth`, `gender`, `weight_kg` |
| `clinical_sessions` | INSERT | `session_uuid`, `patient_cpt`, `stage='registration'`, `status='open'` |

**Data Persisted:**
```json
{
  "patient": {
    "cpt": "AB12",
    "dateOfBirth": "2024-01-15",
    "gender": "male",
    "weightKg": 12.5
  },
  "session": {
    "id": "session_8F2A9",
    "patientCpt": "AB12",
    "stage": "registration",
    "status": "open"
  }
}
```

### Stage 2: Assessment

**User Action:** Nurse enters vitals, symptoms, and clinical findings.

**Database Operations:**

| Table | Operation | Fields |
|-------|-----------|--------|
| `clinical_forms` | INSERT | `schema_id='peds_respiratory'`, `answers`, `calculated` |
| `clinical_sessions` | UPDATE | `triage_priority`, `stage='assessment'` |

**Data Persisted in `clinical_forms.answers`:**
```json
{
  "chief_complaint": "Fever and cough for 3 days",
  "respiratory_rate": 48,
  "chest_indrawing": true,
  "danger_sign_unable_drink": false,
  "danger_sign_convulsions": false,
  "oxygen_saturation": 94,
  "temperature": 38.5
}
```

**Calculated Fields:**
```json
{
  "fast_breathing": true,
  "has_danger_sign": false,
  "triagePriority": "yellow",
  "triageScore": 65
}
```

### Stage 3: Treatment

**User Action:** GP/Doctor prescribes medications, orders tests, creates referrals.

**Database Operations:**

| Table | Operation | Fields |
|-------|-----------|--------|
| `clinical_sessions` | UPDATE | `treatment_plan`, `stage='treatment'` |
| `prescriptions` | INSERT | Medications with dosing |
| `referrals` | INSERT | If referral needed |

**Treatment Plan Data:**
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
  "admissionWard": "pediatric"
}
```

### Stage 4: Discharge

**User Action:** Clinician finalizes encounter, generates summary.

**Database Operations:**

| Table | Operation | Fields |
|-------|-----------|--------|
| `clinical_sessions` | UPDATE | `status='completed'`, `completed_at`, `stage='discharge'` |
| `stored_reports` | INSERT | Discharge summary document |

---

## 4. Session Lifecycle

### Workflow State Machine

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌────────────────┐     ┌────────┐
│   NEW   │────▶│ TRIAGED  │────▶│ REFERRED │────▶│ IN_GP_REVIEW │────▶│ UNDER_TREATMENT│────▶│ CLOSED │
└─────────┘     └──────────┘     └──────────┘     └──────────────┘     └────────────────┘     └────────┘
     │               │                │                    │                     │                  │
     │               │                │                    │                     │                  │
     └───────────────┴────────────────┴────────────────────┴─────────────────────┴──────────────────┘
                                                              CANCELLED
```

### Valid State Transitions

| From State | Allowed Transitions |
|------------|---------------------|
| `NEW` | `TRIAGED`, `CANCELLED` |
| `TRIAGED` | `REFERRED`, `CANCELLED` |
| `REFERRED` | `IN_GP_REVIEW`, `CANCELLED` |
| `IN_GP_REVIEW` | `UNDER_TREATMENT`, `REFERRED`, `CANCELLED` |
| `UNDER_TREATMENT` | `CLOSED`, `CANCELLED` |
| `CLOSED` | None (terminal state) |
| `CANCELLED` | None (terminal state) |

### State Transition Service

```php
// app/Services/WorkflowStateMachine.php

class WorkflowStateMachine
{
    private array $allowedTransitions = [
        'NEW' => ['TRIAGED', 'CANCELLED'],
        'TRIAGED' => ['REFERRED', 'CANCELLED'],
        'REFERRED' => ['IN_GP_REVIEW', 'CANCELLED'],
        'IN_GP_REVIEW' => ['UNDER_TREATMENT', 'REFERRED', 'CANCELLED'],
        'UNDER_TREATMENT' => ['CLOSED', 'CANCELLED'],
        'CLOSED' => [],
        'CANCELLED' => [],
    ];
    
    public function canTransition(string $from, string $to): bool
    {
        return in_array($to, $this->allowedTransitions[$from] ?? []);
    }
    
    public function transition(
        ClinicalSession $session,
        string $newState,
        User $user,
        string $reason
    ): StateTransition {
        if (!$this->canTransition($session->workflow_state, $newState)) {
            throw new InvalidTransitionException(
                "Cannot transition from {$session->workflow_state} to {$newState}"
            );
        }
        
        $transition = StateTransition::create([
            'session_id' => $session->id,
            'from_state' => $session->workflow_state,
            'to_state' => $newState,
            'user_id' => $user->id,
            'reason' => $reason,
        ]);
        
        $session->update(['workflow_state' => $newState]);
        
        return $transition;
    }
}
```

---

## 5. Patient Identity System

### CPT (Clinical Patient Token) Format

UtanoBridge uses a **4-character patient identifier** designed for rapid manual entry in busy clinical environments.

**Format Specification:**
- **Length**: Exactly 4 characters
- **Case**: Uppercase (system auto-converts)
- **Character Set**: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`

**Excluded Characters** (to avoid confusion):
- `I` - looks like `1` and `l`
- `O` - looks like `0`
- `0` - looks like `O`
- `1` - looks like `I` and `l`

**Total Combinations**: 32^4 = 1,048,576 possible CPTs

### CPT Generation Service

```typescript
// services/cptService.ts

const PERMITTED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCpt(): string {
  const chars = PERMITTED_CHARS;
  const length = 4;
  
  const result = Array.from({ length }, () => {
    const randomIndex = Math.floor(Math.random() * chars.length);
    return chars[randomIndex];
  });
  
  return result.join('');
}

export async function generateUniqueCpt(
  existsFn: (cpt: string) => Promise<boolean>,
  maxRetries: number = 10
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const candidate = generateCpt();
    const exists = await existsFn(candidate);
    
    if (!exists) {
      return candidate;
    }
  }
  
  throw new Error('Failed to generate unique CPT after maximum retry attempts');
}
```

### Validation Rules

| Rule | Description |
|------|-------------|
| **Length** | Exactly 4 characters |
| **Case** | Auto-converted to uppercase |
| **Characters** | Only A-Z (excluding I,O) and 2-9 (excluding 0,1) |
| **Whitespace** | Trimmed and ignored |
| **Format** | Pure alphanumeric - no dashes or separators |

### Patient Lookup Flow

```
Enter CPT (manual entry)
      │
      ▼
validateShortCPTFormat(cpt)
      │
      ▼
getPatient(cpt)
      │
      ├──── Patient Found ────▶ Create new session
      │                              │
      │                              ▼
      │                         Attach patient CPT
      │                              │
      │                              ▼
      │                         Skip registration
      │                              │
      │                              ▼
      │                         Go to assessment
      │
      └──── Patient Not Found ────▶ Register new patient
                                       │
                                       ▼
                                  Generate new CPT
```

---

## 6. Radiology Integration

### Radiology Study Workflow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   ORDERED    │───▶│  SCHEDULED   │───▶│ IN_PROGRESS  │───▶│  COMPLETED   │───▶│  REPORTED    │
│              │    │              │    │              │    │              │    │              │
│ Study        │    │ Appointment  │    │ Images       │    │ Images       │    │ Report       │
│ requested    │    │ scheduled    │    │ being taken  │    │ uploaded     │    │ finalized    │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### RadiologyStudy Model

```php
class RadiologyStudy extends Model
{
    protected $fillable = [
        'study_uuid',
        'patient_cpt',
        'modality',          // CT, MRI, XRAY, ULTRASOUND, etc.
        'body_part',         // Chest, Abdomen, Head, etc.
        'study_type',        // Protocol or study type
        'priority',          // stat, urgent, routine, scheduled
        'status',            // pending, ordered, in_progress, completed, reported
        'clinical_indication',
        'ordered_at',
        'images_uploaded',
        'dicom_storage_path',
    ];
    
    public function canGenerateReport(): bool
    {
        return $this->images_uploaded && 
               $this->status !== 'pending' && 
               $this->status !== 'cancelled';
    }
}
```

### Priority Levels

| Priority | Description | Typical Turnaround |
|----------|-------------|-------------------|
| `STAT` | Life-threatening | < 1 hour |
| `Urgent` | Serious condition | < 4 hours |
| `Routine` | Standard priority | < 24 hours |
| `Scheduled` | Pre-planned | By appointment |

### Image Upload Workflow

1. **Pending Imaging**: Create study records before images are captured
2. **Upload During Creation**: Upload images at the time of study creation
3. **Post-Creation Upload**: Upload images after the study record is created

---

## 7. Database Schema

### Core Tables

#### patients Table

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

#### clinical_sessions Table

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

#### clinical_forms Table

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

#### referrals Table

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

#### state_transitions Table

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

## Related Documentation

- [System Overview](./system-overview.md)
- [Data Synchronization](./data-synchronization.md)
- [AI Integration](./ai-integration.md)
- [API Reference](../api-reference/overview.md)
