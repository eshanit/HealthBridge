<template>
  <div class="analytics-page">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">{{ $t('analytics.title') }}</h1>
      <p class="text-gray-600 mt-1">{{ $t('analytics.subtitle') }}</p>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="flex flex-wrap gap-4 items-end">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            {{ $t('analytics.period') }}
          </label>
          <select
            v-model="selectedPeriod"
            class="px-3 py-2 border border-gray-300 rounded-md text-sm"
            @change="handlePeriodChange"
          >
            <option value="day">{{ $t('analytics.periods.day') }}</option>
            <option value="week">{{ $t('analytics.periods.week') }}</option>
            <option value="month">{{ $t('analytics.periods.month') }}</option>
            <option value="quarter">{{ $t('analytics.periods.quarter') }}</option>
            <option value="year">{{ $t('analytics.periods.year') }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            {{ $t('analytics.schema') }}
          </label>
          <select
            v-model="selectedSchema"
            class="px-3 py-2 border border-gray-300 rounded-md text-sm"
            @change="handleSchemaChange"
          >
            <option value="">{{ $t('analytics.allSchemas') }}</option>
            <option value="peds_respiratory">{{ $t('analytics.schemas.pedsRespiratory') }}</option>
          </select>
        </div>

        <button
          class="px-4 py-2 bg-primary-600 text-white rounded-md text-sm hover:bg-primary-700"
          @click="refreshData"
          :disabled="isLoading"
        >
          <span v-if="isLoading" class="flex items-center gap-2">
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ $t('common.loading') }}
          </span>
          <span v-else>{{ $t('analytics.refresh') }}</span>
        </button>

        <button
          class="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
          @click="handleExport"
        >
          {{ $t('analytics.export') }}
        </button>
      </div>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <p class="text-red-600">{{ error }}</p>
    </div>

    <!-- Stats Overview -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <!-- Total Assessments -->
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">{{ $t('analytics.totalAssessments') }}</p>
            <p class="text-2xl font-bold text-gray-900">{{ clinicalOutcomes.totalAssessments }}</p>
          </div>
          <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          {{ clinicalOutcomes.completedAssessments }} {{ $t('analytics.completed') }}
        </p>
      </div>

      <!-- AI Interactions -->
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">{{ $t('analytics.aiInteractions') }}</p>
            <p class="text-2xl font-bold text-gray-900">{{ aiPerformance.totalInteractions }}</p>
          </div>
          <div class="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          {{ aiPerformance.averageResponseTime }}ms {{ $t('analytics.avgResponseTime') }}
        </p>
      </div>

      <!-- Average Rating -->
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">{{ $t('analytics.avgRating') }}</p>
            <p class="text-2xl font-bold text-gray-900">
              {{ aiPerformance.averageRating > 0 ? aiPerformance.averageRating + '/5' : 'N/A' }}
            </p>
          </div>
          <div class="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          {{ aiPerformance.totalFeedback }} {{ $t('analytics.feedbackReceived') }}
        </p>
      </div>

      <!-- Danger Signs Detected -->
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">{{ $t('analytics.dangerSignsDetected') }}</p>
            <p class="text-2xl font-bold text-gray-900">{{ clinicalOutcomes.dangerSignDetectionRate }}%</p>
          </div>
          <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          {{ clinicalOutcomes.referralRate }}% {{ $t('analytics.referralRate') }}
        </p>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <!-- Triage Distribution -->
      <div class="bg-white rounded-lg shadow p-4">
        <h3 class="text-lg font-medium text-gray-900 mb-4">{{ $t('analytics.triageDistribution') }}</h3>
        <div class="space-y-3">
          <div class="flex items-center">
            <span class="w-24 text-sm text-gray-600">{{ $t('triage.emergency') }}</span>
            <div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-red-500 rounded-full"
                :style="{ width: getTriagePercent('emergency') + '%' }"
              ></div>
            </div>
            <span class="w-16 text-right text-sm font-medium text-gray-900">
              {{ triageDistribution.emergency }}
            </span>
          </div>
          <div class="flex items-center">
            <span class="w-24 text-sm text-gray-600">{{ $t('triage.urgent') }}</span>
            <div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-orange-500 rounded-full"
                :style="{ width: getTriagePercent('urgent') + '%' }"
              ></div>
            </div>
            <span class="w-16 text-right text-sm font-medium text-gray-900">
              {{ triageDistribution.urgent }}
            </span>
          </div>
          <div class="flex items-center">
            <span class="w-24 text-sm text-gray-600">{{ $t('triage.priority') }}</span>
            <div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-yellow-500 rounded-full"
                :style="{ width: getTriagePercent('priority') + '%' }"
              ></div>
            </div>
            <span class="w-16 text-right text-sm font-medium text-gray-900">
              {{ triageDistribution.priority }}
            </span>
          </div>
          <div class="flex items-center">
            <span class="w-24 text-sm text-gray-600">{{ $t('triage.routine') }}</span>
            <div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-green-500 rounded-full"
                :style="{ width: getTriagePercent('routine') + '%' }"
              ></div>
            </div>
            <span class="w-16 text-right text-sm font-medium text-gray-900">
              {{ triageDistribution.routine }}
            </span>
          </div>
        </div>
      </div>

      <!-- Age Group Distribution -->
      <div class="bg-white rounded-lg shadow p-4">
        <h3 class="text-lg font-medium text-gray-900 mb-4">{{ $t('analytics.ageGroupDistribution') }}</h3>
        <div class="space-y-3">
          <div class="flex items-center">
            <span class="w-24 text-sm text-gray-600">{{ $t('analytics.ageGroups.neonate') }}</span>
            <div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-pink-500 rounded-full"
                :style="{ width: getAgeGroupPercent('neonate') + '%' }"
              ></div>
            </div>
            <span class="w-16 text-right text-sm font-medium text-gray-900">
              {{ ageGroupDistribution.neonate }}
            </span>
          </div>
          <div class="flex items-center">
            <span class="w-24 text-sm text-gray-600">{{ $t('analytics.ageGroups.infant') }}</span>
            <div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-blue-500 rounded-full"
                :style="{ width: getAgeGroupPercent('infant') + '%' }"
              ></div>
            </div>
            <span class="w-16 text-right text-sm font-medium text-gray-900">
              {{ ageGroupDistribution.infant }}
            </span>
          </div>
          <div class="flex items-center">
            <span class="w-24 text-sm text-gray-600">{{ $t('analytics.ageGroups.toddler') }}</span>
            <div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-teal-500 rounded-full"
                :style="{ width: getAgeGroupPercent('toddler') + '%' }"
              ></div>
            </div>
            <span class="w-16 text-right text-sm font-medium text-gray-900">
              {{ ageGroupDistribution.toddler }}
            </span>
          </div>
          <div class="flex items-center">
            <span class="w-24 text-sm text-gray-600">{{ $t('analytics.ageGroups.preschool') }}</span>
            <div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-green-500 rounded-full"
                :style="{ width: getAgeGroupPercent('preschool') + '%' }"
              ></div>
            </div>
            <span class="w-16 text-right text-sm font-medium text-gray-900">
              {{ ageGroupDistribution.preschool }}
            </span>
          </div>
          <div class="flex items-center">
            <span class="w-24 text-sm text-gray-600">{{ $t('analytics.ageGroups.schoolAge') }}</span>
            <div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-purple-500 rounded-full"
                :style="{ width: getAgeGroupPercent('schoolAge') + '%' }"
              ></div>
            </div>
            <span class="w-16 text-right text-sm font-medium text-gray-900">
              {{ ageGroupDistribution.schoolAge }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Assessment Trends -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">{{ $t('analytics.assessmentTrends') }}</h3>
      <div v-if="assessmentTrends.length > 0" class="h-48 flex items-end gap-1">
        <div
          v-for="(trend, index) in assessmentTrends"
          :key="index"
          class="flex-1 flex flex-col items-center"
        >
          <div
            class="w-full bg-primary-500 rounded-t"
            :style="{ height: getTrendHeight(trend.value) + 'px' }"
            :title="`${trend.date}: ${trend.value} assessments`"
          ></div>
          <span class="text-xs text-gray-500 mt-1 truncate w-full text-center">
            {{ formatDate(trend.date) }}
          </span>
        </div>
      </div>
      <div v-else class="h-48 flex items-center justify-center text-gray-500">
        {{ $t('analytics.noData') }}
      </div>
    </div>

    <!-- AI Performance Details -->
    <div class="bg-white rounded-lg shadow p-4">
      <h3 class="text-lg font-medium text-gray-900 mb-4">{{ $t('analytics.aiPerformance') }}</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="p-4 bg-gray-50 rounded-lg">
          <p class="text-sm text-gray-500">{{ $t('analytics.positiveFeedback') }}</p>
          <p class="text-xl font-bold text-gray-900">{{ aiPerformance.positiveFeedbackPercent }}%</p>
        </div>
        <div class="p-4 bg-gray-50 rounded-lg">
          <p class="text-sm text-gray-500">{{ $t('analytics.safetyIssues') }}</p>
          <p class="text-xl font-bold text-gray-900">{{ aiPerformance.safetyIssuesCount }}</p>
        </div>
        <div class="p-4 bg-gray-50 rounded-lg">
          <p class="text-sm text-gray-500">{{ $t('analytics.avgCompletionTime') }}</p>
          <p class="text-xl font-bold text-gray-900">{{ formatDuration(clinicalOutcomes.averageCompletionTime) }}</p>
        </div>
      </div>
    </div>

    <!-- Generated At -->
    <div class="mt-4 text-right text-xs text-gray-500">
      {{ $t('analytics.generatedAt') }}: {{ formatDateTime(summary.generatedAt) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  useClinicalAnalytics,
  type TimePeriod,
  type TriageDistribution,
  type AgeGroupDistribution
} from '~/composables/useClinicalAnalytics';

// ============================================
// Meta
// ============================================

definePageMeta({
  layout: 'default'
});

// ============================================
// Composable
// ============================================

const {
  filter,
  isLoading,
  error,
  triageDistribution,
  ageGroupDistribution,
  aiPerformance,
  clinicalOutcomes,
  assessmentTrends,
  summary,
  setFilter,
  exportData,
  fetchFromServer
} = useClinicalAnalytics();

// ============================================
// State
// ============================================

const selectedPeriod = ref<TimePeriod>('week');
const selectedSchema = ref('');

// ============================================
// Computed
// ============================================

const maxTrendValue = computed(() => {
  if (assessmentTrends.value.length === 0) return 1;
  return Math.max(...assessmentTrends.value.map(t => t.value), 1);
});

// ============================================
// Methods
// ============================================

function getTriagePercent(priority: keyof TriageDistribution): number {
  if (triageDistribution.value.total === 0) return 0;
  return Math.round((triageDistribution.value[priority] / triageDistribution.value.total) * 100);
}

function getAgeGroupPercent(group: keyof AgeGroupDistribution): number {
  if (ageGroupDistribution.value.total === 0) return 0;
  return Math.round((ageGroupDistribution.value[group] / ageGroupDistribution.value.total) * 100);
}

function getTrendHeight(value: number): number {
  return Math.max(4, (value / maxTrendValue.value) * 150);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function handlePeriodChange(): void {
  setFilter({ period: selectedPeriod.value });
}

function handleSchemaChange(): void {
  setFilter({ schemaId: selectedSchema.value || undefined });
}

function refreshData(): void {
  fetchFromServer();
}

function handleExport(): void {
  const data = exportData();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `healthbridge-analytics-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================
// Lifecycle
// ============================================

onMounted(() => {
  // Optionally fetch from server on mount
  // fetchFromServer();
});
</script>

<style scoped>
@reference "tailwindcss";

.analytics-page {
  padding: 1.5rem;
  max-width: 80rem;
  margin-left: auto;
  margin-right: auto;
}
</style>
