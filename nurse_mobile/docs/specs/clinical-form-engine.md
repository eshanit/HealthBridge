> STATUS: FROZEN – CANONICAL SPEC  
> CHANGES REQUIRE: “Update canonical spec” approval  
> EXECUTION AGENT: KiloCode
> PURPOSE: This file defines the ONLY source of truth for the Clinical Form Engine.

This is an excellent foundation! It's clear, well-structured, and establishes the right architectural patterns. However, to make it truly **"executable without guessing"** for KiloCode, it needs more **clinical specificity** and **implementation detail**.

Below is the enhanced, production-ready specification with the critical additions needed for a medical application.

---

# 🏥 Clinical Form Engine (CFE) - Enhanced Specification
**HealthBridge Frontliner App - Pediatric Respiratory Distress Pilot**

## 1. Purpose & Design Philosophy

The CFE is a **schema-driven, offline-first workflow system** that transforms WHO clinical protocols into guided, intelligent forms for frontline health workers.

**Core Design Principles:**
1.  **Protocol-First:** Schemas directly encode WHO IMCI/National Guideline logic.
2.  **Offline Resilient:** Every interaction is saved immediately. A nurse can close the app mid-assessment and resume exactly where they left off.
3.  **Context-Aware:** Field visibility and validation change based on prior answers (e.g., different "fast breathing" thresholds for a 3-month-old vs. a 4-year-old).
4.  **Audit-Ready:** Every change is logged. The complete journey from draft to synced dossier is reconstructible.

---

## 2. Architecture & Data Flow

```
[WHO IMCI Protocol] → [Form Schema v1.0] (JSON)
                             ↓ (Loaded at runtime)
[Form Engine Core] ← [Local Secure Storage]
      ↓ (Renders & Manages State)
[Vue/Nuxt UI Layer] → [Field Components]
      ↓ (Saves on every change)
[PouchDB (Encrypted)] → [Sync Queue]
                             ↓ (When online)
[CouchDB (Clinic)] → [Laravel Orchestrator] → [AI Triage]
```

---

## 3. Enhanced Core Schema (With Clinical Specificity)

### 3.1 `FormSchema` - The Blueprint

```typescript
// ~/types/clinical-form.ts
export interface ClinicalFormSchema {
  id: string;                      // e.g., 'peds_respiratory_v1'
  version: string;                 // e.g., '1.0.2' (Semantic: Major.Clinical.Minor)
  title: string;                   // 'Pediatric Respiratory Distress Assessment (IMCI)'
  description?: string;
  // Clinical Metadata
  protocol: 'WHO_IMCI' | 'NATIONAL_GUIDELINE'; // Reference standard
  applicableAgeRange: { minMonths: number; maxMonths: number }; // e.g., 2-59 months
  estimatedCompletionMinutes: number;
  
  // Core Definition
  workflow: WorkflowState[];
  sections: FormSection[];        // Groups fields logically (e.g., "Danger Signs", "Assessment")
  fields: FieldDefinition[];
  
  // Logic & Calculations
  calculations?: FormCalculation[]; // e.g., "fastBreathing = rr > ageThreshold"
  triageLogic?: TriageRule[];      // Rules to determine RED/YELLOW/GREEN
}
```

### 3.2 `FormSection` - Organizing the Clinical Encounter

```typescript
export interface FormSection {
  id: string;          // 'section_danger_signs'
  title: string;       // 'Danger Signs'
  description?: string; // 'General danger signs indicate need for URGENT referral.'
  icon?: string;       // '⚠️' or icon name
  fields: string[];    // Array of field IDs belonging to this section
  isCollapsible?: boolean;
  dependsOn?: Condition; // Show/hide entire section based on condition
}
```

### 3.3 `FieldDefinition` - The Clinical Question

**Critical Enhancement:** The previous definition was generic. For medical forms, we need rich, clinically-aware field types.

```typescript
export interface FieldDefinition {
  id: string;           // 'danger_sign_unable_drink'
  type: FieldType;
  label: string;        // 'Is the child unable to drink or breastfeed?'
  
  // Clinical Context
  clinicalNote?: string; // "Inability to drink is a GENERAL DANGER SIGN."
  protocolReference?: string; // "WHO IMCI Chart 1, Box 1"
  
  // UI & Interaction
  uiHint?: 'urgent' | 'warning' | 'normal'; // Affects styling
  placeholder?: string;
  helpText?: string;     // Shown below field
  
  // Validation
  required?: boolean;
  requiredMessage?: string; // Custom error: "This danger sign must be assessed."
  constraints?: FieldConstraint;
  
  // Logic & Visibility
  visibleIf?: Condition;
  enabledIf?: Condition;    // Field is shown but maybe disabled/greyed out
  calculateIf?: Condition;  // Auto-calculate value based on other fields
  
  // Type-Specific Config (Discriminated Union in practice)
  config?: NumberConfig | SelectConfig | TextConfig | ...;
}

// Example: A field for Respiratory Rate
const respiratoryRateField: FieldDefinition = {
  id: 'vitals_respiratory_rate',
  type: 'number',
  label: 'Respiratory Rate (breaths per minute)',
  clinicalNote: 'Count for 60 seconds. Use timer.',
  uiHint: 'warning',
  required: true,
  requiredMessage: 'Respiratory rate is critical for pneumonia assessment.',
  config: {
    min: 0,
    max: 120,
    step: 1,
    suffix: ' /min',
    // CLINICAL VALIDATION: Different thresholds by age
    validate: (value, formData) => {
      const ageMonths = formData['patient_age_months'];
      const whoThreshold = getWhoFastBreathingThreshold(ageMonths);
      if (value > whoThreshold) {
        return { isValid: true, severity: 'warning', message: `Fast breathing detected (>${whoThreshold}/min).` };
      }
      return { isValid: true };
    }
  }
};
```

### 3.4 `Condition` - Complex Clinical Logic

```typescript
export type Condition = 
  | { field: string; operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte'; value: any }
  | { operator: 'and' | 'or'; conditions: Condition[] }
  | { operator: 'not'; condition: Condition }
  | { operator: 'in'; field: string; values: any[] };

// Example: Show "Chest Indrawing" field ONLY IF:
// - Age < 12 months AND respiratory_rate > 60
// - OR Age >= 12 months AND respiratory_rate > 50
const complexCondition: Condition = {
  operator: 'or',
  conditions: [
    {
      operator: 'and',
      conditions: [
        { field: 'patient_age_months', operator: 'lt', value: 12 },
        { field: 'vitals_respiratory_rate', operator: 'gt', value: 60 }
      ]
    },
    {
      operator: 'and',
      conditions: [
        { field: 'patient_age_months', operator: 'gte', value: 12 },
        { field: 'vitals_respiratory_rate', operator: 'gt', value: 50 }
      ]
    }
  ]
};
```

---

## 4. State Machine with Clinical Guardrails

The workflow must enforce **clinical protocol sequence**, not just arbitrary state changes.

```typescript
// ~/types/clinical-form.ts

export interface WorkflowState {
  id: string;                    // 'assessment_danger_signs'
  name: string;                  // 'Danger Signs Assessment'
  clinicalStep: number;          // 1, 2, 3... guides the nurse linearly
  canBypass?: boolean;           // Can skip this step? (Rare in clinical flows)
  
  // Entry/Exit Actions (stored as action names, not functions for JSON serializability)
  onEnter?: string;              // Action name to execute on entry
  onExit?: string;               // Action name to execute on exit
  
  // Navigation Constraints
  allowedTransitions: string[];  // Which state IDs can be reached from here
  
  // Required fields before leaving this state
  requiredFields?: string[];     // Fields that must be filled before transition
  
  // Clinical Validation BEFORE allowing transition (Condition-based for JSON serializability)
  transitionGuard?: {
    condition: Condition;        // Expression that must evaluate to true
    message: string;             // Error message if guard fails
  };
}
```

**Example: Guarded State Transition**
```typescript
const dangerSignsState: WorkflowState = {
  id: 'danger_signs',
  name: 'Danger Signs Assessment',
  clinicalStep: 2,
  allowedTransitions: ['vitals', 'welcome'],
  requiredFields: ['unable_to_drink', 'vomits_everything', 'convulsions', 'lethargic_unconscious'],
  transitionGuard: {
    condition: {
      operator: 'and',
      conditions: [
        { field: 'patient_age_months', operator: 'gte', value: 2 },
        { field: 'patient_age_months', operator: 'lte', value: 59 }
      ]
    },
    message: 'Patient age must be between 2-59 months for IMCI protocol'
  }
};
```

---

## 5. Form Instance with Full Audit Trail

```typescript
export interface ClinicalFormInstance {
  // Identity
  _id: string;                      // 'form_peds_resp_abc123'
  schemaId: string;                 // 'peds_respiratory_v1'
  schemaVersion: string;            // '1.0.2'
  
  // Workflow State
  currentStateId: string;           // Current workflow state
  status: 'draft' | 'completed' | 'submitted' | 'synced' | 'error';
  
  // Clinical Data
  patientId: string;                // Reference to patient record
  patientAgeMonths?: number;        // Critical for pediatric logic
  
  // Answers
  answers: Record<string, any>;     // Field ID → Value
  
  // Audit Trail (CRITICAL for medical)
  auditLog: AuditEvent[];
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  submittedAt?: string;
  syncedAt?: string;
  
  // Derived Clinical Data (Auto-calculated)
  calculated?: {
    hasDangerSign?: boolean;
    fastBreathing?: boolean;
    triagePriority?: 'red' | 'yellow' | 'green';
    triageScore?: number;
  };
  
  // Sync Info
  syncStatus: 'pending' | 'syncing' | 'synced' | 'error';
  syncError?: string;
}

// Every change is logged
export interface AuditEvent {
  timestamp: string;
  userId: string;      // Nurse ID
  action: 'field_change' | 'state_transition' | 'form_create' | 'form_submit';
  fieldId?: string;
  oldValue?: any;
  newValue?: any;
  fromState?: string;
  toState?: string;
  deviceId?: string;
  offline?: boolean;
}
```

---

## 6. Engine API (Production-Ready)

```typescript
// ~/services/formEngine.ts

export class ClinicalFormEngine {
  // 1. Schema Management
  async loadSchema(schemaId: string): Promise<ClinicalFormSchema>;
  async validateSchema(schema: ClinicalFormSchema): Promise<ValidationResult>;
  
  // 2. Instance Lifecycle
  async createInstance(
    schemaId: string, 
    patientId: string, 
    initialData?: Partial<ClinicalFormInstance>
  ): Promise<ClinicalFormInstance>;
  
  async loadInstance(formId: string): Promise<ClinicalFormInstance>;
  
  // 3. Data Interaction
  async saveFieldValue(
    formId: string, 
    fieldId: string, 
    value: any
  ): Promise<SaveResult>;
  
  async calculateDerivedFields(formId: string): Promise<void>;
  
  // 4. Workflow Navigation
  async transitionState(
    formId: string, 
    targetStateId: string
  ): Promise<TransitionResult>;
  
  async validateTransition(
    formId: string, 
    targetStateId: string
  ): Promise<ValidationResult>;
  
  // 5. Clinical-Specific
  async runTriageLogic(formId: string): Promise<TriageResult>;
  async getClinicalSummary(formId: string): Promise<ClinicalSummary>;
  
  // 6. Persistence & Sync
  async saveInstance(formInstance: ClinicalFormInstance): Promise<void>;
  async getInstancesByStatus(status: string): Promise<ClinicalFormInstance[]>;
  async markForSync(formId: string): Promise<void>;
}

// Return types with clinical context
export interface SaveResult {
  success: boolean;
  formInstance: ClinicalFormInstance;
  validationWarnings?: ClinicalWarning[]; // e.g., "RR seems high for age"
  calculatedUpdates?: Record<string, any>;
}

export interface ClinicalWarning {
  fieldId: string;
  message: string;
  severity: 'info' | 'warning' | 'urgent';
  protocolReference?: string;
}
```

---

## 7. Validation Engine (Beyond Required Fields)

Clinical forms need **domain-specific validation**:

```typescript
export class ClinicalValidator {
  // 1. Range checks with age adjustment
  static validateRespiratoryRate(rate: number, ageMonths: number): ValidationResult {
    const whoThreshold = getWhoFastBreathingThreshold(ageMonths);
    
    if (rate < 10) return { valid: false, error: 'Rate too low. Check measurement.' };
    if (rate > whoThreshold) {
      return { 
        valid: true, 
        warning: `Fast breathing (>${whoThreshold}/min). Consider pneumonia.`,
        severity: 'high'
      };
    }
    return { valid: true };
  }
  
  // 2. Cross-field consistency
  static validateConsistency(form: ClinicalFormInstance): ValidationResult[] {
    const warnings = [];
    const { hasFever, temperature } = form.answers;
    
    if (hasFever === true && (!temperature || temperature < 37.5)) {
      warnings.push({
        fieldId: 'hasFever',
        message: 'Fever reported but temperature normal. Re-measure?',
        severity: 'medium'
      });
    }
    
    return warnings;
  }
  
  // 3. Protocol completeness
  static validateProtocolCompliance(form: ClinicalFormInstance, schema: ClinicalFormSchema): ValidationResult {
    // Check all required sections for the current workflow state
    const currentState = schema.workflow.find(w => w.id === form.currentStateId);
    const missingRequired = currentState?.requiredFields?.filter(
      fieldId => form.answers[fieldId] === undefined || form.answers[fieldId] === null
    ) || [];
    
    if (missingRequired.length > 0) {
      return {
        valid: false,
        error: `Missing required assessments: ${missingRequired.join(', ')}`
      };
    }
    
    return { valid: true };
  }
}
```

---

## 8. UI Components Architecture

```
components/clinical/
├── forms/
│   ├── ClinicalFormRenderer.vue      // Main orchestrator
│   ├── sections/
│   │   ├── FormSection.vue           // Collapsible section
│   │   └── DangerSignsSection.vue    // Specialized section
│   └── fields/
│       ├── FieldRenderer.vue         // Dynamic field router
│       ├── ClinicalNumberInput.vue   // With validation hints
│       ├── ClinicalRadioGroup.vue    // For symptom checklists
│       ├── DangerSignToggle.vue      // Specialized for danger signs
│       └── TimerButton.vue           // For 60-second RR count
├── workflow/
│   ├── WorkflowProgress.vue          // Shows current step
│   └── NavigationGuard.vue           // Prevents protocol violation
└── summary/
    └── TriageSummaryCard.vue         // Shows RED/YELLOW/GREEN result
```

**Example: `DangerSignToggle.vue` (Specialized Component)**
```vue
<template>
  <div class="danger-sign-toggle" :class="{'is-positive': value}">
    <div class="header" @click="toggle">
      <div class="icon">{{ value ? '⚠️' : '✓' }}</div>
      <div class="label">
        <strong>{{ label }}</strong>
        <small class="clinical-context">{{ clinicalNote }}</small>
      </div>
    </div>
    <div v-if="value" class="urgent-banner">
      ⚠️ GENERAL DANGER SIGN - Requires URGENT attention
    </div>
  </div>
</template>
```

---

## 9. Sync Strategy with Clinical Priority

```typescript
// ~/services/syncQueue.ts

export class ClinicalSyncQueue {
  // Priority-based sync: RED cases before YELLOW before GREEN
  async getPendingFormsByPriority(): Promise<ClinicalFormInstance[]> {
    const pending = await this.getPendingForms();
    return pending.sort((a, b) => {
      const priorityOrder = { red: 0, yellow: 1, green: 2, undefined: 3 };
      return priorityOrder[a.calculated?.triagePriority] - 
             priorityOrder[b.calculated?.triagePriority];
    });
  }
  
  // Before sync, ensure clinical integrity
  async validateBeforeSync(formId: string): Promise<SyncValidation> {
    const form = await this.loadInstance(formId);
    
    // Critical: Must have completed required protocol steps
    if (form.status !== 'completed') {
      return { canSync: false, reason: 'Form not clinically completed' };
    }
    
    // Must have triage priority calculated
    if (!form.calculated?.triagePriority) {
      return { canSync: false, reason: 'Triage not calculated' };
    }
    
    // For RED cases: additional validation
    if (form.calculated.triagePriority === 'red') {
      const hasActionPlan = form.answers['action_plan_urgent'];
      if (!hasActionPlan) {
        return { canSync: false, reason: 'Urgent cases require action plan' };
      }
    }
    
    return { canSync: true };
  }
}
```

---

## 10. Deployment & Schema Management

**Critical:** Schemas are **versioned assets** that can be updated without app store submission.

```yaml
# schemas/manifest.json
{
  "availableSchemas": [
    {
      "id": "peds_respiratory",
      "latestVersion": "1.0.2",
      "minAppVersion": "1.0.0",
      "protocol": "WHO_IMCI",
      "downloadUrl": "/schemas/peds_respiratory_v1.0.2.json",
      "sha256": "abc123..."
    }
  ]
}

# App startup sequence:
1. Check for schema updates (if online)
2. Download new schemas to secure storage
3. Validate schema signature
4. Migrate existing form instances if compatible
```

---

## 11. Pilot Implementation Sequence (For KiloCode)

**11.1: Foundation**
1. Implement `ClinicalFormSchema` types
2. Build `FieldRenderer.vue` with basic types (text, number, radio)
3. Create `ClinicalFormEngine` class with in-memory storage

**11.2: Clinical Logic**
1. Add conditional logic engine (`visibleIf`, `enabledIf`)
2. Implement WHO IMCI calculations (fast breathing thresholds)
3. Build specialized components: `DangerSignToggle.vue`

**11.3: State & Persistence**
1. Implement workflow state machine with clinical guardrails
2. Integrate with secure PouchDB storage
3. Add audit logging for every change

**11.4: Polish & Integration**
1. Add triage logic calculator
2. Integrate with dashboard and sync queue
3. Conduct usability testing with clinical scenarios

---

## 12. Non-Negotiables (Enhanced)

1. **No Data Loss:** Every keystroke → immediate save to encrypted storage.
2. **Protocol Adherence:** The engine must prevent nurses from skipping critical clinical steps.
3. **Offline Calculation:** Triage priority must be calculated locally (AI is enhancement, not dependency).
4. **Audit Trail:** Every clinical decision must be traceable to user, time, and device.
5. **Graceful Degradation:** If new schema fails to load, fall back to last working version with clear warning.

---
---

# 🔧 KiloCode Execution Contract

You (KiloCode) must treat this document as a binding system specification.

## Rules

1. You may NOT change schema fields, interfaces, workflows, or rules
   unless explicitly told: **"Update the canonical spec"**.

2. If code conflicts with this document:
   → the code is wrong, not the spec.

3. If something is missing:
   → ask for a spec addition, do not invent behavior.

4. All implementations must:
   - match names, types, and logic exactly
   - log deviations as TODO:SPEC-GAP

---

## Phase 1 Target

Implement a working MVP of:

- ClinicalFormEngine class
- FieldRenderer.vue
- FormRenderer.vue
- secure persistence via secureDb
- One schema: `peds_respiratory_v1.0.2`

---

## Required Output Artifacts

KiloCode must produce:

1. `~/types/clinical-form.ts`
2. `~/services/formEngine.ts`
3. `~/components/clinical/forms/ClinicalFormRenderer.vue`
4. `~/components/clinical/fields/FieldRenderer.vue`
5. `~/schemas/peds_respiratory_v1.0.2.json`

Each file must contain a header:

```ts
// AUTO-GENERATED FROM clinical-form-engine.md
// DO NOT EDIT WITHOUT UPDATING THE SPEC


