Excellent — this is the **right next question**.
You already have a strong triage engine; the explainability model should **sit on top of it**, not replace it.

Below is a **clean mapping** from your *existing triage schema → clinical explainability layer*.

---

# 1. Your Current Triage Output (Source of Truth)

From your system you already produce:

```ts
assessmentInstance.calculated = {
  triagePriority: "red" | "yellow" | "green",
  matchedTriageRule: {
    id: string,
    priority: "red" | "yellow" | "green",
    actions: string[]
  },
  ruleMatches: [
    {
      ruleId: string,
      condition: string,
      matched: boolean,
      value?: any
    }
  ],
  scores?: {
    respiratoryRate?: number
    chestIndrawing?: boolean
    oxygenSat?: number
  }
}
```

This is perfect raw material.

---

# 2. Clinical Explainability Model (Overlay Layer)

We do NOT change triage logic.
We **derive** explainability from `calculated`.

```ts
export interface ExplainabilityModel {
  priority: "red" | "yellow" | "green"

  reasoning: {
    primaryRule: {
      id: string
      description: string
      source: "WHO_IMCI" | "LocalProtocol"
    }

    triggers: Array<{
      symptom: string
      observedValue: string
      threshold: string
      explanation: string
    }>

    clinicalNarrative: string
  }

  recommendedActions: Array<{
    code: string
    label: string
    justification: string
  }>

  safetyNotes: string[]
}
```

---

# 3. Mapping Logic (Triage → Explainability)

Create:

```
app/services/explainabilityEngine.ts
```

```ts
import type { ClinicalFormInstance } from '~/types/clinical-form'
import { ACTION_LABELS, RULE_EXPLANATIONS } from '~/data/explainabilityMaps'

export function buildExplainabilityModel(
  assessment: ClinicalFormInstance
) {
  const calc = assessment.calculated
  if (!calc?.matchedTriageRule) return null

  const rule = calc.matchedTriageRule

  return {
    priority: calc.triagePriority,

    reasoning: {
      primaryRule: {
        id: rule.id,
        description: RULE_EXPLANATIONS[rule.id],
        source: "WHO_IMCI"
      },

      triggers: calc.ruleMatches
        ?.filter(r => r.matched)
        .map(r => ({
          symptom: r.condition,
          observedValue: String(r.value ?? "present"),
          threshold: "IMCI danger threshold",
          explanation: RULE_EXPLANATIONS[r.ruleId]
        })) ?? [],

      clinicalNarrative: generateNarrative(calc)
    },

    recommendedActions: rule.actions.map(code => ({
      code,
      label: ACTION_LABELS[code],
      justification: ACTION_LABELS[code] + " is recommended for " + calc.triagePriority
    })),

    safetyNotes: [
      "This guidance does not replace clinical judgment",
      "Escalate if patient condition worsens"
    ]
  }
}
```

---

# 4. Explainability Maps (Static Clinical Knowledge)

```
app/data/explainabilityMaps.ts
```

```ts
export const RULE_EXPLANATIONS = {
  red_danger: "Presence of general danger signs",
  red_distress: "Severe respiratory distress detected",
  yellow_pneumonia: "Signs consistent with pneumonia",
  green_no_pneumonia: "No clinical danger signs detected"
}

export const ACTION_LABELS = {
  urgent_referral: "Refer urgently to hospital",
  oxygen_if_available: "Provide oxygen if available",
  first_dose_antibiotics: "Give first dose of antibiotics",
  airway_management: "Ensure airway is clear",
  keep_warm: "Keep child warm",
  oral_antibiotics: "Prescribe oral antibiotics",
  home_care_advice: "Give home care advice",
  follow_up_2_days: "Follow up in 2 days",
  home_care: "Home care only",
  return_if_worse: "Return if symptoms worsen",
  follow_up_5_days: "Follow up in 5 days"
}
```

---

# 5. Where It Shows in UI

| Page              | Explainability               |
| ----------------- | ---------------------------- |
| Assessment Result | "Why this triage?" panel     |
| Treatment Form    | "Reason for actions" tooltip |
| Session Timeline  | Clinical narrative snapshot  |
| Audit Log         | Reasoning + rule IDs         |

---

# 6. Safety Rule (Phase 4 Compliance)

Add to AI safety rules:

> The explainability layer must:
>
> * Never invent data
> * Only reference calculated triage fields
> * Cite rule IDs and sources
> * Display uncertainty when data missing

---
