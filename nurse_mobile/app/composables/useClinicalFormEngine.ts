/**
 * Clinical Form Engine Composable
 * 
 * REQUIRED for all clinical forms per ARCHITECTURE_RULES.md
 * 
 * Provides a standardized interface for:
 * - Form state management
 * - Field validation with Zod schemas
 * - Encryption and persistence through secureDb
 * - Clinical workflow enforcement
 */

import { ref, computed, shallowRef, triggerRef, type Ref, type ComputedRef } from 'vue';
import { formEngine } from '@/services/formEngine';
import { updateSessionTriage } from '@/services/sessionEngine';
import { bridgeAssessmentToTreatment } from '@/services/treatmentBridge';
import type { 
  ClinicalFormSchema, 
  ClinicalFormInstance, 
  FormSection,
  SaveResult,
  ValidationResult 
} from '~/types/clinical-form';
import type { z } from 'zod';
import { getFieldSchema } from '~/schemas/clinical/fieldSchemas';

interface UseClinicalFormEngineOptions {
  /** Schema ID to load from form engine */
  schemaId: string;
  /** Form instance ID to load existing instance (optional) */
  formId?: string;
  /** Zod schema for field validation */
  zodSchema?: z.ZodType<unknown>;
  /** Optional session ID to associate with the form */
  sessionId?: string;
  /** Optional patient data to pre-populate (from session) */
  patientData?: {
    patientId?: string;
    patientName?: string;
    dateOfBirth?: string;
    gender?: string;
  };
  /** Optional custom save handler */
  onSave?: (fieldId: string, value: unknown, instance: ClinicalFormInstance) => Promise<void>;
}

interface UseClinicalFormEngineReturn {
  // State
  formState: any;
  schema: any;
  instance: any;
  isLoading: Ref<boolean>;
  isSaving: Ref<boolean>;
  validationErrors: Ref<Record<string, string>>;
  
  // Computed
  currentSectionIndex: any;
  currentSection: any;
  progress: any;
  triagePriority: any;
  
  // Methods
  initialize: () => Promise<void>;
  saveField: (fieldId: string, value: unknown) => Promise<SaveResult>;
  validateForm: () => Promise<ValidationResult>;
  getFieldValue: (fieldId: string) => unknown;
  setFieldValue: (fieldId: string, value: unknown) => void;
  nextSection: () => Promise<void>;
  previousSection: () => void;
  completeForm: () => Promise<{ allowed: boolean; reason?: string }>;
}

export function useClinicalFormEngine(options: UseClinicalFormEngineOptions): UseClinicalFormEngineReturn {
  // Reactive state
  const isLoading = ref(false);
  const isSaving = ref(false);
  const currentSectionIndex = ref(0);
  const validationErrors = ref<Record<string, string>>({});
  
  // Shallow refs for performance (large objects)
  const schema = shallowRef<ClinicalFormSchema | null>(null);
  const instance = shallowRef<ClinicalFormInstance | null>(null);
  const formState = shallowRef<Record<string, unknown>>({});
  
  // Computed
  const currentSection = computed(() => {
    if (!schema.value?.sections || !instance.value) {
      console.log('[useClinicalFormEngine] currentSection: schema or instance missing');
      return undefined;
    }
    const section = schema.value.sections[currentSectionIndex.value];
    console.log('[useClinicalFormEngine] currentSection:', {
      index: currentSectionIndex.value,
      sectionId: section?.id,
      totalSections: schema.value.sections.length
    });
    return section;
  });
  
  const progress = computed(() => {
    if (!schema.value?.sections) return 0;
    return ((currentSectionIndex.value + 1) / schema.value.sections.length) * 100;
  });
  
  const triagePriority = computed(() => instance.value?.calculated?.triagePriority);
  
  // Get user ID for audit logging
  function getUserId(): string {
    if (typeof window !== 'undefined') {
      // Use localStorage directly to avoid Pinia initialization issues
      return localStorage.getItem('healthbridge_device_id') || 'unknown';
    }
    return 'server';
  }
  
  // Initialize form
  async function initialize(): Promise<void> {
    if (isLoading.value) return;
    
    isLoading.value = true;
    validationErrors.value = {};
    
    try {
      // Load schema
      const loadedSchema = await formEngine.loadSchema(options.schemaId);
      schema.value = loadedSchema;
      
      let newInstance: ClinicalFormInstance;
      
      // Check if we have an existing form ID to load
      // Only load existing instance if formId is not 'new' or empty
      if (options.formId && options.formId !== 'new') {
        // Load existing instance
        newInstance = await formEngine.loadInstance(options.formId);
        console.log('[useClinicalFormEngine] Loaded existing instance:', newInstance._id, 'sessionId:', newInstance.sessionId);
      } else {
        // Create new instance
        newInstance = await formEngine.createInstance(
          options.schemaId,
          getUserId()
        );
        
        // Associate with session if provided
        if (options.sessionId && newInstance) {
          newInstance.sessionId = options.sessionId;
          console.log('[useClinicalFormEngine] Associated new instance with sessionId:', options.sessionId);
        }
        
        // Pre-populate with patient data if provided (from session)
        if (options.patientData && newInstance) {
          // Map patient data to form answers
          if (options.patientData.patientId) {
            newInstance.patientId = options.patientData.patientId;
            newInstance.answers.patient_id = options.patientData.patientId;
          }
          if (options.patientData.patientName) {
            newInstance.patientName = options.patientData.patientName;
            newInstance.answers.patient_name = options.patientData.patientName;
          }
          if (options.patientData.dateOfBirth) {
            newInstance.answers.patient_dob = options.patientData.dateOfBirth;
          }
          if (options.patientData.gender) {
            newInstance.answers.patient_gender = options.patientData.gender;
          }
          
          console.log('[useClinicalFormEngine] Pre-populated patient data:', newInstance.answers);
          
          // Skip patient_info section when patient data is provided
          // Find the next section (danger_signs typically follows patient_info)
          if (schema.value?.sections && schema.value.sections.length > 1) {
            const nextSectionIndex = schema.value.sections.findIndex((s: any) => s.id === 'danger_signs');
            if (nextSectionIndex >= 0) {
              newInstance.currentStateId = 'danger_signs';
              currentSectionIndex.value = nextSectionIndex;
              console.log('[useClinicalFormEngine] Skipped patient_info, starting at:', newInstance.currentStateId);
            }
          }
          
          // Save the instance with pre-populated data
          console.log('[useClinicalFormEngine] Saving new instance with sessionId:', newInstance.sessionId);
          await formEngine.saveInstance(newInstance);
        }
      }
      
      instance.value = newInstance;
      console.log('[useClinicalFormEngine] Instance ready, sessionId:', instance.value?.sessionId);
      
      // Initialize form state from instance answers
      formState.value = { ...newInstance.answers };
      
      // Set current section based on instance state
      if (schema.value?.sections && instance.value?.currentStateId) {
        const sectionIndex = schema.value.sections.findIndex((s: any) => s.id === instance.value?.currentStateId);
        if (sectionIndex >= 0) {
          currentSectionIndex.value = sectionIndex;
        }
      }
      
      console.log('[useClinicalFormEngine] Initialized successfully');
    } catch (error) {
      console.error('[useClinicalFormEngine] Failed to initialize:', error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  }
  
  // Save a field value with validation
  async function saveField(fieldId: string, value: unknown): Promise<SaveResult> {
    if (!instance.value) {
      return { success: false, formInstance: null as any };
    }
    
    try {
      // 1. Validate with Zod schema if provided
      // Use partial validation for incremental field entry (only validate the field being saved)
      if (options.zodSchema) {
        // Get the field schema for the specific field
        const fieldSchema = getFieldSchema(fieldId);
        
        if (fieldSchema) {
          // Validate just this field
          const fieldValidation = fieldSchema.safeParse(value);
          
          if (!fieldValidation.success) {
            const errors = fieldValidation.error.format();
            const fieldError = (errors as Record<string, any>)?._errors?.[0] || 'Invalid value';
            validationErrors.value = {
              ...validationErrors.value,
              [fieldId]: fieldError
            };
            
            return {
              success: false,
              formInstance: instance.value,
              validationWarnings: [{
                fieldId,
                message: fieldError,
                severity: 'warning' as const
              }]
            };
          }
          
          // Clear previous validation error for this field
          const { [fieldId]: _, ...remainingErrors } = validationErrors.value;
          validationErrors.value = remainingErrors;
        }
      }
      
      // 2. Save through ClinicalFormEngine
      const result = await formEngine.saveFieldValue(
        instance.value._id,
        fieldId,
        value,
        getUserId()
      );
      
      if (!result.success) {
        return {
          success: false,
          formInstance: instance.value
        };
      }
      
      // 3. Update local state
      instance.value = result.formInstance;
      formState.value = { ...result.formInstance.answers };
      
      // Force reactivity for computed properties that depend on instance.value
      // This is needed because shallowRef doesn't track nested mutations
      triggerRef(instance);
      
      console.log('[useClinicalFormEngine] triggerRef called, instance answers:', instance.value?.answers);
      
      // 4. Call custom save handler if provided
      if (options.onSave) {
        await options.onSave(fieldId, value, result.formInstance);
      }
      
      return { success: true, formInstance: result.formInstance };
      
    } catch (error) {
      console.error('[useClinicalFormEngine] Failed to save field:', error);
      return {
        success: false,
        formInstance: instance.value,
        validationWarnings: [{
          fieldId,
          message: error instanceof Error ? error.message : 'Failed to save field',
          severity: 'warning' as const
        }]
      };
    }
  }
  
  // Validate entire form
  async function validateForm(): Promise<ValidationResult> {
    if (!instance.value) {
      return { valid: false, errors: ['Form not initialized'] };
    }
    
    // Use validateTransition as a proxy for instance validation
    const result = await formEngine.validateTransition(instance.value._id, instance.value.currentStateId);
    return { valid: result.valid, errors: result.valid ? undefined : result.errors };
  }
  
  // Get field value from form state
  function getFieldValue(fieldId: string): unknown {
    // First check if it's a calculated field
    if (schema.value?.fields) {
      const fieldDef = schema.value.fields.find((f: any) => f.id === fieldId);
      if (fieldDef?.type === 'calculated') {
        // Return value from calculated object (try both snake_case and camelCase)
        return (
          instance.value?.calculated?.[fieldId] ||
          instance.value?.calculated?.[fieldId.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())]
        );
      }
    }
    // Otherwise return from form state (user answers)
    return formState.value[fieldId];
  }
  
  // Set field value directly (for programmatic updates)
  function setFieldValue(fieldId: string, value: unknown): void {
    formState.value = {
      ...formState.value,
      [fieldId]: value
    };
  }
  
  // Navigate to next section
  async function nextSection(): Promise<void> {
    if (!schema.value?.workflow || !instance.value) {
      console.log('[useClinicalFormEngine] nextSection blocked: no schema or instance');
      return;
    }
    
    // Get the current workflow state
    const currentInstance = instance.value;
    const currentState = schema.value.workflow.find((s: any) => s.id === currentInstance.currentStateId);
    if (!currentState || !currentState.allowedTransitions || currentState.allowedTransitions.length === 0) {
      console.log('[useClinicalFormEngine] nextSection blocked: no valid current state');
      return;
    }
    
    // Get the next state ID from allowed transitions (first one)
    const nextStateId = currentState.allowedTransitions[0] as string;
    console.log('[useClinicalFormEngine] Next state:', nextStateId);
    
    // Find the section index for the next state
    const nextSectionIndex = schema.value.sections.findIndex((s: any) => s.id === nextStateId);
    console.log('[useClinicalFormEngine] Next section index:', nextSectionIndex);
    
    if (nextSectionIndex === -1) {
      console.log('[useClinicalFormEngine] nextSection blocked: state not in sections');
      return;
    }
    
    // Validate transition before proceeding
    const validation = await formEngine.validateTransition(
      currentInstance._id,
      nextStateId
    );
    
    if (!validation.valid && validation.errors && validation.errors.length > 0) {
      throw new Error(validation.errors.join(', '));
    }
    
    // Update the instance state
    currentInstance.currentStateId = nextStateId;
    currentSectionIndex.value = nextSectionIndex;
    
    // Force reactivity update
    currentSectionIndex.value = nextSectionIndex + 0;
    
    console.log('[useClinicalFormEngine] Updated section index to:', currentSectionIndex.value);
  }
  
  // Navigate to previous section
  function previousSection(): void {
    if (currentSectionIndex.value > 0) {
      currentSectionIndex.value--;
    }
  }
  
  // Complete the form
  async function completeForm(): Promise<{ allowed: boolean; reason?: string }> {
    if (!instance.value) {
      return { allowed: false, reason: 'Form not initialized' };
    }
    
    isSaving.value = true;
    
    try {
      const result = await formEngine.transitionState(
        instance.value._id,
        'complete',
        getUserId()
      );
      
      if (result.allowed) {
        // Reload the instance to get updated calculated values
        instance.value = await formEngine.loadInstance(instance.value._id);
        
        // Update session triage if sessionId is available
        if (options.sessionId && instance.value.calculated?.triagePriority) {
          try {
            await updateSessionTriage(
              options.sessionId,
              instance.value.calculated.triagePriority as 'red' | 'yellow' | 'green' | 'unknown'
            );
            console.log('[useClinicalFormEngine] Updated session triage:', instance.value.calculated.triagePriority);
          } catch (triageError) {
            console.error('[useClinicalFormEngine] Failed to update session triage:', triageError);
            // Don't fail the form completion if triage update fails
          }
        }
        
        // Bridge assessment to treatment (populate treatment form with triage and actions)
        if (options.sessionId && instance.value.calculated?.triagePriority) {
          try {
            const bridgeResult = await bridgeAssessmentToTreatment({
              sessionId: options.sessionId,
              assessmentInstance: instance.value
            });
            
            if (!bridgeResult.success) {
              console.warn('[useClinicalFormEngine] Treatment bridge failed:', bridgeResult.error);
              // Don't fail form completion for bridge failure
            } else {
              console.log('[useClinicalFormEngine] Treatment form bridged successfully');
            }
          } catch (bridgeError) {
            console.error('[useClinicalFormEngine] Treatment bridge error:', bridgeError);
            // Don't fail form completion for bridge error
          }
        }
        
        return { allowed: true };
      }
      
      return { allowed: false, reason: result.reason };
    } catch (error) {
      console.error('[useClinicalFormEngine] Failed to complete form:', error);
      return {
        allowed: false,
        reason: error instanceof Error ? error.message : 'Failed to complete form'
      };
    } finally {
      isSaving.value = false;
    }
  }
  
  return {
    // State
    formState,
    schema,
    instance,
    isLoading,
    isSaving,
    validationErrors,
    
    // Computed
    currentSectionIndex,
    currentSection,
    progress,
    triagePriority,
    
    // Methods
    initialize,
    saveField,
    validateForm,
    getFieldValue,
    setFieldValue,
    nextSection,
    previousSection,
    completeForm
  };
}


