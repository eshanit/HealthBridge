<template>
  <div v-if="model" class="bg-gray-800 rounded-xl border p-6" :class="cardBorderClass" role="region" :aria-label="cardAriaLabel">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6 pb-4 border-b" :class="borderBottomClass">
      <div class="flex items-center gap-3">
        <!-- Priority Badge -->
        <div class="flex items-center gap-2">
          <div :class="priorityIconClass" class="w-8 h-8 rounded-full flex items-center justify-center" role="img" :aria-label="`${model.classification.priority} priority`">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              class="h-4 w-4" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                stroke-linecap="round" 
                stroke-linejoin="round" 
                stroke-width="2" 
                :d="priorityIconPath" 
              />
            </svg>
          </div>
          <span :class="priorityTextClass" class="font-semibold text-sm">
            {{ model.classification.priority.toUpperCase() }}
          </span>
        </div>
        
        <!-- Classification Info -->
        <div class="ml-2">
          <h3 class="text-white font-medium">{{ model.classification.label }}</h3>
          <p class="text-gray-400 text-xs">{{ model.classification.protocol }}</p>
        </div>
      </div>

      <!-- AI Status Indicator -->
      <AIStatusBadge :ai-enhancement="model.aiEnhancement" />
    </div>

    <!-- AI Confidence Badge (if AI-generated) -->
    <div v-if="model.aiEnhancement?.used" class="mb-4" role="status" aria-live="polite">
      <div class="flex items-center gap-2 px-3 py-1.5 bg-purple-900/20 border border-purple-700/30 rounded-lg">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span class="text-purple-300 text-xs font-medium">
          AI Confidence: {{ Math.round((model.confidence || 0) * 100) }}%
        </span>
        <span v-if="model.aiEnhancement.modelVersion" class="text-gray-500 text-xs">
          ({{ model.aiEnhancement.modelVersion }})
        </span>
      </div>
    </div>

    <!-- Fallback Notice (if not AI-generated) -->
    <div v-if="!model.aiEnhancement?.used" class="mb-4" role="status" aria-live="polite">
      <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-700/30 border border-gray-600/30 rounded-lg">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <span class="text-gray-400 text-xs font-medium">
          System-generated classification
        </span>
      </div>
    </div>

    <!-- Phase 4: Risk Badge (if risk score provided) -->
    <div v-if="riskScore" class="mb-4" role="status" aria-live="polite">
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg border" :class="riskBadgeContainerClass">
        <span class="text-lg" aria-hidden="true">{{ riskBadgeEmoji }}</span>
        <span class="text-xs font-medium" :class="riskBadgeTextClass">
          AI Safety: {{ riskScore.levelLabel }}
        </span>
        <span class="text-xs opacity-70">
          (Score: {{ riskScore.total }})
        </span>
      </div>
    </div>

    <!-- Phase 4: Contradictions Warning (if any) -->
    <div v-if="hasContradictions" class="mb-4" role="alert">
      <div class="flex items-start gap-2 px-3 py-2 bg-red-900/20 border border-red-700/30 rounded-lg">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <span class="text-red-300 text-xs font-medium block">Safety Alert</span>
          <span class="text-red-200 text-xs">{{ contradictionsSummary }}</span>
        </div>
      </div>
    </div>

    <!-- Why this classification? -->
    <div class="mb-6">
      <div class="flex items-center gap-2 mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h4 class="text-white font-medium">Why this classification?</h4>
      </div>
      <ul class="space-y-3" role="list" aria-label="Clinical triggers">
        <li 
          v-for="(trigger, index) in model.reasoning.triggers" 
          :key="index" 
          class="flex items-start gap-3 p-3 bg-gray-700/30 rounded-lg"
          :aria-label="`Trigger ${index + 1}: ${trigger.clinicalMeaning}`"
        >
          <div class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-900/30 flex items-center justify-center mt-0.5" aria-hidden="true">
            <span class="text-blue-400 text-xs font-bold">{{ index + 1 }}</span>
          </div>
          <div class="flex-1">
            <div class="flex items-baseline gap-2 mb-1">
              <code class="text-sm text-white bg-gray-700 px-2 py-1 rounded">{{ trigger.value }}</code>
              <span class="text-gray-400 text-sm" aria-hidden="true">→</span>
              <span class="text-white text-sm font-medium">{{ trigger.clinicalMeaning }}</span>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <!-- Summary (with AI indicator) -->
    <div v-if="model.reasoning.clinicalNarrative" class="mb-6" :class="{ 'ai-content': model.aiEnhancement?.used }">
      <div class="flex items-center gap-2 mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" :class="summaryIconClass" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h4 class="text-white font-medium">Summary</h4>
        <span v-if="model.aiEnhancement?.used" class="text-xs px-2 py-0.5 bg-purple-900/30 text-purple-300 rounded-full" aria-label="AI-generated content">
          AI
        </span>
        <span v-else class="text-xs px-2 py-0.5 bg-gray-700/50 text-gray-400 rounded-full" aria-label="System-generated content">
          System
        </span>
      </div>
      <p 
        class="text-gray-300 text-sm leading-relaxed p-3 rounded-lg"
        :class="narrativeBackgroundClass"
        role="paragraph"
        :aria-label="model.aiEnhancement?.used ? 'AI-generated clinical summary' : 'System-generated clinical summary'"
      >
        {{ model.reasoning.clinicalNarrative }}
      </p>
    </div>

    <!-- Phase 1: Inconsistencies Detected (from structured response) -->
    <div v-if="hasInconsistencies" class="mb-6">
      <div class="flex items-center gap-2 mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h4 class="text-white font-medium">Potential Inconsistencies</h4>
        <span class="text-xs px-2 py-0.5 bg-yellow-900/30 text-yellow-300 rounded-full">
          {{ inconsistencies.length }} detected
        </span>
      </div>
      <ul class="space-y-2" role="list" aria-label="Detected inconsistencies">
        <li 
          v-for="(issue, index) in inconsistencies" 
          :key="index"
          class="flex items-start gap-3 p-3 bg-yellow-900/10 border border-yellow-700/20 rounded-lg"
        >
          <div class="flex-shrink-0 w-5 h-5 rounded-full bg-yellow-900/30 flex items-center justify-center mt-0.5" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01" />
            </svg>
          </div>
          <span class="text-yellow-200 text-sm">{{ issue }}</span>
        </li>
      </ul>
    </div>

    <!-- Phase 1: Teaching Notes (from structured response) -->
    <div v-if="hasTeachingNotes" class="mb-6">
      <div class="flex items-center gap-2 mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <h4 class="text-white font-medium">Clinical Teaching Notes</h4>
        <span class="text-xs px-2 py-0.5 bg-blue-900/30 text-blue-300 rounded-full" aria-label="AI-generated content">
          AI
        </span>
      </div>
      <ul class="space-y-2" role="list" aria-label="Teaching notes">
        <li 
          v-for="(note, index) in teachingNotes" 
          :key="index"
          class="flex items-start gap-3 p-3 bg-blue-900/10 border border-blue-700/20 rounded-lg"
        >
          <div class="flex-shrink-0 w-5 h-5 rounded-full bg-blue-900/30 flex items-center justify-center mt-0.5" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span class="text-blue-200 text-sm">{{ note }}</span>
        </li>
      </ul>
    </div>

    <!-- Phase 1: AI-Suggested Next Steps (from structured response) -->
    <div v-if="hasNextSteps" class="mb-6">
      <div class="flex items-center gap-2 mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        <h4 class="text-white font-medium">AI-Suggested Next Steps</h4>
        <span class="text-xs px-2 py-0.5 bg-green-900/30 text-green-300 rounded-full" aria-label="AI-generated content">
          AI
        </span>
      </div>
      <ul class="space-y-2" role="list" aria-label="Suggested next steps">
        <li 
          v-for="(step, index) in nextSteps" 
          :key="index"
          class="flex items-start gap-3 p-3 bg-green-900/10 border border-green-700/20 rounded-lg"
        >
          <div class="flex-shrink-0 w-5 h-5 rounded-full bg-green-900/30 flex items-center justify-center mt-0.5" aria-hidden="true">
            <span class="text-green-400 text-xs font-bold">{{ index + 1 }}</span>
          </div>
          <span class="text-green-200 text-sm">{{ step }}</span>
        </li>
      </ul>
    </div>

    <!-- Recommended Actions -->
    <div class="mb-6">
      <div class="flex items-center gap-2 mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h4 class="text-white font-medium">Recommended Actions</h4>
      </div>
      <ul class="space-y-2" role="list" aria-label="Recommended clinical actions">
        <li 
          v-for="action in model.recommendedActions" 
          :key="action.code" 
          class="flex items-start gap-3 p-3 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-colors"
          :aria-label="`Action: ${action.label}`"
        >
          <div class="flex-shrink-0 w-5 h-5 rounded-full bg-yellow-900/30 flex items-center justify-center mt-0.5" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div class="flex-1">
            <span class="text-white text-sm font-medium block mb-1">{{ action.label }}</span>
            <span v-if="action.justification" class="text-gray-400 text-xs block">
              {{ action.justification }}
            </span>
          </div>
        </li>
      </ul>
    </div>

    <!-- Footer -->
    <div class="pt-4 border-t border-gray-700">
      <!-- Safety Notes -->
      <div v-if="model.safetyNotes?.length" class="mb-4" role="note">
        <div class="flex flex-wrap gap-2">
          <span 
            v-for="(note, index) in model.safetyNotes" 
            :key="index"
            class="text-xs text-gray-400 bg-gray-700/50 px-3 py-1.5 rounded-full"
            :aria-label="`Safety note: ${note}`"
          >
            {{ note }}
          </span>
        </div>
      </div>
      
      <!-- Audit Info -->
      <div class="flex items-center justify-between text-xs text-gray-500">
        <div class="flex items-center gap-2">
          <span>Clinical decision support</span>
          <span v-if="model.aiEnhancement?.used" class="text-purple-400" aria-label="AI-enhanced">
            • AI-enhanced
          </span>
          <span v-else class="text-gray-500" aria-label="Rule-based">
            • Rule-based
          </span>
        </div>
        <span>{{ formatTimestamp(model.timestamp) }}</span>
      </div>
    </div>
  </div>

  <!-- Error State -->
  <div v-else class="bg-gray-800 rounded-xl border border-gray-700 p-6 text-center">
    <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-gray-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <p class="text-gray-400">Explainability data unavailable</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ExplainabilityRecord } from '~/types/explainability';
import type { StructuredResponse } from '~/services/clinicalAI';
import AIStatusBadge from './AIStatusBadge.vue';

// ============================================
// Phase 4: Risk Score Types
// ============================================

interface RiskScoreData {
  total: number;
  level: 'green' | 'yellow' | 'red';
  levelLabel: string;
}

interface ContradictionData {
  type: string;
  description: string;
  severity: string;
}

const props = defineProps<{
  model: ExplainabilityRecord | null;
  /** Phase 1: Structured AI response data */
  structuredData?: StructuredResponse | null;
  /** Phase 4: Risk score from safety orchestrator */
  riskScore?: RiskScoreData | null;
  /** Phase 4: Contradictions detected */
  contradictions?: ContradictionData[] | null;
}>();

// ============================================
// Phase 4: Risk Badge Computed Properties
// ============================================

const riskBadgeEmoji = computed(() => {
  switch (props.riskScore?.level) {
    case 'green': return '🟢';
    case 'yellow': return '🟡';
    case 'red': return '🔴';
    default: return '⚪';
  }
});

const riskBadgeContainerClass = computed(() => {
  switch (props.riskScore?.level) {
    case 'green': return 'bg-green-900/20 border-green-700/30';
    case 'yellow': return 'bg-yellow-900/20 border-yellow-700/30';
    case 'red': return 'bg-red-900/20 border-red-700/30';
    default: return 'bg-gray-700/30 border-gray-600/30';
  }
});

const riskBadgeTextClass = computed(() => {
  switch (props.riskScore?.level) {
    case 'green': return 'text-green-300';
    case 'yellow': return 'text-yellow-300';
    case 'red': return 'text-red-300';
    default: return 'text-gray-300';
  }
});

const hasContradictions = computed(() => {
  return props.contradictions && props.contradictions.length > 0;
});

const contradictionsSummary = computed(() => {
  if (!props.contradictions || props.contradictions.length === 0) return '';
  
  const critical = props.contradictions.filter(c => c.severity === 'critical').length;
  const errors = props.contradictions.filter(c => c.severity === 'error').length;
  
  if (critical > 0) {
    return `${critical} critical issue(s) detected between AI and system`;
  }
  if (errors > 0) {
    return `${errors} potential conflict(s) found`;
  }
  return `${props.contradictions.length} minor issue(s) detected`;
});

// ============================================
// Existing Computed Properties
// ============================================

// Accessibility: Card aria-label
const cardAriaLabel = computed(() => {
  const priority = props.model?.classification.priority || 'unknown';
  const source = props.model?.aiEnhancement?.used ? 'AI-generated' : 'system-generated';
  return `Clinical explainability card: ${priority} priority, ${source}`;
});

// Summary icon color based on AI source
const summaryIconClass = computed(() => {
  return props.model?.aiEnhancement?.used ? 'text-purple-400' : 'text-green-400';
});

// Narrative background style based on AI source
const narrativeBackgroundClass = computed(() => {
  return props.model?.aiEnhancement?.used 
    ? 'bg-purple-900/10 border border-purple-700/20' 
    : 'bg-gray-700/30';
});

const cardBorderClass = computed(() => {
  switch (props.model?.classification.priority) {
    case 'red': return 'border-red-700/30';
    case 'yellow': return 'border-yellow-700/30';
    case 'green': return 'border-green-700/30';
    default: return 'border-gray-700';
  }
});

const borderBottomClass = computed(() => {
  switch (props.model?.classification.priority) {
    case 'red': return 'border-red-700/20';
    case 'yellow': return 'border-yellow-700/20';
    case 'green': return 'border-green-700/20';
    default: return 'border-gray-700';
  }
});

const priorityIconClass = computed(() => {
  switch (props.model?.classification.priority) {
    case 'red': return 'bg-red-900/30 text-red-400';
    case 'yellow': return 'bg-yellow-900/30 text-yellow-400';
    case 'green': return 'bg-green-900/30 text-green-400';
    default: return 'bg-gray-700 text-gray-400';
  }
});

const priorityTextClass = computed(() => {
  switch (props.model?.classification.priority) {
    case 'red': return 'text-red-400';
    case 'yellow': return 'text-yellow-400';
    case 'green': return 'text-green-400';
    default: return 'text-gray-400';
  }
});

const priorityIconPath = computed(() => {
  switch (props.model?.classification.priority) {
    case 'red':
      return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
    case 'yellow':
      return 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    case 'green':
      return 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z';
    default:
      return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
  }
});

// Phase 1: Structured response computed properties
const inconsistencies = computed(() => {
  return props.structuredData?.inconsistencies || [];
});

const teachingNotes = computed(() => {
  return props.structuredData?.teachingNotes || [];
});

const nextSteps = computed(() => {
  return props.structuredData?.nextSteps || [];
});

const hasInconsistencies = computed(() => {
  return inconsistencies.value.length > 0;
});

const hasTeachingNotes = computed(() => {
  return teachingNotes.value.length > 0;
});

const hasNextSteps = computed(() => {
  return nextSteps.value.length > 0;
});

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
</script>