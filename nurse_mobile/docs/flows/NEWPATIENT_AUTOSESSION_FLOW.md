# 🔧 Kilocode Instruction: New Patient → Auto Session Flow

## Goal

After a nurse creates a new patient (CPT), the system must **automatically start a care workflow** by creating a clinical session and navigating to it. The nurse should never be left at a dead end.

---

## Functional Requirements

### 1. When a new patient is created

Immediately:

1. Generate and store CPT
2. Create a new clinical session:

```ts
createSession({
  patientCpt,
  stage: 'registration',
  status: 'open',
  createdAt: now()
})
```

3. Navigate to:

```
/sessions/{sessionId}
```

### Implementation Details (`/patient/new.vue`)

The patient registration page implements the following flow:

```ts
// Configuration flag for testing
const AUTO_SESSION_ENABLED = true;

// State management
const isRegistering = ref(false);
const isCreatingSession = ref(false);
const sessionCreationError = ref<string | null>(null);
const registeredPatientCPT = ref<string | null>(null);

async function handleSubmit() {
  // 1. Register patient
  const patient = await registerPatient(data);
  registeredPatientCPT.value = patient.cpt;

  // 2. Auto-create session if enabled
  if (AUTO_SESSION_ENABLED) {
    const sessionId = await createSessionForPatient(patient.cpt);
    
    if (sessionId) {
      // Success - navigate to session
      router.push(`/sessions/${sessionId}`);
    } else {
      // Session creation failed - show retry UI
      showRetryOptions(patient.cpt);
    }
  }
}
```

### Loading States & Progress Indicators

The form provides clear feedback during the auto-session creation process:

| State | Button Text | Description |
|-------|-------------|-------------|
| `isRegistering` | "Registering..." | Patient data being saved |
| `isCreatingSession` | "Creating Session..." | Session being created |

### Error Handling & Recovery

When session creation fails (but registration succeeded):

1. **Alert Display**: Yellow warning banner with error details
2. **Retry Option**: "Retry Session" button to attempt again
3. **Manual Option**: "View Patient" button to proceed without session
4. **Preserved State**: Patient CPT is stored for retry operations

```ts
async function retrySessionCreation() {
  if (!registeredPatientCPT.value) return;
  const sessionId = await createSessionForPatient(registeredPatientCPT.value);
  if (sessionId) {
    router.push(`/sessions/${sessionId}`);
  }
}

function proceedToPatientProfile() {
  if (registeredPatientCPT.value) {
    router.push(`/patient/${registeredPatientCPT.value}`);
  }
}
```

---

### 2. Session page behavior (`/sessions/[sessionId].vue`)

Add the following UX:

#### Header

* Patient CPT (large, copyable)
* Patient name (if available)
* Session stage badge: `Registration`

#### Timeline

* Auto-log: "Session created"

#### Primary CTA (big button)

> **Start Registration**

Clicking it must:

```ts
advanceSessionStage(sessionId, 'assessment')
navigateTo('/assessment/peds-respiratory/new?sessionId=' + sessionId)
```

---

### 3. Returning patient flow

If a nurse searches by CPT:

1. Load patient profile
2. Show **Create New Visit**
3. Clicking it:

   * Creates new session (registration)
   * Navigates to that session

---

### 4. Database

Ensure sessions include:

```ts
{
  type: 'clinicalSession',
  patientCpt: string,
  stage: 'registration' | 'assessment' | 'treatment' | 'complete',
  status: 'open' | 'closed'
}
```

Index by:

* `patientCpt`
* `stage`
* `status`

---

### 5. UX rules

* Never leave user on patient profile with no next step
* Every patient must be in a session to receive care
* Sessions represent visits, not patients
* Provide loading states during async operations
* Handle session creation failures gracefully with retry options

---

## Acceptance Criteria

* ✅ Creating a patient immediately opens a session
* ✅ The nurse always lands on a session dashboard
* ✅ "Start Registration" always launches first form
* ✅ Returning patient creates a new session
* ✅ Timeline logs every stage change
* ✅ Loading states provide feedback during registration and session creation
* ✅ Error handling with retry options when session creation fails

---

## Files Modified

- `app/pages/patient/new.vue` - Enhanced with auto-session flow, loading states, error handling
- `app/services/sessionEngine.ts` - Provides `createSession()` function

## Configuration

To disable auto-session creation for testing, set:

```ts
const AUTO_SESSION_ENABLED = false; // Set to true in production
```
