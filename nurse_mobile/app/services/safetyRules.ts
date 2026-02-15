import type { SafetyCheckResult } from '~/types/explainability';

const BLOCKED_PATTERNS = /what.*disease|what.*diagnosis|prescribe|treat with|recommend.*drug|dosage|mg\/kg|ml\/kg|give.*medicine|what.*instead/i;

const DANGEROUS_PATTERNS = /prescribe|prescription|dosage|mg\/kg|ml\/kg|inject|intravenous|iv\s+drip|take.*medicine|give.*antibiotic/i;

const CERTAINTY_PATTERNS = /\bwill die|definitely|certainly|guaranteed|no risk\b/i;

export function validateClinicalContext(context: {
  sessionExists?: boolean;
  assessmentComplete?: boolean;
  triageResult?: boolean;
}): SafetyCheckResult {
  if (!context.sessionExists) {
    return {
      allowed: false,
      reason: 'No active session. Please start a patient session.',
      escalation: 'block'
    };
  }

  if (!context.assessmentComplete) {
    return {
      allowed: false,
      reason: 'Assessment incomplete. Please complete clinical assessment first.',
      escalation: 'block'
    };
  }

  if (!context.triageResult) {
    return {
      allowed: false,
      reason: 'Triage not yet calculated.',
      escalation: 'block'
    };
  }

  return { allowed: true };
}

export function checkScope(input: string): SafetyCheckResult {
  if (BLOCKED_PATTERNS.test(input)) {
    return {
      allowed: false,
      reason: 'I cannot make clinical decisions or recommendations. I can only explain clinical findings.',
      escalation: 'block'
    };
  }

  return { allowed: true };
}

export function filterOutput(text: string): SafetyCheckResult {
  if (DANGEROUS_PATTERNS.test(text)) {
    return {
      allowed: false,
      reason: 'Output blocked: contains prescription or treatment language',
      escalation: 'block'
    };
  }

  if (CERTAINTY_PATTERNS.test(text)) {
    return {
      allowed: false,
      reason: 'Output blocked: contains overly certain language',
      escalation: 'warning'
    };
  }

  return { allowed: true };
}

export function checkRiskEscalation(params: {
  priority: 'red' | 'yellow' | 'green';
  triggers?: Array<{ fieldId: string }>;
}): { escalation: string; message: string } {
  if (params.priority === 'red') {
    return {
      escalation: 'emergency',
      message: 'EMERGENCY: Immediate referral required'
    };
  }

  const hasCyanosis = params.triggers?.some(t => 
    t.fieldId.includes('cyanosis')
  );
  const hasUnconscious = params.triggers?.some(t =>
    t.fieldId.includes('unconscious') || t.fieldId.includes('lethargic')
  );
  const hasConvulsions = params.triggers?.some(t =>
    t.fieldId.includes('convulsion')
  );

  if (hasCyanosis || hasUnconscious || hasConvulsions) {
    return {
      escalation: 'immediate',
      message: 'Immediate referral required - danger signs present'
    };
  }

  if (params.priority === 'yellow') {
    return {
      escalation: 'prompt',
      message: 'Prompt attention needed - follow recommended actions'
    };
  }

  return { escalation: 'none', message: '' };
}

export function performSafetyCheck(input: string, context: {
  sessionExists: boolean;
  assessmentComplete: boolean;
  triageResult: boolean;
  priority?: 'red' | 'yellow' | 'green';
  triggers?: Array<{ fieldId: string }>;
}): SafetyCheckResult {
  const contextCheck = validateClinicalContext(context);
  if (!contextCheck.allowed) return contextCheck;

  const scopeCheck = checkScope(input);
  if (!scopeCheck.allowed) return scopeCheck;

  if (context.priority) {
    const riskCheck = checkRiskEscalation({
      priority: context.priority,
      triggers: context.triggers
    });
    
    if (riskCheck.escalation === 'emergency') {
      return {
        allowed: true,
        reason: riskCheck.message,
        escalation: 'warning'
      };
    }
  }

  return { allowed: true };
}

export function sanitizeOutput(text: string): string {
  let sanitized = text;

  const replacements: Record<string, string> = {
    'prescribe': '[TREATMENT REFERENCE REMOVED]',
    'prescription': '[PRESCRIPTION REFERENCE REMOVED]',
    'take this medication': '[MEDICATION REFERENCE REMOVED]',
    'give this medicine': '[MEDICATION REFERENCE REMOVED]',
    'antibiotic': '[ANTIBIOTIC REFERENCE REMOVED]'
  };

  for (const [pattern, replacement] of Object.entries(replacements)) {
    const regex = new RegExp(pattern, 'gi');
    sanitized = sanitized.replace(regex, replacement);
  }

  return sanitized.trim();
}
