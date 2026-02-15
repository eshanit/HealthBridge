
# 📘 `system-ai-clinical-explainability.md`

### KiloCode System Instruction

**Project:** AI-Assisted Clinical Decision Support (Nuxt + MedGemma + Ollama)

---

## 1. SYSTEM PURPOSE

This system provides **AI-powered clinical explainability** for a paediatric IMCI decision support app.

The system **must NOT make clinical decisions**.
All triage and treatment decisions are computed by **deterministic rules** already in the app.

The AI layer (MedGemma via Ollama) exists **only to explain, validate, and teach**.

---

## 2. CORE DESIGN LAW

> **Rules decide. AI explains.**

The AI layer must:

* Never assign triage priority
* Never select treatment actions
* Never override rule outputs
* Always reference the deterministic rules

---

## 3. HIGH-LEVEL ARCHITECTURE

### Layers

1. **UI Layer (Nuxt 4)**

   * Assessment forms
   * Triage display
   * Treatment forms
   * “Ask MedGemma” buttons
   * Explainability cards

2. **Clinical Rules Layer**

   * `triageLogic`
   * danger sign logic
   * age-based respiratory cutoffs
   * treatment action maps

3. **AI Explainability Layer**

   * MedGemma (via Ollama)
   * Receives rules + nurse data + system output
   * Returns explanations, warnings, and summaries

4. **Safety & Governance Layer**

   * AI outputs are labeled “Support only”
   * Nurse can ignore
   * All outputs logged
   * Rule IDs and model version attached

---

## 4. DATA FLOW

1. Nurse enters assessment data
2. Rules engine calculates:

   * `triagePriority`
   * `recommendedActions`
3. User clicks **Explain**
4. App sends:

   * condensed schema
   * nurse answers
   * system outputs
5. MedGemma returns:

   * explanation
   * inconsistencies
   * next steps
6. UI renders Explainability Card

---

## 5. REQUIRED BACKEND SERVICE

Create a service:

```
/server/api/ai/explain.post.ts
```

This endpoint must:

* Accept structured clinical payload
* Validate required fields
* Call Ollama (MedGemma)
* Enforce response schema
* Log request + response
* Return safe output to UI

---

## 6. AI REQUEST CONTRACT

```json
{
  "schema": { ... },
  "currentValues": { ... },
  "patientContext": {
    "ageMonths": 30,
    "weightKg": 12
  },
  "systemResult": {
    "triagePriority": "yellow",
    "recommendedActions": ["oral_antibiotics"]
  },
  "promptType": "triage_explanation"
}
```

---

## 7. AI RESPONSE CONTRACT

```json
{
  "explanation": "string",
  "inconsistencies": ["string"],
  "teachingNotes": ["string"],
  "nextSteps": ["string"],
  "confidence": 0.0
}
```

---

## 8. PROMPT TEMPLATE

```
You are a senior paediatric nurse following WHO IMCI.

System rules decided:
Priority: {triagePriority}
Actions: {recommendedActions}

Entered data:
{currentValues}

Explain:
1. Why this priority was assigned
2. What findings triggered it
3. Any contradictions
4. One teaching point
5. Two next steps

Tone: supportive, factual.
Max 150 words.
Never assign priority.
```

---

## 9. UI COMPONENT

Create:

```
components/ExplainabilityCard.vue
```

Displays:

* Explanation
* Warnings
* Teaching notes
* Confidence
* Disclaimer

---

## 10. SAFETY REQUIREMENTS

* Every AI output shows:

  * Model name
  * Timestamp
  * Rule source
* Nurse can dismiss
* No auto-application of advice

---

## 11. PHASE 1 SCOPE

Implement only:

* Triage explanation
* Manual “Explain” button
* Read-only AI guidance

---

## 12. NON-GOALS

* AI must NOT:

  * diagnose
  * prescribe
  * override logic
  * change form values

---

## 13. SUCCESS CRITERIA

* Nurse understands *why* classification occurred
* No AI decisions
* Fully traceable logic
* Safe, explainable, auditable

---
