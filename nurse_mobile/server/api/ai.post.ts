/**
 * AI API Gateway - MedGemma Phase 1
 *
 * Server-side endpoint for AI requests
 * Handles Ollama communication, validation, and safety filtering
 * 
 * Features:
 * - Structured JSON prompting for consistent responses
 * - Response parsing with fallback handling
 * - Full AIResponse contract implementation
 * - Safety filtering and audit logging
 */

import { $fetch } from 'ofetch';
import type { 
  AIRequest, 
  AIResponse, 
  AIPayload,
  AIUseCase,
  SchemaContext,
  PatientContext,
  SystemResult
} from '../types/ai';

// ============================================================================
// REQUEST NORMALIZER
// ============================================================================

interface ReactiveAIRequest {
  // Session metadata (per JSON schema)
  sessionId?: string;
  schemaId?: string;
  formId?: string;
  
  // Request tracking (per JSON schema)
  requestId?: string;
  timestamp?: string;
  
  // Core clinical data
  currentValues: Record<string, unknown>;
  calculated: Record<string, unknown>;
  promptType: string;
  
  // AI interaction
  inconsistencies?: Array<{
    type: string;
    field: string;
    value: unknown;
    expected: string;
    message: string;
    severity: string;
  }>;
  
  // Previous AI context (per JSON schema)
  previousAI?: Array<{
    requestId: string;
    timestamp: string;
    response: string;
  }>;
}

function normalizeToAIRequest(raw: ReactiveAIRequest | AIRequest): AIRequest {
  // If it already has the right structure, return as-is
  if ('useCase' in raw && 'payload' in raw) {
    return raw as AIRequest;
  }
  
  // Convert reactive format to AIRequest format
  const reactive = raw as ReactiveAIRequest;
  const promptType = (reactive.promptType || 'EXPLAIN_TRIAGE') as AIUseCase;
  
  // Generate request metadata if not provided
  const requestId = reactive.requestId || crypto.randomUUID?.() || `req_${Date.now()}`;
  const timestamp = reactive.timestamp || new Date().toISOString();
  
  // Validate and build system result from calculated data
  const rawPriority = reactive.calculated?.triagePriority;
  const validatedPriority: 'red' | 'yellow' | 'green' = 
    (rawPriority === 'red' || rawPriority === 'yellow' || rawPriority === 'green') 
      ? rawPriority 
      : 'green';
  
  const systemResult: SystemResult = {
    priority: validatedPriority,
    actions: (reactive.calculated?.triageActions as string[]) || [],
    ruleIds: []
  };
  
  // Calculate age from date of birth if not provided directly
  let ageMonths = (reactive.currentValues?.age_months as number) || 
                  (reactive.calculated?.age_months as number) || 0;
  
  // If age not provided, calculate from date of birth
  if (!ageMonths) {
    const dob = reactive.currentValues?.patient_dob || 
                reactive.currentValues?.date_of_birth ||
                reactive.currentValues?.patient_dateOfBirth;
    
    if (dob && typeof dob === 'string') {
      const birthDate = new Date(dob);
      const today = new Date();
      const monthDiff = (today.getFullYear() - birthDate.getFullYear()) * 12 + 
                        (today.getMonth() - birthDate.getMonth());
      ageMonths = Math.max(0, monthDiff);
      console.log(`[AI API] Calculated age from DOB ${dob}: ${ageMonths} months`);
    }
  }
  
  // Extract patient context
  const patientContext: PatientContext = {
    ageMonths,
    weightKg: (reactive.currentValues?.weight as number) ||
              (reactive.currentValues?.patient_weight_kg as number) ||
              (reactive.calculated?.weight as number),
    gender: reactive.currentValues?.patient_gender as string
  };
  
  // Build schema context from current values
  const dangerSignsFound = Object.entries(reactive.currentValues || {})
    .filter(([k, v]) => 
      TRIGGER_FIELDS.danger_signs.includes(k) && v === true
    )
    .map(([k]) => k);
  
  const schema: SchemaContext = {
    section: reactive.schemaId || 'triage',
    relevantFields: [],
    clinicalNotes: [],
    triageLogic: [],
    dangerSigns: dangerSignsFound
  };
  
  // Build payload with session metadata
  const payload: AIPayload = {
    // Session metadata (per JSON schema)
    sessionId: reactive.sessionId,
    schemaId: reactive.schemaId,
    formId: reactive.formId,
    
    // Request tracking
    requestId,
    timestamp,
    
    // Core clinical data
    schema,
    patientContext,
    currentValues: reactive.currentValues,
    systemResult,
    
    // AI interaction - format inconsistencies with full details
    inconsistencies: reactive.inconsistencies?.map(i => {
      const severity = i.severity?.toUpperCase() || 'WARNING';
      return `[${severity}] ${i.field}: ${i.message} (Expected: ${i.expected})`;
    }) || [],
    previousAI: reactive.previousAI,
    
    // Default config (can be overridden)
    config: {
      temperature: 0.2,
      maxTokens: 300,
      stream: false
    }
  };
  
  return {
    useCase: promptType,
    payload
  };
}

// Trigger field lists (copied for schema context)
const TRIGGER_FIELDS = {
  danger_signs: [
    'unable_to_drink', 'lethargic_or_unconscious', 'convulsing',
    'cyanosis', 'severe_distress', 'stridor', 'burns', 'bleeding',
    'poisoning', 'trauma'
  ],
  vital_signs: [
    'respiratory_rate', 'oxygen_saturation', 'heart_rate',
    'temperature', 'weight', 'height'
  ],
  imci_fields: [
    'fast_breathing', 'chest_indrawing', 'wheezing', 'crackles',
    'stridor_in_calm', 'diarrhoea_duration', 'blood_in_stool',
    'dehydration_status', 'malnutrition_status', 'edema'
  ]
};

// ============================================================================
// SAFETY CONFIGURATION
// ============================================================================

const BLOCKED_PATTERNS = /prescribe|prescription|take dose|mg\/kg|mg per|ml\/kg|inject|iv drip|antibiotic prescription|diagnosis of|diagnosed with|treat with|give.*medicine|recommend.*drug/i;

const DANGEROUS_TERMS = /will die|certainly|definitely|guaranteed|no risk|100% sure/i;

const MAX_RESPONSE_LENGTH = 2000;

// ============================================================================
// MAIN HANDLER
// ============================================================================

export default defineEventHandler(async (event): Promise<AIResponse> => {
  const rawBody = await readBody(event);
  const config = useRuntimeConfig();
  const startTime = Date.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.min(config.aiTimeout || 30000, 30000));

  try {
    // Normalize body to AIRequest format
    const body = normalizeToAIRequest(rawBody);
    
    // Build structured prompt based on payload type
    const prompt = buildStructuredPrompt(body);
    
    // Call Ollama
    const res = await $fetch<{ response: string }>(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${config.medgemmaApiKey}`,
        'Content-Type': 'application/json'
      },
      body: {
        model: config.ollamaModel || 'gemma3:4b',
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 512,
          top_k: 10,
          top_p: 0.9
        }
      }
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    // Parse structured response
    const parsed = parseStructuredResponse(res.response);
    
    // Validate and filter
    const safetyResult = validateSafety(parsed.explanation);
    const safetyFlags = [...parsed.safetyFlags];
    
    if (!safetyResult.allowed) {
      safetyFlags.push('OUTPUT_BLOCKED');
    }

    // Check for prescription patterns in all text fields
    if (hasPrescriptionLanguage(parsed)) {
      safetyFlags.push('CLINICAL_VIOLATION');
    }

    // Build response
    const response: AIResponse = {
      explanation: parsed.explanation,
      inconsistencies: parsed.inconsistencies,
      teachingNotes: parsed.teachingNotes,
      nextSteps: parsed.nextSteps,
      confidence: parsed.confidence,
      modelVersion: config.ollamaModel || 'gemma3:4b',
      timestamp: new Date().toISOString(),
      ruleIds: body.payload?.systemResult?.ruleIds || [],
      safetyFlags
    };

    // Log audit (fire and forget)
    logAudit({
      ...body,
      response,
      responseTime,
      inputTokens: estimateTokens(prompt),
      outputTokens: estimateTokens(res.response)
    }).catch(err => console.error('[AI Audit] Failed:', err));

    return response;
  } catch (e) {
    clearTimeout(timeoutId);
    console.error('[AI API] Ollama error:', e);
    
    // Return fallback response on error
    return buildFallbackResponse(e);
  }
});

// ============================================================================
// STRUCTURED PROMPT BUILDER
// ============================================================================

function buildStructuredPrompt(body: AIRequest): string {
  const systemPrompt = `You are MedGemma, a clinical explainability assistant for HealthBridge.
You help nurses understand WHY clinical decisions were made following WHO IMCI guidelines.

## YOUR ROLE
- Explain clinical findings in simple terms
- Identify potential inconsistencies between data and classification
- Provide educational teaching points
- Suggest next steps for the nurse
- NEVER: diagnose, prescribe, or change triage classification

## OUTPUT FORMAT
You MUST output a valid JSON object with these fields:
{
  "explanation": "Brief explanation of why this triage priority (2-3 sentences)",
  "inconsistencies": ["List any conflicts between data and priority, or empty array"],
  "teachingNotes": ["One clinical teaching point"],
  "nextSteps": ["2 immediate nurse actions"],
  "confidence": 0.0-1.0
}

## RULES
- Always output valid JSON (no markdown code blocks)
- Max 200 words total
- Reference specific findings from the data
- Use simple, non-technical language
- If unsure about something, express appropriate uncertainty`;

  const payload = body.payload;
  
  // Build context sections
  let prompt = `${systemPrompt}\n\n`;

  // Schema context
  if (payload?.schema) {
    prompt += `## IMCI SCHEMA CONTEXT\n`;
    prompt += `Section: ${payload.schema.section || 'General'}\n`;
    
    if (payload.schema.clinicalNotes && payload.schema.clinicalNotes.length) {
      prompt += `Clinical Notes: ${payload.schema.clinicalNotes.join(', ')}\n`;
    }
    
    if (payload.schema.triageLogic && payload.schema.triageLogic.length) {
      prompt += `Triage Logic: ${payload.schema.triageLogic.join(', ')}\n`;
    }
    
    if (payload.schema.dangerSigns && payload.schema.dangerSigns.length) {
      prompt += `Danger Signs: ${payload.schema.dangerSigns.join(', ')}\n`;
    }
    
    prompt += '\n';
  }

  // Patient context
  if (payload?.patientContext) {
    prompt += `## PATIENT CONTEXT\n`;
    prompt += `Age: ${payload.patientContext.ageMonths} months\n`;
    if (payload.patientContext.weightKg) {
      prompt += `Weight: ${payload.patientContext.weightKg} kg\n`;
    }
    if (payload.patientContext.gender) {
      prompt += `Gender: ${payload.patientContext.gender}\n`;
    }
    prompt += '\n';
  }

  // Current values
  if (payload?.currentValues) {
    prompt += `## NURSE-ENTERED DATA\n`;
    prompt += formatValuesForPrompt(payload.currentValues);
    prompt += '\n';
  }

  // System result
  if (payload?.systemResult) {
    prompt += `## SYSTEM CALCULATION\n`;
    prompt += `Priority: ${payload.systemResult.priority.toUpperCase()}\n`;
    prompt += `Actions: ${payload.systemResult.actions.join(', ')}\n`;
    if (payload.systemResult.ruleIds && payload.systemResult.ruleIds.length) {
      prompt += `Applied Rules: ${payload.systemResult.ruleIds.join(', ')}\n`;
    }
    prompt += '\n';
  }

  // CRITICAL: Inconsistencies detected by the system
  if (payload?.inconsistencies && payload.inconsistencies.length > 0) {
    prompt += `## ⚠️ CRITICAL INCONSISTENCIES DETECTED\n`;
    prompt += `The following inconsistencies were found between the nurse-entered data and the assigned triage priority.\n`;
    prompt += `YOU MUST ADDRESS THESE INCONSISTENCIES IN YOUR RESPONSE:\n\n`;
    
    for (let i = 0; i < payload.inconsistencies.length; i++) {
      const inconsistency = payload.inconsistencies[i];
      prompt += `${i + 1}. ${inconsistency}\n`;
    }
    prompt += '\n';
    prompt += `These inconsistencies suggest the triage priority may be INCORRECT.\n`;
    prompt += `Explain why this is a problem and what the nurse should do.\n\n`;
  }

  // Task-specific instructions
  prompt += `## TASK: ${body.useCase}\n`;
  prompt += getUseCaseInstructions(body.useCase);
  prompt += '\n\nOUTPUT JSON ONLY:';

  return prompt;
}

function getUseCaseInstructions(useCase: string): string {
  const EXPLAIN_TRIAGE = `Focus on WHY this priority was assigned based on the observed findings.
Explain what triggered each classification factor.
Note any inconsistencies between entered data and calculated priority.
Suggest 2 immediate next steps for the nurse.`;

  const INCONSISTENCY_CHECK = `CRITICAL: You are analyzing a potential triage error.
The system has detected inconsistencies between the clinical findings and the assigned priority.
YOU MUST:
1. Clearly explain WHY the current priority may be incorrect
2. Reference the specific danger signs or clinical findings that contradict the priority
3. Explain the clinical significance - what harm could result if this is not corrected
4. Provide clear next steps for the nurse to verify and correct if needed

If danger signs are present with a GREEN priority, this is a CRITICAL error requiring immediate attention.
Be direct and specific about the risk to the patient.`;

  const CARE_EDUCATION = `Explain what the findings mean for caregiver education.
Describe warning signs that need immediate return.
Focus on home care and comfort measures.
Do NOT give medication instructions.`;

  const CLINICAL_HANDOVER = `Summarize for another healthcare provider.
Include: chief complaint, key findings, triage classification.
Be clinically precise and concise.
Do NOT add new conclusions.`;

  const NOTE_SUMMARY = `Generate a brief encounter summary for the medical record.
Include only documented information.
Be professional and concise.
Do NOT infer information not present.`;

  const REACTIVE_GUIDANCE = `A nurse has just updated a clinical field.
Provide immediate, concise guidance about:
1. What this finding means clinically
2. Any inconsistencies with the current triage priority
3. What the nurse should do next
4. Educational point if relevant

Keep response under 100 words. Focus on the most recent change.`;

  switch (useCase) {
    case 'EXPLAIN_TRIAGE':
      return EXPLAIN_TRIAGE;
    case 'INCONSISTENCY_CHECK':
      return INCONSISTENCY_CHECK;
    case 'CARE_EDUCATION':
      return CARE_EDUCATION;
    case 'CLINICAL_HANDOVER':
      return CLINICAL_HANDOVER;
    case 'NOTE_SUMMARY':
      return NOTE_SUMMARY;
    case 'REACTIVE_GUIDANCE':
      return REACTIVE_GUIDANCE;
    default:
      return EXPLAIN_TRIAGE;
  }
}

function formatValuesForPrompt(values: Record<string, unknown>): string {
  const lines: string[] = [];
  
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) {
      const formattedValue = typeof value === 'boolean' 
        ? (value ? 'YES' : 'NO')
        : String(value);
      lines.push(`- ${key}: ${formattedValue}`);
    }
  }
  
  return lines.join('\n');
}

// ============================================================================
// RESPONSE PARSER
// ============================================================================

interface ParsedAIResponse {
  explanation: string;
  inconsistencies: string[];
  teachingNotes: string[];
  nextSteps: string[];
  confidence: number;
  safetyFlags: string[];
}

function parseStructuredResponse(rawResponse: string): ParsedAIResponse {
  // Try to extract JSON from response
  let jsonStr = rawResponse.trim();
  
  // Remove markdown code blocks if present
  jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
  jsonStr = jsonStr.replace(/```\n?/g, '');
  
  try {
    // Try direct JSON parse
    const parsed = JSON.parse(jsonStr);
    return {
      explanation: parsed.explanation || 'Unable to generate explanation.',
      inconsistencies: Array.isArray(parsed.inconsistencies) ? parsed.inconsistencies : [],
      teachingNotes: Array.isArray(parsed.teachingNotes) ? parsed.teachingNotes : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
      safetyFlags: []
    };
  } catch {
    // Fallback: try to extract fields using regex patterns
    return extractFromText(rawResponse);
  }
}

function extractFromText(text: string): ParsedAIResponse {
  const result: ParsedAIResponse = {
    explanation: '',
    inconsistencies: [],
    teachingNotes: [],
    nextSteps: [],
    confidence: 0.5,
    safetyFlags: ['FALLBACK_PARSING']
  };

  // Extract explanation (first substantial paragraph)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 20);
  if (paragraphs.length > 0) {
    const firstPara = paragraphs[0];
    if (firstPara) {
      const cleanPara = firstPara.replace(/^(EXPLANATION|Why|Note):?\s*/i, '').trim();
      result.explanation = cleanPara;
    }
  }

  // Extract next steps (look for numbered lists or bullet points)
  const nextStepsMatch = text.match(/(?:NEXT STEPS|Steps?|Actions?)[:\n]([\s\S]*?)(?:TEACHING|$)/i);
  if (nextStepsMatch && nextStepsMatch[1]) {
    const steps = nextStepsMatch[1]
      .split(/(?:\d+[\.\)]\s*|[-•]\s*)/)
      .filter(s => s.trim().length > 5);
    result.nextSteps = steps.slice(0, 3).map(s => s.trim());
  }

  // Extract teaching notes
  const teachingMatch = text.match(/(?:TEACHING|NOTE|Remember)[:\n]([\s\S]*?)(?:NEXT|$)/i);
  if (teachingMatch && teachingMatch[1]) {
    result.teachingNotes = [teachingMatch[1].trim().slice(0, 200)];
  }

  // Try to extract confidence
  const confidenceMatch = text.match(/confidence[:\s]*([0-9](?:\.[0-9])?)/i);
  if (confidenceMatch && confidenceMatch[1]) {
    result.confidence = parseFloat(confidenceMatch[1]);
  }

  // Extract inconsistencies
  const inconsistencyMatch = text.match(/inconsistencies?[:\n]([\s\S]*?)(?:teaching|next|$)/i);
  if (inconsistencyMatch && inconsistencyMatch[1]) {
    const issues = inconsistencyMatch[1]
      .split(/(?:\d+[\.\)]\s*|[-•]\s*)/)
      .filter(s => s.trim().length > 5);
    result.inconsistencies = issues.map(s => s.trim());
  }

  // If still no explanation, use the whole text
  if (!result.explanation) {
    result.explanation = text.slice(0, 300);
  }

  return result;
}

// ============================================================================
// SAFETY FUNCTIONS
// ============================================================================

function validateSafety(text: string): { allowed: boolean; reason?: string } {
  if (BLOCKED_PATTERNS.test(text)) {
    return {
      allowed: false,
      reason: 'Output contains prescription or treatment language'
    };
  }

  if (DANGEROUS_TERMS.test(text)) {
    return {
      allowed: false,
      reason: 'Output contains overly certain language'
    };
  }

  if (text.length > MAX_RESPONSE_LENGTH) {
    return {
      allowed: false,
      reason: `Output exceeds maximum length (${MAX_RESPONSE_LENGTH} chars)`
    };
  }

  return { allowed: true };
}

function hasPrescriptionLanguage(parsed: ParsedAIResponse): boolean {
  const allText = [
    parsed.explanation,
    ...parsed.inconsistencies,
    ...parsed.teachingNotes,
    ...parsed.nextSteps
  ].join(' ').toLowerCase();

  return BLOCKED_PATTERNS.test(allText);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

interface AuditData {
  useCase: string;
  payload?: AIPayload;
  response: AIResponse;
  responseTime: number;
  inputTokens: number;
  outputTokens: number;
}

async function logAudit(data: AuditData): Promise<void> {
  // This would integrate with your existing audit system
  const auditEntry = {
    id: generateAuditId(),
    timestamp: new Date().toISOString(),
    useCase: data.useCase,
    sessionId: data.payload?.systemResult?.ruleIds?.[0] ?? 'unknown',
    modelVersion: data.response.modelVersion,
    responseTime: data.responseTime,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    confidence: data.response.confidence,
    safetyFlags: data.response.safetyFlags
  };

  console.log('[AI Audit]', JSON.stringify(auditEntry));
  
  // TODO: Integrate with existing audit service
  // await auditLogger.logAIGuidance(auditEntry);
}

function generateAuditId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
}

function buildFallbackResponse(error: unknown): AIResponse {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  
  return {
    explanation: 'AI guidance is currently unavailable. Please proceed with standard clinical protocols.',
    inconsistencies: [],
    teachingNotes: ['When AI is unavailable, rely on WHO IMCI guidelines and clinical judgment.'],
    nextSteps: [
      'Continue with standard triage protocol',
      'Consult clinical protocols as needed'
    ],
    confidence: 0,
    modelVersion: 'fallback',
    timestamp: new Date().toISOString(),
    ruleIds: [],
    safetyFlags: ['AI_UNAVAILABLE', errorMessage]
  };
}
