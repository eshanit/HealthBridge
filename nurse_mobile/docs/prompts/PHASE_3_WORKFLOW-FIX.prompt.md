Great — here is a **copy-paste prompt** you can drop straight into KiloCode to fix Phase 3 correctly and align it with the clinical workflow.

You can save this as:

> `phase3-workflow-fix.prompt.md`

---

# Phase 3 Workflow Fix – Session → Assessment Flow

## Context

In `app/pages/sessions/[sessionId].vue`, the **Advance to Assessment** button only:

* updates the session stage
* logs to the timeline

It does NOT:

* navigate to the assessment
* create or resume a form
* show user feedback

This breaks the real clinical workflow.

---

## Required Behavior

When a session stage changes:

| Stage      | Required Action                                     |
| ---------- | --------------------------------------------------- |
| assessment | Create/resume pediatric respiratory form + navigate |
| treatment  | Navigate to treatment view                          |
| discharge  | Navigate to summary                                 |

---

## Patch Instructions

### 1. Add dependencies

In
`app/pages/sessions/[sessionId].vue`

```ts
import { useToast } from '#imports'
import { useFormEngine } from '@/services/formEngine'
```

Inside `<script setup>`:

```ts
const toast = useToast()
const formEngine = useFormEngine()
```

---

### 2. Replace handleAdvanceStage()

```ts
async function handleAdvanceStage() {
  const next = session.value.nextStage

  await sessionEngine.advanceStage(session.value.id)

  toast.add({
    title: 'Stage advanced',
    description: `Session moved to ${next}`,
    color: 'success'
  })

  if (next === 'assessment') {
    const form = await formEngine.getOrCreateInstance({
      workflow: 'peds-respiratory',
      sessionId: session.value.id
    })

    navigateTo(`/assessment/${form.workflow}/${form.id}`)
  }

  if (next === 'treatment') {
    navigateTo(`/sessions/${session.value.id}/treatment`)
  }

  if (next === 'discharge') {
    navigateTo(`/sessions/${session.value.id}/summary`)
  }
}
```

---

### 3. Ensure forms link back to sessions

In `app/services/formEngine.ts`
inside `getOrCreateInstance()`:

```ts
if (!instance.sessionId) {
  instance.sessionId = sessionId
  await db.put(instance)
}
```

---

## Acceptance Criteria

* Clicking **Advance to Assessment**:

  * updates stage
  * logs timeline
  * creates or resumes pediatric respiratory form
  * navigates to assessment page
  * shows success toast

This completes Phase 3: **Workflow Integration**.

---


