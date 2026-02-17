# GP Dashboard API Endpoints

**Document Type:** Technical Reference  
**Created:** February 17, 2026  
**Scope:** Phase 1 GP Dashboard API Documentation

---

## Overview

All GP endpoints are prefixed with `/gp` and require authentication. Most endpoints require `doctor` or `admin` role.

**Authentication:** Session-based (Laravel Fortify) or API Token (Sanctum)  
**Content-Type:** `application/json`  
**CSRF:** Required for session-based requests via `X-CSRF-TOKEN` header

---

## Authentication & Authorization

### Middleware Chain

```
auth → verified → role:doctor|admin
```

All GP routes require:
1. User to be authenticated
2. Email to be verified
3. User to have `doctor` or `admin` role

---

## Dashboard Endpoints

### GET /gp/dashboard

Returns dashboard statistics and overview for the logged-in GP.

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

**Controller:** `GPDashboardController@index`

---

## Referral Queue Endpoints

### GET /gp/referrals

Returns paginated list of referrals awaiting GP action.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `priority` | string | Filter by priority: `red`, `yellow`, `green` |
| `search` | string | Search by patient name or CPT |

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
      "state_updated_at": "2026-02-17T10:30:00Z",
      "patient": {
        "cpt": "CPT-2026-00001",
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

**Controller:** `GPDashboardController@referralQueue`

---

### GET /gp/referrals/{couchId}

Returns detailed information about a specific referral.

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `couchId` | string | CouchDB document ID of the session |

**Response:**
```json
{
  "session": {
    "id": 1,
    "couch_id": "session_abc123",
    "workflow_state": "REFERRED",
    "workflow_state_label": "Referred",
    "triage_priority": "red",
    "chief_complaint": "Severe respiratory distress",
    "notes": "...",
    "patient": {...},
    "referrals": [...],
    "forms": [...],
    "comments": [...],
    "ai_requests": [...]
  },
  "allowed_transitions": ["IN_GP_REVIEW", "CLOSED"],
  "transition_history": [...],
  "workflow_config": {...}
}
```

**Controller:** `GPDashboardController@showReferral`

---

### POST /gp/referrals/{couchId}/accept

Accept a referral and transition session to `IN_GP_REVIEW`.

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `couchId` | string | CouchDB document ID of the session |

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

**Response (422):**
```json
{
  "message": "This referral cannot be accepted in its current state."
}
```

**Controller:** `GPDashboardController@acceptReferral`

---

### POST /gp/referrals/{couchId}/reject

Reject a referral and transition session to `CLOSED`.

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `couchId` | string | CouchDB document ID of the session |

**Request Body:**
```json
{
  "reason": "referral_cancelled",
  "notes": "Optional rejection notes"
}
```

**Valid Reasons:** `referral_cancelled`, `patient_no_show`, `invalid_referral`

**Response (200):**
```json
{
  "message": "Referral rejected.",
  "session": {...},
  "transition": {...}
}
```

**Controller:** `GPDashboardController@rejectReferral`

---

## Session Management Endpoints

### GET /gp/in-review

Returns paginated list of sessions currently in GP review (accepted by this GP).

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search by patient name or CPT |

**Controller:** `GPDashboardController@inReview`

---

### GET /gp/under-treatment

Returns paginated list of sessions under treatment by this GP.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search by patient name or CPT |

**Controller:** `GPDashboardController@underTreatment`

---

### GET /gp/sessions/{couchId}

Returns detailed session information.

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `couchId` | string | CouchDB document ID of the session |

**Response:**
```json
{
  "session": {
    "id": 1,
    "couch_id": "session_abc123",
    "session_uuid": "uuid-xyz",
    "workflow_state": "IN_GP_REVIEW",
    "workflow_state_label": "GP Review",
    "workflow_state_updated_at": "2026-02-17T11:00:00Z",
    "status": "open",
    "stage": "assessment",
    "triage_priority": "red",
    "chief_complaint": "Severe respiratory distress",
    "notes": "...",
    "patient": {
      "cpt": "CPT-2026-00001",
      "first_name": "Chipo",
      "last_name": "R",
      "date_of_birth": "2022-03-15",
      "age": 4,
      "gender": "female",
      "phone": "+263712345678"
    },
    "referrals": [...],
    "forms": [...],
    "comments": [...],
    "ai_requests": [...]
  },
  "allowed_transitions": ["UNDER_TREATMENT", "REFERRED", "CLOSED"],
  "transition_history": [...]
}
```

**Controller:** `ClinicalSessionController@show`

---

### POST /gp/sessions/{couchId}/transition

Generic state transition endpoint.

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `couchId` | string | CouchDB document ID of the session |

**Request Body:**
```json
{
  "to_state": "UNDER_TREATMENT",
  "reason": "treatment_plan_created",
  "metadata": {
    "custom_field": "value"
  }
}
```

**Response (200):**
```json
{
  "message": "Session transitioned successfully.",
  "session": {...},
  "transition": {...}
}
```

**Response (422):**
```json
{
  "message": "Cannot transition from IN_GP_REVIEW to CLOSED.",
  "errors": {
    "to_state": ["Cannot transition from IN_GP_REVIEW to CLOSED."]
  }
}
```

**Controller:** `ClinicalSessionController@transition`

---

### POST /gp/sessions/{couchId}/start-treatment

Transition session from `IN_GP_REVIEW` to `UNDER_TREATMENT`.

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `couchId` | string | CouchDB document ID of the session |

**Request Body:**
```json
{
  "treatment_plan": "Antibiotics course for 7 days..."
}
```

**Response (200):**
```json
{
  "message": "Treatment started successfully.",
  "session": {...},
  "transition": {...}
}
```

**Controller:** `ClinicalSessionController@startTreatment`

---

### POST /gp/sessions/{couchId}/request-specialist

Request specialist referral (transition to `REFERRED`).

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `couchId` | string | CouchDB document ID of the session |

**Request Body:**
```json
{
  "specialist_type": "pediatrician",
  "notes": "Requires specialized pediatric assessment"
}
```

**Response (200):**
```json
{
  "message": "Specialist referral requested.",
  "session": {...},
  "transition": {...}
}
```

**Controller:** `ClinicalSessionController@requestSpecialistReferral`

---

### POST /gp/sessions/{couchId}/close

Close a session (transition to `CLOSED`).

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `couchId` | string | CouchDB document ID of the session |

**Request Body:**
```json
{
  "reason": "treatment_completed",
  "outcome_notes": "Patient responded well to treatment...",
  "follow_up_required": true,
  "follow_up_date": "2026-02-24"
}
```

**Response (200):**
```json
{
  "message": "Session closed successfully.",
  "session": {...},
  "transition": {...}
}
```

**Controller:** `ClinicalSessionController@close`

---

### POST /gp/sessions/{couchId}/comments

Add a comment to a session.

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `couchId` | string | CouchDB document ID of the session |

**Request Body:**
```json
{
  "content": "Patient showing improvement after 2 days of treatment.",
  "visibility": "internal"
}
```

**Visibility Options:** `internal`, `patient_visible`

**Response (201):**
```json
{
  "message": "Comment added successfully.",
  "comment": {
    "id": 1,
    "content": "...",
    "visibility": "internal",
    "user": {
      "id": 1,
      "name": "Dr. Moyo"
    },
    "created_at": "2026-02-17T12:00:00Z"
  }
}
```

**Controller:** `ClinicalSessionController@addComment`

---

### GET /gp/sessions/{couchId}/comments

Get all comments for a session.

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `couchId` | string | CouchDB document ID of the session |

**Response:**
```json
{
  "comments": [
    {
      "id": 1,
      "content": "...",
      "visibility": "internal",
      "user": {
        "id": 1,
        "name": "Dr. Moyo"
      },
      "created_at": "2026-02-17T12:00:00Z"
    }
  ]
}
```

**Controller:** `ClinicalSessionController@getComments`

---

### GET /gp/sessions/{couchId}/timeline

Returns aggregated timeline of all events for a session.

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `couchId` | string | CouchDB document ID of the session |

**Response:**
```json
{
  "timeline": [
    {
      "id": "transition_1",
      "type": "state_change",
      "title": "Status changed to IN_GP_REVIEW",
      "description": "gp_accepted",
      "user": "Dr. Moyo",
      "timestamp": "2026-02-17T11:00:00Z",
      "metadata": null
    },
    {
      "id": "ai_1",
      "type": "ai_request",
      "title": "AI Task: specialist_review",
      "description": "Model: gemma3:4b",
      "user": null,
      "timestamp": "2026-02-17T11:05:00Z",
      "metadata": {
        "task": "specialist_review",
        "model": "gemma3:4b",
        "latency_ms": 2340
      }
    },
    {
      "id": "comment_1",
      "type": "comment",
      "title": "Case Comment",
      "description": "Patient showing improvement after 2 days of treatment.",
      "user": "Dr. Moyo",
      "timestamp": "2026-02-17T12:00:00Z",
      "metadata": {
        "visibility": "internal"
      }
    }
  ]
}
```

**Event Types:**
| Type | Description |
|------|-------------|
| `state_change` | Workflow state transitions |
| `ai_request` | AI assistance requests |
| `comment` | Case comments |
| `form` | Clinical form submissions |
| `referral` | Referral events |

**Controller:** `ClinicalSessionController@timeline`

---

### PUT /gp/sessions/{couchId}/treatment-plan

Update the structured treatment plan for a session.

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `couchId` | string | CouchDB document ID of the session |

**Request Body:**
```json
{
  "treatment_plan": [
    {
      "id": "med_123",
      "name": "Amoxicillin",
      "dose": "250mg",
      "route": "oral",
      "frequency": "tds",
      "duration": "7 days",
      "instructions": "Take with food"
    }
  ]
}
```

**Response (200):**
```json
{
  "message": "Treatment plan updated successfully.",
  "session": {
    "id": 1,
    "couch_id": "session_abc123",
    "treatment_plan": [...]
  }
}
```

**Controller:** `ClinicalSessionController@updateTreatmentPlan`

---

## Patient Management Endpoints

### GET /gp/patients

Returns paginated list of all active patients with filtering and sorting.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search by name, CPT, or phone (min 2 chars) |
| `triage` | string | Filter by triage: `red`, `yellow`, `green`, `unknown` |
| `status` | string | Filter by workflow state |
| `sort_by` | string | Sort field: `last_visit_at`, `created_at`, `full_name` |
| `sort_dir` | string | Sort direction: `asc`, `desc` |
| `per_page` | integer | Items per page (10-100, default 20) |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "couch_id": "patient_abc123",
      "cpt": "CPT-2026-00001",
      "full_name": "Chipo R",
      "age": 4,
      "gender": "female",
      "triage_priority": "red",
      "status": "IN_GP_REVIEW",
      "waiting_minutes": 45,
      "danger_signs": ["fever", "difficulty_breathing"],
      "last_updated": "2026-02-17T10:00:00Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "last_page": 5,
    "per_page": 20,
    "total": 95,
    "from": 1,
    "to": 20
  }
}
```

**Controller:** `PatientController@index`

---

### GET /gp/my-cases

Returns paginated list of cases assigned to the current GP (IN_GP_REVIEW and UNDER_TREATMENT states).

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | string | Filter by state: `IN_GP_REVIEW`, `UNDER_TREATMENT` |
| `search` | string | Search by patient name or CPT |
| `per_page` | integer | Items per page (10-100, default 20) |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "couch_id": "session_abc123",
      "workflow_state": "IN_GP_REVIEW",
      "workflow_state_label": "GP Review",
      "triage_priority": "red",
      "chief_complaint": "Severe respiratory distress",
      "patient": {
        "cpt": "CPT-2026-00001",
        "first_name": "Chipo",
        "last_name": "R",
        "age": 4,
        "gender": "female"
      }
    }
  ],
  "pagination": {
    "current_page": 1,
    "last_page": 1,
    "per_page": 20,
    "total": 3
  }
}
```

**Controller:** `GPDashboardController@myCases`

---

### GET /gp/patients/new

Display new patient registration form.

**Response:** Inertia page render

**Controller:** `PatientController@create`

---

### POST /gp/patients

Register a new patient and create initial session.

**Request Body:**
```json
{
  "first_name": "Tariro",
  "last_name": "Moyo",
  "date_of_birth": "2023-05-20",
  "gender": "female",
  "phone": "+263712345678",
  "weight_kg": 12.5
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Patient registered successfully",
  "patient": {
    "id": 1,
    "cpt": "CPT-2026-00002",
    "couch_id": "patient_xyz789",
    "full_name": "Tariro Moyo",
    "date_of_birth": "2023-05-20",
    "gender": "female",
    "phone": "+263712345678"
  },
  "session": {
    "id": 1,
    "couch_id": "session_def456"
  },
  "redirect": "/gp/sessions/session_def456"
}
```

**Response (500):**
```json
{
  "success": false,
  "message": "Failed to register patient",
  "error": "Error message"
}
```

**Controller:** `PatientController@store`

---

### GET /gp/patients/search

Search for patients by name, CPT, or phone.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (min 2 characters) |

**Response:**
```json
{
  "success": true,
  "patients": [
    {
      "id": 1,
      "cpt": "CPT-2026-00001",
      "couch_id": "patient_abc123",
      "full_name": "Chipo R",
      "date_of_birth": "2022-03-15",
      "age": 4,
      "gender": "female",
      "phone": "+263712345678",
      "visit_count": 3
    }
  ]
}
```

**Controller:** `PatientController@search`

---

### GET /gp/patients/{identifier}

Get patient details by CPT, couch_id, or ID.

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `identifier` | string | CPT, couch_id, or numeric ID |

**Response:**
```json
{
  "success": true,
  "patient": {
    "id": 1,
    "cpt": "CPT-2026-00001",
    "couch_id": "patient_abc123",
    "full_name": "Chipo R",
    "first_name": "Chipo",
    "last_name": "R",
    "date_of_birth": "2022-03-15",
    "age": 4,
    "age_months": 48,
    "gender": "female",
    "phone": "+263712345678",
    "weight_kg": 15.2,
    "visit_count": 3,
    "last_visit_at": "2026-02-17T10:00:00Z"
  }
}
```

**Controller:** `PatientController@show`

---

## Workflow Configuration

### GET /gp/workflow/config

Returns workflow state machine configuration for frontend.

**Response:**
```json
{
  "config": {
    "states": [
      "NEW",
      "TRIAGED",
      "REFERRED",
      "IN_GP_REVIEW",
      "UNDER_TREATMENT",
      "CLOSED"
    ],
    "transitions": {
      "NEW": ["TRIAGED"],
      "TRIAGED": ["REFERRED", "UNDER_TREATMENT", "CLOSED"],
      "REFERRED": ["IN_GP_REVIEW", "CLOSED"],
      "IN_GP_REVIEW": ["UNDER_TREATMENT", "REFERRED", "CLOSED"],
      "UNDER_TREATMENT": ["CLOSED", "IN_GP_REVIEW"],
      "CLOSED": []
    },
    "transition_reasons": {
      "NEW->TRIAGED": ["assessment_completed", "vitals_recorded"],
      "TRIAGED->REFERRED": ["specialist_needed", "gp_consultation_required", "complex_case"],
      ...
    }
  }
}
```

**Controller:** `ClinicalSessionController@getWorkflowConfig`

---

## AI Integration Endpoints

### POST /api/ai/medgemma

Request AI completion for a clinical task.

**Middleware:** `AiGuard` (validates role-task permissions)

**Request Body:**
```json
{
  "task": "specialist_review",
  "sessionId": "session_abc123",
  "formInstanceId": "form_xyz789",
  "context": {
    "patient_age": 4,
    "chief_complaint": "Severe respiratory distress",
    "vitals": {...},
    "danger_signs": [...]
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "task": "specialist_review",
  "response": "Based on the clinical presentation...",
  "request_id": "ai_abc123def456",
  "metadata": {
    "prompt_version": "1.0.0",
    "model": "gemma3:4b",
    "latency_ms": 2340,
    "warnings": [],
    "was_modified": false
  }
}
```

**Response (403):**
```json
{
  "error": "Unauthorized task",
  "message": "Your role (doctor) is not authorized to perform the 'imaging_interpretation' task.",
  "allowed_tasks": ["specialist_review", "red_case_analysis", "clinical_summary", "handoff_report", "explain_triage"]
}
```

**Controller:** `MedGemmaController@__invoke`

---

### GET /api/ai/health

Check AI service health status.

**Response (200):**
```json
{
  "status": "healthy",
  "ollama": {
    "available": true,
    "model": "gemma3:4b",
    "model_loaded": true
  },
  "timestamp": "2026-02-17T12:00:00Z"
}
```

**Response (503):**
```json
{
  "status": "unhealthy",
  "ollama": {
    "available": false,
    "model": "gemma3:4b",
    "model_loaded": false
  },
  "timestamp": "2026-02-17T12:00:00Z"
}
```

**Controller:** `MedGemmaController@health`

---

### GET /api/ai/tasks

Get available AI tasks for the current user.

**Response:**
```json
{
  "role": "doctor",
  "tasks": [
    {
      "name": "specialist_review",
      "description": "Generate specialist review summary",
      "max_tokens": 1000
    },
    {
      "name": "red_case_analysis",
      "description": "Analyze RED case for specialist review",
      "max_tokens": 800
    },
    {
      "name": "clinical_summary",
      "description": "Generate clinical summary",
      "max_tokens": 600
    },
    {
      "name": "handoff_report",
      "description": "Generate SBAR-style handoff report",
      "max_tokens": 700
    },
    {
      "name": "explain_triage",
      "description": "Explain triage classification",
      "max_tokens": 500
    }
  ]
}
```

**Controller:** `MedGemmaController@tasks`

---

## Error Responses

### 401 Unauthorized

```json
{
  "message": "Unauthenticated."
}
```

### 403 Forbidden

```json
{
  "message": "This action is unauthorized."
}
```

### 404 Not Found

```json
{
  "message": "No query results for model [App\\Models\\ClinicalSession]"
}
```

### 422 Validation Error

```json
{
  "message": "The given data was invalid.",
  "errors": {
    "field_name": ["The field name is required."]
  }
}
```

### 500 Server Error

```json
{
  "message": "Server Error"
}
```

---

## Rate Limiting

| Endpoint Type | Rate Limit |
|---------------|------------|
| API endpoints | 60 requests/minute |
| AI endpoints | 30 requests/minute (configurable via `AI_RATE_LIMIT`) |

---

## WebSocket Channels

Real-time updates are broadcast via Laravel Reverb:

| Channel | Purpose |
|---------|---------|
| `gp.dashboard` | Dashboard updates for GPs |
| `referrals` | New referral notifications |
| `sessions.{couchId}` | Session-specific updates |
| `patients.{cpt}` | Patient updates |
| `ai-requests.{requestId}` | AI request status updates |

---

*Document generated from codebase analysis*  
*Date: February 17, 2026*
