

It is written so Kilocode:

* Understands *why* this exists
* Knows *exactly what to build*
* Keeps IDs short for manual entry
* Supports offline + multi-nurse workflows
* Avoids re-registration

---

# 📘 clinical-patient-identity.md

**Unified Patient Identity & Return Visit System**

## 1. Purpose

HealthBridge is **not** the hospital EMR.
It is a **clinical workflow assistant** that helps nurses follow WHO IMCI protocols with AI, structured forms, and decision support.

Because of this:

* We **must not** depend on hospital patient numbers.
* We **must** support:

  * Return patients
  * Offline clinics
  * Multiple nurses
  * No re-registration
  * Manual lookup when QR is unavailable

We therefore introduce a **Clinical Patient Token (CPT)**.

---

## 2. Clinical Patient Token (CPT)

### 2.1 Requirements

| Requirement     | Reason                        |
| --------------- | ----------------------------- |
| Short           | Nurses must type it manually  |
| Human readable  | Avoid confusion               |
| Offline safe    | Generated locally             |
| Non-identifying | No PHI in ID                  |
| Scannable       | Can be printed as QR          |
| Permanent       | Follows patient across visits |

### 2.2 Format

```
CP-7F3A-K92Q
```

* Prefix: `CP`
* 2 blocks of 4 characters
* No confusing characters: I, O, 0, 1
* Total length: 11 characters

---

## 3. ID Generator

### File: `services/patientId.ts`

```ts
export function generateCPT(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const block = () =>
    Array.from({ length: 4 }, () =>
      alphabet[Math.floor(Math.random() * alphabet.length)]
    ).join('');

  return `CP-${block()}-${block()}`;
}
```

---

## 4. Patient Data Model

### File: `types/patient.ts`

```ts
export interface ClinicalPatient {
  id: string; // CPT
  externalPatientId?: string; // hospital MRN if available
  name?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  createdAt: string;
  lastSeenAt?: string;
}
```

---

## 5. Storage Layer

### File: `services/patientEngine.ts`

```ts
import { generateCPT } from './patientId';
import type { ClinicalPatient } from '~/types/patient';
import { securePut, secureGet } from './secureDb';
import { useSecurityStore } from '~/stores/security';

export async function createPatient(data: Partial<ClinicalPatient>) {
  const security = useSecurityStore();
  if (!security.encryptionKey) throw new Error('DB locked');

  const patient: ClinicalPatient = {
    id: generateCPT(),
    createdAt: new Date().toISOString(),
    ...data
  };

  await securePut(
    { _id: `patient:${patient.id}`, type: 'clinicalPatient', ...patient },
    security.encryptionKey
  );

  return patient;
}

export async function getPatient(cpt: string) {
  const security = useSecurityStore();
  if (!security.encryptionKey) throw new Error('DB locked');

  return await secureGet(`patient:${cpt}`, security.encryptionKey);
}
```

---

## 6. Session Linking

### Add to ClinicalSession

```ts
patientCpt?: string;
```

---

## 7. Entry Paths

### 7.1 New Patient

```
Start Session
→ Registration Form
→ createPatient()
→ Assign CPT
→ Show patient card
→ Continue to assessment
```

```ts
const patient = await createPatient(formData.value);
await updateSession(session.id, { patientCpt: patient.id });
```

---

### 7.2 Returning Patient

UI:

```
[ New Patient ]
[ Returning Patient ]
```

Flow:

```
Enter CPT (manual or QR)
→ getPatient(cpt)
→ Create new session
→ Attach patientCpt
→ Skip registration
→ Assessment
```

---

## 8. Auto-Skip Registration

```ts
if (session.patientCpt) {
  session.stage = 'assessment';
}
```

---

## 9. Patient Card Screen

```
-------------------------
Name: Sarah M
CPT: CP-7F3A-K92Q
QR: ▢▢▢
-------------------------
"Please bring this card for your next visit"
```

This is the **only permanent identifier** the patient keeps.

---

## 10. Why This Works

| Problem         | Solution             |
| --------------- | -------------------- |
| Re-registration | CPT lookup           |
| Offline clinics | Local generation     |
| Multiple nurses | Session-based        |
| No EMR access   | External ID optional |
| Manual search   | Short CPT            |

---

## 11. Architecture Separation

| Layer   | Responsibility          |
| ------- | ----------------------- |
| Patient | Identity only           |
| Session | Workflow lifecycle      |
| Form    | WHO + AI clinical logic |

---

## 12. Future (Not Required Now)

* QR scanning
* Patient timeline
* Merge duplicate CPTs
* Hospital system linking

---
Excellent concerns — you’re thinking like a system designer now.
Let’s tighten the spec so Kilocode (and future devs) have **zero ambiguity**.

Below are **drop-in additions** you can append to the markdown.

---

# 🔧 Addendum: Patient Lookup, External IDs, and UI

---

## 13. Manual CPT Entry (Primary Path)

QR is **not** future — it’s just optional hardware.
**Manual CPT entry is the primary fallback and must always work.**

### 13.1 CPT Entry Rules

| Rule                 | Reason               |
| -------------------- | -------------------- |
| Auto-uppercase       | Avoid mismatches     |
| Ignore dashes/spaces | Allow CP7F3AK92Q     |
| Validate prefix `CP` | Prevent random input |
| Block invalid chars  | No I, O, 0, 1        |
| Live formatting      | Improves accuracy    |

---

### 13.2 Normalization Function

```ts
export function normalizeCPT(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^CP/, 'CP-')
    .replace(/^CP-?([A-Z0-9]{4})([A-Z0-9]{4})$/, 'CP-$1-$2');
}
```

---

### 13.3 Validation

```ts
export function isValidCPT(cpt: string): boolean {
  return /^CP-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(cpt);
}
```

---

## 14. External Patient ID (Optional Link)

Your system **does not depend** on hospital IDs — but may store them.

### 14.1 Format

```ts
externalPatientId?: {
  system: 'hospital' | 'national' | 'clinic';
  value: string;
};
```

### 14.2 Examples

| System          | Example     |
| --------------- | ----------- |
| Hospital MRN    | HSP-992381  |
| National ID     | ZW-12-83922 |
| Clinic Register | CLN-0239    |

---

## 15. Patient Lookup UI

### 15.1 Entry Screen

```
----------------------------------
Find Patient
----------------------------------
[ Enter CPT or Scan QR ]

CPT:  [ CP-____-____ ]

[ FIND PATIENT ]

──────────────
or
──────────────

[ Register New Patient ]
----------------------------------
```

---

### 15.2 Result States

#### Found

```
✔ Patient Found

Name: Sarah M
Last visit: 3 days ago
CPT: CP-7F3A-K92Q

[ Continue ]
```

#### Not Found

```
✖ No patient found

[ Re-enter ]
[ Register New Patient ]
```

---

## 16. QR Scanning (Not Future — Optional)

Mark it as:

> **Optional hardware path**
> The system must always support manual CPT entry.

QR simply fills the CPT field and triggers lookup.

---

## 17. Nurse Workflow Summary

| Scenario            | Flow                                   |
| ------------------- | -------------------------------------- |
| First visit         | Register → get CPT → card              |
| Return              | Enter CPT → load patient → new session |
| No card             | Search by external ID or name          |
| Hospital ID present | Store but do not depend                |

---


**End of Spec**


