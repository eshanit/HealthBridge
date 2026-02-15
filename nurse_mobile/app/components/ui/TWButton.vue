<!--
  Tailwind CSS Button Component
  Replaces NuxtUI UButton for non-form usage
  
  Preserves all functionality while using Tailwind CSS classes
  Supports both button and NuxtLink navigation via the `to` prop
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

interface Props {
  variant?: 'solid' | 'ghost' | 'outline' | 'soft'
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'gray'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  disabled?: boolean
  loading?: boolean
  icon?: string
  label?: string
  block?: boolean
  square?: boolean
  to?: RouteLocationRaw | undefined
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'solid',
  color: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  block: false,
  square: false,
  to: undefined
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

// Color configurations
const colorClasses = computed(() => {
  const colors = {
    primary: {
      solid: 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600',
      ghost: 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20',
      outline: 'text-blue-600 border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20',
      soft: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800'
    },
    secondary: {
      solid: 'bg-gray-600 hover:bg-gray-700 text-white border-gray-600',
      ghost: 'text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900/20',
      outline: 'text-gray-600 border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900/20',
      soft: 'bg-gray-50 text-gray-700 border-gray-100 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800'
    },
    success: {
      solid: 'bg-green-600 hover:bg-green-700 text-white border-green-600',
      ghost: 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20',
      outline: 'text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-900/20',
      soft: 'bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800'
    },
    warning: {
      solid: 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600',
      ghost: 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20',
      outline: 'text-amber-600 border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20',
      soft: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800'
    },
    error: {
      solid: 'bg-red-600 hover:bg-red-700 text-white border-red-600',
      ghost: 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20',
      outline: 'text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20',
      soft: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
    },
    info: {
      solid: 'bg-cyan-600 hover:bg-cyan-700 text-white border-cyan-600',
      ghost: 'text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20',
      outline: 'text-cyan-600 border-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20',
      soft: 'bg-cyan-50 text-cyan-700 border-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-800'
    },
    neutral: {
      solid: 'bg-gray-500 hover:bg-gray-600 text-white border-gray-500',
      ghost: 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900/20',
      outline: 'text-gray-500 border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900/20',
      soft: 'bg-gray-50 text-gray-700 border-gray-100 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800'
    },
    gray: {
      solid: 'bg-gray-700 hover:bg-gray-800 text-white border-gray-700',
      ghost: 'text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-900/20',
      outline: 'text-gray-700 border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-900/20',
      soft: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700'
    }
  }
  
  return colors[props.color]?.[props.variant] || colors.primary.solid
})

// Size configurations
const sizeClasses = computed(() => {
  const sizes = {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
    xl: 'px-8 py-4 text-lg'
  }
  
  return sizes[props.size] || sizes.md
})

// Icon size configurations
const iconSizeClasses = computed(() => {
  const sizes = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-7 h-7'
  }
  
  return sizes[props.size] || sizes.md
})

// Base classes
const baseClasses = computed(() => {
  const classes = [
    'inline-flex items-center justify-center font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2',
    colorClasses.value,
    sizeClasses.value
  ]
  
  if (props.disabled) {
    classes.push('opacity-50 cursor-not-allowed')
  }
  
  if (props.block) {
    classes.push('w-full')
  }
  
  if (!props.square) {
    classes.push('rounded-md')
  }
  
  if (props.variant === 'outline' || props.variant === 'solid') {
    classes.push('border')
  }
  
  // Focus ring color
  const focusColors = {
    primary: 'focus:ring-blue-500',
    secondary: 'focus:ring-gray-500',
    success: 'focus:ring-green-500',
    warning: 'focus:ring-amber-500',
    error: 'focus:ring-red-500',
    info: 'focus:ring-cyan-500',
    neutral: 'focus:ring-gray-500',
    gray: 'focus:ring-gray-500'
  }
  
  classes.push(focusColors[props.color] || focusColors.primary)
  
  return classes.join(' ')
})

const handleClick = (event: MouseEvent) => {
  if (!props.disabled && !props.loading) {
    emit('click', event)
  }
}

// Determine if this is a link or button
const isLink = computed(() => props.to !== null && props.to !== undefined && !props.disabled && !props.loading)
</script>

<template>
  <NuxtLink
    v-if="isLink"
    :to="props.to"
    :class="[baseClasses, 'inline-flex items-center justify-center']"
  >
    <!-- Loading spinner -->
    <svg
      v-if="loading"
      :class="iconSizeClasses"
      class="animate-spin -ml-1 mr-2"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      ></circle>
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
    
    <!-- Icon -->
    <svg
      v-if="icon && !loading"
      :class="[iconSizeClasses, label ? 'mr-2' : '']"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <!-- Heroicon path will be inserted dynamically -->
      <path v-if="icon === 'i-heroicons-plus'" stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
      <path v-else-if="icon === 'i-heroicons-eye'" stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path v-else-if="icon === 'i-heroicons-pencil'" stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      <path v-else-if="icon === 'i-heroicons-x-mark'" stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      <path v-else-if="icon === 'i-heroicons-arrow-right'" stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
      <path v-else-if="icon === 'i-heroicons-check-circle'" stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path v-else-if="icon === 'i-heroicons-exclamation-triangle'" stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      <path v-else-if="icon === 'i-heroicons-information-circle'" stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path v-else-if="icon === 'i-heroicons-document'" stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      <path v-else-if="icon === 'i-heroicons-clock'" stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path v-else-if="icon === 'i-heroicons-user'" stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      <path v-else-if="icon === 'i-heroicons-arrow-right-circle'" stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
      <path v-else-if="icon === 'i-heroicons-arrow-right-on-circle'" stroke-linecap="round" stroke-linejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path v-else-if="icon === 'i-heroicons-beaker'" stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      <path v-else-if="icon === 'i-heroicons-lock-closed'" stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      <path v-else-if="icon === 'i-heroicons-question-mark-circle'" stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      <path v-else-if="icon === 'i-heroicons-home'" stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      <path v-else-if="icon === 'i-heroicons-chat-bubble-left-right'" stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      <path v-else-if="icon === 'i-heroicons-arrow-path'" stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      <path v-else-if="icon === 'i-heroicons-arrow-left'" stroke-linecap="round" stroke-linejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
      <path v-else-if="icon === 'i-heroicons-user-plus'" stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM9 15a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      <path v-else-if="icon === 'i-heroicons-users'" stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      <path v-else-if="icon === 'i-heroicons-clipboard-document-check'" stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path v-else-if="icon === 'i-heroicons-document-text'" stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      <path v-else-if="icon === 'i-heroicons-document-chart-bar'" stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      <path v-else-if="icon === 'i-heroicons-exclamation-circle'" stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path v-else-if="icon === 'i-heroicons-arrow-right-circle'" stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
      <path v-else-if="icon === 'i-heroicons-arrow-right-on-circle'" stroke-linecap="round" stroke-linejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      <!-- Add more icon paths as needed -->
    </svg>
    
    <!-- Label -->
    <span v-if="label">{{ label }}</span>
    
    <!-- Slot for custom content -->
    <slot v-if="!label" />
  </NuxtLink>
  
  <!-- Regular button for non-navigation cases -->
  <button
    v-else
    :class="baseClasses"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <!-- Loading spinner -->
    <svg
      v-if="loading"
      :class="iconSizeClasses"
      class="animate-spin -ml-1 mr-2"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      ></circle>
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
    
    <!-- Icon -->
    <svg
      v-if="icon && !loading"
      :class="[iconSizeClasses, label ? 'mr-2' : '']"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <!-- Heroicon path will be inserted dynamically -->
      <path v-if="icon === 'i-heroicons-plus'" stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
      <path v-else-if="icon === 'i-heroicons-eye'" stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path v-else-if="icon === 'i-heroicons-pencil'" stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      <path v-else-if="icon === 'i-heroicons-x-mark'" stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      <path v-else-if="icon === 'i-heroicons-arrow-right'" stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
      <path v-else-if="icon === 'i-heroicons-check-circle'" stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path v-else-if="icon === 'i-heroicons-exclamation-triangle'" stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      <path v-else-if="icon === 'i-heroicons-information-circle'" stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path v-else-if="icon === 'i-heroicons-document'" stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      <path v-else-if="icon === 'i-heroicons-clock'" stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path v-else-if="icon === 'i-heroicons-user'" stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      <path v-else-if="icon === 'i-heroicons-arrow-right-circle'" stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
      <path v-else-if="icon === 'i-heroicons-arrow-right-on-circle'" stroke-linecap="round" stroke-linejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path v-else-if="icon === 'i-heroicons-beaker'" stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      <path v-else-if="icon === 'i-heroicons-lock-closed'" stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      <path v-else-if="icon === 'i-heroicons-question-mark-circle'" stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      <path v-else-if="icon === 'i-heroicons-home'" stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      <path v-else-if="icon === 'i-heroicons-chat-bubble-left-right'" stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      <path v-else-if="icon === 'i-heroicons-arrow-path'" stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      <path v-else-if="icon === 'i-heroicons-arrow-left'" stroke-linecap="round" stroke-linejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
      <path v-else-if="icon === 'i-heroicons-user-plus'" stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM9 15a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      <path v-else-if="icon === 'i-heroicons-users'" stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      <path v-else-if="icon === 'i-heroicons-clipboard-document-check'" stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path v-else-if="icon === 'i-heroicons-document-text'" stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      <path v-else-if="icon === 'i-heroicons-document-chart-bar'" stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      <path v-else-if="icon === 'i-heroicons-exclamation-circle'" stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path v-else-if="icon === 'i-heroicons-arrow-right-circle'" stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
      <path v-else-if="icon === 'i-heroicons-arrow-right-on-circle'" stroke-linecap="round" stroke-linejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      <!-- Add more icon paths as needed -->
    </svg>
    
    <!-- Label -->
    <span v-if="label">{{ label }}</span>
    
    <!-- Slot for custom content -->
    <slot v-if="!label" />
  </button>
</template>