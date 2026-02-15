/**
 * AI Feedback Composable
 * 
 * Phase 3.3 Task 3.3.1: Quality Assurance & Feedback
 * Provides functionality for collecting and managing AI feedback
 */

import { ref, computed } from 'vue';
import type { Ref } from 'vue';

// ============================================
// Types & Interfaces
// ============================================

/**
 * Feedback rating scale
 */
export type FeedbackRating = 1 | 2 | 3 | 4 | 5;

/**
 * Feedback category
 */
export type FeedbackCategory = 
  | 'accuracy'
  | 'relevance'
  | 'clarity'
  | 'safety'
  | 'helpfulness'
  | 'completeness';

/**
 * Feedback status
 */
export type FeedbackStatus = 'pending' | 'submitted' | 'acknowledged' | 'resolved';

/**
 * AI feedback item
 */
export interface AIFeedbackItem {
  id: string;
  sessionId: string;
  sectionId: string;
  responseId: string;
  category: FeedbackCategory;
  rating: FeedbackRating;
  comment?: string;
  issues?: string[];
  suggestions?: string;
  timestamp: string;
  status: FeedbackStatus;
  nurseId?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolution?: string;
}

/**
 * Feedback statistics
 */
export interface FeedbackStatistics {
  totalFeedback: number;
  averageRating: number;
  categoryBreakdown: Record<FeedbackCategory, { count: number; averageRating: number }>;
  recentTrend: 'improving' | 'stable' | 'declining';
  topIssues: Array<{ issue: string; count: number }>;
}

/**
 * Feedback filter options
 */
export interface FeedbackFilter {
  sessionId?: string;
  category?: FeedbackCategory;
  minRating?: FeedbackRating;
  maxRating?: FeedbackRating;
  status?: FeedbackStatus;
  startDate?: string;
  endDate?: string;
}

/**
 * Options for useAIFeedback composable
 */
export interface UseAIFeedbackOptions {
  /** Auto-submit feedback */
  autoSubmit?: boolean;
  /** Store feedback locally */
  persistLocally?: boolean;
  /** Callback when feedback is submitted */
  onFeedbackSubmitted?: (feedback: AIFeedbackItem) => void;
}

/**
 * Feedback issue type
 */
export interface FeedbackIssue {
  id: string;
  label: string;
  description: string;
  category: FeedbackCategory;
}

// ============================================
// Constants
// ============================================

/**
 * Predefined feedback issues
 */
export const FEEDBACK_ISSUES: FeedbackIssue[] = [
  {
    id: 'incorrect_medical',
    label: 'Incorrect Medical Information',
    description: 'The AI provided medically inaccurate information',
    category: 'accuracy'
  },
  {
    id: 'missed_danger_sign',
    label: 'Missed Danger Sign',
    description: 'AI failed to identify or properly flag a danger sign',
    category: 'safety'
  },
  {
    id: 'irrelevant_response',
    label: 'Irrelevant Response',
    description: 'Response was not relevant to the clinical context',
    category: 'relevance'
  },
  {
    id: 'unclear_language',
    label: 'Unclear Language',
    description: 'Response was difficult to understand',
    category: 'clarity'
  },
  {
    id: 'incomplete_info',
    label: 'Incomplete Information',
    description: 'Response was missing important information',
    category: 'completeness'
  },
  {
    id: 'not_helpful',
    label: 'Not Helpful',
    description: 'Response did not help with clinical decision-making',
    category: 'helpfulness'
  },
  {
    id: 'missed_protocol',
    label: 'Missed Protocol Step',
    description: 'AI did not follow WHO IMCI protocol correctly',
    category: 'accuracy'
  },
  {
    id: 'wrong_priority',
    label: 'Wrong Triage Priority',
    description: 'AI suggested incorrect triage classification',
    category: 'safety'
  }
];

/**
 * Category labels for display
 */
export const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  accuracy: 'Accuracy',
  relevance: 'Relevance',
  clarity: 'Clarity',
  safety: 'Safety',
  helpfulness: 'Helpfulness',
  completeness: 'Completeness'
};

/**
 * Rating descriptions
 */
export const RATING_DESCRIPTIONS: Record<FeedbackRating, string> = {
  1: 'Very Poor - Significant issues that could affect patient safety',
  2: 'Poor - Multiple issues that reduce clinical value',
  3: 'Average - Acceptable but could be improved',
  4: 'Good - Minor issues, generally helpful',
  5: 'Excellent - Accurate, clear, and clinically valuable'
};

// ============================================
// Local Storage Helper
// ============================================

const FEEDBACK_STORAGE_KEY = 'healthbridge_ai_feedback';

function loadLocalFeedback(): AIFeedbackItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveLocalFeedback(feedback: AIFeedbackItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(feedback));
  } catch (e) {
    console.error('[useAIFeedback] Failed to save feedback:', e);
  }
}

// ============================================
// Composable Implementation
// ============================================

export function useAIFeedback(options: UseAIFeedbackOptions = {}) {
  const {
    autoSubmit = false,
    persistLocally = true,
    onFeedbackSubmitted
  } = options;

  // ============================================
  // State
  // ============================================

  const feedbackHistory: Ref<AIFeedbackItem[]> = ref([]);
  const pendingFeedback: Ref<Partial<AIFeedbackItem> | null> = ref(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Initialize from local storage
  if (persistLocally && typeof window !== 'undefined') {
    feedbackHistory.value = loadLocalFeedback();
  }

  // ============================================
  // Computed
  // ============================================

  const totalFeedback = computed(() => feedbackHistory.value.length);

  const averageRating = computed(() => {
    if (feedbackHistory.value.length === 0) return 0;
    const sum = feedbackHistory.value.reduce((acc, f) => acc + f.rating, 0);
    return Math.round((sum / feedbackHistory.value.length) * 10) / 10;
  });

  const recentFeedback = computed(() => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return feedbackHistory.value.filter(
      f => new Date(f.timestamp) >= oneWeekAgo
    );
  });

  const feedbackByCategory = computed(() => {
    const breakdown: Record<FeedbackCategory, AIFeedbackItem[]> = {
      accuracy: [],
      relevance: [],
      clarity: [],
      safety: [],
      helpfulness: [],
      completeness: []
    };
    
    for (const feedback of feedbackHistory.value) {
      breakdown[feedback.category].push(feedback);
    }
    
    return breakdown;
  });

  const statistics = computed<FeedbackStatistics>(() => {
    const categoryBreakdown: Record<FeedbackCategory, { count: number; averageRating: number }> = {
      accuracy: { count: 0, averageRating: 0 },
      relevance: { count: 0, averageRating: 0 },
      clarity: { count: 0, averageRating: 0 },
      safety: { count: 0, averageRating: 0 },
      helpfulness: { count: 0, averageRating: 0 },
      completeness: { count: 0, averageRating: 0 }
    };

    // Calculate category statistics
    for (const [category, items] of Object.entries(feedbackByCategory.value)) {
      if (items.length > 0) {
        const sum = items.reduce((acc, f) => acc + f.rating, 0);
        categoryBreakdown[category as FeedbackCategory] = {
          count: items.length,
          averageRating: Math.round((sum / items.length) * 10) / 10
        };
      }
    }

    // Calculate trend (compare last 7 days to previous 7 days)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const previousWeek = feedbackHistory.value.filter(
      f => new Date(f.timestamp) >= twoWeeksAgo && new Date(f.timestamp) < oneWeekAgo
    );
    const currentWeek = feedbackHistory.value.filter(
      f => new Date(f.timestamp) >= oneWeekAgo
    );

    let recentTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (previousWeek.length > 0 && currentWeek.length > 0) {
      const prevAvg = previousWeek.reduce((acc, f) => acc + f.rating, 0) / previousWeek.length;
      const currAvg = currentWeek.reduce((acc, f) => acc + f.rating, 0) / currentWeek.length;
      if (currAvg > prevAvg + 0.3) recentTrend = 'improving';
      else if (currAvg < prevAvg - 0.3) recentTrend = 'declining';
    }

    // Calculate top issues
    const issueCounts: Record<string, number> = {};
    for (const feedback of feedbackHistory.value) {
      if (feedback.issues) {
        for (const issue of feedback.issues) {
          issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        }
      }
    }
    const topIssues = Object.entries(issueCounts)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalFeedback: feedbackHistory.value.length,
      averageRating: averageRating.value,
      categoryBreakdown,
      recentTrend,
      topIssues
    };
  });

  // ============================================
  // Methods
  // ============================================

  /**
   * Start collecting feedback for a response
   */
  function startFeedback(
    sessionId: string,
    sectionId: string,
    responseId: string
  ): void {
    pendingFeedback.value = {
      sessionId,
      sectionId,
      responseId,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
  }

  /**
   * Set the category for pending feedback
   */
  function setCategory(category: FeedbackCategory): void {
    if (pendingFeedback.value) {
      pendingFeedback.value.category = category;
    }
  }

  /**
   * Set the rating for pending feedback
   */
  function setRating(rating: FeedbackRating): void {
    if (pendingFeedback.value) {
      pendingFeedback.value.rating = rating;
    }
  }

  /**
   * Set the comment for pending feedback
   */
  function setComment(comment: string): void {
    if (pendingFeedback.value) {
      pendingFeedback.value.comment = comment;
    }
  }

  /**
   * Toggle an issue in pending feedback
   */
  function toggleIssue(issueId: string): void {
    if (!pendingFeedback.value) return;
    
    const issues = pendingFeedback.value.issues || [];
    const index = issues.indexOf(issueId);
    
    if (index === -1) {
      pendingFeedback.value.issues = [...issues, issueId];
    } else {
      pendingFeedback.value.issues = issues.filter(i => i !== issueId);
    }
  }

  /**
   * Set suggestions for pending feedback
   */
  function setSuggestions(suggestions: string): void {
    if (pendingFeedback.value) {
      pendingFeedback.value.suggestions = suggestions;
    }
  }

  /**
   * Submit the pending feedback
   */
  async function submitFeedback(): Promise<AIFeedbackItem | null> {
    if (!pendingFeedback.value) {
      error.value = 'No pending feedback to submit';
      return null;
    }

    if (!pendingFeedback.value.category || !pendingFeedback.value.rating) {
      error.value = 'Category and rating are required';
      return null;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const feedback: AIFeedbackItem = {
        id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        sessionId: pendingFeedback.value.sessionId!,
        sectionId: pendingFeedback.value.sectionId!,
        responseId: pendingFeedback.value.responseId!,
        category: pendingFeedback.value.category,
        rating: pendingFeedback.value.rating,
        comment: pendingFeedback.value.comment,
        issues: pendingFeedback.value.issues,
        suggestions: pendingFeedback.value.suggestions,
        timestamp: pendingFeedback.value.timestamp!,
        status: 'submitted'
      };

      // Add to history
      feedbackHistory.value.unshift(feedback);

      // Save to local storage
      if (persistLocally) {
        saveLocalFeedback(feedbackHistory.value);
      }

      // Submit to server
      try {
        await $fetch('/api/ai/feedback', {
          method: 'POST',
          body: feedback
        });
      } catch (e) {
        console.warn('[useAIFeedback] Server submission failed, feedback saved locally:', e);
      }

      // Clear pending feedback
      pendingFeedback.value = null;

      // Callback
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted(feedback);
      }

      return feedback;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to submit feedback';
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Cancel pending feedback
   */
  function cancelFeedback(): void {
    pendingFeedback.value = null;
    error.value = null;
  }

  /**
   * Quick feedback with just a rating
   */
  async function quickFeedback(
    sessionId: string,
    sectionId: string,
    responseId: string,
    rating: FeedbackRating,
    category: FeedbackCategory = 'helpfulness'
  ): Promise<AIFeedbackItem | null> {
    startFeedback(sessionId, sectionId, responseId);
    setCategory(category);
    setRating(rating);
    return submitFeedback();
  }

  /**
   * Get feedback by session ID
   */
  function getFeedbackBySession(sessionId: string): AIFeedbackItem[] {
    return feedbackHistory.value.filter(f => f.sessionId === sessionId);
  }

  /**
   * Get feedback by filter
   */
  function getFilteredFeedback(filter: FeedbackFilter): AIFeedbackItem[] {
    return feedbackHistory.value.filter(f => {
      if (filter.sessionId && f.sessionId !== filter.sessionId) return false;
      if (filter.category && f.category !== filter.category) return false;
      if (filter.minRating && f.rating < filter.minRating) return false;
      if (filter.maxRating && f.rating > filter.maxRating) return false;
      if (filter.status && f.status !== filter.status) return false;
      if (filter.startDate && new Date(f.timestamp) < new Date(filter.startDate)) return false;
      if (filter.endDate && new Date(f.timestamp) > new Date(filter.endDate)) return false;
      return true;
    });
  }

  /**
   * Clear all feedback history
   */
  function clearHistory(): void {
    feedbackHistory.value = [];
    if (persistLocally) {
      saveLocalFeedback([]);
    }
  }

  /**
   * Clear error
   */
  function clearError(): void {
    error.value = null;
  }

  /**
   * Get issue by ID
   */
  function getIssueById(issueId: string): FeedbackIssue | undefined {
    return FEEDBACK_ISSUES.find(i => i.id === issueId);
  }

  /**
   * Get issues by category
   */
  function getIssuesByCategory(category: FeedbackCategory): FeedbackIssue[] {
    return FEEDBACK_ISSUES.filter(i => i.category === category);
  }

  // ============================================
  // Return
  // ============================================

  return {
    // State
    feedbackHistory,
    pendingFeedback,
    isLoading,
    error,

    // Computed
    totalFeedback,
    averageRating,
    recentFeedback,
    feedbackByCategory,
    statistics,

    // Methods
    startFeedback,
    setCategory,
    setRating,
    setComment,
    toggleIssue,
    setSuggestions,
    submitFeedback,
    cancelFeedback,
    quickFeedback,
    getFeedbackBySession,
    getFilteredFeedback,
    clearHistory,
    clearError,
    getIssueById,
    getIssuesByCategory,

    // Constants
    FEEDBACK_ISSUES,
    CATEGORY_LABELS,
    RATING_DESCRIPTIONS
  };
}
