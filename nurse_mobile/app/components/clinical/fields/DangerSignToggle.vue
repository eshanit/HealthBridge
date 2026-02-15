<template>
  <div class="danger-sign-toggle" :class="{ 'is-positive': value, 'is-urgent': urgent }">
    <label class="toggle-label">
      <input
        type="checkbox"
        :checked="value"
        :disabled="disabled"
        class="toggle-input"
        @change="handleChange"
      />
      <div class="toggle-display">
        <div class="toggle-track">
          <div class="toggle-thumb" :class="{ 'is-checked': value }">
            <span class="check-icon">{{ value ? '✓' : '' }}</span>
          </div>
        </div>
        <div class="toggle-content">
          <div class="header">
            <span class="icon">{{ value ? '⚠️' : '✓' }}</span>
            <span class="label-text"><strong>{{ label }}</strong></span>
          </div>
          <small v-if="clinicalNote" class="clinical-context">{{ clinicalNote }}</small>
        </div>
      </div>
    </label>
    
    <div v-if="value" class="urgent-banner">
      ⚠️ GENERAL DANGER SIGN - Requires URGENT attention
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * DangerSignToggle.vue - Specialized Toggle for Danger Signs
 * STATUS: SPEC-COMPLIANT IMPLEMENTATION
 * PURPOSE: Specialized component for danger signs with visual urgency indicators
 * 
 * Usage:
 * <DangerSignToggle
 *   id="danger_inability_to_drink"
 *   label="Unable to drink or breastfeed"
 *   clinical-note="Child cannot swallow fluids"
 *   v-model:value="answers.danger_inability_to_drink"
 * />
 */

interface Props {
  id: string;
  label: string;
  clinicalNote?: string;
  value?: boolean;
  urgent?: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  value: false,
  urgent: true,
  disabled: false
});

const emit = defineEmits<{
  (e: 'update:value', value: boolean): void;
}>();

function handleChange(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('update:value', target.checked);
}
</script>

<style scoped>
.danger-sign-toggle {
  border: 2px solid var(--border, #e0e0e0);
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s ease;
  background: var(--surface, #fff);
}

.danger-sign-toggle:hover {
  border-color: var(--border-hover, #ccc);
}

.danger-sign-toggle.is-positive {
  border-color: #ff9800;
  background: linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%);
}

.danger-sign-toggle.is-urgent.is-positive {
  border-color: #f44336;
  background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
  animation: urgent-pulse 2s infinite;
}

@keyframes urgent-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.4);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(244, 67, 54, 0);
  }
}

.toggle-label {
  display: flex;
  align-items: flex-start;
  cursor: pointer;
}

.toggle-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.toggle-display {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.toggle-track {
  width: 44px;
  height: 24px;
  background: var(--track-off, #ccc);
  border-radius: 12px;
  position: relative;
  transition: background 0.2s ease;
  flex-shrink: 0;
}

.is-positive .toggle-track {
  background: #ff9800;
}

.is-urgent.is-positive .toggle-track {
  background: #f44336;
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toggle-thumb.is-checked {
  transform: translateX(20px);
}

.check-icon {
  font-size: 12px;
  color: #f44336;
  font-weight: bold;
}

.toggle-content {
  flex: 1;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon {
  font-size: 18px;
}

.label-text {
  font-size: 15px;
  color: var(--text-primary, #333);
}

.clinical-context {
  display: block;
  margin-top: 4px;
  margin-left: 26px;
  color: var(--text-secondary, #666);
  font-size: 13px;
}

.urgent-banner {
  margin-top: 12px;
  padding: 8px 12px;
  background: #f44336;
  color: white;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
}

.danger-sign-toggle.is-positive .label-text {
  color: #c62828;
}

.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
