<template>
  <div 
    v-if="riskResult"
    class="rounded-xl border p-4"
    :class="riskResult.colorClass"
    role="region"
    aria-label="Adherence Risk Assessment"
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <h4 class="font-medium flex items-center gap-2">
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          class="h-5 w-5" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
          aria-hidden="true"
        >
          <path 
            v-if="riskResult.level === 'high'"
            stroke-linecap="round" 
            stroke-linejoin="round" 
            stroke-width="2" 
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
          />
          <path 
            v-else-if="riskResult.level === 'medium'"
            stroke-linecap="round" 
            stroke-linejoin="round" 
            stroke-width="2" 
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
          />
          <path 
            v-else
            stroke-linecap="round" 
            stroke-linejoin="round" 
            stroke-width="2" 
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" 
          />
        </svg>
        Adherence Risk
      </h4>
      
      <!-- Risk Badge -->
      <span 
        class="px-2 py-1 rounded-full text-xs font-bold uppercase"
        :class="{
          'bg-red-700/50': riskResult.level === 'high',
          'bg-yellow-700/50': riskResult.level === 'medium',
          'bg-green-700/50': riskResult.level === 'low'
        }"
      >
        {{ riskResult.level }} Risk
      </span>
    </div>

    <!-- Score Bar -->
    <div class="mb-4">
      <div class="flex justify-between text-xs mb-1">
        <span>Risk Score</span>
        <span>{{ riskResult.score }}/100</span>
      </div>
      <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div 
          class="h-full transition-all duration-300"
          :class="{
            'bg-red-500': riskResult.level === 'high',
            'bg-yellow-500': riskResult.level === 'medium',
            'bg-green-500': riskResult.level === 'low'
          }"
          :style="{ width: `${riskResult.score}%` }"
        />
      </div>
    </div>

    <!-- Contributing Factors -->
    <div v-if="riskResult.contributingFactors.length > 0" class="mb-4">
      <h5 class="text-sm font-medium mb-2 opacity-80">Contributing Factors:</h5>
      <ul class="space-y-1">
        <li 
          v-for="(factor, index) in riskResult.contributingFactors" 
          :key="index"
          class="text-sm flex items-start gap-2"
        >
          <span class="opacity-60">•</span>
          <span>{{ factor }}</span>
        </li>
      </ul>
    </div>

    <!-- Recommendations -->
    <div v-if="showRecommendations && riskResult.recommendations.length > 0">
      <button 
        @click="recommendationsExpanded = !recommendationsExpanded"
        class="text-sm font-medium flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          class="h-4 w-4 transition-transform"
          :class="{ 'rotate-90': recommendationsExpanded }"
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        Recommendations
      </button>
      
      <ul 
        v-if="recommendationsExpanded"
        class="mt-2 space-y-1 pl-5"
      >
        <li 
          v-for="(rec, index) in riskResult.recommendations" 
          :key="index"
          class="text-sm"
        >
          {{ rec }}
        </li>
      </ul>
    </div>

    <!-- AI Indicator -->
    <div class="mt-3 pt-3 border-t border-current/10 flex items-center gap-2 text-xs opacity-60">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
      <span>Rule-based assessment</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { AdherenceRiskResult } from '~/composables/useAdherenceRisk';

/**
 * Adherence Risk Indicator Component
 * 
 * Phase 2.1 Task 2.1.3: Displays adherence risk assessment for treatment plans
 */

const props = withDefaults(defineProps<{
  /** The calculated risk result */
  riskResult: AdherenceRiskResult | null;
  /** Whether to show recommendations section */
  showRecommendations?: boolean;
  /** Whether recommendations start expanded */
  initialExpanded?: boolean;
}>(), {
  showRecommendations: true,
  initialExpanded: false
});

const recommendationsExpanded = ref(props.initialExpanded);
</script>
