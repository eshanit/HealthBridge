# GP Dashboard Feasibility Audit

**Document Type:** Technical Feasibility Assessment  
**Created:** February 15, 2026  
**Scope:** Phase 1 GP Dashboard Development  
**Status:** Ready for Review

---

## Executive Summary

This audit evaluates the technical feasibility of implementing the GP Dashboard for HealthBridge Phase 1. After reviewing the design brief, UI specifications, and wireframes, **the project is technically viable** with existing infrastructure, but requires careful attention to workflow state management and real-time data synchronization.

**Overall Feasibility Rating: ✅ VIABLE**

| Category | Rating | Notes |
|----------|--------|-------|
| Data Model | ✅ Ready | Existing models support 90% of requirements |
| API Layer | ✅ Ready | All GP endpoints implemented in routes/gp.php |
| UI Components | ✅ Ready | All GP Dashboard components implemented |
| AI Integration | ✅ Ready | AI Gateway already implemented |
| State Management | ✅ Ready | WorkflowStateMachine service fully implemented |
| Real-time Updates | ✅ Ready | Laravel Reverb WebSocket broadcasting implemented |

---

## 1. Requirements Analysis

### 1.1 Core Functional Requirements

| Requirement | Priority | Complexity | Status |
|-------------|----------|------------|--------|
| GP Referral Queue | HIGH | Medium | ✅ API + UI Complete |
| Patient Workspace | HIGH | High | ✅ Components implemented |
| Workflow State Machine | HIGH | High | ✅ WorkflowStateMachine service |
| AI Explainability Panel | MEDIUM | Low | ✅ AI Gateway + UI ready |
| Clinical Tabs (5 tabs) | HIGH | Medium | ✅ All 5 tabs implemented |
| Audit Strip | MEDIUM | Low | ✅ Component implemented |
| New Patient Registration | HIGH | Medium | ✅ API + UI Complete |

### 1.2 Workflow State Analysis

The brief specifies these states:

| State | Description | Database Support |
|-------|-------------|------------------|
| `NEW` | Just registered | ✅ `status = 'open'` |
| `TRIAGED` | Assessment completed | ✅ `stage = 'assessment'` |
| `REFERRED` | Sent to another provider | ✅ Referral model exists |
| `IN_GP_REVIEW` | GP is reviewing | ✅ `WORKFLOW_IN_GP_REVIEW` constant |
| `UNDER_TREATMENT` | GP treatment started | ✅ `WORKFLOW_UNDER_TREATMENT` constant |
| `CLOSED` | Encounter completed | ✅ `status = 'completed'` |

**Note:** The `ClinicalSession` model now uses `workflow_state` field with dedicated constants for all GP workflow states.

---

## 2. Existing Infrastructure Assessment

### 2.1 Database Models (Already Implemented)

| Model | Table | GP Dashboard Relevance | Status |
|-------|-------|------------------------|--------|
| `Patient` | `patients` | Patient demographics | ✅ Ready |
| `ClinicalSession` | `clinical_sessions` | Visit/encounter tracking | ⚠️ Needs state updates |
| `ClinicalForm` | `clinical_forms` | Form data | ✅ Ready |
| `Referral` | `referrals` | Referral tracking | ✅ Ready |
| `AiRequest` | `ai_requests` | AI audit logging | ✅ Ready |
| `CaseComment` | `case_comments` | Case notes | ✅ Ready |
| `PromptVersion` | `prompt_versions` | Prompt management | ✅ Ready |
| `User` | `users` | User management | ✅ Ready |

### 2.2 AI Gateway (Already Implemented)

| Component | Status | GP Dashboard Usage |
|-----------|--------|-------------------|
| `OllamaClient` | ✅ Ready | MedGemma integration |
| `PromptBuilder` | ✅ Ready | Task-specific prompts |
| `ContextBuilder` | ✅ Ready | Patient context assembly |
| `OutputValidator` | ✅ Ready | Safety validation |
| `AiGuard` middleware | ✅ Ready | Role-based access |
| `MedGemmaController` | ✅ Ready | API endpoint |

**AI Tasks Available for GP (doctor role):**
- `specialist_review` - Generate specialist review summary
- `red_case_analysis` - Analyze RED case for specialist review
- `clinical_summary` - Generate clinical summary
- `handoff_report` - Generate SBAR-style handoff report
- `explain_triage` - Explain triage classification

### 2.3 Frontend Stack (Already Configured)

| Technology | Status | Notes |
|------------|--------|-------|
| Vue 3 + TypeScript | ✅ Ready | Via Inertia.js |
| shadcn-vue | ✅ Ready | UI components available |
| Tailwind CSS | ✅ Ready | Styling |
| Lucide Icons | ✅ Ready | Icon library |

---

## 3. Implementation Gap Analysis

### 3.1 Backend Gaps

| Gap | Impact | Effort | Status |
|-----|--------|--------|--------|
| GP-specific API endpoints | HIGH | 2-3 days | ✅ Completed - `GPDashboardController` & `ClinicalSessionController` |
| Workflow state transitions | HIGH | 1-2 days | ✅ Completed - `WorkflowStateMachine` service |
| State transition logging | MEDIUM | 1 day | ✅ Completed - `StateTransition` model |
| Real-time queue updates | MEDIUM | 1-2 days | ✅ WebSocket via Laravel Reverb with polling fallback |
| New patient registration API | HIGH | 1 day | ✅ Completed - `PatientController` |

### 3.2 Frontend Gaps

| Gap | Impact | Effort | Status |
|-----|--------|--------|--------|
| GP Dashboard layout | HIGH | 2-3 days | ✅ Completed - `pages/gp/Dashboard.vue` |
| Patient Queue component | HIGH | 1-2 days | ✅ Completed - `pages/gp/components/PatientQueue.vue` |
| Patient Workspace component | HIGH | 3-4 days | ✅ Completed - `pages/gp/components/PatientWorkspace.vue` |
| AI Explainability Panel | MEDIUM | 1 day | ✅ Completed - `pages/gp/components/AIExplainabilityPanel.vue` |
| Audit Strip component | LOW | 0.5 day | ✅ Completed - `pages/gp/components/AuditStrip.vue` |
| Clinical tabs (5 tabs) | HIGH | 2-3 days | ✅ Completed - See tabs/ directory |

### 3.3 Integration Gaps

| Gap | Impact | Effort | Status |
|-----|--------|--------|--------|
| CouchDB → MySQL sync for GP states | MEDIUM | 1 day | ✅ Completed - SyncService with workflow_state support |
| Referral auto-creation for RED cases | MEDIUM | 0.5 day | ✅ Completed - ClinicalSessionObserver |
| Real-time WebSocket updates | MEDIUM | 1-2 days | ✅ Completed - Laravel Reverb |

---

## 4. Technical Architecture Recommendations

### 4.1 Proposed API Endpoints

```php
// routes/web.php or routes/api.php

// GP Dashboard
Route::middleware(['auth', 'role:doctor'])->group(function () {
    Route::get('/gp/dashboard', [GPDashboardController::class, 'index']);
    Route::get('/gp/referrals', [GPDashboardController::class, 'referrals']);
    Route::get('/gp/referrals/{id}', [GPDashboardController::class, 'showReferral']);
    Route::post('/gp/referrals/{id}/accept', [GPDashboardController::class, 'acceptReferral']);
    Route::post('/gp/referrals/{id}/reject', [GPDashboardController::class, 'rejectReferral']);
    
    // Patient Management
    Route::post('/patients', [PatientController::class, 'store']);
    Route::get('/patients/{cpt}', [PatientController::class, 'show']);
    
    // Clinical Sessions
    Route::get('/sessions/{id}', [ClinicalSessionController::class, 'show']);
    Route::post('/sessions/{id}/transition', [ClinicalSessionController::class, 'transition']);
    Route::post('/sessions/{id}/close', [ClinicalSessionController::class, 'close']);
    
    // AI Integration (already exists)
    Route::post('/api/ai/medgemma', [MedGemmaController::class, '__invoke']);
});
```

### 4.2 Workflow State Machine

**Status: ✅ IMPLEMENTED**

The `WorkflowStateMachine` service is fully implemented at [`app/Services/WorkflowStateMachine.php`](../../app/Services/WorkflowStateMachine.php).

**Features:**
- State transition validation
- Transition reason tracking
- Audit logging via `StateTransition` model
- Convenience methods for common transitions (acceptReferral, rejectReferral, startTreatment, closeSession)
- Frontend configuration endpoint

**Supported States:**
- `NEW` → `TRIAGED`
- `TRIAGED` → `REFERRED`, `UNDER_TREATMENT`, `CLOSED`
- `REFERRED` → `IN_GP_REVIEW`, `CLOSED`
- `IN_GP_REVIEW` → `UNDER_TREATMENT`, `REFERRED`, `CLOSED`
- `UNDER_TREATMENT` → `CLOSED`, `IN_GP_REVIEW`
- `CLOSED` (terminal state)

### 4.3 Frontend Component Structure

**Status: ✅ IMPLEMENTED**

```
resources/js/pages/gp/
├── Dashboard.vue              # Main GP dashboard ✅
├── components/
│   ├── PatientQueue.vue       # Left panel queue ✅
│   ├── PatientWorkspace.vue   # Main work area ✅
│   ├── PatientHeader.vue      # Patient context header ✅
│   ├── ClinicalTabs.vue       # Tab container ✅
│   ├── tabs/
│   │   ├── SummaryTab.vue     # Triage summary & vitals ✅
│   │   ├── AssessmentTab.vue  # Clinical assessment form ✅
│   │   ├── DiagnosticsTab.vue # Lab & imaging orders ✅
│   │   ├── TreatmentTab.vue   # Treatment plan & disposition ✅
│   │   └── AIGuidanceTab.vue  # AI clinical tasks ✅
│   ├── AIExplainabilityPanel.vue # Right sidebar AI panel ✅
│   └── AuditStrip.vue         # Footer activity log ✅
```

**Additional Components Created:**
- `resources/js/components/ui/textarea/Textarea.vue` - Reusable textarea component

---

## 5. Resource Requirements

### 5.1 Development Effort Estimate

| Phase | Tasks | Estimated Effort |
|-------|-------|------------------|
| **Phase 1A: Data & State** | Schema updates, state machine, sync | 3-4 days |
| **Phase 1B: Referral Dashboard** | API, queue UI, patient list | 3-4 days |
| **Phase 1C: Consultation Flow** | Workspace, tabs, AI panel | 5-6 days |
| **Phase 1D: Governance** | Audit logs, state logs, override tracking | 2-3 days |
| **Testing & Polish** | Integration tests, bug fixes | 2-3 days |
| **Total** | | **15-20 days** |

### 5.2 Technical Dependencies

| Dependency | Required | Status |
|------------|----------|--------|
| PHP 8.2+ | Yes | ✅ Installed |
| Laravel 11 | Yes | ✅ Installed |
| MySQL | Yes | ✅ Configured |
| CouchDB | Yes | ✅ Configured |
| Ollama + gemma3:4b | Yes | ✅ Configured (gemma3:4b default, medgemma:27b optional) |
| Redis (optional) | No | For caching/queues |
| Pusher (optional) | No | For real-time updates |

---

## 6. Risk Assessment

### 6.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| State machine complexity | Medium | High | Use proven library or simple implementation |
| Real-time sync delays | Medium | Medium | Implement polling fallback |
| AI response latency | High | Medium | Add loading states, caching |
| Offline data conflicts | Low | High | Use CouchDB revision system |
| UI complexity | Medium | Medium | Break into small components |

### 6.2 Clinical Safety Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| AI misinterpretation | Medium | Critical | Clear "Support Only" labeling |
| State transition errors | Low | High | Audit logging, confirmation dialogs |
| Data sync loss | Low | Critical | CouchDB revision tracking |
| Wrong patient selection | Medium | Critical | Patient verification step |

---

## 7. Implementation Roadmap

### Phase 1A: Data & State (Days 1-4)

**Objective:** Establish data foundation and workflow state machine

| Task | Description | Deliverable | Status |
|------|-------------|-------------|--------|
| 1A.1 | Add workflow states to `ClinicalSession` | Migration + model update | ✅ Completed |
| 1A.2 | Create `StateTransition` model for audit | Migration + model | ✅ Completed |
| 1A.3 | Implement `WorkflowStateMachine` service | Service class | ✅ Completed |
| 1A.4 | Update `SyncService` for new states | Service update | ✅ Completed |
| 1A.5 | Add referral auto-creation for RED cases | ClinicalSessionObserver | ✅ Completed |

### Phase 1B: Referral Dashboard (Days 5-8)

**Objective:** GP can view and manage referral queue

| Task | Description | Deliverable | Status |
|------|-------------|-------------|--------|
| 1B.1 | Create `GPDashboardController` | Controller | ✅ Completed |
| 1B.2 | Implement referral queue API | API endpoints | ✅ Completed |
| 1B.3 | Create `Dashboard.vue` page | Vue component | ✅ Completed |
| 1B.4 | Create `PatientQueue.vue` component | Vue component | ✅ Completed |
| 1B.5 | Add real-time polling | Frontend polling | ✅ Completed (30s interval) |

### Phase 1C: Consultation Flow (Days 9-14)

**Objective:** GP can perform full consultation workflow

| Task | Description | Deliverable | Status |
|------|-------------|-------------|--------|
| 1C.1 | Create `PatientWorkspace.vue` | Vue component | ✅ Completed |
| 1C.2 | Create `PatientHeader.vue` | Vue component | ✅ Completed |
| 1C.3 | Create 5 clinical tab components | Vue components | ✅ Completed |
| 1C.4 | Create `AIExplainabilityPanel.vue` | Vue component | ✅ Completed |
| 1C.5 | Implement state transition UI | Vue + API | ✅ Completed |
| 1C.6 | Create new patient registration | Vue + API | ✅ Completed |

### Phase 1D: Governance (Days 15-18)

**Objective:** Complete audit trail and compliance

| Task | Description | Deliverable | Status |
|------|-------------|-------------|--------|
| 1D.1 | Create `AuditStrip.vue` | Vue component | ✅ Completed |
| 1D.2 | Implement state transition logging | Service + model | ✅ Completed |
| 1D.3 | Add override tracking | Model update | ✅ Completed |
| 1D.4 | Create audit viewer | Vue component | ⚠️ Needs implementation |

### Testing & Polish (Days 19-20)

| Task | Description | Deliverable |
|------|-------------|-------------|
| T.1 | Integration tests | Test files |
| T.2 | Bug fixes | Bug fixes |
| T.3 | Performance optimization | Code optimization |

---

## 8. Success Criteria

### 8.1 Functional Success Criteria

- [x] GP can view referral queue sorted by priority
- [x] GP can accept/reject referrals
- [x] GP can view patient summary with triage data
- [x] GP can access AI explainability for each case
- [x] GP can record diagnosis and treatment
- [x] GP can close patient encounters
- [x] All state transitions are logged
- [x] All AI calls are logged with audit trail

### 8.2 Technical Success Criteria

- [ ] Page load time < 2 seconds
- [ ] AI response time < 5 seconds (with Ollama running)
- [ ] Zero data loss on sync conflicts
- [x] 100% audit coverage for clinical actions
- [ ] All tests passing

### 8.3 Clinical Safety Criteria

- [x] AI outputs clearly marked as "Support Only"
- [x] No AI output can change triage directly
- [ ] All overrides require confirmation
- [ ] Patient verification before critical actions

---

## 9. Recommendations

### 9.1 Immediate Actions

1. **Approve workflow state machine design** - Critical for all subsequent work
2. **Set up Ollama with MedGemma** - Required for AI features
3. **Create GP role in database** - Required for authorization

### 9.2 Technical Recommendations

1. **Use polling for MVP** - Simpler than WebSockets, can upgrade later
2. **Implement state machine as service** - Not database triggers, for flexibility
3. **Build components incrementally** - Start with queue, add workspace later
4. **Add comprehensive logging** - Critical for clinical audit

### 9.3 Process Recommendations

1. **Daily standups during Phase 1** - Rapid iteration needed
2. **Clinical stakeholder review after each phase** - Ensure workflow accuracy
3. **Security review before production** - Healthcare data protection

---

## 10. Conclusion

The GP Dashboard is **technically viable** with the existing HealthBridge infrastructure. The primary work involves:

1. **Backend:** New API endpoints and workflow state machine
2. **Frontend:** New Vue components for dashboard and workspace
3. **Integration:** Connecting existing AI Gateway to clinical workflow

The estimated timeline of **15-20 days** is achievable with the current team and infrastructure. The main risks are around state machine complexity and AI latency, both of which have clear mitigation strategies.

**Recommendation: PROCEED WITH IMPLEMENTATION**

---

*Audit prepared by: KiloCode*  
*Date: February 15, 2026*
