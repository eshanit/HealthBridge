/**
 * Offline AI Composable
 * 
 * Phase 3.5 Task 3.5.2: Offline AI Capabilities
 * Vue composable for offline AI functionality
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import {
  analyzeOffline,
  getCachedAIResponse,
  cacheAIResponse,
  getOfflineSectionResponse,
  clearAICache,
  getCacheStats,
  isOfflineAvailable,
  type OfflineAIResponse,
  type OfflinePatientContext
} from '~/services/offlineAI';

// ============================================
// Types & Interfaces
// ============================================

/**
 * Network status
 */
export type NetworkStatus = 'online' | 'offline' | 'unstable';

/**
 * Options for useOfflineAI composable
 */
export interface UseOfflineAIOptions {
  /** Auto-cache successful AI responses */
  autoCache?: boolean;
  /** Callback when network status changes */
  onNetworkChange?: (status: NetworkStatus) => void;
  /** Callback when switching to offline mode */
  onOfflineMode?: () => void;
  /** Callback when returning to online mode */
  onOnlineMode?: () => void;
}

/**
 * Cached response metadata
 */
export interface CachedResponseInfo {
  id: string;
  query: string;
  sectionId: string;
  timestamp: string;
  age: number; // Age in hours
}

// ============================================
// Composable Implementation
// ============================================

export function useOfflineAI(options: UseOfflineAIOptions = {}) {
  const {
    autoCache = true,
    onNetworkChange,
    onOfflineMode,
    onOnlineMode
  } = options;

  // ============================================
  // State
  // ============================================

  const isOnline = ref(true);
  const networkStatus: Ref<NetworkStatus> = ref('online');
  const lastOfflineResponse: Ref<OfflineAIResponse | null> = ref(null);
  const isProcessing = ref(false);
  const error = ref<string | null>(null);
  const cacheCount = ref(0);
  const oldestCacheTimestamp = ref<string | null>(null);

  // ============================================
  // Computed
  // ============================================

  const isOfflineMode: ComputedRef<boolean> = computed(() => !isOnline.value);

  const canUseOffline: ComputedRef<boolean> = computed(() => isOfflineAvailable());

  const cacheStats: ComputedRef<{ count: number; oldestTimestamp: string | null }> = computed(() => ({
    count: cacheCount.value,
    oldestTimestamp: oldestCacheTimestamp.value
  }));

  // ============================================
  // Network Status Handlers
  // ============================================

  function handleOnline(): void {
    isOnline.value = true;
    networkStatus.value = 'online';
    
    if (onNetworkChange) {
      onNetworkChange('online');
    }
    if (onOnlineMode) {
      onOnlineMode();
    }
  }

  function handleOffline(): void {
    isOnline.value = false;
    networkStatus.value = 'offline';
    
    if (onNetworkChange) {
      onNetworkChange('offline');
    }
    if (onOfflineMode) {
      onOfflineMode();
    }
  }

  // ============================================
  // Methods
  // ============================================

  /**
   * Analyze patient context using offline rules
   */
  function analyze(ctx: OfflinePatientContext): OfflineAIResponse {
    isProcessing.value = true;
    error.value = null;

    try {
      const response = analyzeOffline(ctx);
      lastOfflineResponse.value = response;
      return response;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Offline analysis failed';
      return {
        success: false,
        message: error.value,
        recommendations: [],
        warnings: ['Offline analysis failed. Please try again.'],
        confidence: 0,
        source: 'offline',
        timestamp: new Date().toISOString()
      };
    } finally {
      isProcessing.value = false;
    }
  }

  /**
   * Get response for a specific section
   */
  function getSectionResponse(
    sectionId: string,
    ctx: OfflinePatientContext
  ): OfflineAIResponse {
    isProcessing.value = true;
    error.value = null;

    try {
      const response = getOfflineSectionResponse(sectionId, ctx);
      lastOfflineResponse.value = response;
      return response;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to get section response';
      return {
        success: false,
        message: error.value,
        recommendations: [],
        warnings: [],
        confidence: 0,
        source: 'offline',
        timestamp: new Date().toISOString()
      };
    } finally {
      isProcessing.value = false;
    }
  }

  /**
   * Get cached response if available
   */
  function getCached(query: string, sectionId: string): OfflineAIResponse | null {
    return getCachedAIResponse(query, sectionId);
  }

  /**
   * Cache an AI response
   */
  function cache(query: string, response: string, sectionId: string): void {
    cacheAIResponse(query, response, sectionId);
    refreshCacheStats();
  }

  /**
   * Clear all cached responses
   */
  function clearCache(): void {
    clearAICache();
    refreshCacheStats();
  }

  /**
   * Refresh cache statistics
   */
  function refreshCacheStats(): void {
    const stats = getCacheStats();
    cacheCount.value = stats.count;
    oldestCacheTimestamp.value = stats.oldestTimestamp;
  }

  /**
   * Check network connectivity
   */
  function checkConnectivity(): boolean {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  }

  /**
   * Get AI response with offline fallback
   */
  async function getAIResponse(
    query: string,
    sectionId: string,
    ctx: OfflinePatientContext,
    onlineFetcher?: () => Promise<string>
  ): Promise<OfflineAIResponse> {
    // If offline, use offline analysis
    if (!isOnline.value || !onlineFetcher) {
      return getSectionResponse(sectionId, ctx);
    }

    // Try online fetch
    try {
      const onlineResponse = await onlineFetcher();
      
      // Cache successful response
      if (autoCache && onlineResponse) {
        cache(query, onlineResponse, sectionId);
      }

      return {
        success: true,
        message: onlineResponse,
        recommendations: [],
        warnings: [],
        confidence: 0.9,
        source: 'offline', // Will be updated by caller
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      // Online failed, fall back to offline
      console.warn('[useOfflineAI] Online fetch failed, using offline fallback:', e);
      
      // Check cache first
      const cached = getCached(query, sectionId);
      if (cached) {
        return cached;
      }

      // Use rule-based offline analysis
      return getSectionResponse(sectionId, ctx);
    }
  }

  /**
   * Build patient context from form data
   */
  function buildPatientContext(formData: Record<string, any>): OfflinePatientContext {
    return {
      ageMonths: formData.patient_age_months ?? 0,
      weightKg: formData.patient_weight_kg,
      temperature: formData.temperature,
      respiratoryRate: formData.resp_rate,
      heartRate: formData.heart_rate,
      oxygenSaturation: formData.oxygen_sat,
      symptoms: extractSymptoms(formData),
      dangerSigns: extractDangerSigns(formData),
      mentalStatus: determineMentalStatus(formData),
      feedingStatus: determineFeedingStatus(formData)
    };
  }

  /**
   * Clear error
   */
  function clearError(): void {
    error.value = null;
  }

  // ============================================
  // Helper Functions
  // ============================================

  function extractSymptoms(formData: Record<string, any>): string[] {
    const symptoms: string[] = [];
    
    if (formData.stridor) symptoms.push('stridor');
    if (formData.wheezing_present) symptoms.push('wheezing');
    if (formData.retractions === 'severe') symptoms.push('severe_chest_indrawing');
    if (formData.retractions === 'mild' || formData.retractions === 'moderate') symptoms.push('chest_indrawing');
    if (formData.cyanosis) symptoms.push('cyanosis');
    if (formData.cough_present) symptoms.push('cough');
    if (formData.fever_present) symptoms.push('fever');
    if (formData.runny_nose) symptoms.push('runny_nose');
    
    return symptoms;
  }

  function extractDangerSigns(formData: Record<string, any>): string[] {
    const dangerSigns: string[] = [];
    
    if (formData.unable_to_drink) dangerSigns.push('unable_to_drink');
    if (formData.vomits_everything) dangerSigns.push('vomits_everything');
    if (formData.convulsions) dangerSigns.push('convulsions');
    if (formData.lethargic_unconscious) dangerSigns.push('lethargic_unconscious');
    
    return dangerSigns;
  }

  function determineMentalStatus(formData: Record<string, any>): 'alert' | 'lethargic' | 'unconscious' {
    const status = formData.mental_status?.toLowerCase();
    if (status === 'lethargic') return 'lethargic';
    if (status === 'unconscious') return 'unconscious';
    return 'alert';
  }

  function determineFeedingStatus(formData: Record<string, any>): 'normal' | 'poor' | 'unable' {
    if (formData.unable_to_drink) return 'unable';
    if (formData.feeding_poor) return 'poor';
    return 'normal';
  }

  // ============================================
  // Lifecycle
  // ============================================

  onMounted(() => {
    // Initialize network status
    if (typeof window !== 'undefined') {
      isOnline.value = navigator.onLine;
      networkStatus.value = navigator.onLine ? 'online' : 'offline';
      
      // Add event listeners
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      
      // Refresh cache stats
      refreshCacheStats();
    }
  });

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
  });

  // ============================================
  // Return
  // ============================================

  return {
    // State
    isOnline,
    networkStatus,
    isOfflineMode,
    lastOfflineResponse,
    isProcessing,
    error,
    cacheCount,
    oldestCacheTimestamp,

    // Computed
    canUseOffline,
    cacheStats,

    // Methods
    analyze,
    getSectionResponse,
    getCached,
    cache,
    clearCache,
    refreshCacheStats,
    checkConnectivity,
    getAIResponse,
    buildPatientContext,
    clearError
  };
}
