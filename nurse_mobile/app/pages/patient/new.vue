<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter, useRoute } from '#app';
import { usePatientRegistration } from '~/composables/usePatientRegistration';
import { generateCPT } from '~/services/patientId';
import { registerPatient, linkPatientToSession } from '~/services/patientEngine';
import { createSession, updateSession } from '~/services/sessionEngine';
import { setSessionPatient } from '~/composables/useSessionPatient';
import type { PatientRegistrationData } from '~/types/patient';

// ============================================
// Configuration
// ============================================

// Feature flag to enable/disable auto-session creation
const AUTO_SESSION_ENABLED = true;

// ============================================
// State
// ============================================

const router = useRouter();
const route = useRoute();
const toast = useToast();

// Loading states
const isRegistering = ref(false);
const isCreatingSession = ref(false);

// Session creation error state
const sessionCreationError = ref<string | null>(null);
const registeredPatientCPT = ref<string | null>(null);

const form = computed(() => patientReg.form);
const errors = computed(() => patientReg.errors);
const isSubmitting = computed(() => isRegistering.value || isCreatingSession.value);
const previewCPT = computed(() => patientReg.previewCPT.value);
const existingPatient = computed(() => patientReg.existingPatient.value);
const isValid = computed(() => patientReg.isValid.value);

const patientReg = usePatientRegistration();

// ============================================
// Computed
// ============================================

const today = computed(() => {
  return new Date().toISOString().split('T')[0];
});

const canSubmit = computed(() => {
  return form.value.firstName?.trim() && 
         form.value.lastName?.trim() &&
         !isSubmitting.value;
});

const submitButtonText = computed(() => {
  if (isRegistering.value) return 'Registering...';
  if (isCreatingSession.value) return 'Creating Session...';
  return 'Register Patient';
});

// ============================================
// Navigation
// ============================================

function goBack() {
  router.push('/dashboard');
}

function goToLookup() {
  // Create a new session first, then navigate to patient lookup within it
  createSessionAndNavigate();
}

/**
 * Create a new session and navigate to patient lookup
 * Patient lookup is session-bound, so we need a session context
 */
async function createSessionAndNavigate(): Promise<void> {
  try {
    const session = await createSession();
    router.push(`/sessions/${session.id}/patient-lookup`);
  } catch (error) {
    console.error('Failed to create session:', error);
    router.push('/sessions');
  }
}

// ============================================
// Session Creation
// ============================================

async function createSessionForPatient(cpt: string): Promise<string | null> {
  isCreatingSession.value = true;
  sessionCreationError.value = null;
  
  try {
    const session = await createSession(cpt);
    toast.add({
      title: 'Session Created',
      description: 'Redirecting to patient session...',
      color: 'success'
    });
    return session.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Session creation failed';
    sessionCreationError.value = message;
    
    console.error('[AutoSession] Failed to create session:', error);
    return null;
  } finally {
    isCreatingSession.value = false;
  }
}

async function retrySessionCreation() {
  if (!registeredPatientCPT.value) return;
  
  const sessionId = await createSessionForPatient(registeredPatientCPT.value);
  if (sessionId) {
    router.push(`/sessions/${sessionId}`);
  }
}

function proceedToPatientProfile() {
  if (registeredPatientCPT.value) {
    router.push(`/patient/${registeredPatientCPT.value}`);
  }
}

// ============================================
// Form Handlers
// ============================================

async function handleSubmit() {
  if (!isValid.value) {
    return;
  }

  // Reset error states
  sessionCreationError.value = null;
  registeredPatientCPT.value = null;

  try {
    // Prepare registration data - include optional weight
    // Handle both string and number types from form input
    const weightValue = form.value.weightKg;
    const parsedWeight = typeof weightValue === 'string' 
      ? parseFloat(weightValue) 
      : weightValue;
    const weightKg = weightValue && !isNaN(parsedWeight) ? parsedWeight : undefined;
    
    const data: PatientRegistrationData = {
      firstName: form.value.firstName?.trim() || '',
      lastName: form.value.lastName?.trim() || '',
      dateOfBirth: form.value.dateOfBirth || undefined,
      gender: form.value.gender || undefined,
      weightKg
    };

    // Register patient
    isRegistering.value = true;
    const patient = await registerPatient(data);
    registeredPatientCPT.value = patient.cpt;
    isRegistering.value = false;

    // Auto-create session if enabled (per NEWPATIENT_AUTOSESSION_FLOW spec)
    if (AUTO_SESSION_ENABLED) {
      const sessionId = await createSessionForPatient(patient.cpt);
      
      if (sessionId) {
        // Save patient data to sessionStorage for persistence
        setSessionPatient(sessionId, patient);
        
        // Update session with patientName for display
        const patientFullName = `${patient.firstName} ${patient.lastName}`.trim();
        await updateSession(sessionId, {
          patientId: patient.cpt,
          patientName: patientFullName,
          dateOfBirth: patient.dateOfBirth,
          gender: patient.gender
        });
        
        // Success - navigate to session
        router.push(`/sessions/${sessionId}`);
      } else {
        // Session creation failed but registration succeeded
        // Show error with retry options
        toast.add({
          title: 'Registration Complete',
          description: `Patient ${patient.cpt} registered. Session creation failed.`,
          color: 'warning'
        });
      }
    } else {
      // Auto-session disabled - navigate to patient profile
      toast.add({
        title: 'Patient Registered',
        description: `Patient created with CPT: ${patient.cpt}`,
        color: 'success'
      });
      router.push(`/patient/${patient.cpt}`);
    }

  } catch (error) {
    isRegistering.value = false;
    isCreatingSession.value = false;
    
    const message = error instanceof Error ? error.message : 'Registration failed';
    errors.value.general = message;
    
    toast.add({
      title: 'Registration Failed',
      description: message,
      color: 'error'
    });
  }
}

function handleReset() {
  patientReg.resetForm();
  generateNewCPT();
  // Reset error states
  sessionCreationError.value = null;
  registeredPatientCPT.value = null;
}

function handleCancel() {
  if (confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
    goBack();
  }
}

// ============================================
// Validation Handlers
// ============================================

function handleFirstNameBlur() {
  errors.value.firstName = patientReg.validateField('firstName');
}

function handleLastNameBlur() {
  errors.value.lastName = patientReg.validateField('lastName');
}

function handleInput(field: 'firstName' | 'lastName') {
  patientReg.clearError(field);
}

// ============================================
// Lifecycle
// ============================================

onMounted(async () => {
  // Initialize preview CPT
  await generateNewCPT();
});

// ============================================
// Utility Functions
// ============================================

// Generate new preview CPT
async function generateNewCPT() {
  const newCPT = generateCPT();
  patientReg.previewCPT.value = newCPT;
  return newCPT;
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4">
    <!-- Header -->
    <header class="mb-6">
      <button 
        @click="goBack"
        class="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Dashboard
      </button>
      
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">New Patient</h1>
          <p class="text-gray-400">Register a new patient with a unique CPT</p>
        </div>
        
        <!-- CPT Preview Badge -->
        <div v-if="previewCPT" class="bg-blue-900/50 border border-blue-700 rounded-lg px-4 py-2">
          <span class="text-blue-400 text-xs uppercase tracking-wide">Patient ID</span>
          <p class="text-white font-mono font-bold text-lg">{{ previewCPT }}</p>
        </div>
      </div>
    </header>

    <!-- Quick Lookup Link -->
    <div class="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
      <p class="text-gray-400 text-sm">
        Already have a patient CPT? 
        <button @click="goToLookup" class="text-blue-400 hover:text-blue-300 underline">
          Look up existing patient
        </button>
      </p>
    </div>

    <!-- Session Creation Error Alert -->
    <div v-if="sessionCreationError" class="mb-6 p-4 bg-yellow-900/20 border border-yellow-700 rounded-xl">
      <div class="flex items-start gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div class="flex-1">
          <h3 class="text-yellow-400 font-medium">Session Creation Failed</h3>
          <p class="text-gray-300 text-sm mt-1">{{ sessionCreationError }}</p>
          <p class="text-gray-400 text-xs mt-2">
            Patient {{ registeredPatientCPT }} was registered successfully. 
            Would you like to retry creating a session or view the patient profile?
          </p>
          <div class="flex gap-3 mt-3">
            <button
              @click="retrySessionCreation"
              :disabled="isCreatingSession"
              class="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <svg v-if="isCreatingSession" class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ isCreatingSession ? 'Creating...' : 'Retry Session' }}
            </button>
            <button
              @click="proceedToPatientProfile"
              class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg font-medium transition-colors"
            >
              View Patient
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Form -->
    <form @submit.prevent="handleSubmit">
      <!-- Required Information Card -->
      <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <!-- Card Header -->
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-full bg-blue-900/30 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 class="text-white font-semibold text-lg">Patient Information</h2>
        </div>

        <div class="space-y-6">
          <!-- Name Fields -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="form-group">
              <label for="firstName" class="block text-gray-300 text-sm font-medium mb-2">
                First Name <span class="text-red-400">*</span>
              </label>
              <input
                id="firstName"
                v-model="form.firstName"
                type="text"
                class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                :class="{ 'border-red-500': errors.firstName }"
                placeholder="Enter first name"
                @input="handleInput('firstName')"
                @blur="handleFirstNameBlur"
              />
              <span v-if="errors.firstName" class="text-red-400 text-xs mt-2 block">{{ errors.firstName }}</span>
            </div>

            <div class="form-group">
              <label for="lastName" class="block text-gray-300 text-sm font-medium mb-2">
                Last Name <span class="text-red-400">*</span>
              </label>
              <input
                id="lastName"
                v-model="form.lastName"
                type="text"
                class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                :class="{ 'border-red-500': errors.lastName }"
                placeholder="Enter last name"
                @input="handleInput('lastName')"
                @blur="handleLastNameBlur"
              />
              <span v-if="errors.lastName" class="text-red-400 text-xs mt-2 block">{{ errors.lastName }}</span>
            </div>
          </div>

          <!-- DOB, Gender and Weight -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="form-group">
              <label for="dateOfBirth" class="block text-gray-300 text-sm font-medium mb-2">
                Date of Birth
              </label>
              <input
                id="dateOfBirth"
                v-model="form.dateOfBirth"
                type="date"
                class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                :max="today"
              />
            </div>

            <div class="form-group">
              <label for="gender" class="block text-gray-300 text-sm font-medium mb-2">
                Gender
              </label>
              <select
                id="gender"
                v-model="form.gender"
                class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors appearance-none"
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div class="form-group">
              <label for="weightKg" class="block text-gray-300 text-sm font-medium mb-2">
                Weight <span class="text-gray-500 text-xs">(Optional)</span>
              </label>
              <div class="relative">
                <input
                  id="weightKg"
                  v-model="form.weightKg"
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="500"
                  class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors pr-12"
                  placeholder="e.g., 12.5"
                />
                <span class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">kg</span>
              </div>
              <p class="text-gray-500 text-xs mt-1">Enter weight in kilograms (0.5 - 500 kg)</p>
            </div>
          </div>
        </div>
      </div>

      <!-- General Error -->
      <div v-if="errors.general" class="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-xl flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-red-400 text-sm">{{ errors.general }}</p>
      </div>

      <!-- Form Actions -->
      <div class="flex flex-col md:flex-row gap-4 pt-4">
        <button
          type="button"
          @click="handleCancel"
          :disabled="isSubmitting"
          class="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
        >
          Cancel
        </button>

        <button
          type="button"
          @click="handleReset"
          :disabled="isSubmitting"
          class="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
        >
          Reset
        </button>

        <button
          type="submit"
          :disabled="!canSubmit || isSubmitting"
          class="flex-1 px-6 py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          <svg 
            v-if="isSubmitting"
            xmlns="http://www.w3.org/2000/svg" 
            class="h-5 w-5 animate-spin" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>{{ submitButtonText }}</span>
        </button>
      </div>
    </form>
  </div>
</template>
