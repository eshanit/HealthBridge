<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { FileText, X, Search, ChevronRight } from 'lucide-vue-next';

interface Template {
  findings: string;
  impression: string;
  recommendations: string;
}

interface Props {
  modality?: string;
  bodyPart?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'select', template: Template): void;
  (e: 'close'): void;
}>();

const templates = ref<Record<string, Record<string, Template>>>({});
const isLoading = ref(true);
const searchQuery = ref('');
const selectedModality = ref(props.modality || '');
const selectedBodyPart = ref(props.bodyPart || '');

// Load templates from API
onMounted(async () => {
  try {
    const response = await fetch('/radiology/reports/templates');
    if (response.ok) {
      const data = await response.json();
      templates.value = data.templates;
      if (props.modality) {
        selectedModality.value = props.modality;
      }
    }
  } catch (error) {
    console.error('Failed to load templates:', error);
  } finally {
    isLoading.value = false;
  }
});

const modalities = computed(() => Object.keys(templates.value));
const bodyParts = computed(() => {
  if (!selectedModality.value) return [];
  return Object.keys(templates.value[selectedModality.value] || {});
});

const filteredTemplates = computed(() => {
  if (!selectedModality.value || !selectedBodyPart.value) return [];
  return templates.value[selectedModality.value]?.[selectedBodyPart.value];
});

const selectTemplate = () => {
  if (filteredTemplates.value) {
    emit('select', filteredTemplates.value);
  }
};

import { computed } from 'vue';
</script>

<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-900">Report Templates</h3>
          <p class="text-sm text-gray-500">Select a template to apply to your report</p>
        </div>
        <button
          @click="$emit('close')"
          class="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X class="w-5 h-5 text-gray-500" />
        </button>
      </div>
      
      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        <div v-if="isLoading" class="text-center py-8 text-gray-500">
          Loading templates...
        </div>
        
        <div v-else class="space-y-4">
          <!-- Search -->
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search templates..."
              class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <!-- Modality selector -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Modality</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="mod in modalities"
                :key="mod"
                @click="selectedModality = mod; selectedBodyPart = ''"
                :class="[
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  selectedModality === mod
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                ]"
              >
                {{ mod }}
              </button>
            </div>
          </div>
          
          <!-- Body part selector -->
          <div v-if="selectedModality">
            <label class="block text-sm font-medium text-gray-700 mb-2">Body Part</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="bp in bodyParts"
                :key="bp"
                @click="selectedBodyPart = bp"
                :class="[
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  selectedBodyPart === bp
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                ]"
              >
                {{ bp }}
              </button>
            </div>
          </div>
          
          <!-- Template preview -->
          <div v-if="filteredTemplates" class="mt-6 p-4 bg-gray-50 rounded-lg space-y-4">
            <div>
              <h4 class="text-sm font-medium text-gray-700 mb-2">Findings Preview</h4>
              <div class="text-sm text-gray-600 whitespace-pre-wrap bg-white p-3 rounded border border-gray-200 max-h-32 overflow-y-auto">
                {{ filteredTemplates.findings }}
              </div>
            </div>
            
            <div>
              <h4 class="text-sm font-medium text-gray-700 mb-2">Impression Preview</h4>
              <div class="text-sm text-gray-600 whitespace-pre-wrap bg-white p-3 rounded border border-gray-200 max-h-24 overflow-y-auto">
                {{ filteredTemplates.impression }}
              </div>
            </div>
            
            <div>
              <h4 class="text-sm font-medium text-gray-700 mb-2">Recommendations Preview</h4>
              <div class="text-sm text-gray-600 whitespace-pre-wrap bg-white p-3 rounded border border-gray-200 max-h-16 overflow-y-auto">
                {{ filteredTemplates.recommendations }}
              </div>
            </div>
          </div>
          
          <!-- Empty state -->
          <div v-if="!selectedModality" class="text-center py-8 text-gray-500">
            Select a modality to view available templates
          </div>
          
          <div v-if="selectedModality && !selectedBodyPart" class="text-center py-8 text-gray-500">
            Select a body part to view available templates
          </div>
        </div>
      </div>
      
      <!-- Footer -->
      <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
        <button
          @click="$emit('close')"
          class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          @click="selectTemplate"
          :disabled="!filteredTemplates"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <FileText class="w-4 h-4" />
          Apply Template
        </button>
      </div>
    </div>
  </div>
</template>
