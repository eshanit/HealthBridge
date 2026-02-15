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

import { ref, computed, onMounted, watch } from 'vue';
import { navigateTo } from '#app';
import type { ClinicalSession, ClinicalSessionStage } from '~/services/sessionEngine';
import Timeline from '~/components/clinical/Timeline.vue';
import RegistrationForm from '~/components/clinical/forms/RegistrationForm.vue';
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
import { useFormEngine } from '~/composables/useFormEngine';
import { useAssessmentNavigation } from '~/composables/useAssessmentNavigation';
import { formEngine } from '~/services/formEngine';
import { TWButton, TWBadge, TWCard } from '~/components/ui';
import { useSessionPatient } from '~/composables/useSessionPatient';

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
const activeTab = ref('registration');
const availableForms = ref<any[]>([]);
const tabs = [
  { id: 'registration', label: 'Registration' },
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'forms', label: 'Forms' }
];
const assessmentCompleted = ref(false);
const assessmentFormId = ref<string | null>(null);
const formInstances = ref<any[]>([]);
const isLoadingForms = ref(false);

// ============================================
// Session Patient Persistence
// ============================================

/**
 * Session patient persistence composable
 * Uses sessionStorage to persist patient data across page navigation
 */
const { patientData: persistedPatient, hasPatient: hasPersistedPatient } = useSessionPatient({
  sessionId,
  autoHydrate: true
});

/**
 * Assessment navigation composable for state management-based patient data passing
 */
const { setNavigationState } = useAssessmentNavigation();

/**
 * Get the patient name - from session data first, then persisted storage
 */
const patientName = computed(() => {
  // First check session data
  if (session.value?.patientName) {
    return session.value.patientName;
  }
  // Fall back to persisted data
  if (persistedPatient.value?.patientName) {
    return persistedPatient.value.patientName;
  }
  return null;
});

/**
 * Get the patient ID - from session data first, then persisted storage
 */
const patientId = computed(() => {
  if (session.value?.patientId) {
    return session.value.patientId;
  }
  if (persistedPatient.value?.patientId) {
    return persistedPatient.value.patientId;
  }
  return null;
});

/**
 * Get the patient CPT - from session data first, then persisted storage
 * Returns the 4-character CPT for patient lookup
 */
const patientCpt = computed(() => {
  // First check session data (new field)
  if (session.value?.patientCpt) {
    return session.value.patientCpt;
  }
  // Fall back to patientId if it looks like a 4-character CPT
  if (session.value?.patientId) {
    const pid = session.value.patientId;
    if (pid.length === 4) {
      return pid;
    }
  }
  // Check persisted data
  if (persistedPatient.value?.patientCpt) {
    return persistedPatient.value.patientCpt;
  }
  if (persistedPatient.value?.patientId) {
    const pid = persistedPatient.value.patientId;
    if (pid.length === 4) {
      return pid;
    }
  }
  return null;
});

/**
 * Check if patient is registered (has data in session or persisted storage)
 */
const isPatientRegistered = computed(() => {
  if (!session.value) return false;
  // PatientId exists in session
  if (session.value.patientId) return true;
  // Patient data exists in persisted storage
  if (hasPersistedPatient.value) return true;
  // Stage has advanced past registration
  if (session.value.stage !== 'registration') return true;
  return false;
});

// Set initial tab after session loads
watch(session, (newSession) => {
  if (newSession && activeTab.value === 'registration' && newSession.stage !== 'registration') {
    activeTab.value = 'overview';
  }
}, { immediate: true });

// Watch for session changes to reload form data
watch(session, async (newSession) => {
  if (newSession) {
    await checkPedsRespiratoryAssessmentStatus();
    await loadFormInstances();
  }
});

// Initialize services
const toastComposable = useToast();
const { getOrCreateInstance, getLatestInstanceBySession } = useFormEngine();



// ============================================
// Computed
// ============================================

/**
 * Triage configuration
 */
interface TriageConfigType {
  color: 'success' | 'error' | 'warning' | 'info' | 'primary' | 'secondary' | 'neutral' | undefined;
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
      color: 'neutral', 
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
 * Session stages for workflow progress
 */
const sessionStages = computed(() => [
  { id: 'registration', label: 'Registration', icon: 'i-heroicons-user' },
  { id: 'assessment', label: 'Assessment', icon: 'i-heroicons-clipboard-document-check' },
  { id: 'treatment', label: 'Treatment', icon: 'i-heroicons-beaker' },
  { id: 'discharge', label: 'Discharge', icon: 'i-heroicons-arrow-right-on-circle' }
]);

/**
 * Session progress percentage
 */
const sessionProgress = computed(() => {
  if (!session.value) return 0;
  
  const stages: ClinicalSessionStage[] = [
    'registration',
    'assessment',
    'treatment',
    'discharge'
  ];
  
  const currentIndex = stages.indexOf(session.value.stage);
  return ((currentIndex + 1) / stages.length) * 100;
});

/**
 * Get stage status color for progress indicator
 */
function getStageStatusColor(stageId: string): 'success' | 'primary' | 'neutral' | 'error' {
  if (!session.value) return 'neutral';
  
  const stages: ClinicalSessionStage[] = [
    'registration',
    'assessment',
    'treatment',
    'discharge'
  ];
  
  const currentIndex = stages.indexOf(session.value.stage);
  const stageIndex = stages.indexOf(stageId as ClinicalSessionStage);
  
  if (stageIndex < currentIndex) return 'success';
  if (stageIndex === currentIndex) return 'primary';
  return 'neutral';
}

/**
 * Get stage icon based on completion status
 */
function getStageIcon(stageId: string): string {
  if (!session.value) return 'i-heroicons-circle';
  
  const stages: ClinicalSessionStage[] = [
    'registration',
    'assessment',
    'treatment',
    'discharge'
  ];
  
  const currentIndex = stages.indexOf(session.value.stage);
  const stageIndex = stages.indexOf(stageId as ClinicalSessionStage);
  
  if (stageIndex < currentIndex) return 'i-heroicons-check-circle';
  if (stageIndex === currentIndex) return 'i-heroicons-arrow-right-circle';
  
  // Return default icon for future stages
  const icons: Record<string, string> = {
    registration: 'i-heroicons-user',
    assessment: 'i-heroicons-clipboard-document-check',
    treatment: 'i-heroicons-beaker',
    discharge: 'i-heroicons-arrow-right-on-circle'
  };
  return icons[stageId] || 'i-heroicons-circle';
}

/**
 * Get stage label color
 */
function getStageLabelColor(stageId: string): string {
  if (!session.value) return 'text-gray-400';
  
  const stages: ClinicalSessionStage[] = [
    'registration',
    'assessment',
    'treatment',
    'discharge'
  ];
  
  const currentIndex = stages.indexOf(session.value.stage);
  const stageIndex = stages.indexOf(stageId as ClinicalSessionStage);
  
  if (stageIndex <= currentIndex) return 'text-gray-900 dark:text-white';
  return 'text-gray-400';
}

/**
 * Navigate to a specific stage
 */
function navigateToStage(stageId: string) {
  if (!session.value) return;
  
  const stages: ClinicalSessionStage[] = [
    'registration',
    'assessment',
    'treatment',
    'discharge'
  ];
  
  const currentIndex = stages.indexOf(session.value.stage);
  const targetIndex = stages.indexOf(stageId as ClinicalSessionStage);
  
  // Only navigate forward or to current stage
  if (targetIndex <= currentIndex) {
    switch (stageId) {
      case 'registration':
        navigateTo(`/sessions/${sessionId.value}`);
        break;
      case 'assessment':
        navigateTo(`/sessions/${sessionId.value}/assessment`);
        break;
      case 'treatment':
        navigateTo(`/sessions/${sessionId.value}/treatment`);
        break;
      case 'discharge':
        navigateTo(`/sessions/${sessionId.value}/summary`);
        break;
    }
  }
}

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
 * Should show registration form
 * - Show if session is in 'registration' stage AND patient not yet registered
 */
const showRegistrationForm = computed(() => {
  return session.value?.stage === 'registration' && !isPatientRegistered.value;
});

/**
 * Should show advance to assessment button
 * - Show if patient is already registered (session stage may still be 'registration')
 */
const showAdvanceToAssessment = computed(() => {
  if (isCompleted.value) return false;
  if (session.value?.stage === 'discharge') return false;
  
  // Show if patient is registered (either from queue or just completed registration)
  return isPatientRegistered.value;
});

/**
 * Next stage label for button
 */
const nextStageLabel = computed(() => {
  if (session.value?.stage === 'registration' && isPatientRegistered.value) {
    return 'Continue to Assessment';
  }
  const stages: ClinicalSessionStage[] = [
    'registration', 
    'assessment', 
    'treatment', 
    'discharge'
  ];
  const currentIndex = stages.indexOf(session.value?.stage || 'registration');
  const nextStage = stages[currentIndex + 1];
  return nextStage ? `Advance to ${nextStage.charAt(0).toUpperCase() + nextStage.slice(1)}` : '';
});

/**
 * Can advance to next stage
 * - For treatment stage, requires assessment to be completed
 */
const canAdvanceToNextStage = computed(() => {
  if (!session.value) return false;
  
  const stages: ClinicalSessionStage[] = [
    'registration', 
    'assessment', 
    'treatment', 
    'discharge'
  ];
  const currentIndex = stages.indexOf(session.value.stage);
  const nextStage = stages[currentIndex + 1];
  
  // If trying to advance to treatment, require assessment
  if (nextStage === 'treatment') {
    return hasAssessment.value;
  }
  
  return true;
});

/**
 * Reason for not being able to advance
 */
const advanceBlockReason = computed(() => {
  if (!session.value) return '';
  
  const stages: ClinicalSessionStage[] = [
    'registration', 
    'assessment', 
    'treatment', 
    'discharge'
  ];
  const currentIndex = stages.indexOf(session.value.stage);
  const nextStage = stages[currentIndex + 1];
  
  if (nextStage === 'treatment' && !hasAssessment.value) {
    return 'Complete at least one assessment form before advancing to treatment';
  }
  
  return '';
});

/**
 * Is session completed
 */
const isCompleted = computed(() => {
  return session.value?.status === 'completed' || 
         session.value?.status === 'cancelled' ||
         session.value?.status === 'referred';
});

/**
 * Has assessment been completed (has any forms been filled)
 */
const hasAssessment = computed(() => {
  return session.value?.formInstanceIds && session.value.formInstanceIds.length > 0;
});

/**
 * Peds Respiratory Assessment Completion Status
 * Tracks whether the Pediatric Respiratory Distress Assessment form has been completed
 */
const isPedsRespiratoryAssessmentComplete = computed(() => {
  return assessmentCompleted.value;
});

/**
 * Should show advance to treatment button
 * - Only show if assessment is complete (has forms)
 */
const showAdvanceToTreatment = computed(() => {
  if (isCompleted.value) return false;
  if (session.value?.stage === 'discharge') return false;
  
  // Only show if in treatment stage AND assessment is complete
  return session.value?.stage === 'treatment' && hasAssessment.value;
});

/**
 * Available forms for selection (from manifest)
 */
const loadAvailableForms = async () => {
  try {
    const response = await fetch('/schemas/manifest.json');
    const manifest = await response.json();
    
    // Map availableSchemas to include name, description, priority
    const schemas = manifest.availableSchemas || [];
    availableForms.value = schemas.map((schema: any) => ({
      id: schema.id,
      name: getFormName(schema.id),
      description: getFormDescription(schema.id),
      priority: getFormPriority(schema.id)
    }));
  } catch (err) {
    console.error('Failed to load available forms:', err);
    // Fallback to known forms
    availableForms.value = [
      {
        id: 'peds_respiratory',
        name: 'Pediatric Respiratory Distress Assessment',
        description: 'WHO IMCI protocol for children 2 months to 5 years with cough or difficulty breathing',
        priority: 'high'
      }
    ];
  }
};

/**
 * Get form display name by ID
 */
function getFormName(schemaId: string): string {
  const names: Record<string, string> = {
    'peds_respiratory': 'Pediatric Respiratory Distress Assessment',
    'peds_diarrhea': 'Pediatric Diarrhea Assessment',
    'peds_fever': 'Pediatric Fever Assessment',
    'adult_wound_care': 'Adult Wound Care Assessment'
  };
  return names[schemaId] || schemaId;
}

/**
 * Get form description by ID
 */
function getFormDescription(schemaId: string): string {
  const descriptions: Record<string, string> = {
    'peds_respiratory': 'WHO IMCI protocol for children 2 months to 5 years with cough or difficulty breathing',
    'peds_diarrhea': 'WHO IMCI protocol for children with diarrhea',
    'peds_fever': 'WHO IMCI protocol for children with fever',
    'adult_wound_care': 'Basic wound assessment and dressing protocol'
  };
  return descriptions[schemaId] || '';
}

/**
 * Get form priority by ID
 */
function getFormPriority(schemaId: string): string {
  const priorities: Record<string, string> = {
    'peds_respiratory': 'high',
    'peds_diarrhea': 'medium',
    'peds_fever': 'high',
    'adult_wound_care': 'low'
  };
  return priorities[schemaId] || 'medium';
}

/**
 * Check if Pediatric Respiratory Assessment has been completed
 */
async function checkPedsRespiratoryAssessmentStatus() {
  try {
    // Look for a completed peds_respiratory form instance for this session
    const formInstance = await getLatestInstanceBySession({
      schemaId: 'peds_respiratory',
      sessionId: sessionId.value
    });
    
    if (formInstance && formInstance.status === 'completed') {
      assessmentCompleted.value = true;
      assessmentFormId.value = formInstance._id;
      console.log('[Session] Peds Respiratory Assessment completed:', formInstance._id);
    } else {
      assessmentCompleted.value = false;
      assessmentFormId.value = null;
    }
  } catch (err) {
    console.error('[Session] Failed to check assessment status:', err);
    assessmentCompleted.value = false;
  }
}

/**
 * Load all form instances for this session
 */
async function loadFormInstances() {
  try {
    isLoadingForms.value = true;
    
    // Get form instances from session
    if (session.value?.formInstanceIds && session.value.formInstanceIds.length > 0) {
      const instances = [];
      for (const formId of session.value.formInstanceIds) {
        try {
          // Try to get form instance details using loadInstance
          const instance = await formEngine.loadInstance(formId);
          if (instance) {
            instances.push({
              ...instance,
              displayName: getFormDisplayName(instance.schemaId || 'unknown'),
              displayStatus: instance.status || 'unknown'
            });
          }
        } catch (err) {
          console.warn(`[Session] Failed to load form instance ${formId}:`, err);
          // Add placeholder if we can't load the instance
          instances.push({
            _id: formId,
            schemaId: 'unknown',
            status: 'error',
            displayName: 'Unknown Form',
            displayStatus: 'Error loading'
          });
        }
      }
      formInstances.value = instances;
    } else {
      formInstances.value = [];
    }
  } catch (err) {
    console.error('[Session] Failed to load form instances:', err);
    formInstances.value = [];
  } finally {
    isLoadingForms.value = false;
  }
}

/**
 * Get display name for a form schema
 */
function getFormDisplayName(schemaId: string): string {
  const names: Record<string, string> = {
    'peds_respiratory': 'Pediatric Respiratory Distress Assessment',
    'peds_diarrhea': 'Pediatric Diarrhea Assessment',
    'peds_fever': 'Pediatric Fever Assessment',
    'adult_wound_care': 'Adult Wound Care Assessment',
    'registration': 'Patient Registration'
  };
  return names[schemaId] || schemaId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
    
    // Check if Peds Respiratory Assessment has been completed
    await checkPedsRespiratoryAssessmentStatus();
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
    toastComposable.add({
      title: 'Stage advanced',
      description: `Session moved to ${nextStage}`,
      color: 'success'
    });
    
    // Navigate based on stage
    if (nextStage === 'assessment') {
      // Navigate to assessment selection page instead of directly to a form
      navigateTo(`/sessions/${sessionId.value}/assessment`);
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
    
    // Relo session
    await loadSessionData();
  } catch (err) {
    console.error('Failed to complete session:', err);
    error.value = err instanceof Error ? err.message : 'Failed to complete session';
  } finally {
    isSaving.value = false;
  }
}

/**
 * Open form using state management (DRY principle)
 */
async function handleOpenForm(schemaId: string) {
  try {
    isSaving.value = true;
    
    // Set navigation state with patient data (stored in composable, not query params)
    setNavigationState(
      schemaId,
      'new', // formId 'new' triggers form creation
      sessionId.value,
      {
        patientId: session.value?.patientId || persistedPatient.value?.patientId,
        patientName: session.value?.patientName || persistedPatient.value?.patientName,
        dateOfBirth: session.value?.dateOfBirth || persistedPatient.value?.dateOfBirth,
        gender: session.value?.gender || persistedPatient.value?.gender
      }
    );
    
    // Navigate to dynamic route
    navigateTo(`/assessment/${schemaId}/new`);
  } catch (err) {
    console.error('Failed to open form:', err);
    error.value = err instanceof Error ? err.message : 'Failed to open form';
  } finally {
    isSaving.value = false;
  }
}

/**
 * Navigate back to sessions list
 */
function handleBack() {
  navigateTo('/sessions');
}

/**
 * Navigate to assessment
 */
function navigateToAssessment() {
  navigateTo(`/sessions/${sessionId.value}/assessment`);
}

/**
 * Navigate to treatment
 */
function navigateToTreatment() {
  navigateTo(`/sessions/${sessionId.value}/treatment`);
}

// ============================================
// Lifecycle
// ============================================

onMounted(async () => {
  await loadSessionData();
  await loadAvailableForms();
  await loadFormInstances();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4 md:p-6">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-20">
      <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4"></div>
      <p class="text-white text-lg">Loading session...</p>
      <p class="text-gray-500 text-sm">Please wait while we fetch session details</p>
    </div>

    <!-- Error State -->
    <div
      v-else-if="error"
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

    <!-- Session Content -->
    <div v-else-if="session">
      <!-- Header -->
      <header class="mb-8">
        <div class="flex items-start justify-between gap-4 mb-6">
          <div class="flex-1">
            <!-- Back Button and Title -->
            <div class="flex items-center gap-3 mb-3">
              <button 
                @click="handleBack"
                class="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div>
                <h1 class="text-2xl md:text-3xl font-bold text-white">
                  Session {{ sessionId.slice(7, 11) }}
                </h1>
                <p class="text-gray-400 text-sm mt-1">
                  Created {{ formattedDate }} ({{ sessionAge }})
                </p>
              </div>
            </div>

            <!-- Badges -->
            <div class="flex items-center gap-2 flex-wrap mt-4">
              <!-- Triage Badge -->
              <span 
                class="px-3 py-1.5 rounded-full text-sm font-medium"
                :class="{
                  'bg-red-900/30 text-red-400': triageConfig.color === 'error',
                  'bg-yellow-900/30 text-yellow-400': triageConfig.color === 'warning',
                  'bg-green-900/30 text-green-400': triageConfig.color === 'success',
                  'bg-gray-800 text-gray-300': triageConfig.color === 'neutral'
                }"
              >
                {{ triageConfig.label }}
              </span>
              
              <!-- Stage Badge -->
              <span 
                class="px-3 py-1.5 rounded-full text-sm font-medium border"
                :class="{
                  'bg-blue-900/30 text-blue-400 border-blue-700/30': stageConfig.color === 'primary',
                  'bg-green-900/30 text-green-400 border-green-700/30': stageConfig.color === 'success',
                  'bg-purple-900/30 text-purple-400 border-purple-700/30': stageConfig.color === 'secondary',
                  'bg-gray-800 text-gray-300 border-gray-700': stageConfig.color === 'neutral'
                }"
              >
                {{ stageConfig.label }}
              </span>
            </div>
          </div>
          
          <!-- Complete Button -->
          <button 
            v-if="!isCompleted"
            @click="handleCompleteSession('completed')"
            :disabled="isSaving"
            class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-green-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg 
              v-if="isSaving"
              xmlns="http://www.w3.org/2000/svg" 
              class="h-5 w-5 animate-spin" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <svg 
              v-else
              xmlns="http://www.w3.org/2000/svg" 
              class="h-5 w-5" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Complete
          </button>
        </div>

        <!-- Progress Bar -->
        <div class="mb-8">
          <div class="relative">
            <!-- Background -->
            <div class="absolute top-1/2 left-0 w-full h-1 bg-gray-700 -translate-y-1/2 rounded"></div>
            <!-- Progress Fill -->
            <div 
              class="absolute top-1/2 left-0 h-1 bg-blue-500 -translate-y-1/2 rounded transition-all duration-300"
              :style="{ width: `${sessionProgress}%` }"
            ></div>
            
            <!-- Stage Markers -->
            <div class="relative flex justify-between">
              <div v-for="(stage, index) in sessionStages" :key="stage.id" class="flex flex-col items-center">
                <button
                  @click="navigateToStage(stage.id)"
                  class="w-10 h-10 rounded-full z-10 flex items-center justify-center transition-all duration-300"
                  :class="{
                    'bg-blue-600 text-white border-2 border-blue-400': session?.stage === stage.id && getStageStatusColor(stage.id) === 'primary',
                    'bg-green-600 text-white border-2 border-green-400': session?.stage === stage.id && getStageStatusColor(stage.id) === 'success',
                    'bg-gray-700 text-gray-400 border-2 border-gray-600': getStageStatusColor(stage.id) === 'neutral',
                    'bg-gray-800 text-blue-400 border-2 border-blue-500': getStageStatusColor(stage.id) === 'primary' && session?.stage !== stage.id,
                    'bg-gray-800 text-green-400 border-2 border-green-500': getStageStatusColor(stage.id) === 'success' && session?.stage !== stage.id
                  }"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    class="h-5 w-5" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      stroke-linecap="round" 
                      stroke-linejoin="round" 
                      stroke-width="2" 
                      :d="getStageIcon(stage.id)" 
                    />
                  </svg>
                </button>
                <span 
                  class="mt-2 text-xs font-medium"
                  :class="{
                    'text-blue-400': getStageStatusColor(stage.id) === 'primary',
                    'text-green-400': getStageStatusColor(stage.id) === 'success',
                    'text-gray-500': getStageStatusColor(stage.id) === 'neutral'
                  }"
                >
                  {{ stage.label }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab Navigation -->
        <div class="border-b border-gray-700 mb-6">
          <div class="flex gap-1 -mb-px">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              @click="activeTab = tab.id"
              class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors"
              :class="{
                'bg-gray-800 text-white border-b-2 border-blue-500': activeTab === tab.id,
                'text-gray-400 hover:text-white hover:bg-gray-800/50': activeTab !== tab.id
              }"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>
      </header>

      <!-- Registration Tab -->
      <div v-if="activeTab === 'registration'">
        <div v-if="showRegistrationForm">
          <!-- Registration Form would go here -->
          <div class="bg-gray-800 rounded-xl p-6">
            <h3 class="text-xl font-semibold text-white mb-4">Patient Registration</h3>
            <p class="text-gray-400 mb-6">Registration form would be displayed here</p>
            
            <!-- Patient Lookup Link -->
            <div class="mt-6 p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
              <p class="text-sm text-blue-400 mb-3">Already have a patient CPT?</p>
              <NuxtLink 
                :to="`/sessions/${sessionId}/patient-lookup`"
                class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Look Up Patient by CPT
              </NuxtLink>
            </div>
          </div>
        </div>
        
        <div v-else>
          <div class="bg-gray-800 rounded-xl p-6 mb-6">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-12 h-12 rounded-full bg-green-900/30 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h3 class="text-lg font-semibold text-white">Registration Complete</h3>
                <p class="text-gray-400 text-sm">{{ patientName || 'Patient' }} is registered</p>
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p class="text-sm text-gray-400 mb-1">Patient Name</p>
                <p class="text-white">{{ patientName || 'Unknown' }}</p>
              </div>
              <div>
                <p class="text-sm text-gray-400 mb-1">CPT</p>
                <p class="text-white font-mono text-sm">{{ patientCpt || 'N/A' }}</p>
              </div>
            </div>

            <!-- Continue Button -->
            <button 
              v-if="showAdvanceToAssessment"
              @click="handleAdvanceStage"
              :disabled="isSaving"
              class="w-full py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg 
                v-if="isSaving"
                xmlns="http://www.w3.org/2000/svg" 
                class="h-5 w-5 animate-spin" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{{ nextStageLabel }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Overview Tab -->
      <div v-else-if="activeTab === 'overview'" class="space-y-6">
        <!-- Session Details Card -->
        <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h3 class="text-lg font-semibold text-white mb-4">Session Details</h3>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p class="text-sm text-gray-400 mb-1">Session ID</p>
              <p class="text-white font-mono text-sm">{{ sessionId }}</p>
            </div>
            
            <div>
              <p class="text-sm text-gray-400 mb-1">CPT</p>
              <p class="text-white font-mono text-sm">{{ patientCpt || 'N/A' }}</p>
            </div>
            
            <div>
              <p class="text-sm text-gray-400 mb-1">Patient Name</p>
              <p class="text-white">{{ session?.patientName || 'Unknown' }}</p>
            </div>
            
            <div>
              <p class="text-sm text-gray-400 mb-1">Date of Birth</p>
              <p class="text-white">{{ session?.dateOfBirth || 'Unknown' }}</p>
            </div>
            
            <div>
              <p class="text-sm text-gray-400 mb-1">Gender</p>
              <p class="text-white">{{ session?.gender || 'Unknown' }}</p>
            </div>

            <div>
              <p class="text-sm text-gray-400 mb-1">Triage Priority</p>
              <span 
                class="px-3 py-1 rounded-full text-sm font-medium"
                :class="{
                  'bg-red-900/30 text-red-400': triageConfig.color === 'error',
                  'bg-yellow-900/30 text-yellow-400': triageConfig.color === 'warning',
                  'bg-green-900/30 text-green-400': triageConfig.color === 'success',
                  'bg-gray-700 text-gray-300': triageConfig.color === 'neutral'
                }"
              >
                {{ triageConfig.label }}
              </span>
            </div>

            <div>
              <p class="text-sm text-gray-400 mb-1">Current Stage</p>
              <span 
                class="px-3 py-1 rounded-full text-sm font-medium"
                :class="{
                  'bg-blue-900/30 text-blue-400': stageConfig.color === 'primary',
                  'bg-green-900/30 text-green-400': stageConfig.color === 'success',
                  'bg-purple-900/30 text-purple-400': stageConfig.color === 'secondary',
                  'bg-gray-700 text-gray-300': stageConfig.color === 'neutral'
                }"
              >
                {{ stageConfig.label }}
              </span>
            </div>
          </div>
        </div>

        <!-- Assessment Required Card -->
        <div v-if="!isPedsRespiratoryAssessmentComplete" class="bg-gray-800 rounded-xl p-6 border border-amber-700/30">
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-amber-900/30 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <h3 class="text-lg font-semibold text-white">Assessment Required</h3>
                <p class="text-gray-400 text-sm">Pediatric Respiratory Distress Assessment</p>
              </div>
            </div>
            <span class="px-3 py-1 bg-red-900/30 text-red-400 rounded-full text-sm font-medium">
              Required
            </span>
          </div>
          
          <p class="text-gray-400 text-sm mb-4">
            WHO IMCI protocol for children 2 months to 5 years with cough or difficulty breathing
          </p>
          
          <button 
            @click="handleOpenForm('peds_respiratory')"
            :disabled="!isPatientRegistered"
            class="w-full py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            Complete Assessment
          </button>
          
          <div v-if="!isPatientRegistered" class="mt-4 p-3 bg-gray-700/50 rounded-lg text-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-gray-400 text-sm">Please complete patient registration first</p>
          </div>
        </div>

        <!-- Treatment Card -->
        <div v-else class="bg-gray-800 rounded-xl p-6 border border-blue-700/30">
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-green-900/30 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h3 class="text-lg font-semibold text-white">Treatment Protocol</h3>
                <p class="text-gray-400 text-sm">Assessment Complete</p>
              </div>
            </div>
            <span class="px-3 py-1 bg-green-900/30 text-green-400 rounded-full text-sm font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              Ready
            </span>
          </div>
          
          <p class="text-gray-400 text-sm mb-4">
            Based on assessment results, configure treatment recommendations
          </p>
          
          <button 
            @click="navigateToTreatment"
            class="w-full py-3 bg-green-700 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            Complete Treatment
          </button>
        </div>

        <!-- Next Steps Card -->
        <div v-if="showAdvanceToTreatment" class="bg-gray-800 rounded-xl p-6 text-center">
          <div class="w-16 h-16 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-white mb-2">Next Steps</h3>
          <p class="text-gray-400 mb-6">
            Treatment complete. Ready to discharge the patient?
          </p>
          
          <button 
            @click="handleAdvanceStage"
            :disabled="isSaving"
            class="px-6 py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mx-auto"
          >
            <svg 
              v-if="isSaving"
              xmlns="http://www.w3.org/2000/svg" 
              class="h-5 w-5 animate-spin" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <svg 
              v-else
              xmlns="http://www.w3.org/2000/svg" 
              class="h-5 w-5" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            Advance to Discharge
          </button>
        </div>

        <!-- Blocked State -->
        <div v-else-if="!canAdvanceToNextStage && advanceBlockReason" class="bg-gray-800 rounded-xl p-6 border border-amber-700/30">
          <div class="w-16 h-16 bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-amber-400 text-center mb-2">Next Stage Blocked</h3>
          <p class="text-gray-400 text-center">{{ advanceBlockReason }}</p>
        </div>
      </div>

      <!-- Timeline Tab -->
      <div v-else-if="activeTab === 'timeline'" class="bg-gray-800 rounded-xl p-6">
        <h3 class="text-lg font-semibold text-white mb-4">Session Timeline</h3>
        <p class="text-gray-400">Timeline content would be displayed here</p>
      </div>

      <!-- Forms Tab -->
      <div v-else-if="activeTab === 'forms'" class="bg-gray-800 rounded-xl p-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-semibold text-white">Forms & Assessments</h3>
          <button 
            v-if="isPatientRegistered && !isPedsRespiratoryAssessmentComplete"
            @click="handleOpenForm('peds_respiratory')"
            class="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            New Assessment
          </button>
        </div>

        <!-- Loading State -->
        <div v-if="isLoadingForms" class="flex flex-col items-center justify-center py-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-3"></div>
          <p class="text-gray-400 text-sm">Loading forms...</p>
        </div>
        
        <!-- Forms List -->
        <div v-else-if="formInstances.length > 0" class="space-y-3">
          <div
            v-for="form in formInstances"
            :key="form._id"
            class="p-4 rounded-lg border"
            :class="{
              'bg-green-900/20 border-green-700/30': form.status === 'completed',
              'bg-amber-900/20 border-amber-700/30': form.status === 'draft',
              'bg-red-900/20 border-red-700/30': form.status === 'error',
              'bg-gray-800 border-gray-700': !form.status
            }"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-2 h-2 rounded-full"
                    :class="{
                      'bg-green-500': form.status === 'completed',
                      'bg-amber-500': form.status === 'draft',
                      'bg-red-500': form.status === 'error',
                      'bg-gray-500': !form.status
                    }"
                  ></div>
                  <h4 class="font-medium text-white">{{ form.displayName }}</h4>
                </div>
                <p class="text-sm text-gray-400 mb-1">
                  Status: {{ form.displayStatus }}
                </p>
                <p v-if="form.updatedAt" class="text-xs text-gray-500">
                  Updated: {{ new Date(form.updatedAt).toLocaleString() }}
                </p>
              </div>
              
              <div class="flex items-center gap-2">
                <!-- Status Badge -->
                <span 
                  class="px-2 py-1 rounded-full text-xs font-medium"
                  :class="{
                    'bg-green-900/30 text-green-400': form.status === 'completed',
                    'bg-amber-900/30 text-amber-400': form.status === 'draft',
                    'bg-red-900/30 text-red-400': form.status === 'error',
                    'bg-gray-700 text-gray-400': !form.status
                  }"
                >
                  {{ form.displayStatus }}
                </span>
                
                <!-- View Button -->
                <button 
                  @click="navigateTo(`/records/${form._id}`)"
                  class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Empty State -->
        <div v-else class="text-center py-8">
          <div class="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h4 class="text-white font-medium mb-2">No forms completed yet</h4>
          <p class="text-gray-400 text-sm mb-6">Start an assessment to add forms to this session</p>
          
          <div v-if="isPatientRegistered" class="space-y-3 max-w-md mx-auto">
            <button
              @click="handleOpenForm('peds_respiratory')"
              class="w-full p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-left transition-colors group"
            >
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-white font-medium">Pediatric Respiratory Assessment</p>
                  <p class="text-gray-400 text-sm">WHO IMCI protocol</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400 group-hover:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </button>
          </div>
          
          <div v-else class="p-4 bg-gray-700/30 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <p class="text-gray-400 text-sm">Complete patient registration to start assessments</p>
          </div>
        </div>
      </div>

      <!-- Cancel Session -->
      <div v-if="!isCompleted" class="mt-8 pt-6 border-t border-gray-700 text-center">
        <button 
          @click="handleCompleteSession('cancelled')"
          class="px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-2 mx-auto"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Cancel Session
        </button>
      </div>
    </div>
  </div>
</template>
