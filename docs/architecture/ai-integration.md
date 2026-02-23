# HealthBridge AI Integration Architecture

**Version:** 1.0  
**Last Updated:** February 2026  
**Status:** Authoritative Reference

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Core Services](#3-core-services)
4. [Agent System](#4-agent-system)
5. [Safety Framework](#5-safety-framework)
6. [API Reference](#6-api-reference)
7. [Configuration](#7-configuration)
8. [Mobile App Integration](#8-mobile-app-integration)

---

## 1. Overview

HealthBridge integrates AI capabilities through a **local MedGemma model** running on Ollama. The AI system provides **read-only clinical support** - it explains, educates, and summarizes, but never diagnoses, treats, or prescribes.

### What AI Provides

| Capability | Description | Example |
|------------|-------------|---------|
| **Triage Explainability** | Explains why a triage classification was assigned | "Why is this patient classified as RED?" |
| **Caregiver Education** | Generates plain-language explanations for caregivers | "What should I watch for at home?" |
| **Clinical Handover** | Creates SBAR-style handoff reports | "Generate a handover summary" |
| **Note Summary** | Summarizes clinical encounters | "Summarize this encounter" |

### What AI Must NOT Do

- ❌ Diagnose conditions
- ❌ Prescribe medication
- ❌ Recommend treatments or dosages
- ❌ Change triage classification
- ❌ Override WHO IMCI clinical rules

---

## 2. Architecture

### Request Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Vue.js/Inertia)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ PatientWorkspace│  │ AIGuidanceTab   │  │ InteractiveAI   │                 │
│  │                 │  │                 │  │ Guidance        │                 │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘                 │
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

### Hybrid Architecture

The system uses a hybrid architecture that preserves clinical-specific services while leveraging the Laravel AI SDK:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Laravel AI SDK Layer                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ ClinicalAgent   │  │ TriageAgent     │  │ TreatmentAgent  │ │
│  │ (Base Class)    │  │ (Specialized)   │  │ (Specialized)   │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           └────────────────────┼────────────────────┘           │
├────────────────────────────────┼────────────────────────────────┤
│                    Shared Services Layer                         │
│                                │                                │
│  ┌─────────────────┐  ┌────────┴────────┐  ┌─────────────────┐ │
│  │ PromptBuilder   │  │ ContextBuilder  │  │ OutputValidator │ │
│  │ (Preserved)     │  │ (Preserved)     │  │ (Preserved)     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                │                                │
│  ┌─────────────────┐  ┌────────┴────────┐  ┌─────────────────┐ │
│  │ AiCacheService  │  │ AiErrorHandler  │  │ AiRateLimiter   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
├────────────────────────────────┼────────────────────────────────┤
│                    Provider Layer                                │
│                                │                                │
│  ┌─────────────────┐  ┌────────┴────────┐  ┌─────────────────┐ │
│  │ Ollama (Local)  │  │ OpenAI (Cloud)  │  │ Anthropic       │ │
│  │ (Primary)       │  │ (Fallback)      │  │ (Fallback)      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Services

### Service Components

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

### Processing Pipeline

#### Step 1: Rate Limiting

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

#### Step 2: Cache Check

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

#### Step 3: Context Building

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

#### Step 4: Prompt Building

```php
$promptResult = $this->promptBuilder->build($task, $context);
```

**Prompt Sources:**
1. Database (`prompt_versions` table) - Version-controlled prompts
2. Default templates - Fallback hardcoded templates

#### Step 5: AI Request Execution

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

$response = $prismRequest->generate();
```

#### Step 6: Output Validation

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

---

## 4. Agent System

### Base ClinicalAgent Class

```php
// app/Ai/Agents/ClinicalAgent.php

abstract class ClinicalAgent
{
    use Promptable;
    
    public function __construct(
        protected PromptBuilder $promptBuilder,
        protected ContextBuilder $contextBuilder,
        protected OutputValidator $outputValidator,
    ) {}
    
    abstract public function instructions(): string;
    
    public function messages(): iterable
    {
        // Build context-aware messages
    }
    
    public function temperature(): float
    {
        return 0.3; // Low temperature for clinical consistency
    }
    
    public function maxTokens(): int
    {
        return 500;
    }
}
```

### Specialized Agents

#### TriageExplanationAgent

**Purpose:** Generates structured triage explanations

```php
class TriageExplanationAgent extends ClinicalAgent
{
    public function instructions(): string
    {
        return 'You are a clinical decision support AI specializing in 
                explaining triage classifications based on WHO IMCI guidelines...';
    }
    
    public function schema(JsonSchema $schema): array
    {
        return [
            'triage_category' => $schema->string()->enum(['emergency', 'urgent', 'routine', 'self_care']),
            'category_rationale' => $schema->string()->required(),
            'key_findings' => $schema->array()->required(),
            'danger_signs_present' => $schema->array(),
            'immediate_actions' => $schema->array(),
            'confidence_level' => $schema->string()->enum(['high', 'medium', 'low']),
        ];
    }
}
```

#### TreatmentReviewAgent

**Purpose:** Reviews treatment plans for safety and appropriateness

```php
class TreatmentReviewAgent extends ClinicalAgent
{
    public function instructions(): string
    {
        return 'You are a clinical decision support AI that reviews 
                treatment plans for safety, appropriateness, and guideline alignment...';
    }
}
```

### Clinical Tools

#### DosageCalculatorTool

```php
class DosageCalculatorTool implements Tool
{
    public function description(): string
    {
        return 'Calculate pediatric medication dosages based on weight';
    }
    
    public function handle(Request $request): string
    {
        return json_encode(DosageService::calculate(
            $request['medication'],
            $request['weight_kg'],
            $request['age_months']
        ));
    }
    
    public function schema(JsonSchema $schema): array
    {
        return [
            'medication' => $schema->string()->required(),
            'weight_kg' => $schema->number()->min(0.5)->max(150)->required(),
            'age_months' => $schema->integer()->min(0)->max(216)->required(),
        ];
    }
}
```

#### IMCIClassificationTool

**Purpose:** WHO IMCI classification for children 2 months - 5 years

- Cough/difficult breathing classification
- Diarrhea classification
- Fever classification
- Ear problem classification
- Measles classification
- Nutrition status assessment

---

## 5. Safety Framework

### Multi-Layer Safety Architecture

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Context Validator                     │
│  - Verifies session exists                     │
│  - Checks assessment is complete              │
│  - Confirms triage result exists               │
├─────────────────────────────────────────────────┤
│  Layer 2: Scope Guard                          │
│  - Blocks diagnostic questions                │
│  - Blocks treatment recommendations           │
├─────────────────────────────────────────────────┤
│  Layer 3: Guideline Binding                    │
│  - Uses only WHO IMCI rules                   │
│  - No hallucinated data                       │
├─────────────────────────────────────────────────┤
│  Layer 4: Risk Escalation                      │
│  - RED = Emergency banner                     │
│  - Danger signs = Immediate referral          │
├─────────────────────────────────────────────────┤
│  Layer 5: Output Filter                        │
│  - Blocks prescription language               │
│  - Blocks dosage recommendations              │
├─────────────────────────────────────────────────┤
│  Layer 6: UI Safety                            │
│  - Marked as "Clinical Support"               │
│  - Requires clinical confirmation             │
└─────────────────────────────────────────────────┘
```

### Blocked Phrases

The output validator blocks responses containing:

```php
'deny' => [
    'diagnose', 'diagnosis', 'diagnostic',
    'prescribe', 'prescription', 'prescribed',
    'dosage', 'dose', 'mg/kg',
    'treatment recommendation',
    'you should', 'you must',
    'I recommend', 'I advise',
],
```

### Response Templates

When AI cannot help:

> "I cannot make clinical decisions or recommendations. I can only explain clinical findings and provide educational information. Please consult clinical protocols for treatment decisions."

---

## 6. API Reference

### POST /api/ai/medgemma

Generate an AI completion for a clinical task.

**Authentication Required:** Yes (Sanctum token or session)

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

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

Server-Sent Events (SSE) streaming for real-time AI responses.

**Request:**
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

---

## 7. Configuration

### Environment Variables

```env
# AI Provider Configuration
AI_PROVIDER=ollama
AI_USE_SDK_AGENTS=true

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:4b

# OpenAI Fallback (Optional)
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4

# Cache Configuration
AI_CACHE_ENABLED=true
AI_CACHE_TTL=3600

# Rate Limits
AI_GLOBAL_RATE_LIMIT=200
AI_RATE_LIMIT=30

# Timeout
AI_TIMEOUT=60000
```

### Configuration File

```php
// config/ai.php

return [
    'default' => env('AI_PROVIDER', 'ollama'),

    'providers' => [
        'ollama' => [
            'driver' => 'ollama',
            'url' => env('OLLAMA_BASE_URL', 'http://localhost:11434'),
            'model' => env('OLLAMA_MODEL', 'gemma3:4b'),
        ],
        'openai' => [
            'driver' => 'openai',
            'key' => env('OPENAI_API_KEY'),
            'model' => env('OPENAI_MODEL', 'gpt-4'),
        ],
    ],

    'cache' => [
        'enabled' => env('AI_CACHE_ENABLED', true),
        'ttl' => env('AI_CACHE_TTL', 3600),
        'prefix' => 'ai_cache:',
    ],

    'rate_limits' => [
        'global_per_minute' => env('AI_GLOBAL_RATE_LIMIT', 200),
        'task_limits' => [
            'explain_triage' => 30,
            'review_treatment' => 20,
            'imci_classification' => 25,
        ],
    ],
];
```

### Policy Configuration

```php
// config/ai_policy.php

return [
    // Blocked phrases
    'deny' => [
        'diagnose', 'prescribe', 'dosage', 'treatment recommendation',
    ],

    // Warning phrases
    'warnings' => [
        'consider', 'may indicate', 'possibly',
    ],

    // Role-based task permissions
    'roles' => [
        'nurse' => ['explain_triage', 'caregiver_summary', 'symptom_checklist'],
        'doctor' => ['specialist_review', 'red_case_analysis', 'treatment_review'],
        'radiologist' => ['imaging_interpretation', 'report_drafting'],
        'manager' => ['quality_metrics', 'audit_summary'],
    ],

    // Task-specific configuration
    'tasks' => [
        'explain_triage' => [
            'description' => 'Explain triage classification to nurse',
            'max_tokens' => 500,
            'temperature' => 0.2,
        ],
    ],
];
```

---

## 8. Mobile App Integration

### Architecture

```
[ UI Components (Vue) ]
           │
           ▼
[ Composables / Services ]
           │
           ▼
[ Nuxt Server API ] ← /api/ai endpoint
           │
           ▼
[ Ollama HTTP Gateway ] ← Local inference
           │
           ▼
[ MedGemma Local Model ]
```

### Service Layer

```typescript
// app/services/clinicalAI.ts

export async function askClinicalAI(
  explainabilityRecord: ExplainabilityRecord,
  options: { useCase: AIUseCase }
): Promise<AIResponse> {
  const config = useRuntimeConfig();
  
  const response = await $fetch('/api/ai', {
    method: 'POST',
    body: {
      useCase: options.useCase,
      context: {
        patientAge: explainabilityRecord.patientAge,
        triagePriority: explainabilityRecord.triagePriority,
        findings: explainabilityRecord.findings,
      }
    },
    headers: {
      'x-ai-token': config.public.aiAuthToken
    }
  });
  
  return response;
}
```

### AI Store

```typescript
// stores/aiStore.ts

export const useAiStore = defineStore('ai', {
  state: () => ({
    isEnabled: true,
    config: {
      useAI: true,
      showExplanations: true,
      showEducation: true,
    }
  }),
  
  actions: {
    toggleAI() {
      this.isEnabled = !this.isEnabled;
    },
    
    updateConfig(newConfig: Partial<typeof this.config>) {
      this.config = { ...this.config, ...newConfig };
    }
  }
});
```

---

## Related Documentation

- [System Overview](./system-overview.md)
- [Clinical Workflow](./clinical-workflow.md)
- [API Reference](../api-reference/overview.md)
- [Troubleshooting](../troubleshooting/overview.md)
