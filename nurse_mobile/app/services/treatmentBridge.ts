/**
 * Treatment Bridge Service
 * 
 * Implements the Triage → Treatment Bridge Logic per specs/triage-to-treatment-bridge.md
 * 
 * When a clinical assessment form is completed and triage is calculated, this service:
 * 1. Determines the patient's triage priority
 * 2. Identifies the matched triage rule
 * 3. Automatically creates or updates a treatment form
 * 4. Pre-populates recommended_actions based on WHO IMCI rules
 * 5. Locks the actions from manual editing (read-only)
 * 
 * This logic is deterministic and NOT AI-driven.
 */

import { formEngine } from '~/services/formEngine';
import { linkFormToSession, advanceStage } from '~/services/sessionEngine';
import type { ClinicalFormInstance, TriagePriority } from '~/types/clinical-form';

// ============================================
// WHO IMCI Treatment Action Map (Fallback)
// ============================================

export const IMCI_TREATMENT_MAP: Record<string, string[]> = {
  red: [
    'urgent_referral',
    'oxygen_if_available',
    'first_dose_antibiotics',
    'airway_management',
    'keep_warm'
  ],
  yellow: [
    'oral_antibiotics',
    'home_care_advice',
    'follow_up_2_days'
  ],
  green: [
    'home_care',
    'return_if_worse',
    'follow_up_5_days'
  ]
};

// ============================================
// Types
// ============================================

export interface BridgeInput {
  sessionId: string;
  assessmentInstance: ClinicalFormInstance;
}

export interface BridgeResult {
  success: boolean;
  treatmentFormId?: string;
  error?: string;
}

// ============================================
// Bridge Function
// ============================================

/**
 * Bridge assessment data to treatment form.
 * 
 * Trigger: assessment form marked complete OR session stage moves to "treatment"
 * 
 * Failure handling:
 * - No triage → blocks treatment (returns error)
 * - No rule → falls back to IMCI_TREATMENT_MAP
 * - No actions → throws error + returns error result
 * - Form exists → updates instead of recreating
 */
export async function bridgeAssessmentToTreatment(
  input: BridgeInput
): Promise<BridgeResult> {
  const { sessionId, assessmentInstance } = input;

  console.log('[TreatmentBridge] Starting bridge for session:', sessionId);

  // ── Step 1: Extract triage data from assessment ──────────────────────
  const triagePriority: string | undefined =
    assessmentInstance.calculated?.triagePriority ||
    assessmentInstance.calculated?.triage_priority ||
    assessmentInstance.answers?.triage_priority;

  if (!triagePriority) {
    console.error('[TreatmentBridge] No triage result found in assessment');
    return {
      success: false,
      error: 'No triage result. Cannot proceed to treatment.'
    };
  }

  // ── Step 2: Resolve recommended actions ──────────────────────────────
  // Prefer matched triage rule actions, fall back to IMCI map
  const matchedTriageRule = assessmentInstance.calculated?.matchedTriageRule as
    | { id: string; priority: string; actions: string[] }
    | undefined;

  const triageActions: string[] | undefined =
    assessmentInstance.calculated?.triageActions ||
    assessmentInstance.calculated?.triage_actions;

  const actions: string[] =
    matchedTriageRule?.actions ??
    triageActions ??
    IMCI_TREATMENT_MAP[triagePriority] ??
    [];

  if (!actions || actions.length === 0) {
    console.error('[TreatmentBridge] No recommended actions resolved for priority:', triagePriority);
    return {
      success: false,
      error: 'No recommended actions resolved for triage priority: ' + triagePriority
    };
  }

  console.log('[TreatmentBridge] Resolved actions:', actions, 'for priority:', triagePriority);

  // ── Step 3: Create or load treatment form ────────────────────────────
  let treatmentInstance: ClinicalFormInstance;

  try {
    // Check if a treatment form already exists for this session
    const existing = await formEngine.getLatestInstanceBySession({
      schemaId: 'peds_respiratory_treatment',
      sessionId
    });

    if (existing) {
      console.log('[TreatmentBridge] Found existing treatment form:', existing._id);
      treatmentInstance = existing;
    } else {
      console.log('[TreatmentBridge] Creating new treatment form for session:', sessionId);
      treatmentInstance = await formEngine.getOrCreateInstance({
        workflow: 'peds_respiratory_treatment',
        sessionId
      });
    }
  } catch (err) {
    console.error('[TreatmentBridge] Failed to get/create treatment form:', err);
    return {
      success: false,
      error: 'Failed to create treatment form: ' + (err instanceof Error ? err.message : String(err))
    };
  }

  // ── Step 4: Inject triage + actions into treatment form ──────────────
  try {
    await formEngine.updateInstance(treatmentInstance._id, {
      answers: {
        ...treatmentInstance.answers,
        triage_priority: triagePriority,
        recommended_actions: actions,
        source: 'imci_rule_engine',
        locked: true
      },
      calculated: {
        ...treatmentInstance.calculated,
        triagePriority: triagePriority as TriagePriority,
        recommended_actions: actions,
        source: 'imci_rule_engine',
        locked: true
      }
    });

    console.log('[TreatmentBridge] Injected triage data into treatment form:', treatmentInstance._id);
  } catch (err) {
    console.error('[TreatmentBridge] Failed to update treatment form:', err);
    return {
      success: false,
      error: 'Failed to update treatment form: ' + (err instanceof Error ? err.message : String(err))
    };
  }

  // ── Step 5: Link form to session ─────────────────────────────────────
  try {
    await linkFormToSession(sessionId, treatmentInstance._id);
    console.log('[TreatmentBridge] Linked treatment form to session');
  } catch (err) {
    // Non-fatal: form was created but linking failed
    console.warn('[TreatmentBridge] Failed to link form to session (non-fatal):', err);
  }

  // ── Step 6: Advance session stage to treatment ───────────────────────
  try {
    await advanceStage(sessionId, 'treatment');
    console.log('[TreatmentBridge] Advanced session stage to treatment');
  } catch (err) {
    // Non-fatal: bridge succeeded but stage advance failed
    console.warn('[TreatmentBridge] Failed to advance session stage (non-fatal):', err);
  }

  console.log('[TreatmentBridge] Bridge completed successfully');

  return {
    success: true,
    treatmentFormId: treatmentInstance._id
  };
}
