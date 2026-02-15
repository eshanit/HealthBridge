<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { format, differenceInMonths, parseISO } from 'date-fns';
import { useSecurityStore } from '@/stores/security';
import { secureGet } from '~/services/secureDb';
import type { ClinicalFormInstance } from '~/types/clinical-form';

const route = useRoute();
const router = useRouter();
const securityStore = useSecurityStore();

const record = ref<ClinicalFormInstance | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const recordId = computed(() => route.params.id as string);

const isDraft = computed(() => record.value?.status === 'draft');

const pageTitle = computed(() => {
  if (!record.value) return 'Record';
  return record.value.patientName || 'Unnamed Patient';
});

// Computed list of answers to display
const answerEntries = computed(() => {
  if (!record.value?.answers) return [];
  return Object.entries(record.value.answers);
});

// Calculate age in months from DOB
const patientAgeMonths = computed(() => {
  if (!record.value?.answers?.patient_dob) return null;
  try {
    const dob = parseISO(record.value.answers.patient_dob);
    return differenceInMonths(new Date(), dob);
  } catch {
    return null;
  }
});

function formatAnswerValue(value: any): string {
  if (value === undefined || value === null) return 'Not answered';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatAnswerKey(key: string): string {
  // Convert camelCase or snake_case to readable format
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

function getStatusBadge(status: string): { class: string; text: string } {
  switch (status) {
    case 'draft': return { class: 'bg-gray-700 text-gray-300', text: 'Draft' };
    case 'completed': return { class: 'bg-green-900/50 text-green-400', text: 'Completed' };
    case 'in_progress': return { class: 'bg-blue-900/50 text-blue-400', text: 'In Progress' };
    default: return { class: 'bg-gray-700 text-gray-300', text: status };
  }
}

function getSyncBadge(syncStatus: string): { class: string; text: string } {
  switch (syncStatus) {
    case 'synced': return { class: 'bg-green-900/50 text-green-400', text: 'Synced' };
    case 'pending': return { class: 'bg-yellow-900/50 text-yellow-400', text: 'Pending' };
    case 'error': return { class: 'bg-red-900/50 text-red-400', text: 'Error' };
    default: return { class: 'bg-gray-700 text-gray-300', text: syncStatus };
  }
}

function formatDate(timestamp?: string): string {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Unknown';
  return format(date, 'MMM d, yyyy h:mm a');
}

function handleBack() {
  router.back();
}

function handleEdit() {
  if (record.value) {
    router.push(`/assessment/${record.value.schemaId}/edit?id=${record.value._id}`);
  }
}

async function loadRecord() {
  loading.value = true;
  error.value = null;
  
  try {
    const security = useSecurityStore();
    if (!security.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    const doc = await secureGet<ClinicalFormInstance>(recordId.value, security.encryptionKey);
    
    if (!doc) {
      error.value = 'Record not found';
      return;
    }
    
    record.value = doc;
  } catch (err) {
    console.error('[Record] Failed to load record:', err);
    error.value = 'Failed to load record. Please try again.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadRecord();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4">
    <!-- Header -->
    <header class="flex items-center gap-4 mb-6">
      <button 
        @click="handleBack"
        class="p-2 hover:bg-gray-800 rounded-lg transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div class="flex-1">
        <h1 class="text-2xl font-bold text-white truncate">{{ pageTitle }}</h1>
        <p class="text-gray-400 text-sm">Record Details</p>
      </div>
      <button 
        v-if="isDraft"
        @click="handleEdit"
        class="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm transition-colors"
      >
        Edit
      </button>
    </header>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="bg-red-900/20 border border-red-700 rounded-xl p-4 mb-6">
      <div class="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p class="text-red-400">{{ error }}</p>
      </div>
    </div>

    <!-- Record Content -->
    <div v-else-if="record" class="space-y-4">
      <!-- Priority Banner -->
      <div 
        class="bg-gray-800 rounded-xl p-4 border-l-4"
        :class="{
          'border-red-500': record.calculated?.triagePriority === 'red',
          'border-yellow-500': record.calculated?.triagePriority === 'yellow',
          'border-green-500': record.calculated?.triagePriority === 'green',
          'border-gray-500': !record.calculated?.triagePriority
        }"
      >
        <div class="flex items-center justify-between">
          <div>
            <p class="text-gray-400 text-sm">Triage Priority</p>
            <p class="text-white font-semibold capitalize">
              {{ record.calculated?.triagePriority || 'Not assessed' }}
            </p>
          </div>
          <div 
            class="w-12 h-12 rounded-full flex items-center justify-center"
            :class="{
              'bg-red-500/20': record.calculated?.triagePriority === 'red',
              'bg-yellow-500/20': record.calculated?.triagePriority === 'yellow',
              'bg-green-500/20': record.calculated?.triagePriority === 'green',
              'bg-gray-500/20': !record.calculated?.triagePriority
            }"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" 
              :class="{
                'text-red-500': record.calculated?.triagePriority === 'red',
                'text-yellow-500': record.calculated?.triagePriority === 'yellow',
                'text-green-500': record.calculated?.triagePriority === 'green',
                'text-gray-500': !record.calculated?.triagePriority
              }" 
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      <!-- Status Cards -->
      <div class="grid grid-cols-2 gap-4">
        <!-- Form Status -->
        <div class="bg-gray-800 rounded-xl p-4">
          <p class="text-gray-400 text-sm mb-1">Form Status</p>
          <span 
            class="px-3 py-1 text-sm rounded-full inline-flex items-center"
            :class="getStatusBadge(record.status).class"
          >
            {{ getStatusBadge(record.status).text }}
          </span>
        </div>

        <!-- Sync Status -->
        <div class="bg-gray-800 rounded-xl p-4">
          <p class="text-gray-400 text-sm mb-1">Sync Status</p>
          <span 
            class="px-3 py-1 text-sm rounded-full inline-flex items-center"
            :class="getSyncBadge(record.syncStatus).class"
          >
            {{ getSyncBadge(record.syncStatus).text }}
          </span>
        </div>
      </div>

      <!-- Patient Info -->
      <div class="bg-gray-800 rounded-xl p-4">
        <h2 class="text-white font-semibold mb-4">Patient Information</h2>
        <div class="space-y-3">
          <div class="flex justify-between">
            <span class="text-gray-400">Patient ID</span>
            <span class="text-white">{{ record.answers?.patient_id || record.patientId || 'Not recorded' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Patient Name</span>
            <span class="text-white">{{ record.answers?.patient_name || record.patientName || 'Not recorded' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Age (months)</span>
            <span class="text-white">
              {{ patientAgeMonths !== null ? patientAgeMonths + ' months' : (record.answers?.patient_age_months || record.patientAgeMonths || 'Not recorded') }}
            </span>
          </div>
        </div>
      </div>

      <!-- Assessment Info -->
      <div class="bg-gray-800 rounded-xl p-4">
        <h2 class="text-white font-semibold mb-4">Assessment Details</h2>
        <div class="space-y-3">
          <div class="flex justify-between">
            <span class="text-gray-400">Assessment Type</span>
            <span class="text-white capitalize">{{ record.schemaId?.replace(/-/g, ' ') || 'Unknown' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Current Step</span>
            <span class="text-white">{{ record.currentStateId }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Created</span>
            <span class="text-white">{{ formatDate(record.createdAt) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Last Updated</span>
            <span class="text-white">{{ formatDate(record.updatedAt) }}</span>
          </div>
          <div v-if="record.completedAt" class="flex justify-between">
            <span class="text-gray-400">Completed</span>
            <span class="text-white">{{ formatDate(record.completedAt) }}</span>
          </div>
        </div>
      </div>

      <!-- Danger Signs Summary -->
      <div v-if="record.calculated?.hasDangerSign !== undefined" class="bg-gray-800 rounded-xl p-4">
        <h2 class="text-white font-semibold mb-4">Danger Signs</h2>
        <div class="flex items-center gap-3">
          <div 
            class="w-10 h-10 rounded-full flex items-center justify-center"
            :class="record.calculated!.hasDangerSign ? 'bg-red-500/20' : 'bg-green-500/20'"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" 
              :class="record.calculated!.hasDangerSign ? 'text-red-500' : 'text-green-500'" 
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                :d="record.calculated!.hasDangerSign 
                  ? 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' 
                  : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'" />
            </svg>
          </div>
          <div>
            <p class="text-white font-medium">Danger Signs Present</p>
            <p class="text-gray-400 text-sm">{{ record.calculated!.hasDangerSign ? 'Yes - requires immediate attention' : 'No danger signs detected' }}</p>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div v-if="isDraft" class="bg-gray-800 rounded-xl p-4">
        <button 
          @click="handleEdit"
          class="w-full py-3 bg-blue-700 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Continue Assessment
        </button>
      </div>

      <!-- Form Answers -->
      <div v-if="answerEntries.length > 0" class="bg-gray-800 rounded-xl p-4">
        <h2 class="text-white font-semibold mb-4">Recorded Answers</h2>
        <div class="space-y-3">
          <div 
            v-for="[key, value] in answerEntries" 
            :key="key"
            class="flex flex-col py-2 border-b border-gray-700 last:border-0"
          >
            <span class="text-gray-400 text-sm mb-1">{{ formatAnswerKey(key) }}</span>
            <span class="text-white">{{ formatAnswerValue(value) }}</span>
          </div>
        </div>
      </div>

      <!-- No Answers State -->
      <div v-else class="bg-gray-800 rounded-xl p-4">
        <h2 class="text-white font-semibold mb-4">Recorded Answers</h2>
        <p class="text-gray-500 text-sm">No answers recorded yet</p>
      </div>
    </div>
  </div>
</template>
