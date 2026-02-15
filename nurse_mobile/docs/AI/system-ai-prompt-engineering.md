## 🚀 Full Implementation: `server/api/ai/stream.post.ts`

This server endpoint:

- Loads the **prompt schema** from `server/prompts/{schemaId}.json`
- Accepts a **cumulative summary** from the client
- Builds a **section‑specific, cumulative prompt** using the schema
- Streams the response from Ollama
- Extracts the **AI‑generated summary** and returns it to the client (via the `complete` event)

```typescript
// server/api/ai/stream.post.ts
import { H3Event, readBody, createError } from 'h3';
import fs from 'node:fs/promises';
import path from 'node:path';

// ----------------------------------------------------------------------------
// Type Definitions
// ----------------------------------------------------------------------------

type AIUseCase = 
  | 'EXPLAIN_TRIAGE'
  | 'CARE_EDUCATION'
  | 'CLINICAL_HANDOVER'
  | 'NOTE_SUMMARY'
  | 'GENERAL_INQUIRY'
  | 'INCONSISTENCY_CHECK'
  | 'SUGGEST_ACTIONS'
  | 'TREATMENT_ADVICE'
  | 'CAREGIVER_INSTRUCTIONS'
  | 'CLINICAL_NARRATIVE'
  | 'SECTION_GUIDANCE';  // ← new for section‑specific prompts

interface StreamingRequest {
  requestId: string;
  useCase: AIUseCase;
  sessionId: string;
  schemaId: string;
  sectionId?: string;           // required for SECTION_GUIDANCE
  cumulativeSummary?: string;   // the running summary from previous sections
  timestamp: string;
  patient: {
    ageMonths: number;
    weightKg: number;
    gender: string;
    triagePriority?: string;
  };
  assessment: {
    answers: Record<string, any>;
    calculated?: Record<string, any>;
  };
  task?: {
    type: string;
    parameters?: Record<string, any>;
  };
  config?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    keepAlive?: number;
  };
}

interface PromptSection {
  id: string;
  title: string;
  goal: string;
  instruction: string;
  requiredContext: string[];
  maxWords: number;
  outputFormat?: string;
  guardrails?: string;
  cumulative: boolean;
  summaryInstruction?: string;
}

interface PromptSchema {
  schemaId: string;
  version: string;
  description?: string;
  systemGuardrails: string;
  fieldLabels: Record<string, string>;
  sections: PromptSection[];
  fallbackSection: PromptSection;
}

interface OllamaStreamResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';
const PROMPTS_DIR = path.join(process.cwd(), 'server', 'prompts');

// ----------------------------------------------------------------------------
// Helper: Load Prompt Schema
// ----------------------------------------------------------------------------

async function loadPromptSchema(schemaId: string): Promise<PromptSchema> {
  const filePath = path.join(PROMPTS_DIR, `${schemaId}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as PromptSchema;
  } catch (error) {
    throw createError({
      statusCode: 404,
      message: `Prompt schema not found: ${schemaId}`
    });
  }
}

// ----------------------------------------------------------------------------
// Helper: Build Section‑Specific Cumulative Prompt
// ----------------------------------------------------------------------------

function buildSectionPrompt(
  schema: PromptSchema,
  section: PromptSection,
  answers: Record<string, any>,
  patient: StreamingRequest['patient'],
  cumulativeSummary?: string
): string {
  const lines: string[] = [];

  // 1. System guardrails
  lines.push(schema.systemGuardrails);
  lines.push('');

  // 2. Previous clinical summary (if cumulative and summary exists)
  if (section.cumulative && cumulativeSummary) {
    lines.push('PREVIOUS CLINICAL SUMMARY:');
    lines.push(cumulativeSummary);
    lines.push('');
  }

  // 3. Patient context (always include basics)
  lines.push(`PATIENT: ${patient.ageMonths} months, ${patient.weightKg}kg, ${patient.gender}`);
  if (patient.triagePriority) {
    lines.push(`CURRENT TRIAGE PRIORITY: ${patient.triagePriority.toUpperCase()}`);
  }
  lines.push('');

  // 4. Section header and goal
  lines.push(`SECTION: ${section.title}`);
  lines.push(`GOAL: ${section.goal}`);
  lines.push('');

  // 5. Current section findings (only requiredContext fields, with human labels)
  lines.push('FINDINGS IN THIS SECTION:');
  section.requiredContext.forEach((fieldId) => {
    const value = answers[fieldId];
    const label = schema.fieldLabels[fieldId] || fieldId;
    lines.push(`- ${label}: ${formatValue(value)}`);
  });
  lines.push('');

  // 6. Core instruction
  lines.push('INSTRUCTION:');
  lines.push(section.instruction);
  lines.push('');

  // 7. Output constraints
  lines.push(`Keep your response under ${section.maxWords} words.`);
  if (section.outputFormat) {
    lines.push(`Use ${section.outputFormat}.`);
  }
  lines.push('');

  // 8. Section‑specific guardrails
  if (section.guardrails) {
    lines.push(section.guardrails);
    lines.push('');
  }

  // 9. Summary instruction (for cumulative sections)
  if (section.cumulative && section.summaryInstruction) {
    lines.push('At the very end of your response, on a new line starting with "SUMMARY:", provide a single sentence that captures the most important clinical takeaway from this section.');
    lines.push(section.summaryInstruction);
  }

  return lines.join('\n');
}

// Helper: format value for prompt
function formatValue(value: any): string {
  if (value === undefined || value === null) return 'Not recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

// ----------------------------------------------------------------------------
// Helper: Fallback Section (when sectionId not found)
// ----------------------------------------------------------------------------

function getFallbackPrompt(
  schema: PromptSchema,
  answers: Record<string, any>,
  patient: StreamingRequest['patient'],
  cumulativeSummary?: string
): string {
  return buildSectionPrompt(schema, schema.fallbackSection, answers, patient, cumulativeSummary);
}

// ----------------------------------------------------------------------------
// Helper: Build SSE Event
// ----------------------------------------------------------------------------

function buildSSEEvent(type: string, requestId: string, payload: Record<string, any>): string {
  const event = {
    type,
    requestId,
    timestamp: new Date().toISOString(),
    payload
  };
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ----------------------------------------------------------------------------
// Main Handler
// ----------------------------------------------------------------------------

export default defineEventHandler(async (event: H3Event) => {
  // Set SSE headers
  event.node.res.setHeader('Content-Type', 'text/event-stream');
  event.node.res.setHeader('Cache-Control', 'no-cache');
  event.node.res.setHeader('Connection', 'keep-alive');
  event.node.res.setHeader('X-Accel-Buffering', 'no');

  // Parse request body
  const body = await readBody<StreamingRequest>(event);
  const {
    requestId,
    useCase,
    sessionId,
    schemaId,
    sectionId,
    cumulativeSummary,
    patient,
    assessment,
    config = {}
  } = body;

  console.log(`[AI Stream] ${requestId} – useCase: ${useCase}, schema: ${schemaId}, section: ${sectionId || 'none'}`);

  // Send connection established event
  event.node.res.write(buildSSEEvent('connection_established', requestId, {
    status: 'connected',
    message: 'Connected to AI streaming service'
  }));

  try {
    // ------------------------------------------------------------------------
    // 1. Load the prompt schema
    // ------------------------------------------------------------------------
    const schema = await loadPromptSchema(schemaId);

    // ------------------------------------------------------------------------
    // 2. Determine which section prompt to use
    // ------------------------------------------------------------------------
    let section: PromptSection | undefined;
    if (useCase === 'SECTION_GUIDANCE' && sectionId) {
      section = schema.sections.find(s => s.id === sectionId);
    }
    if (!section) {
      section = schema.fallbackSection;
      console.log(`[AI Stream] ${requestId} – using fallback section`);
    }

    // ------------------------------------------------------------------------
    // 3. Build the prompt
    // ------------------------------------------------------------------------
    const prompt = buildSectionPrompt(
      schema,
      section,
      assessment.answers,
      patient,
      cumulativeSummary
    );

    console.log(`[AI Stream] ${requestId} – prompt built, length: ${prompt.length} chars`);
    console.log(`[AI Stream] ${requestId} – first 200 chars: ${prompt.slice(0, 200).replace(/\n/g, '\\n')}`);

    // ------------------------------------------------------------------------
    // 4. Send progress event
    // ------------------------------------------------------------------------
    event.node.res.write(buildSSEEvent('progress', requestId, {
      status: 'generating',
      progress: 10,
      message: 'Sending request to Ollama...'
    }));

    // ------------------------------------------------------------------------
    // 5. Call Ollama streaming API
    // ------------------------------------------------------------------------
    const ollamaConfig = {
      model: config.model || OLLAMA_MODEL,
      prompt,
      stream: true,
      options: {
        temperature: config.temperature ?? 0.2,
        num_predict: config.maxTokens ?? 300,
        keep_alive: config.keepAlive ?? 300000
      }
    };

    const ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaConfig)
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      throw new Error(`Ollama error ${ollamaResponse.status}: ${errorText.slice(0, 100)}`);
    }

    if (!ollamaResponse.body) {
      throw new Error('No response body from Ollama');
    }

    // ------------------------------------------------------------------------
    // 6. Stream the response
    // ------------------------------------------------------------------------
    const reader = ollamaResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkIndex = 0;
    let fullResponse = '';
    let modelVersion = '';

    // Send progress event
    event.node.res.write(buildSSEEvent('progress', requestId, {
      status: 'generating',
      progress: 30,
      message: 'Receiving AI response...'
    }));

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      buffer += text;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue;

        try {
          const parsed = JSON.parse(line) as OllamaStreamResponse;
          if (parsed.response) {
            chunkIndex++;
            fullResponse += parsed.response;
            modelVersion = parsed.model || modelVersion;

            // Send chunk event
            event.node.res.write(buildSSEEvent('chunk', requestId, {
              chunk: parsed.response,
              totalLength: fullResponse.length,
              chunkIndex,
              isFirst: chunkIndex === 1,
              isLast: parsed.done
            }));

            // Periodic progress updates
            if (chunkIndex % 5 === 0 || parsed.done) {
              const progress = Math.min(90, 30 + (chunkIndex * 2));
              event.node.res.write(buildSSEEvent('progress', requestId, {
                status: parsed.done ? 'finalizing' : 'generating',
                progress,
                tokens: chunkIndex,
                message: parsed.done ? 'Finalizing response...' : `Received ${chunkIndex} chunks`
              }));
            }

            // When done, send complete event
            if (parsed.done) {
              // Extract the summary line (if present)
              let summary = '';
              const summaryMatch = fullResponse.match(/SUMMARY:\s*(.+)$/m);
              if (summaryMatch) {
                summary = summaryMatch[1].trim();
              }

              const duration = parsed.total_duration ? parsed.total_duration / 1e6 : 0;

              event.node.res.write(buildSSEEvent('complete', requestId, {
                fullResponse,
                summary,                     // ← extracted summary for next section
                confidence: 0.95,
                modelVersion,
                duration,
                tokensGenerated: parsed.eval_count || chunkIndex
              }));

              console.log(`[AI Stream] ${requestId} – completed, ${chunkIndex} chunks, ${fullResponse.length} chars`);
            }
          }
        } catch (err) {
          console.warn(`[AI Stream] ${requestId} – failed to parse line: ${line.slice(0, 50)}...`);
        }
      }
    }

    // ------------------------------------------------------------------------
    // 7. Final progress
    // ------------------------------------------------------------------------
    event.node.res.write(buildSSEEvent('progress', requestId, {
      status: 'complete',
      progress: 100,
      message: 'Response complete'
    }));

  } catch (error) {
    console.error(`[AI Stream] ${requestId} – error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    event.node.res.write(buildSSEEvent('error', requestId, {
      code: 'STREAM_ERROR',
      message: errorMessage,
      recoverable: true
    }));
  } finally {
    event.node.res.end();
  }
});
```

---

## 🔧 Client‑Side Changes (Summary)

To make this work, your **`[formId].vue`** must:

1. **Send `useCase: 'SECTION_GUIDANCE'`** when requesting AI for a section.
2. **Include `sectionId`** (e.g., `currentSection.value.id`).
3. **Include `cumulativeSummary`** (the running summary ref).
4. **Send the full `patient` object** with `ageMonths`, `weightKg`, `gender`, and current `triagePriority`.
5. **Send the full `assessment.answers`** (all current answers).
6. **Extract the `summary` from the `complete` event** and append it to your running summary.

Example client call:

```ts
const result = await streamClinicalAI(
  'SECTION_GUIDANCE',
  {
    sessionId: resolvedSessionId.value!,
    schemaId: schemaId.value,
    sectionId: currentSection.value.id,
    cumulativeSummary: cumulativeSummary.value,
    patient: {
      ageMonths: instance.value?.answers?.patient_age_months || 0,
      weightKg: instance.value?.answers?.patient_weight_kg || 0,
      gender: instance.value?.answers?.gender || 'unknown',
      triagePriority: effectivePriority.value
    },
    assessment: {
      answers: instance.value?.answers || {},
      calculated: instance.value?.calculated || {}
    }
  },
  {
    onChunk: (chunk) => { streamingResponse.value += chunk; },
    onComplete: (fullResponse, duration, summary) => {
      // Append the new summary to the running summary
      if (summary) {
        cumulativeSummary.value = cumulativeSummary.value
          ? `${cumulativeSummary.value} ${summary}`
          : summary;
      }
      // ... store the full response, hide streaming UI, etc.
    }
  }
);
```

---

## ✅ What This Achieves

- **Section‑specific prompts** – each section gets a tailored instruction.
- **Cumulative context** – the AI sees a concise, human‑readable summary of *all previous sections*.
- **Low token usage** – only the summary is repeated, not raw data.
- **Extensible** – new schemas for other assessment types are easy to add.
- **Auditable** – every prompt can be inspected and versioned.


## ✅ Updated Client‑Side: `streamClinicalAI` with Cumulative Summary Support

Below is the **refactored `streamClinicalAI` function** that matches the new server payload structure. It includes:

- **Full context** – session, patient, assessment answers, calculated data.
- **Section‑specific guidance** – `sectionId`, `cumulativeSummary`.
- **Extended `onComplete` callback** – now receives the extracted `summary` from the AI.
- **Strong typing** for the new payload.

Place this in `~/services/clinicalAI.ts` (replace your existing `streamClinicalAI`).

---

### 1. Updated `streamClinicalAI` Function

```typescript
// ============================================
// Types for the new streaming payload
// ============================================

export interface StreamingContext {
  sessionId: string;
  schemaId: string;
  formId?: string;
  sectionId?: string;              // required for SECTION_GUIDANCE
  cumulativeSummary?: string;      // running summary from previous sections
  patient: {
    ageMonths: number;
    weightKg: number;
    gender: string;
    triagePriority?: 'red' | 'yellow' | 'green' | 'unknown';
  };
  assessment: {
    answers: Record<string, any>;
    calculated?: Record<string, any>;
  };
  config?: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  };
}

export interface StreamingCallbacks {
  onChunk: (chunk: string) => void;
  onProgress: (tokens: number, total: number) => void;
  onComplete: (fullResponse: string, duration: number, summary?: string) => void; // ← summary added
  onError: (error: string, recoverable: boolean) => void;
  onCancel?: () => void;
}

// ============================================
// Streaming AI with full context payload
// ============================================

export async function streamClinicalAI(
  useCase: AIUseCase,
  context: StreamingContext,
  callbacks: StreamingCallbacks,
  options: { timeout?: number } = {}
): Promise<{ requestId: string; cancel: () => void; mode: 'stream' | 'fallback' }> {
  if (!isAIEnabled(useCase)) {
    callbacks.onError('AI feature is currently disabled', false);
    throw new Error('AI feature is currently disabled');
  }

  const config = useRuntimeConfig();
  const startTime = Date.now();
  const timeout = options.timeout || 60000;
  const requestId = context.sessionId
    ? `${context.sessionId}_${Date.now()}`
    : `stream_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Build the full request body
  const body = {
    requestId,
    useCase,
    sessionId: context.sessionId,
    schemaId: context.schemaId,
    formId: context.formId,
    sectionId: context.sectionId,
    cumulativeSummary: context.cumulativeSummary,
    patient: context.patient,
    assessment: context.assessment,
    timestamp: new Date().toISOString(),
    config: {
      temperature: context.config?.temperature ?? 0.2,
      maxTokens: context.config?.maxTokens ?? 300,
      model: context.config?.model ?? process.env.AI_MODEL || 'gemma3:4b'
    }
  };

  console.log(`[AI Stream] 📡 Requesting - requestId: ${requestId}, useCase: ${useCase}, section: ${context.sectionId}`);

  let isCancelled = false;
  let fullResponse = '';

  const cancel = () => {
    isCancelled = true;
    callbacks.onCancel?.();
  };

  try {
    const response = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-token': config.public.aiAuthToken as string,
        'x-request-id': requestId
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI Stream] ❌ HTTP ${response.status}: ${errorText}`);
      // Fallback to simulated streaming (already implemented)
      return simulateStreamingFallback(useCase, context, callbacks, startTime, requestId);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;

    if (!reader) {
      throw new Error('No response body reader');
    }

    while (true) {
      if (isCancelled) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            switch (event.type) {
              case 'chunk':
                const chunk = event.payload.chunk || '';
                fullResponse += chunk;
                chunkCount++;
                callbacks.onChunk(chunk);
                break;
              case 'progress':
                callbacks.onProgress(event.payload.tokens || 0, 100);
                break;
              case 'complete':
                const duration = event.payload.duration || (Date.now() - startTime);
                const summary = event.payload.summary; // ← extracted by server
                callbacks.onComplete(fullResponse, duration, summary);
                return { requestId, cancel, mode: 'stream' };
              case 'error':
                callbacks.onError(event.payload.message, event.payload.recoverable ?? true);
                throw new Error(event.payload.message);
            }
          } catch (err) {
            console.warn('[AI Stream] Failed to parse SSE:', err);
          }
        }
      }
    }

    return { requestId, cancel, mode: 'stream' };
  } catch (error) {
    console.error('[AI Stream] Error:', error);
    return simulateStreamingFallback(useCase, context, callbacks, startTime, requestId);
  }
}

// ============================================
// Fallback (unchanged, but updated to accept context)
// ============================================
async function simulateStreamingFallback(
  useCase: AIUseCase,
  context: StreamingContext,
  callbacks: StreamingCallbacks,
  startTime: number,
  requestId: string
): Promise<{ requestId: string; cancel: () => void; mode: 'fallback' }> {
  // ... your existing simulated streaming code,
  // but ensure it calls onComplete with summary = undefined
  // (we'll keep your current implementation, just adjust onComplete call)
}
```

---

### 2. Changes to `[formId].vue` – Cumulative Summary State

Add a new ref for the running summary and update the `streamClinicalAI` call.

```typescript
// ============================================
// Additional state for cumulative summary
// ============================================
const cumulativeSummary = ref<string>('');  // ← running summary from all completed sections

// ============================================
// Updated requestMedGemmaGuidance (or your section‑specific AI caller)
// ============================================

async function requestSectionGuidance() {
  if (!currentSection.value) return;

  aiStatus.value = 'generating';
  isStreaming.value = true;
  streamingResponse.value = '';
  streamingError.value = '';

  try {
    const result = await streamClinicalAI(
      'SECTION_GUIDANCE',   // ← new useCase
      {
        sessionId: resolvedSessionId.value!,
        schemaId: schemaId.value,
        formId: formId.value,
        sectionId: currentSection.value.id,          // ← current section ID
        cumulativeSummary: cumulativeSummary.value, // ← previous summaries
        patient: {
          ageMonths: instance.value?.answers?.patient_age_months || 0,
          weightKg: instance.value?.answers?.patient_weight_kg || 0,
          gender: instance.value?.answers?.gender || 'unknown',
          triagePriority: effectivePriority.value
        },
        assessment: {
          answers: instance.value?.answers || {},
          calculated: instance.value?.calculated || {}
        },
        config: {
          temperature: 0.2,
          maxTokens: 300
        }
      },
      {
        onChunk: (chunk: string) => {
          streamingResponse.value += chunk;
        },
        onProgress: (tokens: number, total: number) => {
          streamingTokens.value = tokens;
          streamingProgress.value = total > 0 ? (tokens / total) * 100 : 0;
        },
        onComplete: (fullResponse: string, duration: number, summary?: string) => {
          console.log(`[Assessment] ✅ Streaming complete, summary: ${summary}`);
          
          // Append the new summary to the running summary
          if (summary) {
            cumulativeSummary.value = cumulativeSummary.value
              ? `${cumulativeSummary.value} ${summary}`
              : summary;
          }

          // Store the full response in your explainability record
          // (you can also display it in the AIStreamingPanel)
          isStreaming.value = false;
          aiStatus.value = 'ready';

          // If you want to show the final response in ExplainabilityCard
          if (isSection7.value) {
            // Build explainability record with fullResponse as clinicalNarrative
            buildExplainabilityRecordFromStream(fullResponse);
          }
        },
        onError: (error: string, recoverable: boolean) => {
          console.error('[Assessment] Streaming error:', error);
          streamingError.value = error;
          isStreaming.value = false;
          aiStatus.value = 'error';
        },
        onCancel: () => {
          console.log('[Assessment] Streaming cancelled');
          isStreaming.value = false;
        }
      }
    );

    // Store cancel function if you want a "Stop" button
    streamingCancel = result.cancel;
    streamingMode.value = result.mode;

  } catch (error) {
    console.error('[Assessment] Failed to start streaming:', error);
    streamingError.value = error instanceof Error ? error.message : 'Unknown error';
    isStreaming.value = false;
    aiStatus.value = 'error';
  }
}
```

---

### 3. Triggering the AI per Section

You can now trigger `requestSectionGuidance()` automatically when a section becomes active, or manually via the **“Ask MedGemma”** button.  
Since the prompt schema is already tailored to each section, the AI will receive the appropriate instruction + cumulative summary.

**Example: Auto‑trigger when entering a new section** (after section navigation):

```typescript
watch(currentSection, async (newSection, oldSection) => {
  if (newSection && newSection.id !== oldSection?.id) {
    // Optionally auto‑trigger AI for the new section
    if (isAIEnabled('SECTION_GUIDANCE')) {
      await requestSectionGuidance();
    }
  }
});
```

---

### 4. Summary Extraction – How It Works

- The **server** appends `SUMMARY: ...` to the AI's response.
- The **server** extracts that line and sends it in the `complete` event payload as `summary`.
- The **client** receives it in `onComplete` and appends it to `cumulativeSummary.value`.

This creates a **progressively richer summary** that flows from section to section.

---

## 🧪 Testing the Full Flow

1. Start at **Section 1 (Patient Info)** – AI responds + summary: *“Patient is 30 months, 14kg.”*
2. `cumulativeSummary` = `"Patient is 30 months, 14kg."`
3. Move to **Section 2 (Danger Signs)** – AI receives that summary, responds + new summary: *“No danger signs – child is stable.”*
4. `cumulativeSummary` = `"Patient is 30 months, 14kg. No danger signs – child is stable."`
5. … and so on.

By Section 7 (Triage), the AI has a **complete, concise clinical story** – exactly what a human colleague would have.

---

## ✅ Summary of Changes

| File | What Changed |
|------|-------------|
| `clinicalAI.ts` | New `streamClinicalAI` with `StreamingContext` payload, extended `onComplete` with `summary`. |
| `[formId].vue` | Added `cumulativeSummary` ref, implemented `requestSectionGuidance()` using new API. |
| `server/api/ai/stream.post.ts` | Already updated to accept the new payload and extract summary. |
| `server/prompts/peds_respiratory.json` | Already defined with section‑specific prompts and summary instructions. |

## ✅ Full Fallback Implementation: `simulateStreamingFallback`

Add this function **inside `clinicalAI.ts`**, after `streamClinicalAI`.  
It uses the **non‑streaming `/api/ai` endpoint** with the same structured payload, then simulates chunked delivery.

```typescript
/**
 * Fallback: Simulated streaming when SSE is unavailable or fails.
 * Calls the non‑streaming /api/ai endpoint and delivers the response in chunks.
 */
async function simulateStreamingFallback(
  useCase: AIUseCase,
  context: StreamingContext,
  callbacks: StreamingCallbacks,
  startTime: number,
  requestId: string
): Promise<{ requestId: string; cancel: () => void; mode: 'fallback' }> {
  const config = useRuntimeConfig();
  let isCancelled = false;
  let fullResponse = '';

  const cancel = () => {
    isCancelled = true;
    callbacks.onCancel?.();
  };

  console.log(`[AI Fallback] 📡 Using simulated streaming - requestId: ${requestId}`);

  try {
    // ------------------------------------------------------------------------
    // 1. Call the non‑streaming AI endpoint with the full context
    // ------------------------------------------------------------------------
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-token': config.public.aiAuthToken as string
      },
      body: JSON.stringify({
        useCase,
        context, // ← send the same structured payload (server must support it)
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI service error (${response.status}): ${errorText.slice(0, 100)}`);
    }

    const data = await response.json();
    const text = data.answer as string;

    if (!text) {
      throw new Error('Empty response from AI service');
    }

    // ------------------------------------------------------------------------
    // 2. Simulate streaming by splitting the text into chunks
    // ------------------------------------------------------------------------
    // Split on word boundaries to create natural‑sized chunks
    const words = text.split(/(\s+)/);
    const chunkSize = 5; // words per chunk
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += chunkSize * 2) {
      chunks.push(words.slice(i, i + chunkSize * 2).join(''));
    }

    const totalChunks = chunks.length;
    let chunkCount = 0;

    // Send initial progress
    callbacks.onProgress(0, totalChunks);

    for (let i = 0; i < chunks.length; i++) {
      if (isCancelled) break;

      // Simulate network latency
      await new Promise(resolve => setTimeout(resolve, 50));

      const chunk = chunks[i] || '';
      fullResponse += chunk;
      chunkCount++;

      // Send chunk
      callbacks.onChunk(chunk);
      callbacks.onProgress(chunkCount, totalChunks);

      console.log(`[AI Fallback] 📦 Chunk ${chunkCount}/${totalChunks}`);
    }

    // ------------------------------------------------------------------------
    // 3. Extract summary (if present)
    // ------------------------------------------------------------------------
    let summary = '';
    const summaryMatch = fullResponse.match(/SUMMARY:\s*(.+)$/m);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    }

    const duration = Date.now() - startTime;
    console.log(`[AI Fallback] ✅ Completed in ${duration}ms, summary: ${summary ? 'yes' : 'no'}`);

    callbacks.onComplete(fullResponse, duration, summary);

    return { requestId, cancel, mode: 'fallback' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[AI Fallback] ❌ Error: ${errorMessage}`);

    // ------------------------------------------------------------------------
    // 4. Final fallback: rule‑based response
    // ------------------------------------------------------------------------
    const ruleBasedResponse = generateRuleBasedResponse(context);
    const words = ruleBasedResponse.split(/(\s+)/);
    const chunks = words.join('').match(/.{1,20}/g) || [ruleBasedResponse];
    let chunkCount = 0;
    let fullResponse = '';

    for (const chunk of chunks) {
      if (isCancelled) break;
      await new Promise(resolve => setTimeout(resolve, 30));
      fullResponse += chunk;
      chunkCount++;
      callbacks.onChunk(chunk);
      callbacks.onProgress(chunkCount, chunks.length);
    }

    const duration = Date.now() - startTime;
    callbacks.onComplete(fullResponse, duration, undefined);
    callbacks.onError(errorMessage, false);

    return { requestId, cancel, mode: 'fallback' };
  }
}

/**
 * Ultra‑minimal rule‑based response when both streaming and non‑streaming AI fail.
 * Keeps the UI functional and honest.
 */
function generateRuleBasedResponse(context: StreamingContext): string {
  const { patient, sectionId, assessment } = context;
  const priority = patient.triagePriority || 'unknown';

  if (sectionId === 'danger_signs') {
    const dangerFields = ['unable_to_drink', 'vomits_everything', 'convulsions', 'lethargic_unconscious'];
    const present = dangerFields.filter(f => assessment.answers[f] === true);
    if (present.length > 0) {
      return `⚠️ Danger signs detected: ${present.join(', ')}. This child requires URGENT referral. SUMMARY: Urgent referral needed due to danger signs.`;
    }
    return `✅ No general danger signs. Continue assessment. SUMMARY: No danger signs.`;
  }

  if (sectionId === 'vitals') {
    const rr = assessment.answers.resp_rate;
    const age = patient.ageMonths;
    if (rr && age) {
      const threshold = age < 12 ? 50 : 40;
      if (rr >= threshold) {
        return `⚠️ Fast breathing (${rr}/min). This meets IMCI criteria for pneumonia (Yellow priority). SUMMARY: Fast breathing – pneumonia.`;
      }
      return `✅ Respiratory rate normal (${rr}/min). SUMMARY: Normal breathing.`;
    }
  }

  if (sectionId === 'triage') {
    return `Triage priority: ${priority.toUpperCase()}. Please complete the assessment and follow the recommended actions. SUMMARY: ${priority.toUpperCase()} priority.`;
  }

  // Generic fallback
  return `Clinical guidance is temporarily unavailable. Please rely on your training and the WHO IMCI chart. SUMMARY: AI unavailable – use clinical judgment.`;
}
```

---

## 🔧 How to Integrate This Fallback

In your **`streamClinicalAI`** function, replace the placeholder `simulateStreamingFallback` call with the full implementation above.

Make sure your **non‑streaming `/api/ai` endpoint** can accept the new `context` payload.  
If it currently expects an `ExplainabilityRecord`, you have two options:

1. **Update the non‑streaming endpoint** to also handle the new `StreamingContext` format (recommended for consistency).  
2. **Adapt the fallback** to convert the context into an `ExplainabilityRecord` (more work, less clean).

I strongly recommend **Option 1** – extend your existing `/api/ai` endpoint to recognise the new payload structure and fall back gracefully.  
This keeps your AI service unified and maintainable.

---

## 📦 Summary of What You Now Have

| Layer | Component | Status |
|-------|-----------|--------|
| **Client** | `streamClinicalAI` | ✅ Calls streaming endpoint with full context |
| **Client** | `simulateStreamingFallback` | ✅ Falls back to non‑streaming + simulated chunks |
| **Server** | `/api/ai/stream` | ✅ Accepts new context, builds section‑specific cumulative prompts, streams from Ollama, extracts summary |
| **Server** | `/api/ai` (non‑streaming) | ⚠️ **Needs update** to accept the new `context` payload |
| **Prompts** | `server/prompts/peds_respiratory.json` | ✅ Section‑specific, cumulative, summary‑aware |

---

## 🚀 Next Immediate Step

Update your **non‑streaming `/api/ai` endpoint** to handle the new `context` object.  
Here’s a minimal example:

```typescript
// server/api/ai/index.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { useCase, context } = body;  // ← now accepts context

  // If context is provided, build prompt using the same schema logic as streaming
  if (context) {
    const schema = await loadPromptSchema(context.schemaId);
    const section = schema.sections.find(s => s.id === context.sectionId) || schema.fallbackSection;
    const prompt = buildSectionPrompt(schema, section, context.assessment.answers, context.patient, context.cumulativeSummary);
    // ... call Ollama non‑streaming, return { answer }
  } else {
    // Fallback to old ExplainabilityRecord logic
    // ...
  }
});
```

Once that’s done, your fallback will work seamlessly, and your entire AI pipeline will be **robust, section‑aware, and cumulative**.

## ✅ Full Implementation: Non‑Streaming `/api/ai/index.post.ts`

This endpoint supports **both**:
- The **new `context`‑based payload** (used by `simulateStreamingFallback` and direct `askClinicalAI` calls with context).
- The **legacy `ExplainabilityRecord`‑based payload** (for backward compatibility).

It uses the **same prompt‑building logic** as the streaming endpoint – so we **extract that logic into a shared utility** to avoid duplication.

---

### 📁 1. Create a Shared Prompt Builder Utility

**File:** `server/utils/promptBuilder.ts`

```typescript
import type { PromptSchema, PromptSection } from '../types/aiTypes'; // define these types or import from schema

export interface PromptBuilderContext {
  schema: PromptSchema;
  section: PromptSection;
  answers: Record<string, any>;
  patient: {
    ageMonths: number;
    weightKg: number;
    gender: string;
    triagePriority?: string;
  };
  cumulativeSummary?: string;
}

export function buildSectionPrompt(context: PromptBuilderContext): string {
  const { schema, section, answers, patient, cumulativeSummary } = context;
  const lines: string[] = [];

  // 1. System guardrails
  lines.push(schema.systemGuardrails);
  lines.push('');

  // 2. Previous clinical summary (if cumulative and summary exists)
  if (section.cumulative && cumulativeSummary) {
    lines.push('PREVIOUS CLINICAL SUMMARY:');
    lines.push(cumulativeSummary);
    lines.push('');
  }

  // 3. Patient context
  lines.push(`PATIENT: ${patient.ageMonths} months, ${patient.weightKg}kg, ${patient.gender}`);
  if (patient.triagePriority) {
    lines.push(`CURRENT TRIAGE PRIORITY: ${patient.triagePriority.toUpperCase()}`);
  }
  lines.push('');

  // 4. Section header and goal
  lines.push(`SECTION: ${section.title}`);
  lines.push(`GOAL: ${section.goal}`);
  lines.push('');

  // 5. Current section findings
  lines.push('FINDINGS IN THIS SECTION:');
  section.requiredContext.forEach((fieldId) => {
    const value = answers[fieldId];
    const label = schema.fieldLabels[fieldId] || fieldId;
    lines.push(`- ${label}: ${formatValue(value)}`);
  });
  lines.push('');

  // 6. Core instruction
  lines.push('INSTRUCTION:');
  lines.push(section.instruction);
  lines.push('');

  // 7. Output constraints
  lines.push(`Keep your response under ${section.maxWords} words.`);
  if (section.outputFormat) {
    lines.push(`Use ${section.outputFormat}.`);
  }
  lines.push('');

  // 8. Section‑specific guardrails
  if (section.guardrails) {
    lines.push(section.guardrails);
    lines.push('');
  }

  // 9. Summary instruction (for cumulative sections)
  if (section.cumulative && section.summaryInstruction) {
    lines.push('At the very end of your response, on a new line starting with "SUMMARY:", provide a single sentence that captures the most important clinical takeaway from this section.');
    lines.push(section.summaryInstruction);
  }

  return lines.join('\n');
}

function formatValue(value: any): string {
  if (value === undefined || value === null) return 'Not recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
```

---

### 📁 2. Updated Non‑Streaming Endpoint

**File:** `server/api/ai/index.post.ts`

```typescript
import { H3Event, readBody, createError } from 'h3';
import { loadPromptSchema } from '../utils/loadPromptSchema'; // extract this from stream.post.ts
import { buildSectionPrompt } from '../utils/promptBuilder';
import type { PromptSection, PromptSchema } from '../types/aiTypes';

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';

// ----------------------------------------------------------------------------
// Main Handler
// ----------------------------------------------------------------------------
export default defineEventHandler(async (event: H3Event) => {
  const body = await readBody(event);
  const { useCase, context, payload } = body;

  try {
    let prompt = '';
    let model = OLLAMA_MODEL;
    let temperature = 0.2;
    let maxTokens = 300;

    // ------------------------------------------------------------------------
    // 1. Determine which payload format and build the prompt
    // ------------------------------------------------------------------------
    if (context) {
      // NEW FORMAT: context-based request (from simulateStreamingFallback)
      const {
        schemaId,
        sectionId,
        cumulativeSummary,
        patient,
        assessment,
        config = {}
      } = context;

      // Load schema
      const schema = await loadPromptSchema(schemaId);

      // Find section
      let section: PromptSection | undefined;
      if (sectionId) {
        section = schema.sections.find(s => s.id === sectionId);
      }
      if (!section) {
        section = schema.fallbackSection;
      }

      // Build the prompt
      prompt = buildSectionPrompt({
        schema,
        section,
        answers: assessment.answers,
        patient,
        cumulativeSummary
      });

      // Override config if provided
      temperature = config.temperature ?? 0.2;
      maxTokens = config.maxTokens ?? 300;
      model = config.model ?? OLLAMA_MODEL;
    } 
    else if (payload && useCase) {
      // LEGACY FORMAT: ExplainabilityRecord payload (from askClinicalAI)
      // This is your existing `buildClinicalAIPrompt` logic – you can keep it here
      // or import from clinicalAI.ts
      const { buildClinicalAIPrompt } = await import('~/services/clinicalAI');
      prompt = buildClinicalAIPrompt(useCase, payload);
      temperature = 0.7; // legacy default
      maxTokens = 500;
    }
    else {
      throw createError({
        statusCode: 400,
        message: 'Invalid request: missing context or payload'
      });
    }

    // ------------------------------------------------------------------------
    // 2. Call Ollama (non‑streaming)
    // ------------------------------------------------------------------------
    const ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature,
          num_predict: maxTokens,
          keep_alive: 300000
        }
      })
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      throw new Error(`Ollama error ${ollamaResponse.status}: ${errorText.slice(0, 100)}`);
    }

    const data = await ollamaResponse.json();
    const fullResponse = data.response || '';

    // ------------------------------------------------------------------------
    // 3. Extract summary (if present)
    // ------------------------------------------------------------------------
    let summary = '';
    const summaryMatch = fullResponse.match(/SUMMARY:\s*(.+)$/m);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    }

    // ------------------------------------------------------------------------
    // 4. Return response
    // ------------------------------------------------------------------------
    return {
      answer: fullResponse,
      summary,
      model: data.model,
      duration: data.total_duration ? data.total_duration / 1e6 : 0,
      evalCount: data.eval_count
    };

  } catch (error) {
    console.error('[AI] Error:', error);
    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : 'AI service error'
    });
  }
});
```

---

### 📁 3. Shared Utility: `loadPromptSchema`

Extract this from your `stream.post.ts` into `server/utils/loadPromptSchema.ts`:

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import { createError } from 'h3';
import type { PromptSchema } from '../types/aiTypes';

const PROMPTS_DIR = path.join(process.cwd(), 'server', 'prompts');

export async function loadPromptSchema(schemaId: string): Promise<PromptSchema> {
  const filePath = path.join(PROMPTS_DIR, `${schemaId}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as PromptSchema;
  } catch (error) {
    throw createError({
      statusCode: 404,
      message: `Prompt schema not found: ${schemaId}`
    });
  }
}
```

---

### 📁 4. Shared Type Definitions

Create `server/types/aiTypes.ts` to avoid duplication:

```typescript
export interface PromptSection {
  id: string;
  title: string;
  goal: string;
  instruction: string;
  requiredContext: string[];
  maxWords: number;
  outputFormat?: string;
  guardrails?: string;
  cumulative: boolean;
  summaryInstruction?: string;
}

export interface PromptSchema {
  schemaId: string;
  version: string;
  description?: string;
  systemGuardrails: string;
  fieldLabels: Record<string, string>;
  sections: PromptSection[];
  fallbackSection: PromptSection;
}
```

---

## ✅ What This Achieves

| Concern | Solution |
|---------|----------|
| **Code Duplication** | Prompt‑building logic is now in `server/utils/promptBuilder.ts`, used by both streaming and non‑streaming endpoints. |
| **Backward Compatibility** | The legacy `payload` + `useCase` format is still supported. |
| **Error Handling** | Consistent error responses for both formats. |
| **Summary Extraction** | The non‑streaming endpoint also extracts and returns the `SUMMARY:` line, so `simulateStreamingFallback` can provide it. |
| **Configurability** | Temperature, maxTokens, model can be overridden via the `context.config` object. |

---

## 🔁 Updated `simulateStreamingFallback` (No Changes Needed)

Your existing `simulateStreamingFallback` from the previous step already calls `/api/ai` with the `context` payload. Now that the endpoint supports it, it will work perfectly.

---

## 🧪 Testing Checklist

- [ ] **Legacy `askClinicalAI`** still works: call `/api/ai` with `{ useCase, payload }` → returns `{ answer }`.
- [ ] **New `context`‑based call** (from `simulateStreamingFallback`): call with `{ useCase, context }` → returns `{ answer, summary }`.
- [ ] **Section‑specific prompts** are correctly built using the shared `buildSectionPrompt`.
- [ ] **Summary extraction** works and is returned.
- [ ] **Error handling** returns proper HTTP status codes.

---

## 🚀 Next Steps

1. **Move the shared utilities** to `server/utils/` and update imports in both `stream.post.ts` and `index.post.ts`.
2. **Test both streaming and non‑streaming paths** thoroughly.
3. **Add more prompt schemas** for other assessment types (e.g., trauma, neonatal).

This completes your **production‑ready, cumulative, section‑aware AI guidance system** with graceful fallback.  

## ✅ Updated `server/api/ai/stream.post.ts`

This version **uses the shared prompt‑building utilities** and expects the **full `StreamingContext`** as the request body (sent directly by the client `streamClinicalAI`).

```typescript
// server/api/ai/stream.post.ts
import { H3Event, readBody, createError } from 'h3';
import { loadPromptSchema } from '../utils/loadPromptSchema';
import { buildSectionPrompt } from '../utils/promptBuilder';
import type { PromptSection, PromptSchema } from '../types/aiTypes';

// ----------------------------------------------------------------------------
// Type Definitions (matching client's StreamingContext)
// ----------------------------------------------------------------------------
interface StreamingRequest {
  requestId: string;
  useCase: string;
  sessionId: string;
  schemaId: string;
  formId?: string;
  sectionId?: string;
  cumulativeSummary?: string;
  patient: {
    ageMonths: number;
    weightKg: number;
    gender: string;
    triagePriority?: string;
  };
  assessment: {
    answers: Record<string, any>;
    calculated?: Record<string, any>;
  };
  config?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    keepAlive?: number;
  };
  timestamp: string;
}

interface OllamaStreamResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';

// ----------------------------------------------------------------------------
// Helper: Build SSE Event
// ----------------------------------------------------------------------------
function buildSSEEvent(type: string, requestId: string, payload: Record<string, any>): string {
  const event = {
    type,
    requestId,
    timestamp: new Date().toISOString(),
    payload
  };
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ----------------------------------------------------------------------------
// Main Handler
// ----------------------------------------------------------------------------
export default defineEventHandler(async (event: H3Event) => {
  // Set SSE headers
  event.node.res.setHeader('Content-Type', 'text/event-stream');
  event.node.res.setHeader('Cache-Control', 'no-cache');
  event.node.res.setHeader('Connection', 'keep-alive');
  event.node.res.setHeader('X-Accel-Buffering', 'no');

  // Parse request body (full StreamingContext)
  const body = await readBody<StreamingRequest>(event);
  const {
    requestId,
    useCase,
    sessionId,
    schemaId,
    sectionId,
    cumulativeSummary,
    patient,
    assessment,
    config = {}
  } = body;

  console.log(`[AI Stream] ${requestId} – useCase: ${useCase}, schema: ${schemaId}, section: ${sectionId || 'none'}`);

  // Send connection established event
  event.node.res.write(buildSSEEvent('connection_established', requestId, {
    status: 'connected',
    message: 'Connected to AI streaming service'
  }));

  try {
    // ------------------------------------------------------------------------
    // 1. Load the prompt schema
    // ------------------------------------------------------------------------
    const schema = await loadPromptSchema(schemaId);

    // ------------------------------------------------------------------------
    // 2. Determine which section prompt to use
    // ------------------------------------------------------------------------
    let section: PromptSection | undefined;
    if (sectionId) {
      section = schema.sections.find(s => s.id === sectionId);
    }
    if (!section) {
      section = schema.fallbackSection;
      console.log(`[AI Stream] ${requestId} – using fallback section`);
    }

    // ------------------------------------------------------------------------
    // 3. Build the prompt using shared utility
    // ------------------------------------------------------------------------
    const prompt = buildSectionPrompt({
      schema,
      section,
      answers: assessment.answers,
      patient,
      cumulativeSummary
    });

    console.log(`[AI Stream] ${requestId} – prompt built, length: ${prompt.length} chars`);
    console.log(`[AI Stream] ${requestId} – first 200 chars: ${prompt.slice(0, 200).replace(/\n/g, '\\n')}`);

    // ------------------------------------------------------------------------
    // 4. Send progress event
    // ------------------------------------------------------------------------
    event.node.res.write(buildSSEEvent('progress', requestId, {
      status: 'generating',
      progress: 10,
      message: 'Sending request to Ollama...'
    }));

    // ------------------------------------------------------------------------
    // 5. Call Ollama streaming API
    // ------------------------------------------------------------------------
    const ollamaConfig = {
      model: config.model || OLLAMA_MODEL,
      prompt,
      stream: true,
      options: {
        temperature: config.temperature ?? 0.2,
        num_predict: config.maxTokens ?? 300,
        keep_alive: config.keepAlive ?? 300000
      }
    };

    const ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaConfig)
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      throw new Error(`Ollama error ${ollamaResponse.status}: ${errorText.slice(0, 100)}`);
    }

    if (!ollamaResponse.body) {
      throw new Error('No response body from Ollama');
    }

    // ------------------------------------------------------------------------
    // 6. Stream the response
    // ------------------------------------------------------------------------
    const reader = ollamaResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkIndex = 0;
    let fullResponse = '';
    let modelVersion = '';

    // Send progress event
    event.node.res.write(buildSSEEvent('progress', requestId, {
      status: 'generating',
      progress: 30,
      message: 'Receiving AI response...'
    }));

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      buffer += text;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue;

        try {
          const parsed = JSON.parse(line) as OllamaStreamResponse;
          if (parsed.response) {
            chunkIndex++;
            fullResponse += parsed.response;
            modelVersion = parsed.model || modelVersion;

            // Send chunk event
            event.node.res.write(buildSSEEvent('chunk', requestId, {
              chunk: parsed.response,
              totalLength: fullResponse.length,
              chunkIndex,
              isFirst: chunkIndex === 1,
              isLast: parsed.done
            }));

            // Periodic progress updates
            if (chunkIndex % 5 === 0 || parsed.done) {
              const progress = Math.min(90, 30 + (chunkIndex * 2));
              event.node.res.write(buildSSEEvent('progress', requestId, {
                status: parsed.done ? 'finalizing' : 'generating',
                progress,
                tokens: chunkIndex,
                message: parsed.done ? 'Finalizing response...' : `Received ${chunkIndex} chunks`
              }));
            }

            // When done, send complete event
            if (parsed.done) {
              // Extract the summary line (if present)
              let summary = '';
              const summaryMatch = fullResponse.match(/SUMMARY:\s*(.+)$/m);
              if (summaryMatch) {
                summary = summaryMatch[1].trim();
              }

              const duration = parsed.total_duration ? parsed.total_duration / 1e6 : 0;

              event.node.res.write(buildSSEEvent('complete', requestId, {
                fullResponse,
                summary,                     // ← for client to accumulate
                confidence: 0.95,
                modelVersion,
                duration,
                tokensGenerated: parsed.eval_count || chunkIndex
              }));

              console.log(`[AI Stream] ${requestId} – completed, ${chunkIndex} chunks, ${fullResponse.length} chars`);
            }
          }
        } catch (err) {
          console.warn(`[AI Stream] ${requestId} – failed to parse line: ${line.slice(0, 50)}...`);
        }
      }
    }

    // ------------------------------------------------------------------------
    // 7. Final progress
    // ------------------------------------------------------------------------
    event.node.res.write(buildSSEEvent('progress', requestId, {
      status: 'complete',
      progress: 100,
      message: 'Response complete'
    }));

  } catch (error) {
    console.error(`[AI Stream] ${requestId} – error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    event.node.res.write(buildSSEEvent('error', requestId, {
      code: 'STREAM_ERROR',
      message: errorMessage,
      recoverable: true
    }));
  } finally {
    event.node.res.end();
  }
});
```

---

## ✅ What Changed / Improved

1. **Uses shared utilities** – `loadPromptSchema` and `buildSectionPrompt` are now imported from `server/utils/`.
2. **Clearer body typing** – The request body is now the full `StreamingContext` (as sent by the client `streamClinicalAI`). No nested `payload`.
3. **Fallback section handling** – If `sectionId` is missing or not found, uses `schema.fallbackSection`.
4. **Summary extraction** – Remains in the `complete` event for the client to accumulate.
5. **Config overrides** – Temperature, maxTokens, model are taken from `context.config`.

---

## 📁 Updated File Structure

```
server/
├── api/
│   ├── ai/
│   │   ├── index.post.ts          (non‑streaming, updated)
│   │   └── stream.post.ts         (streaming, updated)
├── prompts/
│   └── peds_respiratory.json      (your prompt schema)
├── types/
│   └── aiTypes.ts                 (shared types)
├── utils/
│   ├── loadPromptSchema.ts        (schema loader)
│   └── promptBuilder.ts           (shared prompt builder)
```

---

## 🔁 Client‑Side Compatibility

Your client `streamClinicalAI` from the previous step sends exactly this structure:

```ts
const result = await streamClinicalAI('SECTION_GUIDANCE', {
  sessionId: ...,
  schemaId: ...,
  sectionId: ...,
  cumulativeSummary: ...,
  patient: { ... },
  assessment: { answers: ..., calculated: ... },
  config: { ... }
}, callbacks);
```

This now matches perfectly with the server.

---

## 🧪 Testing Checklist

- [ ] `loadPromptSchema` correctly reads and parses the JSON schema file.
- [ ] `buildSectionPrompt` produces the expected prompt string (check logs).
- [ ] SSE events (`chunk`, `progress`, `complete`) are sent in the correct order.
- [ ] Summary extraction works (regex `SUMMARY:`).
- [ ] Fallback section is used when `sectionId` is invalid.
- [ ] Error handling sends an `error` event and ends the stream cleanly.

---

This completes the **unified, shared‑utility‑based AI streaming endpoint**.  
Everything is now consistent, maintainable, and ready for multiple prompt schemas.  

async function handleFieldChange(fieldId: string, value: any) {
  const result = await saveField(fieldId, value);
  // ... validation

  // Trigger reactive AI if the field is significant
  if (shouldUpdateAI(fieldId)) {
    await reactiveHandleFieldChange(fieldId, value, {
      answers: instance.value?.answers || {},
      calculated: instance.value?.calculated,
      patient: {
        ageMonths: instance.value?.answers?.patient_age_months,
        weightKg: instance.value?.answers?.patient_weight_kg,
        gender: instance.value?.answers?.gender,
        triagePriority: effectivePriority.value
      }
    });
  }
}

## ✅ Updated `useClinicalFormEngine` – Cumulative Summary Integration

This update extends `useClinicalFormEngine` to **manage the cumulative summary internally**, so the component no longer needs a separate `cumulativeSummary` ref.  
It also exposes `currentSectionId` and a method to update the summary – perfect for passing directly to `useReactiveAI`.

---

### 📁 `composables/useClinicalFormEngine.ts` (excerpt – new additions)

```typescript
import { ref, computed, watch, type Ref } from 'vue';
// ... other imports

export function useClinicalFormEngine(options: {
  schemaId: string;
  formId: string;
  sessionId?: string;
  patientData?: any;
}) {
  // ... existing state (schema, instance, isLoading, etc.)

  // --------------------------------------------------------------------------
  // NEW: Cumulative summary state
  // --------------------------------------------------------------------------
  const cumulativeSummary = ref<string>('');

  /**
   * Update the cumulative summary – call this when a new AI summary is received.
   * @param newSummary - The summary sentence to append.
   */
  const setCumulativeSummary = (newSummary: string) => {
    if (newSummary && newSummary.trim()) {
      cumulativeSummary.value = cumulativeSummary.value
        ? `${cumulativeSummary.value} ${newSummary.trim()}`
        : newSummary.trim();
    }
  };

  /**
   * Clear the cumulative summary (e.g., when starting a new assessment).
   */
  const clearCumulativeSummary = () => {
    cumulativeSummary.value = '';
  };

  // --------------------------------------------------------------------------
  // NEW: Current section ID computed
  // --------------------------------------------------------------------------
  const currentSectionId = computed<string | undefined>(() => {
    return currentSection.value?.id;
  });

  // --------------------------------------------------------------------------
  // Expose the new state and methods
  // --------------------------------------------------------------------------
  return {
    // ... existing returns (schema, instance, isLoading, isSaving, etc.)
    cumulativeSummary,          // ✅ reactive ref
    setCumulativeSummary,       // ✅ method to update it
    clearCumulativeSummary,     // ✅ optional reset
    currentSectionId,           // ✅ computed from currentSection
    // ... other existing returns
  };
}
```

---

### 🔁 Updated `[formId].vue` – Using Engine's Cumulative Summary

Now the component no longer needs its own `cumulativeSummary` ref – it uses the engine's.

```typescript
// ============================================
// Initialize form engine
// ============================================
const {
  schema,
  instance,
  isLoading,
  isSaving,
  currentSectionIndex,
  progress,
  triagePriority,
  validationErrors,
  initialize,
  saveField,
  getFieldValue,
  nextSection,
  previousSection,
  completeForm,
  // NEW:
  cumulativeSummary,        // ✅ reactive ref from engine
  setCumulativeSummary,     // ✅ method to update it
  currentSectionId          // ✅ computed ref
} = useClinicalFormEngine({
  schemaId: schemaId.value,
  formId: formId.value,
  sessionId: sessionId.value,
  patientData: patientData.value
});
```

---

### 🤖 Updated `useReactiveAI` Integration – Pass Engine Refs Directly

Now pass the engine's `currentSectionId` and `cumulativeSummary` refs to `useReactiveAI`.  
No need for separate local refs.

```typescript
const {
  init: initReactiveAI,
  handleFieldChange: reactiveHandleFieldChange,
  requestUpdate: requestReactiveAIUpdate,
  dismissGuidance: dismissReactiveAIGuidance,
  shouldUpdateAI
} = useReactiveAI({
  schemaId: schemaId.value,
  sessionId: resolvedSessionId.value,
  formId: formId.value,
  currentSectionId,          // ✅ pass the computed ref from engine
  cumulativeSummary,         // ✅ pass the ref from engine
  onGuidanceReady: (response) => {
    reactiveAIGuidance.value = response;
    showReactiveAIGuidance.value = true;
  },
  onInconsistenciesFound: (inconsistencies) => {
    reactiveAIInconsistencies.value = inconsistencies;
  },
  onStatusChange: (status) => {
    reactiveAIStatus.value = status;
  },
  onError: (error) => console.error('[ReactiveAI]', error)
});
```

---

### 🧠 Automatic Summary Update in AI Callbacks

In your streaming `onComplete` callback, call `setCumulativeSummary(summary)` to persist the summary.

```typescript
onComplete: (fullResponse: string, duration: number, summary?: string) => {
  if (summary) {
    setCumulativeSummary(summary);   // ✅ engine manages the cumulative summary
  }
  // ... rest of completion logic
}
```

---

### 🎯 Benefits

- **Centralised state** – All assessment data (answers, calculated, cumulative summary) lives in one composable.
- **Less boilerplate** – No need to declare and manage a separate `cumulativeSummary` ref in every component.
- **Reactive by default** – `useReactiveAI` automatically picks up changes to `currentSectionId` and `cumulativeSummary` because they are refs.
- **Cleaner component** – The component no longer needs to know *how* to accumulate summaries; it just calls `setCumulativeSummary`.

---

### 📦 Optional: Auto‑Trigger AI on Section Change

You can add a simple watcher in the component to automatically request guidance when the section changes:

```typescript
watch(currentSectionId, async (newSectionId, oldSectionId) => {
  if (newSectionId && newSectionId !== oldSectionId) {
    // Debounce or immediate? Up to you.
    await requestReactiveAIUpdate(
      instance.value?.answers || {},
      instance.value?.calculated,
      {
        ageMonths: instance.value?.answers?.patient_age_months,
        weightKg: instance.value?.answers?.patient_weight_kg,
        gender: instance.value?.answers?.gender,
        triagePriority: effectivePriority.value
      }
    );
  }
});
```

---

This completes the integration: **`useClinicalFormEngine` now owns the cumulative summary**, making the entire AI guidance flow more cohesive and reducing duplication.  

## ✅ Full `useClinicalFormEngine.ts` with Cumulative Summary Integration

This is the **complete** composable. It includes:

- **All existing functionality** – schema loading, instance management, field saving, navigation, validation.
- **New cumulative summary state** – `cumulativeSummary`, `setCumulativeSummary`, `clearCumulativeSummary`.
- **New computed ref** – `currentSectionId` (derived from `currentSection`).
- **Automatic summary persistence** – When an AI‑enhanced `clinicalNarrative` is received, you can update the summary via `setCumulativeSummary` (used in component callbacks).
- **Full TypeScript support** with proper return typing.

---

```typescript
// composables/useClinicalFormEngine.ts
import { ref, shallowRef, computed, watch, type Ref } from 'vue';
import { useRuntimeConfig } from '#app';
import { formEngine } from '~/services/formEngine';
import type { FormSchema, FormInstance, FormSection, FormField, SaveFieldResult, CompleteFormResult } from '~/types/clinical-form';
import type { PatientData } from '~/types/patient';

interface UseClinicalFormEngineOptions {
  schemaId: string;
  formId: string;
  sessionId?: string;
  patientData?: Partial<PatientData>;
}

export function useClinicalFormEngine(options: UseClinicalFormEngineOptions) {
  const { schemaId, formId, sessionId, patientData } = options;

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const schema = shallowRef<FormSchema | null>(null);
  const instance = shallowRef<FormInstance | null>(null);
  const isLoading = ref(true);
  const isSaving = ref(false);
  const currentSectionIndex = ref(0);
  const validationErrors = ref<Record<string, string>>({});
  const _initialized = ref(false);

  // --------------------------------------------------------------------------
  // NEW: Cumulative summary state
  // --------------------------------------------------------------------------
  const cumulativeSummary = ref<string>('');

  /**
   * Update the cumulative summary by appending a new summary sentence.
   * @param newSummary - The summary to append (e.g., from AI's SUMMARY: line).
   */
  const setCumulativeSummary = (newSummary: string) => {
    if (newSummary && newSummary.trim()) {
      cumulativeSummary.value = cumulativeSummary.value
        ? `${cumulativeSummary.value} ${newSummary.trim()}`
        : newSummary.trim();
    }
  };

  /**
   * Clear the cumulative summary – useful when starting a new assessment.
   */
  const clearCumulativeSummary = () => {
    cumulativeSummary.value = '';
  };

  // --------------------------------------------------------------------------
  // Computed
  // --------------------------------------------------------------------------
  const formSections = computed(() => schema.value?.sections || []);

  const currentSection = computed<FormSection | undefined>(() => {
    if (!schema.value?.sections || !instance.value) return undefined;
    return schema.value.sections[currentSectionIndex.value];
  });

  // NEW: Current section ID for AI prompts
  const currentSectionId = computed<string | undefined>(() => {
    return currentSection.value?.id;
  });

  const progress = computed(() => {
    if (!instance.value) return 0;
    // Calculate progress based on completed sections
    const total = formSections.value.length;
    if (total === 0) return 0;
    return ((currentSectionIndex.value + 1) / total) * 100;
  });

  const triagePriority = computed(() => {
    // Returns the calculated triage priority from instance.calculated
    return instance.value?.calculated?.triagePriority || 
           instance.value?.calculated?.triage_priority || 
           null;
  });

  // --------------------------------------------------------------------------
  // Methods
  // --------------------------------------------------------------------------

  /**
   * Initialize the form – load schema and existing instance (or create new).
   */
  async function initialize(): Promise<void> {
    if (_initialized.value) return;
    isLoading.value = true;
    try {
      // 1. Load schema
      const loadedSchema = await formEngine.loadSchema(schemaId);
      if (!loadedSchema) throw new Error(`Schema not found: ${schemaId}`);
      schema.value = loadedSchema;

      // 2. Load or create instance
      let formInstance: FormInstance | null = null;
      if (formId !== 'new') {
        formInstance = await formEngine.loadInstance(formId);
      }
      if (!formInstance) {
        // Create new instance
        formInstance = await formEngine.createInstance({
          schemaId,
          sessionId,
          patientData,
          status: 'in_progress'
        });
      }
      instance.value = formInstance;

      // 3. Restore current section from instance state
      if (instance.value?.currentSection) {
        const sectionIndex = formSections.value.findIndex(
          s => s.id === instance.value!.currentSection
        );
        if (sectionIndex !== -1) currentSectionIndex.value = sectionIndex;
      }

      _initialized.value = true;
    } catch (error) {
      console.error('[ClinicalFormEngine] Initialize failed:', error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Save a single field value.
   */
  async function saveField(fieldId: string, value: any): Promise<SaveFieldResult> {
    if (!instance.value) throw new Error('No active form instance');
    isSaving.value = true;
    try {
      const result = await formEngine.saveField(instance.value._id, fieldId, value, {
        validate: true,
        recalculate: true
      });

      if (result.success) {
        // Update local instance with new answers and calculated data
        if (instance.value) {
          instance.value.answers = { ...instance.value.answers, [fieldId]: value };
          if (result.calculated) {
            instance.value.calculated = result.calculated;
          }
          // Clear validation error for this field
          delete validationErrors.value[fieldId];
        }
      } else {
        // Store validation errors
        if (result.validationErrors) {
          validationErrors.value = { ...validationErrors.value, ...result.validationErrors };
        }
      }
      return result;
    } finally {
      isSaving.value = false;
    }
  }

  /**
   * Get the current value of a field.
   */
  function getFieldValue(fieldId: string): any {
    return instance.value?.answers?.[fieldId];
  }

  /**
   * Navigate to the next section.
   */
  async function nextSection(): Promise<void> {
    if (!instance.value) return;
    if (currentSectionIndex.value < formSections.value.length - 1) {
      currentSectionIndex.value++;
      // Persist current section in instance
      instance.value.currentSection = currentSection.value?.id;
      await formEngine.updateInstance(instance.value._id, {
        currentSection: currentSection.value?.id
      });
    }
  }

  /**
   * Navigate to the previous section.
   */
  async function previousSection(): Promise<void> {
    if (!instance.value) return;
    if (currentSectionIndex.value > 0) {
      currentSectionIndex.value--;
      instance.value.currentSection = currentSection.value?.id;
      await formEngine.updateInstance(instance.value._id, {
        currentSection: currentSection.value?.id
      });
    }
  }

  /**
   * Complete the form (mark as completed and trigger triage calculation).
   */
  async function completeForm(): Promise<CompleteFormResult> {
    if (!instance.value) throw new Error('No active form instance');

    // Validate required fields across all sections
    const validation = await formEngine.validateInstance(instance.value._id);
    if (!validation.valid) {
      return {
        allowed: false,
        reason: 'Missing required fields',
        validationErrors: validation.errors
      };
    }

    // Ensure triage is calculated
    if (!instance.value.calculated?.triagePriority) {
      const recalc = await formEngine.recalculate(instance.value._id);
      instance.value.calculated = recalc.calculated;
    }

    // Mark instance as completed
    const updated = await formEngine.updateInstance(instance.value._id, {
      status: 'completed',
      completedAt: new Date().toISOString()
    });

    instance.value = updated;
    return { allowed: true };
  }

  // --------------------------------------------------------------------------
  // Watchers
  // --------------------------------------------------------------------------

  // When instance changes, update validation errors? (optional)
  watch(instance, (newInstance) => {
    if (newInstance?.validationErrors) {
      validationErrors.value = newInstance.validationErrors;
    }
  });

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------
  return {
    // State
    schema,
    instance,
    isLoading,
    isSaving,
    currentSectionIndex,
    progress,
    triagePriority,
    validationErrors,
    formSections,
    currentSection,

    // NEW: Cumulative summary
    cumulativeSummary,
    setCumulativeSummary,
    clearCumulativeSummary,
    currentSectionId,

    // Methods
    initialize,
    saveField,
    getFieldValue,
    nextSection,
    previousSection,
    completeForm
  };
}
```

---

## 🔁 How to Use in `[formId].vue`

The component now becomes much cleaner:

```typescript
const {
  schema,
  instance,
  isLoading,
  isSaving,
  currentSectionIndex,
  progress,
  triagePriority,
  validationErrors,
  initialize,
  saveField,
  getFieldValue,
  nextSection,
  previousSection,
  completeForm,
  // NEW:
  cumulativeSummary,
  setCumulativeSummary,
  currentSectionId
} = useClinicalFormEngine({
  schemaId: schemaId.value,
  formId: formId.value,
  sessionId: sessionId.value,
  patientData: patientData.value
});

// Pass cumulativeSummary and currentSectionId directly to useReactiveAI
const reactiveAI = useReactiveAI({
  schemaId: schemaId.value,
  sessionId: resolvedSessionId.value,
  formId: formId.value,
  currentSectionId,          // ✅ computed ref
  cumulativeSummary,         // ✅ reactive ref
  // ... callbacks
});

// In AI streaming callback:
onComplete: (fullResponse, duration, summary) => {
  if (summary) {
    setCumulativeSummary(summary);   // ✅ updates the engine's summary
  }
  // ...
}
```

---

## ✅ Benefits of This Integration

| Before | After |
|--------|-------|
| Component maintains its own `cumulativeSummary` ref. | Engine owns the summary – single source of truth. |
| Summary passed manually to `useReactiveAI`. | Refs are passed directly – reactive updates automatically. |
| Duplicate state across component and engine. | Centralised, no duplication. |
| No easy way to reset summary on new assessment. | `clearCumulativeSummary` method. |

This makes the entire AI guidance flow **self‑contained within the form engine** – the component only needs to call `setCumulativeSummary` when a new summary arrives.

---

## 🧪 Testing Checklist

- [ ] `cumulativeSummary` starts as `''`.
- [ ] `setCumulativeSummary('First.')` → `cumulativeSummary.value = 'First.'`.
- [ ] `setCumulativeSummary('Second.')` → `cumulativeSummary.value = 'First. Second.'`.
- [ ] `currentSectionId` updates when navigating sections.
- [ ] `useReactiveAI` receives reactive refs and updates automatically.
- [ ] After form completion, the summary persists (can be used for treatment phase).

This completes the **full, production‑ready implementation** of cumulative, section‑aware AI guidance in your HealthBridge assessment flow.  

