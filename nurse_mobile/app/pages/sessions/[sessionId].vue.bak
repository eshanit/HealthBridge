<script setup lang="ts">
/**
 * Session Detail Page
 * 
 * Displays detailed view of a clinical session including:
 * - Session header with triage/stage badges
 * - Timeline of all events
 * - Linked forms
 * - Action buttons for workflow progression
 */

import { ref, computed, onMounted } from 'vue';
import type { ClinicalSession, ClinicalSessionStage } from '~/services/sessionEngine';
import Timeline from '~/components/clinical/Timeline.vue';
import { 
  loadSession, 
  advanceStage, 
  completeSession, 
  initializeSessionEngine 
} from '~/services/sessionEngine';
import { 
  logStageChange, 
  logStatusChange, 
  initializeTimeline 
} from '~/services/clinicalTimeline';
import { useToast } from '@/composables/useToast';
import { useFormEngine } from '@/composables/useFormEngine';

// ============================================
// Route & Params
// ============================================

const route = useRoute();
const sessionId = computed(() => route.params.sessionId as string);

// ============================================
// Meta & SEO
// ============================================

useHead({
  title: `Session ${sessionId.value.slice(7, 11)} - HealthBridge`,
  meta: [
    { name: 'description', content: 'Clinical session detail view' }
  ]
});

// ============================================
// State
// ============================================

const session = ref<ClinicalSession | null>(null);
const isLoading = ref(true);
const isSaving = ref(false);
const error = ref<string | null>(null);
const activeTab = ref('overview');

// Initialize services
const toastComposable = useToast();
const formEngine = useFormEngine();

// ============================================
// Computed
// ============================================

/**
 * Triage configuration
 */
interface TriageConfigType {
  color: string;
  label: string;
  icon: string;
  bgClass: string;
  textClass: string;
}

const triageConfig = computed(() => {
  const configs: Record<string, TriageConfigType> = {
    red: { 
      color: 'error', 
      label: 'RED',
      icon: 'i-heroicons-exclamation-circle',
      bgClass: 'bg-red-100 dark:bg-red-900',
      textClass: 'text-red-800 dark:text-red-200'
    },
    yellow: { 
      color: 'warning', 
      label: 'YELLOW',
      icon: 'i-heroicons-exclamation-triangle',
      bgClass: 'bg-amber-100 dark:bg-amber-900',
      textClass: 'text-amber-800 dark:text-amber-200'
    },
    green: { 
      color: 'success', 
      label: 'GREEN',
      icon: 'i-heroicons-check-circle',
      bgClass: 'bg-green-100 dark:bg-green-900',
      textClass: 'text-green-800 dark:text-green-200'
    },
    unknown: { 
      color: 'gray', 
      label: 'UNKNOWN',
      icon: 'i-heroicons-question-mark-circle',
      bgClass: 'bg-gray-100 dark:bg-gray-800',
      textClass: 'text-gray-800 dark:text-gray-200'
    }
  };
  
  const triage = session.value?.triage || 'unknown';
  const config = configs[triage];
  return config || configs['unknown']!;
});

/**
 * Stage configuration
 */
const stageConfig = computed(() => {
  const configs: Record<ClinicalSessionStage, { 
    color: 'error' | 'warning' | 'success' | 'neutral' | 'primary' | 'secondary'; 
    label: string;
  }> = {
    registration: { color: 'neutral', label: 'Registration' },
    assessment: { color: 'primary', label: 'Assessment' },
    treatment: { color: 'success', label: 'Treatment' },
    discharge: { color: 'secondary', label: 'Discharge' }
  };
  
  return configs[session.value?.stage || 'registration'];
});

/**
 * Session age
 */
const sessionAge = computed(() => {
  if (!session.value) return '';
  
  const now = Date.now();
  const diff = now - session.value.createdAt;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
});

/**
 * Formatted creation date
 */
const formattedDate = computed(() => {
  if (!session.value) return '';
  
  return new Date(session.value.createdAt).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

/**
 * Available stage transitions
 */
const availableStages = computed((): ClinicalSessionStage[] => {
  if (!session.value) return [];
  
  const stages: ClinicalSessionStage[] = [
    'registration', 
    'assessment', 
    'treatment', 
    'discharge'
  ];
  
  const currentIndex = stages.indexOf(session.value.stage);
  return stages.slice(currentIndex);
});

/**
 * Is session completed
 */
const isCompleted = computed(() => {
  return session.value?.status === 'completed' || 
         session.value?.status === 'cancelled' ||
         session.value?.status === 'referred';
});

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
    
    // Initialize services
    await initializeSessionEngine();
    await initializeTimeline();
    
    // Load session
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
 * Advance to next stage
 */
async function handleAdvanceStage() {
  if (!session.value || isSaving.value) return;
  
  const currentIndex = availableStages.value.indexOf(session.value.stage);
  const nextStage = availableStages.value[currentIndex + 1];
  if (!nextStage) return;
  
  try {
    isSaving.value = true;
    error.value = null;
    
    const previousStage = session.value.stage;
    
    // Update session
    await advanceStage(sessionId.value, nextStage);
    
    // Log event
    await logStageChange(sessionId.value, previousStage, nextStage);
    
    // Show toast notification
    toastComposable.toast({
      title: 'Stage advanced',
      description: `Session moved to ${nextStage}`,
      color: 'success'
    });
    
    // Navigate based on stage
    if (nextStage === 'assessment') {
      const form = await formEngine.getOrCreateInstance({
        workflow: 'peds_respiratory',
        sessionId: sessionId.value
      });
      navigateTo(`/assessment/${form.schemaId}/${form._id}`);
    }
    
    if (nextStage === 'treatment') {
      navigateTo(`/sessions/${sessionId.value}/treatment`);
    }
    
    if (nextStage === 'discharge') {
      navigateTo(`/sessions/${sessionId.value}/summary`);
    }
    
    // Reload session
    await loadSessionData();
  } catch (err) {
    console.error('Failed to advance stage:', err);
    error.value = err instanceof Error ? err.message : 'Failed to advance stage';
  } finally {
    isSaving.value = false;
  }
}

/**
 * Complete session
 */
async function handleCompleteSession(finalStatus: 'completed' | 'referred' | 'cancelled') {
  if (!session.value || isSaving.value) return;
  
  try {
    isSaving.value = true;
    error.value = null;
    
    const previousStatus = session.value.status;
    
    // Update session
    await completeSession(sessionId.value, finalStatus);
    
    // Log event
    await logStatusChange(sessionId.value, previousStatus, finalStatus);
    
    // Reload session
    await loadSessionData();
  } catch (err) {
    console.error('Failed to complete session:', err);
    error.value = err instanceof Error ? err.message : 'Failed to complete session';
  } finally {
    isSaving.value = false;
  }
}

/**
 * Get stage progress percentage
 */
function getStageProgress(stage: ClinicalSessionStage): number {
  const stages: ClinicalSessionStage[] = [
    'registration', 
    'assessment', 
    'treatment', 
    'discharge'
  ];
  
  const index = stages.indexOf(stage);
  return ((index + 1) / stages.length) * 100;
}

// ============================================
// Lifecycle
// ============================================

onMounted(() => {
  loadSessionData();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4 sm:p-6">
    <!-- Page Header -->
    <header class="bg-gray-800 rounded-xl shadow-sm mb-4">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <!-- Back Button & Title -->
        <div class="flex items-center gap-4 mb-4">
          <UButton
            icon="i-heroicons-arrow-left"
            color="neutral"
            variant="ghost"
            to="/sessions"
          />
          <div>
            <h1 class="text-xl font-semibold text-white">
              Session {{ session?.id.slice(7, 11) }}
            </h1>
            <p class="text-sm text-gray-400">
              Created {{ formattedDate }}
            </p>
          </div>
          
          <!-- Status Badge -->
          <UBadge
            v-if="session"
            :color="session.status === 'open' ? 'success' : 'neutral'"
            variant="subtle"
            size="lg"
            class="ml-auto"
          >
            {{ session.status }}
          </UBadge>
        </div>
        
        <!-- Stage Progress Bar -->
        <div v-if="session" class="relative">
          <div class="absolute top-1/2 left-0 right-0 h-1 bg-gray-700 -translate-y-1/2 rounded" />
          <div 
            class="absolute top-1/2 left-0 h-1 bg-primary -translate-y-1/2 rounded transition-all duration-300"
            :style="{ width: `${getStageProgress(session.stage)}%` }"
          />
          
          <div class="relative flex justify-between">
            <template v-for="(label, idx) in ['Registration', 'Assessment', 'Treatment', 'Discharge']" :key="label">
              <div class="flex flex-col items-center">
                <div 
                  class="w-3 h-3 rounded-full border-2 transition-all duration-300 bg-gray-900"
                  :class="{
                    'bg-primary border-primary': 
                      ['registration', 'assessment', 'treatment', 'discharge'].indexOf(session.stage) >= idx,
                    'border-gray-600': 
                      ['registration', 'assessment', 'treatment', 'discharge'].indexOf(session.stage) < idx
                  }"
                />
                <span class="mt-2 text-xs text-gray-400">
                  {{ label }}
                </span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </header>
    
    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <!-- Error State -->
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        :close-button="{ icon: 'i-heroicons-x-mark', color: 'gray', variant: 'ghost' }"
        class="mb-6"
        @close="error = null"
      >
        {{ error }}
      </UAlert>
      
      <!-- Loading State -->
      <div v-if="isLoading" class="flex items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
        <span class="ml-3 text-gray-400">Loading session...</span>
      </div>
      
      <!-- Session Content -->
      <template v-else-if="session">
        <!-- Session Header Card -->
        <UCard class="mb-6">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <!-- Triage Badge -->
            <div class="flex items-center gap-4">
              <div 
                class="flex items-center gap-2 px-4 py-2 rounded-full font-bold"
                :class="[triageConfig.bgClass, triageConfig.textClass]"
              >
                <UIcon :name="triageConfig.icon" class="w-5 h-5" />
                <span>{{ triageConfig.label }}</span>
              </div>
              
              <!-- Stage Badge -->
              <UBadge :color="stageConfig.color" variant="subtle" size="lg">
                {{ stageConfig.label }}
              </UBadge>
              
              <!-- Session Age -->
              <div class="text-sm text-gray-400">
                Age: {{ sessionAge }}
              </div>
            </div>
            
            <!-- Action Buttons -->
            <div class="flex items-center gap-2">
              <!-- Advance Stage -->
              <UButton
                v-if="!isCompleted && session.stage !== 'discharge' && availableStages[availableStages.indexOf(session.stage) + 1]"
                icon="i-heroicons-arrow-right"
                color="primary"
                :loading="isSaving"
                @click="handleAdvanceStage"
              >
                Advance to {{ availableStages[availableStages.indexOf(session.stage) + 1] }}
              </UButton>
              
              <!-- Complete Session -->
              <UButton
                v-if="!isCompleted && session.stage === 'discharge'"
                icon="i-heroicons-check"
                color="success"
                :loading="isSaving"
                @click="handleCompleteSession('completed')"
              >
                Complete
              </UButton>
              
              <!-- More Actions -->
              <div class="flex items-center gap-2">
                <!-- Refer to Specialist -->
                <UButton
                  icon="i-heroicons-user-plus"
                  color="neutral"
                  variant="ghost"
                  @click="handleCompleteSession('referred')"
                />
                
                <!-- Cancel Session -->
                <UButton
                  icon="i-heroicons-x-mark"
                  color="neutral"
                  variant="ghost"
                  @click="handleCompleteSession('cancelled')"
                />
              </div>
            </div>
          </div>
        </UCard>
        
        <!-- Tabs -->
        <UTabs :items="[
          { label: 'Overview', icon: 'i-heroicons-home', key: 'overview' },
          { label: 'Timeline', icon: 'i-heroicons-clock', key: 'timeline' },
          { label: 'Forms', icon: 'i-heroicons-document-text', key: 'forms' }
        ]" v-model="activeTab" class="mb-6">
          <template #default="{ item }">
            <div class="flex items-center gap-2">
              <UIcon :name="item.icon" class="w-4 h-4" />
              <span>{{ item.label }}</span>
            </div>
          </template>
        </UTabs>
        
        <!-- Tab Content -->
        <div v-if="activeTab === 'overview'">
          <!-- Session Info Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Patient Info -->
            <UCard>
              <template #header>
                <h3 class="font-semibold text-white">
                  Session Information
                </h3>
              </template>
              
              <div class="space-y-3 text-gray-300">
                <div class="flex justify-between">
                  <span class="text-gray-400">Session ID</span>
                  <span class="font-mono text-sm text-white">{{ session.id }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Created</span>
                  <span class="text-white">{{ formattedDate }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Last Updated</span>
                  <span class="text-white">{{ new Date(session.updatedAt).toLocaleString('en-CA') }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Forms Completed</span>
                  <span class="text-white">{{ session.formInstanceIds.length }}</span>
                </div>
              </div>
            </UCard>
            
            <!-- Quick Actions -->
            <UCard>
              <template #header>
                <h3 class="font-semibold text-white">
                  Quick Actions
                </h3>
              </template>
              
              <div class="space-y-3 text-gray-300">
                <UButton
                  icon="i-heroicons-clipboard-document-check"
                  color="primary"
                  variant="outline"
                  block
                  to="/assessment/peds-respiratory/new"
                >
                  Start Respiratory Assessment
                </UButton>
                
                <UButton
                  icon="i-heroicons-document-plus"
                  color="primary"
                  variant="outline"
                  block
                >
                  Add Clinical Note
                </UButton>
                
                <UButton
                  icon="i-heroicons-arrow-right-on-rectangle"
                  color="neutral"
                  variant="outline"
                  block
                >
                  Transfer Patient
                </UButton>
              </div>
            </UCard>
          </div>
        </div>
        
        <!-- Timeline Tab -->
        <div v-else-if="activeTab === 'timeline'">
          <Timeline :session-id="session.id" />
        </div>
        
        <!-- Forms Tab -->
        <div v-else-if="activeTab === 'forms'">
          <UCard class="text-center py-12">
            <UIcon name="i-heroicons-document-text" class="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No Forms Yet
            </h3>
            <p class="text-gray-500 dark:text-gray-400 mb-4">
              Complete clinical forms to document patient assessment.
            </p>
            <UButton
              icon="i-heroicons-plus"
              color="primary"
              to="/assessment/peds-respiratory/new"
            >
              Start Assessment
            </UButton>
          </UCard>
        </div>
      </template>
    </main>
  </div>
</template>
