# HealthBridge AI Integration - Technical Architecture

## Overview

This document provides a detailed technical explanation of the AI interaction process flow within HealthBridge, including data input, processing, and response handling for clinical decision support.

---

## Summary

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `MedGemmaController` | `app/Http/Controllers/Api/Ai/` | Main AI request orchestrator |
| `ContextBuilder` | `app/Services/Ai/` | Gathers patient/session context |
| `PromptBuilder` | `app/Services/Ai/` | Constructs prompts from templates |
| `OutputValidator` | `app/Services/Ai/` | Validates AI responses |
| `AiCacheService` | `app/Services/Ai/` | Intelligent response caching |
| `AiRateLimiter` | `app/Services/Ai/` | Multi-level rate limiting |
| `AiErrorHandler` | `app/Services/Ai/` | Error categorization and recovery |
| `AiMonitor` | `app/Services/Ai/` | Metrics collection |
| `DosageCalculatorTool` | `app/Ai/Tools/` | Pediatric dosage calculations |
| `IMCIClassificationTool` | `app/Ai/Tools/` | IMCI classification support |

### Request Flow Summary

1. **Frontend** → POST `/api/ai/medgemma` with task, patient_id, and context
2. **Middleware** → Auth, AI guard, rate limiting
3. **Controller** → Orchestrates the processing pipeline
4. **Rate Limiter** → Checks per-user, per-task, and global limits
5. **Cache** → Returns cached response if available
6. **Context Builder** → Gathers patient data from database
7. **Prompt Builder** → Constructs prompt from template
8. **AI Provider** → Sends request to Ollama/Gemma
9. **Output Validator** → Validates and sanitizes response
10. **Response** → Returns structured JSON to frontend

### Database Tables

| Table | Purpose |
|-------|---------|
| `ai_requests` | Logs all AI requests with prompts, responses, and metadata |
| `prompt_versions` | Version-controlled prompt templates |

### Related Documentation

- [Clinical Workflow & Data Architecture](./CLINICAL_WORKFLOW_DATA_ARCHITECTURE.md)
- [AI SDK Migration Guide](./AI_SDK_MIGRATION.md)
- [Architecture High-Level](./ARCHITECTURE_HIGHLEVEL.md)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Vue.js/Inertia)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ PatientWorkspace│  │ AIGuidanceTab   │  │ InteractiveAI   │                 │
│  │                 │  │                 │  │ Guidance        │                 │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘                 │
│           │                    │                    │                           │
│           └────────────────────┼────────────────────┘                           │
│                                │                                                │
│                                ▼                                                │
│                    POST /api/ai/medgemma                                        │
│                    {task, patient_id, context}                                  │
└────────────────────────────────┼────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY (Laravel Routes)                            │
│  Route::post('/api/ai/medgemma', MedGemmaController::class)                     │
│  Middleware: ['auth', 'ai.guard', 'throttle:ai']                                │
└────────────────────────────────┼────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       MedGemmaController (Phase 4)                              │
│                                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Rate Limiter │→ │ Cache Check  │→ │ Context Build│→ │ Prompt Build │        │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                │                │
│                                                                ▼                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Error Handler│← │ Output Valid │← │ AI Provider  │← │ Prism Request│        │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                │                │
│                                                                ▼                │
│                    ┌──────────────┐  ┌──────────────┐                          │
│                    │ Monitor Log  │  │ Cache Store  │                          │
│                    └──────────────┘  └──────────────┘                          │
└─────────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         AI PROVIDER (Ollama/Gemma)                              │
│  Local LLM inference using Ollama with MedGemma model                           │
│  Model: gemma3:4b (configurable)                                                │
│  Endpoint: http://localhost:11434/api/generate                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Request Flow

### 1. Frontend Request Initiation

**Location:** `resources/js/components/gp/PatientWorkspace.vue`

```typescript
const handleAITask = async (task: string) => {
    const response = await fetch('/api/ai/medgemma', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken,
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            task,                    // e.g., 'explain_triage'
            patient_id: props.patient.id,
            context: {
                triage_color: props.patient.triage_color,
                danger_signs: props.patient.danger_signs,
                vitals: mergedVitals.value,
            },
        }),
    });
    
    const data = await response.json();
    // Handle response...
};
```

### 2. API Route Definition

**Location:** `routes/web.php`

```php
Route::middleware(['auth', 'ai.guard', 'throttle:ai'])
    ->prefix('api/ai')
    ->group(function () {
        Route::post('/medgemma', MedGemmaController::class);
        Route::get('/health', [MedGemmaController::class, 'health']);
        Route::get('/tasks', [MedGemmaController::class, 'tasks']);
    });
```

**Middleware Stack:**
- `auth` - Ensures user is authenticated
- `ai.guard` - Validates AI access permissions and sets user role
- `throttle:ai` - Rate limiting for AI requests

---

## Core Services

### MedGemmaController

**Location:** `app/Http/Controllers/Api/Ai/MedGemmaController.php`

The main controller orchestrating AI requests. Phase 4 implementation includes:

| Service | Purpose |
|---------|---------|
| `PromptBuilder` | Constructs prompts from templates and context |
| `ContextBuilder` | Gathers patient/session data for context |
| `OutputValidator` | Validates and sanitizes AI responses |
| `OllamaClient` | Legacy direct Ollama API client |
| `AiCacheService` | Intelligent response caching |
| `AiErrorHandler` | Error categorization and recovery |
| `AiRateLimiter` | Multi-level rate limiting |
| `AiMonitor` | Metrics collection and monitoring |

### Task Types

```php
protected array $taskAgents = [
    'explain_triage' => TriageExplanationAgent::class,
    'review_treatment' => TreatmentReviewAgent::class,
];

protected array $taskSchemas = [
    'explain_triage' => 'triageExplanation',
    'review_treatment' => 'treatmentReview',
    'imci_classification' => 'imciClassification',
];

protected array $streamableTasks = [
    'explain_triage',
    'review_treatment',
    'clinical_assistance',
];
```

---

## Processing Pipeline

### Step 1: Rate Limiting

**Service:** `AiRateLimiter`

```php
$rateLimitResult = $this->rateLimiter->attempt($task, $user->id, $userRole);
if (!$rateLimitResult['allowed']) {
    return response()->json([
        'success' => false,
        'error' => 'Rate limit exceeded',
        'retry_after' => $rateLimitResult['retry_after'],
    ], 429);
}
```

**Rate Limit Tiers:**
- Per-user limits (requests per minute)
- Per-task limits (task-specific throttling)
- Global system limits (overall capacity)

### Step 2: Cache Check

**Service:** `AiCacheService`

```php
$cacheKey = $this->cacheService->generateKey($task, $context, $request->all());
$cachedResponse = $this->cacheService->get($cacheKey, $task);

if ($cachedResponse !== null) {
    return response()->json([
        'success' => true,
        'response' => $cachedResponse['response'],
        'metadata' => ['from_cache' => true],
    ]);
}
```

**Cache Strategy:**
- Context-aware cache keys (includes patient context hash)
- Task-specific TTL (configurable per task type)
- Stale-while-revalidate for error recovery
- Non-cacheable tasks: `emergency_assessment`, `critical_alert`

### Step 3: Context Building

**Service:** `ContextBuilder`

```php
$context = $this->contextBuilder->build($task, $request->all());
```

**Context Data Sources:**

| Source | Data Included |
|--------|---------------|
| `patients` | Demographics, age, gender, weight, visit history |
| `clinical_sessions` | Triage priority, chief complaint, workflow state |
| `clinical_forms` | Vitals, danger signs, assessment data |
| `referrals` | Referral reason, clinical notes |

**Example Context Output:**
```php
[
    'patient_id' => 'patient_67f3a624',
    'patient_name' => 'John Doe',
    'age' => 5,
    'age_months' => 60,
    'gender' => 'male',
    'weight_kg' => 18.5,
    'triage_priority' => 'yellow',
    'chief_complaint' => 'Fever and cough',
    'danger_signs' => ['chest_indrawing', 'fast_breathing'],
    'vitals' => [
        'rr' => 45,  // Respiratory rate
        'hr' => 120, // Heart rate
        'temp' => 38.5,
        'spo2' => 94,
    ],
]
```

### Step 4: Prompt Building

**Service:** `PromptBuilder`

```php
$promptResult = $this->promptBuilder->build($task, $context);
```

**Prompt Sources:**
1. Database (`prompt_versions` table) - Version-controlled prompts
2. Default templates - Fallback hardcoded templates

**Template Interpolation:**
```php
protected function interpolate(string $template, array $context): string
{
    foreach ($context as $key => $value) {
        $template = str_replace("{{{$key}}}", $value, $template);
    }
    return $template;
}
```

**Example Prompt Template:**
```
You are a clinical decision support AI. Analyze the following patient:

PATIENT: {{patient_name}}
AGE: {{age}} years ({{age_months}} months)
GENDER: {{gender}}
WEIGHT: {{weight_kg}} kg

CHIEF COMPLAINT: {{chief_complaint}}
TRIAGE PRIORITY: {{triage_priority}}

DANGER SIGNS: {{danger_signs}}
VITALS: {{vitals}}

Provide a structured triage explanation...
```

### Step 5: AI Request Execution

**Using Laravel AI SDK Prism:**

```php
$prismRequest = Prism::request()
    ->using(Provider::Ollama)
    ->withModel(config('ai.providers.ollama.model', 'gemma3:4b'))
    ->withPrompt($promptResult['prompt'])
    ->withTemperature($promptResult['metadata']['temperature'] ?? 0.3)
    ->withMaxTokens($promptResult['metadata']['max_tokens'] ?? 500);

// Add structured output schema if applicable
if (isset($this->taskSchemas[$task])) {
    $prismRequest = $this->applyStructuredOutput($prismRequest, $task);
}

// Add tools if applicable
$prismRequest = $this->applyTools($prismRequest, $task);

// Execute
$response = $prismRequest->generate();
$content = $response->content;
```

### Step 6: Output Validation

**Service:** `OutputValidator`

```php
$validationResult = $this->outputValidator->fullValidation(
    $content,
    $task,
    $userRole
);
```

**Validation Layers:**

| Layer | Purpose |
|-------|---------|
| Schema Validation | Ensures structured output matches expected schema |
| Content Filtering | Removes potentially harmful content |
| Clinical Safety | Flags dangerous recommendations |
| PII Detection | Prevents exposure of sensitive data |

**Validation Result Structure:**
```php
[
    'valid' => true,
    'output' => 'Validated response text...',
    'blocked' => [],           // Blocked content items
    'risk_flags' => [],        // Risk indicators
    'warnings' => ['...'],     // Non-blocking warnings
]
```

### Step 7: Response Logging

**Database Table:** `ai_requests`

```php
$aiRequest = $this->logRequest([
    'user_id' => $user->id,
    'task' => $task,
    'prompt' => $promptResult['prompt'],
    'response' => $validationResult['output'],
    'model' => config('ai.providers.ollama.model'),
    'latency_ms' => $latencyMs,
    'was_overridden' => !$validationResult['valid'],
    'risk_flags' => $validationResult['risk_flags'],
    'context' => $context,
    'metadata' => [
        'provider' => 'prism',
        'structured_output' => true,
    ],
]);
```

### Step 8: Cache Storage

```php
if ($validationResult['valid'] && empty($validationResult['blocked'])) {
    $this->cacheService->put($cacheKey, $responseData, $task);
}
```

### Step 9: Monitoring

**Service:** `AiMonitor`

```php
$this->monitor->recordRequest([
    'task' => $task,
    'user_id' => $user->id,
    'success' => true,
    'latency_ms' => $latencyMs,
    'from_cache' => false,
    'validation_passed' => $validationResult['valid'],
]);
```

---

## Response Structure

### Standard Response

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
        "recommended_investigations": ["Chest X-Ray", "CBC"],
        "referral_recommendation": "within_24h",
        "confidence_level": "high"
    },
    "structured": true,
    "request_id": "req_abc123",
    "conversation_id": "conv_xyz789",
    "metadata": {
        "provider": "prism",
        "model": "gemma3:4b",
        "latency_ms": 1250,
        "from_cache": false,
        "warnings": []
    }
}
```

### Error Response

```json
{
    "success": false,
    "error": "Rate limit exceeded",
    "category": "rate_limit",
    "severity": "warning",
    "retry_after": 60
}
```

---

## Structured Output Schemas

### Triage Explanation Schema

```php
'explain_triage' => [
    'type' => 'object',
    'required' => ['triage_category', 'category_rationale', 'key_findings', 'confidence_level'],
    'properties' => [
        'triage_category' => [
            'type' => 'string',
            'enum' => ['emergency', 'urgent', 'routine', 'self_care'],
        ],
        'category_rationale' => [
            'type' => 'string',
            'description' => 'Explanation of why this category was assigned',
        ],
        'key_findings' => [
            'type' => 'array',
            'items' => ['type' => 'string'],
        ],
        'danger_signs_present' => [
            'type' => 'array',
            'items' => ['type' => 'string'],
        ],
        'immediate_actions' => [
            'type' => 'array',
            'items' => ['type' => 'string'],
        ],
        'confidence_level' => [
            'type' => 'string',
            'enum' => ['high', 'medium', 'low'],
        ],
    ],
]
```

### Treatment Review Schema

```php
'review_treatment' => [
    'type' => 'object',
    'required' => ['treatment_appropriate', 'appropriateness_rationale', 'medication_review'],
    'properties' => [
        'treatment_appropriate' => [
            'type' => 'boolean',
        ],
        'appropriateness_rationale' => [
            'type' => 'string',
        ],
        'medication_review' => [
            'type' => 'array',
            'items' => [
                'type' => 'object',
                'properties' => [
                    'medication' => ['type' => 'string'],
                    'dose_appropriate' => ['type' => 'boolean'],
                    'frequency_appropriate' => ['type' => 'boolean'],
                    'concerns' => ['type' => 'array', 'items' => ['type' => 'string']],
                ],
            ],
        ],
        'drug_interactions' => [
            'type' => 'array',
            'items' => ['type' => 'string'],
        ],
        'requires_physician_review' => [
            'type' => 'boolean',
        ],
    ],
]
```

---

## AI Tools

### DosageCalculatorTool

**Location:** `app/Ai/Tools/DosageCalculatorTool.php`

Calculates pediatric medication dosages based on weight and age.

```php
public function execute(array $params): array
{
    $weight = $params['weight_kg'];
    $medication = $params['medication'];
    
    // Calculate weight-based dosage
    $dosePerKg = $this->getDosePerKg($medication);
    $calculatedDose = $weight * $dosePerKg;
    
    return [
        'medication' => $medication,
        'calculated_dose' => $calculatedDose,
        'unit' => 'mg',
        'frequency' => $this->getFrequency($medication),
        'max_dose' => $this->getMaxDose($medication),
    ];
}
```

### IMCIClassificationTool

**Location:** `app/Ai/Tools/IMCIClassificationTool.php`

Provides IMCI (Integrated Management of Childhood Illness) classification.

```php
public function execute(array $params): array
{
    $ageMonths = $params['age_months'];
    $symptoms = $params['symptoms'];
    $dangerSigns = $params['danger_signs'];
    
    // Apply IMCI algorithm
    $classification = $this->classify($ageMonths, $symptoms, $dangerSigns);
    
    return [
        'classification' => $classification['class'],
        'severity' => $classification['severity'],
        'recommended_treatment' => $classification['treatment'],
        'referral_criteria' => $classification['referral'],
    ];
}
```

---

## Streaming Support

### Server-Sent Events (SSE)

**Endpoint:** `GET/POST /api/ai/stream`

```php
public function stream(Request $request)
{
    return response()->stream(function () use ($request) {
        $stream = $prismRequest->stream();
        
        foreach ($stream as $chunk) {
            echo "data: " . json_encode([
                'chunk' => $chunk->content,
                'done' => false,
            ]) . "\n\n";
            
            flush();
        }
        
        echo "data: " . json_encode(['done' => true]) . "\n\n";
    }, 200, [
        'Content-Type' => 'text/event-stream',
        'Cache-Control' => 'no-cache',
        'Connection' => 'keep-alive',
    ]);
}
```

**Frontend Consumption:**
```typescript
const eventSource = new EventSource('/api/ai/stream?task=explain_triage&...');
eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.done) {
        eventSource.close();
    } else {
        accumulatedText += data.chunk;
    }
};
```

---

## Error Handling

### Error Categories

| Category | Description | Recovery Strategy |
|----------|-------------|-------------------|
| `rate_limit` | Too many requests | Wait and retry |
| `provider_error` | AI provider unavailable | Fallback to legacy client |
| `validation_error` | Output validation failed | Return with warnings |
| `context_error` | Missing required context | Return error to user |
| `timeout` | Request timeout | Retry with exponential backoff |

### Recovery Strategies

```php
// Fallback to legacy client
if ($errorResult['recovery_strategy'] === 'fallback') {
    return $this->handleWithLegacyClient($request, $task, $user, $userRole, $startTime);
}

// Return stale cache
if ($errorResult['recovery_strategy'] === 'cache') {
    $staleCache = $this->cacheService->getStale($cacheKey, $task);
    if ($staleCache !== null) {
        return response()->json($staleCache);
    }
}
```

---

## Database Tables

### `ai_requests` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint | Primary key |
| `request_uuid` | string | Unique request identifier |
| `user_id` | foreignId | User making the request |
| `session_couch_id` | string | Related clinical session |
| `form_couch_id` | string | Related clinical form |
| `task` | string | AI task type |
| `prompt` | text | Full prompt sent to AI |
| `response` | text | AI response |
| `model` | string | Model used |
| `provider` | string | Provider (ollama, openai, etc.) |
| `latency_ms` | integer | Response time |
| `status` | enum | pending, completed, failed |
| `was_overridden` | boolean | Was response modified by validation |
| `risk_flags` | json | Risk indicators |
| `context` | json | Request context |
| `metadata` | json | Additional metadata |

---

## Configuration

### AI Policy Configuration

**File:** `config/ai_policy.php`

```php
return [
    'default_provider' => 'ollama',
    'default_model' => 'gemma3:4b',
    
    'providers' => [
        'ollama' => [
            'endpoint' => env('OLLAMA_ENDPOINT', 'http://localhost:11434'),
            'model' => env('OLLAMA_MODEL', 'gemma3:4b'),
        ],
    ],
    
    'tasks' => [
        'explain_triage' => [
            'max_tokens' => 600,
            'temperature' => 0.3,
            'cache_ttl' => 3600,
        ],
        'review_treatment' => [
            'max_tokens' => 800,
            'temperature' => 0.2,
            'cache_ttl' => 1800,
        ],
    ],
    
    'non_cacheable_tasks' => [
        'emergency_assessment',
        'critical_alert',
    ],
];
```

---

## Security Considerations

### Input Sanitization

- All patient data is sanitized before inclusion in prompts
- PII is masked or excluded where possible
- Context is validated against expected schema

### Output Filtering

- Clinical safety checks prevent dangerous recommendations
- Content filtering removes inappropriate content
- Structured output ensures predictable response format

### Access Control

- `ai.guard` middleware validates AI access permissions
- Role-based task restrictions (e.g., some tasks only for doctors)
- Rate limiting prevents abuse

---

## Related Documentation

- [Clinical Workflow & Data Architecture](./CLINICAL_WORKFLOW_DATA_ARCHITECTURE.md)
- [AI SDK Migration Guide](./AI_SDK_MIGRATION.md)
- [Architecture High-Level](./ARCHITECTURE_HIGHLEVEL.md)
