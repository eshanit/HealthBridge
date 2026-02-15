/**
 * Sync Manager Service
 * 
 * Manages offline/online synchronization with the central server.
 * Uses PouchDB replication for bidirectional sync.
 * 
 * Responsibilities:
 * - Detect connectivity
 * - Start/stop pouch replication
 * - Expose sync status
 * - Auto retry
 * - Conflict detection and resolution
 * - Deterministic merge strategies
 * - Audit trail for all merges
 */

import { ref, computed } from 'vue';
import PouchDB from 'pouchdb-browser';
import { getSecureDb } from '~/services/secureDb';
import { useSecurityStore } from '~/stores/security';
import { useAuthStore } from '~/stores/auth';
import { logEvent, type TimelineEventType } from '~/services/clinicalTimeline';

// ============================================
// Types
// ============================================

export type SyncStatus = 'offline' | 'syncing' | 'error' | 'synced';

export interface SyncInfo {
  status: SyncStatus;
  lastSyncTime: number | null;
  pendingChanges: number;
  lastError: string | null;
}

export interface ConflictInfo {
  id: string;
  localRev: string;
  remoteRev: string;
  localDoc: any;
  remoteDoc: any;
  resolved: boolean;
  resolvedAt?: number;
  resolution?: 'local' | 'remote' | 'merge';
}

// ============================================
// Conflict Resolution Strategies
// ============================================

/**
 * Field-specific merge strategies for deterministic conflict resolution
 */
const CONFLICT_RESOLUTION_STRATEGIES: Record<string, 'latest' | 'highest' | 'union' | 'max'> = {
  status: 'latest',           // latest updatedAt
  stage: 'highest',           // highest progression
  triagePriority: 'highest',  // highest severity
  formInstanceIds: 'union',   // merge arrays
  updatedAt: 'max',           // max timestamp
  notes: 'union',             // concatenate notes
  vitalSigns: 'union'         // merge vital signs objects
};

/**
 * Resolve a conflict between local and remote documents
 * Uses deterministic strategies to merge conflicting updates
 */
function resolveDocumentConflict(localDoc: any, remoteDoc: any): any {
  const merged = { ...localDoc };
  
  for (const [field, strategy] of Object.entries(CONFLICT_RESOLUTION_STRATEGIES)) {
    const localValue = localDoc[field];
    const remoteValue = remoteDoc[field];
    
    if (localValue === undefined && remoteValue === undefined) continue;
    
    switch (strategy) {
      case 'latest':
        // Use whichever has the later updatedAt
        if (remoteValue && (!localValue || new Date(remoteValue.updatedAt || remoteValue) > new Date(localValue.updatedAt || localValue))) {
          merged[field] = remoteValue;
        }
        break;
        
      case 'highest':
        // Use the highest numeric value
        const localNum = parseFloat(localValue) || 0;
        const remoteNum = parseFloat(remoteValue) || 0;
        merged[field] = remoteNum > localNum ? remoteValue : localValue;
        break;
        
      case 'union':
        // Merge arrays or concatenate strings
        if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
          merged[field] = [...new Set([...localValue, ...remoteValue])];
        } else if (typeof localValue === 'string' && typeof remoteValue === 'string') {
          merged[field] = `${localValue}\n${remoteValue}`;
        } else if (typeof localValue === 'object' && typeof remoteValue === 'object') {
          merged[field] = { ...localValue, ...remoteValue };
        }
        break;
        
      case 'max':
        // Use the maximum value
        const localMax = localValue ? new Date(localValue).getTime() : 0;
        const remoteMax = remoteValue ? new Date(remoteValue).getTime() : 0;
        merged[field] = remoteMax > localMax ? remoteValue : localValue;
        break;
    }
  }
  
  // Ensure _id and _rev are preserved correctly
  merged._id = localDoc._id;
  
  return merged;
}

/**
 * Log conflict event to timeline
 */
async function logConflictToTimeline(
  docId: string,
  localRev: string,
  remoteRev: string,
  mergedFields: string[]
): Promise<void> {
  try {
    await logEvent({
      sessionId: docId,
      type: 'data_sync' as TimelineEventType,
      data: {
        description: 'Conflict merged during sync',
        previousValue: { localRev, remoteRev },
        newValue: { mergedFields, timestamp: new Date().toISOString() },
        actor: 'system'
      }
    });
  } catch (error) {
    console.warn('[SyncManager] Failed to log conflict to timeline:', error);
  }
}

// ============================================
// Constants
// ============================================

const SYNC_STATUS_KEY = 'healthbridge_sync_status';
const CONFLICTS_KEY = 'healthbridge_sync_conflicts';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;
const SYNC_INTERVAL_MS = 30000;

// Track sync replication for push/pull operations
let _syncReplication: any = null;
let _pushReplication: any = null;
let _pullReplication: any = null;

// ============================================
// Sync Manager
// ============================================

const _status = ref<SyncStatus>('offline');
const _lastSyncTime = ref<number | null>(null);
const _pendingChanges = ref(0);
const _lastError = ref<string | null>(null);
const _conflicts = ref<ConflictInfo[]>([]);
const _isRunning = ref(false);
let _replication: PouchDB.Replication.Sync<any> | null = null;
let _retryCount = 0;
let _retryTimeout: ReturnType<typeof setTimeout> | null = null;
let _syncInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Get or derive the encryption key
 */
async function getEncryptionKey(): Promise<Uint8Array> {
  const securityStore = useSecurityStore();
  
  if (!securityStore.encryptionKey) {
    await securityStore.ensureEncryptionKey();
  }
  
  if (!securityStore.encryptionKey) {
    throw new Error('[SyncManager] Encryption key not available');
  }
  
  return securityStore.encryptionKey;
}

/**
 * Initialize the sync manager
 */
export async function initializeSyncManager(): Promise<void> {
  // Load persisted state
  const statusStored = localStorage.getItem(SYNC_STATUS_KEY);
  if (statusStored) {
    try {
      const info: SyncInfo = JSON.parse(statusStored);
      _lastSyncTime.value = info.lastSyncTime;
      _lastError.value = info.lastError;
    } catch {
      // Ignore parse errors
    }
  }
  
  const conflictsStored = localStorage.getItem(CONFLICTS_KEY);
  if (conflictsStored) {
    try {
      _conflicts.value = JSON.parse(conflictsStored);
    } catch {
      // Ignore parse errors
    }
  }
  
  // Set up online/offline detection
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // Check initial connectivity
  if (navigator.onLine) {
    _status.value = 'synced';
  }
  
  console.log('[SyncManager] Initialized');
}

/**
 * Handle coming online
 */
function handleOnline(): void {
  console.log('[SyncManager] Online - starting sync');
  startSync();
}

/**
 * Handle going offline
 */
function handleOffline(): void {
  console.log('[SyncManager] Offline - stopping sync');
  stopSync();
  _status.value = 'offline';
  persistStatus();
}

/**
 * Get sync status as a computed value
 */
export function useSyncStatus() {
  return computed(() => ({
    status: _status.value,
    lastSyncTime: _lastSyncTime.value,
    pendingChanges: _pendingChanges.value,
    lastError: _lastError.value,
    conflictCount: _conflicts.value.filter(c => !c.resolved).length
  }));
}

/**
 * Get sync status synchronously
 */
export function getSyncStatus(): SyncInfo {
  return {
    status: _status.value,
    lastSyncTime: _lastSyncTime.value,
    pendingChanges: _pendingChanges.value,
    lastError: _lastError.value
  };
}

/**
 * Start synchronization
 */
export async function startSync(): Promise<void> {
  if (_isRunning.value) {
    console.log('[SyncManager] Sync already running');
    return;
  }
  
  try {
    const key = await getEncryptionKey();
    const authStore = useAuthStore();
    const deviceId = authStore.getDeviceId();
    
    if (!deviceId) {
      console.log('[SyncManager] No device ID - cannot sync');
      return;
    }
    
    // Get the secure database
    const db = getSecureDb(key);
    
    // Construct remote URL (would come from config in production)
    const remoteUrl = `${import.meta.env.VITE_SYNC_SERVER_URL || 'http://localhost:5984'}/healthbridge_${deviceId}`;
    
    console.log('[SyncManager] Starting sync with:', remoteUrl);
    
    _status.value = 'syncing';
    _isRunning.value = true;
    _lastError.value = null;
    
    // Create replication with proper types
    const replication = db.sync(remoteUrl, {
      live: true,
      retry: true
    });
    
    _replication = replication as unknown as PouchDB.Replication.Sync<any>;
    
    // Add event handlers using addEventListener for better type compatibility
    (replication as any).on('synced', (info: any) => {
      console.log('[SyncManager] Sync completed:', info);
      _status.value = 'synced';
      _lastSyncTime.value = Date.now();
      _pendingChanges.value = 0;
      _retryCount = 0;
      persistStatus();
    });
    
    // Handle changes
    (replication as any).on('change', (change: any) => {
      console.log('[SyncManager] Change detected:', change);
      _pendingChanges.value = change.change?.length || 0;
    });
    
    // Handle errors
    (replication as any).on('error', (error: any) => {
      console.error('[SyncManager] Sync error:', error);
      handleSyncError(error);
    });
    
    // Handle sync complete for live replication
    (replication as any).on('complete', (info: any) => {
      console.log('[SyncManager] Sync complete:', info);
    });
    
    // Handle conflicts (PouchDB may emit this on some versions)
    (replication as any).on('denied', (error: any) => {
      console.warn('[SyncManager] Sync denied:', error);
    });
    
    // Start periodic sync check
    _syncInterval = setInterval(() => {
      if (_status.value === 'synced') {
        checkPendingChanges();
      }
    }, SYNC_INTERVAL_MS);
    
    console.log('[SyncManager] Sync started');
    
  } catch (error) {
    console.error('[SyncManager] Failed to start sync:', error);
    handleSyncError(error);
  }
}

/**
 * Stop synchronization
 */
export async function stopSync(): Promise<void> {
  return new Promise((resolve) => {
    // Cancel live sync replication
    if (_syncReplication) {
      _syncReplication.cancel();
      _syncReplication = null;
    }
    
    // Cancel push/pull replications
    if (_pushReplication) {
      _pushReplication.cancel();
      _pushReplication = null;
    }
    
    if (_pullReplication) {
      _pullReplication.cancel();
      _pullReplication = null;
    }
    
    if (_syncInterval) {
      clearInterval(_syncInterval);
      _syncInterval = null;
    }
    
    if (_retryTimeout) {
      clearTimeout(_retryTimeout);
      _retryTimeout = null;
    }
    
    _isRunning.value = false;
    console.log('[SyncManager] Sync stopped');
    
    resolve();
  });
}

/**
 * Handle sync error with retry logic
 */
function handleSyncError(error: any): void {
  _status.value = 'error';
  _lastError.value = error?.message || 'Unknown sync error';
  _isRunning.value = false;
  
  // Retry logic
  if (_retryCount < MAX_RETRIES) {
    _retryCount++;
    const delay = RETRY_DELAY_MS * Math.pow(2, _retryCount - 1); // Exponential backoff
    
    console.log(`[SyncManager] Retry ${_retryCount}/${MAX_RETRIES} in ${delay}ms`);
    
    _retryTimeout = setTimeout(() => {
      startSync();
    }, delay);
  } else {
    console.error('[SyncManager] Max retries reached');
    _lastError.value = 'Max sync retries reached. Please try again later.';
  }
  
  persistStatus();
}

/**
 * Check for pending changes
 */
async function checkPendingChanges(): Promise<void> {
  try {
    const key = await getEncryptionKey();
    const db = getSecureDb(key);
    await db.info();
    
    // PouchDB doesn't expose pending changes directly in info,
    // but we can estimate from doc_count vs update_seq
    // This is a simplified check
    _pendingChanges.value = 0; // Would need replication status for accurate count
    
  } catch (error) {
    console.warn('[SyncManager] Failed to check pending changes:', error);
  }
}

/**
 * Log a conflict
 */
function logConflict(error: any): void {
  const conflict: ConflictInfo = {
    id: error?.id || crypto.randomUUID(),
    localRev: error?.local?.rev || '',
    remoteRev: error?.remote?.rev || '',
    localDoc: error?.local?.doc || null,
    remoteDoc: error?.remote?.doc || null,
    resolved: false
  };
  
  _conflicts.value.push(conflict);
  persistConflicts();
  
  // Log to audit
  const authStore = useAuthStore();
  authStore.logAction('sync_conflict', false, `Document ${conflict.id}`);
  
  // Log to clinical timeline if it's a clinical session
  if (conflict.id.startsWith('session:') || conflict.id.startsWith('clinical:')) {
    logConflictToTimeline(conflict.id, conflict.localRev, conflict.remoteRev, Object.keys(conflict.localDoc || {}));
  }
}

/**
 * Resolve a conflict
 */
export async function resolveConflict(
  conflictId: string,
  resolution: 'local' | 'remote' | 'merge'
): Promise<void> {
  const conflict = _conflicts.value.find(c => c.id === conflictId);
  if (!conflict) {
    throw new Error('Conflict not found');
  }
  
  const key = await getEncryptionKey();
  const db = getSecureDb(key);
  
  if (resolution === 'local') {
    // Use local document, delete remote revision
    if (conflict.localDoc) {
      await db.put({
        ...conflict.localDoc,
        _rev: conflict.localRev
      });
    }
  } else if (resolution === 'remote') {
    // Use remote document
    if (conflict.remoteDoc) {
      await db.put({
        ...conflict.remoteDoc,
        _rev: conflict.remoteRev
      });
    }
  } else if (resolution === 'merge') {
    // Perform deterministic merge
    if (conflict.localDoc && conflict.remoteDoc) {
      const mergedDoc = resolveDocumentConflict(conflict.localDoc, conflict.remoteDoc);
      
      // Use { new_edits: false } to prevent PouchDB from creating new revisions
      await db.put(mergedDoc, { new_edits: false } as any);
      
      // Log merge to timeline
      await logConflictToTimeline(
        conflict.id,
        conflict.localRev,
        conflict.remoteRev,
        Object.keys(mergedDoc)
      );
    }
  }
  
  conflict.resolved = true;
  conflict.resolvedAt = Date.now();
  conflict.resolution = resolution;
  
  persistConflicts();
  
  const authStore = useAuthStore();
  authStore.logAction('conflict_resolved', true, `${conflictId}: ${resolution}`);
}

/**
 * Get unresolved conflicts
 */
export function getUnresolvedConflicts(): ConflictInfo[] {
  return _conflicts.value.filter(c => !c.resolved);
}

/**
 * Get all conflicts
 */
export function getAllConflicts(): ConflictInfo[] {
  return _conflicts.value;
}

/**
 * Persist sync status to localStorage
 */
function persistStatus(): void {
  const info: SyncInfo = {
    status: _status.value,
    lastSyncTime: _lastSyncTime.value,
    pendingChanges: _pendingChanges.value,
    lastError: _lastError.value
  };
  
  localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(info));
}

/**
 * Persist conflicts to localStorage
 */
function persistConflicts(): void {
  localStorage.setItem(CONFLICTS_KEY, JSON.stringify(_conflicts.value));
}

/**
 * Clear all conflicts
 */
export function clearConflicts(): void {
  _conflicts.value = [];
  persistConflicts();
}

/**
 * Force a manual sync (push then pull)
 */
export async function forceSync(): Promise<void> {
  await stopSync();
  _retryCount = 0;
  await startSync();
}

// ============================================
// PHASE 4: Push/Pull Operations
// ============================================

/**
 * Push local changes to remote server (one-time, non-live)
 */
export async function pushNow(): Promise<{ success: boolean; changes: number; errors: string[] }> {
  const errors: string[] = [];
  let changes = 0;
  
  try {
    const key = await getEncryptionKey();
    const authStore = useAuthStore();
    const deviceId = authStore.getDeviceId();
    
    if (!deviceId) {
      throw new Error('No device ID - cannot push');
    }
    
    const db = getSecureDb(key);
    const remoteUrl = `${import.meta.env.VITE_SYNC_SERVER_URL || 'http://localhost:5984'}/healthbridge_${deviceId}`;
    
    console.log('[SyncManager] Pushing changes to:', remoteUrl);
    _status.value = 'syncing';
    
    return new Promise((resolve) => {
      const replication = db.replicate.to(remoteUrl, {
        retry: true,
        timeout: 120000 // 2 minute timeout
      });
      
      _pushReplication = replication as any;
      
      replication.on('change', (change: any) => {
        changes = change.docs_written || 0;
        _pendingChanges.value = Math.max(0, _pendingChanges.value - changes);
      });
      
      replication.on('complete', (info: any) => {
        console.log('[SyncManager] Push complete:', info);
        _status.value = 'synced';
        _lastSyncTime.value = Date.now();
        _pushReplication = null;
        resolve({ success: true, changes, errors });
      });
      
      replication.on('error', (error: any) => {
        const errorMsg = error?.message || 'Unknown push error';
        errors.push(errorMsg);
        console.error('[SyncManager] Push error:', error);
        _pushReplication = null;
        resolve({ success: false, changes, errors });
      });
    });
    
  } catch (error: any) {
    errors.push(error.message);
    _status.value = 'error';
    return { success: false, changes: 0, errors };
  }
}

/**
 * Pull changes from remote server (one-time, non-live)
 */
export async function pullNow(): Promise<{ success: boolean; changes: number; errors: string[] }> {
  const errors: string[] = [];
  let changes = 0;
  
  try {
    const key = await getEncryptionKey();
    const authStore = useAuthStore();
    const deviceId = authStore.getDeviceId();
    
    if (!deviceId) {
      throw new Error('No device ID - cannot pull');
    }
    
    const db = getSecureDb(key);
    const remoteUrl = `${import.meta.env.VITE_SYNC_SERVER_URL || 'http://localhost:5984'}/healthbridge_${deviceId}`;
    
    console.log('[SyncManager] Pulling changes from:', remoteUrl);
    _status.value = 'syncing';
    
    return new Promise((resolve) => {
      const replication = db.replicate.from(remoteUrl, {
        retry: true,
        timeout: 120000 // 2 minute timeout
      });
      
      _pullReplication = replication as any;
      
      replication.on('change', (change: any) => {
        changes = change.docs_written || 0;
      });
      
      replication.on('complete', (info: any) => {
        console.log('[SyncManager] Pull complete:', info);
        _status.value = 'synced';
        _lastSyncTime.value = Date.now();
        _pullReplication = null;
        resolve({ success: true, changes, errors });
      });
      
      replication.on('error', (error: any) => {
        const errorMsg = error?.message || 'Unknown pull error';
        errors.push(errorMsg);
        console.error('[SyncManager] Pull error:', error);
        _pullReplication = null;
        resolve({ success: false, changes, errors });
      });
    });
    
  } catch (error: any) {
    errors.push(error.message);
    _status.value = 'error';
    return { success: false, changes: 0, errors };
  }
}

// ============================================
// PHASE 4: Conflict Detection & Resolution
// ============================================

/**
 * Check a document for conflicts and resolve them
 * Called when a document with _conflicts is detected
 */
export async function checkAndResolveConflicts(docId: string): Promise<{
  hasConflicts: boolean;
  resolved: boolean;
  mergedFields: string[];
}> {
  try {
    const key = await getEncryptionKey();
    const db = getSecureDb(key);
    
    // Get the document with conflict info
    const doc = await db.get(docId);
    
    // Check for conflicts
    if (!doc._conflicts || doc._conflicts.length === 0) {
      return { hasConflicts: false, resolved: false, mergedFields: [] };
    }
    
    console.log(`[SyncManager] Found ${doc._conflicts.length} conflicts for doc:`, docId);
    
    // Get the winning revision
    const winningRev = doc._rev;
    
    // Get all conflicting revisions
    const conflictRevs = doc._conflicts;
    const mergedFields: string[] = [];
    
    for (const conflictRev of conflictRevs) {
      try {
        // Get the conflicting revision
        const conflictDoc = await db.get(docId, { rev: conflictRev });
        
        // Perform deterministic merge
        const merged = resolveDocumentConflict(conflictDoc, doc);
        
        // Add the merged fields to our tracking
        mergedFields.push(...Object.keys(merged).filter(k => k !== '_id' && k !== '_rev'));
        
        // Write the merged document with { new_edits: false }
        await db.put(merged, { new_edits: false } as any);
        
        // Delete the conflicting revision
        await db.remove(docId, conflictRev);
        
        console.log(`[SyncManager] Resolved conflict rev ${conflictRev} for doc:`, docId);
        
        // Log conflict resolution to timeline
        await logConflictToTimeline(docId, conflictRev, winningRev, Object.keys(merged));
        
      } catch (conflictError: any) {
        console.error('[SyncManager] Failed to resolve conflict:', conflictError);
      }
    }
    
    return { 
      hasConflicts: true, 
      resolved: true, 
      mergedFields: [...new Set(mergedFields)] 
    };
    
  } catch (error: any) {
    console.error('[SyncManager] Error checking conflicts:', error);
    return { hasConflicts: false, resolved: false, mergedFields: [] };
  }
}

/**
 * Auto-resolve all pending conflicts
 */
export async function resolveAllConflicts(): Promise<{
  total: number;
  resolved: number;
  failed: number;
}> {
  let total = 0;
  let resolved = 0;
  let failed = 0;
  
  for (const conflict of _conflicts.value) {
    if (!conflict.resolved) {
      total++;
      try {
        await resolveConflict(conflict.id, 'merge');
        resolved++;
      } catch (error) {
        failed++;
        console.error('[SyncManager] Failed to auto-resolve conflict:', conflict.id);
      }
    }
  }
  
  return { total, resolved, failed };
}

/**
 * Get sync statistics
 */
export function getSyncStats(): {
  status: SyncStatus;
  isRunning: boolean;
  lastSyncTime: number | null;
  pendingChanges: number;
  unresolvedConflicts: number;
  retryCount: number;
} {
  return {
    status: _status.value,
    isRunning: _isRunning.value,
    lastSyncTime: _lastSyncTime.value,
    pendingChanges: _pendingChanges.value,
    unresolvedConflicts: _conflicts.value.filter(c => !c.resolved).length,
    retryCount: _retryCount
  };
}

/**
 * Clean up sync manager (for logout/testing)
 */
export async function cleanupSyncManager(): Promise<void> {
  await stopSync();
  _status.value = 'offline';
  _lastSyncTime.value = null;
  _pendingChanges.value = 0;
  _lastError.value = null;
  _retryCount = 0;
  persistStatus();
  
  console.log('[SyncManager] Cleanup complete');
}
