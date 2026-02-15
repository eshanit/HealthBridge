<script setup lang="ts">
import { onMounted, computed, onUnmounted, ref, h } from 'vue';
import { formatDistanceToNow, format } from 'date-fns';
import { useAuth } from '@/composables/useAuth';
import { useSecurityStore } from '@/stores/security';
import { useDashboardStore, type DashboardState } from '@/stores/dashboard';
import { getPatientByCPT } from '~/services/patientEngine';
import { sanitizeCPTInput, validateCPTFormat, validateShortCPTFormat } from '~/services/patientId';
import { isValidCpt } from '~/services/cptService';
import type { ClinicalPatient } from '~/types/patient';
import PatientSummaryCard from '~/components/patient/PatientSummaryCard.vue';

const auth = useAuth();
const securityStore = useSecurityStore();
const dashboardStore = useDashboardStore();

// ----- Icon Component Mapping -----
const iconComponents: Record<string, any> = {
  'i-heroicons-lock-closed': {
    render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-5 w-5', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' })
    ])
  },
  'i-heroicons-check-circle': {
    render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-5 w-5', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' })
    ])
  },
  'i-heroicons-user-plus': {
    render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-5 w-5', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z' })
    ])
  },
  'i-heroicons-magnifying-glass': {
    render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-5 w-5', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' })
    ])
  },
  'i-heroicons-qr-code': {
    render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-5 w-5', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z' })
    ])
  }
};

function getHeaderBadgeIcon(iconName: string) {
  return iconComponents[iconName] || null;
}

// ----- Auth & Security -----
const isAuthenticated = computed(() => auth.isAuthenticated.value);
const nurseName = computed(() => auth.nurseName.value || 'Nurse');

// ----- State Machine UI Bindings -----
const currentState = computed(() => dashboardStore.state);
const headerBadge = computed(() => dashboardStore.headerBadge);
const bannerMessage = computed(() => dashboardStore.bannerMessage);
const isReady = computed(() => dashboardStore.isReady);
const isOffline = computed(() => dashboardStore.isOffline);
const isSyncing = computed(() => dashboardStore.isSyncing);
const isError = computed(() => dashboardStore.isError);

// ----- Dashboard Data -----
const hasDraft = computed(() => dashboardStore.hasDraft);
const draftMeta = computed(() => dashboardStore.draftMeta);
const stats = computed(() => dashboardStore.stats);
const recent = computed(() => dashboardStore.recent);

// ----- Patient Lookup State -----
const cptInput = ref('');
const isLookingUpPatient = ref(false);
const lookupError = ref<string | null>(null);
const foundPatient = ref<ClinicalPatient | null>(null);

// ----- Stats Color Classes -----
const redStatsClass = computed(() => stats.value.red > 0 ? 'bg-red-500' : 'bg-gray-600');
const yellowStatsClass = computed(() => stats.value.yellow > 0 ? 'bg-yellow-500' : 'bg-gray-600');
const greenStatsClass = computed(() => stats.value.green > 0 ? 'bg-green-500' : 'bg-gray-600');

// ----- Network Monitoring -----
let onlineStatus = true;

function handleOnline() {
  if (!onlineStatus) {
    onlineStatus = true;
    dashboardStore.handleNetworkChange(true);
  }
}

function handleOffline() {
  if (onlineStatus) {
    onlineStatus = false;
    dashboardStore.handleNetworkChange(false);
  }
}

// ----- PIN Entry State -----
const showPinModal = ref(false);
const pinEntry = ref('');
const pinError = ref('');
const isVerifyingPin = ref(false);
const pinEntryError = ref<boolean>(false);

// ----- Security Actions -----
async function verifyTestRecord() {
  testRecordStatus.value = 'pending';
  
  if (securityStore.needsPinToUnlock()) {
    showPinModal.value = true;
    pinEntryError.value = true;
    testRecordStatus.value = 'failed';
    return;
  }
  
  try {
    const isValid = await securityStore.verifyEncryptedTestRecord();
    if (isValid) {
      testRecordStatus.value = 'success';
      dashboardStore.transitionToReady();
      await dashboardStore.loadDashboard();
      
      if (!navigator.onLine) {
        dashboardStore.transitionToOffline();
      }
    } else {
      testRecordStatus.value = 'not_created';
    }
  } catch (error) {
    console.error('[Dashboard] Test record verification failed:', error);
    
    if (securityStore.needsPinToUnlock()) {
      showPinModal.value = true;
      pinEntryError.value = true;
    }
    testRecordStatus.value = 'failed';
  }
}

const testRecordStatus = ref<'pending' | 'success' | 'failed' | 'not_created'>('pending');
const isCreatingTestRecord = ref(false);

const needsTestRecord = computed(() => testRecordStatus.value === 'not_created' || testRecordStatus.value === 'failed');

async function createTestRecord() {
  isCreatingTestRecord.value = true;
  try {
    await securityStore.createEncryptedTestRecord();
    await verifyTestRecord();
  } finally {
    isCreatingTestRecord.value = false;
  }
}

// ----- PIN Entry Actions -----
function closePinModal() {
  showPinModal.value = false;
  pinEntry.value = '';
  pinError.value = '';
  pinEntryError.value = false;
}

async function submitPin() {
  if (pinEntry.value.length !== 4 || isVerifyingPin.value) {
    return;
  }
  
  isVerifyingPin.value = true;
  pinError.value = '';
  
  try {
    const unlocked = await securityStore.unlockWithPin(pinEntry.value);
    if (unlocked) {
      closePinModal();
      await verifyTestRecord();
    } else {
      pinError.value = 'Invalid PIN';
      pinEntry.value = '';
    }
  } catch (error) {
    console.error('[Dashboard] PIN unlock failed:', error);
    pinError.value = 'Failed to unlock. Please try again.';
  } finally {
    isVerifyingPin.value = false;
  }
}

function handlePinInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const value = input.value.replace(/\D/g, '').slice(0, 4);
  pinEntry.value = value;
  input.value = value;
  
  if (value.length === 4) {
    submitPin();
  }
}

// ----- Lifecycle -----
onMounted(async () => {
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  onlineStatus = navigator.onLine;

  if (!isAuthenticated.value) {
    navigateTo('/');
    return;
  }

  dashboardStore.transitionToUnlocking();
  await verifyTestRecord();
});

onUnmounted(() => {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
});

// ============================================
// PATIENT-FIRST ACTIONS
// ============================================

/**
 * Navigate to new patient registration
 */
function navigateToNewPatient() {
  navigateTo('/patient/new');
}

/**
 * Navigate to patient lookup via new session
 * Patient lookup is session-bound, so we create a session first
 */
async function navigateToPatientLookup() {
  try {
    // Create a new session first
    const { createSession } = await import('~/services/sessionEngine');
    const session = await createSession();
    
    // Navigate to patient lookup within the new session
    navigateTo(`/sessions/${session.id}/patient-lookup`);
  } catch (error) {
    console.error('Failed to create session for patient lookup:', error);
    // Fallback to sessions list
    navigateTo('/sessions');
  }
}

/**
 * Navigate to patient record
 */
function navigateToPatientRecord() {
  if (foundPatient.value) {
    navigateTo(`/patient/${foundPatient.value.cpt}`);
  }
}

/**
 * Handle patient lookup by CPT (supports 4-character format)
 */
async function handleCPTLookup() {
  if (!cptInput.value.trim()) {
    lookupError.value = 'Please enter a CPT';
    return;
  }
  
  // Sanitize CPT input
  const sanitized = cptInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Validate 4-character format
  if (!isValidCpt(sanitized) || sanitized.length !== 4) {
    lookupError.value = 'Invalid CPT format. Use 4 characters (A-Z, 2-9)';
    return;
  }
  
  isLookingUpPatient.value = true;
  lookupError.value = null;
  foundPatient.value = null;
  
  try {
    const result = await getPatientByCPT(sanitized);
    
    if (result.found && result.patient) {
      // Patient found - store and show summary
      foundPatient.value = result.patient;
    } else {
      lookupError.value = 'Patient not found. Would you like to register this patient?';
    }
  } catch (error) {
    console.error('[Dashboard] Patient lookup failed:', error);
    lookupError.value = 'Failed to lookup patient. Please try again.';
  } finally {
    isLookingUpPatient.value = false;
  }
}

/**
 * Start a new visit for found patient
 */
function startNewVisit() {
  if (foundPatient.value) {
    navigateTo(`/sessions/new?patientCpt=${foundPatient.value.cpt}`);
  }
}

/**
 * Clear found patient
 */
function clearFoundPatient() {
  foundPatient.value = null;
  cptInput.value = '';
  lookupError.value = null;
}

/**
 * Handle CPT input change - auto-uppercase and validate
 */
function handleCPTInputChange() {
  lookupError.value = null;
  foundPatient.value = null;
  
  // Auto-uppercase and filter invalid characters
  cptInput.value = cptInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

/**
 * Navigate to sessions list
 */
function handleOpenSessions() {
  navigateTo('/sessions');
}

/**
 * Navigate to patient records with optional triage filter
 */
function handleViewRecords(triage?: 'urgent' | 'attention' | 'stable') {
  if (triage) {
    navigateTo(`/records?filter=${triage}`);
  } else {
    navigateTo('/records');
  }
}

/**
 * Handle sync
 */
function handleSync() {
  if (dashboardStore.isReady || dashboardStore.isOffline) {
    dashboardStore.transitionToSyncing();
    setTimeout(() => {
      dashboardStore.handleSyncComplete();
    }, 2000);
  }
}

/**
 * Handle logout
 */
function handleLogout() {
  dashboardStore.transitionToLocked();
  auth.logout();
  navigateTo('/');
}

/**
 * Navigate to draft assessment (null-safe)
 */
function navigateToDraft() {
  if (draftMeta.value) {
    navigateTo(`/assessment/${draftMeta.value.workflow}/edit`);
  }
}

/**
 * Navigate to session detail (null-safe)
 */
function navigateToSession(sessionId?: string) {
  if (sessionId) {
    navigateTo(`/sessions/${sessionId}`);
  }
}

// ============================================
// FORMATTING HELPERS
// ============================================

function formatTimeAgo(timestamp: string | undefined): string {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Unknown';
  return formatDistanceToNow(date, { addSuffix: true });
}

function formatDate(date: string | undefined): string {
  if (!date) return 'Invalid Date';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Date';
  return format(d, 'MMM d, yyyy');
}

function getStateColor(state: DashboardState): string {
  switch (state) {
    case 'LOCKED': return 'bg-gray-500';
    case 'UNLOCKING': return 'bg-yellow-500';
    case 'READY': return 'bg-green-500';
    case 'OFFLINE': return 'bg-orange-500';
    case 'SYNCING': return 'bg-blue-500';
    case 'ERROR': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4">
    <!-- State Banner -->
    <div 
      v-if="bannerMessage"
      class="mb-4 p-3 rounded-lg flex items-center gap-3"
      :class="{
        'bg-yellow-900/30 border border-yellow-700': currentState === 'UNLOCKING',
        'bg-orange-900/30 border border-orange-700': currentState === 'OFFLINE',
        'bg-blue-900/30 border border-blue-700': currentState === 'SYNCING',
        'bg-red-900/30 border border-red-700': currentState === 'ERROR'
      }"
    >
      <div 
        class="w-3 h-3 rounded-full animate-pulse"
        :class="getStateColor(currentState)"
      ></div>
      <span class="text-white text-sm">{{ bannerMessage }}</span>
      
      <!-- Sync Progress Bar -->
      <div 
        v-if="currentState === 'SYNCING'" 
        class="flex-1 h-1 bg-gray-700 rounded overflow-hidden ml-2"
      >
        <div 
          class="h-full bg-blue-500 transition-all duration-300"
          :style="{ width: `${dashboardStore.syncProgress}%` }"
        ></div>
      </div>
    </div>

    <!-- Header -->
    <header class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">HealthBridge</h1>
        <p class="text-gray-400 text-sm">Patient-First Clinical Workflow</p>
      </div>
      
      <!-- State Badge -->
      <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-full">
        <component 
          :is="getHeaderBadgeIcon(headerBadge.icon)" 
          v-if="getHeaderBadgeIcon(headerBadge.icon)" 
          class="text-lg" 
          :class="{ 'animate-spin': headerBadge.icon === 'i-heroicons-arrow-path' }"
        ></component>
        <span class="text-gray-300 text-sm font-medium">{{ headerBadge.text }}</span>
      </div>
      
      <button 
        @click="handleLogout"
        class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
      >
        Logout
      </button>
    </header>

    <!-- Test Record Needed State -->
    <div v-if="needsTestRecord" class="mb-6 p-4 bg-blue-900/20 border border-blue-700 rounded-xl">
      <div class="flex items-center gap-3 mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <div>
          <p class="text-blue-400 font-medium">Security Setup Required</p>
          <p class="text-gray-400 text-sm">A test record is needed to verify your encryption key.</p>
        </div>
      </div>
      <button 
        @click="createTestRecord"
        :disabled="isCreatingTestRecord"
        class="w-full py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
      >
        <svg v-if="isCreatingTestRecord" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>{{ isCreatingTestRecord ? 'Creating...' : 'Create Test Record' }}</span>
      </button>
    </div>

    <!-- ERROR State Display -->
    <div v-else-if="isError" class="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-xl">
      <div class="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <p class="text-red-400 font-medium">Dashboard Error</p>
          <p class="text-gray-400 text-sm">Please check your network connection and try again.</p>
        </div>
        <button 
          @click="verifyTestRecord"
          class="ml-auto px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    </div>

    <!-- Main Dashboard Content (READY, OFFLINE, SYNCING) -->
    <template v-else-if="isReady || isOffline || isSyncing">
      
      <!-- Stats Bar -->
      <div class="grid grid-cols-3 gap-4 mb-6">
        <!-- Urgent/Red -->
        <div 
          class="bg-gray-800 rounded-xl p-4 cursor-pointer hover:bg-gray-750 transition-colors"
          :class="{ 'ring-2 ring-red-500': stats.red > 0 }"
          @click="handleViewRecords('urgent')"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-red-400 text-xs font-medium uppercase tracking-wide">Urgent</span>
            <div :class="redStatsClass" class="w-3 h-3 rounded-full"></div>
          </div>
          <p class="text-3xl font-bold text-white">{{ stats.red }}</p>
        </div>

        <!-- Needs Attention/Yellow -->
        <div 
          class="bg-gray-800 rounded-xl p-4 cursor-pointer hover:bg-gray-750 transition-colors"
          :class="{ 'ring-2 ring-yellow-500': stats.yellow > 0 }"
          @click="handleViewRecords('attention')"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-yellow-400 text-xs font-medium uppercase tracking-wide">Attention</span>
            <div :class="yellowStatsClass" class="w-3 h-3 rounded-full"></div>
          </div>
          <p class="text-3xl font-bold text-white">{{ stats.yellow }}</p>
        </div>

        <!-- Stable/Green -->
        <div 
          class="bg-gray-800 rounded-xl p-4 cursor-pointer hover:bg-gray-750 transition-colors"
          :class="{ 'ring-2 ring-green-500': stats.green > 0 }"
          @click="handleViewRecords('stable')"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-green-400 text-xs font-medium uppercase tracking-wide">Stable</span>
            <div :class="greenStatsClass" class="w-3 h-3 rounded-full"></div>
          </div>
          <p class="text-3xl font-bold text-white">{{ stats.green }}</p>
        </div>
      </div>

      <!-- PATIENT-FIRST ACTION CARDS -->
      <div class="bg-gray-800 rounded-xl p-4 mb-6">
        <h2 class="text-white font-semibold mb-4">Identify Patient First</h2>
        <p class="text-gray-400 text-sm mb-4">All clinical workflows require a patient. Start by identifying your patient.</p>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- New Patient Card -->
          <button 
            @click="navigateToNewPatient"
            class="p-4 bg-blue-900/30 hover:bg-blue-800/40 border border-blue-700/50 rounded-lg transition-colors text-left"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-blue-900/50 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div>
                <p class="text-white font-medium">🆕 New Patient</p>
                <p class="text-gray-400 text-xs">First time patient? Create CPT</p>
              </div>
            </div>
          </button>

          <!-- Returning Patient Card -->
          <button 
            @click="navigateToPatientLookup"
            class="p-4 bg-green-900/30 hover:bg-green-800/40 border border-green-700/50 rounded-lg transition-colors text-left"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-green-900/50 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div>
                <p class="text-white font-medium">🔍 Returning Patient</p>
                <p class="text-gray-400 text-xs">Have a CPT? Find patient record</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Quick CPT Lookup (Inline) -->
      <div class="bg-gray-800 rounded-xl p-4 mb-6">
        <h3 class="text-white font-medium mb-3">Find Patient</h3>
        
        <div class="flex gap-2">
          <input
            type="text"
            v-model="cptInput"
            @input="handleCPTInputChange"
            @keyup.enter="handleCPTLookup"
            placeholder="Enter CPT (4 characters)"
            maxlength="4"
            class="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase font-mono text-center tracking-widest"
          />
          <button 
            @click="handleCPTLookup"
            :disabled="isLookingUpPatient || cptInput.length !== 4"
            class="px-6 py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg v-if="isLookingUpPatient" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{{ isLookingUpPatient ? 'Finding...' : 'Find' }}</span>
          </button>
        </div>
        
        <!-- Character counter -->
        <div class="mt-2 text-xs text-gray-500 text-right">
          {{ cptInput.length }}/4 characters
        </div>
        
        <!-- Lookup Error -->
        <div v-if="lookupError" class="mt-3 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
          <p class="text-red-400 text-sm">{{ lookupError }}</p>
        </div>
        
        <!-- Found Patient Summary -->
        <div v-if="foundPatient" class="mt-4">
          <PatientSummaryCard
            :patient="foundPatient"
            @startVisit="startNewVisit"
            @viewRecord="navigateToPatientRecord"
            @clear="clearFoundPatient"
          />
        </div>
      </div>

      <!-- Session Draft Card -->
      <div 
        v-if="hasDraft && draftMeta"
        class="bg-gray-800 rounded-xl p-4 border border-blue-500/30 mb-6 cursor-pointer hover:bg-gray-750 transition-colors"
        @click="navigateToDraft()"
      >
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-full bg-blue-900/50 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <div>
            <h3 class="text-white font-semibold">📝 Resume Session</h3>
            <p class="text-gray-400 text-xs">{{ draftMeta.workflow || 'In Progress' }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-blue-400 text-sm">Tap to continue</span>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-2 gap-4 mb-6">
        <button 
          @click="handleOpenSessions"
          class="p-4 bg-purple-900/30 hover:bg-purple-800/40 border border-purple-700/50 rounded-lg transition-colors text-left"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-purple-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p class="text-white font-medium">Patient Sessions</p>
          <p class="text-gray-400 text-xs">View all sessions</p>
        </button>
        
        <button 
          @click="handleSync"
          :disabled="isSyncing"
          class="p-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg transition-colors text-left"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            class="h-6 w-6 text-green-400 mb-2" 
            :class="{ 'animate-spin': isSyncing }"
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <p class="text-white font-medium">Sync Now</p>
          <p class="text-gray-400 text-xs">{{ isOffline ? 'Go online to sync' : 'Push/pull changes' }}</p>
        </button>
      </div>

      <!-- Recent Sessions -->
      <div class="bg-gray-800 rounded-xl p-4">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-white font-semibold">Recent Sessions</h2>
          <span class="text-gray-500 text-xs">{{ recent.length }} items</span>
        </div>
        
        <div v-if="recent.length === 0" class="text-center py-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p class="text-gray-500 text-sm">No recent sessions</p>
          <p class="text-gray-600 text-xs">Start with a patient to see sessions here</p>
        </div>
        
        <div v-else class="space-y-2">
          <div 
            v-for="item in recent" 
            :key="item.id"
            class="flex items-center justify-between py-3 border-b border-gray-700 last:border-0 cursor-pointer hover:bg-gray-700/30 px-2 rounded-lg transition-colors"
            @click="navigateToSession(item.sessionId)"
          >
            <div class="flex items-center gap-3">
              <!-- Priority Indicator -->
              <div 
                v-if="item.priority"
                class="w-2 h-2 rounded-full"
                :class="{
                  'bg-red-500': item.priority === 'red',
                  'bg-yellow-500': item.priority === 'yellow',
                  'bg-green-500': item.priority === 'green'
                }"
              ></div>
              <div v-else class="w-2 h-2 rounded-full bg-gray-500"></div>
              
              <div>
                <p class="text-white text-sm">{{ item.title }}</p>
                <p v-if="item.patientCpt" class="text-blue-400 text-xs">CPT: {{ item.patientCpt }}</p>
                <p v-if="item.description" class="text-gray-500 text-xs">{{ item.description }}</p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-gray-400 text-xs">{{ formatTimeAgo(item.updated_at) }}</p>
              <p v-if="!item.synced" class="text-yellow-500 text-xs">Pending</p>
            </div>
          </div>
        </div>
      </div>

    </template>

    <!-- UNLOCKING State -->
    <div v-else-if="currentState === 'UNLOCKING'" class="flex flex-col items-center justify-center py-20">
      <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4"></div>
      <p class="text-white text-lg">Verifying encryption...</p>
      <p class="text-gray-500 text-sm">Please wait while we unlock your data</p>
    </div>

    <!-- LOCKED State -->
    <div v-else class="flex flex-col items-center justify-center py-20">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-gray-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      <p class="text-white text-lg">Dashboard Locked</p>
      <p class="text-gray-500 text-sm">Please enter your PIN to continue</p>
    </div>

    <!-- PIN Entry Modal -->
    <div v-if="showPinModal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div class="bg-gray-800 rounded-xl p-6 max-w-sm w-full mx-4">
        <div class="text-center mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-yellow-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h3 class="text-xl font-semibold text-white mb-2">
            {{ pinEntryError ? 'Re-encrypting Data' : 'Enter PIN' }}
          </h3>
          <p class="text-gray-400 text-sm">
            {{ pinEntryError ? 'Your encryption key needs to be re-derived. Enter your PIN to continue.' : 'Enter your 4-digit PIN to unlock the encryption key.' }}
          </p>
        </div>

        <!-- PIN Input -->
        <div class="mb-4">
          <input
            type="text"
            inputmode="numeric"
            maxlength="4"
            :value="pinEntry"
            @input="handlePinInput"
            :disabled="isVerifyingPin"
            placeholder="••••"
            class="w-full text-center text-3xl tracking-widest py-3 bg-gray-700 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            :class="{ 'border-red-500 focus:ring-red-500': pinError }"
          />
          <p v-if="pinError" class="text-red-500 text-sm text-center mt-2">{{ pinError }}</p>
        </div>

        <!-- PIN Dots -->
        <div class="flex justify-center gap-3 mb-6">
          <div 
            v-for="i in 4" 
            :key="i"
            class="w-4 h-4 rounded-full transition-colors duration-200"
            :class="i <= pinEntry.length ? 'bg-blue-500' : 'bg-gray-600'"
          ></div>
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <button 
            @click="closePinModal"
            :disabled="isVerifyingPin"
            class="flex-1 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            @click="submitPin"
            :disabled="pinEntry.length !== 4 || isVerifyingPin"
            class="flex-1 py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 text-white rounded-lg font-medium transition-colors"
          >
            {{ isVerifyingPin ? 'Verifying...' : 'Unlock' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>
