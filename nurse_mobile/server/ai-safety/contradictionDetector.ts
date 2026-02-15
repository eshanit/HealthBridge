/**
 * Contradiction Detector for AI Safety
 * 
 * Phase 4 Task 4.1.3: Detects contradictions between AI output and calculated triage
 * Ensures AI doesn't contradict the deterministic rule engine
 */

import type { ExplainabilityRecord, Priority } from '~/types/explainability';

// ============================================
// Types & Interfaces
// ============================================

export type ContradictionType = 
  | 'priority_mismatch'
  | 'action_conflict'
  | 'data_inconsistency'
  | 'scope_violation'
  | 'clinical_error';

export type ContradictionSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface Contradiction {
  /** Type of contradiction */
  type: ContradictionType;
  /** Human-readable description */
  description: string;
  /** Severity level */
  severity: ContradictionSeverity;
  /** AI output that triggered the contradiction */
  aiText?: string;
  /** System value that was contradicted */
  systemValue?: string;
  /** Suggested resolution */
  resolution?: string;
}

export interface ContradictionDetectionParams {
  /** AI output text */
  aiOutput: string;
  /** Explainability record with calculated values */
  explainability: ExplainabilityRecord;
  /** Additional context */
  context?: {
    userQuestion?: string;
    useCase?: string;
  };
}

export interface ContradictionDetectionResult {
  /** All detected contradictions */
  contradictions: Contradiction[];
  /** Whether any critical contradictions exist */
  hasCritical: boolean;
  /** Whether any errors exist */
  hasErrors: boolean;
  /** Summary of issues */
  summary: string;
}

// ============================================
// Priority Detection Patterns
// ============================================

/** Patterns that suggest a priority in text */
const PRIORITY_PATTERNS: Record<Priority, RegExp[]> = {
  red: [
    /\b(red|emergency|critical|immediate|urgent\s+referral|life-threatening)\b/i,
    /\bsevere\s+\w+\s+(requiring|needs?)\s+(immediate|urgent)\b/i,
    /\bimmediate\s+(referral|action|attention)\s+required\b/i,
    /\bthis\s+is\s+an?\s+emergency\b/i,
  ],
  yellow: [
    /\b(yellow|urgent|prompt|moderate)\b/i,
    /\brequires?\s+(prompt|urgent)\s+(attention|follow-up)\b/i,
    /\bshould\s+be\s+seen\s+(soon|promptly)\b/i,
    /\bfollow-up\s+(in\s+)?\d+\s+days?\b/i,
  ],
  green: [
    /\b(green|non-urgent|mild|minor|stable)\b/i,
    /\bhome\s+care\b/i,
    /\bcan\s+be\s+managed\s+at\s+home\b/i,
    /\bno\s+urgent\s+(action|intervention)\s+(needed|required)\b/i,
    /\bself-limiting\b/i,
  ],
};

// ============================================
// Detection Functions
// ============================================

/**
 * Extract mentioned priority from AI text
 */
function extractMentionedPriority(text: string): Priority | null {
  // Check each priority's patterns
  for (const [priority, patterns] of Object.entries(PRIORITY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return priority as Priority;
      }
    }
  }
  
  return null;
}

/**
 * Detect priority mismatch between AI output and calculated triage
 */
function detectPriorityMismatch(
  aiOutput: string,
  explainability: ExplainabilityRecord
): Contradiction | null {
  const mentionedPriority = extractMentionedPriority(aiOutput);
  const calculatedPriority = explainability.classification.priority;
  
  if (mentionedPriority && mentionedPriority !== calculatedPriority) {
    // Determine severity based on direction of mismatch
    let severity: ContradictionSeverity;
    
    if (mentionedPriority === 'red' && calculatedPriority !== 'red') {
      // AI says red but system says otherwise - could cause panic
      severity = 'warning';
    } else if (mentionedPriority !== 'red' && calculatedPriority === 'red') {
      // AI downplays a red case - DANGEROUS
      severity = 'critical';
    } else if (mentionedPriority === 'green' && calculatedPriority === 'yellow') {
      // AI says green but system says yellow - could miss urgent case
      severity = 'error';
    } else {
      severity = 'warning';
    }
    
    return {
      type: 'priority_mismatch',
      description: `AI suggests ${mentionedPriority.toUpperCase()} priority but system calculated ${calculatedPriority.toUpperCase()}`,
      severity,
      aiText: `Mentioned: ${mentionedPriority}`,
      systemValue: `Calculated: ${calculatedPriority}`,
      resolution: 'Trust the system-calculated priority based on WHO IMCI rules',
    };
  }
  
  return null;
}

/**
 * Detect action conflicts between AI recommendations and system actions
 */
function detectActionConflicts(
  aiOutput: string,
  explainability: ExplainabilityRecord
): Contradiction[] {
  const contradictions: Contradiction[] = [];
  const systemActions = explainability.recommendedActions.map(a => a.code.toLowerCase());
  
  // Check for referral conflicts
  const hasReferralAction = systemActions.includes('urgent_referral');
  const aiSaysHomeCare = /\b(home\s+care|can\s+go\s+home|discharge|no\s+referral)\b/i.test(aiOutput);
  
  if (hasReferralAction && aiSaysHomeCare) {
    contradictions.push({
      type: 'action_conflict',
      description: 'AI suggests home care but system recommends urgent referral',
      severity: 'critical',
      aiText: 'Suggests home care',
      systemValue: 'Requires urgent referral',
      resolution: 'Follow system recommendation for urgent referral',
    });
  }
  
  // Check for antibiotic conflicts
  const hasAntibioticAction = systemActions.some(a => 
    a.includes('antibiotic') || a.includes('first_dose')
  );
  const aiSaysNoAntibiotics = /\bno\s+(need\s+for\s+)?antibiotics?\b/i.test(aiOutput);
  
  if (hasAntibioticAction && aiSaysNoAntibiotics) {
    contradictions.push({
      type: 'action_conflict',
      description: 'AI suggests no antibiotics but system recommends them',
      severity: 'error',
      aiText: 'Suggests no antibiotics',
      systemValue: 'System recommends antibiotics',
      resolution: 'Follow system recommendation based on WHO IMCI guidelines',
    });
  }
  
  // Check for follow-up conflicts
  const hasFollowUp = systemActions.some(a => a.includes('follow_up'));
  const aiSaysNoFollowUp = /\bno\s+(need\s+for\s+)?follow-?up\b/i.test(aiOutput);
  
  if (hasFollowUp && aiSaysNoFollowUp) {
    contradictions.push({
      type: 'action_conflict',
      description: 'AI suggests no follow-up but system recommends it',
      severity: 'warning',
      aiText: 'Suggests no follow-up',
      systemValue: 'System recommends follow-up',
      resolution: 'Follow system recommendation for follow-up',
    });
  }
  
  return contradictions;
}

/**
 * Detect data inconsistencies between AI output and recorded findings
 */
function detectDataInconsistencies(
  aiOutput: string,
  explainability: ExplainabilityRecord
): Contradiction[] {
  const contradictions: Contradiction[] = [];
  const triggers = explainability.reasoning.triggers;
  
  // Check if AI contradicts recorded findings
  for (const trigger of triggers) {
    const fieldId = trigger.fieldId.toLowerCase();
    const value = String(trigger.value).toLowerCase();
    
    // Check for cyanosis contradiction
    if (fieldId.includes('cyanosis') && value === 'present') {
      const aiSaysNoCyanosis = /\bno\s+cyanosis\b/i.test(aiOutput) || 
        /\bcyanosis\s+(is\s+)?(absent|not\s+(present|observed))\b/i.test(aiOutput);
      
      if (aiSaysNoCyanosis) {
        contradictions.push({
          type: 'data_inconsistency',
          description: 'AI states no cyanosis but it was observed in assessment',
          severity: 'error',
          aiText: 'States no cyanosis',
          systemValue: 'Cyanosis observed',
          resolution: 'Review assessment data - cyanosis was recorded as present',
        });
      }
    }
    
    // Check for respiratory distress contradiction
    if (fieldId.includes('distress') || fieldId.includes('retraction')) {
      const aiSaysNoDistress = /\bno\s+(respiratory\s+)?distress\b/i.test(aiOutput) ||
        /\b(retractions?|indrawing)\s+(is\s+)?(absent|not\s+(present|observed))\b/i.test(aiOutput);
      
      if (aiSaysNoDistress && (value === 'present' || value === 'true')) {
        contradictions.push({
          type: 'data_inconsistency',
          description: 'AI states no respiratory distress but it was observed',
          severity: 'error',
          aiText: 'States no respiratory distress',
          systemValue: 'Respiratory distress observed',
          resolution: 'Review assessment data - respiratory distress was recorded',
        });
      }
    }
    
    // Check for danger signs contradiction
    if (fieldId.includes('danger') || fieldId.includes('lethargic') || fieldId.includes('unconscious')) {
      const aiSaysNoDanger = /\bno\s+danger\s+signs?\b/i.test(aiOutput);
      
      if (aiSaysNoDanger && (value === 'present' || value === 'true')) {
        contradictions.push({
          type: 'data_inconsistency',
          description: 'AI states no danger signs but they were observed',
          severity: 'critical',
          aiText: 'States no danger signs',
          systemValue: 'Danger signs observed',
          resolution: 'Review assessment data - danger signs were recorded',
        });
      }
    }
  }
  
  return contradictions;
}

/**
 * Detect scope violations (AI going beyond advisory role)
 */
function detectScopeViolations(aiOutput: string): Contradiction[] {
  const contradictions: Contradiction[] = [];
  
  // Check for diagnosis claims
  const diagnosisPatterns = [
    /\bdiagnosis\s+(is|confirmed|shows)\s+:/i,
    /\bthe\s+(child|patient)\s+has\s+\w+\s+(infection|disease|condition)\b/i,
    /\bconfirmed\s+diagnosis\s+of\b/i,
  ];
  
  for (const pattern of diagnosisPatterns) {
    if (pattern.test(aiOutput)) {
      contradictions.push({
        type: 'scope_violation',
        description: 'AI appears to be making a diagnosis - exceeds advisory role',
        severity: 'error',
        resolution: 'AI should describe findings, not diagnose',
      });
      break;
    }
  }
  
  // Check for prescription recommendations
  const prescriptionPatterns = [
    /\bprescribe\s+\w+/i,
    /\bgive\s+\d+\s?mg\b/i,
    /\bdosage\s+(of|is)\s+\d+/i,
  ];
  
  for (const pattern of prescriptionPatterns) {
    if (pattern.test(aiOutput)) {
      contradictions.push({
        type: 'scope_violation',
        description: 'AI appears to be prescribing - exceeds advisory role',
        severity: 'error',
        resolution: 'AI should not recommend specific dosages',
      });
      break;
    }
  }
  
  return contradictions;
}

/**
 * Detect clinical errors in AI output
 */
function detectClinicalErrors(
  aiOutput: string,
  explainability: ExplainabilityRecord
): Contradiction[] {
  const contradictions: Contradiction[] = [];
  
  // Check for incorrect clinical statements
  const incorrectStatements = [
    // Incorrect age-based thresholds
    {
      pattern: /\b(respiratory\s+rate|breathing)\s+(of|above|over)\s+(\d+)\s+(is\s+)?normal\b/i,
      check: (match: RegExpMatchArray, exp: ExplainabilityRecord) => {
        const rateStr = match[3];
        if (!rateStr) return false;
        const rate = parseInt(rateStr);
        // For children under 12 months, RR > 50 is fast
        // For children 12-59 months, RR > 40 is fast
        return rate > 40; // Simplified check
      },
      description: 'AI states elevated respiratory rate is normal',
      severity: 'error' as ContradictionSeverity,
    },
  ];
  
  for (const statement of incorrectStatements) {
    const match = aiOutput.match(statement.pattern);
    if (match && statement.check(match, explainability)) {
      contradictions.push({
        type: 'clinical_error',
        description: statement.description,
        severity: statement.severity,
        resolution: 'Review WHO IMCI guidelines for age-appropriate thresholds',
      });
    }
  }
  
  return contradictions;
}

// ============================================
// Main Detection Function
// ============================================

/**
 * Detect all contradictions between AI output and system calculations
 * 
 * @param params - Detection parameters
 * @returns Complete detection result with all contradictions
 */
export function detectContradictions(
  params: ContradictionDetectionParams
): ContradictionDetectionResult {
  const { aiOutput, explainability, context } = params;
  const contradictions: Contradiction[] = [];
  
  // 1. Check priority mismatch
  const priorityMismatch = detectPriorityMismatch(aiOutput, explainability);
  if (priorityMismatch) {
    contradictions.push(priorityMismatch);
  }
  
  // 2. Check action conflicts
  contradictions.push(...detectActionConflicts(aiOutput, explainability));
  
  // 3. Check data inconsistencies
  contradictions.push(...detectDataInconsistencies(aiOutput, explainability));
  
  // 4. Check scope violations
  contradictions.push(...detectScopeViolations(aiOutput));
  
  // 5. Check clinical errors
  contradictions.push(...detectClinicalErrors(aiOutput, explainability));
  
  // Determine flags
  const hasCritical = contradictions.some(c => c.severity === 'critical');
  const hasErrors = contradictions.some(c => c.severity === 'error' || c.severity === 'critical');
  
  // Generate summary
  let summary = '';
  if (contradictions.length === 0) {
    summary = 'No contradictions detected';
  } else {
    const critical = contradictions.filter(c => c.severity === 'critical').length;
    const errors = contradictions.filter(c => c.severity === 'error').length;
    const warnings = contradictions.filter(c => c.severity === 'warning').length;
    
    const parts: string[] = [];
    if (critical > 0) parts.push(`${critical} critical`);
    if (errors > 0) parts.push(`${errors} error(s)`);
    if (warnings > 0) parts.push(`${warnings} warning(s)`);
    
    summary = `Detected: ${parts.join(', ')}`;
  }
  
  return {
    contradictions,
    hasCritical,
    hasErrors,
    summary,
  };
}

/**
 * Quick check if output has critical contradictions
 */
export function hasCriticalContradiction(
  aiOutput: string,
  explainability: ExplainabilityRecord
): boolean {
  return detectContradictions({ aiOutput, explainability }).hasCritical;
}

/**
 * Get contradiction descriptions for display
 */
export function getContradictionDescriptions(contradictions: Contradiction[]): string[] {
  return contradictions.map(c => c.description);
}
