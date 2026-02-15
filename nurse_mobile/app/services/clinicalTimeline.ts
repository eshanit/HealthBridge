/**
 * Clinical Timeline Service
 * 
 * Provides audit trail logging for all clinical session events.
 * Every state change in a session logs a timeline event.
 * 
 * All timeline events are encrypted via secureDb.
 */

import { 
  securePut, 
  secureGet, 
  secureAllDocs,
  secureFind,
  initializeSecureDb,
  isSecureDbReady
} from '~/services/secureDb';
import { useSecurityStore } from '~/stores/security';
import { useAuthStore } from '~/stores/auth';

// ============================================
// Types
// ============================================

export type TimelineEventType = 
  | 'created' 
  | 'stage_change' 
  | 'triage_update' 
  | 'form_completed'
  | 'form_started'
  | 'status_change'
  | 'note_added'
  | 'data_sync';

export interface TimelineEvent {
  id: string;
  sessionId: string;
  type: TimelineEventType;
  data: {
    previousValue?: any;
    newValue?: any;
    description?: string;
    formId?: string;
    formName?: string;
    actor?: string; // nurse name
    [key: string]: any;
  };
  timestamp: number;
}

/**
 * Timeline document as stored in database (with _id and _rev)
 */
interface TimelineDocument {
  _id: string;
  _rev?: string;
  id: string;
  sessionId: string;
  type: TimelineEventType;
  data: {
    previousValue?: any;
    newValue?: any;
    description?: string;
    formId?: string;
    formName?: string;
    actor?: string;
    [key: string]: any;
  };
  timestamp: number;
}

// ============================================
// Constants
// ============================================

const TIMELINE_DESIGN_DOC = 'timeline_by_session';

// ============================================
// Timeline Service
// ============================================

let _isInitialized = false;

/**
 * Get or derive the encryption key
 */
async function getEncryptionKey(): Promise<Uint8Array> {
  const securityStore = useSecurityStore();
  
  if (!securityStore.encryptionKey) {
    await securityStore.ensureEncryptionKey();
  }
  
  if (!securityStore.encryptionKey) {
    throw new Error('[ClinicalTimeline] Encryption key not available');
  }
  
  return securityStore.encryptionKey;
}

/**
 * Generate a unique ID for a timeline event
 */
function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.getRandomValues(new Uint8Array(6))
    .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');
  return `timeline:${timestamp}-${randomPart}`;
}

/**
 * Initialize the timeline service
 */
export async function initializeTimeline(): Promise<void> {
  if (_isInitialized) return;
  
  const key = await getEncryptionKey();
  
  // Ensure secureDb is initialized
  if (!isSecureDbReady()) {
    await initializeSecureDb(key);
  }
  
  // Create design doc for querying timeline by session
  try {
    const { secureCreateDesignDoc } = await import('~/services/secureDb');
    await secureCreateDesignDoc(
      TIMELINE_DESIGN_DOC,
      {
        by_session: {
          map: `function(doc) {
            if (doc._id.startsWith('timeline:')) {
              emit(doc.sessionId, doc);
            }
          }`
        }
      },
      key
    );
  } catch (error) {
    // Design doc might already exist
    console.log('[ClinicalTimeline] Index creation skipped (may already exist)');
  }
  
  _isInitialized = true;
  console.log('[ClinicalTimeline] Service initialized');
}

/**
 * Log a timeline event
 * @param event - Event to log
 */
export async function logEvent(event: Omit<TimelineEvent, 'id' | 'timestamp'>): Promise<TimelineEvent> {
  const key = await getEncryptionKey();
  const authStore = useAuthStore();
  
  const fullEvent: TimelineEvent = {
    ...event,
    id: generateEventId(),
    timestamp: Date.now()
  };
  
  // Add actor (nurse name) if not already set
  if (!fullEvent.data.actor) {
    const nurseName = authStore.getNurseName();
    if (nurseName) {
      fullEvent.data.actor = nurseName;
    }
  }
  
  // Create timeline document with _id for storage
  const timelineDoc = {
    _id: fullEvent.id,
    ...fullEvent
  };
  
  // Store in secureDb
  await securePut(timelineDoc, key);
  
  console.log('[ClinicalTimeline] Logged event:', fullEvent.type, fullEvent.sessionId);
  
  return fullEvent;
}

/**
 * Log session created event
 */
export async function logSessionCreated(sessionId: string, patientId?: string): Promise<void> {
  await logEvent({
    sessionId,
    type: 'created',
    data: {
      description: 'Clinical session created',
      newValue: { patientId }
    }
  });
}

/**
 * Log stage change event
 */
export async function logStageChange(
  sessionId: string,
  previousStage: string,
  newStage: string
): Promise<void> {
  await logEvent({
    sessionId,
    type: 'stage_change',
    data: {
      description: `Stage changed from ${previousStage} to ${newStage}`,
      previousValue: { stage: previousStage },
      newValue: { stage: newStage }
    }
  });
}

/**
 * Log triage update event
 */
export async function logTriageUpdate(
  sessionId: string,
  previousTriage: string,
  newTriage: string
): Promise<void> {
  await logEvent({
    sessionId,
    type: 'triage_update',
    data: {
      description: `Triage updated from ${previousTriage} to ${newTriage}`,
      previousValue: { triage: previousTriage },
      newValue: { triage: newTriage }
    }
  });
}

/**
 * Log form completion event
 */
export async function logFormCompleted(
  sessionId: string,
  formId: string,
  formName: string,
  triageResult?: string
): Promise<void> {
  await logEvent({
    sessionId,
    type: 'form_completed',
    data: {
      description: `Form "${formName}" completed`,
      formId,
      formName,
      newValue: { triage: triageResult }
    }
  });
}

/**
 * Log form started event
 */
export async function logFormStarted(
  sessionId: string,
  formId: string,
  formName: string
): Promise<void> {
  await logEvent({
    sessionId,
    type: 'form_started',
    data: {
      description: `Form "${formName}" started`,
      formId,
      formName
    }
  });
}

/**
 * Log status change event
 */
export async function logStatusChange(
  sessionId: string,
  previousStatus: string,
  newStatus: string
): Promise<void> {
  await logEvent({
    sessionId,
    type: 'status_change',
    data: {
      description: `Status changed from ${previousStatus} to ${newStatus}`,
      previousValue: { status: previousStatus },
      newValue: { status: newStatus }
    }
  });
}

/**
 * Log note added event
 */
export async function logNoteAdded(
  sessionId: string,
  noteContent: string
): Promise<void> {
  await logEvent({
    sessionId,
    type: 'note_added',
    data: {
      description: 'Clinical note added',
      newValue: { note: noteContent.substring(0, 500) } // Truncate for storage
    }
  });
}

/**
 * Get timeline for a session
 * @param sessionId - Session ID
 * @param limit - Maximum number of events to return
 */
export async function getTimeline(
  sessionId: string,
  limit: number = 100
): Promise<TimelineEvent[]> {
  const key = await getEncryptionKey();
  
  // Try to use the design doc query
  try {
    const events = await secureFind<TimelineEvent>({
      selector: {
        _id: { $regex: /^timeline:/ },
        sessionId: { $eq: sessionId }
      },
      sort: [{ timestamp: 'desc' }],
      limit
    }, key);
    
    // Sort chronologically (oldest first)
    return events.sort((a, b) => a.timestamp - b.timestamp);
  } catch (error) {
    // Fallback to all docs and filter
    const allDocs = await secureAllDocs<TimelineDocument>(key);
    const events = allDocs
      .filter((doc: any) => doc._id?.startsWith('timeline:') && doc.sessionId === sessionId)
      .sort((a: any, b: any) => a.timestamp - b.timestamp)
      .slice(0, limit);
    
    return events;
  }
}

/**
 * Get recent timeline events across all sessions
 * @param limit - Maximum number of events
 */
export async function getRecentEvents(limit: number = 50): Promise<TimelineEvent[]> {
  const key = await getEncryptionKey();
  
  const allDocs = await secureAllDocs<TimelineDocument>(key);
  const events = allDocs
    .filter((doc: any) => doc._id?.startsWith('timeline:'))
    .sort((a: any, b: any) => b.timestamp - a.timestamp) // Most recent first
    .slice(0, limit);
  
  return events;
}

/**
 * Get timeline summary for a session
 */
export async function getTimelineSummary(sessionId: string): Promise<{
  totalEvents: number;
  firstEvent: number;
  lastEvent: number;
  eventTypes: Record<string, number>;
}> {
  const events = await getTimeline(sessionId, 1000);
  
  const eventTypes: Record<string, number> = {};
  for (const event of events) {
    eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
  }
  
  return {
    totalEvents: events.length,
    firstEvent: events[0]?.timestamp || 0,
    lastEvent: events[events.length - 1]?.timestamp || 0,
    eventTypes
  };
}

/**
 * Format timestamp for display
 */
export function formatTimelineDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Get human-readable label for event type
 */
export function getEventTypeLabel(type: TimelineEventType): string {
  const labels: Record<TimelineEventType, string> = {
    created: 'Session Created',
    stage_change: 'Stage Changed',
    triage_update: 'Triage Updated',
    form_completed: 'Form Completed',
    form_started: 'Form Started',
    status_change: 'Status Changed',
    note_added: 'Note Added',
    data_sync: 'Data Synced'
  };
  
  return labels[type] || type;
}

/**
 * Get icon/color config for event type
 */
export function getEventTypeConfig(type: TimelineEventType): { 
  icon: string; 
  color: string;
} {
  const configs: Record<TimelineEventType, { icon: string; color: string }> = {
    created: { icon: 'i-heroicons-plus-circle', color: 'text-green-500' },
    stage_change: { icon: 'i-heroicons-arrow-right-circle', color: 'text-blue-500' },
    triage_update: { icon: 'i-heroicons-exclamation-triangle', color: 'text-orange-500' },
    form_completed: { icon: 'i-heroicons-document-check', color: 'text-emerald-500' },
    form_started: { icon: 'i-heroicons-document-text', color: 'text-blue-400' },
    status_change: { icon: 'i-heroicons-check-circle', color: 'text-purple-500' },
    note_added: { icon: 'i-heroicons-chat-bubble-left', color: 'text-cyan-500' },
    data_sync: { icon: 'i-heroicons-arrow-path', color: 'text-gray-500' }
  };
  
  return configs[type] || { icon: 'i-heroicons-circle', color: 'text-gray-400' };
}
