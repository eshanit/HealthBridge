Excellent choice.
Phase 4 is where your system becomes **clinically safe, trustworthy, and regulator-ready**.

Below is a **Phase 4 AI Safety Rules Framework** designed specifically for your WHO-IMCI–driven workflow.

You can hand this directly to Kilocode as a spec.

---

# Phase 4 — AI Safety Rules & Clinical Guardrails

**Version:** 1.0
**Applies to:** All AI-powered clinical assistance, recommendations, explanations, alerts

---

## 1. Core Safety Principles (Non-Negotiable)

| Rule                   | Description                                                          |
| ---------------------- | -------------------------------------------------------------------- |
| AI is advisory only    | AI NEVER replaces nurse/clinician judgement                          |
| No diagnosis           | AI cannot declare a disease—only describe risk or guideline category |
| No treatment authority | AI may explain, not prescribe                                        |
| Always cite source     | Every AI suggestion must reference WHO IMCI or system rules          |
| Uncertainty visible    | AI must display confidence level                                     |
| Human override         | User can always ignore AI                                            |

---

## 2. Clinical Safety Layers

AI must pass through **all** layers before responding:

```
User Question / Trigger
        ↓
Context Validator
        ↓
Scope Guard
        ↓
Guideline Match
        ↓
Risk Escalation
        ↓
Explainability Engine
        ↓
UI Output
```

---

## 3. Context Validator

AI must confirm:

* A session exists
* An assessment is complete
* A triage result exists

If not:

> “I don’t yet have enough clinical information to advise safely.”

---

## 4. Scope Guard (Hard Limits)

AI MUST REFUSE if user asks:

* “What disease does this child have?”
* “Should I ignore referral?”
* “What drug should I give instead?”
* “What dose should I change?”

**Response template:**

> “I can’t make clinical decisions. I can explain what the guideline says and what to watch for.”

---

## 5. Guideline Binding

AI may only use:

1. `triageLogic`
2. `calculations`
3. WHO metadata
4. treatment bridge outputs

No hallucinated care.

---

## 6. Risk Escalation Rules

| Condition               | Mandatory AI Behavior         |
| ----------------------- | ----------------------------- |
| Red priority            | Display EMERGENCY banner      |
| Cyanosis OR unconscious | “Immediate referral required” |
| Oxygen < 90%            | Highlight hypoxia warning     |
| Convulsions             | Flag neurological danger      |

AI must always recommend referral for RED.

---

## 7. Contradiction Detection

AI checks:

* Recommended action vs contraindication
* Age vs medicine safety
* Allergy flags

If conflict:

> “⚠️ Potential safety conflict detected. Please review before proceeding.”

---

## 8. Explainability Engine

Every AI response must show:

**Why:**

* Which rule triggered
* Which field caused it

**What:**

* The WHO category

**Next:**

* Allowed actions only

---

## 9. Tone & Language Rules

| Rule             | Example                          |
| ---------------- | -------------------------------- |
| No certainty     | “This suggests…”                 |
| No commands      | “You may consider…”              |
| No fear language | Avoid “will die”                 |
| Clear escalation | “Immediate referral recommended” |

---

## 10. Logging & Audit

Every AI output logs:

* Session ID
* Inputs used
* Rule IDs
* AI text
* User action taken

---

## 11. UI Safety Controls

* AI messages marked: **“Clinical Support (Not a Diagnosis)”**
* Red cases force confirmation before dismissal
* Nurse must confirm: *“I have reviewed this.”*

---

## 12. Example Safe AI Output

> **Why is this patient RED?**
>
> The child has **cyanosis** and **chest indrawing**.
>
> According to WHO IMCI, these are signs of **severe respiratory distress**.
>
> **Classification:** RED (Emergency)
>
> **Recommended actions:**
> • Urgent referral
> • Oxygen if available
>
> *This is clinical support, not a diagnosis. Please follow facility protocol.*

---

## 13. Kill Switch

Admin can:

* Disable AI
* Restrict to explanations only
* Force referral mode

---
