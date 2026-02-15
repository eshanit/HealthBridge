<script setup lang="ts">
/**
 * Session Assessment Selection Page
 * 
 * Displays a list of available assessment forms that can be selected for the patient
 * after registration is complete.
 */

import { ref, computed, onMounted } from 'vue';
import type { ClinicalSession } from '~/services/sessionEngine';
import { loadSession } from '~/services/sessionEngine';
import { useAuth } from '@/composables/useAuth';
import { useAssessmentNavigation } from '~/composables/useAssessmentNavigation';

interface SchemaManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  status: string;
  priority: string;
  metadata: {
    estimatedCompletionMinutes: number;
    riskLevel: string;
    requiresSupervisorReview: boolean;
  };
}

// ============================================
// Route & Params
// ============================================

const route = useRoute();
const sessionId = computed(() => route.params.sessionId as string);

// ============================================
// Meta & SEO
// ============================================

useHead({
  title: 'Select Assessment - HealthBridge',
  meta: [
    { name: 'description', content: 'Select an assessment form for the patient' }
  ]
});

// ============================================
// State
// ============================================

const session = ref<ClinicalSession | null>(null);
const isLoading = ref(true);
const error = ref<string | null>(null);

// Available assessment schemas (in production, this would come from the manifest)
const availableSchemas = ref<SchemaManifest[]>([
  {
    id: 'peds_respiratory',
    name: 'Pediatric Respiratory Assessment',
    description: 'WHO IMCI protocol for children 2 months to 5 years with cough or difficulty breathing',
    version: '1.0.0',
    status: 'active',
    priority: 'high',
    metadata: {
      estimatedCompletionMinutes: 5,
      riskLevel: 'high',
      requiresSupervisorReview: false
    }
  },
  {
    id: 'peds_diarrhea',
    name: 'Pediatric Diarrhea Assessment',
    description: 'WHO IMCI protocol for children with diarrhea',
    version: '0.9.0',
    status: 'beta',
    priority: 'medium',
    metadata: {
      estimatedCompletionMinutes: 4,
      riskLevel: 'medium',
      requiresSupervisorReview: false
    }
  },
  {
    id: 'peds_fever',
    name: 'Pediatric Fever Assessment',
    description: 'WHO IMCI protocol for children with fever',
    version: '0.5.0',
    status: 'development',
    priority: 'medium',
    metadata: {
      estimatedCompletionMinutes: 6,
      riskLevel: 'high',
      requiresSupervisorReview: true
    }
  }
]);

// ============================================
// Services & Composables
// ============================================

const auth = useAuth();
const { setNavigationState } = useAssessmentNavigation();


// ============================================
// Computed
// ============================================

/**
 * Filter to show only active and beta schemas
 */
const visibleSchemas = computed(() => {
  return availableSchemas.value.filter(schema => 
    schema.status === 'active' || schema.status === 'beta'
  );
});

/**
 * Session patient info for display
 */
const patientInfo = computed(() => {
  if (!session.value) return null;
  return {
    name: session.value.patientName || 'Unknown Patient',
    triage: session.value.triage || 'unknown'
  };
});

/**
 * Calculate session age (time elapsed since creation)
 */
const sessionAge = computed(() => {
  if (!session.value?.createdAt) return 'Unknown';
  
  const created = session.value.createdAt;
  const now = Date.now();
  const diffMs = now - created;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  // Fallback to date string for older sessions
  return new Date(created).toLocaleDateString();
});

/**
 * Get status badge color
 */
function getStatusColor(status: string): 'success' | 'warning' | 'info' | 'error' | 'neutral' {
  const colors: Record<string, 'success' | 'warning' | 'info' | 'error' | 'neutral'> = {
    active: 'success',
    beta: 'warning',
    development: 'info',
    deprecated: 'error'
  };
  return (colors[status] || 'neutral') as 'success' | 'warning' | 'info' | 'error' | 'neutral';
}

/**
 * Get priority icon
 */
function getPriorityIcon(priority: string): string {
  const icons: Record<string, string> = {
    high: 'i-heroicons-exclamation-circle',
    medium: 'i-heroicons-minus',
    low: 'i-heroicons-information-circle'
  };
  return icons[priority] || 'i-heroicons-question-mark-circle';
}

// ============================================
// Methods
// ============================================

/**
 * Load session data
 */
async function loadSessionData() {
  try {
    isLoading.value = true;
    error.value = null;
    
    const data = await loadSession(sessionId.value);
    
    if (!data) {
      error.value = 'Session not found';
      return;
    }
    
    session.value = data;
  } catch (err) {
    console.error('Failed to load session:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load session';
  } finally {
    isLoading.value = false;
  }
}

/**
 * Navigate to form using state management (DRY principle)
 */
function selectAssessment(schemaId: string) {
  // Set navigation state with patient data (stored in composable, not query params)
  setNavigationState(
    schemaId,
    'new', // formId 'new' triggers form creation
    sessionId.value,
    {
      patientId: session.value?.patientId,
      patientName: session.value?.patientName,
      dateOfBirth: session.value?.dateOfBirth,
      gender: session.value?.gender
    }
  );
  
  // Navigate to dynamic route
  navigateTo(`/assessment/${schemaId}/new`);
}

/**
 * Go back to session
 */
function goBack() {
  navigateTo(`/sessions/${sessionId.value}`);
}

// ============================================
// Lifecycle
// ============================================

onMounted(() => {
  // Auth check
  if (!auth.isAuthenticated.value) {
    navigateTo('/');
    return;
  }
  
  loadSessionData();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4 sm:p-6">
    <!-- Page Header -->
    <header class="mb-6">
      <div class="flex items-center gap-4">
        <button 
          @click="goBack"
          class="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h1 class="text-xl font-semibold text-white">
            Select Assessment
          </h1>
          <p class="text-gray-400 text-sm">
            Choose an assessment form for the patient
          </p>
        </div>
      </div>
    </header>

    <!-- Error State -->
    <div
      v-if="error"
      class="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-xl flex items-center justify-between"
    >
      <div class="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p class="text-red-400 font-medium">{{ error }}</p>
      </div>
      <button 
        @click="error = null"
        class="p-1 text-red-400 hover:text-red-300"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-20">
      <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4"></div>
      <p class="text-white text-lg">Loading session...</p>
      <p class="text-gray-500 text-sm">Please wait while we fetch session details</p>
    </div>

    <!-- Patient Info Card -->
    <div v-else-if="session" class="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-white mb-1">
            {{ patientInfo?.name || 'Unknown Patient' }}
          </h2>
          <p class="text-gray-400 text-sm">
            Session {{ session.id.slice(7, 11) }} • {{ sessionAge }}
          </p>
        </div>
        <span 
          class="px-3 py-1.5 rounded-full text-sm font-medium"
          :class="{
            'bg-red-900/30 text-red-400': session.triage === 'red',
            'bg-yellow-900/30 text-yellow-400': session.triage === 'yellow',
            'bg-green-900/30 text-green-400': session.triage === 'green',
            'bg-gray-700 text-gray-300': !session.triage
          }"
        >
          {{ session.triage?.toUpperCase() || 'UNKNOWN' }}
        </span>
      </div>
    </div>

    <!-- Assessment Forms List -->
    <div v-if="!isLoading && !error" class="space-y-4">
      <!-- Section Header -->
      <div class="mb-6">
        <h3 class="text-lg font-medium text-white mb-1">
          Available Assessment Forms
        </h3>
        <p class="text-gray-400 text-sm">
          Select an assessment protocol to begin evaluating the patient
        </p>
      </div>

      <!-- Schema Cards -->
      <div
        v-for="schema in visibleSchemas"
        :key="schema.id"
        class="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-blue-500/50 transition-all duration-300 cursor-pointer hover:bg-gray-750 group"
        @click="selectAssessment(schema.id)"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-4">
            <!-- Icon Container -->
            <div 
              class="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
              :class="{
                'bg-blue-900/50': schema.priority === 'high',
                'bg-yellow-900/50': schema.priority === 'medium',
                'bg-green-900/50': schema.priority === 'low',
                'bg-gray-700': !schema.priority
              }"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                class="h-6 w-6"
                :class="{
                  'text-blue-400': schema.priority === 'high',
                  'text-yellow-400': schema.priority === 'medium',
                  'text-green-400': schema.priority === 'low',
                  'text-gray-400': !schema.priority
                }"
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  stroke-linecap="round" 
                  stroke-linejoin="round" 
                  stroke-width="2" 
                  :d="getPriorityIcon(schema.priority)" 
                />
              </svg>
            </div>
            
            <!-- Content -->
            <div class="flex-1">
              <div class="flex items-start justify-between">
                <div>
                  <h4 class="font-semibold text-white group-hover:text-blue-400 transition-colors">
                    {{ schema.name }}
                  </h4>
                  <p class="text-gray-400 text-sm mt-1">
                    {{ schema.description }}
                  </p>
                </div>
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  class="h-5 w-5 text-gray-500 group-hover:text-blue-400 transition-colors flex-shrink-0 mt-1" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              
              <!-- Metadata -->
              <div class="flex items-center gap-3 mt-4 flex-wrap">
                <!-- Status Badge -->
                <span 
                  class="px-2 py-1 rounded-full text-xs font-medium"
                  :class="{
                    'bg-blue-900/30 text-blue-400': getStatusColor(schema.status) === 'info',
                    'bg-green-900/30 text-green-400': getStatusColor(schema.status) === 'success',
                    'bg-yellow-900/30 text-yellow-400': getStatusColor(schema.status) === 'warning',
                    'bg-gray-700 text-gray-400': getStatusColor(schema.status) === 'neutral'
                  }"
                >
                  {{ schema.status }}
                </span>
                
                <!-- Duration -->
                <span class="text-gray-500 text-xs flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {{ schema.metadata.estimatedCompletionMinutes }} min
                </span>
                
                <!-- Supervisor Review -->
                <span 
                  v-if="schema.metadata.requiresSupervisorReview"
                  class="text-yellow-400 text-xs flex items-center gap-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Requires supervisor review
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="visibleSchemas.length === 0" class="bg-gray-800 rounded-xl p-8 text-center border border-gray-700">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-gray-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <h4 class="text-white font-medium mb-2">No assessment forms available</h4>
        <p class="text-gray-400 text-sm">Please check back later or contact support for assistance</p>
      </div>
    </div>

    <!-- Back Button -->
    <div class="mt-8 pt-6 border-t border-gray-800">
      <button
        @click="goBack"
        class="w-full px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Session
      </button>
    </div>
  </div>
</template>