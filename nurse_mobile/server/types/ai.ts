/**
 * AI Server Types
 *
 * Type definitions for AI API requests and responses
 * Extended for MedGemma Phase 1 - Structured Explainability
 */

/**
 * AI Use Cases / Task Types
 * Extended for MedGemma Phase 1 - Structured Explainability
 * Aligned with system-ai-json-draft.md specification
 */
export type AIUseCase =
  | 'EXPLAIN_TRIAGE'
  | 'INCONSISTENCY_CHECK'
  | 'SUGGEST_ACTIONS'
  | 'TREATMENT_ADVICE'
  | 'CAREGIVER_INSTRUCTIONS'
  | 'CLINICAL_NARRATIVE'
  | 'CARE_EDUCATION'
  | 'CLINICAL_HANDOVER'
  | 'NOTE_SUMMARY';

/**
 * AI Request - Extended structured payload
 */
export interface AIRequest {
  useCase: AIUseCase;
  payload: AIPayload;
}

/**
 * AI Payload - Structured clinical data for MedGemma
 * Extended with session metadata per system-ai-json-draft.md
 */
export interface AIPayload {
  // Session metadata (per JSON schema)
  sessionId?: string;
  schemaId?: string;
  formId?: string;
  
  // Request tracking (per JSON schema)
  requestId?: string;
  timestamp?: string;
  
  // Core clinical data
  schema: SchemaContext;
  currentValues: Record<string, unknown>;
  patientContext: PatientContext;
  systemResult: SystemResult;
  
  // AI interaction
  inconsistencies?: string[];
  previousAI?: Array<{
    requestId: string;
    timestamp: string;
    response: string;
  }>;
  
  // Runtime configuration (per JSON schema)
  config?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  };
}

/**
 * Schema context for AI grounding
 */
export interface SchemaContext {
  section: string;
  relevantFields: FieldInfo[];
  clinicalNotes: string[];
  triageLogic: string[];
  dangerSigns: string[];
}

/**
 * Individual field information
 */
export interface FieldInfo {
  id: string;
  label: string;
  type: string;
  clinicalNote?: string;
  triageLogic?: string;
}

/**
 * Patient demographic and clinical context
 */
export interface PatientContext {
  ageMonths: number;
  weightKg?: number;
  gender?: string;
}

/**
 * System-calculated results
 */
export interface SystemResult {
  priority: 'red' | 'yellow' | 'green';
  actions: string[];
  ruleIds: string[];
}

/**
 * AI Response - Structured explainability data
 */
export interface AIResponse {
  /** Primary clinical explanation */
  explanation: string;
  
  /** Data inconsistencies detected */
  inconsistencies: string[];
  
  /** Educational teaching points */
  teachingNotes: string[];
  
  /** Recommended next steps */
  nextSteps: string[];
  
  /** AI confidence score (0.0 - 1.0) */
  confidence: number;
  
  /** Model version used */
  modelVersion: string;
  
  /** Response timestamp (ISO 8601) */
  timestamp: string;
  
  /** Referenced rule IDs */
  ruleIds: string[];
  
  /** Safety flags triggered */
  safetyFlags: string[];
}

/**
 * Inconsistency detection result
 */
export interface InconsistencyCheck {
  type: 'danger_sign' | 'threshold' | 'missing' | 'contradiction';
  field: string;
  value: unknown;
  expected: string;
  message: string;
  severity: 'warning' | 'error' | 'info';
}

/**
 * AI Audit Log entry
 */
export interface AIAuditLog {
  id: string;
  timestamp: string;
  sessionId: string;
  useCase: AIUseCase;
  inputTokens: number;
  outputTokens: number;
  modelVersion: string;
  responseTime: number;
  confidence: number;
  nurseAction: 'viewed' | 'dismissed' | 'followed' | 'overridden';
  safetyFlags: string[];
}

/**
 * Legacy AI Request (for backward compatibility)
 */
export interface LegacyAIRequest {
  useCase: AIUseCase;
  payload: Record<string, unknown>;
}

/**
 * Legacy AI Response (for backward compatibility)
 */
export interface LegacyAIResponse {
  answer: string;
  safetyFlags: string[];
}
