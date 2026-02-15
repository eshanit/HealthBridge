/**
 * Safe AI Stream Endpoint
 * 
 * Phase 4 Task 4.3.1: Wraps AI calls with safety orchestration
 * Provides streaming AI responses with safety validation
 */

import { defineEventHandler, readBody, createError } from 'h3';
import { getSafetyOrchestrator, type SafetyRequest } from '../../ai-safety/safetyOrchestrator';
import { buildExplainabilityModel } from '~/services/explainabilityEngine';
import type { AIUseCase, ExplainabilityRecord } from '~/types/explainability';
import type { ClinicalFormInstance } from '~/types/clinical-form';
import type { Contradiction } from '../../ai-safety/contradictionDetector';

// ============================================
// Types
// ============================================

interface SafeStreamRequest {
  /** Session ID */
  sessionId: string;
  /** User question or prompt */
  userQuestion: string;
  /** AI use case */
  useCase: AIUseCase;
  /** Assessment data for explainability */
  assessment?: ClinicalFormInstance;
  /** Existing explainability record (if pre-built) */
  explainability?: ExplainabilityRecord;
  /** Clinical context */
  context: {
    sessionExists: boolean;
    assessmentComplete: boolean;
    triageResult: boolean;
    priority?: 'red' | 'yellow' | 'green';
  };
  /** Enable streaming response */
  stream?: boolean;
}

interface SafeStreamResponse {
  success: boolean;
  blocked?: boolean;
  reason?: string;
  safeText?: string;
  riskScore?: {
    total: number;
    level: 'green' | 'yellow' | 'red';
    levelLabel: string;
  };
  contradictions?: Array<{
    type: string;
    description: string;
    severity: string;
  }>;
  warnings?: string[];
  explainability?: ExplainabilityRecord;
  timestamp: string;
}

// ============================================
// Server-side AI Call (avoids #app import)
// ============================================

/**
 * Call AI directly from server-side without using client-side composable
 * This avoids the Vue app alias (#app) import issue in server runtime
 */
async function callAIFromServer(
  useCase: AIUseCase,
  explainability: ExplainabilityRecord
): Promise<string> {
  // Use the existing /api/ai endpoint for server-side AI calls
  const response = await fetch('http://localhost:3000/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      useCase,
      payload: explainability,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.answer || '';
}

// ============================================
// Event Handler
// ============================================

export default defineEventHandler(async (event): Promise<SafeStreamResponse> => {
  const body = await readBody<SafeStreamRequest>(event);
  const timestamp = new Date().toISOString();

  // Validate required fields
  if (!body.sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing sessionId',
    });
  }

  if (!body.userQuestion) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing userQuestion',
    });
  }

  if (!body.useCase) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing useCase',
    });
  }

  try {
    // 1. Build or use existing explainability record
    let explainability: ExplainabilityRecord | undefined = body.explainability;
    
    if (!explainability && body.assessment) {
      const built = await buildExplainabilityModel(body.assessment, {
        sessionId: body.sessionId,
        useAI: false, // Use rule-based for safety layer
      });
      if (built) {
        explainability = built;
      }
    }

    if (!explainability) {
      return {
        success: false,
        blocked: true,
        reason: 'No explainability data available - cannot process safely',
        timestamp,
      };
    }

    // 2. Create safety request
    const safetyRequest: SafetyRequest = {
      sessionId: body.sessionId,
      userQuestion: body.userQuestion,
      useCase: body.useCase,
      explainability,
      context: body.context,
    };

    // 3. Process through safety orchestrator
    const orchestrator = getSafetyOrchestrator();
    
    // Define AI callback for the orchestrator (server-side implementation)
    const aiCallback = async (sanitizedInput: string, exp: ExplainabilityRecord): Promise<string> => {
      return callAIFromServer(body.useCase, exp);
    };

    const safetyResponse = await orchestrator.processRequest(safetyRequest, aiCallback);

    // 4. Return response
    return {
      success: !safetyResponse.blocked,
      blocked: safetyResponse.blocked,
      reason: safetyResponse.reason,
      safeText: safetyResponse.safeText,
      riskScore: safetyResponse.riskScore ? {
        total: safetyResponse.riskScore.total,
        level: safetyResponse.riskScore.level,
        levelLabel: safetyResponse.riskScore.levelLabel,
      } : undefined,
      contradictions: safetyResponse.contradictions.map((c: Contradiction) => ({
        type: c.type,
        description: c.description,
        severity: c.severity,
      })),
      warnings: safetyResponse.warnings,
      explainability,
      timestamp: safetyResponse.timestamp,
    };

  } catch (error) {
    console.error('[safe-stream] Error:', error);
    
    return {
      success: false,
      blocked: true,
      reason: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp,
    };
  }
});

// ============================================
// Helper Functions
// ============================================

/**
 * Quick safety check endpoint helper
 */
export async function quickSafetyCheck(
  userQuestion: string,
  context: SafeStreamRequest['context']
): Promise<{ allowed: boolean; reason?: string }> {
  const orchestrator = getSafetyOrchestrator();
  return orchestrator.checkSafety(userQuestion, context);
}

/**
 * Check if session is escalated (3+ warnings)
 */
export function isSessionEscalated(sessionId: string): boolean {
  const orchestrator = getSafetyOrchestrator();
  return orchestrator.shouldEscalate(sessionId);
}

/**
 * Reset session warnings
 */
export function resetSessionWarnings(sessionId: string): void {
  const orchestrator = getSafetyOrchestrator();
  orchestrator.resetWarnings(sessionId);
}
