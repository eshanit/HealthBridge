<template>
  <div class="form-section" :class="{ 'is-collapsed': isCollapsed, 'is-complete': isComplete }">
    <header class="section-header" @click="toggleCollapse">
      <div class="header-content">
        <div class="status-indicator" :class="statusClass">
          <span v-if="isComplete">✓</span>
          <span v-else-if="hasErrors" class="error-icon">!</span>
          <span v-else>{{ currentStep }}/{{ totalSteps }}</span>
        </div>
        <h3 class="section-title">{{ title }}</h3>
        <p v-if="description" class="section-description">{{ description }}</p>
      </div>
      <div class="header-actions">
        <span v-if="progressPercentage > 0" class="progress-badge">
          {{ Math.round(progressPercentage) }}%
        </span>
        <button 
          v-if="showAskMedGemma"
          class="ask-medgemma-btn"
          :disabled="isAskMedGemmaDisabled"
          @click.stop="$emit('ask-medgemma')"
          title="Ask MedGemma for guidance"
        >
          <span class="medgemma-icon">🧠</span>
          <span class="medgemma-text">Ask MedGemma</span>
        </button>
        <button class="collapse-toggle" :aria-label="isCollapsed ? 'Expand section' : 'Collapse section'">
          {{ isCollapsed ? '▼' : '▲' }}
        </button>
      </div>
    </header>

    <transition name="slide">
      <div v-if="!isCollapsed" class="section-content">
        <slot />
        
        <footer v-if="showFooter" class="section-footer">
          <slot name="footer" />
        </footer>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * FormSection.vue - Collapsible Section Component
 * STATUS: SPEC-COMPLIANT IMPLEMENTATION
 * PURPOSE: Provides collapsible, progress-tracking sections for clinical forms
 * 
 * Usage:
 * <FormSection title="Danger Signs" description="Check for general danger signs" :progress="0.75">
 *   <FieldRenderer v-for="field in dangerSignFields" :key="field.id" :field="field" />
 * </FormSection>
 */

interface Props {
  title: string;
  description?: string;
  currentStep?: number;
  totalSteps?: number;
  progress?: number;
  isCollapsed?: boolean;
  isComplete?: boolean;
  hasErrors?: boolean;
  showFooter?: boolean;
  showAskMedGemma?: boolean;
  isAskMedGemmaDisabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  currentStep: 0,
  totalSteps: 0,
  progress: 0,
  isCollapsed: false,
  isComplete: false,
  hasErrors: false,
  showFooter: true,
  showAskMedGemma: false,
  isAskMedGemmaDisabled: false
});

const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'complete'): void;
  (e: 'ask-medgemma'): void;
}>();

const isCollapsedInternal = ref(props.isCollapsed);

const isCollapsed = computed(() => isCollapsedInternal.value);

const progressPercentage = computed(() => props.progress * 100);

const statusClass = computed(() => {
  if (props.isComplete) return 'status-complete';
  if (props.hasErrors) return 'status-error';
  if (props.currentStep > 0) return 'status-progress';
  return 'status-pending';
});

function toggleCollapse() {
  isCollapsedInternal.value = !isCollapsedInternal.value;
  emit('toggle');
}
</script>

<style scoped>
.form-section {
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
  margin-bottom: 16px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.form-section.is-complete {
  border-left: 4px solid var(--success, #4caf50);
}

.form-section.has-errors {
  border-left: 4px solid var(--error, #f44336);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  background: var(--surface-variant, #f5f5f5);
  user-select: none;
}

.section-header:hover {
  background: var(--surface-variant-hover, #eee);
}

.header-content {
  flex: 1;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  margin-right: 12px;
  background: var(--background, #e0e0e0);
  color: var(--text-secondary, #666);
}

.status-complete {
  background: var(--success, #4caf50);
  color: white;
}

.status-error {
  background: var(--error, #f44336);
  color: white;
}

.status-progress {
  background: var(--primary, #2196f3);
  color: white;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #333);
  display: inline;
}

.section-description {
  margin: 4px 0 0 36px;
  font-size: 13px;
  color: var(--text-secondary, #666);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-badge {
  background: var(--primary-light, #e3f2fd);
  color: var(--primary, #2196f3);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.collapse-toggle {
  background: none;
  border: none;
  font-size: 12px;
  color: var(--text-secondary, #666);
  cursor: pointer;
  padding: 4px 8px;
}

.ask-medgemma-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);
}

.ask-medgemma-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.4);
}

.ask-medgemma-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ask-medgemma-btn .medgemma-icon {
  font-size: 14px;
}

.ask-medgemma-btn .medgemma-text {
  white-space: nowrap;
}

.section-content {
  padding: 16px;
}

.section-footer {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light, #eee);
}

/* Transitions */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
  max-height: 500px;
  opacity: 1;
}

.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-bottom: 0;
}
</style>
