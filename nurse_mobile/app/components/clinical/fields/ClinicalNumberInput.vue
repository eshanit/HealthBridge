<template>
  <div class="clinical-number-input" :class="{ 'has-error': hasError, 'has-warning': hasWarning }">
    <label :for="id" class="input-label">
      <span class="label-text">{{ label }}</span>
      <span v-if="required" class="required-marker">*</span>
    </label>
    
    <div class="input-wrapper">
      <input
        :id="id"
        type="number"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :min="min"
        :max="max"
        :step="step"
        class="number-input"
        :class="{ 'has-unit': unit }"
        @input="handleInput"
        @blur="handleBlur"
        @focus="handleFocus"
      />
      <span v-if="unit" class="unit">{{ unit }}</span>
    </div>

    <div v-if="showValidationHints" class="validation-hints">
      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
      <p v-else-if="warningMessage" class="warning-message">{{ warningMessage }}</p>
      <p v-else-if="hint" class="hint-message">{{ hint }}</p>
    </div>

    <div v-if="showRange" class="range-indicator">
      <span>Range: {{ min }} - {{ max }} {{ unit }}</span>
    </div>

    <small v-if="clinicalGuidance" class="clinical-guidance">
      {{ clinicalGuidance }}
    </small>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * ClinicalNumberInput.vue - Number Input with Validation Hints
 * STATUS: SPEC-COMPLIANT IMPLEMENTATION
 * PURPOSE: Number input with clinical validation hints and WHO guideline ranges
 * 
 * Usage:
 * <ClinicalNumberInput
 *   id="respiratory_rate"
 *   label="Respiratory Rate"
 *   unit="breaths/min"
 *   :min="0"
 *   :max="120"
 *   :clinical-guidance="WHO_IMCI_RANGES[ageMonths]"
 *   v-model="answers.respiratory_rate"
 * />
 */

interface Props {
  id: string;
  label: string;
  modelValue?: number | null;
  placeholder?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  errorMessage?: string;
  warningMessage?: string;
  hint?: string;
  showValidationHints?: boolean;
  showRange?: boolean;
  clinicalGuidance?: string;
  validationStatus?: 'valid' | 'invalid' | 'warning' | 'none';
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  placeholder: '',
  min: 0,
  max: 999,
  step: 1,
  required: false,
  disabled: false,
  readonly: false,
  showValidationHints: true,
  showRange: true,
  validationStatus: 'none'
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | null): void;
  (e: 'blur', event: FocusEvent): void;
  (e: 'focus', event: FocusEvent): void;
  (e: 'validate', value: number | null): void;
}>();

const hasError = computed(() => props.validationStatus === 'invalid');
const hasWarning = computed(() => props.validationStatus === 'warning');

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = target.value ? parseFloat(target.value) : null;
  emit('update:modelValue', value);
  emit('validate', value);
}

function handleBlur(event: FocusEvent) {
  emit('blur', event);
  if (props.modelValue !== null) {
    const clampedValue = Math.min(Math.max(props.modelValue, props.min), props.max);
    if (clampedValue !== props.modelValue) {
      emit('update:modelValue', clampedValue);
    }
  }
}

function handleFocus(event: FocusEvent) {
  emit('focus', event);
}
</script>

<style scoped>
.clinical-number-input {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
}

.clinical-number-input.has-error {
  border-color: var(--error, #f44336);
  background: var(--error-light, #ffebee);
}

.clinical-number-input.has-warning {
  border-color: var(--warning, #ff9800);
  background: var(--warning-light, #fff3e0);
}

.input-label {
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

.input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.number-input {
  flex: 1;
  padding: 10px 12px;
  font-size: 16px;
  border: 1px solid var(--border, #ccc);
  border-radius: 6px;
  background: var(--surface, #fff);
  color: var(--text-primary, #333);
}

.number-input:focus {
  outline: none;
  border-color: var(--primary, #2196f3);
  box-shadow: 0 0 0 2px var(--primary-light, #e3f2fd);
}

.number-input:disabled {
  background: var(--disabled-bg, #f5f5f5);
  cursor: not-allowed;
}

.number-input.has-unit {
  padding-right: 60px;
}

.unit {
  position: absolute;
  right: 20px;
  font-size: 14px;
  color: var(--text-secondary, #666);
}

.validation-hints {
  font-size: 12px;
  min-height: 18px;
}

.error-message {
  color: var(--error, #f44336);
  margin: 0;
}

.warning-message {
  color: var(--warning, #ff9800);
  margin: 0;
}

.hint-message {
  color: var(--text-secondary, #666);
  margin: 0;
}

.range-indicator {
  font-size: 11px;
  color: var(--text-muted, #999);
}

.clinical-guidance {
  font-size: 12px;
  color: var(--primary, #2196f3);
  background: var(--primary-light, #e3f2fd);
  padding: 6px 10px;
  border-radius: 4px;
  margin: 0;
}
</style>
