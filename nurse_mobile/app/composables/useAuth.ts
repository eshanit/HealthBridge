/**
 * Authentication Composable
 * 
 * Provides reactive authentication state and methods for Vue components
 */

import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '~/stores/auth';
import { useSecurityStore } from '~/stores/security';
import { useKeyManager } from '~/composables/useKeyManager';
import { useAppInit } from '~/composables/useAppInit';
import { logAuditEvent } from '~/services/auditLogger';

export function useAuth() {
  const authStore = useAuthStore();
  const securityStore = useSecurityStore();
  const { initializeFromPin, validateKeyForOperation } = useKeyManager();
  const { initialize: initializeApp } = useAppInit();

  // Local state
  const isLoading = ref(true);
  const errorMessage = ref<string | null>(null);
  const currentPin = ref('');
  const confirmPin = ref('');
  const isConfirmingPin = ref(false);
  const isSettingUpName = ref(false);

  // Computed
  const isAuthenticated = computed(() => authStore.isAuthenticated);
  const isPinSet = computed(() => authStore.isPinSet);
  const isLockedOut = computed(() => authStore.isLockedOut);
  const remainingLockoutTime = computed(() => authStore.remainingLockoutTime);
  const failedAttempts = computed(() => authStore.failedAttempts);
  const maxFailedAttempts = 5;
  // Get nurseName from store (uses VueUse useLocalStorage for persistence)
  const nurseName = computed(() => authStore.nurseName);

  // Initialize on mount
  async function initialize() {
    isLoading.value = true;
    try {
      await authStore.initialize();
      await securityStore.initialize();
      
      const result = await initializeApp();
      
      if (result.degradedMode) {
        console.warn('[useAuth] App initialized in degraded mode');
      }
    } catch (error) {
      console.error('[useAuth] Initialization failed:', error);
      errorMessage.value = 'Failed to initialize authentication';
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Set the nurse's name and proceed to PIN setup
   */
  async function setNurseNameAndProceed(name: string): Promise<boolean> {
    errorMessage.value = null;
    
    if (!name.trim()) {
      errorMessage.value = 'Please enter your name';
      return false;
    }
    
    if (name.trim().length < 2) {
      errorMessage.value = 'Name must be at least 2 characters';
      return false;
    }
    
    authStore.setNurseName(name.trim());
    isSettingUpName.value = false;
    return true;
  }

  /**
   * Start PIN setup (from name entry)
   */
  function startPinSetup() {
    isSettingUpName.value = false;
    resetPinEntry();
  }

  /**
   * Set up a new PIN
   */
  async function setupPin(pin: string): Promise<boolean> {
    errorMessage.value = null;
    
    if (pin.length !== 4) {
      errorMessage.value = 'PIN must be 4 digits';
      return false;
    }

    if (!/^\d+$/.test(pin)) {
      errorMessage.value = 'PIN must contain only digits';
      return false;
    }

    const success = await authStore.setupPin(pin);
    
    if (success) {
      // Generate encryption key
      await securityStore.generateKey();
    }

    return success;
  }

  /**
   * Verify PIN and unlock
   */
  async function verifyPin(pin: string): Promise<boolean> {
    errorMessage.value = null;

    if (isLockedOut.value) {
      const minutes = Math.ceil(remainingLockoutTime.value / 60);
      errorMessage.value = `Too many failed attempts. Try again in ${minutes} minutes.`;
      return false;
    }

    const authSuccess = await authStore.verifyPin(pin);
    
    if (!authSuccess) {
      const remaining = maxFailedAttempts - failedAttempts.value;
      errorMessage.value = `Incorrect PIN. ${remaining} attempts remaining.`;
      return false;
    }

    const keyResult = await initializeFromPin(pin);
    
    if (!keyResult.valid) {
      errorMessage.value = keyResult.error || 'Failed to initialize encryption key';
      
      logAuditEvent(
        'security_exception',
        'error',
        'useAuth',
        { operation: 'pin_verification_key_init', error: keyResult.error },
        'failure'
      );
      
      return false;
    }

    logAuditEvent(
      'session_start',
      'info',
      'useAuth',
      { keyId: keyResult.keyId, method: 'pin' },
      'success'
    );

    return true;
  }

  /**
   * Add digit to current PIN
   */
  function addPinDigit(digit: string) {
    if (currentPin.value.length < 4) {
      currentPin.value += digit;
    }
  }

  /**
   * Remove last digit from current PIN
   */
  function removePinDigit() {
    currentPin.value = currentPin.value.slice(0, -1);
  }

  /**
   * Clear current PIN
   */
  function clearPin() {
    currentPin.value = '';
    errorMessage.value = null;
  }

  /**
   * Get PIN entry mode
   */
  function getPinEntryMode(): 'setup' | 'login' {
    return isPinSet.value ? 'login' : 'setup';
  }

  /**
   * Check if we need to show name entry
   */
  function showNameEntry(): boolean {
    return !authStore.isPinSet && !authStore.getNurseName();
  }

  /**
   * Check if 4 digits entered and handle accordingly
   */
  function checkPinEntryComplete() {
    if (getPinEntryMode() === 'setup') {
      if (!isConfirmingPin.value && currentPin.value.length === 4) {
        // First PIN entered - switch to confirm mode
        confirmPin.value = currentPin.value;
        isConfirmingPin.value = true;
        currentPin.value = ''; // Clear for confirmation entry
      } else if (isConfirmingPin.value && currentPin.value.length === 4) {
        // Confirm PIN entered
        if (currentPin.value === confirmPin.value) {
          // PINs match - set it up
          setupPin(currentPin.value).then((success) => {
            if (success) {
              navigateTo('/dashboard');
            } else {
              errorMessage.value = 'Failed to setup PIN. Please try again.';
              resetPinEntry();
            }
          });
        } else {
          // PINs don't match
          errorMessage.value = 'PINs do not match. Please try again.';
          resetPinEntry();
        }
      }
    } else {
      // Login mode
      if (currentPin.value.length === 4) {
        verifyPin(currentPin.value).then((success) => {
          if (success) {
            navigateTo('/dashboard');
          } else {
            clearPin();
          }
        });
      }
    }
  }

  /**
   * Reset PIN entry to initial state
   */
  function resetPinEntry() {
    currentPin.value = '';
    confirmPin.value = '';
    isConfirmingPin.value = false;
  }

  /**
   * Logout
   */
  function logout() {
    securityStore.lock();
    authStore.logout();
    currentPin.value = '';
  }

  /**
   * Factory reset
   */
  async function factoryReset(): Promise<void> {
    await authStore.factoryReset();
    await securityStore.factoryReset();
    currentPin.value = '';
  }

  /**
   * Get audit logs
   */
  function getAuditLogs(action?: string) {
    return authStore.getAuditLogs(action);
  }

  return {
    // State
    isLoading,
    errorMessage,
    currentPin,
    confirmPin,
    isConfirmingPin,
    nurseName,
    isSettingUpName,

    // Computed
    isAuthenticated,
    isPinSet,
    isLockedOut,
    remainingLockoutTime,
    failedAttempts,
    maxFailedAttempts,

    // Actions
    initialize,
    setNurseNameAndProceed,
    startPinSetup,
    setupPin,
    verifyPin,
    addPinDigit,
    removePinDigit,
    clearPin,
    getPinEntryMode,
    checkPinEntryComplete,
    resetPinEntry,
    showNameEntry,
    logout,
    factoryReset,
    getAuditLogs
  };
}
