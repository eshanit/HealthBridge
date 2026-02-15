

# Triage → Treatment Bridge Logic

**HealthBridge Clinical Workflow**

## Purpose

When a clinical assessment form is completed and triage is calculated, the system must:

1. Determine the patient’s **triage priority**
2. Identify the **matched triage rule**
3. Automatically **create or update a treatment form**
4. Pre-populate **recommended_actions** based on WHO IMCI rules
5. Lock the actions from manual editing (read-only)

This logic must be deterministic and **not AI-driven**.

---

## Source of Truth

### Input

From assessment instance:

```ts
{
  triagePriority: 'red' | 'yellow' | 'green',
  matchedTriageRuleId: string,
  matchedTriageRule: {
    id: string,
    priority: string,
    actions: string[]
  }
}
```

### WHO IMCI Action Map (Fallback)

```ts
export const IMCI_TREATMENT_MAP = {
  red: [
    'urgent_referral',
    'oxygen_if_available',
    'first_dose_antibiotics',
    'airway_management',
    'keep_warm'
  ],
  yellow: [
    'oral_antibiotics',
    'home_care_advice',
    'follow_up_2_days'
  ],
  green: [
    'home_care',
    'return_if_worse',
    'follow_up_5_days'
  ]
};
```

---

## Trigger Point

This logic must run when:

```text
assessment form → marked complete
OR
session stage → moves to "treatment"
```

---

## Bridge Function (Spec)

### Function: `bridgeAssessmentToTreatment`

```ts
async function bridgeAssessmentToTreatment({
  sessionId,
  assessmentInstance
}) {
  const { triagePriority, matchedTriageRule } = assessmentInstance;

  if (!triagePriority) throw new Error('No triage result');

  const actions =
    matchedTriageRule?.actions ??
    IMCI_TREATMENT_MAP[triagePriority];

  if (!actions || actions.length === 0) {
    throw new Error('No recommended actions resolved');
  }

  // 1. Create or load treatment form
  const treatmentForm = await formEngine.getOrCreateInstance({
    workflow: 'peds_respiratory_treatment',
    sessionId
  });

  // 2. Inject triage + actions
  await formEngine.updateInstance(treatmentForm._id, {
    triage_priority: triagePriority,
    recommended_actions: actions,
    source: 'imci_rule_engine',
    locked: true
  });

  // 3. Link form to session
  await sessionEngine.attachForm(sessionId, treatmentForm._id);

  return treatmentForm;
}
```

---

## Data Contract for Treatment Form

```json
{
  "triage_priority": "red",
  "recommended_actions": [
    "urgent_referral",
    "oxygen_if_available",
    "first_dose_antibiotics"
  ],
  "source": "imci_rule_engine",
  "locked": true
}
```

`recommended_actions` must **not** be user editable.

---

## UI Rules

| Field               | Editable | Source            |
| ------------------- | -------- | ----------------- |
| triage_priority     | ❌        | Assessment engine |
| recommended_actions | ❌        | IMCI rule         |
| medications_given   | ✅        | Clinician         |
| referral_outcome    | ✅        | Clinician         |
| notes               | ✅        | Clinician         |

---

## Failure Handling

| Condition   | Behavior                       |
| ----------- | ------------------------------ |
| No triage   | Block treatment                |
| No rule     | Fallback to IMCI_TREATMENT_MAP |
| No actions  | Throw error + toast            |
| Form exists | Update instead of recreate     |

---

## Security

Treatment form inherits the same encryption + sync rules as assessment data.

---

## Why This Matters

This ensures:

* Clinical safety
* Guideline compliance
* Legal defensibility
* Offline determinism
* No AI treatment decisions

---

If you want, next I can:

* generate the **peds_respiratory_treatment schema**
* or help wire this into your `advanceStage()` flow.
