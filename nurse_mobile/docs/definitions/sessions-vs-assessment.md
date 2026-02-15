Based on my analysis of the codebase, here's the difference between the two routes:

## Two Routes in the Dashboard

### 1. **"Open Sessions" → "Start New Session"** (Queue-based Route)
- **Location**: Dashboard → [Open Sessions](app/pages/sessions/index.vue:71) → [New Session Button](app/components/clinical/QueueView.vue:124)
- **What it does**: Creates an empty session with [`createSession()`](app/services/sessionEngine.ts:147)
- **Initial State**: 
  - Stage: `registration`
  - Triage: `unknown`
  - Status: `open`
  - No forms linked yet
- **Patient enters the queue** and is visible in QueueView grouped by priority (red/yellow/green)

### 2. **"New Assessment"** (Direct Route)
- **Location**: Dashboard → [New Assessment button](app/pages/dashboard.vue:521)
- **What it does**: Goes to [assessment type selection](app/pages/assessment/new.vue:42) first, then creates both session + form
- **Purpose**: Jump straight into a specific assessment type

---

## When to Use Each Route

| Scenario | Route | Why |
|----------|-------|-----|
| **Patient arrives, needs full workflow** | Start Session | Patient enters queue, tracked through registration → assessment → treatment → discharge stages |
| **Quick follow-up or known assessment type** | New Assessment | Skip registration, go directly to specific form (e.g., "Peds Respiratory") |
| **Need to prioritize patients** | Start Session | Session appears in queue with triage priority, can be seen by other staff |
| **Standing orders, routine checks** | New Assessment | Faster for predefined assessment types without queue overhead |
| **Patient needs multiple forms** | Start Session | Session tracks all linked forms in one place |
| **Casual/triage encounter** | New Assessment | Lightweight, no queue management needed |

---

## Key Distinction

- **Start Session** = Patient-centric workflow. The patient is the focus, gets queued, and you work through stages together.
- **New Assessment** = Form-centric workflow. You know what assessment you want, and it may or may not create a session depending on the implementation path.

In practice, **Start Session** is the more common entry point for new patients since it establishes their presence in the clinical workflow and enables proper triage and queue management.