/**
 * Safety Orchestrator for AI Safety
 * 
 * Phase 4 Task 4.2.1: Coordinates all safety services
 * Implements the safety flow from SAFETY_GOVERNANCE.md
 */

import { sanitizeInput, type SanitizationResult } from './inputSanitizer';
import { calculateRiskScore, type RiskScore, getRiskBadgeEmoji } from './riskScorer';
import { detectContradictions, type Contradiction, type ContradictionDetectionResult } from './contradictionDetector';
import { performSafetyCheck, sanitizeOutput } from '~/services/safetyRules';
import { logAIInteraction } from '~/services/aiAudit';
import type { ExplainabilityRecord, AIUseCase, SafetyCheckResult } from '~/types/explainability';

// ============================================
// Types & Interfaces
// ============================================

export interface SafetyRequest {
  /** Session ID */
  sessionId: string;
  /** User question or input */
  userQuestion: string;
  /** AI use case */
  useCase: AIUseCase;
  /** Explainability record with calculated values */
  explainability: ExplainabilityRecord;
  /** Clinical context */
  context: {
    sessionExists: boolean;
    assessmentComplete: boolean;
    triageResult: boolean;
    priority?: 'red' | 'yellow' | 'green';
  };
}

export interface SafetyResponse {
  /** Whether the request was blocked */
  blocked: boolean;
  /** Reason for blocking (if blocked) */
  reason?: string;
  /** Sanitized user input */
  sanitizedInput: string;
  /** Safe AI output text */
  safeText?: string;
  /** Risk score */
  riskScore?: RiskScore;
  /** Detected contradictions */
  contradictions: Contradiction[];
  /** Sanitization details */
  sanitization: SanitizationResult;
  /** Safety check result */
  safetyCheck: SafetyCheckResult;
  /** Processing timestamp */
  timestamp: string;
  /** Warning messages */
  warnings: string[];
}

export interface AIServiceCallback {
  (sanitizedInput: string, explainability: ExplainabilityRecord): Promise<string>;
}

// ============================================
// Safety Configuration
// ============================================

interface SafetyConfig {
  /** Maximum risk score before blocking */
  blockThreshold: number;
  /** Risk score for warning */
  warnThreshold: number;
  /** Enable input sanitization */
  enableSanitization: boolean;
  /** Enable contradiction detection */
  enableContradictionDetection: boolean;
  /** Enable risk scoring */
  enableRiskScoring: boolean;
  /** Enable audit logging */
  enableLogging: boolean;
}

const DEFAULT_CONFIG: SafetyConfig = {
  blockThreshold: 7,
  warnThreshold: 3,
  enableSanitization: true,
  enableContradictionDetection: true,
  enableRiskScoring: true,
  enableLogging: true,
};

// ============================================
// Safety Orchestrator Class
// ============================================

class SafetyOrchestrator {
  private config: SafetyConfig;
  private warningCounts: Map<string, number> = new Map();

  constructor(config: Partial<SafetyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process an AI request through all safety layers
   * 
   * Flow:
   * 1. Sanitize input
   * 2. Apply guardrails (existing safetyRules)
   * 3. Get AI response (via callback)
   * 4. Validate output
   * 5. Detect contradictions
   * 6. Score risk
   * 7. Log
   * 8. Return result or block
   */
  async processRequest(
    request: SafetyRequest,
    aiCallback: AIServiceCallback
  ): Promise<SafetyResponse> {
    const warnings: string[] = [];
    const timestamp = new Date().toISOString();

    // 1. Sanitize input
    const sanitization = this.config.enableSanitization
      ? sanitizeInput(request.userQuestion)
      : { sanitized: request.userQuestion, removed: [], warnings: [], wasModified: false };

    warnings.push(...sanitization.warnings);

    // 2. Apply guardrails (using existing safetyRules.ts)
    const safetyCheck = performSafetyCheck(sanitization.sanitized, request.context);
    
    if (!safetyCheck.allowed) {
      await this.logSafetyEvent(request, 'blocked', safetyCheck.reason || 'Safety check failed');
      
      return {
        blocked: true,
        reason: safetyCheck.reason,
        sanitizedInput: sanitization.sanitized,
        contradictions: [],
        sanitization,
        safetyCheck,
        timestamp,
        warnings,
      };
    }

    // 3. Get AI response
    let aiOutput: string;
    try {
      aiOutput = await aiCallback(sanitization.sanitized, request.explainability);
    } catch (error) {
      await this.logSafetyEvent(request, 'error', String(error));
      throw error;
    }

    // 4. Validate output (using existing safetyRules.ts)
    const safeText = sanitizeOutput(aiOutput);

    // 5. Detect contradictions
    const contradictionResult = this.config.enableContradictionDetection
      ? detectContradictions({
          aiOutput: safeText,
          explainability: request.explainability,
          context: {
            userQuestion: request.userQuestion,
            useCase: request.useCase,
          },
        })
      : { contradictions: [], hasCritical: false, hasErrors: false, summary: 'Detection disabled' };

    // Add contradiction warnings
    if (contradictionResult.hasCritical) {
      warnings.push('CRITICAL: Contradictions detected between AI and system');
    } else if (contradictionResult.hasErrors) {
      warnings.push('WARNING: Potential contradictions detected');
    }

    // 6. Score risk
    const riskScore = this.config.enableRiskScoring
      ? calculateRiskScore({
          output: safeText,
          contradictions: contradictionResult.contradictions.map(c => c.description),
          context: {
            priority: request.context.priority,
            hasAssessment: request.context.assessmentComplete,
            hasTriage: request.context.triageResult,
          },
        })
      : {
          total: 0,
          breakdown: {
            ruleConflict: 0,
            dosageMention: 0,
            diagnosisClaim: 0,
            absolutes: 0,
            missingDataRefs: 0,
            treatmentRecommendation: 0,
            overrideAttempt: 0,
          },
          level: 'green' as const,
          levelLabel: 'Low Risk',
          shouldBlock: false,
          shouldWarn: false,
          factors: [],
        };

    // Add risk warnings
    if (riskScore.shouldWarn) {
      warnings.push(`Risk score: ${riskScore.total} (${riskScore.levelLabel})`);
    }

    // 7. Determine if should block
    const shouldBlock = 
      riskScore.shouldBlock || 
      contradictionResult.hasCritical ||
      safetyCheck.escalation === 'block';

    if (shouldBlock) {
      await this.logSafetyEvent(request, 'blocked', `Risk score: ${riskScore.total}`);
      
      return {
        blocked: true,
        reason: 'Output blocked due to safety concerns',
        sanitizedInput: sanitization.sanitized,
        safeText: undefined, // Don't return blocked text
        riskScore,
        contradictions: contradictionResult.contradictions,
        sanitization,
        safetyCheck,
        timestamp,
        warnings,
      };
    }

    // 8. Log successful processing
    if (this.config.enableLogging) {
      await this.logSafetyEvent(request, 'processed', `Risk: ${riskScore.level}`);
    }

    // Track warnings for session escalation
    if (warnings.length > 0) {
      this.incrementWarningCount(request.sessionId);
    }

    return {
      blocked: false,
      sanitizedInput: sanitization.sanitized,
      safeText,
      riskScore,
      contradictions: contradictionResult.contradictions,
      sanitization,
      safetyCheck,
      timestamp,
      warnings,
    };
  }

  /**
   * Quick safety check without AI callback
   */
  async checkSafety(
    userQuestion: string,
    context: SafetyRequest['context']
  ): Promise<{ allowed: boolean; reason?: string; sanitized: string }> {
    // Sanitize
    const sanitization = sanitizeInput(userQuestion);
    
    // Check safety rules
    const safetyCheck = performSafetyCheck(sanitization.sanitized, context);
    
    return {
      allowed: safetyCheck.allowed,
      reason: safetyCheck.reason,
      sanitized: sanitization.sanitized,
    };
  }

  /**
   * Get warning count for session
   */
  getWarningCount(sessionId: string): number {
    return this.warningCounts.get(sessionId) || 0;
  }

  /**
   * Check if session should be escalated (3+ warnings)
   */
  shouldEscalate(sessionId: string): boolean {
    return this.getWarningCount(sessionId) >= 3;
  }

  /**
   * Reset warning count for session
   */
  resetWarnings(sessionId: string): void {
    this.warningCounts.delete(sessionId);
  }

  /**
   * Increment warning count for session
   */
  private incrementWarningCount(sessionId: string): void {
    const current = this.warningCounts.get(sessionId) || 0;
    this.warningCounts.set(sessionId, current + 1);
  }

  /**
   * Log safety event
   */
  private async logSafetyEvent(
    request: SafetyRequest,
    action: string,
    details: string
  ): Promise<void> {
    if (!this.config.enableLogging) return;

    try {
      await logAIInteraction(
        request.useCase,
        request.explainability.id,
        {
          userQuestion: request.userQuestion,
          action,
          details,
          sessionId: request.sessionId,
        },
        details,
        0,
        action === 'blocked' ? 1 : 0,
        request.sessionId
      );
    } catch (error) {
      console.error('[SafetyOrchestrator] Failed to log safety event:', error);
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

let orchestratorInstance: SafetyOrchestrator | null = null;

/**
 * Get the safety orchestrator singleton
 */
export function getSafetyOrchestrator(config?: Partial<SafetyConfig>): SafetyOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new SafetyOrchestrator(config);
  }
  return orchestratorInstance;
}

/**
 * Reset the orchestrator (for testing)
 */
export function resetSafetyOrchestrator(): void {
  orchestratorInstance = null;
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Process an AI request with safety checks
 */
export async function processSafeAIRequest(
  request: SafetyRequest,
  aiCallback: AIServiceCallback
): Promise<SafetyResponse> {
  return getSafetyOrchestrator().processRequest(request, aiCallback);
}

/**
 * Quick safety check
 */
export async function quickSafetyCheck(
  userQuestion: string,
  context: SafetyRequest['context']
): Promise<{ allowed: boolean; reason?: string; sanitized: string }> {
  return getSafetyOrchestrator().checkSafety(userQuestion, context);
}

/**
 * Check if session has too many warnings
 */
export function isSessionEscalated(sessionId: string): boolean {
  return getSafetyOrchestrator().shouldEscalate(sessionId);
}

// ============================================
// Re-export types
// ============================================

export type { SafetyConfig };
