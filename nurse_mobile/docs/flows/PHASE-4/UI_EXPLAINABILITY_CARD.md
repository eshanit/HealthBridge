Perfect — this is where your system becomes **clinically trustworthy** instead of just “correct”.

Below is a **production UI design spec** for your Explainability Card that maps 1:1 to the explainability model we just defined.

This is written so you can give it to **Kilocode or a frontend dev**.

---

# 🧠 Clinical Explainability Card — UI Design Spec

## Purpose

Provide nurses and clinicians with:

* **Why** the patient was classified this way
* **Which findings triggered it**
* **What actions are recommended and why**
* **Safety transparency** (WHO traceability, no AI hallucination)

This card must appear on:

* Session page
* Triage screen
* Treatment form header

---

## 1. Component

```
<ExplainabilityCard :model="explainabilityModel" />
```

Source:
`buildExplainabilityModel(assessmentInstance)`

---

## 2. Layout (Vertical Card)

```
┌──────────────────────────────────────────────┐
│ TRIAGE: RED  (WHO IMCI)                       │
│ Reason: Presence of general danger signs     │
├──────────────────────────────────────────────┤
│ 🔎 Why this classification?                  │
│ • Unable to drink → danger sign              │
│ • Cyanosis → severe hypoxemia                │
│                                              │
│ Narrative:                                   │
│ “Patient classified as RED because rule      │
│  red_danger was triggered based on findings” │
├──────────────────────────────────────────────┤
│ 🩺 Recommended Actions                       │
│ ▸ Refer urgently to hospital                 │
│   Reason: Required for severe illness        │
│ ▸ Provide oxygen if available                │
│   Reason: Low oxygen saturation detected     │
│ ▸ Give first dose of antibiotics              │
├──────────────────────────────────────────────┤
│ ⚠️ Safety & Source                            │
│ WHO IMCI 2014                                 │
│ This recommendation is rule-based, not AI.  │
└──────────────────────────────────────────────┘
```

---

## 3. Visual Rules

| Priority | Header Color | Icon |
| -------- | ------------ | ---- |
| red      | #E53935      | 🚨   |
| yellow   | #FBC02D      | ⚠️   |
| green    | #43A047      | ✅    |

Card border = same color.

---

## 4. Data Binding

### Header

```ts
model.priority
model.reasoning.primaryRule.description
model.reasoning.primaryRule.source
```

---

### Trigger List

Loop:

```ts
model.reasoning.triggers.map(t => (
  `${t.symptom} → ${t.explanation}`
))
```

---

### Narrative

```ts
model.reasoning.clinicalNarrative
```

---

### Recommended Actions

```ts
model.recommendedActions.map(a => (
  title: a.label
  subtitle: a.justification
))
```

---

### Safety Footer

```ts
model.safetyNotes.join('\n')
```

Default safety notes:

* “Derived from WHO IMCI rules”
* “No AI inference used”
* “Actions must be clinically confirmed”

---

## 5. UX Behavior

* Collapsible (default open for RED/YELLOW)
* Tooltip on ruleId
* Copy-to-clipboard summary
* Print-safe layout
* Read-only (cannot edit)

---

## 6. Error States

| Condition       | UI                                      |
| --------------- | --------------------------------------- |
| No model        | Grey card: “Explainability unavailable” |
| Missing rule    | Yellow banner                           |
| Missing actions | Red banner                              |

---

## 7. Placement

| Screen              | Location      |
| ------------------- | ------------- |
| Session view        | Right column  |
| Assessment complete | Above triage  |
| Treatment form      | Sticky header |

---

This makes your system **auditable, safe, and WHO defensible**.

