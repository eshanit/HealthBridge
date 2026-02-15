<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useAuth } from '~/composables/useAuth';

const {
  isLoading,
  errorMessage,
  currentPin,
  isAuthenticated,
  isPinSet,
  isLockedOut,
  remainingLockoutTime,
  failedAttempts,
  maxFailedAttempts,
  nurseName,
  showNameEntry,
  setNurseNameAndProceed,
  initialize,
  setupPin,
  verifyPin,
  addPinDigit,
  removePinDigit,
  clearPin,
  getPinEntryMode,
  logout,
  checkPinEntryComplete,
  resetPinEntry,
  confirmPin,
  isConfirmingPin
} = useAuth();

// Navigation
const router = useRouter();

// Local state for name input
const nameInput = ref('');
const nameInputRef = ref<HTMLInputElement | null>(null);

// Focus name input when shown
watch(showNameEntry, (show) => {
  if (show) {
    setTimeout(() => {
      nameInputRef.value?.focus();
    }, 100);
  }
});

// Initialize on mount
onMounted(async () => {
  await initialize();
});

// Handle name submission
async function handleNameSubmit() {
  const success = await setNurseNameAndProceed(nameInput.value);
  if (success) {
    // Clear and focus PIN input
    nameInput.value = '';
  }
}

// Handle number pad press
function handleNumberPress(num: number) {
  if (isLockedOut.value) return;
  addPinDigit(num.toString());
  checkPinEntryComplete();
}

// Handle backspace
function handleBackspace() {
  if (isLockedOut.value) return;
  removePinDigit();
}

// Handle clear
function handleClear() {
  if (isLockedOut.value) return;
  resetPinEntry();
}

// Handle logout
function handleLogout() {
  logout();
}

// Computed
const pinDots = computed(() => {
  return Array(4).fill(null).map((_, i) => currentPin.value[i] !== undefined);
});

const pageTitle = computed(() => {
  if (isLockedOut.value) {
    return 'Device Locked';
  }
  if (getPinEntryMode() === 'setup') {
    return isConfirmingPin.value ? 'Confirm Your PIN' : 'Set Up PIN';
  }
  return 'Enter PIN';
});

const pageSubtitle = computed(() => {
  if (isLockedOut.value) {
    const minutes = Math.ceil(remainingLockoutTime.value / 60);
    const seconds = remainingLockoutTime.value % 60;
    return `Try again in ${minutes}m ${seconds}s`;
  }
  if (getPinEntryMode() === 'setup') {
    return isConfirmingPin.value ? 'Enter the same PIN again' : 'Create a 4-digit PIN to secure your data';
  }
  return 'Enter your PIN to access the app';
});

// Check if authenticated and redirect
watch(isAuthenticated, (value) => {
  if (value) {
    navigateTo('/dashboard');
  }
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      <p class="text-gray-400 mt-4">Initializing...</p>
    </div>

    <!-- Login/PIN Entry -->
    <div v-else class="w-full max-w-md">
      <!-- Logo/Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-white">HealthBridge</h1>
        <p class="text-gray-400 text-sm mt-1">Nurse Companion</p>
      </div>

      <!-- Locked Out Message -->
      <div v-if="isLockedOut" class="bg-red-900/50 border border-red-700 rounded-lg p-6 text-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-red-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h2 class="text-xl font-bold text-red-400">Too Many Attempts</h2>
        <p class="text-gray-300 mt-2">{{ pageSubtitle }}</p>
      </div>

      <!-- Nurse Name Entry (First Time Setup) -->
      <div v-else-if="showNameEntry()" class="bg-gray-800 rounded-xl p-6 shadow-xl">
        <!-- Title -->
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-white">Welcome, Nurse</h2>
          <p class="text-gray-400 text-sm mt-1">Please enter your name to get started</p>
        </div>

        <!-- Error Message -->
        <div v-if="errorMessage" class="bg-red-900/50 border border-red-700 rounded-lg p-3 mb-4">
          <p class="text-red-400 text-sm text-center">{{ errorMessage }}</p>
        </div>

        <!-- Name Input -->
        <div class="mb-6">
          <label for="nurseName" class="block text-sm font-medium text-gray-300 mb-2">
            Your Name
          </label>
          <input
            ref="nameInputRef"
            id="nurseName"
            v-model="nameInput"
            type="text"
            placeholder="Enter your full name"
            class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            @keyup.enter="handleNameSubmit"
            maxlength="50"
          />
        </div>

        <!-- Submit Button -->
        <button
          @click="handleNameSubmit"
          :disabled="!nameInput.trim()"
          class="w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :class="nameInput.trim() ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-600'"
        >
          Continue
        </button>

        <!-- Info Note -->
        <div class="mt-4 p-3 bg-blue-900/30 border border-blue-800 rounded-lg">
          <p class="text-blue-300 text-xs text-center">
            This name will be displayed on patient assessments you complete.
          </p>
        </div>
      </div>

      <!-- PIN Entry Form -->
      <div v-else class="bg-gray-800 rounded-xl p-6 shadow-xl">
        <!-- Title -->
        <div class="text-center mb-6">
          <h2 class="text-xl font-semibold text-white">{{ pageTitle }}</h2>
          <p class="text-gray-400 text-sm mt-1">{{ pageSubtitle }}</p>
        </div>

        <!-- Error Message -->
        <div v-if="errorMessage" class="bg-red-900/50 border border-red-700 rounded-lg p-3 mb-4">
          <p class="text-red-400 text-sm text-center">{{ errorMessage }}</p>
        </div>

        <!-- PIN Dots -->
        <div class="flex justify-center gap-4 mb-8">
          <div 
            v-for="(filled, index) in pinDots" 
            :key="index"
            class="w-4 h-4 rounded-full transition-colors duration-200"
            :class="filled ? 'bg-blue-500' : 'bg-gray-700'"
          ></div>
        </div>

        <!-- Number Pad -->
        <div class="grid grid-cols-3 gap-4 mb-6">
          <button 
            v-for="num in [1, 2, 3, 4, 5, 6, 7, 8, 9]" 
            :key="num"
            @click="handleNumberPress(num)"
            class="h-14 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold text-xl transition-colors"
          >
            {{ num }}
          </button>
          <button 
            @click="handleClear"
            class="h-14 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold text-sm transition-colors"
          >
            Clear
          </button>
          <button 
            @click="handleNumberPress(0)"
            class="h-14 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold text-xl transition-colors"
          >
            0
          </button>
          <button 
            @click="handleBackspace"
            class="h-14 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold text-lg transition-colors"
          >
            ⌫
          </button>
        </div>

        <!-- Failed Attempts Warning -->
        <div v-if="getPinEntryMode() === 'login' && failedAttempts > 0" class="text-center">
          <p class="text-gray-500 text-sm">
            {{ failedAttempts }}/{{ maxFailedAttempts }} attempts used
          </p>
        </div>

        <!-- Logout Button (for demo) -->
        <div v-if="isAuthenticated" class="mt-6 pt-4 border-t border-gray-700">
          <button 
            @click="handleLogout"
            class="w-full py-2 text-gray-400 hover:text-white transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      <!-- Security Notice -->
      <div class="mt-6 text-center">
        <p class="text-gray-500 text-xs">
          🔒 All data is encrypted locally using AES-256-GCM
        </p>
        <p class="text-gray-600 text-xs mt-1">
          Your PIN is never transmitted over the network
        </p>
      </div>
    </div>
  </div>
</template>
