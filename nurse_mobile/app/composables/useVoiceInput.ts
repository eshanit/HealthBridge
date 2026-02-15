/**
 * Voice Input Composable
 * 
 * Phase 3.1 Task 3.1.1: Voice-to-text input for hands-free clinical documentation
 * Supports English, Shona, and Ndebele languages
 * Uses Web Speech API with fallback for unsupported browsers
 */

import { ref, computed, onUnmounted } from 'vue';

// ============================================
// Web Speech API Type Declarations
// ============================================

/**
 * Speech Recognition API types
 * These extend the Window interface for browser compatibility
 */
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudioend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onaudiostart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null;
  onnomatch: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onsoundend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onsoundstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onspeechend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onspeechstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly confidence: number;
  readonly transcript: string;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: SpeechRecognitionErrorCode;
  readonly message: string;
}

type SpeechRecognitionErrorCode =
  | 'aborted'
  | 'audio-capture'
  | 'bad-grammar'
  | 'language-not-supported'
  | 'network'
  | 'no-speech'
  | 'not-allowed'
  | 'service-not-allowed';

// ============================================
// Types & Interfaces
// ============================================

/**
 * Supported languages for voice input
 * Re-exported from useVoiceOutput for convenience
 */
export type { VoiceLanguage } from './useVoiceOutput';

/**
 * Language configuration for speech recognition
 */
interface LanguageConfig {
  code: VoiceLanguage;
  speechApiCode: string;  // BCP-47 language tag
  name: string;
}

/**
 * Result of voice transcription
 */
export interface VoiceInputResult {
  transcript: string;
  confidence: number;
  language: VoiceLanguage;
  duration: number;
  isFinal: boolean;
  medicalTerms: string[];
  timestamp: string;
}

/**
 * Options for voice input composable
 */
export interface UseVoiceInputOptions {
  /** Language for speech recognition */
  language?: VoiceLanguage;
  /** Enable continuous recognition */
  continuous?: boolean;
  /** Enable medical terminology detection */
  medicalMode?: boolean;
  /** Silence timeout in ms before auto-stop */
  silenceTimeout?: number;
  /** Maximum recording duration in ms */
  maxDuration?: number;
}

/**
 * Recognition state
 */
export type RecognitionState = 'idle' | 'listening' | 'processing' | 'error';

// ============================================
// Language Configuration
// ============================================

const LANGUAGE_CONFIGS: Record<VoiceLanguage, LanguageConfig> = {
  en: {
    code: 'en',
    speechApiCode: 'en-US',
    name: 'English'
  },
  sn: {
    code: 'sn',
    speechApiCode: 'sn-ZW',  // Shona (Zimbabwe)
    name: 'Shona'
  },
  nd: {
    code: 'nd',
    speechApiCode: 'nd-ZW',  // Ndebele (Zimbabwe)
    name: 'Ndebele'
  }
};

// ============================================
// Medical Terminology Detection
// ============================================

/**
 * Common medical terms to detect in transcripts
 * Includes terms in English, Shona, and Ndebele
 */
const MEDICAL_TERMS: Record<VoiceLanguage, string[]> = {
  en: [
    // Danger signs
    'convulsions', 'seizure', 'unconscious', 'lethargic', 'cyanosis', 'blue',
    'vomiting', 'vomits', 'unable to drink', 'cannot drink', 'not breastfeeding',
    // Respiratory
    'breathing', 'breath', 'respiratory', 'fast breathing', 'difficulty breathing',
    'chest indrawing', 'stridor', 'wheeze', 'wheezing', 'cough', 'pneumonia',
    // Vital signs
    'temperature', 'fever', 'hot', 'cold', 'heart rate', 'pulse', 'oxygen',
    'saturation', 'blood pressure',
    // General
    'patient', 'child', 'infant', 'baby', 'mother', 'caregiver',
    'triage', 'emergency', 'urgent', 'referral', 'hospital'
  ],
  sn: [
    // Danger signs (Shona)
    'kugwinha', 'kudzokera', 'kusagadzikana', 'kubuda ruvara rwebluu',
    'kurutsa', 'kutadza kunwa', 'kutadza kuyamwisa',
    // Respiratory (Shona)
    'mhepo', 'kufema', 'kufema zvakanyanya', 'kutadza kufema',
    'chibereko', 'mukaka', 'kurwara',
    // General (Shona)
    'mwana', 'mudiki', 'amai', 'baba', 'mubatsiri'
  ],
  nd: [
    // Danger signs (Ndebele)
    'ukugula', 'ukuhlanya', 'ukungabi muhle', 'ukuba lubisi',
    'ukuhlanza', 'ukungakwazi ukuphuza', 'ukungakwazi ukuncelisa',
    // Respiratory (Ndebele)
    'umoya', 'ukuphefumula', 'ukuphefumula kakhulu',
    'isifuba', 'ukukhwehlela', 'ukugula',
    // General (Ndebele)
    'umntwana', 'usana', 'umama', 'ubaba', 'umsizi'
  ]
};

/**
 * Detect medical terms in transcript
 */
function detectMedicalTerms(transcript: string, language: VoiceLanguage): string[] {
  const lowerTranscript = transcript.toLowerCase();
  const terms = MEDICAL_TERMS[language] || MEDICAL_TERMS.en;
  
  return terms.filter(term => lowerTranscript.includes(term.toLowerCase()));
}

// ============================================
// Browser Support Detection
// ============================================

/**
 * Check if Speech Recognition is supported
 * Returns the SpeechRecognition constructor if available, null otherwise
 */
function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  
  return win.SpeechRecognition || 
         win.webkitSpeechRecognition || 
         null;
}

/**
 * Check if browser supports voice input
 */
export function isVoiceInputSupported(): boolean {
  return getSpeechRecognition() !== null;
}

// ============================================
// Composable Implementation
// ============================================

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const {
    language = 'en',
    continuous = false,
    medicalMode = true,
    silenceTimeout = 3000,
    maxDuration = 60000
  } = options;

  // ============================================
  // State
  // ============================================

  const isRecording = ref(false);
  const recognitionState = ref<RecognitionState>('idle');
  const transcript = ref('');
  const interimTranscript = ref('');
  const confidence = ref(0);
  const currentLanguage = ref<VoiceLanguage>(language);
  const error = ref<string | null>(null);
  const results = ref<VoiceInputResult[]>([]);
  const recordingDuration = ref(0);

  // Private state
  let recognition: SpeechRecognitionInstance | null = null;
  let startTime = 0;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  let durationInterval: ReturnType<typeof setInterval> | null = null;

  // ============================================
  // Computed
  // ============================================

  const isSupported = computed(() => isVoiceInputSupported());
  
  const fullTranscript = computed(() => {
    return results.value
      .filter(r => r.isFinal)
      .map(r => r.transcript)
      .join(' ');
  });

  const allMedicalTerms = computed(() => {
    return [...new Set(results.value.flatMap(r => r.medicalTerms))];
  });

  const languageName = computed(() => {
    return LANGUAGE_CONFIGS[currentLanguage.value]?.name || 'Unknown';
  });

  // ============================================
  // Methods
  // ============================================

  /**
   * Initialize speech recognition
   */
  function initRecognition(): void {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      error.value = 'Speech recognition not supported in this browser';
      return;
    }

    recognition = new SpeechRecognition();
    
    const langConfig = LANGUAGE_CONFIGS[currentLanguage.value];
    recognition.lang = langConfig.speechApiCode;
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    // Event handlers
    recognition.onstart = () => {
      recognitionState.value = 'listening';
      isRecording.value = true;
      startTime = Date.now();
      error.value = null;
      
      // Start duration tracking
      durationInterval = setInterval(() => {
        recordingDuration.value = Date.now() - startTime;
      }, 100);
      
      // Set max duration timeout
      maxDurationTimer = setTimeout(() => {
        stopRecording();
      }, maxDuration);
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      let resultConfidence = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        
        if (result.isFinal) {
          final += text;
          resultConfidence = result[0].confidence;
        } else {
          interim += text;
        }
      }

      // Update interim transcript
      interimTranscript.value = interim;

      // Process final result
      if (final) {
        const medicalTerms = medicalMode 
          ? detectMedicalTerms(final, currentLanguage.value)
          : [];

        const result: VoiceInputResult = {
          transcript: final,
          confidence: resultConfidence,
          language: currentLanguage.value,
          duration: Date.now() - startTime,
          isFinal: true,
          medicalTerms,
          timestamp: new Date().toISOString()
        };

        results.value.push(result);
        transcript.value = fullTranscript.value;
        confidence.value = resultConfidence;

        // Reset silence timer
        resetSilenceTimer();
      }

      // Clear error on successful result
      error.value = null;
    };

    recognition.onerror = (event: any) => {
      console.error('[VoiceInput] Recognition error:', event.error);
      
      // Handle specific errors
      switch (event.error) {
        case 'no-speech':
          error.value = 'No speech detected. Please try again.';
          break;
        case 'audio-capture':
          error.value = 'No microphone found. Please check your audio device.';
          break;
        case 'not-allowed':
          error.value = 'Microphone access denied. Please allow microphone access.';
          break;
        case 'network':
          error.value = 'Network error. Please check your connection.';
          break;
        case 'language-not-supported':
          error.value = `Language "${languageName.value}" not supported. Falling back to English.`;
          // Fallback to English
          currentLanguage.value = 'en';
          if (recognition) {
            recognition.lang = LANGUAGE_CONFIGS.en.speechApiCode;
          }
          break;
        default:
          error.value = `Recognition error: ${event.error}`;
      }
      
      recognitionState.value = 'error';
    };

    recognition.onend = () => {
      // Clean up timers
      clearTimers();
      
      // If still recording and continuous mode, restart
      if (isRecording.value && continuous && recognitionState.value !== 'error') {
        try {
          recognition?.start();
        } catch (e) {
          isRecording.value = false;
          recognitionState.value = 'idle';
        }
      } else {
        isRecording.value = false;
        recognitionState.value = 'idle';
      }
    };
  }

  /**
   * Reset silence timer
   */
  function resetSilenceTimer(): void {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
    }
    
    if (!continuous && silenceTimeout > 0) {
      silenceTimer = setTimeout(() => {
        stopRecording();
      }, silenceTimeout);
    }
  }

  /**
   * Clear all timers
   */
  function clearTimers(): void {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer);
      maxDurationTimer = null;
    }
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }
  }

  /**
   * Start voice recording
   */
  async function startRecording(): Promise<void> {
    if (!isSupported.value) {
      error.value = 'Speech recognition not supported';
      return;
    }

    if (isRecording.value) {
      console.warn('[VoiceInput] Already recording');
      return;
    }

    // Reset state
    transcript.value = '';
    interimTranscript.value = '';
    confidence.value = 0;
    results.value = [];
    recordingDuration.value = 0;
    error.value = null;

    try {
      initRecognition();
      recognition?.start();
      console.log(`[VoiceInput] Started recording in ${languageName.value}`);
    } catch (e) {
      console.error('[VoiceInput] Failed to start recognition:', e);
      error.value = 'Failed to start voice recognition';
      recognitionState.value = 'error';
    }
  }

  /**
   * Stop voice recording
   */
  function stopRecording(): VoiceInputResult | null {
    if (!isRecording.value || !recognition) {
      return null;
    }

    clearTimers();

    try {
      recognition.stop();
      console.log('[VoiceInput] Stopped recording');
    } catch (e) {
      console.error('[VoiceInput] Error stopping recognition:', e);
    }

    isRecording.value = false;
    recognitionState.value = 'idle';

    // Return the last result
    return results.value[results.value.length - 1] || null;
  }

  /**
   * Toggle recording state
   */
  function toggleRecording(): void {
    if (isRecording.value) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  /**
   * Clear all transcripts
   */
  function clearTranscript(): void {
    transcript.value = '';
    interimTranscript.value = '';
    results.value = [];
    confidence.value = 0;
    recordingDuration.value = 0;
  }

  /**
   * Change language
   */
  function setLanguage(newLanguage: VoiceLanguage): void {
    currentLanguage.value = newLanguage;
    
    // If currently recording, restart with new language
    if (isRecording.value && recognition) {
      recognition.stop();
      initRecognition();
      recognition.start();
    }
  }

  /**
   * Get the full transcript with medical terms highlighted
   */
  function getHighlightedTranscript(): string {
    let text = fullTranscript.value;
    
    if (medicalMode && allMedicalTerms.value.length > 0) {
      // Wrap medical terms in markers for highlighting
      allMedicalTerms.value.forEach(term => {
        const regex = new RegExp(`\\b${term}\\b`, 'gi');
        text = text.replace(regex, `**${term}**`);
      });
    }
    
    return text;
  }

  // ============================================
  // Cleanup
  // ============================================

  onUnmounted(() => {
    if (isRecording.value) {
      stopRecording();
    }
    clearTimers();
    recognition = null;
  });

  // ============================================
  // Return
  // ============================================

  return {
    // State
    isRecording,
    recognitionState,
    transcript,
    interimTranscript,
    fullTranscript,
    confidence,
    currentLanguage,
    languageName,
    error,
    results,
    recordingDuration,
    allMedicalTerms,
    
    // Computed
    isSupported,
    
    // Methods
    startRecording,
    stopRecording,
    toggleRecording,
    clearTranscript,
    setLanguage,
    getHighlightedTranscript
  };
}
