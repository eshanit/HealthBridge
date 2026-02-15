<template>
  <div class="clinical-radio-group" :class="{ 'has-error': hasError, 'inline': inline }">
    <label :id="`${id}-label`" class="group-label">
      <span class="label-text">{{ label }}</span>
      <span v-if="required" class="required-marker">*</span>
    </label>

    <div class="radio-options" :role="id" :aria-labelledby="`${id}-label`">
      <label
        v-for="option in options"
        :key="option.value"
        class="radio-option"
        :class="{ 'is-selected': modelValue === option.value, 'is-disabled': option.disabled }"
      >
        <input
          type="radio"
          :id="`${id}-${option.value}`"
          :name="id"
          :value="option.value"
          :checked="modelValue === option.value"
          :disabled="option.disabled || disabled"
          class="radio-input"
          @change="handleChange(option.value)"
        />
        <div class="radio-display">
          <div class="radio-circle">
            <div class="radio-dot" />
          </div>
          <div class="option-content">
            <span class="option-label">{{ option.label }}</span>
            <small v-if="option.description" class="option-description">{{ option.description }}</small>
          </div>
        </div>
      </label>
    </div>

    <div v-if="showValidationHints && errorMessage" class="validation-error">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * ClinicalRadioGroup.vue - Radio Group for Symptom Checklists
 * STATUS: SPEC-COMPLIANT IMPLEMENTATION
 * PURPOSE: Radio button group with clinical context and descriptions
 * 
 * Usage:
 * <ClinicalRadioGroup
 *   id="cough_duration"
 *   label="How long has the child had cough?"
 *   :options="durationOptions"
 *   v-model="answers.cough_duration"
 * />
 */

interface RadioOption {
  value: string | number;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface Props {
  id: string;
  label: string;
  modelValue?: string | number | null;
  options: RadioOption[];
  required?: boolean;
  disabled?: boolean;
  inline?: boolean;
  errorMessage?: string;
  showValidationHints?: boolean;
  validationStatus?: 'valid' | 'invalid' | 'none';
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  required: false,
  disabled: false,
  inline: false,
  showValidationHints: true,
  validationStatus: 'none'
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number | null): void;
  (e: 'change', value: string | number | null): void;
}>();

const hasError = computed(() => props.validationStatus === 'invalid');

function handleChange(value: string | number) {
  emit('update:modelValue', value);
  emit('change', value);
}

// Re-export computed for template
import { computed } from 'vue';
const computed_hasError = computed(() => props.validationStatus === 'invalid');
</script>

<style scoped>
.clinical-radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
}

.clinical-radio-group.has-error {
  border-color: var(--error, #f44336);
  background: var(--error-light, #ffebee);
}

.group-label {
  display: flex;
  align-items: center;
  gap: 4px;
}

.label-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #333);
}

.required-marker {
  color: var(--error, #f44336);
}

.radio-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.clinical-radio-group.inline .radio-options {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16px;
}

.radio-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.radio-option:hover {
  background: var(--surface-hover, #f5f5f5);
}

.radio-option.is-selected {
  border-color: var(--primary, #2196f3);
  background: var(--primary-light, #e3f2fd);
}

.radio-option.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.radio-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.radio-display {
  display: flex;
  align-items: center;
  gap: 10px;
}

.radio-circle {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border, #ccc);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.is-selected .radio-circle {
  border-color: var(--primary, #2196f3);
}

.radio-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: transparent;
  transition: background 0.2s ease;
}

.is-selected .radio-dot {
  background: var(--primary, #2196f3);
}

.option-content {
  display: flex;
  flex-direction: column;
}

.option-label {
  font-size: 14px;
  color: var(--text-primary, #333);
}

.option-description {
  font-size: 12px;
  color: var(--text-secondary, #666);
  margin-top: 2px;
}

.validation-error {
  font-size: 12px;
  color: var(--error, #f44336);
  margin-top: 4px;
}
</style>
