<template>
  <div class="workflow-progress">
    <div class="progress-header">
      <h3 class="progress-title">{{ title }}</h3>
      <span class="progress-status">{{ currentStepName }}</span>
    </div>

    <div class="progress-track">
      <div class="progress-steps">
        <div
          v-for="(step, index) in steps"
          :key="step.id"
          class="progress-step"
          :class="getStepClass(index)"
        >
          <div class="step-connector">
            <div class="step-marker">
              <span v-if="step.status === 'complete'" class="check-icon">✓</span>
              <span v-else-if="step.status === 'error'" class="error-icon">!</span>
              <span v-else class="step-number">{{ index + 1 }}</span>
            </div>
            <div v-if="index < steps.length - 1" class="step-line" />
          </div>
          <div class="step-label-container">
            <span class="step-label">{{ step.label }}</span>
            <span v-if="step.description" class="step-description">{{ step.description }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showProgressBar" class="progress-bar-wrapper">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${progressPercentage}%` }" />
      </div>
      <span class="progress-percentage">{{ Math.round(progressPercentage) }}% Complete</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * WorkflowProgress.vue - Shows Current Step in Workflow
 * STATUS: SPEC-COMPLIANT IMPLEMENTATION
 * PURPOSE: Visual progress indicator for workflow state machine with clinical step tracking
 * 
 * Usage:
 * <WorkflowProgress
 *   :steps="workflowSteps"
 *   :current-step-id="currentState"
 *   show-progress-bar
 * />
 */

interface WorkflowStep {
  id: string;
  label: string;
  description?: string;
  status?: 'pending' | 'current' | 'complete' | 'error';
}

interface Props {
  steps: WorkflowStep[];
  currentStepId: string;
  title?: string;
  showProgressBar?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Assessment Progress',
  showProgressBar: true
});

const emit = defineEmits<{
  (e: 'step-click', stepId: string): void;
}>();

const currentStepIndex = computed(() => {
  return props.steps.findIndex(step => step.id === props.currentStepId);
});

const currentStepName = computed(() => {
  const currentStep = props.steps[currentStepIndex.value];
  return currentStep?.label || 'Unknown';
});

const completedSteps = computed(() => {
  return props.steps.filter(step => step.status === 'complete').length;
});

const progressPercentage = computed(() => {
  if (props.steps.length === 0) return 0;
  return (completedSteps.value / props.steps.length) * 100;
});

function getStepClass(index: number) {
  const step = props.steps[index];
  if (!step) return ['is-future'];
  const classes: string[] = [];

  if (step.status === 'complete') {
    classes.push('is-complete');
  } else if (step.id === props.currentStepId) {
    classes.push('is-current');
  } else if (step.status === 'error') {
    classes.push('is-error');
  } else if (index < currentStepIndex.value) {
    classes.push('is-past');
  } else {
    classes.push('is-future');
  }

  return classes;
}
</script>

<style scoped>
.workflow-progress {
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
  padding: 16px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.progress-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #333);
}

.progress-status {
  font-size: 13px;
  color: var(--primary, #2196f3);
  font-weight: 500;
  background: var(--primary-light, #e3f2fd);
  padding: 4px 12px;
  border-radius: 12px;
}

.progress-track {
  overflow-x: auto;
  padding-bottom: 8px;
}

.progress-steps {
  display: flex;
  align-items: flex-start;
  gap: 0;
  min-width: max-content;
}

.progress-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 120px;
  flex-shrink: 0;
}

.step-connector {
  display: flex;
  align-items: center;
}

.step-marker {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  background: var(--background, #e0e0e0);
  color: var(--text-secondary, #666);
  z-index: 1;
}

.is-complete .step-marker {
  background: var(--success, #4caf50);
  color: white;
}

.is-current .step-marker {
  background: var(--primary, #2196f3);
  color: white;
  box-shadow: 0 0 0 4px var(--primary-light, #e3f2fd);
}

.is-error .step-marker {
  background: var(--error, #f44336);
  color: white;
}

.check-icon {
  font-size: 16px;
}

.error-icon {
  font-size: 18px;
  font-weight: bold;
}

.step-line {
  width: 80px;
  height: 3px;
  background: var(--border, #e0e0e0);
  margin: 0 -40px;
}

.is-complete .step-line {
  background: var(--success, #4caf50);
}

.step-label-container {
  margin-top: 8px;
  text-align: center;
}

.step-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #666);
}

.is-current .step-label {
  color: var(--primary, #2196f3);
  font-weight: 600;
}

.step-description {
  display: block;
  font-size: 10px;
  color: var(--text-muted, #999);
  margin-top: 2px;
}

.progress-bar-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light, #eee);
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--background, #e0e0e0);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary, #2196f3) 0%, var(--success, #4caf50) 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-percentage {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary, #666);
  white-space: nowrap;
}
</style>
