# MedGemma Phase 2 Implementation Roadmap

## Executive Summary

This document outlines the complete implementation plan for **Phase 2** of MedGemma, building upon the completed Phase 1 foundation. Phase 2 focuses on extending AI capabilities to treatment, discharge, and enhancing streaming features for a more comprehensive clinical decision support experience.

**Phase 1 Completion Status:**
- ✅ Structured AI response contract
- ✅ Inconsistency detection in AI flow
- ✅ Enhanced prompt engineering for structured JSON output
- ✅ Audit logging with structured metrics
- ✅ "Ask MedGemma" button integration
- ✅ ExplainabilityCard with full data display
- ✅ Confidence indicator and teaching notes UI
- ✅ Reactive form state with effectivePriority

**Phase 2 Goals:**
1. Extend AI to treatment and discharge workflows
2. Enhance streaming AI features with robust error handling
3. Add caregiver education and adherence risk features
4. Implement clinical handover and discharge summary generation

---

## 1. Architecture Overview

### Phase 2 System Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          NURSE UI (Nuxt.js)                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │ Assessment  │───▶│ Treatment   │───▶│ Discharge   │───▶│ Handover    │  │
│  │ Form        │    │ Form        │    │ Summary     │    │ Screen      │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│         │                  │                  │                  │          │
│         ▼                  ▼                  ▼                  ▼          │
│  "Ask MedGemma"    "Explain          "Generate        "Create Handover    │
│      (Done)         Treatment"         Summary"           Summary"         │
│         │                  │                  │                  │          │
└─────────┼──────────────────┼──────────────────┼──────────────────┼──────────┘
          │                  │                  │                  │
          ▼                  ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AI EXPLAINABILITY LAYER (MedGemma)                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Server API: /server/api/ai/stream.post.ts                             │  │
│  │ • EXPLAIN_TRIAGE (Phase 1 - Done)                                     │  │
│  │ • TREATMENT_ADVICE (Phase 2.1)                                        │  │
│  │ • CAREGIVER_INSTRUCTIONS (Phase 2.1)                                  │  │
│  │ • NOTE_SUMMARY (Phase 2.3)                                            │  │
│  │ • CLINICAL_HANDOVER (Phase 2.3)                                       │  │
│  │ • ADHERENCE_PREDICTION (Phase 2.1)                                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAMING LAYER (Phase 2.2)                            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ • SSE Connection Management                                           │  │
│  │ • Auto-reconnection with exponential backoff                          │  │
│  │ • Cancel token support                                                │  │
│  │ • Progress tracking and time estimation                               │  │
│  │ • Error recovery and fallback modes                                   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Implementation Phases

### Phase 2.1: Treatment Enhancement

**Priority:** HIGH  
**Dependencies:** Phase 1 complete

#### Task 2.1.1: Add ExplainabilityCard to Treatment Page

**Description:**
Extend the ExplainabilityCard component to display treatment recommendations with AI-enhanced explanations.

**Files to Modify:**
- `app/pages/sessions/[sessionId]/assessment.vue` - Add treatment section
- `app/components/clinical/ExplainabilityCard.vue` - Extend for treatment context

**Implementation Steps:**
1. Create treatment-specific explainability model builder
2. Add treatment recommendations to explainability data
3. Display AI-enhanced treatment explanations
4. Add "Explain Treatment" button in treatment section

**UI Placement:**
```
┌─────────────────────────────────────────────────────┐
│ Treatment Section                           [? MedGemma] │
├─────────────────────────────────────────────────────┤
│                                               ▲      │
│  Recommended Actions                          │      │
│  ┌─────────────────────────────────────────┐ │      │
│  │ • Oral antibiotics for 5 days           │ │      │
│  │ • Paracetamol for fever                 │ │      │
│  │ • Follow-up in 2 days                   │ │      │
│  └─────────────────────────────────────────┘ │      │
│                                               │      │
│  [Explain Treatment]  ──▶ AI explanation      │      │
│                                               ▼      │
├─────────────────────────────────────────────────────┤
│  Caregiver Education                        [Generate] │
└─────────────────────────────────────────────────────┘
```

**TypeScript Interface:**
```typescript
interface TreatmentExplainability {
  actions: TreatmentAction[];
  reasoning: string;
  precautions: string[];
  followUpRequired: boolean;
  aiEnhancement?: AIEnhancement;
}

interface TreatmentAction {
  code: string;
  label: string;
  dosage?: string;
  duration?: string;
  justification: string;
}
```

---

#### Task 2.1.2: Caregiver Education Generator

**Description:**
Add a "Generate Caregiver Explanation" button that creates simplified, caregiver-friendly explanations using the `CAREGIVER_INSTRUCTIONS` use case.

**Files to Create/Modify:**
- `app/components/clinical/CaregiverEducationPanel.vue` (new)
- `app/composables/useCaregiverEducation.ts` (new)
- `server/api/ai/stream.post.ts` - Enhance CAREGIVER_INSTRUCTIONS prompt

**Implementation Steps:**
1. Create CaregiverEducationPanel component
2. Implement useCaregiverEducation composable
3. Add streaming AI integration
4. Format output in simple, non-medical language
5. Add print/share functionality

**Prompt Template:**
```prompt
You are explaining medical care to a worried caregiver in a resource-limited setting.
Keep language simple, practical, and culturally sensitive.

PATIENT: {ageMonths} month old {gender}
DIAGNOSIS: {classification}
TREATMENT: {treatmentActions}

Generate:
1. What is happening (simple explanation)
2. What to do at home (step-by-step)
3. Warning signs to watch for
4. When to return immediately

Use short sentences. Avoid medical jargon. Max 150 words.
```

**Component Structure:**
```vue
<template>
  <div class="caregiver-education-panel">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <h3>Caregiver Instructions</h3>
      <button @click="generateEducation" :disabled="isGenerating">
        Generate
      </button>
    </div>
    
    <!-- Streaming Panel -->
    <AIStreamingPanel
      v-if="isGenerating || education"
      :is-streaming="isGenerating"
      :streaming-text="education"
      :progress-percent="progress"
    />
    
    <!-- Actions -->
    <div v-if="education" class="mt-4 flex gap-2">
      <button @click="printEducation">Print</button>
      <button @click="shareEducation">Share</button>
    </div>
  </div>
</template>
```

---

#### Task 2.1.3: Adherence Risk Scoring

**Description:**
Implement a simple adherence risk scoring system to identify patients at risk of not completing treatment.

**Files to Create:**
- `app/composables/useAdherenceRisk.ts` (new)
- `app/components/clinical/AdherenceRiskIndicator.vue` (new)

**Risk Factors:**
| Factor | Weight | Data Source |
|--------|--------|-------------|
| Treatment complexity | 0.25 | Number of medications |
| Patient age | 0.20 | Age in months |
| Previous missed visits | 0.20 | Visit history |
| Treatment duration | 0.15 | Days of treatment |
| Distance from clinic | 0.10 | Patient location (if available) |
| Caregiver literacy | 0.10 | Estimated from occupation |

**Implementation:**
```typescript
interface AdherenceRiskFactors {
  medicationCount: number;
  patientAgeMonths: number;
  treatmentDurationDays: number;
  previousMissedVisits: number;
  distanceFromClinic?: number;
  caregiverLiteracy?: 'low' | 'medium' | 'high';
}

interface AdherenceRiskResult {
  score: number; // 0-100
  level: 'low' | 'medium' | 'high';
  factors: string[];
  recommendations: string[];
}

function calculateAdherenceRisk(factors: AdherenceRiskFactors): AdherenceRiskResult {
  let score = 0;
  const contributingFactors: string[] = [];
  
  // Treatment complexity (0-25 points)
  if (factors.medicationCount > 3) {
    score += 25;
    contributingFactors.push('Multiple medications increase complexity');
  } else if (factors.medicationCount > 1) {
    score += 10;
  }
  
  // Age factor (0-20 points)
  if (factors.patientAgeMonths < 12) {
    score += 15;
    contributingFactors.push('Infant requires careful dosing');
  }
  
  // Previous missed visits (0-20 points)
  score += Math.min(20, factors.previousMissedVisits * 10);
  if (factors.previousMissedVisits > 0) {
    contributingFactors.push('History of missed appointments');
  }
  
  // Treatment duration (0-15 points)
  if (factors.treatmentDurationDays > 7) {
    score += 15;
    contributingFactors.push('Extended treatment duration');
  } else if (factors.treatmentDurationDays > 3) {
    score += 8;
  }
  
  // Determine level
  const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  
  // Generate recommendations
  const recommendations = generateAdherenceRecommendations(level, contributingFactors);
  
  return { score, level, factors: contributingFactors, recommendations };
}
```

**UI Component:**
```vue
<template>
  <div :class="['adherence-risk-indicator', levelClass]">
    <div class="flex items-center gap-2">
      <div class="risk-meter" :style="{ width: `${score}%` }" />
      <span class="risk-label">{{ level.toUpperCase() }} RISK</span>
    </div>
    <ul v-if="factors.length" class="factors-list">
      <li v-for="factor in factors" :key="factor">{{ factor }}</li>
    </ul>
    <div v-if="recommendations.length" class="recommendations">
      <h4>Recommendations:</h4>
      <ul>
        <li v-for="rec in recommendations" :key="rec">{{ rec }}</li>
      </ul>
    </div>
  </div>
</template>
```

---

### Phase 2.2: Streaming AI Enhancement

**Priority:** MEDIUM  
**Dependencies:** Phase 2.1 partial completion

#### Task 2.2.1: Enhanced Connection Management

**Description:**
Improve SSE connection handling with robust reconnection logic and connection state management.

**Files to Modify:**
- `app/composables/useAIStream.ts`
- `app/services/clinicalAI.ts`

**Implementation Steps:**
1. Add exponential backoff for reconnection
2. Implement connection state machine
3. Add connection health monitoring
4. Create connection status UI indicator

**Connection State Machine:**
```
┌─────────┐    connect()    ┌──────────┐    connected    ┌────────────┐
│ IDLE    │ ───────────────▶│CONNECTING│ ───────────────▶│ CONNECTED  │
└─────────┘                 └──────────┘                 └────────────┘
     ▲                            │                            │
     │                            │ failed                     │
     │                            ▼                            │
     │                     ┌──────────┐                        │
     │                     │ RETRYING │◀───────────────────────┤
     │                     └──────────┘    disconnect/error    │
     │                            │                            │
     │                            │ max retries exceeded       │
     │                            ▼                            │
     └────────────────────◀────────────────────────────────────┘
                              cancel/reset
```

**TypeScript Implementation:**
```typescript
interface ConnectionState {
  status: 'idle' | 'connecting' | 'connected' | 'retrying' | 'error';
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  connectedAt?: Date;
}

function useConnectionManager() {
  const state = reactive<ConnectionState>({
    status: 'idle',
    retryCount: 0,
    maxRetries: 3
  });
  
  const backoffMs = computed(() => {
    return Math.min(1000 * Math.pow(2, state.retryCount), 10000);
  });
  
  async function connect(url: string): Promise<EventSource> {
    state.status = 'connecting';
    
    try {
      const eventSource = new EventSource(url);
      
      await new Promise((resolve, reject) => {
        eventSource.onopen = () => {
          state.status = 'connected';
          state.retryCount = 0;
          state.connectedAt = new Date();
          resolve(void 0);
        };
        
        eventSource.onerror = (err) => {
          if (state.retryCount < state.maxRetries) {
            state.status = 'retrying';
            state.retryCount++;
            setTimeout(() => connect(url), backoffMs.value);
          } else {
            state.status = 'error';
            state.lastError = 'Max retries exceeded';
            reject(err);
          }
        };
      });
      
      return eventSource;
    } catch (err) {
      state.status = 'error';
      throw err;
    }
  }
  
  return { state, connect };
}
```

---

#### Task 2.2.2: Cancel Token Enhancement

**Description:**
Implement proper cancel token support for streaming requests with cleanup.

**Files to Modify:**
- `app/composables/useAIStream.ts`
- `app/services/clinicalAI.ts`
- `server/api/ai/stream.post.ts`

**Implementation:**
```typescript
interface CancelToken {
  isCancelled: boolean;
  reason?: string;
  abort: () => void;
}

function createCancelToken(): CancelToken {
  const controller = new AbortController();
  
  return {
    isCancelled: false,
    abort: () => {
      controller.abort();
    }
  };
}

// In streaming function
async function streamWithCancel(
  url: string,
  cancelToken: CancelToken,
  callbacks: StreamCallbacks
): Promise<void> {
  const eventSource = new EventSource(url);
  
  // Check cancellation periodically
  const cancelCheck = setInterval(() => {
    if (cancelToken.isCancelled) {
      eventSource.close();
      clearInterval(cancelCheck);
      callbacks.onCancel?.();
    }
  }, 100);
  
  eventSource.onmessage = (event) => {
    if (cancelToken.isCancelled) return;
    callbacks.onChunk?.(event.data);
  };
  
  eventSource.onerror = (err) => {
    clearInterval(cancelCheck);
    if (!cancelToken.isCancelled) {
      callbacks.onError?.(err, true);
    }
  };
}
```

---

#### Task 2.2.3: Progress and Time Estimation

**Description:**
Add accurate progress tracking and time remaining estimation for streaming responses.

**Files to Modify:**
- `app/composables/useAIStream.ts`
- `app/components/clinical/AIStreamingPanel.vue`

**Implementation:**
```typescript
interface ProgressTracker {
  tokensGenerated: number;
  estimatedTotal: number;
  startTime: number;
  tokensPerSecond: number;
  estimatedTimeRemaining: number; // seconds
}

function useProgressTracker() {
  const tracker = reactive<ProgressTracker>({
    tokensGenerated: 0,
    estimatedTotal: 200, // Default estimate
    startTime: 0,
    tokensPerSecond: 0,
    estimatedTimeRemaining: 0
  });
  
  const progressPercent = computed(() => {
    return Math.min(100, (tracker.tokensGenerated / tracker.estimatedTotal) * 100);
  });
  
  const formattedTimeRemaining = computed(() => {
    if (tracker.estimatedTimeRemaining < 1) return 'Less than 1 second';
    if (tracker.estimatedTimeRemaining < 60) return `${Math.round(tracker.estimatedTimeRemaining)} seconds`;
    return `${Math.floor(tracker.estimatedTimeRemaining / 60)} min ${Math.round(tracker.estimatedTimeRemaining % 60)} sec`;
  });
  
  function start() {
    tracker.startTime = Date.now();
    tracker.tokensGenerated = 0;
  }
  
  function addToken(count: number = 1) {
    tracker.tokensGenerated += count;
    
    const elapsed = (Date.now() - tracker.startTime) / 1000;
    tracker.tokensPerSecond = tracker.tokensGenerated / elapsed;
    
    const remaining = tracker.estimatedTotal - tracker.tokensGenerated;
    tracker.estimatedTimeRemaining = remaining / tracker.tokensPerSecond;
  }
  
  return { tracker, progressPercent, formattedTimeRemaining, start, addToken };
}
```

---

### Phase 2.3: Discharge Enhancement

**Priority:** MEDIUM  
**Dependencies:** Phase 2.1 complete

#### Task 2.3.1: Discharge Summary Generator

**Description:**
Add AI-generated discharge summary using the `NOTE_SUMMARY` use case.

**Files to Create:**
- `app/components/clinical/DischargeSummaryPanel.vue` (new)
- `app/composables/useDischargeSummary.ts` (new)

**Implementation Steps:**
1. Create discharge summary data model
2. Implement summary generation with streaming
3. Add edit capability for nurse review
4. Include print and save functionality

**Prompt Template:**
```prompt
Generate a concise discharge summary for the medical record.

PATIENT: {patientName}, {ageMonths} months, {gender}
CHIEF COMPLAINT: {chiefComplaint}
ASSESSMENT FINDINGS: {findings}
TRIAGE CLASSIFICATION: {classification}
TREATMENT PROVIDED: {treatment}
FOLLOW-UP: {followUp}

Format:
1. Chief Complaint (1 sentence)
2. Key Findings (bullet points)
3. Diagnosis/Classification
4. Treatment Given
5. Follow-up Plan
6. Return Precautions

Max 150 words. Use standard medical abbreviations.
```

---

#### Task 2.3.2: Clinical Handover Generator

**Description:**
Generate structured clinical handover using the `CLINICAL_HANDOVER` use case for shift changes.

**Files to Create:**
- `app/components/clinical/ClinicalHandoverPanel.vue` (new)
- `app/composables/useClinicalHandover.ts` (new)

**SBAR Format:**
```typescript
interface ClinicalHandover {
  situation: string;     // What is happening now
  background: string;    // Patient history context
  assessment: string;    // Clinical assessment findings
  recommendation: string; // What needs to be done
}
```

**Prompt Template:**
```prompt
Generate a clinical handover using SBAR format for shift change.

PATIENT: {patientName}, {ageMonths} months, {gender}
SESSION ID: {sessionId}
CURRENT STATUS: {status}
TRIAGE: {classification}
KEY FINDINGS: {findings}
PENDING ACTIONS: {pendingActions}

Output SBAR format:
SITUATION: (1 sentence on current status)
BACKGROUND: (relevant history, 2-3 sentences)
ASSESSMENT: (key clinical findings, bullet points)
RECOMMENDATION: (what the next nurse should do)

Max 100 words total. Focus on actionable information.
```

---

#### Task 2.3.3: Follow-up Reminder Generator

**Description:**
Generate AI-powered follow-up reminders and schedule suggestions.

**Files to Create:**
- `app/components/clinical/FollowUpReminder.vue` (new)

**Implementation:**
```typescript
interface FollowUpReminder {
  followUpDate: Date;
  reminderType: 'appointment' | 'medication_completion' | 'symptom_check';
  instructions: string;
  warningSigns: string[];
  aiGenerated: boolean;
}

function generateFollowUpReminder(
  classification: TriagePriority,
  treatment: TreatmentAction[],
  patientAge: number
): FollowUpReminder {
  // Calculate follow-up date based on classification
  const daysUntilFollowUp = {
    'red': 1,    // Next day
    'yellow': 2, // 2 days
    'green': 7   // 1 week
  };
  
  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + daysUntilFollowUp[classification]);
  
  return {
    followUpDate,
    reminderType: 'appointment',
    instructions: generateInstructions(classification, treatment),
    warningSigns: generateWarningSigns(classification),
    aiGenerated: true
  };
}
```

---

## 3. Implementation Order & Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEPENDENCY CHART                                     │
└─────────────────────────────────────────────────────────────────────────────┘

Phase 2.1 (Treatment Enhancement)
├── 2.1.1 ExplainabilityCard for Treatment ──► 2.1.2 Caregiver Education
│                                                    │
├── 2.1.3 Adherence Risk Scoring ───────────────────┘
          │
          ▼
Phase 2.2 (Streaming Enhancement)
├── 2.2.1 Connection Management ──► 2.2.2 Cancel Tokens ──► 2.2.3 Progress
          │
          ▼
Phase 2.3 (Discharge Enhancement)
├── 2.3.1 Discharge Summary ──► 2.3.2 Clinical Handover ──► 2.3.3 Follow-up
          │
          └──────────────────────────────────────────────────────┐
                                                                 │
                                                                 ▼
                                                        Phase 3 (Future)
```

---

## 4. Detailed Task Breakdown

### Summary Table

| Task ID | Task Name | Priority | Dependencies | Files |
|---------|-----------|----------|--------------|-------|
| 2.1.1 | ExplainabilityCard for Treatment | HIGH | Phase 1 | assessment.vue, ExplainabilityCard.vue |
| 2.1.2 | Caregiver Education Generator | HIGH | 2.1.1 | CaregiverEducationPanel.vue, useCaregiverEducation.ts |
| 2.1.3 | Adherence Risk Scoring | MEDIUM | None | useAdherenceRisk.ts, AdherenceRiskIndicator.vue |
| 2.2.1 | Connection Management | MEDIUM | None | useAIStream.ts, clinicalAI.ts |
| 2.2.2 | Cancel Token Enhancement | MEDIUM | 2.2.1 | useAIStream.ts |
| 2.2.3 | Progress and Time Estimation | LOW | 2.2.1 | useAIStream.ts, AIStreamingPanel.vue |
| 2.3.1 | Discharge Summary Generator | MEDIUM | 2.1.1 | DischargeSummaryPanel.vue, useDischargeSummary.ts |
| 2.3.2 | Clinical Handover Generator | MEDIUM | 2.3.1 | ClinicalHandoverPanel.vue, useClinicalHandover.ts |
| 2.3.3 | Follow-up Reminder Generator | LOW | 2.3.1 | FollowUpReminder.vue |

---

## 5. Success Criteria

### Functional Requirements

| Requirement | Verification |
|-------------|--------------|
| Treatment page shows AI-enhanced explanations | Manual test |
| Caregiver education generates in < 5 seconds | Performance test |
| Adherence risk displays for all patients | Unit test |
| Streaming reconnects automatically on disconnect | Integration test |
| Cancel button stops streaming within 1 second | Manual test |
| Progress bar shows accurate estimation | Manual test |
| Discharge summary generates correctly | Manual test |
| Clinical handover uses SBAR format | Unit test |
| Follow-up reminders are appropriate to classification | Manual test |

### Non-Functional Requirements

| Requirement | Target | Verification |
|-------------|--------|--------------|
| Streaming response time | < 3 seconds to first token | Performance test |
| Reconnection time | < 5 seconds | Integration test |
| UI responsiveness | No blocking during streaming | Manual test |
| Accessibility | WCAG 2.1 AA | Audit |

---

## 6. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|--------------|------------|
| Ollama latency > 5s | High | Medium | Streaming, caching, progress indicators |
| Connection drops in field | High | High | Robust reconnection, offline fallback |
| Caregiver education too complex | Medium | Medium | Prompt iteration, user feedback |
| Adherence scoring inaccurate | Low | Medium | Validate with clinical staff |
| Discharge summary missing key info | Medium | Low | Structured prompts, nurse review |

---

## 7. Next Steps

1. **Review and approve this roadmap** - Confirm priorities and scope
2. **Start with Task 2.1.1** - Treatment ExplainabilityCard (foundational)
3. **Implement streaming enhancements in parallel** - Can be done independently
4. **Iterate based on clinical feedback** - User testing with nurses
5. **Document lessons learned** - Update this roadmap as needed

---

*Document Version: 1.0*  
*Created: 2026-02-14*  
*Phase: Phase 2 - Treatment, Streaming & Discharge Enhancement*
