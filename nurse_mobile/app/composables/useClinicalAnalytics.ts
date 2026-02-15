/**
 * Clinical Analytics Composable
 * 
 * Phase 3.4 Task 3.4.1: Analytics & Insights
 * Provides clinical analytics and insights for AI-assisted assessments
 */

import { ref, computed, watch } from 'vue';
import type { Ref, ComputedRef } from 'vue';

// ============================================
// Types & Interfaces
// ============================================

/**
 * Time period for analytics
 */
export type TimePeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';

/**
 * Triage priority counts
 */
export interface TriageDistribution {
  emergency: number;
  urgent: number;
  priority: number;
  routine: number;
  total: number;
}

/**
 * Age group distribution
 */
export interface AgeGroupDistribution {
  neonate: number;  // 0-28 days
  infant: number;   // 1-12 months
  toddler: number;  // 12-36 months
  preschool: number; // 36-60 months
  schoolAge: number; // 60+ months
  total: number;
}

/**
 * AI performance metrics
 */
export interface AIPerformanceMetrics {
  totalInteractions: number;
  averageResponseTime: number;
  averageRating: number;
  totalFeedback: number;
  positiveFeedbackPercent: number;
  safetyIssuesCount: number;
  accuracyScore: number;
  helpfulnessScore: number;
}

/**
 * Clinical outcome metrics
 */
export interface ClinicalOutcomeMetrics {
  totalAssessments: number;
  completedAssessments: number;
  averageCompletionTime: number;
  referralRate: number;
  followUpRate: number;
  dangerSignDetectionRate: number;
}

/**
 * Trend data point
 */
export interface TrendDataPoint {
  date: string;
  value: number;
  label?: string;
}

/**
 * Analytics filter
 */
export interface AnalyticsFilter {
  period: TimePeriod;
  startDate?: string;
  endDate?: string;
  nurseId?: string;
  facilityId?: string;
  schemaId?: string;
}

/**
 * Analytics summary
 */
export interface AnalyticsSummary {
  triageDistribution: TriageDistribution;
  ageGroupDistribution: AgeGroupDistribution;
  aiPerformance: AIPerformanceMetrics;
  clinicalOutcomes: ClinicalOutcomeMetrics;
  trends: {
    assessments: TrendDataPoint[];
    triage: TrendDataPoint[];
    feedback: TrendDataPoint[];
  };
  topDiagnoses: Array<{ diagnosis: string; count: number; percent: number }>;
  topTreatments: Array<{ treatment: string; count: number; percent: number }>;
  generatedAt: string;
}

/**
 * Session data for analytics
 */
export interface SessionAnalyticsData {
  id: string;
  createdAt: string;
  completedAt?: string;
  patientAgeMonths: number;
  triagePriority: string;
  triageClassification: string;
  dangerSignsCount: number;
  aiInteractions: number;
  aiResponseTime: number;
  feedbackRating?: number;
  feedbackCategory?: string;
  nurseId: string;
  facilityId?: string;
  schemaId: string;
  status: string;
}

// ============================================
// Constants
// ============================================

const ANALYTICS_STORAGE_KEY = 'healthbridge_analytics';
const SESSION_DATA_KEY = 'healthbridge_session_analytics';

// ============================================
// Helper Functions
// ============================================

/**
 * Get date range for time period
 */
function getDateRange(period: TimePeriod): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (period) {
    case 'day':
      start.setDate(start.getDate() - 1);
      break;
    case 'week':
      start.setDate(start.getDate() - 7);
      break;
    case 'month':
      start.setMonth(start.getMonth() - 1);
      break;
    case 'quarter':
      start.setMonth(start.getMonth() - 3);
      break;
    case 'year':
      start.setFullYear(start.getFullYear() - 1);
      break;
  }

  return { start, end };
}

/**
 * Get age group from age in months
 */
function getAgeGroup(ageMonths: number): keyof AgeGroupDistribution {
  if (ageMonths <= 1) return 'neonate';
  if (ageMonths <= 12) return 'infant';
  if (ageMonths <= 36) return 'toddler';
  if (ageMonths <= 60) return 'preschool';
  return 'schoolAge';
}

/**
 * Load session data from local storage
 */
function loadSessionData(): SessionAnalyticsData[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(SESSION_DATA_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save session data to local storage
 */
function saveSessionData(data: SessionAnalyticsData[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSION_DATA_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('[useClinicalAnalytics] Failed to save session data:', e);
  }
}

// ============================================
// Composable Implementation
// ============================================

export function useClinicalAnalytics(initialFilter?: AnalyticsFilter) {
  // ============================================
  // State
  // ============================================

  const filter: Ref<AnalyticsFilter> = ref(initialFilter || {
    period: 'week'
  });

  const sessionData: Ref<SessionAnalyticsData[]> = ref([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Initialize from local storage
  if (typeof window !== 'undefined') {
    sessionData.value = loadSessionData();
  }

  // ============================================
  // Computed
  // ============================================

  const filteredSessions: ComputedRef<SessionAnalyticsData[]> = computed(() => {
    const { start, end } = getDateRange(filter.value.period);
    
    return sessionData.value.filter(session => {
      const sessionDate = new Date(session.createdAt);
      
      // Date filter
      if (sessionDate < start || sessionDate > end) return false;
      
      // Custom date range
      if (filter.value.startDate && sessionDate < new Date(filter.value.startDate)) return false;
      if (filter.value.endDate && sessionDate > new Date(filter.value.endDate)) return false;
      
      // Nurse filter
      if (filter.value.nurseId && session.nurseId !== filter.value.nurseId) return false;
      
      // Facility filter
      if (filter.value.facilityId && session.facilityId !== filter.value.facilityId) return false;
      
      // Schema filter
      if (filter.value.schemaId && session.schemaId !== filter.value.schemaId) return false;
      
      return true;
    });
  });

  const triageDistribution: ComputedRef<TriageDistribution> = computed(() => {
    const distribution: TriageDistribution = {
      emergency: 0,
      urgent: 0,
      priority: 0,
      routine: 0,
      total: 0
    };

    for (const session of filteredSessions.value) {
      const priority = session.triagePriority?.toLowerCase();
      if (priority === 'emergency' || priority === 'red') {
        distribution.emergency++;
      } else if (priority === 'urgent' || priority === 'orange' || priority === 'yellow') {
        distribution.urgent++;
      } else if (priority === 'priority' || priority === 'green') {
        distribution.priority++;
      } else {
        distribution.routine++;
      }
      distribution.total++;
    }

    return distribution;
  });

  const ageGroupDistribution: ComputedRef<AgeGroupDistribution> = computed(() => {
    const distribution: AgeGroupDistribution = {
      neonate: 0,
      infant: 0,
      toddler: 0,
      preschool: 0,
      schoolAge: 0,
      total: 0
    };

    for (const session of filteredSessions.value) {
      const ageGroup = getAgeGroup(session.patientAgeMonths);
      distribution[ageGroup]++;
      distribution.total++;
    }

    return distribution;
  });

  const aiPerformance: ComputedRef<AIPerformanceMetrics> = computed(() => {
    let totalInteractions = 0;
    let totalResponseTime = 0;
    let totalRating = 0;
    let totalFeedback = 0;
    let positiveFeedback = 0;
    let safetyIssues = 0;
    let accuracySum = 0;
    let helpfulnessSum = 0;

    for (const session of filteredSessions.value) {
      totalInteractions += session.aiInteractions || 0;
      totalResponseTime += session.aiResponseTime || 0;

      if (session.feedbackRating) {
        totalFeedback++;
        totalRating += session.feedbackRating;
        if (session.feedbackRating >= 4) {
          positiveFeedback++;
        }
        if (session.feedbackCategory === 'safety') {
          safetyIssues++;
        }
        if (session.feedbackCategory === 'accuracy') {
          accuracySum += session.feedbackRating;
        }
        if (session.feedbackCategory === 'helpfulness') {
          helpfulnessSum += session.feedbackRating;
        }
      }
    }

    return {
      totalInteractions,
      averageResponseTime: totalInteractions > 0 ? Math.round(totalResponseTime / totalInteractions) : 0,
      averageRating: totalFeedback > 0 ? Math.round((totalRating / totalFeedback) * 10) / 10 : 0,
      totalFeedback,
      positiveFeedbackPercent: totalFeedback > 0 ? Math.round((positiveFeedback / totalFeedback) * 100) : 0,
      safetyIssuesCount: safetyIssues,
      accuracyScore: accuracySum > 0 ? Math.round((accuracySum / totalFeedback) * 10) / 10 : 0,
      helpfulnessScore: helpfulnessSum > 0 ? Math.round((helpfulnessSum / totalFeedback) * 10) / 10 : 0
    };
  });

  const clinicalOutcomes: ComputedRef<ClinicalOutcomeMetrics> = computed(() => {
    let totalAssessments = 0;
    let completedAssessments = 0;
    let totalCompletionTime = 0;
    let referrals = 0;
    let followUps = 0;
    let dangerSignsDetected = 0;

    for (const session of filteredSessions.value) {
      totalAssessments++;
      
      if (session.status === 'completed') {
        completedAssessments++;
        if (session.completedAt && session.createdAt) {
          const completionTime = new Date(session.completedAt).getTime() - new Date(session.createdAt).getTime();
          totalCompletionTime += completionTime;
        }
      }

      if (session.triagePriority === 'emergency' || session.triagePriority === 'urgent') {
        referrals++;
      }

      if (session.dangerSignsCount > 0) {
        dangerSignsDetected++;
      }
    }

    return {
      totalAssessments,
      completedAssessments,
      averageCompletionTime: completedAssessments > 0 ? Math.round(totalCompletionTime / completedAssessments / 1000 / 60) : 0, // in minutes
      referralRate: totalAssessments > 0 ? Math.round((referrals / totalAssessments) * 100) : 0,
      followUpRate: totalAssessments > 0 ? Math.round((followUps / totalAssessments) * 100) : 0,
      dangerSignDetectionRate: totalAssessments > 0 ? Math.round((dangerSignsDetected / totalAssessments) * 100) : 0
    };
  });

  const assessmentTrends: ComputedRef<TrendDataPoint[]> = computed(() => {
    const trends: Map<string, number> = new Map();
    
    for (const session of filteredSessions.value) {
      const date = new Date(session.createdAt).toISOString().split('T')[0];
      if (date) {
        trends.set(date, (trends.get(date) || 0) + 1);
      }
    }

    return Array.from(trends.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  });

  const summary: ComputedRef<AnalyticsSummary> = computed(() => {
    return {
      triageDistribution: triageDistribution.value,
      ageGroupDistribution: ageGroupDistribution.value,
      aiPerformance: aiPerformance.value,
      clinicalOutcomes: clinicalOutcomes.value,
      trends: {
        assessments: assessmentTrends.value,
        triage: [], // Would be populated from actual data
        feedback: [] // Would be populated from actual data
      },
      topDiagnoses: [], // Would be populated from actual data
      topTreatments: [], // Would be populated from actual data
      generatedAt: new Date().toISOString()
    };
  });

  // ============================================
  // Methods
  // ============================================

  /**
   * Record a new session for analytics
   */
  function recordSession(session: SessionAnalyticsData): void {
    sessionData.value.push(session);
    saveSessionData(sessionData.value);
  }

  /**
   * Update an existing session
   */
  function updateSession(sessionId: string, updates: Partial<SessionAnalyticsData>): void {
    const index = sessionData.value.findIndex(s => s.id === sessionId);
    if (index !== -1) {
      const existing = sessionData.value[index];
      if (existing) {
        sessionData.value[index] = {
          id: existing.id,
          createdAt: existing.createdAt,
          completedAt: updates.completedAt ?? existing.completedAt,
          patientAgeMonths: updates.patientAgeMonths ?? existing.patientAgeMonths,
          triagePriority: updates.triagePriority ?? existing.triagePriority,
          triageClassification: updates.triageClassification ?? existing.triageClassification,
          dangerSignsCount: updates.dangerSignsCount ?? existing.dangerSignsCount,
          aiInteractions: updates.aiInteractions ?? existing.aiInteractions,
          aiResponseTime: updates.aiResponseTime ?? existing.aiResponseTime,
          feedbackRating: updates.feedbackRating ?? existing.feedbackRating,
          feedbackCategory: updates.feedbackCategory ?? existing.feedbackCategory,
          nurseId: updates.nurseId ?? existing.nurseId,
          facilityId: updates.facilityId ?? existing.facilityId,
          schemaId: updates.schemaId ?? existing.schemaId,
          status: updates.status ?? existing.status
        };
        saveSessionData(sessionData.value);
      }
    }
  }

  /**
   * Set analytics filter
   */
  function setFilter(newFilter: Partial<AnalyticsFilter>): void {
    filter.value = {
      ...filter.value,
      ...newFilter
    };
  }

  /**
   * Clear analytics data
   */
  function clearData(): void {
    sessionData.value = [];
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_DATA_KEY);
    }
  }

  /**
   * Export analytics data as JSON
   */
  function exportData(): string {
    return JSON.stringify({
      sessions: sessionData.value,
      summary: summary.value,
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  /**
   * Import analytics data from JSON
   */
  function importData(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData);
      if (data.sessions && Array.isArray(data.sessions)) {
        sessionData.value = data.sessions;
        saveSessionData(sessionData.value);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Fetch analytics from server
   */
  async function fetchFromServer(): Promise<void> {
    isLoading.value = true;
    error.value = null;

    try {
      const response = await $fetch<{ sessions?: SessionAnalyticsData[] }>('/api/analytics/clinical', {
        method: 'GET',
        params: {
          period: filter.value.period,
          nurseId: filter.value.nurseId,
          facilityId: filter.value.facilityId,
          schemaId: filter.value.schemaId
        }
      });

      if (response && Array.isArray(response.sessions)) {
        sessionData.value = response.sessions;
        saveSessionData(sessionData.value);
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch analytics';
      console.error('[useClinicalAnalytics] Fetch error:', e);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Get session by ID
   */
  function getSession(sessionId: string): SessionAnalyticsData | undefined {
    return sessionData.value.find(s => s.id === sessionId);
  }

  /**
   * Get sessions by nurse ID
   */
  function getSessionsByNurse(nurseId: string): SessionAnalyticsData[] {
    return sessionData.value.filter(s => s.nurseId === nurseId);
  }

  /**
   * Calculate percentage
   */
  function calculatePercentage(value: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  }

  /**
   * Format duration in minutes
   */
  function formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  // ============================================
  // Return
  // ============================================

  return {
    // State
    filter,
    sessionData,
    isLoading,
    error,

    // Computed
    filteredSessions,
    triageDistribution,
    ageGroupDistribution,
    aiPerformance,
    clinicalOutcomes,
    assessmentTrends,
    summary,

    // Methods
    recordSession,
    updateSession,
    setFilter,
    clearData,
    exportData,
    importData,
    fetchFromServer,
    getSession,
    getSessionsByNurse,
    calculatePercentage,
    formatDuration
  };
}
