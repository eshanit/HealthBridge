/**
 * Clinical Session Types
 * 
 * Type definitions for clinical sessions - patient encounters tracked through
 * the clinical workflow (registration → assessment → treatment → discharge).
 */

import { z } from 'zod';

// ============================================
// Zod Schemas
// ============================================

export const ClinicalSessionSchema = z.object({
  id: z.string(),
  type: z.literal('clinicalSession'),
  status: z.enum(['open', 'completed', 'archived', 'referred', 'cancelled']),
  stage: z.enum(['registration', 'assessment', 'treatment', 'discharge']),
  triagePriority: z.enum(['red', 'yellow', 'green', 'unknown']),
  patientId: z.string().nullable(),
  formInstanceIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type ClinicalSessionZod = z.infer<typeof ClinicalSessionSchema>;

// ============================================
// TypeScript Types
// ============================================

export type ClinicalSessionStage = 
  | 'registration' 
  | 'assessment' 
  | 'treatment' 
  | 'discharge';

export type ClinicalSessionTriage = 
  | 'red' 
  | 'yellow' 
  | 'green' 
  | 'unknown';

export type ClinicalSessionStatus = 
  | 'open' 
  | 'completed' 
  | 'archived'
  | 'referred' 
  | 'cancelled';

export interface ClinicalSession {
  _id: string;
  _rev?: string;
  id: string;
  patientCpt?: string;    // 4-character CPT for patient lookup
  patientId?: string;
  patientName?: string;
  dateOfBirth?: string;
  gender?: string;
  chiefComplaint?: string;
  notes?: string;
  triage: ClinicalSessionTriage;
  status: ClinicalSessionStatus;
  stage: ClinicalSessionStage;
  formInstanceIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionQueue {
  red: ClinicalSession[];
  yellow: ClinicalSession[];
  green: ClinicalSession[];
}

// ============================================
// Session Event Types (for Timeline)
// ============================================

export type TimelineEventType = 
  | 'created' 
  | 'stage_change' 
  | 'triage_update' 
  | 'form_completed'
  | 'form_started'
  | 'status_change'
  | 'note_added'
  | 'data_sync';

export interface TimelineEvent {
  id: string;
  sessionId: string;
  type: TimelineEventType;
  data: {
    previousValue?: any;
    newValue?: any;
    description?: string;
    formId?: string;
    formName?: string;
    actor?: string;
    [key: string]: any;
  };
  timestamp: number;
}

// ============================================
// Triage Configuration
// ============================================

export interface TriageConfig {
  color: string;
  label: string;
  icon: string;
  bgClass: string;
  textClass: string;
}

export const TRIAGE_CONFIGS: Record<ClinicalSessionTriage, TriageConfig> = {
  red: { 
    color: 'error', 
    label: 'RED',
    icon: 'i-heroicons-exclamation-circle',
    bgClass: 'bg-red-100 dark:bg-red-900',
    textClass: 'text-red-800 dark:text-red-200'
  },
  yellow: { 
    color: 'warning', 
    label: 'YELLOW',
    icon: 'i-heroicons-exclamation-triangle',
    bgClass: 'bg-amber-100 dark:bg-amber-900',
    textClass: 'text-amber-800 dark:text-amber-200'
  },
  green: { 
    color: 'success', 
    label: 'GREEN',
    icon: 'i-heroicons-check-circle',
    bgClass: 'bg-green-100 dark:bg-green-900',
    textClass: 'text-green-800 dark:text-green-200'
  },
  unknown: { 
    color: 'gray', 
    label: 'UNKNOWN',
    icon: 'i-heroicons-question-mark-circle',
    bgClass: 'bg-gray-100 dark:bg-gray-800',
    textClass: 'text-gray-800 dark:text-gray-200'
  }
};

// ============================================
// Stage Configuration
// ============================================

export interface StageConfig {
  color: string;
  label: string;
}

export const STAGE_CONFIGS: Record<ClinicalSessionStage, StageConfig> = {
  registration: { color: 'neutral', label: 'Registration' },
  assessment: { color: 'primary', label: 'Assessment' },
  treatment: { color: 'success', label: 'Treatment' },
  discharge: { color: 'secondary', label: 'Discharge' }
};

// ============================================
// Session Workflow Constants
// ============================================

export const STAGE_ORDER: ClinicalSessionStage[] = [
  'registration',
  'assessment',
  'treatment',
  'discharge'
];

export const TRIAGE_ORDER: ClinicalSessionTriage[] = [
  'red',
  'yellow',
  'green',
  'unknown'
];

// ============================================
// Helper Functions
// ============================================

/**
 * Check if a stage transition is valid
 */
export function isValidStageTransition(
  currentStage: ClinicalSessionStage,
  targetStage: ClinicalSessionStage
): boolean {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const targetIndex = STAGE_ORDER.indexOf(targetStage);
  
  return targetIndex >= 0 && targetIndex <= currentIndex + 1;
}

/**
 * Get the next stage in the workflow
 */
export function getNextStage(currentStage: ClinicalSessionStage): ClinicalSessionStage | null {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  if (currentIndex >= 0 && currentIndex < STAGE_ORDER.length - 1) {
    const next = STAGE_ORDER[currentIndex + 1];
    return next ?? null;
  }
  return null;
}

/**
 * Check if session can be progressed
 */
export function canProgressSession(session: ClinicalSession): boolean {
  return session.status === 'open' && session.stage !== 'discharge';
}

/**
 * Check if session is complete
 */
export function isSessionComplete(session: ClinicalSession): boolean {
  return session.status === 'completed' || 
         session.status === 'cancelled' ||
         session.status === 'referred';
}
