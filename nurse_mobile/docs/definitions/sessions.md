Sessions are patient encounters that group multiple clinical forms and activities into a unified workflow. They track patients from **registration → assessment → treatment → discharge**, with triage priority auto-calculated from linked form results. Sessions enable offline-first operation, queue management by priority (red/yellow/green), and full audit trails via timeline events.


## Sessions for Patients - Concept Overview

Based on the codebase, **Clinical Sessions** are the fundamental building blocks for tracking patient encounters in the HealthBridge mobile app.

### Core Idea

A **session** represents a single patient visit/encounter from arrival to discharge. It groups all related clinical activities (forms, assessments, treatments) under one unified entity.

### Session Structure

| Component | Purpose |
|-----------|---------|
| **Status** | `open` → `completed`/`archived`/`referred`/`cancelled` |
| **Stage** | `registration` → `assessment` → `treatment` → `discharge` |
| **Triage Priority** | `red` (critical) → `yellow` (urgent) → `green` (routine) → `unknown` |
| **Form Instances** | Links to all clinical forms completed during the encounter |

### Key Workflow

```
Patient Arrives → Create Session → Link Forms → Update Triage → Advance Stages → Complete Session
                    ↓
            [Registration] → [Assessment] → [Treatment] → [Discharge]
```

### Why Sessions?

1. **Unified View** - All patient data (forms, notes, assessments) linked to one encounter
2. **Triage Auto-calculation** - Triage derived from linked form results (red/yellow/green rules)
3. **Queue Management** - Open sessions grouped by priority for nurse workflow
4. **Offline-First** - Sessions stored in encrypted PouchDB, sync later
5. **Timeline Audit** - Every event (form completion, stage changes) logged to timeline
6. **Stage Validation** - Ensures proper workflow progression

### Example Use Case

```
1. Patient arrives with respiratory symptoms
2. Nurse creates session → stage: registration, triage: unknown
3. Nurse links Peds Respiratory assessment form → triage updates to yellow
4. Doctor completes exam form → triage updates to green (no red flags)
5. Treatment provided → advance to treatment stage
6. Patient discharged → complete session
```

### Files to Explore Further

- [`app/pages/sessions/index.vue`](app/pages/sessions/index.vue) - Session queue view
- [`app/pages/sessions/[sessionId].vue`](app/pages/sessions/[sessionId].vue) - Individual session detail
- [`app/components/clinical/SessionCard.vue`](app/components/clinical/SessionCard.vue) - Session card component
