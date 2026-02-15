
# 🔹 Kilocode Prompt: Clinical Explainability Engine (Phase 4)

## Context

We already have a working triage engine that outputs:

```ts
assessmentInstance.calculated = {
  triagePriority: "red" | "yellow" | "green",
  matchedTriageRule: {
    id: string,
    priority: string,
    actions: string[]
  },
  ruleMatches: Array<{
    ruleId: string,
    condition: string,
    matched: boolean,
    value?: any
  }>,
  scores?: Record<string, any>
}
```

We **must not change** this logic.

We now need an **explainability overlay** that:

* Reads from `calculated`
* Produces clinician-readable reasoning
* Maps directly to WHO IMCI logic
* Never invents clinical data

---

## Your Task

### 1. Create Explainability Engine

Create file:

```
app/services/explainabilityEngine.ts
```

Export:

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

And function:

```ts
export function buildExplainabilityModel(
  assessment: ClinicalFormInstance
): ExplainabilityModel | null
```

This must:

1. Read `assessment.calculated`
2. Fail gracefully if missing
3. Use `matchedTriageRule.id`
4. Use only ruleMatches where `matched === true`
5. Map actions from rule → labels → justifications

---

### 2. Add Static Knowledge Maps

Create:

```
app/data/explainabilityMaps.ts
```

Include:

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

### 3. Narrative Generator

Inside explainabilityEngine.ts add:

```ts
function generateNarrative(calc) {
  return `Patient classified as ${calc.triagePriority.toUpperCase()} because rule "${calc.matchedTriageRule.id}" was triggered based on clinical findings.`
}
```

---

### 4. UI Hook

Expose this model so UI can render:

* “Why this triage?”
* “Why these actions?”

Add console warning if any data missing.

---

### 5. Safety Constraints

Add guardrails:

* ❌ Never generate new symptoms
* ❌ Never override triage
* ❌ Never infer beyond calculated
* ✅ Always cite ruleId

