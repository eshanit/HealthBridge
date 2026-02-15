# Technical Walkthrough: AI Prompt Creation Process for Form Sections

## Overview

The prompt creation process in HealthBridge involves a multi-step flow from user interaction to AI-generated clinical guidance. This document traces the complete execution path.

---

## 1. User Accesses Assessment Form

**File:** [`app/pages/assessment/[schemaId]/[formId].vue`](app/pages/assessment/[schemaId]/[formId].vue:1)

### Step 1.1: Route Initialization (Lines 35-38)
```typescript
const route = useRoute();
const schemaId = computed(() => route.params.schemaId as string);  // e.g., "peds_respiratory"
const formId = computed(() => route.params.formId as string);
```

### Step 1.2: Patient Data Retrieval (Lines 44-74)
```typescript
const { getNavigationState, clearNavigationState } = useAssessmentNavigation();
const patientData = computed(() => patientDataFromNavigation.value || patientDataFromQuery.value);
```

### Step 1.3: Form Engine Initialization (Lines 287-307)
```typescript
const {
  schema,
  instance,
  initialize,
  saveField,
  // ...
} = useClinicalFormEngine({
  schemaId: schemaId.value,      // "peds_respiratory"
  formId: formId.value,
  sessionId: sessionId.value,
  patientData: patientData.value
});
```

---

## 2. Schema Loading

**File:** [`app/schemas/prompts/peds_respiratory_schema.json`](app/schemas/prompts/peds_respiratory_schema.json:1)

The schema defines 7 sections with the following structure:

| Section | ID | Max Words | Cumulative |
|---------|-----|-----------|------------|
| Patient Information | `patient_info` | 40 | No |
| General Danger Signs | `danger_signs` | 150 | Yes |
| Respiratory Danger | `respiratory_danger` | 120 | Yes |
| Vital Signs | `vitals` | 80 | Yes |
| Respiratory Assessment | `assessment` | 100 | Yes |
| Other Symptoms | `symptoms` | 100 | Yes |
| **Comprehensive Triage** | `triage` | **250** | **Yes** |

Each section contains:
- `instruction`: Detailed prompt for AI behavior
- `requiredContext`: Field IDs needed from form answers
- `guardrails`: Section-specific constraints
- `summaryInstruction`: How to generate section summary

---

## 3. Field Change Triggers AI Update

**File:** [`app/composables/useReactiveAI.ts`](app/composables/useReactiveAI.ts:125)

### Step 3.1: Initialization (Lines 158-169)
```typescript
function init(formState: Record<string, unknown>, calculated: Record<string, unknown>) {
  formStateRef = ref(formState);
  calculatedRef = ref(calculated);
  Object.entries(formState).forEach(([key, value]) => {
    previousValues.set(key, value);
  });
}
```

### Step 3.2: Field Change Detection (Lines 182-215)
```typescript
async function handleFieldChange(fieldId: string, value: unknown) {
  if (!isTriggerField(fieldId)) return;  // Only trigger on significant fields
  
  const HIGH_PRIORITY_FIELDS = [
    'unable_to_drink', 'lethargic_or_unconscious', 
    'convulsing', 'cyanosis', 'stridor', 'respiratory_rate'
  ];
  
  if (HIGH_PRIORITY_FIELDS.includes(fieldId)) {
    await requestUpdate();  // Immediate update
    return;
  }
  
  // Debounce regular updates (1500ms)
  debounceTimer = setTimeout(async () => {
    await requestUpdate();
  }, DEBOUNCE_DELAY);
}
```

### Step 3.3: Trigger Fields Definition (Lines 23-68)
```typescript
const TRIGGER_FIELDS = {
  danger_signs: ['unable_to_drink', 'convulsing', 'cyanosis', 'stridor', ...],
  vital_signs: ['respiratory_rate', 'oxygen_saturation', 'heart_rate', 'temperature', ...],
  imci_fields: ['fast_breathing', 'chest_indrawing', 'wheezing', ...],
  age_fields: ['age_months', 'age_years', 'date_of_birth']
};
```

---

## 4. Context Building for AI Prompt

**File:** [`app/composables/useReactiveAI.ts`](app/composables/useReactiveAI.ts:350)

### Step 4.1: Age Calculation (Lines 357-375)
```typescript
function buildContext(formState, calculated) {
  const dateOfBirth = formState.date_of_birth || formState.patient_dob;
  const ageMonthsInput = formState.age_months || formState.patient_age_months;
  
  let formattedAge = '';
  let ageMonthsNumeric = 0;
  
  if (dateOfBirth && typeof dateOfBirth === 'string') {
    formattedAge = calculateAgeInMonths(dateOfBirth);  // "2 years 1 month"
    ageMonthsNumeric = getAgeMonthsNumeric(dateOfBirth);
  } else if (ageMonthsInput) {
    ageMonthsNumeric = ageMonthsInput;
    if (ageMonthsInput < 12) {
      formattedAge = `${ageMonthsInput} month${ageMonthsInput !== 1 ? 's' : ''} old`;
    } else {
      const years = Math.floor(ageMonthsInput / 12);
      const months = ageMonthsInput % 12;
      formattedAge = `${years} year${years !== 1 ? 's' : ''} ${months} month${months !== 1 ? 's' : ''} old`;
    }
  }
  
  context.patientAgeFormatted = formattedAge;
  context.age_months = ageMonthsNumeric;
}
```

### Step 4.2: Patient Context Object (Lines 385-420)
```typescript
// Patient context built for streaming
const patientContext = {
  ageMonths: 25,      // 2 years 1 month
  weightKg: 12.5,
  gender: 'male',
  triagePriority: 'yellow'
};
```

---

## 5. Dynamic Constraint Resolution

**File:** [`app/services/clinicalAI.ts`](app/services/clinicalAI.ts:93)

### Step 5.1: Schema Loading (Lines 54-74)
```typescript
async function loadSchema(): Promise<PromptSchema> {
  if (cachedSchema) return cachedSchema;
  
  const schemaModule = await import('~/schemas/prompts/peds_respiratory_schema.json');
  cachedSchema = schemaModule.default;
  return cachedSchema;
}
```

### Step 5.2: Section Constraint Resolution (Lines 93-118)
```typescript
export async function resolveSectionConstraints(
  sectionId: string | undefined,
  schemaId: string = 'peds_respiratory'
): Promise<ConstraintResolution> {
  const schema = await loadSchema();
  
  // Find matching section or use fallback
  const section = schema.sections.find(s => s.id === sectionId) || schema.fallbackSection;
  
  return {
    sectionId: section.id,
    systemGuardrails: schema.systemGuardrails,
    instruction: section.instruction,
    maxWords: section.maxWords,
    outputFormat: section.outputFormat,
    guardrails: section.guardrails,
    summaryInstruction: section.summaryInstruction,
    requiredContext: section.requiredContext,
    goal: section.goal
  };
}
```

### Step 5.3: System Guardrails Construction (Lines 139-194)
```typescript
export function buildSystemGuardrails(
  constraints: ConstraintResolution,
  patient?: StreamingContext['patient']
): string {
  const parts = [];
  
  // Add patient context
  if (patient) {
    parts.push('=== PATIENT CONTEXT ===');
    const ageFormatted = patient.ageMonths ? formatPatientAge(patient.ageMonths) : 'age not specified';
    parts.push(`- Age: ${ageFormatted}`);
    if (patient.weightKg) parts.push(`- Weight: ${patient.weightKg} kg`);
    if (patient.gender) parts.push(`- Gender: ${patient.gender}`);
    if (patient.triagePriority) parts.push(`- Current Triage: ${patient.triagePriority}`);
  }
  
  // Add section constraints
  parts.push(constraints.systemGuardrails);
  parts.push('');
  parts.push(`=== CURRENT SECTION: ${constraints.sectionId.toUpperCase()} ===`);
  parts.push(`GOAL: ${constraints.goal}`);
  parts.push(`INSTRUCTION: ${constraints.instruction}`);
  parts.push(`- Maximum ${constraints.maxWords} words`);
  parts.push(`- Format: ${constraints.outputFormat || 'paragraph'}`);
  parts.push('- Never repeat the same information');
  
  return parts.join('\n');
}
```

---

## 6. Streaming API Request

**File:** [`app/pages/assessment/[schemaId]/[formId].vue`](app/pages/assessment/[schemaId]/[formId].vue:800)

### Step 6.1: API Request Construction (Lines 800+)
```typescript
const streamResult = await streamClinicalAI(
  'SECTION_GUIDANCE',
  {
    sessionId: resolvedSessionId.value || '',
    schemaId: 'peds_respiratory',
    formId: currentSection.value?.id,    // e.g., "triage"
    sectionId: currentSection.value?.id,
    cumulativeSummary: getDeduplicatedSummary(),
    patient: patientContext.value,       // { ageMonths, weightKg, gender, triagePriority }
    assessment: { answers: instance.value?.answers || {} }
  } as StreamingContext,
  {
    onChunk: (chunk) => {
      streamingResponse.value += chunk;
    },
    onComplete: (fullResponse, duration, summary) => {
      addSectionSummary(sectionId, summary);
    }
  },
  { timeout: 60000 }
);
```

---

## 7. Server-Side Prompt Building

**File:** [`server/api/ai/stream.post.ts`](server/api/ai/stream.post.ts:510)

### Step 7.1: Request Handling (Lines 510-605)
```typescript
export default defineEventHandler(async (event) => {
  const body = await readBody<StreamingRequest>(event);
  const { constraints, sectionId, schemaId, patient, assessment, cumulativeSummary } = body;
  
  // Priority for prompt building:
  // 1. Use constraints to build prompt (preferred)
  // 2. Use client-provided prompt
  // 3. Use payload prompt
  // 4. Server schema fallback
  // 5. Legacy prompts
  
  if (constraints) {
    fullPrompt = buildPromptFromConstraints(
      constraints,
      assessment?.answers || {},
      patient,
      cumulativeSummary
    );
  }
});
```

### Step 7.2: Prompt Construction from Constraints (Lines 359-430)
```typescript
function buildPromptFromConstraints(
  constraints: ClientConstraints,
  answers: Record<string, unknown>,
  patient: StreamingRequest['patient'],
  cumulativeSummary?: string
): string {
  const lines = [];
  
  // 1. System guardrails
  lines.push('You are MedGemma, a senior clinical decision support specialist...');
  
  // 2. Previous clinical summary (if cumulative)
  if (cumulativeSummary) {
    lines.push('=== PREVIOUS CLINICAL SUMMARY ===');
    lines.push(cumulativeSummary);
  }
  
  // 3. Patient context
  if (patient) {
    lines.push(`PATIENT: ${formatPatientAge(patient.ageMonths)}, ${patient.weightKg}kg, ${patient.gender}`);
    if (patient.triagePriority) {
      lines.push(`CURRENT TRIAGE PRIORITY: ${patient.triagePriority.toUpperCase()}`);
    }
  }
  
  // 4. Section header
  lines.push(`=== SECTION: ${constraints.sectionId.toUpperCase()} ===`);
  
  // 5. Current findings
  if (constraints.requiredContext.length > 0) {
    lines.push('FINDINGS IN THIS SECTION:');
    constraints.requiredContext.forEach((fieldId) => {
      const value = answers[fieldId];
      lines.push(`- ${fieldId}: ${formatValue(value)}`);
    });
  }
  
  // 6. Core instruction
  lines.push('INSTRUCTION:');
  lines.push(constraints.instruction);
  
  // 7. Output constraints
  lines.push(`Keep your response under ${constraints.maxWords} words.`);
  
  // 8. Summary instruction
  if (constraints.summaryInstruction) {
    lines.push('IMPORTANT: At the end, provide "SUMMARY: <one sentence>"');
  }
  
  return lines.join('\n');
}
```

### Step 7.3: Age Formatting Utility (Lines 156-166)
```typescript
function formatPatientAge(months: number): string {
  if (months < 0) return 'age not specified';
  if (months === 0) return 'newborn (0 months)';
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} old`;
  
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  
  if (remainingMonths === 0) {
    return `${years} year${years !== 1 ? 's' : ''} old`;
  }
  return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''} old`;
}
```

---

## 8. Ollama API Streaming

**File:** [`server/api/ai/stream.post.ts`](server/api/ai/stream.post.ts:643)

### Step 8.1: Fetch to Ollama (Lines 643-659)
```typescript
const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: OLLAMA_MODEL,  // "gemma3:4b"
    prompt: fullPrompt,
    stream: true,
    options: {
      temperature: 0.2,
      num_predict: 300,   // Max tokens
      keep_alive: 300000
    }
  })
});
```

### Step 8.2: Stream Parsing (Lines 679-798)
```typescript
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let fullResponse = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value, { stream: true });
  buffer += text;
  
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    const parsed = parseOllamaResponse(line);
    if (parsed) {
      fullResponse += parsed.response;
      
      // Send chunk to client via SSE
      event.node.res.write(buildSSEEvent({
        type: 'chunk',
        requestId,
        timestamp: new Date().toISOString(),
        payload: { chunk: parsed.response, isLast: parsed.done }
      }));
      
      if (parsed.done) {
        // Stream complete - apply word limit
        const enforcement = enforceWordLimit(fullResponse, constraints.maxWords, sectionId);
        finalResponse = enforcement.response;
        
        // Extract summary
        extractedSummary = extractSummary(finalResponse);
        
        // Send complete event
        event.node.res.write(buildSSEEvent({
          type: 'complete',
          requestId,
          payload: { fullResponse: finalResponse, summary: extractedSummary }
        }));
      }
    }
  }
}
```

---

## 9. Frontend Streaming Display

**File:** [`app/components/clinical/AIStreamingPanel.vue`](app/components/clinical/AIStreamingPanel.vue:204)

### Step 9.1: Text Deduplication (Lines 274-319)
```typescript
function deduplicateStreamingContent(text: string): string {
  const paragraphs = text.split(/\n{2,}/);
  
  if (paragraphs.length <= 1) {
    return deduplicateRepeatedPhrases(text);
  }
  
  const uniqueParagraphs: string[] = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed && !uniqueParagraphs.includes(trimmed)) {
      uniqueParagraphs.push(trimmed);
    }
  }
  
  return uniqueParagraphs.join('\n\n');
}

function deduplicateRepeatedPhrases(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const uniqueSentences: string[] = [];
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > 10) {
      const isDuplicate = uniqueSentences.some(
        existing => levenshteinDistance(existing.toLowerCase(), trimmed.toLowerCase()) < trimmed.length * 0.3
      );
      if (!isDuplicate) {
        uniqueSentences.push(trimmed);
      }
    } else {
      uniqueSentences.push(trimmed);
    }
  }
  
  return uniqueSentences.join(' ');
}
```

### Step 9.2: Paragraph Rendering (Lines 248-268)
```typescript
const displayedParagraphs = computed(() => {
  const rawText = props.streamingText || '';
  
  // Deduplicate and normalize
  const dedupedText = deduplicateStreamingContent(rawText);
  const normalizedText = normalizeStreamingText(dedupedText);
  
  // Split into paragraphs
  const paragraphs = normalizedText.split(/\n+/).filter(p => p.trim());
  
  return paragraphs.map(paragraph => {
    const words = paragraph.trim().split(/(\s+)/);
    return words
      .filter(word => word.length > 0)
      .map(text => ({ text, completed: true }));
  });
});
```

### Step 9.3: Smooth Text Updates (Lines 442-462)
```typescript
watch(() => props.streamingText, (newText, oldText) => {
  if (!newText) {
    displayedText.value = '';
    return;
  }
  
  if (oldText && newText.length > oldText.length) {
    const addedContent = newText.slice(oldText.length);
    isBuffering.value = true;
    displayedText.value = newText;
    
    nextTick(() => {
      isBuffering.value = false;
    });
  } else {
    displayedText.value = newText;
  }
});
```

---

## 10. Summary Collection for Cumulative Context

**File:** [`app/pages/assessment/[schemaId]/[formId].vue`](app/pages/assessment/[schemaId]/[formId].vue:188)

### Step 10.1: Section Summary Addition (Lines 188-208)
```typescript
function addSectionSummary(sectionId: string, summary: string) {
  if (!summary || !summary.trim()) return;
  
  completedSections.value.add(sectionId);
  
  const sectionLabel = getSectionLabel(sectionId);
  const formattedSummary = `${sectionLabel}: ${summary}`;
  
  if (cumulativeSummary.value) {
    cumulativeSummary.value = `${cumulativeSummary.value} ${formattedSummary}`;
  } else {
    cumulativeSummary.value = formattedSummary;
  }
}

function getSectionLabel(sectionId: string): string {
  const labels = {
    'patient_info': 'Patient Info',
    'danger_signs': 'Danger Signs',
    'respiratory_danger': 'Respiratory Danger',
    'vitals': 'Vitals',
    'assessment': 'Physical Exam',
    'symptoms': 'Symptoms',
    'triage': 'Triage'
  };
  return labels[sectionId] || sectionId;
}
```

### Step 10.2: Deduplication for Context (Lines 171-186)
```typescript
function getDeduplicatedSummary(): string {
  const MAX_SECTIONS = 2;  // Keep only last 2 sections
  const summary = cumulativeSummary.value;
  
  const sections = summary.split(/(?=[A-Z][a-z]+:)/);
  
  if (sections.length <= MAX_SECTIONS) {
    return summary;
  }
  
  const recentSections = sections.slice(-MAX_SECTIONS);
  return recentSections.join('');
}
```

---

## Complete Execution Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER ACCESSES FORM                                          │
│  └─→ route.params.schemaId = "peds_respiratory"                 │
│  └─→ route.params.formId = "triage"                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. FORM ENGINE INITIALIZES                                      │
│  └─→ useClinicalFormEngine({ schemaId, formId, patientData })  │
│  └─→ Loads schema from peds_respiratory_schema.json             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. USER ENTERS DATA (e.g., resp_rate = 55)                      │
│  └─→ saveField('resp_rate', 55)                                │
│  └─→ reactiveHandleFieldChange('resp_rate', 55)                 │
│  └─→ Debounce timer starts (1500ms)                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. DEBOUNCE EXPIRES → REQUEST AI UPDATE                       │
│  └─→ requestUpdate()                                            │
│  └─→ buildContext(answers, calculated)                          │
│  └─→ Calculate age: 25 months = "2 years 1 month"               │
│  └─→ patientContext = { ageMonths: 25, weightKg: 12.5, ... }   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. RESOLVE SECTION CONSTRAINTS                                 │
│  └─→ loadSchema() → cachedSchema = peds_respiratory_schema     │
│  └─→ resolveSectionConstraints('danger_signs')                  │
│  └─→ Returns: { instruction, maxWords, guardrails, ... }       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. BUILD SYSTEM GUARDRAILS                                     │
│  └─→ buildSystemGuardrails(constraints, patientContext)        │
│  └─→ Combines: system guardrails + patient context + section   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  7. STREAMING API REQUEST                                       │
│  └─→ POST /api/ai/stream                                        │
│  └─→ Body: { requestId, constraints, patient, cumulativeSummary }│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  8. SERVER BUILD PROMPT                                        │
│  └─→ buildPromptFromConstraints(constraints, answers, patient)│
│  └─→ Full prompt assembled with 9 sections                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  9. OLLAMA STREAMING                                           │
│  └─→ POST http://localhost:11434/api/generate                  │
│  └─→ Stream chunks received via SSE                            │
│  └─→ Word limit enforcement (e.g., maxWords = 150)            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  10. EXTRACT SUMMARY                                            │
│  └─→ Look for "SUMMARY: <sentence>" at end of response         │
│  └─→ Returns one-sentence clinical takeaway                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  11. FRONTEND DISPLAY                                          │
│  └─→ AIStreamingPanel receives chunks                          │
│  └─→ Deduplicate content (Levenshtein distance check)          │
│  └─→ Render with typewriter animation                         │
│  └─→ Add section summary to cumulativeSummary                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  12. NEXT SECTION REPEats                                       │
│  └─→ User proceeds to "vitals" section                         │
│  └─→ cumulativeSummary = "Danger Signs: ..."                   │
│  └─→ Full flow repeats with cumulative context                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Files Summary

| Layer | File | Purpose |
|-------|------|---------|
| Frontend Page | [`app/pages/assessment/[schemaId]/[formId].vue`](app/pages/assessment/[schemaId]/[formId].vue) | Main assessment page, triggers AI |
| Frontend Composable | [`app/composables/useReactiveAI.ts`](app/composables/useReactiveAI.ts) | Field change detection, context building |
| Frontend Service | [`app/services/clinicalAI.ts`](app/services/clinicalAI.ts) | Schema loading, constraint resolution |
| Frontend Component | [`app/components/clinical/AIStreamingPanel.vue`](app/components/clinical/AIStreamingPanel.vue) | Streaming display, deduplication |
| Schema Definition | [`app/schemas/prompts/peds_respiratory_schema.json`](app/schemas/prompts/peds_respiratory_schema.json) | 7 sections with constraints |
| Server API | [`server/api/ai/stream.post.ts`](server/api/ai/stream.post.ts) | Prompt building, Ollama streaming |
| Server Types | [`server/api/ai/stream.post.ts:15-26`](server/api/ai/stream.post.ts:15) | AIUseCase, StreamingRequest types |