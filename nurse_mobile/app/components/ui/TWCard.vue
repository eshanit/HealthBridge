<!--
  Tailwind CSS Card Component
  Replaces NuxtUI UCard for content display
  
  Preserves all functionality while using Tailwind CSS classes
-->
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'solid' | 'outline'
  color?: 'white' | 'gray' | 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  square?: boolean
  shadow?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'solid',
  color: 'white',
  size: 'md',
  square: false,
  shadow: true
})

// Color configurations
const colorClasses = computed(() => {
  const colors = {
    white: {
      solid: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
      outline: 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
    },
    gray: {
      solid: 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700',
      outline: 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600'
    },
    primary: {
      solid: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
      outline: 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
    },
    secondary: {
      solid: 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
      outline: 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600'
    }
  }
  
  return colors[props.color]?.[props.variant] || colors.white.solid
})

// Size configurations
const sizeClasses = computed(() => {
  const sizes = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6'
  }
  
  return sizes[props.size] || sizes.md
})

// Shadow configurations
const shadowClasses = computed(() => {
  if (!props.shadow) return ''
  
  return 'shadow-sm dark:shadow-lg dark:shadow-black/20'
})

// Base classes
const baseClasses = computed(() => {
  const classes = [
    'relative overflow-hidden',
    colorClasses.value,
    sizeClasses.value,
    shadowClasses.value
  ]
  
  if (!props.square) {
    classes.push('rounded-lg')
  }
  
  if (props.variant === 'outline' || props.variant === 'solid') {
    classes.push('border')
  }
  
  return classes.join(' ')
})
</script>

<template>
  <div :class="baseClasses">
    <!-- Default slot for card content -->
    <slot />
  </div>
</template>