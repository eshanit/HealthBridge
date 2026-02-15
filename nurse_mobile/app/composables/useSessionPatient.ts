/**
 * Session Patient Composable
 * 
 * Provides reactive sessionStorage-based persistence for patient data
 * during a clinical session. This ensures patient information is
 * available across page navigation within the same session.
 * 
 * Features:
 * - Reactive patient data with sessionStorage persistence
 * - Automatic hydration from sessionStorage on mount
 * - Type-safe storage with JSON serialization
 * - Integration with VueUse composables
 */

import { ref, computed, onMounted, watch, type Ref } from 'vue';
import { useSessionStorage, tryOnMounted } from '@vueuse/core';
import type { ClinicalPatient } from '~/types/patient';

/**
 * Patient data interface for session persistence
 */
export interface SessionPatientData {
  patientId: string;
  patientCpt?: string;  // 4-character CPT for patient lookup
  patientName: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  email?: string;
  sessionId: string;
  registeredAt: number;
}

/**
 * UseSessionPatient Options
 */
export interface UseSessionPatientOptions {
  /** Session ID to scope the storage */
  sessionId: string | Ref<string>;
  /** Default patient data if none found in storage */
  defaultPatient?: ClinicalPatient | null;
  /** Whether to auto-hydrate on mount */
  autoHydrate?: boolean;
}

/**
 * UseSessionPatient Return Type
 */
export interface UseSessionPatientReturn {
  /** Reactive patient data from sessionStorage */
  patientData: Ref<SessionPatientData | null>;
  /** Whether patient data exists in storage */
  hasPatient: Ref<boolean>;
  /** Whether sessionStorage is supported */
  isSupported: Ref<boolean>;
  /** Save patient data to sessionStorage */
  savePatient: (patient: ClinicalPatient) => void;
  /** Clear patient data from sessionStorage */
  clearPatient: () => void;
  /** Update patient data with partial updates */
  updatePatient: (updates: Partial<SessionPatientData>) => void;
}

/**
 * Generate storage key for session patient data
 */
function getStorageKey(sessionId: string): string {
  return `healthbridge:session:${sessionId}:patient`;
}

/**
 * Session Patient Composable
 * 
 * Manages patient data persistence across page navigation within a session.
 * Uses sessionStorage to ensure data survives navigation but is cleared
 * when the browser tab is closed.
 * 
 * @param options - Configuration options
 * @returns Patient data management interface
 */
export function useSessionPatient(
  options: UseSessionPatientOptions
): UseSessionPatientReturn {
  const { sessionId, defaultPatient = null, autoHydrate = true } = options;
  
  // Get the sessionId value if it's a Ref
  const sessionIdValue = typeof sessionId === 'string' ? sessionId : sessionId.value;
  
  /**
   * Check if sessionStorage is supported
   */
  function isSessionStorageSupported(): boolean {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) {
        return false;
      }
      // Test write/read
      const testKey = '__sessionStorage_test__';
      sessionStorage.setItem(testKey, 'test');
      sessionStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }
  
  const isSupported = ref(false);
  
  /**
   * Get stored patient data from sessionStorage
   */
  function getStoredPatient(): SessionPatientData | null {
    if (!isSupported.value) return null;
    
    try {
      const storageKey = getStorageKey(sessionIdValue);
      const rawValue = sessionStorage.getItem(storageKey);
      if (rawValue === null) return null;
      
      return JSON.parse(rawValue) as SessionPatientData;
    } catch (error) {
      console.error('[useSessionPatient] Failed to read from sessionStorage:', error);
      return null;
    }
  }
  
  /**
   * Save patient data to sessionStorage
   */
  function saveToStorage(data: SessionPatientData): void {
    if (!isSupported.value) return;
    
    try {
      const storageKey = getStorageKey(sessionIdValue);
      sessionStorage.setItem(storageKey, JSON.stringify(data));
      patientData.value = data;
    } catch (error) {
      console.error('[useSessionPatient] Failed to save to sessionStorage:', error);
    }
  }
  
  /**
   * Remove patient data from sessionStorage
   */
  function removeFromStorage(): void {
    if (!isSupported.value) return;
    
    try {
      const storageKey = getStorageKey(sessionIdValue);
      sessionStorage.removeItem(storageKey);
      patientData.value = null;
    } catch (error) {
      console.error('[useSessionPatient] Failed to remove from sessionStorage:', error);
    }
  }
  
  // Reactive patient data
  const patientData = ref<SessionPatientData | null>(null);
  
  // Computed: whether patient data exists
  const hasPatient = computed(() => patientData.value !== null);
  
  /**
   * Initialize storage support check
   */
  function initialize(): void {
    isSupported.value = isSessionStorageSupported();
    
    if (isSupported.value) {
      // Try to hydrate from storage or use default
      const stored = getStoredPatient();
      if (stored) {
        patientData.value = stored;
        console.log('[useSessionPatient] Hydrated patient data from sessionStorage:', stored.patientName);
      } else if (defaultPatient) {
        // Use default patient data if provided
        const fullName = `${defaultPatient.firstName} ${defaultPatient.lastName}`.trim();
        patientData.value = {
          patientId: defaultPatient.cpt,
          patientCpt: defaultPatient.cpt,
          patientName: fullName,
          dateOfBirth: defaultPatient.dateOfBirth,
          gender: defaultPatient.gender,
          phone: defaultPatient.phone,
          email: defaultPatient.email,
          sessionId: sessionIdValue,
          registeredAt: Date.now()
        };
        saveToStorage(patientData.value);
      }
    } else {
      console.warn('[useSessionPatient] sessionStorage not supported');
    }
  }
  
  /**
   * Save patient data from ClinicalPatient object
   */
  function savePatient(patient: ClinicalPatient): void {
    const fullName = `${patient.firstName} ${patient.lastName}`.trim();
    
    const data: SessionPatientData = {
      patientId: patient.cpt,
      patientCpt: patient.cpt,
      patientName: fullName,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      phone: patient.phone,
      email: patient.email,
      sessionId: sessionIdValue,
      registeredAt: Date.now()
    };
    
    saveToStorage(data);
    console.log('[useSessionPatient] Saved patient data:', fullName);
  }
  
  /**
   * Clear patient data from storage
   */
  function clearPatient(): void {
    removeFromStorage();
    console.log('[useSessionPatient] Cleared patient data');
  }
  
  /**
   * Update patient data with partial updates
   */
  function updatePatient(updates: Partial<SessionPatientData>): void {
    if (!patientData.value) {
      console.warn('[useSessionPatient] No patient data to update');
      return;
    }
    
    const updated = {
      ...patientData.value,
      ...updates,
      sessionId: sessionIdValue // Ensure sessionId is always correct
    };
    
    saveToStorage(updated);
    console.log('[useSessionPatient] Updated patient data:', updated.patientName);
  }
  
  // Initialize on mount
  if (autoHydrate) {
    tryOnMounted(() => {
      initialize();
    });
  } else {
    // Run immediately if not deferred
    if (typeof window !== 'undefined') {
      initialize();
    }
  }
  
  return {
    patientData,
    hasPatient,
    isSupported,
    savePatient,
    clearPatient,
    updatePatient
  };
}

/**
 * Simple session patient storage utility for one-time operations
 * 
 * @param sessionId - Session ID to scope the storage
 * @param patient - Patient data to store
 * @returns True if successful, false otherwise
 */
export function setSessionPatient(
  sessionId: string,
  patient: ClinicalPatient
): boolean {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return false;
    }
    
    const fullName = `${patient.firstName} ${patient.lastName}`.trim();
    const data: SessionPatientData = {
      patientId: patient.cpt,
      patientCpt: patient.cpt,
      patientName: fullName,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      phone: patient.phone,
      email: patient.email,
      sessionId,
      registeredAt: Date.now()
    };
    
    const storageKey = `healthbridge:session:${sessionId}:patient`;
    sessionStorage.setItem(storageKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/**
 * Get patient data from session storage
 * 
 * @param sessionId - Session ID to scope the storage
 * @param defaultValue - Default value if not found
 * @returns Patient data or default value
 */
export function getSessionPatient(
  sessionId: string,
  defaultValue: SessionPatientData | null = null
): SessionPatientData | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return defaultValue;
    }
    
    const storageKey = `healthbridge:session:${sessionId}:patient`;
    const rawValue = sessionStorage.getItem(storageKey);
    if (rawValue === null) {
      return defaultValue;
    }
    
    return JSON.parse(rawValue) as SessionPatientData;
  } catch {
    return defaultValue;
  }
}

/**
 * Remove patient data from session storage
 * 
 * @param sessionId - Session ID to scope the storage
 * @returns True if successful, false otherwise
 */
export function clearSessionPatient(sessionId: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return false;
    }
    
    const storageKey = `healthbridge:session:${sessionId}:patient`;
    sessionStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}
