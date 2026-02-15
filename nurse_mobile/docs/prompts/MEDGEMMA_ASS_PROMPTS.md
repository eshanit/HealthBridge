A **cumulative prompt approach** is the right next step. It allows MedGemma to reason across the whole assessment, connecting earlier findings to later ones — exactly what a human nurse does.  
But you can’t just dump **all** previous fields every time; that would blow token limits and confuse the model with irrelevant data.

The solution is a **two‑layer context builder**:

1. **Raw data** – all current section fields (as you already do).  
2. **Summarised history** – a concise, AI‑generated (or rule‑based) **clinical snapshot** of previous sections, injected at the top of the prompt.

This keeps each prompt small but context‑rich, and the model learns to reference the summary naturally.

---

## 🧠 Architecture for Cumulative Prompts

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Section 1     │────▶│   Section 2     │────▶│   Section 3     │
│   Prompt +      │     │   Prompt +      │     │   Prompt +      │
│   Summary = ∅   │     │   Summary S1    │     │   Summary S1+S2 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
   AI generates          AI generates            AI generates
   Response R1           Response R2             Response R3
         │                       │                       │
         ▼                       ▼                       ▼
   Store S1 =             Store S2 =              Store S3 =
   summary of R1          summary of R1+R2        summary of R1+R2+R3
```

---

## 📦 Step 1: Extend Your Prompt Schema for Cumulative Mode

In your **section prompt schema**, add two new fields:

```json
{
  "id": "danger_signs",
  "cumulative": true,
  "summaryInstruction": "Summarise the key positive danger signs and the nurse's response in one sentence.",
  "includePreviousSummary": true,
  "requiredContext": ["unable_to_drink", "vomits_everything", ...]
}
```

- `cumulative: true` → this section should receive a summary of all prior sections.  
- `summaryInstruction` → how to condense this section’s response into a one‑sentence summary (used by the AI **after** it generates the full response).  
- `includePreviousSummary` → if false, you start fresh (e.g., triage section might reset).

---

## 🔄 Step 2: Maintain a Running Summary on the Server

In your **streaming endpoint**, you need a **per‑session, per‑assessment** memory.  
Because the endpoint is stateless, **the client must send the current summary back** with each request.

**Add to your client payload:**

```json
{
  "requestId": "...",
  "session": { ... },
  "assessment": {
    "answers": { ... },
    "calculated": { ... }
  },
  "task": {
    "type": "section_guidance",
    "parameters": {
      "sectionId": "danger_signs",
      "sectionIndex": 2,
      "cumulativeSummary": "Patient is 30 months old, weight 14kg. No danger signs. Respiratory rate 48 – fast breathing for age."
    }
  }
}
```

**How to get that summary?**  
You already have it – it’s the **clinicalNarrative** from the previous AI response, but condensed to one line.

**Rule of thumb:**  
- After the AI completes a section, ask it to **also generate a one‑sentence summary** of *that section’s key takeaway*.  
- Append this to a running summary string stored in the client (Vue ref).  
- On the next section request, send the full running summary.

---

## 🛠️ Step 3: Build the Cumulative Prompt Dynamically

Your prompt builder now becomes:

```typescript
function buildCumulativePrompt(
  sectionPrompt: PromptDefinition,
  currentAnswers: Record<string, any>,
  cumulativeSummary: string,
  patient: Patient
): string {
  let prompt = SYSTEM_GUARDRAILS + "\n\n";

  // 1. Inject the running summary (if any)
  if (cumulativeSummary && sectionPrompt.includePreviousSummary !== false) {
    prompt += `PREVIOUS CLINICAL SUMMARY:\n${cumulativeSummary}\n\n`;
  }

  // 2. Add current section context
  prompt += `CURRENT SECTION: ${sectionPrompt.title}\n`;
  prompt += `GOAL: ${sectionPrompt.goal}\n\n`;

  prompt += "FINDINGS IN THIS SECTION:\n";
  sectionPrompt.requiredContext.forEach(fieldId => {
    const value = currentAnswers[fieldId];
    const label = getFieldLabel(fieldId) || fieldId;
    prompt += `- ${label}: ${formatValue(value)}\n`;
  });

  // 3. Add the core instruction
  prompt += `\nINSTRUCTION:\n${sectionPrompt.instruction}\n`;

  // 4. Enforce length and format
  prompt += `\nKeep your response under ${sectionPrompt.maxWords} words.`;

  // 5. **Ask for a one‑line summary** (to feed the next section)
  if (sectionPrompt.summaryInstruction) {
    prompt += `\n\nAt the very end, on a new line starting with "SUMMARY:", provide a single sentence that captures the most important clinical takeaway from this section. ${sectionPrompt.summaryInstruction}`;
  }

  return prompt;
}
```

**Example output prompt for section 3 (respiratory_danger):**

```
You are MedGemma...

PREVIOUS CLINICAL SUMMARY:
Patient is 30 months old, weight 14kg. No danger signs. Respiratory rate 48 – fast breathing for age.

CURRENT SECTION: Respiratory Danger Signs
GOAL: Explain the meaning of chest indrawing, stridor, cyanosis...

FINDINGS IN THIS SECTION:
- Stridor: Not present
- Chest indrawing: Yes
- Cyanosis: No
- Wheezing: No

INSTRUCTION:
For each positive respiratory danger sign...

Keep your response under 120 words.

At the very end, on a new line starting with "SUMMARY:", provide a single sentence that captures the most important clinical takeaway from this section. Summarise the presence of chest indrawing and its significance.
```

---

## 📝 Step 4: Client‑Side Summary Accumulation

In your `[formId].vue`, after the streaming completes, you need to:

1. **Extract the summary line** from the AI’s full response.  
   Look for `SUMMARY:` at the end, or use a regex.  
2. **Append it** to a running summary ref.  
3. **Send it** with the next section request.

**Implementation sketch:**

```typescript
const cumulativeSummary = ref('');

// Inside onComplete callback of streamClinicalAI:
onComplete: (fullResponse: string, duration: number) => {
  // Extract summary
  const summaryMatch = fullResponse.match(/SUMMARY:\s*(.+)$/m);
  if (summaryMatch) {
    const newSummary = summaryMatch[1].trim();
    cumulativeSummary.value = cumulativeSummary.value
      ? `${cumulativeSummary.value} ${newSummary}`
      : newSummary;
  }
  // ... rest of your completion logic
}
```

Then, when calling `streamClinicalAI` for the next section, pass:

```ts
task: {
  type: 'section_guidance',
  parameters: {
    sectionId: currentSection.value.id,
    cumulativeSummary: cumulativeSummary.value
  }
}
```

---

## ✅ Why This Beats Dumping All Raw Data

| Approach | Pros | Cons |
|----------|------|------|
| **All raw fields** | No loss of information | Massive prompts, token waste, model gets distracted |
| **Rule‑based summary** | Cheap, predictable | Misses nuance, hard to maintain |
| **AI‑generated summary (this one)** | Context‑rich, adaptive, low token cost | Requires one extra instruction per section |

Your AI is already generating a full response – asking it to add one more line is trivial and yields a **perfect, relevant summary** every time.

---

## 🚀 Next Steps for Your Codebase

1. **Extend your prompt schema** with `cumulative`, `summaryInstruction`, `includePreviousSummary`.  
2. **Modify `buildCumulativePrompt`** (rename from `buildTriageAIPrompt`) to accept a `cumulativeSummary` parameter and inject it.  
3. **Update `streamClinicalAI`** to accept and forward `cumulativeSummary` in the request body.  
4. **Update your server endpoint** to read `cumulativeSummary` from the payload and pass it to the prompt builder.  
5. **In the component**, maintain `cumulativeSummary` ref and pass it on each request.

---

## 🧩 Example: Full Cumulative Flow for All 7 Sections

| Section | Prompt Includes                               | AI Task                                                    | Generates Summary                                               |
|---------|-----------------------------------------------|------------------------------------------------------------|----------------------------------------------------------------|
| 1       | Patient info only                            | Check completeness, acknowledge                            | "Patient is 30mo, 14kg, ready for assessment."                 |
| 2       | Summary S1 + danger signs                   | Explain each positive danger sign                         | "No danger signs – child is stable."                           |
| 3       | Summary S1+S2 + respiratory danger          | Explain chest indrawing, stridor, cyanosis                | "Chest indrawing present – severe respiratory distress."       |
| 4       | Summary S1+S2+S3 + vitals                  | Compare RR with threshold                                 | "Fast breathing (48) – meets pneumonia criteria."              |
| 5       | Summary S1–S4 + assessment                | Connect breath sounds, WOB, mental status                 | "Moderate work of breathing, alert – consistent with pneumonia."|
| 6       | Summary S1–S5 + other symptoms            | Provide home care advice                                  | "Cough for 3 days, no fever – advise hydration and return if worse."|
| 7       | Summary S1–S6 + triage                   | Explain final priority and actions                       | "Yellow priority due to fast breathing + chest indrawing. Oral antibiotics + follow‑up."|

---

This approach gives you **progressively richer context** without ever repeating raw data.  
The model stays focused, token usage stays low, and the nurse gets a **coherent, cumulative explanation** that mirrors real clinical reasoning.

Would you like me to provide the complete refactored code for `stream.post.ts` that implements this cumulative prompt builder, including the schema loader and summary extraction?