/**
 * Form Engine Composable
 * 
 * Provides a simple interface to the formEngine service
 * for use in Vue components.
 */

import { formEngine } from '@/services/formEngine';
import type { ClinicalFormInstance } from '~/types/clinical-form';

export function useFormEngine() {
  /**
   * Get or create a form instance for a workflow
   */
  async function getOrCreateInstance(options: {
    workflow: string;
    sessionId: string;
  }): Promise<ClinicalFormInstance> {
    const { workflow, sessionId } = options;
    
    // For now, create a new instance with sessionId
    // In the future, we could check for existing instances linked to this session
    const instance = await formEngine.createInstance(
      workflow,
      sessionId // Using sessionId as patientId for now
    );
    
    // Link the form to the session
    if (!instance.sessionId) {
      instance.sessionId = sessionId;
      await formEngine.saveInstance(instance);
    }
    
    return instance;
  }
  
  /**
   * Get the latest form instance for a session
   */
  async function getLatestInstanceBySession(options: {
    schemaId: string;
    sessionId: string;
  }): Promise<ClinicalFormInstance | null> {
    return await formEngine.getLatestInstanceBySession(options);
  }
  
  return {
    getOrCreateInstance,
    getLatestInstanceBySession
  };
}
