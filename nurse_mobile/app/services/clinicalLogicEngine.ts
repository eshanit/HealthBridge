/**
 * Clinical Logic Engine
 * 
 * Evaluates conditional logic for form fields and sections.
 * Based on clinical-form-engine.md specification.
 */

// Condition types (inline to avoid import issues)
type ConditionOperator = 
  | 'eq'      // equals
  | 'neq'     // not equals
  | 'gt'      // greater than
  | 'lt'      // less than
  | 'gte'     // greater than or equal
  | 'lte'     // less than or equal
  | 'in'      // value in array
  | 'nin';    // value not in array

interface SimpleCondition {
  operator: ConditionOperator;
  field: string;
  value: any;
}

interface CompositeCondition {
  operator: 'and' | 'or' | 'not';
  conditions: Condition[];
}

type Condition = SimpleCondition | CompositeCondition;

/**
 * Evaluate a condition against form data
 * 
 * @param condition - The condition to evaluate
 * @param formData - The current form field values
 * @returns true if the condition is satisfied, false otherwise
 */
export function evaluateCondition(condition: Condition, formData: Record<string, any>): boolean {
  if (!condition) return true;

  // Handle composite conditions (AND, OR, NOT)
  if (isCompositeCondition(condition)) {
    return evaluateCompositeCondition(condition, formData);
  }

  // Handle simple conditions
  return evaluateSimpleCondition(condition, formData);
}

/**
 * Check if a condition is composite (AND, OR, NOT)
 */
function isCompositeCondition(condition: Condition): condition is CompositeCondition {
  const c = condition as CompositeCondition;
  return c.operator === 'and' || c.operator === 'or' || c.operator === 'not';
}

/**
 * Evaluate a composite condition
 */
function evaluateCompositeCondition(condition: CompositeCondition, formData: Record<string, any>): boolean {
  const { operator, conditions } = condition;

  if (!conditions || conditions.length === 0) return true;

  switch (operator) {
    case 'and':
      return conditions.every((c: Condition) => evaluateCondition(c, formData));
    
    case 'or':
      return conditions.some((c: Condition) => evaluateCondition(c, formData));
    
    case 'not':
      if (conditions.length >= 1) {
        const firstCondition = conditions[0];
        if (firstCondition) {
          return !evaluateCondition(firstCondition, formData);
        }
      }
      return true;
    
    default:
      return true;
  }
}

/**
 * Evaluate a simple condition (field operator value)
 */
function evaluateSimpleCondition(condition: SimpleCondition, formData: Record<string, any>): boolean {
  const { operator, field, value } = condition;
  
  const fieldValue = formData[field];

  if (fieldValue === undefined || fieldValue === null) {
    if (operator === 'eq') return value === null || value === undefined;
    if (operator === 'neq') return value !== null && value !== undefined;
    return false;
  }

  switch (operator) {
    case 'eq':
      return fieldValue === value;
    
    case 'neq':
      return fieldValue !== value;
    
    case 'gt':
      return typeof fieldValue === 'number' && fieldValue > value;
    
    case 'lt':
      return typeof fieldValue === 'number' && fieldValue < value;
    
    case 'gte':
      return typeof fieldValue === 'number' && fieldValue >= value;
    
    case 'lte':
      return typeof fieldValue === 'number' && fieldValue <= value;
    
    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);
    
    case 'nin':
      return Array.isArray(value) && !value.includes(fieldValue);
    
    default:
      return false;
  }
}

/**
 * Get all fields referenced in a condition
 */
export function getReferencedFields(condition: Condition): string[] {
  if (!condition) return [];

  if (isCompositeCondition(condition)) {
    return condition.conditions.flatMap((c: Condition) => getReferencedFields(c));
  }

  return [condition.field];
}

/**
 * Field interface for visibility checks
 */
interface FieldWithCondition {
  visibleIf?: Condition;
  enabledIf?: Condition;
}

/**
 * Check if a field should be visible based on its visibleIf condition
 */
export function isFieldVisible(field: FieldWithCondition, formData: Record<string, any>): boolean {
  if (!field.visibleIf) return true;
  return evaluateCondition(field.visibleIf, formData);
}

/**
 * Check if a field should be enabled based on its enabledIf condition
 */
export function isFieldEnabled(field: FieldWithCondition, formData: Record<string, any>): boolean {
  if (!field.enabledIf) return true;
  return evaluateCondition(field.enabledIf, formData);
}

/**
 * Section interface for visibility checks
 */
interface SectionWithCondition {
  dependsOn?: Condition;
}

/**
 * Check if a section should be visible based on its dependsOn condition
 */
export function isSectionVisible(section: SectionWithCondition, formData: Record<string, any>): boolean {
  if (!section.dependsOn) return true;
  return evaluateCondition(section.dependsOn, formData);
}
