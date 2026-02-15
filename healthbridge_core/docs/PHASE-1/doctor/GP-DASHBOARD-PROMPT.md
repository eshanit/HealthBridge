

# 📐 HealthBridge GP Dashboard

## KiloCode UI Build Instructions (Phase 1)

**Project:** HealthBridge
**Module:** `healthbridge_core` (Laravel)
**User Role:** General Practitioner (GP)
**Purpose:** Enable doctors to manage referred and new patients, review triage, receive AI explainability, and complete consultations.

---

## 1. Layout Scaffold

Create a **desktop-first dashboard layout** using a 3-region grid:

```
HEADER (fixed)
BODY (flex)
FOOTER (fixed)
```

### Header

* Left: HealthBridge logo
* Center: “GP Dashboard”
* Right: Logged-in doctor name + dropdown

### Body

Split into two panels:

```
LEFT PANEL (25%) | MAIN WORKSPACE (75%)
```

### Footer

* Real-time audit log strip

---

## 2. Left Panel – Patient Queue

Create a **scrollable queue list** grouped into:

1. 🔴 High Priority Referrals
2. 🟡 Normal Referrals
3. ➕ New Walk-ins

Each patient row:

* Name
* Age
* Triage priority badge
* Referral source
* Waiting time

**On click:**
Load patient into Main Workspace.

---

## 3. Main Workspace – Patient Header

At top of workspace, render:

* Patient name, age, gender
* Status badge (e.g., IN_GP_REVIEW)
* Referral source
* Triage priority with color
* Action buttons:

  * Accept
  * Start Consultation
  * Discharge
  * Refer Again

---

## 4. Clinical Tabs

Below header, create tab navigation:

```
Summary | Assessment | Diagnostics | Treatment | AI Guidance
```

Switch content without page reload.

---

## 5. Summary Tab UI

Display:

### Triage Summary Card

* Danger signs list
* Vitals
* Classification
* Explanation text

Use card layout with section headers.

---

## 6. AI Guidance Tab – Explainability Card

Create a bordered card:

### Header

* 🤖 Clinical Guidance
* Model: MedGemma
* Task: explain_triage

### Body Sections:

* WHY
* MISSING
* RISKS
* NEXT

Each section as bullet list.

### Footer

* “View AI Audit Log” button

---

## 7. Footer – Audit Strip

Persistent bar showing:

* Last AI call time
* Task name
* Doctor
* Status changes
* Override flag

---

## 8. UI Interaction Rules

| Action        | UI Behavior          |
| ------------- | -------------------- |
| Click patient | Load workspace       |
| Accept        | Change status        |
| Ask AI        | Load AI Guidance tab |
| Override      | Log event            |
| Discharge     | Archive + sync       |

---

## 9. Phase 1 Scope

Implement only:

* GP queue
* Patient workspace
* Summary tab
* AI Guidance tab
* Audit footer

Do **not** add diagnostics, imaging, or chat yet.

