# Patient Session Lifecycle Documentation

## Overview

This document provides a comprehensive, step-by-step walkthrough of the complete patient session lifecycle within the HealthBridge Nurse Mobile application. The workflow progresses from the nurse dashboard through registration, assessment, treatment, and finally to patient discharge.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Session States and Statuses](#session-states-and-statuses)
3. [Dashboard (Session Queue)](#dashboard-session-queue)
4. [Session Registration](#session-registration)
5. [Patient Assessment](#patient-assessment)
6. [Treatment Phase](#treatment-phase)
7. [Discharge Summary](#discharge-summary)
8. [Data Persistence Layer](#data-persistence-layer)
9. [Error Handling](#error-handling)
10. [API Reference](#api-reference)

---

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      HealthBridge Nurse Mobile                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Nuxt 4    │  │   Vue 3     │  │   TypeScript │             │
│  │   Frontend  │  │   Components│  │   Type Safety│             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Composables Layer                      │   │
│  │  useAuth | useToast | useFormEngine | useClinicalWorkflow│   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Services Layer                         │   │
│  │ sessionEngine | formEngine | secureDb | clinicalTimeline │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Storage Layer                          │   │
│  │         Encrypted PouchDB (IndexedDB wrapper)            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
app/
├── pages/
│   ├── dashboard.vue          # Main dashboard
│   ├── sessions/
│   │   ├── index.vue         # Session queue/list
│   │   └── [sessionId]/
│   │       ├── index.vue     # Session detail view
│   │       ├── assessment.vue # Assessment form selection
│   │       ├── treatment.vue  # Treatment workflow
│   │       └── summary.vue    # Discharge summary
├── components/
│   ├── clinical/
│   │   ├── SessionCard.vue    # Session list item
│   │   ├── QueueView.vue      # Triage queue display
│   │   ├── Timeline.vue       # Session timeline
│   │   └── summary/
│   │       └── TriageSummaryCard.vue
│   └── ui/
│       ├── TWButton.vue       # Button component
│       ├── TWCard.vue         # Card container
│       ├── TWBadge.vue        # Status badge
│       └── ...
├── composables/
│   ├── useAuth.ts             # Authentication
│   ├── useToast.ts            # Notifications
│   ├── useFormEngine.ts        # Form handling
│   └── useClinicalWorkflow.ts  # Workflow state
└── services/
    ├── sessionEngine.ts        # Session CRUD operations
    ├── formEngine.ts           # Form instance management
    ├── clinicalTimeline.ts     # Audit logging
    └── secureDb.ts             # Encrypted storage
```

---

## Session States and Statuses

### Session Stage Enumeration

```typescript
// app/services/sessionEngine.ts

export type ClinicalSessionStage = 
  | 'registration'   // Initial patient registration
  | 'assessment'     // Clinical assessment forms
  | 'treatment'      // Treatment administration
  | 'discharge'      // Final discharge processing

export type ClinicalSessionStatus = 
  | 'open'           // Active session
  | 'completed'       // Successfully discharged
  | 'referred'       // Referred to another facility
  | 'cancelled'      // Session cancelled

export type ClinicalSessionTriage = 
  | 'red'            // Emergency/Urgent
  | 'yellow'         // Priority
  | 'green'          // Routine
  | 'unknown'        // Not yet triaged
```

### Stage Transition Rules

```
           ┌─────────────────────────────────────────────────────────┐
           │                    VALID STAGE TRANSITIONS               │
           └─────────────────────────────────────────────────────────┘

  registration ──► assessment ──► treatment ──► discharge ──► completed
       │              │              │             │
       │              │              │             │
       ▼              ▼              ▼             ▼
   (initial)    (after reg)    (after assess)  (after treatment)
```

**Rules:**
- Stages can only progress forward (no backward movement)
- Each stage transition must be triggered explicitly
- Treatment stage requires at least one completed assessment form
- Discharge stage finalizes the session

### Session Entity Structure

```typescript
// app/services/sessionEngine.ts

export interface ClinicalSession {
  _id: string;              // Full session ID (e.g., "session:abc123-xyz")
  id: string;               // Short ID for display (e.g., "abc123")
  patientId?: string;       // Linked patient ID
  patientName?: string;      // Patient name
  dateOfBirth?: string;      // Patient DOB
  gender?: string;           // Patient gender
  chiefComplaint?: string;   // Primary complaint
  notes?: string;           // JSON string containing session notes
  triage: ClinicalSessionTriage;
  status: ClinicalSessionStatus;
  stage: ClinicalSessionStage;
  formInstanceIds: string[]; // Linked form instances
  createdAt: number;         // Unix timestamp
  updatedAt: number;         // Unix timestamp
}
```

---

## Dashboard (Session Queue)

### File Location
`app/pages/dashboard.vue`

### Overview
The dashboard serves as the main entry point for nurses, displaying an organized queue of active sessions grouped by triage priority. This view enables efficient patient management by priority.

### Dashboard Flow

```
1. Dashboard Mounts
   │
   ├── loadSessions() called
   │
   ├── Initialize session engine
   │   └── initializeSessionEngine()
   │
   ├── Fetch open sessions by priority
   │   └── getOpenSessionsByPriority()
   │
   ├── Populate triage queues
   │   ├── red[]    → Emergency cases
   │   ├── yellow[] → Priority cases
   │   └── green[]  → Routine cases
   │
   └── Render QueueView component
       └── Display grouped session cards
```

### Data Loading Sequence

```typescript
// app/pages/dashboard.vue

const loadSessions = async () => {
  try {
    isLoading.value = true;
    
    // Step 1: Initialize engine
    await initializeSessionEngine();
    
    // Step 2: Fetch sessions
    const queue = await getOpenSessionsByPriority();
    
    // Step 3: Update state
    sessions.red = queue.red;
    sessions.yellow = queue.yellow;
    sessions.green = queue.green;
    
  } catch (err) {
    error.value = 'Failed to load sessions';
  } finally {
    isLoading.value = false;
  }
};
```

### Queue View Component

```vue
<!-- app/components/clinical/QueueView.vue -->
<template>
  <div class="queue-view">
    <!-- Red Triage Queue -->
    <section v-if="red.length > 0" class="mb-6">
      <h2 class="text-red-400 font-bold mb-3">🔴 Emergency</h2>
      <div class="space-y-2">
        <SessionCard 
          v-for="session in red" 
          :key="session.id"
          :session="session"
          @click="openSession(session.id)"
        />
      </div>
    </section>
    
    <!-- Yellow Triage Queue -->
    <section v-if="yellow.length > 0" class="mb-6">
      <h2 class="text-yellow-400 font-bold mb-3">🟡 Priority</h2>
      <!-- ... -->
    </section>
    
    <!-- Green Triage Queue -->
    <section v-if="green.length > 0" class="mb-6">
      <h2 class="text-green-400 font-bold mb-3">🟢 Routine</h2>
      <!-- ... -->
    </section>
  </div>
</template>
```

### Session Card Component

```vue
<!-- app/components/clinical/SessionCard.vue -->
<template>
  <TWCard 
    class="session-card cursor-pointer hover:ring-2 hover:ring-blue-500"
    @click="$emit('click')"
  >
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-white font-semibold">{{ session.patientName }}</h3>
        <p class="text-gray-400 text-sm">Session {{ session.id.slice(7, 11) }}</p>
      </div>
      
      <TWBadge :color="triageColor" :label="triageLabel" />
    </div>
    
    <div class="mt-3 flex items-center gap-4 text-sm text-gray-400">
      <span>{{ formatTime(session.createdAt) }}</span>
      <span>{{ session.stage }}</span>
    </div>
  </TWCard>
</template>
```

### Dashboard Interactions

| Interaction | Handler | Action |
|-------------|----------|--------|
| Click session card | `openSession(sessionId)` | Navigate to session detail |
| Click new session | `createSession()` | Create and navigate to new session |
| Refresh queue | `loadSessions()` | Reload all sessions |

---

## Session Registration

### File Location
`app/pages/sessions/[sessionId]/index.vue`

### Overview
The session detail page serves as the central hub for a patient session. From here, nurses can navigate to registration updates, assessment forms, treatment, and discharge.

### Session Detail Flow

```
1. Page Mounts (sessionId from route params)
   │
   ├── loadSessionData()
   │   └── loadSession(sessionId)
   │
   ├── Update stage tabs based on current stage
   │   └── activeTab computed property
   │
   └── Render session header with badges
       ├── Triage badge (red/yellow/green)
       ├── Stage badge (registration/assessment/treatment/discharge)
       └── Session info card
```

### Stage Navigation Tabs

```vue
<!-- Navigation tabs in session detail -->
<div class="border-b border-gray-700 mb-6">
  <div class="flex gap-1 -mb-px">
    <button
      @click="navigateToStage('registration')"
      :class="[
        'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors',
        currentStage === 'registration' 
          ? 'bg-gray-800 text-white border-b-2 border-blue-500'
          : 'text-gray-400 hover:text-white'
      ]"
    >
      Registration
    </button>
    
    <button
      @click="navigateToStage('assessment')"
      :disabled="!canNavigateTo('assessment')"
    >
      Assessment
    </button>
    
    <button
      @click="navigateToStage('treatment')"
      :disabled="!canNavigateTo('treatment')"
    >
      Treatment
    </button>
    
    <button
      @click="navigateToStage('discharge')"
      :disabled="!canNavigateTo('discharge')"
    >
      Discharge
    </button>
  </div>
</div>
```

### Session Data Display

```typescript
// Computed properties for session display

const patientInfo = computed(() => ({
  name: session.value?.patientName || 'Unknown Patient',
  patientId: session.value?.patientId || 'N/A',
  dateOfBirth: session.value?.dateOfBirth || 'N/A',
  gender: session.value?.gender || 'Not specified',
  chiefComplaint: session.value?.chiefComplaint || 'Not recorded'
}));

const sessionAge = computed(() => {
  if (!session.value?.createdAt) return 'Unknown';
  
  const diffMs = Date.now() - session.value.createdAt;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  // ... format hours/days
});
```

### Navigation Functions

```typescript
// app/pages/sessions/[sessionId]/index.vue

function navigateToStage(stageId: string) {
  const stages: ClinicalSessionStage[] = [
    'registration',
    'assessment',
    'treatment',
    'discharge'
  ];
  
  const currentIndex = stages.indexOf(session.value?.stage || 'registration');
  const targetIndex = stages.indexOf(stageId as ClinicalSessionStage);
  
  // Only allow navigation to current or forward stages
  if (targetIndex <= currentIndex) {
    switch (stageId) {
      case 'registration':
        navigateTo(`/sessions/${sessionId.value}`);
        break;
      case 'assessment':
        navigateTo(`/sessions/${sessionId.value}/assessment`);
        break;
      case 'treatment':
        navigateTo(`/sessions/${sessionId.value}/treatment`);
        break;
      case 'discharge':
        navigateTo(`/sessions/${sessionId.value}/summary`);
        break;
    }
  }
}
```

---

## Patient Assessment

### File Location
`app/pages/sessions/[sessionId]/assessment.vue`

### Overview
The assessment page displays available clinical assessment forms (e.g., Pediatric Respiratory Assessment) that can be selected for the patient. After selection, the form engine renders the appropriate schema-based form.

### Assessment Flow

```
1. Assessment Page Loads
   │
   ├── Load session data
   │   └── loadSession(sessionId)
   │
   ├── Fetch available schemas from manifest
   │   └── GET /schemas/manifest.json
   │
   ├── Filter active schemas
   │   └── status === 'active' || 'beta'
   │
   └── Render schema selection cards
       └── Each card links to form page
```

### Schema Selection

```vue
<!-- app/pages/sessions/[sessionId]/assessment.vue -->
<template>
  <div class="assessment-selection">
    <h2 class="text-xl font-bold text-white mb-6">
      Select Assessment Form
    </h2>
    
    <div class="grid gap-4">
      <TWCard 
        v-for="schema in visibleSchemas" 
        :key="schema.id"
        class="cursor-pointer hover:ring-2 hover:ring-blue-500"
        @click="selectSchema(schema.id)"
      >
        <div class="flex items-start justify-between">
          <div>
            <h3 class="text-white font-semibold">{{ schema.name }}</h3>
            <p class="text-gray-400 text-sm mt-1">
              {{ schema.description }}
            </p>
          </div>
          
          <TWBadge :color="getStatusColor(schema.status)" :label="schema.status" />
        </div>
        
        <div class="mt-4 flex items-center gap-4 text-sm text-gray-400">
          <span>⏱️ {{ schema.metadata.estimatedCompletionMinutes }} min</span>
          <span>⚠️ {{ schema.metadata.riskLevel }} risk</span>
        </div>
      </TWCard>
    </div>
  </div>
</template>
```

### Schema Selection Handler

```typescript
function selectSchema(schemaId: string) {
  // Navigate to form page with schema and session
  navigateTo(`/sessions/${sessionId.value}/assessment/${schemaId}`);
}
```

### Form Engine Integration

```typescript
// When form page loads (e.g., /assessment/peds_respiratory/[formId].vue)

const formPage = async () => {
  // Step 1: Get or create form instance
  const instance = await formEngine.getOrCreateInstance({
    workflow: schemaId,
    sessionId: sessionId.value
  });
  
  // Step 2: Render form fields from schema
  const schema = await schemaManager.loadSchema(schemaId);
  
  // Step 3: Handle field changes
  const updateField = async (fieldId: string, value: any) => {
    await formEngine.updateInstance(instance._id, {
      answers: { [fieldId]: value }
    });
  };
  
  // Step 4: On form completion
  const completeForm = async () => {
    await formEngine.transitionState(instance._id, 'complete');
    
    // Log timeline event
    await logEvent({
      type: 'form_completed',
      sessionId: sessionId.value,
      data: { schemaId, instanceId: instance._id }
    });
    
    // Navigate back to session
    navigateTo(`/sessions/${sessionId.value}`);
  };
};
```

---

## Treatment Phase

### File Location
`app/pages/sessions/[sessionId]/treatment.vue`

### Overview
The treatment page manages the treatment workflow, displaying treatment forms and recommendations derived from the assessment. It includes navigation through treatment sections and a "Complete Treatment" button.

### Treatment Flow

```
1. Treatment Page Loads
   │
   ├── Load session data
   ├── Load treatment schema (peds_respiratory_treatment.json)
   │
   ├── Bridge assessment to treatment
   │   └── bridgeAssessmentToTreatment()
   │       └── Copy recommended_actions from assessment
   │
   ├── Load existing treatment instance
   │   └── formEngine.getLatestInstanceBySession()
   │
   └── Render treatment sections
       └── Each section displays relevant fields
```

### Section Navigation

```vue
<!-- Treatment section tabs -->
<div class="border-b border-gray-700 mb-6">
  <div class="flex gap-1 -mb-px">
    <button
      v-for="(section, index) in formSections"
      :key="section.id"
      @click="goToSection(index)"
      :class="[
        'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors',
        activeSection === index
          ? 'bg-gray-800 text-white border-b-2 border-blue-500'
          : 'text-gray-400 hover:text-white'
      ]"
    >
      {{ section.title }}
    </button>
  </div>
</div>
```

### Treatment Actions

```typescript
// app/pages/sessions/[sessionId]/treatment.vue

// Save treatment data
async function saveTreatmentData() {
  await formEngine.updateInstance(treatmentInstance._id, {
    answers: formValues.value,
    calculated: {
      triagePriority: formValues.value.triage_priority
    }
  });
  
  toastComposable.toast({
    title: 'Treatment saved',
    color: 'success'
  });
}

// Complete treatment workflow
async function completeTreatment() {
  // Validate all required fields
  if (!validateAllSections()) {
    toastComposable.toast({
      title: 'Please fill in all required fields',
      color: 'warning'
    });
    return;
  }
  
  // Save final treatment data
  await formEngine.updateInstance(treatmentInstance._id, {
    answers: formValues.value,
    calculated: {
      triagePriority: formValues.value.triage_priority
    }
  });
  
  // Transition to complete
  await formEngine.transitionState(treatmentInstance._id, 'complete');
  
  // Navigate to discharge summary
  navigateTo(`/sessions/${sessionId.value}/summary`);
}
```

### Treatment Schema Structure

```json
// public/schemas/peds_respiratory_treatment.json
{
  "id": "peds_respiratory_treatment",
  "version": "1.0.0",
  "title": "Pediatric Respiratory Treatment",
  "sections": [
    {
      "id": "summary",
      "title": "Treatment Summary",
      "fields": ["triage_priority", "recommended_actions"]
    },
    {
      "id": "emergency",
      "title": "Emergency Interventions",
      "fields": ["emergency_drugs", "oxygen_therapy"]
    },
    {
      "id": "antibiotics",
      "title": "Antibiotics",
      "fields": ["antibiotic_type", "dosage", "duration"]
    },
    {
      "id": "home_care",
      "title": "Home Care Instructions",
      "fields": ["feeding_advice", "follow_up_date"]
    }
  ],
  "fields": [
    {
      "id": "triage_priority",
      "type": "select",
      "label": "Triage Priority",
      "options": ["red", "yellow", "green"]
    },
    {
      "id": "recommended_actions",
      "type": "multiselect",
      "label": "Recommended Actions",
      "options": ["refer_hospital", "antibiotics", "home_care", "follow_up", "counseling"]
    }
  ]
}
```

---

## Discharge Summary

### File Location
`app/pages/sessions/[sessionId]/summary.vue`

### Overview
The discharge summary page displays a comprehensive overview of the entire session, including patient information, assessment results, treatment data, and allows the nurse to finalize the discharge with disposition and notes.

### Discharge Flow

```
1. Discharge Page Loads
   │
   ├── Load session data
   ├── Load assessment instance
   │   └── formEngine.getLatestInstanceBySession({ schemaId: 'peds_respiratory' })
   │
   ├── Load treatment instance
   │   └── formEngine.getLatestInstanceBySession({ schemaId: 'peds_respiratory_treatment' })
   │
   └── Render comprehensive summary
       ├── Patient info card
       ├── Assessment summary card
       ├── Treatment summary card
       ├── Discharge notes form ← User inputs here
       └── Discharge actions buttons
```

### Discharge Notes Input

```vue
<!-- app/pages/sessions/[sessionId]/summary.vue -->
<template>
  <!-- Discharge Disposition Selection -->
  <div class="mb-4">
    <label class="block text-sm font-medium text-gray-300 mb-2">
      Discharge Disposition <span class="text-red-400">*</span>
    </label>
    <div class="grid grid-cols-4 gap-2">
      <button
        type="button"
        @click="dischargeDisposition = 'home'"
        :class="[
          'px-4 py-3 rounded-lg text-sm font-medium border',
          dischargeDisposition === 'home'
            ? 'bg-green-900/30 border-green-600 text-green-400'
            : 'bg-gray-700/50 border-gray-600 text-gray-400'
        ]"
      >
        🏠 Home
      </button>
      
      <button
        type="button"
        @click="dischargeDisposition = 'referred'"
        :class="[
          dischargeDisposition === 'referred'
            ? 'bg-yellow-900/30 border-yellow-600 text-yellow-400'
            : 'bg-gray-700/50 border-gray-600 text-gray-400'
        ]"
      >
        🏥 Referred
      </button>
      
      <!-- ... transferred, deceased options -->
    </div>
  </div>
  
  <!-- Discharge Notes Textarea -->
  <div class="mb-4">
    <label class="block text-sm font-medium text-gray-300 mb-2">
      Discharge Notes
    </label>
    <textarea
      v-model="dischargeNotes"
      rows="4"
      class="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white"
      placeholder="Enter discharge notes, follow-up instructions, or observations..."
    ></textarea>
  </div>
  
  <!-- Confirm Discharge Button -->
  <TWButton
    color="success"
    :loading="isSaving"
    @click="confirmDischarge"
  >
    Confirm Discharge
  </TWButton>
</template>
```

### Confirm Discharge Handler

```typescript
// app/pages/sessions/[sessionId]/summary.vue

async function confirmDischarge() {
  try {
    isSaving.value = true;
    
    // Step 1: Save discharge notes to session
    if (session.value) {
      const existingNotes = session.value.notes 
        ? JSON.parse(session.value.notes) 
        : {};
      
      const updatedNotes = {
        ...existingNotes,
        discharge: {
          notes: dischargeNotes.value,
          disposition: dischargeDisposition.value,
          completedAt: new Date().toISOString()
        }
      };
      
      await updateSession(sessionId.value, {
        notes: JSON.stringify(updatedNotes)
      } as any);
    }
    
    // Step 2: Complete the session
    await completeSession(sessionId.value, 'completed');
    
    // Step 3: Show success notification
    toastComposable.toast({
      title: 'Discharge Confirmed',
      description: 'Patient has been successfully discharged',
      color: 'success'
    });
    
    // Step 4: Navigate to dashboard
    navigateTo('/dashboard');
    
  } catch (err) {
    console.error('Failed to complete discharge:', err);
    toastComposable.toast({
      title: 'Error',
      description: 'Failed to complete discharge. Please try again.',
      color: 'error'
    });
  } finally {
    isSaving.value = false;
  }
}
```

---

## Data Persistence Layer

### Secure Database Service

```typescript
// app/services/secureDb.ts

/**
 * Encrypted database operations using IndexedDB
 * All session and form data is encrypted at rest
 */

export async function securePut<T>(
  document: T, 
  key: Uint8Array
): Promise<void> {
  // Encrypt document before storing
  const encrypted = await encryptionUtils.encrypt(
    JSON.stringify(document),
    key
  );
  
  // Store in IndexedDB
  await indexedDB.put('healthbridge', {
    _id: (document as any)._id,
    _rev: (document as any)._rev,
    encryptedData: encrypted
  });
}

export async function secureGet<T>(
  documentId: string, 
  key: Uint8Array
): Promise<T | null> {
  // Fetch from IndexedDB
  const record = await indexedDB.get('healthbridge', documentId);
  
  if (!record) return null;
  
  // Decrypt and parse
  const decrypted = await encryptionUtils.decrypt(
    record.encryptedData,
    key
  );
  
  return JSON.parse(decrypted);
}
```

### Session Engine API

```typescript
// app/services/sessionEngine.ts

/**
 * Session Engine - Manages clinical session lifecycle
 */

// Create a new session
export async function createSession(patientId?: string): Promise<ClinicalSession> {
  const sessionId = generateSessionId();
  const now = Date.now();
  
  const session: ClinicalSession = {
    _id: sessionId,
    id: sessionId,
    patientId,
    triage: 'unknown',
    status: 'open',
    stage: 'registration',
    formInstanceIds: [],
    createdAt: now,
    updatedAt: now
  };
  
  await securePut(session, await getEncryptionKey());
  return session;
}

// Load an existing session
export async function loadSession(sessionId: string): Promise<ClinicalSession | null> {
  return await secureGet<ClinicalSession>(sessionId, await getEncryptionKey());
}

// Update session with patient data
export async function updateSession(
  sessionId: string,
  data: {
    patientId?: string;
    patientName?: string;
    dateOfBirth?: string;
    gender?: string;
    chiefComplaint?: string;
    notes?: string;
  }
): Promise<void> {
  const session = await loadSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  
  // Update fields
  Object.assign(session, data);
  session.updatedAt = Date.now();
  
  await securePut(session, await getEncryptionKey());
}

// Advance session to next stage
export async function advanceStage(
  sessionId: string,
  nextStage: ClinicalSessionStage
): Promise<void> {
  const session = await loadSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  
  // Validate transition
  const stages: ClinicalSessionStage[] = [
    'registration',
    'assessment',
    'treatment',
    'discharge'
  ];
  
  const currentIndex = stages.indexOf(session.stage);
  const nextIndex = stages.indexOf(nextStage);
  
  if (nextIndex !== currentIndex + 1) {
    throw new Error(`Invalid stage transition: ${session.stage} → ${nextStage}`);
  }
  
  session.stage = nextStage;
  session.updatedAt = Date.now();
  
  await securePut(session, await getEncryptionKey());
}

// Complete session (finalize discharge)
export async function completeSession(
  sessionId: string,
  finalStatus: 'completed' | 'referred' | 'cancelled' = 'completed'
): Promise<void> {
  const session = await loadSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  
  session.status = finalStatus;
  session.stage = 'discharge';
  session.updatedAt = Date.now();
  
  await securePut(session, await getEncryptionKey());
  
  // Log timeline event
  await logEvent({
    id: generateEventId(),
    sessionId,
    type: 'stage_change',
    data: { 
      from: 'treatment', 
      to: 'discharge',
      status: finalStatus 
    },
    timestamp: Date.now()
  });
}
```

### Form Engine API

```typescript
// app/services/formEngine.ts

/**
 * Form Engine - Manages clinical form instances
 */

export interface ClinicalFormInstance {
  _id: string;
  _rev?: string;
  workflow: string;
  schemaId: string;
  sessionId: string;
  status: FormStatus;
  answers: Record<string, any>;
  calculated?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

// Get or create a form instance
export async function getOrCreateInstance(params: {
  workflow: string;
  sessionId: string;
}): Promise<ClinicalFormInstance> {
  const existing = await getLatestInstanceBySession(params);
  
  if (existing) return existing;
  
  // Create new instance
  const instance: ClinicalFormInstance = {
    _id: generateInstanceId(),
    workflow: params.workflow,
    schemaId: params.workflow, // Maps to schema
    sessionId: params.sessionId,
    status: 'draft',
    answers: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  await securePut(instance, await getEncryptionKey());
  return instance;
}

// Update form instance
export async function updateInstance(
  instanceId: string,
  updates: Partial<ClinicalFormInstance>
): Promise<void> {
  const instance = await secureGet<ClinicalFormInstance>(
    instanceId, 
    await getEncryptionKey()
  );
  
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  
  Object.assign(instance, updates, { updatedAt: Date.now() });
  
  await securePut(instance, await getEncryptionKey());
}

// Transition form state
export async function transitionState(
  instanceId: string,
  targetState: 'complete'
): Promise<void> {
  const instance = await secureGet<ClinicalFormInstance>(
    instanceId, 
    await getEncryptionKey()
  );
  
  instance.status = targetState === 'complete' ? 'completed' : instance.status;
  instance.completedAt = Date.now();
  instance.updatedAt = Date.now();
  
  await securePut(instance, await getEncryptionKey());
}
```

---

## Error Handling

### Global Error Types

```typescript
// Error handling patterns used throughout the application

// Session not found
const loadSessionData = async () => {
  const data = await loadSession(sessionId.value);
  
  if (!data) {
    error.value = 'Session not found';
    return; // Show error state in UI
  }
  
  session.value = data;
};

// API operation errors
try {
  await someOperation();
} catch (err) {
  console.error('[Component] Operation failed:', err);
  toastComposable.toast({
    title: 'Error',
    description: err instanceof Error ? err.message : 'Operation failed',
    color: 'error'
  });
}

// Validation errors
const validateForm = () => {
  const errors: string[] = [];
  
  if (!formValues.value.requiredField) {
    errors.push('Required field is missing');
  }
  
  if (errors.length > 0) {
    toastComposable.toast({
      title: 'Validation Error',
      description: errors.join(', '),
      color: 'warning'
    });
    return false;
  }
  
  return true;
};
```

### Error State UI

```vue
<!-- Error state display pattern -->
<div
  v-if="error"
  class="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-xl flex flex-col items-center"
>
  <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-red-400 mb-4">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
  
  <p class="text-red-400 font-medium mb-2">{{ error }}</p>
  
  <button 
    @click="loadSessionData"
    class="mt-4 px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg"
  >
    Retry
  </button>
</div>
```

---

## API Reference

### Session Engine Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `createSession` | `patientId?: string` | `Promise<ClinicalSession>` | Creates new session |
| `loadSession` | `sessionId: string` | `Promise<ClinicalSession \| null>` | Loads session by ID |
| `updateSession` | `sessionId: string, data: SessionUpdateData` | `Promise<void>` | Updates session fields |
| `advanceStage` | `sessionId: string, nextStage: ClinicalSessionStage` | `Promise<void>` | Advances session stage |
| `completeSession` | `sessionId: string, finalStatus?: string` | `Promise<void>` | Finalizes session |
| `linkFormToSession` | `sessionId: string, formInstanceId: string` | `Promise<void>` | Links form to session |
| `getOpenSessionsByPriority` | `()` | `Promise<SessionQueue>` | Fetches all open sessions |

### Form Engine Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getOrCreateInstance` | `{ workflow, sessionId }` | `Promise<ClinicalFormInstance>` | Gets or creates form |
| `updateInstance` | `instanceId, updates` | `Promise<void>` | Updates form data |
| `getLatestInstanceBySession` | `{ schemaId, sessionId }` | `Promise<ClinicalFormInstance \| null>` | Gets latest form |
| `transitionState` | `instanceId, targetState` | `Promise<void>` | Changes form state |

### Timeline Service Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `logEvent` | `event: TimelineEvent` | `Promise<void>` | Logs audit event |
| `getTimeline` | `sessionId` | `Promise<TimelineEvent[]>` | Gets session events |

---

## User Interface Interactions

### Complete Session Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      COMPLETE SESSION WORKFLOW                           │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐
  │   DASHBOARD   │
  │   (Queue View)│
  └──────┬───────┘
         │
         │ Click session card
         ▼
  ┌──────────────┐
  │   SESSION    │
  │    DETAIL    │◄──────────────────────────────────────┐
  └──────┬───────┘                                       │
         │                                               │
         │ Click "Assessment" tab                         │
         ▼                                               │
  ┌──────────────┐    Select schema    ┌───────────────┐  │
  │  ASSESSMENT  │───────────────────►│   FORM PAGE   │──┘
  │   SELECTION  │                   │(Schema Render)│
  └──────┬───────┘                   └───────────────┘
         │                                       │
         │ Form completed                        │
         ▼                                       │
  ┌──────────────┐                               │
  │   SESSION    │◄──────────────────────────────┘
  │    DETAIL    │
  └──────┬───────┘
         │
         │ Click "Treatment" tab
         ▼
  ┌──────────────┐
  │   TREATMENT  │──────────────────────────────┐
  │    WORKFLOW  │                              │
  └──────┬───────┘                              │
         │                                      │
         │ Complete Treatment                   │
         ▼                                      │
  ┌──────────────┐                              │
  │   DISCHARGE  │◄──────────────────────────────┘
  │   SUMMARY    │
  └──────┬───────┘
         │
         │ Enter disposition & notes
         │ Click "Confirm Discharge"
         ▼
  ┌──────────────┐
  │  COMPLETE    │
  │  SESSION     │
  └──────────────┘
         │
         │ Redirect to dashboard
         ▼
  ┌──────────────┐
  │   DASHBOARD   │
  │  (Updated)    │
  └──────────────┘
```

### Button Actions Summary

| Button | Location | Action |
|--------|----------|--------|
| Session Card Click | Dashboard | Navigate to session detail |
| Assessment Tab | Session Detail | Navigate to assessment selection |
| Schema Card Click | Assessment | Navigate to form page |
| Save Draft | Form Page | Save form progress |
| Complete Form | Form Page | Mark form complete, return to session |
| Treatment Tab | Session Detail | Navigate to treatment |
| Save Treatment | Treatment | Save treatment progress |
| Complete Treatment | Treatment | Save, mark complete, navigate to discharge |
| Back to Session | Discharge | Return to session detail |
| Confirm Discharge | Discharge | Save disposition/notes, complete session, go to dashboard |

---

## Validation Rules

### Session Stage Transitions

```typescript
const canAdvanceToStage = (targetStage: ClinicalSessionStage): boolean => {
  const stages: ClinicalSessionStage[] = [
    'registration',
    'assessment',
    'treatment',
    'discharge'
  ];
  
  const currentIndex = stages.indexOf(session.value?.stage || 'registration');
  const targetIndex = stages.indexOf(targetStage);
  
  // Can only advance to next stage
  if (targetIndex !== currentIndex + 1) return false;
  
  // Treatment requires completed assessment
  if (targetStage === 'treatment') {
    return hasAssessment.value; // Must have at least one form
  }
  
  return true;
};
```

### Form Validation

```typescript
const validateAllSections = (): boolean => {
  let isValid = true;
  
  for (const section of formSections.value) {
    for (const field of section.fields) {
      const fieldDef = schema.value?.fields.find(f => f.id === field);
      
      // Check visibility
      if (fieldDef?.visibleIf) {
        const depValue = formValues.value[fieldDef.visibleIf.field];
        // ... evaluate visibility condition
      }
      
      // Check required
      if (fieldDef?.required && !formValues.value[field]) {
        fieldErrors.value[field] = `${fieldDef.label} is required`;
        isValid = false;
      }
    }
  }
  
  return isValid;
};
```

---

## File Structure Reference

```
app/
├── pages/
│   ├── dashboard.vue              # Main dashboard / queue
│   ├── sessions/
│   │   ├── index.vue              # Session queue
│   │   └── [sessionId]/
│   │       ├── index.vue         # Session detail view
│   │       ├── assessment.vue    # Assessment selection
│   │       ├── treatment.vue     # Treatment workflow
│   │       └── summary.vue       # Discharge summary
│   └── assessment/
│       ├── new.vue               # New assessment
│       └── [schemaId]/
│           └── [formId].vue      # Form renderer
├── components/
│   ├── clinical/
│   │   ├── SessionCard.vue       # Session list item
│   │   ├── QueueView.vue         # Triage queue
│   │   ├── Timeline.vue          # Session timeline
│   │   └── summary/
│   │       └── TriageSummaryCard.vue
│   └── ui/
│       ├── TWButton.vue          # Button component
│       ├── TWCard.vue            # Card container
│       ├── TWBadge.vue           # Status badge
│       └── TWAlert.vue           # Alert component
├── composables/
│   ├── useAuth.ts                # Authentication
│   ├── useToast.ts               # Notifications
│   ├── useFormEngine.ts           # Form operations
│   └── useClinicalWorkflow.ts     # Workflow state
└── services/
    ├── sessionEngine.ts           # Session CRUD
    ├── formEngine.ts              # Form management
    ├── clinicalTimeline.ts        # Audit logging
    ├── secureDb.ts                # Encrypted storage
    └── syncManager.ts             # Data synchronization

public/schemas/
├── manifest.json                 # Available schemas
├── peds_respiratory_v1.0.2.json  # Assessment schema
└── peds_respiratory_treatment.json # Treatment schema
```

---

## Conclusion

This documentation provides a complete reference for the patient session lifecycle in the HealthBridge Nurse Mobile application. The workflow ensures:

1. **Data Integrity** - All data is encrypted and validated
2. **Audit Trail** - Every action is logged via clinicalTimeline
3. **Offline First** - All operations work without network
4. **Stage Gating** - Users can only progress through valid stages
5. **Error Recovery** - Comprehensive error handling and retry mechanisms

For questions or clarifications, refer to the inline code comments or contact the development team.
