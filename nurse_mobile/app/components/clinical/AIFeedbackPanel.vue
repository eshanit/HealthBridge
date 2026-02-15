<template>
  <div class="ai-feedback-panel">
    <!-- Quick Rating Buttons -->
    <div v-if="!showDetailedFeedback" class="quick-feedback">
      <p class="text-sm text-gray-600 mb-2">{{ $t('ai.feedback.rateResponse') }}</p>
      <div class="flex gap-1">
        <button
          v-for="rating in [1, 2, 3, 4, 5] as FeedbackRating[]"
          :key="rating"
          class="rating-btn"
          :class="getRatingClass(rating)"
          @click="handleQuickRating(rating)"
          :disabled="isLoading"
          :title="RATING_DESCRIPTIONS[rating]"
        >
          <span class="text-lg">{{ getRatingEmoji(rating) }}</span>
          <span class="text-xs">{{ rating }}</span>
        </button>
      </div>
      <button
        class="mt-2 text-sm text-primary-600 hover:text-primary-700"
        @click="showDetailedFeedback = true"
      >
        {{ $t('ai.feedback.detailedFeedback') }}
      </button>
    </div>

    <!-- Detailed Feedback Form -->
    <div v-else class="detailed-feedback">
      <div class="flex justify-between items-center mb-4">
        <h4 class="font-medium text-gray-900">{{ $t('ai.feedback.title') }}</h4>
        <button
          class="text-gray-400 hover:text-gray-600"
          @click="showDetailedFeedback = false"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Rating Selection -->
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          {{ $t('ai.feedback.rating') }} *
        </label>
        <div class="flex gap-2">
          <button
            v-for="rating in [1, 2, 3, 4, 5] as FeedbackRating[]"
            :key="rating"
            class="rating-btn-large"
            :class="[
              getRatingClass(rating),
              selectedRating === rating ? 'ring-2 ring-offset-2 ring-primary-500' : ''
            ]"
            @click="selectedRating = rating"
            :disabled="isLoading"
          >
            <span class="text-xl">{{ getRatingEmoji(rating) }}</span>
            <span class="text-sm font-medium">{{ rating }}</span>
          </button>
        </div>
        <p v-if="selectedRating" class="mt-1 text-xs text-gray-500">
          {{ RATING_DESCRIPTIONS[selectedRating] }}
        </p>
      </div>

      <!-- Category Selection -->
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          {{ $t('ai.feedback.category') }} *
        </label>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="(label, category) in CATEGORY_LABELS"
            :key="category"
            class="category-btn"
            :class="selectedCategory === category ? 'bg-primary-100 border-primary-500 text-primary-700' : ''"
            @click="selectedCategory = category"
            :disabled="isLoading"
          >
            {{ label }}
          </button>
        </div>
      </div>

      <!-- Issue Selection -->
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          {{ $t('ai.feedback.issues') }}
        </label>
        <div class="space-y-2 max-h-40 overflow-y-auto">
          <label
            v-for="issue in filteredIssues"
            :key="issue.id"
            class="flex items-start gap-2 p-2 rounded border hover:bg-gray-50 cursor-pointer"
            :class="selectedIssues.includes(issue.id) ? 'border-primary-500 bg-primary-50' : 'border-gray-200'"
          >
            <input
              type="checkbox"
              :checked="selectedIssues.includes(issue.id)"
              @change="toggleIssue(issue.id)"
              class="mt-0.5"
            />
            <div>
              <p class="text-sm font-medium text-gray-900">{{ issue.label }}</p>
              <p class="text-xs text-gray-500">{{ issue.description }}</p>
            </div>
          </label>
        </div>
      </div>

      <!-- Comment -->
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          {{ $t('ai.feedback.comment') }}
        </label>
        <textarea
          v-model="comment"
          class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          rows="3"
          :placeholder="$t('ai.feedback.commentPlaceholder')"
          :disabled="isLoading"
        ></textarea>
      </div>

      <!-- Suggestions -->
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          {{ $t('ai.feedback.suggestions') }}
        </label>
        <textarea
          v-model="suggestions"
          class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          rows="2"
          :placeholder="$t('ai.feedback.suggestionsPlaceholder')"
          :disabled="isLoading"
        ></textarea>
      </div>

      <!-- Error Message -->
      <div v-if="error" class="mb-4 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
        {{ error }}
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-2">
        <button
          class="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
          @click="cancelFeedback"
          :disabled="isLoading"
        >
          {{ $t('common.cancel') }}
        </button>
        <button
          class="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
          @click="submitDetailedFeedback"
          :disabled="!canSubmit || isLoading"
        >
          <span v-if="isLoading" class="flex items-center gap-2">
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ $t('common.submitting') }}
          </span>
          <span v-else>{{ $t('ai.feedback.submit') }}</span>
        </button>
      </div>
    </div>

    <!-- Success Message -->
    <div
      v-if="showSuccess"
      class="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-600 flex items-center gap-2"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      {{ $t('ai.feedback.success') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  useAIFeedback,
  type FeedbackRating,
  type FeedbackCategory,
  CATEGORY_LABELS,
  RATING_DESCRIPTIONS
} from '~/composables/useAIFeedback';

// ============================================
// Props
// ============================================

const props = defineProps<{
  sessionId: string;
  sectionId: string;
  responseId: string;
  showDetailed?: boolean;
}>();

// ============================================
// Emits
// ============================================

const emit = defineEmits<{
  (e: 'submitted', feedback: any): void;
  (e: 'cancelled'): void;
}>();

// ============================================
// Composable
// ============================================

const {
  startFeedback,
  setCategory,
  setRating,
  setComment,
  toggleIssue: toggleIssueInPending,
  setSuggestions,
  submitFeedback,
  cancelFeedback: cancelPendingFeedback,
  isLoading,
  error,
  getIssuesByCategory,
  FEEDBACK_ISSUES
} = useAIFeedback({
  onFeedbackSubmitted: (feedback) => {
    emit('submitted', feedback);
    showSuccess.value = true;
    setTimeout(() => {
      showSuccess.value = false;
    }, 3000);
  }
});

// ============================================
// State
// ============================================

const showDetailedFeedback = ref(props.showDetailed || false);
const selectedRating = ref<FeedbackRating | null>(null);
const selectedCategory = ref<FeedbackCategory | null>(null);
const selectedIssues = ref<string[]>([]);
const comment = ref('');
const suggestions = ref('');
const showSuccess = ref(false);

// ============================================
// Computed
// ============================================

const filteredIssues = computed(() => {
  if (!selectedCategory.value) {
    return FEEDBACK_ISSUES;
  }
  return getIssuesByCategory(selectedCategory.value);
});

const canSubmit = computed(() => {
  return selectedRating.value !== null && selectedCategory.value !== null;
});

// ============================================
// Methods
// ============================================

function getRatingEmoji(rating: FeedbackRating): string {
  const emojis: Record<FeedbackRating, string> = {
    1: '😞',
    2: '😕',
    3: '😐',
    4: '🙂',
    5: '😊'
  };
  return emojis[rating];
}

function getRatingClass(rating: FeedbackRating): string {
  const classes: Record<FeedbackRating, string> = {
    1: 'bg-red-100 text-red-700 hover:bg-red-200',
    2: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
    3: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200',
    4: 'bg-lime-100 text-lime-700 hover:bg-lime-200',
    5: 'bg-green-100 text-green-700 hover:bg-green-200'
  };
  return classes[rating];
}

async function handleQuickRating(rating: FeedbackRating) {
  startFeedback(props.sessionId, props.sectionId, props.responseId);
  setRating(rating);
  setCategory('helpfulness');
  await submitFeedback();
}

function toggleIssue(issueId: string) {
  const index = selectedIssues.value.indexOf(issueId);
  if (index === -1) {
    selectedIssues.value.push(issueId);
  } else {
    selectedIssues.value.splice(index, 1);
  }
}

async function submitDetailedFeedback() {
  if (!selectedRating.value || !selectedCategory.value) return;

  startFeedback(props.sessionId, props.sectionId, props.responseId);
  setRating(selectedRating.value);
  setCategory(selectedCategory.value);
  
  if (comment.value) {
    setComment(comment.value);
  }
  
  if (suggestions.value) {
    setSuggestions(suggestions.value);
  }
  
  for (const issueId of selectedIssues.value) {
    toggleIssueInPending(issueId);
  }

  await submitFeedback();
  
  // Reset form
  showDetailedFeedback.value = false;
  selectedRating.value = null;
  selectedCategory.value = null;
  selectedIssues.value = [];
  comment.value = '';
  suggestions.value = '';
}

function cancelFeedback() {
  cancelPendingFeedback();
  showDetailedFeedback.value = false;
  selectedRating.value = null;
  selectedCategory.value = null;
  selectedIssues.value = [];
  comment.value = '';
  suggestions.value = '';
  emit('cancelled');
}

// Watch for category changes to filter issues
watch(selectedCategory, (newCategory) => {
  if (newCategory) {
    // Clear issues that don't belong to the new category
    const categoryIssues = getIssuesByCategory(newCategory).map(i => i.id);
    selectedIssues.value = selectedIssues.value.filter(id => categoryIssues.includes(id));
  }
});
</script>

<style scoped>
@reference "tailwindcss";

.ai-feedback-panel {
  padding: 1rem;
  background-color: #f9fafb;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
}

.rating-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  transition: colors 0.15s;
}

.rating-btn-large {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  background-color: white;
  transition: all 0.15s;
}

.rating-btn:disabled,
.rating-btn-large:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.category-btn {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  background-color: white;
  transition: background-color 0.15s;
}

.category-btn:hover:not(:disabled) {
  background-color: #f9fafb;
}

.category-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
