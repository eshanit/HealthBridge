# Phase 4 Cross-Compatibility Feasibility Assessment

**Assessment Date:** 2026-02-14
**Documents Analyzed:** 6 Phase 4 specification documents
**Purpose:** Identify conflicts, gaps, and breaking changes required for full safety governance compliance

---

## Executive Summary

### Overall Phase 4 Coherence: **MODERATE** ⚠️

The Phase 4 documentation set demonstrates strong alignment on core safety principles ("Rules decide. AI explains.") but reveals **significant structural conflicts** in data model definitions, overlapping service responsibilities, and missing integration specifications between the Safety Governance layer and the Explainability Engine.

**Key Findings:**
- ✅ **Strong alignment** on core safety principles across all documents
- ⚠️ **Data model conflicts** between `ExplainabilityRecord` and `ExplainabilityModel`
- ❌ **Missing integration** between Safety Governance services and Explainability Engine
- ❌ **Undefined API contracts** for safe-stream endpoint
- ⚠️ **Overlapping responsibilities** between `contradictionDetector` and `explainabilityEngine`

**Risk Level:** MEDIUM - Requires reconciliation before implementation

---

## Document Inventory

| Document | Location | Primary Focus |
|----------|----------|---------------|
| SAFETY_GOVERNANCE.md | `docs/flows/PHASE-4-SAFETY_GOVERNANCE.md` | Safety control plane architecture |
| SAFETY_RULES.md | `docs/flows/PHASE-4/SAFETY_RULES.md` | AI safety rules framework |
| CLINICAL_EXPLAINABILITY.md | `docs/flows/PHASE-4/CLINICAL_EXPLAINABILITY.md` | Explainability data model |
| CLINICAL_EXPLAINABILITY_TRIAGE.md | `docs/flows/PHASE-4/CLINICAL_EXPLAINABILITY_TRIAGE.md` | Triage-to-explainability mapping |
| UI_EXPLAINABILITY_CARD.md | `docs/flows/PHASE-4/UI_EXPLAINABILITY_CARD.md` | UI component specification |
| PHASE_4_START.md | `docs/prompts/PHASE_4_START.md` | Implementation task specification |

---

## Section-by-Section Compatibility Matrix

### 1. Data Model Compatibility

#### 1.1 Explainability Model Definitions

**CONFLICT IDENTIFIED** 🔴

Two different data models are defined for the same concept:

| Aspect | CLINICAL_EXPLAINABILITY.md | CLINICAL_EXPLAINABILITY_TRIAGE.md |
|--------|---------------------------|-----------------------------------|
| Interface Name | `ExplainabilityRecord` | `ExplainabilityModel` |
| ID Field | `id: string` | ❌ Missing |
| Session ID | `sessionId: string` | ❌ Missing |
| Form Instance ID | `formInstanceId: string` | ❌ Missing |
| Timestamp | `timestamp: string` | ❌ Missing |
| Confidence | `confidence: number` | ❌ Missing |
| Reasoning Chain | `reasoningChain: {step, description}[]` | ❌ Missing |
| Disclaimers | `disclaimers: string[]` | `safetyNotes: string[]` (different name) |

**Breaking Change Required:**
- `CLINICAL_EXPLAINABILITY_TRIAGE.md` lines 46-73 define a simplified model
- `CLINICAL_EXPLAINABILITY.md` lines 39-76 define a comprehensive model
- **Recommendation:** Adopt `ExplainabilityRecord` as the canonical model and update `CLINICAL_EXPLAINABILITY_TRIAGE.md` to use it

#### 1.2 Triage Output Schema

**ALIGNED** ✅

All documents agree on the source data structure:
```ts
assessment.calculated = {
  triagePriority: "red" | "yellow" | "green",
  matchedTriageRule: { id, priority, actions[] },
  ruleMatches: [{ ruleId, condition, matched, value }]
}
```

Referenced in:
- `PHASE_4_START.md` lines 8-24
- `CLINICAL_EXPLAINABILITY_TRIAGE.md` lines 12-34

---

### 2. Safety Governance Compatibility

#### 2.1 Safety Service Architecture

**SAFETY_GOVERNANCE.md** defines 7 services:

| Service | Purpose | Integration Status |
|---------|---------|-------------------|
| `inputSanitizer.ts` | Remove PHI, strip injection | ❌ Not referenced in other docs |
| `promptGuardrails.ts` | Inject safety constraints | ❌ Not referenced in other docs |
| `outputValidator.ts` | Detect unsafe patterns | ⚠️ Partial overlap with SAFETY_RULES.md |
| `contradictionDetector.ts` | Compare AI vs calculated | ⚠️ Overlaps with explainabilityEngine |
| `riskScorer.ts` | Score AI output risk | ❌ Not referenced in other docs |
| `auditLogger.ts` | Log all AI interactions | ⚠️ Partial overlap with CLINICAL_EXPLAINABILITY.md audit section |
| `safetyOrchestrator.ts` | Coordinate safety flow | ❌ Not referenced in other docs |

**Gap Identified:**
- `CLINICAL_EXPLAINABILITY.md` section 8 (lines 152-159) requires audit logging but doesn't reference `auditLogger.ts`
- `SAFETY_RULES.md` section 10 (lines 151-160) requires logging but doesn't specify service

#### 2.2 Output Validation Patterns

**CONFLICT IDENTIFIED** 🔴

`SAFETY_GOVERNANCE.md` lines 79-91 define validation patterns:

| Pattern | Action |
|---------|--------|
| `/\b\d+\s?(mg\|ml\|kg)/i` | BLOCK |
| `/prescribe\|dose/i` | BLOCK |
| `/diagnose/i` | REDACT |
| `/change triage/i` | FLAG |

**SAFETY_RULES.md** section 4 (lines 66-78) defines scope guard with different behavior:
- Refuses questions about diseases, drugs, dosages
- Uses response template instead of pattern matching

**Conflict:** Two different enforcement mechanisms for similar constraints

**Recommendation:** Merge pattern-based validation (SAFETY_GOVERNANCE) with scope guard rules (SAFETY_RULES)

#### 2.3 Risk Scoring

**SAFETY_GOVERNANCE.md** lines 109-118 define risk scores:

| Signal | Score |
|--------|-------|
| Rule conflict | +5 |
| Dosage mention | +5 |
| Diagnosis claim | +3 |
| Absolutes | +2 |
| Missing data refs | +1 |

**Gap:** No threshold defined for when risk score triggers action
**Gap:** No integration with UI risk badges defined in `UI_EXPLAINABILITY_CARD.md`

---

### 3. Explainability Engine Compatibility

#### 3.1 Service Location

**CONFLICT IDENTIFIED** 🔴

Two different file locations specified:

| Document | Location |
|----------|----------|
| `PHASE_4_START.md` line 44 | `app/services/explainabilityEngine.ts` |
| `CLINICAL_EXPLAINABILITY_TRIAGE.md` line 83 | `app/services/explainabilityEngine.ts` |
| `SAFETY_GOVERNANCE.md` line 31-37 | `/server/ai-safety/` directory (different structure) |

**Recommendation:** Clarify if `explainabilityEngine.ts` is a client-side service or server-side safety service

#### 3.2 Contradiction Detection Overlap

**OVERLAP IDENTIFIED** ⚠️

| Service | Document | Responsibility |
|---------|----------|----------------|
| `contradictionDetector.ts` | SAFETY_GOVERNANCE.md lines 95-103 | Compare AI priority vs calculated triage |
| `explainabilityEngine.ts` | CLINICAL_EXPLAINABILITY_TRIAGE.md | Build explainability from calculated |

Both services need to:
1. Access `calculated.triagePriority`
2. Compare with AI output
3. Flag mismatches

**Recommendation:** `contradictionDetector.ts` should consume output from `explainabilityEngine.ts`

#### 3.3 Narrative Generation

**ALIGNED** ✅

`PHASE_4_START.md` lines 137-140 and `CLINICAL_EXPLAINABILITY_TRIAGE.md` lines 117 define the same narrative generator pattern.

---

### 4. UI Integration Compatibility

#### 4.1 ExplainabilityCard Component

**PARTIAL ALIGNMENT** ⚠️

`UI_EXPLAINABILITY_CARD.md` specifies:
- Component: `<ExplainabilityCard :model="explainabilityModel" />`
- Data binding to `ExplainabilityModel` (simplified version)

**Conflict:** Uses `ExplainabilityModel` from `CLINICAL_EXPLAINABILITY_TRIAGE.md` but `CLINICAL_EXPLAINABILITY.md` defines `ExplainabilityRecord` with additional fields

**Missing Fields in UI Spec:**
- `id` - not displayed
- `sessionId` - not displayed
- `formInstanceId` - not displayed
- `timestamp` - not displayed
- `confidence` - not displayed
- `reasoningChain` - not displayed

#### 4.2 Risk Badge Display

**SAFETY_GOVERNANCE.md** line 171 requires:
> Show: Safe text, Risk badge 🟢🟡🔴, "AI is advisory only" disclaimer

**UI_EXPLAINABILITY_CARD.md** does not specify:
- Risk badge component
- Risk score threshold for each color
- Integration with `riskScorer.ts`

#### 4.3 Session Escalation

**SAFETY_GOVERNANCE.md** lines 181-185 require:
> If 3+ warnings: Disable AI suggestions, Display alert banner

**Gap:** No UI component specified for:
- Warning counter
- Alert banner
- AI disable toggle

---

### 5. API Endpoint Compatibility

#### 5.1 Safe-Stream Endpoint

**SAFETY_GOVERNANCE.md** line 159 specifies:
```
POST /api/ai/safe-stream
```

**Gap:** No request/response contract defined

**CLINICAL_EXPLAINABILITY.md** section 3 (lines 81-97) shows pipeline:
```
Assessment Data → Rule Engine → Explainability Builder → AI Explanation Renderer
```

**Missing Integration:**
- How does `safe-stream` call `explainabilityEngine`?
- How does `safe-stream` integrate with `safetyOrchestrator`?
- What is the request payload structure?

#### 5.2 Existing AI Endpoints

**Gap:** No analysis of existing endpoints:
- `/api/ai/stream.post.ts` (exists in project)
- How does Phase 4 integrate with existing streaming?

---

### 6. Audit & Logging Compatibility

#### 6.1 Audit Log Structure

**SAFETY_GOVERNANCE.md** lines 123-135:
```ts
{
  sessionId,
  model,
  task,
  violations,
  riskScore,
  action,
  timestamp
}
```

**CLINICAL_EXPLAINABILITY.md** section 8 (lines 152-159) requires:
- Stored with session
- Immutable
- Timestamped
- Linked to user actions

**Gap:** No specification for:
- CouchDB database name (`ai_audit_logs` mentioned but not configured)
- Document structure for CouchDB
- Retention policy
- Query patterns for audit reports

---

## Breaking Changes Required

### Priority 1: Critical (Must Fix Before Implementation)

| ID | Issue | Files Affected | Resolution |
|----|-------|----------------|------------|
| BC-1 | Data model conflict | CLINICAL_EXPLAINABILITY_TRIAGE.md:46-73 | Adopt `ExplainabilityRecord` as canonical |
| BC-2 | Missing API contract | SAFETY_GOVERNANCE.md:159 | Define request/response schema |
| BC-3 | Service location conflict | PHASE_4_START.md:44, SAFETY_GOVERNANCE.md:31 | Clarify client vs server services |

### Priority 2: High (Should Fix)

| ID | Issue | Files Affected | Resolution |
|----|-------|----------------|------------|
| BC-4 | Overlapping contradiction detection | SAFETY_GOVERNANCE.md:95-103, CLINICAL_EXPLAINABILITY_TRIAGE.md:78-131 | Define service boundaries |
| BC-5 | Missing risk threshold | SAFETY_GOVERNANCE.md:109-118 | Define thresholds for 🟢🟡🔴 |
| BC-6 | UI missing risk badge | UI_EXPLAINABILITY_CARD.md | Add risk badge specification |

### Priority 3: Medium (Nice to Have)

| ID | Issue | Files Affected | Resolution |
|----|-------|----------------|------------|
| BC-7 | Missing session escalation UI | SAFETY_GOVERNANCE.md:181-185 | Add alert banner spec |
| BC-8 | Audit log storage undefined | SAFETY_GOVERNANCE.md:137 | Define CouchDB integration |
| BC-9 | Missing confidence display | UI_EXPLAINABILITY_CARD.md | Add confidence indicator |

---

## Gaps in Safety Governance Coverage

### Gap 1: Input Sanitization Integration

**SAFETY_GOVERNANCE.md** requires `inputSanitizer.ts` but:
- No specification for what constitutes PHI in clinical context
- No integration with existing form validation
- No error handling for sanitized inputs

### Gap 2: Prompt Guardrails Template

**SAFETY_GOVERNANCE.md** lines 63-72 define guardrails but:
- No template variable system for dynamic injection
- No versioning for guardrail updates
- No A/B testing capability

### Gap 3: Kill Switch Implementation

**SAFETY_RULES.md** section 13 (lines 189-195) mentions:
> Admin can: Disable AI, Restrict to explanations only, Force referral mode

**Missing:**
- Admin UI specification
- Feature flag system
- Runtime configuration

### Gap 4: Kill Switch Integration with Safety Orchestrator

**SAFETY_GOVERNANCE.md** `safetyOrchestrator.ts` flow (lines 143-152) does not include:
- Kill switch check
- Feature flag evaluation
- Admin override handling

### Gap 5: Existing Code Integration

No Phase 4 document addresses:
- Integration with existing `useAIStream.ts` composable
- Integration with existing `AIStreamingPanel.vue` component
- Migration path from current AI implementation

---

## Prioritized Recommendations

### Immediate Actions (Before Implementation)

1. **Reconcile Data Models** (BC-1)
   - File: `CLINICAL_EXPLAINABILITY_TRIAGE.md`
   - Lines: 46-73
   - Action: Replace `ExplainabilityModel` with `ExplainabilityRecord` from `CLINICAL_EXPLAINABILITY.md`

2. **Define Safe-Stream API Contract** (BC-2)
   - File: `SAFETY_GOVERNANCE.md`
   - Lines: After line 159
   - Action: Add request/response schema:
   ```ts
   // Request
   interface SafeStreamRequest {
     sessionId: string;
     promptType: 'triage_explanation' | 'treatment_guidance' | 'general';
     assessmentData: ClinicalFormInstance;
     userQuestion?: string;
   }
   
   // Response
   interface SafeStreamResponse {
     safeText: string;
     riskScore: number;
     riskBadge: 'green' | 'yellow' | 'red';
     violations: string[];
     explainabilityRecord: ExplainabilityRecord;
     blocked: boolean;
   }
   ```

3. **Clarify Service Architecture** (BC-3)
   - Files: `PHASE_4_START.md`, `SAFETY_GOVERNANCE.md`
   - Action: Define which services are:
     - Client-side composables (`app/composables/`)
     - Server-side services (`server/ai-safety/`)
     - Shared utilities (`app/services/`)

### Short-Term Actions (During Implementation)

4. **Define Service Boundaries** (BC-4)
   - Create integration diagram showing:
     - `explainabilityEngine.ts` → produces `ExplainabilityRecord`
     - `contradictionDetector.ts` → consumes `ExplainabilityRecord`
     - `safetyOrchestrator.ts` → coordinates all services

5. **Add Risk Badge Specification** (BC-5, BC-6)
   - File: `UI_EXPLAINABILITY_CARD.md`
   - Add:
   ```
   | Risk Score | Badge | Color |
   |------------|-------|-------|
   | 0-2 | 🟢 | #43A047 |
   | 3-5 | 🟡 | #FBC02D |
   | 6+ | 🔴 | #E53935 |
   ```

6. **Add Session Escalation UI** (BC-7)
   - File: `UI_EXPLAINABILITY_CARD.md`
   - Add alert banner specification for 3+ warnings

### Long-Term Actions (Post-Implementation)

7. **Define Audit Storage** (BC-8)
   - Create CouchDB design document for `ai_audit_logs`
   - Define retention policy
   - Create audit query views

8. **Add Confidence Display** (BC-9)
   - Add confidence meter to `ExplainabilityCard`
   - Define confidence thresholds

9. **Document Existing Code Integration**
   - Create migration guide from current AI implementation
   - Define backward compatibility requirements

---

## Conclusion

Phase 4 documentation demonstrates strong conceptual alignment on safety principles but requires reconciliation before implementation. The primary risks are:

1. **Data model fragmentation** - Two competing interfaces for explainability
2. **Service boundary ambiguity** - Unclear separation between safety and explainability services
3. **Missing integration specifications** - No contracts between components

**Recommended Next Steps:**
1. Create unified `ExplainabilityRecord` interface
2. Define service architecture diagram with clear boundaries
3. Create API contracts for all inter-service communication
4. Update all Phase 4 documents to reference unified specifications

---

**Assessment Complete**
