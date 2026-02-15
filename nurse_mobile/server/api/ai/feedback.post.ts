/**
 * AI Feedback API Endpoint
 * 
 * Phase 3.3 Task 3.3.3: Server endpoint for AI feedback submission
 * Receives, validates, and stores AI feedback from nurses
 */

import { defineEventHandler, readBody, createError } from 'h3';
import type { H3Event } from 'h3';

// ============================================
// Types
// ============================================

interface AIFeedbackPayload {
  id: string;
  sessionId: string;
  sectionId: string;
  responseId: string;
  category: 'accuracy' | 'relevance' | 'clarity' | 'safety' | 'helpfulness' | 'completeness';
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  issues?: string[];
  suggestions?: string;
  timestamp: string;
  status: 'pending' | 'submitted' | 'acknowledged' | 'resolved';
  nurseId?: string;
}

interface FeedbackResponse {
  success: boolean;
  message: string;
  feedbackId?: string;
  error?: string;
}

// ============================================
// Validation
// ============================================

function validateFeedback(payload: AIFeedbackPayload): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required fields
  if (!payload.id) errors.push('Feedback ID is required');
  if (!payload.sessionId) errors.push('Session ID is required');
  if (!payload.sectionId) errors.push('Section ID is required');
  if (!payload.responseId) errors.push('Response ID is required');
  if (!payload.timestamp) errors.push('Timestamp is required');

  // Category validation
  const validCategories = ['accuracy', 'relevance', 'clarity', 'safety', 'helpfulness', 'completeness'];
  if (!payload.category || !validCategories.includes(payload.category)) {
    errors.push('Invalid or missing category');
  }

  // Rating validation
  if (!payload.rating || ![1, 2, 3, 4, 5].includes(payload.rating)) {
    errors.push('Invalid or missing rating (must be 1-5)');
  }

  // Status validation
  const validStatuses = ['pending', 'submitted', 'acknowledged', 'resolved'];
  if (payload.status && !validStatuses.includes(payload.status)) {
    errors.push('Invalid status');
  }

  // Comment length
  if (payload.comment && payload.comment.length > 1000) {
    errors.push('Comment must be less than 1000 characters');
  }

  // Suggestions length
  if (payload.suggestions && payload.suggestions.length > 1000) {
    errors.push('Suggestions must be less than 1000 characters');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================
// Storage (In-memory for demo, replace with database)
// ============================================

// In production, this would be stored in a database
const feedbackStore: Map<string, AIFeedbackPayload> = new Map();

// ============================================
// Event Handler
// ============================================

export default defineEventHandler(async (event: H3Event): Promise<FeedbackResponse> => {
  try {
    // Read request body
    const body = await readBody<AIFeedbackPayload>(event);

    if (!body) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: 'Request body is required'
      });
    }

    // Validate feedback
    const validation = validateFeedback(body);
    if (!validation.valid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: `Validation failed: ${validation.errors.join(', ')}`
      });
    }

    // Add server timestamp and ensure status
    const feedback: AIFeedbackPayload = {
      ...body,
      status: body.status || 'submitted',
      nurseId: body.nurseId || event.context.auth?.user?.id
    };

    // Store feedback
    feedbackStore.set(feedback.id, feedback);

    // Log for debugging
    console.log('[AI Feedback] Received feedback:', {
      id: feedback.id,
      sessionId: feedback.sessionId,
      category: feedback.category,
      rating: feedback.rating,
      issues: feedback.issues?.length || 0
    });

    // In production, you would:
    // 1. Store in database
    // 2. Send notifications for low ratings or safety issues
    // 3. Update analytics
    // 4. Potentially trigger model retraining pipeline

    // Check for critical feedback (safety issues or very low ratings)
    if (feedback.category === 'safety' || feedback.rating <= 2) {
      console.warn('[AI Feedback] Critical feedback received:', {
        id: feedback.id,
        category: feedback.category,
        rating: feedback.rating,
        issues: feedback.issues,
        comment: feedback.comment
      });

      // In production, send alert to administrators
      // await sendCriticalFeedbackAlert(feedback);
    }

    // Return success response
    return {
      success: true,
      message: 'Feedback submitted successfully',
      feedbackId: feedback.id
    };

  } catch (error) {
    console.error('[AI Feedback] Error processing feedback:', error);

    // Re-throw HTTP errors
    if ((error as any).statusCode) {
      throw error;
    }

    // Handle unexpected errors
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: 'Failed to process feedback'
    });
  }
});

// ============================================
// GET endpoint for retrieving feedback
// ============================================

export const GET = defineEventHandler(async (event: H3Event) => {
  const query = getQuery(event);
  
  // Filter by session if provided
  if (query.sessionId) {
    const sessionFeedback = Array.from(feedbackStore.values())
      .filter(f => f.sessionId === query.sessionId);
    return {
      success: true,
      feedback: sessionFeedback
    };
  }

  // Return all feedback (with pagination in production)
  return {
    success: true,
    feedback: Array.from(feedbackStore.values()),
    total: feedbackStore.size
  };
});
