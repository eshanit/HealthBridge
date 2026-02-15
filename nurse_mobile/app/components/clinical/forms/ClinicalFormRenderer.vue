<script setup lang="ts">

// AUTO-GENERATED FROM clinical-form-engine.md
// DO NOT EDIT WITHOUT UPDATING THE SPEC

import { ref, computed, onMounted } from 'vue';
import { formEngine } from '@/services/formEngine';
import type { ClinicalFormSchema, ClinicalFormInstance } from '~/types/clinical-form';

const props = defineProps<{
  schemaId: string;
  patientId?: string;
  formId?: string;
}>();

const emit = defineEmits<{
  (e: 'complete', instance: ClinicalFormInstance): void;
  (e: 'save', instance: ClinicalFormInstance): void;
  (e: 'error', error: Error): void;
}>();

const schema = ref<ClinicalFormSchema | null>(null);
const instance = ref<ClinicalFormInstance | null>(null);
const isLoading = ref(true);
const isSaving = ref(false);
const currentSectionIndex = ref(0);
const errors = ref<string[]>([]);

// Navigation
const formSections = computed(() => schema.value?.sections || []);
const currentSection = computed(() => formSections.value[currentSectionIndex.value]);
const currentFields = computed(() => {
  if (!currentSection.value || !instance.value) return [];
  return formEngine.getSectionFields(currentSection.value.id, instance.value, schema.value!);
});

const isFirstSection = computed(() => currentSectionIndex.value === 0);
const isLastSection = computed(() => currentSectionIndex.value === formSections.value.length - 1);

const progress = computed(() => 
  schema.value ? ((currentSectionIndex.value + 1) / formSections.value.length) * 100 : 0
);

// Triage display
const triageResult = computed(() => instance.value?.calculated?.triagePriority || 'green');
const triageClass = computed(() => ({
  'bg-red-500': triageResult.value === 'red',
  'bg-yellow-500': triageResult.value === 'yellow',
  'bg-green-500': triageResult.value === 'green',
}));

onMounted(async () => {
  try {
    isLoading.value = true;
    
    // Load schema
    schema.value = await formEngine.loadSchema(props.schemaId);
    
    // Create or load instance
    if (props.formId) {
      instance.value = await formEngine.loadInstance(props.formId);
    } else {
      instance.value = await formEngine.createInstance(
        props.schemaId,
        props.patientId || 'unknown'
      );
    }
    
    isLoading.value = false;
  } catch (error) {
    console.error('[ClinicalFormRenderer] Failed to initialize:', error);
    errors.value.push('Failed to load form. Please try again.');
    emit('error', error as Error);
    isLoading.value = false;
  }
});

async function saveField(fieldId: string, value: any) {
  if (!instance.value) return;
  
  try {
    const result = await formEngine.saveFieldValue(instance.value._id, fieldId, value);
    instance.value = result.formInstance;
    emit('save', instance.value);
  } catch (error) {
    console.error('[ClinicalFormRenderer] Failed to save field:', error);
  }
}

function nextSection() {
  if (!isLastSection.value) {
    currentSectionIndex.value++;
  } else {
    completeForm();
  }
}

function previousSection() {
  if (!isFirstSection.value) {
    currentSectionIndex.value--;
  }
}

async function completeForm() {
  if (!instance.value) return;
  
  try {
    isSaving.value = true;
    
    // Transition to complete state
    const result = await formEngine.transitionState(instance.value._id, 'complete');
    
    if (result.allowed) {
      instance.value = await formEngine.loadInstance(instance.value._id);
      emit('complete', instance.value);
    } else {
      errors.value.push(result.reason || 'Cannot complete form');
    }
    
    isSaving.value = false;
  } catch (error) {
    console.error('[ClinicalFormRenderer] Failed to complete:', error);
    errors.value.push('Failed to complete form');
    isSaving.value = false;
  }
}

function getFieldValue(fieldId: string): any {
  return instance.value?.answers[fieldId];
}

function setFieldValue(fieldId: string, value: any) {
  saveField(fieldId, value);
}

// Expose for parent components
defineExpose({
  instance,
  schema,
  currentSection,
  currentFields,
  nextSection,
  previousSection,
  completeForm,
  getFieldValue,
  setFieldValue,
});
</script>

<template>
  <div class="clinical-form-renderer">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="errors.length > 0" class="p-4 bg-red-900/30 border border-red-700 rounded-lg">
      <p v-for="error in errors" :key="error" class="text-red-400">{{ error }}</p>
    </div>

    <!-- Form Content -->
    <template v-else-if="schema && instance">
      <!-- Progress Bar -->
      <div class="mb-4">
        <div class="flex justify-between text-sm text-gray-400 mb-1">
          <span>Section {{ currentSectionIndex + 1 }} of {{ formSections.length }}</span>
          <span>{{ currentSection?.title }}</span>
        </div>
        <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            class="h-full bg-blue-500 transition-all duration-300"
            :style="{ width: `${progress}%` }"
          ></div>
        </div>
      </div>

      <!-- Section Title -->
      <h2 class="text-xl font-bold text-white mb-4">{{ currentSection?.title }}</h2>
      <p v-if="currentSection?.description" class="text-gray-400 text-sm mb-4">
        {{ currentSection.description }}
      </p>

      <!-- Triage Badge -->
      <div v-if="instance.calculated?.triagePriority" class="mb-4 p-3 rounded-lg" :class="triageClass">
        <span class="text-white font-medium">
          Triage: {{ instance.calculated.triagePriority.toUpperCase() }}
        </span>
      </div>

      <!-- Fields would be rendered here -->
      <div class="space-y-4">
        <slot name="fields" :fields="currentFields" :get-value="getFieldValue" :set-value="setFieldValue"></slot>
      </div>

      <!-- Navigation -->
      <div class="flex justify-between mt-6 pt-4 border-t border-gray-700">
        <button 
          v-if="!isFirstSection"
          @click="previousSection"
          class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
        >
          Previous
        </button>
        <div v-else></div>

        <button 
          v-if="!isLastSection"
          @click="nextSection"
          class="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg"
        >
          Next
        </button>
        <button 
          v-else
          @click="completeForm"
          :disabled="isSaving"
          class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-green-800 text-white rounded-lg"
        >
          {{ isSaving ? 'Saving...' : 'Complete' }}
        </button>
      </div>
    </template>
  </div>
</template>
