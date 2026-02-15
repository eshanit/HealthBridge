<!--
  Tailwind CSS Container Component
  Replaces NuxtUI UContainer for layout
  
  Preserves all functionality while using Tailwind CSS classes
-->
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full'
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'lg'
})

// Size configurations (max-width)
const sizeClasses = computed(() => {
  const sizes = {
    xs: 'max-w-xs',
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
    full: 'max-w-full'
  }
  
  return sizes[props.size] || sizes.lg
})

// Base classes
const baseClasses = computed(() => {
  const classes = [
    'mx-auto px-4 sm:px-6 lg:px-8',
    sizeClasses.value
  ]
  
  if (props.class) {
    classes.push(props.class)
  }
  
  return classes.join(' ')
})
</script>

<template>
  <div :class="baseClasses">
    <slot />
  </div>
</template>