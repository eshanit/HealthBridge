/**
 * Risk Scorer for AI Safety
 * 
 * Phase 4 Task 4.1.2: Calculates risk scores for AI outputs
 * Based on SAFETY_GOVERNANCE.md specification
 */

import type { Priority } from '~/types/explainability';

// ============================================
// Types & Interfaces
// ============================================

export interface RiskBreakdown {
  /** Rule conflict detected */
  ruleConflict: number;
  /** Dosage mention detected */
  dosageMention: number;
  /** Diagnosis claim detected */
  diagnosisClaim: number;
  /** Absolute language detected */
  absolutes: number;
  /** Missing data references */
  missingDataRefs: number;
  /** Treatment recommendation */
  treatmentRecommendation: number;
  /** Override attempt */
  overrideAttempt: number;
}

export interface RiskScore {
  /** Total risk score (sum of all factors) */
  total: number;
  /** Breakdown by risk factor */
  breakdown: RiskBreakdown;
  /** Risk level classification */
  level: 'green' | 'yellow' | 'red';
  /** Human-readable risk level */
  levelLabel: string;
  /** Whether output should be blocked */
  shouldBlock: boolean;
  /** Whether output requires warning */
  shouldWarn: boolean;
  /** Risk factors detected */
  factors: string[];
}

export interface RiskScoringParams {
  /** AI output text to score */
  output: string;
  /** Contradictions detected */
  contradictions: string[];
  /** Clinical context */
  context: {
    priority?: Priority;
    hasAssessment?: boolean;
    hasTriage?: boolean;
  };
}

// ============================================
// Risk Scoring Configuration
// ============================================

/** Score values for each risk factor */
const RISK_SCORES = {
  ruleConflict: 5,
  dosageMention: 5,
  diagnosisClaim: 3,
  absolutes: 2,
  missingDataRefs: 1,
  treatmentRecommendation: 4,
  overrideAttempt: 5,
} as const;

/** Risk level thresholds */
const RISK_THRESHOLDS = {
  green: { max: 2, label: 'Low Risk', color: '#43A047' },
  yellow: { max: 5, label: 'Medium Risk', color: '#FBC02D' },
  red: { max: Infinity, label: 'High Risk', color: '#E53935' },
} as const;

/** Block threshold - outputs above this score are blocked */
const BLOCK_THRESHOLD = 7;

/** Warning threshold - outputs above this score show warning */
const WARN_THRESHOLD = 3;

// ============================================
// Detection Patterns
// ============================================

/** Patterns indicating dosage mentions */
const DOSAGE_PATTERNS = [
  /\b\d+\s?(mg|ml|kg|g|mcg|units?|IU)\b/i,
  /\b\d+\s?(milligrams?|milliliters?|kilograms?|grams?|micrograms?)\b/i,
  /dosage\s+(of|is|should be)\s+\d+/i,
  /give\s+\d+\s?(mg|ml|kg)/i,
  /\d+\s?(mg|ml)\/kg/i,  // Weight-based dosing
];

/** Patterns indicating diagnosis claims */
const DIAGNOSIS_PATTERNS = [
  /\bdiagnosis\s+(is|indicates|shows|confirms)\b/i,
  /\bpatient\s+(has|is\s+suffering\s+from)\s+\w+/i,
  /\bthis\s+is\s+(a|an)\s+\w+\s+(infection|disease|condition)\b/i,
  /\bconfirmed\s+\w+\s+(infection|disease|diagnosis)\b/i,
  /\bthe\s+child\s+has\s+\w+/i,
];

/** Patterns indicating absolute language */
const ABSOLUTE_PATTERNS = [
  /\bwill\s+(die|not\s+survive|definitely)\b/i,
  /\bdefinitely\b/i,
  /\bcertainly\b/i,
  /\bguaranteed\b/i,
  /\bno\s+risk\b/i,
  /\b100%\s+(sure|certain|safe)\b/i,
  /\balways\s+(safe|dangerous|fatal)\b/i,
  /\bnever\s+(safe|dangerous|fatal)\b/i,
];

/** Patterns indicating missing data references */
const MISSING_DATA_PATTERNS = [
  /\bI\s+don't\s+have\s+(enough|sufficient|complete)\b/i,
  /\bmissing\s+(data|information|details)\b/i,
  /\bincomplete\s+(assessment|data|information)\b/i,
  /\bunable\s+to\s+determine\b/i,
  /\bcannot\s+(determine|assess|evaluate)\b/i,
  /\binsufficient\s+(data|information)\b/i,
];

/** Patterns indicating treatment recommendations */
const TREATMENT_PATTERNS = [
  /\bshould\s+(take|be\s+given|receive)\b/i,
  /\bmust\s+(take|be\s+given|receive)\b/i,
  /\bneeds?\s+to\s+take\b/i,
  /\bI\s+recommend\s+(giving|prescribing|starting)\b/i,
  /\bstart\s+(on|treatment\s+with)\b/i,
  /\bprescribe\s+\w+/i,
];

/** Patterns indicating override attempts */
const OVERRIDE_PATTERNS = [
  /\bchange\s+(the\s+)?triage\b/i,
  /\boverride\s+(the\s+)?(classification|priority|triage)\b/i,
  /\bignore\s+(the\s+)?(system|rule|classification)\b/i,
  /\bdifferent\s+(priority|classification)\s+(than|then)\b/i,
  /\bshould\s+be\s+(red|yellow|green)\s+instead\b/i,
];

// ============================================
// Scoring Functions
// ============================================

/**
 * Check if output contains dosage mentions
 */
function checkDosageMentions(output: string): { score: number; found: string[] } {
  const found: string[] = [];
  
  for (const pattern of DOSAGE_PATTERNS) {
    const matches = output.match(pattern);
    if (matches) {
      found.push(...matches);
    }
  }
  
  return {
    score: found.length > 0 ? RISK_SCORES.dosageMention : 0,
    found: [...new Set(found)], // Dedupe
  };
}

/**
 * Check if output contains diagnosis claims
 */
function checkDiagnosisClaims(output: string): { score: number; found: string[] } {
  const found: string[] = [];
  
  for (const pattern of DIAGNOSIS_PATTERNS) {
    const matches = output.match(pattern);
    if (matches) {
      found.push(...matches);
    }
  }
  
  return {
    score: found.length > 0 ? RISK_SCORES.diagnosisClaim : 0,
    found: [...new Set(found)],
  };
}

/**
 * Check if output contains absolute language
 */
function checkAbsolutes(output: string): { score: number; found: string[] } {
  const found: string[] = [];
  
  for (const pattern of ABSOLUTE_PATTERNS) {
    const matches = output.match(pattern);
    if (matches) {
      found.push(...matches);
    }
  }
  
  return {
    score: found.length > 0 ? RISK_SCORES.absolutes : 0,
    found: [...new Set(found)],
  };
}

/**
 * Check if output references missing data
 */
function checkMissingDataRefs(output: string): { score: number; found: string[] } {
  const found: string[] = [];
  
  for (const pattern of MISSING_DATA_PATTERNS) {
    const matches = output.match(pattern);
    if (matches) {
      found.push(...matches);
    }
  }
  
  return {
    score: found.length > 0 ? RISK_SCORES.missingDataRefs : 0,
    found: [...new Set(found)],
  };
}

/**
 * Check if output contains treatment recommendations
 */
function checkTreatmentRecommendations(output: string): { score: number; found: string[] } {
  const found: string[] = [];
  
  for (const pattern of TREATMENT_PATTERNS) {
    const matches = output.match(pattern);
    if (matches) {
      found.push(...matches);
    }
  }
  
  return {
    score: found.length > 0 ? RISK_SCORES.treatmentRecommendation : 0,
    found: [...new Set(found)],
  };
}

/**
 * Check if output contains override attempts
 */
function checkOverrideAttempts(output: string): { score: number; found: string[] } {
  const found: string[] = [];
  
  for (const pattern of OVERRIDE_PATTERNS) {
    const matches = output.match(pattern);
    if (matches) {
      found.push(...matches);
    }
  }
  
  return {
    score: found.length > 0 ? RISK_SCORES.overrideAttempt : 0,
    found: [...new Set(found)],
  };
}

// ============================================
// Main Risk Scoring Function
// ============================================

/**
 * Calculate risk score for AI output
 * 
 * @param params - Scoring parameters
 * @returns Complete risk score with breakdown and recommendations
 */
export function calculateRiskScore(params: RiskScoringParams): RiskScore {
  const { output, contradictions, context } = params;
  const factors: string[] = [];
  const breakdown: RiskBreakdown = {
    ruleConflict: 0,
    dosageMention: 0,
    diagnosisClaim: 0,
    absolutes: 0,
    missingDataRefs: 0,
    treatmentRecommendation: 0,
    overrideAttempt: 0,
  };
  
  // 1. Check for rule conflicts (contradictions)
  if (contradictions.length > 0) {
    breakdown.ruleConflict = RISK_SCORES.ruleConflict;
    factors.push(`Rule conflict detected: ${contradictions.length} contradiction(s)`);
  }
  
  // 2. Check for dosage mentions
  const dosageCheck = checkDosageMentions(output);
  if (dosageCheck.score > 0) {
    breakdown.dosageMention = dosageCheck.score;
    factors.push(`Dosage mention: "${dosageCheck.found.join('", "')}"`);
  }
  
  // 3. Check for diagnosis claims
  const diagnosisCheck = checkDiagnosisClaims(output);
  if (diagnosisCheck.score > 0) {
    breakdown.diagnosisClaim = diagnosisCheck.score;
    factors.push(`Diagnosis claim: "${diagnosisCheck.found.join('", "')}"`);
  }
  
  // 4. Check for absolute language
  const absolutesCheck = checkAbsolutes(output);
  if (absolutesCheck.score > 0) {
    breakdown.absolutes = absolutesCheck.score;
    factors.push(`Absolute language: "${absolutesCheck.found.join('", "')}"`);
  }
  
  // 5. Check for missing data references
  const missingDataCheck = checkMissingDataRefs(output);
  if (missingDataCheck.score > 0) {
    breakdown.missingDataRefs = missingDataCheck.score;
    factors.push(`Missing data reference: "${missingDataCheck.found.join('", "')}"`);
  }
  
  // 6. Check for treatment recommendations
  const treatmentCheck = checkTreatmentRecommendations(output);
  if (treatmentCheck.score > 0) {
    breakdown.treatmentRecommendation = treatmentCheck.score;
    factors.push(`Treatment recommendation: "${treatmentCheck.found.join('", "')}"`);
  }
  
  // 7. Check for override attempts
  const overrideCheck = checkOverrideAttempts(output);
  if (overrideCheck.score > 0) {
    breakdown.overrideAttempt = overrideCheck.score;
    factors.push(`Override attempt: "${overrideCheck.found.join('", "')}"`);
  }
  
  // Calculate total
  const total = Object.values(breakdown).reduce((sum, score) => sum + score, 0);
  
  // Determine level
  let level: 'green' | 'yellow' | 'red';
  let levelLabel: string;
  
  if (total <= RISK_THRESHOLDS.green.max) {
    level = 'green';
    levelLabel = RISK_THRESHOLDS.green.label;
  } else if (total <= RISK_THRESHOLDS.yellow.max) {
    level = 'yellow';
    levelLabel = RISK_THRESHOLDS.yellow.label;
  } else {
    level = 'red';
    levelLabel = RISK_THRESHOLDS.red.label;
  }
  
  return {
    total,
    breakdown,
    level,
    levelLabel,
    shouldBlock: total >= BLOCK_THRESHOLD,
    shouldWarn: total >= WARN_THRESHOLD,
    factors,
  };
}

/**
 * Quick risk check - returns just the level
 */
export function getRiskLevel(output: string, contradictions: string[] = []): 'green' | 'yellow' | 'red' {
  return calculateRiskScore({
    output,
    contradictions,
    context: {},
  }).level;
}

/**
 * Check if output should be blocked
 */
export function shouldBlockOutput(output: string, contradictions: string[] = []): boolean {
  return calculateRiskScore({
    output,
    contradictions,
    context: {},
  }).shouldBlock;
}

/**
 * Get risk badge emoji
 */
export function getRiskBadgeEmoji(level: 'green' | 'yellow' | 'red'): string {
  switch (level) {
    case 'green': return '🟢';
    case 'yellow': return '🟡';
    case 'red': return '🔴';
  }
}

/**
 * Get risk badge color
 */
export function getRiskBadgeColor(level: 'green' | 'yellow' | 'red'): string {
  return RISK_THRESHOLDS[level].color;
}
