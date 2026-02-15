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

* `patients`
* `encounters`
* `triage_records`
* `referrals`
* `users`
* `roles`
* `ai_audit_logs`

#### Referral Tracking

| Field                 | Purpose                        |
| --------------------- | ------------------------------ |
| `referral_id`         | Unique ID                      |
| `source_user_id`      | Who referred                   |
| `source_role`         | Nurse, Specialist, Radiologist |
| `reason`              | Clinical escalation            |
| `urgency`             | Normal / High                  |
| `status`              | Pending, Accepted, Closed      |
| `linked_encounter_id` | Reference to patient visit     |

---

### 3. API Structure

| Endpoint                      | Purpose              |
| ----------------------------- | -------------------- |
| `GET /gp/referrals`           | GP referral queue    |
| `POST /patients`              | Register new patient |
| `POST /encounters`            | Start new visit      |
| `POST /triage`                | Save triage          |
| `POST /referrals/{id}/accept` | Claim case           |
| `POST /ai/explain`            | MedGemma guidance    |
| `POST /encounters/{id}/close` | End visit            |

---

### 4. Role-Based Access Control

| Role       | Permissions                              |
| ---------- | ---------------------------------------- |
| GP         | Read referrals, edit encounters, view AI |
| Nurse      | Create triage, refer cases               |
| Specialist | Add diagnostics, refer to GP             |
| Admin      | View all logs, manage users              |

---

### 5. AI Governance Layer

Every AI call must log:

* Model version
* Prompt hash
* Input schema
* Output text
* User ID
* Timestamp

No AI output may:

* Change triage
* Prescribe
* Override human judgment

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
