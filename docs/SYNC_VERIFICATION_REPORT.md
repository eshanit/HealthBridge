# CouchDB to MySQL Sync Verification Report

## Executive Summary

This report documents the verification of the CouchDB to MySQL synchronization logic to ensure all AI-generated content created by nurses for patients is correctly captured in MySQL session data, with proper attribution to the nurse or frontline worker who created it.

**Status: ✅ VERIFIED AND ENHANCED**

---

## Issues Identified and Resolved

### 1. Missing User Attribution in Clinical Sessions

**Problem:** The `clinical_sessions` table lacked columns to track which nurse/frontline worker created the session.

**Solution:**
- Added migration `2026_02_17_000001_add_user_tracking_to_clinical_tables.php`
- Added `created_by_user_id` foreign key column
- Added `provider_role` column to track the role (nurse, chw, etc.)

**Files Modified:**
- [`healthbridge_core/database/migrations/2026_02_17_000001_add_user_tracking_to_clinical_tables.php`](healthbridge_core/database/migrations/2026_02_17_000001_add_user_tracking_to_clinical_tables.php)
- [`healthbridge_core/app/Models/ClinicalSession.php`](healthbridge_core/app/Models/ClinicalSession.php)
- [`healthbridge_core/app/Services/SyncService.php`](healthbridge_core/app/Services/SyncService.php)

### 2. Missing User Attribution in Clinical Forms

**Problem:** The `clinical_forms` table lacked columns to track which nurse/frontline worker filled out the form.

**Solution:**
- Added `created_by_user_id` foreign key column
- Added `creator_role` column to track the role

**Files Modified:**
- [`healthbridge_core/app/Models/ClinicalForm.php`](healthbridge_core/app/Models/ClinicalForm.php)
- [`healthbridge_core/app/Services/SyncService.php`](healthbridge_core/app/Services/SyncService.php)

### 3. Missing User Attribution in AI Requests

**Problem:** The `ai_requests` table had `user_id` and `role` columns, but the sync service wasn't extracting these from CouchDB documents.

**Solution:**
- Updated `SyncService::syncAiLog()` to extract `userId`, `requestedBy`, and `role` fields from CouchDB documents

**Files Modified:**
- [`healthbridge_core/app/Services/SyncService.php`](healthbridge_core/app/Services/SyncService.php)

### 4. Missing Form Section Tracking in AI Requests

**Problem:** AI requests were linked to forms but not to specific sections within forms, making it difficult to trace AI responses to their exact context.

**Solution:**
- Added migration `2026_02_17_000002_add_form_section_tracking_to_ai_requests.php`
- Added `form_section_id` column to track the specific form section
- Added `form_field_id` column to track the specific field that triggered AI
- Added `form_schema_id` column to track the form schema type

**Files Modified:**
- [`healthbridge_core/database/migrations/2026_02_17_000002_add_form_section_tracking_to_ai_requests.php`](healthbridge_core/database/migrations/2026_02_17_000002_add_form_section_tracking_to_ai_requests.php)
- [`healthbridge_core/app/Models/AiRequest.php`](healthbridge_core/app/Models/AiRequest.php)
- [`healthbridge_core/app/Services/SyncService.php`](healthbridge_core/app/Services/SyncService.php)
- [`healthbridge_core/app/Http/Controllers/Api/Ai/MedGemmaController.php`](healthbridge_core/app/Http/Controllers/Api/Ai/MedGemmaController.php)

---

## Data Flow Verification

### CouchDB Document Fields → MySQL Columns

| CouchDB Field | MySQL Table | MySQL Column | Description |
|---------------|-------------|--------------|-------------|
| `createdBy` / `providerId` | `clinical_sessions` | `created_by_user_id` | User who created the session |
| `providerRole` | `clinical_sessions` | `provider_role` | Role (nurse, chw, doctor) |
| `createdBy` / `filledBy` | `clinical_forms` | `created_by_user_id` | User who filled the form |
| `creatorRole` / `filledByRole` | `clinical_forms` | `creator_role` | Role of form creator |
| `userId` / `requestedBy` | `ai_requests` | `user_id` | User who requested AI |
| `role` / `userRole` | `ai_requests` | `role` | Role of AI requester |
| `formSectionId` / `sectionId` | `ai_requests` | `form_section_id` | Form section context |
| `formFieldId` / `fieldId` | `ai_requests` | `form_field_id` | Specific field that triggered AI |
| `formSchemaId` / `schemaId` | `ai_requests` | `form_schema_id` | Form schema type |

### User ID Resolution

The `SyncService::resolveUserId()` method handles multiple user ID formats:

1. **Integer ID** - Direct MySQL user ID (stored directly)
2. **String Numeric ID** - Converted to integer
3. **UUID/Email** - Looked up in users table

---

## Model Relationships

### ClinicalSession
```php
// Get the nurse/worker who created this session
$session->createdBy; // Returns User model

// Get all AI requests for this session
$session->aiRequests; // Returns collection of AiRequest models
```

### ClinicalForm
```php
// Get the nurse/worker who filled this form
$form->createdBy; // Returns User model

// Get all AI requests for this form
$form->aiRequests; // Returns collection of AiRequest models
```

### AiRequest
```php
// Get the nurse/worker who requested AI assistance
$aiRequest->user; // Returns User model

// Get the session this AI request belongs to
$aiRequest->session; // Returns ClinicalSession model

// Get the form this AI request belongs to
$aiRequest->form; // Returns ClinicalForm model
```

### User
```php
// Get all sessions created by this user
$user->createdSessions;

// Get all forms created by this user
$user->createdForms;

// Get all AI requests made by this user
$user->aiRequests;
```

---

## Querying AI Requests by Context

### By Session
```php
$aiRequests = AiRequest::bySession('session:abc123')->get();
```

### By Form Section
```php
$aiRequests = AiRequest::byFormSection('vital_signs')->get();
```

### By Form Schema
```php
$aiRequests = AiRequest::byFormSchema('peds_respiratory')->get();
```

### Combined Query
```php
$aiRequests = AiRequest::bySession('session:abc123')
    ->byFormSection('triage')
    ->with(['user', 'session', 'form'])
    ->get();
```

---

## Example: Tracing AI Content to Nurse

To trace AI-generated content back to the nurse who requested it:

```php
// Get an AI request
$aiRequest = AiRequest::find($id);

// Get the nurse who requested it
$nurse = $aiRequest->user;

// Get the session context
$session = $aiRequest->session;

// Get the patient
$patient = $session->patient;

// Full context
echo "AI request {$aiRequest->task} was made by {$nurse->name} ({$aiRequest->role}) "
   . "for patient {$patient->cpt} during session {$session->session_uuid} "
   . "in form section {$aiRequest->form_section_id}";
```

---

## Required CouchDB Document Fields

For proper user attribution, mobile apps should include the following fields when creating documents:

### Clinical Session
```json
{
  "type": "clinicalSession",
  "createdBy": 5,           // User ID from MySQL
  "providerRole": "nurse",  // Role of the provider
  ...
}
```

### Clinical Form
```json
{
  "type": "clinicalForm",
  "createdBy": 5,           // User ID from MySQL
  "creatorRole": "nurse",   // Role of the form filler
  ...
}
```

### AI Log
```json
{
  "type": "aiLog",
  "userId": 5,              // User ID from MySQL
  "role": "nurse",          // Role of the requester
  "sessionId": "session:abc123",
  "formInstanceId": "form:xyz789",
  "formSectionId": "vital_signs",
  "formFieldId": "respiratory_rate",
  "formSchemaId": "peds_respiratory",
  ...
}
```

---

## Migration Instructions

To apply the new migrations:

```bash
cd healthbridge_core
php artisan migrate
```

The migrations will:
1. Add `created_by_user_id` and `provider_role` columns to `clinical_sessions`
2. Add `created_by_user_id` and `creator_role` columns to `clinical_forms`
3. Add `form_section_id`, `form_field_id`, and `form_schema_id` columns to `ai_requests`
4. Create foreign key constraints to the `users` table
5. Add indexes for efficient querying

---

## Testing Recommendations

### Unit Tests

1. **Test user ID resolution:**
   - Integer IDs are returned directly
   - String numeric IDs are converted
   - Unknown IDs return null

2. **Test sync methods:**
   - `syncSession()` extracts user fields
   - `syncForm()` extracts user fields
   - `syncAiLog()` extracts user and section fields

### Integration Tests

1. **Create a session via CouchDB proxy:**
   - Verify `created_by_user_id` is populated in MySQL
   - Verify relationship to user exists

2. **Create a form via CouchDB proxy:**
   - Verify `created_by_user_id` is populated in MySQL
   - Verify relationship to user exists

3. **Request AI assistance:**
   - Verify `user_id` and `role` are populated in MySQL
   - Verify `form_section_id` is captured
   - Verify relationship to user exists

---

## Conclusion

The synchronization logic has been enhanced to properly capture and store nurse/frontline worker attribution data. All AI-generated content can now be traced back to:

1. **The healthcare worker** who requested it
2. **The clinical session** it belongs to
3. **The specific form section** that triggered the AI request
4. **The specific form field** that was being filled

This provides:

1. **Audit Trail** - Full accountability for AI-assisted clinical decisions
2. **Quality Assurance** - Ability to review AI usage patterns by provider
3. **Compliance** - Meeting healthcare documentation requirements
4. **Analytics** - Ability to analyze AI usage by role, provider, section, etc.
5. **Debugging** - Ability to trace AI responses to their exact context

---

*Report generated: 2026-02-17*
