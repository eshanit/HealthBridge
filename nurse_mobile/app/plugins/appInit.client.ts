/**
 * App Initialization Plugin (Client-Side Only)
 *
 * Initializes security, key management, and degraded mode support
 * Runs automatically before the app is mounted
 *
 * IMPORTANT: Do NOT import this file directly. Use the useAppInit() composable instead.
 * Nuxt plugins are auto-registered and should not be imported.
 */

import { useKeyManager } from '~/composables/useKeyManager';
import { useSecurityStore } from '~/stores/security';
import { logAuditEvent, logDegradedMode } from '~/services/auditLogger';

const DEGRADED_MODE_KEY = 'healthbridge_degraded_mode';
const DEGRADED_MODE_REASON_KEY = 'healthbridge_degraded_mode_reason';

function checkDegradedMode(): boolean {
  try {
    return localStorage.getItem(DEGRADED_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

function enableDegradedMode(reason: string): void {
  localStorage.setItem(DEGRADED_MODE_KEY, 'true');
  localStorage.setItem(DEGRADED_MODE_REASON_KEY, reason);

  logDegradedMode(true, reason);

  console.warn('[AppInit] Degraded mode enabled:', reason);
}

function disableDegradedMode(): void {
  const reason = localStorage.getItem(DEGRADED_MODE_REASON_KEY);
  localStorage.removeItem(DEGRADED_MODE_KEY);
  localStorage.removeItem(DEGRADED_MODE_REASON_KEY);

  if (reason) {
    logDegradedMode(false, reason);
  }

  console.log('[AppInit] Degraded mode disabled');
}

function getDegradedModeReason(): string | null {
  try {
    return localStorage.getItem(DEGRADED_MODE_REASON_KEY);
  } catch {
    return null;
  }
}

async function initializeApp(): Promise<{
  success: boolean;
  degradedMode: boolean;
  error?: string;
}> {
  const securityStore = useSecurityStore();
  const { initializeFromPin, validateKeyForOperation } = useKeyManager();

  try {
    await securityStore.initialize();

    if (checkDegradedMode()) {
      console.warn('[AppInit] Running in degraded mode');

      logAuditEvent(
        'degraded_mode_entered',
        'warning',
        'appInit',
        { reason: getDegradedModeReason() || 'unknown' },
        'success'
      );

      return { success: true, degradedMode: true };
    }

    return { success: true, degradedMode: false };
  } catch (error) {
    const errorMessage = String(error);

    console.error('[AppInit] Initialization failed:', error);

    return {
      success: false,
      degradedMode: false,
      error: errorMessage
    };
  }
}

async function initializeWithPin(pin: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const securityStore = useSecurityStore();
  const { initializeFromPin, hasSessionKey } = useKeyManager();

  try {
    if (!pin || pin.length < 4) {
      return { success: false, error: 'PIN must be at least 4 characters' };
    }

    const result = await initializeFromPin(pin);

    if (!result.valid) {
      return { success: false, error: result.error };
    }

    if (checkDegradedMode()) {
      disableDegradedMode();
    }

    return { success: true };
  } catch (error) {
    console.error('[AppInit] PIN initialization failed:', error);
    return { success: false, error: String(error) };
  }
}

async function validateSession(): Promise<{
  valid: boolean;
  needsRecovery: boolean;
  error?: string;
}> {
  const { validateKeyForOperation } = useKeyManager();

  if (checkDegradedMode()) {
    const validation = validateKeyForOperation('recovery');
    if (!validation.valid && validation.error) {
      return { valid: false, needsRecovery: true, error: validation.error };
    }
    return { valid: true, needsRecovery: true };
  }

  const validation = validateKeyForOperation('general');

  if (!validation.valid) {
    if (validation.error?.includes('expired')) {
      return { valid: false, needsRecovery: false, error: 'Session key expired' };
    }
    return { valid: false, needsRecovery: true, error: validation.error };
  }

  return { valid: true, needsRecovery: false };
}

export default defineNuxtPlugin((nuxtApp) => {
  return {
    provide: {
      appInit: {
        checkDegradedMode,
        enableDegradedMode,
        disableDegradedMode,
        getDegradedModeReason,
        initializeApp,
        initializeWithPin,
        validateSession
      }
    }
  };
});
