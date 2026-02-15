<script setup lang="ts">
/**
 * SessionCard Component
 * 
 * Displays a clinical session in the queue with triage badge,
 * stage indicator, and action buttons.
 * 
 * Uses Nuxt UI components for consistent styling.
 */

import { computed } from 'vue';
import type { ClinicalSession, ClinicalSessionTriage, ClinicalSessionStage } from '~/services/sessionEngine';
import { TWCard, TWBadge, TWIcon, TWButton } from '~/components/ui';

interface Props {
  session: ClinicalSession;
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  compact: false
});

const emit = defineEmits<{
  (e: 'click', session: ClinicalSession): void;
  (e: 'action', session: ClinicalSession, action: string): void;
}>();

// ============================================
// Computed Properties
// ============================================

/**
 * Get triage badge configuration
 */
const triageConfig = computed(() => {
  const configs: Record<ClinicalSessionTriage, { 
    color: 'error' | 'warning' | 'success' | 'gray'; 
    label: string; 
    icon: string;
    bgClass: string;
    textClass: string;
  }> = {
    red: { 
      color: 'error', 
      label: 'RED',
      icon: 'i-heroicons-exclamation-circle',
      bgClass: 'bg-red-100 dark:bg-red-900',
      textClass: 'text-red-800 dark:text-red-200'
    },
    yellow: { 
      color: 'warning', 
      label: 'YELLOW',
      icon: 'i-heroicons-exclamation-triangle',
      bgClass: 'bg-amber-100 dark:bg-amber-900',
      textClass: 'text-amber-800 dark:text-amber-200'
    },
    green: { 
      color: 'success', 
      label: 'GREEN',
      icon: 'i-heroicons-check-circle',
      bgClass: 'bg-green-100 dark:bg-green-900',
      textClass: 'text-green-800 dark:text-green-200'
    },
    unknown: { 
      color: 'gray', 
      label: 'UNKNOWN',
      icon: 'i-heroicons-question-mark-circle',
      bgClass: 'bg-gray-100 dark:bg-gray-800',
      textClass: 'text-gray-800 dark:text-gray-200'
    }
  };
  
  return configs[props.session.triage] || configs.unknown;
});

/**
 * Get stage badge configuration
 */
const stageConfig = computed(() => {
  const configs: Record<ClinicalSessionStage, { 
    color: 'neutral' | 'primary' | 'success' | 'secondary'; 
    label: string;
  }> = {
    registration: { color: 'neutral', label: 'Registration' },
    assessment: { color: 'primary', label: 'Assessment' },
    treatment: { color: 'success', label: 'Treatment' },
    discharge: { color: 'secondary', label: 'Discharge' }
  };
  
  return configs[props.session.stage] || configs.registration;
});

/**
 * Format session age (time since created)
 */
const sessionAge = computed(() => {
  const now = Date.now();
  const diff = now - props.session.createdAt;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
});

/**
 * Format time for display
 */
const formattedTime = computed(() => {
  const date = new Date(props.session.createdAt);
  return date.toLocaleTimeString('en-CA', {
    hour: '2-digit',
    minute: '2-digit'
  });
});

/**
 * Get next action label based on stage
 */
const nextActionLabel = computed(() => {
  switch (props.session.stage) {
    case 'registration':
      return 'Start Assessment';
    case 'assessment':
      return 'Continue';
    case 'treatment':
      return 'Complete Treatment';
    case 'discharge':
      return 'Close Session';
    default:
      return 'Continue';
  }
});

// ============================================
// Actions
// ============================================

function handleClick() {
  emit('click', props.session);
}

function handleContinue() {
  emit('action', props.session, 'continue');
}
</script>

<template>
  <TWCard
    color="gray"
    class="cursor-pointer transition-all duration-200 hover:shadow-md dark:hover:shadow-lg"
    :class="[
      compact ? 'py-3 px-4' : 'py-4 px-6'
    ]"
    @click="handleClick"
  >
    <!-- Header Row -->
    <div class="flex items-start justify-between">
      <!-- Left: Triage Badge & Session Info -->
      <div class="flex items-center gap-3">
<!-- Triage Badge -->
        <TWBadge
          :color="triageConfig.color === 'error' ? 'error' : triageConfig.color === 'warning' ? 'warning' : triageConfig.color === 'success' ? 'success' : 'neutral'"
          variant="solid"
          size="sm"
          class="font-bold"
        >
          <TWIcon :name="triageConfig.icon" size="xs" class="mr-1" />
          {{ triageConfig.label }}
        </TWBadge>
        
        <!-- Session Info -->
        <div v-if="!compact">
          <div class="text-sm text-gray-500 dark:text-gray-400">
            Session {{ session.id.slice(7, 11) }} • {{ formattedTime }}
          </div>
          <div class="text-xs text-gray-400 dark:text-gray-500">
            Age: {{ sessionAge }}
          </div>
        </div>
      </div>
      
<!-- Right: Stage Badge -->
      <TWBadge
        :color="stageConfig.color === 'primary' ? 'primary' : stageConfig.color === 'success' ? 'success' : stageConfig.color === 'secondary' ? 'secondary' : 'neutral'"
        variant="soft"
        size="sm"
      >
        {{ stageConfig.label }}
      </TWBadge>
    </div>
    
<!-- Form Count (if not compact) -->
    <div v-if="!compact && session.formInstanceIds.length > 0" class="mt-3">
      <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <TWIcon name="i-heroicons-document-text" size="sm" />
        <span>{{ session.formInstanceIds.length }} form(s) completed</span>
      </div>
    </div>
    
<!-- Action Button -->
    <div v-if="!compact" class="mt-4">
      <TWButton
        :color="triageConfig.color === 'error' ? 'error' : 'primary'"
        size="sm"
        block
        @click.stop="handleContinue"
      >
        {{ nextActionLabel }}
        <TWIcon name="i-heroicons-arrow-right" size="sm" class="ml-1" />
      </TWButton>
    </div>
</TWCard>
</template>
