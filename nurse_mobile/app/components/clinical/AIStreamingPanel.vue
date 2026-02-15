<script setup lang="ts">
/**
 * AI Streaming Panel Component
 * 
 * Displays streaming AI responses with progress tracking
 * Phase 3 Integration: Voice Output and Feedback Panel
 */
import { computed, ref, watch, onMounted, nextTick } from 'vue';
import { useVoiceOutput } from '~/composables/useVoiceOutput';
import AIFeedbackPanel from '~/components/clinical/AIFeedbackPanel.vue';

interface Props {
  isStreaming: boolean;
  streamingText: string;
  progressPercent: number;
  tokensGenerated: number;
  estimatedTotalTokens?: number;
  estimatedTimeRemaining?: string;
  modelVersion?: string;
  error?: string;
  errorTitle?: string;
  errorDetails?: string;
  canRetry?: boolean;
  completionTime?: string;
  generationTime?: number;
  /** Session ID for feedback */
  sessionId?: string;
  /** Section ID for feedback */
  sectionId?: string;
  /** Response ID for feedback */
  responseId?: string;
  /** Enable voice output */
  enableVoice?: boolean;
  /** Enable feedback panel */
  enableFeedback?: boolean;
  /** Warning count for session escalation (Phase 4) */
  warningCount?: number;
  /** Risk score from safety orchestrator (Phase 4) */
  riskScore?: number;
  /** Whether AI is disabled due to escalation (Phase 4) */
  isEscalated?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  estimatedTotalTokens: undefined,
  estimatedTimeRemaining: undefined,
  modelVersion: undefined,
  error: undefined,
  errorTitle: undefined,
  errorDetails: undefined,
  canRetry: false,
  completionTime: undefined,
  generationTime: undefined,
  sessionId: undefined,
  sectionId: undefined,
  responseId: undefined,
  enableVoice: true,
  enableFeedback: true,
  warningCount: 0,
  riskScore: 0,
  isEscalated: false
});

const emit = defineEmits<{
  cancel: [];
  dismiss: [];
  retry: [];
  feedbackSubmitted: [feedback: any];
}>();

// Voice output
const { speak, stop, isSpeaking } = useVoiceOutput();

function handleSpeak() {
  if (isSpeaking.value) {
    stop();
  } else {
    speak(props.streamingText, { language: 'en', rate: 0.9 });
  }
}

function handleFeedbackSubmitted(feedback: any) {
  emit('feedbackSubmitted', feedback);
}

// Refs
const textContainer = ref<HTMLElement | null>(null);
const copied = ref(false);
const displayedText = ref('');
const isBuffering = ref(false);

// Parse text into paragraphs and words for animation
const displayedParagraphs = computed(() => {
  const rawText = displayedText.value || props.streamingText || '';
  if (!rawText.trim()) return [];
  
  // Deduplicate repeated content
  const dedupedText = deduplicateStreamingContent(rawText);
  
  // Normalize text: remove excessive spaces and normalize newlines
  const normalizedText = normalizeStreamingText(dedupedText);
  
  // Split by newlines and filter empty lines
  const paragraphs = normalizedText.split(/\n+/).filter(p => p.trim());
  
  return paragraphs.map(paragraph => {
    // Split into words while preserving punctuation
    const words = paragraph.trim().split(/(\s+)/);
    return words
      .filter(word => word.length > 0)
      .map(text => ({ text, completed: true }));
  });
});

/**
 * Deduplicate repeated content in streaming text
 * Removes repeated paragraphs and sequences
 */
function deduplicateStreamingContent(text: string): string {
  // Split into paragraphs first
  const paragraphs = text.split(/\n{2,}/);
  
  if (paragraphs.length <= 1) {
    // For single paragraph, check for repeated phrases
    return deduplicateRepeatedPhrases(text);
  }
  
  // Remove consecutive duplicate paragraphs
  const uniqueParagraphs: string[] = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed && !uniqueParagraphs.includes(trimmed)) {
      uniqueParagraphs.push(trimmed);
    }
  }
  
  return uniqueParagraphs.join('\n\n');
}

/**
 * Detect and remove repeated phrases within text
 */
function deduplicateRepeatedPhrases(text: string): string {
  // Look for repeated sentences/sequences
  const sentences = text.split(/(?<=[.!?])\s+/);
  const uniqueSentences: string[] = [];
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > 10) { // Only check meaningful sentences
      // Check if this sentence is a repeat of previous content
      const isDuplicate = uniqueSentences.some(
        existing => levenshteinDistance(existing.toLowerCase(), trimmed.toLowerCase()) < trimmed.length * 0.3
      );
      if (!isDuplicate) {
        uniqueSentences.push(trimmed);
      }
    } else {
      uniqueSentences.push(trimmed);
    }
  }
  
  return uniqueSentences.join(' ');
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  // Initialize matrix with proper typing
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [] as number[];
    matrix[i]![0] = i;
  }
  
  // Initialize the first row
  for (let j = 1; j <= a.length; j++) {
    matrix[0]![j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j]! + 1
        );
      }
    }
  }
  
  return matrix[b.length]![a.length]!;
}

/**
 * Normalize streaming text for better display
 */
function normalizeStreamingText(text: string): string {
  return text
    // Normalize multiple newlines
    .replace(/\n{4,}/g, '\n\n\n')
    // Fix spacing after periods
    .replace(/\.([A-Z])/g, '. $1')
    // Fix spacing after question marks
    .replace(/\?([A-Z])/g, '? $1')
    // Fix spacing after exclamation marks
    .replace(/\!([A-Z])/g, '! $1')
    // Normalize spaces
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// Word count
const wordCount = computed(() => {
  const text = props.streamingText || '';
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
});

// Progress label
const progressLabel = computed(() => {
  if (props.error) return 'Generation failed';
  if (props.isStreaming) return 'Generating response...';
  if (props.streamingText) return 'Complete';
  return 'Preparing...';
});

// Formatted text with proper spacing
const formattedText = computed(() => {
  const text = props.streamingText;
  if (!text) return '';
  
  // Normalize whitespace while preserving intentional line breaks
  return text
    .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
    .replace(/[ \t]+/g, ' ')    // Normalize horizontal whitespace
    .trim();
});

// Status dot class
const statusDotClass = computed(() => {
  if (props.error) return 'bg-red-400 shadow-lg shadow-red-400/50';
  if (props.isStreaming) return 'bg-purple-400 shadow-lg shadow-purple-400/50';
  return 'bg-gray-400';
});

// Status ping class
const statusPingClass = computed(() => {
  return props.error ? 'bg-red-400' : 'bg-purple-400';
});

// Status ring class
const statusRingClass = computed(() => {
  return props.error ? 'bg-red-400/30' : 'bg-purple-400/30';
});

// Status text
const statusText = computed(() => {
  if (props.error) return 'Connection error';
  if (props.isStreaming) return 'Streaming...';
  if (props.streamingText) return 'Complete';
  return 'Ready';
});

// Status text class
const statusTextClass = computed(() => {
  if (props.error) return 'text-red-400';
  if (props.isStreaming) return 'text-purple-400';
  return 'text-green-400';
});

// Copy to clipboard function
const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(props.streamingText);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy text:', err);
  }
};

// Smooth text update with word-by-word animation
watch(() => props.streamingText, (newText, oldText) => {
  if (!newText) {
    displayedText.value = '';
    return;
  }

  // Check if this is a significant update (new content added)
  if (oldText && newText.length > oldText.length) {
    const addedContent = newText.slice(oldText.length);
    
    // Add new content with smooth transition
    isBuffering.value = true;
    displayedText.value = newText;
    
    nextTick(() => {
      isBuffering.value = false;
    });
  } else {
    displayedText.value = newText;
  }
});

// Scroll to bottom when new content arrives
watch(displayedParagraphs, () => {
  if (props.isStreaming && textContainer.value) {
    nextTick(() => {
      textContainer.value?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }
}, { deep: true });

// Reset displayed text when streaming starts
watch(() => props.isStreaming, (streaming) => {
  if (streaming) {
    displayedText.value = '';
  }
});

// Log prop changes for debugging
watch(() => props.progressPercent, (newVal) => {
  console.log('[AIStreamingPanel] progressPercent:', newVal?.toFixed(0) || 0, '%');
});

watch(() => props.tokensGenerated, (newVal) => {
  console.log('[AIStreamingPanel] tokensGenerated:', newVal || 0);
});

watch(() => props.error, (newError) => {
  if (newError) {
    console.log('[AIStreamingPanel] Error occurred:', newError);
  }
});
</script>

<template>
  <div 
    v-if="isStreaming || progressPercent > 0 || formattedText"
    class="ai-streaming-panel bg-gray-900/95 rounded-xl border border-purple-700/30 p-4 md:p-5 backdrop-blur-sm transition-all duration-300"
    :class="{ 'ring-2 ring-purple-500/30': isStreaming }"
    role="status"
    aria-live="polite"
  >
    <!-- Header with connection status -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1.5">
          <div class="relative">
            <div 
              class="w-3 h-3 rounded-full transition-all duration-300" 
              :class="statusDotClass"
            ></div>
            <div 
              v-if="isStreaming" 
              class="absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-75"
              :class="statusPingClass"
            ></div>
            <!-- Pulse ring effect -->
            <div 
              v-if="isStreaming"
              class="absolute inset-0 w-3 h-3 rounded-full animate-pulse"
              :class="statusRingClass"
            ></div>
          </div>
          <span class="text-sm font-medium" :class="statusTextClass">
            {{ statusText }}
          </span>
        </div>
        <span v-if="modelVersion" class="text-xs text-purple-400 px-2 py-0.5 bg-purple-900/30 rounded-full">
          {{ modelVersion }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Retry button on error -->
        <button 
          v-if="error && canRetry"
          @click="$emit('retry')"
          class="text-xs px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors flex items-center gap-1"
          aria-label="Retry AI generation"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Retry
        </button>

        <!-- Copy button when complete -->
        <button 
          v-if="!isStreaming && formattedText && !error"
          @click="copyToClipboard"
          class="text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors flex items-center gap-1"
          :class="{ 'copied': copied }"
          aria-label="Copy AI response"
        >
          <svg v-if="!copied" xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          {{ copied ? 'Copied' : 'Copy' }}
        </button>

        <!-- Voice Output button when complete -->
        <button 
          v-if="!isStreaming && formattedText && !error && enableVoice"
          @click="handleSpeak"
          class="text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
          :class="isSpeaking ? 'bg-purple-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'"
          aria-label="Read AI response aloud"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          {{ isSpeaking ? 'Stop' : 'Read' }}
        </button>

        <!-- Cancel button -->
        <button 
          v-if="isStreaming"
          @click="$emit('cancel')"
          class="text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-red-600 hover:text-white text-gray-300 transition-colors"
          aria-label="Cancel AI generation"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- Session Escalation Banner (Phase 4) -->
    <div 
      v-if="isEscalated || warningCount >= 3"
      class="mb-4 p-3 bg-amber-900/30 border border-amber-600/50 rounded-lg flex items-start gap-3"
      role="alert"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div class="flex-1">
        <p class="text-sm text-amber-300 font-medium">AI Suggestions Temporarily Disabled</p>
        <p class="text-xs text-amber-400/80 mt-1">
          This session has been flagged for review due to multiple safety warnings ({{ warningCount }} warnings).
          AI suggestions have been paused. Please continue with standard clinical protocols.
        </p>
      </div>
      <span class="text-xs font-bold text-amber-500 bg-amber-500/20 px-2 py-1 rounded-full">
        {{ warningCount }} ⚠️
      </span>
    </div>

    <!-- Risk Score Warning Banner (Phase 4) -->
    <div 
      v-if="riskScore >= 5 && !isEscalated && warningCount < 3"
      class="mb-4 p-3 bg-orange-900/30 border border-orange-600/50 rounded-lg flex items-start gap-3"
      role="alert"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div class="flex-1">
        <p class="text-sm text-orange-300 font-medium">High Risk AI Response Detected</p>
        <p class="text-xs text-orange-400/80 mt-1">
          This AI response has been flagged with a risk score of {{ riskScore }}. 
          Please review carefully before applying any suggestions.
        </p>
      </div>
      <span class="text-xs font-bold text-orange-500 bg-orange-500/20 px-2 py-1 rounded-full">
        Risk: {{ riskScore }}
      </span>
    </div>

    <!-- Progress section -->
    <div v-if="isStreaming || (estimatedTotalTokens && progressPercent > 0)" class="mb-4">
      <div class="flex items-center justify-between text-xs text-gray-400 mb-1.5">
        <span class="flex items-center gap-1">
          <svg v-if="isStreaming" xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ progressLabel }}
        </span>
        <span class="font-mono">{{ Math.round(progressPercent) }}%</span>
      </div>
      <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div 
          class="h-full bg-gradient-to-r from-purple-600 via-purple-400 to-purple-500 transition-all duration-200 ease-out rounded-full relative"
          :style="{ width: `${progressPercent}%` }"
          role="progressbar"
          :aria-valuenow="Math.round(progressPercent)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <!-- Shimmer effect during streaming -->
          <div 
            v-if="isStreaming"
            class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
          ></div>
        </div>
      </div>
      <div class="flex items-center justify-between text-xs text-gray-500 mt-1.5">
        <span class="font-mono">{{ tokensGenerated.toLocaleString() }} tokens</span>
        <span>{{ estimatedTimeRemaining || '~' }}</span>
      </div>
    </div>

    <!-- Streaming content -->
    <div class="relative">
      <!-- Animated text container -->
      <div 
        class="text-sm md:text-base text-gray-200 leading-relaxed"
        :class="{ 'opacity-60': isStreaming }"
        ref="textContainer"
      >
        <!-- Render formatted paragraphs -->
        <div 
          v-for="(paragraph, index) in displayedParagraphs" 
          :key="index"
          class="mb-3 last:mb-0"
          :class="{ 'animate-fade-in': true }"
          :style="{ animationDelay: `${index * 50}ms` }"
        >
          <!-- Render words with typewriter effect -->
          <span v-for="(word, wordIndex) in paragraph" :key="wordIndex" class="inline-block mr-1.5">
            <span 
              class="inline-block"
              :class="{ 
                'opacity-50': isStreaming && index === displayedParagraphs.length - 1 && wordIndex === paragraph.length - 1
              }"
            >
              {{ word.text }}
            </span>
            <!-- Streaming cursor after last word of current paragraph -->
            <span 
              v-if="isStreaming && index === displayedParagraphs.length - 1 && wordIndex === paragraph.length - 1 && !isBuffering"
              class="streaming-cursor inline-block w-0.5 h-4 bg-purple-400 ml-0.5 align-middle animate-pulse"
            ></span>
          </span>
        </div>

        <!-- Buffering state -->
        <div 
          v-if="isBuffering"
          class="inline-flex items-center gap-1 text-purple-400 text-sm"
        >
          <span class="animate-bounce" style="animation-delay: 0ms">.</span>
          <span class="animate-bounce" style="animation-delay: 150ms">.</span>
          <span class="animate-bounce" style="animation-delay: 300ms">.</span>
        </div>
      </div>

      <!-- Complete indicator -->
      <div 
        v-if="!isStreaming && formattedText && !error" 
        class="absolute bottom-0 right-0 flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        Complete
      </div>
    </div>

    <!-- Error state -->
    <div 
      v-if="error" 
      class="mt-4 p-3 bg-red-900/20 border border-red-700/30 rounded-lg flex items-start gap-2"
      role="alert"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div class="flex-1">
        <p class="text-sm text-red-300 font-medium">{{ errorTitle }}</p>
        <p class="text-xs text-red-400/80 mt-0.5">{{ error }}</p>
        <p v-if="errorDetails" class="text-xs text-red-500/60 mt-1 font-mono">{{ errorDetails }}</p>
      </div>
    </div>

    <!-- Completion timestamp -->
    <div 
      v-if="!isStreaming && formattedText && !error && completionTime"
      class="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700/50"
    >
      <span class="text-xs text-gray-500">
        Generated in {{ generationTime }}s
      </span>
      <span class="text-xs text-gray-600">•</span>
      <span class="text-xs text-gray-500">
        {{ wordCount }} words
      </span>
    </div>

    <!-- Feedback Panel (Phase 3) -->
    <div 
      v-if="!isStreaming && formattedText && !error && enableFeedback && sessionId && sectionId && responseId"
      class="mt-4 pt-4 border-t border-gray-700/50"
    >
      <AIFeedbackPanel
        :session-id="sessionId"
        :section-id="sectionId"
        :response-id="responseId"
        @submitted="handleFeedbackSubmitted"
      />
    </div>
  </div>
</template>
<style scoped>
.ai-streaming-panel {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Smooth fade-in animation for paragraphs */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

/* Streaming cursor animation */
.streaming-cursor {
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Shimmer effect for progress bar */
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.animate-shimmer {
  animation: shimmer 2s infinite;
}

/* Typing animation for words */
@keyframes typeIn {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Button states */
.copied {
  background-color: #16a34a;
  color: #ffffff;
}

/* Responsive text sizing */
@media (max-width: 640px) {
  .ai-streaming-panel {
    padding: 0.75rem;
  }
}

/* Improve readability for medical content */
.text-sm\/base {
  line-height: 1.6;
}

/* Smooth transitions for status changes */
.status-indicator {
  transition: all 0.3s ease;
}

/* Word wrapping improvements */
.break-words {
  overflow-wrap: break-word;
  word-wrap: break-word;
  word-break: break-word;
}

/* Ensure proper text rendering */
.text-gray-200 {
  color: #e5e7eb;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Scrollbar styling for overflow content */
.overflow-y-auto {
  scrollbar-width: thin;
  scrollbar-color: #6b7280 #374151;
}

.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: #374151;
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #6b7280;
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>
