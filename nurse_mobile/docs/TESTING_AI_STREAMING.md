# AI Streaming with Cumulative Prompt Strategy - Testing Guide

## Overview

This guide walks through testing the AI streaming system with cumulative prompt strategy for the pediatric respiratory assessment.

## Prerequisites

1. **Ollama running:**
   ```bash
   ollama serve
   ```

2. **Nuxt dev server running:**
   ```bash
   cd nurse_mobile && npm run dev
   ```

## System Architecture

### Request Flow
```
Client → POST /api/ai/stream → Server → Ollama → SSE Response
```

### Cumulative Prompt Strategy
- Each section's AI response contributes a one-sentence summary
- Summary is passed to next section's prompt
- Creates coherent, progressive clinical guidance

## Testing Steps

### Step 1: Verify Schema Loading

1. Check that the schema file exists:
   ```bash
   ls -la app/schemas/prompts/peds_respiratory_schema.json
   ```

2. Verify schema contents:
   ```json
   {
     "schemaId": "peds_respiratory",
     "version": "1.0.0",
     "sections": [
       {"id": "patient_info", "maxWords": 40, "cumulative": false},
       {"id": "danger_signs", "maxWords": 150, "cumulative": true},
       {"id": "respiratory_danger", "maxWords": 120, "cumulative": true},
       ...
     ]
   }
   ```

### Step 2: Test Single Section Request

Use curl to test the API directly:

```bash
curl -X POST http://localhost:3000/api/ai/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "requestId": "test-001",
    "useCase": "SECTION_GUIDANCE",
    "sessionId": "test-session",
    "schemaId": "peds_respiratory",
    "sectionId": "patient_info",
    "patient": {
      "ageMonths": 12,
      "weightKg": 10.5,
      "gender": "male"
    },
    "assessment": {
      "answers": {
        "patient_age_months": 12,
        "patient_weight_kg": 10.5
      }
    },
    "timestamp": "2026-02-12T11:00:00Z"
  }'
```

**Expected response (SSE format):**
```
data: {"type":"connection_established",...}

data: {"type":"progress",...}

data: {"type":"chunk","payload":{"chunk":"Patient demographics are","isFirst":true,...}}

data: {"type":"complete","payload":{"fullResponse":"12-month-old male, 10.5kg. Registration complete.","summary":"12-month-old, 10.5kg male.","wasTruncated":false}}
```

### Step 3: Test Cumulative Flow

**Section 1 Request:**
```bash
curl -X POST http://localhost:3000/api/ai/stream \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "test-002",
    "useCase": "SECTION_GUIDANCE",
    "sessionId": "test-session",
    "schemaId": "peds_respiratory",
    "sectionId": "patient_info",
    "cumulativeSummary": "",
    "patient": {"ageMonths": 12, "weightKg": 10.5, "gender": "male"},
    "assessment": {"answers": {"patient_age_months": 12, "patient_weight_kg": 10.5}}
  }'
```

**Response includes:** `summary: "12-month-old, 10.5kg male."`

**Section 2 Request (with cumulative summary):**
```bash
curl -X POST http://localhost:3000/api/ai/stream \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "test-003",
    "useCase": "SECTION_GUIDANCE",
    "sessionId": "test-session",
    "schemaId": "peds_respiratory",
    "sectionId": "danger_signs",
    "cumulativeSummary": "12-month-old, 10.5kg male.",
    "patient": {"ageMonths": 12, "weightKg": 10.5, "gender": "male"},
    "assessment": {
      "answers": {
        "unable_to_drink": true,
        "vomits_everything": false,
        "convulsions": false,
        "lethargic_unconscious": false
      }
    }
  }'
```

**Expected behavior:**
- AI references previous patient info
- Response mentions "12-month-old" in context
- Output is ~1-3 sentences

### Step 4: Verify Word Limit Enforcement

**Test with verbose response:**
1. Request a section with `maxWords: 40`
2. If AI generates >40 words, check for:
   - Log: `[AI Stream] Response for "patient_info" exceeded 40 words, truncating`
   - `wasTruncated: true` in response
   - Response ends at sentence boundary

### Step 5: Test in Browser UI

1. Navigate to: `http://localhost:3000/sessions`
2. Start a new session or select existing
3. Go to assessment page
4. Complete Section 1 (Patient Info)
5. Open browser DevTools → Console
6. Observe SSE events logged:
   ```
   [AI Stream] SSE Event: connection_established
   [AI Stream] SSE Event: chunk
   [AI Stream] SSE Event: complete
   ```
7. Check cumulative summary stored in Vue devtools

## Console Log Reference

| Log | Meaning |
|-----|---------|
| `[AI Stream] Loaded schema: peds_respiratory, version: 1.0.0, sections: 7` | Schema loaded successfully |
| `[AI Stream] Using cumulative prompt for section: danger_signs` | Cumulative strategy active |
| `[AI Stream] Response for "patient_info" exceeded 40 words, truncating` | Word limit enforced |
| `[AI Stream] Extracted summary: "12-month-old, 10.5kg male."` | Summary extraction |
| `[AI Stream] Completed: test-001, truncated: false` | Request complete |

## Troubleshooting

### Schema Not Found (404)
```
[AI Stream] Schema not found: peds_respiratory
```
**Fix:** Ensure `app/schemas/prompts/peds_respiratory_schema.json` exists

### Empty Response
Check that `useCase` is `SECTION_GUIDANCE` and `sectionId` is valid

### Verbose AI Response
Verify word limit is being enforced by checking `wasTruncated` flag

## File Locations

| File | Purpose |
|------|---------|
| `server/api/ai/stream.post.ts` | SSE streaming endpoint |
| `app/schemas/prompts/peds_respiratory_schema.json` | Prompt schema |
| `app/composables/useClinicalFormEngine.ts` | Client-side streaming logic |
