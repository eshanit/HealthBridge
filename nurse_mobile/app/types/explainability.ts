export type Priority = 'red' | 'yellow' | 'green';
export type RuleSource = 'WHO_IMCI' | 'LocalProtocol' | 'Calculation';
/**
 * AI Use Cases / Task Types
 * Extended per system-ai-json-draft.md specification
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
  | 'NOTE_SUMMARY'
  | 'SECTION_GUIDANCE';  // Phase 3: Cumulative prompts for section-by-section guidance

export interface ExplainabilityRecord {
  id: string;
  sessionId: string;
  assessmentInstanceId: string;
  timestamp: string;
  classification: {
    priority: Priority;
    label: string;
    protocol: 'WHO_IMCI';
  };
  reasoning: {
    primaryRule: {
      id: string;
      description: string;
      source: RuleSource;
    };
    triggers: Array<{
      fieldId: string;
      value: string | number | boolean;
      threshold?: string;
      explanation: string;
      clinicalMeaning: string;
    }>;
    clinicalNarrative: string;
  };
  recommendedActions: Array<{
    code: string;
    label: string;
    justification: string;
    whoReference?: string;
  }>;
  safetyNotes: string[];
  confidence: number;
  dataCompleteness: number;
  aiEnhancement?: {
    used: boolean;
    useCase: string;
    modelVersion?: string;
  };
}

export interface RuleExplanation {
  id: string;
  description: string;
  whoReference?: string;
  clinicalMeaning: string;
}

export interface ActionLabel {
  code: string;
  label: string;
  justification: string;
  whoReference?: string;
}

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  escalation?: 'none' | 'warning' | 'block';
}

export interface AIConfig {
  enabled: boolean;
  allowExplanations: boolean;
  allowEducation: boolean;
  allowHandover: boolean;
  allowSummary: boolean;
  model: string;
  endpoint: string;
}

export interface AIAuditLog {
  timestamp: string;
  sessionId: string;
  useCase: AIUseCase;
  explainabilityId: string;
  inputSummary: string;
  outputLength: number;
  safetyBlocks: number;
  duration: number;
  userAction?: string;
}
