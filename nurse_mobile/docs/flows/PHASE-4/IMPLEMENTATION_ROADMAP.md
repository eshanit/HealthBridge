# Phase 4 Implementation Roadmap

**Generated:** 2026-02-14
**Status:** Pre-Implementation Review
**Strategy:** First-Used Wins (Existing Implementation Priority)

---

## Executive Summary

After analyzing the existing codebase against Phase 4 specifications, **significant portions of Phase 4 are already implemented**. This roadmap identifies what exists, what needs enhancement, and what is missing.

### Key Finding

The existing implementation already provides:
- ✅ `ExplainabilityRecord` interface (canonical data model)
- ✅ `explainabilityEngine.ts` service
- ✅ `safetyRules.ts` with context validation, scope guards, output filtering
- ✅ `explainabilityMaps.ts` with WHO IMCI references
- ✅ `ExplainabilityCard.vue` UI component
- ✅ `aiAudit.ts` audit logging

**Phase 4 is approximately 60% complete** based on existing code.

---

## Part 1: Existing Implementation Analysis

### 1.1 Data Model (ALREADY EXISTS)

**File:** [`app/types/explainability.ts`](app/types/explainability.ts)

The canonical `ExplainabilityRecord` interface is already defined:

```typescript
export interface ExplainabilityRecord {
  id: string;
  sessionId: string;
  assessmentInstanceId: string;
  timestamp: string;
  classification: {
    priority: Priority;
    label: string;
    protocol: 'WHO_IMCI';
  };
  reasoning: {
    primaryRule: { id, description, source };
    triggers: Array<{ fieldId, value, threshold?, explanation, clinicalMeaning }>;
    clinicalNarrative: string;
  };
  recommendedActions: Array<{ code, label, justification, whoReference? }>;
  safetyNotes: string[];
  confidence: number;
  dataCompleteness: number;
  aiEnhancement?: { used, useCase, modelVersion? };
}
```

**Resolution:** Phase 4 documentation should reference this existing model. No changes needed.

### 1.2 Explainability Engine (ALREADY EXISTS)

**File:** [`app/services/explainabilityEngine.ts`](app/services/explainabilityEngine.ts)

Already implements:
- `buildExplainabilityModel(assessment, options)` - Main builder function
- `getPriorityLabel(priority)` - Priority to label mapping
- `formatValue(value)` - Value formatting
- `generateId()` - ID generation
- AI narrative generation via `ollamaService`
- Fallback to rule-based narrative

**Resolution:** Enhance with Phase 4 safety orchestration integration.

### 1.3 Safety Rules (ALREADY EXISTS)

**File:** [`app/services/safetyRules.ts`](app/services/safetyRules.ts)

Already implements:
- `validateClinicalContext(context)` - Session/assessment/triage validation
- `checkScope(input)` - Blocked pattern detection
- `filterOutput(text)` - Dangerous pattern detection
- `checkRiskEscalation(params)` - Priority-based escalation
- `performSafetyCheck(input, context)` - Combined safety check
- `sanitizeOutput(text)` - Output sanitization

**Resolution:** This covers most of `outputValidator.ts` and `promptGuardrails.ts` from SAFETY_GOVERNANCE.md.

### 1.4 Explainability Maps (ALREADY EXISTS)

**File:** [`app/data/explainabilityMaps.ts`](app/data/explainabilityMaps.ts)

Already has:
- `RULE_EXPLANATIONS` - 12 rule explanations with WHO references
- `ACTION_LABELS` - 18 action labels with justifications
- `CLINICAL_TERMS_MAP` - Clinical term definitions
- `PRIORITY_CONFIG` - Priority colors, icons, labels

**Resolution:** Already exceeds Phase 4 spec requirements.

### 1.5 UI Component (ALREADY EXISTS)

**File:** [`app/components/clinical/ExplainabilityCard.vue`](app/components/clinical/ExplainabilityCard.vue)

Already implements:
- Priority-based styling (red/yellow/green)
- Trigger display with clinical meanings
- Recommended actions with justifications
- Safety notes display
- AI enhancement indicator
- Structured response support (inconsistencies, teaching notes, next steps)
- Accessibility features

**Resolution:** Add risk badge display per SAFETY_GOVERNANCE.md.

### 1.6 Audit Logging (ALREADY EXISTS)

**File:** [`app/services/aiAudit.ts`](app/services/aiAudit.ts)

Already implements:
- `logAICall()` - Log AI interactions
- `AIAuditLog` interface with sessionId, useCase, explainabilityId, etc.

**Resolution:** Integrate with `safetyOrchestrator.ts` for violation logging.

---

## Part 2: Gap Analysis

### 2.1 Missing Components

| Component | Spec Reference | Status | Priority |
|-----------|---------------|--------|----------|
| `inputSanitizer.ts` | SAFETY_GOVERNANCE.md:42-54 | ❌ Missing | HIGH |
| `promptGuardrails.ts` | SAFETY_GOVERNANCE.md:57-73 | ⚠️ Partial (in safetyRules.ts) | MEDIUM |
| `outputValidator.ts` | SAFETY_GOVERNANCE.md:76-91 | ⚠️ Partial (in safetyRules.ts) | MEDIUM |
| `contradictionDetector.ts` | SAFETY_GOVERNANCE.md:95-103 | ❌ Missing | HIGH |
| `riskScorer.ts` | SAFETY_GOVERNANCE.md:107-118 | ❌ Missing | HIGH |
| `auditLogger.ts` | SAFETY_GOVERNANCE.md:121-137 | ⚠️ Partial (aiAudit.ts exists) | LOW |
| `safetyOrchestrator.ts` | SAFETY_GOVERNANCE.md:141-152 | ❌ Missing | CRITICAL |
| `/api/ai/safe-stream` | SAFETY_GOVERNANCE.md:157-162 | ❌ Missing | CRITICAL |
| Risk Badge UI | SAFETY_GOVERNANCE.md:168-175 | ❌ Missing | HIGH |
| Session Escalation UI | SAFETY_GOVERNANCE.md:181-185 | ❌ Missing | MEDIUM |
| Kill Switch | SAFETY_RULES.md:189-195 | ❌ Missing | MEDIUM |

### 2.2 Integration Gaps

| Gap | Description | Resolution |
|-----|-------------|------------|
| Safe-stream API | No endpoint wrapping MedGemma calls | Create new endpoint |
| Risk scoring | No numerical risk score calculation | Create riskScorer.ts |
| Contradiction detection | No AI vs calculated comparison | Create contradictionDetector.ts |
| Safety orchestration | No coordinated safety flow | Create safetyOrchestrator.ts |

---

## Part 3: Integration Strategy

### 3.1 Principle: First-Used Wins

When conflicts arise between Phase 4 specs and existing implementation:

1. **Existing code is canonical** - Do not modify existing interfaces
2. **Specs adapt to code** - Update documentation to match implementation
3. **Enhance, don't replace** - Add missing functionality without breaking changes
4. **Wrap, don't rewrite** - Create new services that consume existing ones

### 3.2 Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Phase 4 Safety Layer                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐    ┌─────────────────────┐           │
│  │ safetyOrchestrator  │───▶│  riskScorer.ts      │           │
│  │     (NEW)           │    │     (NEW)           │           │
│  └─────────┬───────────┘    └─────────────────────┘           │
│            │                                                    │
│            ▼                                                    │
│  ┌─────────────────────┐    ┌─────────────────────┐           │
│  │ inputSanitizer.ts   │    │contradictionDetector│           │
│  │     (NEW)           │    │     (NEW)           │           │
│  └─────────┬───────────┘    └─────────────────────┘           │
│            │                                                    │
│            ▼                                                    │
│  ┌─────────────────────────────────────────────────┐           │
│  │            EXISTING SERVICES                     │           │
│  ├─────────────────────────────────────────────────┤           │
│  │ • safetyRules.ts (scope, output filtering)      │           │
│  │ • explainabilityEngine.ts (model building)      │           │
│  │ • aiAudit.ts (logging)                          │           │
│  │ • clinicalAI.ts (AI calls)                      │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 API Integration

**Existing:** `/api/ai/stream.post.ts` (streaming AI responses)

**New:** `/api/ai/safe-stream.post.ts` (wraps existing with safety)

```typescript
// safe-stream.post.ts wraps stream.post.ts
import { safetyOrchestrator } from '~/server/ai-safety/safetyOrchestrator';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  
  // 1. Sanitize input
  const sanitized = await safetyOrchestrator.sanitizeInput(body);
  
  // 2. Apply guardrails
  const guarded = await safetyOrchestrator.applyGuardrails(sanitized);
  
  // 3. Call existing AI service
  const aiResponse = await callExistingAIService(guarded);
  
  // 4. Validate output
  const validated = await safetyOrchestrator.validateOutput(aiResponse);
  
  // 5. Detect contradictions
  const contradictions = await safetyOrchestrator.detectContradictions(validated, body.context);
  
  // 6. Score risk
  const riskScore = await safetyOrchestrator.scoreRisk(validated, contradictions);
  
  // 7. Log
  await safetyOrchestrator.log(body.sessionId, validated, riskScore);
  
  // 8. Return or block
  if (riskScore > 7) {
    return { blocked: true, reason: 'Risk threshold exceeded' };
  }
  
  return { ...validated, riskScore, contradictions };
});
```

---

## Part 4: Implementation Tasks

### Phase 4.1: Core Safety Services (Week 1)

#### Task 4.1.1: Create `inputSanitizer.ts`

**File:** `server/ai-safety/inputSanitizer.ts`

```typescript
export interface SanitizationResult {
  sanitized: string;
  removed: string[];
  warnings: string[];
}

export function sanitizeInput(input: string): SanitizationResult {
  const removed: string[] = [];
  const warnings: string[] = [];
  
  // Remove PHI patterns
  // Remove prompt injection attempts
  // Enforce max length
  // Escape markdown/HTML
  
  return { sanitized: input, removed, warnings };
}
```

**Dependencies:** None (new file)
**Breaking Changes:** None

#### Task 4.1.2: Create `riskScorer.ts`

**File:** `server/ai-safety/riskScorer.ts`

```typescript
export interface RiskScore {
  total: number;
  breakdown: {
    ruleConflict: number;
    dosageMention: number;
    diagnosisClaim: number;
    absolutes: number;
    missingDataRefs: number;
  };
  level: 'green' | 'yellow' | 'red';
}

export function calculateRiskScore(params: {
  output: string;
  contradictions: string[];
  context: { priority: string };
}): RiskScore {
  let total = 0;
  
  // Rule conflict: +5
  if (params.contradictions.length > 0) total += 5;
  
  // Dosage mention: +5
  if (/\b\d+\s?(mg|ml|kg)\b/i.test(params.output)) total += 5;
  
  // Diagnosis claim: +3
  if (/diagnos/i.test(params.output)) total += 3;
  
  // Absolutes: +2
  if (/\b(will|definitely|certainly|guaranteed)\b/i.test(params.output)) total += 2;
  
  // Missing data refs: +1
  if (/I don't have|missing|incomplete/i.test(params.output)) total += 1;
  
  const level = total <= 2 ? 'green' : total <= 5 ? 'yellow' : 'red';
  
  return { total, breakdown: {...}, level };
}
```

**Dependencies:** None (new file)
**Breaking Changes:** None

#### Task 4.1.3: Create `contradictionDetector.ts`

**File:** `server/ai-safety/contradictionDetector.ts`

```typescript
import type { ExplainabilityRecord } from '~/types/explainability';

export interface Contradiction {
  type: 'priority_mismatch' | 'action_conflict' | 'data_inconsistency';
  description: string;
  severity: 'warning' | 'error';
}

export function detectContradictions(params: {
  aiOutput: string;
  explainability: ExplainabilityRecord;
}): Contradiction[] {
  const contradictions: Contradiction[] = [];
  
  // Check priority mismatch
  const aiPriority = extractPriorityFromText(params.aiOutput);
  if (aiPriority && aiPriority !== params.explainability.classification.priority) {
    contradictions.push({
      type: 'priority_mismatch',
      description: `AI suggests ${aiPriority} but system calculated ${params.explainability.classification.priority}`,
      severity: 'error'
    });
  }
  
  // Check action conflicts
  // Check data inconsistencies
  
  return contradictions;
}
```

**Dependencies:** `ExplainabilityRecord` from existing types
**Breaking Changes:** None

### Phase 4.2: Safety Orchestration (Week 1-2)

#### Task 4.2.1: Create `safetyOrchestrator.ts`

**File:** `server/ai-safety/safetyOrchestrator.ts`

```typescript
import { sanitizeInput } from './inputSanitizer';
import { calculateRiskScore } from './riskScorer';
import { detectContradictions } from './contradictionDetector';
import { performSafetyCheck, sanitizeOutput } from '~/services/safetyRules';
import { logAICall } from '~/services/aiAudit';

export const safetyOrchestrator = {
  async processRequest(input: SafetyRequest): Promise<SafetyResponse> {
    // 1. Sanitize input
    const sanitized = sanitizeInput(input.userQuestion);
    
    // 2. Apply existing safety rules
    const safetyCheck = performSafetyCheck(sanitized.sanitized, input.context);
    if (!safetyCheck.allowed) {
      return { blocked: true, reason: safetyCheck.reason };
    }
    
    // 3. Get AI response (call existing service)
    const aiResponse = await this.getAIResponse(input);
    
    // 4. Validate output
    const outputCheck = sanitizeOutput(aiResponse);
    
    // 5. Detect contradictions
    const contradictions = detectContradictions({
      aiOutput: outputCheck,
      explainability: input.explainability
    });
    
    // 6. Score risk
    const riskScore = calculateRiskScore({
      output: outputCheck,
      contradictions: contradictions.map(c => c.description),
      context: { priority: input.explainability.classification.priority }
    });
    
    // 7. Log
    await logAICall(input.useCase, input.explainability.id, input, outputCheck);
    
    // 8. Return result
    return {
      safeText: outputCheck,
      riskScore,
      contradictions,
      blocked: riskScore.total > 7
    };
  }
};
```

**Dependencies:** All previous tasks + existing services
**Breaking Changes:** None

### Phase 4.3: API Endpoint (Week 2)

#### Task 4.3.1: Create `/api/ai/safe-stream.post.ts`

**File:** `server/api/ai/safe-stream.post.ts`

Wraps existing streaming endpoint with safety orchestration.

**Dependencies:** Task 4.2.1
**Breaking Changes:** None (new endpoint, existing endpoint unchanged)

### Phase 4.4: UI Enhancements (Week 2-3)

#### Task 4.4.1: Add Risk Badge to ExplainabilityCard

**File:** `app/components/clinical/ExplainabilityCard.vue`

Add risk badge display:

```vue
<!-- Risk Badge (Phase 4) -->
<div v-if="riskScore" class="mb-4">
  <div class="flex items-center gap-2">
    <span class="text-sm text-gray-400">AI Safety:</span>
    <span 
      class="px-2 py-1 rounded text-sm font-medium"
      :class="riskBadgeClass"
    >
      {{ riskScore.level === 'green' ? '🟢' : riskScore.level === 'yellow' ? '🟡' : '🔴' }}
      Risk: {{ riskScore.total }}
    </span>
  </div>
</div>
```

**Dependencies:** Task 4.1.2
**Breaking Changes:** None (additive)

#### Task 4.4.2: Add Session Escalation Banner

**File:** `app/components/clinical/AIStreamingPanel.vue`

Add warning counter and alert banner for 3+ warnings.

**Dependencies:** Task 4.2.1
**Breaking Changes:** None (additive)

### Phase 4.5: Kill Switch (Week 3)

#### Task 4.5.1: Create Admin Controls

**File:** `app/pages/admin.vue`

Add AI controls:
- Disable AI toggle
- Restrict to explanations only
- Force referral mode

**Dependencies:** None
**Breaking Changes:** None

---

## Part 5: Documentation Updates Required

### 5.1 Update Phase 4 Specs

| Document | Update Required |
|----------|----------------|
| `CLINICAL_EXPLAINABILITY_TRIAGE.md` | Replace `ExplainabilityModel` with reference to existing `ExplainabilityRecord` |
| `SAFETY_GOVERNANCE.md` | Reference existing `safetyRules.ts` instead of creating new `outputValidator.ts` |
| `UI_EXPLAINABILITY_CARD.md` | Add risk badge specification |

### 5.2 Create Integration Guide

Create `docs/AI/PHASE_4_INTEGRATION.md` documenting:
- How new safety services integrate with existing code
- API contracts for safe-stream endpoint
- Risk score thresholds and badge colors

---

## Part 6: Risk Assessment

### 6.1 Low Risk Changes

- New files in `server/ai-safety/` directory
- Additive UI changes (risk badge, escalation banner)
- New API endpoint (doesn't modify existing)

### 6.2 Medium Risk Changes

- `safetyOrchestrator.ts` integration with existing services
- Risk score threshold tuning

### 6.3 No Breaking Changes

All existing interfaces remain unchanged:
- `ExplainabilityRecord` - unchanged
- `buildExplainabilityModel()` - unchanged
- `safetyRules.ts` functions - unchanged
- `ExplainabilityCard.vue` props - unchanged (additive only)
- `/api/ai/stream.post.ts` - unchanged

---

## Part 7: Acceptance Criteria

### Phase 4 Complete When:

- [ ] `inputSanitizer.ts` created and tested
- [ ] `riskScorer.ts` created with threshold definitions
- [ ] `contradictionDetector.ts` created with priority mismatch detection
- [ ] `safetyOrchestrator.ts` coordinates all safety services
- [ ] `/api/ai/safe-stream.post.ts` endpoint created
- [ ] Risk badge displayed in `ExplainabilityCard.vue`
- [ ] Session escalation banner in `AIStreamingPanel.vue`
- [ ] Kill switch controls in admin page
- [ ] All AI calls logged with risk scores
- [ ] No unsafe text reaches UI
- [ ] Documentation updated to reflect existing implementation

---

## Appendix A: File Creation Checklist

### New Files to Create

| File | Lines (Est.) | Priority |
|------|--------------|----------|
| `server/ai-safety/inputSanitizer.ts` | ~80 | HIGH |
| `server/ai-safety/riskScorer.ts` | ~100 | HIGH |
| `server/ai-safety/contradictionDetector.ts` | ~120 | HIGH |
| `server/ai-safety/safetyOrchestrator.ts` | ~150 | CRITICAL |
| `server/api/ai/safe-stream.post.ts` | ~100 | CRITICAL |
| `docs/AI/PHASE_4_INTEGRATION.md` | ~200 | MEDIUM |

### Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `app/components/clinical/ExplainabilityCard.vue` | Add risk badge | HIGH |
| `app/components/clinical/AIStreamingPanel.vue` | Add escalation banner | MEDIUM |
| `app/pages/admin.vue` | Add kill switch controls | MEDIUM |

### Files to Update (Documentation)

| File | Changes |
|------|---------|
| `docs/flows/PHASE-4/CLINICAL_EXPLAINABILITY_TRIAGE.md` | Reference existing types |
| `docs/flows/PHASE-4/SAFETY_GOVERNANCE.md` | Reference existing services |
| `docs/flows/PHASE-4/UI_EXPLAINABILITY_CARD.md` | Add risk badge spec |

---

**END OF ROADMAP**
