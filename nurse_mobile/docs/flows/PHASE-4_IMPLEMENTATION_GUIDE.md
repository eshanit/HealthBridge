# Phase 4: AI Layer Implementation Guide

**Project:** HealthBridge Nurse Mobile App  
**Phase:** 4 - AI Clinical Support Layer  
**Version:** 1.0  
**Date:** February 9, 2026  
**Status:** Implementation Planning

---

## Executive Summary

Phase 4 introduces a **read-only AI support layer** to HealthBridge. The AI system is designed to **explain, educate, summarize, and assist with handover text**—never to diagnose, prescribe, or override clinical rules.

### Core Constraints (Non-Negotiable)

| Constraint | Description |
|------------|-------------|
| **Read-Only AI** | AI never changes triage, treatment, or medication recommendations |
| **WHO-Aligned** | All AI outputs must reference WHO IMCI guidelines |
| **Explainable** | Every AI output must be traceable to clinical data |
| **Safe by Design** | Multiple safety layers prevent harmful outputs |
| **Auditable** | All AI interactions logged for clinical governance |

### Feasibility Assessment: ✅ COMPLETELY FEASIBLE

All Phase 4 components are implementable with current technology:
- Ollama provides local LLM serving (no external API dependencies)
- Explainability model is a well-defined data structure
- UI components follow standard Vue patterns
- Safety rules are enforceable through code and policy

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PHASE 4 ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      UI LAYER                               │    │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │    │
│  │  │Explainability │  │   AI Output   │  │   AI Chat    │   │    │
│  │  │    Card       │  │    Card       │  │   Component  │   │    │
│  │  └───────────────┘  └───────────────┘  └───────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   EXPLAINABILITY ENGINE                     │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │           ExplainabilityModel                        │    │    │
│  │  │  - Priority classification                           │    │    │
│  │  │  - Reasoning chain                                   │    │    │
│  │  │  - Triggers                                          │    │    │
│  │  │  - Recommended actions                               │    │    │
│  │  │  - Safety notes                                      │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    CLINICAL AI SERVICE                      │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │              askClinicalAI()                         │    │    │
│  │  │  - System guardrails                                 │    │    │
│  │  │  - Prompt builder                                    │    │    │
│  │  │  - Ollama integration                                │    │    │
│  │  │  - Safety filter                                     │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    SAFETY LAYER                             │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌────────┐  │    │
│  │  │  Context  │  │  Scope    │  │Guideline  │  │Risk    │  │    │
│  │  │ Validator │  │  Guard    │  │  Binder   │  │Escalat.│  │    │
│  │  └───────────┘  └───────────┘  └───────────┘  └────────┘  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   OLLAMA SERVER (Local)                     │    │
│  │                    Model: medgemma:4b                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Patient Assessment Data
         │
         ▼
┌─────────────────────┐
│  Rule Engine        │  ← Existing triage logic (unchanged)
│  (WHO IMCI)         │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Triage Result       │  ← Priority: red/yellow/green
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Explainability      │  ← Build explainability model
│ Engine              │    from triage result
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Explainability      │  ← Structured explainability record
│ Record              │    with reasoning chain
└─────────────────────┘
         │
         ├──────────────────────────────────────┐
         │                                      │
         ▼                                      ▼
┌─────────────────────┐            ┌─────────────────────┐
│ UI: Explainability  │            │ AI: askClinicalAI() │
│ Card                │            │ - Explain triage    │
         │               │            │ - Care education   │
         │               │            │ - Handover summary │
         ▼               │            │ - Note summary     │
┌─────────────────────┐            └─────────────────────┘
│ Clinical Display    │                       │
│ - Why (triggers)    │                       │
│ - What (guideline)  │                       ▼
│ - How (actions)     │            ┌─────────────────────┐
│ - Safety (notes)    │            │ Safety Filter       │
└─────────────────────┘            │ - Block prescriptions│
                                    │ - Block diagnoses   │
                                    │ - Enforce guardrails│
                                    └─────────────────────┘
```

---

## Component 1: Clinical AI Service

### Assessment: ✅ IMPLEMENTABLE

The Ollama + MedGemma approach is viable:
- **Ollama**: Local LLM serving (no cloud dependencies)
- **MedGemma**: Clinical-focused model (Google's medical LLM)
- **Local Processing**: Data stays on hospital network
- **System Prompts**: Enforce safety guardrails

### Implementation Location
```
app/services/clinicalAI.ts
```

### Use Cases

| Use Case | Description | Output |
|----------|-------------|--------|
| `EXPLAIN_TRIAGE` | Explain why triage result occurred | Plain-language explanation |
| `CARE_EDUCATION` | Education for caregivers | Warning signs, when to return |
| `CLINICAL_HANDOVER` | Doctor handover summary | Concise clinical summary |
| `NOTE_SUMMARY` | Session record summary | Patient-friendly summary |

### Service Code

```typescript
// app/services/clinicalAI.ts

export type AIUseCase =
  | 'EXPLAIN_TRIAGE'
  | 'CARE_EDUCATION'
  | 'CLINICAL_HANDOVER'
  | 'NOTE_SUMMARY';

const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate';
const MODEL = process.env.AI_MODEL || 'medgemma:4b';

// System guardrails - CRITICAL for safety
const SYSTEM_GUARDRAILS = `
You are a clinical support assistant for HealthBridge.
You are NOT allowed to:
- Diagnose any condition
- Prescribe medication
- Recommend specific treatments
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
`;

// Blocking patterns for safety filter
const BLOCKED_PATTERNS = /prescribe|take dose|mg\/kg|mg per|ml\/kg|inject|iv drip|antibiotic prescription|diagnosis of|diagnosed with/i;

export function buildPrompt(useCase: AIUseCase, explainabilityModel: ExplainabilityModel): string {
  const basePrompt = `${SYSTEM_GUARDRAILS}

CLINICAL DATA:
${JSON.stringify(explainabilityModel, null, 2)}

INSTRUCTIONS:
`;

  switch (useCase) {
    case 'EXPLAIN_TRIAGE':
      return `${basePrompt}
Explain why this triage result occurred using simple language.
Focus on what the triggers mean and what they indicate.
Do NOT suggest any treatment or medication.
Do NOT provide a diagnosis.

Respond in a clear, non-technical manner suitable for a caregiver.`;

    case 'CARE_EDUCATION':
      return `${basePrompt}
Explain the clinical findings and what they mean for care at home.
Describe warning signs that should prompt immediate return to a healthcare facility.
Do NOT give specific medical advice or medication instructions.
Do NOT prescribe or recommend antibiotics or other medications.

Focus on: when to worry, when to return, general care tips.`;

    case 'CLINICAL_HANDOVER':
      return `${basePrompt}
Summarize this case for handover to another healthcare provider.
Include: chief complaint, key findings, triage classification, and recommended actions.
Do NOT add new clinical conclusions or diagnoses.
Do NOT change the triage classification.
Be concise and clinically relevant.`;

    case 'NOTE_SUMMARY':
      return `${basePrompt}
Generate a brief summary of this patient encounter for the medical record.
Include only information documented in the clinical data.
Do not infer or add information not present.`;

    default:
      return basePrompt;
  }
}

export async function askClinicalAI(
  useCase: AIUseCase,
  explainabilityModel: ExplainabilityModel
): Promise<string> {
  const prompt = buildPrompt(useCase, explainabilityModel);

  try {
    const response = await fetch(OLLAMA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.3, // Lower temperature for consistent outputs
          num_predict: 512, // Limit response length
          top_k: 10,
          top_p: 0.9
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[ClinicalAI] Ollama error:', error);
      throw new Error('AI service temporarily unavailable');
    }

    const data = await response.json();
    const text = data.response as string;

    // Safety filter
    if (BLOCKED_PATTERNS.test(text)) {
      console.warn('[ClinicalAI] Output blocked by safety filter');
      throw new Error('AI output could not be safely generated');
    }

    return text.trim();
  } catch (error) {
    console.error('[ClinicalAI] Request failed:', error);
    throw error;
  }
}

// Configuration for admin
export function getAIConfig() {
  return {
    endpoint: OLLAMA_ENDPOINT,
    model: MODEL,
    isConfigured: !!OLLAMA_ENDPOINT && !!MODEL
  };
}
```

### AI Store (Pinia)

```typescript
// app/stores/aiStore.ts
import { defineStore } from 'pinia';

interface AIState {
  loading: boolean;
  output: string;
  error: string;
  lastUseCase: AIUseCase | null;
}

export const useAIStore = defineStore('ai', {
  state: (): AIState => ({
    loading: false,
    output: '',
    error: '',
    lastUseCase: null
  }),

  actions: {
    start(useCase: AIUseCase) {
      this.loading = true;
      this.output = '';
      this.error = '';
      this.lastUseCase = useCase;
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
    }
  }
});
```

---

## Component 2: Explainability Model

### Assessment: ✅ IMPLEMENTABLE

The ExplainabilityModel is a well-structured data contract that:
- Builds on existing triage schema
- Is deterministic (derived from clinical data)
- Is auditable (stored with session)
- Is safe (cannot "hallucinate" new data)

### Implementation Location
```
app/types/explainability.ts
app/services/explainabilityEngine.ts
app/data/explainabilityMaps.ts
```

### Type Definitions

```typescript
// app/types/explainability.ts

export type Priority = 'red' | 'yellow' | 'green';
export type RuleSource = 'WHO_IMCI' | 'LocalProtocol' | 'Calculation';

export interface ExplainabilityRecord {
  // Identification
  id: string;
  sessionId: string;
  assessmentInstanceId: string;
  timestamp: string;

  // Classification
  classification: {
    priority: Priority;
    label: string;
    protocol: 'WHO_IMCI';
  };

  // Reasoning
  reasoning: {
    primaryRule: {
      id: string;
      description: string;
      source: RuleSource;
    };

    triggers: Array<{
      fieldId: string;
      value: string | number | boolean;
      threshold?: string;
      explanation: string;
      clinicalMeaning: string;
    }>;

    clinicalNarrative: string;
  };

  // Actions
  recommendedActions: Array<{
    code: string;
    label: string;
    justification: string;
    whoReference?: string;
  }>;

  // Safety
  safetyNotes: string[];

  // Confidence & Metadata
  confidence: number; // 0-1, typically 1.0 for rule-based
  dataCompleteness: number; // 0-1, percent of required fields present
  aiEnhancement?: {
    used: boolean;
    useCase: string;
    modelVersion?: string;
  };
}

// Static clinical knowledge maps
export interface RuleExplanation {
  id: string;
  description: string;
  whoReference?: string;
  clinicalMeaning: string;
}

export interface ActionLabel {
  code: string;
  label: string;
  justification: string;
  whoReference?: string;
}
```

### Explainability Engine

```typescript
// app/services/explainabilityEngine.ts
import type { ClinicalFormInstance } from '~/types/clinical-form';
import type { ExplainabilityRecord, Priority } from '~/types/explainability';
import { RULE_EXPLANATIONS, ACTION_LABELS } from '~/data/explainabilityMaps';
import { v4 as uuid } from 'uuid';

export function buildExplainabilityModel(
  assessment: ClinicalFormInstance,
  options: { sessionId: string; useAI?: boolean; aiOutput?: string } = { sessionId: '' }
): ExplainabilityRecord | null {
  const calculated = assessment.calculated;
  
  if (!calculated?.matchedTriageRule) {
    return null;
  }

  const rule = calculated.matchedTriageRule;
  const priority = calculated.triagePriority as Priority;

  // Build triggers from rule matches
  const triggers = (calculated.ruleMatches || [])
    .filter(r => r.matched)
    .map(r => ({
      fieldId: r.ruleId,
      value: r.value ?? 'present',
      threshold: 'WHO IMCI threshold',
      explanation: RULE_EXPLANATIONS[r.ruleId]?.description || r.condition,
      clinicalMeaning: RULE_EXPLANATIONS[r.ruleId]?.clinicalMeaning || r.condition
    }));

  // Build reasoning chain
  const reasoningChain = buildReasoningChain(priority, triggers);

  // Build actions
  const recommendedActions = rule.actions.map(code => ({
    code,
    label: ACTION_LABELS[code]?.label || code,
    justification: ACTION_LABELS[code]?.justification || 'Based on triage classification',
    whoReference: ACTION_LABELS[code]?.whoReference
  }));

  // Calculate data completeness
  const dataCompleteness = calculateDataCompleteness(assessment);

  return {
    id: uuid(),
    sessionId: options.sessionId,
    assessmentInstanceId: assessment.instanceId,
    timestamp: new Date().toISOString(),

    classification: {
      priority,
      label: getPriorityLabel(priority),
      protocol: 'WHO_IMCI'
    },

    reasoning: {
      primaryRule: {
        id: rule.id,
        description: RULE_EXPLANATIONS[rule.id]?.description || rule.id,
        source: 'WHO_IMCI'
      },
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

    confidence: 1.0, // Rule-based = full confidence
    dataCompleteness,

    aiEnhancement: options.useAI ? {
      used: true,
      useCase: 'EXPLAIN_TRIAGE',
      modelVersion: 'medgemma:4b'
    } : undefined
  };
}

function buildReasoningChain(
  priority: Priority,
  triggers: ExplainabilityRecord['reasoning']['triggers']
): ExplainabilityRecord['reasoning']['triggers'] {
  // Add clinical context to triggers
  return triggers.map(t => ({
    ...t,
    explanation: `${t.value} → ${t.clinicalMeaning}`
  }));
}

function generateNarrative(
  priority: Priority,
  triggers: ExplainabilityRecord['reasoning']['triggers']
): string {
  const priorityText = {
    red: 'emergency',
    yellow: 'urgent',
    green: 'non-urgent'
  }[priority];

  if (triggers.length === 0) {
    return `Patient classified as ${priority.toUpperCase()} (${priorityText}) based on clinical assessment.`;
  }

  const triggerList = triggers.map(t => t.clinicalMeaning).join(', ');
  return `Patient classified as ${priority.toUpperCase()} (${priorityText}) because: ${triggerList}.`;
}

function getPriorityLabel(priority: Priority): string {
  return {
    red: 'Emergency - Immediate Action Required',
    yellow: 'Urgent - Prompt Attention Needed',
    green: 'Non-Urgent - Standard Care'
  }[priority];
}

function calculateDataCompleteness(assessment: ClinicalFormInstance): number {
  // Implementation depends on form schema
  // Return percentage (0-1) of required fields that have values
  return 1.0; // Simplified for now
}
```

### Static Clinical Knowledge Maps

```typescript
// app/data/explainabilityMaps.ts
import type { RuleExplanation, ActionLabel } from '~/types/explainability';

export const RULE_EXPLANATIONS: Record<string, RuleExplanation> = {
  red_danger: {
    id: 'red_danger',
    description: 'Presence of general danger signs',
    whoReference: 'WHO IMCI 2014 - Danger Signs',
    clinicalMeaning: 'Immediate life-threatening condition'
  },
  red_distress: {
    id: 'red_distress',
    description: 'Severe respiratory distress detected',
    whoReference: 'WHO IMCI 2014 - Respiratory',
    clinicalMeaning: 'Severe respiratory compromise'
  },
  red_cyanosis: {
    id: 'red_cyanosis',
    description: 'Cyanosis observed',
    whoReference: 'WHO IMCI 2014 - Danger Sign',
    clinicalMeaning: 'Severe hypoxemia'
  },
  yellow_pneumonia: {
    id: 'yellow_pneumonia',
    description: 'Signs consistent with pneumonia',
    whoReference: 'WHO IMCI 2014 - Pneumonia',
    clinicalMeaning: 'Respiratory infection requiring treatment'
  },
  yellow_danger: {
    id: 'yellow_danger',
    description: 'Some danger signs present',
    whoReference: 'WHO IMCI 2014 - Danger Signs',
    clinicalMeaning: 'Requires prompt attention'
  },
  green_no_pneumonia: {
    id: 'green_no_pneumonia',
    description: 'No clinical danger signs detected',
    whoReference: 'WHO IMCI 2014 - Classification',
    clinicalMeaning: 'No urgent intervention needed'
  }
};

export const ACTION_LABELS: Record<string, ActionLabel> = {
  urgent_referral: {
    code: 'urgent_referral',
    label: 'Refer urgently to hospital',
    justification: 'Required for severe illness classification',
    whoReference: 'WHO IMCI - Emergency Signs'
  },
  oxygen_if_available: {
    code: 'oxygen_if_available',
    label: 'Provide oxygen if available',
    justification: 'For hypoxemia or respiratory distress',
    whoReference: 'WHO IMCI - Oxygen Therapy'
  },
  first_dose_antibiotics: {
    code: 'first_dose_antibiotics',
    label: 'Give first dose of antibiotics',
    justification: 'For severe bacterial infection',
    whoReference: 'WHO IMCI - Antibiotics'
  },
  oral_antibiotics: {
    code: 'oral_antibiotics',
    label: 'Prescribe oral antibiotics',
    justification: 'For confirmed bacterial infection',
    whoReference: 'WHO IMCI - Antibiotics'
  },
  home_care_advice: {
    code: 'home_care_advice',
    label: 'Provide home care advice',
    justification: 'For non-urgent cases',
    whoReference: 'WHO IMCI - Home Care'
  },
  follow_up_2_days: {
    code: 'follow_up_2_days',
    label: 'Follow up in 2 days',
    justification: 'For conditions requiring monitoring',
    whoReference: 'WHO IMCI - Follow-up'
  },
  follow_up_5_days: {
    code: 'follow_up_5_days',
    label: 'Follow up in 5 days',
    justification: 'For conditions requiring monitoring',
    whoReference: 'WHO IMCI - Follow-up'
  },
  return_if_worse: {
    code: 'return_if_worse',
    label: 'Return if symptoms worsen',
    justification: 'Standard caregiver instruction',
    whoReference: 'WHO IMCI - Caregiver Education'
  },
  keep_warm: {
    code: 'keep_warm',
    label: 'Keep child warm',
    justification: 'For hypothermia prevention',
    whoReference: 'WHO IMCI - Thermal Care'
  }
};
```

---

## Component 3: UI Explainability Card

### Assessment: ✅ IMPLEMENTABLE

The Explainability Card is a standard Vue component with:
- Clear data bindings to ExplainabilityModel
- Visual priority indicators (red/yellow/green)
- Collapsible sections
- Print-safe layout

### Implementation Location
```
app/components/clinical/ExplainabilityCard.vue
```

### Component Code

```vue
<!-- app/components/clinical/ExplainabilityCard.vue -->
<template>
  <div 
    v-if="model" 
    class="explainability-card"
    :class="[`priority-${model.classification.priority}`]"
  >
    <!-- Header -->
    <div class="card-header">
      <div class="priority-badge">
        <span class="priority-icon">{{ priorityIcon }}</span>
        <span class="priority-text">
          {{ model.classification.priority.toUpperCase() }}
        </span>
      </div>
      <div class="classification-info">
        <span class="classification-label">
          {{ model.classification.label }}
        </span>
        <span class="classification-source">
          {{ model.classification.protocol }}
        </span>
      </div>
    </div>

    <!-- Why (Triggers) -->
    <div class="card-section">
      <h4 class="section-title">
        <span class="icon">🔎</span>
        Why this classification?
      </h4>
      <ul class="trigger-list">
        <li 
          v-for="(trigger, index) in model.reasoning.triggers" 
          :key="index"
          class="trigger-item"
        >
          <span class="trigger-value">{{ formatValue(trigger.value) }}</span>
          <span class="trigger-arrow">→</span>
          <span class="trigger-explanation">{{ trigger.clinicalMeaning }}</span>
        </li>
      </ul>
    </div>

    <!-- Narrative -->
    <div v-if="model.reasoning.clinicalNarrative" class="card-section">
      <h4 class="section-title">
        <span class="icon">📋</span>
        Summary
      </h4>
      <p class="clinical-narrative">
        {{ model.reasoning.clinicalNarrative }}
      </p>
    </div>

    <!-- Recommended Actions -->
    <div class="card-section">
      <h4 class="section-title">
        <span class="icon">🩺</span>
        Recommended Actions
      </h4>
      <ul class="action-list">
        <li 
          v-for="action in model.recommendedActions" 
          :key="action.code"
          class="action-item"
        >
          <span class="action-bullet">▸</span>
          <div class="action-content">
            <span class="action-label">{{ action.label }}</span>
            <span v-if="action.justification" class="action-justification">
              {{ action.justification }}
            </span>
          </div>
        </li>
      </ul>
    </div>

    <!-- AI Enhancement (if used) -->
    <div v-if="model.aiEnhancement?.used" class="card-section ai-section">
      <h4 class="section-title">
        <span class="icon">🤖</span>
        AI Explanation
      </h4>
      <div class="ai-output">
        <slot name="ai-output">
          <p>{{ aiOutput || 'AI explanation not available' }}</p>
        </slot>
      </div>
      <p class="ai-disclaimer">
        Clinical support, not a diagnosis. Always use clinical judgment.
      </p>
    </div>

    <!-- Safety Footer -->
    <div class="card-footer">
      <div class="safety-notes">
        <span 
          v-for="(note, index) in model.safetyNotes" 
          :key="index"
          class="safety-note"
        >
          {{ note }}
        </span>
      </div>
      <div class="audit-info">
        <span class="timestamp">
          {{ formatTimestamp(model.timestamp) }}
        </span>
        <span v-if="model.confidence < 1" class="confidence">
          Confidence: {{ Math.round(model.confidence * 100) }}%
        </span>
      </div>
    </div>
  </div>

  <!-- Error State -->
  <div v-else class="explainability-card error">
    <p class="error-message">
      Explainability data unavailable
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ExplainabilityRecord } from '~/types/explainability';

const props = defineProps<{
  model: ExplainabilityRecord | null;
  aiOutput?: string;
}>();

const priorityIcon = computed(() => {
  const icons = { red: '🚨', yellow: '⚠️', green: '✅' };
  return icons[props.model?.classification.priority || 'green'];
});

function formatValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') {
    return value ? 'Present' : 'Absent';
  }
  return String(value);
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}
</script>

<style scoped>
.explainability-card {
  border: 2px solid;
  border-radius: 12px;
  overflow: hidden;
  background: white;
}

.priority-red {
  border-color: #E53935;
  background: linear-gradient(135deg, #fff 0%, #fff5f5 100%);
}

.priority-yellow {
  border-color: #FBC02D;
  background: linear-gradient(135deg, #fff 0%, #fffde7 100%);
}

.priority-green {
  border-color: #43A047;
  background: linear-gradient(135deg, #fff 0%, #e8f5e9 100%);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.05);
}

.priority-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 700;
}

.priority-red .priority-badge {
  background: #E53935;
  color: white;
}

.priority-yellow .priority-badge {
  background: #FBC02D;
  color: #333;
}

.priority-green .priority-badge {
  background: #43A047;
  color: white;
}

.priority-icon {
  font-size: 20px;
}

.classification-label {
  display: block;
  font-weight: 600;
  font-size: 14px;
}

.classification-source {
  font-size: 12px;
  color: #666;
}

.card-section {
  padding: 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.icon {
  font-size: 16px;
}

.trigger-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.trigger-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  font-size: 14px;
}

.trigger-value {
  background: #e3f2fd;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.trigger-arrow {
  color: #666;
}

.trigger-explanation {
  color: #333;
}

.action-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.action-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
}

.action-bullet {
  color: #666;
  font-size: 16px;
}

.action-label {
  display: block;
  font-weight: 500;
  font-size: 14px;
}

.action-justification {
  display: block;
  font-size: 12px;
  color: #666;
}

.clinical-narrative {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
}

.card-footer {
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.03);
}

.safety-notes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.safety-note {
  font-size: 11px;
  padding: 4px 8px;
  background: #f5f5f5;
  border-radius: 4px;
  color: #666;
}

.audit-info {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #999;
}

.ai-section {
  background: #f8f9fa;
}

.ai-output {
  padding: 12px;
  background: white;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;
  margin-bottom: 8px;
}

.ai-disclaimer {
  font-size: 11px;
  color: #666;
  font-style: italic;
  margin: 0;
}

.error {
  border-color: #999;
  color: #666;
  text-align: center;
  padding: 24px;
}
</style>
```

---

## Component 4: Safety Framework

### Assessment: ✅ IMPLEMENTABLE

The safety framework consists of:
- **Code-level guards** (prompt engineering, output filtering)
- **Policy-level guards** (admin controls, kill switch)
- **UI-level guards** (disclaimers, confirmation dialogs)

### Safety Layers

```
Layer 1: Context Validator
├── Check session exists
├── Check assessment complete
└── Check triage result exists

Layer 2: Scope Guard (Hard Limits)
├── Block diagnostic questions
├── Block treatment recommendations
└── Block medication inquiries

Layer 3: Guideline Binding
├── Only use triageLogic
├── Only use calculations
└── Only use WHO metadata

Layer 4: Risk Escalation Rules
├── RED → Emergency banner
├── Cyanosis → Immediate referral
└── Hypoxia → Highlight warning

Layer 5: Output Filter
├── Block prescription language
├── Block dosage language
└── Enforce tone rules

Layer 6: UI Safety
├── Mark as "Clinical Support"
├── Force confirmation for RED
└── Require "I have reviewed"
```

### Safety Rules Implementation

```typescript
// app/services/safetyRules.ts

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  escalation?: 'none' | 'warning' | 'block';
}

// Layer 1: Context Validator
export function validateClinicalContext(context: {
  sessionExists?: boolean;
  assessmentComplete?: boolean;
  triageResult?: boolean;
}): SafetyCheckResult {
  if (!context.sessionExists) {
    return {
      allowed: false,
      reason: 'No active session. Please start a patient session.',
      escalation: 'block'
    };
  }

  if (!context.assessmentComplete) {
    return {
      allowed: false,
      reason: 'Assessment incomplete. Please complete clinical assessment first.',
      escalation: 'block'
    };
  }

  if (!context.triageResult) {
    return {
      allowed: false,
      reason: 'Triage not yet calculated.',
      escalation: 'block'
    };
  }

  return { allowed: true };
}

// Layer 2: Scope Guard
const BLOCKED_PATTERNS = /what.*disease|what.*diagnosis|prescribe|treat with|recommend.*drug|dosage|mg\/kg|ml\/kg|give.*medicine|what.*instead/i;

export function checkScope(input: string): SafetyCheckResult {
  if (BLOCKED_PATTERNS.test(input)) {
    return {
      allowed: false,
      reason: 'I cannot make clinical decisions or recommendations. I can only explain clinical findings.',
      escalation: 'block'
    };
  }

  return { allowed: true };
}

// Layer 5: Output Filter
const DANGEROUS_PATTERNS = /prescribe|prescription|dosage|mg\/kg|ml\/kg|inject|intravenous|iv\s+drip|take.*medicine|give.*antibiotic/i;

export function filterOutput(text: string): SafetyCheckResult {
  if (DANGEROUS_PATTERNS.test(text)) {
    return {
      allowed: false,
      reason: 'Output blocked by safety filter',
      escalation: 'block'
    };
  }

  // Check tone
  if (/\bwill die|definitely|certainly\b/i.test(text)) {
    return {
      allowed: false,
      reason: 'Output contains overly certain language',
      escalation: 'warning'
    };
  }

  return { allowed: true };
}

// Risk Escalation Rules
export function checkRiskEscalation(explainability: {
  priority: 'red' | 'yellow' | 'green';
  triggers?: Array<{ fieldId: string }>;
}): { escalation: string; message: string } {
  if (explainability.priority === 'red') {
    return {
      escalation: 'emergency',
      message: 'EMERGENCY: Immediate referral required'
    };
  }

  const hasCyanosis = explainability.triggers?.some(t => 
    t.fieldId.includes('cyanosis')
  );
  const hasUnconscious = explainability.triggers?.some(t =>
    t.fieldId.includes('unconscious') || t.fieldId.includes('lethargic')
  );

  if (hasCyanosis || hasUnconscious) {
    return {
      escalation: 'immediate',
      message: 'Immediate referral required'
    };
  }

  return { escalation: 'none', message: '' };
}
```

### Kill Switch (Admin)

```typescript
// app/services/aiConfig.ts
import { useStorage } from '@vueuse/core';

export interface AIConfig {
  enabled: boolean;
  allowExplanations: boolean;
  allowEducation: boolean;
  allowHandover: boolean;
  allowSummary: boolean;
  model: string;
}

const aiConfig = useStorage<AIConfig>('healthbridge_ai_config', {
  enabled: true,
  allowExplanations: true,
  allowEducation: true,
  allowHandover: true,
  allowSummary: true,
  model: 'medgemma:4b'
});

export function getAIConfig() {
  return aiConfig.value;
}

export function updateAIConfig(config: Partial<AIConfig>) {
  aiConfig.value = { ...aiConfig.value, ...config };
}

export function isAIEnabled(useCase?: AIUseCase): boolean {
  if (!aiConfig.value.enabled) return false;
  
  if (useCase) {
    switch (useCase) {
      case 'EXPLAIN_TRIAGE': return aiConfig.value.allowExplanations;
      case 'CARE_EDUCATION': return aiConfig.value.allowEducation;
      case 'CLINICAL_HANDOVER': return aiConfig.value.allowHandover;
      case 'NOTE_SUMMARY': return aiConfig.value.allowSummary;
    }
  }
  
  return true;
}

// Admin functions
export function disableAI() {
  updateAIConfig({ enabled: false });
}

export function enableAI() {
  updateAIConfig({ enabled: true });
}

export function setAIMode(mode: 'full' | 'explanations-only' | 'disabled') {
  switch (mode) {
    case 'full':
      updateAIConfig({
        enabled: true,
        allowExplanations: true,
        allowEducation: true,
        allowHandover: true,
        allowSummary: true
      });
      break;
    case 'explanations-only':
      updateAIConfig({
        enabled: true,
        allowExplanations: true,
        allowEducation: false,
        allowHandover: false,
        allowSummary: false
      });
      break;
    case 'disabled':
      disableAI();
      break;
  }
}
```

---

## Component 5: Audit Logging

### Assessment: ✅ IMPLEMENTABLE

All AI interactions must be logged for clinical governance.

```typescript
// app/services/aiAudit.ts
import { logAuditEvent } from './auditLogger';

export interface AIAuditLog {
  timestamp: string;
  sessionId: string;
  useCase: string;
  explainabilityId: string;
  inputSummary: string; // Hash or summary, not full data
  outputLength: number;
  safetyBlocks: number;
  duration: number;
  userAction?: string;
}

export async function logAIInteraction(
  useCase: AIUseCase,
  explainabilityId: string,
  inputData: unknown,
  output: string,
  duration: number,
  safetyBlocks: number = 0
): Promise<void> {
  await logAuditEvent(
    'ai_interaction',
    safetyBlocks > 0 ? 'warning' : 'info',
    'clinicalAI',
    {
      useCase,
      explainabilityId,
      outputLength: output.length,
      duration,
      safetyBlocks,
      timestamp: new Date().toISOString()
    },
    'success'
  );
}
```

---

## Environment Requirements

### Ollama Setup

```bash
# Install Ollama
# https://ollama.com/

# Pull MedGemma model
ollama pull medgemma:4b

# Start server (runs on port 11434)
ollama serve
```

### Environment Variables

```bash
# .env
OLLAMA_ENDPOINT=http://localhost:11434/api/generate
AI_MODEL=medgemma:4b
AI_TIMEOUT_MS=30000
```

---

## Implementation Roadmap

### Phase 4.1: Core Explainability (Week 1)

| Task | Duration | Dependencies |
|------|----------|--------------|
| Define ExplainabilityRecord type | 1 day | None |
| Create explainability maps | 1 day | Clinical team |
| Build explainability engine | 2 days | Types, maps |
| Create ExplainabilityCard component | 2 days | Engine |
| Integrate with assessment workflow | 1 day | Existing triage |

### Phase 4.2: AI Service (Week 2)

| Task | Duration | Dependencies |
|------|----------|--------------|
| Set up Ollama server | 0.5 day | IT infrastructure |
| Create clinicalAI.ts service | 1 day | None |
| Implement safety filters | 1 day | Safety rules |
| Create AI store | 0.5 day | None |
| Integrate AI explainability | 1 day | ExplainabilityCard |

### Phase 4.3: UI Polish (Week 3)

| Task | Duration | Dependencies |
|------|----------|--------------|
| AI output card component | 1 day | clinicalAI |
| Loading states | 0.5 day | AI store |
| Error handling | 0.5 day | Safety rules |
| Print styles | 0.5 day | UI components |
| Admin AI controls | 1 day | AI config |

### Phase 4.4: Testing & Documentation (Week 4)

| Task | Duration | Dependencies |
|------|----------|--------------|
| Safety testing | 2 days | All components |
| Clinical review | 2 days | Clinical team |
| Update AI_POLICY.md | 1 day | Safety rules |
| User training materials | 2 days | UI components |

---

## Files to Create

```
app/
├── types/
│   └── explainability.ts          ← ExplainabilityRecord type
├── data/
│   └── explainabilityMaps.ts      ← Static clinical knowledge
├── services/
│   ├── clinicalAI.ts              ← AI service (Ollama)
│   ├── explainabilityEngine.ts    ← Build explainability model
│   ├── safetyRules.ts             ← Safety layers
│   ├── aiConfig.ts                ← Admin AI configuration
│   └── aiAudit.ts                 ← AI audit logging
├── stores/
│   └── aiStore.ts                 ← AI state management
└── components/
    └── clinical/
        └── ExplainabilityCard.vue ← Main UI component

docs/
└── AI_POLICY.md                   ← AI safety policy
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| MedGemma unavailable | Low | High | Use fallback model (llama3, mistral) |
| AI hallucination | Medium | High | Multi-layer safety filters |
| Performance issues | Medium | Medium | Response streaming, caching |
| Model bias | Low | Medium | Regular prompt review |
| User over-reliance | Medium | High | Strong disclaimers, training |

---

## Success Criteria

1. **Safety**: Zero instances of AI recommending treatment
2. **Accuracy**: All explainability records match triage logic
3. **Performance**: AI response < 5 seconds
4. **Adoption**: 80% of sessions use explainability feature
5. **Audit**: 100% of AI interactions logged

---

## Conclusion

Phase 4 is **completely feasible** with current technology. The key to success is:

1. **Safety First**: Multiple safety layers prevent harmful outputs
2. **Explainability**: Every AI output is traceable to clinical data
3. **Human-in-the-loop**: AI assists but never decides
4. **Auditability**: Complete logging for clinical governance

The implementation follows a phased approach, starting with explainability (rule-based, no AI risk) and adding AI enhancement with comprehensive safety controls.

---

**Document Version:** 1.0  
**Status:** Ready for Implementation  
**Next Action:** Begin Phase 4.1 - Core Explainability Types and Engine
