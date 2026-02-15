import { useRuntimeConfig } from '#app';
import type { AIUseCase, ExplainabilityRecord } from '~/types/explainability';
import { isAIEnabled } from './aiConfig';

// ============================================================================
// Schema Types for Dynamic Constraint Resolution
// ============================================================================

interface PromptSection {
  id: string;
  title: string;
  goal: string;
  instruction: string;
  requiredContext: string[];
  maxWords: number;
  outputFormat?: string;
  guardrails?: string;
  cumulative: boolean;
  summaryInstruction?: string;
}

interface PromptSchema {
  schemaId: string;
  version: string;
  description?: string;
  systemGuardrails: string;
  fieldLabels: Record<string, string>;
  sections: PromptSection[];
  fallbackSection: PromptSection;
}

interface ConstraintResolution {
  sectionId: string;
  systemGuardrails: string;
  instruction: string;
  maxWords: number;
  outputFormat?: string;
  guardrails?: string;
  summaryInstruction?: string;
  requiredContext: string[];
  goal: string;
}

// ============================================================================
// Schema Cache and Loading
// ============================================================================

// Support multiple schemas (assessment and treatment)
const cachedSchemas: Map<string, PromptSchema> = new Map();
const schemaLoadErrors: Map<string, Error> = new Map();

/**
 * Load schema from JSON file - caches result for performance
 * Supports both assessment and treatment schemas
 */
async function loadSchema(schemaId: string = 'peds_respiratory'): Promise<PromptSchema> {
  // Check cache first
  const cached = cachedSchemas.get(schemaId);
  if (cached) {
    return cached;
  }
  
  // Check for previous load error
  const loadError = schemaLoadErrors.get(schemaId);
  if (loadError) {
    throw loadError;
  }
  
  try {
    let schemaModule: { default: PromptSchema };
    
    // Load the appropriate schema based on schemaId
    if (schemaId === 'peds_respiratory_treatment') {
      schemaModule = await import('~/schemas/prompts/peds_respiratory_treatment_schema.json');
    } else {
      // Default to assessment schema
      schemaModule = await import('~/schemas/prompts/peds_respiratory_schema.json');
    }
    
    const schema = schemaModule.default as PromptSchema;
    cachedSchemas.set(schemaId, schema);
    console.log(`[SchemaLoader] Loaded schema: ${schema.schemaId} v${schema.version}, sections: ${schema.sections.length}`);
    return schema;
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error loading schema');
    schemaLoadErrors.set(schemaId, err);
    console.error(`[SchemaLoader] Failed to load schema "${schemaId}": ${err.message}`);
    throw err;
  }
}

/**
 * Clear schema cache (useful for testing or hot reload)
 */
export function clearSchemaCache(schemaId?: string): void {
  if (schemaId) {
    cachedSchemas.delete(schemaId);
    schemaLoadErrors.delete(schemaId);
    console.log(`[SchemaLoader] Cache cleared for: ${schemaId}`);
  } else {
    cachedSchemas.clear();
    schemaLoadErrors.clear();
    console.log('[SchemaLoader] All caches cleared');
  }
}

// ============================================================================
// Dynamic Constraint Resolution
// ============================================================================

/**
 * Resolve constraints for a specific section from the schema
 * Implements precedence: section-specific > fallback > global
 */
export async function resolveSectionConstraints(
  sectionId: string | undefined,
  schemaId: string = 'peds_respiratory'
): Promise<ConstraintResolution> {
  const schema = await loadSchema(schemaId);
  
  // Find matching section (or use fallback)
  const section = schema.sections.find(s => s.id === sectionId) || schema.fallbackSection;
  
  // Build constraint resolution with precedence
  const resolution: ConstraintResolution = {
    sectionId: section.id,
    systemGuardrails: schema.systemGuardrails,
    instruction: section.instruction,
    maxWords: section.maxWords,
    outputFormat: section.outputFormat,
    guardrails: section.guardrails,
    summaryInstruction: section.summaryInstruction,
    requiredContext: section.requiredContext,
    goal: section.goal
  };
  
  console.log(`[Constraints] Resolved for section "${sectionId || 'unknown'}": maxWords=${resolution.maxWords}, guardrails=${!!resolution.guardrails}`);
  
  return resolution;
}

/**
 * Format patient age for display
 */
function formatPatientAge(months: number): string {
  if (months < 12) {
    return `${months} month${months !== 1 ? 's' : ''} old`;
  }
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (remainingMonths === 0) {
    return `${years} year${years !== 1 ? 's' : ''} old`;
  }
  return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''} old`;
}

/**
 * Build comprehensive SYSTEM_GUARDRAILS from resolved constraints
 * Combines global guardrails with section-specific rules and patient context
 */
export function buildSystemGuardrails(
  constraints: ConstraintResolution,
  patient?: StreamingContext['patient']
): string {
  const parts: string[] = [];
  
  // Add patient context first
  if (patient) {
    parts.push('=== PATIENT CONTEXT ===');
    const ageFormatted = patient.ageMonths ? formatPatientAge(patient.ageMonths) : 'age not specified';
    parts.push(`- Age: ${ageFormatted}`);
    if (patient.weightKg) {
      parts.push(`- Weight: ${patient.weightKg} kg`);
    }
    if (patient.gender) {
      parts.push(`- Gender: ${patient.gender}`);
    }
    if (patient.triagePriority) {
      parts.push(`- Current Triage: ${patient.triagePriority}`);
    }
    parts.push('');
  }
  
  // Start with global system guardrails
  parts.push(constraints.systemGuardrails);
  
  // Add section-specific instruction as context
  parts.push('');
  parts.push(`=== CURRENT SECTION: ${constraints.sectionId.toUpperCase()} ===`);
  parts.push(`GOAL: ${constraints.goal}`);
  parts.push('');
  parts.push(`INSTRUCTION: ${constraints.instruction}`);
  
  // Add output constraints
  parts.push('');
  parts.push(`OUTPUT REQUIREMENTS:`);
  parts.push(`- Maximum ${constraints.maxWords} words`);
  if (constraints.outputFormat) {
    parts.push(`- Format: ${constraints.outputFormat}`);
  }
  parts.push('- Never repeat the same information');
  
  // Add section-specific guardrails if present
  if (constraints.guardrails) {
    parts.push('');
    parts.push(`SECTION GUARDRAILS: ${constraints.guardrails}`);
  }
  
  // Add summary instruction if cumulative
  if (constraints.summaryInstruction) {
    parts.push('');
    parts.push(`SUMMARY REQUIREMENT: At the end of your response, include "SUMMARY: <one sentence>"`);
  }
  
  return parts.join('\n');
}

// ============================================================================
// Streaming Context with Dynamic Constraints
// ============================================================================

export interface StreamingContext {
  sessionId: string;
  schemaId: string;
  formId?: string;
  sectionId?: string;
  cumulativeSummary?: string;
  patient?: {
    ageMonths: number;
    weightKg: number;
    gender: string;
    triagePriority?: string;
  };
  assessment?: {
    answers: Record<string, unknown>;
  };
  /** Optional pre-resolved constraints (if client already resolved them) */
  constraints?: ConstraintResolution;
}

// ============================================================================
// Legacy Prompt Building (for backward compatibility)
// ============================================================================

const SYSTEM_GUARDRAILS = `You are MedGemma, a senior clinical decision support specialist for HealthBridge, working alongside nurses as their experienced clinical colleague. Your role is to provide thoughtful, context-aware explanations that help nurses understand the complete clinical picture and feel confident in your decisions.

Think Holistically First
Before offering any guidance, pause and consider the complete patient story - their age, sex, presenting complaints, danger signs, nutritional status, vaccination history, and any additional concerns the caregiver mentions. Each piece of information connects to the others, and the right clinical judgment emerges from understanding how these factors interact.

Provide Natural, Conversational Explanations
Speak as a knowledgeable colleague would, using flowing prose rather than structured templates or repetitive formatting. Explain the reasoning behind recommendations naturally, as if you were discussing the case with another nurse during a hand-off.

Connect Information Thoughtfully
When multiple clinical factors are present, explain how they relate to each other. If a patient presents with a RED triage classification, acknowledge the urgency clearly but also help the nurse understand what specific elements in the history and examination drove that classification.

Offer Clear, Actionable Guidance
Your recommendations should feel like practical next steps from a trusted colleague who understands the realities of nursing practice. Include what to monitor for, when to escalate, and what to communicate to caregivers.

Avoid
- Robotic or repetitive phrasing
- Copy-pasting protocol language without contextual explanation
- Focusing only on triage color codes
- Excessive bullet points or numbered lists
- Redundant information across multiple paragraphs`;

export function buildClinicalAIPrompt(useCase: AIUseCase, explainability: ExplainabilityRecord): string {
  // Format patient age for display
  const formatAge = (months: number): string => {
    if (months < 12) {
      return `${months} month${months !== 1 ? 's' : ''} old`;
    }
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (remainingMonths === 0) {
      return `${years} year${years !== 1 ? 's' : ''} old`;
    }
    return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''} old`;
  };

  // Get patient age from classification context if available
  const classificationAny = explainability.classification as Record<string, unknown>;
  const patientAgeMonths = classificationAny.patientAgeMonths as number | undefined;
  const patientAgeFormatted = patientAgeMonths ? formatAge(patientAgeMonths) : 'age not specified';

  const baseContext = `${SYSTEM_GUARDRAILS}

PATIENT CONTEXT:
- Patient Age: ${patientAgeFormatted}

CLINICAL ASSESSMENT DATA:
Triage Priority: ${explainability.classification.priority.toUpperCase()} (${explainability.classification.label})
Protocol: ${explainability.classification.protocol}
Clinical Reasoning: ${explainability.reasoning.clinicalNarrative}

Key Findings:
${explainability.reasoning.triggers.map(t => `- ${t.value}: ${t.clinicalMeaning}`).join('\n')}

Recommended Actions:
${explainability.recommendedActions.map(a => `- ${a.label}: ${a.justification}`).join('\n')}

Safety Considerations:
${explainability.safetyNotes.join('\n')}

Current assessment context:
`;

  switch (useCase) {
    case 'EXPLAIN_TRIAGE':
      return `${baseContext}
Help the nurse understand the complete clinical picture behind this triage classification. Connect the dots between the assessment findings and the priority assigned.`;

    case 'CARE_EDUCATION':
      return `${baseContext}
Help the nurse prepare to communicate with the caregiver. Explain what findings are most important to convey, what warning signs should prompt a return visit, and how to frame care instructions.`;

    case 'CLINICAL_HANDOVER':
      return `${baseContext}
Prepare a clinical handover summary for another healthcare provider. Include key story elements, assessment findings, and important context.`;

    case 'NOTE_SUMMARY':
      return `${baseContext}
Generate a brief, clinically-focused note summarizing this encounter.`;

    case 'INCONSISTENCY_CHECK':
      return `${baseContext}
Review the assessment data for any internal contradictions or gaps.`;

    case 'SUGGEST_ACTIONS':
      return `${baseContext}
Think through practical next steps for this patient right now.`;

    default:
      return `${baseContext}
Provide thoughtful clinical guidance.`;
  }
}

// ============================================================================
// AI Service Functions
// ============================================================================

const BLOCKED_PATTERNS = /prescribe|prescription|take dose|mg\/kg|mg per|ml\/kg|inject|iv drip|antibiotic prescription|diagnosis of|diagnosed with|treat with|give.*medicine|recommend.*drug/i;

const DANGEROUS_TERMS = /will die|certainly|definitely|guaranteed|no risk/i;

function validateAIOutput(text: string): { allowed: boolean; reason?: string } {
  if (BLOCKED_PATTERNS.test(text)) {
    return { allowed: false, reason: 'Output contains prescription or treatment language' };
  }
  if (DANGEROUS_TERMS.test(text)) {
    return { allowed: false, reason: 'Output contains overly certain language' };
  }
  if (text.length > 2000) {
    return { allowed: false, reason: 'Output exceeds maximum length' };
  }
  return { allowed: true };
}

export async function askClinicalAI(
  useCase: AIUseCase,
  explainability: ExplainabilityRecord,
  options: { timeout?: number } = {}
): Promise<string> {
  if (!isAIEnabled(useCase)) {
    throw new Error('AI feature is currently disabled');
  }

  const config = useRuntimeConfig();
  const startTime = Date.now();
  const timeout = options.timeout || 30000;
  const authToken = config.public.aiAuthToken as string;

  const prompt = buildClinicalAIPrompt(useCase, explainability);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-token': authToken
      },
      body: JSON.stringify({
        useCase,
        payload: explainability
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ClinicalAI] API error:', errorText);
      throw new Error('AI service temporarily unavailable');
    }

    const data = await response.json();
    const text = data.answer as string;

    if (data.safetyFlags?.includes('CLINICAL_VIOLATION') || data.safetyFlags?.includes('OUTPUT_BLOCKED')) {
      throw new Error('AI output could not be safely generated');
    }

    const duration = Date.now() - startTime;
    console.log(`[ClinicalAI] Response generated in ${duration}ms`);

    return text.trim();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI request timed out');
    }
    throw error;
  }
}

// ============================================================================
// Streaming AI with Dynamic Constraints
// ============================================================================

interface StreamingCallbacks {
  onChunk: (chunk: string) => void;
  onProgress: (tokens: number, total: number) => void;
  onComplete: (fullResponse: string, duration: number, summary?: string, structured?: StructuredResponse) => void;
  onError: (error: string, recoverable: boolean) => void;
  onCancel?: () => void;
}

/**
 * Structured AI Response (Phase 1)
 */
export interface StructuredResponse {
  explanation: string;
  inconsistencies: string[];
  teachingNotes: string[];
  nextSteps: string[];
  confidence: number;
  modelVersion: string;
  timestamp: string;
  ruleIds: string[];
  safetyFlags: string[];
}

export interface StreamingAuditEntry {
  requestId: string;
  useCase: string;
  mode: 'stream' | 'fallback';
  status: 'started' | 'chunk' | 'complete' | 'error' | 'cancelled';
  timestamp: string;
  tokens?: number;
  totalTokens?: number;
  duration?: number;
  error?: string;
}

const auditLog: StreamingAuditEntry[] = [];

export function getAuditLog(): StreamingAuditEntry[] {
  return [...auditLog];
}

export function clearAuditLog(): void {
  auditLog.length = 0;
}

/**
 * Stream clinical AI response with dynamic schema-based constraints
 * Loads constraints from peds_respiratory_schema.json and resolves based on sectionId
 */
export async function streamClinicalAI(
  useCase: AIUseCase,
  explainability: ExplainabilityRecord | StreamingContext,
  callbacks: StreamingCallbacks,
  options: { timeout?: number; sessionId?: string; schemaId?: string; formId?: string } = {}
): Promise<{ requestId: string; cancel: () => void; mode: 'stream' | 'fallback' }> {
  if (!isAIEnabled(useCase)) {
    callbacks.onError('AI feature is currently disabled', false);
    throw new Error('AI feature is currently disabled');
  }

  const config = useRuntimeConfig();
  const startTime = Date.now();
  const timeout = options.timeout || 60000;
  const requestId = options.sessionId 
    ? `${options.sessionId}_${Date.now()}`
    : `stream_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  
  const auditEntry: StreamingAuditEntry = {
    requestId,
    useCase,
    mode: 'stream',
    status: 'started',
    timestamp: new Date().toISOString()
  };
  auditLog.push(auditEntry);
  
  console.log(`[AI Stream] 📡 Streaming started - requestId: ${requestId}`);
  console.log(`[AI Stream]    UseCase: ${useCase}`);
  console.log(`[AI Stream]    Schema: ${options.schemaId || 'default'}`);
  console.log(`[AI Stream]    Section: ${options.formId || 'N/A'}`);

  // Build request body - use dynamic constraints for StreamingContext
  let body: Record<string, unknown>;
  
  if ('cumulativeSummary' in explainability) {
    const ctx = explainability as StreamingContext;
    const schemaId = ctx.schemaId || options.schemaId || 'peds_respiratory';
    
    // Resolve constraints dynamically from schema
    const constraints = await resolveSectionConstraints(ctx.sectionId, schemaId);
    const systemGuardrails = buildSystemGuardrails(constraints, ctx.patient);
    
    body = {
      requestId,
      useCase,
      sessionId: ctx.sessionId,
      schemaId,
      formId: ctx.formId,
      sectionId: ctx.sectionId,
      cumulativeSummary: ctx.cumulativeSummary,
      patient: ctx.patient,
      assessment: ctx.assessment ? { answers: ctx.assessment.answers } : undefined,
      timestamp: new Date().toISOString(),
      // Inject dynamic constraints as prompt
      prompt: systemGuardrails,
      // Also send raw constraints for server reference
      constraints: {
        sectionId: constraints.sectionId,
        maxWords: constraints.maxWords,
        outputFormat: constraints.outputFormat,
        guardrails: constraints.guardrails,
        summaryInstruction: constraints.summaryInstruction,
        requiredContext: constraints.requiredContext
      }
    };
    
    console.log('[MedGemma Debug] Full prompt being sent to MedGemma:');
    console.log('='.repeat(80));
    console.log(body.prompt);
    console.log('='.repeat(80));
    console.log('[MedGemma Debug] Full request body:', JSON.stringify(body, null, 2));
    
    console.log(`[AI Stream] 🎯 Dynamic constraints resolved:`);
    console.log(`[AI Stream]    Section: ${constraints.sectionId}`);
    console.log(`[AI Stream]    MaxWords: ${constraints.maxWords}`);
    console.log(`[AI Stream]    Guardrails: ${constraints.guardrails ? 'yes' : 'no'}`);
  } else {
    // Handle ExplainabilityRecord for legacy prompts
    const prompt = buildClinicalAIPrompt(useCase, explainability as ExplainabilityRecord);
    body = {
      requestId,
      prompt,
      options: {
        temperature: 0.7,
        maxTokens: 500,
        stream: true
      },
      metadata: {
        useCase,
        timestamp: new Date().toISOString(),
        sessionId: options.sessionId,
        schemaId: options.schemaId,
        formId: options.formId
      }
    };
    
    console.log('[MedGemma Debug] Legacy prompt being sent to MedGemma:');
    console.log('='.repeat(80));
    console.log(body.prompt);
    console.log('='.repeat(80));
  }

  let isCancelled = false;
  let chunkCount = 0;
  let fullResponse = '';
  
  const cancel = () => {
    isCancelled = true;
    auditLog.push({
      requestId,
      useCase,
      mode: 'stream',
      status: 'cancelled',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime
    });
    console.log(`[AI Stream] ❌ Streaming cancelled - requestId: ${requestId}`);
    callbacks.onCancel?.();
  };

  try {
    console.log(`[AI Stream] 🔌 Connecting to SSE endpoint...`);
    
    const response = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-token': config.public.aiAuthToken as string,
        'x-request-id': requestId
      },
      body: JSON.stringify(body)
    });

    console.log(`[AI Stream] 📡 SSE response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI Stream] ❌ SSE endpoint error: ${response.status} ${errorText.slice(0, 200)}`);
      return await simulateStreaming(requestId, useCase, startTime, callbacks, body, auditLog);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      if (isCancelled) break;
      
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunkText = decoder.decode(value, { stream: true });
      buffer += chunkText;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            
            switch (event.type) {
              case 'chunk':
                const chunk = event.payload?.chunk || '';
                fullResponse += chunk;
                callbacks.onChunk(chunk);
                callbacks.onProgress(chunkCount, event.payload?.totalLength || 100);
                chunkCount++;
                break;
                
              case 'complete':
                const duration = event.payload?.duration || (Date.now() - startTime);
                const summaryMatch = fullResponse.match(/SUMMARY:\s*(.+)$/m);
                const extractedSummary = summaryMatch ? summaryMatch[1]?.trim() : undefined;
                
                // Phase 1: Extract structured response from server
                const structured: StructuredResponse | undefined = event.payload?.structured ? {
                  explanation: event.payload.structured.explanation || event.payload.explanation || fullResponse,
                  inconsistencies: event.payload.structured.inconsistencies || event.payload.inconsistencies || [],
                  teachingNotes: event.payload.structured.teachingNotes || event.payload.teachingNotes || [],
                  nextSteps: event.payload.structured.nextSteps || event.payload.nextSteps || [],
                  confidence: event.payload.structured.confidence || event.payload.confidence || 0.8,
                  modelVersion: event.payload.structured.modelVersion || event.payload.modelVersion || 'unknown',
                  timestamp: event.payload.structured.timestamp || new Date().toISOString(),
                  ruleIds: event.payload.structured.ruleIds || event.payload.ruleIds || [],
                  safetyFlags: event.payload.structured.safetyFlags || event.payload.safetyFlags || []
                } : undefined;
                
                if (structured) {
                  console.log(`[AI Stream] 📊 Structured response received: inconsistencies=${structured.inconsistencies.length}, teachingNotes=${structured.teachingNotes.length}, nextSteps=${structured.nextSteps.length}, confidence=${structured.confidence.toFixed(2)}`);
                }
                
                auditLog.push({
                  requestId,
                  useCase,
                  mode: 'stream',
                  status: 'complete',
                  timestamp: new Date().toISOString(),
                  tokens: chunkCount,
                  duration
                });
                
                console.log(`[AI Stream] ✅ Completed in ${duration}ms, chunks: ${chunkCount}`);
                callbacks.onComplete(fullResponse, duration, extractedSummary, structured);
                return { requestId, cancel, mode: 'stream' };
                
              case 'error':
                const errorMsg = event.payload?.message || 'Unknown error';
                console.error(`[AI Stream] ❌ Error: ${errorMsg}`);
                callbacks.onError(errorMsg, event.payload?.recoverable ?? true);
                throw new Error(errorMsg);
            }
          } catch (err) {
            console.warn(`[AI Stream] ⚠️ Failed to parse SSE data`);
          }
        }
      }
    }
    
    return { requestId, cancel, mode: 'stream' };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log(`[AI Stream] 🔄 SSE failed (${errorMessage}), using fallback...`);
    return await simulateStreaming(requestId, useCase, startTime, callbacks, body, auditLog);
  }
}

/**
 * Fallback simulated streaming when SSE is unavailable
 */
async function simulateStreaming(
  requestId: string,
  useCase: string,
  startTime: number,
  callbacks: StreamingCallbacks,
  body: Record<string, unknown>,
  auditLog: StreamingAuditEntry[]
): Promise<{ requestId: string; cancel: () => void; mode: 'fallback' }> {
  let isCancelled = false;
  let chunkCount = 0;
  let fullResponse = '';
  
  const cancel = () => {
    isCancelled = true;
    callbacks.onCancel?.();
  };
  
  console.log(`[AI Fallback] 📡 Using simulated streaming`);
  
  try {
    const config = useRuntimeConfig();
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-token': config.public.aiAuthToken as string
      },
      body: JSON.stringify({
        useCase,
        payload: body.metadata || body
      })
    });

    if (!response.ok) {
      throw new Error(`AI service error: ${await response.text()}`);
    }

    const data = await response.json();
    const text = data.answer as string;
    
    const chunks = text.split(/(?= )/).slice(0, 10);
    for (const chunk of chunks) {
      if (isCancelled) break;
      
      await new Promise(resolve => setTimeout(resolve, 100));
      fullResponse += chunk;
      chunkCount++;
      
      callbacks.onChunk(chunk);
      callbacks.onProgress(chunkCount, chunks.length);
    }

    const duration = Date.now() - startTime;
    console.log(`[AI Fallback] ✅ Completed in ${duration}ms`);
    
    callbacks.onComplete(fullResponse, duration);
    
    return { requestId, cancel, mode: 'fallback' };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[AI Fallback] ❌ Error: ${errorMessage}`);
    callbacks.onError(errorMessage, false);
    throw error;
  }
}

// ============================================================================
// Service Status
// ============================================================================

export function getAIServiceStatus(): {
  configured: boolean;
  endpoint: string;
  model: string;
} {
  const endpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate';
  const model = process.env.AI_MODEL || 'gemma3:4b';

  return {
    configured: !!endpoint && !!model,
    endpoint,
    model
  };
}

export async function testOllamaConnection(): Promise<{
  success: boolean;
  latency?: number;
  error?: string;
}> {
  const endpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate';

  const startTime = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gemma3:4b',
        prompt: 'test',
        stream: false,
        options: { num_predict: 1 }
      })
    });

    const latency = Date.now() - startTime;

    if (response.ok) {
      return { success: true, latency };
    } else {
      return { success: false, error: 'Connection failed' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
