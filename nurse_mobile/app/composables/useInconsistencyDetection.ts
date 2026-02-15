/**
 * Inconsistency Detection Composable
 *
 * Detects conflicts between entered clinical data and calculated triage priority
 * Following WHO IMCI guidelines for paediatric assessment
 */

// ============================================================================
// TYPES (copied from server/types/ai.ts for client-side use)
// ============================================================================

interface InconsistencyCheck {
  type: 'danger_sign' | 'threshold' | 'missing' | 'contradiction';
  field: string;
  value: unknown;
  expected: string;
  message: string;
  severity: 'warning' | 'error' | 'info';
}

// ============================================================================
// IMCI THRESHOLDS (WHO Guidelines)
// ============================================================================

const IMCI_THRESHOLDS = {
  // Respiratory rate thresholds by age (breaths per minute)
  respiratoryRate: {
    '<2 months': { min: 0, max: 60 },
    '2-12 months': { min: 0, max: 50 },
    '12-60 months': { min: 0, max: 40 }
  },
  
  // Heart rate thresholds by age (beats per minute)
  heartRate: {
    '<2 months': { min: 100, max: 180 },
    '2-12 months': { min: 100, max: 160 },
    '12-60 months': { min: 80, max: 120 }
  },
  
  // Danger signs that mandate RED priority
  DANGER_SIGNS_RED: [
    'unable_to_drink',
    'vomits_everything',
    'convulsions',
    'lethargic_or_unconscious',
    'cyanosis',
    'respiratory_distress_severe'
  ],
  
  // Signs that typically indicate serious illness
  DANGER_SIGNS_YELLOW: [
    'fast_breathing',
    'chest_indrawing',
    'fever',
    'low_body_temp',
    'not_feeding_well'
  ]
};

// ============================================================================
// AGE-BASED FUNCTIONS
// ============================================================================

function getAgeGroup(ageMonths: number): string {
  if (ageMonths < 2) return '<2 months';
  if (ageMonths < 12) return '2-12 months';
  return '12-60 months';
}

function getRespThreshold(ageMonths: number): { min: number; max: number } {
  const group = getAgeGroup(ageMonths);
  return IMCI_THRESHOLDS.respiratoryRate[group as keyof typeof IMCI_THRESHOLDS.respiratoryRate];
}

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

export function useInconsistencyDetection() {
  
  /**
   * Check for inconsistencies between entered values and calculated priority
   */
  function detectInconsistencies(
    values: Record<string, unknown>,
    calculatedPriority: 'red' | 'yellow' | 'green',
    patientContext: { ageMonths: number }
  ): InconsistencyCheck[] {
    const inconsistencies: InconsistencyCheck[] = [];
    const ageMonths = patientContext.ageMonths;
    
    // Check danger signs that should trigger RED
    for (const dangerSign of IMCI_THRESHOLDS.DANGER_SIGNS_RED) {
      if (values[dangerSign] === true && calculatedPriority !== 'red') {
        inconsistencies.push({
          type: 'danger_sign',
          field: dangerSign,
          value: true,
          expected: 'Red priority',
          message: `${formatFieldName(dangerSign)} is marked positive but priority is ${calculatedPriority}. This typically requires RED priority.`,
          severity: 'error'
        });
      }
    }
    
    // Check for missing respiratory rate when it could affect classification
    if (values.fast_breathing === undefined && values.chest_indrawing === undefined) {
      // Only flag if triage is not already RED (which would be caught by danger signs)
      inconsistencies.push({
        type: 'missing',
        field: 'respiratory_assessment',
        value: undefined,
        expected: 'Respiratory rate or chest indrawing status',
        message: 'Respiratory assessment is incomplete. Fast breathing and chest indrawing are key IMCI criteria.',
        severity: 'warning'
      });
    }
    
    // Check fast breathing classification
    if (values.fast_breathing === true) {
      const threshold = getRespThreshold(ageMonths);
      const respRate = typeof values.respiratory_rate === 'number' ? values.respiratory_rate : null;
      
      if (respRate !== null && respRate >= threshold.max) {
        // Fast breathing confirmed - should typically be yellow
        if (calculatedPriority === 'green') {
          inconsistencies.push({
            type: 'threshold',
            field: 'respiratory_rate',
            value: respRate,
            expected: `Yellow priority (≥${threshold.max} for age)`,
            message: `Respiratory rate (${respRate}) exceeds IMCI threshold (${threshold.max}) for age ${ageMonths} months. Classification as GREEN may be incorrect.`,
            severity: 'error'
          });
        }
      }
    }
    
    // Check chest indrawing
    if (values.chest_indrawing === true) {
      if (calculatedPriority === 'green') {
        inconsistencies.push({
          type: 'danger_sign',
          field: 'chest_indrawing',
          value: true,
          expected: 'Yellow or Red priority',
          message: 'Chest indrawing is present but priority is GREEN. Chest indrawing indicates respiratory distress and should warrant at least Yellow priority.',
          severity: 'error'
        });
      }
    }
    
    // Check fever with no other findings - could be yellow
    if (values.fever === true && calculatedPriority === 'green') {
      inconsistencies.push({
        type: 'threshold',
        field: 'fever',
        value: true,
        expected: 'Consider Yellow priority',
        message: 'Fever is present. Consider whether this alone warrants Yellow priority depending on temperature and other factors.',
        severity: 'info'
      });
    }
    
    // Check for contradictions between danger signs
    if (values.lethargic_or_unconscious === true && values.consciousness === 'alert') {
      inconsistencies.push({
        type: 'contradiction',
        field: 'consciousness',
        value: values.consciousness,
        expected: 'Consistent with lethargy',
        message: 'Patient marked as alert but also has lethargic/unconscious danger sign. Please verify.',
        severity: 'error'
      });
    }
    
    // Check for hydration status contradictions
    if (values.unable_to_drink === true && values.drinks_normally === true) {
      inconsistencies.push({
        type: 'contradiction',
        field: 'hydration',
        value: 'Normal drinking',
        expected: 'Unable to drink',
        message: 'Patient marked as unable to drink but also drinks normally. Please verify hydration assessment.',
        severity: 'error'
      });
    }
    
    return inconsistencies;
  }
  
  /**
   * Check if inconsistency requires immediate attention
   */
  function isCritical(inconsistency: InconsistencyCheck): boolean {
    return inconsistency.severity === 'error' && inconsistency.type === 'danger_sign';
  }
  
  /**
   * Format field name for display
   */
  function formatFieldName(field: string): string {
    return field
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  /**
   * Get summary of inconsistencies
   */
  function getSummary(inconsistencies: InconsistencyCheck[]): {
    hasErrors: boolean;
    hasWarnings: boolean;
    criticalCount: number;
    message: string;
  } {
    const errors = inconsistencies.filter(i => i.severity === 'error');
    const warnings = inconsistencies.filter(i => i.severity === 'warning');
    const critical = inconsistencies.filter(i => isCritical(i));
    
    return {
      hasErrors: errors.length > 0,
      hasWarnings: warnings.length > 0,
      criticalCount: critical.length,
      message: `${errors.length} error(s), ${warnings.length} warning(s) detected`
    };
  }
  
  return {
    detectInconsistencies,
    isCritical,
    formatFieldName,
    getSummary,
    IMCI_THRESHOLDS
  };
}
