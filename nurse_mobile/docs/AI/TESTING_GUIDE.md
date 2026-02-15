# AI Integration Testing Guide

This document provides test scenarios to validate Phases 1 & 2 AI functionality.

## Prerequisites

Before testing, ensure:

1. **Ollama is running**: `ollama serve` (default: `http://localhost:11434`)
2. **Model is pulled**: `ollama pull medgemma:4b` (or `gemma3:4b`)
3. **Environment variables**:
   ```bash
   OLLAMA_ENDPOINT=http://localhost:11434/api/generate
   AI_MODEL=medgemma:4b
   AI_ENABLED=true
   ```
4. **Dev server running**: `npm run dev`

---

## Phase 1: Core AI Features

### Test 1.1: Standard AI Response (Non-Streaming)

**Objective**: Verify basic AI requests work via `/api/ai`

**Steps**:
1. Open browser console (F12)
2. Navigate to any assessment page
3. Complete a triage form (sections 1-7)
4. Trigger AI explainability (via UI or console)
5. Check console for `[ClinicalAI]` logs

**Expected Results**:
```
✅ [ClinicalAI] Response generated in Xms
✅ Response contains clinical content
✅ Safety flags are checked
```

**Console Command for Testing**:
```javascript
// Test basic AI response
const testExplainability = {
  classification: {
    priority: 'yellow',
    label: 'Semi-Urgent',
    protocol: 'WHO IMCI'
  },
  reasoning: {
    primaryRule: { description: 'Fever > 7 days' },
    clinicalNarrative: 'Child presents with persistent fever',
    triggers: [{ value: 'fever', clinicalMeaning: 'Elevated temperature' }]
  },
  recommendedActions: [{ code: 'refer', label: 'Refer to facility' }],
  safetyNotes: ['Monitor temperature closely']
};

fetch('/api/ai', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    useCase: 'EXPLAIN_TRIAGE',
    payload: testExplainability
  })
}).then(r => r.json()).then(console.log);
```

### Test 1.2: Explainability Card Display

**Objective**: Verify `ExplainabilityCard.vue` renders correctly

**Steps**:
1. Complete a clinical assessment
2. Navigate to section 7 (triage summary)
3. Verify the card displays:
   - Priority badge (red/yellow/green)
   - AI vs System indicator
   - Clinical triggers list
   - Recommended actions
   - Summary narrative

**Expected Results**:
```
✅ Priority badge matches triage classification
✅ AI Status Badge shows correct source
✅ All clinical data renders without errors
✅ Accessibility labels are present
```

### Test 1.3: AI Status Badge

**Objective**: Verify `AIStatusBadge.vue` differentiates AI vs System content

**Steps**:
1. Check pages with AI-enhanced content
2. Verify badge shows "AI-Powered" with purple styling
3. Verify badge shows "System" for rule-based content

**Expected Results**:
```
✅ AI content: Purple badge with AI icon
✅ System content: Gray badge with system icon
✅ Model version displayed when available
```

---

## Phase 2: Streaming AI Features

### Test 2.1: Streaming Response (Simulated)

**Objective**: Verify `streamClinicalAI()` and `AIStreamingPanel` work

**Steps**:
1. Create a test component or use browser console
2. Trigger a streaming request
3. Observe:
   - Panel appears with "Streaming..." status
   - Progress bar advances
   - Text appears incrementally
   - Animated cursor during streaming
   - "Complete" indicator at end

**Expected Results**:
```
✅ Streaming panel visible during request
✅ Progress bar updates (0-100%)
✅ Text chunks accumulate visibly
✅ Cursor animates while streaming
✅ "Complete" appears when finished
```

**Console Command for Testing**:
```javascript
// Test streaming (simulated mode)
import { streamClinicalAI } from '#imports';

const explainability = {
  classification: { priority: 'yellow', label: 'Semi-Urgent', protocol: 'WHO IMCI' },
  reasoning: {
    primaryRule: { description: 'Test rule' },
    clinicalNarrative: 'Test narrative',
    triggers: [{ value: 'test', clinicalMeaning: 'Test trigger' }]
  },
  recommendedActions: [{ code: 'test', label: 'Test action', justification: 'Test justification' }],
  safetyNotes: ['Test safety note']
};

streamClinicalAI('EXPLAIN_TRIAGE', explainability, {
  onChunk: (chunk) => console.log('Chunk:', chunk),
  onProgress: (tokens, total) => console.log(`Progress: ${tokens}/${total}`),
  onComplete: (full, duration) => console.log(`Complete in ${duration}ms`),
  onError: (err, recov) => console.error('Error:', err, 'Recoverable:', recov)
});
```

### Test 2.2: Cancel Streaming

**Objective**: Verify streaming can be cancelled

**Steps**:
1. Start a streaming request
2. Click "Cancel" button within 2 seconds
3. Verify:
   - Streaming stops immediately
   - Panel shows stopped state
   - `onCancel` callback fires

**Expected Results**:
```
✅ Cancel button is visible during streaming
✅ Request stops within 1-2 seconds
✅ Panel returns to idle state
✅ No error is shown (user-initiated)
```

### Test 2.3: Connection Error Handling

**Objective**: Verify error states display correctly

**Steps**:
1. Stop Ollama server
2. Trigger an AI request
3. Verify error UI:
   - Error message displayed
   - Red status indicator
   - Error details shown

**Expected Results**:
```
✅ Error panel appears with red styling
✅ Descriptive error message shown
✅ Recoverable/non-recoverable indicated
```

---

## Integration Tests

### Test 3.1: Full Assessment Flow

**Objective**: Test complete AI integration in assessment workflow

**Steps**:
1. Start new patient assessment
2. Complete sections 1-6 with clinical data
3. In section 7:
   - Verify ExplainabilityCard renders
   - Trigger "Ask MedGemma" button
   - Observe streaming panel
   - Wait for complete response
   - Verify AI badge appears on card

**Expected Results**:
```
✅ Assessment navigation works
✅ Data persists between sections
✅ AI panel appears in correct location
✅ Streaming completes successfully
✅ AI-enhanced content marked correctly
```

### Test 3.2: Reconnection (when SSE is live)

**Objective**: Verify automatic reconnection on connection loss

**Steps**:
1. Start streaming request
2. Temporarily disconnect network
3. Verify:
   - Reconnection attempts occur
   - Progress bar pauses
   - After reconnect, streaming resumes

**Expected Results**:
```
✅ Auto-reconnect attempts (up to maxRetries)
✅ Connection state updates in UI
✅ Streaming resumes after brief disconnect
```

---

## Manual Testing Checklist

Copy this to a text file for testing:

```
┌──────────────────────────────────────────────────────────────┐
│ Phase 1: Core AI Features                                    │
├──────────────────────────────────────────────────────────────┤
│ [ ] 1.1 Standard AI response via /api/ai                     │
│ [ ] 1.2 ExplainabilityCard renders correctly                 │
│ [ ] 1.3 AI Status Badge shows correct source                │
│ [ ] 1.4 Priority badge matches triage                        │
│ [ ] 1.5 Safety flags are checked                            │
├──────────────────────────────────────────────────────────────┤
│ Phase 2: Streaming Features                                  │
├──────────────────────────────────────────────────────────────┤
│ [ ] 2.1 Streaming panel appears on request                   │
│ [ ] 2.2 Progress bar advances during streaming              │
│ [ ] 2.3 Text appears in chunks (not all at once)           │
│ [ ] 2.4 Animated cursor visible while streaming             │
│ [ ] 2.5 Cancel button stops streaming                      │
│ [ ] 2.6 Error states display correctly                      │
│ [ ] 2.7 "Complete" indicator appears at end                │
├──────────────────────────────────────────────────────────────┤
│ Integration Tests                                            │
├──────────────────────────────────────────────────────────────┤
│ [ ] 3.1 Full assessment flow with AI                        │
│ [ ] 3.2 Data persists between sections                     │
│ [ ] 3.3 AI-enhanced content marked correctly               │
│ [ ] 3.4 Console logs show correct timing                    │
├──────────────────────────────────────────────────────────────┤
│ Browser Console Expected Logs                               │
├──────────────────────────────────────────────────────────────┤
│ ✅ [ClinicalAI] Response generated in Xms                   │
│ ✅ [AI Stream] Streaming started                            │
│ ✅ [AI Stream] Chunk received                               │
│ ✅ [AI Stream] Streaming completed                          │
└──────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| No response from AI | Ollama not running | Start Ollama: `ollama serve` |
| 404 on /api/ai | Server not running | Run `npm run dev` |
| Streaming text all at once | Fallback mode active | SSE endpoint not fully integrated yet |
| Purple styling not visible | Tailwind not loaded | Check build process |
| Priority badge wrong color | Reactivity issue | Check `triggerRef(instance)` call |
| Error panel red but wrong shade | Tailwind class issue | Verify `text-red-400` classes |

---

## Expected Console Output

### Successful Standard AI Request:
```
[ClinicalAI] Response generated in 2345ms
[AI] Request: { useCase: 'EXPLAIN_TRIAGE', requestId: '...' }
```

### Successful Streaming (SSE Mode):
```
[AI Stream] 📡 Streaming started - requestId: stream_123456789_abc123
[AI Stream]    UseCase: EXPLAIN_TRIAGE
[AI Stream]    Session: sess_abc123
[AI Stream]    Schema: triage-schema-v1
[AI Stream]    Form: patient-assessment
[AI Stream] 🔌 Connecting to SSE endpoint...
[AI Stream] 📦 Chunk 1: {"type":"chunk","payload":{"content":"This..."}}
[AI Stream] 📦 Chunk 2: {"type":"chunk","payload":{"content":" patient..."}}
...
[AI Stream] ✅ Streaming completed in 3421ms
[AI Stream]    Total chunks: 15
[AI Stream]    Response length: 1245 chars
```

### Fallback Mode (SSE unavailable):
```
[AI Stream] 📡 Streaming started - requestId: stream_123456789_abc123
[AI Stream] 🔌 Connecting to SSE endpoint...
[AI Stream] ❌ SSE endpoint error: 404 Not Found
[AI Stream] 🔄 Falling back to simulated streaming...
[AI Fallback] 📡 Using simulated streaming - requestId: stream_123456789_abc123
[AI Fallback] 📦 Chunk 1/10: "This patient..."
[AI Fallback] 📦 Chunk 2/10: " presents with..."
...
[AI Fallback] ✅ Simulated streaming completed in 2156ms
[AI Fallback]    Total chunks: 10
```

### Cancelled Stream:
```
[AI Stream] 📡 Streaming started - requestId: stream_123456789_abc123
[AI Stream] 📦 Chunk 1: {"type":"chunk"...}
[AI Stream] ❌ Streaming cancelled - requestId: stream_123456789_abc123
```

### Error State:
```
[AI Stream] 📡 Streaming started - requestId: stream_123456789_abc123
[AI Stream] ❌ Stream error: Connection refused
[AI Fallback] ❌ Error: AI service error: Connection refused
```

---

## Audit Log

The streaming implementation now includes an in-memory audit log for compliance.

### Access Audit Log (Browser Console):
```javascript
// Get all audit entries
import { getAuditLog } from '~/services/clinicalAI';
console.table(getAuditLog());

// Clear audit log
import { clearAuditLog } from '~/services/clinicalAI';
clearAuditLog();
```

### Audit Entry Structure:
```typescript
{
  requestId: string;      // Unique request identifier
  useCase: string;        // AI use case (EXPLAIN_TRIAGE, etc.)
  mode: 'stream' | 'fallback';  // Delivery method
  status: 'started' | 'chunk' | 'complete' | 'error' | 'cancelled';
  timestamp: string;      // ISO 8601 timestamp
  tokens?: number;       // Token count (for chunk/complete)
  totalTokens?: number;  // Total expected tokens
  duration?: number;      // Duration in milliseconds
  error?: string;         // Error message (for error status)
}
```

### Example Audit Log Output:
```
┌──────────┬──────────────┬──────────┬──────────┬────────────────────────────┬─────────┬──────────┐
│ requestId │ useCase      │ mode     │ status   │ timestamp                  │ tokens  │ duration │
├──────────┼──────────────┼──────────┼──────────┼────────────────────────────┼─────────┼──────────┤
│ stream_1 │ EXPLAIN_TRIAGE │ stream   │ started  │ 2026-02-11T19:00:00.000Z │ -       │ -        │
│ stream_1 │ EXPLAIN_TRIAGE │ stream   │ chunk    │ 2026-02-11T19:00:00.100Z │ 1       │ -        │
│ stream_1 │ EXPLAIN_TRIAGE │ stream   │ chunk    │ 2026-02-11T19:00:00.200Z │ 2       │ -        │
│ stream_1 │ EXPLAIN_TRIAGE │ stream   │ complete │ 2026-02-11T19:00:03.421Z │ 15      │ 3421     │
└──────────┴──────────────┴──────────┴──────────┴────────────────────────────┴─────────┴──────────┘
```
