# AI UI Integration Guide

This document describes how to integrate Phase 1 (MedGemma) and Phase 2 (Streaming) AI features with the HealthBridge nurse mobile UI.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI LAYER                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ AIStatusBadge   │  │ Explainability  │  │ AIStreamingPanel│  │
│  │                 │  │ Card            │  │ (NEW - Phase 2) │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │            │
│           └────────────────────┼────────────────────┘            │
│                                │                                 │
│  ┌─────────────────────────────┴─────────────────────────────┐  │
│  │                    Vue Components                          │  │
│  │  - Clinical forms    - Assessment page    - Dashboard      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                │                                 │
│  ┌─────────────────────────────┴─────────────────────────────┐  │
│  │                   COMPOSABLES (Logic Layer)                  │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │  │
│  │  │ useAIStream    │  │ useClinicalAI  │  │ useReactiveAI│  │  │
│  │  │ (Phase 2)      │  │ (Phase 1)      │  │ (Phase 1)    │  │  │
│  │  └────────────────┘  └────────────────┘  └──────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                │                                 │
│  ┌─────────────────────────────┴─────────────────────────────┐  │
│  │                    SERVICES                                │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ clinicalAI.ts - AI request/streaming orchestration   │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                │                                 │
│  ┌─────────────────────────────┴─────────────────────────────┐  │
│  │                    API LAYER                               │  │
│  │  ┌──────────────┐  ┌──────────────────────────────────┐   │  │
│  │  │ /api/ai      │  │ /api/ai/stream (SSE - Phase 2)   │   │  │
│  │  └──────────────┘  └──────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                │                                 │
│  ┌─────────────────────────────┴─────────────────────────────┐  │
│  │                    EXTERNAL SERVICES                       │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ Ollama (local LLM) - MedGemma model                  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start: Adding AI to Any Component

### 1. Basic AI Status Badge

```vue
<template>
  <div>
    <AIStatusBadge 
      :ai-enhancement="{ 
        used: true, 
        useCase: 'EXPLAIN_TRIAGE',
        modelVersion: 'medgemma:4b'
      }" 
    />
  </div>
</template>

<script setup>
import AIStatusBadge from '~/components/clinical/AIStatusBadge.vue';
</script>
```

### 2. Streaming AI Response with Progress

```vue
<template>
  <div>
    <!-- Streaming Panel -->
    <AIStreamingPanel
      :is-streaming="isStreaming"
      :streaming-text="streamingText"
      :progress-percent="progressPercent"
      :tokens-generated="tokensGenerated"
      :model-version="modelVersion"
      :error="error"
      @cancel="handleCancel"
    />
    
    <!-- Trigger button -->
    <button 
      @click="startStreaming"
      :disabled="isStreaming"
      class="btn-primary"
    >
      Generate Explanation
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import AIStreamingPanel from '~/components/clinical/AIStreamingPanel.vue';
import { streamClinicalAI } from '~/services/clinicalAI';
import type { AIUseCase, ExplainabilityRecord } from '~/types/explainability';

const isStreaming = ref(false);
const streamingText = ref('');
const progressPercent = ref(0);
const tokensGenerated = ref(0);
const modelVersion = ref<string>();
const error = ref<string>();
let cancelFn: (() => void) | null = null;

async function startStreaming() {
  const explainability: ExplainabilityRecord = {
    // ... your explainability data
  };
  
  isStreaming.value = true;
  streamingText.value = '';
  progressPercent.value = 0;
  error.value = undefined;
  
  try {
    const result = await streamClinicalAI(
      'EXPLAIN_TRIAGE',
      explainability,
      {
        onChunk: (chunk) => {
          streamingText.value += chunk;
        },
        onProgress: (tokens, total) => {
          tokensGenerated.value = tokens;
          progressPercent.value = (tokens / total) * 100;
        },
        onComplete: (fullResponse, duration) => {
          console.log(`Completed in ${duration}ms`);
          isStreaming.value = false;
        },
        onError: (err, recoverable) => {
          error.value = recoverable 
            ? 'AI service temporarily unavailable. Please try again.' 
            : 'AI service error';
          isStreaming.value = false;
        },
        onCancel: () => {
          isStreaming.value = false;
        }
      }
    );
    
    cancelFn = result.cancel;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error';
    isStreaming.value = false;
  }
}

function handleCancel() {
  if (cancelFn) {
    cancelFn();
    cancelFn = null;
  }
}
</script>
```

### 3. Full Explainability Card with AI

```vue
<template>
  <div>
    <!-- Main explainability display -->
    <ExplainabilityCard :model="explainabilityRecord" />
    
    <!-- AI-powered explanation toggle -->
    <div v-if="showAIExplanation" class="mt-4">
      <AIStreamingPanel
        :is-streaming="aiState.isStreaming"
        :streaming-text="aiState.response"
        :progress-percent="aiState.progress"
        :tokens-generated="aiState.tokens"
        :model-version="aiState.modelVersion"
        :error="aiState.error"
        @cancel="aiState.cancel?.()"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import ExplainabilityCard from '~/components/clinical/ExplainabilityCard.vue';
import AIStreamingPanel from '~/components/clinical/AIStreamingPanel.vue';
import { streamClinicalAI } from '~/services/clinicalAI';

const props = defineProps<{
  explainabilityRecord: ExplainabilityRecord;
}>();

const showAIExplanation = ref(false);
const aiState = reactive({
  isStreaming: false,
  response: '',
  progress: 0,
  tokens: 0,
  modelVersion: '',
  error: '',
  cancel: null as (() => void) | null
});

async function generateAIExplanation() {
  showAIExplanation.value = true;
  
  aiState.isStreaming = true;
  aiState.response = '';
  aiState.progress = 0;
  aiState.error = '';
  
  try {
    const result = await streamClinicalAI(
      'EXPLAIN_TRIAGE',
      props.explainabilityRecord,
      {
        onChunk: (chunk) => {
          aiState.response += chunk;
        },
        onProgress: (tokens, total) => {
          aiState.tokens = tokens;
          aiState.progress = (tokens / total) * 100;
        },
        onComplete: (fullResponse, duration) => {
          aiState.isStreaming = false;
          console.log(`AI explanation generated in ${duration}ms`);
        },
        onError: (err, recoverable) => {
          aiState.error = recoverable 
            ? 'Service temporarily unavailable' 
            : 'Error occurred';
          aiState.isStreaming = false;
        }
      }
    );
    
    aiState.cancel = result.cancel;
  } catch (err) {
    aiState.error = err instanceof Error ? err.message : 'Unknown error';
    aiState.isStreaming = false;
  }
}
</script>
```

## Component API Reference

### AIStatusBadge

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `aiEnhancement` | `AIEnhancement \| null` | No | AI metadata object |

```typescript
interface AIEnhancement {
  used: boolean;
  useCase: string;
  modelVersion?: string;
}
```

### AIStreamingPanel

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isStreaming` | `boolean` | Yes | Whether streaming is active |
| `streamingText` | `string` | Yes | Current text content |
| `progressPercent` | `number` | Yes | 0-100 progress |
| `tokensGenerated` | `number` | Yes | Token count |
| `estimatedTotalTokens` | `number` | No | Expected total tokens |
| `estimatedTimeRemaining` | `string` | No | Human-readable time estimate |
| `modelVersion` | `string` | No | LLM model identifier |
| `error` | `string` | No | Error message |
| `errorTitle` | `string` | No | Error title |

**Events:**
- `cancel` - Emitted when user clicks cancel button

### ExplainabilityCard

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `model` | `ExplainabilityRecord \| null` | Yes | Full explainability data |

## Integration Checklist

Before deploying AI features:

- [ ] Configure Ollama endpoint in `.env`
- [ ] Set `AI_MODEL` (e.g., `medgemma:4b`)
- [ ] Enable AI features via `aiConfig.ts`
- [ ] Add audit logging for AI requests
- [ ] Test with real patient data (in development)
- [ ] Verify accessibility (ARIA labels)
- [ ] Test error states and recovery

## File Locations

```
app/
├── components/
│   └── clinical/
│       ├── AIStatusBadge.vue       # AI indicator badge
│       ├── AIStreamingPanel.vue    # Streaming progress UI (NEW)
│       └── ExplainabilityCard.vue  # Main explainability display
├── composables/
│   ├── useAIStream.ts              # Streaming logic (Phase 2)
│   └── useClinicalFormEngine.ts    # Form integration
├── services/
│   └── clinicalAI.ts               # AI request/streaming service
└── types/
    ├── explainability.ts           # Explainability types
    └── streaming.ts                # Streaming event types

server/
├── routes/
│   └── ai/
│       ├── stream.post.ts          # SSE streaming endpoint
│       └── index.post.ts           # Standard AI endpoint
└── types/
    └── streaming.ts                # Server streaming types
```

## Best Practices

1. **Always handle errors gracefully** - AI services may be unavailable
2. **Use cancel tokens** - Allow users to cancel long-running requests
3. **Show progress** - Streaming UI improves perceived performance
4. **Log AI usage** - Audit trail for clinical decisions
5. **Validate outputs** - AI responses should be sanitized
6. **Accessibility** - Use ARIA labels and live regions
7. **Fallback** - Provide non-AI fallback when service is down
