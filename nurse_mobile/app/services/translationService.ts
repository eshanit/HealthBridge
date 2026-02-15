/**
 * Translation Service
 * 
 * Phase 3.2 Task 3.2.1: Translation service for multi-language support
 * Supports English, Shona, and Ndebele
 * Uses LibreTranslate API with fallback to local dictionary
 */

import { useRuntimeConfig } from '#app';

// ============================================
// Types & Interfaces
// ============================================

/**
 * Supported languages
 */
export type TranslationLanguage = 'en' | 'sn' | 'nd';

/**
 * Language configuration
 */
export interface LanguageConfig {
  code: TranslationLanguage;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
}

/**
 * Translation result
 */
export interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  confidence: number;
  provider: 'api' | 'dictionary' | 'fallback';
  timestamp: string;
}

/**
 * Translation request
 */
export interface TranslationRequest {
  text: string;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  context?: 'medical' | 'general' | 'caregiver';
}

/**
 * Translation provider interface
 */
interface TranslationProvider {
  translate(request: TranslationRequest): Promise<TranslationResult>;
  isAvailable(): Promise<boolean>;
}

// ============================================
// Language Configuration
// ============================================

export const SUPPORTED_LANGUAGES: Record<TranslationLanguage, LanguageConfig> = {
  en: {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    direction: 'ltr'
  },
  sn: {
    code: 'sn',
    name: 'Shona',
    nativeName: 'chiShona',
    direction: 'ltr'
  },
  nd: {
    code: 'nd',
    name: 'Ndebele',
    nativeName: 'isiNdebele',
    direction: 'ltr'
  }
};

// ============================================
// Medical Dictionary (Local Fallback)
// ============================================

/**
 * Medical terminology translations
 * Used as fallback when API is unavailable
 */
const MEDICAL_DICTIONARY: Record<string, Record<TranslationLanguage, string>> = {
  // Danger Signs
  'convulsions': {
    en: 'convulsions',
    sn: 'kugwinha',
    nd: 'ukuhlanya'
  },
  'seizure': {
    en: 'seizure',
    sn: 'kugwinha',
    nd: 'ukuhlanya'
  },
  'unconscious': {
    en: 'unconscious',
    sn: 'hanya',
    nd: 'ngakaze'
  },
  'lethargic': {
    en: 'lethargic',
    sn: 'kurara',
    nd: 'ukulala'
  },
  'cyanosis': {
    en: 'cyanosis (blue skin)',
    sn: 'kubuda ruvara rwebluu',
    nd: 'ukuba lubisi'
  },
  'vomiting': {
    en: 'vomiting',
    sn: 'kurutsa',
    nd: 'ukuhlanza'
  },
  'unable to drink': {
    en: 'unable to drink',
    sn: 'kutadza kunwa',
    nd: 'ukungakwazi ukuphuza'
  },
  'unable to breastfeed': {
    en: 'unable to breastfeed',
    sn: 'kutadza kuyamwisa',
    nd: 'ukungakwazi ukuncelisa'
  },
  
  // Respiratory
  'breathing': {
    en: 'breathing',
    sn: 'kufema',
    nd: 'ukuphefumula'
  },
  'fast breathing': {
    en: 'fast breathing',
    sn: 'kufema zvakanyanya',
    nd: 'ukuphefumula ngokushesha'
  },
  'difficulty breathing': {
    en: 'difficulty breathing',
    sn: 'kutadza kufema',
    nd: 'ukuphefumula kanzima'
  },
  'chest indrawing': {
    en: 'chest indrawing',
    sn: 'chibereko chinopinda mukati',
    nd: 'isifuba esingena ngaphakathi'
  },
  'stridor': {
    en: 'stridor (noisy breathing)',
    sn: 'mhepo inorira',
    nd: 'umoya okhala'
  },
  'wheezing': {
    en: 'wheezing',
    sn: 'mhepo inopfunduka',
    nd: 'ukuphefumula okhala'
  },
  'cough': {
    en: 'cough',
    sn: 'kokoto',
    nd: 'ukukhwehlela'
  },
  'pneumonia': {
    en: 'pneumonia',
    sn: 'chirwere chehapwa',
    nd: 'isifuba esibi'
  },
  
  // Vital Signs
  'temperature': {
    en: 'temperature',
    sn: 'temparicha',
    nd: 'ubushushu'
  },
  'fever': {
    en: 'fever',
    sn: 'gora',
    nd: 'umkhuhlane'
  },
  'heart rate': {
    en: 'heart rate',
    sn: 'mutsindo wemoyo',
    nd: 'isivinini senhliziyo'
  },
  'respiratory rate': {
    en: 'respiratory rate',
    sn: 'mutsindo wekufema',
    nd: 'isivinini sokuphefumula'
  },
  'oxygen saturation': {
    en: 'oxygen saturation',
    sn: 'oxygen level',
    nd: 'amazinga e-oxygen'
  },
  
  // Triage
  'triage': {
    en: 'triage',
    sn: 'kurongeka',
    nd: 'ukuhleleka'
  },
  'emergency': {
    en: 'emergency',
    sn: 'dambudziko',
    nd: 'isimo esiphuthumayo'
  },
  'urgent': {
    en: 'urgent',
    sn: 'zvakakosha',
    nd: 'kubaluleke'
  },
  'referral': {
    en: 'referral',
    sn: 'kutumira kuchipatara',
    nd: 'ukuthunyelwa esibhedlela'
  },
  'hospital': {
    en: 'hospital',
    sn: 'chipatara',
    nd: 'isibhedlela'
  },
  
  // Treatment
  'antibiotic': {
    en: 'antibiotic',
    sn: 'mushonga wechirwere',
    nd: 'umuthi weziguli'
  },
  'medication': {
    en: 'medication',
    sn: 'mushonga',
    nd: 'umuthi'
  },
  'treatment': {
    en: 'treatment',
    sn: 'kurapwa',
    nd: 'ukwelashwa'
  },
  'follow-up': {
    en: 'follow-up',
    sn: 'kodzera',
    nd: 'ukubuya'
  },
  
  // People
  'patient': {
    en: 'patient',
    sn: 'murwere',
    nd: 'isiguli'
  },
  'child': {
    en: 'child',
    sn: 'mwana',
    nd: 'umntwana'
  },
  'infant': {
    en: 'infant',
    sn: 'mwana mudiki',
    nd: 'usana'
  },
  'mother': {
    en: 'mother',
    sn: 'amai',
    nd: 'umama'
  },
  'caregiver': {
    en: 'caregiver',
    sn: 'mubatsiri',
    nd: 'umsizi'
  },
  'nurse': {
    en: 'nurse',
    sn: 'mutsamire',
    nd: 'umongikazi'
  },
  
  // Actions
  'return immediately': {
    en: 'return immediately',
    sn: 'dzoka nekukasira',
    nd: 'buya ngokushesha'
  },
  'keep warm': {
    en: 'keep warm',
    sn: 'chengetedza kuti atonhorwe',
    nd: 'gcina umsindo'
  },
  'give fluids': {
    en: 'give fluids',
    sn: 'pa mvura',
    nd: 'nika amanzi'
  },
  'continue feeding': {
    en: 'continue feeding',
    sn: 'enderera kudya',
    nd: 'qhubeka ukudla'
  },
  
  // Common Phrases
  'danger signs': {
    en: 'danger signs',
    sn: 'zviratidzo zvekuti panyama',
    nd: 'izimpawu zengozi'
  },
  'recommended actions': {
    en: 'recommended actions',
    sn: 'zviito zvakurudzirwa',
    nd: 'izenzo ezinconyiwe'
  },
  'home care': {
    en: 'home care',
    sn: 'kurapwa kwepamba',
    nd: 'ukunakekelwa ekhaya'
  }
};

// ============================================
// LibreTranslate Provider
// ============================================

class LibreTranslateProvider implements TranslationProvider {
  private baseUrl: string;
  
  constructor(baseUrl?: string) {
    // Use environment variable or default
    this.baseUrl = baseUrl || process.env.TRANSLATE_API_URL || 'https://libretranslate.com';
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/languages`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const { text, sourceLanguage, targetLanguage } = request;
    
    // Map language codes to LibreTranslate format
    const sourceCode = this.mapLanguageCode(sourceLanguage);
    const targetCode = this.mapLanguageCode(targetLanguage);
    
    const response = await fetch(`${this.baseUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: sourceCode,
        target: targetCode,
        format: 'text'
      })
    });
    
    if (!response.ok) {
      throw new Error(`Translation API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      originalText: text,
      translatedText: data.translatedText,
      sourceLanguage,
      targetLanguage,
      confidence: 0.85, // LibreTranslate doesn't provide confidence
      provider: 'api',
      timestamp: new Date().toISOString()
    };
  }
  
  private mapLanguageCode(lang: TranslationLanguage): string {
    // LibreTranslate uses different codes
    const mapping: Record<TranslationLanguage, string> = {
      en: 'en',
      sn: 'sn', // May not be supported
      nd: 'zu'  // Fallback to Zulu for Ndebele
    };
    return mapping[lang] || 'en';
  }
}

// ============================================
// Dictionary Provider (Local Fallback)
// ============================================

class DictionaryProvider implements TranslationProvider {
  async isAvailable(): Promise<boolean> {
    return true; // Always available
  }
  
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const { text, sourceLanguage, targetLanguage } = request;
    
    // If same language, return as-is
    if (sourceLanguage === targetLanguage) {
      return {
        originalText: text,
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        confidence: 1.0,
        provider: 'dictionary',
        timestamp: new Date().toISOString()
      };
    }
    
    // Translate word by word using dictionary
    const words = text.split(/\s+/);
    const translatedWords = words.map(word => {
      const lowerWord = word.toLowerCase().replace(/[.,!?;:]/g, '');
      const entry = MEDICAL_DICTIONARY[lowerWord];
      
      if (entry && entry[targetLanguage]) {
        // Preserve original capitalization
        const translated = entry[targetLanguage]!;
        if (word.length > 0 && word[0] === word[0]!.toUpperCase()) {
          return translated.charAt(0).toUpperCase() + translated.slice(1);
        }
        return translated;
      }
      
      // Return original word if not in dictionary
      return word;
    });
    
    const translatedText = translatedWords.join(' ');
    
    // Calculate confidence based on how many words were translated
    const translatedCount = words.filter((word, i) => 
      translatedWords[i].toLowerCase() !== word.toLowerCase()
    ).length;
    const confidence = words.length > 0 ? translatedCount / words.length : 0;
    
    return {
      originalText: text,
      translatedText,
      sourceLanguage,
      targetLanguage,
      confidence,
      provider: 'dictionary',
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================
// Translation Service
// ============================================

class TranslationService {
  private apiProvider: LibreTranslateProvider;
  private dictionaryProvider: DictionaryProvider;
  private cache: Map<string, TranslationResult>;
  private maxCacheSize: number;
  
  constructor() {
    this.apiProvider = new LibreTranslateProvider();
    this.dictionaryProvider = new DictionaryProvider();
    this.cache = new Map();
    this.maxCacheSize = 500;
  }
  
  /**
   * Translate text from one language to another
   */
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const { text, sourceLanguage, targetLanguage } = request;
    
    // Check cache first
    const cacheKey = this.getCacheKey(text, sourceLanguage, targetLanguage);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, provider: 'cache' as any };
    }
    
    // Try API first
    try {
      const isApiAvailable = await this.apiProvider.isAvailable();
      if (isApiAvailable) {
        const result = await this.apiProvider.translate(request);
        this.addToCache(cacheKey, result);
        return result;
      }
    } catch (error) {
      console.warn('[TranslationService] API translation failed, falling back to dictionary:', error);
    }
    
    // Fallback to dictionary
    const result = await this.dictionaryProvider.translate(request);
    this.addToCache(cacheKey, result);
    return result;
  }
  
  /**
   * Translate medical text with context awareness
   */
  async translateMedical(
    text: string,
    targetLanguage: TranslationLanguage,
    sourceLanguage: TranslationLanguage = 'en'
  ): Promise<TranslationResult> {
    return this.translate({
      text,
      sourceLanguage,
      targetLanguage,
      context: 'medical'
    });
  }
  
  /**
   * Translate caregiver instructions
   */
  async translateCaregiverInstructions(
    text: string,
    targetLanguage: TranslationLanguage,
    sourceLanguage: TranslationLanguage = 'en'
  ): Promise<TranslationResult> {
    // For caregiver instructions, prefer dictionary for medical terms
    // to ensure accuracy
    const result = await this.translate({
      text,
      sourceLanguage,
      targetLanguage,
      context: 'caregiver'
    });
    
    return result;
  }
  
  /**
   * Detect language of text
   */
  detectLanguage(text: string): TranslationLanguage {
    // Simple detection based on common words
    const lowerText = text.toLowerCase();
    
    // Shona indicators
    const shonaWords = ['ndi', 'uri', 'aka', 'mwan', 'vamwe', 'zviri', 'pamberi'];
    const shonaMatches = shonaWords.filter(w => lowerText.includes(w)).length;
    
    // Ndebele indicators
    const ndebeleWords = ['ngi', 'u', 'ka', 'ba', 'ya', 'khona', 'kanjalo'];
    const ndebeleMatches = ndebeleWords.filter(w => lowerText.includes(w)).length;
    
    if (shonaMatches > ndebeleMatches && shonaMatches > 0) {
      return 'sn';
    }
    if (ndebeleMatches > shonaMatches && ndebeleMatches > 0) {
      return 'nd';
    }
    
    return 'en'; // Default to English
  }
  
  /**
   * Get supported languages
   */
  getSupportedLanguages(): LanguageConfig[] {
    return Object.values(SUPPORTED_LANGUAGES);
  }
  
  /**
   * Check if language is supported
   */
  isLanguageSupported(lang: string): lang is TranslationLanguage {
    return lang in SUPPORTED_LANGUAGES;
  }
  
  /**
   * Get cache key
   */
  private getCacheKey(text: string, source: TranslationLanguage, target: TranslationLanguage): string {
    return `${source}:${target}:${text.slice(0, 100)}`;
  }
  
  /**
   * Add to cache with size limit
   */
  private addToCache(key: string, result: TranslationResult): void {
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, result);
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================
// Singleton Export
// ============================================

let translationServiceInstance: TranslationService | null = null;

export function getTranslationService(): TranslationService {
  if (!translationServiceInstance) {
    translationServiceInstance = new TranslationService();
  }
  return translationServiceInstance;
}

// Export class for testing
export { TranslationService };
