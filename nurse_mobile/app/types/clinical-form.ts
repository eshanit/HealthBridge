// AUTO-GENERATED FROM clinical-form-engine.md
// DO NOT EDIT WITHOUT UPDATING THE SPEC

/**
 * Clinical Form Engine Type Definitions
 * Based on clinical-form-engine.md specification
 */

export type FieldType = 
  | 'text'
  | 'number'
  | 'boolean'
  | 'radio'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'timer'
  | 'calculated'
  | 'date'
  | 'time'
  | 'textarea';

export type TriagePriority = 'red' | 'yellow' | 'green';

export type FormStatus = 'draft' | 'completed' | 'submitted' | 'synced' | 'error';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error';

// Condition operators for visibility and logic
export type ConditionOperator = 
  | 'eq'      // equals
  | 'neq'     // not equals
  | 'gt'      // greater than
  | 'lt'      // less than
  | 'gte'     // greater than or equal
  | 'lte'     // less than or equal
  | 'in'      // value in array
  | 'nin'     // value not in array
  | 'and'     // logical AND
  | 'or'      // logical OR
  | 'not';    // logical NOT

// Simple condition: field operator value
export interface SimpleCondition {
  operator: Exclude<ConditionOperator, 'and' | 'or' | 'not'>;
  field: string;
  value: any;
}

// Composite condition: AND/OR/NOT
export interface CompositeCondition {
  operator: 'and' | 'or' | 'not';
  conditions: Condition[];
}

// Union type for all conditions
export type Condition = SimpleCondition | CompositeCondition;

// Field constraint
export interface FieldConstraint {
  type: 'range' | 'length' | 'pattern' | 'clinical';
  min?: number;
  max?: number;
  message: string;
}

// Number field config
export interface NumberConfig {
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  prefix?: string;
}

// Select/Radio field config
export interface SelectConfig {
  options: string[];
  allowMultiple?: boolean;
  placeholder?: string;
}

// Boolean field config
export interface BooleanConfig {
  trueLabel?: string;
  falseLabel?: string;
}

// Text field config
export interface TextConfig {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  placeholder?: string;
}

// Timer field config
export interface TimerConfig {
  duration: number;
  autoStart?: boolean;
  showCountdown?: boolean;
}

// Calculated field expression
export interface CalculatedExpression {
  conditions: {
    if: string;  // Expression string like "danger_signs_any || observation_cyanosis"
    then: any;
  }[];
}

// Calculated field config
export interface CalculatedConfig {
  expression: CalculatedExpression | string;
  dependsOn?: string[];
}

// Field definition
export interface FieldDefinition {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  
  // Options for select/radio fields
  options?: string[];
  
  // Clinical Context
  clinicalNote?: string;
  protocolReference?: string;
  
  // UI & Interaction
  uiHint?: 'urgent' | 'warning' | 'normal';
  ui?: {
    fullWidth?: boolean;
  };
  placeholder?: string;
  helpText?: string;
  
  // Validation
  required?: boolean;
  requiredMessage?: string;
  constraints?: FieldConstraint;
  
  // Logic & Visibility
  visibleIf?: Condition;
  enabledIf?: Condition;
  
  // Default value
  defaultValue?: any;
  
  // Type-specific config
  config?: NumberConfig | SelectConfig | BooleanConfig | TimerConfig | CalculatedConfig | TextConfig | Record<string, any>;
}

// Form section
export interface FormSection {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  fields: string[];
  isCollapsible?: boolean;
  dependsOn?: Condition;
  uiHint?: 'urgent' | 'warning' | 'normal';
}

// Workflow state
export interface WorkflowState {
  id: string;
  name: string;
  clinicalStep: number;
  canBypass?: boolean;
  onEnter?: string;  // Action name
  onExit?: string;   // Action name
  allowedTransitions: string[];
  requiredFields?: string[];
  transitionGuard?: {
    condition: Condition;
    message: string;
  };
}

// Calculation definition
export interface FormCalculation {
  id: string;
  name: string;
  description?: string;
  expression: CalculatedExpression | string;
  dependsOn?: string[];
}

// Triage rule
export interface TriageRule {
  id: string;
  name: string;
  conditions: string[];
  priority: TriagePriority;
  actions: string[];
  protocolReference?: string;
}

// Clinical metadata
export interface ClinicalMetadata {
  protocol: 'WHO_IMCI' | 'NATIONAL_GUIDELINE';
  applicableAgeRange: {
    minMonths: number;
    maxMonths: number;
  };
  estimatedCompletionMinutes: number;
  validFor?: string[];  // Array of diagnosis codes
}

// Form schema (the blueprint)
export interface ClinicalFormSchema {
  id: string;
  version: string;
  title: string;
  description?: string;
  
  // Clinical Metadata
  protocol: 'WHO_IMCI' | 'NATIONAL_GUIDELINE';
  applicableAgeRange: {
    minMonths: number;
    maxMonths: number;
  };
  estimatedCompletionMinutes: number;
  
  // Core Definition
  workflow: WorkflowState[];
  sections: FormSection[];
  fields: FieldDefinition[];
  
  // Logic & Calculations
  calculations?: FormCalculation[];
  triageLogic?: TriageRule[];
  
  // Metadata
  metadata?: {
    created: string;
    lastUpdated: string;
    whoReference?: string;
    whoVersion?: string;
    validityPeriod?: {
      start: string;
      end: string;
    };
    checksum?: string;
    compatibility?: {
      minAppVersion: string;
      maxAppVersion: string;
    };
  };
}

// Audit event
export interface AuditEvent {
  timestamp: string;
  userId: string;
  action: 'field_change' | 'state_transition' | 'form_create' | 'form_submit' | 'form_save';
  fieldId?: string;
  oldValue?: any;
  newValue?: any;
  fromState?: string;
  toState?: string;
  deviceId?: string;
  offline?: boolean;
}

// Form instance (runtime data)
export interface ClinicalFormInstance {
  // Identity
  _id: string;
  schemaId: string;
  schemaVersion: string;
  
  // Workflow State
  currentStateId: string;
  status: FormStatus;
  
  // Patient Context
  patientId?: string;
  patientAgeMonths?: number;
  patientName?: string;
  
  // Session Link
  sessionId?: string;
  
  // Answers
  answers: Record<string, any>;
  
  // Audit Trail
  auditLog: AuditEvent[];
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  submittedAt?: string;
  syncedAt?: string;
  
  // Derived Clinical Data
  calculated?: {
    hasDangerSign?: boolean;
    fastBreathing?: boolean;
    triagePriority?: TriagePriority;
    triageScore?: number;
    [key: string]: any;
  };
  
  // Sync Info
  syncStatus: SyncStatus;
  syncError?: string;
  syncAttempts?: number;
}

// Save result
export interface SaveResult {
  success: boolean;
  formInstance: ClinicalFormInstance;
  validationWarnings?: ClinicalWarning[];
  calculatedUpdates?: Record<string, any>;
}

// Clinical warning
export interface ClinicalWarning {
  fieldId: string;
  message: string;
  severity: 'info' | 'warning' | 'urgent';
  protocolReference?: string;
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: ClinicalWarning[];
}

// Transition result
export interface TransitionResult {
  allowed: boolean;
  fromState: string;
  toState: string;
  reason?: string;
  missingFields?: string[];
}

// Triage result
export interface TriageResult {
  priority: TriagePriority;
  classification: string;
  actions: string[];
  warnings: ClinicalWarning[];
}

// Clinical summary
export interface ClinicalSummary {
  patientAgeMonths?: number;
  dangerSigns: string[];
  symptoms: string[];
  measurements: {
    respiratoryRate?: number;
    temperature?: number;
    spo2?: number;
  };
  observations: string[];
  triagePriority: TriagePriority;
  triageClassification: string;
  recommendedActions: string[];
  medications?: string[];
  followUp?: string;
}

// Schema manifest entry
export interface SchemaManifestEntry {
  id: string;
  latestVersion: string;
  minAppVersion: string;
  protocol: string;
  downloadUrl: string;
  sha256?: string;
}

// Schema manifest
export interface SchemaManifest {
  availableSchemas: SchemaManifestEntry[];
}
