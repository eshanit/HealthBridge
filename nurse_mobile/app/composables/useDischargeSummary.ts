/**
 * Discharge Summary Composable
 * 
 * Phase 2.3 Task 2.3.1: AI-generated discharge summaries
 * Phase 2.3 Task 2.3.2: Clinical handover generation
 * Phase 2.3 Task 2.3.3: Follow-up reminder generation
 */

import { ref, computed, type Ref } from 'vue';
import { streamClinicalAI, askClinicalAI } from '~/services/clinicalAI';
import type { ExplainabilityRecord, AIUseCase } from '~/types/explainability';
import type { ClinicalFormInstance } from '~/types/clinical-form';

// ============================================
// Types & Interfaces
// ============================================

/**
 * Discharge summary data structure
 */
export interface DischargeSummary {
  chiefComplaint: string;
  keyFindings: string[];
  diagnosis: string;
  treatmentProvided: string[];
  followUpPlan: string;
  returnPrecautions: string[];
  generatedAt: string;
  aiGenerated: boolean;
}

/**
 * Clinical handover in SBAR format
 */
export interface ClinicalHandover {
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
  generatedAt: string;
  aiGenerated: boolean;
}

/**
 * Follow-up reminder
 */
export interface FollowUpReminder {
  followUpDate: Date;
  reminderType: 'appointment' | 'medication_completion' | 'symptom_check';
  instructions: string;
  warningSigns: string[];
  aiGenerated: boolean;
}

/**
 * Session data for summary generation
 */
export interface SessionSummaryData {
  sessionId: string;
  patientName: string;
  patientAgeMonths: number;
  patientGender: string;
  triagePriority: 'red' | 'yellow' | 'green';
  assessmentAnswers: Record<string, unknown>;
  treatmentAnswers?: Record<string, unknown>;
  recommendedActions?: string[];
}

/**
 * Composable options
 */
export interface UseDischargeSummaryOptions {
  /** Enable streaming for better UX */
  enableStreaming?: boolean;
  /** Auto-generate on session complete */
  autoGenerate?: boolean;
}

// ============================================
// Composable Implementation
// ============================================

export function useDischargeSummary(options: UseDischargeSummaryOptions = {}) {
  const { enableStreaming = true, autoGenerate = false } = options;

  // State
  const isGeneratingSummary = ref(false);
  const isGeneratingHandover = ref(false);
  const isGeneratingFollowUp = ref(false);
  
  const dischargeSummary = ref<DischargeSummary | null>(null);
  const clinicalHandover = ref<ClinicalHandover | null>(null);
  const followUpReminder = ref<FollowUpReminder | null>(null);
  
  // Streaming state
  const streamingText = ref('');
  const streamingProgress = ref(0);
  
  // Error state
  const error = ref<string | null>(null);

  // ============================================
  // Discharge Summary Generation (Task 2.3.1)
  // ============================================

  async function generateDischargeSummary(
    sessionData: SessionSummaryData,
    explainability: ExplainabilityRecord
  ): Promise<DischargeSummary> {
    isGeneratingSummary.value = true;
    error.value = null;
    streamingText.value = '';
    streamingProgress.value = 0;

    try {
      let response: string;

      if (enableStreaming) {
        response = await generateWithStreaming('NOTE_SUMMARY', explainability);
      } else {
        response = await askClinicalAI('NOTE_SUMMARY', explainability);
      }

      // Parse the response into structured format
      const summary = parseDischargeSummary(response, sessionData);
      dischargeSummary.value = summary;
      
      return summary;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate discharge summary';
      error.value = errorMessage;
      throw new Error(errorMessage);
    } finally {
      isGeneratingSummary.value = false;
    }
  }

  /**
   * Parse AI response into structured discharge summary
   */
  function parseDischargeSummary(response: string, sessionData: SessionSummaryData): DischargeSummary {
    // Extract sections from response
    const sections = {
      chiefComplaint: extractSection(response, ['chief complaint', 'presenting complaint', 'reason for visit']),
      keyFindings: extractBulletPoints(response, ['key findings', 'findings', 'examination']),
      diagnosis: extractSection(response, ['diagnosis', 'classification', 'assessment']),
      treatmentProvided: extractBulletPoints(response, ['treatment', 'management', 'interventions']),
      followUpPlan: extractSection(response, ['follow-up', 'follow up', 'plan']),
      returnPrecautions: extractBulletPoints(response, ['return', 'warning signs', 'precautions'])
    };

    return {
      chiefComplaint: sections.chiefComplaint || sessionData.triagePriority + ' priority case',
      keyFindings: sections.keyFindings.length > 0 ? sections.keyFindings : ['See assessment details'],
      diagnosis: sections.diagnosis || sessionData.triagePriority.toUpperCase() + ' triage classification',
      treatmentProvided: sections.treatmentProvided.length > 0 ? sections.treatmentProvided : (sessionData.recommendedActions || []),
      followUpPlan: sections.followUpPlan || 'Follow up as per protocol',
      returnPrecautions: sections.returnPrecautions.length > 0 ? sections.returnPrecautions : ['Return if symptoms worsen'],
      generatedAt: new Date().toISOString(),
      aiGenerated: true
    };
  }

  // ============================================
  // Clinical Handover Generation (Task 2.3.2)
  // ============================================

  async function generateClinicalHandover(
    sessionData: SessionSummaryData,
    explainability: ExplainabilityRecord
  ): Promise<ClinicalHandover> {
    isGeneratingHandover.value = true;
    error.value = null;
    streamingText.value = '';
    streamingProgress.value = 0;

    try {
      let response: string;

      if (enableStreaming) {
        response = await generateWithStreaming('CLINICAL_HANDOVER', explainability);
      } else {
        response = await askClinicalAI('CLINICAL_HANDOVER', explainability);
      }

      // Parse SBAR format
      const handover = parseSBAR(response, sessionData);
      clinicalHandover.value = handover;
      
      return handover;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate clinical handover';
      error.value = errorMessage;
      throw new Error(errorMessage);
    } finally {
      isGeneratingHandover.value = false;
    }
  }

  /**
   * Parse AI response into SBAR format
   */
  function parseSBAR(response: string, sessionData: SessionSummaryData): ClinicalHandover {
    return {
      situation: extractSection(response, ['situation', 's:']) || 
                 `${sessionData.patientName}, ${sessionData.patientAgeMonths} months old, ${sessionData.triagePriority} priority`,
      background: extractSection(response, ['background', 'b:']) ||
                  `Patient presented for assessment. Relevant history from examination.`,
      assessment: extractSection(response, ['assessment', 'a:']) ||
                 `Triage classification: ${sessionData.triagePriority.toUpperCase()}`,
      recommendation: extractSection(response, ['recommendation', 'r:']) ||
                     'Continue monitoring and follow protocol for triage level.',
      generatedAt: new Date().toISOString(),
      aiGenerated: true
    };
  }

  // ============================================
  // Follow-up Reminder Generation (Task 2.3.3)
  // ============================================

  async function generateFollowUpReminder(
    sessionData: SessionSummaryData,
    explainability: ExplainabilityRecord
  ): Promise<FollowUpReminder> {
    isGeneratingFollowUp.value = true;
    error.value = null;

    try {
      // Calculate follow-up date based on priority
      const followUpDate = calculateFollowUpDate(sessionData.triagePriority);
      
      // Generate warning signs from AI
      const response = await askClinicalAI('CARE_EDUCATION', explainability);
      const warningSigns = extractBulletPoints(response, ['warning', 'return', 'worsen', 'emergency']);

      const reminder: FollowUpReminder = {
        followUpDate,
        reminderType: 'appointment',
        instructions: generateFollowUpInstructions(sessionData.triagePriority),
        warningSigns: warningSigns.length > 0 ? warningSigns : [
          'Return immediately if condition worsens',
          'Seek care if unable to drink or eat',
          'Watch for difficulty breathing',
          'Monitor for high fever'
        ],
        aiGenerated: true
      };

      followUpReminder.value = reminder;
      return reminder;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate follow-up reminder';
      error.value = errorMessage;
      throw new Error(errorMessage);
    } finally {
      isGeneratingFollowUp.value = false;
    }
  }

  /**
   * Calculate follow-up date based on triage priority
   */
  function calculateFollowUpDate(priority: 'red' | 'yellow' | 'green'): Date {
    const date = new Date();
    
    switch (priority) {
      case 'red':
        // Next day for red priority
        date.setDate(date.getDate() + 1);
        break;
      case 'yellow':
        // 2-3 days for yellow
        date.setDate(date.getDate() + 2);
        break;
      case 'green':
        // 1 week for green
        date.setDate(date.getDate() + 7);
        break;
    }
    
    return date;
  }

  /**
   * Generate follow-up instructions based on priority
   */
  function generateFollowUpInstructions(priority: 'red' | 'yellow' | 'green'): string {
    switch (priority) {
      case 'red':
        return 'Urgent follow-up required within 24 hours. Patient should return to clinic or hospital immediately if symptoms worsen.';
      case 'yellow':
        return 'Follow-up appointment recommended within 2-3 days. Return sooner if symptoms worsen or new symptoms develop.';
      case 'green':
        return 'Routine follow-up in 1 week. Return if symptoms persist or worsen.';
    }
  }

  // ============================================
  // Helper Functions
  // ============================================

  /**
   * Generate with streaming
   */
  async function generateWithStreaming(
    useCase: AIUseCase,
    explainability: ExplainabilityRecord
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      streamClinicalAI(useCase, explainability, {
        onChunk: (chunk) => {
          streamingText.value += chunk;
        },
        onProgress: (tokens, total) => {
          streamingProgress.value = total > 0 ? (tokens / total) * 100 : 50;
        },
        onComplete: (fullResponse) => {
          resolve(fullResponse);
        },
        onError: (err, recoverable) => {
          reject(new Error(err));
        }
      });
    });
  }

  /**
   * Extract a section from text by looking for headers
   */
  function extractSection(text: string, headers: string[]): string {
    const lowerText = text.toLowerCase();
    
    for (const header of headers) {
      const startIndex = lowerText.indexOf(header);
      if (startIndex !== -1) {
        // Find the content after the header
        const contentStart = text.indexOf(':', startIndex) + 1 || startIndex + header.length;
        
        // Find the next section (look for newline followed by word and colon)
        const nextSectionMatch = text.slice(contentStart).match(/\n\s*\w+[\s]*:/);
        const endIndex = nextSectionMatch && nextSectionMatch.index !== undefined
          ? contentStart + nextSectionMatch.index 
          : text.length;
        
        return text.slice(contentStart, endIndex).trim();
      }
    }
    
    return '';
  }

  /**
   * Extract bullet points from text
   */
  function extractBulletPoints(text: string, headers: string[]): string[] {
    const section = extractSection(text, headers);
    if (!section) return [];
    
    // Split by common bullet point patterns
    const bullets = section
      .split(/[\n•\-\*]\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.match(/^[\d]+\.?\s*$/)); // Remove empty and number-only lines
    
    return bullets;
  }

  /**
   * Reset all state
   */
  function reset() {
    dischargeSummary.value = null;
    clinicalHandover.value = null;
    followUpReminder.value = null;
    streamingText.value = '';
    streamingProgress.value = 0;
    error.value = null;
  }

  // ============================================
  // Return API
  // ============================================

  return {
    // State
    isGeneratingSummary,
    isGeneratingHandover,
    isGeneratingFollowUp,
    dischargeSummary,
    clinicalHandover,
    followUpReminder,
    streamingText,
    streamingProgress,
    error,
    
    // Methods
    generateDischargeSummary,
    generateClinicalHandover,
    generateFollowUpReminder,
    reset
  };
}

export default useDischargeSummary;
