/**
 * Patient Lookup Composable
 * 
 * Vue Composition API for patient lookup operations.
 * Supports CPT lookup, name search, and phone search.
 * 
 * Features:
 * - Fast CPT lookup with validation
 * - Search by name or phone
 * - Real-time search suggestions
 * - Recent patients list
 * - Result selection callbacks
 */

import { ref, computed, watch } from 'vue';
import { useRouter, useRoute } from '#app';
import { getPatientByCPT, searchPatients, getRecentPatients } from '~/services/patientEngine';
import { isValidCpt, normalizeCpt } from '~/services/cptService';
import type {
  ClinicalPatient,
  PatientLookupResult,
  PatientSearchCriteria
} from '~/types/patient';
import { setSessionPatient } from '~/composables/useSessionPatient';

// ============================================
// Types
// ============================================

/**
 * Lookup mode options
 */
export type LookupMode = 'cpt' | 'name' | 'phone' | 'scan';

/**
 * Search result with selection state
 */
export interface PatientSearchResult {
  patient: ClinicalPatient;
  selected: boolean;
}

/**
 * Lookup configuration
 */
export interface LookupConfig {
  mode?: LookupMode;
  showRecent?: boolean;
  maxRecent?: number;
  allowNew?: boolean;
  onSelect?: (patient: ClinicalPatient) => void;
  onNew?: () => void;
}

// ============================================
// Composable
// ============================================

/**
 * Patient Lookup Composable
 */
export function usePatientLookup(config: LookupConfig = {}) {
  const router = useRouter();
  const route = useRoute();
  const toast = useToast();
  
  // ============================================
  // State
  // ============================================
  
  /**
   * Search query
   */
  const query = ref('');
  
  /**
   * Current lookup mode
   */
  const mode = ref<LookupMode>(config.mode || 'name');
  
  /**
   * Search results
   */
  const results = ref<ClinicalPatient[]>([]);
  
  /**
   * Selected patient
   */
  const selectedPatient = ref<ClinicalPatient | null>(null);
  
  /**
   * Recent patients
   */
  const recentPatients = ref<ClinicalPatient[]>([]);
  
  /**
   * Loading states
   */
  const isSearching = ref(false);
  const isLoadingCPT = ref(false);
  const isLoadingRecent = ref(false);
  
  /**
   * Error states
   */
  const error = ref<string | null>(null);
  
  /**
   * Search debounce timer
   */
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  
  // ============================================
  // Computed
  // ============================================
  
  /**
   * Check if query is valid for current mode
   */
  const isValidQuery = computed(() => {
    const q = query.value.trim();
    
    if (!q) return false;
    
    switch (mode.value) {
      case 'cpt':
        return q.length === 4 && isValidCpt(q); // 4-character CPT
      case 'name':
        return q.length >= 2;
      case 'phone':
        return q.length >= 7;
      default:
        return q.length >= 2;
    }
  });
  
  /**
   * Check if results are empty but search was performed
   */
  const hasNoResults = computed(() => {
    return !isSearching.value && 
           !isLoadingCPT.value && 
           query.value.trim().length > 0 && 
           results.value.length === 0;
  });
  
  /**
   * Check if there's an error
   */
  const hasError = computed(() => !!error.value);
  
  /**
   * Query length hint for UI
   */
  const queryHint = computed(() => {
    switch (mode.value) {
      case 'cpt':
        return 'Enter CPT (4 characters)';
      case 'name':
        return 'Enter at least 2 characters';
      case 'phone':
        return 'Enter phone number';
      default:
        return 'Search for patient';
    }
  });
  
  /**
   * Session ID from route (for navigation)
   */
  const sessionId = computed(() => route.params.sessionId as string | undefined);
  
  // ============================================
  // Initialization
  // ============================================
  
  /**
   * Load recent patients
   */
  async function loadRecentPatients(): Promise<void> {
    isLoadingRecent.value = true;
    
    try {
      recentPatients.value = getRecentPatients();
      
      // If cache is empty, try to fetch some recent
      if (recentPatients.value.length === 0 && config.showRecent !== false) {
        // Would fetch from secureDb in full implementation
        recentPatients.value = [];
      }
    } catch (err) {
      console.error('Error loading recent patients:', err);
    } finally {
      isLoadingRecent.value = false;
    }
  }
  
  /**
   * Initialize with CPT from route query
   */
  async function initializeFromQuery(): Promise<void> {
    const cpt = route.query.cpt as string | undefined;
    if (cpt) {
      query.value = cpt;
      mode.value = 'cpt';
      await lookupByCPT();
    }
  }
  
  // Initialize on mount
  if (config.showRecent !== false) {
    loadRecentPatients();
  }
  
  // Check for CPT in query
  if (route.query.cpt) {
    initializeFromQuery();
  }
  
  // ============================================
  // CPT Lookup
  // ============================================
  
  /**
   * Lookup patient by CPT
   */
  async function lookupByCPT(): Promise<PatientLookupResult | null> {
    if (!query.value.trim()) {
      return null;
    }
    
    isLoadingCPT.value = true;
    error.value = null;
    
    try {
      const result = await getPatientByCPT(query.value.trim());
      
      if (result.found && result.patient) {
        selectedPatient.value = result.patient;
        results.value = [result.patient];
        
        // Call selection callback
        if (config.onSelect) {
          config.onSelect(result.patient);
        }
        
        return result;
      } else {
        error.value = result.error || 'Patient not found';
        selectedPatient.value = null;
        results.value = [];
        
        return result;
      }
    } catch (err) {
      error.value = 'Failed to lookup patient';
      selectedPatient.value = null;
      results.value = [];
      
      return null;
    } finally {
      isLoadingCPT.value = false;
    }
  }
  
  /**
   * Handle CPT input - auto-lookup when valid
   */
  async function handleCPTInput(): Promise<void> {
    const normalized = query.value.toUpperCase().replace(/\s/g, '');
    
    // Remove dashes if present (for backward compatibility)
    const cleanCpt = normalized.replace(/-/g, '');
    
    // Check if valid 4-character CPT format
    if (isValidCpt(cleanCpt)) {
      query.value = cleanCpt;
      await lookupByCPT();
    }
  }
  
  // ============================================
  // Search
  // ============================================
  
  /**
   * Search patients by criteria
   */
  async function search(): Promise<void> {
    if (!isValidQuery.value) {
      results.value = [];
      return;
    }
    
    isSearching.value = true;
    error.value = null;
    
    try {
      const criteria: PatientSearchCriteria = {};
      
      switch (mode.value) {
        case 'name':
          criteria.name = query.value.trim();
          break;
        case 'phone':
          criteria.phone = query.value.trim();
          break;
        default:
          criteria.query = query.value.trim();
      }
      
      results.value = await searchPatients(criteria);
      
      // Clear selection if no exact match
      if (results.value.length !== 1) {
        selectedPatient.value = null;
      }
      
      // Show toast if no results
      if (results.value.length === 0) {
        toast.add({
          title: 'No Results',
          description: 'No patients found matching your search',
          color: 'info'
        });
      }
    } catch (err) {
      error.value = 'Search failed';
      results.value = [];
    } finally {
      isSearching.value = false;
    }
  }
  
  /**
   * Debounced search for name/phone
   */
  function debouncedSearch(delay = 300): void {
    if (searchTimer) {
      clearTimeout(searchTimer);
    }
    
    searchTimer = setTimeout(() => {
      search();
    }, delay);
  }
  
  /**
   * Immediate search
   */
  function immediateSearch(): void {
    if (searchTimer) {
      clearTimeout(searchTimer);
    }
    search();
  }
  
  // Watch query changes for debounced search
  watch(query, (newQuery) => {
    if (mode.value !== 'cpt' && newQuery.trim().length >= 2) {
      debouncedSearch();
    }
  });
  
  // ============================================
  // Selection
  // ============================================
  
  /**
   * Select a patient from results
   */
  function selectPatient(patient: ClinicalPatient): void {
    selectedPatient.value = patient;
    
    // Call selection callback
    if (config.onSelect) {
      config.onSelect(patient);
    }
    
    toast.add({
      title: 'Patient Selected',
      description: `${patient.firstName} ${patient.lastName}`,
      color: 'success'
    });
  }
  
  /**
   * Clear selection
   */
  function clearSelection(): void {
    selectedPatient.value = null;
  }
  
  /**
   * Select from recent patients
   */
  function selectFromRecent(patient: ClinicalPatient): void {
    query.value = patient.cpt;
    mode.value = 'cpt';
    selectPatient(patient);
  }
  
  // ============================================
  // Mode Management
  // ============================================
  
  /**
   * Set lookup mode
   */
  function setMode(newMode: LookupMode): void {
    mode.value = newMode;
    results.value = [];
    error.value = null;
    selectedPatient.value = null;
  }
  
  /**
   * Cycle through modes
   */
  function cycleMode(): void {
    const modes: LookupMode[] = ['cpt', 'name', 'phone'];
    const currentIndex = modes.indexOf(mode.value);
    const nextIndex = (currentIndex + 1) % modes.length;
    mode.value = modes[nextIndex] || 'name';
  }
  
  // ============================================
  // Navigation
  // ============================================
  
  /**
   * Navigate to new patient registration
   */
  function navigateToRegistration(): void {
    if (config.onNew) {
      config.onNew();
    } else if (sessionId.value) {
      router.push(`/sessions/${sessionId.value}/registration`);
    } else {
      // No sessionId - create a new session and navigate to patient lookup
      createSessionAndNavigate();
    }
  }

  /**
   * Create a new session and navigate to patient lookup
   * Patient lookup is session-bound, so we need a session context
   */
  async function createSessionAndNavigate(): Promise<void> {
    try {
      const { createSession } = await import('~/services/sessionEngine');
      const session = await createSession();
      router.push(`/sessions/${session.id}/patient-lookup`);
    } catch (error) {
      console.error('Failed to create session:', error);
      router.push('/sessions');
    }
  }
  
  /**
   * Navigate to patient summary
   */
  function navigateToSummary(patient: ClinicalPatient): void {
    router.push(`/records/${patient.cpt}`);
  }
  
  /**
   * Link patient to current session
   */
  async function linkToSession(patient: ClinicalPatient): Promise<void> {
    if (!sessionId.value) {
      toast.add({
        title: 'Error',
        description: 'No active session',
        color: 'error'
      });
      return;
    }
    
    // Save patient data to sessionStorage for persistence
    setSessionPatient(sessionId.value, patient);
    
    const { linkPatientToSession } = await import('~/services/patientEngine');
    await linkPatientToSession(sessionId.value, patient.cpt);
    
    toast.add({
      title: 'Patient Linked',
      description: `${patient.firstName} ${patient.lastName} linked to session`,
      color: 'success'
    });
    
    router.push(`/sessions/${sessionId.value}/summary`);
  }
  
  // ============================================
  // Query Management
  // ============================================
  
  /**
   * Clear search query
   */
  function clearQuery(): void {
    query.value = '';
    results.value = [];
    error.value = null;
    selectedPatient.value = null;
  }
  
  /**
   * Set query
   */
  function setQuery(q: string): void {
    query.value = q;
  }
  
  // ============================================
  // Return
  // ============================================
  
  return {
    // State
    query,
    mode,
    results,
    selectedPatient,
    recentPatients,
    isSearching,
    isLoadingCPT,
    isLoadingRecent,
    error,
    
    // Computed
    isValidQuery,
    hasNoResults,
    hasError,
    queryHint,
    sessionId,
    
    // CPT lookup
    lookupByCPT,
    handleCPTInput,
    
    // Search
    search,
    debouncedSearch,
    immediateSearch,
    
    // Selection
    selectPatient,
    clearSelection,
    selectFromRecent,
    
    // Mode
    setMode,
    cycleMode,
    
    // Navigation
    navigateToRegistration,
    navigateToSummary,
    linkToSession,
    
    // Query
    clearQuery,
    setQuery,
    
    // Init
    loadRecentPatients,
    initializeFromQuery
  };
}
