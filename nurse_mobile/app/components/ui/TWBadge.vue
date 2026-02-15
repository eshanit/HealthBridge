<!--
  Tailwind CSS Badge Component
  Replaces NuxtUI UBadge for status indicators
  
  Preserves all functionality while using Tailwind CSS classes
-->
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'solid' | 'soft' | 'outline'
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'gray'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  label?: string
  square?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'solid',
  color: 'primary',
  size: 'sm',
  square: false
})

// Color configurations
const colorClasses = computed(() => {
  const colors = {
    primary: {
      solid: 'bg-blue-600 text-white',
      soft: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
      outline: 'bg-transparent text-blue-600 border-blue-600 dark:text-blue-400 dark:border-blue-400'
    },
    secondary: {
      solid: 'bg-gray-600 text-white',
      soft: 'bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-300',
      outline: 'bg-transparent text-gray-600 border-gray-600 dark:text-gray-400 dark:border-gray-400'
    },
    success: {
      solid: 'bg-green-600 text-white',
      soft: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300',
      outline: 'bg-transparent text-green-600 border-green-600 dark:text-green-400 dark:border-green-400'
    },
    warning: {
      solid: 'bg-amber-600 text-white',
      soft: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
      outline: 'bg-transparent text-amber-600 border-amber-600 dark:text-amber-400 dark:border-amber-400'
    },
    error: {
      solid: 'bg-red-600 text-white',
      soft: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
      outline: 'bg-transparent text-red-600 border-red-600 dark:text-red-400 dark:border-red-400'
    },
    info: {
      solid: 'bg-cyan-600 text-white',
      soft: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-300',
      outline: 'bg-transparent text-cyan-600 border-cyan-600 dark:text-cyan-400 dark:border-cyan-400'
    },
    neutral: {
      solid: 'bg-gray-500 text-white',
      soft: 'bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-300',
      outline: 'bg-transparent text-gray-500 border-gray-500 dark:text-gray-400 dark:border-gray-400'
    },
    gray: {
      solid: 'bg-gray-700 text-white',
      soft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
      outline: 'bg-transparent text-gray-700 border-gray-700 dark:text-gray-300 dark:border-gray-300'
    }
  }
  
  return colors[props.color]?.[props.variant] || colors.primary.solid
})

// Size configurations
const sizeClasses = computed(() => {
  const sizes = {
    xs: 'px-1.5 py-0.5 text-xs',
    sm: 'px-2 py-1 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-sm'
  }
  
  return sizes[props.size] || sizes.sm
})

// Base classes
const baseClasses = computed(() => {
  const classes = [
    'inline-flex items-center justify-center font-medium',
    colorClasses.value,
    sizeClasses.value
  ]
  
  if (!props.square) {
    classes.push('rounded-full')
  } else {
    classes.push('rounded')
  }
  
  if (props.variant === 'outline') {
    classes.push('border')
  }
  
  return classes.join(' ')
})
</script>

<template>
  <span :class="baseClasses">
    <!-- Default slot for custom content -->
    <slot v-if="!label" />
    
    <!-- Label text -->
    <span v-if="label">{{ label }}</span>
  </span>
</template>