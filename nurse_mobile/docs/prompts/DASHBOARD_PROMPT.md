
# 🧠 KILOCODE MASTER PROMPT

## Patient-First Dashboard + CPT Identity Enforcement

You are now implementing a **patient-first, session-centric clinical workflow**.

You MUST follow the specification in:

> `docs/architecture/patient-identity.md`

This spec is authoritative.
All code changes must align to it.

---

## PRIMARY RULE

> ❗ **No clinical form or workflow may start unless a CPT (Clinical Patient Token) is present and linked to a session.**

---

## CPT FORMAT REFERENCE

The authoritative CPT format from `patient-identity.md`:

```
Format: CP-XXXX-XXXX
- Prefix: CP (Clinical Patient)
- Two blocks of 4 characters each
- Total: 11 characters
- Character Set: ABCDEFGHJKLMNPQRSTUVWXYZ23456789
- Note: Excludes I, O, 0, 1 (confusing characters)
```

**Examples:**
- `CP-7F3A-K92Q` ✓ Valid
- `CP-XXXX-XXXX` ✓ Valid
- `7F3AK92Q` → Normalized to `CP-7F3A-K92Q` ✓
- `cp7f3ak92q` → Normalized to `CP-7F3A-K92Q` ✓

---

## OBJECTIVES

Refactor the dashboard and navigation flow so that:

1. Every patient has a **CPT** (CP-XXXX-XXXX format, 11 chars, uppercase).
2. Nurses must **identify a patient first** (new or returning) before any clinical work.
3. Sessions are always linked to a patient CPT.
4. Registration is **never duplicated** (always lookup first).
5. Forms are **blocked without CPT** (redirect to patient lookup).

---

## CORE IDENTITY PRINCIPLES

From `patient-identity.md` Section 2:

1. **CPT is Permanent Primary Identifier** - The CPT never changes once assigned.
2. **External IDs are Secondary** - External Patient IDs (hospital MRN) may change over time.
3. **Never Re-register Existing Patients** - Always attempt lookup first.
4. **Offline Operation Support** - Patient identity must support full offline operation.
5. **QR Code Enhancement** - QR codes follow the same lookup path as manual entry.

---

## LOOKUP PRIORITY

Patient lookup follows this strict priority (Section 3 of patient-identity.md):

1. **Primary: CPT Lookup** - Look up by Clinical Patient Token (fastest, most reliable)
2. **Secondary: External Patient ID** - Look up by hospital MRN
3. **Fallback: Name + Date of Birth** - Look up by patient name and DOB combination

---

## PHASE 1 — Core Identity Layer

### 1.1 Patient Registry Service

The authoritative patient registry is implemented in:

```
app/services/patientEngine.ts
app/types/patient.ts
app/services/patientId.ts
```

Key functions (from patient-identity.md):

```typescript
// Registration with lookup-first (Section 6)
registerPatient(data: PatientRegistrationData): Promise<ClinicalPatient>

// Unified lookup with priority (Section 3)
findPatient(criteria: PatientSearchCriteria): Promise<PatientLookupResult>
findPatientByCPT(cpt: string): Promise<PatientLookupResult>
findPatientByExternalId(externalId: string): Promise<PatientLookupResult>
findPatientByNameAndDOB(name: string, dob: string): Promise<PatientLookupResult>

// Update with tracking (Section 5)
updatePatient(cpt: string, updates: Partial<PatientRegistrationData>): Promise<ClinicalPatient>

// Session linking (Section 5)
linkPatientToSession(sessionId: string, patientCpt: string): Promise<void>
```

### 1.2 CPT Utilities

From `app/services/patientId.ts`:

```typescript
// Generate unique CPT
generateCPT(): string

// Validate format
validateCPTFormat(cpt: string): { isValid: boolean; error?: string }

// Normalize input (handles variations)
normalizeCPTInput(input: string): { normalized: string; isValid: boolean; error?: string }
```

**Normalization Examples:**
- `cp7f3ak92q` → `CP-7F3A-K92Q`
- `7f3ak92q` → `CP-7F3A-K92Q`
- `CP7F3AK92Q` → `CP-7F3A-K92Q`
- `cp-7f3a-k92q` → `CP-7F3A-K92Q`

---

## PHASE 2 — Route Structure

Routes (from patient-identity.md):

| Route | Purpose |
|-------|---------|
| `/patient/new` | Create new patient (with CPT generation) |
| `/patient/lookup` | Enter CPT to find existing patient |
| `/patient/[cpt]` | Patient profile and history |
| `/sessions/[sessionId]` | Session with linked patient |

### Navigation Flow

```
Dashboard
    │
    ├──► New Patient ──► /patient/new ──► Register ──► Create Session ──► Assessment
    │                                                                 │
    └──► Returning Patient ──► /patient/lookup ──► Find Patient ──► Link to Session ──► Assessment
                                                                      │
                                                                      └──► Existing Session?
                                                                          ├── Yes → Resume Session
                                                                          └── No → Create Session
```

---

## PHASE 3 — Dashboard Refactor

### 3.1 Button Actions

Replace current assessment buttons:

```typescript
// OLD - Remove
handleNewAssessment()

// NEW - Redirect to patient flow
navigateToPatientFlow(action: 'new' | 'returning') {
  if (action === 'new') {
    navigateTo('/patient/new')
  } else {
    navigateTo('/patient/lookup')
  }
}
```

### 3.2 UI Labels

Rename for patient-first clarity:

| Old Label | New Label |
|-----------|-----------|
| New Assessment | New Patient |
| Resume Draft | Resume Session |
| Records | Patient Records |
| Recent Activity | Recent Sessions |
| Start Assessment | Identify Patient First |

### 3.3 Dashboard Sections

```
┌─────────────────────────────────────────────────────────────┐
│                    DASHBOARD                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  NEW PATIENT                                        │    │
│  │  ─────────────────────────────────────────────────│    │
│  │  First time patient? Create a CPT and register     │    │
│  │                                                     │    │
│  │  [ 🆕 New Patient ]                                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  RETURNING PATIENT                                   │    │
│  │  ─────────────────────────────────────────────────│    │
│  │  Have a CPT? Enter it to find the patient record   │    │
│  │                                                     │    │
│  │  ┌─────────────────────────────────────────────┐   │    │
│  │  │  Enter CPT (CP-XXXX-XXXX)                  │   │    │
│  │  └─────────────────────────────────────────────┘   │    │
│  │                                                     │    │
│  │  [ 🔍 Find Patient ]                               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  RECENT SESSIONS                                    │    │
│  │  ─────────────────────────────────────────────────│    │
│  │  Sessions linked to patients                       │    │
│  │                                                     │    │
│  │  • Session #1234 - Patient CP-7F3A-K92Q - ...     │    │
│  │  • Session #1233 - Patient CP-3B2D-M456 - ...     │    │
│  │                                                     │    │
│  │  [ 📋 View All Sessions ]                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## PHASE 4 — Session Enforcement

### 4.1 Session Creation with CPT

From `patient-identity.md` Section 5:

```typescript
// sessionEngine.createSession() must require patientCpt
interface CreateSessionParams {
  patientCpt: string;  // REQUIRED
  // ... other fields
}

async function createSession(params: CreateSessionParams): Promise<ClinicalSession> {
  if (!params.patientCpt) {
    throw new Error('Session creation requires a patient CPT');
  }
  
  // Validate patient exists
  const lookup = await findPatientByCPT(params.patientCpt);
  if (!lookup.found) {
    throw new Error('Cannot create session: patient not found');
  }
  
  // Create session linked to patient
  const session = await doCreateSession(params);
  
  // Log timeline event
  await logEvent({
    type: 'session_created',
    data: { patientCpt: params.patientCpt }
  });
  
  return session;
}
```

### 4.2 Session Linking

When linking a patient to a session:

1. **Attach patientCpt to session** - Store in session document
2. **Update lastSeenAt** - Update patient record timestamp
3. **Increment visitCount** - Track patient visits
4. **Log timeline event** - Record the linking

```typescript
async function linkPatientToSession(
  sessionId: string,
  patientCpt: string
): Promise<void> {
  // Update session
  await updateSession(sessionId, { patientCpt });
  
  // Update patient tracking
  await updatePatient(patientCpt, {}); // Updates lastSeenAt, visitCount
  
  // Log event
  await logEvent({
    type: 'patient_linked',
    data: { sessionId, patientCpt }
  });
}
```

---

## PHASE 5 — Form Guard Middleware

All form routes must enforce CPT presence:

```typescript
// In form page middleware
export default defineNuxtRouteMiddleware(async (to, from) => {
  const sessionStore = useSessionStore();
  const patientStore = usePatientStore();
  
  // Check if session exists and has patient linked
  if (!sessionStore.currentSession?.patientCpt) {
    // No patient linked - redirect to lookup
    return navigateTo('/patient/lookup');
  }
  
  // Optionally: Verify patient still exists
  const lookup = await findPatientByCPT(sessionStore.currentSession.patientCpt);
  if (!lookup.found) {
    // Patient not found - redirect
    return navigateTo('/patient/lookup');
  }
});
```

**Protected Routes:**
- `/assessment/[schemaId]/[formId]` - All clinical forms
- `/sessions/[sessionId]/treatment` - Treatment forms
- `/sessions/[sessionId]/summary` - Summary view

---

## PHASE 6 — Registration Changes

Registration must **only update patient fields** and **never create duplicate patients**:

```typescript
async function registerPatient(
  data: PatientRegistrationData
): Promise<ClinicalPatient> {
  // ALWAYS attempt lookup first
  if (data.cpt) {
    const existing = await findPatientByCPT(data.cpt);
    if (existing.found && existing.patient) {
      // Update existing patient
      return await updatePatient(data.cpt, data);
    }
  }
  
  if (data.externalPatientId) {
    const existing = await findPatientByExternalId(data.externalPatientId);
    if (existing.found && existing.patient) {
      // Link CPT to existing patient
      return await updatePatient(existing.patient.id, data);
    }
  }
  
  if (data.firstName && data.lastName && data.dateOfBirth) {
    const existing = await findPatientByNameAndDOB(
      `${data.firstName} ${data.lastName}`,
      data.dateOfBirth
    );
    if (existing.found && existing.patient) {
      // Possible duplicate - throw error for manual verification
      throw new Error(
        'Possible duplicate patient found. ' +
        'A patient with this name and date of birth already exists. ' +
        'Please verify and use the existing record.'
      );
    }
  }
  
  // No existing patient - create new
  return await createNewPatient(data);
}
```

**Registration Rules:**
- Always lookup first by CPT, then external ID, then name+DOB
- Never silently create duplicate records
- Name+DOB match requires manual verification
- Always assign CPT to new patients

---

## PHASE 7 — Patient Profile

Patient profile route: `/patient/[cpt]`

```
┌─────────────────────────────────────────────────────────────┐
│  PATIENT: CP-7F3A-K92Q                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  DEMOGRAPHICS                                        │    │
│  │  ─────────────────────────────────────────────────│    │
│  │  Name: John Doe                                     │    │
│  │  DOB: 1990-01-15                                    │    │
│  │  Gender: Male                                       │    │
│  │  Phone: +1-555-123-4567                            │    │
│  │  Email: john@example.com                           │    │
│  │  Address: 123 Main St, City, State, ZIP           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  VISIT HISTORY                                       │    │
│  │  ─────────────────────────────────────────────────│    │
│  │  Visit Count: 5                                     │    │
│  │  Last Seen: 2024-01-15                             │    │
│  │                                                     │    │
│  │  • Session #1234 - 2024-01-15 - Completed         │    │
│  │  • Session #1200 - 2024-01-01 - Completed         │    │
│  │  • Session #1150 - 2023-12-15 - Completed         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ACTIONS                                             │    │
│  │  ─────────────────────────────────────────────────│    │
│  │  [ 📝 Edit Profile ]                               │    │
│  │  [ ➕ Start New Session ]                          │    │
│  │  [ 📋 View All Sessions ]                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## PHASE 8 — QR Code Integration (Optional Enhancement)

From `patient-identity.md` Section 8:

QR codes follow the same lookup path as manual entry:

```typescript
// QR Content Format
interface QRCodeContent {
  format: 'HEALTHBRIDGE:CPT';
  version: 1;
  cpt: string;
  timestamp: number;
}

// Example QR Content: HEALTHBRIDGE:CPT:CP-7F3A-K92Q

// Parse and lookup
async function handleQRScan(rawContent: string): Promise<void> {
  const parsed = parseQRContent(rawContent);
  if (parsed.error) {
    showError(parsed.error);
    return;
  }
  
  // Same lookup flow as manual entry
  const result = await findPatientByCPT(parsed.cpt!);
  if (result.found && result.patient) {
    // Navigate to patient profile
    navigateTo(`/patient/${parsed.cpt}`);
  } else {
    showError('Patient not found');
  }
}
```

---

## SUCCESS CRITERIA

After implementation, verify:

- [ ] **CPT Enforcement**: Cannot open clinical forms without CPT
- [ ] **Returning Patient Flow**: Patient with CPT skips registration
- [ ] **Manual Entry**: CPT can be manually typed and validated
- [ ] **Session Display**: All sessions show linked CPT
- [ ] **Duplicate Prevention**: Lookup-first prevents duplicate registrations
- [ ] **Offline Support**: All operations work without network
- [ ] **Timeline Logging**: All patient operations logged
- [ ] **Data Integrity**: Checksums verify document integrity

---

## OUTPUT EXPECTATIONS

When implementing this prompt:

1. **Follow the spec strictly** - Use `patient-identity.md` as authoritative
2. **CPT format must be correct** - CP-XXXX-XXXX with 30-char alphabet
3. **Normalization must handle all variations** - cp7f3ak92q → CP-7F3A-K92Q
4. **Lookup priority must be enforced** - CPT → External ID → Name+DOB
5. **No duplicate registrations** - Always lookup first
6. **Session linking required** - Forms blocked without patient
7. **Offline-first** - All operations work without network
8. **Timeline logging** - All operations logged

---

**Begin implementation now. Follow the spec strictly.**
