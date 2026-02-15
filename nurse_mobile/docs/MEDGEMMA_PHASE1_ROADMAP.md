# MedGemma Phase 1 Implementation Roadmap

## Executive Summary

This document outlines the complete implementation plan for **Phase 1** of MedGemma, the AI-powered clinical decision support assistant for the HealthBridge nurse mobile application. Based on the existing infrastructure analysis, this roadmap builds upon the solid foundation already in place while addressing gaps to achieve full Phase 1 compliance with the design specifications.

**Current State Assessment:**
- ✅ Core AI API gateway exists (`server/api/ai.post.ts`)
- ✅ Safety filtering implemented
- ✅ Multiple use cases defined (EXPLAIN_TRIAGE, CARE_EDUCATION, CLINICAL_HANDOVER, NOTE_SUMMARY)
- ✅ Authentication middleware in place
- ✅ ExplainabilityCard UI component exists
- ✅ AIStatusBadge for source indication exists

**Gaps Identified:**
- ❌ Structured response parsing (not returning full AI contract)
- ❌ Inconsistency detection not implemented
- ❌ Teaching notes feature missing
- ❌ Next steps extraction not implemented
- ❌ Confidence scoring not returned
- ❌ Audit logging incomplete
- ❌ Manual "Ask MedGemma" button not integrated
- ❌ Schema context not passed to AI

---

## 1. Architecture Overview

### Current System Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          NURSE UI (Nuxt.js)                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │ Assessment  │───▶│ Triage      │───▶│ Treatment               │ │
│  │ Form        │    │ Display     │    │ Form                    │ │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘ │
│         │                  │                      │                  │
│         ▼                  ▼                      ▼                  │
│  "Ask MedGemma"    "Explain Triage"       "Validate Plan"           │
│         │                  │                      │                  │
└─────────┼──────────────────┼──────────────────────┼──────────────────┘
          │                  │                      │
          ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CLINICAL LOGIC LAYER                             │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ Deterministic Rules Engine                                    │ │
│  │ • triageLogic (IMCI-based)                                    │ │
│  │ • Danger signs detection                                      │ │
│  │ • Age-based respiratory thresholds                            │ │
│  │ • Treatment action maps                                       │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                            │                                         │
│                            ▼                                         │
│              Calculated Priority + Actions                          │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AI EXPLAINABILITY LAYER (MedGemma)              │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ Server API: /server/api/ai.post.ts                            │ │
│  │ • Accepts structured payload                                  │ │
│  │ • Builds prompts from schema + values + rules                │ │
│  │ • Calls Ollama (MedGemma)                                     │ │
│  │ • Validates and filters responses                             │ │
│  │ • Returns structured explainability data                      │ │
│  └───────────────────────────────────────────────────────────────┘ │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SAFETY & GOVERNANCE                            │
│  • All outputs labeled "AI support only"                            │
│  • Rule trace + model version stored                               │
│  • Confidence level returned                                        │
│  • Full audit log                                                  │
│  • Nurse can ignore / override                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Implementation Tasks by Phase

### Phase 1.1: Backend Enhancements

#### Task 1.1.1: Extend AI Response Contract
**Priority:** HIGH  
**Status:** NOT STARTED  
**Estimated Effort:** 2-3 hours

**Description:**
The current AI response only returns `answer` and `safetyFlags`. Phase 1 requires the full contract specified in the design documents.

**Required Changes:**
```typescript
// Current (server/types/ai.ts)
export interface AIResponse {
  answer: string;
  safetyFlags: string[];
}

// Required (new structure)
export interface AIResponse {
  explanation: string;           // Primary explanation
  inconsistencies: string[];      // Data/rule inconsistencies
  teachingNotes: string[];        // Educational snippets
  nextSteps: string[];            // Recommended actions
  confidence: number;             // 0.0 - 1.0
  modelVersion: string;          // e.g., "gemma3:4b"
  timestamp: string;             // ISO 8601
  ruleIds: string[];             // Referenced rules
  safetyFlags: string[];
}
```

**Implementation Steps:**
1. Update `server/types/ai.ts` with new interface
2. Modify `server/api/ai.post.ts` to extract structured data from Ollama response
3. Add LLM prompting to request structured JSON output
4. Implement parsing logic to extract fields
5. Add validation for required fields

#### Task 1.1.2: Implement Inconsistency Detection
**Priority:** HIGH  
**Status:** NOT STARTED  
**Estimated Effort:** 3-4 hours

**Description:**
MedGemma should detect and flag inconsistencies between entered data and calculated triage priority.

**Detection Rules:**
| Inconsistency Type | Example | Action |
|--------------------|---------|--------|
| Danger sign ignored | `cyanosis: true` but priority is Yellow | Warning: "Cyanosis typically mandates Red priority" |
| Vital sign threshold | resp_rate = 48, age = 30mo, priority = Green | Warning: "Above IMCI threshold for pneumonia" |
| Missing required data | No respiratory rate recorded | Suggestion: "RR required to rule out fast breathing" |

**Implementation:**
```typescript
// In server/api/ai.post.ts, add detection logic
interface InconsistencyCheck {
  type: 'danger_sign' | 'threshold' | 'missing' | 'contradiction';
  field: string;
  value: unknown;
  expected: string;
  message: string;
}

function checkInconsistencies(
  values: Record<string, unknown>,
  calculatedPriority: string
): InconsistencyCheck[] {
  // Implementation of consistency rules
}
```

#### Task 1.1.3: Enhance Prompt Engineering
**Priority:** HIGH  
**Status:** PARTIAL  
**Estimated Effort:** 2 hours

**Description:**
Current prompts are basic. Need structured prompting for consistent, parseable responses.

**New Prompt Template (TRIAGE_EXPLANATION):**
```prompt
You are a senior paediatric nurse following WHO IMCI guidelines.
Triage Priority: {priority}
Actions: {actions}

Nurse Entered Data:
{values}

IMCI Schema Context:
{schemaSummary}

TASK: Provide a structured response with:
1. EXPLANATION: Why this priority (2-3 sentences, reference specific findings)
2. INCONSISTENCIES: Any conflicts between data and priority (list or "None")
3. TEACHING_NOTES: One clinical teaching point (e.g., "Stridor in calm child = upper airway obstruction")
4. NEXT_STEPS: 2 immediate nurse actions
5. CONFIDENCE: Your confidence (0.0-1.0)

Output format: JSON object only. No markdown. Max 200 words.
```

#### Task 1.1.4: Add Audit Logging
**Priority:** HIGH  
**Status:** PARTIAL  
**Estimated Effort:** 2 hours

**Description:**
Full audit trail for all AI requests and responses.

**Required Fields:**
```typescript
interface AIAuditLog {
  id: string;                    // Unique audit ID
  timestamp: string;              // ISO 8601
  sessionId: string;              // Clinical session
  useCase: AIUseCase;            // EXPLAIN_TRIAGE, etc.
  inputTokens: number;           // For cost tracking
  outputTokens: number;
  modelVersion: string;
  responseTime: number;          // ms
  confidence: number;
  nurseAction: 'viewed' | 'dismissed' | 'followed' | 'overridden';
  safetyFlags: string[];
}
```

---

### Phase 1.2: Frontend Enhancements

#### Task 1.2.1: Integrate "Ask MedGemma" Button
**Priority:** HIGH  
**Status:** NOT STARTED  
**Estimated Effort:** 3-4 hours

**Description:**
Add manual trigger button to the assessment page for requesting AI explanations.

**UI Placement:**
```
┌─────────────────────────────────────────────────────┐
│ Assessment Form                              [? MedGemma] │
├─────────────────────────────────────────────────────┤
│                                               ▲      │
│  Danger Signs Section                        │      │
│                                               │      │
│  [Ask MedGemma]  ──▶ Appears after section   │      │
│                      completion               │      │
│                                               ▼      │
├─────────────────────────────────────────────────────┤
│  Triage Result                               [Explain] │
└─────────────────────────────────────────────────────┘
```

**Implementation:**
```vue
<!-- In assessment/[formId].vue -->
<template>
  <div class="relative">
    <!-- Section content -->
    
    <!-- MedGemma Trigger -->
    <button 
      v-if="showMedGemmaTrigger"
      @click="requestMedGemmaGuidance"
      class="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
      :disabled="isLoading"
    >
      <svg v-if="!isLoading" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
      <span v-else class="animate-spin">⟳</span>
      <span>{{ buttonLabel }}</span>
    </button>
  </div>
</template>
```

#### Task 1.2.2: Create MedGemma Guidance Panel
**Priority:** HIGH  
**Status:** NOT STARTED  
**Estimated Effort:** 4-5 hours

**Description:**
New component to display structured AI guidance with all Phase 1 features.

**Component Structure:**
```
components/clinical/
├── MedGemmaGuidancePanel.vue    # Main panel
├── ExplanationSection.vue       # Why this classification
├── InconsistencyAlert.vue        # Warning for conflicts
├── TeachingCard.vue             # Educational content
├── NextStepsList.vue            # Recommended actions
└── ConfidenceIndicator.vue      # Visual confidence
```

**Features:**
1. Explanation with highlighted triggers
2. Inconsistency alerts (if any)
3. Teaching notes expandable card
4. Actionable next steps checklist
5. Confidence meter
6. Model version and timestamp footer
7. "Dismiss" and "Helpful" feedback buttons

#### Task 1.2.3: Update ExplainabilityCard for Full Data
**Priority:** MEDIUM  
**Status:** PARTIAL  
**Estimated Effort:** 2 hours

**Description:**
Current ExplainabilityCard needs updates to display new AI response fields.

**Current Gaps:**
- [x] AIStatusBadge (DONE)
- [ ] Inconsistencies display
- [ ] Teaching notes section
- [ ] Next steps checklist
- [ ] Confidence indicator
- [ ] Nurse feedback buttons

#### Task 1.2.4: Add Schema Context Builder
**Priority:** MEDIUM  
**Status:** NOT STARTED  
**Estimated Effort:** 2-3 hours

**Description:**
Build condensed schema context to send to AI for grounding.

**Implementation:**
```typescript
// composables/useMedGemmaContext.ts
export function useMedGemmaContext() {
  function buildSchemaContext(
    schema: ClinicalSchema,
    currentSection: string
  ): SchemaContext {
    return {
      section: currentSection,
      relevantFields: extractRelevantFields(schema, currentSection),
      clinicalNotes: extractClinicalNotes(schema),
      triageLogic: extractTriageLogic(schema),
      dangerSigns: extractDangerSigns(schema)
    };
  }
  
  function buildFullPayload(
    schema: ClinicalSchema,
    values: Record<string, unknown>,
    calculated: CalculatedResult
  ): AIPayload {
    return {
      schema: buildSchemaContext(schema, 'all'),
      currentValues: values,
      patientContext: extractPatientContext(values),
      systemResult: {
        priority: calculated.triagePriority,
        actions: calculated.recommendedActions,
        ruleIds: calculated.appliedRules
      },
      promptType: 'TRIAGE_EXPLANATION'
    };
  }
  
  return { buildSchemaContext, buildFullPayload };
}
```

---

### Phase 1.3: Testing & Quality Assurance

#### Task 1.3.1: Unit Tests for Prompt Engineering
**Priority:** MEDIUM  
**Status:** NOT STARTED  
**Estimated Effort:** 2 hours

**Test Cases:**
1. Valid input → structured JSON output
2. Missing required fields → appropriate error
3. Dangerous patterns → filtered output
4. Consistency → repeated prompts return similar structure

#### Task 1.3.2: Integration Tests
**Priority:** MEDIUM  
**Status:** NOT STARTED  
**Estimated Effort:** 3 hours

**Test Scenarios:**
1. Full triage explanation flow
2. Inconsistency detection
3. Fallback when AI unavailable
4. Safety filter bypass attempts
5. Audit logging verification

#### Task 1.3.3: User Acceptance Testing
**Priority:** MEDIUM  
**Status:** NOT STARTED  
**Estimated Effort:** 4 hours (planning)

**Testers:**
- Clinical staff (2-3 nurses)
- Review clarity of explanations
- Verify teaching notes accuracy
- Assess workflow integration

---

## 3. Implementation Order & Dependencies

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DEPENDENCY CHART                                 │
└─────────────────────────────────────────────────────────────────────────┘

Phase 1.1 (Backend)
├── 1.1.3 Prompt Engineering ──┬──► 1.1.1 Response Contract
├── 1.1.4 Audit Logging ───────┤
└── 1.1.2 Inconsistency ───────┘
          │
          ▼
Phase 1.2 (Frontend)
├── 1.2.4 Schema Context Builder ──► 1.2.1 MedGemma Button ──► 1.2.2 Guidance Panel
│                                       │
│                                       ▼
│                               1.2.3 ExplainabilityCard Update
│
└──────────────────────────────────────┐
                                       │
                                       ▼
Phase 1.3 (Testing)
├── 1.3.1 Unit Tests ──► 1.3.2 Integration Tests ──► 1.3.3 UAT
└─────────────────────────────────────────────────────────┘
```

---

## 4. Detailed Task Breakdown

### Task 1.1.1: Extend AI Response Contract

**File:** `server/types/ai.ts`

**Changes:**
```typescript
export interface AIResponse {
  /** Primary clinical explanation */
  explanation: string;
  
  /** Data inconsistencies detected */
  inconsistencies: string[];
  
  /** Educational teaching points */
  teachingNotes: string[];
  
  /** Recommended next steps */
  nextSteps: string[];
  
  /** AI confidence score (0.0 - 1.0) */
  confidence: number;
  
  /** Model version used */
  modelVersion: string;
  
  /** Response timestamp (ISO 8601) */
  timestamp: string;
  
  /** Referenced rule IDs */
  ruleIds: string[];
  
  /** Safety flags triggered */
  safetyFlags: string[];
}

export interface AIRequest {
  useCase: AIUseCase;
  payload: {
    schema: SchemaContext;
    currentValues: Record<string, unknown>;
    patientContext: PatientContext;
    systemResult: SystemResult;
  };
}

export interface SchemaContext {
  section: string;
  relevantFields: FieldInfo[];
  clinicalNotes: string[];
  triageLogic: string[];
  dangerSigns: string[];
}

export interface PatientContext {
  ageMonths: number;
  weightKg?: number;
  gender?: string;
}

export interface SystemResult {
  priority: 'red' | 'yellow' | 'green';
  actions: string[];
  ruleIds: string[];
}
```

**File:** `server/api/ai.post.ts`

**Changes:**
```typescript
import type { AIRequest, AIResponse } from '../types/ai';

export default defineEventHandler(async (event): Promise<AIResponse> => {
  const body = await readBody<AIRequest>(event);
  const config = useRuntimeConfig();
  
  // Build structured prompt
  const prompt = buildStructuredPrompt(body);
  
  // Call Ollama with JSON mode
  const response = await callOllama(prompt);
  
  // Parse structured response
  const parsed = parseStructuredResponse(response);
  
  // Validate and enrich
  const result: AIResponse = {
    ...parsed,
    modelVersion: config.ollamaModel,
    timestamp: new Date().toISOString(),
    safetyFlags: validateSafety(parsed.explanation)
  };
  
  // Log audit
  await logAudit({ ...body, response: result });
  
  return result;
});

function buildStructuredPrompt(body: AIRequest): string {
  return `You are a structured clinical AI assistant.
  
SCHEMA CONTEXT:
${JSON.stringify(body.payload.schema, null, 2)}

CURRENT VALUES:
${JSON.stringify(body.payload.currentValues, null, 2)}

PATIENT CONTEXT:
${JSON.stringify(body.payload.patientContext, null, 2)}

SYSTEM RESULT:
Priority: ${body.payload.systemResult.priority}
Actions: ${body.payload.systemResult.actions.join(', ')}
Rules: ${body.payload.systemResult.ruleIds.join(', ')}

TASK: ${body.useCase}

OUTPUT JSON:
{
  "explanation": "string",
  "inconsistencies": ["string"],
  "teachingNotes": ["string"],
  "nextSteps": ["string"],
  "confidence": 0.0
}

Rules:
- Always output valid JSON
- Max 200 words total
- Never prescribe or diagnose
- Reference specific findings
- Use simple language`;
}
```

---

### Task 1.2.2: Create MedGemma Guidance Panel

**File:** `app/components/clinical/MedGemmaGuidancePanel.vue`

```vue
<template>
  <div 
    v-if="guidance"
    class="bg-gray-800 rounded-xl border border-purple-700/30 p-6"
    role="region"
    aria-label="MedGemma Clinical Guidance"
  >
    <!-- Header with AI Badge -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-purple-900/30 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div>
          <h3 class="text-white font-semibold">MedGemma</h3>
          <p class="text-xs text-gray-400">AI Clinical Assistant</p>
        </div>
      </div>
      
      <AIStatusBadge :ai-enhancement="aiEnhancement" />
    </div>
    
    <!-- Confidence Indicator -->
    <ConfidenceMeter :confidence="guidance.confidence" />
    
    <!-- Main Explanation -->
    <div class="mb-4">
      <h4 class="text-white font-medium mb-2">Explanation</h4>
      <p class="text-gray-300 text-sm leading-relaxed">
        {{ guidance.explanation }}
      </p>
    </div>
    
    <!-- Inconsistencies (if any) -->
    <div v-if="guidance.inconsistencies.length" class="mb-4">
      <InconsistencyAlert :inconsistencies="guidance.inconsistencies" />
    </div>
    
    <!-- Teaching Notes -->
    <TeachingCard 
      v-if="guidance.teachingNotes.length"
      :notes="guidance.teachingNotes"
    />
    
    <!-- Next Steps -->
    <NextStepsList 
      :steps="guidance.nextSteps"
      @complete="handleStepComplete"
    />
    
    <!-- Footer with Model Info -->
    <div class="mt-4 pt-4 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500">
      <div class="flex items-center gap-2">
        <span>{{ guidance.modelVersion }}</span>
        <span>•</span>
        <span>{{ formatTimestamp(guidance.timestamp) }}</span>
      </div>
      
      <div class="flex items-center gap-2">
        <button 
          @click="reportHelpful"
          class="text-gray-400 hover:text-green-400 transition-colors"
          aria-label="Mark as helpful"
        >
          ✓ Helpful
        </button>
        <button 
          @click="reportIssue"
          class="text-gray-400 hover:text-yellow-400 transition-colors"
          aria-label="Report issue"
        >
          ⚠ Issue
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AIStatusBadge from './AIStatusBadge.vue';
import ConfidenceMeter from './ConfidenceMeter.vue';
import InconsistencyAlert from './InconsistencyAlert.vue';
import TeachingCard from './TeachingCard.vue';
import NextStepsList from './NextStepsList.vue';

interface GuidanceResponse {
  explanation: string;
  inconsistencies: string[];
  teachingNotes: string[];
  nextSteps: string[];
  confidence: number;
  modelVersion: string;
  timestamp: string;
}

const props = defineProps<{
  guidance: GuidanceResponse | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'helpful'): void;
  (e: 'issue', details: string): void;
  (e: 'step-complete', step: string): void;
}>();

const aiEnhancement = {
  used: true,
  useCase: 'EXPLAIN_TRIAGE',
  modelVersion: props.guidance?.modelVersion
};

function handleStepComplete(step: string) {
  emit('step-complete', step);
}

function reportHelpful() {
  emit('helpful');
}

function reportIssue() {
  const details = prompt('Describe the issue:');
  if (details) {
    emit('issue', details);
  }
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
</script>
```

---

## 5. Success Criteria

### Functional Requirements

| Requirement | Status | Verification |
|-------------|---------|---------------|
| Nurse can request triage explanation | ❌ Not implemented | Manual test |
| Explanation references specific findings | ❌ Not implemented | Manual test |
| Inconsistencies are flagged | ❌ Not implemented | Unit test |
| Teaching notes displayed | ❌ Not implemented | Manual test |
| Next steps are actionable | ❌ Not implemented | Manual test |
| Confidence score shown | ❌ Not implemented | Manual test |
| Model version displayed | ❌ Not implemented | Manual test |
| Audit log captures all requests | ❌ Incomplete | Log review |
| Safety filters prevent prescription | ✅ Implemented | Unit test |

### Non-Functional Requirements

| Requirement | Status | Verification |
|-------------|---------|---------------|
| Response time < 3 seconds | ⚠️ Unknown | Load test |
| 95% uptime | ⚠️ Unknown | Monitoring |
| Accessible (WCAG 2.1 AA) | ⚠️ Partial | Audit |
| Works offline (fallback) | ✅ Implemented | Manual test |

---

## 6. Timeline Estimate

| Phase | Tasks | Estimated Effort |
|-------|-------|------------------|
| 1.1 Backend | 4 tasks | 9-11 hours |
| 1.2 Frontend | 4 tasks | 11-14 hours |
| 1.3 Testing | 3 tasks | 9 hours |
| **Total** | **11 tasks** | **29-34 hours** |

---

## 7. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|--------------|------------|
| Ollama latency > 3s | High | Medium | Streaming, caching, fallback |
| Prompt injection attacks | High | Low | Input sanitization, safety filters |
| Inconsistent JSON parsing | Medium | Medium | Fallback to text parsing |
| Poor explanation quality | Medium | Medium | Prompt iteration, user feedback |
| Nurse distrust of AI | Medium | Medium | Clear disclaimers, transparency |

---

## 8. Next Steps

1. **Approve this roadmap** - Confirm implementation priorities
2. **Start with Task 1.1.3** - Prompt engineering (foundational)
3. **Proceed to Task 1.1.1** - Response contract extension
4. **Build frontend components** - Once backend stabilizes
5. **Iterate based on feedback** - Clinical staff input

---

*Document Version: 1.0*  
*Created: 2026-02-11*  
*Phase: Phase 1 - Core Explainability*
