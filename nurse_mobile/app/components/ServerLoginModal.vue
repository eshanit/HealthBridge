<template>
  <div class="modal-overlay" @click.self="handleClose">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Server Authentication Required</h2>
        <p class="modal-description">
          To sync data with the central server, please enter your UtanoBridge credentials.
        </p>
      </div>

      <form @submit.prevent="handleSubmit" class="login-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="credentials.email"
            type="email"
            placeholder="nurse@healthbridge.org"
            required
            :disabled="isLoading"
          />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="credentials.password"
            type="password"
            placeholder="Enter your password"
            required
            :disabled="isLoading"
          />
        </div>

        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>

        <div class="form-actions">
          <button type="button" class="btn-secondary" @click="handleClose" :disabled="isLoading">
            Skip for Now
          </button>
          <button type="submit" class="btn-primary" :disabled="isLoading">
            {{ isLoading ? 'Signing in...' : 'Sign In' }}
          </button>
        </div>
      </form>

      <div class="modal-footer">
        <p class="info-text">
          <svg xmlns="http://www.w3.org/2000/svg" class="info-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Your data will be synced securely with the central server.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useServerAuth, type LoginCredentials } from '~/services/serverAuth';
import { initializeSyncManager, startSync } from '~/services/syncManager';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'success'): void;
}>();

const serverAuth = useServerAuth();

const credentials = reactive<LoginCredentials>({
  email: '',
  password: '',
  deviceName: 'nurse_mobile'
});

const isLoading = ref(false);
const errorMessage = ref<string | null>(null);

async function handleSubmit() {
  isLoading.value = true;
  errorMessage.value = null;

  try {
    // Login to server
    await serverAuth.login(credentials);
    
    console.log('[ServerLoginModal] Server authentication successful');
    
    // Initialize sync manager
    await initializeSyncManager();
    
    // Start sync
    await startSync();
    
    console.log('[ServerLoginModal] Sync started successfully');
    
    emit('success');
    emit('close');
  } catch (error) {
    console.error('[ServerLoginModal] Login failed:', error);
    errorMessage.value = error instanceof Error ? error.message : 'Login failed. Please check your credentials.';
  } finally {
    isLoading.value = false;
  }
}

function handleClose() {
  emit('close');
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #1a1a2e;
  border-radius: 12px;
  padding: 24px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-header {
  margin-bottom: 24px;
  text-align: center;
}

.modal-header h2 {
  color: #fff;
  font-size: 1.5rem;
  margin: 0 0 8px 0;
}

.modal-description {
  color: #a0a0a0;
  font-size: 0.9rem;
  margin: 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  color: #e0e0e0;
  font-size: 0.875rem;
  font-weight: 500;
}

.form-group input {
  padding: 12px 16px;
  border: 1px solid #333;
  border-radius: 8px;
  background: #0f0f1a;
  color: #fff;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: #4f46e5;
}

.form-group input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  color: #ef4444;
  font-size: 0.875rem;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 6px;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.btn-primary,
.btn-secondary {
  flex: 1;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #4f46e5;
  color: #fff;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background: #4338ca;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: transparent;
  color: #a0a0a0;
  border: 1px solid #333;
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-footer {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #333;
}

.info-text {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6b7280;
  font-size: 0.8rem;
  margin: 0;
}

.info-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
</style>
