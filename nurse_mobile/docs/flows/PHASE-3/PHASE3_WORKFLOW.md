Perfect 👍 this is exactly the right move.
Below is a **ready-to-drop `PHASE3_WORKFLOW.md`** you can save in your repo and point KiloCode to.

This file is written as a **machine-executable spec**: clear rules, contracts, and non-negotiables so KiloCode doesn’t “freestyle”.

---

# PHASE3_WORKFLOW.md

**Nurse Mobile – Phase 3: Clinical Workflow Engine**

> This document defines the exact scope, rules, APIs, and UI contracts for Phase 3.
> KiloCode MUST follow this spec and existing `ARCHITECTURE_RULES.md`.

---

## 1. Purpose

Phase 3 turns the app from a *form runner* into a **clinical workflow system**:

* Track patient sessions
* Move them through clinical stages
* Queue by triage
* Persist & sync securely
* Provide full audit timelines

No mock logic. No placeholders. All data must persist via `secureDb`.

---

## 2. Core Domain: Clinical Session

### 2.1 Session Entity

```ts
export type ClinicalSession = {
  id: string
  patientId?: string
  triage: 'red' | 'yellow' | 'green' | 'unknown'
  status: 'open' | 'completed' | 'referred' | 'cancelled'
  stage: 'registration' | 'assessment' | 'treatment' | 'discharge'
  formInstanceIds: string[]
  createdAt: number
  updatedAt: number
}
```

Stored in **secureDb**, encrypted.

---

## 3. sessionEngine.ts (REQUIRED)

Location:

```
app/services/sessionEngine.ts
```

### API Contract

```ts
createSession(patientId?: string): Promise<ClinicalSession>

loadSession(sessionId: string): Promise<ClinicalSession>

advanceStage(
  sessionId: string,
  nextStage: ClinicalSession['stage']
): Promise<void>

getOpenSessionsByPriority(): Promise<{
  red: ClinicalSession[]
  yellow: ClinicalSession[]
  green: ClinicalSession[]
}>
```

### Rules

* `triage` must update automatically from linked form instances
* `updatedAt` must change on every mutation
* All operations use `secureDb`

---

## 4. clinicalTimeline.ts

Location:

```
app/services/clinicalTimeline.ts
```

### Event Model

```ts
export type TimelineEvent = {
  id: string
  sessionId: string
  type: 'created' | 'stage_change' | 'triage_update' | 'form_completed'
  data: any
  timestamp: number
}
```

### API

```ts
logEvent(event: TimelineEvent): Promise<void>
getTimeline(sessionId: string): Promise<TimelineEvent[]>
```

All timeline events must be persisted and encrypted.

---

## 5. syncManager.ts

Location:

```
app/services/syncManager.ts
```

### Responsibilities

* Detect connectivity
* Start/stop pouch replication
* Expose status:

  ```ts
  status: 'offline' | 'syncing' | 'error' | 'synced'
  ```
* Auto retry
* Conflict logging

### API

```ts
startSync(): void
stopSync(): void
getStatus(): Ref<string>
```

Must integrate with existing `secureDb` replication config.

---

## 6. UI (Nuxt UI v4 ONLY)

### Pages

```
app/pages/sessions/index.vue
app/pages/sessions/[sessionId].vue
```

#### index.vue

* Queue view grouped by:

  * RED
  * YELLOW
  * GREEN
* Uses `<SessionCard />`
* Real data from `sessionEngine.getOpenSessionsByPriority()`

#### [sessionId].vue

* Shows:

  * Patient/session header
  * Stage badge
  * Timeline
  * Linked forms
  * Next action buttons

---

## 7. Components

```
app/components/clinical/
  SessionCard.vue
  QueueView.vue
  Timeline.vue
```

### UI Rules

* Must use Nuxt UI components only
* Dark theme
* No raw Tailwind buttons unless wrapped in UButton
* Zod validation where applicable

---

## 8. Non-Negotiables

1. **Encrypted Persistence** – all session & timeline data in secureDb
2. **No Hardcoding** – no fake sessions
3. **Auditability** – every state change logs a timeline event
4. **Offline First** – app works without network
5. **Nuxt UI Everywhere**

---

## 9. Acceptance Tests

| Scenario                  | Expected               |
| ------------------------- | ---------------------- |
| Create new session        | Appears in GREEN queue |
| Complete respiratory form | Session triage updates |
| Change stage              | Timeline event logged  |
| Offline mode              | Queue still loads      |
| Reconnect                 | Sync status updates    |

---

## 10. Execution Order

1. sessionEngine.ts
2. clinicalTimeline.ts
3. syncManager.ts
4. Queue UI
5. Session Detail UI

---

**End of Spec**

---

### What to tell KiloCode

Point it to this file and say:

> “Implement everything in PHASE3_WORKFLOW.md exactly. Do not invent APIs. Do not change contracts.”

If you’d like, next I can:

* Generate **sessionEngine.ts**
* Or design the **Queue UI wireframe** for you.
