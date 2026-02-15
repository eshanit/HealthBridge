/**
 * Authentication Store
 * 
 * Handles PIN setup, login, and brute-force lockout protection
 * Uses Pinia for state management
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useLocalStorage } from '@vueuse/core';

export interface AuthState {
  isAuthenticated: boolean;
  isPinSet: boolean;
  failedAttempts: number;
  lockoutUntil: number | null;
  deviceId: string | null;
  nurseName: string | null;
}

export interface AuditLogEntry {
  timestamp: string;
  action: string;
  success: boolean;
  details?: string;
}

export const useAuthStore = defineStore('auth', () => {
  // State
  const isAuthenticated = ref(false);
  const isPinSet = ref(false);
  const failedAttempts = ref(0);
  const lockoutUntil = ref<number | null>(null);
  const deviceId = ref<string | null>(null);
  // Use VueUse's useLocalStorage for automatic persistence of nurse name
  const nurseName = useLocalStorage<string | null>('healthbridge_nurse_name', null);
  const auditLogs = ref<AuditLogEntry[]>([]);

  // Constants
  const MAX_FAILED_ATTEMPTS = 5;
  const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  const PIN_LENGTH = 4;

  // Computed
  const isLockedOut = computed(() => {
    if (lockoutUntil.value === null) return false;
    return Date.now() < lockoutUntil.value;
  });

  const remainingLockoutTime = computed(() => {
    if (!lockoutUntil.value || !isLockedOut.value) return 0;
    return Math.ceil((lockoutUntil.value - Date.now()) / 1000);
  });

  // Actions

  /**
   * Initialize auth state from storage
   */
  async function initialize(): Promise<void> {
    // Load device ID
    deviceId.value = localStorage.getItem('healthbridge_device_id');
    if (!deviceId.value) {
      deviceId.value = generateDeviceId();
      localStorage.setItem('healthbridge_device_id', deviceId.value);
    }

    // Check if PIN is set
    isPinSet.value = localStorage.getItem('healthbridge_pin_hash') !== null;

    // Load nurse name (now handled by useLocalStorage)
    // nurseName.value is automatically synced with localStorage

    // Load lockout state
    const lockoutStored = localStorage.getItem('healthbridge_lockout_until');
    if (lockoutStored) {
      lockoutUntil.value = parseInt(lockoutStored, 10);
    }

    // Load audit logs
    const logsStored = localStorage.getItem('healthbridge_audit_logs');
    if (logsStored) {
      try {
        auditLogs.value = JSON.parse(logsStored);
      } catch {
        auditLogs.value = [];
      }
    }

    // Check if already authenticated (session)
    const sessionExpiry = localStorage.getItem('healthbridge_session_expiry');
    if (sessionExpiry && Date.now() < parseInt(sessionExpiry, 10)) {
      isAuthenticated.value = true;
    }

    logAction('initialize', true, 'Auth store initialized');
  }

  /**
   * Generate a unique device ID
   */
  function generateDeviceId(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Set the nurse's name
   * @param name - Nurse's display name
   */
  function setNurseName(name: string): void {
    nurseName.value = name.trim();
    logAction('set_nurse_name', true, 'Nurse name set successfully');
  }

  /**
   * Get the nurse's name
   */
  function getNurseName(): string | null {
    return nurseName.value;
  }

  /**
   * Set up a new PIN
   * @param pin - 4-digit PIN
   * @returns Success status
   */
  async function setupPin(pin: string): Promise<boolean> {
    if (pin.length !== PIN_LENGTH) {
      logAction('setup_pin', false, 'Invalid PIN length');
      return false;
    }

    // Hash the PIN
    const pinHash = await hashPin(pin);
    localStorage.setItem('healthbridge_pin_hash', pinHash.hash);
    localStorage.setItem('healthbridge_pin_salt', pinHash.salt);

    isPinSet.value = true;
    logAction('setup_pin', true, 'PIN setup successful');
    return true;
  }

  /**
   * Verify the entered PIN
   * @param pin - 4-digit PIN
   * @returns Success status
   */
  async function verifyPin(pin: string): Promise<boolean> {
    // Check if locked out
    if (isLockedOut.value) {
      logAction('verify_pin', false, 'Device locked out');
      return false;
    }

    const storedHash = localStorage.getItem('healthbridge_pin_hash');
    const storedSalt = localStorage.getItem('healthbridge_pin_salt');

    if (!storedHash || !storedSalt) {
      logAction('verify_pin', false, 'No PIN configured');
      return false;
    }

    const { hash } = await hashPin(pin, storedSalt);

    if (hash === storedHash) {
      // Success - reset failed attempts
      failedAttempts.value = 0;
      localStorage.removeItem('healthbridge_failed_attempts');
      
      // Set authenticated session (24 hours)
      const sessionExpiry = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem('healthbridge_session_expiry', sessionExpiry.toString());
      
      isAuthenticated.value = true;
      logAction('verify_pin', true, 'PIN verified successfully');
      return true;
    } else {
      // Failed attempt
      failedAttempts.value++;
      localStorage.setItem('healthbridge_failed_attempts', failedAttempts.value.toString());

      if (failedAttempts.value >= MAX_FAILED_ATTEMPTS) {
        // Lock out the device
        const lockoutEnd = Date.now() + LOCKOUT_DURATION_MS;
        lockoutUntil.value = lockoutEnd;
        localStorage.setItem('healthbridge_lockout_until', lockoutEnd.toString());
        logAction('verify_pin', false, `Too many failed attempts - locked out until ${new Date(lockoutEnd).toISOString()}`);
      } else {
        logAction('verify_pin', false, `Failed attempt ${failedAttempts.value}/${MAX_FAILED_ATTEMPTS}`);
      }
      
      return false;
    }
  }

  /**
   * Hash a PIN using PBKDF2
   */
  async function hashPin(pin: string, existingSalt?: string): Promise<{ hash: string; salt: string }> {
    const encoder = new TextEncoder();
    const salt = existingSalt || crypto.randomUUID();
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(pin),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: encoder.encode(salt),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    const hashArray = new Uint8Array(hashBuffer);
    const hash = Array.from(hashArray, (byte) => byte.toString(16).padStart(2, '0')).join('');

    return { hash, salt };
  }

  /**
   * Log out and clear session
   */
  function logout(): void {
    isAuthenticated.value = false;
    localStorage.removeItem('healthbridge_session_expiry');
    logAction('logout', true, 'User logged out');
  }

  /**
   * Clear all auth data (factory reset)
   */
  async function factoryReset(): Promise<void> {
    // Keep device ID but clear everything else
    const deviceIdToKeep = deviceId.value;
    
    localStorage.removeItem('healthbridge_pin_hash');
    localStorage.removeItem('healthbridge_pin_salt');
    localStorage.removeItem('healthbridge_lockout_until');
    localStorage.removeItem('healthbridge_failed_attempts');
    localStorage.removeItem('healthbridge_session_expiry');
    localStorage.removeItem('healthbridge_audit_logs');

    isAuthenticated.value = false;
    isPinSet.value = false;
    failedAttempts.value = 0;
    lockoutUntil.value = null;
    auditLogs.value = [];

    // Restore device ID
    if (deviceIdToKeep) {
      deviceId.value = deviceIdToKeep;
    }

    logAction('factory_reset', true, 'Factory reset performed');
  }

  /**
   * Add an audit log entry
   */
  function logAction(action: string, success: boolean, details?: string): void {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      action,
      success,
      details
    };
    
    auditLogs.value.unshift(entry);
    
    // Keep only last 1000 entries
    if (auditLogs.value.length > 1000) {
      auditLogs.value = auditLogs.value.slice(0, 1000);
    }

    localStorage.setItem('healthbridge_audit_logs', JSON.stringify(auditLogs.value));
    
    // Also log to console for debugging
    console.log(`[AUDIT] ${entry.timestamp} - ${action} - ${success ? 'SUCCESS' : 'FAILED'}`, details || '');
  }

  /**
   * Get audit logs
   */
  function getAuditLogs(action?: string): AuditLogEntry[] {
    if (!action) return auditLogs.value;
    return auditLogs.value.filter((log) => log.action === action);
  }

  /**
   * Check if device is bound to this device
   */
  function isDeviceBound(): boolean {
    return deviceId.value !== null;
  }

  /**
   * Get device ID
   */
  function getDeviceId(): string | null {
    return deviceId.value;
  }

  return {
    // State
    isAuthenticated,
    isPinSet,
    failedAttempts,
    lockoutUntil,
    deviceId,
    nurseName,
    auditLogs,

    // Computed
    isLockedOut,
    remainingLockoutTime,

    // Actions
    initialize,
    setNurseName,
    getNurseName,
    setupPin,
    verifyPin,
    logout,
    factoryReset,
    logAction,
    getAuditLogs,
    isDeviceBound,
    getDeviceId
  };
});
