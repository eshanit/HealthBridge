# AI Integration Analysis: Patient Journey Review

**Analysis Date**: February 9, 2026
**Document Purpose**: Review complete patient workflow and identify AI integration opportunities

---

## Executive Summary

This analysis reviews the complete nurse patient journey in HealthBridge and maps where AI-driven assistance should logically augment clinical care. The Phase 4 AI Layer (`ExplainabilityCard`, `explainabilityEngine`, `clinicalAI`) provides read-only clinical explainability but is **not yet integrated** into the actual workflow pages.

---

## Current Patient Journey Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HEALTHBRIDGE CLINICAL WORKFLOW                        │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │   REGISTRATION   │  Patient data entry, triage category assignment
    │   /session/new   │  Chief complaint captured here
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ PATIENT LOOKUP   │  Link existing patient or create new
    │ /sessions/[id]/   │  CPT search, name lookup
    │ patient-lookup   │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │   ASSESSMENT     │  WHO IMCI protocol forms
    │ /sessions/[id]/   │  Vital signs, danger signs, symptoms
    │   assessment.vue  │  Rule-based triage calculation
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │    TREATMENT     │  Treatment recommendations
    │ /sessions/[id]/   │  Bridged from assessment results
    │   treatment.vue   │  Care actions, medications, referrals
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │     DISCHARGE    │  Session summary
    │ /sessions/[id]/   │  Discharge disposition, notes
    │    summary.vue    │  Patient handoff
    └──────────────────┘
```

---

## AI Integration Points Analysis

### 1. REGISTRATION STAGE

**Current State**:
- Basic patient demographic entry
- Triage category assigned (red/yellow/green)
- Chief complaint recorded as text

**AI Opportunity**: LOW
- Registration is data entry, not clinical decision-making
- Triage category should be clinical decision, not AI

**AI Augmentation Options**:
- ⚠️ **NOT RECOMMENDED**: Auto-suggesting triage category based on chief complaint
- ✅ **Useful**: Quick-reference drug dosage calculator for age-based medications
- ✅ **Useful**: Pre-populated common chief complaint templates

---

### 2. PATIENT LOOKUP STAGE

**Current State**:
- CPT code search
- Name/phone lookup
- Recent patients list

**AI Opportunity**: VERY LOW
- This is administrative lookup, not clinical

**AI Augmentation Options**:
- ⚠️ **NOT RECOMMENDED**: AI-based patient matching
- ✅ **Useful**: Optical character recognition for ID card scanning (if hardware available)

---

### 3. ASSESSMENT STAGE ⭐ PRIMARY AI INTEGRATION POINT

**Current State** (`app/pages/sessions/[sessionId]/assessment.vue`):
- Nurse fills WHO IMCI forms
- Vital signs entered (resp rate, SpO2, temperature, weight)
- Danger signs checked (lethargy, convulsions, unable to drink)
- Rule-based triage calculated in background

**MISSING AI INTEGRATION**:

#### 3.1 Real-Time Decision Support
```typescript
// Should be integrated into assessment.vue
import { useAiStore } from '~/stores/aiStore';

// During assessment, show AI insights:
const aiInsights = computed(() => {
  if (isAiEnabled.value && assessmentComplete.value) {
    return explainabilityEngine.buildExplainabilityModel(assessmentData);
  }
  return null;
});
```

**Where to add**: After each section completion, show `ExplainabilityCard.vue`

**User Story**:
> "As a nurse, after entering respiratory assessment data, I want to see an AI-powered explanation of WHY the patient was classified as yellow (urgent), so I can understand the clinical reasoning and explain it to caregivers."

#### 3.2 Clinical Term Tooltips
```vue
<!-- In assessment form fields -->
<span class="clinical-term" title="AI definition">
  {{ getClinicalTermDefinition('chest_indrawing') }}
</span>
```

**Where to add**: Next to clinical terminology in assessment forms

**AI Service**: `explainabilityEngine.getClinicalTermDefinition()`

#### 3.3 Vital Sign Anomaly Alerts
```typescript
// Should auto-trigger when values entered
watch(formValues, (values) => {
  if (values.resp_rate > 70 && ageMonths < 12) {
    showCriticalAlert('Severe tachypnea detected - immediate attention required');
  }
}, { deep: true });
```

**Where to add**: Reactive watcher in assessment.vue

#### 3.4 Interactive Symptom Checker
```vue
<!-- Next to danger sign checkboxes -->
<button @click="showSymptomGuidance('lethargic')">
  What does "lethargic" mean?
</button>
```

**AI Service**: Could use `clinicalAI.ts` for detailed explanations

---

### 4. TREATMENT STAGE ⭐ PRIMARY AI INTEGRATION POINT

**Current State** (`app/pages/sessions/[sessionId]/treatment.vue`):
- Treatment recommendations bridged from assessment
- Multiple sections: Emergency, Antibiotics, Home Care, Referral, Counseling
- Manual checkbox selection for actions
- No AI enhancement of recommendations

**MISSING AI INTEGRATION**:

#### 4.1 AI-Enhanced Treatment Explanation
```vue
<!-- In treatment section header -->
<ExplainabilityCard
  v-if="showTreatmentExplainability"
  :data="treatmentExplainability"
  use-case="EXPLAIN_TRIAGE"
/>
```

**Where to add**: Top of treatment.vue, before form sections

**User Story**:
> "As a nurse, I want to see a clear explanation of each recommended treatment action and its clinical justification, so I can provide accurate information to caregivers."

#### 4.2 Caregiver Education Mode
```vue
<!-- AI-generated plain-language explanation -->
<div v-if="showCaregiverEducation" class="ai-education-panel">
  <h4>Caregiver Explanation</h4>
  <p>{{ caregiverEducationText }}</p>
  <button @click="generateEducationText">
    Generate Plain-Language Explanation
  </button>
</div>
```

**AI Use Case**: `CARE_EDUCATION`

**User Story**:
> "As a nurse, I want AI to help me explain the child's condition and treatment plan in simple language that caregivers can understand, especially for home care instructions."

#### 4.3 Dosage Calculator Integration
```typescript
// Age/weight-based medication dosing
function calculateAmoxicillinDosage(weightKg: number): number {
  // WHO recommendation: 50mg/kg/day divided BID
  return Math.round(weightKg * 50 / 2);
}
```

**Where to add**: In treatment form, next to antibiotic fields

**Note**: This should be rule-based, not AI-generated, for medication dosing

#### 4.4 Treatment Adherence Prediction
```typescript
// Simple risk scoring for follow-up likelihood
function predictAdherenceRisk(patient: PatientData): 'low' | 'medium' | 'high' {
  // Based on distance, prior history, literacy, etc.
}
```

**Where to add**: In referral section

**AI Use Case**: Could flag high-risk patients for additional counseling

---

### 5. DISCHARGE STAGE ⭐ PRIMARY AI INTEGRATION POINT

**Current State** (`app/pages/sessions/[sessionId]/summary.vue`):
- Read-only summary of assessment + treatment
- Manual discharge disposition selection
- Free-text discharge notes
- No AI assistance

**MISSING AI INTEGRATION**:

#### 5.1 AI-Generated Discharge Summary
```vue
<!-- Auto-generated summary section -->
<div class="ai-summary-panel">
  <h4>AI-Generated Summary</h4>
  <button @click="generateDischargeSummary">
    Generate Clinical Handoff Summary
  </button>
  <textarea v-model="aiGeneratedSummary" />
</div>
```

**AI Use Case**: `NOTE_SUMMARY`

**User Story**:
> "As a nurse, I want AI to help me draft a concise clinical summary that captures the key assessment findings, treatment provided, and follow-up instructions, so I can complete documentation faster."

#### 5.2 Clinical Handoff Report
```typescript
// Structured handoff for next provider
const handoffReport = await askClinicalAI(explainabilityRecord, {
  useCase: 'CLINICAL_HANDOVER',
  format: 'structured'
});
```

**AI Use Case**: `CLINICAL_HANDOVER`

**User Story**:
> "As a nurse handing off to another facility, I want AI to generate a structured clinical report that follows standard handoff formats (SBAR or similar), so communication is clear and complete."

#### 5.3 Follow-Up Reminder Generator
```vue
<!-- Auto-generated follow-up instructions -->
<div class="follow-up-instructions">
  <h4>Recommended Follow-Up</h4>
  <ul>
    <li v-for="reminder in followUpReminders" :key="reminder.id">
      {{ reminder.text }} - {{ reminder.timing }}
    </li>
  </ul>
</div>
```

**Where to add**: In discharge disposition section

**AI Service**: Could use `clinicalAI.ts` to generate personalized reminders

---

## Missing AI Integration Summary

| Stage | Current | Should Have | Priority |
|-------|---------|-------------|----------|
| Registration | Basic entry | Drug dosage quick reference | LOW |
| Patient Lookup | CPT search | ID OCR (if hardware) | VERY LOW |
| **Assessment** | Rule-based triage | Real-time explainability, term definitions, anomaly alerts | **HIGH** |
| **Treatment** | Bridged recommendations | AI care explanations, caregiver education, adherence prediction | **HIGH** |
| **Discharge** | Manual summary | AI discharge summary, clinical handoff, follow-up reminders | **HIGH** |

---

## Implementation Roadmap

### Phase 1: Assessment Enhancement
1. Add `ExplainabilityCard.vue` to assessment.vue after triage calculation
2. Add clinical term tooltips using `explainabilityEngine.getClinicalTermDefinition()`
3. Add reactive vital sign anomaly alerts

### Phase 2: Treatment Enhancement
1. Add `ExplainabilityCard.vue` to treatment.vue with treatment recommendations
2. Add "Generate Caregiver Explanation" button using `clinicalAI.ts` with `CARE_EDUCATION` use case
3. Add simple adherence risk scoring

### Phase 3: Discharge Enhancement
1. Add "Generate Summary" button using `clinicalAI.ts` with `NOTE_SUMMARY` use case
2. Add clinical handoff generator using `CLINICAL_HANDOVER` use case
3. Add AI-generated follow-up reminders

---

## Code Integration Examples

### Example 1: Adding Explainability to Assessment

```typescript
// In app/pages/sessions/[sessionId]/assessment.vue

<script setup lang="ts">
import { buildExplainabilityModel } from '~/services/explainabilityEngine';
import ExplainabilityCard from '~/components/clinical/ExplainabilityCard.vue';
import { useAiStore } from '~/stores/aiStore';

const aiStore = useAiStore();
const showExplainability = ref(false);

async function calculateTriage() {
  // ... existing triage calculation ...
  
  if (aiStore.isEnabled && assessmentComplete.value) {
    const explainability = buildExplainabilityModel(assessmentInstance.value, {
      sessionId: sessionId.value,
      useAI: aiStore.config.useAI
    });
    
    if (explainability) {
      explainabilityRecord.value = explainability;
      showExplainability.value = true;
    }
  }
}
</script>

<template>
  <!-- After triage result is displayed -->
  <ExplainabilityCard
    v-if="showExplainability && explainabilityRecord"
    :data="explainabilityRecord"
    use-case="EXPLAIN_TRIAGE"
  />
</template>
```

### Example 2: Adding Caregiver Education to Treatment

```typescript
// In treatment.vue

<script setup lang="ts">
import { askClinicalAI } from '~/services/clinicalAI';
import { useAiStore } from '~/stores/aiStore';

const aiStore = useAiStore();
const caregiverEducation = ref('');
const isGeneratingEducation = ref(false);

async function generateCaregiverEducation() {
  if (!explainabilityRecord.value) return;
  
  isGeneratingEducation.value = true;
  
  try {
    const response = await askClinicalAI(explainabilityRecord.value, {
      useCase: 'CARE_EDUCATION'
    });
    
    caregiverEducation.value = response.answer;
  } finally {
    isGeneratingEducation.value = false;
  }
}
</script>

<template>
  <div class="caregiver-education">
    <button
      v-if="aiStore.isEnabled && !caregiverEducation"
      @click="generateCaregiverEducation"
      :disabled="isGeneratingEducation"
    >
      {{ isGeneratingEducation ? 'Generating...' : 'Generate Caregiver Explanation' }}
    </button>
    
    <div v-if="caregiverEducation" class="education-content">
      {{ caregiverEducation }}
    </div>
  </div>
</template>
```

### Example 3: Adding Discharge Summary to Summary Page

```typescript
// In summary.vue

<script setup lang="ts">
import { askClinicalAI } from '~/services/clinicalAI';
import { useAiStore } from '~/stores/aiStore';

const aiStore = useAiStore();
const dischargeSummary = ref('');
const isGeneratingSummary = ref(false);

async function generateDischargeSummary() {
  if (!assessmentInstance.value || !treatmentInstance.value) return;
  
  const explainability = buildExplainabilityModel(assessmentInstance.value, {
    sessionId: sessionId.value
  });
  
  if (!explainability) return;
  
  isGeneratingSummary.value = true;
  
  try {
    const response = await askClinicalAI(explainability, {
      useCase: 'NOTE_SUMMARY'
    });
    
    dischargeSummary.value = response.answer;
  } finally {
    isGeneratingSummary.value = false;
  }
}
</script>

<template>
  <!-- In Discharge Summary card -->
  <div class="ai-discharge-section">
    <button
      v-if="aiStore.isEnabled && !dischargeSummary"
      @click="generateDischargeSummary"
      :disabled="isGeneratingSummary"
    >
      Generate AI Discharge Summary
    </button>
    
    <textarea
      v-model="dischargeSummary"
      v-if="dischargeSummary"
      rows="6"
      placeholder="AI-generated summary will appear here..."
    />
  </div>
</template>
```

---

## AI Safety Considerations

### What AI Should NOT Do

| ❌ DON'T | Reason |
|----------|--------|
| Suggest diagnoses | Only explain triage classification |
| Recommend specific medications | WHO IMCI protocols are fixed |
| Override nurse decisions | Nurse always makes final call |
| Generate prescription instructions | Use approved protocol text |
| Make treatment predictions | Could cause harm |

### What AI Should Only Do

| ✅ DO | Reason |
|-------|--------|
| Explain clinical reasoning | Rule-based + AI enhancement |
| Define medical terms | Educational tooltips |
| Summarize for caregivers | Plain-language translation |
| Generate handoff reports | Rephrase clinical data |
| Flag anomalies | Based on WHO thresholds |

---

## Testing Checklist

- [ ] Assessment: ExplainabilityCard shows after triage calculation
- [ ] Assessment: Clinical term tooltips work on hover
- [ ] Assessment: Vital sign alerts trigger at correct thresholds
- [ ] Treatment: Caregiver education button generates readable output
- [ ] Treatment: AI output filtered for prescription language
- [ ] Discharge: Summary generator creates coherent handoff
- [ ] Safety: AI never suggests diagnoses or treatments
- [ ] Safety: All AI outputs have disclaimer text

---

## Related Documentation

- `docs/AI_POLICY.md` - Complete AI safety and usage policy
- `docs/flows/PHASE-4_IMPLEMENTATION_GUIDE.md` - Phase 4 implementation details
- `app/services/clinicalAI.ts` - Ollama + MedGemma integration
- `app/services/explainabilityEngine.ts` - Rule-based explainability
- `app/services/safetyRules.ts` - 6-layer safety framework

---

*This analysis identifies where AI should be integrated to augment nursing care. The current implementation provides the foundation (explainability engine, AI service, safety rules) but these components are not yet wired into the actual workflow pages.*
