/**
 * Audit Logger Service
 * 
 * Minimal compliance scaffolding for security event logging.
 * All security-critical events are logged with structured data for
 * forensic analysis and compliance reporting.
 * 
 * Security Requirements:
 * - All encryption operations logged
 * - Key management events tracked
 * - Error events captured with context
 * - Recovery operations audited
 */

import { ref } from 'vue';

// ============================================
// Types
// ============================================

export interface AuditEvent {
  id: string;
  timestamp: number;
  eventType: AuditEventType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  userId?: string;
  deviceId?: string;
  correlationId?: string;
  details: Record<string, unknown>;
  outcome: 'success' | 'failure' | 'partial';
  metadata?: Record<string, unknown>;
}

export type AuditEventType =
  | 'encryption_start'
  | 'encryption_success'
  | 'encryption_failure'
  | 'decryption_start'
  | 'decryption_success'
  | 'decryption_failure'
  | 'key_derivation'
  | 'key_validation'
  | 'key_rotation'
  | 'session_start'
  | 'session_end'
  | 'document_corruption_detected'
  | 'document_recovery_attempt'
  | 'document_recovery_success'
  | 'document_recovery_failure'
  | 'sync_operation'
  | 'sync_failure'
  | 'data_export'
  | 'degraded_mode_entered'
  | 'degraded_mode_exited'
  | 'security_exception'
  | 'authentication_event'
  | 'configuration_change'
  | 'recovery_action'
  | 'database_reset'
  | 'ai_interaction';

// ============================================
// Configuration
// ============================================

const AUDIT_STORAGE_KEY = 'healthbridge_audit_log';
const MAX_AUDIT_EVENTS = 500; // Keep last 500 events for performance
const CORRELATION_ID_HEADER = 'x-correlation-id';

// ============================================
// State
// ============================================

const correlationId = ref<string>('');

/**
 * Generate a unique correlation ID for tracking related events
 */
function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.getRandomValues(new Uint8Array(8))
    .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');
  return `${timestamp}-${randomPart}`;
}

/**
 * Get or create current correlation ID
 */
export function getCorrelationId(): string {
  if (!correlationId.value) {
    correlationId.value = generateCorrelationId();
  }
  return correlationId.value;
}

// ============================================
// Core Logging Functions
// ============================================

/**
 * Create an audit event with standardized structure
 */
function createAuditEvent(
  eventType: AuditEventType,
  severity: 'info' | 'warning' | 'error' | 'critical',
  source: string,
  details: Record<string, unknown>,
  outcome: 'success' | 'failure' | 'partial',
  userId?: string,
  metadata?: Record<string, unknown>
): AuditEvent {
  return {
    id: generateCorrelationId(),
    timestamp: Date.now(),
    eventType,
    severity,
    source,
    userId,
    deviceId: getDeviceId(),
    correlationId: getCorrelationId(),
    details,
    outcome,
    metadata
  };
}

/**
 * Get device identifier from localStorage or generate new one
 */
function getDeviceId(): string {
  try {
    let deviceId = localStorage.getItem('healthbridge_device_id');
    if (!deviceId) {
      deviceId = `device_${crypto.randomUUID()}`;
      localStorage.setItem('healthbridge_device_id', deviceId);
    }
    return deviceId;
  } catch {
    return 'unknown_device';
  }
}

/**
 * Get user ID from authentication store if available
 */
function getUserId(): string | undefined {
  try {
    // Attempt to get user ID from auth store if loaded
    const authStore = localStorage.getItem('healthbridge_auth_user');
    if (authStore) {
      const parsed = JSON.parse(authStore);
      return parsed.userId || parsed.nurseId || undefined;
    }
  } catch {
    // Ignore errors - auth store may not be initialized
  }
  return undefined;
}

// ============================================
// Public API
// ============================================

/**
 * Log an audit event to localStorage and console
 */
export function logAuditEvent(
  eventType: AuditEventType,
  severity: 'info' | 'warning' | 'error' | 'critical',
  source: string,
  details: Record<string, unknown>,
  outcome: 'success' | 'failure' | 'partial' = 'success'
): AuditEvent {
  const event = createAuditEvent(
    eventType,
    severity,
    source,
    details,
    outcome,
    getUserId()
  );

  // Log to console with appropriate level
  const logMethod = severity === 'error' || severity === 'critical' 
    ? console.error 
    : severity === 'warning' 
      ? console.warn 
      : console.log;

  logMethod(`[AUDIT ${severity.toUpperCase()}] ${eventType}:`, {
    id: event.id,
    timestamp: new Date(event.timestamp).toISOString(),
    correlationId: event.correlationId,
    source,
    outcome,
    ...details
  });

  // Store event in localStorage
  try {
    const existing = JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) || '[]');
    existing.push(event);
    
    // Keep only recent events for performance
    if (existing.length > MAX_AUDIT_EVENTS) {
      existing.splice(0, existing.length - MAX_AUDIT_EVENTS);
    }
    
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(existing));
  } catch (storageError) {
    console.error('[AUDIT] Failed to persist audit event:', storageError);
  }

  return event;
}

// ============================================
// Specialized Logging Functions
// ============================================

/**
 * Log encryption operation
 */
export function logEncryption(
  documentId: string,
  operation: 'encrypt' | 'decrypt',
  success: boolean,
  errorDetails?: Record<string, unknown>
): AuditEvent {
  return logAuditEvent(
    operation === 'encrypt' ? 'encryption_start' : 'decryption_start',
    success ? 'info' : 'error',
    'encryptionService',
    {
      documentId,
      operation,
      ...errorDetails
    },
    success ? 'success' : 'failure'
  );
}

/**
 * Log key management event
 */
export function logKeyManagement(
  event: 'key_derivation' | 'key_validation' | 'key_rotation',
  success: boolean,
  details?: Record<string, unknown>
): AuditEvent {
  return logAuditEvent(
    event,
    success ? 'info' : 'error',
    'keyManager',
    details || {},
    success ? 'success' : 'failure'
  );
}

/**
 * Log document corruption event
 */
export function logCorruption(
  documentId: string,
  errorType: string,
  recoverable: boolean,
  recoveryAttempted: boolean = false
): AuditEvent {
  return logAuditEvent(
    'document_corruption_detected',
    'warning',
    'secureDb',
    {
      documentId,
      errorType,
      recoverable,
      recoveryAttempted
    },
    recoverable ? 'partial' : 'failure'
  );
}

/**
 * Log recovery operation
 */
export function logRecovery(
  documentId: string,
  success: boolean,
  details?: Record<string, unknown>
): AuditEvent {
  return logAuditEvent(
    success ? 'document_recovery_success' : 'document_recovery_failure',
    success ? 'info' : 'error',
    'recoveryService',
    { documentId, ...details },
    success ? 'success' : 'failure'
  );
}

/**
 * Log sync operation
 */
export function logSync(
  operation: 'start' | 'success' | 'failure',
  details?: Record<string, unknown>
): AuditEvent {
  if (operation === 'start') {
    return logAuditEvent(
      'sync_operation',
      'info',
      'syncManager',
      details || {},
      'success'
    );
  }
  
  return logAuditEvent(
    operation === 'success' ? 'sync_operation' : 'sync_failure',
    operation === 'success' ? 'info' : 'error',
    'syncManager',
    details || {},
    operation === 'success' ? 'success' : 'failure'
  );
}

/**
 * Log degraded mode transition
 */
export function logDegradedMode(
  entered: boolean,
  reason: string,
  duration?: number
): AuditEvent {
  return logAuditEvent(
    entered ? 'degraded_mode_entered' : 'degraded_mode_exited',
    'warning',
    'system',
    {
      reason,
      duration,
      timestamp: new Date().toISOString()
    },
    'success'
  );
}

/**
 * Log data export operation (for compliance)
 */
export function logDataExport(
  exportType: 'corrupted_docs' | 'full_database' | 'audit_log',
  recordCount: number,
  success: boolean
): AuditEvent {
  return logAuditEvent(
    'data_export',
    success ? 'info' : 'error',
    'compliance',
    {
      exportType,
      recordCount,
      timestamp: new Date().toISOString()
    },
    success ? 'success' : 'failure'
  );
}

/**
 * AI Interaction Details interface
 * Extended per system-ai-json-draft.md specification
 * Updated for Phase 1 structured responses
 */
export interface AIInteractionDetails {
  useCase: 
    | 'EXPLAIN_TRIAGE'
    | 'INCONSISTENCY_CHECK'
    | 'SUGGEST_ACTIONS'
    | 'TREATMENT_ADVICE'
    | 'CAREGIVER_INSTRUCTIONS'
    | 'CLINICAL_NARRATIVE'
    | 'CARE_EDUCATION'
    | 'CLINICAL_HANDOVER'
    | 'NOTE_SUMMARY';
  modelVersion: string;
  responseTime: number;
  confidence: number;
  inputTokens: number;
  outputTokens: number;
  safetyFlags: string[];
  nurseAction?: 'viewed' | 'dismissed' | 'followed' | 'overridden';
  // Phase 1: Structured response fields
  inconsistenciesDetected?: number;
  teachingNotesProvided?: number;
  nextStepsProvided?: number;
  ruleIdsReferenced?: string[];
  requestId?: string;
}

/**
 * Log AI interaction for clinical decision support
 * Enhanced for Phase 1 with structured response tracking
 */
export function logAIInteraction(
  sessionId: string,
  interaction: AIInteractionDetails,
  outcome: 'success' | 'failure' = 'success'
): AuditEvent {
  return logAuditEvent(
    'ai_interaction',
    interaction.safetyFlags.length > 0 ? 'warning' : 'info',
    'medgemma',
    {
      sessionId,
      ...interaction,
      timestamp: new Date().toISOString(),
      // Phase 1: Add structured response metrics
      structuredResponse: {
        inconsistenciesCount: interaction.inconsistenciesDetected || 0,
        teachingNotesCount: interaction.teachingNotesProvided || 0,
        nextStepsCount: interaction.nextStepsProvided || 0,
        rulesReferenced: interaction.ruleIdsReferenced?.length || 0
      }
    },
    outcome
  );
}

/**
 * Log AI error or fallback
 */
export function logAIError(
  sessionId: string,
  useCase: string,
  errorMessage: string
): AuditEvent {
  return logAuditEvent(
    'ai_interaction',
    'error',
    'medgemma',
    {
      sessionId,
      useCase,
      error: errorMessage,
      fallbackUsed: true,
      timestamp: new Date().toISOString()
    },
    'failure'
  );
}

// ============================================
// Query Functions
// ============================================

/**
 * Get recent audit events
 */
export function getRecentAuditEvents(limit: number = 50): AuditEvent[] {
  try {
    const events = JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) || '[]');
    return events.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Get audit events by type
 */
export function getAuditEventsByType(eventType: AuditEventType): AuditEvent[] {
  try {
    const events = JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) || '[]');
    return events.filter((e: AuditEvent) => e.eventType === eventType);
  } catch {
    return [];
  }
}

/**
 * Get audit events by correlation ID
 */
export function getAuditEventsByCorrelation(correlationId: string): AuditEvent[] {
  try {
    const events = JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) || '[]');
    return events.filter((e: AuditEvent) => e.correlationId === correlationId);
  } catch {
    return [];
  }
}

/**
 * Get all audit events
 */
export function getAuditEvents(): AuditEvent[] {
  try {
    const events = JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) || '[]');
    return events;
  } catch {
    return [];
  }
}

/**
 * Clear audit log (for testing or compliance)
 */
export function clearAuditLog(): void {
  localStorage.removeItem(AUDIT_STORAGE_KEY);
  console.info('[AUDIT] Audit log cleared');
}

/**
 * Clear audit events (alias for clearAuditLog)
 */
export function clearAuditEvents(): void {
  clearAuditLog();
}

/**
 * Export audit log for compliance reporting
 */
export function exportAuditLog(format: 'json' | 'csv' = 'json'): string {
  try {
    const events = JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) || '[]');
    
    if (format === 'csv') {
      const headers = ['id', 'timestamp', 'eventType', 'severity', 'source', 'outcome'];
      const rows = events.map((e: AuditEvent) => [
        e.id,
        new Date(e.timestamp).toISOString(),
        e.eventType,
        e.severity,
        e.source,
        e.outcome
      ].join(','));
      
      return [headers.join(','), ...rows].join('\n');
    }
    
    return JSON.stringify(events, null, 2);
  } catch {
    return '[]';
  }
}