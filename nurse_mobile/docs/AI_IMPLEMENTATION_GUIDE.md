# Clinical AI Implementation Guide

**HealthBridge Nurse Mobile Application**
**Phase 4: AI Layer Integration**

---

## Overview

This document provides a complete, step-by-step guide to implementing the clinical AI layer in HealthBridge. The AI system provides **read-only support** for nurses - it explains, educates, and summarizes, but never diagnoses, treats, or prescribes.

### What AI Provides
- Triage decision explainability
- Caregiver education generation
- Clinical handoff reports
- Session summary documentation

### What AI Must NOT Do
- ❌ Diagnose conditions
- ❌ Prescribe medication
- ❌ Recommend treatments or dosages
- ❌ Change triage classification
- ❌ Override WHO IMCI clinical rules

---

## Architecture

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

### Layer Responsibilities

| Layer | Responsibility |
|-------|---------------|
| UI Components | Display, trigger, render AI outputs |
| Composables/Services | Business logic, state management |
| Server API | Validation, rate limiting, security |
| Ollama | Local inference engine |
| MedGemma | Clinical language model |

---

## Step 1: Environment Configuration

### Create `.env` File

```env
# AI Configuration
AI_ENABLED=true
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
AI_RATE_LIMIT=30
AI_TIMEOUT=60000
AI_AUTH_TOKEN=local-dev-token
MEDGEMMA_API_KEY=HB-NURSE-001
```

### `.env.example` Reference

```env
# ============================================================================
# AI CONFIGURATION (MedGemma via Ollama)
# ============================================================================

# Enable/disable AI features
AI_ENABLED=true

# Ollama server endpoint
OLLAMA_URL=http://127.0.0.1:11434

# Model to use (medgemma:4b recommended for clinical use)
OLLAMA_MODEL=gemma3:4b

# Rate limit: max requests per minute per IP
AI_RATE_LIMIT=30

# Timeout: max request duration in milliseconds
AI_TIMEOUT=60000

# Auth token for /api/ai middleware (change in production!)
AI_AUTH_TOKEN=local-dev-token

# MedGemma API Key (REQUIRED for Ollama server authentication)
MEDGEMMA_API_KEY=HB-NURSE-001
```

> ⚠️ Do NOT commit `.env` to git.

---

## Step 2: Nuxt Configuration

### Update `nuxt.config.ts`

```ts
export default defineNuxtConfig({
  // ... existing config ...

  runtimeConfig: {
    ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'gemma3:4b',
    aiRateLimit: Number(process.env.AI_RATE_LIMIT) || 30,
    aiTimeout: Number(process.env.AI_TIMEOUT) || 60000,
    aiAuthToken: process.env.AI_AUTH_TOKEN || 'local-dev-token',

    public: {
      aiEnabled: process.env.AI_ENABLED === 'true',
      aiAuthToken: process.env.AI_AUTH_TOKEN || 'local-dev-token'
    }
  }
});
```

---

## Step 3: Server Middleware

### Authentication Middleware

**File:** `server/middleware/aiAuth.ts`

```ts
/**
 * AI Authentication Middleware
 *
 * Validates requests to AI endpoints have proper authorization
 */

export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  
  // Skip auth in development if token is default
  if (process.env.NODE_ENV === 'development' && config.aiAuthToken === 'local-dev-token') {
    return;
  }
  
  const token = getHeader(event, 'x-ai-token');

  if (token !== config.aiAuthToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized AI access'
    });
  }
});
```

### Rate Limiting Middleware

**File:** `server/middleware/rateLimit.ts`

```ts
/**
 * AI Rate Limiting Middleware
 *
 * Prevents abuse by limiting AI requests per IP address
 */

const requests = new Map<string, number[]>();

export default defineEventHandler((event) => {
  const ip = getRequestIP(event) || 'local';
  const now = Date.now();
  const window = 60_000;

  const log = requests.get(ip) || [];
  const recent = log.filter(t => now - t < window);
  recent.push(now);
  requests.set(ip, recent);

  const limit = useRuntimeConfig().aiRateLimit;
  if (recent.length > limit) {
    throw createError({
      statusCode: 429,
      statusMessage: 'AI rate limit exceeded'
    });
  }
});
```

---

## Step 4: Server Types

**File:** `server/types/ai.ts`

```ts
/**
 * AI Server Types
 *
 * Type definitions for AI API requests and responses
 */

export type AIUseCase =
  | 'EXPLAIN_TRIAGE'
  | 'CARE_EDUCATION'
  | 'CLINICAL_HANDOVER'
  | 'NOTE_SUMMARY';

export interface AIRequest {
  useCase: AIUseCase;
  payload: Record<string, unknown>;
}

export interface AIResponse {
  answer: string;
  safetyFlags: string[];
}
```

---

## Step 5: Server API Gateway

**File:** `server/api/ai.post.ts`

```ts
/**
 * AI API Gateway
 *
 * Server-side endpoint for AI requests
 * Handles Ollama communication, validation, and safety filtering
 */

import { $fetch } from 'ofetch';
import type { AIRequest, AIResponse } from '../types/ai';

const BLOCKED_PATTERNS = /prescribe|prescription|take dose|mg\/kg|mg per|ml\/kg|inject|iv drip|antibiotic prescription|diagnosis of|diagnosed with|treat with|give.*medicine|recommend.*drug/i;

const DANGEROUS_TERMS = /will die|certainly|definitely|guaranteed|no risk/i;

function validateAIOutput(text: string): { allowed: boolean; reason?: string } {
  if (BLOCKED_PATTERNS.test(text)) {
    return { allowed: false, reason: 'Output contains prescription language' };
  }

  if (DANGEROUS_TERMS.test(text)) {
    return { allowed: false, reason: 'Output contains overly certain language' };
  }

  if (text.length > 2000) {
    return { allowed: false, reason: 'Output exceeds maximum length' };
  }

  return { allowed: true };
}

export default defineEventHandler(async (event): Promise<AIResponse> => {
  const body = await readBody<AIRequest>(event);
  const config = useRuntimeConfig();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.aiTimeout);

  try {
    const res = await $fetch<{ response: string }>(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      signal: controller.signal,
      body: {
        model: config.ollamaModel,
        prompt: buildPrompt(body.useCase, body.payload),
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 512,
          top_k: 10,
          top_p: 0.9
        }
      }
    });

    clearTimeout(timeoutId);

    const text = res.response;

    if (/prescribe|dose|treatment|diagnose/i.test(text)) {
      return { answer: '', safetyFlags: ['CLINICAL_VIOLATION'] };
    }

    const safetyResult = validateAIOutput(text);
    if (!safetyResult.allowed) {
      return { answer: '', safetyFlags: ['OUTPUT_BLOCKED'] };
    }

    return { answer: text.trim(), safetyFlags: [] };
  } catch (e) {
    clearTimeout(timeoutId);
    console.error('[AI API] Ollama error:', e);
    throw createError({ statusCode: 500, statusMessage: 'AI service failed' });
  }
});

function buildPrompt(type: string, data: Record<string, unknown>): string {
  const systemPrompt = `You are a clinical support assistant for HealthBridge.
You are NOT allowed to:
- Diagnose any condition
- Prescribe medication
- Recommend specific treatments or dosages
- Change triage classification
- Override WHO IMCI clinical rules

You may only:
- Explain clinical findings in simple terms
- Summarize patient information
- Rephrase for clarity
- Provide educational information
- Suggest when to seek further care

If data is missing or unclear, say: "I cannot determine this from the available information."

Remember: You are advisory only. All clinical decisions must be made by qualified healthcare professionals.
Your responses must be concise, clear, and clinically appropriate.`;

  const useCaseInstructions: Record<string, string> = {
    EXPLAIN_TRIAGE: `Explain why this triage result occurred using simple, non-technical language.
Focus on what the observed signs mean and why they led to this classification.
Do NOT suggest any treatment or medication changes.
Do NOT provide a diagnosis.
Keep your response concise (2-3 paragraphs) and suitable for a caregiver.`,

    CARE_EDUCATION: `Explain the clinical findings and what they mean for care at home.
Describe warning signs that should prompt immediate return to a healthcare facility.
Do NOT give specific medical advice or medication instructions.
Focus on what to watch for, when to return immediately, and general comfort measures.`,

    CLINICAL_HANDOVER: `Generate a concise handover summary for another healthcare provider.
Include: chief complaint, key findings, triage classification, and recommended actions.
Do NOT add new clinical conclusions or diagnoses.
Be clinically precise and relevant.`,

    NOTE_SUMMARY: `Generate a brief summary of this patient encounter for the medical record.
Include only information documented in the clinical data.
Do not infer or add information not present.
Be concise and professional.`
  };

  return `${systemPrompt}

CLINICAL DATA:
${JSON.stringify(data, null, 2)}

TASK: ${type}
${useCaseInstructions[type] || 'Respond to the clinical data appropriately.'}`;
}
```

---

## Step 6: AI Service Layer

**File:** `app/services/clinicalAI.ts`

```ts
import { useRuntimeConfig } from '#app';
import type { AIUseCase, ExplainabilityRecord } from '~/types/explainability';
import { isAIEnabled } from './aiConfig';

const SYSTEM_GUARDRAILS = `You are a clinical support assistant for HealthBridge.
You are NOT allowed to:
- Diagnose any condition
- Prescribe medication
- Recommend specific treatments or dosages
- Change triage classification
- Override WHO IMCI clinical rules

You may only:
- Explain clinical findings in simple terms
- Summarize patient information
- Rephrase for clarity
- Provide educational information
- Suggest when to seek further care

If data is missing or unclear, say: "I cannot determine this from the available information."

Remember: You are advisory only. All clinical decisions must be made by qualified healthcare professionals.
Your responses must be concise, clear, and clinically appropriate.`;

export function buildClinicalAIPrompt(useCase: AIUseCase, explainability: ExplainabilityRecord): string {
  const baseContext = `${SYSTEM_GUARDRAILS}

CLINICAL DATA:
Triage Priority: ${explainability.classification.priority.toUpperCase()} (${explainability.classification.label})
Rule Source: ${explainability.classification.protocol}
Primary Rule: ${explainability.reasoning.primaryRule.description}
Clinical Narrative: ${explainability.reasoning.clinicalNarrative}

TRIGGERS:
${explainability.reasoning.triggers.map(t => `- ${t.value}: ${t.clinicalMeaning}`).join('\n')}

RECOMMENDED ACTIONS:
${explainability.recommendedActions.map(a => `- ${a.label}: ${a.justification}`).join('\n')}

SAFETY NOTES:
${explainability.safetyNotes.join('\n')}

INSTRUCTIONS:
`;

  switch (useCase) {
    case 'EXPLAIN_TRIAGE':
      return `${baseContext}
Explain why this triage result occurred using simple, non-technical language.
Focus on what the observed signs mean and why they led to this classification.
Do NOT suggest any treatment or medication changes.
Do NOT provide a diagnosis.
Do NOT recommend changing the triage classification.
Keep your response concise (2-3 paragraphs) and suitable for a caregiver.`;

    case 'CARE_EDUCATION':
      return `${baseContext}
Explain the clinical findings and what they mean for care at home.
Describe warning signs that should prompt immediate return to a healthcare facility.
Do NOT give specific medical advice or medication instructions.
Do NOT prescribe or recommend antibiotics or other medications.
Focus on what to watch for, when to return immediately, and general comfort measures.
Keep your response clear and actionable for caregivers.`;

    case 'CLINICAL_HANDOVER':
      return `${baseContext}
Generate a concise handover summary for another healthcare provider.
Include: chief complaint, key findings, triage classification, and recommended actions.
Do NOT add new clinical conclusions or diagnoses.
Do NOT change the triage classification.
Be clinically precise and relevant. Format as brief paragraphs suitable for medical records.`;

    case 'NOTE_SUMMARY':
      return `${baseContext}
Generate a brief summary of this patient encounter for the medical record.
Include only information documented in the clinical data.
Do not infer or add information not present.
Be concise and professional.`;

    default:
      return baseContext;
  }
}

export async function askClinicalAI(
  useCase: AIUseCase,
  explainability: ExplainabilityRecord,
  options: { timeout?: number } = {}
): Promise<string> {
  if (!isAIEnabled(useCase)) {
    throw new Error('AI feature is currently disabled');
  }

  const config = useRuntimeConfig();
  const startTime = Date.now();
  const timeout = options.timeout || 30000;
  const authToken = config.public.aiAuthToken as string;

  const prompt = buildClinicalAIPrompt(useCase, explainability);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-token': authToken
      },
      body: JSON.stringify({ useCase, payload: explainability }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error('AI service temporarily unavailable');
    }

    const data = await response.json();
    const text = data.answer as string;

    if (data.safetyFlags?.includes('CLINICAL_VIOLATION') || data.safetyFlags?.includes('OUTPUT_BLOCKED')) {
      throw new Error('AI output could not be safely generated');
    }

    console.log(`[ClinicalAI] Response generated in ${Date.now() - startTime}ms`);
    return text.trim();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI request timed out');
    }
    throw error;
  }
}

export function getAIServiceStatus(): { configured: boolean; endpoint: string; model: string } {
  return {
    configured: true,
    endpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate',
    model: process.env.AI_MODEL || 'gemma3:4b'
  };
}
```

---

## Step 7: AI Store

**File:** `app/stores/aiStore.ts`

```ts
import { defineStore } from 'pinia';
import type { AIUseCase } from '~/types/explainability';

interface AIState {
  loading: boolean;
  output: string;
  error: string;
  lastUseCase: AIUseCase | null;
  lastExplainabilityId: string | null;
}

export const useAIStore = defineStore('ai', {
  state: (): AIState => ({
    loading: false,
    output: '',
    error: '',
    lastUseCase: null,
    lastExplainabilityId: null
  }),

  getters: {
    isLoading: (state) => state.loading,
    hasOutput: (state) => !!state.output,
    hasError: (state) => !!state.error
  },

  actions: {
    start(useCase: AIUseCase, explainabilityId?: string) {
      this.loading = true;
      this.output = '';
      this.error = '';
      this.lastUseCase = useCase;
      this.lastExplainabilityId = explainabilityId || null;
    },

    success(text: string) {
      this.loading = false;
      this.output = text;
    },

    fail(message: string) {
      this.loading = false;
      this.error = message;
    },

    clear() {
      this.loading = false;
      this.output = '';
      this.error = '';
      this.lastUseCase = null;
      this.lastExplainabilityId = null;
    }
  }
});
```

---

## Step 8: Explainability Types

**File:** `app/types/explainability.ts`

```ts
export type AIUseCase = 'EXPLAIN_TRIAGE' | 'CARE_EDUCATION' | 'CLINICAL_HANDOVER' | 'NOTE_SUMMARY';

export type Priority = 'red' | 'yellow' | 'green';

export interface ExplainabilityRecord {
  id: string;
  sessionId: string;
  assessmentInstanceId: string;
  timestamp: string;

  classification: {
    priority: Priority;
    label: string;
    protocol: string;
  };

  reasoning: {
    primaryRule: {
      id: string;
      description: string;
      source: string;
    };
    triggers: {
      fieldId: string;
      value: string;
      threshold: string;
      explanation: string;
      clinicalMeaning: string;
    }[];
    clinicalNarrative: string;
  };

  recommendedActions: {
    code: string;
    label: string;
    justification: string;
    whoReference?: string;
  }[];

  safetyNotes: string[];
  confidence: number;
  dataCompleteness: number;

  aiEnhancement?: {
    used: boolean;
    useCase: AIUseCase;
    modelVersion: string;
  };
}
```

---

## Step 9: Explainability Engine

**File:** `app/services/explainabilityEngine.ts`

```ts
import type { ClinicalFormInstance } from '~/types/clinical-form';
import type { ExplainabilityRecord, Priority } from '~/types/explainability';
import { RULE_EXPLANATIONS, ACTION_LABELS } from '~/data/explainabilityMaps';

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Present' : 'Absent';
  if (typeof value === 'number') return value.toString();
  return String(value ?? 'present');
}

export function buildExplainabilityModel(
  assessment: ClinicalFormInstance,
  options: { sessionId: string; useAI?: boolean } = { sessionId: '' }
): ExplainabilityRecord | null {
  const calculated = assessment.calculated;
  if (!calculated?.matchedTriageRule) return null;

  const rule = calculated.matchedTriageRule;
  const priority = calculated.triagePriority as Priority;

  const triggers = ((calculated.ruleMatches || []) as { ruleId: string; condition: string; matched: boolean; value?: unknown }[])
    .filter(r => r.matched)
    .map(r => {
      const explanation = RULE_EXPLANATIONS[r.ruleId];
      return {
        fieldId: r.ruleId,
        value: formatValue(r.value),
        threshold: 'WHO IMCI threshold',
        explanation: explanation?.description || r.condition,
        clinicalMeaning: explanation?.clinicalMeaning || r.condition
      };
    });

  const recommendedActions = (rule.actions as string[]).map(code => {
    const action = ACTION_LABELS[code];
    return {
      code,
      label: action?.label || code,
      justification: action?.justification || 'Based on triage classification',
      whoReference: action?.whoReference
    };
  });

  return {
    id: generateId(),
    sessionId: options.sessionId,
    assessmentInstanceId: 'assessment-record',
    timestamp: new Date().toISOString(),
    classification: {
      priority,
      label: getPriorityLabel(priority),
      protocol: 'WHO_IMCI'
    },
    reasoning: {
      primaryRule: { id: rule.id, description: RULE_EXPLANATIONS[rule.id]?.description || rule.id, source: 'WHO_IMCI' },
      triggers,
      clinicalNarrative: generateNarrative(priority, triggers)
    },
    recommendedActions,
    safetyNotes: [
      'Derived from WHO IMCI guidelines',
      'This is rule-based, not AI-generated',
      'Actions must be clinically confirmed',
      'Escalate if patient condition worsens'
    ],
    confidence: 1.0,
    dataCompleteness: 1.0,
    aiEnhancement: options.useAI ? { used: true, useCase: 'EXPLAIN_TRIAGE', modelVersion: 'medgemma:4b' } : undefined
  };
}

function generateNarrative(priority: Priority, triggers: { clinicalMeaning: string }[]): string {
  const priorityText = { red: 'emergency', yellow: 'urgent', green: 'non-urgent' }[priority];
  if (triggers.length === 0) return `Patient classified as ${priority.toUpperCase()} (${priorityText}) based on clinical assessment.`;
  const meaningList = triggers.map(t => t.clinicalMeaning);
  return `Patient classified as ${priority.toUpperCase()} (${priorityText}) because: ${meaningList.join(', ')}.`;
}

function getPriorityLabel(priority: Priority): string {
  return { red: 'Emergency - Immediate Action Required', yellow: 'Urgent - Prompt Attention Needed', green: 'Non-Urgent - Standard Care' }[priority];
}

export function getClinicalTermDefinition(term: string): string {
  const clinicalTerms: Record<string, string> = {
    cyanosis: 'bluish discoloration indicating low oxygen in blood',
    retractions: 'chest muscles pulling in when breathing - sign of respiratory distress',
    lethargic: 'unusually sleepy, difficult to wake',
    unconscious: 'not awake, not responding to stimuli',
    convulsions: 'involuntary muscle spasms (seizures)',
    tachypnea: 'abnormally rapid breathing',
    chest_indrawing: 'skin pulling into chest wall when breathing in',
    nasal_flaring: 'nostrils widening when breathing',
    grunting: 'sound made when breathing out - sign of respiratory distress',
    hypoxemia: 'low oxygen level in blood',
    dehydration: 'loss of body fluids'
  };
  return clinicalTerms[term.toLowerCase()] || 'Clinical term';
}
```

---

## Step 10: UI Integration Examples

### Assessment Page

```vue
<script setup lang="ts">
import { useAIStore } from '~/stores/aiStore';
import ExplainabilityCard from '~/components/clinical/ExplainabilityCard.vue';
import { buildExplainabilityModel } from '~/services/explainabilityEngine';

const aiStore = useAIStore();
const explainabilityRecord = ref<ExplainabilityRecord | null>(null);
const showExplainability = ref(false);

function buildExplainability() {
  if (!instance.value || !aiStore.isEnabled) return;
  const record = buildExplainabilityModel(instance.value, { sessionId: sessionId.value });
  explainabilityRecord.value = record;
  showExplainability.value = !!record;
}

watch([() => instance.value?.calculated, () => aiStore.isEnabled], buildExplainability, { deep: true });
</script>

<template>
  <div v-if="showExplainability && explainabilityRecord">
    <ExplainabilityCard :model="explainabilityRecord" />
  </div>
</template>
```

### Treatment Page (Caregiver Education)

```vue
<script setup lang="ts">
import { askClinicalAI } from '~/services/clinicalAI';
import { useAIStore } from '~/stores/aiStore';

const aiStore = useAIStore();
const caregiverEducation = ref('');
const isGeneratingEducation = ref(false);

async function generateCaregiverEducation() {
  if (!explainabilityRecord.value || !aiStore.isEnabled) return;
  isGeneratingEducation.value = true;
  try {
    const response = await askClinicalAI('CARE_EDUCATION', explainabilityRecord.value);
    caregiverEducation.value = response;
  } finally {
    isGeneratingEducation.value = false;
  }
}
</script>

<template>
  <div v-if="aiStore.isEnabled && explainabilityRecord" class="bg-blue-900/20 border border-blue-700/50 rounded-xl p-6">
    <h3 class="text-lg font-semibold text-white mb-4">Caregiver Education</h3>
    <button @click="generateCaregiverEducation" :disabled="isGeneratingEducation" class="px-4 py-2 bg-blue-600 text-white rounded-lg">
      {{ isGeneratingEducation ? 'Generating...' : 'Generate Explanation' }}
    </button>
    <div v-if="caregiverEducation" class="mt-4 text-gray-300">{{ caregiverEducation }}</div>
    <p v-if="caregiverEducation" class="text-xs text-gray-500 mt-2">
      AI-generated. Please review for accuracy before sharing with caregivers.
    </p>
  </div>
</template>
```

### Discharge Page (Summary & Handoff)

```vue
<script setup lang="ts">
import { askClinicalAI } from '~/services/clinicalAI';
import { useAIStore } from '~/stores/aiStore';

const aiStore = useAIStore();
const dischargeSummary = ref('');
const handoffReport = ref('');

async function generateDischargeSummary() {
  if (!explainabilityRecord.value || !aiStore.isEnabled) return;
  dischargeSummary.value = await askClinicalAI('NOTE_SUMMARY', explainabilityRecord.value);
}

async function generateHandoffReport() {
  if (!explainabilityRecord.value || !aiStore.isEnabled) return;
  handoffReport.value = await askClinicalAI('CLINICAL_HANDOVER', explainabilityRecord.value);
}
</script>

<template>
  <div v-if="aiStore.isEnabled && explainabilityRecord" class="mt-6 pt-6 border-t border-gray-700">
    <h4 class="text-md font-semibold text-white mb-4">AI Clinical Summary</h4>
    <div class="flex gap-2 mb-4">
      <button @click="generateDischargeSummary" class="px-4 py-2 bg-blue-600 text-white rounded-lg">Generate Summary</button>
      <button @click="generateHandoffReport" class="px-4 py-2 bg-purple-600 text-white rounded-lg">Generate Handoff</button>
    </div>
    <div v-if="dischargeSummary" class="bg-gray-700/30 rounded-lg p-4 text-gray-300">{{ dischargeSummary }}</div>
    <div v-if="handoffReport" class="bg-purple-900/20 border border-purple-700/50 rounded-lg p-4 text-gray-300 mt-4">{{ handoffReport }}</div>
  </div>
</template>
```

---

## Step 11: Ollama Setup

### Install and Run Ollama

```bash
# Pull the MedGemma model
ollama pull gemma3:4b

# Start Ollama server
ollama serve
```

### Verify Connection

```bash
# Test Ollama is running
curl http://localhost:11434/api/tags

# Should return model list including medgemma:4b
```

---

## Step 12: Safety Rules

All AI integrations must include these safety measures:

1. **AI Enable/Disable**: Controlled by `aiStore.isEnabled` and `AI_ENABLED` env var
2. **Read-Only**: AI only explains, never suggests treatments
3. **Scope Guard**: Blocks out-of-scope requests (diagnoses, prescriptions)
4. **Output Filter**: Removes prescription language from outputs
5. **Disclaimers**: All AI output includes warning text

### Required Disclaimer

```
AI-generated. Please review for accuracy before sharing with caregivers.
```

### Security Guarantees

- ✅ No cloud calls
- ✅ All inference local
- ✅ Guardrail filters
- ✅ Auth header required
- ✅ Rate limits enforced
- ✅ No PHI leaves machine

---

## Files Reference

| File | Purpose |
|------|---------|
| `.env` | Environment variables (not committed) |
| `nuxt.config.ts` | Runtime configuration |
| `server/middleware/aiAuth.ts` | Request authentication |
| `server/middleware/rateLimit.ts` | Rate limiting |
| `server/types/ai.ts` | Server type definitions |
| `server/api/ai.post.ts` | API endpoint |
| `app/services/clinicalAI.ts` | AI service layer |
| `app/stores/aiStore.ts` | AI state management |
| `app/types/explainability.ts` | Explainability types |
| `app/services/explainabilityEngine.ts` | Rule-based explainability |
| `app/components/clinical/ExplainabilityCard.vue` | UI component |

---

## Testing Checklist

- [ ] Ollama server running with MedGemma model
- [ ] Dev server starts without errors
- [ ] AI toggle in settings works
- [ ] ExplainabilityCard displays after triage
- [ ] Caregiver education generates correctly
- [ ] Discharge summary generates correctly
- [ ] Handoff report generates correctly
- [ ] Safety filters block prescription language
- [ ] Rate limiting triggers at 30 requests/minute

---

## Troubleshooting

### MedGemma API Key Not Configured
If you get authentication errors when calling Ollama, you need to set the MedGemma API key:

1. Add to your `.env` file:
   ```
   MEDGEMMA_API_KEY=HB-NURSE-001
   ```

2. The API key is sent with every Ollama request as:
   ```
   Authorization: Bearer HB-NURSE-001
   ```

3. Restart the dev server after updating `.env`

### 401 Unauthorized Error
- Check `AI_AUTH_TOKEN` in `.env` matches server config
- Restart dev server after config changes

### Ollama Connection Failed
- Verify Ollama is running: `ollama serve`
- Check `OLLAMA_URL` in `.env`
- Test: `curl http://localhost:11434/api/tags`

### AI Output Blocked
- Check if output contains blocked words (prescribe, diagnose, etc.)
- Review server logs for safety flag details

---

*Document Version: 1.0*
*Last Updated: February 9, 2026*
