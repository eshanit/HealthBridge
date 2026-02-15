/**
 * Secure Database Service
 * 
 * Zero-trust encrypted database at rest.
 * Uses AES-256-GCM encryption for all documents at the storage level.
 * 
 * Architecture:
 * - PIN → deriveKeyFromPin() → security.encryptionKey (memory only)
 * - getSecureDb() → PouchDB with transparent encryption
 * 
 * All data is encrypted transparently - no application-visible encrypted fields
 * at the document content level (internal wrapper fields are used).
 */

import PouchDB from 'pouchdb-browser';
import pouchdbFind from 'pouchdb-find';
import { encryptData, decryptData } from './encryptionUtils';
import { 
  logAuditEvent, 
  logEncryption, 
  logCorruption, 
  logRecovery,
  logSync 
} from './auditLogger';
import { isAfter, subMonths, format } from 'date-fns';

// ============================================
// PouchDB Plugins
// ============================================

PouchDB.plugin(pouchdbFind);

// ============================================
// Types
// ============================================

export interface SecureDbConfig {
  dbName?: string;
  autoCompaction?: boolean;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface EncryptedDocument {
  _id: string;
  _rev?: string;
  encrypted: true;
  data: string;
  encryptedAt: string;
}

/**
 * Corrupted document tracking for recovery
 */
export interface CorruptedDocument {
  id: string;
  encryptedAt: string;
  error: string;
  timestamp: number;
  recoverable: boolean;
}

const CORRUPTED_DOCS_KEY = 'healthbridge_corrupted_docs';
const CORRUPTED_DOCS_LEGACY_KEY = 'healthbridge_corrupted_docs_v2'; // Legacy key from guide

/**
 * Migrate corrupted documents from legacy storage key
 * Phase 2: Error Handling Enhancement
 */
async function migrateCorruptedDocuments(): Promise<void> {
  try {
    // Check for legacy storage key
    const legacyData = localStorage.getItem(CORRUPTED_DOCS_LEGACY_KEY);
    if (legacyData) {
      console.log('[SecureDB] Found legacy corrupted documents, migrating...');
      
      const legacyDocs = JSON.parse(legacyData);
      const existing = JSON.parse(localStorage.getItem(CORRUPTED_DOCS_KEY) || '[]');
      
      // Merge legacy docs, avoiding duplicates
      const existingIds = new Set(existing.map((d: CorruptedDocument) => d.id));
      const migratedDocs = legacyDocs.filter((d: CorruptedDocument) => !existingIds.has(d.id));
      
      if (migratedDocs.length > 0) {
        // Add migration timestamp
        const migratedWithTimestamp = migratedDocs.map((doc: CorruptedDocument) => ({
          ...doc,
          migratedAt: Date.now(),
          originalTimestamp: doc.timestamp
        }));
        
        localStorage.setItem(
          CORRUPTED_DOCS_KEY, 
          JSON.stringify([...existing, ...migratedWithTimestamp])
        );
        
        console.log(`[SecureDB] Migrated ${migratedDocs.length} corrupted documents`);
        
        // Clear legacy storage
        localStorage.removeItem(CORRUPTED_DOCS_LEGACY_KEY);
        
        // Log migration event
        logAuditEvent(
          'configuration_change',
          'info',
          'secureDb',
          {
            operation: 'corrupted_docs_migration',
            migratedCount: migratedDocs.length
          },
          'success'
        );
      }
    }
  } catch (error) {
    console.error('[SecureDB] Failed to migrate corrupted documents:', error);
  }
}

/**
 * Track corrupted document for recovery analysis
 * Enhanced with audit logging and deduplication
 */
async function trackCorruptedDocument(doc: Omit<CorruptedDocument, 'timestamp'>): Promise<void> {
  try {
    const existing = JSON.parse(localStorage.getItem(CORRUPTED_DOCS_KEY) || '[]');
    
    // Check for duplicate
    const isDuplicate = existing.some((d: CorruptedDocument) => d.id === doc.id);
    if (isDuplicate) {
      console.log(`[SecureDB] Document ${doc.id} already tracked, skipping...`);
      return;
    }
    
    // Add timestamp
    const newDoc = {
      ...doc,
      timestamp: Date.now()
    };
    
    existing.push(newDoc);
    
    // Keep only last 100 corrupted docs (reduced for performance)
    if (existing.length > 100) {
      existing.splice(0, existing.length - 100);
    }
    
    localStorage.setItem(CORRUPTED_DOCS_KEY, JSON.stringify(existing));
    
    // Log corruption event
    logCorruption(doc.id, doc.error, doc.recoverable, false);
    
  } catch (e) {
    console.warn('[SecureDB] Failed to track corrupted document:', e);
  }
}

/**
 * Get list of corrupted documents
 */
export function getCorruptedDocuments(): CorruptedDocument[] {
  try {
    return JSON.parse(localStorage.getItem(CORRUPTED_DOCS_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Clear corrupted document tracking
 */
export function clearCorruptedDocuments(): void {
  localStorage.removeItem(CORRUPTED_DOCS_KEY);
}

// ============================================
// Database Instance
// ============================================

let dbInstance: PouchDB.Database | null = null;
let dbName = 'healthbridge_secure';

/**
 * Initialize the secure database
 */
export async function initializeSecureDb(encryptionKey: Uint8Array, config?: SecureDbConfig): Promise<void> {
  if (config?.dbName) {
    dbName = config.dbName;
  }
  
  if (!encryptionKey) {
    throw new Error('[SecureDB] Cannot initialize: no encryption key available');
  }
  
  if (!dbInstance) {
    dbInstance = new PouchDB(dbName, {
      adapter: 'idb',
      auto_compaction: config?.autoCompaction ?? true
    });
    
    await dbInstance.info();
    
    // Log initialization
    logAuditEvent(
      'encryption_start',
      'info',
      'secureDb',
      { operation: 'initialize', dbName },
      'success'
    );
    
    // Migrate legacy corrupted documents
    await migrateCorruptedDocuments();
    
    console.log('[SecureDB] Database initialized');
  }
}

/**
 * Get the secure database instance
 */
export function getSecureDb(encryptionKey: Uint8Array): PouchDB.Database {
  if (!encryptionKey) {
    throw new Error('[SecureDB] Database locked: encryption key not available');
  }
  
  if (!dbInstance) {
    throw new Error('[SecureDB] Database not initialized: call initializeSecureDb() first');
  }
  
  return dbInstance;
}

/**
 * Check if the secure database is ready
 */
export function isSecureDbReady(): boolean {
  return dbInstance !== null;
}

/**
 * Close the secure database connection
 */
export async function closeSecureDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
    console.log('[SecureDB] Database closed');
  }
}

/**
 * Delete the secure database (factory reset)
 */
export async function deleteSecureDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.destroy();
    dbInstance = null;
    console.log('[SecureDB] Database deleted');
  }
}

// ============================================
// CRUD Operations (Transparent Encryption)
// ============================================

export async function securePut<T extends { _id: string; _rev?: string }>(
  doc: T,
  encryptionKey: Uint8Array
): Promise<{ id: string; rev: string }> {
  const db = getSecureDb(encryptionKey);
  
  if (!encryptionKey) {
    throw new Error('[SecureDB] Cannot put: encryption key not available');
  }
  
  const { _id, _rev } = doc;
  
  // Encrypt document content (exclude PouchDB metadata)
  const dataToEncrypt: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key !== '_id' && key !== '_rev') {
      dataToEncrypt[key] = value;
    }
  }
  
  try {
    const encryptedPayload = await encryptData(JSON.stringify(dataToEncrypt), encryptionKey);
    
    const encryptedDoc: EncryptedDocument & { _rev?: string } = {
      _id,
      encrypted: true,
      data: JSON.stringify(encryptedPayload),
      encryptedAt: new Date().toISOString()
    };
    
    if (_rev) {
      encryptedDoc._rev = _rev;
    }
    
    // Log encryption start
    const auditId = logEncryption(_id, 'encrypt', true).id;
    
    try {
      const result = await db.put(encryptedDoc);
      
      // Log encryption success
      logEncryption(_id, 'encrypt', true, { 
        correlationId: auditId,
        rev: result.rev 
      });
      
      return { id: result.id, rev: result.rev };
    } catch (putError) {
      // Log encryption failure
      logEncryption(_id, 'encrypt', false, { 
        correlationId: auditId,
        error: String(putError)
      });
      
      const pouchError = putError as { status?: number; message?: string };
      
      // Handle conflict (409) by getting latest and retrying
      if (pouchError.status === 409) {
        console.warn('[SecureDB] Document conflict, retrying with latest revision...');
        
        // Get the latest document
        const latest = await db.get(_id) as EncryptedDocument & { _rev?: string };
        encryptedDoc._rev = latest._rev;
        
        // Retry with correct revision
        const result = await db.put(encryptedDoc);
        return { id: result.id, rev: result.rev };
      }
      
      throw putError;
    }
} catch (error) {
    // Log encryption error
    logEncryption(_id, 'encrypt', false, { error: String(error) });
    throw error;
  }
}

export async function secureGet<T>(
  id: string,
  encryptionKey: Uint8Array
): Promise<T | null> {
  const db = getSecureDb(encryptionKey);
  
  if (!encryptionKey) {
    throw new Error('[SecureDB] Cannot get: encryption key not available');
  }
  
  try {
    const doc = await db.get(id) as EncryptedDocument & { _rev?: string };
    
    if (!doc.encrypted) {
      return doc as unknown as T;
    }
    
    try {
      // Log decryption start
      const auditId = logEncryption(id, 'decrypt', true).id;
      
      const payload: EncryptedPayload = JSON.parse(doc.data);
      const decryptedData = JSON.parse(await decryptData(payload, encryptionKey));
      
      // Log decryption success
      logEncryption(id, 'decrypt', true, { correlationId: auditId });
      
      return {
        _id: doc._id,
        _rev: doc._rev,
        ...decryptedData
      } as T;
    } catch (decryptError) {
      // Enhanced error logging with date validation
      const errorMessage = decryptError instanceof DOMException 
        ? `${decryptError.name} (code: ${decryptError.code})` 
        : String(decryptError);
      
      // DATE VALIDATION using date-fns
      const encryptedDate = new Date(doc.encryptedAt);
      const now = new Date();
      const twoYearsAgo = subMonths(now, 24);
      
      if (!isAfter(encryptedDate, twoYearsAgo)) {
        console.warn(`[SecureDB] Old document detected: ${id}`, {
          encryptedAt: format(encryptedDate, 'yyyy-MM-dd HH:mm'),
          age: format(new Date(encryptedDate), 'yyyy-MM-dd')
        });
      }
      
      // Log decryption failure
      logEncryption(id, 'decrypt', false, { 
        error: errorMessage,
        encryptedAt: doc.encryptedAt
      });
      
      // Check for key mismatch indicators
      if (decryptError instanceof DOMException && decryptError.name === 'OperationError') {
        console.warn('[SecureDB] Possible encryption key mismatch for document:', id);
        
        // Log key mismatch as security event
        logAuditEvent(
          'security_exception',
          'warning',
          'secureDb',
          { 
            operation: 'decryption_key_mismatch',
            documentId: id,
            encryptedAt: doc.encryptedAt
          },
          'failure'
        );
      }
      
      // Track corrupted document
      await trackCorruptedDocument({
        id,
        encryptedAt: doc.encryptedAt,
        error: errorMessage,
        recoverable: false
      });
      
      // Return null for undecryptable documents instead of throwing
      return null;
    }
  } catch (error) {
    if ((error as { status?: number }).status === 404) {
      return null;
    }
    
    logAuditEvent(
      'security_exception',
      'error',
      'secureDb',
      { operation: 'get', documentId: id, error: String(error) },
      'failure'
    );
    
    throw error;
  }
}

export async function secureFind<T>(
  selector: Record<string, unknown>,
  encryptionKey: Uint8Array
): Promise<T[]> {
  const db = getSecureDb(encryptionKey);
  const result = await db.find({ selector });
  return result.docs as unknown as T[];
}

export async function secureDelete(
  id: string,
  rev: string,
  encryptionKey: Uint8Array
): Promise<{ id: string; rev: string; ok: boolean }> {
  const db = getSecureDb(encryptionKey);
  const result = await db.remove(id, rev);
  return { id: result.id, rev: result.rev, ok: result.ok };
}

export async function secureInfo(encryptionKey: Uint8Array): Promise<{
  dbName: string;
  docCount: number;
  updateSeq: number;
}> {
  const db = getSecureDb(encryptionKey);
  const info = await db.info();
  
  return {
    dbName: String(info.db_name),
    docCount: Number(info.doc_count),
    updateSeq: Number(info.update_seq)
  };
}

export async function secureAllDocs<T extends { _id: string; _rev?: string }>(
  encryptionKey: Uint8Array
): Promise<T[]> {
  const db = getSecureDb(encryptionKey);
  const result = await db.allDocs({ include_docs: true });
  
  const docs: T[] = [];
  for (const row of result.rows) {
    if (!row.id.startsWith('_design/') && row.doc) {
      const doc = row.doc as EncryptedDocument & { _rev?: string };
      
      if (doc.encrypted) {
        // Decrypt the document
        try {
          const payload: EncryptedPayload = JSON.parse(doc.data);
          
          // Validate timestamp for suspicious dates
          const encryptedDate = new Date(doc.encryptedAt);
          const now = Date.now();
          const oneYearMs = 365 * 24 * 60 * 60 * 1000;
          
          if (Math.abs(encryptedDate.getTime() - now) > oneYearMs) {
            console.warn('[SecureDB] Suspicious timestamp detected:', {
              documentId: row.id,
              encryptedAt: doc.encryptedAt,
              currentTime: new Date(now).toISOString()
            });
          }
          
          const decryptedData = JSON.parse(await decryptData(payload, encryptionKey));
          docs.push({
            _id: doc._id,
            _rev: doc._rev,
            ...decryptedData
          } as T);
        } catch (error) {
          // Enhanced error logging for decryption failures
          const errorMessage = error instanceof DOMException 
            ? `${error.name} (code: ${error.code})` 
            : String(error);
          
          console.error('[SecureDB] Failed to decrypt document:', {
            documentId: row.id,
            error: errorMessage,
            encryptedAt: doc.encryptedAt,
            dataLength: doc.data?.length || 0
          });
          
          // Check for key mismatch indicators
          if (error instanceof DOMException && error.name === 'OperationError') {
            console.warn('[SecureDB] Possible encryption key mismatch - document may have been encrypted with different credentials');
            
            // Attempt recovery: mark document as corrupted for potential key rotation recovery
            await trackCorruptedDocument({
              id: row.id,
              encryptedAt: doc.encryptedAt,
              error: errorMessage,
              recoverable: false // Would require key rotation to recover
            });
          }
          
          // Skip corrupted/undecryptable documents gracefully but track them
          await trackCorruptedDocument({
            id: row.id,
            encryptedAt: doc.encryptedAt,
            error: errorMessage,
            recoverable: false
          });
        }
      } else {
        docs.push(row.doc as T);
      }
    }
  }
  
  return docs;
}

export async function secureCreateIndex(
  fields: string[],
  encryptionKey: Uint8Array
): Promise<void> {
  const db = getSecureDb(encryptionKey);
  await db.createIndex({ index: { fields } });
}

export async function secureCreateDesignDoc(
  designDocId: string,
  views: Record<string, { map: string; reduce?: string }>,
  encryptionKey: Uint8Array
): Promise<void> {
  const db = getSecureDb(encryptionKey);
  
  const designDoc = {
    _id: `_design/${designDocId}`,
    views
  };
  
  await db.put(designDoc);
}

export interface BulkResult {
  id: string;
  rev?: string;
  ok?: boolean;
  error?: unknown;
}

export async function secureBulkDocs<T extends { _id: string; _rev?: string }>(
  docs: T[],
  encryptionKey: Uint8Array
): Promise<BulkResult[]> {
  const results = await Promise.all(
    docs.map(async (doc) => {
      try {
        const result = await securePut(doc, encryptionKey);
        return { id: result.id, rev: result.rev, ok: true };
      } catch (error) {
        return { id: doc._id, error };
      }
    })
  );
  
  return results;
}

// Re-export PouchDB for advanced operations
export { PouchDB };
