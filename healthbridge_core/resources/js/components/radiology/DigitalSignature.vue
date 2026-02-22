<script setup lang="ts">
import { ref } from 'vue';
import { Signature, X, Lock, AlertCircle } from 'lucide-vue-next';

interface Props {
  reportId?: number;
  studyId: number;
  findings: string;
  impression: string;
  recommendations: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'signed', report: any): void;
  (e: 'close'): void;
}>();

const isLoading = ref(false);
const error = ref<string | null>(null);
const password = ref('');

const signReport = async () => {
  if (!props.findings || !props.impression) {
    error.value = 'Cannot sign report without findings and impression.';
    return;
  }

  isLoading.value = true;
  error.value = null;

  try {
    // If report exists, sign it; otherwise create and sign
    const url = props.reportId 
      ? `/radiology/reports/${props.reportId}/sign`
      : `/radiology/studies/${props.studyId}/reports`;
    
    const method = props.reportId ? 'POST' : 'POST';
    
    // First create the report if it doesn't exist
    if (!props.reportId) {
      const createResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
        body: JSON.stringify({
          findings: props.findings,
          impression: props.impression,
          recommendations: props.recommendations,
        }),
      });
      
      if (!createResponse.ok) {
        throw new Error('Failed to create report');
      }
      
      const createData = await createResponse.json();
      
      // Now sign the report
      const signResponse = await fetch(`/radiology/reports/${createData.report.id}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
      });
      
      if (!signResponse.ok) {
        const signError = await signResponse.json();
        throw new Error(signError.message || 'Failed to sign report');
      }
      
      const signedData = await signResponse.json();
      emit('signed', signedData.report);
    } else {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
      });
      
      if (!response.ok) {
        const responseError = await response.json();
        throw new Error(responseError.message || 'Failed to sign report');
      }
      
      const data = await response.json();
      emit('signed', data.report);
    }
  } catch (err: any) {
    error.value = err.message || 'An error occurred while signing the report.';
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-md">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <Signature class="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Sign Report</h3>
            <p class="text-sm text-gray-500">Digital signature</p>
          </div>
        </div>
        <button
          @click="$emit('close')"
          class="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X class="w-5 h-5 text-gray-500" />
        </button>
      </div>
      
      <!-- Content -->
      <div class="p-6">
        <!-- Warning -->
        <div class="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div class="flex items-start gap-3">
            <AlertCircle class="w-5 h-5 text-amber-600 mt-0.5" />
            <div class="text-sm text-amber-800">
              <p class="font-medium">Important</p>
              <p class="mt-1">Once signed, this report cannot be edited. If changes are needed, an amendment must be created.</p>
            </div>
          </div>
        </div>
        
        <!-- Validation -->
        <div class="mb-6 space-y-2">
          <div class="flex items-center gap-2 text-sm">
            <div :class="findings ? 'text-green-600' : 'text-red-600'">
              {{ findings ? '✓' : '✗' }} Findings
            </div>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <div :class="impression ? 'text-green-600' : 'text-red-600'">
              {{ impression ? '✓' : '✗' }} Impression
            </div>
          </div>
        </div>
        
        <!-- Error message -->
        <div v-if="error" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p class="text-sm text-red-600">{{ error }}</p>
        </div>
        
        <!-- Sign button -->
        <button
          @click="signReport"
          :disabled="isLoading || !findings || !impression"
          class="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Lock v-if="!isLoading" class="w-5 h-5" />
          <span v-if="isLoading">Signing...</span>
          <span v-else>Sign & Finalize Report</span>
        </button>
      </div>
      
      <!-- Footer -->
      <div class="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-xl">
        <p class="text-xs text-gray-500 text-center">
          By signing, you certify that you have personally performed the interpretation and agree to be legally bound by this digital signature.
        </p>
      </div>
    </div>
  </div>
</template>
