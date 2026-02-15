<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { useSecurityStore } from '@/stores/security';
import { secureAllDocs } from '~/services/secureDb';
import type { ClinicalFormInstance } from '~/types/clinical-form';

const route = useRoute();
const router = useRouter();
const securityStore = useSecurityStore();

const records = ref<ClinicalFormInstance[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

type FilterType = 'urgent' | 'attention' | 'stable' | 'pending' | 'all';

const filter = computed<FilterType>(() => {
  const f = route.query.filter as string;
  return ['urgent', 'attention', 'stable', 'pending'].includes(f) ? f as FilterType : 'all';
});

const filterTitle = computed(() => {
  switch (filter.value) {
    case 'urgent': return 'Urgent Records';
    case 'attention': return 'Records Needing Attention';
    case 'stable': return 'Stable Records';
    case 'pending': return 'Pending Sync';
    default: return 'All Records';
  }
});

const filterDescription = computed(() => {
  switch (filter.value) {
    case 'urgent': return 'Records requiring immediate review';
    case 'attention': return 'Records needing follow-up';
    case 'stable': return 'Stable patients';
    case 'pending': return 'Records awaiting synchronization';
    default: return 'All patient records';
  }
});

const emptyTitle = computed(() => {
  switch (filter.value) {
    case 'urgent': return 'No urgent records';
    case 'attention': return 'No records needing attention';
    case 'stable': return 'No stable records';
    case 'pending': return 'No pending records';
    default: return 'No records found';
  }
});

async function loadRecords() {
  loading.value = true;
  error.value = null;
  
  try {
    const security = useSecurityStore();
    if (!security.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    const allForms = await secureAllDocs<ClinicalFormInstance>(security.encryptionKey);
    
    // Apply filter
    let filtered = allForms;
    switch (filter.value) {
      case 'urgent':
        filtered = allForms.filter(f => f.calculated?.triagePriority === 'red');
        break;
      case 'attention':
        filtered = allForms.filter(f => f.calculated?.triagePriority === 'yellow');
        break;
      case 'stable':
        filtered = allForms.filter(f => f.calculated?.triagePriority === 'green' || !f.calculated?.triagePriority);
        break;
      case 'pending':
        filtered = allForms.filter(f => f.syncStatus === 'pending' || f.syncStatus === 'error');
        break;
    }
    
    // Sort by updated date, most recent first
    records.value = filtered.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch (err) {
    console.error('[Records] Failed to load records:', err);
    error.value = 'Failed to load records. Please try again.';
  } finally {
    loading.value = false;
  }
}

function getPriorityColor(priority?: string): string {
  switch (priority) {
    case 'red': return 'bg-red-500';
    case 'yellow': return 'bg-yellow-500';
    case 'green': return 'bg-green-500';
    default: return 'bg-gray-500';
  }
}

function getStatusBadge(status: string): { class: string; text: string } {
  switch (status) {
    case 'draft': return { class: 'bg-gray-700 text-gray-300', text: 'Draft' };
    case 'completed': return { class: 'bg-green-900/50 text-green-400', text: 'Completed' };
    case 'in_progress': return { class: 'bg-blue-900/50 text-blue-400', text: 'In Progress' };
    default: return { class: 'bg-gray-700 text-gray-300', text: status };
  }
}

function getSyncBadge(syncStatus: string): { class: string; text: string } {
  switch (syncStatus) {
    case 'synced': return { class: 'bg-green-900/50 text-green-400', text: 'Synced' };
    case 'pending': return { class: 'bg-yellow-900/50 text-yellow-400', text: 'Pending' };
    case 'error': return { class: 'bg-red-900/50 text-red-400', text: 'Error' };
    default: return { class: 'bg-gray-700 text-gray-300', text: syncStatus };
  }
}

function formatTimeAgo(timestamp?: string): string {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Unknown';
  return formatDistanceToNow(date, { addSuffix: true });
}

function handleBack() {
  router.push('/dashboard');
}

function handleRecordClick(record: ClinicalFormInstance) {
  router.push(`/records/${record._id}`);
}

onMounted(() => {
  loadRecords();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4">
    <!-- Header -->
    <header class="flex items-center gap-4 mb-6">
      <button 
        @click="handleBack"
        class="p-2 hover:bg-gray-800 rounded-lg transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div>
        <h1 class="text-2xl font-bold text-white">{{ filterTitle }}</h1>
        <p class="text-gray-400 text-sm">{{ filterDescription }}</p>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="bg-red-900/20 border border-red-700 rounded-xl p-4 mb-6">
      <div class="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p class="text-red-400">{{ error }}</p>
        <button 
          @click="loadRecords"
          class="ml-auto px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="records.length === 0" class="bg-gray-800 rounded-xl p-8 text-center">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p class="text-white text-lg font-medium mb-2">{{ emptyTitle }}</p>
      <p class="text-gray-500 text-sm">No records match this filter</p>
    </div>

    <!-- Records List -->
    <div v-else class="space-y-3">
      <div class="bg-gray-800 rounded-xl overflow-hidden">
        <div 
          v-for="(record, idx) in records" 
          :key="record._id"
          class="flex items-center gap-4 p-4 border-b border-gray-700 last:border-0 cursor-pointer hover:bg-gray-750 transition-colors"
          :class="{ 'bg-gray-750/50': idx % 2 === 0 }"
          @click="handleRecordClick(record)"
        >
          <!-- Priority Indicator -->
          <div 
            class="w-3 h-12 rounded-full"
            :class="getPriorityColor(record.calculated?.triagePriority)"
          ></div>
          
          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="text-white font-medium truncate">
                {{ record.patientName || 'Unnamed Patient' }}
              </h3>
              <span 
                v-if="record.status"
                class="px-2 py-0.5 text-xs rounded-full"
                :class="getStatusBadge(record.status).class"
              >
                {{ getStatusBadge(record.status).text }}
              </span>
            </div>
            <p class="text-gray-500 text-sm truncate">
              {{ record.schemaId || 'General Assessment' }} - {{ formatTimeAgo(record.updatedAt) }}
            </p>
          </div>
          
          <!-- Sync Status -->
          <div class="text-right">
            <span 
              class="px-2 py-1 text-xs rounded-full"
              :class="getSyncBadge(record.syncStatus || 'synced').class"
            >
              {{ getSyncBadge(record.syncStatus || 'synced').text }}
            </span>
          </div>
          
          <!-- Chevron -->
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
      
      <!-- Summary -->
      <p class="text-gray-500 text-sm text-center">
        Showing {{ records.length }} record{{ records.length !== 1 ? 's' : '' }}
      </p>
    </div>
  </div>
</template>
