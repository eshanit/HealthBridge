# GP Dashboard UI Enhancement Feasibility Study

**Document Type:** Comprehensive Feasibility Assessment  
**Created:** February 17, 2026  
**Scope:** Evaluation of proposed UI enhancements from DASHBOARD_UI_ENHANCEMENT.md  
**Status:** Complete Analysis

---

## Executive Summary

This feasibility study evaluates the 7 proposed UI enhancements for the GP Dashboard against the existing infrastructure documented in GP-DASHBOARD-FEASIBILITY-AUDIT.md, DATABASE-SCHEMA.md, and API-ENDPOINTS.md.

**Overall Feasibility Rating: ✅ VIABLE WITH CONDITIONS**

| Enhancement | Feasibility | Confidence | Effort | Risk Level |
|-------------|-------------|------------|--------|------------|
| 3.1 Multi-Tab Patient List | ✅ High | 95% | 3 days | Low |
| 3.2 Global Patient Search | ✅ High | 98% | 1 day | Low |
| 3.3 Filter Chips | ✅ High | 99% | 1 day | Very Low |
| 3.4 Structured Prescription | ⚠️ Medium | 75% | 3 days | Medium |
| 3.5 Timeline View | ✅ High | 90% | 2 days | Low |
| 3.6 Interactive AI Guidance | ⚠️ Medium | 70% | 4 days | Medium |
| 3.7 Clinical Calculators | ✅ High | 95% | 2 days | Low |

**Total Estimated Effort:** 16 days (vs. 14 days in original estimate)

---

## 1. Enhancement 3.1: Multi-Tab Patient List

### 1.1 Technical Viability

**Rating: ✅ HIGHLY VIABLE**

The proposed multi-tab patient list is technically sound and aligns well with existing infrastructure.

#### Backend Analysis

| Requirement | Current Status | Gap Analysis |
|-------------|----------------|--------------|
| Referrals endpoint | ✅ `GET /gp/referrals` exists | None |
| My Cases endpoint | ⚠️ Partial | `inReview` and `underTreatment` exist as separate endpoints |
| All Patients endpoint | ❌ Missing | Need new `GET /gp/patients` with pagination |

**Existing API Support:**

From [`API-ENDPOINTS.md`](API-ENDPOINTS.md):
- `GET /gp/referrals` - Returns paginated referrals (lines 60-103)
- `GET /gp/in-review` - Returns sessions in GP review (lines 219-228)
- `GET /gp/under-treatment` - Returns sessions under treatment (lines 232-242)

**Gap:** The specification suggests merging `inReview` and `underTreatment` into a single `GET /gp/my-cases` endpoint with a `state` parameter. This is achievable but requires:

1. New route definition
2. New controller method that combines both queries
3. Query parameter handling for state filtering

#### Frontend Analysis

| Component | Status | Notes |
|-----------|--------|-------|
| `Tabs` component | ✅ Available | shadcn-vue Tabs not in current ui/ directory |
| `PatientQueue.vue` | ✅ Exists | Can be refactored into tab structure |
| Patient card component | ⚠️ Reusable | Need to extract from existing PatientQueue.vue |

**Missing shadcn-vue Components:**
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` - Need to be added

#### Database Alignment

From [`DATABASE-SCHEMA.md`](DATABASE-SCHEMA.md):

The `clinical_sessions` table already has:
- `workflow_state` field with all required states (lines 63-85)
- Proper indexes on `status`, `triage_priority` (line 88-91)
- Relationships to `patients`, `referrals`, `forms`, `comments`

**No database changes required.**

### 1.2 Resource Requirements

| Resource | Requirement |
|----------|-------------|
| Backend Developer | 1.5 days |
| Frontend Developer | 1.5 days |
| Testing | 0.5 days |

### 1.3 Dependencies

| Dependency | Status | Impact if Missing |
|------------|--------|-------------------|
| shadcn-vue Tabs | ⚠️ Not installed | Cannot implement tab UI |
| `GET /gp/patients` endpoint | ❌ Missing | Cannot populate "All Patients" tab |
| Patient model pagination | ✅ Ready | None |

### 1.4 Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Performance with large patient lists | Medium | Medium | Implement server-side pagination (already designed) |
| Tab state persistence | Low | Low | Use URL query params for tab state |
| Real-time updates across tabs | Medium | Medium | Leverage existing WebSocket infrastructure |

### 1.5 Recommendation

**PROCEED WITH IMPLEMENTATION**

**Confidence Level: 95%**

The multi-tab patient list is highly feasible. The main work involves:
1. Adding shadcn-vue Tabs components (simple npm install)
2. Creating a combined `my-cases` endpoint (straightforward)
3. Creating the `all-patients` endpoint with pagination (standard CRUD)

---

## 2. Enhancement 3.2: Global Patient Search

### 2.1 Technical Viability

**Rating: ✅ HIGHLY VIABLE**

#### Backend Analysis

From [`API-ENDPOINTS.md`](API-ENDPOINTS.md) lines 560-590:

```http
GET /gp/patients/search?q={query}
```

**Existing Implementation:**
- `PatientController@search` method exists
- Returns patients matching name, CPT, or phone
- Minimum 2 characters required
- Returns structured JSON response

**No backend changes required.**

#### Frontend Analysis

| Component | Status | Notes |
|-----------|--------|-------|
| `Command` component | ⚠️ Not installed | shadcn-vue Command needed |
| Debounced search | ✅ Standard | VueUse `useDebounceFn` available |
| Search state management | ✅ Standard | Vue 3 Composition API |

**Missing shadcn-vue Components:**
- `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`

### 2.2 Resource Requirements

| Resource | Requirement |
|----------|-------------|
| Frontend Developer | 0.75 days |
| Testing | 0.25 days |

### 2.3 Dependencies

| Dependency | Status | Impact if Missing |
|------------|--------|-------------------|
| shadcn-vue Command | ⚠️ Not installed | Cannot implement search dropdown |
| Search API | ✅ Ready | None |

### 2.4 Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Search performance with large datasets | Low | Medium | API already has search limits (10 results) |
| Debounce timing | Low | Low | Tune based on user feedback |

### 2.5 Recommendation

**PROCEED WITH IMPLEMENTATION**

**Confidence Level: 98%**

This is the most straightforward enhancement. Only requires adding the Command component from shadcn-vue and implementing the search UI.

---

## 3. Enhancement 3.3: Filter Chips

### 3.1 Technical Viability

**Rating: ✅ HIGHLY VIABLE**

#### Backend Analysis

The existing API endpoints already support filtering:

From [`API-ENDPOINTS.md`](API-ENDPOINTS.md):
- `GET /gp/referrals?priority={red|yellow|green}` (line 67-68)
- `GET /gp/referrals?search={query}` (line 69)

**No backend changes required.**

#### Frontend Analysis

| Component | Status | Notes |
|-----------|--------|-------|
| `Badge` component | ✅ Available | `ui/badge/Badge.vue` exists |
| Filter state management | ✅ Standard | Vue 3 reactivity |

### 3.2 Resource Requirements

| Resource | Requirement |
|----------|-------------|
| Frontend Developer | 0.75 days |
| Testing | 0.25 days |

### 3.3 Dependencies

| Dependency | Status | Impact if Missing |
|------------|--------|-------------------|
| Badge component | ✅ Ready | None |
| Filter query params | ✅ Ready | None |

### 3.4 Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Filter combination complexity | Low | Low | Start with single-filter, add multi-filter later |

### 3.5 Recommendation

**PROCEED WITH IMPLEMENTATION**

**Confidence Level: 99%**

This is the simplest enhancement with zero backend changes and all UI components available.

---

## 4. Enhancement 3.4: Structured Prescription Component

### 4.1 Technical Viability

**Rating: ⚠️ MODERATELY VIABLE**

This enhancement has the most significant architectural implications.

#### Backend Analysis

**Current State:**
From [`DATABASE-SCHEMA.md`](DATABASE-SCHEMA.md) line 67:
- `notes` field exists in `clinical_sessions` table (text type)
- No structured medication storage

**Proposed Change:**
Add `treatment_plan` JSON column to `clinical_sessions` table.

**Migration Required:**
```php
Schema::table('clinical_sessions', function (Blueprint $table) {
    $table->json('treatment_plan')->nullable()->after('notes');
});
```

**API Changes Required:**
1. New endpoint: `PUT /gp/sessions/{couchId}/treatment-plan`
2. Or extend existing: `POST /gp/sessions/{couchId}/transition` with treatment_plan metadata

**CouchDB Sync Implications:**
From [`GP-DASHBOARD-FEASIBILITY-AUDIT.md`](GP-DASHBOARD-FEASIBILITY-AUDIT.md) line 129:
- `SyncService` exists for CouchDB synchronization
- New field must be added to sync mapping
- Offline-first architecture must be preserved

#### Frontend Analysis

| Component | Status | Notes |
|-----------|--------|-------|
| `Table` components | ⚠️ Not installed | Need shadcn-vue Table |
| `Input` component | ✅ Available | `ui/input/Input.vue` exists |
| `Select` component | ✅ Available | `ui/select/` exists |
| `Card` components | ✅ Available | `ui/card/` exists |

**Missing shadcn-vue Components:**
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableHead`

### 4.2 Data Model Considerations

**Proposed Medication Interface:**
```typescript
interface Medication {
  id: string;
  name: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  instructions?: string;
}
```

**Storage Options:**

| Option | Pros | Cons |
|--------|------|------|
| JSON column in clinical_sessions | Simple, flexible | No relational queries |
| Separate medications table | Relational integrity | More complex, migration needed |
| Store in CouchDB only | Offline-first native | No MySQL analytics |

**Recommendation:** Use JSON column for MVP, consider separate table for Phase 2.

### 4.3 Resource Requirements

| Resource | Requirement |
|----------|-------------|
| Backend Developer | 1.5 days |
| Frontend Developer | 1 day |
| Database Migration | 0.25 days |
| Testing | 0.25 days |

### 4.4 Dependencies

| Dependency | Status | Impact if Missing |
|------------|--------|-------------------|
| Database migration | ❌ Required | Cannot store structured data |
| shadcn-vue Table | ⚠️ Not installed | Cannot render medication table |
| SyncService update | ❌ Required | Data won't sync to CouchDB |

### 4.5 Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Data model changes | High | High | Use JSON column for flexibility |
| CouchDB sync conflicts | Medium | High | Test thoroughly with offline scenarios |
| Medication validation | Medium | Medium | Implement server-side validation |
| Drug interaction checking | Low | Critical | Consider for Phase 2 |

### 4.6 Recommendation

**PROCEED WITH CAUTION**

**Confidence Level: 75%**

This enhancement requires careful planning:
1. Create migration for `treatment_plan` JSON column
2. Update `ClinicalSession` model fillable and casts
3. Update `SyncService` for bidirectional sync
4. Add validation for medication data
5. Consider drug database integration for Phase 2

---

## 5. Enhancement 3.5: Timeline View

### 5.1 Technical Viability

**Rating: ✅ HIGHLY VIABLE**

#### Backend Analysis

From [`API-ENDPOINTS.md`](API-ENDPOINTS.md) lines 246-286:

The `GET /gp/sessions/{couchId}` endpoint already returns:
- `session.referrals` - Referral history
- `session.forms` - Clinical forms
- `session.comments` - Case comments
- `session.ai_requests` - AI interactions
- `transition_history` - State transitions

**Data Available for Timeline:**

| Event Type | Source | Timestamp Field |
|------------|--------|-----------------|
| State changes | `state_transitions` | `created_at` |
| AI requests | `ai_requests` | `requested_at` |
| Comments | `case_comments` | `created_at` |
| Forms | `clinical_forms` | `created_at` |
| Referrals | `referrals` | `created_at` |

**Backend Enhancement Needed:**
Create a dedicated timeline endpoint that combines and sorts all events:

```php
// New method in ClinicalSessionController
public function timeline(string $couchId): JsonResponse
{
    $session = ClinicalSession::where('couch_id', $couchId)->firstOrFail();
    
    $timeline = collect([
        ...$session->stateTransitions->map(fn($t) => [
            'type' => 'state_change',
            'title' => "Status changed to {$t->to_state}",
            'timestamp' => $t->created_at,
            'user' => $t->user?->name,
        ]),
        ...$session->aiRequests->map(fn($r) => [
            'type' => 'ai_request',
            'title' => "AI Task: {$r->task}",
            'timestamp' => $r->requested_at,
            'user' => null,
        ]),
        // ... other event types
    ])->sortByDesc('timestamp')->values();
    
    return response()->json(['timeline' => $timeline]);
}
```

**No database changes required.**

#### Frontend Analysis

| Component | Status | Notes |
|-----------|--------|-------|
| Custom CSS timeline | ✅ Standard | No special components needed |
| Date formatting | ✅ Standard | Use date-fns or similar |

### 5.2 Resource Requirements

| Resource | Requirement |
|----------|-------------|
| Backend Developer | 0.5 days |
| Frontend Developer | 1 day |
| Testing | 0.5 days |

### 5.3 Dependencies

| Dependency | Status | Impact if Missing |
|------------|--------|-------------------|
| Session detail endpoint | ✅ Ready | None |
| State transitions | ✅ Ready | None |

### 5.4 Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Timeline performance with many events | Low | Low | Implement pagination |
| Event ordering accuracy | Low | Medium | Use consistent timestamps |

### 5.5 Recommendation

**PROCEED WITH IMPLEMENTATION**

**Confidence Level: 90%**

The timeline view is highly feasible as all data already exists. Only requires:
1. New backend endpoint to aggregate and sort events
2. Frontend component to render the timeline

---

## 6. Enhancement 3.6: Interactive AI Guidance

### 6.1 Technical Viability

**Rating: ⚠️ MODERATELY VIABLE**

This enhancement has significant AI safety and compliance implications.

#### Backend Analysis

From [`API-ENDPOINTS.md`](API-ENDPOINTS.md) lines 670-718:

**Existing AI Infrastructure:**
- `POST /api/ai/medgemma` endpoint exists
- `AiGuard` middleware validates role-task permissions
- Tasks available for `doctor` role:
  - `specialist_review`
  - `red_case_analysis`
  - `clinical_summary`
  - `handoff_report`
  - `explain_triage`

**New Requirements:**
1. `free_text` task type - Not currently defined
2. Predefined action mappings - Need configuration

**AI Safety Considerations:**

From [`GP-DASHBOARD-FEASIBILITY-AUDIT.md`](GP-DASHBOARD-FEASIBILITY-AUDIT.md) lines 253-259:

| Safety Requirement | Status |
|--------------------|--------|
| AI outputs marked "Support Only" | ✅ Implemented |
| No AI can change triage directly | ✅ Implemented |
| All AI calls logged | ✅ Implemented |
| Role-based access control | ✅ Implemented |

**New Safety Requirements for Free-Text:**
1. Input validation and sanitization
2. Prompt injection prevention
3. Response filtering for PII/PHI
4. Clear disclaimers in UI

**Prompt Engineering Required:**

From [`AI_GATEWAY.md`](../AI_GATEWAY.md):
- `PromptBuilder` service exists for task-specific prompts
- `OutputValidator` service exists for safety validation

**New Prompt Template Needed:**
```php
// In PromptBuilder
protected function buildFreeTextPrompt(string $question, array $context): string
{
    return <<<PROMPT
    You are a clinical decision support assistant. You MUST NOT:
    - Make definitive diagnoses
    - Prescribe medications
    - Override clinical judgments
    
    You CAN:
    - Provide differential diagnosis suggestions
    - Explain clinical concepts
    - Summarize relevant guidelines
    - Highlight potential concerns
    
    Patient Context: {context}
    
    Question: {question}
    
    Provide a helpful, educational response:
    PROMPT;
}
```

#### Frontend Analysis

| Component | Status | Notes |
|-----------|--------|-------|
| `Card` components | ✅ Available | For chat container |
| `Input` component | ✅ Available | For message input |
| `Button` component | ✅ Available | For send/actions |
| Message list | ✅ Standard | Custom component needed |

### 6.2 Resource Requirements

| Resource | Requirement |
|----------|-------------|
| Backend Developer | 1.5 days |
| AI/ML Engineer | 1 day (prompt engineering) |
| Frontend Developer | 1 day |
| Testing | 0.5 days |

### 6.3 Dependencies

| Dependency | Status | Impact if Missing |
|------------|--------|-------------------|
| AI Gateway | ✅ Ready | None |
| Prompt templates | ⚠️ Partial | Need free_text template |
| Safety validation | ✅ Ready | None |
| Ollama service | ✅ Configured | None |

### 6.4 Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| AI hallucination | Medium | Critical | Strong prompt constraints, output validation |
| Prompt injection | Medium | High | Input sanitization, prompt boundaries |
| Response latency | High | Medium | Loading states, streaming responses |
| Clinical safety | Medium | Critical | Clear disclaimers, human oversight |

### 6.5 Recommendation

**PROCEED WITH CAUTION**

**Confidence Level: 70%**

This enhancement requires:
1. Careful prompt engineering for free-text queries
2. Enhanced input/output validation
3. Clear UI disclaimers
4. Clinical stakeholder review before deployment

**Suggested Approach:**
1. Start with predefined actions only (lower risk)
2. Add free-text in Phase 2 after safety validation
3. Implement response caching for common queries

---

## 7. Enhancement 3.7: Clinical Calculators

### 7.1 Technical Viability

**Rating: ✅ HIGHLY VIABLE**

#### Backend Analysis

**Option 1: Frontend-only (Recommended for MVP)**
- All calculations done client-side
- No backend changes required
- Drug dosage tables embedded in frontend

**Option 2: Backend API**
- New endpoint: `POST /api/calculators/dosage`
- More complex but allows for:
  - Drug database integration
  - Audit logging
  - Validation against patient data

**Recommendation:** Start with Option 1, migrate to Option 2 if needed.

#### Frontend Analysis

| Component | Status | Notes |
|-----------|--------|-------|
| `Sheet` component | ✅ Available | `ui/sheet/` exists |
| `Input` component | ✅ Available | For numeric inputs |
| `Select` component | ✅ Available | For drug selection |
| `Label` component | ✅ Available | `ui/label/` exists |

**Calculator Libraries:**
- Weight-based dosage: Custom logic (simple)
- Growth charts: `chart.js` or `recharts` (need to add)
- GCS calculator: Custom logic (simple)
- Parkland formula: Custom logic (simple)

**Missing Dependencies:**
- Charting library for growth charts (optional for MVP)

### 7.2 Resource Requirements

| Resource | Requirement |
|----------|-------------|
| Frontend Developer | 1.5 days |
| Clinical validation | 0.25 days |
| Testing | 0.25 days |

### 7.3 Dependencies

| Dependency | Status | Impact if Missing |
|------------|--------|-------------------|
| Sheet component | ✅ Ready | None |
| Chart library | ⚠️ Optional | Cannot render growth charts |

### 7.4 Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Calculation errors | Low | Critical | Thorough testing, clinical validation |
| Outdated drug dosages | Medium | High | Use WHO/clinical guidelines, version data |
| Growth chart accuracy | Medium | Medium | Use standard WHO z-score data |

### 7.5 Recommendation

**PROCEED WITH IMPLEMENTATION**

**Confidence Level: 95%**

Clinical calculators are highly feasible:
1. All UI components available
2. Calculations are deterministic and testable
3. Can be implemented incrementally
4. Low risk if properly validated

**Suggested Implementation Order:**
1. Weight-based dosage calculator (highest value)
2. GCS calculator (simple)
3. Parkland formula (simple)
4. Growth charts (requires chart library)

---

## 8. Cross-Cutting Concerns

### 8.1 Offline-First Architecture

From [`DASHBOARD_UI_ENHANCEMENT.md`](DASHBOARD_UI_ENHANCEMENT.md) lines 382-387:

> All enhancements must preserve the existing **offline‑first** architecture.

**Impact Assessment:**

| Enhancement | Offline Support | Mitigation |
|-------------|-----------------|------------|
| Multi-Tab Patient List | ✅ Compatible | Cache patient lists locally |
| Global Search | ⚠️ Limited | Show cached results, indicate offline |
| Filter Chips | ✅ Compatible | Client-side filtering on cached data |
| Structured Prescription | ⚠️ Complex | Queue changes for sync |
| Timeline View | ✅ Compatible | Cache timeline data |
| Interactive AI | ❌ Not Available | Show "AI unavailable offline" message |
| Clinical Calculators | ✅ Fully Compatible | No network required |

### 8.2 Real-Time Updates

From [`GP-DASHBOARD-FEASIBILITY-AUDIT.md`](GP-DASHBOARD-FEASIBILITY-AUDIT.md) lines 131:

WebSocket infrastructure exists via Laravel Reverb.

**Enhancements Requiring Real-Time:**
- Multi-Tab Patient List (new referrals, state changes)
- Timeline View (new events)

**Implementation:**
```javascript
// Subscribe to session updates
Echo.channel('gp.dashboard')
    .listen('SessionStateChanged', (e) => {
        // Update patient list
    })
    .listen('ReferralCreated', (e) => {
        // Add to referral queue
    });
```

### 8.3 Security & Compliance

**Authentication:** All endpoints require `auth` + `verified` + `role:doctor|admin`

**Audit Logging:**
- State transitions: ✅ Logged via `StateTransition` model
- AI requests: ✅ Logged via `AiRequest` model
- Prescription changes: ⚠️ Need to add logging

**Data Protection:**
- Patient data in transit: ✅ HTTPS
- Patient data at rest: ✅ Database encryption
- CouchDB sync: ✅ Encrypted

---

## 9. Missing shadcn-vue Components

The following components need to be added from shadcn-vue:

| Component | Required For | Installation Command |
|-----------|--------------|---------------------|
| `Tabs` | Multi-Tab Patient List | `npx shadcn-vue@latest add tabs` |
| `Command` | Global Search | `npx shadcn-vue@latest add command` |
| `Table` | Structured Prescription | `npx shadcn-vue@latest add table` |

**Estimated Time:** 30 minutes to install and configure all components.

---

## 10. Implementation Roadmap (Revised)

### Phase 1: Foundation (Days 1-3)
**Priority: HIGH**

| Task | Enhancement | Effort |
|------|-------------|--------|
| Install missing shadcn-vue components | All | 0.5 days |
| Create `GET /gp/patients` endpoint | 3.1 | 0.5 days |
| Create `GET /gp/my-cases` endpoint | 3.1 | 0.5 days |
| Implement Multi-Tab Patient List | 3.1 | 1.5 days |

### Phase 2: Quick Wins (Days 4-5)
**Priority: HIGH**

| Task | Enhancement | Effort |
|------|-------------|--------|
| Implement Global Patient Search | 3.2 | 1 day |
| Implement Filter Chips | 3.3 | 1 day |

### Phase 3: Data Enhancements (Days 6-9)
**Priority: MEDIUM**

| Task | Enhancement | Effort |
|------|-------------|--------|
| Add `treatment_plan` JSON column | 3.4 | 0.25 days |
| Update SyncService for treatment_plan | 3.4 | 0.5 days |
| Implement Structured Prescription UI | 3.4 | 1.5 days |
| Create timeline aggregation endpoint | 3.5 | 0.5 days |
| Implement Timeline View | 3.5 | 1.5 days |

### Phase 4: AI & Utilities (Days 10-14)
**Priority: MEDIUM-LOW**

| Task | Enhancement | Effort |
|------|-------------|--------|
| Create free_text prompt template | 3.6 | 0.5 days |
| Implement AI chat UI (predefined only) | 3.6 | 1.5 days |
| Add free_text support (with safety review) | 3.6 | 1.5 days |
| Implement Clinical Calculators | 3.7 | 2 days |

### Phase 5: Testing & Polish (Days 15-16)
**Priority: HIGH**

| Task | Effort |
|------|--------|
| Integration testing | 1 day |
| Performance optimization | 0.5 days |
| Documentation | 0.5 days |

---

## 11. Resource Summary

### 11.1 Development Effort

| Role | Days | Cost (Est. $500/day) |
|------|------|---------------------|
| Backend Developer | 6.5 | $3,250 |
| Frontend Developer | 7.5 | $3,750 |
| AI/ML Engineer | 1 | $500 |
| QA/Testing | 2 | $1,000 |
| **Total** | **17** | **$8,500** |

### 11.2 Infrastructure Requirements

| Resource | Status | Notes |
|----------|--------|-------|
| MySQL | ✅ Ready | No schema changes except treatment_plan |
| CouchDB | ✅ Ready | SyncService update needed |
| Redis | ⚠️ Optional | For caching, not required |
| Ollama | ✅ Ready | Already configured |

---

## 12. Final Recommendations

### 12.1 Proceed Immediately (High Confidence)

1. **Multi-Tab Patient List** - Core functionality improvement
2. **Global Patient Search** - High value, low effort
3. **Filter Chips** - Quick win
4. **Clinical Calculators** - Standalone, low risk

### 12.2 Proceed with Planning (Medium Confidence)

5. **Timeline View** - Requires backend endpoint but straightforward
6. **Structured Prescription** - Requires database migration and sync updates

### 12.3 Proceed with Caution (Requires Safety Review)

7. **Interactive AI Guidance** - Start with predefined actions only, add free-text after clinical safety validation

### 12.4 Suggested Phased Approach

**Phase 1A (Week 1):** Multi-Tab Patient List + Search + Filters
**Phase 1B (Week 2):** Timeline + Calculators
**Phase 1C (Week 3):** Structured Prescription
**Phase 1D (Week 4):** Interactive AI (predefined actions only)
**Phase 2:** Free-text AI, drug database integration, advanced calculators

---

## 13. Conclusion

The proposed UI enhancements are **technically viable** and align well with the existing HealthBridge GP Dashboard infrastructure. The main considerations are:

1. **Database Changes:** Only the structured prescription requires a schema migration
2. **Component Availability:** Three shadcn-vue components need to be installed
3. **AI Safety:** Free-text AI queries require careful prompt engineering and safety validation
4. **Offline Support:** Most features are compatible; AI features will be unavailable offline

**Overall Recommendation: PROCEED WITH IMPLEMENTATION**

The estimated 16-day timeline is achievable with the current team and infrastructure. The enhancements will significantly improve GP workflow efficiency without disrupting the existing offline-first architecture.

---

*Feasibility Study prepared by: KiloCode*  
*Date: February 17, 2026*  
*Cross-referenced with: GP-DASHBOARD-FEASIBILITY-AUDIT.md, DATABASE-SCHEMA.md, API-ENDPOINTS.md*
