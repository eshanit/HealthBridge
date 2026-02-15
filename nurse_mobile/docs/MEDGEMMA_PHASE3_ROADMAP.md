# MedGemma Phase 3 Implementation Roadmap

## Executive Summary

This document outlines the complete implementation plan for **Phase 3** of MedGemma, building upon the completed Phase 1 and Phase 2 foundations. Phase 3 focuses on advanced AI capabilities including multi-language support, voice integration, offline AI, quality assurance loops, and analytics dashboards.

**Phase 1 & 2 Completion Status:**
- ✅ Core AI integration with structured responses
- ✅ Streaming AI with SSE
- ✅ Treatment and discharge AI support
- ✅ Section-based guidance with prompt schemas
- ✅ Caregiver education generation
- ✅ Adherence risk scoring
- ✅ Clinical handover (SBAR format)
- ✅ Discharge summary generation

**Phase 3 Goals:**
1. Multi-language AI support for diverse caregiver populations
2. Voice-to-text input for hands-free clinical documentation
3. Offline AI capabilities with model quantization
4. Quality assurance and feedback loops for AI improvement
5. Analytics dashboard for clinical insights
6. Integration with external clinical knowledge bases

---

## 1. Architecture Overview

### Phase 3 System Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          NURSE UI (Nuxt.js)                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │ Voice       │    │ Multi-      │    │ Quality     │    │ Analytics   │  │
│  │ Input       │    │ Language    │    │ Feedback    │    │ Dashboard   │  │
│  │ (NEW)       │    │ (NEW)       │    │ (NEW)       │    │ (NEW)       │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│         │                  │                  │                  │          │
│         ▼                  ▼                  ▼                  ▼          │
└─────────┼──────────────────┼──────────────────┼──────────────────┼──────────┘
          │                  │                  │                  │
          ▼                  ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AI ENHANCEMENT LAYER (Phase 3)                           │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Server API: /server/api/ai/                                           │  │
│  │ • VOICE_TO_TEXT (Phase 3.1)                                           │  │
│  │ • TRANSLATE_OUTPUT (Phase 3.2)                                        │  │
│  │ • QUALITY_FEEDBACK (Phase 3.3)                                        │  │
│  │ • ANALYTICS_QUERY (Phase 3.4)                                         │  │
│  │ • OFFLINE_INFERENCE (Phase 3.5)                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OFFLINE AI LAYER (Phase 3.5)                           │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ • Quantized model storage (WebLLM/ONNX)                               │  │
│  │ • Local inference engine                                              │  │
│  │ • Sync when online                                                    │  │
│  │ • Fallback to server when available                                   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Implementation Phases

### Phase 3.1: Voice Integration

**Priority:** HIGH  
**Dependencies:** Phase 2 complete

#### Task 3.1.1: Voice-to-Text Input

**Description:**
Add voice input capability for hands-free clinical documentation, especially useful during busy shifts.

**Files to Create:**
- `app/composables/useVoiceInput.ts` (new)
- `app/components/clinical/VoiceInputButton.vue` (new)

**Implementation Steps:**
1. Integrate Web Speech API or Whisper.js
2. Add voice recording UI component
3. Implement real-time transcription
4. Add medical terminology recognition
5. Support multiple languages

**TypeScript Interface:**
```typescript
interface VoiceInputResult {
  transcript: string;
  confidence: number;
  language: string;
  duration: number;
  medicalTerms: string[];
}

interface UseVoiceInputOptions {
  language?: 'en' | 'sn' | 'nd';  // English, Shona, Ndebele
  continuous?: boolean;
  medicalMode?: boolean;
}

function useVoiceInput(options?: UseVoiceInputOptions) {
  const isRecording = ref(false);
  const transcript = ref('');
  const confidence = ref(0);
  
  async function startRecording(): Promise<void>;
  function stopRecording(): VoiceInputResult;
  function clearTranscript(): void;
  
  return { isRecording, transcript, confidence, startRecording, stopRecording, clearTranscript };
}
```

**UI Component:**
```vue
<template>
  <div class="voice-input-container">
    <button 
      @click="toggleRecording"
      :class="['voice-btn', { recording: isRecording }]"
      :disabled="!isSupported"
    >
      <svg v-if="!isRecording" class="mic-icon" />
      <svg v-else class="stop-icon animate-pulse" />
      <span>{{ isRecording ? 'Stop' : 'Speak' }}</span>
    </button>
    
    <div v-if="transcript" class="transcript-preview">
      {{ transcript }}
      <button @click="applyToForm">Apply</button>
      <button @click="clearTranscript">Clear</button>
    </div>
  </div>
</template>
```

---

#### Task 3.1.2: Voice Output (Text-to-Speech)

**Description:**
Read AI responses aloud for accessibility and hands-free operation.

**Files to Create:**
- `app/composables/useVoiceOutput.ts` (new)

**Implementation:**
```typescript
interface VoiceOutputOptions {
  rate?: number;      // 0.1 to 10
  pitch?: number;     // 0 to 2
  language?: string;
}

function useVoiceOutput(options?: VoiceOutputOptions) {
  const isSpeaking = ref(false);
  const queue = ref<string[]>([]);
  
  function speak(text: string): void;
  function stop(): void;
  function pause(): void;
  function resume(): void;
  
  return { isSpeaking, speak, stop, pause, resume };
}
```

---

### Phase 3.2: Multi-Language Support

**Priority:** HIGH  
**Dependencies:** Phase 3.1 partial

#### Task 3.2.1: AI Output Translation

**Description:**
Translate AI-generated caregiver education and instructions into local languages.

**Files to Create:**
- `app/services/translationService.ts` (new)
- `app/composables/useTranslation.ts` (new)

**Supported Languages:**
| Code | Language | Region |
|------|----------|--------|
| `en` | English | Default |
| `sn` | Shona | Zimbabwe |
| `nd` | Ndebele | Zimbabwe |

**Implementation:**
```typescript
interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidence: number;
}

interface TranslationService {
  translate(text: string, targetLang: string): Promise<TranslationResult>;
  detectLanguage(text: string): Promise<string>;
  getSupportedLanguages(): string[];
}

// Using LibreTranslate or Google Translate API
class LibreTranslateService implements TranslationService {
  async translate(text: string, targetLang: string): Promise<TranslationResult> {
    const response = await fetch('/api/translate', {
      method: 'POST',
      body: JSON.stringify({ text, targetLang })
    });
    return response.json();
  }
}
```

**UI Integration:**
```vue
<template>
  <div class="translated-content">
    <div class="language-selector">
      <select v-model="selectedLanguage">
        <option value="en">English</option>
        <option value="sn">Shona</option>
        <option value="nd">Ndebele</option>
      </select>
    </div>
    
    <div class="content">
      <p v-if="!isTranslating">{{ displayText }}</p>
      <p v-else class="loading">Translating...</p>
    </div>
    
    <button @click="speakAloud" v-if="displayText">
      🔊 Read Aloud
    </button>
  </div>
</template>
```

---

#### Task 3.2.2: Localized Prompt Templates

**Description:**
Create language-specific prompt templates for better AI responses in local contexts.

**Files to Create:**
- `app/schemas/prompts/peds_respiratory_schema.sn.json` (Shona)
- `app/schemas/prompts/peds_respiratory_schema.nd.json` (Ndebele)

**Structure:**
```json
{
  "schemaId": "peds_respiratory_sn",
  "language": "sn",
  "version": "1.0.0",
  "systemGuardrails": "Iwe uri MedGemma, mubatsiri wekutarisa kurwara...",
  "fieldLabels": {
    "patient_age_months": "Mwedzi yemakore",
    "unable_to_drink": "Haakwanise kunwa/kuyamwisa",
    ...
  },
  "sections": [...]
}
```

---

### Phase 3.3: Quality Assurance & Feedback

**Priority:** MEDIUM  
**Dependencies:** Phase 2 complete

#### Task 3.3.1: AI Feedback Collection

**Description:**
Collect nurse feedback on AI responses to improve quality over time.

**Files to Create:**
- `app/composables/useAIFeedback.ts` (new)
- `app/components/clinical/AIFeedbackPanel.vue` (new)
- `server/api/ai/feedback.post.ts` (new)

**Feedback Types:**
```typescript
interface AIFeedback {
  id: string;
  sessionId: string;
  requestId: string;
  useCase: AIUseCase;
  rating: 'helpful' | 'not_helpful' | 'incorrect' | 'dangerous';
  comment?: string;
  nurseId?: string;
  timestamp: string;
  aiResponse: {
    explanation: string;
    confidence: number;
    modelVersion: string;
  };
  clinicalContext: {
    triagePriority: string;
    sectionId?: string;
  };
}
```

**UI Component:**
```vue
<template>
  <div class="ai-feedback-panel">
    <p>Was this AI guidance helpful?</p>
    <div class="feedback-buttons">
      <button @click="submitFeedback('helpful')" class="btn-helpful">
        👍 Helpful
      </button>
      <button @click="submitFeedback('not_helpful')" class="btn-not-helpful">
        👎 Not Helpful
      </button>
      <button @click="showDetailedFeedback = true" class="btn-detail">
        📝 Detailed Feedback
      </button>
    </div>
    
    <div v-if="showDetailedFeedback" class="detailed-feedback">
      <textarea v-model="comment" placeholder="What could be improved?" />
      <select v-model="category">
        <option value="accuracy">Accuracy Issue</option>
        <option value="clarity">Unclear Language</option>
        <option value="completeness">Missing Information</option>
        <option value="safety">Safety Concern</option>
      </select>
      <button @click="submitDetailedFeedback">Submit</button>
    </div>
  </div>
</template>
```

---

#### Task 3.3.2: AI Quality Dashboard

**Description:**
Admin dashboard to monitor AI performance and feedback metrics.

**Files to Create:**
- `app/pages/admin/ai-quality.vue` (new)
- `app/composables/useAIQualityMetrics.ts` (new)

**Metrics Tracked:**
| Metric | Description |
|--------|-------------|
| Helpfulness Rate | % of responses rated helpful |
| Response Time | Average time to first token |
| Error Rate | % of failed requests |
| Safety Flags | Count of safety filter triggers |
| Language Distribution | Requests by language |
| Use Case Distribution | Requests by use case |

---

### Phase 3.4: Analytics & Insights

**Priority:** MEDIUM  
**Dependencies:** Phase 3.3 partial

#### Task 3.4.1: Clinical Analytics Dashboard

**Description:**
Provide insights on clinical patterns, triage distribution, and AI usage.

**Files to Create:**
- `app/pages/admin/analytics.vue` (new)
- `app/composables/useClinicalAnalytics.ts` (new)
- `server/api/analytics/index.ts` (new)

**Analytics Types:**
```typescript
interface ClinicalAnalytics {
  triageDistribution: {
    red: number;
    yellow: number;
    green: number;
  };
  topDiagnoses: Array<{
    classification: string;
    count: number;
    percentage: number;
  }>;
  aiUsageStats: {
    totalRequests: number;
    byUseCase: Record<AIUseCase, number>;
    averageResponseTime: number;
  };
  timeSeriesData: Array<{
    date: string;
    sessions: number;
    aiRequests: number;
  }>;
}
```

**Dashboard Components:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    CLINICAL ANALYTICS DASHBOARD                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ Triage        │  │ AI Usage      │  │ Response      │       │
│  │ Distribution  │  │ This Week     │  │ Time Avg      │       │
│  │ [PIE CHART]   │  │ [BAR CHART]   │  │ 2.3 seconds   │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              SESSIONS & AI REQUESTS OVER TIME              │ │
│  │              [LINE CHART - 30 DAYS]                        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │ TOP DIAGNOSES           │  │ AI FEEDBACK SUMMARY         │  │
│  │ 1. Pneumonia (32%)      │  │ Helpful: 78%                │  │
│  │ 2. Bronchiolitis (24%)  │  │ Not Helpful: 15%            │  │
│  │ 3. URTI (18%)           │  │ Incorrect: 5%               │  │
│  └─────────────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

#### Task 3.4.2: Pattern Detection Alerts

**Description:**
Detect unusual patterns in clinical data and alert supervisors.

**Implementation:**
```typescript
interface PatternAlert {
  id: string;
  type: 'outbreak' | 'unusual_triage' | 'ai_anomaly' | 'data_quality';
  severity: 'low' | 'medium' | 'high';
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
  acknowledged: boolean;
}

function detectPatterns(sessions: ClinicalSession[]): PatternAlert[] {
  const alerts: PatternAlert[] = [];
  
  // Example: Detect unusual increase in RED triage
  const redRate = calculateRedRate(sessions);
  if (redRate > HISTORICAL_RED_RATE * 1.5) {
    alerts.push({
      type: 'unusual_triage',
      severity: 'high',
      message: `RED triage rate (${redRate}%) is 50% above normal`,
      data: { redRate, historicalRate: HISTORICAL_RED_RATE }
    });
  }
  
  return alerts;
}
```

---

### Phase 3.5: Offline AI Capabilities

**Priority:** LOW  
**Dependencies:** Phase 3.1, 3.2, 3.3

#### Task 3.5.1: Quantized Model for Offline Use

**Description:**
Enable basic AI functionality when offline using a quantized model running in the browser.

**Files to Create:**
- `app/services/offlineAI.ts` (new)
- `app/composables/useOfflineAI.ts` (new)

**Technology Options:**
| Option | Pros | Cons |
|--------|------|------|
| WebLLM | Runs in browser, no server | Large download (~500MB) |
| ONNX Runtime | Fast inference | Requires model conversion |
| TensorFlow.js | Mature ecosystem | Limited model support |

**Implementation:**
```typescript
interface OfflineAIConfig {
  modelUrl: string;
  modelSize: number;  // in MB
  maxTokens: number;
  temperature: number;
}

class OfflineAIEngine {
  private engine: any;
  private isLoaded = false;
  
  async loadModel(config: OfflineAIConfig): Promise<void> {
    // Load quantized model from CDN or IndexedDB
    this.engine = await webllm.CreateMLCEngine('gemma-2b-q4f16');
    this.isLoaded = true;
  }
  
  async generate(prompt: string): Promise<string> {
    if (!this.isLoaded) {
      throw new Error('Model not loaded');
    }
    return this.engine.generate(prompt);
  }
  
  async isModelCached(): Promise<boolean> {
    // Check if model is already in IndexedDB
  }
}
```

**UI Integration:**
```vue
<template>
  <div class="offline-ai-status">
    <div v-if="!isOnline" class="offline-banner">
      📴 Offline Mode - Using local AI model
    </div>
    
    <div v-if="!isModelLoaded" class="model-download">
      <p>Download offline AI model ({{ modelSize }}MB)?</p>
      <button @click="downloadModel">Download</button>
      <progress :value="downloadProgress" max="100" />
    </div>
  </div>
</template>
```

---

#### Task 3.5.2: Sync Queue for Offline Requests

**Description:**
Queue AI requests made offline for processing when connection is restored.

**Implementation:**
```typescript
interface QueuedAIRequest {
  id: string;
  sessionId: string;
  useCase: AIUseCase;
  payload: Record<string, unknown>;
  timestamp: string;
  synced: boolean;
}

function useOfflineQueue() {
  const queue = ref<QueuedAIRequest[]>([]);
  
  function addToQueue(request: Omit<QueuedAIRequest, 'id' | 'synced'>): void {
    queue.value.push({
      ...request,
      id: generateId(),
      synced: false
    });
    persistQueue();
  }
  
  async function syncQueue(): Promise<void> {
    for (const request of queue.value.filter(r => !r.synced)) {
      try {
        await processAIRequest(request);
        request.synced = true;
      } catch (error) {
        console.error('Failed to sync request:', request.id);
      }
    }
    persistQueue();
  }
  
  return { queue, addToQueue, syncQueue };
}
```

---

## 3. Implementation Order & Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEPENDENCY CHART                                     │
└─────────────────────────────────────────────────────────────────────────────┘

Phase 3.1 (Voice Integration)
├── 3.1.1 Voice-to-Text ──► 3.1.2 Voice Output
          │
          ▼
Phase 3.2 (Multi-Language)
├── 3.2.1 Translation Service ──► 3.2.2 Localized Prompts
          │
          ▼
Phase 3.3 (Quality Assurance)
├── 3.3.1 Feedback Collection ──► 3.3.2 Quality Dashboard
          │
          ▼
Phase 3.4 (Analytics)
├── 3.4.1 Analytics Dashboard ──► 3.4.2 Pattern Detection
          │
          ▼
Phase 3.5 (Offline AI)
├── 3.5.1 Quantized Model ──► 3.5.2 Sync Queue
```

---

## 4. Detailed Task Breakdown

### Summary Table

| Task ID | Task Name | Priority | Dependencies | Files |
|---------|-----------|----------|--------------|-------|
| 3.1.1 | Voice-to-Text Input | HIGH | Phase 2 | useVoiceInput.ts, VoiceInputButton.vue |
| 3.1.2 | Voice Output (TTS) | MEDIUM | 3.1.1 | useVoiceOutput.ts |
| 3.2.1 | AI Output Translation | HIGH | None | translationService.ts, useTranslation.ts |
| 3.2.2 | Localized Prompt Templates | MEDIUM | 3.2.1 | peds_respiratory_schema.*.json |
| 3.3.1 | AI Feedback Collection | MEDIUM | None | useAIFeedback.ts, AIFeedbackPanel.vue |
| 3.3.2 | AI Quality Dashboard | LOW | 3.3.1 | admin/ai-quality.vue |
| 3.4.1 | Clinical Analytics Dashboard | MEDIUM | 3.3.1 | admin/analytics.vue |
| 3.4.2 | Pattern Detection Alerts | LOW | 3.4.1 | usePatternDetection.ts |
| 3.5.1 | Quantized Model for Offline | LOW | 3.1, 3.2 | offlineAI.ts |
| 3.5.2 | Sync Queue for Offline | LOW | 3.5.1 | useOfflineQueue.ts |

---

## 5. Success Criteria

### Functional Requirements

| Requirement | Verification |
|-------------|--------------|
| Voice input works in noisy environments | Field test |
| Translations are accurate for medical terms | Clinical review |
| Feedback is captured and stored | Integration test |
| Analytics dashboard shows real data | Manual test |
| Offline AI produces valid responses | Unit test |
| Sync queue processes on reconnection | Integration test |

### Non-Functional Requirements

| Requirement | Target | Verification |
|-------------|--------|--------------|
| Voice transcription latency | < 2 seconds | Performance test |
| Translation latency | < 1 second | Performance test |
| Offline model size | < 500 MB | Build verification |
| Offline inference time | < 5 seconds | Performance test |
| Analytics query time | < 3 seconds | Performance test |

---

## 6. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|--------------|------------|
| Voice recognition poor in noisy clinics | High | High | Noise cancellation, medical term training |
| Translation errors for medical terms | High | Medium | Medical dictionary, human review |
| Offline model too large for devices | Medium | Medium | Quantization, optional download |
| Feedback data not used for improvement | Low | Medium | Automated reports, model fine-tuning |
| Analytics reveal sensitive patterns | Medium | Low | Anonymization, access controls |

---

## 7. Next Steps

1. **Review and approve this roadmap** - Confirm priorities and scope
2. **Start with Task 3.1.1** - Voice-to-Text Input (highest impact)
3. **Implement translation in parallel** - Can be done independently
4. **Gather feedback during implementation** - Iterate based on nurse input
5. **Document lessons learned** - Update this roadmap as needed

---

## 8. Integration with Existing Systems

### Phase 3 Integration Points

| System | Integration |
|--------|-------------|
| `clinicalAI.ts` | Add voice input, translation, offline fallback |
| `stream.post.ts` | Support voice transcription requests |
| `sessionEngine.ts` | Link feedback to sessions |
| `formEngine.ts` | Voice-to-form field mapping |
| `syncManager.ts` | Queue offline AI requests |

### New API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/ai/voice` | Voice transcription |
| `POST /api/ai/translate` | Text translation |
| `POST /api/ai/feedback` | Submit AI feedback |
| `GET /api/analytics` | Query analytics data |
| `GET /api/ai/models` | List available offline models |

---

*Document Version: 1.0*  
*Created: 2026-02-14*  
*Phase: Phase 3 - Voice, Multi-Language, Quality & Analytics*
