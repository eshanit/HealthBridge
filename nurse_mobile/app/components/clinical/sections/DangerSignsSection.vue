<template>
  <FormSection
    :title="title"
    :description="description"
    :current-step="completedCount"
    :total-steps="totalCount"
    :progress="progress"
    :is-complete="isComplete"
    :has-errors="hasDangerSigns"
    :is-collapsed="isCollapsed"
    :show-ask-med-gemma="showAskMedGemma"
    :is-ask-med-gemma-disabled="isAskMedGemmaDisabled"
    @toggle="emit('toggle')"
    @ask-medgemma="emit('ask-medgemma')"
  >
    <div class="danger-signs-container">
      <div v-if="hasDangerSigns" class="danger-banner">
        <span class="danger-icon">⚠️</span>
        <span class="danger-text">
          <strong>{{ dangerSignCount }} General Danger Sign(s) Detected</strong>
          <br />
          <small>This patient requires URGENT attention according to WHO IMCI guidelines.</small>
        </span>
      </div>

      <div class="danger-signs-grid">
        <DangerSignToggle
          v-for="dangerSign in dangerSigns"
          :key="dangerSign.id"
          :id="dangerSign.id"
          :label="dangerSign.label"
          :clinical-note="dangerSign.clinicalNote"
          :value="localAnswers[dangerSign.id] || false"
          :urgent="dangerSign.urgent"
          @update:value="updateAnswer(dangerSign.id, $event)"
        />
      </div>

      <div v-if="showImciGuidance" class="imci-guidance">
        <h4>IMCI Classification Guidance</h4>
        <ul>
          <li v-if="hasDangerSigns">
            <strong>URGENT:</strong> Any positive danger sign requires immediate referral or emergency care
          </li>
          <li v-else>
            <strong>NO DANGER SIGNS:</strong> Continue with assessment. Check for respiratory symptoms.
          </li>
        </ul>
      </div>

      <slot name="footer" />
    </div>
  </FormSection>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FormSection from './FormSection.vue';
import DangerSignToggle from '../fields/DangerSignToggle.vue';

/**
 * DangerSignsSection.vue - Specialized Section for Danger Signs
 * STATUS: SPEC-COMPLIANT IMPLEMENTATION
 * PURPOSE: Collapsible section with specialized danger sign toggles and urgent banners
 * 
 * Usage:
 * <DangerSignsSection
 *   :danger-signs="schema.dangerSigns"
 *   :answers="answers"
 *   @update:answer="handleAnswerUpdate"
 * />
 */

interface DangerSign {
  id: string;
  label: string;
  clinicalNote: string;
  urgent?: boolean;
}

interface Props {
  title?: string;
  description?: string;
  dangerSigns: DangerSign[];
  answers: Record<string, boolean>;
  isCollapsed?: boolean;
  showImciGuidance?: boolean;
  showAskMedGemma?: boolean;
  isAskMedGemmaDisabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'General Danger Signs',
  description: 'Check for general danger signs requiring urgent attention',
  isCollapsed: false,
  showImciGuidance: true,
  showAskMedGemma: false,
  isAskMedGemmaDisabled: false
});

const emit = defineEmits<{
  (e: 'update:answer', fieldId: string, value: boolean): void;
  (e: 'toggle'): void;
  (e: 'danger-sign-detected', count: number): void;
  (e: 'ask-medgemma'): void;
}>();

const localAnswers = computed(() => props.answers);

const totalCount = computed(() => props.dangerSigns.length);

const completedCount = computed(() => {
  return props.dangerSigns.filter(sign => localAnswers.value[sign.id] !== undefined).length;
});

const progress = computed(() => {
  if (totalCount.value === 0) return 0;
  return completedCount.value / totalCount.value;
});

const isComplete = computed(() => completedCount.value === totalCount.value);

const dangerSignCount = computed(() => {
  return props.dangerSigns.filter(sign => localAnswers.value[sign.id] === true).length;
});

const hasDangerSigns = computed(() => dangerSignCount.value > 0);

function updateAnswer(fieldId: string, value: boolean) {
  emit('update:answer', fieldId, value);
  if (value) {
    emit('danger-sign-detected', dangerSignCount.value);
  }
}
</script>

<style scoped>
.danger-signs-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.danger-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
  border: 1px solid #ff9800;
  border-radius: 8px;
  animation: pulse-warning 2s infinite;
}

@keyframes pulse-warning {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(255, 152, 0, 0);
  }
}

.danger-icon {
  font-size: 24px;
}

.danger-text {
  color: #e65100;
}

.danger-text strong {
  font-size: 16px;
}

.danger-text small {
  color: #bf360c;
}

.danger-signs-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.imci-guidance {
  background: var(--imci-guidance-bg, #e3f2fd);
  padding: 12px 16px;
  border-radius: 8px;
  border-left: 4px solid var(--primary, #2196f3);
}

.imci-guidance h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: var(--primary-dark, #1565c0);
}

.imci-guidance ul {
  margin: 0;
  padding-left: 20px;
}

.imci-guidance li {
  margin-bottom: 4px;
  color: var(--text-secondary, #666);
  font-size: 13px;
}

.imci-guidance li:last-child {
  margin-bottom: 0;
}
</style>
