<template>
  <div class="timer-button-container">
    <button
      type="button"
      class="timer-button"
      :class="{ 'is-running': isRunning, 'is-complete': isComplete }"
      :disabled="disabled || (isRunning && !canCancel)"
      @click="toggleTimer"
    >
      <div class="timer-icon">
        <span v-if="!isRunning">⏱️</span>
        <span v-else class="pulse-animation">⏱️</span>
      </div>
      <div class="timer-content">
        <span class="timer-label">{{ buttonLabel }}</span>
        <span v-if="showCountdown && isRunning" class="timer-countdown">
          {{ formattedTime }}
        </span>
      </div>
    </button>

    <div v-if="showInstructions" class="timer-instructions">
      <p class="instructions-title">{{ instructionsTitle }}</p>
      <ol class="instructions-list">
        <li>Place hand on child's chest</li>
        <li>Count breaths for {{ duration }} seconds</li>
        <li>Multiply count by {{ multiplier }} for breaths/min</li>
      </ol>
    </div>

    <div v-if="result !== null" class="timer-result">
      <label class="result-label">{{ resultLabel }}</label>
      <div class="result-input-wrapper">
        <input
          type="number"
          :id="id"
          :value="result"
          :min="0"
          :max="200"
          class="result-input"
          @input="updateResult"
        />
        <span class="result-unit">{{ resultUnit }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';

/**
 * TimerButton.vue - Timer Button for 60-second Respiratory Rate Count
 * STATUS: SPEC-COMPLIANT IMPLEMENTATION
 * PURPOSE: Interactive timer for counting respiratory rate with WHO IMCI methodology
 * 
 * Usage:
 * <TimerButton
 *   id="rr_timer"
 *   label="Count Breaths"
 *   duration="60"
 *   @complete="handleTimerComplete"
 *   v-model:result="answers.respiratory_rate"
 * />
 */

interface Props {
  id: string;
  label?: string;
  duration?: number;
  resultUnit?: string;
  resultLabel?: string;
  buttonLabel?: string;
  instructionsTitle?: string;
  showInstructions?: boolean;
  showCountdown?: boolean;
  disabled?: boolean;
  canCancel?: boolean;
  result?: number | null;
}

const props = withDefaults(defineProps<Props>(), {
  label: 'Count Respiratory Rate',
  duration: 60,
  resultUnit: 'breaths/min',
  resultLabel: 'Respiratory Rate',
  buttonLabel: 'Start 60-second Count',
  instructionsTitle: 'How to count breaths:',
  showInstructions: true,
  showCountdown: true,
  disabled: false,
  canCancel: true,
  result: null
});

const emit = defineEmits<{
  (e: 'update:result', value: number | null): void;
  (e: 'start'): void;
  (e: 'complete', count: number): void;
  (e: 'cancel'): void;
}>();

const isRunning = ref(false);
const isComplete = ref(false);
const elapsedSeconds = ref(0);
const localResult = ref<number | null>(props.result);
let timerInterval: ReturnType<typeof setInterval> | null = null;

const buttonLabel = computed(() => {
  if (isComplete.value) {
    return 'Count Again';
  }
  if (isRunning.value) {
    return 'Counting...';
  }
  return props.buttonLabel;
});

const formattedTime = computed(() => {
  const remaining = Math.max(0, props.duration - elapsedSeconds.value);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

const multiplier = computed(() => {
  return 60 / props.duration;
});

function toggleTimer() {
  if (isRunning.value) {
    if (props.canCancel) {
      cancelTimer();
    }
  } else {
    startTimer();
  }
}

function startTimer() {
  isRunning.value = true;
  isComplete.value = false;
  elapsedSeconds.value = 0;
  emit('start');

  timerInterval = setInterval(() => {
    elapsedSeconds.value += 1;

    if (elapsedSeconds.value >= props.duration) {
      completeTimer();
    }
  }, 1000);
}

function completeTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  isRunning.value = false;
  isComplete.value = true;
  emit('complete', elapsedSeconds.value);
}

function cancelTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  isRunning.value = false;
  elapsedSeconds.value = 0;
  emit('cancel');
}

function updateResult(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = target.value ? parseInt(target.value) : null;
  localResult.value = value;
  emit('update:result', value);
}

onUnmounted(() => {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
});
</script>

<style scoped>
.timer-button-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timer-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 24px;
  font-size: 16px;
  font-weight: 600;
  background: linear-gradient(135deg, var(--primary, #2196f3) 0%, var(--primary-dark, #1565c0) 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.timer-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.25);
}

.timer-button:active:not(:disabled) {
  transform: translateY(0);
}

.timer-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.timer-button.is-running {
  background: linear-gradient(135deg, var(--warning, #ff9800) 0%, #f57c00 100%);
  animation: running-pulse 1s infinite;
}

@keyframes running-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(255, 152, 0, 0);
  }
}

.timer-button.is-complete {
  background: linear-gradient(135deg, var(--success, #4caf50) 0%, #388e3c 100%);
}

.timer-icon {
  font-size: 24px;
}

.pulse-animation {
  animation: timer-pulse 0.5s ease-in-out infinite;
}

@keyframes timer-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.timer-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.timer-label {
  font-size: 16px;
  font-weight: 600;
}

.timer-countdown {
  font-size: 20px;
  font-weight: 700;
  font-family: monospace;
}

.timer-instructions {
  background: var(--surface-variant, #f5f5f5);
  padding: 12px 16px;
  border-radius: 8px;
  border-left: 4px solid var(--primary, #2196f3);
}

.instructions-title {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #333);
}

.instructions-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--text-secondary, #666);
}

.instructions-list li {
  margin-bottom: 4px;
}

.timer-result {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--border, #e0e0e0);
}

.result-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #333);
}

.result-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-input {
  flex: 1;
  max-width: 120px;
  padding: 10px 12px;
  font-size: 16px;
  border: 2px solid var(--primary, #2196f3);
  border-radius: 6px;
  background: var(--surface, #fff);
}

.result-input:focus {
  outline: none;
  border-color: var(--primary-dark, #1565c0);
  box-shadow: 0 0 0 2px var(--primary-light, #e3f2fd);
}

.result-unit {
  font-size: 14px;
  color: var(--text-secondary, #666);
}
</style>
