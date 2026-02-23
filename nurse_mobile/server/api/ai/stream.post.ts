/**
 * AI Streaming Endpoint - Server-Sent Events (SSE)
 * 
 * Server-side streaming endpoint for MedGemma AI responses
 * Uses SSE for real-time streaming to frontend
 * Integrates with Ollama's streaming API
 * Supports cumulative prompt strategy for multi-section assessments
 */

import { H3Event, readBody, createError } from 'h3';
import path from 'node:path';
import fs from 'node:fs/promises';

// Define AIUseCase locally to avoid import issues
type AIUseCase = 
  | 'EXPLAIN_TRIAGE' 
  | 'CARE_EDUCATION' 
  | 'CLINICAL_HANDOVER' 
  | 'NOTE_SUMMARY' 
  | 'GENERAL_INQUIRY'
  | 'INCONSISTENCY_CHECK'
  | 'SUGGEST_ACTIONS'
  | 'TREATMENT_ADVICE'
  | 'CAREGIVER_INSTRUCTIONS'
  | 'CLINICAL_NARRATIVE'
  | 'SECTION_GUIDANCE';  // ← new for section-specific prompts

// ============================================================================
// Type Definitions for Cumulative Prompt Strategy
// ============================================================================

type StreamingEventType = 'connection_established' | 'chunk' | 'progress' | 'complete' | 'error' | 'heartbeat';

interface StreamingEvent {
  type: StreamingEventType;
  requestId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

interface StreamingRequest {
  requestId: string;
  useCase: AIUseCase;
  sessionId: string;
  schemaId: string;
  formId?: string;
  sectionId?: string;
  cumulativeSummary?: string;
  timestamp: string;
  patient?: {
    ageMonths: number;
    weightKg: number;
    gender: string;
    triagePriority?: string;
  };
  assessment?: {
    answers: Record<string, unknown>;
    calculated?: Record<string, unknown>;
  };
  // Support both old format (prompt inside payload) and new format (prompt at top level)
  prompt?: string;
  payload?: {
    prompt?: string;
    context?: Record<string, unknown>;
    config?: StreamingConfig;
  };
  // New format: client-resolved constraints
  constraints?: ClientConstraints;
}

interface StreamingConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  keepAlive?: number;
}

interface OllamaStreamResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// ============================================================================
// Cumulative Prompt Schema Types
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

/**
 * Client-provided constraints (sent from clinicalAI.ts when using dynamic schema loading)
 */
interface ClientConstraints {
  sectionId: string;
  instruction?: string;
  maxWords: number;
  outputFormat?: string;
  guardrails?: string;
  summaryInstruction?: string;
  requiredContext: string[];
}

// ============================================================================
// Configuration
// ============================================================================

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';
const PROMPTS_DIR = path.join(process.cwd(), 'app', 'schemas', 'prompts');

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build SSE event with debug logging
 */
function buildSSEEvent(event: StreamingEvent): string {
  const sseData = `data: ${JSON.stringify(event)}\n\n`;
  console.log(`[AI Stream] SSE Event: ${event.type}, size: ${sseData.length} bytes`);
  return sseData;
}

/**
 * Format patient age in months to human-readable format
 */
function formatPatientAge(months: number): string {
  if (months < 0) return 'age not specified';
  if (months === 0) return 'newborn (0 months)';
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} old`;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (remainingMonths === 0) {
    return `${years} year${years !== 1 ? 's' : ''} old`;
  }
  return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''} old`;
}

/**
 * Parse Ollama stream response with debug logging
 */
function parseOllamaResponse(line: string): OllamaStreamResponse | null {
  if (!line.trim() || line.startsWith(':')) {
    if (line.trim()) {
      console.log(`[AI Stream] Skipping non-JSON line: ${line.slice(0, 50)}...`);
    }
    return null;
  }
  try {
    const parsed = JSON.parse(line) as OllamaStreamResponse;
    console.log(`[AI Stream] JSON parse success: response=${parsed.response?.slice(0, 30)}..., done=${parsed.done}`);
    return parsed;
  } catch (e) {
    console.log(`[AI Stream] JSON parse failed for line: ${line.slice(0, 100)}...`);
    return null;
  }
}

/**
 * Format a value for inclusion in the prompt
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) return 'Not recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ============================================================================
// Structured Response Types (Phase 1)
// ============================================================================

interface StructuredAIResponse {
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

// ============================================================================
// Response Enforcement Functions
// ============================================================================

/**
 * Count words in a string
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Truncate response to maxWords, keeping complete sentences when possible
 */
function truncateToWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  
  // Try to cut at a sentence boundary
  const truncated = words.slice(0, maxWords).join(' ');
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastExclaim = truncated.lastIndexOf('!');
  const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclaim);
  
  if (lastSentenceEnd > maxWords * 0.5) {
    return truncated.slice(0, lastSentenceEnd + 1).trim();
  }
  
  return truncated + '...';
}

/**
 * Enforce maxWords limit with strict truncation
 */
function enforceWordLimit(response: string, maxWords: number, sectionId: string): { response: string; wasTruncated: boolean } {
  const wordCount = countWords(response);
  
  if (wordCount <= maxWords) {
    return { response, wasTruncated: false };
  }
  
  const truncated = truncateToWords(response, maxWords);
  console.log(`[AI Stream] Response for "${sectionId}" exceeded ${maxWords} words (${wordCount}), truncating`);
  
  return { response: truncated, wasTruncated: true };
}

// ============================================================================
// Cumulative Prompt Functions (NEW)
// ============================================================================

/**
 * Load a prompt schema from the prompts directory
 */
async function loadPromptSchema(schemaId: string): Promise<PromptSchema> {
  // Try both filename patterns: 'peds_respiratory.json' and 'peds_respiratory_schema.json'
  const possiblePaths = [
    path.join(PROMPTS_DIR, `${schemaId}.json`),
    path.join(PROMPTS_DIR, `${schemaId}_schema.json`)
  ];
  
  for (const filePath of possiblePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const schema = JSON.parse(content) as PromptSchema;
      console.log(`[AI Stream] Loaded schema: ${schemaId}, version: ${schema.version}, sections: ${schema.sections.length}`);
      return schema;
    } catch (error) {
      // Try next path
    }
  }
  
  console.warn(`[AI Stream] Schema not found: ${schemaId}`);
  throw createError({
    statusCode: 404,
    message: `Prompt schema not found: ${schemaId}`
  });
}

/**
 * Build a section-specific cumulative prompt
 */
function buildSectionPrompt(
  schema: PromptSchema,
  section: PromptSection,
  answers: Record<string, unknown>,
  patient: StreamingRequest['patient'],
  cumulativeSummary?: string
): string {
  const lines: string[] = [];

  // 1. System guardrails
  lines.push(schema.systemGuardrails);
  lines.push('');

  // 2. Previous clinical summary (if cumulative and summary exists)
  if (section.cumulative && cumulativeSummary) {
    lines.push('=== PREVIOUS CLINICAL SUMMARY ===');
    lines.push(cumulativeSummary);
    lines.push('');
  }

  // 3. Patient context (always include basics)
  if (patient) {
    lines.push(`PATIENT: ${formatPatientAge(patient.ageMonths)}, ${patient.weightKg}kg, ${patient.gender}`);
    if (patient.triagePriority) {
      lines.push(`CURRENT TRIAGE PRIORITY: ${patient.triagePriority.toUpperCase()}`);
    }
    lines.push('');
  }

  // 4. Section header and goal
  lines.push(`=== SECTION: ${section.title} ===`);
  lines.push(`GOAL: ${section.goal}`);
  lines.push('');

  // 5. Current section findings (only requiredContext fields, with human labels)
  if (section.requiredContext.length > 0) {
    lines.push('FINDINGS IN THIS SECTION:');
    section.requiredContext.forEach((fieldId) => {
      const value = answers[fieldId];
      const label = schema.fieldLabels[fieldId] || fieldId;
      lines.push(`- ${label}: ${formatValue(value)}`);
    });
    lines.push('');
  }

  // 6. Core instruction
  lines.push('INSTRUCTION:');
  lines.push(section.instruction);
  lines.push('');

  // 7. Output constraints
  lines.push(`Keep your response under ${section.maxWords} words.`);
  if (section.outputFormat) {
    lines.push(`Use ${section.outputFormat}.`);
  }
  lines.push('');

  // 8. Section-specific guardrails
  if (section.guardrails) {
    lines.push(section.guardrails);
    lines.push('');
  }

  // 9. Summary instruction (for cumulative sections)
  if (section.cumulative && section.summaryInstruction) {
    lines.push('IMPORTANT: At the very end of your response, on a new line starting with "SUMMARY:", provide a single sentence that captures the most important clinical takeaway from this section.');
    lines.push(`SUMMARY INSTRUCTION: ${section.summaryInstruction}`);
    lines.push('');
  }

  console.log(`[AI Stream] Built section prompt for "${section.id}": ${lines.length} lines, ~${lines.join('\n').length} chars`);

  return lines.join('\n');
}

/**
 * Build prompt from client-provided constraints
 */
function buildPromptFromConstraints(
  constraints: ClientConstraints,
  answers: Record<string, unknown>,
  patient: StreamingRequest['patient'],
  cumulativeSummary?: string
): string {
  const lines: string[] = [];

  // 1. System guardrails (from schema)
  lines.push('You are MedGemma, a senior clinical decision support specialist for UtanoBridge.');
  lines.push('You are NOT allowed to: diagnose any condition, prescribe medication, recommend specific dosages, change triage classification, or override WHO IMCI rules.');
  lines.push('You may only explain findings, summarise, provide educational information, and suggest when to seek further care.');
  lines.push('All responses must be concise, clear, and clinically appropriate.');
  lines.push('');

  // 2. Previous clinical summary (if cumulative)
  if (cumulativeSummary) {
    lines.push('=== PREVIOUS CLINICAL SUMMARY ===');
    lines.push(cumulativeSummary);
    lines.push('');
  }

  // 3. Patient context
  if (patient) {
    lines.push(`PATIENT: ${formatPatientAge(patient.ageMonths)}, ${patient.weightKg}kg, ${patient.gender}`);
    if (patient.triagePriority) {
      lines.push(`CURRENT TRIAGE PRIORITY: ${patient.triagePriority.toUpperCase()}`);
    }
    lines.push('');
  }

  // 4. Section header
  lines.push(`=== SECTION: ${constraints.sectionId.toUpperCase()} ===`);
  lines.push('');

  // 5. Current findings - for final_summary, include ALL assessment data
  if (constraints.sectionId === 'final_summary') {
    // Include ALL answers for comprehensive report
    lines.push('COMPLETE ASSESSMENT DATA:');
    Object.entries(answers).forEach(([fieldId, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        lines.push(`- ${fieldId}: ${formatValue(value)}`);
      }
    });
    lines.push('');
  } else if (constraints.requiredContext.length > 0) {
    lines.push('FINDINGS IN THIS SECTION:');
    constraints.requiredContext.forEach((fieldId) => {
      const value = answers[fieldId];
      lines.push(`- ${fieldId}: ${formatValue(value)}`);
    });
    lines.push('');
  }

  // 6. Core instruction
  lines.push('INSTRUCTION:');
  lines.push(constraints.instruction || 'Provide section-specific guidance based on the clinical context.');
  lines.push('');

  // 7. Output constraints
  lines.push(`Keep your response under ${constraints.maxWords} words.`);
  if (constraints.outputFormat) {
    lines.push(`Use ${constraints.outputFormat}.`);
  }
  lines.push('Never repeat the same information.');
  lines.push('');

  // 8. Section-specific guardrails
  if (constraints.guardrails) {
    lines.push(`SECTION GUARDRAILS: ${constraints.guardrails}`);
    lines.push('');
  }

  // 9. Summary instruction
  if (constraints.summaryInstruction) {
    lines.push('IMPORTANT: At the very end of your response, on a new line starting with "SUMMARY:", provide a single sentence that captures the most important clinical takeaway.');
    lines.push(`SUMMARY INSTRUCTION: ${constraints.summaryInstruction}`);
  }

  return lines.join('\n');
}

/**
 * Extract the SUMMARY line from AI response
 */
function extractSummary(fullResponse: string): string {
  // Look for SUMMARY: at the end of the response
  const summaryMatch = fullResponse.match(/SUMMARY:\s*(.+)$/m);
  if (summaryMatch && summaryMatch[1]) {
    return summaryMatch[1].trim();
  }
  
  // Fallback: extract the last substantial sentence
  const sentences = fullResponse.split(/[.!?]+/).filter(s => s.trim().length > 20);
  if (sentences.length > 0) {
    const lastSentence = sentences[sentences.length - 1];
    return lastSentence ? lastSentence.trim() : '';
  }
  
  return '';
}

// ============================================================================
// Structured Response Parsing (Phase 1)
// ============================================================================

/**
 * Parse a structured AI response into its components
 * Handles both JSON-formatted and free-text responses
 */
function parseStructuredResponse(
  fullResponse: string,
  modelVersion: string,
  triagePriority?: string
): StructuredAIResponse {
  const timestamp = new Date().toISOString();
  const safetyFlags: string[] = [];
  
  // Try to parse as JSON first (if AI returned structured output)
  const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        explanation: parsed.explanation || parsed.explanation_text || fullResponse,
        inconsistencies: Array.isArray(parsed.inconsistencies) ? parsed.inconsistencies : [],
        teachingNotes: Array.isArray(parsed.teaching_notes) ? parsed.teaching_notes : 
                       Array.isArray(parsed.teachingNotes) ? parsed.teachingNotes : [],
        nextSteps: Array.isArray(parsed.next_steps) ? parsed.next_steps :
                   Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
        modelVersion,
        timestamp,
        ruleIds: Array.isArray(parsed.rule_ids) ? parsed.rule_ids : [],
        safetyFlags
      };
    } catch (e) {
      // JSON parsing failed, fall through to text parsing
      console.log('[AI Stream] JSON parsing failed, using text extraction');
    }
  }
  
  // Extract structured data from free-text response
  const explanation = extractExplanation(fullResponse);
  const inconsistencies = extractInconsistencies(fullResponse);
  const teachingNotes = extractTeachingNotes(fullResponse);
  const nextSteps = extractNextSteps(fullResponse);
  const confidence = calculateConfidence(fullResponse, triagePriority);
  
  return {
    explanation,
    inconsistencies,
    teachingNotes,
    nextSteps,
    confidence,
    modelVersion,
    timestamp,
    ruleIds: [],
    safetyFlags
  };
}

/**
 * Extract main explanation from response
 */
function extractExplanation(text: string): string {
  // Remove any structured markers and get the main content
  let explanation = text
    .replace(/INCONSISTENCIES?:[\s\S]*?(?=TEACHING|$)/gi, '')
    .replace(/TEACHING NOTES?:[\s\S]*?(?=NEXT STEPS?|$)/gi, '')
    .replace(/NEXT STEPS?:[\s\S]*?(?=SUMMARY|$)/gi, '')
    .replace(/SUMMARY:[\s\S]*$/gi, '')
    .trim();
  
  // If explanation is too short, use the original text
  if (explanation.length < 50) {
    explanation = text.split('\n\n')[0] || text;
  }
  
  return explanation.trim();
}

/**
 * Extract inconsistencies from response
 */
function extractInconsistencies(text: string): string[] {
  const inconsistencies: string[] = [];
  
  // Look for INCONSISTENCIES section
  const inconsistencyMatch = text.match(/INCONSISTENCIES?:?\s*([\s\S]*?)(?=TEACHING|NEXT|SUMMARY|$)/i);
  if (inconsistencyMatch && inconsistencyMatch[1]) {
    const lines = inconsistencyMatch[1].trim().split('\n');
    for (const line of lines) {
      const cleaned = line.replace(/^[-•*]\s*/, '').trim();
      if (cleaned && cleaned.length > 5) {
        inconsistencies.push(cleaned);
      }
    }
  }
  
  // Also look for "None detected" or similar
  if (/no\s+(inconsistencies|issues|conflicts|contradictions)/i.test(text)) {
    return [];
  }
  
  return inconsistencies;
}

/**
 * Extract teaching notes from response
 */
function extractTeachingNotes(text: string): string[] {
  const notes: string[] = [];
  
  // Look for TEACHING NOTES section
  const teachingMatch = text.match(/TEACHING\s*NOTES?:?\s*([\s\S]*?)(?=NEXT|SUMMARY|$)/i);
  if (teachingMatch && teachingMatch[1]) {
    const lines = teachingMatch[1].trim().split('\n');
    for (const line of lines) {
      const cleaned = line.replace(/^[-•*]\s*/, '').trim();
      if (cleaned && cleaned.length > 10) {
        notes.push(cleaned);
      }
    }
  }
  
  // Also look for "Clinical note:" or "Note:" patterns
  const noteMatches = text.matchAll(/(?:clinical\s+)?note:\s*([^.]+\.)/gi);
  for (const match of noteMatches) {
    if (match[1] && !notes.includes(match[1].trim())) {
      notes.push(match[1].trim());
    }
  }
  
  return notes;
}

/**
 * Extract next steps from response
 */
function extractNextSteps(text: string): string[] {
  const steps: string[] = [];
  
  // Look for NEXT STEPS section
  const stepsMatch = text.match(/NEXT\s*STEPS?:?\s*([\s\S]*?)(?=SUMMARY|$)/i);
  if (stepsMatch && stepsMatch[1]) {
    const lines = stepsMatch[1].trim().split('\n');
    for (const line of lines) {
      const cleaned = line.replace(/^[-•*]\s*/, '').trim();
      if (cleaned && cleaned.length > 5) {
        steps.push(cleaned);
      }
    }
  }
  
  // Also look for numbered steps
  const numberedMatches = text.matchAll(/^\s*(\d+)\.\s+(.+)$/gm);
  for (const match of numberedMatches) {
    if (match[2] && !steps.includes(match[2].trim())) {
      steps.push(match[2].trim());
    }
  }
  
  return steps;
}

/**
 * Calculate confidence score based on response characteristics
 */
function calculateConfidence(text: string, triagePriority?: string): number {
  let confidence = 0.7; // Base confidence
  
  // Increase confidence for longer, more detailed responses
  if (text.length > 200) confidence += 0.05;
  if (text.length > 400) confidence += 0.05;
  
  // Increase confidence if specific clinical terms are used
  if (/IMCI|WHO|guideline|protocol/i.test(text)) confidence += 0.05;
  
  // Increase confidence if triage priority is mentioned correctly
  if (triagePriority && new RegExp(triagePriority, 'i').test(text)) {
    confidence += 0.05;
  }
  
  // Decrease confidence for uncertainty markers
  if (/might|possibly|perhaps|unclear|uncertain|cannot determine/i.test(text)) {
    confidence -= 0.1;
  }
  
  // Decrease confidence for missing data mentions
  if (/not recorded|missing|incomplete|insufficient/i.test(text)) {
    confidence -= 0.05;
  }
  
  // Clamp between 0.3 and 0.95
  return Math.max(0.3, Math.min(0.95, confidence));
}

// ============================================================================
// Server-Side Inconsistency Detection (Phase 1, Task 1.1.2)
// ============================================================================

/**
 * IMCI Thresholds for inconsistency detection
 */
const IMCI_THRESHOLDS = {
  respiratoryRate: {
    '<2 months': { fastBreathing: 60 },
    '2-12 months': { fastBreathing: 50 },
    '12-60 months': { fastBreathing: 40 }
  },
  DANGER_SIGNS_RED: [
    'unable_to_drink',
    'vomits_everything',
    'convulsions',
    'lethargic_or_unconscious',
    'cyanosis',
    'respiratory_distress_severe',
    'severe_respiratory_distress'
  ],
  DANGER_SIGNS_YELLOW: [
    'fast_breathing',
    'chest_indrawing',
    'fever',
    'low_body_temp',
    'not_feeding_well'
  ]
};

interface InconsistencyResult {
  type: 'danger_sign' | 'threshold' | 'missing' | 'contradiction';
  field: string;
  value: unknown;
  expected: string;
  message: string;
  severity: 'warning' | 'error' | 'info';
}

/**
 * Get age group from months
 */
function getAgeGroup(ageMonths: number): string {
  if (ageMonths < 2) return '<2 months';
  if (ageMonths < 12) return '2-12 months';
  return '12-60 months';
}

/**
 * Detect inconsistencies between clinical data and triage priority
 */
function detectInconsistencies(
  answers: Record<string, unknown>,
  calculatedPriority: 'red' | 'yellow' | 'green' | undefined,
  patientAgeMonths: number | undefined
): InconsistencyResult[] {
  const inconsistencies: InconsistencyResult[] = [];
  
  if (!answers || !calculatedPriority) {
    return inconsistencies;
  }
  
  const ageMonths = patientAgeMonths || 12; // Default to 2-12 months if unknown
  const ageGroup = getAgeGroup(ageMonths);
  
  // Check danger signs that should trigger RED
  for (const dangerSign of IMCI_THRESHOLDS.DANGER_SIGNS_RED) {
    if (answers[dangerSign] === true && calculatedPriority !== 'red') {
      inconsistencies.push({
        type: 'danger_sign',
        field: dangerSign,
        value: true,
        expected: 'Red priority',
        message: `${formatFieldName(dangerSign)} is present but priority is ${calculatedPriority.toUpperCase()}. This danger sign typically requires RED priority.`,
        severity: 'error'
      });
    }
  }
  
  // Check for yellow signs with green priority
  for (const yellowSign of IMCI_THRESHOLDS.DANGER_SIGNS_YELLOW) {
    if (answers[yellowSign] === true && calculatedPriority === 'green') {
      inconsistencies.push({
        type: 'danger_sign',
        field: yellowSign,
        value: true,
        expected: 'Yellow or Red priority',
        message: `${formatFieldName(yellowSign)} is present but priority is GREEN. Consider upgrading priority.`,
        severity: 'warning'
      });
    }
  }
  
  // Check respiratory rate thresholds
  const respRate = answers.respiratory_rate as number | undefined;
  if (respRate && typeof respRate === 'number') {
    const threshold = IMCI_THRESHOLDS.respiratoryRate[ageGroup as keyof typeof IMCI_THRESHOLDS.respiratoryRate];
    if (threshold && respRate >= threshold.fastBreathing && calculatedPriority === 'green') {
      inconsistencies.push({
        type: 'threshold',
        field: 'respiratory_rate',
        value: respRate,
        expected: `Yellow priority (≥${threshold.fastBreathing} for age)`,
        message: `Respiratory rate (${respRate} bpm) exceeds IMCI fast breathing threshold (${threshold.fastBreathing}) for age ${ageMonths} months.`,
        severity: 'warning'
      });
    }
  }
  
  // Check for contradictions
  if (answers.lethargic_or_unconscious === true && answers.consciousness === 'alert') {
    inconsistencies.push({
      type: 'contradiction',
      field: 'consciousness',
      value: 'alert',
      expected: 'Consistent with lethargy',
      message: 'Patient marked as alert but also has lethargic/unconscious danger sign.',
      severity: 'error'
    });
  }
  
  if (answers.unable_to_drink === true && answers.drinks_normally === true) {
    inconsistencies.push({
      type: 'contradiction',
      field: 'hydration',
      value: 'Normal drinking',
      expected: 'Unable to drink',
      message: 'Patient marked as unable to drink but also drinks normally.',
      severity: 'error'
    });
  }
  
  // Check for missing critical data
  if (calculatedPriority !== 'red') {
    // Only check for missing data if not already RED (RED would be caught by danger signs)
    if (answers.respiratory_rate === undefined || answers.respiratory_rate === null) {
      inconsistencies.push({
        type: 'missing',
        field: 'respiratory_rate',
        value: undefined,
        expected: 'Respiratory rate measurement',
        message: 'Respiratory rate not recorded. This is important for IMCI classification.',
        severity: 'info'
      });
    }
  }
  
  return inconsistencies;
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

// ============================================================================
// Structured Prompt Engineering (Phase 1, Task 1.1.3)
// ============================================================================

/**
 * Build a prompt that requests structured JSON output
 */
function buildStructuredPrompt(
  basePrompt: string,
  useCase: AIUseCase,
  requestStructuredOutput: boolean = true
): string {
  if (!requestStructuredOutput) {
    return basePrompt;
  }
  
  const structuredInstructions = `

OUTPUT FORMAT:
Provide your response in a natural, conversational style. You may optionally structure your response with these sections if helpful:

- For inconsistencies: Start a paragraph with "INCONSISTENCIES:" followed by any data conflicts detected
- For teaching: Include "TEACHING NOTE:" followed by a clinical education point
- For next steps: Include "NEXT STEPS:" followed by recommended actions
- For summary: End with "SUMMARY:" followed by a one-sentence takeaway

If no inconsistencies are found, you may omit that section. Keep your response concise and clinically relevant.`;

  return basePrompt + structuredInstructions;
}

/**
 * Build a prompt specifically for EXPLAIN_TRIAGE with structured output
 */
function buildTriageExplanationPrompt(
  answers: Record<string, unknown>,
  patient: StreamingRequest['patient'],
  triagePriority: string | undefined
): string {
  const lines: string[] = [];
  
  lines.push('You are MedGemma, a clinical decision support assistant for UtanoBridge.');
  lines.push('Explain the triage classification in clear, clinical terms.');
  lines.push('');
  
  // Patient context
  if (patient) {
    lines.push(`PATIENT: ${formatPatientAge(patient.ageMonths)}, ${patient.weightKg}kg, ${patient.gender}`);
    if (triagePriority) {
      lines.push(`TRIAGE PRIORITY: ${triagePriority.toUpperCase()}`);
    }
    lines.push('');
  }
  
  // Clinical findings
  lines.push('CLINICAL FINDINGS:');
  const relevantFields = [
    'cyanosis', 'respiratory_distress_severe', 'lethargic_or_unconscious',
    'convulsions', 'unable_to_drink', 'vomits_everything',
    'fast_breathing', 'chest_indrawing', 'fever',
    'respiratory_rate', 'oxygen_saturation', 'temperature'
  ];
  
  for (const field of relevantFields) {
    if (answers[field] !== undefined && answers[field] !== null) {
      const label = formatFieldName(field);
      lines.push(`- ${label}: ${formatValue(answers[field])}`);
    }
  }
  lines.push('');
  
  // Task
  lines.push('TASK: Explain why this patient received this triage classification.');
  lines.push('Reference the IMCI guidelines that apply.');
  lines.push('If you detect any inconsistencies between the findings and the assigned priority, mention them.');
  lines.push('Provide one teaching point relevant to this case.');
  lines.push('Suggest immediate next steps for the nurse.');
  lines.push('');
  lines.push('Keep your response under 200 words.');
  
  return lines.join('\n');
}

// ============================================================================
// Original Prompt Builder (kept for backward compatibility)
// ============================================================================

function buildOllamaPrompt(useCase: AIUseCase, context: Record<string, unknown>): string {
  const basePrompt = `You are MedGemma, a senior clinical decision support specialist for UtanoBridge, working alongside nurses as their experienced clinical colleague. Your role is to provide thoughtful, context-aware explanations that help nurses understand the complete clinical picture and feel confident in their decisions.

IMPORTANT: Keep your response concise and focused - MAXIMUM 250 WORDS. Avoid repetitive phrases or excessive detail. Each sentence should add new value to the clinical understanding.

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
- Excessive bullet points or numbered lists that break natural flow
- Redundant information across multiple paragraphs
- Repeating the same phrases like "let's take a deep breath"

Remember
You are here to build the nurse's clinical judgment, not replace it. Every explanation should help them understand the "why" behind the clinical reasoning.

CLINICAL CONTEXT:
${JSON.stringify(context, null, 2)}

Provide a concise (max 250 words), thoughtful response that helps the nurse understand the clinical picture.`;

  const useCasePrompts: Record<AIUseCase, string> = {
    'EXPLAIN_TRIAGE': `\n\nHelp the nurse understand the complete clinical picture behind this triage classification. Connect the dots between the assessment findings and the priority assigned.`,
    'INCONSISTENCY_CHECK': `\n\nReview the assessment data for any internal contradictions or gaps that might affect the triage decision.`,
    'SUGGEST_ACTIONS': `\n\nThink through what practical next steps make sense for this patient right now.`,
    'TREATMENT_ADVICE': `\n\nProvide treatment recommendations while explaining the reasoning behind them.`,
    'CAREGIVER_INSTRUCTIONS': `\n\nHelp prepare instructions for the caregiver in a supportive, clear way.`,
    'CLINICAL_NARRATIVE': `\n\nWrite a brief clinical narrative that captures the essence of this encounter.`,
    'CARE_EDUCATION': `\n\nProvide patient care education points with context about why they matter.`,
    'CLINICAL_HANDOVER': `\n\nPrepare a clinical handover summary for the next provider.`,
    'NOTE_SUMMARY': `\n\nGenerate a brief summary for the medical record.`,
    'GENERAL_INQUIRY': `\n\nAnswer the clinical question thoughtfully with context.`,
    'SECTION_GUIDANCE': `\n\nProvide section-specific guidance based on the clinical context.`
  };

  return basePrompt + (useCasePrompts[useCase] || useCasePrompts['EXPLAIN_TRIAGE']);
}

// ============================================================================
// Main Handler
// ============================================================================

export default defineEventHandler(async (event) => {
  // Set headers for SSE
  event.node.res.setHeader('Content-Type', 'text/event-stream');
  event.node.res.setHeader('Cache-Control', 'no-cache');
  event.node.res.setHeader('Connection', 'keep-alive');
  event.node.res.setHeader('X-Accel-Buffering', 'no');

  // Get request body
  const body = await readBody<StreamingRequest>(event);
  
  const { 
    requestId, 
    useCase, 
    sessionId, 
    schemaId, 
    formId,
    sectionId,
    cumulativeSummary,
    patient,
    assessment,
    timestamp,
    payload,
    constraints
  } = body;
  
  console.log(`[AI Stream] 📥 Request received: requestId=${requestId}, useCase=${useCase}, schemaId=${schemaId}, sectionId=${sectionId}`);
  console.log(`[AI Stream] 📥 Body has constraints: ${!!constraints}, has prompt: ${!!body.prompt}, has payload.prompt: ${!!payload?.prompt}`);
  if (constraints) {
    console.log(`[AI Stream] 📥 Constraints: sectionId=${constraints.sectionId}, maxWords=${constraints.maxWords}`);
  }
  
  // Determine which prompt mode to use
  const isSectionGuidance = useCase === 'SECTION_GUIDANCE' && sectionId;
  
  console.log(`[AI Stream] Prompt mode: isSectionGuidance=${isSectionGuidance}, hasSchemaId=!!${schemaId}, hasSectionId=!!${sectionId}, useCase=${useCase}`);
  
  // Build prompt with priority for SECTION_GUIDANCE:
  // 1) Use constraints to build prompt (preferred for SECTION_GUIDANCE)
  // 2) Use client-provided prompt (fallback for SECTION_GUIDANCE)
  // 3) Use payload prompt
  // 4) Server schema fallback
  // 5) Legacy prompts
  let fullPrompt = '';
  let extractedSummary = '';
  
  // For SECTION_GUIDANCE, always try constraints first if available
  if (isSectionGuidance && constraints) {
    console.log(`[AI Stream] 🎯 Building prompt from constraints for SECTION_GUIDANCE`);
    fullPrompt = buildPromptFromConstraints(
      constraints,
      assessment?.answers || {},
      patient,
      cumulativeSummary
    );
    console.log(`[AI Stream] Built prompt from constraints, length: ${fullPrompt.length} chars`);
  } else if (body.prompt && body.prompt.trim() !== '') {
    fullPrompt = body.prompt;
    console.log(`[AI Stream] Using client-provided prompt: ${fullPrompt.slice(0, 100)}...`);
  } else if (payload?.prompt && payload.prompt.trim() !== '') {
    fullPrompt = payload.prompt;
    console.log(`[AI Stream] Using payload prompt: ${fullPrompt.slice(0, 100)}...`);
  } else if (constraints) {
    // Use client-provided constraints to build prompt
    console.log(`[AI Stream] Using client-provided constraints for section: ${constraints.sectionId}`);
    fullPrompt = buildPromptFromConstraints(
      constraints,
      assessment?.answers || {},
      patient,
      cumulativeSummary
    );
    console.log(`[AI Stream] Built prompt from constraints, length: ${fullPrompt.length} chars`);
  } else if (isSectionGuidance && schemaId) {
    // Fall back to server-side schema loading
    try {
      const schema = await loadPromptSchema(schemaId);
      const section = schema.sections.find(s => s.id === sectionId) || schema.fallbackSection;
      console.log(`[AI Stream] Loaded schema, found section: ${section.id}, maxWords: ${section.maxWords}`);
      fullPrompt = buildSectionPrompt(
        schema,
        section,
        assessment?.answers || {},
        patient,
        cumulativeSummary
      );
      console.log(`[AI Stream] Built cumulative prompt, length: ${fullPrompt.length} chars`);
    } catch (error) {
      console.warn(`[AI Stream] Failed to load schema: ${error}, falling back to legacy prompts`);
      const context = payload?.context || { sectionId, cumulativeSummary, patient, assessment };
      fullPrompt = buildOllamaPrompt(useCase, context);
    }
  } else {
    // Use legacy prompt building
    console.log(`[AI Stream] Using legacy prompts, isSectionGuidance=${isSectionGuidance}, schemaId=${schemaId}`);
    
    // For EXPLAIN_TRIAGE, use structured prompt (Phase 1, Task 1.1.3)
    if (useCase === 'EXPLAIN_TRIAGE') {
      fullPrompt = buildTriageExplanationPrompt(
        assessment?.answers || {},
        patient,
        patient?.triagePriority
      );
      console.log(`[AI Stream] Built structured triage explanation prompt, length: ${fullPrompt.length} chars`);
    } else {
      const context = payload?.context || { sectionId, cumulativeSummary, patient, assessment };
      fullPrompt = buildOllamaPrompt(useCase, context);
    }
  }
  
  const config = payload?.config || {};
  
  console.log(`[AI Stream] Starting: ${requestId}, useCase: ${useCase}, section: ${sectionId || 'none'}`);

  // Send connection established event
  event.node.res.write(buildSSEEvent({
    type: 'connection_established',
    requestId,
    timestamp: new Date().toISOString(),
    payload: { status: 'generating', progress: 0, message: 'Connected to AI streaming service' }
  }));

  try {
    // Build the prompt - use fullPrompt which was already computed
    console.log(`[AI Stream] Sending prompt to Ollama: ${fullPrompt.slice(0, 200)}...`);
    
    // Calculate appropriate token limit based on section/constraints
    // For final_summary with 500 words, we need ~750 tokens (1.5 tokens/word ratio)
    let tokenLimit = config?.maxTokens || 300;
    if (constraints?.maxWords && constraints.maxWords > 300) {
      // Use 1.5x ratio for word-to-token conversion
      tokenLimit = Math.ceil(constraints.maxWords * 1.5);
    }
    if (sectionId === 'final_summary' || constraints?.sectionId === 'final_summary') {
      tokenLimit = Math.max(tokenLimit, 750); // Ensure at least 750 tokens for comprehensive report
    }
    
    // Ollama streaming request
    const ollamaConfig: Record<string, unknown> = {
      model: config?.model || OLLAMA_MODEL,
      prompt: fullPrompt,
      stream: true,
      options: {
        temperature: config?.temperature || 0.2,
        num_predict: tokenLimit,
        keep_alive: config?.keepAlive || 300000
      }
    };
    
    console.log(`[AI Stream] Token limit set to: ${tokenLimit} (sectionId: ${sectionId || constraints?.sectionId || 'none'})`);

    // Send progress
    event.node.res.write(buildSSEEvent({
      type: 'progress',
      requestId,
      timestamp: new Date().toISOString(),
      payload: { status: 'generating', progress: 10, message: 'Sending request to Ollama...' }
    }));

    // Fetch from Ollama with native fetch for true streaming
    console.log(`[AI Stream] Fetching from Ollama: ${OLLAMA_BASE_URL}/api/generate`);
    console.log(`[AI Stream] Full request body:`, JSON.stringify(ollamaConfig, null, 2));
    
    let response: Response;
    try {
      response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ollamaConfig)
      });
    } catch (fetchError) {
      console.error(`[AI Stream] Fetch error:`, fetchError);
      throw new Error(`Failed to connect to Ollama: ${fetchError}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI Stream] Ollama error: ${response.status} ${errorText}`);
      console.error(`[AI Stream] Request that caused error:`, JSON.stringify(ollamaConfig, null, 2));
      throw new Error(`Ollama error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body from Ollama');
    }

    console.log(`[AI Stream] Ollama response status: ${response.status}, body exists: true`);
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkIndex = 0;
    let totalDuration = 0;
    let fullResponse = '';

    // Send progress
    event.node.res.write(buildSSEEvent({
      type: 'progress',
      requestId,
      timestamp: new Date().toISOString(),
      payload: { status: 'generating', progress: 30, message: 'Receiving AI response...' }
    }));

    // Read stream
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      buffer += text;
      
      console.log(`[AI Stream] Ollama read: ${value.length} bytes, buffer: ${buffer.length} chars`);

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      console.log(`[AI Stream] Parsing ${lines.length} lines from buffer`);
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const parsed = parseOllamaResponse(line);
        
        if (parsed) {
          console.log(`[AI Stream] Parsed Ollama response: chunkIndex=${chunkIndex + 1}, responseLength=${parsed.response.length}, done=${parsed.done}`);
          
          chunkIndex++;
          fullResponse += parsed.response;
          totalDuration = parsed.total_duration || 0;

          // Send chunk
          event.node.res.write(buildSSEEvent({
            type: 'chunk',
            requestId,
            timestamp: new Date().toISOString(),
            payload: {
              chunk: parsed.response,
              totalLength: fullResponse.length,
              chunkIndex,
              isFirst: chunkIndex === 1,
              isLast: parsed.done
            }
          }));

          // Send progress updates
          if (chunkIndex % 5 === 0 || parsed.done) {
            const progress = Math.min(90, 30 + (chunkIndex * 2));
            event.node.res.write(buildSSEEvent({
              type: 'progress',
              requestId,
              timestamp: new Date().toISOString(),
              payload: {
                status: parsed.done ? 'finalizing' : 'generating',
                progress,
                message: parsed.done ? 'Finalizing response...' : `Received ${chunkIndex} chunks...`
              }
            }));
          }

          // End of stream
          if (parsed.done) {
            console.log(`[AI Stream] ✅ Stream done, response length: ${fullResponse.length} chars, ${countWords(fullResponse)} words`);
            
            // Apply word limit enforcement for section guidance
            let finalResponse = fullResponse;
            let wasTruncated = false;
            let maxWordsLimit = 0;
            
            // Priority: 1) Use constraints.maxWords if available, 2) Load schema for section, 3) Skip truncation
            if (constraints?.maxWords) {
              // Use client-provided maxWords from constraints
              maxWordsLimit = constraints.maxWords;
              console.log(`[AI Stream] 🔒 Using constraints.maxWords: ${maxWordsLimit}`);
              const enforcement = enforceWordLimit(fullResponse, maxWordsLimit, constraints.sectionId);
              finalResponse = enforcement.response;
              wasTruncated = enforcement.wasTruncated;
            } else if (isSectionGuidance && schemaId) {
              // Load schema for section-specific maxWords
              try {
                const schema = await loadPromptSchema(schemaId);
                const section = schema.sections.find(s => s.id === sectionId);
                if (section) {
                  maxWordsLimit = section.maxWords;
                  console.log(`[AI Stream] 🔒 Loaded schema section "${sectionId}", maxWords: ${maxWordsLimit}`);
                  const enforcement = enforceWordLimit(fullResponse, maxWordsLimit, sectionId);
                  finalResponse = enforcement.response;
                  wasTruncated = enforcement.wasTruncated;
                } else {
                  console.warn(`[AI Stream] ⚠️ Section "${sectionId}" not found in schema, skipping truncation`);
                }
              } catch (e) {
                console.warn(`[AI Stream] ⚠️ Failed to load schema for truncation: ${e}, skipping truncation`);
              }
            } else {
              console.log(`[AI Stream] ⚠️ No truncation applied: isSectionGuidance=${isSectionGuidance}, hasSchemaId=!!${schemaId}, hasConstraints=!!${!!constraints}`);
            }
            
            // Extract summary from the (potentially truncated) response
            extractedSummary = extractSummary(finalResponse);
            console.log(`[AI Stream] 📝 Extracted summary: "${extractedSummary.slice(0, 80)}..."`);

            // Parse structured response (Phase 1)
            const structuredResponse = parseStructuredResponse(
              finalResponse,
              parsed.model || OLLAMA_MODEL,
              patient?.triagePriority
            );
            
            // Server-side inconsistency detection (Phase 1, Task 1.1.2)
            const serverInconsistencies = detectInconsistencies(
              assessment?.answers || {},
              patient?.triagePriority as 'red' | 'yellow' | 'green' | undefined,
              patient?.ageMonths
            );
            
            // Merge server-detected inconsistencies with AI-detected ones
            if (serverInconsistencies.length > 0) {
              const serverMessages = serverInconsistencies.map(i => i.message);
              structuredResponse.inconsistencies = [
                ...new Set([...(structuredResponse.inconsistencies || []), ...serverMessages])
              ];
              console.log(`[AI Stream] 🔍 Server detected ${serverInconsistencies.length} inconsistencies`);
            }
            
            console.log(`[AI Stream] 📊 Structured response: inconsistencies=${structuredResponse.inconsistencies?.length || 0}, teachingNotes=${structuredResponse.teachingNotes?.length || 0}, nextSteps=${structuredResponse.nextSteps?.length || 0}, confidence=${structuredResponse.confidence?.toFixed(2) || 'N/A'}`);

            event.node.res.write(buildSSEEvent({
              type: 'complete',
              requestId,
              timestamp: new Date().toISOString(),
              payload: {
                fullResponse: finalResponse,
                summary: extractedSummary,
                confidence: structuredResponse.confidence,
                modelVersion: structuredResponse.modelVersion,
                duration: totalDuration / 1e6,
                chunkIndex,
                tokensUsed: parsed.eval_count || chunkIndex,
                wasTruncated,
                // Phase 1: Structured response fields
                structured: structuredResponse,
                explanation: structuredResponse.explanation,
                inconsistencies: structuredResponse.inconsistencies,
                teachingNotes: structuredResponse.teachingNotes,
                nextSteps: structuredResponse.nextSteps,
                ruleIds: structuredResponse.ruleIds,
                safetyFlags: structuredResponse.safetyFlags
              }
            }));

            console.log(`[AI Stream] Completed: ${requestId}, chunks: ${chunkIndex}, duration: ${totalDuration / 1e6}ms, summary: "${extractedSummary.slice(0, 50)}...", truncated: ${wasTruncated}`);
          }
        }
      }
    }

    // Final progress
    event.node.res.write(buildSSEEvent({
      type: 'progress',
      requestId,
      timestamp: new Date().toISOString(),
      payload: { status: 'finalizing', progress: 100, message: 'Response complete' }
    }));

  } catch (error) {
    console.error(`[AI Stream] Error ${requestId}:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    event.node.res.write(buildSSEEvent({
      type: 'error',
      requestId,
      timestamp: new Date().toISOString(),
      payload: { code: 'OLLAMA_ERROR', message: errorMessage, recoverable: true }
    }));
  } finally {
    event.node.res.end();
  }
});
