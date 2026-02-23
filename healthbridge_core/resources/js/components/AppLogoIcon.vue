<script setup lang="ts">
import type { HTMLAttributes } from 'vue';

defineOptions({
    inheritAttrs: false,
});

type Props = {
    className?: HTMLAttributes['class'];
};

defineProps<Props>();
</script>

<template>
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        :class="className"
        v-bind="$attrs"
    >
        <!-- Utanobridge Logo: Bridge with Medical Cross -->
        <path
            fill="currentColor"
            d="M21 8V6H19V8H17V6H15V8H13V6H11V8H9V6H7V8H5V6H3V8H1V10H3V12H1V14H3V16H1V18H3V20H5V18H7V20H9V18H11V20H13V18H15V20H17V18H19V20H21V18H23V16H21V14H23V12H21V10H23V8H21ZM5 16V10H7V16H5ZM9 16V10H11V16H9ZM13 16V10H15V16H13ZM17 16V10H19V16H17Z"
        />
        <!-- Medical cross overlay -->
        <path
            fill="currentColor"
            d="M10 3H14V5H10V3ZM10 5H14V7H10V5ZM8 5H10V7H8V5ZM14 5H16V7H14V5Z"
            opacity="0.8"
        />
    </svg>
</template>
