<template>
  <div 
    class="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium"
    :class="badgeClasses"
    role="status"
    :aria-label="ariaLabel"
  >
    <!-- AI Icon -->
    <svg 
      v-if="aiEnhancement?.used"
      xmlns="http://www.w3.org/2000/svg" 
      class="h-3.5 w-3.5 flex-shrink-0" 
      :class="iconClass"
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
      aria-hidden="true"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
    
    <!-- System Icon -->
    <svg 
      v-else
      xmlns="http://www.w3.org/2000/svg" 
      class="h-3.5 w-3.5 flex-shrink-0" 
      :class="iconClass"
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
      aria-hidden="true"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>

    <!-- Label -->
    <span :class="textClass">{{ badgeLabel }}</span>

    <!-- Model version tooltip (on hover) -->
    <span 
      v-if="aiEnhancement?.used && aiEnhancement.modelVersion" 
      class="text-xs opacity-60"
      :title="`Model: ${aiEnhancement.modelVersion}`"
    >
      ({{ shortModelVersion }})
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface AIEnhancement {
  used: boolean;
  useCase: string;
  modelVersion?: string;
}

const props = defineProps<{
  aiEnhancement?: AIEnhancement | null;
}>();

// Computed classes based on AI vs System source
const badgeClasses = computed(() => {
  if (props.aiEnhancement?.used) {
    return 'bg-purple-900/20 border-purple-700/30';
  }
  return 'bg-gray-700/30 border-gray-600/30';
});

const iconClass = computed(() => {
  if (props.aiEnhancement?.used) {
    return 'text-purple-400';
  }
  return 'text-gray-400';
});

const textClass = computed(() => {
  if (props.aiEnhancement?.used) {
    return 'text-purple-300';
  }
  return 'text-gray-400';
});

const badgeLabel = computed(() => {
  if (props.aiEnhancement?.used) {
    return 'AI-Powered';
  }
  return 'System';
});

const shortModelVersion = computed(() => {
  if (!props.aiEnhancement?.modelVersion) return '';
  // Extract short version like "gemma3" from "gemma3:4b"
  const version = props.aiEnhancement.modelVersion;
  return version.split(':')[0] || version;
});

const ariaLabel = computed(() => {
  if (props.aiEnhancement?.used) {
    return `AI-powered content generated using ${props.aiEnhancement.modelVersion || 'MedGemma'}`;
  }
  return 'System-generated content';
});
</script>
