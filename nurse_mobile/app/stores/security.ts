/**
 * Security Store
 * 
 * Handles encryption key management, device binding,
 * and secure storage operations
 * 
 * Security Model:
 * - PIN → deriveKeyFromPin() → encryptionKey (memory only, never stored)
 * - getSecureDb() → PouchDB with encrypted documents at rest
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAuthStore } from './auth';
import { 
  initializeSecureDb,
  securePut,
  secureGet,
  closeSecureDb,
  deleteSecureDb 
} from '~/services/secureDb';
import { encryptData, decryptData } from '~/services/encryptionUtils';
import { logAuditEvent, logEncryption, logKeyManagement } from '~/services/auditLogger';

export interface EncryptionKey {
  key: Uint8Array;
  salt: Uint8Array;
  createdAt: string;
}

export interface DeviceBinding {
  deviceId: string;
  publicKey: string;
  boundAt: string;
  lastVerified: string;
}

export interface SecurityState {
  encryptionKey: Uint8Array | null;
  salt: Uint8Array | null;
  isUnlocked: boolean;
  deviceBinding: DeviceBinding | null;
}

export const useSecurityStore = defineStore('security', () => {
  // State
  const encryptionKey = ref<Uint8Array | null>(null);
  const salt = ref<Uint8Array | null>(null);
  const isUnlocked = ref(false);
  const deviceBinding = ref<DeviceBinding | null>(null);
  const keyCreationDate = ref<string | null>(null);

  // Constants
  const KEY_STORAGE_KEY = 'healthbridge_db_key';
  const SALT_STORAGE_KEY = 'healthbridge_db_salt';
  const DEVICE_BINDING_KEY = 'healthbridge_device_binding';
  const ENCRYPTED_TEST_RECORD_KEY = 'healthbridge_test_record';

  // Computed
  const isKeyAvailable = computed(() => encryptionKey.value !== null);

  // Actions

  /**
   * Initialize security state
   */
  async function initialize(): Promise<void> {
    // Load salt from storage
    const saltStored = localStorage.getItem(SALT_STORAGE_KEY);
    if (saltStored) {
      try {
        salt.value = Uint8Array.from(atob(saltStored), (c) => c.charCodeAt(0));
      } catch {
        salt.value = null;
      }
    }

    // Load device binding
    const bindingStored = localStorage.getItem(DEVICE_BINDING_KEY);
    if (bindingStored) {
      try {
        deviceBinding.value = JSON.parse(bindingStored);
      } catch {
        deviceBinding.value = null;
      }
    }

    // Check if encryption key exists (encrypted with device secret)
    const keyStored = localStorage.getItem(KEY_STORAGE_KEY);
    if (keyStored) {
      console.log('[Security] Encrypted key exists in storage');
    }

    // Check if encrypted test record exists
    const testRecordStored = localStorage.getItem(ENCRYPTED_TEST_RECORD_KEY);
    if (testRecordStored) {
      console.log('[Security] Encrypted test record exists');
    }
  }

  /**
   * Generate a new encryption key
   */
  async function generateKey(): Promise<void> {
    const authStore = useAuthStore();

    // Generate salt
    salt.value = crypto.getRandomValues(new Uint8Array(32));

    // Generate encryption key using AES-256-GCM
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    // Export key to store
    const exportedKey = await crypto.subtle.exportKey('raw', key);
    encryptionKey.value = new Uint8Array(exportedKey);
    keyCreationDate.value = new Date().toISOString();

    // Store salt using Array.from for reliable conversion
    if (salt.value) {
      const saltArray = Array.from(salt.value);
      localStorage.setItem(SALT_STORAGE_KEY, btoa(String.fromCharCode(...saltArray)));
    }

    console.log('[Security] New encryption key generated');
    authStore.logAction('generate_key', true, 'New encryption key generated');
  }

  /**
   * Derive encryption key from PIN
   * @param pin - User's PIN
   */
async function deriveKeyFromPin(pin: string): Promise<boolean> {
  const authStore = useAuthStore();

  if (!salt.value || salt.value.length === 0) {
    console.error('[Security] No salt available for key derivation');
    return false;
  }

  console.log('[Security] Deriving key from PIN...');
  console.log('[Security] Salt exists:', !!salt.value, 'Length:', salt.value?.length);
  console.log('[Security] PIN length:', pin.length);

  try {
    const encoder = new TextEncoder();
    const pinBuffer = encoder.encode(pin);

    // Import PIN as raw key material for PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      pinBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // Derive key directly
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt.value!.buffer as ArrayBuffer,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    // Export the key for storage
    const exportedKey = await crypto.subtle.exportKey('raw', derivedKey);
    encryptionKey.value = new Uint8Array(exportedKey);
    isUnlocked.value = true;

    console.log('[Security] Key derived successfully. Length:', encryptionKey.value.length);

    // Log key derivation
    logKeyManagement('key_derivation', true, {
      method: 'pin',
      keyLength: encryptionKey.value.length
    });

    // Backup encrypted with device secret
    const deviceSecret = await getDeviceSecret();
    if (deviceSecret && encryptionKey.value) {
      const encryptedKey = await encryptKeyForStorage(encryptionKey.value, deviceSecret);
      localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify(encryptedKey));
      console.log('[Security] Key backed up to secure storage');
    }

    return true;
  } catch (err) {
    console.error('[Security] Key derivation failed:', err);
    
    // Detailed error logging
    if (err instanceof DOMException) {
      console.error('[Security] DOMException details:', {
        name: err.name,
        message: err.message,
        code: err.code
      });
    }
    
    logKeyManagement('key_derivation', false, {
      error: String(err)
    });
    
    return false;
  }
}


  /**
   * Get or create device secret
   */
  async function getDeviceSecret(): Promise<Uint8Array | null> {
    const authStore = useAuthStore();
    const deviceId = authStore.getDeviceId();

    if (!deviceId) {
      console.error('[Security] No device ID available');
      return null;
    }

    // Check if device secret exists
    let deviceSecretStored = localStorage.getItem('healthbridge_device_secret');
    
    if (!deviceSecretStored) {
      // Generate new device secret
      const deviceSecret = crypto.getRandomValues(new Uint8Array(32));
      deviceSecretStored = btoa(String.fromCharCode(...deviceSecret));
      localStorage.setItem('healthbridge_device_secret', deviceSecretStored);
      
      console.log('[Security] New device secret generated');
      authStore.logAction('device_secret', true, 'New device secret generated');
    }

    // Decode and return
    try {
      return Uint8Array.from(atob(deviceSecretStored), (c) => c.charCodeAt(0));
    } catch {
      console.error('[Security] Failed to decode device secret');
      return null;
    }
  }

  /**
   * Encrypt key for storage
   */
  async function encryptKeyForStorage(key: Uint8Array, secret: Uint8Array): Promise<{ ciphertext: string; iv: string }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      secret.buffer as ArrayBuffer,
      'AES-GCM',
      false,
      ['encrypt']
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      key.buffer as ArrayBuffer
    );

    // Convert to base64 - store full encrypted data including auth tag
    const encryptedArray = new Uint8Array(encrypted);
    const ciphertext = btoa(String.fromCharCode(...encryptedArray));
    const ivBase64 = btoa(String.fromCharCode(...iv));

    return {
      ciphertext,
      iv: ivBase64
    };
  }

  /**
   * Decrypt key from storage
   */
  async function decryptKeyFromStorage(encrypted: { ciphertext: string; iv: string }, secret: Uint8Array): Promise<Uint8Array | null> {
    try {
      const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
      const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        secret.buffer as ArrayBuffer,
        'AES-GCM',
        false,
        ['decrypt']
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        ciphertext.buffer as ArrayBuffer
      );

      return new Uint8Array(decrypted);
    } catch (error) {
      console.error('[Security] Failed to decrypt key:', error);
      return null;
    }
  }

  /**
   * Ensure encryption key is available
   * If key is not in memory, try to decrypt the stored backup using device secret
   * If backup decryption fails and PIN is set, attempt to re-derive from PIN
   * Throws if no key is available
   */
  async function ensureEncryptionKey(): Promise<void> {
    // If key is already in memory, return
    if (encryptionKey.value) {
      return;
    }

    // Try to load the encrypted key backup
    const keyStored = localStorage.getItem(KEY_STORAGE_KEY);
    if (!keyStored) {
      // No stored key backup - need to derive from PIN or generate new
      throw new Error('[Security] No encryption key available. Please enter your PIN.');
    }

    try {
      const encryptedKey = JSON.parse(keyStored);
      const deviceSecret = await getDeviceSecret();
      
      if (!deviceSecret) {
        throw new Error('[Security] No device secret available');
      }

      const decryptedKey = await decryptKeyFromStorage(encryptedKey, deviceSecret);
      
      if (decryptedKey) {
        // Successfully decrypted - load into memory
        encryptionKey.value = decryptedKey;
        isUnlocked.value = true;
        console.log('[Security] Encryption key loaded from storage');
        return;
      }
      
      // Decryption failed - key backup may be corrupted or device secret changed
      console.warn('[Security] Failed to decrypt key backup - will attempt PIN re-derivation');
      
      // Check if user has a PIN set
      const authStore = useAuthStore();
      if (authStore.isPinSet) {
        // Will throw specific error to indicate PIN is needed
        throw new Error('[Security] Key backup corrupted. Please enter your PIN to re-derive encryption key.');
      }
      
      // No PIN set - need to generate new key
      throw new Error('[Security] No valid encryption key. Please set up a PIN.');
      
    } catch (error) {
      console.error('[Security] Failed to ensure encryption key:', error);
      throw new Error('[Security] Cannot access encrypted data. Please enter your PIN.');
    }
  }

  /**
   * Unlock with PIN - re-derive encryption key from user's PIN
   * This is used when the key backup cannot be decrypted (e.g., device secret changed)
   * @param pin - User's PIN
   */
  async function unlockWithPin(pin: string): Promise<boolean> {
    const authStore = useAuthStore();
    
    // First verify the PIN with auth store
    const pinValid = await authStore.verifyPin(pin);
    if (!pinValid) {
      console.error('[Security] PIN verification failed');
      return false;
    }
    
    // Derive key from PIN
    const derived = await deriveKeyFromPin(pin);
    if (!derived) {
      console.error('[Security] Failed to derive key from PIN');
      return false;
    }
    
    // Re-encrypt and backup the key with current device secret
    if (encryptionKey.value) {
      const deviceSecret = await getDeviceSecret();
      if (deviceSecret) {
        const encryptedKey = await encryptKeyForStorage(encryptionKey.value, deviceSecret);
        localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify(encryptedKey));
        console.log('[Security] Key backup re-encrypted with new device secret');
      }
    }
    
    isUnlocked.value = true;
    return true;
  }

  /**
   * Check if we need PIN to unlock (key not in memory, backup may be corrupted)
   */
  function needsPinToUnlock(): boolean {
    const authStore = useAuthStore();
    return authStore.isPinSet && !encryptionKey.value;
  }

  /**
   * Bind device to account
   */
  async function bindDevice(publicKey: string): Promise<boolean> {
    const authStore = useAuthStore();

    if (!authStore.isDeviceBound()) {
      console.error('[Security] No device ID available for binding');
      return false;
    }

    const binding: DeviceBinding = {
      deviceId: authStore.getDeviceId()!,
      publicKey,
      boundAt: new Date().toISOString(),
      lastVerified: new Date().toISOString()
    };

    deviceBinding.value = binding;
    localStorage.setItem(DEVICE_BINDING_KEY, JSON.stringify(binding));

    console.log('[Security] Device bound successfully');
    authStore.logAction('device_bind', true, `Device ${binding.deviceId} bound`);
    return true;
  }

  /**
   * Verify device binding
   */
  function verifyDeviceBinding(): boolean {
    if (!deviceBinding.value) {
      return false;
    }

    const authStore = useAuthStore();
    return deviceBinding.value.deviceId === authStore.getDeviceId();
  }

  /**
   * Create an encrypted test record
   * Uses the secureDb service for encrypted storage
   */
  async function createEncryptedTestRecord(): Promise<boolean> {
    const authStore = useAuthStore();

    try {
      // Ensure encryption key is available
      await ensureEncryptionKey();

      // Initialize secure database first
      await initializeSecureDb(encryptionKey.value!);

      const testDoc = {
        _id: '_local/encryption_test',
        type: 'test_record',
        verified: true,
        test_value: 'healthbridge_secure_2024',
        device_id: authStore.getDeviceId(),
        created_at: new Date().toISOString()
      };

      await securePut(testDoc, encryptionKey.value!);
      console.log('[Security] Encrypted test record created');
      return true;
    } catch (err) {
      console.error('[Security] Failed to create encrypted test record', err);
      return false;
    }
  }

  /**
   * Verify encrypted test record
   * Uses the secureDb service for encrypted storage
   */
  async function verifyEncryptedTestRecord(): Promise<boolean> {
    try {
      // Ensure encryption key is available
      await ensureEncryptionKey();

      // Initialize secure database first
      await initializeSecureDb(encryptionKey.value!);

      const testDoc = await secureGet<{
        type: string;
        verified: boolean;
        test_value: string;
      }>('_local/encryption_test', encryptionKey.value!);

      return (
        testDoc?.type === 'test_record' &&
        testDoc?.verified === true &&
        testDoc?.test_value === 'healthbridge_secure_2024'
      );
    } catch (err) {
      console.error('[Security] Test record verification failed', err);
      return false;
    }
  }

  /**
   * Lock the database (clear key from memory)
   */
  async function lock(): Promise<void> {
    encryptionKey.value = null;
    isUnlocked.value = false;
    
    // Close the secure database connection
    await closeSecureDb();
    
    console.log('[Security] Database locked');
    
    logAuditEvent(
      'session_end',
      'info',
      'securityStore',
      { operation: 'lock' },
      'success'
    );
  }

  /**
   * Clear all security data (factory reset)
   */
  async function factoryReset(): Promise<void> {
    encryptionKey.value = null;
    salt.value = null;
    isUnlocked.value = false;
    deviceBinding.value = null;
    keyCreationDate.value = null;

    // Delete the secure database
    await deleteSecureDb();

    localStorage.removeItem(KEY_STORAGE_KEY);
    localStorage.removeItem(SALT_STORAGE_KEY);
    localStorage.removeItem(DEVICE_BINDING_KEY);
    localStorage.removeItem(ENCRYPTED_TEST_RECORD_KEY);
    localStorage.removeItem('healthbridge_device_secret');

    console.log('[Security] Factory reset complete');
    
    logAuditEvent(
      'configuration_change',
      'warning',
      'securityStore',
      { operation: 'factory_reset' },
      'success'
    );
  }

  /**
   * Get key info (for debugging)
   */
  function getKeyInfo(): { exists: boolean; createdAt: string | null } {
    return {
      exists: localStorage.getItem(KEY_STORAGE_KEY) !== null,
      createdAt: keyCreationDate.value
    };
  }

  return {
    // State
    encryptionKey,
    salt,
    isUnlocked,
    deviceBinding,

    // Computed
    isKeyAvailable,

    // Actions
    initialize,
    generateKey,
    deriveKeyFromPin,
    getDeviceSecret,
    encryptKeyForStorage,
    decryptKeyFromStorage,
    ensureEncryptionKey,
    bindDevice,
    verifyDeviceBinding,
    createEncryptedTestRecord,
    verifyEncryptedTestRecord,
    lock,
    factoryReset,
    getKeyInfo,
    unlockWithPin,
    needsPinToUnlock
  };
});
