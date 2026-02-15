# MedGemma Phase 1 Test Specifications

This document outlines comprehensive test cases for verifying the MedGemma AI clinical decision support implementation.

---

## Test Suite Overview

| Category | Coverage | Status |
|----------|----------|--------|
| Unit Tests | Composables, utilities | PENDING |
| Integration Tests | API endpoints | PENDING |
| Component Tests | UI components | PENDING |
| E2E Tests | User workflows | PENDING |

---

## 1. canRequestAIGuidance Computed Property

### Test Cases

| ID | Description | Expected Result | Pass Criteria |
|----|-------------|----------------|--------------|
| CAG-01 | AI enabled for EXPLAIN_TRIAGE, triage priority available, not showing | Button visible | `canRequestAIGuidance === true` |
| CAG-02 | AI disabled, priority available | Button hidden | `canRequestAIGuidance === false` |
| CAG-03 | AI enabled, no priority | Button hidden | `canRequestAIGuidance === false` |
| CAG-04 | AI enabled, priority available, already showing | Button hidden | `canRequestAIGuidance === false` |
| CAG-05 | Config returns `enabled: false` | Button hidden | `canRequestAIGuidance === false` |

### Verification Code

```typescript
// composables/useAIGuidance.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { useAIGuidance } from './useAIGuidance';

describe('canRequestAIGuidance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when AI enabled, priority available, not showing', () => {
    const { canRequestAIGuidance } = useAIGuidance();
    
    // Mock AI enabled
    vi.spyOn(isAIEnabled, 'EXPLAIN_TRIAGE').mockReturnValue(true);
    vi.spyOn(getAIConfig, 'enabled').mockReturnValue(true);
    
    // Set test conditions
    triagePriority.value = 'yellow';
    showExplainability.value = false;
    
    expect(canRequestAIGuidance.value).toBe(true);
  });

  it('returns false when AI not enabled', () => {
    const { canRequestAIGuidance } = useAIGuidance();
    
    vi.spyOn(isAIEnabled, 'EXPLAIN_TRIAGE').mockReturnValue(false);
    
    triagePriority.value = 'yellow';
    showExplainability.value = false;
    
    expect(canRequestAIGuidance.value).toBe(false);
  });

  it('returns false when no triage priority', () => {
    const { canRequestAIGuidance } = useAIGuidance();
    
    vi.spyOn(isAIEnabled, 'EXPLAIN_TRIAGE').mockReturnValue(true);
    vi.spyOn(getAIConfig, 'enabled').mockReturnValue(true);
    
    triagePriority.value = null;
    showExplainability.value = false;
    
    expect(canRequestAIGuidance.value).toBe(false);
  });

  it('returns false when already showing explainability', () => {
    const { canRequestAIGuidance } = useAIGuidance();
    
    vi.spyOn(isAIEnabled, 'EXPLAIN_TRIAGE').mockReturnValue(true);
    vi.spyOn(getAIConfig, 'enabled').mockReturnValue(true);
    
    triagePriority.value = 'yellow';
    showExplainability.value = true;
    
    expect(canRequestAIGuidance.value).toBe(false);
  });
});
```

---

## 2. requestMedGemmaGuidance Function

### Test Cases

| ID | Description | Expected Behavior | Verification |
|----|-------------|-------------------|---------------|
| RMR-01 | Successful AI response | `aiStatus` → checking → generating → ready | Status transitions correctly |
| RMR-02 | AI returns explanation | `explainabilityRecord` populated | Data structure correct |
| RMR-03 | AI error/timeout | `aiErrorMessage` set, `aiStatus` → idle | Error handling |
| RMR-04 | AI unavailable (config) | No API call, fallback narrative | Graceful degradation |
| RMR-05 | Audit log recorded | `logAIInteraction` called with correct params | Compliance |

### Verification Code

```typescript
// composables/useAIGuidance.spec.ts (continued)

describe('requestMedGemmaGuidance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiStatus.value = 'idle';
    explainabilityRecord.value = null;
    aiErrorMessage.value = '';
  });

  it('transitions through loading states correctly', async () => {
    const { requestMedGemmaGuidance } = useAIGuidance();
    
    // Mock successful response
    mockBuildExplainability.mockResolvedValue(mockRecord);
    
    await requestMedGemmaGuidance();
    
    expect(aiStatus.value).toBe('ready');
    expect(explainabilityRecord.value).not.toBeNull();
  });

  it('handles errors gracefully', async () => {
    const { requestMedGemmaGuidance } = useAIGuidance();
    
    mockBuildExplainability.mockRejectedValue(new Error('AI timeout'));
    
    await requestMedGemmaGuidance();
    
    expect(aiStatus.value).toBe('idle');
    expect(aiErrorMessage.value).toBe('AI timeout');
  });

  it('logs AI interaction on success', async () => {
    const { requestMedGemmaGuidance } = useAIGuidance();
    
    mockBuildExplainability.mockResolvedValue({
      ...mockRecord,
      confidence: 0.95,
      aiEnhancement: { used: true, useCase: 'EXPLAIN_TRIAGE' }
    });
    
    await requestMedGemmaGuidance();
    
    expect(logAIInteraction).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        useCase: 'EXPLAIN_TRIAGE',
        confidence: 0.95
      })
    );
  });
});
```

---

## 3. Priority Badge Color-Coding

### Test Cases

| ID | Priority | Expected Color | Hex Code |
|----|----------|----------------|----------|
| PBC-01 | RED | Red background | `#dc2626` (red-600) |
| PBC-02 | YELLOW | Yellow background | `#eab308` (yellow-500) |
| PBC-03 | GREEN | Green background | `#16a34a` (green-600) |

### getPriorityLabel Verification

```typescript
// services/explainabilityEngine.spec.ts

describe('getPriorityLabel', () => {
  it('returns correct label for red priority', () => {
    expect(getPriorityLabel('red')).toBe('Emergency - Immediate Action Required');
  });

  it('returns correct label for yellow priority', () => {
    expect(getPriorityLabel('yellow')).toBe('Urgent - Prompt Attention Needed');
  });

  it('returns correct label for green priority', () => {
    expect(getPriorityLabel('green')).toBe('Non-Urgent - Standard Care');
  });
});
```

---

## 4. MedGemmaGuidancePanel Component

### Test Cases

| ID | Scenario | Expected Result | Verification |
|----|----------|----------------|--------------|
| MGP-01 | Valid guidance data | All sections render | VDOM verification |
| MGP-02 | Null guidance | Empty render | Guard clause |
| MGP-03 | Missing fields | Graceful fallback | Default values |
| MGP-04 | High confidence (≥80%) | Green confidence bar | Color correct |
| MGP-05 | Medium confidence (60-79%) | Yellow confidence bar | Color correct |
| MGP-06 | Low confidence (<60%) | Red confidence bar | Color correct |
| MGP-07 | With inconsistencies | Warning section visible | Conditional render |
| MGP-08 | Without inconsistencies | Warning section hidden | Conditional render |
| MGP-09 | Disclaimer visible | AI disclaimer shown | Always present |
| MGP-10 | Helpfulness feedback | logAIInteraction called | Event handler |

### Component Test Code

```typescript
// components/clinical/MedGemmaGuidancePanel.spec.ts

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MedGemmaGuidancePanel from './MedGemmaGuidancePanel.vue';

const mockGuidance = {
  explanation: 'Patient has fast breathing (48 breaths/min) for age 30 months.',
  inconsistencies: ['Fast breathing but priority is Green'],
  teachingNotes: ['Stridor indicates upper airway obstruction'],
  nextSteps: [
    'Verify respiratory rate count',
    'Assess for chest indrawing'
  ],
  confidence: 0.85,
  modelVersion: 'gemma3:4b',
  timestamp: new Date().toISOString()
};

describe('MedGemmaGuidancePanel', () => {
  it('renders all guidance sections when data present', () => {
    const wrapper = mount(MedGemmaGuidancePanel, {
      props: { guidance: mockGuidance }
    });
    
    expect(wrapper.find('h3').text()).toBe('MedGemma');
    expect(wrapper.text()).toContain('Explanation');
    expect(wrapper.text()).toContain('Recommended Actions');
    expect(wrapper.text()).toContain('85%');
  });

  it('renders warning for inconsistencies', () => {
    const wrapper = mount(MedGemmaGuidancePanel, {
      props: { guidance: mockGuidance }
    });
    
    expect(wrapper.text()).toContain('Potential Inconsistencies');
  });

  it('shows correct confidence color (high)', () => {
    const wrapper = mount(MedGemmaGuidancePanel, {
      props: { guidance: { ...mockGuidance, confidence: 0.85 } }
    });
    
    const confidenceBar = wrapper.find('.bg-green-500');
    expect(confidenceBar.exists()).toBe(true);
  });

  it('shows correct confidence color (low)', () => {
    const wrapper = mount(MedGemmaGuidancePanel, {
      props: { guidance: { ...mockGuidance, confidence: 0.45 } }
    });
    
    const confidenceBar = wrapper.find('.bg-red-500');
    expect(confidenceBar.exists()).toBe(true);
  });

  it('renders disclaimer', () => {
    const wrapper = mount(MedGemmaGuidancePanel, {
      props: { guidance: mockGuidance }
    });
    
    expect(wrapper.text()).toContain('AI-generated');
    expect(wrapper.text()).toContain('Always verify with clinical judgment');
  });

  it('emits helpful event', async () => {
    const wrapper = mount(MedGemmaGuidancePanel, {
      props: { guidance: mockGuidance }
    });
    
    await wrapper.find('button:contains("Helpful")').trigger('click');
    
    expect(wrapper.emitted('helpful')).toBeTruthy();
  });

  it('handles null guidance gracefully', () => {
    const wrapper = mount(MedGemmaGuidancePanel, {
      props: { guidance: null }
    });
    
    expect(wrapper.find('[role="region"]').exists()).toBe(false);
  });
});
```

---

## 5. Inconsistency Detection

### Test Cases

| ID | Scenario | Input Data | Expected Output |
|----|----------|------------|----------------|
| ID-01 | Danger sign with wrong priority | `cyanosis: true`, `priority: 'green'` | Error: "Cyanosis typically mandates Red" |
| ID-02 | Missing respiratory assessment | No `respiratory_rate` | Warning: "Respiratory assessment incomplete" |
| ID-03 | Fast breathing above threshold | `resp_rate: 48`, age 30mo, `priority: 'green'` | Error: "Exceeds IMCI threshold" |
| ID-04 | No inconsistencies | All data consistent | Empty array |
| ID-05 | Chest indrawing with green priority | `chest_indrawing: true`, `priority: 'green'` | Error: "Should be Yellow" |

### Test Code

```typescript
// composables/useInconsistencyDetection.spec.ts

describe('detectInconsistencies', () => {
  const { detectInconsistencies } = useInconsistencyDetection();

  it('flags danger sign with wrong priority', () => {
    const result = detectInconsistencies(
      { cyanosis: true },
      'green',
      { ageMonths: 24 }
    );
    
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].type).toBe('danger_sign');
    expect(result[0].severity).toBe('error');
  });

  it('flags missing respiratory assessment', () => {
    const result = detectInconsistencies(
      { fever: true },
      'yellow',
      { ageMonths: 24 }
    );
    
    expect(result.some(r => r.type === 'missing')).toBe(true);
  });

  it('returns empty array for consistent data', () => {
    const result = detectInconsistencies(
      { cyanosis: true },
      'red',
      { ageMonths: 24 }
    );
    
    expect(result).toEqual([]);
  });
});
```

---

## 6. API Endpoint Tests

### Test Cases

| ID | Scenario | Request | Expected Response |
|----|----------|---------|-------------------|
| API-01 | Valid triage explanation request | Structured payload | 200 + JSON response |
| API-02 | Missing required fields | Incomplete payload | 400 error |
| API-03 | Ollama unavailable | Valid request | 500 + fallback |
| API-04 | Prescription language in prompt | Blocked pattern | Safety flag + blocked |
| API-05 | JSON parsing valid | Structured prompt | Parsed fields |

### Test Code

```typescript
// server/api/ai.post.spec.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('POST /api/ai', () => {
  it('returns structured AI response', async () => {
    const response = await fetch('/api/ai', {
      method: 'POST',
      body: JSON.stringify({
        useCase: 'EXPLAIN_TRIAGE',
        payload: {
          schema: { section: 'General', clinicalNotes: [], triageLogic: [], dangerSigns: [] },
          currentValues: { fast_breathing: true },
          patientContext: { ageMonths: 24 },
          systemResult: { priority: 'yellow', actions: ['oral_antibiotics'], ruleIds: ['IMCI_PNEUMONIA'] }
        }
      })
    });
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('explanation');
    expect(data).toHaveProperty('confidence');
    expect(data).toHaveProperty('inconsistencies');
    expect(data).toHaveProperty('nextSteps');
  });

  it('blocks prescription language', async () => {
    const response = await fetch('/api/ai', {
      method: 'POST',
      body: JSON.stringify({
        useCase: 'EXPLAIN_TRIAGE',
        payload: {
          schema: { section: 'General', clinicalNotes: [], triageLogic: [], dangerSigns: [] },
          currentValues: { prescription: 'amoxicillin 50mg/kg' },
          patientContext: { ageMonths: 24 },
          systemResult: { priority: 'yellow', actions: [], ruleIds: [] }
        }
      })
    });
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.safetyFlags).toContain('CLINICAL_VIOLATION');
  });
});
```

---

## 7. End-to-End Workflow Tests

### Test Case: Complete AI Guidance Flow

```typescript
// e2e/medgemma.spec.ts

describe('MedGemma Guidance E2E', () => {
  it('completes full guidance flow', async () => {
    // 1. Navigate to assessment
    await page.goto('/assessment/paediatric/1');
    
    // 2. Fill in assessment data
    await page.fill('[data-testid="fast_breathing"]', 'true');
    await page.fill('[data-testid="respiratory_rate"]', '48');
    
    // 3. Submit and get triage
    await page.click('[data-testid="complete-assessment"]');
    
    // 4. Verify triage priority (should be yellow)
    await expect(page.locator('[data-testid="triage-badge"]'))
      .toHaveText('YELLOW');
    
    // 5. Click "Ask MedGemma"
    await page.click('[data-testid="ask-medgemma"]');
    
    // 6. Verify loading state
    await expect(page.locator('[data-testid="ai-status"]'))
      .toHaveText('MedGemma is thinking...');
    
    // 7. Verify guidance panel appears
    await expect(page.locator('[data-testid="guidance-panel"]'))
      .toBeVisible();
    
    // 8. Verify explanation content
    await expect(page.locator('[data-testid="explanation-text"]'))
      .toContain('fast breathing');
    
    // 9. Verify confidence indicator
    const confidence = await page.locator('[data-testid="confidence"]').textContent();
    expect(parseInt(confidence)).toBeGreaterThanOrEqual(0);
    
    // 10. Verify disclaimer
    await expect(page.locator('[data-testid="disclaimer"]'))
      .toContainText('AI-generated');
  });
});
```

---

## 8. Manual Testing Checklist

### Pre-Flight Checklist

- [ ] Ollama server running on localhost:11434
- [ ] `OLLAMA_MODEL=gemma3:4b` in environment
- [ ] AI feature enabled in config
- [ ] Test patient data available
- [ ] Dev tools open for debugging

### UI Testing Steps

1. **Button Visibility**
   - [ ] Navigate to assessment form
   - [ ] Complete triage section
   - [ ] Verify "Ask MedGemma" button appears
   - [ ] Verify button is enabled (not disabled)

2. **Loading States**
   - [ ] Click "Ask MedGemma"
   - [ ] Verify spinner/animation appears
   - [ ] Verify button text changes to "MedGemma is thinking..."

3. **Success State**
   - [ ] Wait for response (should complete in <5s)
   - [ ] Verify guidance panel appears
   - [ ] Check explanation text is present
   - [ ] Verify confidence percentage
   - [ ] Check priority badge color

4. **Error Handling**
   - [ ] Stop Ollama server
   - [ ] Click "Ask MedGemma"
   - [ ] Verify fallback narrative shown
   - [ ] Verify error message in UI
   - [ ] Restart Ollama

5. **Edge Cases**
   - [ ] Test with no triage data
   - [ ] Test with incomplete data
   - [ ] Test page refresh during loading
   - [ ] Test browser back button

---

## 9. Performance Benchmarks

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| AI Response Time | < 3s | 3-5s | > 5s |
| Page Load (with AI) | < 2s | 2-3s | > 3s |
| Confidence Score | > 0.8 | 0.6-0.8 | < 0.6 |
| Error Rate | < 1% | 1-5% | > 5% |

---

## 10. Accessibility Testing

| Check | Tool | Pass Criteria |
|-------|------|--------------|
| Color contrast | axe DevTools | WCAG AA (4.5:1) |
| Keyboard navigation | Manual | All interactive |
| Screen reader | NVDA/JAWS | ARIA labels present |
| Focus indicators | Manual | Visible focus rings |
| Error announcements | Manual | Live regions work |

---

## Test Execution Commands

```bash
# Install test dependencies
npm install --save-dev vitest @vue/test-utils jsdom

# Run unit tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- composables/useInconsistencyDetection.spec.ts

# Run E2E tests
npm run test:e2e

# Run type checking
npx nuxi typecheck
```

---

## Test Data Fixtures

```typescript
// fixtures/aiGuidance.ts

export const mockGuidanceResponse = {
  explanation: 'Patient classified as YELLOW priority due to fast breathing (48 breaths/min) which exceeds IMCI threshold for age 30 months. This indicates possible pneumonia requiring prompt antibiotic treatment.',
  inconsistencies: [],
  teachingNotes: [
    'Fast breathing thresholds: <2mo=60, 2-12mo=50, 12-60mo=40 breaths/min'
  ],
  nextSteps: [
    'Prescribe oral amoxicillin (50mg/kg/day for 5 days)',
    'Advise caregiver on warning signs requiring immediate return'
  ],
  confidence: 0.92,
  modelVersion: 'gemma3:4b',
  timestamp: new Date().toISOString(),
  ruleIds: ['IMCI_PNEUMONIA', 'FAST_BREATHING'],
  safetyFlags: []
};

export const mockInconsistentData = {
  cyanosis: true,
  priority: 'green',
  ageMonths: 24
};
```

---

*Test Specifications Version: 1.0*  
*Last Updated: 2026-02-11*  
*Status: Ready for Implementation*
