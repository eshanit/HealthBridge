/**
 * Clinical Workflow Composable
 * 
 * REQUIRED for all clinical forms per ARCHITECTURE_RULES.md
 * 
 * Provides workflow state machine enforcement for clinical forms:
 * - Validates state transitions
 * - Enforces required fields before transitions
 * - Guards against protocol violations
 */

import { computed, shallowRef } from 'vue';
import { formEngine } from '@/services/formEngine';
import type { ClinicalFormInstance, WorkflowState } from '~/types/clinical-form';

interface UseClinicalWorkflowReturn {
  // State
  currentStateId: any;
  workflowStates: any;
  
  // Computed
  currentState: any;
  allowedTransitions: any;
  isFirstState: any;
  isLastState: any;
  canProceed: any;
  
  // Methods
  getStateById: (stateId: string) => WorkflowState | undefined;
  validateTransition: (toStateId: string) => Promise<{ valid: boolean; errors?: string[] }>;
  transitionTo: (toStateId: string) => Promise<{ allowed: boolean; reason?: string }>;
  getRequiredFields: (stateId: string) => string[];
  isFieldRequired: (fieldId: string) => boolean;
}

export function useClinicalWorkflow(instanceId: string): UseClinicalWorkflowReturn {
  // Shallow ref for instance
  const instance = shallowRef<ClinicalFormInstance | null>(null);
  const workflowStates = shallowRef<WorkflowState[]>([]);
  
  // Computed
  const currentStateId = computed(() => instance.value?.currentStateId);
  
  const currentState = computed(() => {
    if (!workflowStates.value || !instance.value) return undefined;
    return workflowStates.value.find(s => s.id === instance.value?.currentStateId);
  });
  
  const allowedTransitions = computed(() => {
    return currentState.value?.allowedTransitions || [];
  });
  
  const isFirstState = computed(() => {
    if (!workflowStates.value || workflowStates.value.length === 0) return true;
    const firstState = workflowStates.value[0];
    return firstState?.id === instance.value?.currentStateId;
  });
  
  const isLastState = computed(() => {
    if (!workflowStates.value || workflowStates.value.length === 0) return true;
    const lastIndex = workflowStates.value.length - 1;
    const lastState = workflowStates.value[lastIndex];
    return lastState?.id === instance.value?.currentStateId;
  });
  
  const canProceed = computed(() => {
    return allowedTransitions.value.length > 0;
  });
  
  // Methods
  function getStateById(stateId: string): WorkflowState | undefined {
    return workflowStates.value.find(s => s.id === stateId);
  }
  
  async function validateTransition(toStateId: string): Promise<{ valid: boolean; errors?: string[] }> {
    return formEngine.validateTransition(instanceId, toStateId);
  }
  
  async function transitionTo(toStateId: string): Promise<{ allowed: boolean; reason?: string }> {
    return formEngine.transitionState(instanceId, toStateId, 'system');
  }
  
  function getRequiredFields(stateId: string): string[] {
    const state = getStateById(stateId);
    return state?.requiredFields || [];
  }
  
  function isFieldRequired(fieldId: string): boolean {
    const requiredFields = getRequiredFields(instance.value?.currentStateId || '');
    return requiredFields.includes(fieldId);
  }
  
  // Load instance data
  async function loadInstance(): Promise<void> {
    try {
      const inst = await formEngine.loadInstance(instanceId);
      instance.value = inst;
      
      // Load schema to get workflow states
      const schema = await formEngine.loadSchema(inst.schemaId);
      workflowStates.value = schema.workflow || [];
    } catch (error) {
      console.error('[useClinicalWorkflow] Failed to load instance:', error);
      throw error;
    }
  }
  
  // Initialize
  loadInstance();
  
  return {
    // State
    currentStateId,
    workflowStates,
    
    // Computed
    currentState,
    allowedTransitions,
    isFirstState,
    isLastState,
    canProceed,
    
    // Methods
    getStateById,
    validateTransition,
    transitionTo,
    getRequiredFields,
    isFieldRequired
  };
}
