<script setup lang="ts">
/**
 * Sessions Queue Page
 * 
 * Main queue view for clinical sessions grouped by triage priority.
 * Uses the QueueView component for session display.
 */

import type { ClinicalSession } from '~/services/sessionEngine';

// ============================================
// Meta & SEO
// ============================================

useHead({
  title: 'Patient Queue - HealthBridge',
  meta: [
    { name: 'description', content: 'Clinical session queue - view and manage patient sessions by triage priority' }
  ]
});

// ============================================
// State
// ============================================

const isInitialized = ref(false);

// ============================================
// Methods
// ============================================

/**
 * Handle session click - navigate to session detail
 */
function handleSessionClick(session: ClinicalSession) {
  navigateTo(`/sessions/${session.id}`);
}

/**
 * Handle session action
 */
function handleSessionAction(session: ClinicalSession, action: string) {
  // Actions could include: continue, reassign, etc.
  console.log('Session action:', session.id, action);
  
  if (action === 'continue') {
    navigateTo(`/sessions/${session.id}`);
  }
}

/**
 * Handle new session created
 */
function handleNewSession() {
  console.log('New session created');
}

// ============================================
// Initialize
// ============================================

onMounted(async () => {
  // Session engine and timeline will be initialized by the QueueView component
  isInitialized.value = true;
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4">
    <!-- Main Content -->
    <ClinicalQueueView
      @session-click="handleSessionClick"
      @session-action="handleSessionAction"
      @new-session="handleNewSession"
    />
  </div>
</template>
