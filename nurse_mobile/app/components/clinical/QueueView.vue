<script setup lang="ts">
/**
 * QueueView Component
 * 
 * Displays the clinical session queue grouped by triage priority
 * (RED → YELLOW → GREEN).
 * 
 * Uses Nuxt UI components for consistent styling.
 */

import { ref, computed, onMounted } from 'vue';
import { navigateTo } from '#app';
import { formatDistanceToNow, format } from 'date-fns';
import type { ClinicalSession, SessionQueue } from '~/services/sessionEngine';
import { getOpenSessionsByPriority, createSession, initializeSessionEngine } from '~/services/sessionEngine';
import { logSessionCreated } from '~/services/clinicalTimeline';
import { TWButton, TWAlert, TWCard, TWBadge, TWIcon } from '~/components/ui';
import SessionCard from './SessionCard.vue';

interface Props {
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  compact: false
});

const emit = defineEmits<{
  (e: 'session-click', session: ClinicalSession): void;
  (e: 'session-action', session: ClinicalSession, action: string): void;
  (e: 'new-session'): void;
  (e: 'refresh'): void;
}>();

// ============================================
// State
// ============================================

const queue = ref<SessionQueue>({
  red: [],
  yellow: [],
  green: []
});

const isLoading = ref(true);
const isRefreshing = ref(false);
const error = ref<string | null>(null);

// Banner state for displaying status messages
const bannerMessage = ref<string | null>(null);
const bannerType = ref<'warning' | 'offline' | 'syncing' | 'error'>('warning');

// ============================================
// ============================================

/**
 * Total session count
 */
const totalCount = computed(() => {
  return queue.value.red.length + queue.value.yellow.length + queue.value.green.length;
});

/**
 * Queue section configurations
 */
const sections = computed(() => [
  {
    key: 'red',
    label: 'Red',
    description: 'Urgent - Immediate attention required',
    sessions: queue.value.red,
    color: 'error',
    icon: 'i-heroicons-exclamation-circle'
  },
  {
    key: 'yellow',
    label: 'Yellow',
    description: 'Semi-urgent - Assessment needed soon',
    sessions: queue.value.yellow,
    color: 'warning',
    icon: 'i-heroicons-exclamation-triangle'
  },
  {
    key: 'green',
    label: 'Green',
    description: 'Non-urgent - Routine assessment',
    sessions: queue.value.green,
    color: 'success',
    icon: 'i-heroicons-check-circle'
  }
]);

// ============================================
// Navigation
// ============================================

/**
 * Navigate back to previous page
 */
function handleBack() {
  history.back();
}

// ============================================
// Helper Functions
// ============================================

/**
 * Format timestamp to relative time string using date-fns
 */
function formatTimeAgo(timestamp: number | undefined): string {
  if (!timestamp) return 'Unknown';
  return formatDistanceToNow(timestamp, { addSuffix: true });
}

/**
 * Format timestamp to time string using date-fns
 */
function formatTime(timestamp: number): string {
  return format(timestamp, 'HH:mm');
}

// ============================================
// Methods
// ============================================

/**
 * Load sessions from the engine
 */
async function loadSessions() {
  try {
    isLoading.value = true;
    error.value = null;
    
    // Ensure engine is initialized
    await initializeSessionEngine();
    
    // Load queue
    queue.value = await getOpenSessionsByPriority();
  } catch (err) {
    console.error('Failed to load queue:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load sessions';
  } finally {
    isLoading.value = false;
  }
}

/**
 * Refresh the queue
 */
async function refresh() {
  isRefreshing.value = true;
  await loadSessions();
  emit('refresh');
  isRefreshing.value = false;
}

/**
 * Create a new session
 */
async function handleNewSession() {
  try {
    isLoading.value = true;
    error.value = null;
    
    // Create session
    const session = await createSession();
    
    // Log creation event
    await logSessionCreated(session.id);
    
    // Reload queue
    await loadSessions();
    
    // Emit event
    emit('new-session');
    
    // Navigate to the new session
    navigateTo(`/sessions/${session.id}`);
  } catch (err) {
    console.error('Failed to create session:', err);
    error.value = err instanceof Error ? err.message : 'Failed to create session';
  } finally {
    isLoading.value = false;
  }
}

/**
 * Handle session click
 */
function handleSessionClick(session: ClinicalSession) {
  emit('session-click', session);
}

/**
 * Handle session action
 */
function handleSessionAction(session: ClinicalSession, action: string) {
  emit('session-action', session, action);
}

// ============================================
// Lifecycle
// ============================================

onMounted(() => {
  loadSessions();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4">
    <!-- State Banner (if needed) -->
    <div 
      v-if="bannerMessage"
      class="mb-4 p-3 rounded-lg flex items-center gap-3"
      :class="{
        'bg-yellow-900/30 border border-yellow-700': bannerType === 'warning',
        'bg-orange-900/30 border border-orange-700': bannerType === 'offline',
        'bg-blue-900/30 border border-blue-700': bannerType === 'syncing',
        'bg-red-900/30 border border-red-700': bannerType === 'error'
      }"
    >
      <div 
        class="w-3 h-3 rounded-full animate-pulse"
        :class="{
          'bg-yellow-500': bannerType === 'warning',
          'bg-orange-500': bannerType === 'offline',
          'bg-blue-500': bannerType === 'syncing',
          'bg-red-500': bannerType === 'error'
        }"
      ></div>
      <span class="text-white text-sm">{{ bannerMessage }}</span>
    </div>

    <!-- Header -->
    <header class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-4">
        <button 
          @click="handleBack"
          class="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h1 class="text-2xl font-bold text-white">Patient Queue</h1>
          <p class="text-gray-400 text-sm">{{ totalCount }} patient{{ totalCount !== 1 ? 's' : '' }} waiting</p>
        </div>
      </div>
      
      <!-- Status Badge -->
      <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-full">
        <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
        <span class="text-gray-300 text-sm font-medium">Online</span>
      </div>
      
      <!-- Header Actions -->
      <div class="flex items-center gap-2">
        <button 
          @click="refresh"
          :disabled="isRefreshing"
          class="p-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg text-gray-400 hover:text-white transition-colors"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            class="h-5 w-5"
            :class="{ 'animate-spin': isRefreshing }"
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button 
          @click="handleNewSession"
          class="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          New Session
        </button>
      </div>
    </header>

    <!-- Error State -->
    <div 
      v-if="error" 
      class="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-xl flex items-center justify-between"
    >
      <div class="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="text-red-400 text-sm">{{ error }}</span>
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
    <div v-if="isLoading && totalCount === 0" class="flex flex-col items-center justify-center py-20">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
      <p class="text-white text-lg">Loading queue...</p>
      <p class="text-gray-500 text-sm">Please wait while we fetch patient sessions</p>
    </div>

    <!-- Empty State -->
    <div 
      v-else-if="!isLoading && totalCount === 0" 
      class="bg-gray-800 rounded-xl p-8 text-center"
    >
      <div class="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.67 2.137a10.02 10.02 0 01-.671 5.197" />
        </svg>
      </div>
      <h3 class="text-lg font-medium text-white mb-2">No patients waiting</h3>
      <p class="text-gray-400 mb-6">Start a new clinical session to begin.</p>
      <button 
        @click="handleNewSession"
        class="px-6 py-3 bg-blue-700 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
      >
        New Session
      </button>
    </div>

    <!-- Queue Sections -->
    <div v-else class="space-y-6">
      <template v-for="section in sections" :key="section.key">
        <!-- Section Header -->
        <div 
          v-if="section.sessions.length > 0"
          class="flex items-center gap-3 pb-3 border-b border-gray-700"
        >
          <div class="flex items-center gap-3">
            <div 
              class="w-8 h-8 rounded-lg flex items-center justify-center"
              :class="{
                'bg-red-900/50': section.color === 'error',
                'bg-yellow-900/50': section.color === 'warning',
                'bg-green-900/50': section.color === 'success',
                'bg-blue-900/50': section.color === 'primary'
              }"
            >
              <TWIcon 
                :name="section.icon"
                size="sm"
                :class="{
                  'text-red-400': section.color === 'error',
                  'text-yellow-400': section.color === 'warning',
                  'text-green-400': section.color === 'success',
                  'text-blue-400': section.color === 'primary'
                }"
              />
            </div>
            <div>
              <h3 class="font-semibold text-white">{{ section.label }}</h3>
              <p class="text-xs text-gray-400">{{ section.description }}</p>
            </div>
          </div>
          <div 
            class="ml-auto px-3 py-1 rounded-full text-sm font-medium"
            :class="{
              'bg-red-900/30 text-red-400': section.color === 'error',
              'bg-yellow-900/30 text-yellow-400': section.color === 'warning',
              'bg-green-900/30 text-green-400': section.color === 'success',
              'bg-blue-900/30 text-blue-400': section.color === 'primary'
            }"
          >
            {{ section.sessions.length }}
          </div>
        </div>

        <!-- Section Sessions -->
        <div 
          v-if="section.sessions.length > 0"
          class="space-y-3"
          :class="{ 'pl-4': compact }"
        >
          <div 
            v-for="session in section.sessions"
            :key="session.id"
            class="bg-gray-800 rounded-xl p-4 cursor-pointer hover:bg-gray-750 transition-colors border border-transparent hover:border-gray-700"
            :class="{
              'border-red-500/30': session.triage === 'red',
              'border-yellow-500/30': session.triage === 'yellow',
              'border-green-500/30': session.triage === 'green'
            }"
            @click="handleSessionClick(session)"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <!-- Priority Indicator -->
                  <div 
                    class="w-2 h-2 rounded-full"
                    :class="{
                      'bg-red-500': session.triage === 'red',
                      'bg-yellow-500': session.triage === 'yellow',
                      'bg-green-500': session.triage === 'green',
                      'bg-gray-500': !session.triage
                    }"
                  ></div>
                  <span class="text-white font-medium">{{ session.patientName }}</span>
                  <span 
                    class="text-xs px-2 py-1 rounded-full"
                    :class="{
                      'bg-red-900/30 text-red-400': session.triage === 'red',
                      'bg-yellow-900/30 text-yellow-400': session.triage === 'yellow',
                      'bg-green-900/30 text-green-400': session.triage === 'green'
                    }"
                  >
                    {{ session.triage?.charAt(0).toUpperCase() + session.triage?.slice(1) || 'Normal' }}
                  </span>
                </div>
                
                <div class="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <p class="text-xs text-gray-400">Reason</p>
                    <p class="text-sm text-white">{{ session.chiefComplaint || 'Not specified' }}</p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-400">Time in Queue</p>
                    <p class="text-sm text-white">{{ formatTimeAgo(session.createdAt) }}</p>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span class="text-gray-400 text-sm">Arrived {{ formatTime(session.createdAt) }}</span>
                </div>
              </div>

              <!-- Action Button -->
              <button 
                @click.stop="handleSessionAction(session, 'continue')"
                class="ml-4 p-2 bg-blue-900/30 hover:bg-blue-800/40 text-blue-400 rounded-lg transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
