Perfect. This is where HealthBridge starts to *feel* like a real hospital system.

Below is a **production-grade Doctor (GP) Dashboard UI design** you can hand directly to KiloCode or a UI/UX designer. It is workflow-driven, not widget-driven.

---

# HealthBridge – GP Doctor Dashboard UI Design

**Phase 1 Clinical Web App (Laravel)**

## 1. Design Principles

1. **Workflow-first, not menu-first**
   The GP’s day revolves around *patients*, not pages.

2. **Signal over noise**
   Only show data that changes clinical decisions.

3. **Explain before advise**
   AI outputs must always be paired with “why”.

4. **One patient, one truth**
   Every screen is scoped to a single encounter.

5. **Fail-safe by default**
   Any AI suggestion is clearly marked “Support only”.

---

## 2. Global Layout

```
┌──────────────────────────────────────────────┐
│ HealthBridge GP Dashboard                    │
│ [Logo]   Referrals   Patients   History  AI │
│                                          [User]│
├──────────────────────────────────────────────┤
│ LEFT PANEL        │ MAIN WORK AREA           │
│ (Queues)          │ (Patient Context)        │
├──────────────────────────────────────────────┤
│ ACTIVITY LOG / AI AUDIT STRIP                 │
└──────────────────────────────────────────────┘
```

---

## 3. Left Panel – Clinical Queues

### A. Referred Patients

```
🔴 High Urgency
  • Moyo T. (2y) – Severe distress
  • Chipo R. (4y) – Cyanosis

🟡 Normal
  • Tariro K. (3y) – Pneumonia
```

### B. New Walk-Ins

```
➕ New Patients
  • Unregistered – waiting
```

Each row shows:

* Name / temp ID
* Age
* Triage color
* Referral source
* Time waiting

---

## 4. Main Work Area – Patient Workspace

### Header

```
Patient: Chipo R. | 4y | Female
Status: IN_GP_REVIEW   Referred by: Nurse Jane
Triage: 🔴 RED – Severe respiratory distress
```

Buttons:

* Accept Referral
* Start Consultation
* Discharge
* Refer Again

---

## 5. Tabbed Clinical View

### Tab 1: Summary

Shows:

* Danger signs
* Vitals
* Triage logic
* AI explainability

```
Why RED?
• Chest indrawing
• Stridor
• Cyanosis

AI Explanation:
“This child meets IMCI criteria for severe pneumonia…”
```

---

### Tab 2: Assessment

Structured fields:

* Symptoms
* Exam findings
* Notes

---

### Tab 3: Diagnostics

* Lab orders
* X-ray uploads
* Specialist notes

---

### Tab 4: Treatment Plan

* Medications
* Fluids
* Oxygen
* Admission vs referral

---

### Tab 5: AI Guidance

**Explainability Card**

```
Clinical Guidance (Support Only)
──────────────────────────────
Why this classification?
What data is missing?
What contradictions exist?
Suggested next steps
[ View AI Audit ]
```

---

## 6. AI Explainability Card (Persistent Right Panel)

```
┌─────────────────────────────┐
│ 🤖 Clinical Support         │
│ Model: MedGemma 1.5         │
│ Use Case: Explain Triage    │
├─────────────────────────────┤
│ WHY                         │
│ “Fast breathing + cyanosis…”│
├─────────────────────────────┤
│ MISSING                     │
│ • O2 saturation             │
├─────────────────────────────┤
│ RISKS                       │
│ • Possible hypoxia          │
├─────────────────────────────┤
│ NEXT                        │
│ • Start oxygen              │
│ • Refer urgently            │
└─────────────────────────────┘
```

---

## 7. Footer: Clinical Audit Strip

```
Last AI call: 14:32 | explain_triage | Dr Moyo
State change: TRIAGED → IN_GP_REVIEW
Override logged ✔
```

---

## 8. Color Semantics

| Color     | Meaning         |
| --------- | --------------- |
| 🔴 Red    | Emergency       |
| 🟡 Yellow | Urgent          |
| 🟢 Green  | Routine         |
| Gray      | Archived/Closed |

---

## 9. Navigation Rules

* **Click patient → entire workspace changes**
* **No popups for critical flows**
* **AI never blocks clinical actions**

---

## 10. Phase 1 MVP Screens

1. GP Dashboard
2. Referral Queue
3. Patient Workspace
4. AI Explainability Panel
5. Audit Viewer

---

