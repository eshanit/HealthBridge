 **starting point**, **what MedGemma can help with**, and a concrete **implementation plan**.

---

## 1. Clarify the Goal: Where Should MedGemma Intervene?

Based on your schemas, there are several natural moments where AI guidance would be valuable:

| Moment | What MedGemma could do |
|--------|------------------------|
| After danger signs are checked (especially if any are `true`) | Explain why this is a **red flag**, suggest immediate actions, and emphasize urgency. |
| During vital signs entry | Interpret respiratory rate vs. age thresholds, flag abnormal values, remind of IMCI cutoffs. |
| Before triage section | Provide a **preliminary classification** and reasoning, then compare with the calculated one. |
| After triage is calculated | Explain the classification in plain language, list recommended actions, answer “why not red?”. |
| When selecting treatment actions | Suggest antibiotic dosages (by weight), verify consistency with triage priority, recommend follow‑up. |
| On any field with `clinicalNote` | Pop‑up definitions, clinical significance, or teaching points. |
| At the end of the session | Generate a **clinical narrative summary** for the record. |

**Starting point:** Pick **one** high‑impact moment (e.g., after the danger signs section or before the triage section) and build a prototype around that.

---

## 2. What Analysis & Help Can MedGemma Provide?

With a properly constructed prompt, MedGemma can deliver:

- **Reasoning transparency** – “Why was the child classified as Yellow?”  
- **Missing data detection** – “You haven’t recorded respiratory rate – it’s required to rule out fast breathing.”  
- **Contradiction checks** – “You selected ‘Cyanosis’ but triage priority is Yellow. Cyanosis typically mandates Red priority.”  
- **Treatment personalisation** – Based on weight and classification, suggest exact antibiotic doses.  
- **Caregiver advice** – Generate simple, empathetic instructions for home care (e.g., “Give paracetamol for fever every 6 hours if needed”).  
- **Referral justifications** – “This child meets WHO criteria for urgent referral because…”  
- **Educational snippets** – “Stridor in a calm child is a sign of upper airway obstruction – immediate action required.”  
- **Clinical narrative** – A paragraph summarising findings, classification, and plan (ready to paste into the electronic health record).

All of these are **generated in real time**, tailored to the exact answers the nurse has entered.

---

## 3. Implementation Blueprint

### A. Build a “MedGemma Service”  
Create a server‑side endpoint (or use edge functions) that accepts:

```json
{
  "schema": { … },           // the assessment or treatment schema (or just the relevant parts)
  "currentValues": { … },    // all form field values up to this point
  "patientContext": { … },   // age, weight, existing conditions
  "promptType": "classification_explanation"  // which type of advice you want
}
```

### B. Craft a High‑Quality Prompt  
The schema already contains `clinicalNote` and `triageLogic` – you can feed these directly to the LLM to ground its answers. Example prompt for **explaining a triage outcome**:

```
You are a senior paediatric nurse following WHO IMCI guidelines.
A nurse has just completed a paediatric respiratory assessment.

Assessment schema (only relevant fields):
{insert condensed schema with field labels, clinicalNotes, triageLogic}

The nurse entered these values:
{insert current form values}

The system calculated triage priority as {calculatedPriority} with actions {calculatedActions}.

Please:
1. Explain why the child received this priority level, referencing the specific positive findings.
2. If there is any inconsistency between the entered data and the calculated priority, point it out.
3. Suggest one or two immediate next steps for the nurse.
4. Keep the tone supportive, factual, and concise (max 150 words).
```

**Tune temperature** to 0.2‑0.3 for consistent, guideline‑aligned output.

### C. Stream the Response to the UI  
Use streaming (e.g., Server‑Sent Events) to show the advice as it’s generated – this improves perceived performance. Display it in a dedicated “Clinical Guidance” card styled like your dashboard cards (gray‑800, border, subtle icon).

### D. Decide **When** to Trigger the Call  
- **Auto‑trigger**: After a section is completed (e.g., after leaving the Danger Signs section) or after a field that triggers a rule (e.g., `cyanosis`).  
- **Manual trigger**: A small “Get Advice” button next to each section or at the top of the page.

**For the first prototype**, I recommend a **manual “Ask MedGemma” button** on the triage section – it’s low‑risk and lets you iterate on the prompt.

---

## 4. Example of What MedGemma Can Return

**Input:**  
- `unable_to_drink`: true  
- `cyanosis`: false  
- `fast_breathing`: true (age 30 months, resp_rate = 48)  
- Triage: Yellow – Pneumonia  

**MedGemma output:**

> **Why Yellow Priority?**  
> This child has fast breathing (48 breaths/min) but **no** general danger signs or cyanosis. According to IMCI, fast breathing alone classifies as **pneumonia** – not severe disease – hence Yellow priority.  
>   
> **Action**  
> - Prescribe oral antibiotics (amoxicillin) and counsel the caregiver on giving the full course.  
> - Advise to return in 2 days if not improving.  
>   
> *Note:* The respiratory rate is just above the threshold (≥40 for 12‑59 months). Ensure the count was done for a full minute.

---

## 5. Important Considerations

- **Latency & Cost** – Calls to MedGemma take 1‑3 seconds. Cache advice for identical situations. Use streaming to hide latency.  
- **Accuracy** – Always allow the nurse to override or dismiss AI advice. Include a disclaimer that the AI is a **supplement**, not a replacement for clinical judgment.  
- **Schema as Grounding** – You already have explicit rules (`triageLogic`, `calculations`). Use the LLM **on top** of these rules to explain, not to replace them.  
- **Retrieval Augmentation** – If you need to reference WHO documents, consider embedding them and performing RAG. But your schema already contains most of the needed knowledge.  
- **Fine‑tuning** – If MedGemma allows custom fine‑tuning, a small dataset of Q&A pairs (based on your schema) would make it even more precise.

---

## 6. Starting Point – Your Next Steps

1. **Write a single prompt** for one scenario (e.g., explaining the final triage).  
2. **Test it manually** using MedGemma’s playground or API with some mock form data.  
3. **Integrate the API call** in your front‑end when the user clicks “Explain this classification”.  
4. **Display the result** in a non‑intrusive, styled card.  
5. **Iterate** – add more trigger points, refine prompts, and expand to treatment advice.

This approach gives you immediate, tangible value and lets you gradually build a powerful AI assistant that truly helps nurses at the point of care.

