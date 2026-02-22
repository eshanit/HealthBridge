<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useForm } from '@inertiajs/vue3';
import { 
  FileText, 
  Save, 
  Send, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  User,
  Calendar,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit3,
  Signature
} from 'lucide-vue-next';
import StructuredFindings from './StructuredFindings.vue';
import ImpressionBuilder from './ImpressionBuilder.vue';
import ReportTemplates from './ReportTemplates.vue';
import ReportPreview from './ReportPreview.vue';
import DigitalSignature from './DigitalSignature.vue';

interface Study {
  id: number;
  study_uuid: string;
  modality: string;
  body_part: string;
  study_type: string;
  clinical_indication: string;
  patient: {
    id: number;
    name: string;
    date_of_birth: string;
    gender: string;
  };
  referring_user?: {
    name: string;
  };
}

interface Report {
  id: number;
  report_uuid: string;
  report_type: string;
  findings: string;
  impression: string;
  recommendations: string;
  critical_findings: boolean;
  critical_communicated: boolean;
  communication_method: string | null;
  signed_at: string | null;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

const props = defineProps<{
  study: Study;
  report?: Report | null;
  canSign: boolean;
}>();

const emit = defineEmits<{
  (e: 'saved', report: Report): void;
  (e: 'signed', report: Report): void;
}>();

// State
const activeTab = ref<'findings' | 'impression' | 'recommendations' | 'preview'>('findings');
const isLoading = ref(false);
const isSaving = ref(false);
const lastSaved = ref<string | null>(null);
const showTemplates = ref(false);
const showSignature = ref(false);
const autoSaveInterval = ref<ReturnType<typeof setInterval> | null>(null);
const hasUnsavedChanges = ref(false);

// Form
const form = useForm({
  findings: props.report?.findings || '',
  impression: props.report?.impression || '',
  recommendations: props.report?.recommendations || '',
  critical_findings: props.report?.critical_findings || false,
  critical_communicated: props.report?.critical_communicated || false,
  communication_method: props.report?.communication_method || '',
});

// Computed
const isSigned = computed(() => !!props.report?.signed_at);
const isLocked = computed(() => props.report?.is_locked || false);
const canEdit = computed(() => !isSigned.value && !isLocked.value);

const reportStatus = computed(() => {
  if (isSigned.value) return 'signed';
  if (props.report?.report_type === 'preliminary') return 'preliminary';
  return 'draft';
});

const statusConfig = computed(() => {
  const status = reportStatus.value;
  const configs = {
    signed: { color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle, label: 'Signed' },
    preliminary: { color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock, label: 'Preliminary' },
    draft: { color: 'text-gray-600', bg: 'bg-gray-50', icon: Edit3, label: 'Draft' },
  };
  return configs[status as keyof typeof configs];
});

// Auto-save
const autoSave = async () => {
  if (!canEdit.value || !hasUnsavedChanges.value || !props.report) return;
  
  isSaving.value = true;
  try {
    const response = await fetch(`/radiology/reports/${props.report.id}/auto-save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
      },
      body: JSON.stringify({
        findings: form.findings,
        impression: form.impression,
        recommendations: form.recommendations,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      lastSaved.value = data.saved_at;
      hasUnsavedChanges.value = false;
    }
  } catch (error) {
    console.error('Auto-save failed:', error);
  } finally {
    isSaving.value = false;
  }
};

// Watch for changes
watch(
  () => [form.findings, form.impression, form.recommendations],
  () => {
    hasUnsavedChanges.value = true;
  },
  { deep: true }
);

// Methods
const saveDraft = async () => {
  if (!canEdit.value) return;
  
  isSaving.value = true;
  try {
    const url = props.report 
      ? `/radiology/reports/${props.report.id}`
      : `/radiology/studies/${props.study.id}/reports`;
    
    const method = props.report ? 'PATCH' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
      },
      body: JSON.stringify({
        findings: form.findings,
        impression: form.impression,
        recommendations: form.recommendations,
        critical_findings: form.critical_findings,
        critical_communicated: form.critical_communicated,
        communication_method: form.communication_method,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      emit('saved', data.report);
      lastSaved.value = new Date().toISOString();
      hasUnsavedChanges.value = false;
    }
  } catch (error) {
    console.error('Save failed:', error);
  } finally {
    isSaving.value = false;
  }
};

const openSignature = () => {
  showSignature.value = true;
};

const handleSigned = (report: Report) => {
  showSignature.value = false;
  emit('signed', report);
};

const applyTemplate = (template: { findings: string; impression: string; recommendations: string }) => {
  form.findings = template.findings;
  form.impression = template.impression;
  form.recommendations = template.recommendations;
  showTemplates.value = false;
  hasUnsavedChanges.value = true;
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Keyboard shortcuts
const handleKeydown = (e: KeyboardEvent) => {
  if (!canEdit.value) return;
  
  // Ctrl+S: Save draft
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    saveDraft();
  }
  
  // Ctrl+Shift+F: Sign & finalize
  if (e.ctrlKey && e.shiftKey && e.key === 'F' && props.canSign) {
    e.preventDefault();
    openSignature();
  }
};

// Lifecycle
onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  
  // Auto-save every 30 seconds
  if (canEdit.value) {
    autoSaveInterval.value = setInterval(autoSave, 30000);
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (autoSaveInterval.value) {
    clearInterval(autoSaveInterval.value);
  }
});
</script>

<template>
  <div class="h-full flex flex-col bg-white rounded-lg shadow">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-gray-200">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <button 
            @click="$emit('back')" 
            class="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronLeft class="w-5 h-5 text-gray-500" />
          </button>
          
          <div>
            <h2 class="text-xl font-semibold text-gray-900">
              Diagnostic Report
            </h2>
            <p class="text-sm text-gray-500">
              {{ study.modality }} - {{ study.body_part }} - {{ study.study_type }}
            </p>
          </div>
        </div>
        
        <!-- Status Badge -->
        <div :class="[statusConfig.bg, 'px-3 py-1 rounded-full flex items-center gap-2']">
          <component :is="statusConfig.icon" :class="['w-4 h-4', statusConfig.color]" />
          <span :class="['text-sm font-medium', statusConfig.color]">
            {{ statusConfig.label }}
          </span>
        </div>
      </div>
      
      <!-- Patient Info Bar -->
      <div class="mt-4 flex items-center gap-6 text-sm text-gray-600">
        <div class="flex items-center gap-2">
          <User class="w-4 h-4" />
          <span>{{ study.patient.name }}</span>
        </div>
        <div class="flex items-center gap-2">
          <Calendar class="w-4 h-4" />
          <span>{{ study.patient.date_of_birth }} ({{ study.patient.gender }})</span>
        </div>
        <div class="flex items-center gap-2">
          <Stethoscope class="w-4 h-4" />
          <span>{{ study.clinical_indication }}</span>
        </div>
        <div v-if="study.referring_user" class="flex items-center gap-2">
          <span class="text-gray-400">Ref:</span>
          <span>{{ study.referring_user.name }}</span>
        </div>
      </div>
    </div>
    
    <!-- Tabs -->
    <div class="px-6 border-b border-gray-200">
      <nav class="flex gap-6">
        <button
          v-for="tab in ['findings', 'impression', 'recommendations', 'preview'] as const"
          :key="tab"
          @click="activeTab = tab"
          :class="[
            'py-3 px-1 border-b-2 font-medium text-sm transition-colors capitalize',
            activeTab === tab
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          ]"
        >
          {{ tab }}
        </button>
      </nav>
    </div>
    
    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      <!-- Findings Tab -->
      <div v-if="activeTab === 'findings'" class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-medium text-gray-900">Findings</h3>
          <button
            v-if="canEdit"
            @click="showTemplates = true"
            class="text-sm text-blue-600 hover:text-blue-700"
          >
            Apply Template
          </button>
        </div>
        <StructuredFindings
          v-model:findings="form.findings"
          :disabled="!canEdit"
          :modality="study.modality"
        />
      </div>
      
      <!-- Impression Tab -->
      <div v-if="activeTab === 'impression'" class="space-y-4">
        <h3 class="text-lg font-medium text-gray-900">Impression</h3>
        <ImpressionBuilder
          v-model:impression="form.impression"
          :disabled="!canEdit"
          :findings="form.findings"
        />
      </div>
      
      <!-- Recommendations Tab -->
      <div v-if="activeTab === 'recommendations'" class="space-y-4">
        <h3 class="text-lg font-medium text-gray-900">Recommendations</h3>
        <textarea
          v-model="form.recommendations"
          :disabled="!canEdit"
          rows="8"
          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          placeholder="Enter recommendations..."
        />
      </div>
      
      <!-- Preview Tab -->
      <div v-if="activeTab === 'preview'">
        <ReportPreview
          :study="study"
          :report="report"
          :findings="form.findings"
          :impression="form.impression"
          :recommendations="form.recommendations"
        />
      </div>
    </div>
    
    <!-- Critical Findings Alert -->
    <div v-if="form.critical_findings" class="px-6 py-3 bg-red-50 border-t border-red-200">
      <div class="flex items-center gap-2 text-red-800">
        <AlertTriangle class="w-5 h-5" />
        <span class="font-medium">Critical Findings</span>
        <span v-if="form.critical_communicated" class="text-green-600 text-sm">
          - Communicated to referring physician
        </span>
      </div>
    </div>
    
    <!-- Footer Actions -->
    <div class="px-6 py-4 border-t border-gray-200 bg-gray-50">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <!-- Unsaved indicator -->
          <div v-if="hasUnsavedChanges" class="text-sm text-amber-600">
            Unsaved changes
          </div>
          <div v-else-if="lastSaved" class="text-sm text-gray-500">
            Last saved: {{ formatDate(lastSaved) }}
          </div>
          
          <!-- Critical findings checkbox -->
          <label v-if="canEdit" class="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              v-model="form.critical_findings"
              class="rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            Mark as critical findings
          </label>
        </div>
        
        <div class="flex items-center gap-3">
          <button
            v-if="canEdit"
            @click="saveDraft"
            :disabled="isSaving"
            class="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Save class="w-4 h-4" />
            {{ isSaving ? 'Saving...' : 'Save Draft' }}
          </button>
          
          <button
            v-if="canEdit && canSign"
            @click="openSignature"
            :disabled="!form.findings || !form.impression"
            class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Signature class="w-4 h-4" />
            Sign & Finalize
          </button>
          
          <span v-if="isSigned" class="text-sm text-green-600 flex items-center gap-2">
            <CheckCircle class="w-4 h-4" />
            Signed on {{ formatDate(report!.signed_at!) }}
          </span>
        </div>
      </div>
    </div>
    
    <!-- Templates Modal -->
    <ReportTemplates
      v-if="showTemplates"
      :modality="study.modality"
      :body-part="study.body_part"
      @select="applyTemplate"
      @close="showTemplates = false"
    />
    
    <!-- Signature Modal -->
    <DigitalSignature
      v-if="showSignature"
      :report-id="report?.id"
      :study-id="study.id"
      :findings="form.findings"
      :impression="form.impression"
      :recommendations="form.recommendations"
      @signed="handleSigned"
      @close="showSignature = false"
    />
  </div>
</template>
