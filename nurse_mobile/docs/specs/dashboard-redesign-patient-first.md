Here is a **comprehensive, itemised, step-by-step redesign spec** you can give directly to Kilocode.

You can paste this into a file named:

> `docs/specs/dashboard-redesign-patient-first.md`

---

# Dashboard Redesign — Patient-First, Session-Centric Flow

## Purpose

Redesign the dashboard so that **no clinical workflow can begin without first identifying the patient** using a **short CPT (Clinical Patient Token)**.

The dashboard must support **two routes**:

1. **Session Route (team-based)**
2. **Direct Route (single nurse, return patients)**

The dashboard must:

* Prevent duplicate registration
* Support return patients
* Allow manual CPT entry
* Enforce: **Patient → Session → Forms**

---

## Core Principles

1. **Patient identity always comes first**
2. **Sessions are the clinical spine**
3. **No form opens unless a session is linked to a CPT**
4. **CPT must be short and manually typable**
5. **Registration only happens once**

---

## CPT (Clinical Patient Token)

### Format

* 8 characters
* Uppercase letters + numbers
* Ex: `K9F2Q7M3`
* Generated locally
* Stored on patient physical card
* Can be manually entered

### Required fields

```ts
patient = {
  cpt: string,
  externalPatientId?: string,
  name?: string,
  dob?: string,
  gender?: string,
  createdAt: string,
  lastVisit: string
}
```

---

## Dashboard Structure (New)

### Top Actions (Primary)

| Action            | Purpose                    |
| ----------------- | -------------------------- |
| New Patient       | Create CPT + start session |
| Returning Patient | Enter CPT                  |
| Open Sessions     | Team workflow              |
| Sync Now          | Data sync                  |

---

## Step-by-Step Redesign Tasks

### 1. Replace “New Assessment” button

**Current:**

```ts
navigateTo('/assessment/new')
```

**Replace with:**

```ts
navigateTo('/patient/new')
```

Label:

> **New Patient**
> Create CPT & start visit

---

### 2. Add “Returning Patient” entry

Add new button:

```ts
navigateTo('/patient/lookup')
```

Label:

> **Returning Patient**
> Enter CPT

---

### 3. Patient Lookup Page (`/patient/lookup`)

#### UI

* Input box (uppercase auto)
* Placeholder: `Enter CPT (e.g. K9F2Q7M3)`
* Button: **Find Patient**

#### Logic

```ts
patient = findByCpt(cpt)

if (!patient) {
  show("Patient not found")
} else {
  navigateTo(`/patient/${cpt}`)
}
```

---

### 4. Patient Profile Page (`/patient/[cpt]`)

Shows:

* CPT
* Name (if known)
* Last visit
* Active sessions

Buttons:

* **Start New Session**
* **Open Active Session**

---

### 5. Session Creation

When starting a session:

```ts
createSession({
  patientCpt: cpt,
  stage: "registration"
})
```

Navigate:

```ts
/sessions/{sessionId}
```

---

### 6. Enforce CPT Gate

All form routes must check:

```ts
if (!session.patientCpt) {
  redirect('/patient/lookup')
}
```

---

### 7. Update Dashboard Quick Actions

| Old            | New               |
| -------------- | ----------------- |
| New Assessment | New Patient       |
| (none)         | Returning Patient |
| Open Sessions  | Keep              |
| Sync           | Keep              |

---

### 8. Open Sessions View

Each row must show:

* CPT
* Patient Name (if known)
* Stage
* Priority
* Assigned provider

---

### 9. Registration Form Changes

Registration must:

* Attach to existing CPT
* Never create new patient
* Only update patient fields

---

### 10. Return Patient Flow

```text
Dashboard
 → Returning Patient
 → Enter CPT
 → Patient Profile
 → Start New Session
 → Registration (pre-filled)
 → Assessment
```

---

### 11. Security Rules

| Rule          | Enforcement       |
| ------------- | ----------------- |
| No CPT        | Block workflow    |
| Duplicate CPT | Reject            |
| Offline CPT   | Allow local cache |
| Manual entry  | Always enabled    |

---

### 12. States to Add

```ts
dashboardMode:
  | "IDLE"
  | "PATIENT_SELECT"
  | "SESSION_ACTIVE"
  | "BLOCKED_NO_CPT"
```

---

### 13. Visual Changes (UI Labels)

| Old             | New             |
| --------------- | --------------- |
| New Assessment  | New Patient     |
| Resume Draft    | Resume Session  |
| Records         | Patient Records |
| Recent Activity | Recent Sessions |

---

## Final Flow Summary

```text
Dashboard
 ├─ New Patient
 │   └─ Create CPT → Start Session
 ├─ Returning Patient
 │   └─ Enter CPT → Load Patient → Start Session
 ├─ Open Sessions
 │   └─ Continue team workflow
```

---

## Success Criteria

* No patient can be re-registered
* No form opens without CPT
* CPT is manually typable
* Sessions always link to CPT
* Returning patients skip registration

---
