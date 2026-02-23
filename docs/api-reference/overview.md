# HealthBridge API Reference

**Version:** 1.0  
**Last Updated:** February 2026  
**Status:** Authoritative Reference

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [GP Dashboard API](#3-gp-dashboard-api)
4. [AI Gateway API](#4-ai-gateway-api)
5. [Radiology API](#5-radiology-api)
6. [Patient API](#6-patient-api)
7. [Error Handling](#7-error-handling)

---

## 1. Overview

HealthBridge provides RESTful APIs for both the web application and mobile application. All APIs use JSON for request and response bodies.

### Base URLs

| Environment | Base URL |
|-------------|----------|
| Production | `https://api.healthbridge.example.com` |
| Staging | `https://staging-api.healthbridge.example.com` |
| Development | `http://localhost:8000` |

### Content Types

- **Request**: `application/json`
- **Response**: `application/json`

### Rate Limiting

| Endpoint Type | Rate Limit |
|---------------|------------|
| General API | 60 requests/minute |
| AI Endpoints | 30 requests/minute |
| Authentication | 10 requests/minute |

---

## 2. Authentication

### Session-Based Authentication (Web)

Used by the Laravel web application with Fortify.

```http
POST /login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

### Token-Based Authentication (API)

Used by mobile applications with Sanctum.

```http
POST /api/tokens/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "token_name": "mobile-app"
}
```

**Response:**
```json
{
  "token": "1|abcdef123456..."
}
```

### Using Tokens

Include the token in the Authorization header:

```http
GET /api/endpoint
Authorization: Bearer 1|abcdef123456...
```

---

## 3. GP Dashboard API

All GP endpoints require authentication and `doctor` or `admin` role.

### GET /gp/dashboard

Returns dashboard statistics and overview.

**Response:**
```json
{
  "stats": {
    "pending_referrals": 5,
    "in_review": 3,
    "under_treatment": 2,
    "completed_today": 8
  },
  "recentReferrals": [...],
  "urgentCases": [...]
}
```

### GET /gp/referrals

Returns paginated list of referrals.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `priority` | string | Filter by priority: `red`, `yellow`, `green` |
| `search` | string | Search by patient name or CPT |
| `page` | int | Page number |

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "couch_id": "session_abc123",
      "workflow_state": "REFERRED",
      "workflow_state_label": "Referred",
      "triage_priority": "red",
      "chief_complaint": "Severe respiratory distress",
      "created_at": "2026-02-17T10:00:00Z",
      "patient": {
        "cpt": "AB12",
        "first_name": "Chipo",
        "last_name": "R",
        "age": 4,
        "gender": "female"
      },
      "referral": {
        "id": 1,
        "reason": "Severe pneumonia suspected",
        "referred_at": "2026-02-17T10:30:00Z"
      }
    }
  ],
  "links": {...},
  "meta": {...}
}
```

### POST /gp/referrals/{couchId}/accept

Accept a referral and transition session to `IN_GP_REVIEW`.

**Request Body:**
```json
{
  "notes": "Optional acceptance notes"
}
```

**Response (200):**
```json
{
  "message": "Referral accepted successfully.",
  "session": {...},
  "transition": {
    "id": 1,
    "from_state": "REFERRED",
    "to_state": "IN_GP_REVIEW",
    "user_id": 1,
    "reason": "gp_accepted",
    "created_at": "2026-02-17T11:00:00Z"
  }
}
```

### POST /gp/referrals/{couchId}/reject

Reject a referral.

**Request Body:**
```json
{
  "reason": "referral_cancelled",
  "notes": "Optional rejection notes"
}
```

### GET /gp/sessions/{couchId}

Returns detailed session information.

**Response:**
```json
{
  "session": {
    "id": 1,
    "couch_id": "session_abc123",
    "workflow_state": "IN_GP_REVIEW",
    "triage_priority": "red",
    "chief_complaint": "Severe respiratory distress",
    "patient": {...},
    "forms": [...],
    "referrals": [...],
    "comments": [...],
    "ai_requests": [...]
  },
  "allowed_transitions": ["UNDER_TREATMENT", "CLOSED"],
  "transition_history": [...]
}
```

### POST /gp/sessions/{couchId}/assessment

Store assessment data.

**Request Body:**
```json
{
  "chief_complaint": "Fever and cough for 3 days",
  "history_present_illness": "Started with runny nose...",
  "past_medical_history": "No significant history",
  "allergies": "None known",
  "physical_exam": "Chest: bilateral crackles...",
  "symptoms": ["Fever", "Cough", "Difficulty breathing"],
  "exam_findings": ["Chest indrawing", "Wheezing"]
}
```

### POST /gp/sessions/{couchId}/diagnostics

Store diagnostic orders.

**Request Body:**
```json
{
  "labs": ["cbc", "malaria", "blood_culture"],
  "imaging": ["chest_xray"],
  "other_lab": "Blood glucose fasting",
  "specialist_notes": "Consider pediatric consultation"
}
```

### PUT /gp/sessions/{couchId}/treatment-plan

Update treatment plan.

**Request Body:**
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
  "fluids": [...],
  "oxygenRequired": true,
  "oxygenType": "nasal_cannula",
  "oxygenFlow": "2-4",
  "disposition": "admit",
  "admissionWard": "pediatric",
  "followUpInstructions": "Return in 3 days",
  "returnPrecautions": "Return immediately if difficulty breathing worsens"
}
```

---

## 4. AI Gateway API

### POST /api/ai/medgemma

Generate an AI completion for a clinical task.

**Authentication Required:** Yes

**Request Body:**
```json
{
  "task": "explain_triage",
  "context": {
    "sessionId": "sess_8F2A9",
    "patientCpt": "AB12",
    "triagePriority": "yellow",
    "findings": ["fast_breathing", "chest_indrawing"]
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "task": "explain_triage",
  "response": {
    "triage_category": "urgent",
    "category_rationale": "Patient presents with respiratory symptoms...",
    "key_findings": ["Fast breathing", "Chest indrawing"],
    "danger_signs_present": ["chest_indrawing"],
    "immediate_actions": ["Provide oxygen", "Monitor SpO2"],
    "confidence_level": "high"
  },
  "structured": true,
  "request_id": "req_abc123",
  "metadata": {
    "provider": "prism",
    "model": "gemma3:4b",
    "latency_ms": 1250,
    "from_cache": false,
    "warnings": []
  }
}
```

**Error Response (429):**
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "category": "rate_limit",
  "severity": "warning",
  "retry_after": 60
}
```

### POST /api/ai/stream

Server-Sent Events streaming for real-time AI responses.

**Request Body:**
```json
{
  "task": "explain_triage",
  "context": {...}
}
```

**Response (text/event-stream):**
```
event: start
data: {"task": "explain_triage"}

event: token
data: {"token": "The"}

event: token
data: {"token": " patient"}

event: complete
data: {"response": "...", "latency_ms": 1500}
```

### Available AI Tasks

| Task | Description | Roles Allowed |
|------|-------------|---------------|
| `explain_triage` | Explain triage classification | nurse, doctor |
| `caregiver_summary` | Generate caregiver education | nurse, doctor |
| `clinical_handover` | Generate SBAR handoff report | nurse, doctor |
| `note_summary` | Summarize clinical encounter | nurse, doctor |
| `specialist_review` | Review case for specialist | doctor |
| `treatment_review` | Review treatment plan | doctor |
| `imaging_interpretation` | Draft radiology report | radiologist |

---

## 5. Radiology API

### GET /radiology/dashboard

Returns radiology dashboard statistics.

**Response:**
```json
{
  "stats": {
    "pending_studies": 10,
    "in_progress": 3,
    "completed_today": 5,
    "reported_today": 4
  },
  "worklist": [...],
  "urgent_studies": [...]
}
```

### GET /radiology/studies

Returns paginated list of radiology studies.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status |
| `modality` | string | Filter by modality |
| `priority` | string | Filter by priority |
| `search` | string | Search by patient CPT |

### POST /radiology/studies

Create a new radiology study.

**Request Body:**
```json
{
  "patient_cpt": "AB12",
  "modality": "CT",
  "body_part": "Chest",
  "study_type": "CT Chest with Contrast",
  "clinical_indication": "Suspected pneumonia",
  "priority": "urgent"
}
```

### POST /radiology/studies/{studyId}/upload-images

Upload DICOM images for a study.

**Request:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `dicom_file` | file | DICOM or ZIP file (max 500MB) |

**Response:**
```json
{
  "message": "Images uploaded successfully",
  "study": {
    "id": 1,
    "images_uploaded": true,
    "dicom_storage_path": "radiology/studies/1/original/...",
    "status": "in_progress"
  }
}
```

### PUT /radiology/studies/{studyId}/report

Update study with radiology report.

**Request Body:**
```json
{
  "findings": "Bilateral infiltrates noted in lower lobes...",
  "impression": "Consistent with bacterial pneumonia",
  "recommendations": "Clinical correlation recommended"
}
```

---

## 6. Patient API

### GET /patients

List patients with pagination.

### GET /patients/search

Search for patients.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (name, CPT, phone) |
| `cpt` | string | Exact CPT match |

**Response:**
```json
{
  "data": [
    {
      "cpt": "AB12",
      "first_name": "John",
      "last_name": "Doe",
      "date_of_birth": "2024-01-15",
      "gender": "male",
      "age_months": 25,
      "last_visit": "2026-02-17T10:00:00Z"
    }
  ]
}
```

### POST /patients

Create a new patient.

**Request Body:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "date_of_birth": "2024-01-15",
  "gender": "male",
  "weight_kg": 12.5,
  "phone": "+263123456789",
  "external_mrn": "MRN-12345"
}
```

**Response (201):**
```json
{
  "message": "Patient created successfully",
  "patient": {
    "cpt": "AB12",
    "first_name": "John",
    "last_name": "Doe",
    ...
  },
  "session": {
    "id": "session_xyz",
    "patient_cpt": "AB12",
    "stage": "registration"
  }
}
```

### GET /patients/{identifier}

Get patient details.

**Response:**
```json
{
  "patient": {
    "cpt": "AB12",
    "first_name": "John",
    "last_name": "Doe",
    "date_of_birth": "2024-01-15",
    "gender": "male",
    "weight_kg": 12.5,
    "visit_count": 3,
    "sessions": [...]
  }
}
```

---

## 7. Error Handling

### Error Response Format

All errors follow a consistent format:

```json
{
  "message": "Human-readable error message",
  "errors": {
    "field_name": ["Validation error 1", "Validation error 2"]
  }
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (successful deletion) |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 422 | Validation Error |
| 429 | Rate Limit Exceeded |
| 500 | Internal Server Error |

### Validation Errors (422)

```json
{
  "message": "The given data was invalid.",
  "errors": {
    "patient_cpt": ["The selected patient cpt is invalid."],
    "modality": ["The modality field is required."]
  }
}
```

### Rate Limit Errors (429)

```json
{
  "message": "Too Many Attempts.",
  "retry_after": 60
}
```

---

## Related Documentation

- [System Overview](../architecture/system-overview.md)
- [AI Integration](../architecture/ai-integration.md)
- [Clinical Workflow](../architecture/clinical-workflow.md)
