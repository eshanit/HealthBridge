<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Lightbulb, Copy, ArrowRight, Sparkles } from 'lucide-vue-next';

interface Props {
  impression: string;
  disabled?: boolean;
  findings?: string;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  findings: '',
});

const emit = defineEmits<{
  (e: 'update:impression', value: string): void;
}>();

// Impression points
const impressionPoints = ref<string[]>([]);

// AI suggestion loading
const isLoadingSuggestion = ref(false);

// Initialize from existing impression
const initializeImpression = () => {
  if (props.impression) {
    // Split by numbered points or newlines
    impressionPoints.value = props.impression
      .split(/\n+/)
      .map(p => p.replace(/^\d+\.\s*/, '').trim())
      .filter(p => p);
  } else {
    impressionPoints.value = [''];
  }
};

initializeImpression();

// Watch for external changes
watch(() => props.impression, initializeImpression);

// Generate impression from findings (simple extraction)
const generateFromFindings = () => {
  if (!props.findings) return;
  
  // Simple heuristic: extract lines with "No" or "Normal" or "abnormal"
  const lines = props.findings.split('\n');
  const keyFindings = lines.filter(line => {
    const lower = line.toLowerCase();
    return lower.includes('no ') || 
           lower.includes('normal') || 
           lower.includes('abnormal') ||
           lower.includes('positive') ||
           lower.includes('concern');
  });
  
  if (keyFindings.length > 0) {
    impressionPoints.value = keyFindings.map(f => f.trim()).slice(0, 3);
  } else {
    impressionPoints.value = ['No acute abnormality identified.'];
  }
  
  updateImpression();
};

const updateImpression = () => {
  // Number the points
  const numbered = impressionPoints.value
    .map((p, i) => `${i + 1}. ${p}`)
    .join('\n');
  emit('update:impression', numbered);
};

const addPoint = () => {
  impressionPoints.value.push('');
};

const removePoint = (index: number) => {
  if (impressionPoints.value.length > 1) {
    impressionPoints.value.splice(index, 1);
    updateImpression();
  }
};

const movePoint = (index: number, direction: 'up' | 'down') => {
  const newIndex = direction === 'up' ? index - 1 : index + 1;
  if (newIndex >= 0 && newIndex < impressionPoints.value.length) {
    const temp = impressionPoints.value[index];
    impressionPoints.value[index] = impressionPoints.value[newIndex];
    impressionPoints.value[newIndex] = temp;
    updateImpression();
  }
};

// AI suggestion (placeholder - would call AI API)
const getAISuggestion = async () => {
  if (!props.findings) return;
  
  isLoadingSuggestion.value = true;
  
  try {
    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Placeholder AI suggestions - in production this would call the AI API
    const suggestions = [
      'No acute intracranial abnormality identified.',
      'Consider follow-up imaging in 6-12 months if clinically indicated.',
    ];
    
    // Add as new points
    suggestions.forEach(s => {
      impressionPoints.value.push(s);
    });
    
    updateImpression();
  } catch (error) {
    console.error('AI suggestion failed:', error);
  } finally {
    isLoadingSuggestion.value = false;
  }
};
</script>

<template>
  <div class="space-y-4">
    <!-- Toolbar -->
    <div class="flex items-center gap-2 flex-wrap">
      <!-- Generate from findings -->
      <button
        v-if="!disabled && findings"
        @click="generateFromFindings"
        class="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
      >
        <Copy class="w-4 h-4" />
        Extract from Findings
      </button>
      
      <!-- AI suggestion -->
      <button
        v-if="!disabled && findings"
        @click="getAISuggestion"
        :disabled="isLoadingSuggestion"
        class="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200 disabled:opacity-50"
      >
        <Sparkles v-if="!isLoadingSuggestion" class="w-4 h-4" />
        <span v-if="isLoadingSuggestion" class="animate-spin">⏳</span>
        {{ isLoadingSuggestion ? 'Analyzing...' : 'AI Suggest' }}
      </button>
      
      <span v-if="!findings" class="text-sm text-gray-500">
        Add findings first to enable AI suggestions
      </span>
    </div>
    
    <!-- Impression points -->
    <div class="space-y-3">
      <div
        v-for="(point, index) in impressionPoints"
        :key="index"
        class="flex items-start gap-3"
      >
        <!-- Number badge -->
        <div class="mt-3 flex flex-col items-center gap-1">
          <span class="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
            {{ index + 1 }}
          </span>
          
          <!-- Move buttons -->
          <div v-if="!disabled" class="flex flex-col">
            <button
              @click="movePoint(index, 'up')"
              :disabled="index === 0"
              class="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
            >
              <ArrowRight class="w-3 h-3 -rotate-90" />
            </button>
            <button
              @click="movePoint(index, 'down')"
              :disabled="index === impressionPoints.length - 1"
              class="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
            >
              <ArrowRight class="w-3 h-3 rotate-90" />
            </button>
          </div>
        </div>
        
        <!-- Text input -->
        <textarea
          v-model="impressionPoints[index]"
          :disabled="disabled"
          @input="updateImpression"
          rows="2"
          class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          :placeholder="`Impression point ${index + 1}...`"
        />
        
        <!-- Remove button -->
        <button
          v-if="!disabled && impressionPoints.length > 1"
          @click="removePoint(index)"
          class="p-2 text-gray-400 hover:text-red-500 mt-1"
        >
          ×
        </button>
      </div>
    </div>
    
    <!-- Add point button -->
    <button
      v-if="!disabled"
      @click="addPoint"
      class="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
    >
      <span class="text-lg">+</span>
      Add impression point
    </button>
    
    <!-- Character count -->
    <div class="text-xs text-gray-500">
      {{ impression.length }} characters
    </div>
  </div>
</template>
