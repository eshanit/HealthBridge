/**
 * Sync Service with Live + Retry
 * 
 * Handles bi-directional synchronization with CouchDB
 * with exponential backoff retry logic.
 * 
 * @module services/sync
 */

import PouchDB from 'pouchdb-browser';
import { getSecureDb, secureGet, secureFind, isSecureDbReady, initializeSecureDb } from './secureDb';
import { useSecurityStore } from '~/stores/security';

// Type definitions for PouchDB events
interface PouchDBChangeEvent {
  direction: 'push' | 'pull';
  change?: {
    changes?: Array<{ rev: string }>;
    doc?: unknown;
    id: string;
  };
}

interface PouchDBSyncInfo {
  push?: {
    ok: number;
    start_time?: string;
    end_time?: string;
    docs_read: number;
    docs_written: number;
    doc_write_failures: number;
    errors: string[];
  };
  pull?: {
    ok: number;
    start_time?: string;
    end_time?: string;
    docs_read: number;
    docs_written: number;
    doc_write_failures: number;
    errors: string[];
  };
}

interface PouchDBError {
  message: string;
  status?: number;
  name?: string;
  reason?: string;
}

/**
 * Sync event types for logging
 */
export type SyncEventType =
  | 'sync_start'
  | 'sync_complete'
  | 'sync_error'
  | 'sync_retry'
  | 'sync_change'
  | 'sync_paused'
  | 'sync_active'
  | 'sync_denied'
  | 'sync_unknown';

/**
 * Sync event log entry
 */
export interface SyncEvent {
  id: string;
  timestamp: string;
  type: SyncEventType;
  message: string;
  details?: Record<string, unknown>;
  retryCount?: number;
  error?: string;
}

/**
 * Sync status
 */
export interface SyncStatus {
  isSyncing: boolean;
  lastSync: string | null;
  lastError: string | null;
  pendingChanges: number;
  retryCount: number;
}

/**
 * Sync configuration
 */
export interface SyncConfig {
  remoteUrl: string;
  username?: string;
  password?: string;
  retryInterval: number; // Base interval in ms
  maxRetries: number;
  backoffMultiplier: number;
  maxBackoff: number;
}

/**
 * Default sync configuration
 */
const DEFAULT_CONFIG: SyncConfig = {
  remoteUrl: '',
  retryInterval: 1000, // 1 second
  maxRetries: 5,
  backoffMultiplier: 2,
  maxBackoff: 60000 // 1 minute
};

/**
 * Logging utility for sync events
 */
class SyncLogger {
  private events: SyncEvent[] = [];
  private maxEvents: number = 1000;
  
  /**
   * Log a sync event
   */
  log(
    type: SyncEventType,
    message: string,
    details?: Record<string, unknown>,
    retryCount?: number,
    error?: string
  ): void {
    const event: SyncEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      message,
      details,
      retryCount,
      error
    };
    
    this.events.push(event);
    
    // Keep only the last maxEvents
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
    
    // Console log for debugging
    const logMessage = `[SYNC ${type.toUpperCase()}] ${message}`;
    if (error) {
      console.error(logMessage, error, details);
    } else if (type === 'sync_error') {
      console.error(logMessage, details);
    } else {
      console.log(logMessage, details);
    }
  }
  
  /**
   * Get all sync events
   */
  getEvents(): SyncEvent[] {
    return [...this.events];
  }
  
  /**
   * Get events by type
   */
  getEventsByType(type: SyncEventType): SyncEvent[] {
    return this.events.filter(e => e.type === type);
  }
  
  /**
   * Get recent events
   */
  getRecentEvents(count: number = 50): SyncEvent[] {
    return this.events.slice(-count);
  }
  
  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
  }
  
  /**
   * Export events as JSON
   */
  export(): string {
    return JSON.stringify(this.events, null, 2);
  }
}

// Singleton logger instance
export const syncLogger = new SyncLogger();

/**
 * Sync Service Class
 */
export class SyncService {
  private db: PouchDB.Database | null = null;
  private remoteDb: PouchDB.Database | null = null;
  private syncEmitter: PouchDB.Replication.Sync<{}> | null = null;
  private config: SyncConfig;
  private currentRetryCount: number = 0;
  private isSyncing: boolean = false;
  private lastSyncTime: string | null = null;
  private lastError: string | null = null;
  private pendingChanges: number = 0;
  
  constructor(config: Partial<SyncConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Initialize the sync service
   */
  async initialize(): Promise<void> {
    // Ensure encryption key is available
    const securityStore = useSecurityStore();
    if (!securityStore.encryptionKey) {
      await securityStore.ensureEncryptionKey();
    }
    
    const key = securityStore.encryptionKey;
    if (!key) {
      throw new Error('[SyncService] No encryption key available');
    }
    
    // Initialize secure database if not already done
    if (!isSecureDbReady()) {
      await initializeSecureDb(key);
    }
    
    // Get the secure database instance
    this.db = getSecureDb(key);
    
    if (!this.db) {
      throw new Error('PouchDB not initialized');
    }
    
    console.log('[SyncService] Initialized');
  }
  
  /**
   * Configure the remote database URL
   */
  configure(remoteUrl: string, username?: string, password?: string): void {
    this.config.remoteUrl = remoteUrl;
    this.config.username = username;
    this.config.password = password;
    
    syncLogger.log('sync_change', 'Sync configuration updated', {
      remoteUrl,
      hasCredentials: !!username
    });
  }
  
  /**
   * Start live sync with the remote database
   */
  async startLiveSync(): Promise<void> {
    if (!this.db || !this.config.remoteUrl) {
      throw new Error('Database not initialized or remote URL not configured');
    }
    
    if (this.isSyncing) {
      console.log('[SyncService] Already syncing');
      return;
    }
    
    this.isSyncing = true;
    this.currentRetryCount = 0;
    
    // Create remote database instance
    const remoteOptions: PouchDB.Configuration.RemoteDatabaseConfiguration = {};
    
    if (this.config.username && this.config.password) {
      remoteOptions.auth = {
        username: this.config.username,
        password: this.config.password
      };
    }
    
    this.remoteDb = new PouchDB(this.config.remoteUrl, remoteOptions);
    
    syncLogger.log('sync_start', 'Starting live sync', {
      remoteUrl: this.config.remoteUrl
    });
    
    // Start replication
    this.startReplication();
  }
  
  /**
   * Start PouchDB replication
   */
  private startReplication(): void {
    if (!this.db || !this.remoteDb) return;
    
    // Two-way sync (pull + push)
    this.syncEmitter = this.db.sync(this.remoteDb, {
      live: true,
      retry: true,
      back_off_function: (failedAttempts: number): number => {
        const delay = Math.min(
          this.config.retryInterval *
            Math.pow(this.config.backoffMultiplier, failedAttempts),
          this.config.maxBackoff
        );
        
        syncLogger.log(
          'sync_retry',
          `Retry attempt ${failedAttempts + 1}`,
          { delay },
          failedAttempts
        );
        
        return delay;
      }
    });
    
    // Listen for sync events
    this.syncEmitter
      .on('active', (): void => {
        syncLogger.log('sync_active', 'Replication active');
        this.isSyncing = true;
        this.currentRetryCount = 0;
        this.lastError = null;
      })
      .on('paused', (err: PouchDBError | undefined): void => {
        if (err) {
          syncLogger.log('sync_paused', 'Replication paused with error', undefined, undefined, err.message);
          this.handleError(new Error(err.message));
        } else {
          syncLogger.log('sync_paused', 'Replication paused (no changes)');
          this.isSyncing = false;
          this.lastSyncTime = new Date().toISOString();
        }
      })
      .on('denied', (err: PouchDBError): void => {
        syncLogger.log('sync_denied', 'Replication denied', undefined, undefined, err.message);
        this.handleError(new Error(err.message));
      })
      .on('error', (err: PouchDBError): void => {
        syncLogger.log('sync_error', 'Replication error', undefined, undefined, err.message);
        this.handleError(new Error(err.message));
      })
      .on('complete', (info: PouchDBSyncInfo): void => {
        syncLogger.log('sync_complete', 'Replication complete', {
          push: info.push,
          pull: info.pull
        });
        this.lastSyncTime = new Date().toISOString();
      })
      .on('change', (change: PouchDBChangeEvent): void => {
        syncLogger.log('sync_change', 'Data change detected', {
          direction: change.direction,
          changesCount: change.change?.changes?.length || 0
        });
        
        // Update pending changes count
        if (change.direction === 'push') {
          this.pendingChanges = 0;
        } else {
          // For pull, we might have pending local changes
          this.pendingChanges = this.pendingChanges || 0;
        }
      });
  }
  
  /**
   * Handle sync errors with retry logic
   */
  private handleError(error: Error): void {
    this.lastError = error.message;
    this.isSyncing = false;
    
    // Increment retry count
    this.currentRetryCount++;
    
    if (this.currentRetryCount >= this.config.maxRetries) {
      syncLogger.log(
        'sync_error',
        'Max retries exceeded',
        { maxRetries: this.config.maxRetries },
        this.currentRetryCount,
        error.message
      );
      
      // Don't restart - let the backoff handle it or user manually restart
    }
  }
  
  /**
   * Stop live sync
   */
  async stopSync(): Promise<void> {
    if (this.syncEmitter) {
      this.syncEmitter.cancel();
      this.syncEmitter = null;
    }
    
    if (this.remoteDb) {
      await this.remoteDb.close();
      this.remoteDb = null;
    }
    
    this.isSyncing = false;
    
    syncLogger.log('sync_paused', 'Sync stopped');
  }
  
  /**
   * Perform a one-time sync (not live)
   */
  async syncOnce(): Promise<PouchDB.Replication.SyncResult<{}>> {
    if (!this.db || !this.config.remoteUrl) {
      throw new Error('Database not initialized or remote URL not configured');
    }
    
    const remoteOptions: PouchDB.Configuration.RemoteDatabaseConfiguration = {};
    
    if (this.config.username && this.config.password) {
      remoteOptions.auth = {
        username: this.config.username,
        password: this.config.password
      };
    }
    
    this.remoteDb = new PouchDB(this.config.remoteUrl, remoteOptions);
    
    syncLogger.log('sync_start', 'One-time sync started');
    
    return new Promise((resolve, reject): void => {
      if (!this.db || !this.remoteDb) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      this.db.sync(this.remoteDb, { retry: false })
        .on('complete', (info: PouchDBSyncInfo): void => {
          syncLogger.log('sync_complete', 'One-time sync complete', {
            push: info.push,
            pull: info.pull
          });
          this.lastSyncTime = new Date().toISOString();
          resolve(info);
        })
        .on('error', (err: PouchDBError): void => {
          syncLogger.log('sync_error', 'One-time sync failed', undefined, undefined, err.message);
          this.lastError = err.message;
          reject(new Error(err.message));
        });
    });
  }
  
  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return {
      isSyncing: this.isSyncing,
      lastSync: this.lastSyncTime,
      lastError: this.lastError,
      pendingChanges: this.pendingChanges,
      retryCount: this.currentRetryCount
    };
  }
  
  /**
   * Get sync events
   */
  getEvents(): SyncEvent[] {
    return syncLogger.getEvents();
  }
  
  /**
   * Get recent sync events
   */
  getRecentEvents(count: number = 50): SyncEvent[] {
    return syncLogger.getRecentEvents(count);
  }
  
  /**
   * Clear sync events
   */
  clearEvents(): void {
    syncLogger.clear();
  }
  
  /**
   * Check if remote is reachable
   */
  async checkRemoteReachability(): Promise<boolean> {
    if (!this.config.remoteUrl) {
      return false;
    }
    
    try {
      const remoteOptions: PouchDB.Configuration.RemoteDatabaseConfiguration = {};
      
      if (this.config.username && this.config.password) {
        remoteOptions.auth = {
          username: this.config.username,
          password: this.config.password
        };
      }
      
      const testDb = new PouchDB(this.config.remoteUrl, remoteOptions);
      const info = await testDb.info();
      await testDb.close();
      
      syncLogger.log('sync_active', 'Remote is reachable', {
        database: info.db_name,
        docCount: info.doc_count,
        updateSeq: info.update_seq
      });
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      syncLogger.log('sync_error', 'Remote not reachable', undefined, undefined, errorMessage);
      return false;
    }
  }
  
  /**
   * Close the sync service
   */
  async close(): Promise<void> {
    await this.stopSync();
    console.log('[SyncService] Closed');
  }
}

// Singleton instance
let syncService: SyncService | null = null;

/**
 * Get the singleton Sync service instance
 */
export function getSyncService(config?: Partial<SyncConfig>): SyncService {
  if (!syncService) {
    syncService = new SyncService(config);
  } else if (config) {
    syncService = new SyncService(config);
  }
  return syncService;
}

export default SyncService;

// ============================================================================
// CLINICAL SYNC QUEUE - Priority-based sync with clinical validation
// ============================================================================

/**
 * Sync validation result
 */
export interface SyncValidation {
  canSync: boolean;
  reason?: string;
}

/**
 * Priority order for clinical sync
 */
const PRIORITY_ORDER: Record<string, number> = {
  red: 0,
  yellow: 1,
  green: 2,
  undefined: 3
};

/**
 * ClinicalSyncQueue - Priority-based sync with clinical integrity validation
 * 
 * Implements section 9 requirements:
 * - Priority-based sync: RED cases before YELLOW before GREEN
 * - Clinical integrity validation before sync
 * - Action plan requirement for RED cases
 */
export class ClinicalSyncQueue {
  /**
   * Get pending forms sorted by clinical priority
   * RED cases sync first, then YELLOW, then GREEN
   */
  async getPendingFormsByPriority(): Promise<Record<string, unknown>[]> {
    try {
      const pendingForms = await this.getPendingForms();
      
      return pendingForms.sort((a, b) => {
        const formA = a as Record<string, Record<string, unknown>>;
        const formB = b as Record<string, Record<string, unknown>>;
        const priorityA = PRIORITY_ORDER[formA.calculated?.triagePriority as string] ?? 3;
        const priorityB = PRIORITY_ORDER[formB.calculated?.triagePriority as string] ?? 3;
        return priorityA - priorityB;
      });
    } catch (error) {
      console.error('[ClinicalSyncQueue] Failed to get pending forms by priority:', error);
      return [];
    }
  }

  /**
   * Validate form can be synced (clinical integrity check)
   * Returns { canSync: boolean, reason?: string }
   */
  async validateBeforeSync(formId: string): Promise<SyncValidation> {
    try {
      const form = await this.loadInstance(formId);
      
      if (!form) {
        return { canSync: false, reason: 'Form not found' };
      }
      
      const formData = form as Record<string, unknown>;
      
      // Critical: Must have completed required protocol steps
      if (formData.status !== 'completed') {
        return { canSync: false, reason: 'Form not clinically completed' };
      }
      
      // Must have triage priority calculated
      const calculated = formData.calculated as Record<string, unknown> | undefined;
      if (!calculated?.triagePriority) {
        return { canSync: false, reason: 'Triage not calculated' };
      }
      
      // For RED cases: additional validation
      if (calculated.triagePriority === 'red') {
        const answers = formData.answers as Record<string, unknown> | undefined;
        const hasActionPlan = answers?.['action_plan_urgent'];
        if (!hasActionPlan) {
          return { canSync: false, reason: 'Urgent cases require action plan' };
        }
      }
      
      return { canSync: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { canSync: false, reason: `Validation error: ${message}` };
    }
  }

  /**
   * Get all pending forms from local storage
   */
  private async getPendingForms(): Promise<Record<string, unknown>[]> {
    try {
      // Ensure encryption key is available
      const securityStore = useSecurityStore();
      if (!securityStore.encryptionKey) {
        await securityStore.ensureEncryptionKey();
      }
      
      const key = securityStore.encryptionKey;
      if (!key) {
        console.warn('[ClinicalSyncQueue] No encryption key available');
        return [];
      }
      
      // Check if secure DB is ready
      if (!isSecureDbReady()) {
        console.warn('[ClinicalSyncQueue] Secure database not initialized');
        return [];
      }
      
      // Use secureFind to get pending documents (not synced)
      const pendingResult = await secureFind<Record<string, unknown>>(
        { status: { $ne: 'synced' } },
        key
      );
      
      return pendingResult;
    } catch {
      console.warn('[ClinicalSyncQueue] Could not access pending forms');
      return [];
    }
  }

  /**
   * Load a form instance by ID
   */
  private async loadInstance(formId: string): Promise<Record<string, unknown> | null> {
    try {
      // Ensure encryption key is available
      const securityStore = useSecurityStore();
      if (!securityStore.encryptionKey) {
        await securityStore.ensureEncryptionKey();
      }
      
      const key = securityStore.encryptionKey;
      if (!key) {
        console.warn('[ClinicalSyncQueue] No encryption key available');
        return null;
      }
      
      // Use secureGet to retrieve the form
      return await secureGet<Record<string, unknown>>(formId, key);
    } catch {
      return null;
    }
  }
}

// Singleton instance
export const clinicalSyncQueue = new ClinicalSyncQueue();
