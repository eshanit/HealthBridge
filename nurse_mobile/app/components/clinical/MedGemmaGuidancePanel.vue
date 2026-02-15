<template>
  <div 
    v-if="guidance"
    class="bg-gray-800 rounded-xl border border-purple-700/30 p-6"
    role="region"
    aria-label="MedGemma Clinical Guidance"
  >
    <!-- Header with AI Badge -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-purple-900/30 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div>
          <h3 class="text-white font-semibold">MedGemma</h3>
          <p class="text-xs text-gray-400">AI Clinical Assistant</p>
        </div>
      </div>
      
      <AIStatusBadge :ai-enhancement="aiEnhancement" />
    </div>
    
    <!-- Confidence Indicator -->
    <div v-if="guidance.confidence !== undefined" class="mb-4">
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-400">Confidence:</span>
        <div class="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            class="h-full transition-all duration-300"
            :class="confidenceColorClass"
            :style="{ width: `${guidance.confidence * 100}%` }"
          />
        </div>
        <span class="text-xs font-medium" :class="confidenceTextClass">
          {{ Math.round(guidance.confidence * 100) }}%
        </span>
      </div>
    </div>
    
    <!-- Main Explanation -->
    <div class="mb-4">
      <h4 class="text-white font-medium mb-2">Explanation</h4>
      <p class="text-gray-300 text-sm leading-relaxed">
        {{ guidance.explanation }}
      </p>
    </div>
    
    <!-- Inconsistencies (if any) -->
    <div v-if="guidance.inconsistencies && guidance.inconsistencies.length" class="mb-4">
      <div class="flex items-start gap-2 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h5 class="text-yellow-300 font-medium text-sm mb-1">Potential Inconsistencies</h5>
          <ul class="space-y-1">
            <li 
              v-for="(issue, index) in guidance.inconsistencies" 
              :key="index"
              class="text-yellow-200 text-xs"
            >
              • {{ issue }}
            </li>
          </ul>
        </div>
      </div>
    </div>
    
    <!-- Teaching Notes -->
    <div v-if="guidance.teachingNotes && guidance.teachingNotes.length" class="mb-4">
      <div class="flex items-start gap-2 p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <div>
          <h5 class="text-blue-300 font-medium text-sm mb-1">Clinical Note</h5>
          <p class="text-blue-200 text-xs">
            {{ guidance.teachingNotes[0] }}
          </p>
        </div>
      </div>
    </div>
    
    <!-- Next Steps -->
    <div v-if="guidance.nextSteps && guidance.nextSteps.length" class="mb-4">
      <h4 class="text-white font-medium mb-2">Recommended Actions</h4>
      <ul class="space-y-2">
        <li 
          v-for="(step, index) in guidance.nextSteps" 
          :key="index"
          class="flex items-start gap-2"
        >
          <div class="flex-shrink-0 w-5 h-5 rounded-full bg-green-900/30 flex items-center justify-center mt-0.5">
            <span class="text-green-400 text-xs font-bold">{{ index + 1 }}</span>
          </div>
          <span class="text-gray-300 text-sm">{{ step }}</span>
        </li>
      </ul>
    </div>
    
    <!-- Footer with Model Info -->
    <div class="mt-4 pt-4 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500">
      <div class="flex items-center gap-2">
        <span>{{ guidance.modelVersion || 'MedGemma' }}</span>
        <span>•</span>
        <span>{{ formatTimestamp(guidance.timestamp) }}</span>
      </div>
      
      <div class="flex items-center gap-3">
        <button 
          @click="$emit('helpful')"
          class="flex items-center gap-1 text-gray-400 hover:text-green-400 transition-colors"
          aria-label="Mark as helpful"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <span>Helpful</span>
        </button>
        <button 
          @click="reportIssue"
          class="flex items-center gap-1 text-gray-400 hover:text-yellow-400 transition-colors"
          aria-label="Report issue"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Report</span>
        </button>
      </div>
    </div>
    
    <!-- Disclaimer -->
    <div class="mt-3 p-2 bg-gray-700/30 rounded text-center">
      <p class="text-xs text-gray-400">
        AI-generated. Always verify with clinical judgment.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AIStatusBadge from './AIStatusBadge.vue';

interface GuidanceResponse {
  explanation: string;
  inconsistencies: string[];
  teachingNotes: string[];
  nextSteps: string[];
  confidence: number;
  modelVersion: string;
  timestamp: string;
}

const props = defineProps<{
  guidance: GuidanceResponse | null;
}>();

const emit = defineEmits<{
  (e: 'helpful'): void;
  (e: 'issue', details: string): void;
}>();

const aiEnhancement = computed(() => ({
  used: true,
  useCase: 'EXPLAIN_TRIAGE',
  modelVersion: props.guidance?.modelVersion
}));

const confidenceColorClass = computed(() => {
  const confidence = props.guidance?.confidence ?? 0;
  if (confidence >= 0.8) return 'bg-green-500';
  if (confidence >= 0.6) return 'bg-yellow-500';
  return 'bg-red-500';
});

const confidenceTextClass = computed(() => {
  const confidence = props.guidance?.confidence ?? 0;
  if (confidence >= 0.8) return 'text-green-400';
  if (confidence >= 0.6) return 'text-yellow-400';
  return 'text-red-400';
});

function formatTimestamp(ts: string): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function reportIssue() {
  const details = prompt('Describe the issue with this guidance:');
  if (details) {
    emit('issue', details);
  }
}
</script>
