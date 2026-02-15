<script setup lang="ts">
/**
 * Voice Input Button Component
 * 
 * Phase 3.1 Task 3.1.2: UI component for voice-to-text input
 * Provides a button for hands-free clinical documentation
 * Supports English, Shona, and Ndebele languages
 */


// import { useVoiceInput, type VoiceLanguage, type VoiceInputResult } from '~/composables/useVoiceInput';

// ============================================
// Props
// ============================================

interface Props {
  /** Language for speech recognition */
  language?: VoiceLanguage;
  /** Placeholder text when not recording */
  placeholder?: string;
  /** Show transcript preview below button */
  showPreview?: boolean;
  /** Enable medical terminology detection */
  medicalMode?: boolean;
  /** Auto-apply transcript to form field */
  autoApply?: boolean;
  /** Maximum recording duration in seconds */
  maxDurationSeconds?: number;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Color variant */
  color?: 'primary' | 'secondary' | 'danger';
  /** Disabled state */
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  language: 'en',
  placeholder: 'Click to start voice input',
  showPreview: true,
  medicalMode: true,
  autoApply: false,
  maxDurationSeconds: 60,
  size: 'md',
  color: 'primary',
  disabled: false
});

// ============================================
// Emits
// ============================================

const emit = defineEmits<{
  /** Emitted when transcript is ready */
  (e: 'transcript', value: string): void;
  /** Emitted when recording starts */
  (e: 'start'): void;
  /** Emitted when recording stops */
  (e: 'stop', result: VoiceInputResult | null): void;
  /** Emitted on error */
  (e: 'error', message: string): void;
  /** Emitted when medical terms are detected */
  (e: 'medical-terms', terms: string[]): void;
}>();

// ============================================
// Composable
// ============================================

const {
  isRecording,
  recognitionState,
  transcript,
  interimTranscript,
  fullTranscript,
  confidence,
  languageName,
  error,
  recordingDuration,
  allMedicalTerms,
  isSupported,
  startRecording,
  stopRecording,
  clearTranscript,
  setLanguage
} = useVoiceInput({
  language: props.language,
  medicalMode: props.medicalMode,
  maxDuration: props.maxDurationSeconds * 1000
});

// ============================================
// State
// ============================================

const showLanguageMenu = ref(false);
const selectedLanguage = ref<VoiceLanguage>(props.language);

// ============================================
// Computed
// ============================================

const buttonLabel = computed(() => {
  if (!isSupported.value) {
    return 'Voice not supported';
  }
  
  switch (recognitionState.value) {
    case 'listening':
      return 'Listening...';
    case 'processing':
      return 'Processing...';
    case 'error':
      return 'Error - Tap to retry';
    default:
      return props.placeholder;
  }
});

const formattedDuration = computed(() => {
  const seconds = Math.floor(recordingDuration.value / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${remainingSeconds}s`;
});

const confidencePercent = computed(() => {
  return Math.round(confidence.value * 100);
});

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'px-3 py-1.5 text-sm';
    case 'lg':
      return 'px-6 py-3 text-lg';
    default:
      return 'px-4 py-2 text-base';
  }
});

const colorClasses = computed(() => {
  if (isRecording.value) {
    return 'bg-red-600 hover:bg-red-500 border-red-500';
  }
  
  switch (props.color) {
    case 'secondary':
      return 'bg-gray-600 hover:bg-gray-500 border-gray-500';
    case 'danger':
      return 'bg-red-600 hover:bg-red-500 border-red-500';
    default:
      return 'bg-purple-600 hover:bg-purple-500 border-purple-500';
  }
});

const languages: { code: VoiceLanguage; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'sn', name: 'Shona' },
  { code: 'nd', name: 'Ndebele' }
];

// ============================================
// Watchers
// ============================================

watch(() => props.language, (newLang) => {
  selectedLanguage.value = newLang;
  setLanguage(newLang);
});

watch(fullTranscript, (newTranscript) => {
  if (newTranscript && props.autoApply) {
    emit('transcript', newTranscript);
  }
});

watch(allMedicalTerms, (terms) => {
  if (terms.length > 0) {
    emit('medical-terms', terms);
  }
});

watch(error, (newError) => {
  if (newError) {
    emit('error', newError);
  }
});

// ============================================
// Methods
// ============================================

function handleButtonClick() {
  if (props.disabled || !isSupported.value) return;
  
  if (isRecording.value) {
    const result = stopRecording();
    emit('stop', result);
    if (result?.transcript && !props.autoApply) {
      emit('transcript', result.transcript);
    }
  } else {
    startRecording();
    emit('start');
  }
}

function selectLanguage(lang: VoiceLanguage) {
  selectedLanguage.value = lang;
  setLanguage(lang);
  showLanguageMenu.value = false;
}

function handleApply() {
  if (fullTranscript.value) {
    emit('transcript', fullTranscript.value);
  }
}

function handleClear() {
  clearTranscript();
}
</script>

<template>
  <div class="voice-input-container">
    <!-- Main Button -->
    <div class="flex items-center gap-2">
      <button
        @click="handleButtonClick"
        :disabled="disabled || !isSupported"
        :class="[
          'voice-input-btn flex items-center gap-2 rounded-lg font-medium transition-all duration-200 border',
          sizeClasses,
          colorClasses,
          { 'opacity-50 cursor-not-allowed': disabled || !isSupported },
          { 'animate-pulse': isRecording }
        ]"
      >
        <!-- Recording Icon -->
        <svg 
          v-if="isRecording" 
          class="w-5 h-5 animate-pulse" 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            stroke-linecap="round" 
            stroke-linejoin="round" 
            stroke-width="2" 
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" 
          />
        </svg>
        
        <!-- Microphone Icon -->
        <svg 
          v-else 
          class="w-5 h-5" 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            stroke-linecap="round" 
            stroke-linejoin="round" 
            stroke-width="2" 
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" 
          />
        </svg>
        
        <span>{{ buttonLabel }}</span>
        
        <!-- Duration Badge -->
        <span 
          v-if="isRecording" 
          class="px-2 py-0.5 bg-white/20 rounded text-xs font-mono"
        >
          {{ formattedDuration }}
        </span>
      </button>
      
      <!-- Language Selector -->
      <div class="relative">
        <button
          @click="showLanguageMenu = !showLanguageMenu"
          class="px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 transition-colors"
          :disabled="isRecording"
        >
          {{ languageName }}
          <svg class="inline w-4 h-4 ml-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        <!-- Language Dropdown -->
        <div 
          v-if="showLanguageMenu" 
          class="absolute top-full mt-1 right-0 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-10 min-w-[120px]"
        >
          <button
            v-for="lang in languages"
            :key="lang.code"
            @click="selectLanguage(lang.code)"
            :class="[
              'w-full px-3 py-2 text-left text-sm hover:bg-gray-700 transition-colors',
              { 'bg-purple-600/30': selectedLanguage === lang.code }
            ]"
          >
            {{ lang.name }}
          </button>
        </div>
      </div>
    </div>
    
    <!-- Error Message -->
    <div 
      v-if="error" 
      class="mt-2 p-2 bg-red-900/30 border border-red-700/50 rounded text-red-400 text-sm"
    >
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        {{ error }}
      </div>
    </div>
    
    <!-- Transcript Preview -->
    <div v-if="showPreview && (fullTranscript || interimTranscript)" class="mt-3">
      <!-- Interim (in-progress) transcript -->
      <div 
        v-if="interimTranscript && isRecording" 
        class="p-3 bg-gray-700/50 rounded-lg border border-gray-600 text-gray-400 italic text-sm mb-2"
      >
        {{ interimTranscript }}
        <span class="animate-pulse">|</span>
      </div>
      
      <!-- Final transcript -->
      <div v-if="fullTranscript" class="bg-gray-800 rounded-lg border border-gray-600 overflow-hidden">
        <div class="p-3 text-gray-200 text-sm leading-relaxed">
          {{ fullTranscript }}
        </div>
        
        <!-- Confidence & Medical Terms -->
        <div class="px-3 py-2 bg-gray-700/50 border-t border-gray-600 flex items-center justify-between text-xs">
          <div class="flex items-center gap-3">
            <!-- Confidence -->
            <span 
              :class="[
                'px-2 py-0.5 rounded',
                confidencePercent >= 80 ? 'bg-green-600/30 text-green-400' :
                confidencePercent >= 50 ? 'bg-yellow-600/30 text-yellow-400' :
                'bg-red-600/30 text-red-400'
              ]"
            >
              {{ confidencePercent }}% confidence
            </span>
            
            <!-- Medical Terms -->
            <span 
              v-if="allMedicalTerms.length > 0" 
              class="px-2 py-0.5 rounded bg-purple-600/30 text-purple-400"
            >
              {{ allMedicalTerms.length }} medical terms
            </span>
          </div>
          
          <!-- Actions -->
          <div class="flex items-center gap-2">
            <button 
              @click="handleApply"
              class="px-2 py-1 bg-purple-600 hover:bg-purple-500 rounded text-white transition-colors"
            >
              Apply
            </button>
            <button 
              @click="handleClear"
              class="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-gray-300 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Recording Indicator (Visual Feedback) -->
    <div 
      v-if="isRecording" 
      class="mt-3 flex items-center justify-center gap-1"
    >
      <span class="w-2 h-2 bg-red-500 rounded-full animate-pulse" style="animation-delay: 0ms;"></span>
      <span class="w-2 h-2 bg-red-500 rounded-full animate-pulse" style="animation-delay: 150ms;"></span>
      <span class="w-2 h-2 bg-red-500 rounded-full animate-pulse" style="animation-delay: 300ms;"></span>
      <span class="text-xs text-gray-400 ml-2">Recording in {{ languageName }}...</span>
    </div>
  </div>
</template>

<style scoped>
.voice-input-btn {
  min-width: 140px;
}

/* Pulse animation for recording */
@keyframes pulse-ring {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}

.voice-input-btn.animate-pulse {
  animation: pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
