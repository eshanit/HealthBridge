/**
 * Voice Output Composable
 * 
 * Phase 3.1 Task 3.1.3: Text-to-speech output for accessibility
 * Reads AI responses aloud for hands-free operation
 * Supports English, Shona, and Ndebele languages
 */

// ============================================
// Types & Interfaces
// ============================================

/**
 * Supported languages for voice output
 */
export type VoiceLanguage = 'en' | 'sn' | 'nd';

/**
 * Voice configuration
 */
interface VoiceConfig {
  language: VoiceLanguage;
  rate: number;      // 0.1 to 10
  pitch: number;     // 0 to 2
  volume: number;    // 0 to 1
}

/**
 * Speech queue item
 */
interface SpeechQueueItem {
  id: string;
  text: string;
  config: VoiceConfig;
  priority: 'high' | 'normal' | 'low';
}

/**
 * Output state
 */
export type VoiceOutputState = 'idle' | 'speaking' | 'paused' | 'loading';

/**
 * Options for voice output composable
 */
export interface UseVoiceOutputOptions {
  /** Default language */
  language?: VoiceLanguage;
  /** Speech rate (0.1 to 10) */
  rate?: number;
  /** Speech pitch (0 to 2) */
  pitch?: number;
  /** Volume (0 to 1) */
  volume?: number;
  /** Auto-play on add to queue */
  autoPlay?: boolean;
}

// ============================================
// Language Configuration
// ============================================

const LANGUAGE_VOICES: Record<VoiceLanguage, string[]> = {
  en: ['English', 'en-US', 'en-GB', 'en-ZA'],
  sn: ['Shona', 'sn', 'sn-ZW'],
  nd: ['Ndebele', 'nd', 'nd-ZW', 'zu', 'zu-ZA']  // Fallback to Zulu for Ndebele
};

// ============================================
// Browser Support Detection
// ============================================

/**
 * Check if Speech Synthesis is supported
 */
export function isVoiceOutputSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Get available voices
 */
function getVoices(): SpeechSynthesisVoice[] {
  if (!isVoiceOutputSupported()) return [];
  return window.speechSynthesis.getVoices();
}

/**
 * Find best voice for language
 */
function findVoiceForLanguage(language: VoiceLanguage): SpeechSynthesisVoice | null {
  const voices = getVoices();
  const searchTerms = LANGUAGE_VOICES[language] || LANGUAGE_VOICES.en;
  
  // Try to find exact match
  for (const term of searchTerms) {
    const voice = voices.find(v => 
      v.lang.toLowerCase() === term.toLowerCase() ||
      v.name.toLowerCase().includes(term.toLowerCase())
    );
    if (voice) return voice;
  }
  
  // Fallback to default voice
  return voices.find(v => v.default) || voices[0] || null;
}

// ============================================
// Composable Implementation
// ============================================

export function useVoiceOutput(options: UseVoiceOutputOptions = {}) {
  const {
    language = 'en',
    rate = 1,
    pitch = 1,
    volume = 1,
    autoPlay = true
  } = options;

  // ============================================
  // State
  // ============================================

  const isSpeaking = ref(false);
  const isPaused = ref(false);
  const outputState = ref<VoiceOutputState>('idle');
  const currentLanguage = ref<VoiceLanguage>(language);
  const currentRate = ref(rate);
  const currentPitch = ref(pitch);
  const currentVolume = ref(volume);
  const currentText = ref('');
  const error = ref<string | null>(null);
  const queue = ref<SpeechQueueItem[]>([]);
  const voicesLoaded = ref(false);
  const availableVoices = ref<SpeechSynthesisVoice[]>([]);

  // Private state
  let currentUtterance: SpeechSynthesisUtterance | null = null;
  let currentItemId: string | '';

  // ============================================
  // Computed
  // ============================================

  const isSupported = computed(() => isVoiceOutputSupported());
  
  const queueLength = computed(() => queue.value.length);
  
  const currentVoice = computed(() => {
    return findVoiceForLanguage(currentLanguage.value);
  });

  // ============================================
  // Methods
  // ============================================

  /**
   * Load available voices
   */
  function loadVoices(): Promise<void> {
    return new Promise((resolve) => {
      if (!isVoiceOutputSupported()) {
        resolve();
        return;
      }

      const voices = getVoices();
      if (voices.length > 0) {
        availableVoices.value = voices;
        voicesLoaded.value = true;
        resolve();
        return;
      }

      // Voices might not be loaded yet, wait for event
      const handleVoicesChanged = () => {
        availableVoices.value = getVoices();
        voicesLoaded.value = true;
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
        resolve();
      };

      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
      
      // Timeout fallback
      setTimeout(() => {
        if (!voicesLoaded.value) {
          availableVoices.value = getVoices();
          voicesLoaded.value = true;
          resolve();
        }
      }, 1000);
    });
  }

  /**
   * Create utterance with config
   */
  function createUtterance(text: string, config: VoiceConfig): SpeechSynthesisUtterance {
    const utterance = new SpeechSynthesisUtterance(text);
    
    utterance.rate = config.rate;
    utterance.pitch = config.pitch;
    utterance.volume = config.volume;
    
    // Set voice
    const voice = findVoiceForLanguage(config.language);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      // Fallback language code
      const langCodes: Record<VoiceLanguage, string> = {
        en: 'en-US',
        sn: 'sn-ZW',
        nd: 'nd-ZW'
      };
      utterance.lang = langCodes[config.language] || 'en-US';
    }
    
    return utterance;
  }

  /**
   * Speak text immediately
   */
  async function speak(text: string, overrideConfig?: Partial<VoiceConfig>): Promise<void> {
    if (!isSupported.value) {
      error.value = 'Speech synthesis not supported';
      return;
    }

    // Stop current speech
    if (isSpeaking.value) {
      stop();
    }

    // Ensure voices are loaded
    if (!voicesLoaded.value) {
      outputState.value = 'loading';
      await loadVoices();
    }

    const config: VoiceConfig = {
      language: overrideConfig?.language || currentLanguage.value,
      rate: overrideConfig?.rate || currentRate.value,
      pitch: overrideConfig?.pitch || currentPitch.value,
      volume: overrideConfig?.volume || currentVolume.value
    };

    currentText.value = text;
    outputState.value = 'speaking';
    isSpeaking.value = true;
    isPaused.value = false;
    error.value = null;

    return new Promise((resolve, reject) => {
      currentUtterance = createUtterance(text, config);

      currentUtterance.onstart = () => {
        outputState.value = 'speaking';
        isSpeaking.value = true;
      };

      currentUtterance.onend = () => {
        isSpeaking.value = false;
        isPaused.value = false;
        outputState.value = 'idle';
        currentUtterance = null;
        currentText.value = '';
        resolve();
      };

      currentUtterance.onerror = (event) => {
        console.error('[VoiceOutput] Speech error:', event.error);
        error.value = `Speech error: ${event.error}`;
        isSpeaking.value = false;
        outputState.value = 'idle';
        currentUtterance = null;
        
        if (event.error !== 'canceled') {
          reject(new Error(event.error));
        } else {
          resolve();
        }
      };

      currentUtterance.onpause = () => {
        isPaused.value = true;
        outputState.value = 'paused';
      };

      currentUtterance.onresume = () => {
        isPaused.value = false;
        outputState.value = 'speaking';
      };

      try {
        window.speechSynthesis.speak(currentUtterance);
      } catch (e) {
        console.error('[VoiceOutput] Failed to start speech:', e);
        error.value = 'Failed to start speech';
        outputState.value = 'idle';
        reject(e);
      }
    });
  }

  /**
   * Add text to queue
   */
  function addToQueue(
    text: string, 
    priority: 'high' | 'normal' | 'low' = 'normal',
    overrideConfig?: Partial<VoiceConfig>
  ): string {
    const id = `speech_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    const item: SpeechQueueItem = {
      id,
      text,
      config: {
        language: overrideConfig?.language || currentLanguage.value,
        rate: overrideConfig?.rate || currentRate.value,
        pitch: overrideConfig?.pitch || currentPitch.value,
        volume: overrideConfig?.volume || currentVolume.value
      },
      priority
    };

    // Insert based on priority
    if (priority === 'high') {
      queue.value.unshift(item);
    } else {
      queue.value.push(item);
    }

    // Auto-play if enabled and not currently speaking
    if (autoPlay && !isSpeaking.value) {
      processQueue();
    }

    return id;
  }

  /**
   * Process queue
   */
  async function processQueue(): Promise<void> {
    if (queue.value.length === 0 || isSpeaking.value) return;

    const item = queue.value.shift();
    if (!item) return;

    currentItemId = item.id;
    
    try {
      await speak(item.text, item.config);
    } catch (e) {
      console.error('[VoiceOutput] Queue item failed:', e);
    }

    // Process next item
    if (queue.value.length > 0) {
      processQueue();
    }
  }

  /**
   * Pause current speech
   */
  function pause(): void {
    if (isSpeaking.value && !isPaused.value) {
      window.speechSynthesis.pause();
    }
  }

  /**
   * Resume paused speech
   */
  function resume(): void {
    if (isPaused.value) {
      window.speechSynthesis.resume();
    }
  }

  /**
   * Stop current speech and clear queue
   */
  function stop(): void {
    window.speechSynthesis.cancel();
    isSpeaking.value = false;
    isPaused.value = false;
    outputState.value = 'idle';
    currentUtterance = null;
    currentText.value = '';
  }

  /**
   * Clear queue without stopping current speech
   */
  function clearQueue(): void {
    queue.value = [];
  }

  /**
   * Remove item from queue
   */
  function removeFromQueue(id: string): boolean {
    const index = queue.value.findIndex(item => item.id === id);
    if (index !== -1) {
      queue.value.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Set language
   */
  function setLanguage(lang: VoiceLanguage): void {
    currentLanguage.value = lang;
  }

  /**
   * Set speech rate
   */
  function setRate(newRate: number): void {
    currentRate.value = Math.max(0.1, Math.min(10, newRate));
  }

  /**
   * Set speech pitch
   */
  function setPitch(newPitch: number): void {
    currentPitch.value = Math.max(0, Math.min(2, newPitch));
  }

  /**
   * Set volume
   */
  function setVolume(newVolume: number): void {
    currentVolume.value = Math.max(0, Math.min(1, newVolume));
  }

  /**
   * Speak with slower rate for clarity
   */
  function speakSlowly(text: string): Promise<void> {
    return speak(text, { rate: 0.7 });
  }

  /**
   * Speak with faster rate for quick updates
   */
  function speakQuickly(text: string): Promise<void> {
    return speak(text, { rate: 1.3 });
  }

  // ============================================
  // Cleanup
  // ============================================

  onUnmounted(() => {
    stop();
    clearQueue();
  });

  // ============================================
  // Initialize
  // ============================================

  // Load voices on mount
  if (typeof window !== 'undefined') {
    loadVoices();
  }

  // ============================================
  // Return
  // ============================================

  return {
    // State
    isSpeaking,
    isPaused,
    outputState,
    currentLanguage,
    currentRate,
    currentPitch,
    currentVolume,
    currentText,
    error,
    queue,
    queueLength,
    voicesLoaded,
    availableVoices,
    
    // Computed
    isSupported,
    currentVoice,
    
    // Methods
    speak,
    speakSlowly,
    speakQuickly,
    pause,
    resume,
    stop,
    addToQueue,
    processQueue,
    clearQueue,
    removeFromQueue,
    setLanguage,
    setRate,
    setPitch,
    setVolume,
    loadVoices
  };
}
