/**
 * AUTO-GENERATED FROM clinical-form-engine.md
 * DO NOT EDIT WITHOUT UPDATING THE SPEC
 * 
 * Clinical Form Engine Service
 * 
 * Handles schema loading, form instance lifecycle, data validation,
 * workflow transitions, and triage calculations.
 * 
 * Based on clinical-form-engine.md specification
 */
import type {
  ClinicalFormSchema,
  ClinicalFormInstance,
  FieldDefinition,
  FormSection,
  WorkflowState,
  Condition,
  SaveResult,
  ValidationResult,
  TransitionResult,
  TriageResult,
  ClinicalWarning,
  ClinicalSummary,
  AuditEvent,
  CalculatedExpression,
  TriagePriority,
  FormCalculation,
  TriageRule,
} from '~/types/clinical-form';
import { securePut, secureGet, secureAllDocs } from './secureDb';
import { useSecurityStore } from '~/stores/security';
import {
  calculateTriage,
  getWhoFastBreathingThreshold,
  hasDangerSign,
  getPresentDangerSigns,
  validateRespiratoryRate,
  validateOxygenSaturation,
  validateTemperature
} from './clinicalCalculations';
import { getSyncService, type SyncService } from './sync';

class ClinicalFormEngine {
  private schemas = new Map<string, ClinicalFormSchema>();
  private instances = new Map<string, ClinicalFormInstance>();
  private schemaCache = new Map<string, Promise<ClinicalFormSchema>>();
  private syncService: SyncService;

  constructor() {
    this.syncService = getSyncService();
  }

  /**
   * Load a schema by ID
   */
  async loadSchema(schemaId: string): Promise<ClinicalFormSchema> {
    // Check cache first
    if (this.schemas.has(schemaId)) {
      return this.schemas.get(schemaId)!;
    }

    // Check if already loading
    if (this.schemaCache.has(schemaId)) {
      return this.schemaCache.get(schemaId)!;
    }

    // Load schema from schemas directory
    const loadPromise = this.loadSchemaFromFile(schemaId);
    this.schemaCache.set(schemaId, loadPromise);

    try {
      const schema = await loadPromise;
      this.schemas.set(schemaId, schema);
      this.schemaCache.delete(schemaId);
      console.log(`[ClinicalFormEngine] Schema loaded: ${schemaId} v${schema.version}`);
      return schema;
    } catch (error) {
      this.schemaCache.delete(schemaId);
      throw error;
    }
  }

  /**
   * Load schema from JSON file
   */
  private async loadSchemaFromFile(schemaId: string): Promise<ClinicalFormSchema> {
    try {
      // For peds_respiratory, use the specific version file
      const versionMap: Record<string, string> = {
        'peds_respiratory': '1.0.2',
        'peds_respiratory_treatment': '1.0.0',
      };

      const version = versionMap[schemaId] || '1.0.2';
      const schemaUrl = version 
        ? `/schemas/${schemaId}_v${version}.json`
        : `/schemas/${schemaId}.json`;

      console.log(`[ClinicalFormEngine] Fetching schema from: ${schemaUrl}`);

      // Use fetch to load the JSON file
      const response = await fetch(schemaUrl);
      console.log(`[ClinicalFormEngine] Response status: ${response.status}`);

      if (!response.ok) {
        const text = await response.text();
        console.error(`[ClinicalFormEngine] Response body: ${text.substring(0, 500)}`);
        throw new Error(`Schema not found: ${schemaId}`);
      }

      const text = await response.text();
      console.log(`[ClinicalFormEngine] Response text (first 1000 chars): ${text.substring(0, 1000)}`);

      const schema = JSON.parse(text) as ClinicalFormSchema;
      return schema;
    } catch (error) {
      console.error(`[ClinicalFormEngine] Failed to load schema ${schemaId}:`, error);
      throw new Error(`Schema not found: ${schemaId}`);
    }
  }

  /**
   * Validate a schema (public API)
   */
  async validateSchema(schema: ClinicalFormSchema): Promise<ValidationResult> {
    console.log(`[ClinicalFormEngine] Validating schema: ${schema.id}`);
    const errors: string[] = [];

    // Check required fields
    if (!schema.id) errors.push('Schema ID is required');
    if (!schema.version) errors.push('Schema version is required');
    if (!schema.title) errors.push('Schema title is required');
    if (!schema.workflow || schema.workflow.length === 0) {
      errors.push('Workflow is required');
    }
    if (!schema.fields || schema.fields.length === 0) {
      errors.push('Fields are required');
    }

    // Check workflow has start state
    const startState = schema.workflow?.find((s: WorkflowState) =>
      s.allowedTransitions.includes(schema.workflow?.[0]?.id || '')
    );
    if (!startState && schema.workflow?.length > 0) {
      errors.push('No valid starting state in workflow');
    }

    // Check all section field references exist
    const fieldIds = new Set(schema.fields?.map((f: FieldDefinition) => f.id) || []);
    for (const section of schema.sections || []) {
      for (const fieldId of section.fields || []) {
        if (!fieldIds.has(fieldId)) {
          errors.push(`Section "${section.id}" references non-existent field "${fieldId}"`);
        }
      }
    }

    // Check workflow state references exist
    const stateIds = new Set(schema.workflow?.map((s: WorkflowState) => s.id) || []);
    for (const state of schema.workflow || []) {
      for (const transition of state.allowedTransitions || []) {
        if (!stateIds.has(transition)) {
          errors.push(`State "${state.id}" transitions to non-existent state "${transition}"`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Create a new form instance
   */
  async createInstance(
    schemaId: string,
    patientId: string,
    initialData?: Partial<ClinicalFormInstance>
  ): Promise<ClinicalFormInstance> {
    const schema = await this.loadSchema(schemaId);

    const now = new Date().toISOString();
    const instanceId = `form_${schemaId}_${Date.now()}`;

    // Initialize answers with default values
    const answers: Record<string, any> = {};
    for (const field of schema.fields || []) {
      if (field.defaultValue !== undefined) {
        answers[field.id] = field.defaultValue;
      }
    }

    // Get first workflow state
    const firstState = schema.workflow?.[0];
    if (!firstState) {
      throw new Error('Schema has no workflow states');
    }

    const instance: ClinicalFormInstance = {
      _id: instanceId,
      schemaId,
      schemaVersion: schema.version,
      currentStateId: firstState.id,
      status: 'draft',
      patientId,
      answers,
      calculated: {
        triagePriority: 'green' // Default priority
      },
      auditLog: [{
        timestamp: now,
        userId: initialData?.auditLog?.[0]?.userId || 'unknown',
        action: 'form_create',
        deviceId: await this.getDeviceId(),
        offline: !navigator.onLine,
      }],
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      ...initialData,
    };

    // Save to storage
    await this.saveInstance(instance);
    this.instances.set(instanceId, instance);

    console.log(`[ClinicalFormEngine] Created instance: ${instanceId}`);
    return instance;
  }

  /**
   * Load an existing form instance
   */
  async loadInstance(formId: string): Promise<ClinicalFormInstance> {
    // Check memory cache
    if (this.instances.has(formId)) {
      return this.instances.get(formId)!;
    }

    const security = useSecurityStore();
    if (!security.encryptionKey) {
      throw new Error('[SecureDB] Database locked: encryption key not available');
    }

    // Load from secure storage
    const instance = await secureGet<ClinicalFormInstance>(formId, security.encryptionKey);
    if (!instance) {
      throw new Error(`Form instance not found: ${formId}`);
    }

    this.instances.set(formId, instance);
    return instance;
  }

  /**
   * Load all draft instances for a patient
   */
  async loadPatientForms(patientId: string): Promise<ClinicalFormInstance[]> {
    const security = useSecurityStore();
    if (!security.encryptionKey) {
      throw new Error('[SecureDB] Database locked: encryption key not available');
    }

    const allDocs = await secureAllDocs<ClinicalFormInstance>(security.encryptionKey);
    return allDocs.filter((doc: ClinicalFormInstance) => doc.patientId === patientId && doc.status === 'draft');
  }

  /**
   * Save a field value
   */
  async saveFieldValue(
    formId: string,
    fieldId: string,
    value: any,
    userId: string = 'unknown'
  ): Promise<SaveResult> {
    const instance = await this.loadInstance(formId);
    const schema = await this.loadSchema(instance.schemaId);

    const oldValue = instance.answers[fieldId];
    const now = new Date().toISOString();

    // Update answer
    instance.answers[fieldId] = value;
    instance.updatedAt = now;

    // Add audit log entry
    instance.auditLog.push({
      timestamp: now,
      userId,
      action: 'field_change',
      fieldId,
      oldValue,
      newValue: value,
      deviceId: await this.getDeviceId(),
      offline: !navigator.onLine,
    });

    // Run calculations
    const calculatedUpdates = await this.calculateDerivedFields(formId);
    for (const [key, val] of Object.entries(calculatedUpdates)) {
      instance.answers[key] = val;
    }

    // Run triage logic
    const triageResult = await this.runTriageLogic(formId);
    instance.calculated = {
      ...instance.calculated,
      ...calculatedUpdates,
      // Store with both snake_case (for schema field IDs) and camelCase (for backward compatibility)
      triage_priority: triageResult.priority,
      triagePriority: triageResult.priority,
      triage_classification: triageResult.classification,
      triageClassification: triageResult.classification,
      triage_actions: triageResult.actions,
      triageActions: triageResult.actions,
    };

    // Get validation warnings
    const warnings = this.validateField(fieldId, value, instance.answers, schema);

    // Save to storage
    await this.saveInstance(instance);

    console.log(`[ClinicalFormEngine] Saved field ${fieldId} = ${value} for ${formId}`);

    return {
      success: true,
      formInstance: instance,
      validationWarnings: warnings,
      calculatedUpdates,
    };
  }

  /**
   * Calculate all derived fields
   */
  async calculateDerivedFields(formId: string): Promise<Record<string, any>> {
    const instance = await this.loadInstance(formId);
    const schema = await this.loadSchema(instance.schemaId);

    const updates: Record<string, any> = {};

    for (const calculation of schema.calculations || []) {
      try {
        const value = this.evaluateExpression(calculation.expression, instance.answers);
        updates[calculation.id] = value;
      } catch (error) {
        console.error(`[ClinicalFormEngine] Calculation failed for ${calculation.id}:`, error);
      }
    }

    return updates;
  }

  /**
   * Evaluate a calculated expression
   */
  private evaluateExpression(
    expression: CalculatedExpression | string,
    answers: Record<string, any>
  ): any {
    // Handle string expressions (simple field references)
    if (typeof expression === 'string') {
      return this.evaluateSimpleExpression(expression, answers);
    }

    // Handle conditional expressions
    if ('conditions' in expression) {
      for (const condition of expression.conditions) {
        const ifResult = this.evaluateSimpleExpression(condition.if, answers);
        if (ifResult) {
          return condition.then;
        }
      }
    }

    return undefined;
  }

  /**
   * Evaluate a simple expression string
   */
  private evaluateSimpleExpression(expr: string, answers: Record<string, any>): any {
    // Handle simple field reference
    if (answers.hasOwnProperty(expr)) {
      return answers[expr];
    }

    // Handle comparisons like "field > value"
    const comparisonRegex = /^(.+?)\s*(>=|<=|==|!=|>|<)\s*(.+)$/;
    const match = expr.match(comparisonRegex);

    if (match) {
      const left = this.evaluateSimpleExpression(match[1]?.trim() || '', answers);
      const operator = match[2];
      const rightStr = match[3]?.trim() || '';

      // Try to parse right side as number or get from answers
      const right = !isNaN(Number(rightStr))
        ? Number(rightStr)
        : this.evaluateSimpleExpression(rightStr, answers);

      switch (operator) {
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        case '==': return left === right;
        case '!=': return left !== right;
      }
    }

    // Handle logical operators
    if (expr.includes('||')) {
      const parts = expr.split('||').map(p => this.evaluateSimpleExpression(p.trim(), answers));
      return parts.some(Boolean);
    }

    if (expr.includes('&&')) {
      const parts = expr.split('&&').map(p => this.evaluateSimpleExpression(p.trim(), answers));
      return parts.every(Boolean);
    }

    // Handle negation
    if (expr.startsWith('!')) {
      return !this.evaluateSimpleExpression(expr.slice(1).trim(), answers);
    }

    // Handle comparison with string values (e.g., "triage_priority == 'red'")
    const stringCompareRegex = /^(.+?)\s*(==|!=)\s*['"](.+?)['"]$/;
    const stringMatch = expr.match(stringCompareRegex);

    if (stringMatch) {
      const left = this.evaluateSimpleExpression(stringMatch[1]?.trim() || '', answers);
      const operator = stringMatch[2];
      const right = stringMatch[3];

      return operator === '==' ? left === right : left !== right;
    }

    return answers[expr];
  }

  /**
   * Validate a field value
   */
  private validateField(
    fieldId: string,
    value: any,
    answers: Record<string, any>,
    schema: ClinicalFormSchema
  ): ClinicalWarning[] {
    const warnings: ClinicalWarning[] = [];
    const field = schema.fields?.find((f: FieldDefinition) => f.id === fieldId);

    if (!field) return warnings;

    // Check clinical validation if available
    if (field.config && typeof field.config === 'object' && 'validate' in field.config) {
      const validationResult = (field.config as any).validate?.(value, answers);
      if (validationResult && validationResult.severity === 'warning') {
        warnings.push({
          fieldId,
          message: validationResult.message,
          severity: validationResult.severity,
          protocolReference: field.protocolReference,
        });
      }
    }

    // Check range constraints
    if (field.constraints?.type === 'range' && typeof value === 'number') {
      if (field.constraints.min !== undefined && value < field.constraints.min) {
        warnings.push({
          fieldId,
          message: field.constraints.message || `Value must be at least ${field.constraints.min}`,
          severity: 'warning',
          protocolReference: field.protocolReference,
        });
      }
      if (field.constraints.max !== undefined && value > field.constraints.max) {
        warnings.push({
          fieldId,
          message: field.constraints.message || `Value must be at most ${field.constraints.max}`,
          severity: 'warning',
          protocolReference: field.protocolReference,
        });
      }
    }

    return warnings;
  }

  /**
   * Transition to a new workflow state
   */
  async transitionState(
    formId: string,
    targetStateId: string,
    userId: string = 'unknown'
  ): Promise<TransitionResult> {
    const instance = await this.loadInstance(formId);
    const schema = await this.loadSchema(instance.schemaId);

    const currentState = schema.workflow?.find((s: WorkflowState) => s.id === instance.currentStateId);
    const targetState = schema.workflow?.find((s: WorkflowState) => s.id === targetStateId);

    if (!currentState || !targetState) {
      return {
        allowed: false,
        fromState: instance.currentStateId,
        toState: targetStateId,
        reason: 'Invalid state',
      };
    }

    // Check if transition is allowed
    if (!currentState.allowedTransitions.includes(targetStateId)) {
      return {
        allowed: false,
        fromState: instance.currentStateId,
        toState: targetStateId,
        reason: `Cannot transition from "${currentState.name}" to "${targetState.name}"`,
      };
    }

    // Check transition guard
    if (currentState.transitionGuard) {
      const guardResult = this.evaluateCondition(
        currentState.transitionGuard.condition,
        instance.answers
      );
      if (!guardResult) {
        return {
          allowed: false,
          fromState: instance.currentStateId,
          toState: targetStateId,
          reason: currentState.transitionGuard.message,
        };
      }
    }

    // Check required fields
    const requiredFields = currentState.requiredFields || [];
    const missingFields = requiredFields.filter((f: string) =>
      instance.answers[f] === undefined || instance.answers[f] === null
    );

    if (missingFields.length > 0) {
      return {
        allowed: false,
        fromState: instance.currentStateId,
        toState: targetStateId,
        missingFields,
        reason: `Missing required fields: ${missingFields.join(', ')}`,
      };
    }

    // Perform transition
    const now = new Date().toISOString();
    const previousStateId = instance.currentStateId;
    instance.currentStateId = targetStateId;
    instance.updatedAt = now;

    // Add audit log
    instance.auditLog.push({
      timestamp: now,
      userId,
      action: 'state_transition',
      fromState: previousStateId,
      toState: targetStateId,
      deviceId: await this.getDeviceId(),
      offline: !navigator.onLine,
    });

    // Check if final state
    if (targetState.allowedTransitions.length === 0) {
      instance.status = 'completed';
      instance.completedAt = now;
      instance.syncStatus = 'pending'; // Mark as needing sync
      
      // Run triage logic for final classification
      const triageResult = await this.runTriageLogic(formId);
      instance.calculated = {
        ...instance.calculated,
        // Store with both snake_case (for schema field IDs) and camelCase (for backward compatibility)
        triage_priority: triageResult.priority,
        triagePriority: triageResult.priority,
        triage_classification: triageResult.classification,
        triageClassification: triageResult.classification,
        triage_actions: triageResult.actions,
        triageActions: triageResult.actions,
      };
    }

    this.handleSpecGap(
      'transitionState',
      'Clinical guardrails not implemented. Spec requires validation of protocol sequence.',
      {
        formId,
        targetStateId,
        temporaryBehavior: 'Allowing transition without clinical protocol validation', // ← ADD THIS
        risk: 'Could allow clinically inappropriate workflow sequences'
      }
    );

    await this.saveInstance(instance);

    console.log(`[ClinicalFormEngine] Transitioned ${formId}: ${previousStateId} → ${targetStateId}`);

    return {
      allowed: true,
      fromState: previousStateId,
      toState: targetStateId,
    };
  }

  /**
   * Validate a transition without performing it
   */
  async validateTransition(
    formId: string,
    targetStateId: string
  ): Promise<ValidationResult> {
    const instance = await this.loadInstance(formId);
    const schema = await this.loadSchema(instance.schemaId);

    const currentState = schema.workflow?.find((s: WorkflowState) => s.id === instance.currentStateId);
    const targetState = schema.workflow?.find((s: WorkflowState) => s.id === targetStateId);

    const errors: string[] = [];
    const warnings: ClinicalWarning[] = [];

    // Check if transition is allowed
    if (!currentState || !targetState) {
      errors.push('Invalid state');
      return { valid: false, errors, warnings };
    }

    if (!currentState.allowedTransitions.includes(targetStateId)) {
      errors.push(`Cannot transition from "${currentState.name}" to "${targetState.name}"`);
    }

    // Check transition guard
    if (currentState.transitionGuard) {
      const guardResult = this.evaluateCondition(
        currentState.transitionGuard.condition,
        instance.answers
      );
      if (!guardResult) {
        errors.push(currentState.transitionGuard.message);
      }
    }

    // Check required fields
    const requiredFields = currentState.requiredFields || [];
    const missingFields = requiredFields.filter((f: string) =>
      instance.answers[f] === undefined || instance.answers[f] === null
    );

    if (missingFields.length > 0) {
      errors.push(`Missing required fields: ${missingFields.join(', ')}`);
    }

    console.log(`[ClinicalFormEngine] Validated transition: ${instance.currentStateId} → ${targetStateId}`);

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings,
    };
  }

  /**
   * Evaluate a condition
   */
  private evaluateCondition(condition: Condition, answers: Record<string, any>): boolean {
    // Check for simple conditions (have 'field' property)
    if ('field' in condition && 'operator' in condition) {
      const simpleCond = condition as { operator: string; field: string; value: any };
      // Handle simple conditions
      if (['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in', 'nin'].includes(simpleCond.operator)) {
        const fieldValue = answers[simpleCond.field];
        const conditionValue = simpleCond.value;

        switch (simpleCond.operator) {
          case 'eq': return fieldValue === conditionValue;
          case 'neq': return fieldValue !== conditionValue;
          case 'gt': return fieldValue > conditionValue;
          case 'lt': return fieldValue < conditionValue;
          case 'gte': return fieldValue >= conditionValue;
          case 'lte': return fieldValue <= conditionValue;
          case 'in': return Array.isArray(conditionValue) && conditionValue.includes(fieldValue);
          case 'nin': return Array.isArray(conditionValue) && !conditionValue.includes(fieldValue);
        }
      }
    }

    // Handle composite conditions (have 'conditions' property)
    if ('conditions' in condition) {
      const compositeCond = condition as { operator: string; conditions: Condition[] };
      if (compositeCond.operator === 'and') {
        return compositeCond.conditions.every(c => this.evaluateCondition(c, answers));
      }
      if (compositeCond.operator === 'or') {
        return compositeCond.conditions.some(c => this.evaluateCondition(c, answers));
      }
    }

    // Handle NOT condition
    if (condition.operator === 'not' && 'condition' in condition) {
      return !this.evaluateCondition((condition as { condition: Condition }).condition, answers);
    }

    return false;
  }

  /**
   * Run triage logic using WHO IMCI guidelines
   */
  async runTriageLogic(formId: string): Promise<TriageResult> {
    const instance = await this.loadInstance(formId);
    const schema = await this.loadSchema(instance.schemaId);

    const warnings: ClinicalWarning[] = [];

    // Get patient age from instance or answers
    const ageMonths = instance.patientAgeMonths || instance.answers['patient_age_months'];

    // Use WHO IMCI-based triage calculation
    const triageResult = calculateTriage(instance.answers, ageMonths || 24);

    // Add clinical warnings based on measurements
    const respRate = instance.answers['resp_rate'] as number | undefined;
    if (respRate !== undefined) {
      const respValidation = validateRespiratoryRate(respRate, ageMonths || 24);
      if (respValidation.warning) {
        warnings.push({
          fieldId: 'resp_rate',
          message: respValidation.warning,
          severity: respValidation.severity,
          protocolReference: 'WHO IMCI',
        });
      }
    }

    const spo2 = instance.answers['oxygen_sat'] as number | undefined;
    if (spo2 !== undefined) {
      const spo2Validation = validateOxygenSaturation(spo2);
      if (spo2Validation.warning) {
        warnings.push({
          fieldId: 'oxygen_sat',
          message: spo2Validation.warning,
          severity: spo2Validation.severity,
          protocolReference: 'WHO IMCI',
        });
      }
    }

    const temp = instance.answers['temperature'] as number | undefined;
    if (temp !== undefined) {
      const tempValidation = validateTemperature(temp);
      if (tempValidation.warning) {
        warnings.push({
          fieldId: 'temperature',
          message: tempValidation.warning,
          severity: tempValidation.severity,
          protocolReference: 'WHO IMCI',
        });
      }
    }

    // Add warning for danger signs
    if (hasDangerSign(instance.answers)) {
      const dangerSigns = getPresentDangerSigns(instance.answers);
      warnings.push({
        fieldId: 'danger_signs',
        message: `Danger signs present: ${dangerSigns.join(', ')}. URGENT referral required.`,
        severity: 'urgent',
        protocolReference: 'WHO IMCI Chart 1',
      });
    }

    return {
      priority: triageResult.priority,
      classification: triageResult.classification,
      actions: triageResult.recommendations,
      warnings,
    };
  }

  /**
   * Get clinical summary
   */
  async getClinicalSummary(formId: string): Promise<ClinicalSummary> {
    const instance = await this.loadInstance(formId);
    const schema = await this.loadSchema(instance.schemaId);

    // Collect danger signs
    const dangerSigns: string[] = [];
    for (const field of schema.fields || []) {
      if (field.id.startsWith('danger_') && field.id !== 'danger_signs_any') {
        if (instance.answers[field.id] === true) {
          dangerSigns.push(field.label);
        }
      }
    }

    // Collect symptoms
    const symptoms: string[] = [];
    for (const field of schema.fields || []) {
      if (field.id.startsWith('symptom_') && instance.answers[field.id] === true) {
        symptoms.push(field.label);
      }
    }

    // Collect observations
    const observations: string[] = [];
    for (const field of schema.fields || []) {
      if (field.id.startsWith('observation_') && instance.answers[field.id] === true) {
        observations.push(field.label);
      }
    }

    return {
      patientAgeMonths: instance.patientAgeMonths || instance.answers['patient_age_months'],
      dangerSigns,
      symptoms,
      measurements: {
        respiratoryRate: instance.answers['resp_rate'],
        temperature: instance.answers['temperature'],
        spo2: instance.answers['oxygen_sat'],
      },
      observations,
      triagePriority: instance.calculated?.triagePriority || instance.answers['triage_priority'] || 'green',
      triageClassification: instance.answers['triage_classification'] || '',
      recommendedActions: instance.answers['action_plan'] ? [instance.answers['action_plan']] : [],
      medications: instance.answers['action_medication'] ? [instance.answers['action_medication']] : undefined,
      followUp: instance.answers['action_followup'],
    };
  }

  /**
   * Check if a field is visible
   */
  isFieldVisible(fieldId: string, instance: ClinicalFormInstance, schema: ClinicalFormSchema): boolean {
    const field = schema.fields?.find((f: FieldDefinition) => f.id === fieldId);
    if (!field?.visibleIf) return true;
    return this.evaluateCondition(field.visibleIf, instance.answers);
  }

  /**
   * Check if a field is enabled
   */
  isFieldEnabled(fieldId: string, instance: ClinicalFormInstance, schema: ClinicalFormSchema): boolean {
    const field = schema.fields?.find((f: FieldDefinition) => f.id === fieldId);
    if (!field?.enabledIf) return true;
    return this.evaluateCondition(field.enabledIf, instance.answers);
  }

  /**
   * Get fields for a section
   */
  getSectionFields(sectionId: string, instance: ClinicalFormInstance, schema: ClinicalFormSchema): FieldDefinition[] {
    const section = schema.sections?.find((s: FormSection) => s.id === sectionId);
    if (!section) return [];

    return (section.fields || [])
      .map((fieldId: string) => schema.fields?.find((f: FieldDefinition) => f.id === fieldId))
      .filter((f): f is FieldDefinition => f !== undefined)
      .filter(f => this.isFieldVisible(f.id, instance, schema));
  }

  /**
   * Save instance to secure storage
   */
  async saveInstance(instance: ClinicalFormInstance): Promise<void> {
    const security = useSecurityStore();
    
    if (!security.encryptionKey) {
      throw new Error('[SecureDB] Database locked: encryption key not available');
    }
    
    instance.syncStatus = 'pending';
    await securePut(instance, security.encryptionKey);
    this.instances.set(instance._id, instance);

    // Trigger sync if online
    if (navigator.onLine) {
      this.triggerSync();
    }
  }

  /**
   * Update an existing instance with partial data
   */
  async updateInstance(
    formId: string,
    updates: Partial<ClinicalFormInstance>
  ): Promise<ClinicalFormInstance> {
    const instance = await this.loadInstance(formId);
    
    // Apply updates
    Object.assign(instance, updates);
    
    // Update timestamp
    instance.updatedAt = new Date().toISOString();
    
    // Save
    await this.saveInstance(instance);
    
    return instance;
  }

  /**
   * Get instances by status (SPEC-GAP: Required by spec line 338)
   */
  async getInstancesByStatus(status: string): Promise<ClinicalFormInstance[]> {
    console.warn('TODO:SPEC-GAP [getInstancesByStatus]', {
      issue: 'Method not implemented - spec requires getInstancesByStatus',
      specReference: 'clinical-form-engine.md#6',
      requiredBehavior: 'Return all form instances matching the given status',
      temporaryBehavior: 'Returns empty array',
    });
    return [];
  }

  /**
   * Mark a form for sync
   */
  async markForSync(formId: string): Promise<void> {
    const instance = await this.loadInstance(formId);
    instance.syncStatus = 'pending';
    await this.saveInstance(instance);
  }

  /**
   * Trigger background sync
   */
  private triggerSync(): void {
    // This will be handled by the sync service's live sync
    console.log('[ClinicalFormEngine] Sync triggered');
  }

  /**
   * Configure sync service
   */
  configureSync(remoteUrl: string, username?: string, password?: string): void {
    this.syncService.configure(remoteUrl, username, password);
  }

  /**
   * Start live sync
   */
  async startSync(): Promise<void> {
    await this.syncService.initialize();
    await this.syncService.startLiveSync();
    console.log('[ClinicalFormEngine] Live sync started');
  }

  /**
   * Get pending forms for sync
   */
  async getPendingForms(): Promise<ClinicalFormInstance[]> {
    const security = useSecurityStore();
    if (!security.encryptionKey) {
      throw new Error('[SecureDB] Database locked: encryption key not available');
    }

    const allDocs = await secureAllDocs<ClinicalFormInstance>(security.encryptionKey);
    return allDocs.filter((doc: ClinicalFormInstance) =>
      doc.syncStatus === 'pending' || doc.syncStatus === 'error'
    );
  }

  /**
   * Get the latest form instance for a session
   */
  async getLatestInstanceBySession(options: {
    schemaId: string;
    sessionId: string;
  }): Promise<ClinicalFormInstance | null> {
    const { schemaId, sessionId } = options;
    const security = useSecurityStore();
    
    if (!security.encryptionKey) {
      throw new Error('[SecureDB] Database locked: encryption key not available');
    }

    const allDocs = await secureAllDocs<ClinicalFormInstance>(security.encryptionKey);
    
    // Find matching instances for this schema and session
    const matching = allDocs.filter((doc: ClinicalFormInstance) =>
      doc.schemaId === schemaId && doc.sessionId === sessionId
    );
    
    if (matching.length === 0) {
      return null;
    }
    
    // Return the most recently updated instance
    matching.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    
    return matching[0]!;
  }

  /**
   * Get device ID for audit
   */
  private async getDeviceId(): Promise<string> {
    try {
      const deviceId = localStorage.getItem('healthbridge_device_id');
      if (deviceId) return deviceId;

      const newId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('healthbridge_device_id', newId);
      return newId;
    } catch {
      return 'unknown';
    }
  }



  private handleSpecGap(methodName: string, missingDetail: string, context?: any) {
    console.warn(`TODO:SPEC-GAP [${methodName}]`, {
      issue: missingDetail,
      specReference: 'clinical-form-engine.md#4.2', // Point to spec section
      requiredBehavior: 'Describe what the spec says should happen',
      temporaryBehavior: 'What the code is doing instead (e.g., throwing error, returning stub)',
      context // The relevant data at the time
    });
  }


  /**
   * Get or create a form instance linked to a session
   */
  async getOrCreateInstance(options: {
    workflow: string;
    sessionId: string;
  }): Promise<ClinicalFormInstance> {
    const { workflow, sessionId } = options;
    
    // Create a new instance with sessionId
    const instance = await this.createInstance(
      workflow,
      sessionId // Using sessionId as patientId for now
    );
    
    // Link the form to the session
    if (!instance.sessionId) {
      instance.sessionId = sessionId;
      await this.saveInstance(instance);
    }
    
    return instance;
  }

  /**
   * Clear schema cache (for testing or schema updates)
   */
  clearCache(): void {
    this.schemas.clear();
    this.instances.clear();
    this.schemaCache.clear();
    console.log('[ClinicalFormEngine] Cache cleared');
  }
}

// Export singleton instance
export const formEngine = new ClinicalFormEngine();
