# AI Audit System

The AI Audit system in HealthBridge provides comprehensive logging and review capabilities for all AI-assisted clinical interactions. This documentation describes the purpose, functionality, and usage of the AI Audit module.

## Purpose

The AI Audit system serves several critical functions in the HealthBridge GP system:

1. **Compliance & Accountability** - Track all AI-assisted clinical decisions for regulatory compliance
2. **Quality Assurance** - Review AI responses to ensure clinical appropriateness
3. **Debugging & Troubleshooting** - Investigate AI-related issues by examining prompts and responses
4. **Performance Monitoring** - Analyze AI latency, override rates, and risk flag patterns
5. **Audit Trail** - Maintain a complete history of AI interactions per patient

## Architecture

### Components

| Component | Description |
|-----------|-------------|
| **AiRequest Model** | Database model storing all AI request metadata |
| **AiAuditController** | Handles HTTP requests for viewing audit logs |
| **MedGemmaController** | Logs AI requests when processing clinical AI tasks |
| **AiAudit.vue** | Frontend page for viewing audit logs and details |

### Data Flow

```
GP Dashboard → API/AI Endpoint → MedGemmaController → AI Service
                                                      ↓
                                              AiRequest (logged)
                                                      ↓
                                        AiAuditController ← AiAudit.vue
```

## Database Schema

### AiRequest Table

| Field | Type | Description |
|-------|------|-------------|
| `id` | bigint | Primary key |
| `request_uuid` | string | Unique identifier for the request |
| `user_id` | bigint | User who initiated the request |
| `session_couch_id` | string | Clinical session CouchDB ID |
| `patient_cpt` | string | Patient CPT (Clinical Patient Token) |
| `task` | string | AI task type (triage, diagnosis, treatment, etc.) |
| `use_case` | string | Specific use case for the request |
| `prompt_version` | string | Version of the prompt template used |
| `prompt` | text | Full prompt sent to the AI |
| `response` | text | Complete AI response |
| `model` | string | AI model used (e.g., medgemma) |
| `model_version` | string | Version of the AI model |
| `latency_ms` | int | Request processing time in milliseconds |
| `was_overridden` | boolean | Whether the AI output was overridden |
| `risk_flags` | json | Array of risk flags raised |
| `requested_at` | datetime | When the request was made |

## Routes

### Web Routes

| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | `/audit/ai` | AiAuditController@index | View audit log with optional patient filter |
| GET | `/audit/ai/{id}` | AiAuditController@show | View detailed audit entry |

### Query Parameters

- `patient` - Filter by patient CouchDB ID or CPT

Example:
```
/audit/ai?patient=patient_67f3a624-4c41-45b8-9c96-7fc77c6146dc
```

## Usage

### Accessing the Audit Log

1. Navigate to the GP Dashboard
2. Click on "AI Audit" in the AI section
3. Optionally filter by patient using the query parameter

### Viewing Request Details

1. Click "View" on any row in the audit table
2. The modal displays:
   - Request metadata (UUID, timestamp, user, session)
   - Task information (task type, use case, model)
   - Performance metrics (latency)
   - Override status and risk flags
   - **Full AI Response** - The complete response from the AI
   - **Prompt** - The original prompt sent to the AI

### Filtering by Patient

The audit log supports filtering by:
- **CouchDB Patient ID** - Starts with `patient_` (e.g., `patient_67f3a624-4c41-45b8-9c96-7fc77c6146dc`)
- **CPT (Clinical Patient Token)** - 4-character alphanumeric identifier

The system automatically searches both `patient_cpt` and `session_couch_id` to find all relevant requests.

## Integration Points

### MedGemmaController Logging

All AI requests made through the MedGemma API are automatically logged:

```php
$this->logRequest([
    'user_id' => $user->id,
    'task' => $task,
    'prompt' => $promptResult['prompt'],
    'response' => $validationResult['output'],
    'context' => $context,
    // ... other fields
]);
```

### Context Builder

The `ContextBuilder` service enriches requests with patient data:

- Fetches patient demographics from CPT
- Retrieves clinical session information
- Includes form data when available
- Adds triage priority and status

## Frontend Components

### AiAudit.vue

The main audit page includes:

- **Header** - Shows current filter status and total request count
- **Filter Bar** - Displays active patient filter with clear option
- **Data Table** - Sortable columns for timestamp, user, task, model, latency, etc.
- **Details Modal** - Expandable view showing full prompt/response

### Clinical Tabs Integration

The AI Audit link is accessible from:

1. **AIExplainabilityPanel.vue** - "View AI Audit Log" button
2. **AIGuidanceTab.vue** - "View AI Audit Log" button

Both pass the current patient's CouchDB ID as the `patient` query parameter.

## Security Considerations

- Routes require authentication (`auth` middleware)
- Users must have `doctor`, `radiologist`, or `admin` role
- Sensitive data (prompts, responses) are viewable only in the detailed modal
- Audit logs are read-only (no deletion endpoint)

## Performance Notes

- Main list view excludes prompt/response for faster loading
- Details are loaded on-demand when viewing a specific request
- Pagination defaults to 50 records per page
- Indexes on `requested_at`, `patient_cpt`, and `session_couch_id` for efficient filtering

## Troubleshooting

### No Audit Records Showing

1. **Check patient filter** - Remove the `patient` query parameter to see all records
2. **Verify patient_cpt** - Ensure the patient has a valid CPT in the database
3. **Check session association** - Records may be associated via session_couch_id

### Missing Patient Information

- Older records (before fix) may not have `patient_cpt` populated
- New AI requests automatically include patient_cpt in the audit log
- Filter by session_couch_id as a fallback

### Large Response Content

- Response content uses `max-h-64` (16rem = 256px) scrollable container
- Use `whitespace-pre-wrap` for proper JSON/text formatting
