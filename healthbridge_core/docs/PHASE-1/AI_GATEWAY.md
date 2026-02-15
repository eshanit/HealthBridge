# AI Gateway Documentation

**Version:** 1.0.0  
**Created:** February 15, 2026  
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Configuration](#3-configuration)
4. [API Reference](#4-api-reference)
5. [Services](#5-services)
6. [Security & Safety](#6-security--safety)
7. [Role-Based Access Control](#7-role-based-access-control)
8. [Rate Limiting](#8-rate-limiting)
9. [Error Handling](#9-error-handling)
10. [Testing](#10-testing)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Overview

The HealthBridge AI Gateway provides a secure, role-based interface to the MedGemma AI model running on Ollama. It enforces clinical safety policies, validates all AI output, and maintains a complete audit trail of all AI interactions.

### Key Features

- **Role-Based Task Authorization**: Different user roles have access to different AI tasks
- **Output Validation**: Blocks dangerous phrases and validates clinical appropriateness
- **Prompt Management**: Supports both default prompts and versioned prompts from the database
- **Context Building**: Automatically fetches patient and session data for context
- **Rate Limiting**: Prevents abuse with configurable rate limits
- **Full Audit Trail**: All requests logged to the `ai_requests` table

---

## 2. Architecture

### Request Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   AiGuard   │────▶│  Controller │────▶│   Ollama    │
│  (Mobile/   │     │ Middleware  │     │             │     │   Client    │
│    Web)     │     │             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                   │                    │
                           │                   ▼                    │
                           │           ┌─────────────┐             │
                           │           │   Prompt    │             │
                           │           │  Builder    │             │
                           │           └─────────────┘             │
                           │                   │                    │
                           │                   ▼                    │
                           │           ┌─────────────┐             │
                           │           │  Context    │             │
                           │           │  Builder    │             │
                           │           └─────────────┘             │
                           │                                       │
                           │                   ┌───────────────────┘
                           │                   ▼
                           │           ┌─────────────┐
                           │           │   Output    │
                           │           │  Validator  │
                           │           └─────────────┘
                           │                   │
                           ▼                   ▼
                    ┌─────────────────────────────┐
                    │        Audit Logging        │
                    │    (ai_requests table)      │
                    └─────────────────────────────┘
```

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| OllamaClient | `app/Services/Ai/OllamaClient.php` | HTTP client for Ollama API |
| PromptBuilder | `app/Services/Ai/PromptBuilder.php` | Builds prompts from templates |
| ContextBuilder | `app/Services/Ai/ContextBuilder.php` | Fetches patient/session context |
| OutputValidator | `app/Services/Ai/OutputValidator.php` | Safety validation and sanitization |
| AiGuard | `app/Http/Middleware/AiGuard.php` | Role-based task authorization |
| MedGemmaController | `app/Http/Controllers/Api/Ai/MedGemmaController.php` | Main API controller |

---

## 3. Configuration

### Environment Variables

Add the following to your `.env` file:

```env
# Ollama / AI Gateway
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=medgemma:27b
OLLAMA_TIMEOUT=60
AI_GATEWAY_SECRET=hb_internal_key
AI_RATE_LIMIT=30
```

| Variable | Description | Default |
|----------|-------------|---------|
| `OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Default model to use | `medgemma:27b` |
| `OLLAMA_TIMEOUT` | Request timeout in seconds | `60` |
| `AI_GATEWAY_SECRET` | Internal API secret | - |
| `AI_RATE_LIMIT` | Requests per minute per user | `30` |

### Policy Configuration

The AI policy is defined in `config/ai_policy.php`:

```php
return [
    // Blocked phrases - responses containing these are rejected/sanitized
    'deny' => [
        'diagnose',
        'prescribe',
        'dosage',
        // ...
    ],

    // Warning phrases - flagged but not blocked
    'warnings' => [
        'consider',
        'may indicate',
        // ...
    ],

    // Role-based task permissions
    'roles' => [
        'nurse' => ['explain_triage', 'caregiver_summary', 'symptom_checklist'],
        'doctor' => ['specialist_review', 'red_case_analysis', ...],
        // ...
    ],

    // Task-specific configuration
    'tasks' => [
        'explain_triage' => [
            'description' => 'Explain triage classification to nurse',
            'max_tokens' => 500,
            'temperature' => 0.2,
        ],
        // ...
    ],
];
```

---

## 4. API Reference

### POST /api/ai/medgemma

Generate an AI completion for a clinical task.

**Authentication Required**: Yes (Sanctum token)

**Headers**:
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body**:
```json
{
    "task": "explain_triage",
    "context": {
        "sessionId": "sess_8F2A9",
        "patientCpt": "CP-7F3A-9B2C",
        "triagePriority": "yellow",
        "findings": ["fast_breathing", "chest_indrawing"]
    }
}
```

**Success Response** (200):
```json
{
    "success": true,
    "task": "explain_triage",
    "response": "**Clinical Decision Support - Explain triage classification...**",
    "request_id": "ai_a1b2c3d4e5f6...",
    "metadata": {
        "prompt_version": "1.0.0",
        "model": "medgemma:27b",
        "latency_ms": 2340,
        "warnings": [],
        "was_modified": false
    }
}
```

**Error Responses**:

| Status | Error | Description |
|--------|-------|-------------|
| 401 | Unauthenticated | No valid authentication token |
| 403 | Unauthorized task | User's role not authorized for this task |
| 400 | Missing task | No task specified in request |
| 400 | Invalid task | Task not configured in system |
| 429 | Rate limit exceeded | Too many requests |
| 503 | AI generation failed | Ollama service unavailable |

### GET /api/ai/health

Check the health of the AI service.

**Response** (200):
```json
{
    "status": "healthy",
    "ollama": {
        "available": true,
        "model": "medgemma:27b",
        "model_loaded": true
    },
    "timestamp": "2026-02-15T12:00:00Z"
}
```

### GET /api/ai/tasks

Get available AI tasks for the current user.

**Response** (200):
```json
{
    "role": "nurse",
    "tasks": [
        {
            "name": "explain_triage",
            "description": "Explain triage classification to nurse",
            "max_tokens": 500
        },
        {
            "name": "caregiver_summary",
            "description": "Generate plain-language summary for caregivers",
            "max_tokens": 400
        }
    ]
}
```

---

## 5. Services

### OllamaClient

Custom HTTP client for Ollama API communication.

```php
use App\Services\Ai\OllamaClient;

$client = new OllamaClient();

// Generate completion
$result = $client->generate('Your prompt here', [
    'temperature' => 0.3,
    'max_tokens' => 500,
]);

// Check availability
$isAvailable = $client->isAvailable();

// Get available models
$models = $client->getModels();

// Check if specific model exists
$hasModel = $client->hasModel('medgemma:27b');

// Pull a model
$success = $client->pullModel('medgemma:27b');
```

### PromptBuilder

Builds prompts from templates with context interpolation.

```php
use App\Services\Ai\PromptBuilder;

$builder = new PromptBuilder();

$result = $builder->build('explain_triage', [
    'age' => '2 years',
    'gender' => 'male',
    'chiefComplaint' => 'Cough and fever',
    'findings' => 'Fast breathing, chest indrawing',
    'triagePriority' => 'yellow',
]);

// Returns:
// [
//     'prompt' => '...',
//     'version' => '1.0.0', // or 'default'
//     'metadata' => [...]
// ]
```

### ContextBuilder

Fetches patient and session data from MySQL for context.

```php
use App\Services\Ai\ContextBuilder;

$builder = new ContextBuilder();

$context = $builder->build('explain_triage', [
    'context' => [
        'sessionId' => 'sess_8F2A9',
        'patientCpt' => 'CP-7F3A-9B2C',
    ]
]);

// Returns enriched context with patient data, session data, form data, etc.
```

### OutputValidator

Validates AI output for safety and appropriateness.

```php
use App\Services\Ai\OutputValidator;

$validator = new OutputValidator();

// Full validation
$result = $validator->fullValidation(
    $aiOutput,
    'explain_triage',
    'nurse'
);

// Returns:
// [
//     'valid' => true/false,
//     'output' => 'sanitized output',
//     'warnings' => [...],
//     'blocked' => [...],
//     'risk_flags' => [...]
// ]
```

---

## 6. Security & Safety

### Blocked Phrases

The following phrases are blocked from AI output:

| Phrase | Reason |
|--------|--------|
| `diagnose` | AI cannot make diagnoses |
| `prescribe` | AI cannot prescribe |
| `dosage` | AI cannot recommend dosages |
| `replace doctor` | AI cannot replace medical professionals |
| `definitive treatment` | AI cannot recommend definitive treatments |
| `you should` | Avoids directive language |
| `you must` | Avoids directive language |
| `I recommend` | AI cannot make recommendations |
| `the treatment is` | Avoids definitive treatment statements |
| `take this medication` | AI cannot give medication instructions |
| `stop taking` | AI cannot modify medication regimens |

### Warning Phrases

These phrases trigger warnings but don't block the response:

- `consider`
- `may indicate`
- `possible`
- `suggestive of`
- `could be`
- `might be`

### Hallucination Detection

The validator checks for potential hallucination indicators:

- Overconfident medical claims ("definitely", "certainly")
- Specific dosage recommendations
- Fabricated references ("according to study 2024")

### Safety Framing

All valid responses are wrapped with safety framing:

```
**Clinical Decision Support - [Task Description]**

[AI Response]

---
*This is clinical decision support information. All decisions should be verified by qualified medical staff.*
```

---

## 7. Role-Based Access Control

### Task Permissions by Role

| Role | Allowed Tasks |
|------|---------------|
| `nurse` | `explain_triage`, `caregiver_summary`, `symptom_checklist` |
| `senior-nurse` | All nurse tasks + `treatment_review` |
| `doctor` | `specialist_review`, `red_case_analysis`, `clinical_summary`, `handoff_report`, `explain_triage` |
| `radiologist` | `imaging_interpretation`, `xray_analysis` |
| `dermatologist` | `skin_lesion_analysis`, `rash_assessment` |
| `manager` | (none - managers see dashboards only) |
| `admin` | (none - admins manage the system) |

### Task Descriptions

| Task | Description | Max Tokens | Temperature |
|------|-------------|------------|-------------|
| `explain_triage` | Explain triage classification to nurse | 500 | 0.2 |
| `caregiver_summary` | Generate plain-language summary for caregivers | 400 | 0.3 |
| `symptom_checklist` | Generate symptom checklist based on chief complaint | 300 | 0.2 |
| `treatment_review` | Review treatment plan for completeness | 600 | 0.2 |
| `specialist_review` | Generate specialist review summary | 1000 | 0.3 |
| `red_case_analysis` | Analyze RED case for specialist review | 800 | 0.2 |
| `clinical_summary` | Generate clinical summary | 600 | 0.3 |
| `handoff_report` | Generate SBAR-style handoff report | 700 | 0.3 |
| `imaging_interpretation` | Text-based imaging interpretation support | 800 | 0.2 |
| `xray_analysis` | Text-based X-ray analysis support | 800 | 0.2 |
| `skin_lesion_analysis` | Text-based skin lesion analysis support | 600 | 0.2 |
| `rash_assessment` | Text-based rash assessment support | 600 | 0.2 |

---

## 8. Rate Limiting

### Configuration

Rate limiting is configured in `app/Providers/AppServiceProvider.php`:

```php
RateLimiter::for('ai', function (Request $request) {
    $limit = config('ai_policy.rate_limit', 30);
    
    return Limit::perMinute($limit)
        ->by($request->user()?->id ?: $request->ip());
});
```

### Rate Limit Response

When the rate limit is exceeded:

```json
{
    "success": false,
    "error": "Rate limit exceeded",
    "message": "Too many AI requests. Please wait before trying again."
}
```

HTTP Status: 429

---

## 9. Error Handling

### Error Categories

| Category | HTTP Status | Description |
|----------|-------------|-------------|
| Authentication | 401 | Invalid or missing auth token |
| Authorization | 403 | User role not authorized for task |
| Validation | 400 | Invalid or missing request data |
| Rate Limit | 429 | Too many requests |
| Service | 503 | Ollama service unavailable |

### Logging

All errors are logged to the Laravel log:

```php
Log::error('OllamaClient: Request failed', [
    'status' => $response->status(),
    'body' => $response->body(),
]);
```

### Audit Trail

All AI requests are logged to the `ai_requests` table:

| Field | Description |
|-------|-------------|
| `request_uuid` | Unique identifier for the request |
| `user_id` | ID of the user who made the request |
| `task` | The AI task performed |
| `prompt` | The full prompt sent to the model |
| `response` | The AI response (after validation) |
| `prompt_version` | Version of the prompt template used |
| `model` | The model that generated the response |
| `latency_ms` | Request latency in milliseconds |
| `was_overridden` | Whether the response was modified by safety system |
| `risk_flags` | Any risk flags identified |
| `requested_at` | Timestamp of the request |

---

## 10. Testing

### Feature Tests

Located in `tests/Feature/AiGatewayTest.php`:

```bash
# Run all AI gateway tests
php artisan test --filter=AiGatewayTest

# Run specific test
php artisan test --filter="test_nurse_can_access_allowed_tasks"
```

### Test Categories

1. **Authentication Tests**
   - Unauthenticated user cannot access
   - Missing task returns error

2. **Authorization Tests**
   - Nurse can access allowed tasks
   - Nurse cannot access doctor-only tasks
   - Doctor can access specialist tasks
   - Manager cannot access any AI tasks

3. **Validation Tests**
   - Invalid task returns error
   - Blocked phrases are sanitized
   - Warning phrases are flagged

4. **Service Tests**
   - Prompt builder creates prompts
   - Context builder fetches data
   - Hallucination detection works

### Mocking Ollama

For testing without Ollama running:

```php
Http::fake([
    'localhost:11434/api/generate' => Http::response([
        'response' => 'Test AI response',
        'model' => 'medgemma:27b',
    ]),
]);
```

---

## 11. Troubleshooting

### Common Issues

#### Ollama Connection Failed

**Symptoms**: 503 error, "AI generation failed"

**Solutions**:
1. Check if Ollama is running:
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. Verify the model is available:
   ```bash
   ollama list
   ```

3. Pull the model if needed:
   ```bash
   ollama pull medgemma:27b
   ```

#### Rate Limit Exceeded

**Symptoms**: 429 error

**Solutions**:
1. Wait for the rate limit window to reset (1 minute)
2. Increase rate limit in `.env`:
   ```env
   AI_RATE_LIMIT=60
   ```

#### Task Not Authorized

**Symptoms**: 403 error, "Unauthorized task"

**Solutions**:
1. Check user's role:
   ```php
   $user->getRoleNames();
   ```

2. Verify task is in role's allowed tasks in `config/ai_policy.php`

#### Response Modified by Safety System

**Symptoms**: Response contains `[REDACTED]`

**Solutions**:
1. Check the `blocked` array in response metadata
2. Review the blocked phrases in `config/ai_policy.php`
3. Adjust the prompt template if needed

### Debug Mode

Enable debug logging:

```env
LOG_LEVEL=debug
```

Check logs:
```bash
tail -f storage/logs/laravel.log
```

### Health Check

Use the health endpoint to verify system status:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/ai/health
```

---

## Appendix A: Prompt Templates

### Default Templates

Default prompt templates are defined in `PromptBuilder.php`. Each task has a specific template designed for clinical use.

### Custom Templates

To create a custom prompt template:

1. Insert into `prompt_versions` table:
   ```sql
   INSERT INTO prompt_versions (task, version, prompt_template, is_active, model, temperature, max_tokens)
   VALUES ('explain_triage', '1.1.0', 'Your custom prompt with {{placeholders}}', true, 'medgemma:27b', 0.2, 500);
   ```

2. The system will automatically use the active version for that task.

---

## Appendix B: Migration Guide

### Upgrading from Previous Versions

If upgrading from a previous version:

1. Run migrations:
   ```bash
   php artisan migrate
   ```

2. Clear cache:
   ```bash
   php artisan config:clear
   php artisan cache:clear
   ```

3. Update `.env` with new variables

4. Restart workers:
   ```bash
   php artisan queue:restart
   ```

---

*Last updated: February 2026*  
*HealthBridge Clinical Platform*
