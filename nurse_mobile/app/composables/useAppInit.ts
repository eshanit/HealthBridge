/**
 * App Initialization Composable
 *
 * Type-safe access to the appInit plugin functions.
 *
 * IMPORTANT: Do NOT import from ~/plugins/appInit directly.
 * Use this composable or access via useNuxtApp().$appInit
 */

import { ref, computed, onMounted } from 'vue';
import type { Ref } from 'vue';

export interface AppInitPlugin {
  checkDegradedMode: () => boolean;
  enableDegradedMode: (reason: string) => void;
  disableDegradedMode: () => void;
  getDegradedModeReason: () => string | null;
  initializeApp: () => Promise<{
    success: boolean;
    degradedMode: boolean;
    error?: string;
  }>;
  initializeWithPin: (pin: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  validateSession: () => Promise<{
    valid: boolean;
    needsRecovery: boolean;
    error?: string;
  }>;
}

declare module '#app' {
  interface NuxtApp {
    $appInit: AppInitPlugin;
  }
}

const isInitialized = ref(false);
const isInitializing = ref(false);
const initializationError = ref<string | null>(null);

export function useAppInit() {
  const nuxtApp = useNuxtApp();

  function getPlugin(): AppInitPlugin {
    if (!nuxtApp.$appInit) {
      throw new Error('AppInit plugin not available. Ensure appInit.client.ts is in the plugins directory.');
    }
    return nuxtApp.$appInit;
  }

  const isDegradedMode = computed(() => {
    return getPlugin().checkDegradedMode();
  });

  const degradedModeReason = computed(() => {
    return getPlugin().getDegradedModeReason();
  });

  async function initialize(): Promise<{
    success: boolean;
    degradedMode: boolean;
    error?: string;
  }> {
    if (isInitializing.value) {
      console.warn('[useAppInit] Initialization already in progress');
      return { success: false, degradedMode: false, error: 'Initialization already in progress' };
    }

    isInitializing.value = true;
    initializationError.value = null;

    try {
      const result = await getPlugin().initializeApp();
      isInitialized.value = result.success;

      if (!result.success) {
        initializationError.value = result.error || 'Unknown initialization error';
      }

      return result;
    } catch (error) {
      const errorMessage = String(error);
      initializationError.value = errorMessage;
      isInitialized.value = false;
      return { success: false, degradedMode: false, error: errorMessage };
    } finally {
      isInitializing.value = false;
    }
  }

  async function initializeWithPin(pin: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    return getPlugin().initializeWithPin(pin);
  }

  async function validateSession(): Promise<{
    valid: boolean;
    needsRecovery: boolean;
    error?: string;
  }> {
    return getPlugin().validateSession();
  }

  function enableDegradedMode(reason: string): void {
    getPlugin().enableDegradedMode(reason);
  }

  function disableDegradedMode(): void {
    getPlugin().disableDegradedMode();
  }

  return {
    isInitialized: readonly(isInitialized),
    isInitializing: readonly(isInitializing),
    initializationError: readonly(initializationError),
    isDegradedMode,
    degradedModeReason,
    initialize,
    initializeWithPin,
    validateSession,
    enableDegradedMode,
    disableDegradedMode
  };
}
