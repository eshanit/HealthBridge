<script setup lang="ts">
/**
 * Registration Form Component
 * 
 * Collects patient registration information during the registration stage.
 * This includes: patient name, date of birth, gender, and chief complaint.
 */

import { ref, computed, onMounted } from 'vue';
import type { ClinicalSession } from '~/services/sessionEngine';
import { updateSession, advanceStage } from '~/services/sessionEngine';
import { logStageChange, logStatusChange } from '~/services/clinicalTimeline';

interface Props {
  session: ClinicalSession;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'registered'): void;
  (e: 'error', message: string): void;
}>();

// ============================================
// State
// ============================================

const isSaving = ref(false);
const formData = ref({
  patientId: '',
  patientName: '',
  dateOfBirth: '',
  gender: '' as 'male' | 'female' | 'other' | '',
  chiefComplaint: '',
  notes: ''
});

// ============================================
// Computed
// ============================================

const isValid = computed(() => {
  return formData.value.patientName.trim() !== '' &&
    formData.value.dateOfBirth !== '' &&
    formData.value.gender !== '';
});

// ============================================
// Methods
// ============================================

/**
 * Save registration data and advance to assessment
 */
async function handleSubmit() {
  if (!isValid.value) return;

  try {
    isSaving.value = true;

    // Update session with registration data
    await updateSession(props.session.id, {
      patientName: formData.value.patientName,
      dateOfBirth: formData.value.dateOfBirth,
      gender: formData.value.gender,
      chiefComplaint: formData.value.chiefComplaint,
      notes: formData.value.notes
    });

    // Log stage change
    await logStageChange(props.session.id, 'registration', 'assessment');

    // Advance to assessment stage
    await advanceStage(props.session.id, 'assessment');

    emit('registered');
  } catch (err) {
    console.error('Failed to save registration:', err);
    emit('error', err instanceof Error ? err.message : 'Failed to save registration');
  } finally {
    isSaving.value = false;
  }
}

/**
 * Skip registration (for testing/demo purposes)
 */
async function handleSkip() {
  try {
    isSaving.value = true;
    await logStageChange(props.session.id, 'registration', 'assessment');
    await advanceStage(props.session.id, 'assessment');
    emit('registered');
  } catch (err) {
    console.error('Failed to skip registration:', err);
    emit('error', err instanceof Error ? err.message : 'Failed to skip registration');
  } finally {
    isSaving.value = false;
  }
}

// ============================================
// Lifecycle
// ============================================

onMounted(() => {
  // Load existing data if session already has patient info
  // This would be populated from the session data
});
</script>

<template>
  <div class="registration-form">
    <!-- Form Header -->
    <div class="mb-6">
      <h2 class="text-xl font-semibold text-white mb-2">
        Patient Registration
      </h2>
      <p class="text-gray-400 text-sm">
        Collect patient information before beginning assessment.
      </p>
    </div>

    <!-- Registration Form -->
    <UCard>
      <template #header>
        <h3 class="font-medium text-white">
          Patient Information
        </h3>
      </template>

      <div class="space-y-4">
        <!-- External Patient ID (Optional) -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">
            External Patient ID
            <span class="text-gray-500 ml-1">(optional)</span>
          </label>
          <UInput
            v-model="formData.patientId"
            placeholder="Enter ID from external system"
            size="lg"
            class="w-full"
          />
          <p class="text-xs text-gray-500 mt-1">
            Link to an existing patient record in your external system
          </p>
        </div>

        <!-- Patient Name -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">
            Patient Name <span class="text-red-500">*</span>
          </label>
          <UInput
            v-model="formData.patientName"
            placeholder="Enter patient's full name"
            size="lg"
            class="w-full"
          />
        </div>

        <!-- Date of Birth -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">
            Date of Birth <span class="text-red-500">*</span>
          </label>
          <UInput
            v-model="formData.dateOfBirth"
            type="date"
            size="lg"
            class="w-full"
          />
        </div>

        <!-- Gender -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">
            Gender <span class="text-red-500">*</span>
          </label>
          <URadioGroup
            v-model="formData.gender"
            :items="[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
              { value: 'other', label: 'Other' }
            ]"
          />
        </div>

        <!-- Chief Complaint -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">
            Chief Complaint
          </label>
          <UTextarea
            v-model="formData.chiefComplaint"
            placeholder="Describe the reason for visit"
            :rows="3"
            class="w-full"
          />
        </div>

        <!-- Additional Notes -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">
            Additional Notes
          </label>
          <UTextarea
            v-model="formData.notes"
            placeholder="Any additional information"
            :rows="2"
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-4">
          <UButton
            variant="ghost"
            color="neutral"
            :loading="isSaving"
            @click="handleSkip"
          >
            Skip (Demo)
          </UButton>

          <UButton
            color="primary"
            :loading="isSaving"
            :disabled="!isValid"
            @click="handleSubmit"
          >
            Complete Registration
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
