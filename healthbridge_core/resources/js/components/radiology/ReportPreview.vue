<script setup lang="ts">
import { computed } from 'vue';
import { FileText, User, Calendar, Stethoscope, CheckCircle, AlertTriangle } from 'lucide-vue-next';

interface Patient {
  id: number;
  name: string;
  date_of_birth: string;
  gender: string;
}

interface Study {
  id: number;
  study_uuid: string;
  modality: string;
  body_part: string;
  study_type: string;
  clinical_indication: string;
  patient: Patient;
  referring_user?: {
    name: string;
  };
}

interface Report {
  id: number;
  report_uuid: string;
  report_type: string;
  signed_at: string;
  radiologist?: {
    name: string;
  };
}

interface Props {
  study: Study;
  report?: Report | null;
  findings: string;
  impression: string;
  recommendations: string;
}

const props = defineProps<Props>();

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const isSigned = computed(() => !!props.report?.signed_at);
</script>

<template>
  <div class="bg-white border border-gray-200 rounded-lg p-8 max-w-4xl mx-auto">
    <!-- Header -->
    <div class="text-center border-b border-gray-200 pb-6 mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Diagnostic Imaging Report</h1>
      <div class="mt-2 text-gray-600">
        <span class="font-medium">{{ study.modality }}</span> - 
        <span>{{ study.body_part }}</span> - 
        <span>{{ study.study_type }}</span>
      </div>
      <div v-if="study.study_uuid" class="mt-1 text-sm text-gray-500">
        Study ID: {{ study.study_uuid }}
      </div>
      <div v-if="report?.report_uuid" class="mt-1 text-sm text-gray-500">
        Report ID: {{ report.report_uuid }}
      </div>
    </div>
    
    <!-- Patient Information -->
    <div class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Patient Information</h2>
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-gray-500">Name:</span>
          <span class="ml-2 font-medium">{{ study.patient.name }}</span>
        </div>
        <div>
          <span class="text-gray-500">Date of Birth:</span>
          <span class="ml-2 font-medium">{{ study.patient.date_of_birth }}</span>
        </div>
        <div>
          <span class="text-gray-500">Gender:</span>
          <span class="ml-2 font-medium">{{ study.patient.gender }}</span>
        </div>
        <div>
          <span class="text-gray-500">Exam Date:</span>
          <span class="ml-2 font-medium">{{ formatDate(new Date().toISOString()) }}</span>
        </div>
      </div>
    </div>
    
    <!-- Clinical Information -->
    <div class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Clinical Information</h2>
      <div class="text-sm">
        <div class="mb-2">
          <span class="text-gray-500">Clinical Indication:</span>
          <span class="ml-2">{{ study.clinical_indication }}</span>
        </div>
        <div v-if="study.referring_user">
          <span class="text-gray-500">Referring Physician:</span>
          <span class="ml-2 font-medium">{{ study.referring_user.name }}</span>
        </div>
      </div>
    </div>
    
    <!-- Findings -->
    <div class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Findings</h2>
      <div class="text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-200">
        {{ findings || 'No findings recorded.' }}
      </div>
    </div>
    
    <!-- Impression -->
    <div class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Impression</h2>
      <div class="text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-200 font-medium">
        {{ impression || 'No impression recorded.' }}
      </div>
    </div>
    
    <!-- Recommendations -->
    <div v-if="recommendations" class="mb-6">
      <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Recommendations</h2>
      <div class="text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-200">
        {{ recommendations }}
      </div>
    </div>
    
    <!-- Signature -->
    <div class="border-t border-gray-200 pt-6 mt-6">
      <div v-if="isSigned" class="flex items-center gap-4">
        <div class="flex items-center gap-2 text-green-600">
          <CheckCircle class="w-5 h-5" />
          <span class="font-medium">Digitally Signed</span>
        </div>
        <div class="text-sm text-gray-600">
          <span>Signed on {{ formatDate(report!.signed_at) }}</span>
          <span v-if="report?.radiologist" class="ml-2">by {{ report.radiologist.name }}</span>
        </div>
      </div>
      <div v-else class="flex items-center gap-2 text-amber-600">
        <AlertTriangle class="w-5 h-5" />
        <span class="font-medium">Pending Signature - Not Finalized</span>
      </div>
    </div>
    
    <!-- Footer disclaimer -->
    <div class="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500 text-center">
      <p>This report is for clinical use only. Generated by UtanoBridge Radiology Information System.</p>
    </div>
  </div>
</template>
