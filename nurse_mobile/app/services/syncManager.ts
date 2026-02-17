/**
 * Sync Manager Service
 * 
 * Manages offline/online synchronization with the central server.
 * Uses PouchDB replication for bidirectional sync.
 * 
 * Architecture: Dual-Database Pattern
 * - Encrypted Local DB (secureDb) → Decrypt → Sync Cache (syncDb) → CouchDB
 * 
 * The sync cache holds plaintext documents temporarily during sync.
 * Documents are decrypted from the encrypted local DB, placed in the
 * sync cache, and then replicated to CouchDB. After successful sync,
 * the cache is cleared to minimize memory exposure.
 * 
 * Responsibilities:
 * - Detect connectivity
 * - Start/stop pouch replication
 * - Expose sync status
 * - Auto retry
 * - Conflict detection and resolution
 * - Deterministic merge strategies
 * - Audit trail for all merges
 * 
 * @see docs/DUAL_DATABASE_SYNC_ARCHITECTURE.md
 */

import { ref, computed } from 'vue';
import PouchDB from 'pouchdb-browser';
import { getSecureDb } from '~/services/secureDb';
import { useSecurityStore } from '~/stores/security';
import { useAuthStore } from '~/stores/auth';
import { logEvent, type TimelineEventType } from '~/services/clinicalTimeline';
import { useServerAuth } from '~/services/serverAuth';
import { decryptData, type EncryptedPayload } from '~/services/encryptionUtils';
import {
  addToSyncCache,
  getAllFromSyncCache,
  clearSyncCache,
  getSyncDb,
  populateSyncDb,
  destroySyncDb,
  clearAll,
  getSyncCacheStats,
  type SyncCacheEntry
} from '~/services/syncDb';

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
// DUAL-DATABASE SYNC FUNCTIONS
// ============================================

/**
 * Prepare documents for sync by decrypting them to the sync cache.
 * 
 * This function reads encrypted documents from the secure local database,
 * decrypts them, and places the plaintext versions in the sync cache.
 * The sync cache is then used as the source for PouchDB replication.
 * 
 * @param options - Filter options for which documents to prepare
 * @returns Number of documents successfully prepared
 */
export async function prepareDocumentsForSync(options: {
  docIds?: string[];
  includeAll?: boolean;
  sessionId?: string;
} = {}): Promise<{ prepared: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let prepared = 0;
  let failed = 0;
  
  try {
    const key = await getEncryptionKey();
    const db = getSecureDb(key);
    
    let documentsToPrepare: any[] = [];
    
    if (options.docIds && options.docIds.length > 0) {
      // Prepare specific documents by ID
      for (const docId of options.docIds) {
        try {
          const doc = await db.get(docId);
          documentsToPrepare.push(doc);
        } catch (error) {
          console.warn(`[SyncManager] Document not found: ${docId}`);
          failed++;
        }
      }
    } else if (options.sessionId) {
      // Prepare all documents for a specific session
      documentsToPrepare = await getSessionDocuments(db, options.sessionId, true);
    } else if (options.includeAll) {
      // Prepare all documents (use with caution!)
      const result = await db.allDocs({ include_docs: true });
      documentsToPrepare = result.rows.map(row => row.doc).filter(Boolean);
    } else {
      // Default: prepare all unsynced documents
      // For now, we'll prepare all documents that haven't been synced
      const result = await db.allDocs({ include_docs: true });
      documentsToPrepare = result.rows.map(row => row.doc).filter(Boolean);
    }
    
    console.log(`[SyncManager] Preparing ${documentsToPrepare.length} documents for sync`);
    
    // Decrypt each document and add to sync cache
    for (const encryptedDoc of documentsToPrepare) {
      try {
        // Check if document is encrypted (has encrypted flag and data field)
        if (encryptedDoc.encrypted && encryptedDoc.data) {
          // Document is encrypted - decrypt it
          try {
            const payload = JSON.parse(encryptedDoc.data);
            const decryptedJson = await decryptData(payload, key);
            const decryptedData = JSON.parse(decryptedJson);
            
            // Reconstruct plaintext document
            const plaintextDoc: SyncCacheEntry = {
              _id: encryptedDoc._id,
              _rev: encryptedDoc._rev,
              ...decryptedData
            };
            
            addToSyncCache(plaintextDoc);
            prepared++;
          } catch (decryptError) {
            console.error(`[SyncManager] Failed to decrypt ${encryptedDoc._id}:`, decryptError);
            errors.push(`Failed to decrypt ${encryptedDoc._id}`);
            failed++;
          }
        } else {
          // Document is not encrypted - add as-is
          addToSyncCache(encryptedDoc);
          prepared++;
        }
      } catch (error) {
        console.error(`[SyncManager] Failed to prepare ${encryptedDoc._id}:`, error);
        errors.push(`Failed to prepare ${encryptedDoc._id}`);
        failed++;
      }
    }
    
    console.log(`[SyncManager] Prepared ${prepared} documents, ${failed} failed`);
    
  } catch (error: any) {
    console.error('[SyncManager] Error preparing documents for sync:', error);
    errors.push(error.message || 'Unknown error');
  }
  
  return { prepared, failed, errors };
}

/**
 * Mark documents as synced after successful replication.
 * Clears the sync cache and updates sync status.
 */
export async function markDocumentsSynced(docIds?: string[]): Promise<void> {
  if (docIds && docIds.length > 0) {
    // Remove specific documents from cache
    for (const docId of docIds) {
      // removeFromSyncCache is not exported, so we'll clear all for now
      // In a future iteration, we can add selective removal
    }
  }
  
  // For now, clear the entire cache after successful sync
  // This is safe because the cache is temporary and should be empty after sync
  const stats = getSyncCacheStats();
  console.log(`[SyncManager] Clearing sync cache: ${stats.documentCount} documents`);
  clearSyncCache();
}

/**
 * Get the sync database for replication.
 * This returns a PouchDB instance populated with decrypted documents.
 */
export async function getPopulatedSyncDb(): Promise<PouchDB.Database> {
  // Populate the sync database from cache
  const result = await populateSyncDb();
  console.log(`[SyncManager] Populated sync database: ${result.success} success, ${result.failed} failed`);
  
  return getSyncDb();
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
 * 
 * Updated to use Dual-Database Sync Architecture.
 * Architecture: Encrypted Local DB → Decrypt → Sync Cache → CouchDB
 * 
 * @see GATEWAY.md for full specification
 * @see docs/DUAL_DATABASE_SYNC_ARCHITECTURE.md
 */
export async function startSync(): Promise<void> {
  // Check if sync is actually healthy and running
  if (_isRunning.value && _replication && _status.value !== 'error') {
    console.log('[SyncManager] Sync already running and healthy');
    return;
  }
  
  // If sync is in error state or replication is null, force restart
  if (_isRunning.value && (_status.value === 'error' || !_replication)) {
    console.log('[SyncManager] Sync in error state or broken - forcing restart');
    await stopSync();
  }
  
  try {
    const key = await getEncryptionKey();
    const authStore = useAuthStore();
    const serverAuth = useServerAuth();
    
    // Check if authenticated with server
    if (!serverAuth.isAuthenticated.value) {
      console.log('[SyncManager] Not authenticated with server - cannot sync');
      _status.value = 'offline';
      _lastError.value = 'Server authentication required';
      return;
    }
    
    // Validate the token is actually valid by trying to ensure it
    try {
      await serverAuth.ensureValidToken();
    } catch (tokenError) {
      console.error('[SyncManager] Token validation failed:', tokenError);
      _status.value = 'error';
      _lastError.value = 'Server authentication expired - please re-login';
      _isRunning.value = false;
      return;
    }
    
    // DUAL-DATABASE PATTERN: Prepare documents for sync
    // Decrypt documents from encrypted local DB to sync cache
    console.log('[SyncManager] Preparing documents for sync...');
    const prepareResult = await prepareDocumentsForSync({ includeAll: true });
    console.log(`[SyncManager] Prepared ${prepareResult.prepared} documents, ${prepareResult.failed} failed`);
    
    if (prepareResult.failed > 0) {
      console.warn('[SyncManager] Some documents failed to prepare:', prepareResult.errors);
    }
    
    // Get the populated sync database for replication
    const syncDb = await getPopulatedSyncDb();
    
    // Construct remote URL through Laravel proxy
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const remoteUrl = `${apiBaseUrl}/api/couchdb`;
    
    console.log('[SyncManager] Starting sync with Laravel proxy:', remoteUrl);
    
    _status.value = 'syncing';
    _isRunning.value = true;
    _lastError.value = null;
    
    // Create remote database with token injection
    const remoteDB = new PouchDB(remoteUrl, {
      fetch: async (url: string | Request, opts: any) => {
        // Ensure we have a valid token (refresh if needed)
        try {
          const bearerToken = await serverAuth.ensureValidToken();
          opts.headers = opts.headers || {};
          opts.headers.set('Authorization', bearerToken);
          opts.headers.set('Accept', 'application/json');
          opts.headers.set('Content-Type', 'application/json');
        } catch (error) {
          console.error('[SyncManager] Failed to get auth token:', error);
          // Update status to error since auth failed
          _status.value = 'error';
          _lastError.value = 'Authentication failed - please re-login';
          throw error;
        }
        return PouchDB.fetch(url, opts);
      }
    });
    
    // DUAL-DATABASE PATTERN: Sync from the sync cache (plaintext) to remote
    // Note: We use one-way replication (to remote) since the sync cache is temporary
    const replication = syncDb.replicate.to(remoteDB, {
      live: false, // One-time sync, not live
      retry: true,
      back_off_function: (delay: number) => {
        // Custom backoff with max 60 seconds
        return Math.min(delay * 2, 60000);
      }
    });
    
    _replication = replication as unknown as PouchDB.Replication.Sync<any>;
    
    // Add event handlers using addEventListener for better type compatibility
    (replication as any).on('complete', (info: any) => {
      console.log('[SyncManager] Sync completed:', info);
      _status.value = 'synced';
      _lastSyncTime.value = Date.now();
      _pendingChanges.value = 0;
      _retryCount = 0;
      persistStatus();
      
      // DUAL-DATABASE PATTERN: Clear sync cache after successful sync
      clearSyncCache();
      console.log('[SyncManager] Sync cache cleared after successful sync');
    });
    
    // Handle changes
    (replication as any).on('change', (change: any) => {
      console.log('[SyncManager] Change detected:', change);
      _pendingChanges.value = change.change?.length || 0;
    });
    
    // Handle errors
    (replication as any).on('error', (error: any) => {
      console.error('[SyncManager] Sync error:', error);
      
      // Check for auth errors
      if (error.status === 401 || error.status === 403) {
        _lastError.value = 'Authentication failed - please re-login';
        _status.value = 'error';
        _isRunning.value = false;
        serverAuth.logout();
      } else if (error.status === 500 || error.status === 502 || error.status === 503) {
        // Server errors - CouchDB might be down or misconfigured
        _lastError.value = `Server error (${error.status}) - CouchDB may be unavailable`;
        _status.value = 'error';
        _isRunning.value = false;
        console.error('[SyncManager] Server error - check CouchDB configuration');
      } else {
        handleSyncError(error);
      }
    });
    
    // Handle denied
    (replication as any).on('denied', (error: any) => {
      console.warn('[SyncManager] Sync denied:', error);
      
      // Log auth denial and update status
      if (error.status === 401 || error.status === 403) {
        _lastError.value = 'Access denied - please re-login';
        _status.value = 'error';
        _isRunning.value = false;
        serverAuth.logout();
      } else {
        handleSyncError(error);
      }
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
    // Cancel main replication
    if (_replication) {
      _replication.cancel();
      _replication = null;
    }
    
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
    
    // DUAL-DATABASE PATTERN: Clear sync cache on stop
    clearSyncCache();
    destroySyncDb();
    
    _isRunning.value = false;
    _retryCount = 0; // Reset retry count on stop
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
 * 
 * Updated to use Laravel proxy with Sanctum token authentication.
 */
export async function pushNow(): Promise<{ success: boolean; changes: number; errors: string[] }> {
  const errors: string[] = [];
  let changes = 0;
  
  try {
    const key = await getEncryptionKey();
    const serverAuth = useServerAuth();
    
    if (!serverAuth.isAuthenticated.value) {
      throw new Error('Not authenticated with server');
    }
    
    const db = getSecureDb(key);
    
    // Use Laravel proxy URL
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const remoteUrl = `${apiBaseUrl}/api/couchdb`;
    
    console.log('[SyncManager] Pushing changes to Laravel proxy:', remoteUrl);
    _status.value = 'syncing';
    
    // Create remote database with token injection
    const remoteDB = new PouchDB(remoteUrl, {
      fetch: async (url: string | Request, opts: any) => {
        const bearerToken = await serverAuth.ensureValidToken();
        opts.headers = opts.headers || {};
        opts.headers.set('Authorization', bearerToken);
        return PouchDB.fetch(url, opts);
      }
    });
    
    return new Promise((resolve) => {
      const replication = db.replicate.to(remoteDB, {
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
 * 
 * Updated to use Laravel proxy with Sanctum token authentication.
 */
export async function pullNow(): Promise<{ success: boolean; changes: number; errors: string[] }> {
  const errors: string[] = [];
  let changes = 0;
  
  try {
    const key = await getEncryptionKey();
    const serverAuth = useServerAuth();
    
    if (!serverAuth.isAuthenticated.value) {
      throw new Error('Not authenticated with server');
    }
    
    const db = getSecureDb(key);
    
    // Use Laravel proxy URL
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const remoteUrl = `${apiBaseUrl}/api/couchdb`;
    
    console.log('[SyncManager] Pulling changes from Laravel proxy:', remoteUrl);
    _status.value = 'syncing';
    
    // Create remote database with token injection
    const remoteDB = new PouchDB(remoteUrl, {
      fetch: async (url: string | Request, opts: any) => {
        const bearerToken = await serverAuth.ensureValidToken();
        opts.headers = opts.headers || {};
        opts.headers.set('Authorization', bearerToken);
        return PouchDB.fetch(url, opts);
      }
    });
    
    return new Promise((resolve) => {
      const replication = db.replicate.from(remoteDB, {
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
  
  // DUAL-DATABASE PATTERN: Clear all sync data
  await clearAll();
  
  _status.value = 'offline';
  _lastSyncTime.value = null;
  _pendingChanges.value = 0;
  _lastError.value = null;
  _retryCount = 0;
  persistStatus();
  
  console.log('[SyncManager] Cleanup complete');
}

// ============================================
// DISCHARGE-TRIGGERED SYNC
// ============================================

/**
 * Session sync result
 */
export interface SessionSyncResult {
  success: boolean;
  sessionId: string;
  documentsSynced: number;
  errors: string[];
  duration: number;
}

/**
 * Sync status for a specific session
 */
export interface SessionSyncStatus {
  sessionId: string;
  status: 'pending' | 'syncing' | 'synced' | 'error';
  lastAttempt?: number;
  error?: string;
  documentsPending: number;
}

// Track session-specific sync status
const _sessionSyncStatus = ref<Map<string, SessionSyncStatus>>(new Map());

/**
 * Get sync status for a specific session
 */
export function getSessionSyncStatus(sessionId: string): SessionSyncStatus | undefined {
  return _sessionSyncStatus.value.get(sessionId);
}

/**
 * Get all session sync statuses
 */
export function getAllSessionSyncStatuses(): SessionSyncStatus[] {
  return Array.from(_sessionSyncStatus.value.values());
}

/**
 * Sync a specific patient session to the server.
 * This is an on-demand sync triggered by patient discharge.
 * 
 * DUAL-DATABASE PATTERN:
 * 1. Get encrypted documents from secure local DB
 * 2. Decrypt documents to sync cache
 * 3. Replicate from sync cache to remote
 * 4. Clear sync cache after completion
 * 
 * @param sessionId - The session ID to sync
 * @param options - Sync options
 * @returns SessionSyncResult with sync details
 */
export async function syncSession(
  sessionId: string,
  options: {
    timeout?: number;
    includeRelated?: boolean;
  } = {}
): Promise<SessionSyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let documentsSynced = 0;
  
  console.log(`[SyncManager] Starting session sync for: ${sessionId}`);
  
  // Update session sync status
  _sessionSyncStatus.value.set(sessionId, {
    sessionId,
    status: 'syncing',
    lastAttempt: startTime,
    documentsPending: 0
  });
  
  try {
    const key = await getEncryptionKey();
    const serverAuth = useServerAuth();
    
    if (!serverAuth.isAuthenticated.value) {
      throw new Error('Not authenticated with server - cannot sync session');
    }
    
    const db = getSecureDb(key);
    const timeout = options.timeout || 60000; // 1 minute default timeout
    
    // DUAL-DATABASE PATTERN: Prepare documents for sync
    // This decrypts documents and places them in the sync cache
    console.log(`[SyncManager] Preparing session documents for sync...`);
    const prepareResult = await prepareDocumentsForSync({ sessionId });
    
    if (prepareResult.failed > 0) {
      console.warn(`[SyncManager] ${prepareResult.failed} documents failed to prepare`);
      errors.push(...prepareResult.errors);
    }
    
    console.log(`[SyncManager] Prepared ${prepareResult.prepared} documents for session ${sessionId}`);
    
    // Update pending count
    const status = _sessionSyncStatus.value.get(sessionId);
    if (status) {
      status.documentsPending = prepareResult.prepared;
    }
    
    // DUAL-DATABASE PATTERN: Get populated sync database
    const syncDb = await getPopulatedSyncDb();
    
    // Create remote database connection
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const remoteUrl = `${apiBaseUrl}/api/couchdb`;
    
    const remoteDB = new PouchDB(remoteUrl, {
      fetch: async (url: string | Request, opts: any) => {
        const bearerToken = await serverAuth.ensureValidToken();
        opts.headers = opts.headers || {};
        opts.headers.set('Authorization', bearerToken);
        opts.headers.set('Accept', 'application/json');
        opts.headers.set('Content-Type', 'application/json');
        return PouchDB.fetch(url, opts);
      }
    });
    
    // DUAL-DATABASE PATTERN: Push from sync cache to remote
    const pushResult = await pushDocumentsToRemote(syncDb, remoteDB, getAllFromSyncCache(), timeout);
    
    documentsSynced = pushResult.docsWritten;
    errors.push(...pushResult.errors);
    
    // DUAL-DATABASE PATTERN: Clear sync cache after sync
    clearSyncCache();
    await destroySyncDb();
    
    // Update session sync status
    const finalStatus = errors.length === 0 ? 'synced' : 'error';
    _sessionSyncStatus.value.set(sessionId, {
      sessionId,
      status: finalStatus,
      lastAttempt: Date.now(),
      error: errors.length > 0 ? errors.join('; ') : undefined,
      documentsPending: 0
    });
    
    const duration = Date.now() - startTime;
    console.log(`[SyncManager] Session sync complete: ${sessionId}, ${documentsSynced} docs, ${duration}ms`);
    
    return {
      success: errors.length === 0,
      sessionId,
      documentsSynced,
      errors,
      duration
    };
    
  } catch (error: any) {
    console.error(`[SyncManager] Session sync failed for ${sessionId}:`, error);
    
    // Update status with error
    _sessionSyncStatus.value.set(sessionId, {
      sessionId,
      status: 'error',
      lastAttempt: Date.now(),
      error: error.message || 'Unknown error',
      documentsPending: 0
    });
    
    errors.push(error.message || 'Unknown error');
    
    return {
      success: false,
      sessionId,
      documentsSynced: 0,
      errors,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Get all documents related to a session
 * 
 * Document ID patterns in the system:
 * - Sessions: `session:${timestamp}-${random}` (sessionId IS the _id)
 * - Forms: `form_${schemaId}_${timestamp}` (stored in session.formInstanceIds array)
 * - Timeline: `timeline:${timestamp}-${random}` (sessionId is a FIELD in the doc)
 * - AI requests: Various patterns, sessionId is a FIELD
 * - Referrals: Various patterns, sessionId is a FIELD
 */
async function getSessionDocuments(
  db: PouchDB.Database,
  sessionId: string,
  includeRelated: boolean
): Promise<any[]> {
  const documents: any[] = [];
  
  try {
    // 1. Get the session document itself
    // sessionId may already include the 'session:' prefix, so handle both cases
    const sessionDocId = sessionId.startsWith('session:') ? sessionId : `session:${sessionId}`;
    const sessionDoc = await db.get(sessionDocId).catch(() => null) as any;
    if (sessionDoc) {
      documents.push(sessionDoc);
      console.log(`[SyncManager] Found session document: ${sessionDocId}`);
    } else {
      console.warn(`[SyncManager] Session document not found: ${sessionDocId}`);
    }
    
    // 2. Get all form instances linked to this session
    // Form IDs are like `form_${schemaId}_${timestamp}` (no 'form:' prefix)
    if (includeRelated && sessionDoc?.formInstanceIds && Array.isArray(sessionDoc.formInstanceIds)) {
      for (const formInstanceId of sessionDoc.formInstanceIds) {
        // Form IDs don't have a 'form:' prefix, use the ID directly
        const formDoc = await db.get(formInstanceId).catch(() => null);
        if (formDoc) {
          documents.push(formDoc);
          console.log(`[SyncManager] Found form document: ${formInstanceId}`);
        } else {
          console.warn(`[SyncManager] Form document not found: ${formInstanceId}`);
        }
      }
    }
    
    // 3. Get clinical timeline events for this session
    // Timeline IDs are `timeline:${timestamp}-${random}` and sessionId is a field
    // We need to query all timeline docs and filter by sessionId field
    const timelineDocs = await db.allDocs({
      startkey: `timeline:`,
      endkey: `timeline:\uffff`,
      include_docs: true
    });
    
    for (const row of timelineDocs.rows) {
      if (row.doc && (row.doc as any).sessionId === sessionId) {
        documents.push(row.doc);
      }
    }
    console.log(`[SyncManager] Found ${timelineDocs.rows.filter(r => r.doc && (r.doc as any).sessionId === sessionId).length} timeline documents`);
    
    // 4. Get any AI request records for this session
    // AI request IDs vary, sessionId is stored as a field
    const aiDocs = await db.allDocs({
      startkey: `ai_request:`,
      endkey: `ai_request:\uffff`,
      include_docs: true
    });
    
    for (const row of aiDocs.rows) {
      if (row.doc && (row.doc as any).sessionId === sessionId) {
        documents.push(row.doc);
      }
    }
    console.log(`[SyncManager] Found ${aiDocs.rows.filter(r => r.doc && (r.doc as any).sessionId === sessionId).length} AI request documents`);
    
    // 5. Get referral documents if any
    // Referral IDs vary, sessionId is stored as a field
    const referralDocs = await db.allDocs({
      startkey: `referral:`,
      endkey: `referral:\uffff`,
      include_docs: true
    });
    
    for (const row of referralDocs.rows) {
      if (row.doc && (row.doc as any).sessionId === sessionId) {
        documents.push(row.doc);
      }
    }
    console.log(`[SyncManager] Found ${referralDocs.rows.filter(r => r.doc && (r.doc as any).sessionId === sessionId).length} referral documents`);
    
    console.log(`[SyncManager] Total documents found for session ${sessionId}: ${documents.length}`);
    
  } catch (error) {
    console.warn(`[SyncManager] Error getting session documents:`, error);
  }
  
  return documents;
}

/**
 * Push documents to remote database
 */
async function pushDocumentsToRemote(
  localDb: PouchDB.Database,
  remoteDb: PouchDB.Database,
  documents: any[],
  timeout: number
): Promise<{ docsWritten: number; errors: string[] }> {
  const errors: string[] = [];
  let docsWritten = 0;
  
  if (documents.length === 0) {
    return { docsWritten: 0, errors: [] };
  }
  
  return new Promise((resolve) => {
    // Use bulk docs for efficiency
    const replication = localDb.replicate.to(remoteDb, {
      doc_ids: documents.map(d => d._id),
      timeout
    });
    
    replication.on('change', (info: any) => {
      docsWritten += info.docs_written || 0;
      console.log(`[SyncManager] Replicated ${info.docs_written} documents`);
    });
    
    replication.on('complete', (info: any) => {
      console.log(`[SyncManager] Push complete:`, info);
      resolve({ docsWritten, errors });
    });
    
    replication.on('error', (error: any) => {
      console.error(`[SyncManager] Push error:`, error);
      errors.push(error.message || 'Push failed');
      resolve({ docsWritten, errors });
    });
  });
}

/**
 * Sync multiple sessions (batch operation)
 */
export async function syncSessions(
  sessionIds: string[],
  options: {
    concurrency?: number;
    timeout?: number;
  } = {}
): Promise<SessionSyncResult[]> {
  const results: SessionSyncResult[] = [];
  const concurrency = options.concurrency || 3; // Sync 3 sessions at a time
  
  // Process in batches
  for (let i = 0; i < sessionIds.length; i += concurrency) {
    const batch = sessionIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(sessionId => syncSession(sessionId, options))
    );
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Ensure a session is synced before proceeding.
 * This is a blocking call that waits for sync completion.
 * 
 * @param sessionId - Session ID to sync
 * @param maxWaitMs - Maximum time to wait (default 30 seconds)
 * @returns True if synced successfully, false otherwise
 */
export async function ensureSessionSynced(
  sessionId: string,
  maxWaitMs: number = 30000
): Promise<boolean> {
  const result = await syncSession(sessionId, { timeout: maxWaitMs });
  return result.success;
}
