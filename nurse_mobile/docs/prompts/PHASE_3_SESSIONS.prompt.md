Perfect — this is exactly where KiloCode shines.

Here is a **copy-paste prompt** you can give to KiloCode so it implements the *Phase 3: Clinical Sessions + Workflow UI* correctly, aligned with your current Nuxt 4 + encrypted PouchDB architecture.

---

# 📄 `PHASE_3_SESSIONS.prompt.md`

> Paste this whole file into KiloCode as the execution instruction.

---

## 🎯 Objective

Implement **Clinical Sessions + Workflow Queue** as the backbone of the app.
Sessions group multiple form instances into a single patient encounter and automatically compute triage + stage.

This phase **must not replace** the existing form engine — it must wrap around it.

---

## 🧱 Core Rules (Non-Negotiable)

1. Sessions are stored in the **same encrypted PouchDB layer** as forms.
2. Triage is **derived only from linked form instances**.
3. Sessions **must work offline** and sync later via CouchDB.
4. UI **must use Nuxt UI** components wherever possible.
5. Validation must use **Zod schemas**.
6. No breaking changes to existing form engine.

---

## 📁 New Types

Create:

`app/types/clinical-session.ts`

```ts
import { z } from 'zod';

export const ClinicalSessionSchema = z.object({
  id: z.string(),
  type: z.literal('clinicalSession'),
  status: z.enum(['open', 'completed', 'archived']),
  stage: z.enum(['triage', 'exam', 'treatment', 'discharge']),
  triagePriority: z.enum(['red', 'yellow', 'green', 'unknown']),
  patientId: z.string().nullable(),
  formInstanceIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type ClinicalSession = z.infer<typeof ClinicalSessionSchema>;
```

---

## ⚙️ Session Engine

Create:

`app/services/sessionEngine.ts`

### Must support:

```ts
createSession(): Promise<ClinicalSession>
getSession(id: string): Promise<ClinicalSession>
getOpenSessionsByPriority(): Promise<ClinicalSession[]>
linkFormToSession(sessionId: string, formInstanceId: string): Promise<void>
recalculateTriage(sessionId: string): Promise<void>
advanceStage(sessionId: string): Promise<void>
```

---

## 🧠 Triage Logic

Rules (temporary defaults):

| Condition                | Result        |
| ------------------------ | ------------- |
| Any linked form with RED | Session → red |
| Else if any YELLOW       | yellow        |
| Else if all GREEN        | green         |
| Else                     | unknown       |

Use existing `clinicalCalculations.ts`.

---

## 📄 Timeline

Create:

`app/services/clinicalTimeline.ts`

```ts
append(sessionId, event)
getTimeline(sessionId)
```

Every form link and stage change must append.

---

## 🧭 UI

### Dashboard

Add **Open Sessions** button:

```ts
navigateTo('/sessions')
```

---

### `/sessions/index.vue`

* Use Nuxt UI table or cards
* Group by triagePriority
* Click → `/sessions/[id]`

---

### `/sessions/[id].vue`

Show:

* Current stage
* Timeline
* Linked forms
* Buttons:

  * Add Form
  * Advance Stage
  * Complete Session

---

## 🔗 Form Integration

On form creation:

```ts
if (route.query.sessionId) {
  await linkFormToSession(sessionId, instanceId)
}
```

---

## 🌐 Sync

* Sessions use same secureDb
* Must sync with CouchDB
* Conflicts logged to timeline

---

## ✅ Done When

* Sessions appear on dashboard
* Forms attach to sessions
* Triage updates automatically
* Works offline
* Syncs online

---

If you’d like, next I can:

* Convert this to a stricter task checklist
* Or write the CouchDB sync conflict rules for Phase 4.
