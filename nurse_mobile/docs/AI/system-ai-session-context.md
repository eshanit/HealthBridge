

---

## 🧠 Subject: AI Context & Session Handling – Implementation Guidelines

**To:** KiloCode  
**From:** [You]  
**Purpose:** Clarify how session state is managed for MedGemma and how to design prompts that leverage full patient context without relying on AI memory.

---

### 1. The Core Principle – Stateless AI, Stateful Client

**We do not ask MedGemma to remember anything.**  
Every request contains **the complete current clinical picture**. This avoids:
- Context window limits  
- Hallucinations about prior turns  
- Session expiry or mixing of patients  

The client (Nuxt) is the single source of truth for all session data.

---

### 2. What Data Is Available on Every Request

All of the following is accessible via the existing `useClinicalFormEngine` and `useReactiveAI` composables:

| Data Category | Source | Example |
|---------------|--------|---------|
| **Session ID** | `sessionId` from route / navigation state | `"sess_abc123"` |
| **Patient** | `patientData` object | `{ ageMonths: 30, weightKg: 14, gender: "male", triagePriority: "yellow" }` |
| **Assessment Answers** | `instance.value.answers` | `{ cough_present: true, resp_rate: 48, ... }` |
| **Calculated Values** | `instance.value.calculated` | `{ fast_breathing: true, triagePriority: "yellow" }` |
| **Schema Metadata** | `schema.value` | Form title, field definitions, IMCI rules |
| **Task Type** | Parameter passed to AI service | `"explain_triage"`, `"inconsistency_check"` |

**Your job:** When building a prompt, **ingest all relevant fields from these structures**.  
Do **not** assume the AI remembers the patient from a previous call.

---

### 3. How the Client Triggers AI Calls

Two distinct flows are already implemented:

#### A. Reactive AI (automatic, per field change)
- `handleFieldChange(fieldId, value)` → `reactiveHandleFieldChange()`
- Debounced call to AI with **full updated answers**.
- Used for early warnings, suggestions, and inconsistency detection.
- **Already done** – you only need to improve the prompt content.

#### B. On‑demand AI (user clicks “Ask MedGemma”)
- `requestMedGemmaGuidance()` → `buildExplainabilityFromCalculated()`
- Sends the **current state** and returns an `ExplainabilityRecord`.
- Used for triage explanations and treatment recommendations.

**Important:** Both flows **always send the entire answers object**, not just the delta.

---

### 4. Prompt Engineering Guidelines

Because the AI sees the full context each time, your prompts should:

1. **Explicitly restate the patient context**  
   ```
   Current patient: {age} months, {weight}kg, {triage} priority.
   Findings: {list of positive signs}.
   ```

2. **Define the task clearly**  
   ```
   Task: Explain why this child is classified as YELLOW priority under WHO IMCI.
   ```

3. **Instruct the AI to ignore prior turns**  
   ```
   Use only the data above. Do not assume any previous conversation.
   ```

4. **Keep the output concise and actionable**  
   Nurses need quick, trustworthy advice – not essays.

---

### 5. Session Termination & Cleanup

When a session ends (patient discharged):
- **Client side:** `clearNavigationState()` already purges the navigation‑level cache.
- **AI side:** No action needed – we never stored anything on the AI server.

If we later add a server‑side cache (e.g., to avoid recomputing identical requests), we must key it by `sessionId` and **clear it on discharge**.

---

### 6. What We Need From You (Next Steps)

- **Refine the existing prompts** to follow the “full context” principle – especially in `buildTriageAIPrompt()` and the reactive AI callback.
- **Ensure all AI payloads include the structured patient/assessment blob** (a standardised JSON schema would help).
- **Add streaming support** to the “Ask MedGemma” button – we already have the backend capability; we just need to consume it in the UI.
- **Implement the server‑side proxy** for AI calls (for production security and logging). The endpoint should accept the full context and forward to Ollama/MedGemma.

---

### 7. Summary

| Concept | Our Implementation |
|--------|-------------------|
| Session start | Navigation state + route params |
| Context retention | Client‑side stores (answers, calculated, patient) |
| AI memory | None – we send everything every time |
| Prompt construction | Build from current stores |
| Session end | Clear stores, no server cleanup needed |

This stateless‑client‑stateful approach is already proven in the assessment form. Please follow the same pattern for all new AI features.

