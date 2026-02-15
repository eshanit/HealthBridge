<script setup lang="ts">
/**
 * Timeline Component
 * 
 * Displays clinical session events in a vertical timeline
 * showing the audit trail of all actions taken on a session.
 */

import { ref, computed, onMounted, watch } from 'vue';
import type { TimelineEvent, TimelineEventType } from '~/services/clinicalTimeline';
import { 
  getTimeline, 
  formatTimelineDate, 
  getEventTypeLabel, 
  getEventTypeConfig,
  initializeTimeline 
} from '~/services/clinicalTimeline';
import { TWAlert, TWCard, TWIcon } from '~/components/ui';

interface Props {
  sessionId: string;
  limit?: number;
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  limit: 50,
  compact: false
});

// ============================================
// State
// ============================================

const events = ref<TimelineEvent[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);

// ============================================
// Computed
// ============================================

/**
 * Check if timeline is empty
 */
const isEmpty = computed(() => events.value.length === 0);

/**
 * Group events by date
 */
const groupedEvents = computed(() => {
  const groups: Record<string, TimelineEvent[]> = {};
  
  for (const event of events.value) {
    const date = new Date(event.timestamp).toLocaleDateString('en-CA');
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(event);
  }
  
  return groups;
});

// ============================================
// Methods
// ============================================

/**
 * Load timeline events
 */
async function loadTimeline() {
  try {
    isLoading.value = true;
    error.value = null;
    
    console.log('[Timeline] Loading timeline for session:', props.sessionId);
    
    // Ensure timeline service is initialized
    await initializeTimeline();
    
    // Load events
    events.value = await getTimeline(props.sessionId, props.limit);
    console.log('[Timeline] Loaded events:', events.value.length);
  } catch (err) {
    console.error('Failed to load timeline:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load timeline';
  } finally {
    isLoading.value = false;
  }
}

/**
 * Format time for display
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-CA', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Get event type config
 */
function getConfig(type: TimelineEventType) {
  return getEventTypeConfig(type);
}

/**
 * Get event type label
 */
function getLabel(type: TimelineEventType) {
  return getEventTypeLabel(type);
}

/**
 * Format event description
 */
function formatDescription(event: TimelineEvent): string {
  return event.data.description || getLabel(event.type);
}

/**
 * Get actor display name
 */
function getActor(event: TimelineEvent): string {
  return event.data.actor || 'System';
}

// ============================================
// Lifecycle
// ============================================

onMounted(() => {
  loadTimeline();
});

// Watch for session changes
watch(() => props.sessionId, () => {
  loadTimeline();
});
</script>

<template>
  <div class="timeline dark:bg-gray-900">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
        Timeline
      </h3>
      <span class="text-sm text-gray-500 dark:text-gray-400">
        {{ events.length }} event{{ events.length !== 1 ? 's' : '' }}
      </span>
    </div>
    
<!-- Error State -->
    <TWAlert
      v-if="error"
      color="error"
      variant="soft"
      dismissible
      @close="error = null"
    >
      {{ error }}
    </TWAlert>
    
<!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-8">
      <TWIcon name="i-heroicons-arrow-path" size="sm" class="animate-spin text-gray-400" />
      <span class="ml-2 text-gray-500 dark:text-gray-400">Loading timeline...</span>
    </div>
    
<!-- Empty State -->
    <TWCard
      v-else-if="isEmpty"
      color="gray"
      class="text-center py-6"
    >
      <TWIcon name="i-heroicons-clock" size="lg" class="mx-auto text-gray-400 mb-3" />
      <p class="text-gray-500 dark:text-gray-400">
        No timeline events yet
      </p>
    </TWCard>
    
    <!-- Timeline -->
    <div v-else class="relative">
      <!-- Vertical Line -->
      <div 
        class="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-700"
      />
      
      <!-- Events -->
      <div class="space-y-4">
        <template v-for="(dateEvents, date) in groupedEvents" :key="date">
          <!-- Date Header -->
          <div class="flex items-center gap-2 my-4">
            <div class="relative z-10 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-300">
              {{ new Date(date).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }) }}
            </div>
          </div>
          
          <!-- Events for this date -->
          <div class="space-y-3 pl-4">
            <template v-for="event in dateEvents" :key="event.id">
              <div class="relative flex gap-3">
<!-- Event Icon -->
                <div 
                  class="relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                  :class="{
                    'bg-green-100 dark:bg-green-900': getConfig(event.type).color === 'text-green-500',
                    'bg-blue-100 dark:bg-blue-900': getConfig(event.type).color === 'text-blue-500',
                    'bg-amber-100 dark:bg-amber-900': getConfig(event.type).color === 'text-orange-500',
                    'bg-emerald-100 dark:bg-emerald-900': getConfig(event.type).color === 'text-emerald-500',
                    'bg-purple-100 dark:bg-purple-900': getConfig(event.type).color === 'text-purple-500',
                    'bg-cyan-100 dark:bg-cyan-900': getConfig(event.type).color === 'text-cyan-500',
                    'bg-gray-100 dark:bg-gray-800': getConfig(event.type).color === 'text-gray-500'
                  }"
                >
                  <TWIcon
                    :name="getConfig(event.type).icon"
                    :color="getConfig(event.type).color"
                    size="sm"
                  />
                </div>
                
<!-- Event Content -->
                <TWCard
                  color="gray"
                  class="flex-1"
                  :class="compact ? 'py-2 px-3' : ''"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex-1 min-w-0">
                      <!-- Event Type Label -->
                      <div class="flex items-center gap-2 mb-1">
                        <span class="font-medium text-gray-900 dark:text-white text-sm">
                          {{ getLabel(event.type) }}
                        </span>
                        <span class="text-xs text-gray-400 dark:text-gray-500">
                          {{ formatTime(event.timestamp) }}
                        </span>
                      </div>
                      
                      <!-- Description -->
                      <p class="text-sm text-gray-600 dark:text-gray-300">
                        {{ formatDescription(event) }}
                      </p>
                      
                      <!-- Actor -->
                      <p v-if="!compact && event.data.actor" class="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        by {{ getActor(event) }}
                      </p>
                      
                      <!-- Additional Details -->
                      <div v-if="!compact && (event.data.formName || event.data.newValue)" class="mt-2">
                        <div v-if="event.data.formName" class="text-xs text-gray-500 dark:text-gray-400">
                          Form: {{ event.data.formName }}
                        </div>
                        <div v-if="event.data.newValue?.triage" class="text-xs text-gray-500 dark:text-gray-400">
                          Triage: {{ event.data.newValue.triage }}
                        </div>
                      </div>
                    </div>
                  </div>
</TWCard>
              </div>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
