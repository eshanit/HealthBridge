<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue';
import { SelectValue, type SelectValueProps } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<SelectValueProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
    const { class: _, ...delegated } = props;
    return delegated;
});
</script>

<template>
    <SelectValue v-bind="delegatedProps" :class="cn('', props.class)">
        <slot />
    </SelectValue>
</template>
