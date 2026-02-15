/**
 * Translation Composable
 * 
 * Phase 3.2 Task 3.2.2: Vue composable for translation functionality
 * Provides reactive translation state and methods
 * Supports English, Shona, and Ndebele
 */

import { ref, computed, watch } from 'vue';
import {
  getTranslationService,
  type TranslationLanguage,
  type TranslationResult,
  type LanguageConfig,
  SUPPORTED_LANGUAGES
} from '~/services/translationService';

// Re-export types for external use
export type { TranslationLanguage, TranslationResult, LanguageConfig };

// ============================================
// Types & Interfaces
// ============================================

/**
 * Translation state
 */
export interface TranslationState {
  isLoading: boolean;
  error: string | null;
  lastResult: TranslationResult | null;
}

/**
 * Options for translation composable
 */
export interface UseTranslationOptions {
  /** Default source language */
  sourceLanguage?: TranslationLanguage;
  /** Default target language */
  targetLanguage?: TranslationLanguage;
  /** Auto-detect source language */
  autoDetect?: boolean;
  /** Cache translations */
  useCache?: boolean;
}

/**
 * Queued translation item
 */
interface QueuedTranslation {
  id: string;
  text: string;
  targetLanguage: TranslationLanguage;
  sourceLanguage?: TranslationLanguage;
}

// ============================================
// Composable Implementation
// ============================================

export function useTranslation(options: UseTranslationOptions = {}) {
  const {
    sourceLanguage = 'en',
    targetLanguage = 'en',
    autoDetect = false,
    useCache = true
  } = options;

  // ============================================
  // State
  // ============================================

  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const lastResult = ref<TranslationResult | null>(null);
  const currentSourceLanguage = ref<TranslationLanguage>(sourceLanguage);
  const currentTargetLanguage = ref<TranslationLanguage>(targetLanguage);
  const translationHistory = ref<TranslationResult[]>([]);
  const queue = ref<QueuedTranslation[]>([]);

  // ============================================
  // Computed
  // ============================================

  const sourceLanguageConfig = computed<LanguageConfig>(() => {
    return SUPPORTED_LANGUAGES[currentSourceLanguage.value] || SUPPORTED_LANGUAGES.en;
  });

  const targetLanguageConfig = computed<LanguageConfig>(() => {
    return SUPPORTED_LANGUAGES[currentTargetLanguage.value] || SUPPORTED_LANGUAGES.en;
  });

  const supportedLanguages = computed<LanguageConfig[]>(() => {
    return Object.values(SUPPORTED_LANGUAGES);
  });

  const isSameLanguage = computed(() => {
    return currentSourceLanguage.value === currentTargetLanguage.value;
  });

  const historyCount = computed(() => translationHistory.value.length);

  // ============================================
  // Methods
  // ============================================

  /**
   * Translate text
   */
  async function translate(
    text: string,
    targetLang?: TranslationLanguage,
    sourceLang?: TranslationLanguage
  ): Promise<TranslationResult> {
    const target = targetLang || currentTargetLanguage.value;
    const source = sourceLang || currentSourceLanguage.value;
    
    if (!text.trim()) {
      return {
        originalText: text,
        translatedText: text,
        sourceLanguage: source,
        targetLanguage: target,
        confidence: 1.0,
        provider: 'fallback',
        timestamp: new Date().toISOString()
      };
    }

    isLoading.value = true;
    error.value = null;

    try {
      const service = getTranslationService();
      
      // Auto-detect source language if enabled
      const actualSource = autoDetect 
        ? service.detectLanguage(text) 
        : source;
      
      const result = await service.translate({
        text,
        sourceLanguage: actualSource,
        targetLanguage: target
      });

      lastResult.value = result;
      
      // Add to history
      if (useCache) {
        translationHistory.value.unshift(result);
        // Keep only last 50 translations
        if (translationHistory.value.length > 50) {
          translationHistory.value = translationHistory.value.slice(0, 50);
        }
      }

      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Translation failed';
      error.value = message;
      console.error('[useTranslation] Translation error:', e);
      
      // Return fallback result
      return {
        originalText: text,
        translatedText: text,
        sourceLanguage: source,
        targetLanguage: target,
        confidence: 0,
        provider: 'fallback',
        timestamp: new Date().toISOString()
      };
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Translate medical text
   */
  async function translateMedical(
    text: string,
    targetLang?: TranslationLanguage
  ): Promise<TranslationResult> {
    const target = targetLang || currentTargetLanguage.value;
    
    isLoading.value = true;
    error.value = null;

    try {
      const service = getTranslationService();
      const result = await service.translateMedical(text, target, currentSourceLanguage.value);
      
      lastResult.value = result;
      return result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Medical translation failed';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Translate caregiver instructions
   */
  async function translateCaregiverInstructions(
    text: string,
    targetLang?: TranslationLanguage
  ): Promise<TranslationResult> {
    const target = targetLang || currentTargetLanguage.value;
    
    isLoading.value = true;
    error.value = null;

    try {
      const service = getTranslationService();
      const result = await service.translateCaregiverInstructions(
        text, 
        target, 
        currentSourceLanguage.value
      );
      
      lastResult.value = result;
      return result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Caregiver translation failed';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Batch translate multiple texts
   */
  async function translateBatch(
    texts: string[],
    targetLang?: TranslationLanguage
  ): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];
    
    for (const text of texts) {
      const result = await translate(text, targetLang);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Add translation to queue
   */
  function addToQueue(
    text: string,
    targetLang?: TranslationLanguage,
    sourceLang?: TranslationLanguage
  ): string {
    const id = `trans_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    queue.value.push({
      id,
      text,
      targetLanguage: targetLang || currentTargetLanguage.value,
      sourceLanguage: sourceLang || currentSourceLanguage.value
    });
    
    return id;
  }

  /**
   * Process translation queue
   */
  async function processQueue(): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];
    
    while (queue.value.length > 0) {
      const item = queue.value.shift();
      if (item) {
        const result = await translate(
          item.text,
          item.targetLanguage,
          item.sourceLanguage
        );
        results.push(result);
      }
    }
    
    return results;
  }

  /**
   * Clear translation queue
   */
  function clearQueue(): void {
    queue.value = [];
  }

  /**
   * Set source language
   */
  function setSourceLanguage(lang: TranslationLanguage): void {
    currentSourceLanguage.value = lang;
  }

  /**
   * Set target language
   */
  function setTargetLanguage(lang: TranslationLanguage): void {
    currentTargetLanguage.value = lang;
  }

  /**
   * Swap source and target languages
   */
  function swapLanguages(): void {
    const temp = currentSourceLanguage.value;
    currentSourceLanguage.value = currentTargetLanguage.value;
    currentTargetLanguage.value = temp;
  }

  /**
   * Clear translation history
   */
  function clearHistory(): void {
    translationHistory.value = [];
  }

  /**
   * Clear error
   */
  function clearError(): void {
    error.value = null;
  }

  /**
   * Detect language of text
   */
  function detectLanguage(text: string): TranslationLanguage {
    const service = getTranslationService();
    return service.detectLanguage(text);
  }

  /**
   * Check if language is supported
   */
  function isLanguageSupported(lang: string): lang is TranslationLanguage {
    const service = getTranslationService();
    return service.isLanguageSupported(lang);
  }

  /**
   * Get language config
   */
  function getLanguageConfig(lang: TranslationLanguage): LanguageConfig {
    return SUPPORTED_LANGUAGES[lang] || SUPPORTED_LANGUAGES.en;
  }

  // ============================================
  // Return
  // ============================================

  return {
    // State
    isLoading,
    error,
    lastResult,
    currentSourceLanguage,
    currentTargetLanguage,
    translationHistory,
    queue,
    
    // Computed
    sourceLanguageConfig,
    targetLanguageConfig,
    supportedLanguages,
    isSameLanguage,
    historyCount,
    
    // Methods
    translate,
    translateMedical,
    translateCaregiverInstructions,
    translateBatch,
    addToQueue,
    processQueue,
    clearQueue,
    setSourceLanguage,
    setTargetLanguage,
    swapLanguages,
    clearHistory,
    clearError,
    detectLanguage,
    isLanguageSupported,
    getLanguageConfig
  };
}
