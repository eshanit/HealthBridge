/**
 * Key Rotation Service
 * 
 * Manages automatic and manual key rotation for encryption keys.
 * Features:
 * - Time-based automatic rotation (default: 30 days)
 * - Usage-based rotation (default: 1000 operations)
 * - Document re-encryption with new key
 * - Key version tracking
 * - Backup of old keys for recovery
 */

import { logKeyManagement, logAuditEvent } from './auditLogger';
import { encryptData, decryptData, type EncryptedPayload } from './encryptionUtils';

export interface KeyVersion {
  keyId: string;
  version: number;
  createdAt: number;
  rotatedAt: number;
  rotatedBy: 'automatic' | 'manual' | 'migration';
  keyHash: string;
  isActive: boolean;
  keyUsageCount?: number;
}

export interface KeyBackup {
  keyId: string;
  encryptedKey: string;
  salt: string;
  iv: string;
  createdAt: number;
  expiresAt: number;
}

export interface RotationResult {
  success: boolean;
  previousKeyId?: string;
  newKeyId?: string;
  documentsRotated: number;
  errors: string[];
}

const KEY_VERSIONS_KEY = 'healthbridge_key_versions';
const KEY_BACKUPS_KEY = 'healthbridge_key_backups';
const ACTIVE_KEY_ID_KEY = 'healthbridge_active_key_id';
const KEY_ROTATION_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_KEY_USAGE = 1000; // operations
const BACKUP_EXPIRY = 90 * 24 * 60 * 60 * 1000; // 90 days

export function getActiveKeyId(): string | null {
  return localStorage.getItem(ACTIVE_KEY_ID_KEY);
}

function setActiveKeyId(keyId: string): void {
  localStorage.setItem(ACTIVE_KEY_ID_KEY, keyId);
}

export function getKeyVersions(): KeyVersion[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_VERSIONS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveKeyVersions(versions: KeyVersion[]): void {
  localStorage.setItem(KEY_VERSIONS_KEY, JSON.stringify(versions));
}

export function getKeyBackups(): KeyBackup[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_BACKUPS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveKeyBackups(backups: KeyBackup[]): void {
  localStorage.setItem(KEY_BACKUPS_KEY, JSON.stringify(backups));
}

function generateKeyHash(key: Uint8Array): string {
  return Array.from(key.slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function createKeyVersion(
  key: Uint8Array,
  rotatedBy: 'automatic' | 'manual' | 'migration' = 'automatic'
): Promise<KeyVersion> {
  const versions = getKeyVersions();
  const maxVersion = Math.max(0, ...versions.map(v => v.version));
  
  const keyId = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const newVersion: KeyVersion = {
    keyId,
    version: maxVersion + 1,
    createdAt: Date.now(),
    rotatedAt: Date.now(),
    rotatedBy,
    keyHash: generateKeyHash(key),
    isActive: true
  };
  
  // Deactivate old active key
  versions.forEach(v => {
    if (v.isActive) {
      v.isActive = false;
    }
  });
  
  versions.push(newVersion);
  saveKeyVersions(versions);
  setActiveKeyId(keyId);
  
  logKeyManagement('key_rotation', true, {
    keyId,
    version: newVersion.version,
    rotatedBy,
    keyHash: newVersion.keyHash
  });
  
  return newVersion;
}

export function getCurrentKeyVersion(): KeyVersion | null {
  const keyId = getActiveKeyId();
  if (!keyId) return null;
  
  const versions = getKeyVersions();
  return versions.find(v => v.keyId === keyId) || null;
}

export function shouldRotateKey(): boolean {
  const currentVersion = getCurrentKeyVersion();
  if (!currentVersion) return true;
  
  const now = Date.now();
  
  // Check time-based rotation
  if (now - currentVersion.rotatedAt > KEY_ROTATION_INTERVAL) {
    return true;
  }
  
  // Check usage-based rotation
  const usage = getKeyUsage();
  if (usage >= MAX_KEY_USAGE) {
    return true;
  }
  
  return false;
}

function getKeyUsage(): number {
  const versions = getKeyVersions();
  const current = getCurrentKeyVersion();
  if (!current) return 0;
  
  const currentVer = versions.find(v => v.keyId === current.keyId);
  return currentVer?.keyUsageCount || 0;
}

export function incrementKeyUsage(): void {
  const keyId = getActiveKeyId();
  if (!keyId) return;
  
  const versions = getKeyVersions();
  const index = versions.findIndex(v => v.keyId === keyId);
  if (index !== -1 && versions[index]) {
    const version = versions[index];
    if (version.keyUsageCount === undefined) {
      version.keyUsageCount = 0;
    }
    version.keyUsageCount++;
    saveKeyVersions(versions);
  }
}

export async function backupCurrentKey(
  encryptionKey: Uint8Array,
  backupKey: Uint8Array
): Promise<KeyBackup | null> {
  try {
    const keyId = getActiveKeyId();
    if (!keyId) return null;
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      backupKey.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encryptionKey.buffer as ArrayBuffer
    );
    
    const backups = getKeyBackups();
    
    // Remove expired backups
    const now = Date.now();
    const validBackups = backups.filter(b => b.expiresAt > now);
    
    const newBackup: KeyBackup = {
      keyId,
      encryptedKey: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      salt: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),
      iv: btoa(String.fromCharCode(...iv)),
      createdAt: now,
      expiresAt: now + BACKUP_EXPIRY
    };
    
    validBackups.push(newBackup);
    saveKeyBackups(validBackups);
    
    logAuditEvent(
      'data_export',
      'info',
      'keyRotation',
      { operation: 'key_backup', keyId },
      'success'
    );
    
    return newBackup;
  } catch (error) {
    console.error('[KeyRotation] Failed to backup key:', error);
    return null;
  }
}

export async function restoreKeyFromBackup(
  backup: KeyBackup,
  backupKey: Uint8Array
): Promise<Uint8Array | null> {
  try {
    const iv = Uint8Array.from(atob(backup.iv), c => c.charCodeAt(0));
    const encryptedKey = Uint8Array.from(atob(backup.encryptedKey), c => c.charCodeAt(0));
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      backupKey.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encryptedKey.buffer as ArrayBuffer
    );
    
    logAuditEvent(
      'security_exception',
      'info',
      'keyRotation',
      { operation: 'key_restore', keyId: backup.keyId },
      'success'
    );
    
    return new Uint8Array(decrypted);
  } catch (error) {
    console.error('[KeyRotation] Failed to restore key from backup:', error);
    return null;
  }
}

export async function rotateAndMigrate(
  oldKey: Uint8Array,
  newKey: Uint8Array,
  migrateDocument: (doc: unknown, key: Uint8Array) => Promise<void>
): Promise<RotationResult> {
  const result: RotationResult = {
    success: false,
    documentsRotated: 0,
    errors: []
  };
  
  try {
    const oldKeyId = getActiveKeyId();
    
    // Create backup of old key before rotation
    await backupCurrentKey(oldKey, newKey);
    
    // Create new key version
    const newVersion = await createKeyVersion(newKey, 'automatic');
    result.newKeyId = newVersion.keyId;
    result.previousKeyId = oldKeyId || undefined;
    
    // Get all document IDs that need migration
    const docIds = await getAllDocumentIds();
    
    // Migrate each document
    for (const docId of docIds) {
      try {
        await migrateDocumentWithNewKey(docId, oldKey, newKey);
        result.documentsRotated++;
      } catch (error) {
        result.errors.push(`Failed to migrate ${docId}: ${String(error)}`);
      }
    }
    
    // Reset usage count
    const versions = getKeyVersions();
    const index = versions.findIndex(v => v.keyId === newVersion.keyId);
    if (index !== -1 && versions[index]) {
      versions[index].keyUsageCount = 0;
      saveKeyVersions(versions);
    }
    
    result.success = result.errors.length === 0;
    
    logKeyManagement('key_rotation', result.success, {
      newKeyId: newVersion.keyId,
      previousKeyId: oldKeyId,
      documentsRotated: result.documentsRotated,
      errors: result.errors.length
    });
    
  } catch (error) {
    result.errors.push(String(error));
    logKeyManagement('key_rotation', false, { error: String(error) });
  }
  
  return result;
}

async function migrateDocumentWithNewKey(
  docId: string,
  oldKey: Uint8Array,
  newKey: Uint8Array
): Promise<void> {
  const { secureGet, securePut } = await import('./secureDb');
  
  const doc = await secureGet(docId, oldKey);
  if (!doc) return;
  
  await securePut(doc as { _id: string; _rev?: string }, newKey);
}

async function getAllDocumentIds(): Promise<string[]> {
  const { secureAllDocs } = await import('./secureDb');
  
  // Import useKeyManager dynamically
  const useKeyManagerModule = await import('../composables/useKeyManager');
  const { getSessionKey } = useKeyManagerModule.useKeyManager();
  
  const key = getSessionKey();
  if (!key) throw new Error('No session key available');
  
  const docs = await secureAllDocs(key);
  return docs.map(d => d._id);
}

export function getKeyRotationStatus(): {
  shouldRotate: boolean;
  currentVersion: KeyVersion | null;
  daysUntilRotation: number;
  operationsUntilRotation: number;
} {
  const current = getCurrentKeyVersion();
  const now = Date.now();
  
  if (!current) {
    return {
      shouldRotate: true,
      currentVersion: null,
      daysUntilRotation: 0,
      operationsUntilRotation: 0
    };
  }
  
  const timeUntilRotation = KEY_ROTATION_INTERVAL - (now - current.rotatedAt);
  const usage = getKeyUsage();
  
  return {
    shouldRotate: shouldRotateKey(),
    currentVersion: current,
    daysUntilRotation: Math.max(0, Math.ceil(timeUntilRotation / (24 * 60 * 60 * 1000))),
    operationsUntilRotation: Math.max(0, MAX_KEY_USAGE - usage)
  };
}

export function clearKeyRotationData(): void {
  localStorage.removeItem(KEY_VERSIONS_KEY);
  localStorage.removeItem(KEY_BACKUPS_KEY);
  localStorage.removeItem(ACTIVE_KEY_ID_KEY);
  console.log('[KeyRotation] All key rotation data cleared');
}
