<script setup lang="ts">
/**
 * NavigationGuard.vue - Prevents Protocol Violation
 * 
 * REFACTORED per ARCHITECTURE_RULES.md to use NuxtUI components
 * 
 * PURPOSE: Modal guard that prevents clinical protocol violations
 * by blocking invalid transitions
 * 
 * Usage:
 * <NavigationGuard
 *   :is-open="showGuard"
 *   :blocked-transition="blockedTransition"
 *   :required-fields="requiredFields"
 *   @proceed-anyway="handleOverride"
 *   @go-back="handleGoBack"
 * />
 */

interface BlockedTransition {
  from: string;
  to: string;
  reasons: string[];
}

interface RequiredField {
  id: string;
  label: string;
  completed: boolean;
}

interface Props {
  isOpen: boolean;
  title?: string;
  message?: string;
  blockedTransition?: BlockedTransition | null;
  requiredFields?: RequiredField[];
  allowOverride?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Cannot Proceed',
  message: 'This transition would violate the clinical protocol.',
  blockedTransition: null,
  requiredFields: () => [],
  allowOverride: false
});

const emit = defineEmits<{
  (e: 'proceed-anyway'): void;
  (e: 'go-back'): void;
  (e: 'close'): void;
}>();

function handleProceedAnyway() {
  emit('proceed-anyway');
}

function handleGoBack() {
  emit('go-back');
}

function handleOverlayClick() {
  emit('go-back');
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur"
    >
      <UCard class="w-full max-w-md shadow-2xl bg-gray-800 border border-gray-700">
        <template #header>
          <div class="flex items-center gap-3">
            <UAvatar
              icon="i-heroicons-exclamation-triangle"
              color="warning"
              size="lg"
            />
            <div>
              <h3 class="text-lg font-semibold text-white">{{ title }}</h3>
              <p class="text-sm text-gray-400">{{ message }}</p>
            </div>
          </div>
        </template>

        <div class="space-y-4">
          <!-- Blocked transition reasons -->
          <div v-if="blockedTransition && blockedTransition.reasons.length > 0">
            <h4 class="text-sm font-medium text-gray-300 mb-2">Why can't you proceed?</h4>
            <UAlert
              v-for="reason in blockedTransition.reasons"
              :key="reason"
              :title="reason"
              icon="i-heroicons-x-circle"
              color="error"
              variant="subtle"
              size="sm"
            />
          </div>

          <!-- Required fields -->
          <div v-if="requiredFields.length > 0">
            <h4 class="text-sm font-medium text-gray-300 mb-2">Complete these first:</h4>
            <div class="space-y-2">
              <div
                v-for="field in requiredFields"
                :key="field.id"
                class="flex items-center gap-2 text-sm"
                :class="field.completed ? 'text-green-400' : 'text-gray-400'"
              >
                <UIcon
                  :name="field.completed ? 'i-heroicons-check-circle' : 'i-heroicons-circle'"
                  :class="field.completed ? 'text-green-400' : 'text-gray-500'"
                />
                <span :class="{ 'line-through opacity-50': field.completed }">
                  {{ field.label }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton
              v-if="allowOverride"
              color="neutral"
              variant="solid"
              label="Proceed Anyway"
              @click="handleProceedAnyway"
            />
            <UButton
              color="primary"
              variant="solid"
              label="Go Back"
              @click="handleGoBack"
            />
          </div>
        </template>
      </UCard>
    </div>
  </Teleport>
</template>
