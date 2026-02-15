/**
 * Session Engine Service
 * 
 * Manages clinical sessions - patient encounters tracked through
 * the clinical workflow (registration → assessment → treatment → discharge).
 * 
 * All data is encrypted via secureDb.
 */

import { ref } from 'vue';
import { 
  securePut, 
  secureGet, 
  secureFind, 
  secureAllDocs,
  initializeSecureDb,
  isSecureDbReady
} from '~/services/secureDb';
import { useSecurityStore } from '~/stores/security';
import { useAuthStore } from '~/stores/auth';

// ============================================
// Types
// ============================================

export type ClinicalSessionStage = 
  | 'registration' 
  | 'assessment' 
  | 'treatment' 
  | 'discharge';

export type ClinicalSessionTriage = 
  | 'red' 
  | 'yellow' 
  | 'green' 
  | 'unknown';

export type ClinicalSessionStatus = 
  | 'open' 
  | 'completed' 
  | 'referred' 
  | 'cancelled';

export interface ClinicalSession {
  _id: string;
  _rev?: string;
  id: string;
  patientCpt?: string;    // 4-character CPT for patient lookup
  patientId?: string;
  patientName?: string;
  dateOfBirth?: string;
  gender?: string;
  chiefComplaint?: string;
  notes?: string;
  triage: ClinicalSessionTriage;
  status: ClinicalSessionStatus;
  stage: ClinicalSessionStage;
  formInstanceIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionQueue {
  red: ClinicalSession[];
  yellow: ClinicalSession[];
  green: ClinicalSession[];
}

// ============================================
// Constants
// ============================================

const SESSIONS_DESIGN_DOC = 'sessions_by_status';
const SESSIONS_VIEW_OPEN = 'by_status_open';

// ============================================
// Session Engine
// ============================================

const _sessions = ref<ClinicalSession[]>([]);
const _isInitialized = ref(false);

/**
 * Get or derive the encryption key
 */
async function getEncryptionKey(): Promise<Uint8Array> {
  const securityStore = useSecurityStore();
  
  if (!securityStore.encryptionKey) {
    await securityStore.ensureEncryptionKey();
  }
  
  if (!securityStore.encryptionKey) {
    throw new Error('[SessionEngine] Encryption key not available');
  }
  
  return securityStore.encryptionKey;
}

/**
 * Initialize the session engine
 * Sets up indexes if needed
 */
export async function initializeSessionEngine(): Promise<void> {
  if (_isInitialized.value) return;
  
  const key = await getEncryptionKey();
  
  // Ensure secureDb is initialized
  if (!isSecureDbReady()) {
    await initializeSecureDb(key);
  }
  
  // Create design doc for querying sessions by status
  try {
    const { secureCreateDesignDoc } = await import('~/services/secureDb');
    await secureCreateDesignDoc(
      SESSIONS_DESIGN_DOC,
      {
        [SESSIONS_VIEW_OPEN]: {
          map: `function(doc) {
            if (doc._id.startsWith('session:') && doc.status === 'open') {
              emit(doc.triage, doc);
            }
          }`
        }
      },
      key
    );
  } catch (error) {
    // Design doc might already exist
    console.log('[SessionEngine] Index creation skipped (may already exist)');
  }
  
  _isInitialized.value = true;
  console.log('[SessionEngine] Engine initialized');
}

/**
 * Generate a unique ID for a session
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.getRandomValues(new Uint8Array(8))
    .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');
  return `session:${timestamp}-${randomPart}`;
}

/**
 * Create a new clinical session
 * @param patientId - Optional patient identifier
 */
export async function createSession(patientId?: string): Promise<ClinicalSession> {
  const key = await getEncryptionKey();
  const authStore = useAuthStore();
  
  const now = Date.now();
  const sessionId = generateSessionId();
  const session: ClinicalSession = {
    _id: sessionId,
    id: sessionId,
    patientId,
    triage: 'unknown',
    status: 'open',
    stage: 'registration',
    formInstanceIds: [],
    createdAt: now,
    updatedAt: now
  };
  
  // Store in secureDb
  await securePut(session, key);
  
  // Add to local cache
  _sessions.value.push(session);
  
  console.log('[SessionEngine] Created session:', session.id);
  
  return session;
}

/**
 * Load a session by ID
 */
export async function loadSession(sessionId: string): Promise<ClinicalSession | null> {
  const key = await getEncryptionKey();
  
  const session = await secureGet<ClinicalSession>(sessionId, key);
  
  if (session) {
    // Update cache
    const index = _sessions.value.findIndex(s => s.id === sessionId);
    if (index >= 0) {
      _sessions.value[index] = session;
    } else {
      _sessions.value.push(session);
    }
  }
  
  return session;
}

/**
 * Get all open sessions from cache or database
 */
async function getAllOpenSessions(): Promise<ClinicalSession[]> {
  const key = await getEncryptionKey();
  
  // Try to use the design doc query
  try {
    const { secureFind } = await import('~/services/secureDb');
    const sessions = await secureFind<ClinicalSession>({
      selector: {
        _id: { $regex: /^session:/ },
        status: 'open'
      }
    }, key);
    return sessions;
  } catch (error) {
    // Fallback to all docs and filter
    const allDocs = await secureAllDocs<ClinicalSession>(key);
    return allDocs.filter(
      doc => doc._id?.startsWith('session:') && doc.status === 'open'
    );
  }
}

/**
 * Get open sessions grouped by triage priority
 */
export async function getOpenSessionsByPriority(): Promise<SessionQueue> {
  // Initialize if needed
  if (!_isInitialized.value) {
    await initializeSessionEngine();
  }
  
  const sessions = await getAllOpenSessions();
  
  const queue: SessionQueue = {
    red: [],
    yellow: [],
    green: []
  };
  
  // Sort by updatedAt (most recent first within each triage)
  const sortedSessions = sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  
  for (const session of sortedSessions) {
    if (session.triage === 'red') {
      queue.red.push(session);
    } else if (session.triage === 'yellow') {
      queue.yellow.push(session);
    } else {
      queue.green.push(session);
    }
  }
  
  return queue;
}

/**
 * Advance a session to the next stage
 * @param sessionId - Session ID
 * @param nextStage - Target stage
 */
export async function advanceStage(
  sessionId: string,
  nextStage: ClinicalSessionStage
): Promise<void> {
  const key = await getEncryptionKey();
  
  const session = await loadSession(sessionId);
  if (!session) {
    throw new Error(`[SessionEngine] Session not found: ${sessionId}`);
  }
  
  // Validate stage transition
  const validStages: ClinicalSessionStage[] = [
    'registration', 
    'assessment', 
    'treatment', 
    'discharge'
  ];
  const currentIndex = validStages.indexOf(session.stage);
  const nextIndex = validStages.indexOf(nextStage);
  
  if (nextIndex < 0 || nextIndex > currentIndex + 1) {
    throw new Error(`[SessionEngine] Invalid stage transition: ${session.stage} → ${nextStage}`);
  }
  
  session.stage = nextStage;
  session.updatedAt = Date.now();
  
  // Save to secureDb
  await securePut(session, key);
  
  // Update cache
  const index = _sessions.value.findIndex(s => s.id === sessionId);
  if (index >= 0) {
    _sessions.value[index] = session;
  }
  
  console.log('[SessionEngine] Advanced session to stage:', session.id, nextStage);
}

/**
 * Update session triage based on form results
 * @param sessionId - Session ID
 * @param triage - New triage value
 */
export async function updateSessionTriage(
  sessionId: string,
  triage: ClinicalSessionTriage
): Promise<void> {
  const key = await getEncryptionKey();
  
  const session = await loadSession(sessionId);
  if (!session) {
    throw new Error(`[SessionEngine] Session not found: ${sessionId}`);
  }
  
  session.triage = triage;
  session.updatedAt = Date.now();
  
  // Save to secureDb
  await securePut(session, key);
  
  // Update cache
  const index = _sessions.value.findIndex(s => s.id === sessionId);
  if (index >= 0) {
    _sessions.value[index] = session;
  }
  
  console.log('[SessionEngine] Updated session triage:', session.id, triage);
}

/**
 * Complete a session
 * @param sessionId - Session ID
 * @param finalStatus - Final status (completed, referred, cancelled)
 */
export async function completeSession(
  sessionId: string,
  finalStatus: 'completed' | 'referred' | 'cancelled' = 'completed'
): Promise<void> {
  const key = await getEncryptionKey();
  
  const session = await loadSession(sessionId);
  if (!session) {
    throw new Error(`[SessionEngine] Session not found: ${sessionId}`);
  }
  
  session.status = finalStatus;
  session.stage = 'discharge';
  session.updatedAt = Date.now();
  
  // Save to secureDb
  await securePut(session, key);
  
  // Update cache
  const index = _sessions.value.findIndex(s => s.id === sessionId);
  if (index >= 0) {
    _sessions.value[index] = session;
  }
  
  console.log('[SessionEngine] Completed session:', session.id, finalStatus);
}

/**
 * Link a form instance to a session
 * @param sessionId - Session ID
 * @param formInstanceId - Form instance ID
 */
export async function linkFormToSession(
  sessionId: string,
  formInstanceId: string
): Promise<void> {
  const key = await getEncryptionKey();
  
  const session = await loadSession(sessionId);
  if (!session) {
    throw new Error(`[SessionEngine] Session not found: ${sessionId}`);
  }
  
  if (!session.formInstanceIds.includes(formInstanceId)) {
    session.formInstanceIds.push(formInstanceId);
    session.updatedAt = Date.now();
    
    // Save to secureDb
    await securePut(session, key);
    
    // Update cache
    const index = _sessions.value.findIndex(s => s.id === sessionId);
    if (index >= 0) {
      _sessions.value[index] = session;
    }
  }
}

/**
 * Get session statistics
 */
export async function getSessionStats(): Promise<{
  open: number;
  completed: number;
  red: number;
  yellow: number;
  green: number;
}> {
  const key = await getEncryptionKey();
  
  const allDocs = await secureAllDocs<ClinicalSession>(key);
  const sessions = allDocs.filter(doc => doc._id?.startsWith('session:'));
  
  return {
    open: sessions.filter(s => s.status === 'open').length,
    completed: sessions.filter(s => s.status === 'completed').length,
    red: sessions.filter(s => s.status === 'open' && s.triage === 'red').length,
    yellow: sessions.filter(s => s.status === 'open' && s.triage === 'yellow').length,
    green: sessions.filter(s => s.status === 'open' && (s.triage === 'green' || s.triage === 'unknown')).length
  };
}

/**
 * Update session with patient registration data
 * @param sessionId - Session ID
 * @param data - Registration data to update
 */
export async function updateSession(
  sessionId: string,
  data: {
    patientCpt?: string;
    patientId?: string;
    patientName?: string;
    dateOfBirth?: string;
    gender?: string;
    chiefComplaint?: string;
    notes?: string;
  }
): Promise<void> {
  const key = await getEncryptionKey();
  
  const session = await loadSession(sessionId);
  if (!session) {
    throw new Error(`[SessionEngine] Session not found: ${sessionId}`);
  }
  
  // Update fields
  if (data.patientCpt !== undefined) {
    session.patientCpt = data.patientCpt;
  }
  if (data.patientId !== undefined) {
    session.patientId = data.patientId;
  }
  if (data.patientName !== undefined) {
    session.patientName = data.patientName;
  }
  if (data.dateOfBirth !== undefined) {
    session.dateOfBirth = data.dateOfBirth;
  }
  if (data.gender !== undefined) {
    session.gender = data.gender;
  }
  if (data.chiefComplaint !== undefined) {
    session.chiefComplaint = data.chiefComplaint;
  }
  if (data.notes !== undefined) {
    session.notes = data.notes;
  }
  
  session.updatedAt = Date.now();
  
  // Save to secureDb
  await securePut(session, key);
  
  // Update cache
  const index = _sessions.value.findIndex(s => s.id === sessionId);
  if (index >= 0) {
    _sessions.value[index] = session;
  }
  
  console.log('[SessionEngine] Updated session:', session.id);
}

/**
 * Clear session cache (for logout/testing)
 */
export function clearSessionCache(): void {
  _sessions.value = [];
}
