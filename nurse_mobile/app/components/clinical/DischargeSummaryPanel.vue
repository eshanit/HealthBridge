<template>
  <div class="discharge-summary-panel space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold text-white flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Discharge Summary
      </h3>
      
      <!-- Generate Button -->
      <button
        v-if="!summary && !isGenerating"
        @click="generateAll"
        class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Generate Summary
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isGenerating" class="flex items-center gap-3 text-gray-400 py-8">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      <span>Generating discharge summary...</span>
    </div>

    <!-- Discharge Summary Content -->
    <div v-if="summary" class="space-y-6">
      <!-- Chief Complaint -->
      <div class="bg-gray-800/50 rounded-lg p-4">
        <h4 class="text-sm font-medium text-gray-400 mb-2">Chief Complaint</h4>
        <p class="text-white">{{ summary.chiefComplaint }}</p>
      </div>

      <!-- Key Findings -->
      <div class="bg-gray-800/50 rounded-lg p-4">
        <h4 class="text-sm font-medium text-gray-400 mb-2">Key Findings</h4>
        <ul class="space-y-1">
          <li v-for="(finding, index) in summary.keyFindings" :key="index" class="text-white flex items-start gap-2">
            <span class="text-blue-400">•</span>
            {{ finding }}
          </li>
        </ul>
      </div>

      <!-- Diagnosis -->
      <div class="bg-gray-800/50 rounded-lg p-4">
        <h4 class="text-sm font-medium text-gray-400 mb-2">Diagnosis / Classification</h4>
        <p class="text-white">{{ summary.diagnosis }}</p>
      </div>

      <!-- Treatment Provided -->
      <div class="bg-gray-800/50 rounded-lg p-4">
        <h4 class="text-sm font-medium text-gray-400 mb-2">Treatment Provided</h4>
        <ul class="space-y-1">
          <li v-for="(treatment, index) in summary.treatmentProvided" :key="index" class="text-white flex items-start gap-2">
            <span class="text-green-400">✓</span>
            {{ treatment }}
          </li>
        </ul>
      </div>

      <!-- Follow-up Plan -->
      <div class="bg-gray-800/50 rounded-lg p-4">
        <h4 class="text-sm font-medium text-gray-400 mb-2">Follow-up Plan</h4>
        <p class="text-white">{{ summary.followUpPlan }}</p>
      </div>

      <!-- Return Precautions -->
      <div class="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
        <h4 class="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Return Precautions
        </h4>
        <ul class="space-y-1">
          <li v-for="(precaution, index) in summary.returnPrecautions" :key="index" class="text-red-300 flex items-start gap-2">
            <span>⚠</span>
            {{ precaution }}
          </li>
        </ul>
      </div>

      <!-- AI Indicator -->
      <div class="flex items-center gap-2 text-xs text-gray-500">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span>AI-generated summary • Generated at {{ formatTimestamp(summary.generatedAt) }}</span>
      </div>
    </div>

    <!-- Clinical Handover Section -->
    <div v-if="handover" class="mt-8 pt-6 border-t border-gray-700">
      <h4 class="text-md font-semibold text-white mb-4 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        Clinical Handover (SBAR)
      </h4>

      <div class="grid gap-4">
        <!-- Situation -->
        <div class="bg-purple-900/20 border border-purple-700/30 rounded-lg p-4">
          <h5 class="text-sm font-medium text-purple-400 mb-1">S - Situation</h5>
          <p class="text-white text-sm">{{ handover.situation }}</p>
        </div>

        <!-- Background -->
        <div class="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4">
          <h5 class="text-sm font-medium text-blue-400 mb-1">B - Background</h5>
          <p class="text-white text-sm">{{ handover.background }}</p>
        </div>

        <!-- Assessment -->
        <div class="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4">
          <h5 class="text-sm font-medium text-yellow-400 mb-1">A - Assessment</h5>
          <p class="text-white text-sm">{{ handover.assessment }}</p>
        </div>

        <!-- Recommendation -->
        <div class="bg-green-900/20 border border-green-700/30 rounded-lg p-4">
          <h5 class="text-sm font-medium text-green-400 mb-1">R - Recommendation</h5>
          <p class="text-white text-sm">{{ handover.recommendation }}</p>
        </div>
      </div>
    </div>

    <!-- Follow-up Reminder Section -->
    <div v-if="followUp" class="mt-8 pt-6 border-t border-gray-700">
      <h4 class="text-md font-semibold text-white mb-4 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Follow-up Reminder
      </h4>

      <div class="bg-orange-900/20 border border-orange-700/30 rounded-lg p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-orange-400 font-medium">Follow-up Date:</span>
          <span class="text-white">{{ formatDate(followUp.followUpDate) }}</span>
        </div>
        
        <p class="text-gray-300 text-sm mb-3">{{ followUp.instructions }}</p>
        
        <div class="text-sm">
          <span class="text-gray-400">Warning Signs to Watch:</span>
          <ul class="mt-2 space-y-1">
            <li v-for="(sign, index) in followUp.warningSigns" :key="index" class="text-orange-300 flex items-start gap-2">
              <span>•</span>
              {{ sign }}
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div v-if="summary" class="flex gap-3 pt-4">
      <button 
        @click="printSummary"
        class="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        Print
      </button>
      <button 
        @click="shareSummary"
        class="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Share
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useDischargeSummary, type DischargeSummary, type ClinicalHandover, type FollowUpReminder } from '~/composables/useDischargeSummary';
import type { ExplainabilityRecord } from '~/types/explainability';

/**
 * Discharge Summary Panel Component
 * 
 * Phase 2.3: Displays AI-generated discharge summaries, clinical handovers, and follow-up reminders
 */

const props = defineProps<{
  sessionId: string;
  patientName: string;
  patientAgeMonths: number;
  patientGender: string;
  triagePriority: 'red' | 'yellow' | 'green';
  assessmentAnswers: Record<string, unknown>;
  treatmentAnswers?: Record<string, unknown>;
  recommendedActions?: string[];
  explainability: ExplainabilityRecord | null;
}>();

const emit = defineEmits<{
  (e: 'generated', summary: DischargeSummary): void;
  (e: 'error', error: string): void;
}>();

// Initialize composable
const {
  isGeneratingSummary,
  isGeneratingHandover,
  isGeneratingFollowUp,
  dischargeSummary,
  clinicalHandover,
  followUpReminder,
  generateDischargeSummary,
  generateClinicalHandover,
  generateFollowUpReminder
} = useDischargeSummary({ enableStreaming: true });

// Computed
const summary = dischargeSummary;
const handover = clinicalHandover;
const followUp = followUpReminder;

const isGenerating = computed(() => 
  isGeneratingSummary.value || isGeneratingHandover.value || isGeneratingFollowUp.value
);

// Methods
async function generateAll() {
  if (!props.explainability) {
    emit('error', 'No explainability data available');
    return;
  }

  const sessionData = {
    sessionId: props.sessionId,
    patientName: props.patientName,
    patientAgeMonths: props.patientAgeMonths,
    patientGender: props.patientGender,
    triagePriority: props.triagePriority,
    assessmentAnswers: props.assessmentAnswers,
    treatmentAnswers: props.treatmentAnswers,
    recommendedActions: props.recommendedActions
  };

  try {
    // Generate all summaries in parallel
    await Promise.all([
      generateDischargeSummary(sessionData, props.explainability),
      generateClinicalHandover(sessionData, props.explainability),
      generateFollowUpReminder(sessionData, props.explainability)
    ]);

    if (dischargeSummary.value) {
      emit('generated', dischargeSummary.value);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to generate summary';
    emit('error', errorMessage);
  }
}

function formatTimestamp(isoString: string): string {
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function printSummary() {
  window.print();
}

function shareSummary() {
  // In a real app, this would use the Web Share API or copy to clipboard
  if (navigator.share) {
    navigator.share({
      title: 'Discharge Summary',
      text: `Discharge summary for ${props.patientName}`
    });
  } else {
    // Fallback to clipboard
    const text = `Discharge Summary for ${props.patientName}\n\n` +
      `Chief Complaint: ${summary.value?.chiefComplaint}\n` +
      `Diagnosis: ${summary.value?.diagnosis}\n` +
      `Follow-up: ${summary.value?.followUpPlan}`;
    
    navigator.clipboard.writeText(text);
  }
}
</script>
