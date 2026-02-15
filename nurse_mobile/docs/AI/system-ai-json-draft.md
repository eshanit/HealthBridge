Here is a concrete JSON schema (draft-07) and a corresponding TypeScript interface for the **MedGemma AI request payload**.  
It formalises the full clinical context that your front‑end must send with every AI interaction, ensuring the model has everything it needs in a single, stateless call.

---

## 📦 JSON Schema – `MedGemmaRequest`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://yourdomain.com/schemas/medgemma-request.json",
  "title": "MedGemma AI Request",
  "description": "Complete clinical context sent to MedGemma for every AI interaction. Stateless, session‑agnostic.",
  "type": "object",
  "required": ["requestId", "timestamp", "session", "patient", "task"],
  "properties": {
    "requestId": {
      "type": "string",
      "description": "Unique ID for this request (for tracing and audit).",
      "pattern": "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp when the request was generated."
    },
    "session": {
      "type": "object",
      "description": "Identifiers for the current clinical session.",
      "required": ["sessionId", "schemaId", "formId"],
      "properties": {
        "sessionId": {
          "type": "string",
          "description": "UUID or unique identifier of the session (from route / navigation state)."
        },
        "schemaId": {
          "type": "string",
          "description": "ID of the clinical schema (e.g., 'peds_respiratory')."
        },
        "formId": {
          "type": "string",
          "description": "ID of the form instance (assessment or treatment)."
        }
      }
    },
    "patient": {
      "type": "object",
      "description": "Demographic and current status of the patient.",
      "required": ["ageMonths", "weightKg", "gender"],
      "properties": {
        "ageMonths": {
          "type": "integer",
          "minimum": 1,
          "maximum": 240,
          "description": "Patient age in months."
        },
        "weightKg": {
          "type": "number",
          "minimum": 0.5,
          "maximum": 200,
          "description": "Patient weight in kilograms."
        },
        "gender": {
          "type": "string",
          "enum": ["male", "female", "other"],
          "description": "Patient gender."
        },
        "triagePriority": {
          "type": "string",
          "enum": ["red", "yellow", "green", "unknown"],
          "description": "Current effective triage priority (as shown in the UI)."
        }
      }
    },
    "assessment": {
      "type": "object",
      "description": "All data from the current assessment (answers + calculated).",
      "properties": {
        "answers": {
          "type": "object",
          "description": "Map of field IDs to their current values. Type depends on field definition.",
          "additionalProperties": true,
          "example": {
            "patient_age_months": 30,
            "resp_rate": 48,
            "cough_present": true,
            "convulsions": false
          }
        },
        "calculated": {
          "type": "object",
          "description": "Calculated fields (triage, fast_breathing, classification, etc.).",
          "additionalProperties": true,
          "example": {
            "fast_breathing": true,
            "triagePriority": "yellow",
            "triageClassification": "Pneumonia",
            "triageActions": ["oral_antibiotics", "home_care_advice"]
          }
        }
      },
      "additionalProperties": false
    },
    "task": {
      "type": "object",
      "description": "The specific task the AI must perform.",
      "required": ["type"],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "explain_triage",
            "inconsistency_check",
            "suggest_actions",
            "treatment_advice",
            "caregiver_instructions",
            "clinical_narrative"
          ],
          "description": "The kind of guidance requested."
        },
        "parameters": {
          "type": "object",
          "description": "Task‑specific parameters (e.g., which field to check).",
          "additionalProperties": true,
          "examples": [
            { "fieldId": "convulsions" },
            { "targetPriority": "red" }
          ]
        }
      },
      "additionalProperties": false
    },
    "previousAI": {
      "type": "array",
      "description": "Optional: recent AI interactions from the same session (to avoid repetition).",
      "items": {
        "type": "object",
        "properties": {
          "requestId": { "type": "string" },
          "timestamp": { "type": "string", "format": "date-time" },
          "response": { "type": "string" }
        }
      }
    },
    "config": {
      "type": "object",
      "description": "Runtime configuration for the AI (temperature, max tokens, etc.).",
      "properties": {
        "temperature": {
          "type": "number",
          "minimum": 0,
          "maximum": 2,
          "default": 0.2
        },
        "maxTokens": {
          "type": "integer",
          "minimum": 50,
          "maximum": 1000,
          "default": 300
        },
        "stream": {
          "type": "boolean",
          "description": "If true, the response should be streamed.",
          "default": false
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

---

## 🧩 TypeScript Interface (same structure)

```typescript
export interface MedGemmaRequest {
  requestId: string;           // UUID
  timestamp: string;           // ISO8601
  session: {
    sessionId: string;
    schemaId: string;
    formId: string;
  };
  patient: {
    ageMonths: number;
    weightKg: number;
    gender: 'male' | 'female' | 'other';
    triagePriority?: 'red' | 'yellow' | 'green' | 'unknown';
  };
  assessment?: {
    answers: Record<string, any>;
    calculated?: Record<string, any>;
  };
  task: {
    type:
      | 'explain_triage'
      | 'inconsistency_check'
      | 'suggest_actions'
      | 'treatment_advice'
      | 'caregiver_instructions'
      | 'clinical_narrative';
    parameters?: Record<string, any>;
  };
  previousAI?: Array<{
    requestId: string;
    timestamp: string;
    response: string;
  }>;
  config?: {
    temperature?: number;     // default 0.2
    maxTokens?: number;       // default 300
    stream?: boolean;         // default false
  };
}
```

---

## 📝 Example Payloads

### 1. Explain Triage (after section 6)

```json
{
  "requestId": "a7e3f1b0-1a2b-4c5d-9e8f-6a7b8c9d0e1f",
  "timestamp": "2026-02-11T14:35:22.123Z",
  "session": {
    "sessionId": "sess_01JKZ2X4T9Y5V7M8N3B1C6D0E",
    "schemaId": "peds_respiratory",
    "formId": "frm_01JKZ2X4T9Y5V7M8N3B1C6D0E"
  },
  "patient": {
    "ageMonths": 30,
    "weightKg": 14.2,
    "gender": "male",
    "triagePriority": "yellow"
  },
  "assessment": {
    "answers": {
      "patient_age_months": 30,
      "patient_weight_kg": 14.2,
      "cough_present": true,
      "cough_duration_days": 3,
      "resp_rate": 48,
      "retractions": false,
      "cyanosis": false,
      "unable_to_drink": false,
      "convulsions": false
    },
    "calculated": {
      "fast_breathing": true,
      "triagePriority": "yellow",
      "triageClassification": "Pneumonia",
      "triageActions": ["oral_antibiotics", "home_care_advice", "follow_up_2_days"]
    }
  },
  "task": {
    "type": "explain_triage",
    "parameters": { "includeNextSteps": true }
  },
  "config": {
    "temperature": 0.2,
    "maxTokens": 250
  }
}
```

### 2. Inconsistency Check (reactive, on field change)

```json
{
  "requestId": "b8f2c1d0-2b3c-4d5e-9f0a-7b8c9d0e1f2a",
  "timestamp": "2026-02-11T14:30:15.789Z",
  "session": {
    "sessionId": "sess_01JKZ2X4T9Y5V7M8N3B1C6D0E",
    "schemaId": "peds_respiratory",
    "formId": "frm_01JKZ2X4T9Y5V7M8N3B1C6D0E"
  },
  "patient": {
    "ageMonths": 30,
    "weightKg": 14.2,
    "gender": "male"
  },
  "assessment": {
    "answers": {
      "patient_age_months": 30,
      "cyanosis": true,
      "retractions": false,
      "resp_rate": 48
    }
  },
  "task": {
    "type": "inconsistency_check",
    "parameters": { "fieldId": "cyanosis" }
  },
  "config": {
    "temperature": 0.1,
    "maxTokens": 150
  }
}
```

---

## 🔧 Implementation Notes for KiloCode

1. **All fields under `assessment.answers` must be the **actual values** the nurse has entered** – no transformation.  
   `calculated` should contain whatever `instance.value.calculated` provides (may be partial or empty).

2. **Patient `triagePriority`** should be the **effective priority** computed by the client (`effectivePriority` ref), which accounts for danger signs even before the triage section is complete.

3. **Task `parameters`** – use this to pass additional hints:
   - For `inconsistency_check`: `{ fieldId: "cyanosis" }`
   - For `explain_triage`: `{ includeNextSteps: true }`
   - For `suggest_actions`: `{ limit: 3 }`

4. **Optional `previousAI`** – include the last 1‑2 AI responses to avoid repeating the same advice. The AI should be instructed: “Do not repeat the following previous advice: …”

5. **Server‑side endpoint** should accept this exact schema and forward to MedGemma.  
   Return type: either a **stream** (`text/event-stream`) or a **full JSON** response containing the explanation and metadata.

6. **Audit logging** – the `requestId` and `timestamp` should be passed through and stored in your `auditLogger`.

---

## ✅ Next Steps for KiloCode

- Implement a **builder function** in `useMedGemma.ts` that constructs this payload from the current stores.
- Update `ollamaService.generateAINarrative` to accept this payload instead of a plain string prompt.
- Refactor `buildTriageAIPrompt` to **dynamically generate the instruction** based on the payload, not a hard‑coded template.
- Add **streaming support** for the “Ask MedGemma” button using `ReadableStream` and display tokens incrementally.

