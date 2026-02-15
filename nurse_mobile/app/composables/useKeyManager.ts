import { ref, computed, onUnmounted } from 'vue';
import { logAuditEvent, logKeyManagement } from '~/services/auditLogger';

export interface KeyValidationResult {
  valid: boolean;
  error?: string;
  keyId?: string;
}

export interface KeyRotationResult {
  success: boolean;
  previousKeyId?: string;
  newKeyId?: string;
  error?: string;
}

interface SessionKeyState {
  key: Uint8Array | null;
  keyId: string;
  createdAt: number;
  deviceId: string;
}

const sessionKeyState = ref<SessionKeyState>({
  key: null,
  keyId: '',
  createdAt: 0,
  deviceId: ''
});

const keyMaterial = ref<Uint8Array | null>(null);
const isKeyInitialized = ref(false);
const isDegradedMode = ref(false);

function generateSecureKeyId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

function getDeviceId(): string {
  let deviceId = localStorage.getItem('healthbridge_device_id');
  if (!deviceId) {
    deviceId = generateSecureKeyId();
    localStorage.setItem('healthbridge_device_id', deviceId);
  }
  return deviceId;
}

async function deriveKeyFromPinHMAC(pin: string, salt: Uint8Array): Promise<{ key: Uint8Array; keyId: string }> {
  const encoder = new TextEncoder();
  const pinBuffer = encoder.encode(pin);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pinBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const derivedKeyBuffer = await crypto.subtle.sign(
    'HMAC',
    keyMaterial,
    salt.buffer as ArrayBuffer
  );
  
  const keyId = generateSecureKeyId();
  
  return {
    key: new Uint8Array(derivedKeyBuffer),
    keyId
  };
}

async function deriveKeyFromPasswordHMAC(password: string, salt: Uint8Array): Promise<{ key: Uint8Array; keyId: string }> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const derivedKeyBuffer = await crypto.subtle.sign(
    'HMAC',
    keyMaterial,
    salt.buffer as ArrayBuffer
  );
  
  const keyId = generateSecureKeyId();
  
  return {
    key: new Uint8Array(derivedKeyBuffer),
    keyId
  };
}

export function useKeyManager() {
  const hasSessionKey = computed(() => 
    sessionKeyState.value.key !== null && 
    sessionKeyState.value.key.length > 0
  );
  
  const currentKeyId = computed(() => sessionKeyState.value.keyId);
  
  const keyAge = computed(() => {
    if (sessionKeyState.value.createdAt === 0) return 0;
    return Date.now() - sessionKeyState.value.createdAt;
  });
  
  const isExpired = computed(() => {
    const maxAge = 24 * 60 * 60 * 1000;
    return keyAge.value > maxAge;
  });
  
  async function initializeFromPin(pin: string): Promise<KeyValidationResult> {
    try {
      if (!pin || pin.length < 4) {
        logAuditEvent(
          'security_exception',
          'warning',
          'keyManager',
          { operation: 'initialize_from_pin', error: 'PIN too short' },
          'failure'
        );
        return { valid: false, error: 'PIN must be at least 4 characters' };
      }
      
      const salt = new Uint8Array(32);
      crypto.getRandomValues(salt);
      
      const storedSalt = localStorage.getItem('healthbridge_key_salt');
      if (storedSalt) {
        const existingSalt = new Uint8Array(JSON.parse(storedSalt));
        salt.set(existingSalt);
      } else {
        localStorage.setItem('healthbridge_key_salt', JSON.stringify(Array.from(salt)));
      }
      
      const { key, keyId } = await deriveKeyFromPinHMAC(pin, salt);
      
      keyMaterial.value = key;
      
      sessionKeyState.value = {
        key: key,
        keyId,
        createdAt: Date.now(),
        deviceId: getDeviceId()
      };
      
      isKeyInitialized.value = true;
      isDegradedMode.value = false;
      
      logKeyManagement('key_derivation', true, {
        keyId,
        method: 'pin',
        deviceId: sessionKeyState.value.deviceId,
        saltUsed: !!storedSalt
      });
      
      return { valid: true, keyId };
    } catch (error) {
      console.error('[KeyManager] Failed to initialize from PIN:', error);
      logAuditEvent(
        'security_exception',
        'error',
        'keyManager',
        { operation: 'initialize_from_pin', error: String(error) },
        'failure'
      );
      return { valid: false, error: String(error) };
    }
  }
  
  async function initializeFromPassword(password: string): Promise<KeyValidationResult> {
    try {
      if (!password || password.length < 8) {
        logAuditEvent(
          'security_exception',
          'warning',
          'keyManager',
          { operation: 'initialize_from_password', error: 'Password too short' },
          'failure'
        );
        return { valid: false, error: 'Password must be at least 8 characters' };
      }
      
      const salt = new Uint8Array(32);
      crypto.getRandomValues(salt);
      
      const storedSalt = localStorage.getItem('healthbridge_key_salt');
      if (storedSalt) {
        const existingSalt = new Uint8Array(JSON.parse(storedSalt));
        salt.set(existingSalt);
      } else {
        localStorage.setItem('healthbridge_key_salt', JSON.stringify(Array.from(salt)));
      }
      
      const { key, keyId } = await deriveKeyFromPasswordHMAC(password, salt);
      
      keyMaterial.value = key;
      
      sessionKeyState.value = {
        key: key,
        keyId,
        createdAt: Date.now(),
        deviceId: getDeviceId()
      };
      
      isKeyInitialized.value = true;
      isDegradedMode.value = false;
      
      logKeyManagement('key_derivation', true, {
        keyId,
        method: 'password',
        deviceId: sessionKeyState.value.deviceId,
        saltUsed: !!storedSalt
      });
      
      return { valid: true, keyId };
    } catch (error) {
      console.error('[KeyManager] Failed to initialize from password:', error);
      logAuditEvent(
        'security_exception',
        'error',
        'keyManager',
        { operation: 'initialize_from_password', error: String(error) },
        'failure'
      );
      return { valid: false, error: String(error) };
    }
  }
  
  function getSessionKey(): Uint8Array | null {
    if (!sessionKeyState.value.key) {
      console.warn('[KeyManager] No session key available');
      return null;
    }
    
    return sessionKeyState.value.key;
  }
  
  function requireKey(): Uint8Array {
    const key = getSessionKey();
    if (!key) {
      throw new Error('[KeyManager] Session key not available - please authenticate first');
    }
    return key;
  }
  
  async function rotateKey(): Promise<KeyRotationResult> {
    try {
      const previousKeyId = sessionKeyState.value.keyId;
      
      const newSalt = new Uint8Array(32);
      crypto.getRandomValues(newSalt);
      localStorage.setItem('healthbridge_key_salt', JSON.stringify(Array.from(newSalt)));
      
      let newKey: Uint8Array;
      let newKeyId: string;
      
      if (keyMaterial.value) {
        const newKeyMaterial = await crypto.subtle.importKey(
          'raw',
          keyMaterial.value,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        
        const derivedKeyBuffer = await crypto.subtle.sign(
          'HMAC',
          newKeyMaterial,
          newSalt as any
        );
        
        newKey = new Uint8Array(derivedKeyBuffer);
        newKeyId = generateSecureKeyId();
      } else {
        return { 
          success: false, 
          previousKeyId, 
          error: 'No key material available for rotation' 
        };
      }
      
      sessionKeyState.value = {
        key: newKey,
        keyId: newKeyId,
        createdAt: Date.now(),
        deviceId: sessionKeyState.value.deviceId
      };
      
      logKeyManagement('key_rotation', true, {
        newKeyId,
        previousKeyId,
        deviceId: sessionKeyState.value.deviceId
      });
      
      return { success: true, previousKeyId, newKeyId };
    } catch (error) {
      console.error('[KeyManager] Failed to rotate key:', error);
      logAuditEvent(
        'security_exception',
        'error',
        'keyManager',
        { operation: 'key_rotation', error: String(error) },
        'failure'
      );
      return { success: false, error: String(error) };
    }
  }
  
  function clearSessionKey(): void {
    if (sessionKeyState.value.key) {
      sessionKeyState.value.key.fill(0);
    }
    
    sessionKeyState.value = {
      key: null,
      keyId: '',
      createdAt: 0,
      deviceId: ''
    };
    
    keyMaterial.value = null;
    isKeyInitialized.value = false;
    isDegradedMode.value = false;
    
    console.log('[KeyManager] Session key cleared');
  }
  
  function enterDegradedMode(): void {
    isDegradedMode.value = true;
    logAuditEvent(
      'configuration_change',
      'warning',
      'keyManager',
      { operation: 'enter_degraded_mode' },
      'success'
    );
  }
  
  function exitDegradedMode(): void {
    isDegradedMode.value = false;
  }
  
  function validateKeyForOperation(operation: string): KeyValidationResult {
    if (isDegradedMode.value) {
      if (operation !== 'recovery') {
        return { valid: false, error: 'Degraded mode: only recovery operations allowed' };
      }
    }
    
    if (!hasSessionKey.value) {
      return { valid: false, error: 'No session key available' };
    }
    
    if (isExpired.value) {
      logAuditEvent(
        'security_exception',
        'warning',
        'keyManager',
        { operation: 'key_validation', error: 'Key expired' },
        'failure'
      );
      return { valid: false, error: 'Session key has expired', keyId: currentKeyId.value };
    }
    
    return { valid: true, keyId: currentKeyId.value };
  }
  
  onUnmounted(() => {
    clearSessionKey();
  });
  
  return {
    hasSessionKey,
    currentKeyId,
    keyAge,
    isExpired,
    isKeyInitialized,
    isDegradedMode,
    initializeFromPin,
    initializeFromPassword,
    getSessionKey,
    requireKey,
    rotateKey,
    clearSessionKey,
    enterDegradedMode,
    exitDegradedMode,
    validateKeyForOperation
  };
}
