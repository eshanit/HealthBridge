# Phase 3 UI Integration Guide

This document explains how to integrate the Phase 3 components with the existing UI.

## Overview

Phase 3 created 14 new files that need to be integrated into the existing assessment workflow. The main integration points are:

1. **Voice Input** - Add to form fields for hands-free data entry
2. **Voice Output** - Read AI responses aloud
3. **Translation** - Language selector for Shona/Ndebele
4. **Feedback Panel** - Collect feedback on AI responses
5. **Offline AI** - Fallback when network unavailable
6. **Analytics Dashboard** - Already created at `/admin/analytics`

## Integration Points

### 1. Voice Input Integration

**File:** [`VoiceInputButton.vue`](app/components/clinical/VoiceInputButton.vue)

**Where to integrate:** Form field components, specifically in [`FieldRenderer.vue`](app/components/clinical/fields/FieldRenderer.vue)

**Example integration:**

```vue
<!-- In FieldRenderer.vue -->
<template>
  <div class="field-wrapper">
    <input v-model="value" :type="inputType" />
    
    <!-- Add voice input button -->
    <VoiceInputButton
      v-if="field.supportsVoice"
      @transcript="handleVoiceTranscript"
      :language="currentLanguage"
    />
  </div>
</template>

<script setup>
import VoiceInputButton from '~/components/clinical/VoiceInputButton.vue';
import { useVoiceInput } from '~/composables/useVoiceInput';

const { transcript, startRecording, stopRecording } = useVoiceInput();

function handleVoiceTranscript(text: string) {
  // Set the form field value
  value.value = text;
}
</script>
```

### 2. Voice Output Integration

**File:** [`useVoiceOutput.ts`](app/composables/useVoiceOutput.ts)

**Where to integrate:** AI response panels, specifically in [`AIStreamingPanel.vue`](app/components/clinical/AIStreamingPanel.vue) and [`ExplainabilityCard.vue`](app/components/clinical/ExplainabilityCard.vue)

**Example integration:**

```vue
<!-- In AIStreamingPanel.vue -->
<template>
  <div class="ai-response">
    <div class="response-text">{{ streamingResponse }}</div>
    
    <!-- Add speak button -->
    <button @click="speakResponse" class="speak-btn">
      <svg><!-- speaker icon --></svg>
      Read Aloud
    </button>
  </div>
</template>

<script setup>
import { useVoiceOutput } from '~/composables/useVoiceOutput';

const { speak, isSpeaking, stop } = useVoiceOutput();

function speakResponse() {
  if (isSpeaking.value) {
    stop();
  } else {
    speak(streamingResponse.value, { language: 'en-US' });
  }
}
</script>
```

### 3. Translation Integration

**Files:** 
- [`translationService.ts`](app/services/translationService.ts)
- [`useTranslation.ts`](app/composables/useTranslation.ts)
- [`peds_respiratory_schema.sn.json`](app/schemas/prompts/peds_respiratory_schema.sn.json) (Shona)
- [`peds_respiratory_schema.nd.json`](app/schemas/prompts/peds_respiratory_schema.nd.json) (Ndebele)

**Where to integrate:** 
- App-level language selector (in layout or header)
- Caregiver instructions translation
- AI response translation

**Example integration in assessment page:**

```vue
<!-- In [formId].vue -->
<template>
  <div class="assessment-header">
    <!-- Language selector -->
    <select v-model="currentLanguage" @change="handleLanguageChange">
      <option value="en">English</option>
      <option value="sn">Shona</option>
      <option value="nd">Ndebele</option>
    </select>
  </div>
  
  <!-- Translated caregiver instructions -->
  <div class="caregiver-instructions">
    <h3>{{ $t('instructions.caregiverTitle') }}</h3>
    <p>{{ translatedInstructions }}</p>
  </div>
</template>

<script setup>
import { useTranslation } from '~/composables/useTranslation';

const { 
  currentTargetLanguage, 
  setTargetLanguage, 
  translateCaregiverInstructions 
} = useTranslation();

const currentLanguage = ref('en');

async function handleLanguageChange() {
  setTargetLanguage(currentLanguage.value);
  
  // Translate caregiver instructions
  if (caregiverInstructions.value) {
    const result = await translateCaregiverInstructions(caregiverInstructions.value);
    translatedInstructions.value = result.translatedText;
  }
}
</script>
```

### 4. Feedback Panel Integration

**Files:**
- [`useAIFeedback.ts`](app/composables/useAIFeedback.ts)
- [`AIFeedbackPanel.vue`](app/components/clinical/AIFeedbackPanel.vue)

**Where to integrate:** After AI responses in [`AIStreamingPanel.vue`](app/components/clinical/AIStreamingPanel.vue) and [`ExplainabilityCard.vue`](app/components/clinical/ExplainabilityCard.vue)

**Example integration:**

```vue
<!-- In AIStreamingPanel.vue -->
<template>
  <div class="ai-streaming-panel">
    <div class="response">{{ streamingResponse }}</div>
    
    <!-- Add feedback panel after response completes -->
    <AIFeedbackPanel
      v-if="!isStreaming && streamingResponse"
      :session-id="sessionId"
      :section-id="currentSectionId"
      :response-id="responseId"
      @submitted="handleFeedbackSubmitted"
    />
  </div>
</template>

<script setup>
import AIFeedbackPanel from '~/components/clinical/AIFeedbackPanel.vue';

function handleFeedbackSubmitted(feedback) {
  console.log('Feedback submitted:', feedback);
  // Optionally show thank you message
}
</script>
```

### 5. Offline AI Integration

**Files:**
- [`offlineAI.ts`](app/services/offlineAI.ts)
- [`useOfflineAI.ts`](app/composables/useOfflineAI.ts)

**Where to integrate:** In the AI streaming logic in [`[formId].vue`](app/pages/assessment/[schemaId]/[formId].vue) as a fallback when network is unavailable

**Example integration:**

```vue
<!-- In [formId].vue -->
<script setup>
import { useOfflineAI } from '~/composables/useOfflineAI';

const {
  isOnline,
  isOfflineMode,
  getSectionResponse,
  buildPatientContext,
  cache
} = useOfflineAI({
  onOfflineMode: () => {
    console.log('Switched to offline mode');
    // Show notification to user
  },
  onOnlineMode: () => {
    console.log('Back online');
  }
});

// Modify existing streamSectionAI function
async function streamSectionAI(sectionId: string) {
  // Check if offline
  if (isOfflineMode.value) {
    // Use offline AI
    const ctx = buildPatientContext(instance.value?.answers || {});
    const offlineResponse = getSectionResponse(sectionId, ctx);
    
    streamingResponse.value = offlineResponse.message;
    structuredAIResponse.value = {
      narrative: offlineResponse.message,
      recommendations: offlineResponse.recommendations,
      warnings: offlineResponse.warnings,
      triageSuggestion: offlineResponse.triageSuggestion
    };
    return;
  }
  
  // Otherwise use existing online streaming
  // ... existing streaming logic ...
}
</script>
```

### 6. Analytics Dashboard

**Files:**
- [`useClinicalAnalytics.ts`](app/composables/useClinicalAnalytics.ts)
- [`analytics.vue`](app/pages/admin/analytics.vue)

**Already integrated:** The analytics dashboard is a standalone page at `/admin/analytics`. To add a navigation link:

```vue
<!-- In admin.vue or navigation -->
<NuxtLink to="/admin/analytics" class="nav-link">
  <svg><!-- chart icon --></svg>
  Analytics
</NuxtLink>
```

**To record analytics from assessments:**

```vue
<!-- In [formId].vue -->
<script setup>
import { useClinicalAnalytics } from '~/composables/useClinicalAnalytics';

const { recordSession, updateSession } = useClinicalAnalytics();

// When assessment completes
function onAssessmentComplete() {
  recordSession({
    id: sessionId,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    patientAgeMonths: patientContext.value.ageMonths,
    triagePriority: effectivePriority.value,
    triageClassification: triageClassification.value,
    dangerSignsCount: dangerSigns.length,
    aiInteractions: aiInteractionCount.value,
    aiResponseTime: averageResponseTime.value,
    feedbackRating: feedbackRating.value,
    nurseId: currentNurseId.value,
    schemaId: schemaId.value,
    status: 'completed'
  });
}
</script>
```

## Complete Integration Example

Here's a complete example showing all Phase 3 integrations in the assessment page:

```vue
<template>
  <div class="assessment-page">
    <!-- Language Selector -->
    <div class="language-bar">
      <select v-model="currentLanguage" @change="handleLanguageChange">
        <option value="en">English</option>
        <option value="sn">Shona</option>
        <option value="nd">Ndebele</option>
      </select>
      
      <!-- Offline indicator -->
      <span v-if="isOfflineMode" class="offline-badge">
        ⚠️ Offline Mode
      </span>
    </div>
    
    <!-- Form Fields with Voice Input -->
    <div v-for="field in fields" :key="field.id">
      <FieldRenderer :field="field">
        <template #voice-input>
          <VoiceInputButton
            @transcript="(text) => field.value = text"
            :language="currentLanguage"
          />
        </template>
      </FieldRenderer>
    </div>
    
    <!-- AI Response with Voice Output and Feedback -->
    <div class="ai-section">
      <AIStreamingPanel :response="aiResponse">
        <template #actions>
          <button @click="speakResponse">🔊 Read Aloud</button>
        </template>
        <template #feedback>
          <AIFeedbackPanel
            :session-id="sessionId"
            :section-id="currentSection"
            :response-id="responseId"
          />
        </template>
      </AIStreamingPanel>
    </div>
    
    <!-- Translated Caregiver Instructions -->
    <div class="instructions">
      <h3>{{ $t('instructions.title') }}</h3>
      <p>{{ translatedInstructions }}</p>
    </div>
  </div>
</template>
```

## Next Steps

1. **Add imports** to existing components
2. **Test voice input** on mobile devices
3. **Test offline mode** by disabling network
4. **Test translation** with Shona/Ndebele speakers
5. **Collect feedback** through the feedback panel
6. **Monitor analytics** on the dashboard

## File Locations Summary

| Feature | Service/Composable | Component | Schema |
|---------|-------------------|-----------|--------|
| Voice Input | `useVoiceInput.ts` | `VoiceInputButton.vue` | - |
| Voice Output | `useVoiceOutput.ts` | - | - |
| Translation | `translationService.ts`, `useTranslation.ts` | - | `peds_respiratory_schema.sn.json`, `peds_respiratory_schema.nd.json` |
| Feedback | `useAIFeedback.ts` | `AIFeedbackPanel.vue` | - |
| Analytics | `useClinicalAnalytics.ts` | `analytics.vue` | - |
| Offline AI | `offlineAI.ts`, `useOfflineAI.ts` | - | - |
