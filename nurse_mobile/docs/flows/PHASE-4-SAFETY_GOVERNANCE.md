

# KiloCode Build Instructions

## Phase 4 – AI Safety & Governance Control Layer

**Project: HealthBridge Clinical AI**

---

## 0. System Goal

Implement a **safety control plane** around MedGemma so that:

* AI output is **never trusted blindly**
* All responses are validated, scored, and audited
* Contradictions with IMCI logic are detected
* Unsafe output is blocked before reaching the nurse
* All decisions are logged for governance

The AI is **advisory only**.

---

## 1. Create Safety Layer Services

Create the following services:

```
/server/ai-safety/
  ├── inputSanitizer.ts
  ├── promptGuardrails.ts
  ├── outputValidator.ts
  ├── contradictionDetector.ts
  ├── riskScorer.ts
  ├── auditLogger.ts
  └── safetyOrchestrator.ts
```

---

## 2. inputSanitizer.ts

### Purpose

Remove PHI, normalize text, strip prompt injection.

### Must:

* Remove system override phrases
* Enforce max length
* Escape markdown and HTML
* Remove role-changing attempts

---

## 3. promptGuardrails.ts

### Purpose

Inject safety constraints into every prompt.

Must prepend:

```
You are NOT allowed to:
- diagnose
- prescribe
- suggest dosages
- override triage
If data is missing, say: "I cannot determine this."
```

---

## 4. outputValidator.ts

### Must detect:

| Pattern          | Action |       |       |
| ---------------- | ------ | ----- | ----- |
| /\b\d+\s?(mg     | ml     | kg)/i | BLOCK |
| /prescribe       | dose/i | BLOCK |       |
| /diagnose/i      | REDACT |       |       |
| /change triage/i | FLAG   |       |       |

Return:

```ts
{ safeText, violations[], action }
```

---

## 5. contradictionDetector.ts

Compare:

* AI mentioned priority
* Calculated triage
* IMCI rule priority

If mismatch → contradiction event.

---

## 6. riskScorer.ts

Apply:

| Signal            | Score |
| ----------------- | ----- |
| Rule conflict     | +5    |
| Dosage            | +5    |
| Diagnosis         | +3    |
| Absolutes         | +2    |
| Missing data refs | +1    |

---

## 7. auditLogger.ts

Log:

```ts
{
 sessionId,
 model,
 task,
 violations,
 riskScore,
 action,
 timestamp
}
```

Store in CouchDB `ai_audit_logs`.

---

## 8. safetyOrchestrator.ts

### Flow:

1. Sanitize input
2. Apply guardrails
3. Send to MedGemma
4. Validate output
5. Detect contradictions
6. Score risk
7. Log
8. Return result or block

---

## 9. API Route

```
POST /api/ai/safe-stream
```

Wraps MedGemma calls.

---

## 10. UI Enforcement

### ExplainabilityCard

Show:

* Safe text
* Risk badge 🟢🟡🔴
* “AI is advisory only” disclaimer

If BLOCK → show fallback message.

---

## 11. Session Escalation

If 3+ warnings:

* Disable AI suggestions
* Display alert banner

---

## 12. Acceptance Criteria

* No unsafe text reaches UI
* All calls logged
* Contradictions flagged
* Risk badges visible

---

**END OF KILOCODE INSTRUCTIONS**
