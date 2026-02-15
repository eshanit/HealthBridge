<script setup lang="ts">
/**
 * Dynamic Assessment Form Page
 * 
 * Handles loading and rendering clinical forms by schema and instance ID
 * Navigated to from session pages when advancing to assessment stage
 * 
 * Uses useAssessmentNavigation composable for state management-based patient data passing
 * Includes AI explainability integration for clinical decision support
 * 
 * Phase 3 Integration: Language Selector, Offline AI Fallback
 */

import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter, navigateTo } from '#app';
import { useClinicalFormEngine } from '~/composables/useClinicalFormEngine';
import { useAssessmentNavigation } from '~/composables/useAssessmentNavigation';
import { useReactiveAI, TRIGGER_FIELDS, type ClinicalInconsistency } from '~/composables/useReactiveAI';
import { useAIStore } from '~/stores/aiStore';
import { isAIEnabled, getAIConfig } from '~/services/aiConfig';
import { ollamaService, generateAINarrative } from '~/services/ollamaService';
import { streamClinicalAI, getAuditLog, type StreamingAuditEntry, type StreamingContext, type StructuredResponse } from '~/services/clinicalAI';
import { formEngine } from '@/services/formEngine';
import FieldRenderer from '~/components/clinical/fields/FieldRenderer.vue';
import ExplainabilityCard from '~/components/clinical/ExplainabilityCard.vue';
import AIStreamingPanel from '~/components/clinical/AIStreamingPanel.vue';
import AIStatusBadge from '~/components/clinical/AIStatusBadge.vue';
import { getClinicalTermDefinition, getPriorityLabel } from '~/services/explainabilityEngine';
import { logAIInteraction, logAIError, type AIInteractionDetails } from '~/services/auditLogger';
import type { ExplainabilityRecord } from '~/types/explainability';
import type { FormSection } from '~/types/clinical-form';

// Phase 3: Language and Offline Support
import { useTranslation, type TranslationLanguage } from '~/composables/useTranslation';
import { useOfflineAI } from '~/composables/useOfflineAI';

// ============================================
// Route & Router
// ============================================

const route = useRoute();
const router = useRouter();
const schemaId = computed(() => route.params.schemaId as string);
const formId = computed(() => route.params.formId as string);

// ============================================
// Navigation State Management
// ============================================

const { getNavigationState, clearNavigationState } = useAssessmentNavigation();

// Get patient data from navigation state (preferred) or query params (fallback)
const patientDataFromNavigation = computed(() => {
  const state = getNavigationState();
  if (state.schemaId === schemaId.value && state.formId === formId.value) {
    console.log('[Assessment] Using navigation state for patient data');
    return state.patientData || undefined;
  }
  return undefined;
});

const sessionIdFromNavigation = computed(() => {
  const state = getNavigationState();
  if (state.schemaId === schemaId.value && state.formId === formId.value) {
    return state.sessionId || undefined;
  }
  return undefined;
});

// Fallback to query params for backward compatibility
const patientDataFromQuery = computed(() => ({
  patientId: route.query.patientId as string | undefined,
  patientName: route.query.patientName as string | undefined,
  dateOfBirth: route.query.dateOfBirth as string | undefined,
  gender: route.query.gender as string | undefined
}));

// Use navigation state if available, otherwise fall back to query params
const patientData = computed(() => patientDataFromNavigation.value || patientDataFromQuery.value);
const sessionId = computed(() => sessionIdFromNavigation.value || (route.query.sessionId as string | undefined));

// Stable ref to preserve sessionId after navigation state is cleared
// Navigation state is one-time-use and cleared on mount, but sessionId is needed
// later for the assessment → treatment redirect
const resolvedSessionId = ref<string | undefined>(sessionIdFromNavigation.value || (route.query.sessionId as string | undefined));

// Debug: Log sessionId sources at setup
console.log('[Assessment] SessionId sources at setup:', {
  sessionIdFromNavigation: sessionIdFromNavigation.value,
  querySessionId: route.query.sessionId,
  resolvedSessionId: resolvedSessionId.value
});

// ============================================
// State
// ============================================

const validationError = ref<string | null>(null);
const showNavigationGuard = ref(false);
const blockedTransition = ref<{ from: string; to: string; reasons: string[] } | null>(null);

// ============================================
// AI State
// ============================================

const aiStore = useAIStore();
const explainabilityRecord = ref<ExplainabilityRecord | null>(null);
const showExplainability = ref(false);
const clinicalTermDefinitions = ref<Record<string, string>>({});

// ============================================
// Streaming AI State (Phase 2)
// ============================================

const isStreaming = ref(false);
const streamingResponse = ref('');
const streamingProgress = ref(0);
const streamingTokens = ref(0);
const streamingTotalTokens = ref(0); // Added for progress bar
const streamingMode = ref<'stream' | 'fallback' | null>(null);
const structuredAIResponse = ref<StructuredResponse | null>(null); // Phase 1: Structured response
let streamingCancel: (() => void) | null = null;

// ============================================
// Cumulative Summary State (Phase 3)
// ============================================

/**
 * Running cumulative summary across assessment sections
 * Each section's AI response contributes a one-sentence summary
 * that is passed to subsequent sections
 */
const cumulativeSummary = ref<string>('');

/**
 * Track which sections have been completed for summary generation
 */
const completedSections = ref<Set<string>>(new Set());

// ==========================================
// AI Request Lock (prevent concurrent streams)
// ==========================================

const isAILoading = ref(false);
let activeStreamCancel: (() => void) | null = null;

// ============================================
// Phase 3: Language & Offline Support
// ============================================

const { 
  currentTargetLanguage, 
  setTargetLanguage, 
  translateCaregiverInstructions 
} = useTranslation();

const {
  isOnline,
  isOfflineMode,
  getSectionResponse,
  buildPatientContext
} = useOfflineAI({
  onOfflineMode: () => {
    console.log('[Assessment] Switched to offline mode');
  },
  onOnlineMode: () => {
    console.log('[Assessment] Back online');
  }
});

const currentLanguage = ref<TranslationLanguage>('en');
const translatedInstructions = ref('');

// Language change handler
function handleLanguageChange() {
  setTargetLanguage(currentLanguage.value);
  console.log('[Assessment] Language changed to:', currentLanguage.value);
}

/**
 * Compute patient context with proper age calculation from DOB
 */
const patientContext = computed(() => {
  const answers = instance.value?.answers || {};
  
  // Calculate age from date of birth
  let ageMonths = 0;
  const dob = answers.patient_dob as string;
  if (dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    ageMonths = (today.getFullYear() - birthDate.getFullYear()) * 12 + (today.getMonth() - birthDate.getMonth());
    // Adjust if day of month is before birth day
    if (today.getDate() < birthDate.getDate()) {
      ageMonths--;
    }
    ageMonths = Math.max(0, ageMonths);
  }
  
  // Get weight from form answers
  const weightKg = (answers.patient_weight_kg as number) || 0;
  
  // Get gender from form answers
  const gender = (answers.patient_gender as string) || 'unknown';
  
  return {
    ageMonths,
    weightKg,
    gender,
    triagePriority: effectivePriority.value
  };
});

/**
 * Deduplicate cumulative summary to prevent AI repetition
 * Keeps only the last N sections to avoid context overflow
 */
function getDeduplicatedSummary(): string {
  const MAX_SECTIONS = 2; // Only keep last 2 sections to avoid repetition
  const summary = cumulativeSummary.value;
  if (!summary) return '';
  
  // Split by section markers
  const sections = summary.split(/(?=[A-Z][a-z]+:)/);
  
  if (sections.length <= MAX_SECTIONS) {
    return summary;
  }
  
  // Keep only the last N sections
  const recentSections = sections.slice(-MAX_SECTIONS);
  return recentSections.join('');
}

function addSectionSummary(sectionId: string, summary: string) {
  if (!summary || !summary.trim()) {
    console.log(`[Assessment] No summary to add for section: ${sectionId}`);
    return;
  }
  
  completedSections.value.add(sectionId);
  
  // Prepend section ID for traceability
  const sectionLabel = getSectionLabel(sectionId);
  const formattedSummary = `${sectionLabel}: ${summary}`;
  
  if (cumulativeSummary.value) {
    cumulativeSummary.value = `${cumulativeSummary.value} ${formattedSummary}`;
  } else {
    cumulativeSummary.value = formattedSummary;
  }
  
  console.log(`[Assessment] Added summary for ${sectionId}: "${summary.slice(0, 50)}..."`);
  console.log(`[Assessment] Cumulative summary length: ${cumulativeSummary.value.length} chars`);
}

/**
 * Get human-readable section label
 */
function getSectionLabel(sectionId: string): string {
  const labels: Record<string, string> = {
    'patient_info': 'Patient Info',
    'danger_signs': 'Danger Signs',
    'respiratory_danger': 'Respiratory Danger',
    'vitals': 'Vitals',
    'assessment': 'Physical Exam',
    'symptoms': 'Symptoms',
    'triage': 'Triage'
  };
  return labels[sectionId] || sectionId;
}

/**
 * Reset cumulative state for new assessment
 */
function resetCumulativeState() {
  cumulativeSummary.value = '';
  completedSections.value.clear();
  console.log('[Assessment] Cumulative state reset');
}

// Debug: View streaming audit log in console
function viewStreamingAuditLog() {
  const auditLog = getAuditLog();
  console.group('📊 Streaming Audit Log');
  console.table(auditLog);
  console.log('Total entries:', auditLog.length);
  console.groupEnd();
  return auditLog;
}

// Expose for browser console debugging
if (typeof window !== 'undefined') {
  (window as any).viewStreamingAuditLog = viewStreamingAuditLog;
}

// ============================================
// Reactive AI State
// ============================================

const reactiveAIGuidance = ref<Record<string, unknown> | null>(null);
const reactiveAIStatus = ref<'idle' | 'checking' | 'generating' | 'ready' | 'error'>('idle');
const reactiveAIInconsistencies = ref<ClinicalInconsistency[]>([]);
const showReactiveAIGuidance = ref(false);

// Note: useReactiveAI is initialized after effectivePriority is defined (see below)

// ============================================
// Initialize form engine with session context and patient data
// ============================================

const {
  schema,
  instance,
  isLoading,
  isSaving,
  currentSectionIndex,
  progress,
  triagePriority,
  validationErrors,
  initialize,
  saveField,
  getFieldValue,
  nextSection,
  previousSection,
  completeForm
} = useClinicalFormEngine({
  schemaId: schemaId.value,
  formId: formId.value,
  sessionId: resolvedSessionId.value || sessionId.value, // Use resolvedSessionId first as it's captured at setup
  patientData: patientData.value
});

// ============================================
// Computed
// ============================================

const formSections = computed(() => schema.value?.sections || []);

const currentSection = computed(() => {
  if (!schema.value?.sections || !instance.value) return undefined;
  return schema.value.sections[currentSectionIndex.value] as FormSection | undefined;
});

const currentFields = computed(() => {
  if (!currentSection.value || !instance.value || !schema.value) return [];
  return formEngine.getSectionFields(currentSection.value.id, instance.value, schema.value);
});

const isFirstSection = computed(() => currentSectionIndex.value === 0);
const isLastSection = computed(() => currentSectionIndex.value === formSections.value.length - 1);



// Computed to determine if navigation guard should show
// Only show when there are actual reasons to block
const shouldShowNavigationGuard = computed(() => {
  return showNavigationGuard.value && 
    blockedTransition.value !== null && 
    blockedTransition.value.reasons.length > 0;
});

// ============================================
// Danger Sign Detection for Priority Badge
// ============================================

/**
 * General danger signs that require urgent referral
 * These fields are checked regardless of the calculated triage priority
 */
const DANGER_SIGN_FIELDS = [
  'unable_to_drink',
  'vomits_everything', 
  'convulsions',
  'lethargic_unconscious',
  'lethargic_or_unconscious',
  'stridor',
  'stridor_in_calm_child',
  'wheezing',
  'cyanosis',
  'severe_respiratory_distress'
];

/**
 * Check if any danger sign is present in the current form data
 * This is reactive to answer changes via deep watcher on instance
 */
const hasDangerSign = computed(() => {
  if (!instance.value?.answers) return false;
  
  const answers = instance.value.answers;
  
  // Explicitly track each danger sign field for reactivity
  const hasAnyDanger = (
    answers.unable_to_drink === true ||
    answers.vomits_everything === true ||
    answers.convulsions === true ||
    answers.lethargic_unconscious === true ||
    answers.lethargic_or_unconscious === true ||
    answers.stridor === true ||
    answers.stridor_in_calm_child === true ||
    answers.wheezing === true ||
    answers.cyanosis === true ||
    answers.severe_respiratory_distress === true
  );
  
  if (hasAnyDanger) {
    console.log('[Priority] Danger sign detected!', {
      unable_to_drink: answers.unable_to_drink,
      convulsions: answers.convulsions,
      cyanosis: answers.cyanosis,
      lethargic: answers.lethargic_or_unconscious
    });
  }
  
  return hasAnyDanger;
});

/**
 * Get the effective priority considering danger signs
 * If any danger sign is present, priority is RED regardless of calculated value
 * This computed is explicitly dependent on hasDangerSign and triagePriority
 */
const effectivePriority = computed(() => {
  // Force dependency tracking
  const danger = hasDangerSign.value;
  const calculated = instance.value?.calculated;
  
  // Check danger signs first - this is the primary trigger for RED priority
  if (danger) {
    return 'red';
  }
  
  // Check for danger signs in calculated data (may be set during triage calculation)
  const calculatedDangerSigns = calculated?.dangerSigns;
  if (calculatedDangerSigns && Array.isArray(calculatedDangerSigns) && calculatedDangerSigns.length > 0) {
    return 'red';
  }
  
  // Fall back to calculated triage priority
  const priority = triagePriority.value;
  
  // Explicitly handle all priority levels with type safety
  if (priority === 'red') return 'red';
  if (priority === 'yellow') return 'yellow';
  if (priority === 'green' || priority === 'stable') return 'green';
  
  // If no priority is calculated yet, check form answers for early indicators
  const answers = instance.value?.answers;
  if (answers) {
    // Check for yellow indicators (fast breathing pneumonia)
    const respRate = answers.resp_rate as number | undefined;
    const ageMonths = answers.patient_age_months as number | undefined;
    
    if (respRate && ageMonths) {
      // WHO IMCI fast breathing thresholds
      const threshold = ageMonths < 12 ? 50 : 40;
      if (respRate >= threshold) {
        return 'yellow'; // Early indicator - likely pneumonia
      }
    }
  }
  
  // Default to green when no indicators found
  return 'green';
});

// Debug: Watch effectivePriority changes
const priorityDebug = ref({});
watch(effectivePriority, (newPriority, oldPriority) => {
  console.log(`[Priority] effectivePriority changed: ${oldPriority} -> ${newPriority}, hasDangerSign: ${hasDangerSign.value}`);
  priorityDebug.value = { newPriority, oldPriority, hasDangerSign: hasDangerSign.value };
});

// Force template update when effectivePriority changes
const priorityKey = computed(() => `${effectivePriority.value}-${hasDangerSign.value}`);

// ============================================
// Initialize Reactive AI (after effectivePriority is defined)
// ============================================

const {
  init: initReactiveAI,
  handleFieldChange: reactiveHandleFieldChange,
  askMedGemma,
  setAutoTrigger,
  autoTriggerEnabled,
  requestUpdate: requestReactiveAIUpdate,
  dismissGuidance: dismissReactiveAIGuidance,
  shouldUpdateAI
} = useReactiveAI({
  schemaId: schemaId.value,
  sessionId: resolvedSessionId.value,
  autoTriggerEnabled: false, // Disable auto-triggering - users must click "Ask MedGemma" button
  effectivePriority: effectivePriority, // Pass reactive priority computed from danger signs
  // Pass getter functions for reactive form state updates
  getFormState: () => instance.value?.answers || {},
  getCalculated: () => instance.value?.calculated || {},
  onGuidanceReady: (response) => {
    reactiveAIGuidance.value = response;
    showReactiveAIGuidance.value = true;
    console.log('[Assessment] Reactive AI guidance ready:', response);
  },
  onInconsistenciesFound: (inconsistencies) => {
    reactiveAIInconsistencies.value = inconsistencies;
    console.log('[Assessment] Inconsistencies detected:', inconsistencies.length);
  },
  onStatusChange: (status) => {
    reactiveAIStatus.value = status;
  }
});

// Handle "Ask MedGemma" button click
async function handleAskMedGemma() {
  console.log('[Assessment] Ask MedGemma button clicked');
  await askMedGemma();
}

/**
 * Check if current section is section 7 (Triage & Classification)
 */
const isSection7 = computed(() => {
  return currentSection.value?.id === 'triage';
});

/**
 * Check if we're in an earlier section (1-6) where reactive AI should show
 */
const showReactiveAIBeforeSection7 = computed(() => {
  return !isSection7.value && isAIEnabled('EXPLAIN_TRIAGE');
});

// ============================================
// Methods
// ============================================

async function handleFieldChange(fieldId: string, value: any) {
  const result = await saveField(fieldId, value);
  
  if (!result.success && result.validationWarnings?.[0]) {
    console.warn(`Validation warning for ${fieldId}:`, result.validationWarnings[0].message);
  }
  
  // Force reactivity by accessing effectivePriority after save
  // This ensures the computed re-evaluates with the new instance data
  const currentPriority = effectivePriority.value;
  const currentDanger = hasDangerSign.value;
  console.log(`[Priority] After saveField(${fieldId}): priority=${currentPriority}, hasDangerSign=${currentDanger}`);
  
  // Trigger reactive AI for significant field changes
  await reactiveHandleFieldChange(fieldId, value);
}

async function handleNextSection() {
  try {
    if (!isLastSection.value) {
      await nextSection();
    } else {
      await handleCompleteForm();
    }
  } catch (error) {
    showNavigationGuard.value = true;
    blockedTransition.value = {
      from: currentSection.value?.id || 'unknown',
      to: 'complete',
      reasons: [error instanceof Error ? error.message : 'Unable to complete form']
    };
  }
}

function handlePreviousSection() {
  if (!isFirstSection.value) {
    previousSection();
  }
}

async function handleCompleteForm() {
  try {
    const result = await completeForm();
    
    if (result.allowed) {
      // Auto-redirect to treatment page after assessment completion
      // per triage-to-treatment-bridge spec: seamless navigation flow
      // Try multiple sources for sessionId to ensure we have it
      const targetSessionId = resolvedSessionId.value || instance.value?.sessionId || sessionId.value || route.query.sessionId;
      
      console.log('[Assessment] Navigation debug:', {
        resolvedSessionId: resolvedSessionId.value,
        instanceSessionId: instance.value?.sessionId,
        computedSessionId: sessionId.value,
        querySessionId: route.query.sessionId,
        finalTargetSessionId: targetSessionId
      });
      
      if (targetSessionId) {
        console.log('[Assessment] Assessment complete, redirecting to treatment:', targetSessionId);
        await router.push(`/sessions/${targetSessionId}/treatment`);
      } else {
        console.warn('[Assessment] No sessionId available, redirecting to dashboard');
        await router.push('/dashboard');
      }
    } else {
      validationError.value = result.reason || 'Please fill in all required fields.';
    }
  } catch (error) {
    console.error('[Assessment] Failed to complete:', error);
    validationError.value = 'Failed to complete form';
  }
}

function handleProceedAnyway() {
  showNavigationGuard.value = false;
  blockedTransition.value = null;
  if (!isLastSection.value) {
    currentSectionIndex.value++;
  }
}

function handleGoBack() {
  showNavigationGuard.value = false;
  blockedTransition.value = null;
}

function handleGoToSession() {
  const targetSessionId = resolvedSessionId.value || instance.value?.sessionId;
  if (targetSessionId) {
    router.push(`/sessions/${targetSessionId}`);
  } else {
    router.push('/sessions');
  }
}

// ============================================
// AI Methods
// ============================================

const aiStatus = ref<'idle' | 'checking' | 'generating' | 'ready'>('idle');
const aiErrorMessage = ref<string>('');

// Check if nurse can request AI guidance
// Uses effectivePriority to detect danger signs in real-time
const canRequestAIGuidance = computed(() => {
  // Can request if:
  // 1. AI is enabled
  // 2. Effective priority is available (detects danger signs or calculated priority)
  // 3. Not already showing explainability
  // 4. Not in section 7 (ExplainabilityCard handles AI there)
  return (
    isAIEnabled('EXPLAIN_TRIAGE') && 
    getAIConfig().enabled &&
    !!effectivePriority.value &&
    !showExplainability.value &&
    !isSection7.value
  );
});

// Check if nurse can request comprehensive AI report in Section 7
const canRequestSection7Report = computed(() => {
  // Can request if:
  // 1. AI is enabled
  // 2. In section 7 (Triage & Classification)
  // 3. Not already streaming
  // 4. Have patient data
  return (
    isAIEnabled('EXPLAIN_TRIAGE') && 
    getAIConfig().enabled &&
    isSection7.value &&
    !isStreaming.value &&
    !!instance.value?.answers
  );
});

// Request comprehensive patient report for Section 7
async function requestSection7Report() {
  if (!canRequestSection7Report.value) return;
  
  console.log('[Assessment] Section 7: Requesting comprehensive patient report');
  
  // Initialize streaming state
  isStreaming.value = true;
  streamingResponse.value = '';
  streamingProgress.value = 0;
  streamingTokens.value = 0;
  streamingMode.value = null;
  
  try {
    // Call streaming AI with comprehensive context
    const result = await streamClinicalAI(
      'CLINICAL_NARRATIVE', // Use clinical narrative for comprehensive report
      {
        sessionId: resolvedSessionId.value || instance.value?.sessionId || '',
        schemaId: schemaId.value,
        formId: formId.value,
        sectionId: 'final_summary',
        cumulativeSummary: getDeduplicatedSummary(),
        patient: patientContext.value, // Includes reactive priority, age, weight, gender
        assessment: {
          answers: instance.value?.answers || {}
        }
      },
      {
        onChunk: (chunk: string) => {
          streamingResponse.value += chunk;
        },
        onProgress: (tokens: number, total: number) => {
          streamingTokens.value = tokens;
          streamingTotalTokens.value = total;
          streamingProgress.value = total > 0 ? (tokens / total) * 100 : 0;
        },
        onComplete: (fullResponse: string, duration: number, summary?: string, structured?: StructuredResponse) => {
          if (structured) {
            console.log('[Assessment] Section 7 Report - Structured response:', {
              inconsistencies: structured.inconsistencies.length,
              teachingNotes: structured.teachingNotes.length,
              nextSteps: structured.nextSteps.length,
              confidence: structured.confidence.toFixed(2)
            });
            
            structuredAIResponse.value = structured;
            
            logAIInteraction(resolvedSessionId.value || 'unknown', {
              useCase: 'CLINICAL_NARRATIVE',
              modelVersion: structured.modelVersion,
              responseTime: duration,
              confidence: structured.confidence,
              inputTokens: 0,
              outputTokens: streamingTokens.value,
              safetyFlags: structured.safetyFlags,
              inconsistenciesDetected: structured.inconsistencies.length,
              teachingNotesProvided: structured.teachingNotes.length,
              nextStepsProvided: structured.nextSteps.length,
              ruleIdsReferenced: structured.ruleIds,
              requestId: result.requestId
            });
          }
          
          isStreaming.value = false;
        },
        onError: (error: string) => {
          streamingError.value = error;
          isStreaming.value = false;
          logAIError(resolvedSessionId.value || 'unknown', 'CLINICAL_NARRATIVE', error);
        },
        onCancel: () => {
          isStreaming.value = false;
        }
      }
    );
    
    streamingMode.value = result.mode;
    streamingCancel = result.cancel;
    
  } catch (error) {
    console.error('[Assessment] Section 7 Report failed:', error);
    streamingError.value = error instanceof Error ? error.message : 'Failed to generate report';
    isStreaming.value = false;
  }
}

// Request MedGemma guidance manually
async function requestMedGemmaGuidance() {
  if (!canRequestAIGuidance.value) return;
  
  aiStatus.value = 'generating';
  
  try {
    await buildExplainability();
    
    // Log successful AI interaction
    if (explainabilityRecord.value) {
      const interaction: AIInteractionDetails = {
        useCase: 'EXPLAIN_TRIAGE',
        modelVersion: ollamaService.defaultModel,
        responseTime: 0,
        confidence: explainabilityRecord.value.confidence,
        inputTokens: 0,
        outputTokens: 0,
        safetyFlags: [],
        nurseAction: 'viewed'
      };
      
      logAIInteraction(resolvedSessionId.value || 'unknown', interaction);
    }
  } catch (error) {
    aiErrorMessage.value = error instanceof Error ? error.message : 'Failed to generate explanation';
    
    // Log AI error
    logAIError(
      resolvedSessionId.value || 'unknown',
      'EXPLAIN_TRIAGE',
      aiErrorMessage.value
    );
  }
}

// Refresh MedGemma guidance
async function refreshMedGemmaGuidance() {
  showExplainability.value = false;
  explainabilityRecord.value = null;
  await requestMedGemmaGuidance();
}

async function buildExplainability() {
  if (!instance.value) {
    console.log('[Assessment] No instance.value');
    explainabilityRecord.value = null;
    showExplainability.value = false;
    return;
  }

  // Use reactive effectivePriority (computed from danger signs) instead of stale calculated priority
  const calculated = instance.value.calculated;
  const currentPriority = effectivePriority.value;
  
  console.log('[Assessment] buildExplainability - Priority check:', {
    effectivePriority: currentPriority,
    calculatedPriority: calculated?.triagePriority,
    hasDangerSign: hasDangerSign.value
  });

  // Only skip if no priority at all (neither effective nor calculated)
  if (!currentPriority && !calculated?.triagePriority && !calculated?.triage_priority) {
    console.log('[Assessment] No triage data available yet');
    explainabilityRecord.value = null;
    showExplainability.value = false;
    return;
  }

  console.log('[Assessment] Triage data found, proceeding...');

  // Check if AI is enabled
  if (!isAIEnabled('EXPLAIN_TRIAGE')) {
    console.log('[Assessment] AI not enabled');
    explainabilityRecord.value = null;
    showExplainability.value = false;
    return;
  }

  const config = getAIConfig();
  if (!config.enabled) {
    console.log('[Assessment] AI disabled in config');
    explainabilityRecord.value = null;
    showExplainability.value = false;
    return;
  }

  console.log('[Assessment] Calling buildExplainabilityModel...');
  aiStatus.value = 'checking';

  try {
    // Build explainability from the actual data structure
    const record = await buildExplainabilityFromCalculated(calculated, {
      sessionId: resolvedSessionId.value || instance.value?.sessionId || '',
      useAI: config.enabled
    });
    
    explainabilityRecord.value = record;
    showExplainability.value = !!record;
    aiStatus.value = !!record ? 'ready' : 'idle';
    aiErrorMessage.value = '';
    
    console.log('[Assessment] buildExplainabilityFromCalculated returned:', record);
  } catch (error) {
    console.warn('[Assessment] Failed to build explainability:', error);
    explainabilityRecord.value = null;
    showExplainability.value = false;
    aiStatus.value = 'idle';
    aiErrorMessage.value = error instanceof Error ? error.message : 'Failed to generate explanation';
  }
}

// Build explainability from the calculated triage data (not from matchedTriageRule)
// Now uses streaming for real-time AI response
async function buildExplainabilityFromCalculated(
  calculated: Record<string, unknown>,
  options: { sessionId: string; useAI?: boolean }
): Promise<ExplainabilityRecord | null> {
  // Use reactive effectivePriority (computed from danger signs) instead of stale calculated priority
  const priority = effectivePriority.value || 
                   (calculated.triagePriority || calculated.triage_priority || 'green') as 'red' | 'yellow' | 'green';
  const classification = (calculated.triageClassification || calculated.triage_classification || getPriorityLabel(priority)) as string;
  const actions = calculated.triageActions || calculated.triage_actions || [];
  
  // Log priority source for debugging
  console.log('[Assessment] buildExplainabilityFromCalculated - Priority source:', {
    effectivePriority: effectivePriority.value,
    calculatedPriority: calculated.triagePriority,
    hasDangerSign: hasDangerSign.value,
    finalPriority: priority
  });

  // Build triggers from available data
  const triggers: ExplainabilityRecord['reasoning']['triggers'] = [];
  
  if (calculated.fast_breathing !== undefined) {
    triggers.push({
      fieldId: 'fast_breathing',
      value: String(calculated.fast_breathing),
      threshold: 'WHO IMCI threshold',
      explanation: 'Fast breathing assessment',
      clinicalMeaning: calculated.fast_breathing ? 'Fast breathing detected' : 'Normal breathing'
    });
  }

  // Build recommended actions
  const recommendedActions: ExplainabilityRecord['recommendedActions'] = Array.isArray(actions) 
    ? actions.map((code: string) => ({
        code,
        label: code,
        justification: 'Based on triage classification',
        whoReference: 'WHO IMCI'
      }))
    : [];

  // Generate narrative
  let clinicalNarrative = '';
  let confidence = 1.0;
  let aiEnhancement: ExplainabilityRecord['aiEnhancement'] | undefined;

  if (options.useAI) {
    try {
      const healthCheck = await ollamaService.testConnection();
      
      if (healthCheck.success) {
        // ============================================
        // PHASE 2: STREAMING AI RESPONSE
        // ============================================
        console.log('[Assessment] 🔄 Using STREAMING AI response...');
        
        // Initialize streaming state
        isStreaming.value = true;
        streamingResponse.value = '';
        streamingProgress.value = 0;
        streamingTokens.value = 0;
        streamingMode.value = null;
        
        // Get patient data from navigation state
        const patientInfo = patientDataFromNavigation.value || {};
        const patientAge = patientInfo.dateOfBirth ? patientInfo.dateOfBirth : 'age not specified';
        const patientSex = patientInfo.gender || 'sex not specified';
        
        // Build key findings from triggers
        const keyFindings = triggers.map(t => t.clinicalMeaning).join('. ');
        
        // Build patient context string for the prompt
        const patientContextString = `Patient: ${patientAge}, ${patientSex}`;
        
        // Build the explainability record with REAL data
        const explainabilityPayload: ExplainabilityRecord = {
          id: 'streaming-placeholder',
          sessionId: options.sessionId,
          assessmentInstanceId: instance.value?._id || 'assessment-record',
          timestamp: new Date().toISOString(),
          classification: {
            priority,
            label: classification,
            protocol: 'WHO_IMCI'
          },
          reasoning: {
            primaryRule: {
              id: 'triage_classification',
              description: classification,
              source: 'WHO_IMCI'
            },
            triggers,
            clinicalNarrative: keyFindings
          },
          recommendedActions,
          safetyNotes: ['Monitor for deterioration', 'Escalate if condition worsens'],
          confidence: 1.0,
          dataCompleteness: 1.0,
          aiEnhancement: undefined
        };
        
        // Log what we're sending to AI for debugging
        console.log('[Assessment] 🤖 Sending to AI (CUMULATIVE):');
        console.log('   Patient:', patientContextString);
        console.log('   Priority:', priority);
        console.log('   Section:', currentSection.value?.id);
        console.log('   Cumulative Summary Length:', cumulativeSummary.value.length, 'chars');
        console.log('   Findings:', keyFindings.slice(0, 100));
        
        // Add constraint to max tokens for shorter response
        const originalMaxTokens = 500;
        
        // ============================================
        // PHASE 3: CUMULATIVE PROMPT STRATEGY
        // ============================================
        
        // Prevent concurrent AI requests
        if (isAILoading.value) {
          console.log('[Assessment] AI already loading, skipping concurrent request');
          return null;  // Return null for early exit
        }
        isAILoading.value = true;
        
        // Call streaming AI with cumulative context - use computed patientContext
        const result = await streamClinicalAI(
          'SECTION_GUIDANCE',
          {
            sessionId: options.sessionId,
            schemaId: schemaId.value,
            formId: formId.value,
            sectionId: currentSection.value?.id || 'triage',
            cumulativeSummary: getDeduplicatedSummary(),
            patient: patientContext.value,  // Uses computed property with proper age from DOB
            assessment: {
              answers: instance.value?.answers || {}
            }
          },
          {
            onChunk: (chunk: string) => {
              streamingResponse.value += chunk;
            },
            onProgress: (tokens: number, total: number) => {
              streamingTokens.value = tokens;
              streamingTotalTokens.value = total;
              streamingProgress.value = total > 0 ? (tokens / total) * 100 : 0;
            },
            onComplete: (fullResponse: string, duration: number, summary?: string, structured?: StructuredResponse) => {
              // Phase 1: Handle structured response
              if (structured) {
                console.log('[Assessment] 📊 Structured response received:', {
                  inconsistencies: structured.inconsistencies.length,
                  teachingNotes: structured.teachingNotes.length,
                  nextSteps: structured.nextSteps.length,
                  confidence: structured.confidence.toFixed(2)
                });
                
                // Store structured response for MedGemmaGuidancePanel
                structuredAIResponse.value = structured;
                
                // Log AI interaction with structured data
                logAIInteraction(options.sessionId, {
                  useCase: 'EXPLAIN_TRIAGE',
                  modelVersion: structured.modelVersion,
                  responseTime: duration,
                  confidence: structured.confidence,
                  inputTokens: 0,
                  outputTokens: streamingTokens.value,
                  safetyFlags: structured.safetyFlags,
                  inconsistenciesDetected: structured.inconsistencies.length,
                  teachingNotesProvided: structured.teachingNotes.length,
                  nextStepsProvided: structured.nextSteps.length,
                  ruleIdsReferenced: structured.ruleIds,
                  requestId: result.requestId
                });
              }
              
              if (summary) {
                addSectionSummary(currentSection.value?.id || 'triage', summary);
              } else {
                const sentences = fullResponse.split(/[.!?]+/).filter(s => s.trim().length > 20);
                const lastSentence = sentences.at(-1);
                if (lastSentence) {
                  addSectionSummary(currentSection.value?.id || 'triage', lastSentence.trim());
                }
              }
              isStreaming.value = false;
            },
            onError: (error: string) => {
              streamingError.value = error;
              isStreaming.value = false;
            },
            onCancel: () => {
              isStreaming.value = false;
            }
          }
        );
        
        isAILoading.value = false;
        streamingMode.value = result.mode;
        streamingCancel = result.cancel;
        isStreaming.value = true;
        clinicalNarrative = streamingResponse.value || 'AI response generation completed.';
        confidence = 0.95;
        aiEnhancement = {
          used: true,
          useCase: 'EXPLAIN_TRIAGE',
          modelVersion: ollamaService.defaultModel
        };
        
        console.log(`[Assessment] 🎯 Streaming mode: ${result.mode}`);
      } else {
        console.log('[Assessment] AI health check failed, using rule-based narrative');
        clinicalNarrative = generateRuleBasedTriageNarrative(priority, triggers);
        aiEnhancement = {
          used: false,
          useCase: 'EXPLAIN_TRIAGE',
          modelVersion: ollamaService.defaultModel
        };
      }
    } catch (error) {
      console.warn('[Assessment] Streaming AI generation failed, falling back:', error);
      clinicalNarrative = generateRuleBasedTriageNarrative(priority, triggers);
      aiEnhancement = {
        used: false,
        useCase: 'EXPLAIN_TRIAGE',
        modelVersion: ollamaService.defaultModel
      };
    }
  } else {
    clinicalNarrative = generateRuleBasedTriageNarrative(priority, triggers);
  }

  const record: ExplainabilityRecord = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`,
    sessionId: options.sessionId,
    assessmentInstanceId: instance.value?._id || 'assessment-record',
    timestamp: new Date().toISOString(),
    classification: {
      priority,
      label: classification,
      protocol: 'WHO_IMCI'
    },
    reasoning: {
      primaryRule: {
        id: 'triage_classification',
        description: classification,
        source: 'WHO_IMCI'
      },
      triggers,
      clinicalNarrative
    },
    recommendedActions,
    safetyNotes: aiEnhancement?.used ? [
      'AI-enhanced clinical decision support based on MedGemma',
      'Verify all AI suggestions with clinical judgment',
      'Escalate immediately if patient condition worsens',
      'Follow WHO IMCI guidelines as primary reference'
    ] : [
      'Derived from WHO IMCI guidelines',
      'Actions must be clinically confirmed',
      'Escalate if patient condition worsens'
    ],
    confidence,
    dataCompleteness: 1.0,
    aiEnhancement
  };

  return record;
}

// Streaming error state
const streamingError = ref<string>('');

// Cancel streaming helper
function cancelStreaming() {
  if (streamingCancel) {
    streamingCancel();
    streamingCancel = null;
  }
  isStreaming.value = false;
}

// Dismiss streaming panel helper
function dismissStreaming() {
  streamingResponse.value = '';
  streamingProgress.value = 0;
  streamingTokens.value = 0;
  streamingError.value = '' as string;
}

function buildTriageAIPrompt(
  priority: string,
  triggers: ExplainabilityRecord['reasoning']['triggers'],
  classification: string,
  actions: ExplainabilityRecord['recommendedActions']
): string {
  const triggerText = triggers.map(t => t.clinicalMeaning).join(', ');
  const actionText = actions.map(a => a.label).join(', ');

  return `You are MedGemma, a clinical AI assistant explaining triage decisions to nurses.

CONTEXT:
- Patient triage: ${priority.toUpperCase()}
- Classification: ${classification}
- Clinical findings: ${triggerText}
- Actions: ${actionText}

TASK: Provide a concise clinical explanation including:
1. Why this patient needs ${priority} priority care
2. Key clinical implications
3. When to escalate care

FORMAT: Use plain language for nurses. Max 100 words.`;
}

function generateRuleBasedTriageNarrative(
  priority: string,
  triggers: ExplainabilityRecord['reasoning']['triggers']
): string {
  const priorityText = {
    red: 'emergency',
    yellow: 'urgent',
    green: 'non-urgent'
  }[priority] || 'standard care';

  if (triggers.length === 0) {
    return `Patient classified as ${priority.toUpperCase()} (${priorityText}) based on clinical assessment.`;
  }

  const meaningList = triggers.map(t => t.clinicalMeaning);
  return `Patient classified as ${priority.toUpperCase()} (${priorityText}) because: ${meaningList.join(', ')}.`;
}

function getTermDefinition(term: string): string {
  if (!clinicalTermDefinitions.value[term]) {
    clinicalTermDefinitions.value[term] = getClinicalTermDefinition(term);
  }
  return clinicalTermDefinitions.value[term];
}

// ============================================
// Watchers with Debounce
// ============================================

// Simple debounce helper
function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Debounced version of buildExplainability
const debouncedBuildExplainability = debounce(() => {
  if (currentSection.value && !isAILoading.value && autoTriggerEnabled.value) {
    buildExplainability();
  }
}, 500);

// Watch for changes to instance (shallow ref) - debounced - DISABLED for manual Ask MedGemma mode
// watch(instance, async () => {
//   debouncedBuildExplainability();
// }, { deep: true });

// Also watch calculated and AI enabled state - debounced - DISABLED for manual Ask MedGemma mode
// watch([() => instance.value?.calculated, () => isAIEnabled('EXPLAIN_TRIAGE')], async () => {
//   debouncedBuildExplainability();
// }, { deep: true });

// Watch triage priority directly - debounced - DISABLED for manual Ask MedGemma mode
// watch(triagePriority, async (newPriority) => {
//   debouncedBuildExplainability();
// });

// ============================================
// Lifecycle
// ============================================

onMounted(async () => {
  // Clear navigation state after we've read it (one-time use)
  clearNavigationState();
  
  try {
    await initialize();
    
    // Initialize reactive AI with form state and calculated data
    setTimeout(() => {
      if (instance.value) {
        initReactiveAI(instance.value.answers || {}, instance.value.calculated || {});
      }
    }, 200);
    
    // Initial AI call DISABLED for manual Ask MedGemma mode - users must click button
    // if (!isAILoading.value) {
    //   isAILoading.value = true;
    //   setTimeout(async () => {
    //     await buildExplainability();
    //     isAILoading.value = false;
    //   }, 100);
    // }
  } catch (error) {
    console.error('[Assessment] Failed to initialize:', error);
    validationError.value = 'Failed to load assessment form. Please try again.';
  }
});

// Watch for calculated data changes and update reactive AI - DISABLED for manual Ask MedGemma mode
// watch(() => instance.value?.calculated, (newCalculated) => {
//   if (newCalculated) {
//     initReactiveAI(instance.value?.answers || {}, newCalculated);
//   }
// }, { deep: true });
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4 max-w-4xl mx-auto">
    <!-- Header -->
    <header class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-4">
        <button
          @click="handleGoToSession"
          class="p-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h1 class="text-xl md:text-2xl font-bold text-white">
            {{ schema?.title || 'Assessment' }}
          </h1>
          <p class="text-gray-400 text-sm">
            {{ schema?.description || 'Clinical assessment form' }}
          </p>
        </div>
      </div>
      
      <!-- Phase 3: Language Selector & Offline Indicator -->
      <div class="flex items-center gap-3">
        <!-- Offline Indicator -->
        <span 
          v-if="isOfflineMode" 
          class="px-2 py-1 text-xs bg-yellow-900/50 text-yellow-400 border border-yellow-700 rounded-full flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
          Offline
        </span>
        
        <!-- Language Selector -->
        <select 
          v-model="currentLanguage" 
          @change="handleLanguageChange"
          class="px-2 py-1 text-sm bg-gray-800 text-gray-300 border border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none"
        >
          <option value="en">English</option>
          <option value="sn">Shona</option>
          <option value="nd">Ndebele</option>
        </select>
        
        <!-- Progress -->
        <div class="flex items-center gap-2">
          <span class="text-gray-400 text-sm">
            Section {{ currentSectionIndex + 1 }} of {{ formSections.length }}
          </span>
          <div class="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div 
              class="h-full bg-blue-600 rounded-full transition-all duration-300"
              :style="{ width: `${progress}%` }"
            ></div>
          </div>
        </div>
      </div>
    </header>

    <!-- Patient Info Banner (when coming from session) -->
    <div 
      v-if="patientDataFromQuery.patientId" 
      class="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700"
    >
      <div class="flex items-center gap-2 mb-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <h2 class="font-semibold text-white">Patient Information</h2>
      </div>
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-gray-400">Name:</span>
          <span class="text-white ml-2">{{ patientDataFromQuery.patientName || 'Unknown' }}</span>
        </div>
        <div>
          <span class="text-gray-400">Patient ID:</span>
          <span class="text-white ml-2">{{ patientDataFromQuery.patientId }}</span>
        </div>
        <div v-if="patientDataFromQuery.dateOfBirth">
          <span class="text-gray-400">Date of Birth:</span>
          <span class="text-white ml-2">{{ patientDataFromQuery.dateOfBirth }}</span>
        </div>
        <div v-if="patientDataFromQuery.gender">
          <span class="text-gray-400">Gender:</span>
          <span class="text-white ml-2 capitalize">{{ patientDataFromQuery.gender }}</span>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      <span class="ml-3 text-gray-400">Loading assessment...</span>
    </div>

    <!-- Error State -->
    <div
      v-else-if="validationError"
      class="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg dark:bg-red-900/20 dark:border-red-800 dark:text-red-200"
    >
      <div class="flex items-start gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div class="flex-1">
          <p class="font-medium">{{ validationError }}</p>
        </div>
        <button 
          @click="validationError = null"
          class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Form Content -->
    <template v-else-if="schema && instance">
      <!-- Triage Badge - Shows RED if danger sign is present, otherwise shows calculated priority -->
      <!-- Use :key to force Vue to re-render when effectivePriority changes -->
      <span
        v-if="effectivePriority"
        :key="priorityKey"
        class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold mb-4 transition-all duration-300"
        :class="{
          'bg-red-600 text-white': effectivePriority === 'red',
          'bg-yellow-500 text-white': effectivePriority === 'yellow',
          'bg-green-600 text-white': effectivePriority === 'green'
        }"
      >
        {{ effectivePriority?.toUpperCase() }} Priority
        <span v-if="hasDangerSign" class="ml-2 text-xs opacity-75">
          (Danger Sign Detected)
        </span>
      </span>

      <!-- AI Status Indicators -->
      <div v-if="effectivePriority && aiStatus === 'checking' && !isSection7" class="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
        <div class="flex items-center gap-2 text-blue-300">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Checking AI availability...</span>
        </div>
      </div>

      <div v-if="aiErrorMessage" class="mb-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
        <div class="flex items-start gap-2 text-yellow-300">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{{ aiErrorMessage }}</span>
        </div>
      </div>

      <!-- Reactive AI Guidance Panel - Only show in sections 1-6, hide in section 7 -->
      <div v-if="showReactiveAIGuidance && reactiveAIGuidance && !isSection7" class="mb-6 bg-gray-800 rounded-lg border border-purple-500/30 p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div v-if="reactiveAIStatus === 'generating'" class="animate-spin h-4 w-4 border-2 border-purple-500 border-t-transparent rounded-full"></div>
            <span v-else class="h-2 w-2 bg-green-500 rounded-full"></span>
            <span class="text-purple-400 font-medium">MedGemma Guidance</span>
          </div>
          <button 
            @click="dismissReactiveAIGuidance"
            class="text-gray-500 hover:text-gray-300"
            aria-label="Dismiss guidance"
          >
            ✕
          </button>
        </div>
        
        <!-- Inconsistency alerts -->
        <div v-if="reactiveAIInconsistencies.length > 0" class="mb-3 space-y-2">
          <div 
            v-for="(inc, idx) in reactiveAIInconsistencies"
            :key="idx"
            class="flex items-start gap-2 p-2 rounded"
            :class="inc.severity === 'error' ? 'bg-red-500/20 text-red-400' : inc.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span class="text-sm">{{ inc.message }}</span>
          </div>
        </div>
        
        <!-- AI Explanation -->
        <div class="text-gray-300 text-sm">
          {{ reactiveAIGuidance.explanation as string }}
        </div>
        
        <!-- Next steps -->
        <div v-if="reactiveAIGuidance.nextSteps && (reactiveAIGuidance.nextSteps as string[]).length > 0" class="mt-3">
          <h4 class="text-xs font-medium text-gray-500 uppercase mb-1">Next Steps</h4>
          <ul class="text-sm text-gray-300 space-y-1">
            <li v-for="(step, idx) in (reactiveAIGuidance.nextSteps as string[])" :key="idx" class="flex items-start gap-2">
              <span class="text-purple-400">→</span>
              {{ step }}
            </li>
          </ul>
        </div>
        
        <!-- Disclaimer -->
        <div class="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500">
          AI guidance updates as you complete the assessment. Always verify with clinical judgment.
        </div>
      </div>

      <!-- AI Explainability Panel - Only show in section 7 (Triage & Classification) -->
      <div v-if="showExplainability && explainabilityRecord && isSection7" class="mb-6">
        <ExplainabilityCard :model="explainabilityRecord" />
      </div>

      <!-- Section 7: Ask MedGemma for Comprehensive Patient Report -->
      <div v-if="isSection7 && canRequestSection7Report" class="mb-6">
        <div class="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 rounded-xl border border-purple-500/30 p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3">
              <span class="text-2xl">🧠</span>
              <div>
                <h3 class="text-lg font-semibold text-white">Comprehensive Patient Report</h3>
                <p class="text-sm text-gray-400">Generate a complete clinical summary with AI insights</p>
              </div>
            </div>
            <button 
              @click="requestSection7Report"
              :disabled="isStreaming"
              class="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Request comprehensive patient report from MedGemma"
            >
              <svg v-if="!isStreaming" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{{ isStreaming ? 'Generating Report...' : 'Generate Patient Report' }}</span>
            </button>
          </div>
          
          <!-- Priority indicator -->
          <div class="flex items-center gap-4 text-sm">
            <span class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full" :class="{
                'bg-red-500': effectivePriority === 'red',
                'bg-yellow-500': effectivePriority === 'yellow',
                'bg-green-500': effectivePriority === 'green'
              }"></span>
              <span class="text-gray-300">{{ effectivePriority?.toUpperCase() }} Priority</span>
            </span>
            <span v-if="hasDangerSign" class="text-red-400 text-xs">
              ⚠️ Danger signs detected
            </span>
          </div>
        </div>
      </div>

      <!-- Manual "Ask MedGemma" Button - Only show in sections 1-6, hide in section 7 -->
      <div v-if="canRequestAIGuidance && !showExplainability && !isSection7" class="mb-4">
        <button 
          @click="requestMedGemmaGuidance"
          :disabled="aiStatus === 'generating'"
          class="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Request MedGemma clinical guidance"
        >
          <svg v-if="aiStatus !== 'generating'" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>{{ aiStatus === 'generating' ? 'MedGemma is thinking...' : 'Ask MedGemma' }}</span>
        </button>
        <span v-if="effectivePriority" class="ml-3 text-gray-400 text-sm">
          {{ effectivePriority.toUpperCase() }} Priority • Ready for AI guidance
        </span>
      </div>

      <!-- AI Streaming Panel (Phase 2) - Shows real-time streaming response -->
      <AIStreamingPanel
        v-if="isStreaming || streamingResponse"
        :is-streaming="isStreaming"
        :streaming-text="streamingResponse"
        :progress-percent="streamingProgress"
        :tokens-generated="streamingTokens"
        :estimated-total-tokens="streamingTotalTokens"
        :model-version="'gemma3:4b'"
        :error="streamingError"
        @cancel="cancelStreaming"
        @dismiss="dismissStreaming"
      />

      <!-- AI Status Badge when guidance is shown -->
      <div v-if="showExplainability && explainabilityRecord" class="mb-4 flex items-center justify-between">
        <AIStatusBadge :ai-enhancement="explainabilityRecord.aiEnhancement" />
        <button 
          @click="refreshMedGemmaGuidance"
          class="text-gray-400 hover:text-white text-sm transition-colors"
          aria-label="Refresh MedGemma guidance"
        >
          ↻ Refresh
        </button>
      </div>

      <!-- Section Card -->
      <div class="bg-gray-800 rounded-xl border border-gray-700 mb-6 overflow-hidden">
        <div class="px-4 py-4 sm:px-6 pb-4 border-b border-gray-700">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-xl font-bold text-white mb-1">{{ currentSection?.title }}</h2>
              <p v-if="currentSection?.description" class="text-gray-400 text-sm">
                {{ currentSection.description }}
              </p>
            </div>
            <!-- Ask MedGemma Button -->
            <button
              v-if="canRequestAIGuidance"
              @click="handleAskMedGemma"
              :disabled="reactiveAIStatus === 'generating'"
              class="ask-medgemma-btn inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200"
              :class="reactiveAIStatus === 'generating' 
                ? 'bg-gray-600 opacity-50 cursor-not-allowed' 
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg hover:shadow-purple-500/25'"
            >
              <span v-if="reactiveAIStatus === 'generating'" class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
              <span v-else class="text-lg">🧠</span>
              <span>{{ reactiveAIStatus === 'generating' ? 'Analyzing...' : 'Ask MedGemma' }}</span>
            </button>
          </div>
        </div>
        <!-- Fields -->
        <div class="p-4 sm:p-6 space-y-4">
          <div 
            v-for="field in currentFields" 
            :key="field.id"
            class="field-container"
          >
            <FieldRenderer
              :field="field"
              :model-value="getFieldValue(field.id)"
              :error="validationErrors[field.id]"
              :enable-voice="true"
              :voice-language="currentLanguage"
              dark
              class="w-full"
              @update:model-value="handleFieldChange(field.id, $event)"
            />
          </div>
        </div>
      </div>

      <!-- Navigation Buttons -->
      <div class="flex items-center justify-between">
        <button
          v-if="!isFirstSection"
          @click="handlePreviousSection"
          class="inline-flex items-center px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Previous
        </button>
        <div v-else />
        
        <button
          @click="handleNextSection"
          :disabled="isSaving"
          class="inline-flex items-center px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg v-if="isSaving" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
          {{ isLastSection ? 'Complete & Continue to Treatment' : 'Next Section' }}
        </button>
      </div>
    </template>

    <!-- No Form Found -->
    <div v-else class="bg-gray-800 rounded-xl border border-gray-700 p-6 sm:p-8 text-center">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h3 class="text-lg font-medium text-white mb-2">
        Assessment Not Found
      </h3>
      <p class="text-gray-400 mb-4">
        The requested assessment form could not be found.
      </p>
      <button
        @click="handleGoToSession"
        class="inline-flex items-center px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Return to Session
      </button>
    </div>

    <!-- Navigation Guard Modal - Only show when there are actual blocking reasons -->
    <Teleport to="body">
      <div v-if="shouldShowNavigationGuard" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="handleGoBack">
        <div class="bg-gray-800 rounded-xl shadow-2xl max-w-md w-full border border-gray-700">
          <div class="px-4 py-3 sm:px-6 border-b border-gray-700">
            <h3 class="text-lg font-semibold text-white">Cannot Proceed</h3>
          </div>
          
          <div class="p-4 sm:p-6 text-gray-400">
            <p class="mb-2">The following issues prevent you from proceeding:</p>
            <ul class="list-disc list-inside text-sm space-y-1">
              <li v-for="(reason, idx) in blockedTransition?.reasons" :key="idx">
                {{ reason }}
              </li>
            </ul>
          </div>
          
          <div class="px-4 py-4 sm:px-6 border-t border-gray-700 flex justify-end">
            <button 
              @click="handleGoBack"
              class="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
