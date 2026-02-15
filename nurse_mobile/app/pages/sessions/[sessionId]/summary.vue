<script setup lang="ts">
/**
 * Session Summary / Discharge Page
 * 
 * Displays the complete session summary including patient details,
 * all clinical data from previous stages, and discharge actions.
 * This is the final stage of the clinical workflow.
 */

import { ref, computed, onMounted } from 'vue';
import { useRoute, navigateTo } from '#app';
import { loadSession, completeSession, updateSession, type ClinicalSession } from '~/services/sessionEngine';
import { formEngine } from '~/services/formEngine';
import type { ClinicalFormInstance } from '~/types/clinical-form';
import { usePatientLookup } from '~/composables/usePatientLookup';
import { getPatientFullName } from '~/types/patient';
import { TWButton, TWCard, TWBadge, TWIcon, TWAlert } from '~/components/ui';
import { useAIStore } from '~/stores/aiStore';
import { isAIEnabled, getAIConfig } from '~/services/aiConfig';
import { buildExplainabilityModel } from '~/services/explainabilityEngine';
import { askClinicalAI } from '~/services/clinicalAI';
import type { ExplainabilityRecord } from '~/types/explainability';

// ============================================
// Route & Params
// ============================================

const route = useRoute();
const sessionId = computed(() => route.params.sessionId as string);

// ============================================
// Meta & SEO
// ============================================

useHead({
  title: 'Discharge Summary - HealthBridge',
  meta: [
    { name: 'description', content: 'Review and complete patient discharge' }
  ]
});

// ============================================
// State
// ============================================

const session = ref<ClinicalSession | null>(null);
const assessmentInstance = ref<ClinicalFormInstance | null>(null);
const treatmentInstance = ref<ClinicalFormInstance | null>(null);
const isLoading = ref(true);
const isSaving = ref(false);
const error = ref<string | null>(null);
const dischargeNotes = ref('');
const dischargeDisposition = ref<'home' | 'referred' | 'transferred' | 'deceased'>('home');

// Patient state
const linkedPatient = ref<{ cpt: string; firstName: string; lastName: string } | null>(null);
const showPatientLookup = ref(false);

// ============================================
// AI State
// ============================================

const aiStore = useAIStore();
const dischargeSummary = ref('');
const handoffReport = ref('');
const isGeneratingSummary = ref(false);
const isGeneratingHandoff = ref(false);
const explainabilityRecord = ref<ExplainabilityRecord | null>(null);

// ============================================
// Patient Lookup
// ============================================

const {
  query: patientQuery,
  results: patientResults,
  selectedPatient,
  isSearching: isSearchingPatient,
  hasError: patientHasError,
  setMode: setPatientMode,
  lookupByCPT: lookupPatientByCPT,
  selectPatient: selectPatientFromLookup,
  clearQuery: clearPatientQuery,
  loadRecentPatients: loadRecentPatientLookup
} = usePatientLookup({
  showRecent: true,
  onSelect: (patient) => {
    linkedPatient.value = {
      cpt: patient.cpt,
      firstName: patient.firstName,
      lastName: patient.lastName
    };
    showPatientLookup.value = false;
    
    // Save patient to session
    if (session.value) {
      updateSession(sessionId.value, {
        patientId: patient.cpt,
        patientName: `${patient.firstName} ${patient.lastName}`
      } as any);
    }
    
    toastComposable.add({
      title: 'Patient Linked',
      description: `${patient.firstName} ${patient.lastName} has been linked to this session`,
      color: 'success'
    });
  }
});

// ============================================
// Services
// ============================================

const toastComposable = useToast();

// ============================================
// Computed
// ============================================

const isCompleted = computed(() => session.value?.status === 'completed');

const patientInfo = computed(() => {
  if (!session.value) return null;
  
  // Use linked patient data if available
  if (linkedPatient.value) {
    return {
      name: `${linkedPatient.value.firstName} ${linkedPatient.value.lastName}`,
      patientId: linkedPatient.value.cpt,
      dateOfBirth: 'N/A', // Would need to load full patient record
      gender: 'Not specified',
      chiefComplaint: session.value.chiefComplaint || 'Not recorded'
    };
  }
  
  return {
    name: session.value.patientName || 'Unknown Patient',
    patientId: session.value.patientId || 'N/A',
    dateOfBirth: session.value.dateOfBirth || 'N/A',
    gender: session.value.gender || 'Not specified',
    chiefComplaint: session.value.chiefComplaint || 'Not recorded'
  };
});

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
  
  return new Date(created).toLocaleDateString();
});

const formattedDate = computed(() => {
  if (!session.value?.createdAt) return 'Unknown';
  return new Date(session.value.createdAt).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

const triagePriority = computed(() => session.value?.triage || 'unknown');

const triageConfig = computed(() => {
  const configs: Record<string, { color: 'error' | 'warning' | 'success' | 'neutral'; label: string }> = {
    red: { color: 'error', label: 'RED - URGENT' },
    yellow: { color: 'warning', label: 'YELLOW - PRIORITY' },
    green: { color: 'success', label: 'GREEN - ROUTINE' },
    unknown: { color: 'neutral', label: 'UNKNOWN' }
  };
  const config = configs[triagePriority.value];
  return config ?? configs['unknown'];
});

const assessmentData = computed(() => {
  if (!assessmentInstance.value) return null;
  return {
    status: assessmentInstance.value.status,
    completedAt: assessmentInstance.value.completedAt,
    answers: assessmentInstance.value.answers,
    calculated: assessmentInstance.value.calculated
  };
});

const treatmentData = computed(() => {
  if (!treatmentInstance.value) return null;
  return {
    status: treatmentInstance.value.status as string,
    completedAt: treatmentInstance.value.completedAt,
    answers: treatmentInstance.value.answers,
    calculated: treatmentInstance.value.calculated
  };
});

const recommendedActions = computed(() => {
  const actions = treatmentData.value?.answers?.recommended_actions || [];
  return Array.isArray(actions) ? actions : [];
});

// ============================================
// Helper Functions
// ============================================

function getTriageColorClass(triage: string): string {
  switch (triage) {
    case 'red': return 'bg-red-900/30 text-red-400 border-red-700';
    case 'yellow': return 'bg-yellow-900/30 text-yellow-400 border-yellow-700';
    case 'green': return 'bg-green-900/30 text-green-400 border-green-700';
    default: return 'bg-gray-700 text-gray-400 border-gray-600';
  }
}

function formatDate(timestamp: number | string | undefined): string {
  if (!timestamp) return 'N/A';
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
  return date.toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ============================================
// Patient Lookup Functions
// ============================================

function openPatientLookup() {
  showPatientLookup.value = true;
  loadRecentPatientLookup();
}

function closePatientLookup() {
  showPatientLookup.value = false;
  clearPatientQuery();
}

async function handlePatientCPTInput() {
  if (patientQuery.value.length === 11) {
    await lookupPatientByCPT();
  }
}

function registerNewPatient() {
  navigateTo(`/sessions/${sessionId.value}/registration`);
}

// ============================================
// Data Loading
// ============================================

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
    
    // Load assessment instance
    try {
      const assessment = await formEngine.getLatestInstanceBySession({
        schemaId: 'peds_respiratory',
        sessionId: sessionId.value
      });
      assessmentInstance.value = assessment;
    } catch (err) {
      console.warn('[Summary] Could not retrieve assessment:', err);
    }
    
    // Load treatment instance
    try {
      const treatment = await formEngine.getLatestInstanceBySession({
        schemaId: 'peds_respiratory_treatment',
        sessionId: sessionId.value
      });
      treatmentInstance.value = treatment;
    } catch (err) {
      console.warn('[Summary] Could not retrieve treatment:', err);
    }
    
  } catch (err) {
    console.error('[Summary] Failed to load session:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load session';
  } finally {
    isLoading.value = false;
  }
}

// ============================================
// AI Methods
// ============================================

async function buildExplainabilityFromAssessment() {
  if (!isAIEnabled('NOTE_SUMMARY') || !assessmentInstance.value) {
    explainabilityRecord.value = null;
    return;
  }

  try {
    const config = getAIConfig();
    const record = await buildExplainabilityModel(assessmentInstance.value, {
      sessionId: sessionId.value,
      useAI: config.enabled
    });
    explainabilityRecord.value = record;
  } catch (err) {
    console.warn('[Summary] Could not build explainability:', err);
    explainabilityRecord.value = null;
  }
}

async function generateDischargeSummary() {
  if (!explainabilityRecord.value) return;

  isGeneratingSummary.value = true;
  dischargeSummary.value = '';

  try {
    dischargeSummary.value = await askClinicalAI('NOTE_SUMMARY', explainabilityRecord.value);
  } catch (err) {
    console.error('[Summary] Failed to generate discharge summary:', err);
    toastComposable.add({
      title: 'AI Error',
      description: 'Failed to generate discharge summary. Please try again.',
      color: 'error'
    });
  } finally {
    isGeneratingSummary.value = false;
  }
}

async function generateHandoffReport() {
  if (!explainabilityRecord.value) return;

  isGeneratingHandoff.value = true;
  handoffReport.value = '';

  try {
    handoffReport.value = await askClinicalAI('CLINICAL_HANDOVER', explainabilityRecord.value);
  } catch (err) {
    console.error('[Summary] Failed to generate handoff report:', err);
    toastComposable.add({
      title: 'AI Error',
      description: 'Failed to generate handoff report. Please try again.',
      color: 'error'
    });
  } finally {
    isGeneratingHandoff.value = false;
  }
}

// ============================================
// Actions
// ============================================

async function confirmDischarge() {
  try {
    isSaving.value = true;
    
    // Save discharge notes to session
    if (session.value) {
      const existingNotes = session.value.notes ? JSON.parse(session.value.notes) : {};
      const updatedNotes = {
        ...existingNotes,
        discharge: {
          notes: dischargeNotes.value,
          disposition: dischargeDisposition.value,
          completedAt: new Date().toISOString()
        }
      };
      
      await updateSession(sessionId.value, {
        notes: JSON.stringify(updatedNotes)
      } as any);
    }
    
    // Complete the session
    await completeSession(sessionId.value, 'completed');
    
    toastComposable.add({ 
      title: 'Discharge Confirmed', 
      description: 'Patient has been successfully discharged',
      color: 'success' 
    });
    
    // Navigate to dashboard
    navigateTo('/dashboard');
  } catch (err) {
    console.error('[Summary] Failed to complete discharge:', err);
    toastComposable.add({ 
      title: 'Error', 
      description: 'Failed to complete discharge. Please try again.',
      color: 'error' 
    });
  } finally {
    isSaving.value = false;
  }
}

function navigateToRegistration() {
  navigateTo(`/sessions/${sessionId.value}`);
}

function navigateToAssessment() {
  navigateTo(`/sessions/${sessionId.value}/assessment`);
}

function navigateToTreatment() {
  navigateTo(`/sessions/${sessionId.value}/treatment`);
}

function goBack() {
  navigateTo(`/sessions/${sessionId.value}`);
}

// ============================================
// Lifecycle
// ============================================

onMounted(async () => {
  await loadSessionData();
  await buildExplainabilityFromAssessment();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <header class="mb-8">
      <div class="flex items-start justify-between gap-4 mb-6">
        <div class="flex-1">
          <!-- Back Button and Title -->
          <div class="flex items-center gap-3 mb-3">
            <button 
              @click="goBack"
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
                Discharge summary
              </p>
            </div>
          </div>

          <!-- Badges -->
          <div class="flex items-center gap-2 flex-wrap mt-4">
            <!-- Triage Badge -->
            <span 
              v-if="session?.triage"
              class="px-3 py-1.5 rounded-full text-sm font-medium border"
              :class="getTriageColorClass(session.triage)"
            >
              {{ triageConfig?.label || 'UNKNOWN' }}
            </span>
            
            <!-- Stage Badge -->
            <span 
              class="px-3 py-1.5 rounded-full text-sm font-medium border border-emerald-700/30 bg-emerald-900/30 text-emerald-400"
            >
              Discharge
            </span>
            
            <!-- Status Badge -->
            <span 
              v-if="isCompleted"
              class="px-3 py-1.5 rounded-full text-sm font-medium border border-blue-700/30 bg-blue-900/30 text-blue-400"
            >
              Completed
            </span>
          </div>
        </div>
      </div>

      <!-- Stage Navigation Tabs -->
      <div class="border-b border-gray-700 mb-6">
        <div class="flex gap-1 -mb-px">
          <button
            @click="navigateToRegistration"
            class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors text-gray-400 hover:text-white hover:bg-gray-800/50"
          >
            Registration
          </button>
          <button
            @click="navigateToAssessment"
            class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors text-gray-400 hover:text-white hover:bg-gray-800/50"
          >
            Assessment
          </button>
          <button
            @click="navigateToTreatment"
            class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors text-gray-400 hover:text-white hover:bg-gray-800/50"
          >
            Treatment
          </button>
          <button
            class="px-4 py-2 text-sm font-medium rounded-t-lg bg-gray-800 text-white border-b-2 border-emerald-500"
          >
            Discharge
          </button>
        </div>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-20">
      <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-emerald-500 mb-4"></div>
      <p class="text-white text-lg">Loading session summary...</p>
      <p class="text-gray-500 text-sm">Please wait while we prepare the discharge summary</p>
    </div>

    <!-- Error State -->
    <div
      v-else-if="error"
      class="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-xl flex flex-col items-center justify-center py-12"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-red-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="text-red-400 font-medium text-lg mb-2">{{ error }}</p>
      <button 
        @click="loadSessionData"
        class="mt-4 px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors"
      >
        Retry
      </button>
    </div>

    <!-- Main Content -->
    <div v-else-if="session" class="space-y-6">
      <!-- Patient Info Card -->
      <TWCard class="bg-gray-800 border-gray-700">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h2 class="text-lg font-semibold text-white">
              {{ patientInfo?.name || 'Unknown Patient' }}
            </h2>
            <p class="text-gray-400 text-sm">
              Session {{ session.id?.slice(7, 11) }} • {{ sessionAge }}
            </p>
          </div>
          <div class="flex gap-2">
            <button
              v-if="!linkedPatient"
              @click="openPatientLookup"
              class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Link Patient
            </button>
            <span v-else class="px-3 py-1.5 bg-green-900/30 text-green-400 text-sm rounded-lg border border-green-700/50">
              ✓ Patient Linked
            </span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p class="text-gray-500">Patient ID</p>
            <p class="text-white">{{ patientInfo?.patientId || 'N/A' }}</p>
          </div>
          <div>
            <p class="text-gray-500">Date of Birth</p>
            <p class="text-white">{{ patientInfo?.dateOfBirth || 'N/A' }}</p>
          </div>
          <div>
            <p class="text-gray-500">Gender</p>
            <p class="text-white">{{ patientInfo?.gender }}</p>
          </div>
          <div>
            <p class="text-gray-500">Triage</p>
            <TWBadge :color="triageConfig?.color || 'neutral'" :label="triageConfig?.label || 'UNKNOWN'" />
          </div>
        </div>

        <div v-if="patientInfo?.chiefComplaint" class="mt-4 pt-4 border-t border-gray-700">
          <p class="text-gray-500 text-sm mb-1">Chief Complaint</p>
          <p class="text-white">{{ patientInfo.chiefComplaint }}</p>
        </div>
      </TWCard>

      <!-- Assessment Summary -->
      <TWCard class="bg-gray-800 border-gray-700">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Assessment Summary
          </h3>
          <TWBadge 
            :color="assessmentData?.status === 'completed' ? 'success' : 'warning'" 
            :label="assessmentData?.status === 'completed' ? 'Completed' : 'In Progress'" 
          />
        </div>

        <div v-if="assessmentInstance" class="space-y-4">
          <!-- Assessment Data -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div v-if="assessmentData?.answers?.patient_age_months" class="bg-gray-700/50 rounded-lg p-3">
              <p class="text-gray-500 text-xs">Age</p>
              <p class="text-white font-medium">{{ assessmentData.answers.patient_age_months }} months</p>
            </div>
            <div v-if="assessmentData?.answers?.resp_rate" class="bg-gray-700/50 rounded-lg p-3">
              <p class="text-gray-500 text-xs">Resp. Rate</p>
              <p class="text-white font-medium">{{ assessmentData.answers.resp_rate }}/min</p>
            </div>
            <div v-if="assessmentData?.answers?.oxygen_sat" class="bg-gray-700/50 rounded-lg p-3">
              <p class="text-gray-500 text-xs">SpO2</p>
              <p class="text-white font-medium">{{ assessmentData.answers.oxygen_sat }}%</p>
            </div>
            <div v-if="assessmentData?.answers?.temperature" class="bg-gray-700/50 rounded-lg p-3">
              <p class="text-gray-500 text-xs">Temperature</p>
              <p class="text-white font-medium">{{ assessmentData.answers.temperature }}°C</p>
            </div>
          </div>

          <!-- Danger Signs -->
          <div v-if="assessmentData?.calculated?.hasDangerSign" class="bg-red-900/20 border border-red-700 rounded-lg p-3">
            <p class="text-red-400 font-medium flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Danger Signs Present
            </p>
            <p class="text-gray-400 text-sm mt-1">Patient requires urgent attention</p>
          </div>

          <!-- Fast Breathing -->
          <div v-if="assessmentData?.calculated?.fastBreathing" class="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3">
            <p class="text-yellow-400 font-medium flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Fast Breathing Detected
            </p>
          </div>

          <!-- Classification -->
          <div v-if="assessmentData?.calculated?.triagePriority" class="bg-gray-700/50 rounded-lg p-3">
            <p class="text-gray-500 text-xs mb-1">Classification</p>
            <p 
              class="font-medium"
              :class="{
                'text-red-400': assessmentData.calculated.triagePriority === 'red',
                'text-yellow-400': assessmentData.calculated.triagePriority === 'yellow',
                'text-green-400': assessmentData.calculated.triagePriority === 'green'
              }"
            >
              {{ assessmentData.calculated.triagePriority === 'red' ? 'URGENT REFERRAL' : 
                 assessmentData.calculated.triagePriority === 'yellow' ? 'NEEDS TREATMENT' : 'HOME CARE' }}
            </p>
          </div>
        </div>

        <div v-else class="text-gray-400 text-center py-4">
          No assessment data available
        </div>
      </TWCard>

      <!-- Treatment Summary -->
      <TWCard class="bg-gray-800 border-gray-700">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            Treatment Summary
          </h3>
          <TWBadge 
            :color="treatmentData?.status === 'complete' ? 'success' : 'warning'" 
            :label="treatmentData?.status === 'complete' ? 'Completed' : 'In Progress'" 
          />
        </div>

        <div v-if="treatmentInstance" class="space-y-4">
          <!-- Recommended Actions -->
          <div v-if="recommendedActions.length > 0">
            <p class="text-gray-500 text-sm mb-2">Recommended Actions</p>
            <div class="space-y-2">
              <div 
                v-for="(action, index) in recommendedActions" 
                :key="index"
                class="bg-gray-700/50 rounded-lg p-3 flex items-center gap-3"
              >
                <div 
                  class="w-6 h-6 rounded-full flex items-center justify-center text-sm"
                  :class="{
                    'bg-red-900/50 text-red-400': action === 'refer_hospital',
                    'bg-yellow-900/50 text-yellow-400': action === 'antibiotics',
                    'bg-green-900/50 text-green-400': action === 'home_care',
                    'bg-blue-900/50 text-blue-400': action === 'follow_up',
                    'bg-purple-900/50 text-purple-400': action === 'counseling'
                  }"
                >
                  <svg v-if="action === 'refer_hospital'" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                  <svg v-else-if="action === 'antibiotics'" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span class="text-white">{{ (action as string).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) }}</span>
              </div>
            </div>
          </div>

          <!-- Treatment Notes -->
          <div v-if="treatmentData?.answers?.treatment_notes" class="bg-gray-700/50 rounded-lg p-3">
            <p class="text-gray-500 text-xs mb-1">Treatment Notes</p>
            <p class="text-white">{{ treatmentData.answers.treatment_notes }}</p>
          </div>

          <!-- Completed At -->
          <div v-if="treatmentData?.completedAt" class="text-sm text-gray-400">
            Treatment completed: {{ formatDate(treatmentData.completedAt) }}
          </div>
        </div>

        <div v-else class="text-gray-400 text-center py-4">
          No treatment data available
        </div>
      </TWCard>

      <!-- Discharge Notes -->
      <TWCard class="bg-gray-800 border-gray-700">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Discharge Summary
        </h3>

        <div class="space-y-4">
          <!-- Discharge Disposition -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">
              Discharge Disposition <span class="text-red-400">*</span>
            </label>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                @click="dischargeDisposition = 'home'"
                class="px-4 py-3 rounded-lg text-sm font-medium transition-colors border"
                :class="dischargeDisposition === 'home' 
                  ? 'bg-green-900/30 border-green-600 text-green-400' 
                  : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'"
              >
                🏠 Home
              </button>
              <button
                type="button"
                @click="dischargeDisposition = 'referred'"
                class="px-4 py-3 rounded-lg text-sm font-medium transition-colors border"
                :class="dischargeDisposition === 'referred' 
                  ? 'bg-yellow-900/30 border-yellow-600 text-yellow-400' 
                  : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'"
              >
                🏥 Referred
              </button>
              <button
                type="button"
                @click="dischargeDisposition = 'transferred'"
                class="px-4 py-3 rounded-lg text-sm font-medium transition-colors border"
                :class="dischargeDisposition === 'transferred' 
                  ? 'bg-blue-900/30 border-blue-600 text-blue-400' 
                  : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'"
              >
                🚑 Transferred
              </button>
              <button
                type="button"
                @click="dischargeDisposition = 'deceased'"
                class="px-4 py-3 rounded-lg text-sm font-medium transition-colors border"
                :class="dischargeDisposition === 'deceased' 
                  ? 'bg-red-900/30 border-red-600 text-red-400' 
                  : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'"
              >
                ⚠️ Deceased
              </button>
            </div>
          </div>

          <!-- Discharge Notes -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">
              Discharge Notes
            </label>
            <textarea
              v-model="dischargeNotes"
              rows="4"
              class="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Enter any additional discharge notes, follow-up instructions, or observations..."
            ></textarea>
            <p class="text-xs text-gray-500 mt-1">
              Optional: Add any additional notes about the discharge process.
            </p>
          </div>

          <!-- AI Discharge Summary -->
          <div v-if="explainabilityRecord" class="mt-6 pt-6 border-t border-gray-700">
            <div class="flex items-center justify-between mb-4">
              <h4 class="text-md font-semibold text-white flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                AI Clinical Summary
              </h4>
              <div class="flex gap-2">
                <button
                  v-if="!dischargeSummary && !isGeneratingSummary"
                  @click="generateDischargeSummary"
                  class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate Summary
                </button>
                <button
                  v-if="!handoffReport && !isGeneratingHandoff"
                  @click="generateHandoffReport"
                  class="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  Generate Handoff
                </button>
              </div>
            </div>

            <!-- Loading States -->
            <div v-if="isGeneratingSummary || isGeneratingHandoff" class="flex items-center gap-3 text-gray-400 py-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{{ isGeneratingSummary ? 'Generating discharge summary...' : 'Generating handoff report...' }}</span>
            </div>

            <!-- Discharge Summary -->
            <div v-else-if="dischargeSummary" class="space-y-3">
              <div class="bg-gray-700/30 rounded-lg p-4 text-gray-300 text-sm leading-relaxed">
                {{ dischargeSummary }}
              </div>
              <p class="text-xs text-gray-500 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                AI-generated summary. Review for accuracy before use.
              </p>
            </div>

            <!-- Handoff Report -->
            <div v-else-if="handoffReport" class="space-y-3">
              <div class="bg-purple-900/20 border border-purple-700/50 rounded-lg p-4 text-gray-300 text-sm leading-relaxed">
                {{ handoffReport }}
              </div>
              <p class="text-xs text-gray-500 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                AI-generated handoff. Review for accuracy before use.
              </p>
            </div>

            <!-- Placeholder -->
            <div v-else class="text-gray-500 text-sm py-4">
              <p>Generate a clinical summary or handoff report using AI assistance.</p>
            </div>
          </div>
        </div>
      </TWCard>

      <!-- Discharge Actions -->
      <TWCard class="bg-gray-800 border-gray-700">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Discharge Actions
        </h3>

        <div class="space-y-4">
          <!-- Summary Confirmation -->
          <div class="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-4 mb-4">
            <p class="text-emerald-400 font-medium mb-2">Ready for Discharge</p>
            <p class="text-gray-300 text-sm">
              All clinical stages have been completed. Please review the summary above and confirm discharge to finalize this session.
            </p>
          </div>

          <!-- Action Buttons -->
          <div class="flex flex-col sm:flex-row gap-3">
            <TWButton
              color="success"
              size="lg"
              :loading="isSaving"
              :disabled="isSaving"
              @click="confirmDischarge"
              class="flex-1"
            >
              <template #prefix>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </template>
              Confirm Discharge
            </TWButton>
            
            <TWButton
              variant="ghost"
              color="gray"
              size="lg"
              @click="goBack"
              class="flex-1"
            >
              <template #prefix>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </template>
              Back to Session
            </TWButton>
          </div>
        </div>
      </TWCard>
    </div>

    <!-- Patient Lookup Modal -->
    <div
      v-if="showPatientLookup"
      class="fixed inset-0 z-50 overflow-y-auto"
      @click.self="closePatientLookup"
    >
      <div class="flex min-h-full items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/60" @click="closePatientLookup"></div>
        <div class="relative bg-gray-900 rounded-xl shadow-2xl max-w-lg w-full mx-auto">
          <!-- Modal Header -->
          <div class="flex items-center justify-between p-4 border-b border-gray-700">
            <h3 class="text-lg font-semibold text-white">Link Patient to Session</h3>
            <button
              @click="closePatientLookup"
              class="p-1 text-gray-400 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <!-- Modal Content -->
          <div class="p-4">
            <!-- Search Input -->
            <div class="flex gap-2 mb-4">
              <div class="relative flex-1">
                <input
                  v-model="patientQuery"
                  type="text"
                  placeholder="Enter CPT, name, or phone"
                  class="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  @keyup.enter="lookupPatientByCPT"
                  @input="handlePatientCPTInput"
                />
                <button
                  v-if="patientQuery"
                  @click="clearPatientQuery"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <button
                @click="lookupPatientByCPT"
                :disabled="isSearchingPatient"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <span v-if="isSearchingPatient">Searching...</span>
                <span v-else>Search</span>
              </button>
            </div>
            
            <!-- Search by CPT Button -->
            <div class="mb-4">
              <button
                @click="() => { setPatientMode('cpt'); patientQuery = ''; }"
                class="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                </svg>
                Enter CPT directly
              </button>
            </div>
            
            <!-- Results -->
            <div v-if="patientResults.length > 0" class="space-y-2 max-h-64 overflow-y-auto">
              <div
                v-for="patient in patientResults"
                :key="patient.cpt"
                @click="selectPatientFromLookup(patient)"
                class="flex items-center justify-between p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors"
              >
                <div>
                  <p class="text-white font-medium">{{ patient.firstName }} {{ patient.lastName }}</p>
                  <p class="text-gray-400 text-sm">{{ patient.cpt }}</p>
                </div>
                <button class="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors">
                  Select
                </button>
              </div>
            </div>
            
            <!-- No Results -->
            <div v-else-if="patientQuery && !isSearchingPatient" class="text-center py-8">
              <p class="text-gray-400 mb-4">No patients found</p>
              <button
                @click="registerNewPatient"
                class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
              >
                Register New Patient
              </button>
            </div>
            
            <!-- Initial State -->
            <div v-else class="text-center py-8">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-gray-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p class="text-gray-400">Enter a CPT, name, or phone number to search for a patient</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
