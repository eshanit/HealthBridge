# GP Dashboard Database Schema

**Document Type:** Technical Reference  
**Created:** February 17, 2026  
**Scope:** Phase 1 GP Dashboard Database Tables

---

## Overview

This document describes the database schema for the GP Dashboard system. All tables are in MySQL and synchronize with CouchDB for offline-first operation.

---

## Core Tables

### patients

Stores patient demographics and tracking information.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | bigint | No | Primary key |
| `couch_id` | string | Yes | CouchDB document ID |
| `cpt` | string(20) | No | Clinical Patient Tracker ID (unique) |
| `first_name` | string(255) | No | Patient first name |
| `last_name` | string(255) | No | Patient last name |
| `date_of_birth` | date | Yes | Date of birth |
| `age_months` | integer | Yes | Age in months (calculated) |
| `gender` | string(20) | Yes | Gender (male, female, other) |
| `phone` | string(30) | Yes | Contact phone |
| `weight_kg` | decimal | Yes | Weight in kilograms |
| `visit_count` | integer | Yes | Number of visits |
| `is_active` | boolean | Yes | Active patient flag |
| `last_visit_at` | timestamp | Yes | Last visit timestamp |
| `raw_document` | json | Yes | Raw CouchDB document |
| `created_at` | timestamp | Yes | Record creation timestamp |
| `updated_at` | timestamp | Yes | Record update timestamp |

**Indexes:**
- `cpt` (unique)
- `couch_id` (unique)
- `is_active`

**Migration:** `2026_02_15_000002_create_patients_table.php`

---

### clinical_sessions

Tracks patient visits/encounters. This is the primary table for workflow state management.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | bigint | No | Primary key |
| `couch_id` | string | Yes | CouchDB document ID (unique) |
| `session_uuid` | string(50) | No | Session UUID (unique) |
| `patient_cpt` | string(20) | Yes | Foreign key to patients.cpt |
| `created_by_user_id` | foreignId | Yes | User who created the session |
| `provider_role` | string(50) | Yes | Role of provider (nurse, chw, etc.) |
| `stage` | enum | No | registration, assessment, treatment, discharge |
| `status` | enum | No | open, completed, archived, referred, cancelled |
| `workflow_state` | string | Yes | Workflow state (NEW, TRIAGED, etc.) |
| `workflow_state_updated_at` | timestamp | Yes | Last state change timestamp |
| `triage_priority` | enum | No | red, yellow, green, unknown |
| `chief_complaint` | string | Yes | Primary complaint |
| `notes` | text | Yes | Clinical notes |
| `form_instance_ids` | json | Yes | Array of form IDs |
| `session_created_at` | timestamp | Yes | Session creation (from CouchDB) |
| `session_updated_at` | timestamp | Yes | Session update (from CouchDB) |
| `completed_at` | timestamp | Yes | Session completion timestamp |
| `synced_at` | timestamp | Yes | Last sync timestamp |
| `raw_document` | json | Yes | Raw CouchDB document |
| `created_at` | timestamp | Yes | Record creation timestamp |
| `updated_at` | timestamp | Yes | Record update timestamp |

**Workflow States:**
| State | Description |
|-------|-------------|
| `NEW` | Just registered |
| `TRIAGED` | Assessment completed |
| `REFERRED` | Sent to another provider |
| `IN_GP_REVIEW` | GP is reviewing |
| `UNDER_TREATMENT` | GP treatment started |
| `CLOSED` | Encounter completed |

**Indexes:**
- `status`, `triage_priority`
- `patient_cpt`, `status`
- `session_created_at`
- `created_by_user_id`

**Migration:** `2026_02_15_000003_create_clinical_sessions_table.php`

---

### clinical_forms

Stores form data attached to clinical sessions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | bigint | No | Primary key |
| `couch_id` | string | Yes | CouchDB document ID (unique) |
| `form_uuid` | string(50) | No | Form UUID (unique) |
| `session_couch_id` | string | No | Foreign key to clinical_sessions.couch_id |
| `patient_cpt` | string(20) | Yes | Foreign key to patients.cpt |
| `created_by_user_id` | foreignId | Yes | User who created the form |
| `creator_role` | string(50) | Yes | Role of form creator |
| `form_type` | string(50) | No | Type of form |
| `form_schema_id` | string | Yes | Schema reference |
| `form_data` | json | Yes | Form field data |
| `form_section_id` | string | Yes | Section identifier |
| `form_version` | integer | Yes | Form version number |
| `is_complete` | boolean | Yes | Form completion flag |
| `synced_at` | timestamp | Yes | Last sync timestamp |
| `raw_document` | json | Yes | Raw CouchDB document |
| `created_at` | timestamp | Yes | Record creation timestamp |
| `updated_at` | timestamp | Yes | Record update timestamp |

**Migration:** `2026_02_15_000004_create_clinical_forms_table.php`

---

### referrals

Tracks referrals between providers.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | bigint | No | Primary key |
| `referral_uuid` | string(50) | No | Referral UUID (unique) |
| `session_couch_id` | string | No | Foreign key to clinical_sessions.couch_id |
| `referring_user_id` | foreignId | Yes | User who created referral |
| `assigned_to_user_id` | foreignId | Yes | User assigned to handle |
| `assigned_to_role` | string(50) | Yes | Role assigned (doctor, radiologist, etc.) |
| `status` | enum | No | pending, accepted, rejected, completed, cancelled |
| `priority` | enum | No | red, yellow, green |
| `specialty` | string(50) | Yes | Required specialty type |
| `reason` | text | Yes | Clinical escalation reason |
| `clinical_notes` | text | Yes | Additional clinical context |
| `rejection_reason` | text | Yes | Reason if rejected |
| `assigned_at` | timestamp | Yes | When assignment was made |
| `accepted_at` | timestamp | Yes | When referral was accepted |
| `completed_at` | timestamp | Yes | When referral was completed |
| `created_at` | timestamp | Yes | Record creation timestamp |
| `updated_at` | timestamp | Yes | Record update timestamp |

**Indexes:**
- `status`, `priority`
- `assigned_to_user_id`, `status`
- `session_couch_id`

**Migration:** `2026_02_15_000006_create_referrals_table.php`

---

## Audit Tables

### state_transitions

Audit log for all workflow state changes.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | bigint | No | Primary key |
| `session_id` | foreignId | No | Foreign key to clinical_sessions.id |
| `session_couch_id` | string | Yes | CouchDB ID for reference |
| `from_state` | string | No | Previous state |
| `to_state` | string | No | New state |
| `user_id` | foreignId | Yes | User who made the transition |
| `reason` | string | Yes | Reason for transition |
| `metadata` | json | Yes | Additional metadata |
| `created_at` | timestamp | Yes | Transition timestamp |
| `updated_at` | timestamp | Yes | Record update timestamp |

**Transition Reasons:**
| Transition | Valid Reasons |
|------------|---------------|
| `NEW → TRIAGED` | assessment_completed, vitals_recorded |
| `TRIAGED → REFERRED` | specialist_needed, gp_consultation_required, complex_case |
| `TRIAGED → UNDER_TREATMENT` | treatment_started, medication_prescribed |
| `TRIAGED → CLOSED` | patient_discharged, referred_externally |
| `REFERRED → IN_GP_REVIEW` | gp_accepted, review_started |
| `REFERRED → CLOSED` | referral_cancelled, patient_no_show |
| `IN_GP_REVIEW → UNDER_TREATMENT` | treatment_plan_created, medication_started |
| `IN_GP_REVIEW → REFERRED` | specialist_referral, secondary_consultation |
| `IN_GP_REVIEW → CLOSED` | treatment_completed, patient_discharged |
| `UNDER_TREATMENT → CLOSED` | treatment_completed, patient_recovered |
| `UNDER_TREATMENT → IN_GP_REVIEW` | follow_up_needed, complication_detected |

**Migration:** `2026_02_15_000009_create_state_transitions_table.php`

---

### ai_requests

AI audit logging for all AI interactions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | bigint | No | Primary key |
| `request_uuid` | string | No | Unique request identifier |
| `user_id` | foreignId | No | User who made the request |
| `session_couch_id` | string | Yes | Related clinical session |
| `form_couch_id` | string | Yes | Related form |
| `form_section_id` | string | Yes | Form section |
| `form_field_id` | string | Yes | Form field |
| `form_schema_id` | string | Yes | Form schema reference |
| `task` | string | No | AI task type |
| `use_case` | string | Yes | Use case category |
| `prompt_version` | string | Yes | Prompt template version |
| `prompt` | text | No | Full prompt sent to AI |
| `response` | text | No | AI response text |
| `model` | string | Yes | Model used (e.g., gemma3:4b) |
| `latency_ms` | integer | Yes | Response time in milliseconds |
| `was_overridden` | boolean | Yes | Whether output was modified |
| `risk_flags` | json | Yes | Risk flags identified |
| `requested_at` | timestamp | Yes | When request was made |
| `created_at` | timestamp | Yes | Record creation timestamp |
| `updated_at` | timestamp | Yes | Record update timestamp |

**Migration:** `2026_02_15_000005_create_ai_requests_table.php`

---

### case_comments

Comments on clinical cases.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | bigint | No | Primary key |
| `session_couch_id` | string | No | Foreign key to clinical_sessions.couch_id |
| `user_id` | foreignId | No | User who made the comment |
| `content` | text | No | Comment content |
| `visibility` | string | No | internal, patient_visible |
| `created_at` | timestamp | Yes | Comment timestamp |
| `updated_at` | timestamp | Yes | Update timestamp |

**Migration:** `2026_02_15_000008_create_case_comments_table.php`

---

### prompt_versions

AI prompt version management.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | bigint | No | Primary key |
| `task` | string | No | AI task type |
| `version` | string | No | Version number |
| `prompt_template` | text | No | Prompt template |
| `description` | text | Yes | Version description |
| `is_active` | boolean | No | Active version flag |
| `created_by_user_id` | foreignId | Yes | User who created version |
| `created_at` | timestamp | Yes | Creation timestamp |
| `updated_at` | timestamp | Yes | Update timestamp |

**Migration:** `2026_02_15_000007_create_prompt_versions_table.php`

---

## Authentication & Authorization Tables

### users

User accounts (Laravel default).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | bigint | No | Primary key |
| `name` | string | No | Full name |
| `email` | string | No | Email address (unique) |
| `email_verified_at` | timestamp | Yes | Email verification timestamp |
| `password` | string | No | Hashed password |
| `two_factor_secret` | text | Yes | 2FA secret |
| `two_factor_confirmed_at` | timestamp | Yes | 2FA confirmation timestamp |
| `remember_token` | string | Yes | Remember me token |
| `current_team_id` | bigint | Yes | Current team |
| `profile_photo_path` | string | Yes | Profile photo path |
| `created_at` | timestamp | Yes | Creation timestamp |
| `updated_at` | timestamp | Yes | Update timestamp |

---

### roles

Role definitions (via spatie/laravel-permission).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | bigint | No | Primary key |
| `name` | string | No | Role name |
| `guard_name` | string | No | Guard name |
| `created_at` | timestamp | Yes | Creation timestamp |
| `updated_at` | timestamp | Yes | Update timestamp |

**Predefined Roles:**
- `nurse` - Frontline nurse
- `senior-nurse` - Senior nurse
- `doctor` - General Practitioner (GP)
- `radiologist` - Imaging specialist
- `dermatologist` - Skin specialist
- `manager` - Dashboard manager
- `admin` - System administrator

---

### permissions

Permission definitions (via spatie/laravel-permission).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | bigint | No | Primary key |
| `name` | string | No | Permission name |
| `guard_name` | string | No | Guard name |
| `created_at` | timestamp | Yes | Creation timestamp |
| `updated_at` | timestamp | Yes | Update timestamp |

**Predefined Permissions:**
- `use-ai` - Can use AI features
- `ai-explain-triage` - Can request triage explanation
- `ai-caregiver-summary` - Can request caregiver summary
- `ai-specialist-review` - Can request specialist review
- `ai-imaging-interpretation` - Can request imaging interpretation
- `view-cases` - Can view cases
- `view-own-cases` - Can view own cases only
- `view-all-cases` - Can view all cases
- `create-referrals` - Can create referrals
- `accept-referrals` - Can accept referrals
- `add-case-comments` - Can add case comments
- `view-dashboards` - Can view dashboards
- `view-ai-console` - Can view AI console
- `manage-prompts` - Can manage AI prompts
- `manage-users` - Can manage users
- `manage-roles` - Can manage roles

---

## Entity Relationships

```
patients
    └── clinical_sessions (via patient_cpt)
            ├── clinical_forms (via session_couch_id)
            ├── referrals (via session_couch_id)
            ├── case_comments (via session_couch_id)
            ├── ai_requests (via session_couch_id)
            └── state_transitions (via session_id)

users
    ├── clinical_sessions (created_by_user_id)
    ├── clinical_forms (created_by_user_id)
    ├── referrals (referring_user_id, assigned_to_user_id)
    ├── case_comments (user_id)
    ├── ai_requests (user_id)
    └── state_transitions (user_id)

roles
    └── users (via model_has_roles)

permissions
    └── roles (via role_has_permissions)
```

---

## Migration Order

1. `0001_01_01_000000_create_users_table.php`
2. `2026_02_15_000001_create_permission_tables.php`
3. `2026_02_15_000002_create_patients_table.php`
4. `2026_02_15_000003_create_clinical_sessions_table.php`
5. `2026_02_15_000004_create_clinical_forms_table.php`
6. `2026_02_15_000005_create_ai_requests_table.php`
7. `2026_02_15_000006_create_referrals_table.php`
8. `2026_02_15_000007_create_prompt_versions_table.php`
9. `2026_02_15_000008_create_case_comments_table.php`
10. `2026_02_15_000009_create_state_transitions_table.php`
11. `2026_02_15_000010_add_name_fields_to_patients_table.php`
12. `2026_02_16_182328_create_personal_access_tokens_table.php`
13. `2026_02_17_000001_add_user_tracking_to_clinical_tables.php`
14. `2026_02_17_000002_add_form_section_tracking_to_ai_requests.php`

---

*Document generated from codebase analysis*  
*Date: February 17, 2026*
