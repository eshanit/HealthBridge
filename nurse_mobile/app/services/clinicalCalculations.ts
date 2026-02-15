/**
 * WHO IMCI Clinical Calculations
 * 
 * Implements WHO IMCI (Integrated Management of Childhood Illness) calculations
 * for pediatric respiratory assessment.
 * Based on clinical-form-engine.md specification.
 */

/**
 * WHO IMCI Fast Breathing Thresholds by Age
 * 
 * Returns respiratory rate threshold (breaths per minute) for fast breathing
 * diagnosis of pneumonia.
 * 
 * Source: WHO IMCI Chart Booklet
 * - 2-11 months: ≥50 breaths/min
 * - 12-59 months: ≥40 breaths/min
 */
export function getWhoFastBreathingThreshold(ageMonths: number): number {
  if (ageMonths < 2) {
    // For infants < 2 months, use stricter threshold
    return 60;
  } else if (ageMonths < 12) {
    return 50;
  } else {
    return 40;
  }
}

/**
 * Check if respiratory rate indicates fast breathing
 */
export function isFastBreathing(respiratoryRate: number, ageMonths: number): boolean {
  if (!respiratoryRate || respiratoryRate <= 0) return false;
  const threshold = getWhoFastBreathingThreshold(ageMonths);
  return respiratoryRate >= threshold;
}

/**
 * Get clinical severity classification based on respiratory rate
 */
export function getRespiratorySeverity(respiratoryRate: number, ageMonths: number): 'normal' | 'mild' | 'moderate' | 'severe' {
  if (!respiratoryRate || respiratoryRate <= 0) return 'normal';
  
  const threshold = getWhoFastBreathingThreshold(ageMonths);
  const severeThreshold = threshold + 20;

  if (respiratoryRate >= severeThreshold) {
    return 'severe';
  } else if (respiratoryRate >= threshold) {
    return 'moderate';
  } else if (respiratoryRate >= threshold * 0.8) {
    return 'mild';
  }
  return 'normal';
}

/**
 * Danger signs that require urgent referral
 */
export const DANGER_SIGNS = [
  'unable_to_drink',
  'vomits_everything',
  'convulsions',
  'lethargic_or_unconscious',
  'stridor_in_calm_child',
  'wheezing',
  'cyanosis',
  'severe_respiratory_distress',
] as const;

export type DangerSign = typeof DANGER_SIGNS[number];

/**
 * Check if any danger signs are present
 */
export function hasDangerSign(answers: Record<string, any>): boolean {
  return DANGER_SIGNS.some(sign => answers[sign] === true);
}

/**
 * Get list of present danger signs
 */
export function getPresentDangerSigns(answers: Record<string, any>): DangerSign[] {
  return DANGER_SIGNS.filter(sign => answers[sign] === true);
}

/**
 * WHO IMCI Triage Classification
 * Based on danger signs, respiratory rate, and other symptoms
 */
export type TriagePriority = 'red' | 'yellow' | 'green';

export interface TriageResult {
  priority: TriagePriority;
  classification: string;
  recommendations: string[];
}

/**
 * Calculate triage priority based on clinical findings
 */
export function calculateTriage(
  answers: Record<string, any>,
  ageMonths: number
): TriageResult {
  const dangerSigns = getPresentDangerSigns(answers);
  const respiratoryRate = answers.resp_rate as number | undefined;
  const hasFastBreathing = respiratoryRate ? isFastBreathing(respiratoryRate, ageMonths) : false;
  
  // RED: Any danger sign OR severe respiratory distress
  if (dangerSigns.length > 0) {
    return {
      priority: 'red',
      classification: 'Severe Illness - Urgent Referral',
      recommendations: [
        'Refer URGENTLY to hospital',
        'Give first dose of antibiotics if trained',
        'Manage airway if needed',
        'Keep warm during transport',
      ],
    };
  }

  // Severe respiratory distress check
  const severeDistressSigns = [
    answers.retractions === true,
    answers.stridor === true,
    answers.cyanosis === true,
  ].filter(Boolean).length;

  if (severeDistressSigns >= 2 || (hasFastBreathing && severeDistressSigns >= 1)) {
    return {
      priority: 'red',
      classification: 'Severe Respiratory Distress - Urgent Referral',
      recommendations: [
        'Refer URGENTLY to hospital',
        'Give first dose of antibiotics if trained',
        'Provide oxygen if available',
        'Monitor during transport',
      ],
    };
  }

  // YELLOW: Fast breathing (pneumonia) OR other symptoms
  if (hasFastBreathing) {
    return {
      priority: 'yellow',
      classification: 'Pneumonia - Treat with Antibiotics',
      recommendations: [
        'Give oral antibiotics (cotrimoxazole or amoxicillin)',
        'Advise mother on home care',
        'Follow up in 2 days',
        'Ensure adequate fluid intake',
      ],
    };
  }

  // Check for other yellow indicators
  const yellowIndicators = [
    answers.cough_duration_days > 14,
    answers.fever === true,
    answers.wheezing === true,
  ].filter(Boolean).length;

  if (yellowIndicators > 0) {
    return {
      priority: 'yellow',
      classification: 'Needs Further Assessment',
      recommendations: [
        'Assess for other illnesses',
        'Consider chest X-ray if available',
        'Follow up if symptoms persist',
      ],
    };
  }

  // GREEN: No danger signs, no fast breathing
  return {
    priority: 'green',
    classification: 'No Pneumonia - Home Care',
    recommendations: [
      'Advise mother on home care',
      'Continue breastfeeding',
      'Return if symptoms worsen',
      'Follow up if no improvement in 5 days',
    ],
  };
}

/**
 * Calculate age-appropriate advice
 */
export function getAgeAppropriateAdvice(ageMonths: number): string[] {
  const advice: string[] = [];

  if (ageMonths < 6) {
    advice.push('Continue exclusive breastfeeding');
    advice.push('Monitor feeding ability');
  } else if (ageMonths < 12) {
    advice.push('Continue breastfeeding with complementary foods');
    advice.push('Monitor feeding and weight');
  } else {
    advice.push('Continue age-appropriate diet');
    advice.push('Ensure adequate fluid intake');
  }

  return advice;
}

/**
 * Validate clinical values against WHO guidelines
 */
export interface ClinicalValidation {
  isValid: boolean;
  warning?: string;
  severity: 'info' | 'warning' | 'urgent';
}

export function validateRespiratoryRate(rate: number, ageMonths: number): ClinicalValidation {
  if (!rate || rate <= 0) {
    return { isValid: false, warning: 'Respiratory rate not recorded', severity: 'warning' };
  }

  if (rate < 10) {
    return { isValid: false, warning: 'Rate seems too low. Re-count for 60 seconds.', severity: 'urgent' };
  }

  const threshold = getWhoFastBreathingThreshold(ageMonths);
  if (rate >= threshold) {
    return {
      isValid: true,
      warning: `Fast breathing detected (≥${threshold}/min). Assess for pneumonia.`,
      severity: 'warning',
    };
  }

  return { isValid: true, severity: 'info' };
}

export function validateOxygenSaturation(sat: number): ClinicalValidation {
  if (!sat || sat <= 0) {
    return { isValid: false, warning: 'Oxygen saturation not recorded', severity: 'warning' };
  }

  if (sat < 90) {
    return { isValid: true, warning: 'Severe hypoxemia. Provide oxygen.', severity: 'urgent' };
  }

  if (sat < 94) {
    return { isValid: true, warning: 'Low oxygen saturation. Monitor closely.', severity: 'warning' };
  }

  return { isValid: true, severity: 'info' };
}

export function validateTemperature(temp: number): ClinicalValidation {
  if (!temp || temp <= 0) {
    return { isValid: false, warning: 'Temperature not recorded', severity: 'info' };
  }

  if (temp >= 39) {
    return { isValid: true, warning: 'High fever. Consider antipyretics.', severity: 'warning' };
  }

  if (temp >= 38) {
    return { isValid: true, warning: 'Fever present. Monitor closely.', severity: 'info' };
  }

  return { isValid: true, severity: 'info' };
}

/**
 * Cross-field consistency validation
 * Checks for logical inconsistencies between related fields
 */
export interface ConsistencyValidation {
  fieldId: string;
  message: string;
  severity: 'info' | 'warning' | 'urgent';
}

export function validateConsistency(answers: Record<string, any>): ConsistencyValidation[] {
  const warnings: ConsistencyValidation[] = [];

  // Fever without temperature reading
  if (answers.fever_present === true && (!answers.temperature || answers.temperature < 37.5)) {
    warnings.push({
      fieldId: 'fever_present',
      message: 'Fever reported but temperature normal. Re-measure?',
      severity: 'warning',
    });
  }

  // Cough without duration
  if (answers.cough_present === true && !answers.cough_duration_days) {
    warnings.push({
      fieldId: 'cough_present',
      message: 'Cough present but duration not recorded',
      severity: 'info',
    });
  }

  // Fast breathing but normal respiratory rate
  const respRate = answers.resp_rate;
  const ageMonths = answers.patient_age_months;
  if (ageMonths && respRate) {
    const threshold = getWhoFastBreathingThreshold(ageMonths);
    if (answers.fast_breathing === true && respRate < threshold) {
      warnings.push({
        fieldId: 'fast_breathing',
        message: 'Fast breathing marked but respiratory rate below threshold',
        severity: 'warning',
      });
    }
  }

  // Danger sign without severity indication
  const dangerSigns = [
    'unable_to_drink', 'vomits_everything', 'convulsions', 'lethargic_unconscious'
  ];
  const hasDanger = dangerSigns.some(s => answers[s] === true);
  if (hasDanger && !answers.referral_urgent) {
    warnings.push({
      fieldId: 'danger_signs',
      message: 'Danger sign detected. Urgent referral should be indicated.',
      severity: 'urgent',
    });
  }

  return warnings;
}

/**
 * Protocol completeness validation
 * Checks if all required assessments for current workflow state are completed
 */
export interface ProtocolValidation {
  valid: boolean;
  missingFields?: string[];
  message?: string;
}

export function validateProtocolCompliance(
  answers: Record<string, any>,
  currentStateId: string,
  workflow: import('~/types/clinical-form').WorkflowState[]
): ProtocolValidation {
  const currentState = workflow?.find((s: import('~/types/clinical-form').WorkflowState) => s.id === currentStateId);
  
  if (!currentState) {
    return { valid: true };
  }

  const requiredFields = currentState.requiredFields || [];
  const missingRequired = requiredFields.filter(
    (fieldId: string) => answers[fieldId] === undefined || answers[fieldId] === null
  );

  if (missingRequired.length > 0) {
    return {
      valid: false,
      missingFields: missingRequired,
      message: `Missing required assessments: ${missingRequired.join(', ')}`
    };
  }

  return { valid: true };
}
