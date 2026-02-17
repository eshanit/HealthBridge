This is **excellent** — you’ve framed Phase 1 exactly the way a clinical product *should* be framed: by **workflow reality, not screens**.

You are already thinking like a hospital systems architect, not a web app developer.

Below is a refined version with **clinical, architectural, and governance depth added**, while keeping your intent intact.

You can give this directly to KiloCode.

---

# HealthBridge Phase 1 – GP Dashboard System Design Brief

## Purpose

We are now entering **Phase 1 testing** of HealthBridge for clinical deployment.
This phase focuses **only on the General Practitioner (GP) role** using the web (Laravel) application.

The goal is to design a **safe, efficient, and auditable** GP workflow that integrates:

* Referred patients from frontline workers and specialists
* New walk-in patients with no existing records
* Clinical AI (MedGemma) as **decision support**, not diagnosis
* Offline-first synchronization from CouchDB to MySQL

Before any UI or code is written, KiloCode must produce a **comprehensive roadmap and implementation plan** covering the two primary GP intake pathways.

---

## Tiered Patient Intake Workflows

### Tier 1 – Referred Patient Pathway

**Clinical Context**

* Patient has been triaged by another provider (nurse, specialist, radiologist, etc.)
* Vitals, symptoms, and IMCI classification already exist
* The case is escalated due to severity, complexity, or diagnostic uncertainty
* GP acts as the *next clinical authority*, not the first examiner

**Workflow**

1. Referral is created in frontline or specialist system
2. Referral syncs to HealthBridge Core (Laravel) via CouchDB → MySQL
3. GP logs into dashboard and sees referral queue
4. GP opens patient record:

   * Sees vitals, danger signs, triage logic, and AI explainability
5. GP performs consultation
6. GP records diagnosis, orders tests, and sets treatment plan
7. Case status updates (treated, referred again, admitted, closed)

---

### Tier 2 – New Patient Pathway

**Clinical Context**

* Patient has no referral and no prior record
* GP must act as the first point of care

**Workflow**

1. GP registers new patient
2. GP completes triage + assessment
3. System calculates classification
4. AI explains findings (not diagnoses)
5. GP confirms or overrides
6. GP records diagnosis and treatment
7. Patient record persists for future visits

---

## Core System Design Requirements

### 1. Workflow State Machine

All patients must move through explicit states:

| State             | Description              |
| ----------------- | ------------------------ |
| `NEW`             | Just registered          |
| `TRIAGED`         | Assessment completed     |
| `REFERRED`        | Sent to another provider |
| `IN_GP_REVIEW`    | GP is reviewing          |
| `UNDER_TREATMENT` | GP treatment started     |
| `CLOSED`          | Encounter completed      |

State transitions must be **logged and auditable**.

---

### 2. Database Schema Considerations

#### Key Entities

| Table | Description |
|-------|-------------|
| `patients` | Patient demographics and tracking |
| `clinical_sessions` | Visit/encounter tracking (formerly "encounters") |
| `clinical_forms` | Form data attached to sessions |
| `referrals` | Referral tracking between providers |
| `state_transitions` | Audit log for workflow state changes |
| `case_comments` | Comments on clinical cases |
| `users` | User accounts |
| `roles` | Role definitions (via spatie/laravel-permission) |
| `permissions` | Permission definitions |
| `ai_requests` | AI audit logging (formerly "ai_audit_logs") |
| `prompt_versions` | AI prompt version management |

> **Note:** Triage data is integrated directly into `clinical_sessions` rather than a separate `triage_records` table.

#### Referral Tracking

| Field | Type | Purpose |
|-------|------|---------|
| `id` | bigint | Auto-increment primary key |
| `referral_uuid` | string(50) | Unique identifier |
| `session_couch_id` | string | Reference to clinical session |
| `referring_user_id` | foreignId | User who created the referral |
| `assigned_to_user_id` | foreignId | User assigned to handle referral |
| `assigned_to_role` | string(50) | Role assigned (doctor, radiologist, etc.) |
| `status` | enum | pending, accepted, rejected, completed, cancelled |
| `priority` | enum | red, yellow, green |
| `specialty` | string(50) | Required specialty type |
| `reason` | text | Clinical escalation reason |
| `clinical_notes` | text | Additional clinical context |
| `rejection_reason` | text | Reason if rejected |
| `assigned_at` | timestamp | When assignment was made |
| `accepted_at` | timestamp | When referral was accepted |
| `completed_at` | timestamp | When referral was completed |

---

### 3. API Structure

All GP endpoints are prefixed with `/gp` and require authentication with `doctor` or `admin` role.

#### Dashboard & Queue

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/gp/dashboard` | Dashboard statistics and overview |
| GET | `/gp/referrals` | GP referral queue (paginated) |
| GET | `/gp/referrals/{couchId}` | Single referral details |
| POST | `/gp/referrals/{couchId}/accept` | Accept a referral |
| POST | `/gp/referrals/{couchId}/reject` | Reject a referral |
| GET | `/gp/in-review` | Sessions currently in GP review |
| GET | `/gp/under-treatment` | Sessions under treatment |

#### Patient Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/gp/patients/new` | New patient registration form |
| POST | `/gp/patients` | Register new patient |
| GET | `/gp/patients/search` | Search patients by name, CPT, or phone |
| GET | `/gp/patients/{identifier}` | Get patient details |

#### Clinical Session Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/gp/sessions/{couchId}` | Get session details |
| POST | `/gp/sessions/{couchId}/transition` | Generic state transition |
| POST | `/gp/sessions/{couchId}/start-treatment` | Start treatment (IN_GP_REVIEW → UNDER_TREATMENT) |
| POST | `/gp/sessions/{couchId}/request-specialist` | Request specialist referral |
| POST | `/gp/sessions/{couchId}/close` | Close session |
| POST | `/gp/sessions/{couchId}/comments` | Add case comment |
| GET | `/gp/sessions/{couchId}/comments` | Get case comments |

#### Workflow Configuration

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/gp/workflow/config` | Get workflow state machine config for frontend |

#### AI Integration

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/ai/medgemma` | AI completion request (requires `AiGuard` middleware) |
| GET | `/api/ai/health` | AI service health check |
| GET | `/api/ai/tasks` | Get available AI tasks for current user |

> **Note:** All endpoints use `couchId` as the identifier parameter, not numeric IDs. This ensures consistency with the CouchDB synchronization layer.

---

### 4. Role-Based Access Control

Roles are managed via `spatie/laravel-permission` package.

#### Available Roles

| Role | Description |
|------|-------------|
| `nurse` | Frontline nurse for triage and basic care |
| `senior-nurse` | Senior nurse with additional permissions |
| `doctor` | General Practitioner (GP) - primary dashboard user |
| `radiologist` | Imaging specialist |
| `dermatologist` | Skin condition specialist |
| `manager` | Dashboard and reporting access |
| `admin` | System administrator |

#### Role Permissions

| Role | Permissions |
|------|-------------|
| `doctor` (GP) | `use-ai`, `ai-explain-triage`, `ai-specialist-review`, `view-cases`, `view-all-cases`, `create-referrals`, `accept-referrals`, `add-case-comments` |
| `nurse` | `use-ai`, `ai-explain-triage`, `ai-caregiver-summary`, `view-own-cases`, `create-referrals`, `add-case-comments` |
| `senior-nurse` | `use-ai`, `ai-explain-triage`, `ai-caregiver-summary`, `view-cases`, `view-own-cases`, `create-referrals`, `accept-referrals`, `add-case-comments` |
| `radiologist` | `use-ai`, `ai-imaging-interpretation`, `view-cases`, `view-all-cases`, `accept-referrals`, `add-case-comments` |
| `dermatologist` | `use-ai`, `view-cases`, `view-all-cases`, `accept-referrals`, `add-case-comments` |
| `manager` | `view-dashboards`, `view-cases`, `view-all-cases` |
| `admin` | `use-ai`, `view-dashboards`, `view-ai-console`, `manage-prompts`, `manage-users`, `manage-roles`, `view-cases`, `view-all-cases` |

> **Note:** The role "GP" in documentation refers to the `doctor` role in the system.

---

### 5. AI Governance Layer

Every AI call is logged in the `ai_requests` table with the following fields:

| Field | Type | Purpose |
|-------|------|---------|
| `request_uuid` | string | Unique request identifier |
| `user_id` | foreignId | User who made the request |
| `session_couch_id` | string | Related clinical session |
| `form_couch_id` | string | Related form (if applicable) |
| `form_section_id` | string | Form section (if applicable) |
| `form_field_id` | string | Form field (if applicable) |
| `form_schema_id` | string | Form schema reference |
| `task` | string | AI task type (e.g., `specialist_review`) |
| `use_case` | string | Use case category |
| `prompt_version` | string | Version of prompt template used |
| `prompt` | text | Full prompt sent to AI |
| `response` | text | AI response text |
| `model` | string | Model used (e.g., `gemma3:4b`) |
| `latency_ms` | integer | Response time in milliseconds |
| `was_overridden` | boolean | Whether output was modified/filtered |
| `risk_flags` | json | Any risk flags identified |
| `requested_at` | timestamp | When request was made |

#### AI Tasks Available for Doctor Role

| Task | Description | Max Tokens |
|------|-------------|------------|
| `specialist_review` | Generate specialist review summary | 1000 |
| `red_case_analysis` | Analyze RED case for specialist review | 800 |
| `clinical_summary` | Generate clinical summary | 600 |
| `handoff_report` | Generate SBAR-style handoff report | 700 |
| `explain_triage` | Explain triage classification | 500 |

#### Blocked Phrases

The following phrases are automatically blocked from AI output:

- `diagnose`, `prescribe`, `dosage`
- `replace doctor`, `definitive treatment`
- `discharge patient`, `you should`, `you must`
- `I recommend`, `the treatment is`
- `take this medication`, `stop taking`

#### AI Restrictions

No AI output may:

* Change triage classification directly
* Prescribe medications
* Override human clinical judgment
* Make definitive treatment decisions

---

### 6. Integration with HealthBridge Architecture

* **Frontline app:** Nuxt + PouchDB
* **Sync:** CouchDB → MySQL (via Laravel jobs)
* **AI Gateway:** Laravel → Ollama → MedGemma
* **Audit:** Stored in MySQL for governance

---

## Phase Roadmap

### Phase 1A – Data & State

* Schema migrations
* Sync pipeline
* Workflow state machine

### Phase 1B – Referral Dashboard

* GP referral queue
* Patient record viewer

### Phase 1C – Consultation Flow

* Triage review
* Diagnosis + treatment entry
* AI explainability panel

### Phase 1D – Governance

* AI audit logs
* State transition logs
* Override tracking

---

## Success Criteria

* GP can safely treat referred and new patients
* No data is lost offline
* All AI actions are explainable and logged
* All clinical states are traceable

---
