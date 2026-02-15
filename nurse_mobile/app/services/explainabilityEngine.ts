import type { ClinicalFormInstance } from '~/types/clinical-form';
import type { ExplainabilityRecord, Priority } from '~/types/explainability';
import { RULE_EXPLANATIONS, ACTION_LABELS } from '~/data/explainabilityMaps';
import { ollamaService, generateAINarrative } from './ollamaService';

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'Present' : 'Absent';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  return String(value ?? 'present');
}

interface RuleMatch {
  ruleId: string;
  condition: string;
  matched: boolean;
  value?: unknown;
}

function getPriorityLabel(priority: Priority): string {
  return {
    red: 'Emergency - Immediate Action Required',
    yellow: 'Urgent - Prompt Attention Needed',
    green: 'Non-Urgent - Standard Care'
  }[priority];
}

export { getPriorityLabel, formatValue, generateId };

export async function buildExplainabilityModel(
  assessment: ClinicalFormInstance,
  options: { sessionId: string; useAI?: boolean } = { sessionId: '' }
): Promise<ExplainabilityRecord | null> {
  const calculated = assessment.calculated;
  
  if (!calculated?.matchedTriageRule) {
    return null;
  }

  const rule = calculated.matchedTriageRule;
  const priority = calculated.triagePriority as Priority;

  const triggers = ((calculated.ruleMatches || []) as RuleMatch[])
    .filter(r => r.matched)
    .map(r => {
      const explanation = RULE_EXPLANATIONS[r.ruleId];
      return {
        fieldId: r.ruleId,
        value: formatValue(r.value),
        threshold: 'WHO IMCI threshold',
        explanation: explanation?.description || r.condition,
        clinicalMeaning: explanation?.clinicalMeaning || r.condition
      };
    });

  const recommendedActions = (rule.actions as string[]).map(code => {
    const action = ACTION_LABELS[code];
    return {
      code,
      label: action?.label || code,
      justification: action?.justification || 'Based on triage classification',
      whoReference: action?.whoReference
    };
  });

  const baseRecord: ExplainabilityRecord = {
    id: generateId(),
    sessionId: options.sessionId,
    assessmentInstanceId: assessment._id || 'assessment-record',
    timestamp: new Date().toISOString(),

    classification: {
      priority,
      label: getPriorityLabel(priority),
      protocol: 'WHO_IMCI'
    },

    reasoning: {
      primaryRule: {
        id: rule.id,
        description: RULE_EXPLANATIONS[rule.id]?.description || rule.id,
        source: 'WHO_IMCI'
      },
      triggers,
      clinicalNarrative: ''
    },

    recommendedActions,

    safetyNotes: [
      'Derived from WHO IMCI guidelines',
      'Actions must be clinically confirmed',
      'Escalate if patient condition worsens'
    ],

    confidence: 1.0,
    dataCompleteness: 1.0,

    aiEnhancement: undefined
  };

  // Generate narrative - AI if enabled, otherwise rule-based
  if (options.useAI) {
    try {
      // Check if Ollama is available
      const healthCheck = await ollamaService.testConnection();
      
      if (healthCheck.success) {
        const aiNarrative = await generateAINarrative(
          buildAIPrompt(priority, triggers, baseRecord),
          'EXPLAIN_TRIAGE'
        );
        
        baseRecord.reasoning.clinicalNarrative = aiNarrative;
        baseRecord.aiEnhancement = {
          used: true,
          useCase: 'EXPLAIN_TRIAGE',
          modelVersion: ollamaService.defaultModel
        };
        baseRecord.safetyNotes = [
          'AI-enhanced clinical decision support based on MedGemma',
          'Verify all AI suggestions with clinical judgment',
          'Escalate immediately if patient condition worsens',
          'Follow WHO IMCI guidelines as primary reference'
        ];
        baseRecord.confidence = 0.95;
      } else {
        console.warn('[ExplainabilityEngine] Ollama not available, using rule-based:', healthCheck.error);
        baseRecord.reasoning.clinicalNarrative = generateRuleBasedNarrative(priority, triggers);
        baseRecord.aiEnhancement = {
          used: false,
          useCase: 'EXPLAIN_TRIAGE',
          modelVersion: ollamaService.defaultModel
        };
      }
    } catch (error) {
      console.warn('[ExplainabilityEngine] AI generation failed, falling back to rule-based:', error);
      baseRecord.reasoning.clinicalNarrative = generateRuleBasedNarrative(priority, triggers);
      baseRecord.aiEnhancement = {
        used: false,
        useCase: 'EXPLAIN_TRIAGE',
        modelVersion: ollamaService.defaultModel
      };
    }
  } else {
    baseRecord.reasoning.clinicalNarrative = generateRuleBasedNarrative(priority, triggers);
  }

  return baseRecord;
}

function buildAIPrompt(
  priority: Priority,
  triggers: ExplainabilityRecord['reasoning']['triggers'],
  record: ExplainabilityRecord
): string {
  const priorityText = {
    red: 'emergency',
    yellow: 'urgent',
    green: 'non-urgent'
  }[priority];

  const triggerText = triggers.map(t => t.clinicalMeaning).join(', ');

  return `You are MedGemma, a clinical AI assistant explaining triage decisions to nurses.

CONTEXT:
- Patient triage: ${priority.toUpperCase()} (${priorityText})
- Clinical findings: ${triggerText}
- Rule applied: ${record.reasoning.primaryRule.id}

TASK: Provide a concise clinical explanation including:
1. Why these findings warrant ${priority} priority
2. Key clinical implications
3. When to escalate care

FORMAT: Use plain language for nurses. Max 100 words.`;
}

function generateRuleBasedNarrative(
  priority: Priority,
  triggers: ExplainabilityRecord['reasoning']['triggers']
): string {
  const priorityText = {
    red: 'emergency',
    yellow: 'urgent',
    green: 'non-urgent'
  }[priority];

  if (triggers.length === 0) {
    return `Patient classified as ${priority.toUpperCase()} (${priorityText}) based on clinical assessment.`;
  }

  const meaningList = triggers.map(t => t.clinicalMeaning);
  return `Patient classified as ${priority.toUpperCase()} (${priorityText}) because: ${meaningList.join(', ')}.`;
}

export function getClinicalTermDefinition(term: string): string {
  const clinicalTerms: Record<string, string> = {
    cyanosis: 'bluish discoloration indicating low oxygen in blood',
    retractions: 'chest muscles pulling in when breathing - sign of respiratory distress',
    lethargic: 'unusually sleepy, difficult to wake',
    unconscious: 'not awake, not responding to stimuli',
    convulsions: 'involuntary muscle spasms (seizures)',
    tachypnea: 'abnormally rapid breathing',
    chest_indrawing: 'skin pulling into chest wall when breathing in',
    nasal_flaring: 'nostrils widening when breathing',
    grunting: 'sound made when breathing out - sign of respiratory distress',
    hypoxemia: 'low oxygen level in blood',
    dehydration: 'loss of body fluids'
  };

  return clinicalTerms[term.toLowerCase()] || 'Clinical term';
}
