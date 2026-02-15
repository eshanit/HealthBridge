<script setup lang="ts">
/**
 * Field Renderer Component
 * 
 * REQUIRED per ARCHITECTURE_RULES.md Section 4 - FIELD RENDERER ARCHITECTURE
 * 
 * All form fields MUST use this component for rendering.
 * Maps field types to NuxtUI components.
 * 
 * Phase 3 Integration: Voice Input support for text/textarea fields
 */

import { computed, ref } from 'vue';
import type { FieldDefinition } from '~/types/clinical-form';
import VoiceInputButton from '~/components/clinical/VoiceInputButton.vue';

const props = defineProps<{
  field: FieldDefinition;
  modelValue: any;
  error?: string;
  disabled?: boolean;
  /** Enable voice input for this field */
  enableVoice?: boolean;
  /** Language for voice input (en, sn, nd) */
  voiceLanguage?: 'en' | 'sn' | 'nd';
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void;
  (e: 'blur', event: FocusEvent): void;
}>();

// Voice input state
const showVoiceButton = computed(() => {
  return props.enableVoice && (fieldType.value === 'text' || fieldType.value === 'textarea' || fieldType.value === 'number');
});

function handleVoiceTranscript(transcript: string) {
  // For number fields, try to extract a number
  if (fieldType.value === 'number') {
    const num = parseFloat(transcript.replace(/[^0-9.-]/g, ''));
    if (!isNaN(num)) {
      updateValue(num);
    }
  } else {
    updateValue(transcript);
  }
}

// Field properties
const fieldId = computed(() => props.field.id);
const fieldType = computed(() => props.field.type);
const label = computed(() => props.field.label);
const required = computed(() => props.field.required);
const placeholder = computed(() => props.field.placeholder || '');
const helpText = computed(() => props.field.helpText);
const clinicalNote = computed(() => props.field.clinicalNote);
const uiHint = computed(() => props.field.uiHint || 'normal');

// Type-specific config
const selectOptions = computed(() => {
  const field = props.field as Record<string, any>;
  const fieldOptions = field.options || field.config?.options || [];
  console.log('[FieldRenderer] selectOptions for field:', field.id, fieldOptions);
  // Ensure options is an array
  if (!Array.isArray(fieldOptions)) {
    console.warn(`[FieldRenderer] Options for field "${field.id}" is not an array:`, fieldOptions);
    return [];
  }
  
  // Transform to NuxtUI format for select (objects with label/value)
  return fieldOptions.map((opt: string) => {
    console.log('[FieldRenderer] select option:', opt);
    console.log('[FieldRenderer] type of option:', typeof opt);
    if (typeof opt == 'string') {
      return { label: opt, value: opt };
    }
    return opt;
  });
});

// Radio options - keep as string array but transform for URadioGroup
const radioOptions = computed(() => {
  const field = props.field as Record<string, any>;
  const fieldOptions = field.options || field.config?.options || [];
  
  if (!Array.isArray(fieldOptions)) {
    return [];
  }
  
  return fieldOptions.map((opt: string) => ({ value: opt, label: opt }));
});
const min = computed(() => (props.field.config as any)?.min);
const max = computed(() => (props.field.config as any)?.max);
const step = computed(() => (props.field.config as any)?.step);
const suffix = computed(() => (props.field.config as any)?.suffix);

// UI hint styling - NuxtUI uses 'error' for urgent, 'warning' for warning
const uiColor = computed(() => {
  switch (uiHint.value) {
    case 'urgent': return 'error' as const;
    case 'warning': return 'warning' as const;
    default: return 'neutral' as const;
  }
});

const uiIcon = computed(() => {
  switch (uiHint.value) {
    case 'urgent': return 'i-heroicons-exclamation-triangle';
    case 'warning': return 'i-heroicons-exclamation-circle';
    default: return undefined;
  }
});

// Value updates
function updateValue(value: any) {
  emit('update:modelValue', value);
}

function handleBlur(event: FocusEvent) {
  emit('blur', event);
}
</script>

<template>
  <UFormField
    :name="fieldId"
    :label="label"
    :required="required"
    :error="error"
    :help="helpText"
    class="w-full mb-4"
    :class="{ 'opacity-70': disabled }"
  >
    <template v-if="clinicalNote" #hint>
      <UAlert
        :title="clinicalNote"
        :icon="uiIcon"
        :color="uiColor"
        variant="subtle"
        size="xs"
        class="mt-2 bg-blue-800 border border-blue-700 text-sky-500"
      />
    </template>

    <!-- Text Input with Voice Support -->
    <div v-if="fieldType === 'text'" class="flex items-center gap-2">
      <UInput
        :id="fieldId"
        :model-value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :color="uiColor"
        class="flex-1"
        @update:model-value="updateValue"
        @blur="handleBlur"
        :ui="{ 
          base: 'w-full bg-gray-700 text-white border-gray-600 focus:border-blue-500 focus:ring-blue-500'
        }"
      />
      <VoiceInputButton
        v-if="showVoiceButton"
        @transcript="handleVoiceTranscript"
        :language="voiceLanguage || 'en'"
        :disabled="disabled"
      />
    </div>

    <!-- Number Input with Voice Support -->
    <div v-else-if="fieldType === 'number'" class="flex items-center gap-2">
      <UInput
        :id="fieldId"
        type="number"
        :model-value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :min="min"
        :max="max"
        :step="step"
        :color="uiColor"
        class="flex-1"
        @update:model-value="(val) => updateValue(val ? Number(val) : null)"
        @blur="handleBlur"
        :ui="{ 
          base: 'w-full bg-gray-700 text-white border-gray-600 focus:border-blue-500 focus:ring-blue-500'
        }"
      >
        <template v-if="suffix" #trailing>
          <span class="text-gray-400 text-sm">{{ suffix }}</span>
        </template>
      </UInput>
      <VoiceInputButton
        v-if="showVoiceButton"
        @transcript="handleVoiceTranscript"
        :language="voiceLanguage || 'en'"
        :disabled="disabled"
      />
    </div>

    <!-- Select -->
    <USelect
      v-else-if="fieldType === 'select'"
      :id="fieldId"
      :model-value="modelValue"
      :items="selectOptions"
      :placeholder="'Select...' + (required ? ' *' : '')"
      :disabled="disabled"
      :color="uiColor"
      class="w-full"
      @update:model-value="updateValue"
      :ui="{ 
        base: 'w-full bg-gray-700 text-white border-gray-600 focus:border-blue-500 focus:ring-blue-500'
      }"
    />

    <!-- Radio Group -->
    <URadioGroup
      v-else-if="fieldType === 'radio'"
      :id="fieldId"
      :model-value="modelValue"
      :items="radioOptions"
      :disabled="disabled"
      :color="uiColor"
      class="w-full space-y-2"
      @update:model-value="updateValue"
    >
      <template #label>
        <span class="text-sm font-medium text-gray-300">{{ label }}</span>
      </template>
    </URadioGroup>

    <!-- Checkbox -->
    <UCheckbox
      v-else-if="fieldType === 'checkbox'"
      :id="fieldId"
      :model-value="modelValue"
      :label="field.description || label"
      :disabled="disabled"
      :color="uiColor"
      class="w-full"
      @update:model-value="updateValue"
    />

    <!-- Toggle / Switch -->
    <USwitch
      v-else-if="fieldType === 'boolean'"
      :id="fieldId"
      :model-value="modelValue"
      :disabled="disabled"
      :color="uiColor"
      @update:model-value="updateValue"
    />

    <!-- Timer (for respiratory rate counting) -->
    <div v-else-if="fieldType === 'timer'" class="flex items-center gap-3 w-full">
      <UButton
        color="primary"
        variant="solid"
        class="flex-shrink-0"
        @click="updateValue(60)"
      >
        Start 60s Timer
      </UButton>
      <span class="text-gray-400 flex-grow">{{ modelValue || 0 }} breaths counted</span>
    </div>

    <!-- Date Input -->
    <UInput
      v-else-if="fieldType === 'date'"
      :id="fieldId"
      type="date"
      :model-value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      class="w-full"
      @update:model-value="updateValue"
      @blur="handleBlur"
      :ui="{ 
        base: 'w-full bg-gray-700 text-white border-gray-600 focus:border-blue-500 focus:ring-blue-500'
      }"
    />

    <!-- Time Input -->
    <UInput
      v-else-if="fieldType === 'time'"
      :id="fieldId"
      type="time"
      :model-value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      class="w-full"
      @update:model-value="updateValue"
      @blur="handleBlur"
      :ui="{ 
        base: 'w-full bg-gray-700 text-white border-gray-600 focus:border-blue-500 focus:ring-blue-500'
      }"
    />

    <!-- Textarea with Voice Support -->
    <div v-else-if="fieldType === 'textarea'" class="flex items-start gap-2">
      <UTextarea
        :id="fieldId"
        :model-value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :rows="3"
        class="flex-1"
        @update:model-value="updateValue"
        @blur="handleBlur"
        :ui="{ 
          base: 'w-full bg-gray-700 text-white border-gray-600 focus:border-blue-500 focus:ring-blue-500'
        }"
      />
      <VoiceInputButton
        v-if="showVoiceButton"
        @transcript="handleVoiceTranscript"
        :language="voiceLanguage || 'en'"
        :disabled="disabled"
      />
    </div>

    <!-- Calculated Field (read-only) -->
    <div v-else-if="fieldType === 'calculated'" class="text-sm font-medium text-gray-300 p-3 bg-gray-800 rounded">
      <template v-if="Array.isArray(modelValue)">
        <ul v-if="modelValue.length" class="list-disc list-inside space-y-1">
          <li v-for="(item, idx) in modelValue" :key="idx">{{ item }}</li>
        </ul>
        <span v-else>-</span>
      </template>
      <template v-else>
        {{ modelValue || '-' }}
      </template>
    </div>

    <!-- Fallback for unknown types -->
    <UInput
      v-else
      :id="fieldId"
      :model-value="modelValue"
      :placeholder="`Field type not supported: ${fieldType}`"
      :disabled="true"
      class="w-full bg-gray-800 text-gray-400"
      @update:model-value="updateValue"
    />
  </UFormField>
</template>

<style scoped>
/* Ensure consistent field heights */
:deep(.u-input),
:deep(.u-select),
:deep(.u-textarea) {
  width: 100%;
}

/* Dark theme adjustments - White text for all input types */
:deep(.u-input input),
:deep(.u-input .u-input__input),
:deep(.u-select .u-select__selected),
:deep(.u-textarea textarea) {
  color: white !important;
  background-color: transparent !important;
}

:deep(.u-input),
:deep(.u-select),
:deep(.u-textarea) {
  background-color: #374151 !important;
  color: white !important;
  border-color: #4b5563 !important;
}

:deep(.u-input:focus),
:deep(.u-select:focus),
:deep(.u-textarea:focus) {
  border-color: #3b82f6 !important;
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2) !important;
}

/* Placeholder text color */
:deep(.u-input input::placeholder),
:deep(.u-textarea textarea::placeholder) {
  color: #9ca3af !important;
}

/* Select dropdown text */
:deep(.u-select .u-select__placeholder) {
  color: #9ca3af !important;
}

:deep(.u-select .u-select__selected) {
  color: white !important;
}
</style>