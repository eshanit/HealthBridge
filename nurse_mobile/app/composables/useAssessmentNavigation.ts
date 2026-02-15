/**
 * Assessment Navigation Composable
 * 
 * Manages assessment form navigation state using a shared composable
 * instead of query parameters to pass patient data between routes.
 * 
 * This follows the DRY principle by centralizing form navigation logic.
 */

import { ref } from 'vue';

export interface AssessmentNavigationState {
  schemaId: string | null;
  formId: string | null;
  sessionId: string | null;
  patientData: {
    patientId?: string;
    patientName?: string;
    dateOfBirth?: string;
    gender?: string;
    weightKg?: number;  // Optional weight from registration
  } | null;
}

const navigationState = ref<AssessmentNavigationState>({
  schemaId: null,
  formId: null,
  sessionId: null,
  patientData: null
});

export function useAssessmentNavigation() {
  /**
   * Set navigation state before navigating to an assessment form
   */
  function setNavigationState(
    schemaId: string,
    formId: string,
    sessionId: string,
    patientData?: {
      patientId?: string;
      patientName?: string;
      dateOfBirth?: string;
      gender?: string;
      weightKg?: number;  // Optional weight from registration
    }
  ) {
    navigationState.value = {
      schemaId,
      formId,
      sessionId,
      patientData: patientData || null
    };
    console.log('[useAssessmentNavigation] Navigation state set:', navigationState.value);
  }

  /**
   * Get current navigation state
   */
  function getNavigationState(): AssessmentNavigationState {
    return navigationState.value;
  }

  /**
   * Clear navigation state after use
   */
  function clearNavigationState() {
    navigationState.value = {
      schemaId: null,
      formId: null,
      sessionId: null,
      patientData: null
    };
  }

  /**
   * Check if navigation state exists for a given schemaId and formId
   */
  function hasNavigationState(schemaId: string, formId: string): boolean {
    return (
      navigationState.value.schemaId === schemaId &&
      navigationState.value.formId === formId
    );
  }

  return {
    navigationState,
    setNavigationState,
    getNavigationState,
    clearNavigationState,
    hasNavigationState
  };
}
