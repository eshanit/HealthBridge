<!--
  Tailwind CSS Icon Component
  Replaces NuxtUI UIcon for icon rendering
  
  Preserves all functionality while using Tailwind CSS classes
-->
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  color?: string
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md'
})

// Size configurations
const sizeClasses = computed(() => {
  const sizes = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-7 h-7',
    '2xl': 'w-8 h-8',
    '3xl': 'w-10 h-10'
  }
  
  return sizes[props.size] || sizes.md
})

// Color configurations
const colorClasses = computed(() => {
  if (!props.color) return ''
  
  const colors = {
    'text-gray-400': 'text-gray-400',
    'text-gray-500': 'text-gray-500',
    'text-gray-600': 'text-gray-600',
    'text-gray-700': 'text-gray-700',
    'text-gray-900': 'text-gray-900',
    'text-white': 'text-white',
    'text-blue-500': 'text-blue-500',
    'text-blue-600': 'text-blue-600',
    'text-green-500': 'text-green-500',
    'text-green-600': 'text-green-600',
    'text-amber-500': 'text-amber-500',
    'text-amber-600': 'text-amber-600',
    'text-red-500': 'text-red-500',
    'text-red-600': 'text-red-600',
    'text-cyan-500': 'text-cyan-500',
    'text-cyan-600': 'text-cyan-600',
    'text-purple-500': 'text-purple-500',
    'text-purple-600': 'text-purple-600',
    'text-emerald-500': 'text-emerald-500',
    'text-emerald-600': 'text-emerald-600',
    'text-orange-500': 'text-orange-500',
    'text-orange-600': 'text-orange-600'
  }
  
  return colors[props.color] || props.color
})

// Base classes
const baseClasses = computed(() => {
  const classes = [
    'inline-flex-shrink-0',
    sizeClasses.value,
    colorClasses.value
  ]
  
  if (props.class) {
    classes.push(props.class)
  }
  
  return classes.join(' ')
})

// Icon path mappings
const iconPath = computed(() => {
  const paths: Record<string, string> = {
    'i-heroicons-check-circle': 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    'i-heroicons-exclamation-circle': 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    'i-heroicons-exclamation-triangle': 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    'i-heroicons-lock-closed': 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    'i-heroicons-question-mark-circle': 'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z',
    'i-heroicons-plus': 'M12 4v16m8-8H4',
    'i-heroicons-eye': 'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    'i-heroicons-pencil': 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
    'i-heroicons-x-mark': 'M6 18L18 6M6 6l12 12',
    'i-heroicons-arrow-right': 'M13 7l5 5m0 0l-5 5m5-5H6',
    'i-heroicons-arrow-left': 'M11 17l-5-5m0 0l5-5m-5 5h12',
    'i-heroicons-arrow-right-circle': 'M13 7l5 5m0 0l-5 5m5-5H6',
    'i-heroicons-arrow-right-on-circle': 'M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z',
    'i-heroicons-document': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    'i-heroicons-document-text': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    'i-heroicons-document-chart-bar': 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    'i-heroicons-clock': 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    'i-heroicons-user': 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    'i-heroicons-user-plus': 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM9 15a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    'i-heroicons-users': 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    'i-heroicons-clipboard-document-check': 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    'i-heroicons-beaker': 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    'i-heroicons-home': 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    'i-heroicons-chat-bubble-left-right': 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    'i-heroicons-arrow-path': 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    'i-heroicons-information-circle': 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    'i-heroicons-circle': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
    'i-heroicons-x-circle': 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
    'i-heroicons-minus': 'M20 12H4',
    'i-heroicons-magnifying-glass': 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    'i-heroicons-qr-code': 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z'
  }
  
  return paths[props.name] || ''
})
</script>

<template>
  <svg
    v-if="iconPath"
    :class="baseClasses"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path :d="iconPath" />
  </svg>
  
  <!-- Fallback for unknown icons -->
  <div
    v-else
    :class="baseClasses"
    class="flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400"
  >
    ?
  </div>
</template>