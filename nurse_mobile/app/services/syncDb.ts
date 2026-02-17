/**
 * Sync Database Service
 * 
 * In-memory document cache for sync operations.
 * Part of the Dual-Database Sync Architecture.
 * 
 * Architecture:
 * - Encrypted Local DB (secureDb) → Decrypt → Sync Cache (this file) → CouchDB
 * 
 * The sync cache holds plaintext documents temporarily during sync.
 * It is cleared immediately after successful sync to minimize memory exposure.
 * 
 * @see docs/DUAL_DATABASE_SYNC_ARCHITECTURE.md
 */

import { ref, computed } from 'vue';
import PouchDB from 'pouchdb-browser';
import { decryptData, type EncryptedPayload } from './encryptionUtils';

// ============================================
// Types
// ============================================

export interface SyncCacheEntry {
  _id: string;
  _rev?: string;
  [key: string]: any;
}

export interface SyncCacheStats {
  documentCount: number;
  estimatedSize: number;
  oldestEntry: number | null;
  newestEntry: number | null;
}

export interface SyncCacheOptions {
  maxDocuments?: number;
  maxMemoryMB?: number;
}

// ============================================
// Sync Cache State
// ============================================

// In-memory cache using Map for O(1) access
const _syncCache = ref<Map<string, SyncCacheEntry>>(new Map());

// Track when documents were added to cache
const _cacheTimestamps = ref<Map<string, number>>(new Map());

// Configuration
const DEFAULT_MAX_DOCUMENTS = 1000;
const DEFAULT_MAX_MEMORY_MB = 50;

let _config: SyncCacheOptions = {
  maxDocuments: DEFAULT_MAX_DOCUMENTS,
  maxMemoryMB: DEFAULT_MAX_MEMORY_MB
};

// Temporary PouchDB instance for sync operations
let _syncDbInstance: PouchDB.Database | null = null;

// ============================================
// Cache Management Functions
// ============================================

/**
 * Configure the sync cache
 */
export function configureSyncCache(options: SyncCacheOptions): void {
  _config = { ..._config, ...options };
  console.log('[SyncDb] Configured:', _config);
}

/**
 * Add a decrypted document to the sync cache
 */
export function addToSyncCache(doc: SyncCacheEntry): void {
  if (!doc._id) {
    console.warn('[SyncDb] Cannot add document without _id');
    return;
  }
  
  // Check cache limits
  if (_syncCache.value.size >= (_config.maxDocuments || DEFAULT_MAX_DOCUMENTS)) {
    console.warn('[SyncDb] Cache full, evicting oldest entry');
    evictOldestEntry();
  }
  
  _syncCache.value.set(doc._id, doc);
  _cacheTimestamps.value.set(doc._id, Date.now());
  
  console.log(`[SyncDb] Added document to cache: ${doc._id}`);
}

/**
 * Add multiple documents to the sync cache
 */
export function addManyToSyncCache(docs: SyncCacheEntry[]): void {
  for (const doc of docs) {
    addToSyncCache(doc);
  }
  console.log(`[SyncDb] Added ${docs.length} documents to cache`);
}

/**
 * Get a document from the sync cache
 */
export function getFromSyncCache(id: string): SyncCacheEntry | undefined {
  return _syncCache.value.get(id);
}

/**
 * Get all documents from the sync cache
 */
export function getAllFromSyncCache(): SyncCacheEntry[] {
  return Array.from(_syncCache.value.values());
}

/**
 * Remove a document from the sync cache
 */
export function removeFromSyncCache(id: string): boolean {
  const existed = _syncCache.value.delete(id);
  _cacheTimestamps.value.delete(id);
  return existed;
}

/**
 * Clear the entire sync cache
 */
export function clearSyncCache(): void {
  const count = _syncCache.value.size;
  _syncCache.value.clear();
  _cacheTimestamps.value.clear();
  console.log(`[SyncDb] Cleared ${count} documents from cache`);
}

/**
 * Get sync cache statistics
 */
export function getSyncCacheStats(): SyncCacheStats {
  const documents = getAllFromSyncCache();
  const timestamps = Array.from(_cacheTimestamps.value.values());
  
  // Estimate memory usage (rough approximation)
  const estimatedSize = documents.reduce((total, doc) => {
    return total + JSON.stringify(doc).length;
  }, 0);
  
  return {
    documentCount: documents.length,
    estimatedSize,
    oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
    newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null
  };
}

/**
 * Check if cache has documents
 */
export function hasSyncCacheDocuments(): boolean {
  return _syncCache.value.size > 0;
}

/**
 * Get cache size
 */
export function getSyncCacheSize(): number {
  return _syncCache.value.size;
}

/**
 * Evict the oldest entry from cache
 */
function evictOldestEntry(): void {
  const timestamps = _cacheTimestamps.value;
  if (timestamps.size === 0) return;
  
  let oldestId: string | null = null;
  let oldestTime = Infinity;
  
  for (const [id, time] of timestamps) {
    if (time < oldestTime) {
      oldestTime = time;
      oldestId = id;
    }
  }
  
  if (oldestId) {
    removeFromSyncCache(oldestId);
    console.log(`[SyncDb] Evicted oldest entry: ${oldestId}`);
  }
}

// ============================================
// Decryption Helper
// ============================================

/**
 * Decrypt an encrypted document and add to sync cache
 */
export async function decryptToSyncCache(
  encryptedDoc: any,
  encryptionKey: Uint8Array
): Promise<SyncCacheEntry | null> {
  try {
    // Check if document is encrypted
    if (!encryptedDoc.encrypted || !encryptedDoc.data) {
      // Document is not encrypted, add as-is
      addToSyncCache(encryptedDoc);
      return encryptedDoc;
    }
    
    // Parse the encrypted payload
    const payload: EncryptedPayload = JSON.parse(encryptedDoc.data);
    
    // Decrypt the data
    const decryptedJson = await decryptData(payload, encryptionKey);
    const decryptedData = JSON.parse(decryptedJson);
    
    // Reconstruct the plaintext document
    const plaintextDoc: SyncCacheEntry = {
      _id: encryptedDoc._id,
      _rev: encryptedDoc._rev,
      ...decryptedData
    };
    
    // Add to sync cache
    addToSyncCache(plaintextDoc);
    
    return plaintextDoc;
    
  } catch (error) {
    console.error(`[SyncDb] Failed to decrypt document ${encryptedDoc._id}:`, error);
    return null;
  }
}

/**
 * Decrypt multiple documents and add to sync cache
 */
export async function decryptManyToSyncCache(
  encryptedDocs: any[],
  encryptionKey: Uint8Array
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  
  for (const doc of encryptedDocs) {
    const result = await decryptToSyncCache(doc, encryptionKey);
    if (result) {
      success++;
    } else {
      failed++;
    }
  }
  
  console.log(`[SyncDb] Decrypted ${success} documents, ${failed} failed`);
  return { success, failed };
}

// ============================================
// Temporary PouchDB for Sync
// ============================================

/**
 * Get or create a temporary PouchDB instance for sync
 * This database is populated from the sync cache and used for replication
 */
export function getSyncDb(): PouchDB.Database {
  if (!_syncDbInstance) {
    // Create a new in-memory database for sync
    // We use a unique name to avoid conflicts with the main database
    const syncDbName = `healthbridge_sync_${Date.now()}`;
    _syncDbInstance = new PouchDB(syncDbName, {
      adapter: 'idb',
      auto_compaction: true
    });
    console.log(`[SyncDb] Created temporary sync database: ${syncDbName}`);
  }
  return _syncDbInstance;
}

/**
 * Populate the sync database from cache
 */
export async function populateSyncDb(): Promise<{ success: number; failed: number }> {
  const db = getSyncDb();
  const docs = getAllFromSyncCache();
  
  let success = 0;
  let failed = 0;
  
  for (const doc of docs) {
    try {
      // Remove _rev if it's from the encrypted version (will be new in sync db)
      const docToInsert = { ...doc };
      delete docToInsert._rev;
      
      await db.put(docToInsert);
      success++;
    } catch (error) {
      console.error(`[SyncDb] Failed to insert document ${doc._id}:`, error);
      failed++;
    }
  }
  
  console.log(`[SyncDb] Populated sync database: ${success} success, ${failed} failed`);
  return { success, failed };
}

/**
 * Destroy the temporary sync database
 */
export async function destroySyncDb(): Promise<void> {
  if (_syncDbInstance) {
    const dbName = _syncDbInstance.name;
    await _syncDbInstance.destroy();
    _syncDbInstance = null;
    console.log(`[SyncDb] Destroyed temporary sync database: ${dbName}`);
  }
}

/**
 * Clear everything - cache and temporary database
 */
export async function clearAll(): Promise<void> {
  clearSyncCache();
  await destroySyncDb();
  console.log('[SyncDb] Cleared all sync data');
}

// ============================================
// Composable for Vue Components
// ============================================

/**
 * Vue composable for sync cache access
 */
export function useSyncCache() {
  const stats = computed(() => getSyncCacheStats());
  const hasDocuments = computed(() => hasSyncCacheDocuments());
  const documentCount = computed(() => getSyncCacheSize());
  
  return {
    stats,
    hasDocuments,
    documentCount,
    addToSyncCache,
    addManyToSyncCache,
    getFromSyncCache,
    getAllFromSyncCache,
    removeFromSyncCache,
    clearSyncCache,
    decryptToSyncCache,
    decryptManyToSyncCache,
    clearAll
  };
}
