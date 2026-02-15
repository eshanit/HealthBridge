/**
 * Reactive AI Composable
 * 
 * Makes AI guidance responsive to nurse's field answers in real-time.
 * Automatically triggers AI updates when significant clinical data changes.
 * 
 * Key Features:
 * - Debounced field change watching
 * - Smart trigger detection (danger signs, vital signs, thresholds)
 * - Inconsistency detection
 * - Automatic AI refresh on clinical changes
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { isAIEnabled, getAIConfig } from '~/services/aiConfig';
import { logAIInteraction, logAIError, type AIInteractionDetails } from '~/services/auditLogger';
import { calculateAgeInMonths, getAgeMonthsNumeric } from '~/types/patient';

// Debounce delay for AI updates (ms)
const DEBOUNCE_DELAY = 1500;

// Fields that should trigger AI update when changed
const TRIGGER_FIELDS = {
  // Danger signs (immediate escalation potential)
  danger_signs: [
    'unable_to_drink',
    'lethargic_or_unconscious',
    'convulsing',
    'cyanosis',
    'severe_distress',
    'stridor',
    'burns',
    'bleeding',
    'poisoning',
    'trauma'
  ],
  
  // Vital signs (threshold-based decisions)
  vital_signs: [
    'respiratory_rate',
    'oxygen_saturation',
    'heart_rate',
    'temperature',
    'weight',
    'height'
  ],
  
  // IMCI classification fields
  imci_fields: [
    'fast_breathing',
    'chest_indrawing',
    'wheezing',
    'crackles',
    'stridor_in_calm',
    'diarrhoea_duration',
    'blood_in_stool',
    'dehydration_status',
    'malnutrition_status',
    'edema'
  ],
  
  // Age-critical fields
  age_fields: [
    'age_months',
    'age_years',
    'date_of_birth'
  ]
};

// High-priority triggers (should always update AI)
const HIGH_PRIORITY_FIELDS = [
  'unable_to_drink',
  'lethargic_or_unconscious',
  'convulsing',
  'cyanosis',
  'stridor',
  'respiratory_rate'
];

// Re-export inconsistency types
export interface ClinicalInconsistency {
  type: 'danger_sign' | 'threshold' | 'missing' | 'contradiction';
  field: string;
  value: unknown;
  expected: string;
  message: string;
  severity: 'warning' | 'error' | 'info';
}

interface ReactiveAIOptions {
  /** Schema ID for prompting */
  schemaId?: string;
  /** Form ID for session tracking */
  formId?: string;
  /** Session ID for audit logging */
  sessionId?: string;
  /** Enable/disable auto-triggering (default: true) */
  autoTriggerEnabled?: boolean;
  /** Callback when AI response is ready */
  onGuidanceReady?: (response: Record<string, unknown>) => void;
  /** Callback when inconsistencies are detected */
  onInconsistenciesFound?: (inconsistencies: ClinicalInconsistency[]) => void;
  /** Callback when AI status changes */
  onStatusChange?: (status: 'idle' | 'checking' | 'generating' | 'ready' | 'error') => void;
  /** Reactive effective priority computed from danger signs (overrides calculated.triagePriority) */
  effectivePriority?: ComputedRef<'red' | 'yellow' | 'green' | undefined>;
  /** Getter function to retrieve current form state (for reactive updates) */
  getFormState?: () => Record<string, unknown>;
  /** Getter function to retrieve current calculated values (for reactive updates) */
  getCalculated?: () => Record<string, unknown>;
}

interface ReactiveAIReturn {
  // State
  status: Ref<'idle' | 'checking' | 'generating' | 'ready' | 'error'>;
  error: Ref<string>;
  guidance: Ref<Record<string, unknown> | null>;
  inconsistencies: Ref<ClinicalInconsistency[]>;
  pendingChanges: Ref<number>;
  autoTriggerEnabled: Ref<boolean>;
  
  // Computed
  hasHighPriorityChange: ComputedRef<boolean>;
  shouldUpdateAI: ComputedRef<boolean>;
  
  // Methods
  init: (formState: Record<string, unknown>, calculated: Record<string, unknown>) => void;
  handleFieldChange: (fieldId: string, value: unknown) => Promise<void>;
  askMedGemma: () => Promise<void>;
  requestUpdate: () => Promise<void>;
  setAutoTrigger: (enabled: boolean) => void;
  dismissGuidance: () => void;
  clearPendingChanges: () => void;
}

export function useReactiveAI(options: ReactiveAIOptions = {}): ReactiveAIReturn {
  // State
  const status = ref<'idle' | 'checking' | 'generating' | 'ready' | 'error'>('idle');
  const error = ref<string>('');
  const guidance = ref<Record<string, unknown> | null>(null);
  const inconsistencies = ref<ClinicalInconsistency[]>([]);
  const pendingChanges = ref(0);
  const lastUpdateHash = ref('');
  const autoTriggerEnabled = ref(options.autoTriggerEnabled !== false); // Default: true
  
  // Local refs for reactivity
  let formStateRef: Ref<Record<string, unknown>> | null = null;
  let calculatedRef: Ref<Record<string, unknown>> | null = null;
  
  // Debounce timer
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  
  // Track field values for change detection
  const previousValues = new Map<string, unknown>();
  
  // Computed
  const hasHighPriorityChange = computed(() => {
    return pendingChanges.value > 0;
  });
  
  const shouldUpdateAI = computed(() => {
    if (!isAIEnabled('EXPLAIN_TRIAGE')) return false;
    if (status.value === 'generating' || status.value === 'checking') return false;
    
    // Only update if we have pending significant changes
    return pendingChanges.value > 0;
  });
  
  // Initialize with form state
  function init(formState: Record<string, unknown>, calculated: Record<string, unknown>) {
    // Store refs for later use
    formStateRef = ref(formState);
    calculatedRef = ref(calculated);
    
    // Store initial values
    Object.entries(formState).forEach(([key, value]) => {
      previousValues.set(key, value);
    });
    
    console.log('[ReactiveAI] Initialized with form state');
  }
  
  // Determine if a field change should trigger AI update
  function isTriggerField(fieldId: string): boolean {
    return (
      TRIGGER_FIELDS.danger_signs.includes(fieldId) ||
      TRIGGER_FIELDS.vital_signs.includes(fieldId) ||
      TRIGGER_FIELDS.imci_fields.includes(fieldId) ||
      HIGH_PRIORITY_FIELDS.includes(fieldId)
    );
  }
  
  // Handle field change
  async function handleFieldChange(fieldId: string, value: unknown) {
    // Check if auto-trigger is enabled
    if (!autoTriggerEnabled.value) {
      // Just track the change but don't trigger AI
      const previousValue = previousValues.get(fieldId);
      previousValues.set(fieldId, value);
      pendingChanges.value++;
      return;
    }
    
    // Only process trigger fields
    if (!isTriggerField(fieldId)) {
      return;
    }
    
    console.log(`[ReactiveAI] Field changed: ${fieldId} = ${value}`);
    
    // Track previous value
    const previousValue = previousValues.get(fieldId);
    previousValues.set(fieldId, value);
    
    // Increment pending changes
    pendingChanges.value++;
    
    // Check for high-priority triggers (immediate update)
    if (HIGH_PRIORITY_FIELDS.includes(fieldId)) {
      console.log(`[ReactiveAI] High-priority field detected: ${fieldId}`);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      await requestUpdate();
      return;
    }
    
    // Debounce regular updates
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    debounceTimer = setTimeout(async () => {
      await requestUpdate();
    }, DEBOUNCE_DELAY);
  }
  
  // Manual "Ask MedGemma" trigger - call this when user clicks the button
  async function askMedGemma() {
    console.log('[ReactiveAI] Manual Ask MedGemma triggered');
    
    // Clear any pending debounce
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    // Force update regardless of pending changes
    pendingChanges.value++;
    await requestUpdate();
  }
  
  // Enable or disable auto-triggering
  function setAutoTrigger(enabled: boolean) {
    autoTriggerEnabled.value = enabled;
    console.log(`[ReactiveAI] Auto-trigger ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  // Request AI update
  async function requestUpdate() {
    // Use getter functions if provided (for reactive updates), otherwise fall back to stored refs
    const currentFormState = options.getFormState?.() || formStateRef?.value || {};
    const currentCalculated = options.getCalculated?.() || calculatedRef?.value || {};
    
    if (!currentFormState || Object.keys(currentFormState).length === 0) {
      console.warn('[ReactiveAI] No form state available');
      return;
    }
    
    // Check if AI is enabled
    if (!isAIEnabled('EXPLAIN_TRIAGE')) {
      console.log('[ReactiveAI] AI not enabled');
      pendingChanges.value = 0;
      return;
    }
    
    const config = getAIConfig();
    if (!config.enabled) {
      console.log('[ReactiveAI] AI disabled in config');
      pendingChanges.value = 0;
      return;
    }
    
    // Generate new state hash
    const newHash = generateStateHash(currentFormState);
    if (newHash === lastUpdateHash.value && pendingChanges.value === 0) {
      console.log('[ReactiveAI] No significant changes detected');
      return;
    }
    
    // Update status
    status.value = 'generating';
    options.onStatusChange?.('generating');
    error.value = '';
    
    try {
      // Build context from form state and calculated values
      const context = buildContext(currentFormState, currentCalculated);
      
      // Detect inconsistencies
      const detectedInconsistencies = detectInconsistenciesFromState(currentFormState, currentCalculated);
      inconsistencies.value = detectedInconsistencies;
      options.onInconsistenciesFound?.(detectedInconsistencies);
      
      // Use reactive effectivePriority if provided, otherwise fall back to calculated
      const reactivePriority = options.effectivePriority?.value || 
                               (currentCalculated?.triagePriority as 'red' | 'yellow' | 'green' | undefined);
      
      // Build calculated object with reactive priority
      const calculatedWithReactivePriority = {
        ...currentCalculated,
        triagePriority: reactivePriority
      };
      
      // Call AI endpoint with full session metadata
      const requestBody = {
        // Session metadata (per JSON schema)
        sessionId: options.sessionId,
        schemaId: options.schemaId || 'triage',
        formId: undefined, // Will be added when available
        
        // Request tracking (per JSON schema)
        requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        
        // Core clinical data
        currentValues: currentFormState,
        calculated: calculatedWithReactivePriority,
        promptType: 'INCONSISTENCY_CHECK', // Updated to new task type
        
        // AI interaction
        inconsistencies: detectedInconsistencies
      };
      
      console.log('[MedGemma Debug] Full prompt payload being sent to medgemma:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`AI request failed: ${response.status}`);
      }
      
      const data: Record<string, unknown> = await response.json();
      
      // Validate response
      if (!data.explanation) {
        throw new Error('Invalid AI response');
      }
      
      // Update state
      guidance.value = data;
      lastUpdateHash.value = newHash;
      pendingChanges.value = 0;
      status.value = 'ready';
      options.onStatusChange?.('ready');
      options.onGuidanceReady?.(data);
      
      // Log interaction with new task type
      const interaction: AIInteractionDetails = {
        useCase: 'INCONSISTENCY_CHECK',
        modelVersion: (data.modelVersion as string) || 'unknown',
        responseTime: (data.responseTime as number) || 0,
        confidence: (data.confidence as number) || 0,
        inputTokens: 0,
        outputTokens: 0,
        safetyFlags: [],
        nurseAction: 'viewed'
      };
      
      logAIInteraction(options.sessionId || 'unknown', interaction);
      
      console.log('[ReactiveAI] Guidance updated:', (data.explanation as string)?.substring(0, 100));
      
    } catch (err) {
      console.error('[ReactiveAI] Failed to update:', err);
      error.value = err instanceof Error ? err.message : 'Failed to update AI guidance';
      status.value = 'error';
      options.onStatusChange?.('error');
      
      logAIError(
        options.sessionId || 'unknown',
        'REACTIVE_GUIDANCE',
        error.value
      );
    }
  }
  
  // Generate hash of current form state for change detection
  function generateStateHash(formState: Record<string, unknown>): string {
    const relevantState: Record<string, unknown> = {};
    
    // Only include trigger fields
    Object.entries(formState).forEach(([key, value]) => {
      if (isTriggerField(key)) {
        relevantState[key] = value;
      }
    });
    
    return JSON.stringify(relevantState, Object.keys(relevantState).sort());
  }
  
  // Build context for AI prompt
  function buildContext(
    formState: Record<string, unknown>,
    calculated: Record<string, unknown>
  ): Record<string, unknown> {
    const context: Record<string, unknown> = {};
    
    // Calculate age from date of birth or use provided age
    const dateOfBirth = formState.date_of_birth || formState.patient_dob || formState.patient_dateOfBirth;
    const ageMonthsInput = formState.age_months || formState.patient_age_months;
    
    let formattedAge = '';
    let ageMonthsNumeric = 0;
    
    if (dateOfBirth && typeof dateOfBirth === 'string') {
      formattedAge = calculateAgeInMonths(dateOfBirth);
      ageMonthsNumeric = getAgeMonthsNumeric(dateOfBirth);
    } else if (ageMonthsInput && typeof ageMonthsInput === 'number') {
      ageMonthsNumeric = ageMonthsInput;
      if (ageMonthsInput < 12) {
        formattedAge = `${ageMonthsInput} month${ageMonthsInput !== 1 ? 's' : ''} old`;
      } else {
        const years = Math.floor(ageMonthsInput / 12);
        const months = ageMonthsInput % 12;
        formattedAge = `${years} year${years !== 1 ? 's' : ''} ${months} month${months !== 1 ? 's' : ''} old`;
      }
    }
    
    // Add age information to context
    if (formattedAge) {
      context.patientAgeFormatted = formattedAge;
    }
    if (ageMonthsNumeric > 0) {
      context.age_months = ageMonthsNumeric;
    }
    
    // Patient context
    const weight = formState.weight || formState.patient_weight || calculated.weight;
    if (weight) context.weight = weight;
    
    // Danger signs
    TRIGGER_FIELDS.danger_signs.forEach(field => {
      if (formState[field] !== undefined) {
        context[field] = formState[field];
      }
    });
    
    // Vital signs
    TRIGGER_FIELDS.vital_signs.forEach(field => {
      if (formState[field] !== undefined) {
        context[field] = formState[field];
      }
    });
    
    // IMCI findings
    TRIGGER_FIELDS.imci_fields.forEach(field => {
      if (formState[field] !== undefined) {
        context[field] = formState[field];
      }
    });
    
    // Calculated triage
    if (calculated.triagePriority) {
      context.triagePriority = calculated.triagePriority;
    }
    if (calculated.triageClassification) {
      context.triageClassification = calculated.triageClassification;
    }
    if (calculated.triageActions) {
      context.triageActions = calculated.triageActions;
    }
    
    return context;
  }
  
  // Detect inconsistencies from form state
  function detectInconsistenciesFromState(
    values: Record<string, unknown>,
    calculated: Record<string, unknown>
  ): ClinicalInconsistency[] {
    const inconsistencies: ClinicalInconsistency[] = [];
    const priority = (calculated.triagePriority || 'green') as string;
    const ageMonths = values.age_months as number || 0;
    
    // Check danger signs that should trigger RED
    const dangerSignsRed = [
      'unable_to_drink',
      'vomits_everything',
      'convulsions',
      'lethargic_or_unconscious',
      'cyanosis',
      'respiratory_distress_severe'
    ];
    
    for (const dangerSign of dangerSignsRed) {
      if (values[dangerSign] === true && priority !== 'red') {
        inconsistencies.push({
          type: 'danger_sign',
          field: dangerSign,
          value: true,
          expected: 'Red priority',
          message: `${formatFieldName(dangerSign)} is marked positive but priority is ${priority}. This typically requires RED priority.`,
          severity: 'error'
        });
      }
    }
    
    // Check respiratory rate thresholds
    if (values.fast_breathing === true && typeof values.respiratory_rate === 'number') {
      const respRate = values.respiratory_rate as number;
      let threshold = 40; // default for 12-60 months
      if (ageMonths < 2) threshold = 60;
      else if (ageMonths < 12) threshold = 50;
      
      if (respRate >= threshold && priority === 'green') {
        inconsistencies.push({
          type: 'threshold',
          field: 'respiratory_rate',
          value: respRate,
          expected: `Yellow priority (≥${threshold} for age)`,
          message: `Respiratory rate (${respRate}) exceeds IMCI threshold (${threshold}) for age ${ageMonths} months. Classification as GREEN may be incorrect.`,
          severity: 'error'
        });
      }
    }
    
    // Check chest indrawing
    if (values.chest_indrawing === true && priority === 'green') {
      inconsistencies.push({
        type: 'danger_sign',
        field: 'chest_indrawing',
        value: true,
        expected: 'Yellow or Red priority',
        message: 'Chest indrawing is present but priority is GREEN. This indicates respiratory distress.',
        severity: 'error'
      });
    }
    
    // Check contradiction between consciousness fields
    if (values.lethargic_or_unconscious === true && values.consciousness === 'alert') {
      inconsistencies.push({
        type: 'contradiction',
        field: 'consciousness',
        value: values.consciousness,
        expected: 'Consistent with lethargy',
        message: 'Patient marked as alert but also has lethargic/unconscious danger sign.',
        severity: 'error'
      });
    }
    
    // Check hydration contradictions
    if (values.unable_to_drink === true && values.drinks_normally === true) {
      inconsistencies.push({
        type: 'contradiction',
        field: 'hydration',
        value: 'Normal drinking',
        expected: 'Unable to drink',
        message: 'Patient marked as unable to drink but also drinks normally.',
        severity: 'error'
      });
    }
    
    return inconsistencies;
  }
  
  // Format field name for display
  function formatFieldName(field: string): string {
    return field
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  // Dismiss guidance
  function dismissGuidance() {
    guidance.value = null;
    error.value = '';
    status.value = 'idle';
  }
  
  // Clear pending changes
  function clearPendingChanges() {
    pendingChanges.value = 0;
  }
  
  return {
    // State
    status,
    error,
    guidance,
    inconsistencies,
    pendingChanges,
    autoTriggerEnabled,
    
    // Computed
    hasHighPriorityChange,
    shouldUpdateAI,
    
    // Methods
    init,
    handleFieldChange,
    askMedGemma,
    requestUpdate,
    setAutoTrigger,
    dismissGuidance,
    clearPendingChanges
  };
}

// Export trigger field lists for external use
export { TRIGGER_FIELDS, HIGH_PRIORITY_FIELDS };
export type { ReactiveAIOptions, ReactiveAIReturn };
