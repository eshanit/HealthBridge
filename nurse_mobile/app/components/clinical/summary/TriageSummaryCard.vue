<script setup lang="ts">
/**
 * Triage Summary Card
 * Shows classification summary for pediatric respiratory assessment
 */

import { computed } from 'vue';
import type { ClinicalFormInstance } from '~/types/clinical-form';

const props = defineProps<{
  instance: ClinicalFormInstance;
}>();

const triagePriority = computed(() => props.instance.calculated?.triagePriority || 'green');
const isCalculated = computed(() => !!props.instance.calculated?.triagePriority);

const priorityConfig = computed(() => {
  const priority = triagePriority.value;
  switch (priority) {
    case 'red':
      return {
        bgClass: 'bg-red-900/50',
        borderClass: 'border-red-600',
        textClass: 'text-red-400',
        icon: '🚨',
        label: 'RED',
      };
    case 'yellow':
      return {
        bgClass: 'bg-yellow-900/50',
        borderClass: 'border-yellow-600',
        textClass: 'text-yellow-400',
        icon: '⚠️',
        label: 'YELLOW',
      };
    default:
      return {
        bgClass: 'bg-green-900/50',
        borderClass: 'border-green-600',
        textClass: 'text-green-400',
        icon: '✓',
        label: 'GREEN',
      };
  }
});

const config = computed(() => priorityConfig.value);

const classificationText = computed(() => {
  if (!isCalculated.value) {
    return 'Assessment in progress - complete all fields to see classification';
  }
  switch (triagePriority.value) {
    case 'red':
      return 'URGENT REFERRAL - Immediate hospital referral required';
    case 'yellow':
      return 'Needs Treatment - Oral antibiotics and follow-up';
    default:
      return 'Home Care - No antibiotics required';
  }
});

// Always show true to ensure card always renders content
const showContent = computed(() => true);
</script>

<template>
  <div class="triage-summary-card">
    <!-- Status Header -->
    <div class="flex items-center gap-3 mb-4">
      <span class="text-3xl">{{ isCalculated ? config.icon : '⏳' }}</span>
      <div>
        <span 
          class="text-2xl font-bold"
          :class="isCalculated ? config.textClass : 'text-yellow-400'"
        >
          {{ isCalculated ? config.label : 'IN PROGRESS' }}
        </span>
        <p class="text-white font-medium">
          {{ classificationText }}
        </p>
      </div>
    </div>
    
    <!-- Patient Info -->
    <div class="mb-4">
      <div v-if="instance.patientName" class="flex items-center gap-2 mb-2">
        <span class="text-blue-400">👤</span>
        <span class="text-gray-300">{{ instance.patientName }}</span>
      </div>
      
      <div v-if="instance.answers?.patient_age_months" class="flex items-center gap-2">
        <span class="text-purple-400">🎂</span>
        <span class="text-gray-300">{{ instance.answers.patient_age_months }} months old</span>
      </div>
    </div>
    
    <!-- Vital Signs & Assessment Data -->
    <div class="space-y-2 mb-4">
      <div v-if="instance.calculated?.hasDangerSign" class="flex items-center gap-2 text-red-400">
        <span>⚠️</span>
        <span>Danger signs present</span>
      </div>

      <div v-if="instance.calculated?.fastBreathing" class="flex items-center gap-2 text-yellow-400">
        <span>🫁</span>
        <span>Fast breathing detected</span>
      </div>

      <div v-if="instance.answers?.resp_rate" class="flex items-center gap-2">
        <span class="text-blue-400">📊</span>
        <span class="text-gray-300">RR: {{ instance.answers.resp_rate }}/min</span>
      </div>

      <div v-if="instance.answers?.oxygen_sat" class="flex items-center gap-2">
        <span class="text-purple-400">💨</span>
        <span class="text-gray-300">SpO2: {{ instance.answers.oxygen_sat }}%</span>
      </div>
      
      <div v-if="instance.answers?.temperature" class="flex items-center gap-2">
        <span class="text-orange-400">🌡️</span>
        <span class="text-gray-300">Temp: {{ instance.answers.temperature }}°C</span>
      </div>
    </div>
    
    <!-- Recommended Actions -->
    <div v-if="isCalculated" class="pt-4 border-t border-gray-700">
      <h4 class="text-white font-medium mb-2">Recommended Actions:</h4>
      <ul class="space-y-1 text-sm text-gray-300">
        <li v-if="triagePriority === 'red'" class="flex items-center gap-2">
          <span class="text-red-400">→</span> Refer URGENTLY to hospital
        </li>
        <li v-if="triagePriority === 'red'" class="flex items-center gap-2">
          <span class="text-red-400">→</span> Give first dose of antibiotics if trained
        </li>
        <li v-if="triagePriority === 'yellow'" class="flex items-center gap-2">
          <span class="text-yellow-400">→</span> Give oral antibiotics
        </li>
        <li v-if="triagePriority === 'yellow'" class="flex items-center gap-2">
          <span class="text-yellow-400">→</span> Follow up in 2 days
        </li>
        <li v-if="triagePriority === 'green'" class="flex items-center gap-2">
          <span class="text-green-400">→</span> Advise mother on home care
        </li>
        <li v-if="triagePriority === 'green'" class="flex items-center gap-2">
          <span class="text-green-400">→</span> Return if symptoms worsen
        </li>
      </ul>
    </div>
  </div>
</template>
