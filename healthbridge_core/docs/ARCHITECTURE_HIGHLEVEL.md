Below is a **comprehensive, phased build spec** for your Laravel‑based clinical web app. It’s structured to be used directly with **KiloCode** (or any code‑generation tool) and gives you a clear understanding of the entire project before you start Phase 0.

---

# 🏥 HealthBridge Specialist Web App – Build Specification

## 1. Project Overview

**Goal**  
Build a secure, auditable web application for **specialists, doctors, managers, and AI governance leads**.  
The app will:

- Mirror clinical data from your existing CouchDB (synced from mobile devices) into a **MySQL database**.
- Provide **dashboards, case review, and referral management**.
- Expose a **Laravel AI Gateway** using **MedGemma (via Ollama)** for tasks like radiology reporting, clinical summarisation, and decision support.
- Enable a closed‑learning loop where audit feedback can update rules and prompts.

**Target Users & Roles**  
- **Nurses / Senior Nurses** – view assigned cases, review triage, add comments.  
- **Doctors / Specialists** (radiologists, dermatologists, etc.) – accept referrals, use AI for image interpretation (text‑based), generate summaries.  
- **Managers** – dashboards, quality metrics, AI safety monitoring.  
- **Admins** – manage users, roles, and prompt versions.

---

## 2. System Architecture

```plaintext
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │     │   CouchDB       │     │   MySQL         │
│   (Nuxt+Pouch)  │────▶│ (source of truth│◀────│ (operational    │
│                 │     │  for clinical   │     │  mirror)        │
└─────────────────┘     │  documents)     │     └────────┬────────┘
                        └────────┬────────┘              │
                                 │                       │
                                 │ changes feed          │
                                 ▼                       │
                        ┌─────────────────┐              │
                        │   Sync Worker   │──────────────┘
                        │ (Laravel daemon)│
                        └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Laravel App    │
                        │  - Auth/RBAC    │
                        │  - Dashboards   │
                        │  - Case Review  │
                        │  - Referrals    │
                        │  - AI Gateway   │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Ollama         │
                        │  (MedGemma)     │
                        └─────────────────┘
```

- **CouchDB** remains the master store; changes are pushed to MySQL via a long‑running Laravel worker (listening to `_changes` feed).  
- **MySQL** holds denormalised, query‑friendly tables for dashboards and AI lookups.  
- **AI Gateway** is a set of Laravel endpoints that validate user permissions, build role‑specific prompts, call Ollama, sanitise output, and log everything.  
- **Web UI** built with Laravel + Livewire (or Inertia) for fast development.

---

## 3. Phased Development Plan

### Phase 0 – Foundation (2–3 weeks)
**Objective**: Set up the Laravel project, authentication, roles, and the CouchDB → MySQL sync worker.

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| 0.1  | Create new Laravel 11 project, install Sanctum and Spatie/laravel-permission (or native Gates). | Project runs, migrations work. |
| 0.2  | Define user roles: `nurse`, `senior-nurse`, `doctor`, `radiologist`, `dermatologist`, `manager`, `admin`. Seed a test user. | Users can be assigned roles. |
| 0.3  | Create MySQL tables: `patients`, `clinical_sessions`, `clinical_forms`, `ai_requests` (plus `raw_response`). | Migrations up/down, proper foreign keys. |
| 0.4  | Build a **CouchDB sync worker** (Laravel command). It should: <br>– Connect to CouchDB via Guzzle.<br>– Listen to the `_changes` feed (continuous).<br>– For each change, fetch the document and upsert into MySQL (use `updateOrCreate`).<br>– Handle conflicts (last‑write‑wins, flag in a `conflicts` field). | After seeding CouchDB with test docs, MySQL is updated within ~5 seconds. |
| 0.5  | Run the worker as a daemon using Supervisor. | Worker restarts on failure, logs errors. |

**Deliverable**: A Laravel app with authenticated users and a continuously synced MySQL mirror of CouchDB clinical data.

---

### Phase 1 – AI Gateway (2–3 weeks)
**Objective**: Build a secure, role‑based AI endpoint using Laravel AI SDK + MedGemma.

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| 1.1  | Install `laravel/ai` package, configure Ollama driver in `config/ai.php` (base URL, model). | AI facade can call Ollama. |
| 1.2  | Create `config/ai_policy.php` defining allowed tasks per role (e.g., `nurse` → `explain_triage`, `radiologist` → `imaging_interpretation`). | Central policy file exists. |
| 1.3  | Create middleware `AiGuard` that checks if the authenticated user can perform the requested `task`. | Middleware blocks unauthorized tasks. |
| 1.4  | Implement `PromptBuilder` service. Start with versioned prompts stored in a DB table `prompt_versions` (id, task, version, content, created_at). | Prompts are loaded dynamically. |
| 1.5  | Build `AIGatewayController` with a POST endpoint `/api/ai/medgemma`. It should: <br>– Validate request: `task`, `context` (array).<br>– Fetch additional context from MySQL (patient, session, form answers) using `ContextBuilder`.<br>– Build prompt via `PromptBuilder`.<br>– Call Ollama via `AI::complete()`.<br>– Sanitise output via `OutputValidator` (block keywords like "diagnose", "prescribe").<br>– Log full request/response in `ai_requests` table.<br>– Return safe JSON. | Endpoint works with test calls; logs are complete. |
| 1.6  | Apply rate limiting (`throttle:ai`) and authentication (Sanctum). | Rate limit kicks in after configurable attempts. |
| 1.7  | Write feature tests for safety (blocked phrases, role access). | Tests pass. |

**Deliverable**: A production‑ready AI gateway that serves role‑specific, audited AI completions.

---

### Phase 2 – Basic Dashboards & Case Review (2–3 weeks)
**Objective**: Provide initial UI for clinical oversight and AI monitoring.

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| 2.1  | Set up Livewire (or Inertia) for interactive components. | Simple counter component works. |
| 2.2  | Build **Clinical Quality Dashboard** (view for managers): <br>– Triage distribution chart (red/yellow/green) over last 7/30 days.<br>– Referral compliance (percentage of RED cases referred).<br>– Antibiotic usage trends (from treatment forms).<br>– Missed danger signs (from audit logs). | Charts render with real MySQL data. |
| 2.3  | Build **AI Safety Console** (view for admins): <br>– List recent AI requests with user, task, prompt (truncated), safe output.<br>– Show override rates (if you have a field for user override).<br>– Flag high‑risk outputs (keyword matches). | Filterable table, exportable. |
| 2.4  | Build **Case Review page**: <br>– List sessions (patient short code, priority, status, date).<br>– Click into a session to see: patient details, form answers, triage result, AI explainability logs.<br>– Allow authorised users (doctors, senior nurses) to add comments (store in `case_comments` table). | Comments appear on case detail page. |
| 2.5  | Enforce role‑based access: managers see aggregated data only; doctors see identifiable (but de‑identified) cases. | RBAC works for all pages. |

**Deliverable**: A functional web app with dashboards and case review.

---

### Phase 3 – Referral & RED‑Case Workflow (2 weeks)
**Objective**: Automate handoff of high‑priority patients to specialists.

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| 3.1  | Create `referrals` table: `id`, `session_id`, `referring_user_id`, `assigned_to` (specialist user ID), `status` (pending/accepted/rejected), `notes`, `timestamps`. | Migration complete. |
| 3.2  | When a RED‑case assessment is completed (detected via CouchDB sync), automatically create a referral to a specialist group (e.g., using a round‑robin assignment). | New referral appears in list. |
| 3.3  | Build **Specialist Workbench**: <br>– List of pending referrals for the logged‑in specialist.<br>– Accept/reject buttons; if accepted, case becomes assigned.<br>– Add clinical notes. | Workflow works end‑to‑end. |
| 3.4  | Add **notifications**: <br>– Use Laravel Notifications + database channel to store in‑app notifications.<br>– Optionally integrate Pusher for real‑time alerts.<br>– Notify specialist when new RED case arrives. | Specialist sees badge/notification. |
| 3.5  | Extend case review page to show referral status and allow specialists to jump directly. | Status displayed. |

**Deliverable**: RED cases are automatically escalated; specialists can accept and act on them.

---

### Phase 4 – Advanced Governance & Learning Loop (2–3 weeks)
**Objective**: Close the feedback loop from audits to rule/prompt updates.

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| 4.1  | Enhance `ai_requests` to store `prompt_version` and `triage_ruleset_version` (from session data). | Columns added, populated. |
| 4.2  | Build **Prompt & Rule Registry** admin interface: <br>– List all prompt versions with ability to view diff.<br>– List triage rules (if stored in DB) and their versions.<br>– Allow admins to mark a new version as active. | Active prompt is used by gateway. |
| 4.3  | Create a **Learning Dashboard**: <br>– Show override rate per rule/prompt version.<br>– Highlight cases where AI advice was overridden for manual review. | Metrics computed from logs. |
| 4.4  | Add a **feedback form** on each reviewed case: specialist can suggest rule changes (e.g., “This danger sign was missed”). Store suggestions in a `rule_suggestions` table. | Suggestions are saved and viewable by admins. |
| 4.5  | Admin can approve a suggestion and publish a new rule version; upon publish, trigger a sync to mobile (e.g., update a `rules_version` doc in CouchDB). | Mobile receives new rule version on next sync. |

**Deliverable**: Closed‑loop system where clinical insights improve AI behaviour.

---

### Phase 5 – Production Hardening & Scaling (ongoing)
**Objective**: Ensure reliability, security, and performance.

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| 5.1  | Implement caching for identical AI prompts (hash‑based) to reduce load. | Repeated identical requests return cached response. |
| 5.2  | Monitor Ollama with Prometheus/Grafana; set up alerts for downtime. | Alerts fire on failure. |
| 5.3  | Run load tests on AI gateway; tune database indexes on `ai_requests` and sync tables. | Response times acceptable under load. |
| 5.4  | Conduct security audit (penetration test) on all endpoints. | No critical vulnerabilities. |
| 5.5  | Document disaster recovery: backup CouchDB and MySQL; restore procedure. | DR document reviewed. |

---

## 4. Key Technical Decisions

- **Sync Worker**: Use a long‑running Laravel command (listening to `_changes` feed) rather than cron to achieve near‑real‑time updates (≤4 seconds). Supervisor ensures it stays alive.
- **AI Safety**: OutputValidator blocks known dangerous phrases; can be extended with a small local model for semantic safety.
- **Prompt Versioning**: Store prompts in DB to allow A/B testing and rollback without redeploying.
- **De‑identification**: Patient names are optional; use `short_code` across all systems. Never store identifiable info in MySQL.
- **UI Stack**: Livewire is recommended for rapid development and security (no API tokens needed for internal pages). Inertia is an option if you want to reuse Vue components from mobile.

---

## 5. Next Steps – Starting Phase 0

1. **Set up Laravel project** with your preferred stack (I recommend Laravel 11, Sanctum, inertia).
2. **Create the database migrations** for the tables listed in 0.3.
3. **Build the CouchDB sync worker** as a console command; test with a local CouchDB instance seeded with sample documents.
4. **Implement basic authentication** (e.g., Laravel Breeze or Jetstream) and assign roles.
5. **Run the sync worker** via Supervisor in development to verify MySQL updates.

Once Phase 0 is complete, you’ll have a solid foundation to start building the AI gateway and dashboards.

---

