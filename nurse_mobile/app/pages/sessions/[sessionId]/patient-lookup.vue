
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from '#app';
import { useSessionPatient } from '~/composables/useSessionPatient';
import { getPatientByCPT, getRecentPatients, linkPatientToSession as engineLinkPatient } from '~/services/patientEngine';
import { isValidCpt, normalizeCpt } from '~/services/cptService';
import type { ClinicalPatient } from '~/types/patient';
import TWCard from '~/components/ui/TWCard.vue';
import TWButton from '~/components/ui/TWButton.vue';
import TWIcon from '~/components/ui/TWIcon.vue';
import TWAlert from '~/components/ui/TWAlert.vue';

// ============================================
// Route & Router
// ============================================

const route = useRoute();
const router = useRouter();
const sessionId = computed(() => route.params.sessionId as string);
const sessionIdShort = computed(() => sessionId.value.slice(7, 11));

// ============================================
// Composables
// ============================================

const { patientData: persistedPatient, savePatient: savePersistedPatient } = useSessionPatient({
  sessionId,
  autoHydrate: true
});

// ============================================
// State
// ============================================

const cptInput = ref('');
const newPatientCpt = ref('');
const foundPatient = ref<ClinicalPatient | null>(null);
const recentPatients = ref<ClinicalPatient[]>([]);
const isLoadingPatient = ref(false);
const isLinking = ref(false);
const notFound = ref(false);
const showRegistrationPrompt = ref(false);
const error = ref<string | null>(null);
const errorDetails = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const isLoading = ref(false);
const loadingMessage = ref('Loading...');

// ============================================
// Computed
// ============================================

const canLookup = computed(() => {
  const normalized = normalizeCpt(cptInput.value);
  return normalized !== null;
});

const isValidCptFormat = computed(() => {
  if (cptInput.value.length === 0) return true;
  return isValidCpt(cptInput.value);
});

const errorTitle = computed(() => 'Error');

// ============================================
// Lifecycle
// ============================================

onMounted(async () => {
  await loadRecentPatients();
  checkForPersistedPatient();
});

// ============================================
// Methods
// ============================================

/**
 * Load recent patients from cache
 */
async function loadRecentPatients(): Promise<void> {
  try {
    recentPatients.value = getRecentPatients();
  } catch (err) {
    console.error('Failed to load recent patients:', err);
    recentPatients.value = [];
  }
}

/**
 * Check if there's a persisted patient from session
 */
function checkForPersistedPatient(): void {
  if (persistedPatient.value?.patientCpt) {
    cptInput.value = persistedPatient.value.patientCpt;
  }
}

/**
 * Handle CPT input with validation
 */
function handleCptInput(): void {
  // Auto-uppercase and normalize
  let formatted = cptInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  cptInput.value = formatted;

  // Clear previous results
  foundPatient.value = null;
  notFound.value = false;
  error.value = null;

  // Auto-lookup when complete
  if (formatted.length === 4 && isValidCpt(formatted)) {
    lookupPatient();
  }
}

/**
 * Clear CPT input and results
 */
function clearCptInput(): void {
  cptInput.value = '';
  foundPatient.value = null;
  notFound.value = false;
  error.value = null;
  errorDetails.value = null;
}

/**
 * Clear found patient
 */
function clearFoundPatient(): void {
  foundPatient.value = null;
  notFound.value = false;
}

/**
 * Lookup patient by CPT
 */
async function lookupPatient(): Promise<void> {
  const normalized = normalizeCpt(cptInput.value);
  if (!normalized) {
    error.value = 'Invalid CPT format';
    return;
  }

  isLoadingPatient.value = true;
  notFound.value = false;
  error.value = null;

  try {
    const result = await getPatientByCPT(normalized);

    if (result.found && result.patient) {
      foundPatient.value = result.patient;
      notFound.value = false;
    } else {
      foundPatient.value = null;
      notFound.value = true;
    }
  } catch (err) {
    console.error('Patient lookup failed:', err);
    error.value = 'Failed to lookup patient';
    errorDetails.value = err instanceof Error ? err.message : 'Unknown error';
    foundPatient.value = null;
    notFound.value = false;
  } finally {
    isLoadingPatient.value = false;
  }
}

/**
 * Select a recent patient
 */
async function selectRecentPatient(patient: ClinicalPatient): Promise<void> {
  cptInput.value = patient.cpt;
  foundPatient.value = patient;
  notFound.value = false;
}

/**
 * Link found patient to current session
 */
async function linkPatientToSession(): Promise<void> {
  if (!foundPatient.value || !sessionId.value) return;

  isLinking.value = true;
  error.value = null;

  try {
    // Save to session persistence
    savePersistedPatient(foundPatient.value);

    // Link to session in database
    await engineLinkPatient(sessionId.value, foundPatient.value.cpt);

    // Update session with patientCpt
    const { updateSession } = await import('~/services/sessionEngine');
    await updateSession(sessionId.value, {
      patientCpt: foundPatient.value.cpt,
      patientId: foundPatient.value.cpt,
      patientName: `${foundPatient.value.firstName} ${foundPatient.value.lastName}`.trim(),
      dateOfBirth: foundPatient.value.dateOfBirth,
      gender: foundPatient.value.gender
    });

    showSuccess(`${getPatientFullName(foundPatient.value)} linked to session`);
    
    // Navigate back to session after brief delay
    setTimeout(() => {
      router.push(`/sessions/${sessionId.value}`);
    }, 1500);
  } catch (err) {
    console.error('Failed to link patient:', err);
    error.value = 'Failed to link patient to session';
    errorDetails.value = err instanceof Error ? err.message : 'Unknown error';
  } finally {
    isLinking.value = false;
  }
}

/**
 * View patient record
 */
function viewPatientRecord(): void {
  if (!foundPatient.value) return;
  router.push(`/records/${foundPatient.value.cpt}`);
}

/**
 * Register new patient with entered CPT
 */
function registerWithCpt(): void {
  const cpt = normalizeCpt(cptInput.value);
  if (cpt) {
    newPatientCpt.value = cpt;
  }
  showRegistrationPrompt.value = true;
}

/**
 * Proceed to registration page
 */
function proceedToRegistration(): void {
  showRegistrationPrompt.value = false;
  const cptParam = newPatientCpt.value ? `?cpt=${newPatientCpt.value}` : '';
  router.push(`/sessions/${sessionId.value}/registration${cptParam}`);
}

/**
 * Handle back navigation
 */
function handleBack(): void {
  router.push(`/sessions/${sessionId.value}`);
}

/**
 * Clear error
 */
function clearError(): void {
  error.value = null;
  errorDetails.value = null;
}

/**
 * Show success message
 */
function showSuccess(message: string): void {
  successMessage.value = message;
  setTimeout(() => {
    successMessage.value = null;
  }, 3000);
}

// ============================================
// Utility Functions
// ============================================

function getPatientFullName(patient: ClinicalPatient): string {
  return `${patient.firstName} ${patient.lastName}`.trim();
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-CA');
  } catch {
    return dateStr;
  }
}

function calculateAge(dateOfBirth: string): number {
  try {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  } catch {
    return 0;
  }
}
</script>
<template>
  <div class="min-h-screen bg-gray-900 p-4 sm:p-6">
    <!-- Loading Overlay -->
    <div v-if="isLoading" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div class="bg-gray-800 rounded-xl p-8 text-center max-w-sm w-full mx-4">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p class="text-white text-lg">{{ loadingMessage }}</p>
        <p class="text-gray-400 text-sm mt-2">Please wait...</p>
      </div>
    </div>

    <!-- Error Alert -->
    <div
      v-if="error"
      class="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-xl flex items-center justify-between"
    >
      <div class="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <p class="text-red-400 font-medium">{{ errorTitle }}</p>
          <p class="text-red-300 text-sm">{{ error }}</p>
        </div>
      </div>
      <button 
        @click="clearError"
        class="p-1 text-red-400 hover:text-red-300"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Success Toast -->
    <div
      v-if="successMessage"
      class="fixed top-4 right-4 bg-green-900/30 border border-green-700 rounded-xl p-4 flex items-center gap-3 z-50 animate-fade-in"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
      <span class="text-green-400">{{ successMessage }}</span>
    </div>

    <!-- Main Content -->
    <div class="max-w-2xl mx-auto">
      <!-- Header -->
      <header class="mb-8">
        <button 
          @click="handleBack"
          class="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Session
        </button>
        
        <div>
          <h1 class="text-2xl font-bold text-white">Patient Lookup</h1>
          <p class="text-gray-400">Find or register a patient using their 4-character CPT code</p>
        </div>
      </header>

      <!-- CPT Input Card -->
      <div class="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
        <!-- Card Header -->
        <div class="flex items-center gap-3 mb-6 pb-4 border-b border-gray-700">
          <div class="w-10 h-10 rounded-full bg-blue-900/30 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
            </svg>
          </div>
          <h2 class="text-white font-semibold text-lg">Enter Patient CPT</h2>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-gray-300 text-sm font-medium mb-2">4-Character CPT Code</label>
            <div class="relative">
              <input
                v-model="cptInput"
                v-cpt-format
                type="text"
                inputmode="text"
                maxlength="4"
                placeholder="ABCD"
                class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center font-mono text-lg tracking-widest transition-colors"
                :class="{
                  'border-green-500': isValidCptFormat && !isLoadingPatient,
                  'border-red-500': cptInput.length > 0 && !isValidCptFormat,
                  'border-blue-500': isLoadingPatient
                }"
                :disabled="isLoadingPatient"
                @input="handleCptInput"
                @keyup.enter="lookupPatient"
              />
              <div v-if="isLoadingPatient" class="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              </div>
              <button
                v-else-if="cptInput.length > 0"
                @click="clearCptInput"
                class="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <svg 
                v-else
                xmlns="http://www.w3.org/2000/svg" 
                class="h-5 w-5 text-gray-500 absolute right-3 top-1/2 transform -translate-y-1/2" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p class="text-gray-500 text-sm mt-2">
              Enter the 4-character CPT code assigned to the patient during registration
            </p>
            <p v-if="cptInput.length > 0 && !isValidCptFormat" class="text-red-400 text-sm mt-2 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Invalid CPT format. Use 4 alphanumeric characters (A-Z, 2-9).
            </p>
          </div>

          <div class="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              @click="lookupPatient"
              :disabled="!canLookup || isLoadingPatient"
              class="flex-1 px-6 py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg 
                v-if="isLoadingPatient"
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
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Lookup Patient
            </button>
            <button
              @click="showRegistrationPrompt = true"
              :disabled="isLoadingPatient"
              class="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Register New Patient
            </button>
          </div>
        </div>
      </div>

      <!-- Patient Found Result -->
      <Transition name="fade-slide">
        <div v-if="foundPatient" class="bg-gray-800 rounded-xl p-6 mb-6 border border-green-700/30">
          <!-- Result Header -->
          <div class="flex items-center gap-3 mb-6 pb-4 border-b border-gray-700">
            <div class="w-10 h-10 rounded-full bg-green-900/30 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h2 class="text-white font-semibold text-lg">Patient Found</h2>
              <p class="text-gray-400 text-sm">CPT: {{ foundPatient.cpt }}</p>
            </div>
          </div>

          <!-- Patient Info -->
          <div class="flex items-start gap-4 mb-6">
            <div class="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div class="flex-1">
              <h3 class="text-white font-semibold text-lg mb-2">{{ getPatientFullName(foundPatient) }}</h3>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <p class="text-gray-400 text-sm">CPT</p>
                  <p class="text-white font-mono">{{ foundPatient.cpt }}</p>
                </div>
                <div v-if="foundPatient.dateOfBirth">
                  <p class="text-gray-400 text-sm">DOB</p>
                  <p class="text-white">{{ formatDate(foundPatient.dateOfBirth) }}</p>
                </div>
                <div v-if="foundPatient.gender">
                  <p class="text-gray-400 text-sm">Gender</p>
                  <p class="text-white capitalize">{{ foundPatient.gender }}</p>
                </div>
                <div v-if="foundPatient.phone">
                  <p class="text-gray-400 text-sm">Phone</p>
                  <p class="text-white">{{ foundPatient.phone }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex flex-col sm:flex-row gap-3">
            <button
              @click="linkPatientToSession"
              :disabled="isLinking"
              class="flex-1 px-6 py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg 
                v-if="isLinking"
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
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Link to Session {{ sessionIdShort }}
            </button>
            <button
              @click="viewPatientRecord"
              class="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              View Record
            </button>
            <button
              @click="clearFoundPatient"
              class="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
          </div>
        </div>
      </Transition>

      <!-- Patient Not Found Result -->
      <Transition name="fade-slide">
        <div v-if="notFound && !isLoadingPatient && cptInput.length > 0" class="bg-gray-800 rounded-xl p-6 mb-6 border border-yellow-700/30">
          <div class="flex items-start gap-3 mb-4">
            <div class="w-10 h-10 rounded-full bg-yellow-900/30 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 class="text-yellow-400 font-semibold mb-1">Patient Not Found</h3>
              <p class="text-gray-400">No patient found with CPT: <code class="bg-gray-700 px-2 py-1 rounded text-white">{{ cptInput }}</code></p>
            </div>
          </div>
          
          <div class="pt-4 border-t border-gray-700">
            <p class="text-gray-400 mb-4">Would you like to register this patient?</p>
            <div class="flex flex-col sm:flex-row gap-3">
              <button
                @click="registerWithCpt"
                class="flex-1 px-6 py-3 bg-blue-700 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Register {{ cptInput }}
              </button>
              <button
                @click="clearCptInput"
                class="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Clear & Try Again
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Recent Patients Section -->
      <div v-if="recentPatients.length > 0 && !foundPatient && !notFound" class="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <!-- Section Header -->
        <div class="flex items-center gap-3 mb-6 pb-4 border-b border-gray-700">
          <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 class="text-white font-semibold text-lg">Recent Patients</h2>
        </div>

        <div class="space-y-3">
          <div
            v-for="patient in recentPatients"
            :key="patient.cpt"
            @click="selectRecentPatient(patient)"
            class="p-4 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg cursor-pointer transition-colors group"
          >
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div class="flex-1">
                <div class="flex items-center justify-between">
                  <h4 class="text-white font-medium group-hover:text-blue-400 transition-colors">
                    {{ getPatientFullName(patient) }}
                  </h4>
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <div class="flex items-center gap-3 mt-1 text-sm">
                  <code class="bg-gray-800 px-2 py-1 rounded text-gray-300">{{ patient.cpt }}</code>
                  <span v-if="patient.dateOfBirth" class="text-gray-400 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {{ calculateAge(patient.dateOfBirth) }}y
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Registration Prompt Modal -->
    <div v-if="showRegistrationPrompt" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
        <!-- Modal Header -->
        <div class="flex items-center gap-3 mb-6 pb-4 border-b border-gray-700">
          <div class="w-10 h-10 rounded-full bg-blue-900/30 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <div class="flex-1">
            <h2 class="text-white font-semibold text-lg">Register New Patient</h2>
            <p class="text-gray-400 text-sm">Create a new patient record</p>
          </div>
          <button 
            @click="showRegistrationPrompt = false"
            class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Modal Body -->
        <div class="mb-6">
          <p class="text-gray-400 mb-4">Enter a new CPT code for the patient or leave blank to auto-generate:</p>
          <div class="space-y-2">
            <label class="block text-gray-300 text-sm font-medium">New Patient CPT (optional)</label>
            <input
              v-model="newPatientCpt"
              v-cpt-format
              type="text"
              inputmode="text"
              maxlength="4"
              placeholder="Auto-generate"
              class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center font-mono text-lg tracking-widest"
              :class="{ 'border-green-500': newPatientCpt.length === 4 && isValidCpt(newPatientCpt) }"
            />
            <p v-if="newPatientCpt.length > 0 && !isValidCpt(newPatientCpt)" class="text-red-400 text-sm">
              Invalid CPT format
            </p>
          </div>
        </div>

        <!-- Modal Actions -->
        <div class="flex gap-3">
          <button
            @click="showRegistrationPrompt = false"
            class="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            @click="proceedToRegistration"
            :disabled="newPatientCpt.length > 0 && !isValidCpt(newPatientCpt)"
            class="flex-1 px-6 py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            Continue to Registration
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.animate-fade-in {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>