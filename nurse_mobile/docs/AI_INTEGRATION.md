# AI Integration Documentation

**Last Updated**: February 9, 2026
**Project**: HealthBridge Nurse Mobile Application
**Status**: ✅ Complete

---

## Overview

This document describes the integration of the Phase 4 AI Layer into the clinical workflow pages. The AI components provide read-only clinical explainability and documentation assistance without making clinical decisions.

## What Was Integrated

### Files Modified

| File | Description |
|------|-------------|
| `app/pages/assessment/[schemaId]/[formId].vue` | Added ExplainabilityCard for triage reasoning |
| `app/pages/sessions/[sessionId]/treatment.vue` | Added caregiver education generator |
| `app/pages/sessions/[sessionId]/summary.vue` | Added discharge summary and handoff generators |

### AI Components Used

| Component | Purpose |
|-----------|---------|
| `ExplainabilityCard.vue` | Display clinical reasoning from WHO IMCI rules |
| `explainabilityEngine.ts` | Build explainability models from assessment data |
| `clinicalAI.ts` | Generate plain-language explanations via Ollama |
| `safetyRules.ts` | Enforce AI scope limitations |
| `aiStore.ts` | Manage AI enable/disable state |

---

## Integration Points

### 1. Assessment Page

**Location**: `app/pages/assessment/[schemaId]/[formId].vue`

**Feature**: Triage Explainability Card

**Description**: After the triage priority is calculated, an ExplainabilityCard appears showing:
- Why the patient was classified (red/yellow/green)
- What clinical findings triggered the classification
- Recommended actions based on WHO IMCI guidelines

**Code Changes**:
```typescript
// Imports added
import { useAiStore } from '~/stores/aiStore';
import ExplainabilityCard from '~/components/clinical/ExplainabilityCard.vue';
import { buildExplainabilityModel } from '~/services/explainabilityEngine';

// New reactive state
const explainabilityRecord = ref<ExplainabilityRecord | null>(null);
const showExplainability = ref(false);

// Build explainability when triage is calculated
function buildExplainability() {
  if (!instance.value || !aiStore.isEnabled) return;
  const record = buildExplainabilityModel(instance.value, {
    sessionId: resolvedSessionId.value,
    useAI: aiStore.config.useAI
  });
  explainabilityRecord.value = record;
  showExplainability.value = !!record;
}

// Watch for triage changes
watch([() => instance.value?.calculated, aiStore.isEnabled], buildExplainability, { deep: true });
```

**Template**:
```vue
<!-- Appears after triage badge -->
<div v-if="showExplainability && explainabilityRecord">
  <ExplainabilityCard :model="explainabilityRecord" />
</div>
```

---

### 2. Treatment Page

**Location**: `app/pages/sessions/[sessionId]/treatment.vue`

**Feature**: Caregiver Education Generator

**Description**: A panel that allows nurses to generate plain-language explanations of the patient's condition and treatment plan for caregivers.

**Code Changes**:
```typescript
// Imports added
import { useAiStore } from '~/stores/aiStore';
import { buildExplainabilityModel } from '~/services/explainabilityEngine';
import { askClinicalAI } from '~/services/clinicalAI';

// New state
const caregiverEducation = ref('');
const isGeneratingEducation = ref(false);
const explainabilityRecord = ref<ExplainabilityRecord | null>(null);

// Generate education text
async function generateCaregiverEducation() {
  if (!explainabilityRecord.value || !aiStore.isEnabled) return;
  
  isGeneratingEducation.value = true;
  const response = await askClinicalAI(explainabilityRecord.value, {
    useCase: 'CARE_EDUCATION'
  });
  caregiverEducation.value = response.answer;
  isGeneratingEducation.value = false;
}
```

**Template**:
```vue
<!-- AI Caregiver Education Panel -->
<div v-if="aiStore.isEnabled && explainabilityRecord" class="bg-blue-900/20 border border-blue-700/50 rounded-xl p-6 mb-6">
  <h3 class="text-lg font-semibold text-white flex items-center gap-2">
    Caregiver Education
  </h3>
  <button @click="generateCaregiverEducation" class="px-4 py-2 bg-blue-600 text-white rounded-lg">
    Generate Explanation
  </button>
  <div v-if="caregiverEducation" class="mt-4 text-gray-300">
    {{ caregiverEducation }}
  </div>
</div>
```

---

### 3. Discharge Summary Page

**Location**: `app/pages/sessions/[sessionId]/summary.vue`

**Features**: Discharge Summary Generator & Clinical Handoff Report

**Description**: Two AI-powered buttons that help nurses generate clinical documentation:
1. **Generate Summary** - Creates a concise discharge summary
2. **Generate Handoff** - Creates an SBAR-style handoff report for transitions of care

**Code Changes**:
```typescript
// Imports added
import { useAiStore } from '~/stores/aiStore';
import { buildExplainabilityModel } from '~/services/explainabilityEngine';
import { askClinicalAI } from '~/services/clinicalAI';

// New state
const dischargeSummary = ref('');
const handoffReport = ref('');
const isGeneratingSummary = ref(false);
const isGeneratingHandoff = ref(false);

// Generate discharge summary
async function generateDischargeSummary() {
  if (!explainabilityRecord.value || !aiStore.isEnabled) return;
  const response = await askClinicalAI(explainabilityRecord.value, {
    useCase: 'NOTE_SUMMARY'
  });
  dischargeSummary.value = response.answer;
}

// Generate handoff report
async function generateHandoffReport() {
  if (!explainabilityRecord.value || !aiStore.isEnabled) return;
  const response = await askClinicalAI(explainabilityRecord.value, {
    useCase: 'CLINICAL_HANDOVER'
  });
  handoffReport.value = response.answer;
}
```

**Template**:
```vue
<!-- AI Clinical Summary Section -->
<div v-if="aiStore.isEnabled && explainabilityRecord">
  <button @click="generateDischargeSummary" class="px-4 py-2 bg-blue-600 text-white rounded-lg">
    Generate Summary
  </button>
  <button @click="generateHandoffReport" class="px-4 py-2 bg-purple-600 text-white rounded-lg">
    Generate Handoff
  </button>
  
  <div v-if="dischargeSummary" class="mt-4">
    {{ dischargeSummary }}
  </div>
  <div v-if="handoffReport" class="mt-4">
    {{ handoffReport }}
  </div>
</div>
```

---

## AI Use Cases

| Use Case | Description | Pages |
|----------|-------------|-------|
| `EXPLAIN_TRIAGE` | Explain why patient was classified | Assessment |
| `CARE_EDUCATION` | Plain-language explanation for caregivers | Treatment |
| `NOTE_SUMMARY` | Discharge summary generation | Discharge |
| `CLINICAL_HANDOVER` | SBAR-style handoff report | Discharge |

---

## Safety Features

All AI integrations include these safety measures:

1. **AI Enable/Disable**: Controlled by `aiStore.isEnabled`
2. **Read-Only**: AI only explains, never suggests treatments
3. **Scope Guard**: Blocks out-of-scope requests (diagnoses, prescriptions)
4. **Output Filter**: Removes prescription language from outputs
5. **Disclaimers**: All AI output includes warning text

### Safety Disclaimer Text

```
AI-generated. Please review for accuracy before sharing with caregivers.
```

---

## Testing Instructions

### Prerequisites

1. Ollama server running with MedGemma model:
```bash
ollama pull gemma3:4b
ollama serve
```

2. Environment variables set in `.env`:
```env
OLLAMA_ENDPOINT=http://localhost:11434/api/generate
AI_MODEL=gemma3:4b
AI_ENABLED=true
```

### Test Flow

1. **Start the application**:
```bash
npm run dev
```

2. **Register a patient**:
   - Navigate to a new session
   - Enter patient information
   - Assign triage category (red/yellow/green)

3. **Complete assessment**:
   - Select appropriate assessment form (e.g., Pediatric Respiratory)
   - Fill in clinical data
   - Complete form
   - Verify ExplainabilityCard appears showing triage reasoning

4. **Proceed to treatment**:
   - Review treatment recommendations
   - Click "Generate Explanation" button
   - Verify plain-language explanation is generated

5. **Complete discharge**:
   - Navigate to discharge summary
   - Click "Generate Summary" for discharge notes
   - Click "Generate Handoff" for SBAR report
   - Verify AI-generated content appears

---

## Expected Behavior

### Assessment Page
- **Before AI**: Triage badge shows priority color only
- **After AI**: ExplainabilityCard appears showing:
  - Priority (e.g., "YELLOW - URGENT")
  - Triggers (e.g., "Fast breathing > 50 breaths/min")
  - Recommended actions (e.g., "Give antibiotics")

### Treatment Page
- **Before AI**: Treatment form with checkboxes
- **After AI**: Caregiver Education panel with:
  - "Generate Explanation" button
  - AI-generated plain-language text
  - Disclaimer warning

### Discharge Page
- **Before AI**: Blank discharge notes textarea
- **After AI**: AI Clinical Summary section with:
  - "Generate Summary" button
  - "Generate Handoff" button
  - Generated content with disclaimer

---

## Troubleshooting

### AI Button Not Visible
- Check `aiStore.isEnabled` in browser console
- Verify `AI_ENABLED=true` in environment
- Ensure Ollama server is running

### AI Generation Fails
- Check browser console for errors
- Verify Ollama endpoint is correct
- Ensure MedGemma model is loaded: `ollama list`

### ExplainabilityCard Not Showing
- Verify assessment is completed (status = 'completed')
- Check `instance.value.calculated.matchedTriageRule` exists
- Ensure triage priority was calculated

---

## Related Documentation

| Document | Description |
|----------|-------------|
| `docs/AI_POLICY.md` | Complete AI safety and usage policy |
| `docs/AI_INTEGRATION_ANALYSIS.md` | Analysis of where AI should integrate |
| `docs/CONVERSATION_SUMMARY.md` | Overall project conversation history |
| `docs/flows/PHASE-4_IMPLEMENTATION_GUIDE.md` | Phase 4 implementation details |
| `app/services/clinicalAI.ts` | Ollama integration code |
| `app/services/explainabilityEngine.ts` | Rule-based explainability |
| `app/services/safetyRules.ts` | 6-layer safety framework |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 9, 2026 | Initial AI integration documentation |

---

*This document was auto-generated following the AI integration implementation.*
