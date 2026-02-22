<script setup lang="ts">
import { ref, computed } from 'vue';
import { Mic, MicOff, FileText, Plus, Trash2 } from 'lucide-vue-next';

interface Props {
  findings: string;
  disabled?: boolean;
  modality?: string;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  modality: '',
});

const emit = defineEmits<{
  (e: 'update:findings', value: string): void;
}>();

// Voice recording state
const isRecording = ref(false);
const recognition = ref<SpeechRecognition | null>(null);

// Findings structure
const findingsLines = ref<string[]>([]);

// Initialize from existing findings
const initializeFindings = () => {
  if (props.findings) {
    findingsLines.value = props.findings.split('\n').filter(line => line.trim());
  } else {
    findingsLines.value = [''];
  }
};

initializeFindings();

const updateFindings = () => {
  emit('update:findings', findingsLines.value.join('\n'));
};

const addLine = () => {
  findingsLines.value.push('');
};

const removeLine = (index: number) => {
  if (findingsLines.value.length > 1) {
    findingsLines.value.splice(index, 1);
    updateFindings();
  }
};

// Voice dictation
const toggleRecording = () => {
  if (isRecording.value) {
    stopRecording();
  } else {
    startRecording();
  }
};

const startRecording = () => {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Speech recognition is not supported in this browser.');
    return;
  }

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  recognition.value = new SpeechRecognition();
  recognition.value.continuous = true;
  recognition.value.interimResults = true;

  recognition.value.onresult = (event: SpeechRecognitionEvent) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    
    // Add transcript to current line
    const currentIndex = findingsLines.value.length - 1;
    if (findingsLines.value[currentIndex]) {
      findingsLines.value[currentIndex] += ' ' + transcript;
    } else {
      findingsLines.value[currentIndex] = transcript;
    }
    updateFindings();
  };

  recognition.value.onerror = (event: SpeechRecognitionErrorEvent) => {
    console.error('Speech recognition error:', event.error);
    isRecording.value = false;
  };

  recognition.value.onend = () => {
    isRecording.value = false;
  };

  recognition.value.start();
  isRecording.value = true;
};

const stopRecording = () => {
  if (recognition.value) {
    recognition.value.stop();
    isRecording.value = false;
  }
};

// Keyboard shortcuts
const handleKeydown = (e: KeyboardEvent, index: number) => {
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault();
    addLine();
    // Focus new line after next tick
    setTimeout(() => {
      const textarea = document.querySelector(`#finding-line-${index + 1}`) as HTMLTextAreaElement;
      textarea?.focus();
    }, 10);
  }
  
  if (e.key === 'Tab') {
    e.preventDefault();
    // Add tab character
    const textarea = e.target as HTMLTextAreaElement;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = findingsLines.value[index];
    findingsLines.value[index] = value.substring(0, start) + '\t' + value.substring(end);
    updateFindings();
  }
};

// Quick insert templates
const quickInsert = (text: string) => {
  const currentIndex = findingsLines.value.length - 1;
  findingsLines.value[currentIndex] += (findingsLines.value[currentIndex] ? '\n' : '') + text;
  updateFindings();
};

const templateOptions = [
  { label: 'Grey-white matter', text: 'Grey-white matter differentiation is preserved.' },
  { label: 'No mass effect', text: 'No focal mass effect or midline shift.' },
  { label: 'No hemorrhage', text: 'No abnormal hyperdensity to suggest acute hemorrhage.' },
  { label: 'Ventricles normal', text: 'Ventricles and sulci are appropriate for age.' },
  { label: 'No lesion', text: 'No evidence of mass, lesion, or infarction.' },
  { label: 'Normal study', text: 'No acute abnormality identified.' },
];
</script>

<template>
  <div class="space-y-4">
    <!-- Toolbar -->
    <div class="flex items-center gap-2 flex-wrap">
      <!-- Voice dictation -->
      <button
        v-if="!disabled"
        @click="toggleRecording"
        :class="[
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
          isRecording 
            ? 'bg-red-100 text-red-700 hover:bg-red-200' 
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        ]"
      >
        <Mic v-if="!isRecording" class="w-4 h-4" />
        <MicOff v-else class="w-4 h-4" />
        {{ isRecording ? 'Stop Recording' : 'Voice Dictation' }}
      </button>
      
      <div v-if="isRecording" class="flex items-center gap-2 text-red-600 animate-pulse">
        <span class="w-2 h-2 bg-red-600 rounded-full"></span>
        Recording...
      </div>
      
      <!-- Quick insert dropdown -->
      <div v-if="!disabled" class="relative group">
        <button class="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">
          <FileText class="w-4 h-4" />
          Quick Insert
        </button>
        <div class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-48">
          <button
            v-for="option in templateOptions"
            :key="option.label"
            @click="quickInsert(option.text)"
            class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      
      <!-- Recording indicator -->
      <div v-if="isRecording" class="ml-auto text-xs text-gray-500">
        Press Enter+Shift for new line
      </div>
    </div>
    
    <!-- Findings textarea -->
    <div class="relative">
      <textarea
        v-for="(line, index) in findingsLines"
        :key="index"
        :id="`finding-line-${index}`"
        v-model="findingsLines[index]"
        :disabled="disabled"
        @input="updateFindings"
        @keydown="(e) => handleKeydown(e, index)"
        rows="3"
        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 font-mono text-sm"
        placeholder="Enter findings..."
      />
      
      <!-- Line actions -->
      <div v-if="!disabled && findingsLines.length > 1" class="absolute right-2 top-2">
        <button
          v-for="(line, index) in findingsLines"
          :key="index"
          @click="removeLine(index)"
          class="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100"
          :class="{ 'opacity-100': findingsLines.length > 1 }"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>
    
    <!-- Add line button -->
    <button
      v-if="!disabled"
      @click="addLine"
      class="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
    >
      <Plus class="w-4 h-4" />
      Add new line
    </button>
    
    <!-- Character count -->
    <div class="text-xs text-gray-500">
      {{ findings.length }} characters
    </div>
  </div>
</template>
