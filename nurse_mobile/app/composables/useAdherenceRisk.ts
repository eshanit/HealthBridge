/**
 * Adherence Risk Scoring Composable
 * 
 * Phase 2.1 Task 2.1.3: Provides risk assessment for treatment completion
 * Based on treatment complexity, patient age, visit history, and other factors
 */

import { computed, type Ref } from 'vue';

/**
 * Risk factors for adherence scoring
 */
export interface AdherenceRiskFactors {
  /** Number of medications prescribed */
  medicationCount: number;
  /** Patient age in months */
  patientAgeMonths: number;
  /** Duration of treatment in days */
  treatmentDurationDays: number;
  /** Number of previously missed visits */
  previousMissedVisits: number;
  /** Distance from clinic in km (optional) */
  distanceFromClinic?: number;
  /** Estimated caregiver literacy level */
  caregiverLiteracy?: 'low' | 'medium' | 'high';
  /** Has the patient had previous treatments? */
  hasPreviousTreatments?: boolean;
  /** Treatment complexity level */
  treatmentComplexity?: 'simple' | 'moderate' | 'complex';
}

/**
 * Result of adherence risk calculation
 */
export interface AdherenceRiskResult {
  /** Risk score from 0-100 */
  score: number;
  /** Risk level classification */
  level: 'low' | 'medium' | 'high';
  /** Factors contributing to the risk */
  contributingFactors: string[];
  /** AI-generated recommendations to improve adherence */
  recommendations: string[];
  /** Color class for UI display */
  colorClass: string;
  /** Icon name for UI display */
  iconName: string;
}

/**
 * Risk factor weight configuration
 */
const RISK_WEIGHTS = {
  medicationCount: {
    threshold: 3,
    highRisk: 25,
    moderateRisk: 10
  },
  patientAge: {
    infantThreshold: 12,
    toddlerThreshold: 36,
    infantRisk: 15,
    toddlerRisk: 8
  },
  missedVisits: {
    pointsPerMiss: 10,
    maxPoints: 20
  },
  treatmentDuration: {
    longThreshold: 7,
    extendedThreshold: 14,
    longRisk: 8,
    extendedRisk: 15
  },
  distance: {
    farThreshold: 10,
    veryFarThreshold: 25,
    farRisk: 8,
    veryFarRisk: 15
  },
  complexity: {
    moderate: 10,
    complex: 20
  }
};

/**
 * Calculate adherence risk based on provided factors
 */
export function useAdherenceRisk(factors: Ref<AdherenceRiskFactors> | AdherenceRiskFactors) {
  const riskResult = computed<AdherenceRiskResult>(() => {
    const f = 'value' in factors ? factors.value : factors;
    let score = 0;
    const contributingFactors: string[] = [];
    const recommendations: string[] = [];

    // 1. Treatment complexity (0-25 points)
    if (f.medicationCount > 3) {
      score += RISK_WEIGHTS.medicationCount.highRisk;
      contributingFactors.push('Multiple medications increase complexity');
      recommendations.push('Consider simplified dosing schedule or combination medications');
    } else if (f.medicationCount > 1) {
      score += RISK_WEIGHTS.medicationCount.moderateRisk;
      contributingFactors.push('Multiple medications require careful coordination');
    }

    // Override with explicit complexity if provided
    if (f.treatmentComplexity === 'complex') {
      score = Math.max(score, RISK_WEIGHTS.complexity.complex);
      if (!contributingFactors.includes('Complex treatment protocol')) {
        contributingFactors.push('Complex treatment protocol');
      }
    } else if (f.treatmentComplexity === 'moderate') {
      score = Math.max(score, RISK_WEIGHTS.complexity.moderate);
    }

    // 2. Age factor (0-20 points)
    if (f.patientAgeMonths < RISK_WEIGHTS.patientAge.infantThreshold) {
      score += RISK_WEIGHTS.patientAge.infantRisk;
      contributingFactors.push('Infant requires precise dosing and close monitoring');
      recommendations.push('Demonstrate dosing technique to caregiver; provide measuring device');
    } else if (f.patientAgeMonths < RISK_WEIGHTS.patientAge.toddlerThreshold) {
      score += RISK_WEIGHTS.patientAge.toddlerRisk;
      contributingFactors.push('Young child may resist medication');
      recommendations.push('Suggest flavoring options or mixing with small amount of food');
    }

    // 3. Previous missed visits (0-20 points)
    const missedVisitScore = Math.min(
      RISK_WEIGHTS.missedVisits.maxPoints,
      f.previousMissedVisits * RISK_WEIGHTS.missedVisits.pointsPerMiss
    );
    if (missedVisitScore > 0) {
      score += missedVisitScore;
      contributingFactors.push(`History of ${f.previousMissedVisits} missed appointment(s)`);
      recommendations.push('Set up appointment reminders; discuss barriers to attendance');
    }

    // 4. Treatment duration (0-15 points)
    if (f.treatmentDurationDays >= RISK_WEIGHTS.treatmentDuration.extendedThreshold) {
      score += RISK_WEIGHTS.treatmentDuration.extendedRisk;
      contributingFactors.push('Extended treatment duration increases non-completion risk');
      recommendations.push('Schedule follow-up calls; provide treatment calendar');
    } else if (f.treatmentDurationDays > RISK_WEIGHTS.treatmentDuration.longThreshold) {
      score += RISK_WEIGHTS.treatmentDuration.longRisk;
      contributingFactors.push('Multi-day treatment requires sustained adherence');
      recommendations.push('Provide daily reminder tools');
    }

    // 5. Distance from clinic (0-15 points)
    if (f.distanceFromClinic !== undefined) {
      if (f.distanceFromClinic >= RISK_WEIGHTS.distance.veryFarThreshold) {
        score += RISK_WEIGHTS.distance.veryFarRisk;
        contributingFactors.push('Long distance to clinic may affect follow-up');
        recommendations.push('Consider community health worker follow-up; telehealth check-in');
      } else if (f.distanceFromClinic >= RISK_WEIGHTS.distance.farThreshold) {
        score += RISK_WEIGHTS.distance.farRisk;
        contributingFactors.push('Distance from clinic may affect follow-up attendance');
      }
    }

    // 6. Caregiver literacy (0-10 points)
    if (f.caregiverLiteracy === 'low') {
      score += 10;
      contributingFactors.push('Caregiver may need additional support understanding instructions');
      recommendations.push('Use pictorial instructions; demonstrate each step; involve family support');
    }

    // 7. Previous treatment history
    if (f.hasPreviousTreatments) {
      // Actually reduces risk - experienced caregiver
      score -= 5;
      recommendations.push('Reinforce previous successful treatment experience');
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));

    // Determine risk level
    const level: 'low' | 'medium' | 'high' = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';

    // Add general recommendations based on level
    if (level === 'high') {
      recommendations.unshift('Schedule follow-up within 2-3 days');
      recommendations.push('Consider directly observed therapy if feasible');
    } else if (level === 'medium') {
      recommendations.unshift('Schedule follow-up within 1 week');
    } else {
      recommendations.unshift('Standard follow-up schedule appropriate');
    }

    // Determine UI styling
    const colorClass = level === 'high' 
      ? 'text-red-400 bg-red-900/20 border-red-700/50'
      : level === 'medium'
      ? 'text-yellow-400 bg-yellow-900/20 border-yellow-700/50'
      : 'text-green-400 bg-green-900/20 border-green-700/50';

    const iconName = level === 'high'
      ? 'exclamation-triangle'
      : level === 'medium'
      ? 'exclamation-circle'
      : 'check-circle';

    return {
      score,
      level,
      contributingFactors,
      recommendations,
      colorClass,
      iconName
    };
  });

  return {
    riskResult
  };
}

/**
 * Get risk level from score
 */
export function getRiskLevel(score: number): 'low' | 'medium' | 'high' {
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

/**
 * Get color class for risk level
 */
export function getRiskColorClass(level: 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'high': return 'text-red-400 bg-red-900/20 border-red-700/50';
    case 'medium': return 'text-yellow-400 bg-yellow-900/20 border-yellow-700/50';
    case 'low': return 'text-green-400 bg-green-900/20 border-green-700/50';
  }
}

/**
 * Extract adherence risk factors from form answers
 */
export function extractAdherenceFactors(
  answers: Record<string, unknown>,
  patientAgeMonths: number,
  previousMissedVisits: number = 0
): AdherenceRiskFactors {
  // Count medications from recommended actions
  const recommendedActions = answers.recommended_actions as string[] | undefined;
  const medicationCount = recommendedActions?.length || 0;

  // Estimate treatment duration from actions
  let treatmentDurationDays = 5; // Default
  if (recommendedActions) {
    // Check for specific duration indicators
    const actionText = recommendedActions.join(' ').toLowerCase();
    if (actionText.includes('7 day') || actionText.includes('7-day') || actionText.includes('one week')) {
      treatmentDurationDays = 7;
    } else if (actionText.includes('10 day') || actionText.includes('10-day')) {
      treatmentDurationDays = 10;
    } else if (actionText.includes('14 day') || actionText.includes('14-day') || actionText.includes('two week')) {
      treatmentDurationDays = 14;
    } else if (actionText.includes('5 day') || actionText.includes('5-day') || actionText.includes('five day')) {
      treatmentDurationDays = 5;
    }
  }

  // Determine complexity
  let treatmentComplexity: 'simple' | 'moderate' | 'complex' = 'simple';
  if (medicationCount >= 3) {
    treatmentComplexity = 'complex';
  } else if (medicationCount >= 2) {
    treatmentComplexity = 'moderate';
  }

  return {
    medicationCount,
    patientAgeMonths,
    treatmentDurationDays,
    previousMissedVisits,
    treatmentComplexity
  };
}

/**
 * Default export for composable
 */
export default useAdherenceRisk;
