<!--
  Tailwind CSS Alert Component
  Replaces NuxtUI UAlert for notifications
  
  Preserves all functionality while using Tailwind CSS classes
-->
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'solid' | 'soft' | 'outline'
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'gray'
  dismissible?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'soft',
  color: 'info',
  dismissible: false,
  size: 'md'
})

const emit = defineEmits<{
  close: []
}>()

// Color configurations
const colorClasses = computed(() => {
  const colors = {
    primary: {
      solid: 'bg-blue-600 text-white border-blue-600',
      soft: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
      outline: 'bg-transparent text-blue-600 border-blue-600 dark:text-blue-400 dark:border-blue-400'
    },
    secondary: {
      solid: 'bg-gray-600 text-white border-gray-600',
      soft: 'bg-gray-50 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800',
      outline: 'bg-transparent text-gray-600 border-gray-600 dark:text-gray-400 dark:border-gray-400'
    },
    success: {
      solid: 'bg-green-600 text-white border-green-600',
      soft: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
      outline: 'bg-transparent text-green-600 border-green-600 dark:text-green-400 dark:border-green-400'
    },
    warning: {
      solid: 'bg-amber-600 text-white border-amber-600',
      soft: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
      outline: 'bg-transparent text-amber-600 border-amber-600 dark:text-amber-400 dark:border-amber-400'
    },
    error: {
      solid: 'bg-red-600 text-white border-red-600',
      soft: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
      outline: 'bg-transparent text-red-600 border-red-600 dark:text-red-400 dark:border-red-400'
    },
    info: {
      solid: 'bg-cyan-600 text-white border-cyan-600',
      soft: 'bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-800',
      outline: 'bg-transparent text-cyan-600 border-cyan-600 dark:text-cyan-400 dark:border-cyan-400'
    },
    neutral: {
      solid: 'bg-gray-500 text-white border-gray-500',
      soft: 'bg-gray-50 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800',
      outline: 'bg-transparent text-gray-500 border-gray-500 dark:text-gray-400 dark:border-gray-400'
    },
    gray: {
      solid: 'bg-gray-700 text-white border-gray-700',
      soft: 'bg-gray-100 text-gray-900 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700',
      outline: 'bg-transparent text-gray-700 border-gray-700 dark:text-gray-300 dark:border-gray-300'
    }
  }
  
  return colors[props.color]?.[props.variant] || colors.info.soft
})

// Size configurations
const sizeClasses = computed(() => {
  const sizes = {
    sm: 'p-3 text-sm',
    md: 'p-4 text-sm',
    lg: 'p-5 text-base'
  }
  
  return sizes[props.size] || sizes.md
})

// Icon configurations
const iconClasses = computed(() => {
  const colors = {
    primary: 'text-blue-500',
    secondary: 'text-gray-500',
    success: 'text-green-500',
    warning: 'text-amber-500',
    error: 'text-red-500',
    info: 'text-cyan-500',
    neutral: 'text-gray-500',
    gray: 'text-gray-500'
  }
  
  return colors[props.color] || colors.info
})

// Base classes
const baseClasses = computed(() => {
  const classes = [
    'relative flex items-start gap-3 rounded-lg',
    colorClasses.value,
    sizeClasses.value
  ]
  
  if (props.variant === 'outline') {
    classes.push('border')
  }
  
  return classes.join(' ')
})

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <div :class="baseClasses">
    <!-- Default slot for icon and content -->
    <slot>
      <!-- Default icon placeholder -->
      <div :class="['flex-shrink-0 w-5 h-5', iconClasses]">
        <svg class="w-full h-full" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
        </svg>
      </div>
    </slot>
    
    <!-- Content -->
    <div class="flex-1 min-w-0">
      <!-- Default slot for content -->
      <slot name="content" />
    </div>
    
    <!-- Close button -->
    <button
      v-if="dismissible"
      @click="handleClose"
      :class="[
        'flex-shrink-0 p-1 rounded-md transition-colors',
        'hover:bg-gray-100 dark:hover:bg-gray-800',
        'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
      ]"
    >
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
      </svg>
    </button>
  </div>
</template>