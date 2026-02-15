<template>
  <div class="settings-page">
    <div class="page-header">
      <h1>Settings</h1>
      <p>Manage your HealthBridge application settings and database health</p>
    </div>

    <div class="settings-content">
      <div class="settings-section">
        <h2>Database Health</h2>
        <DbHealthDashboard />
      </div>

      <div class="settings-section">
        <h2>Emergency Recovery</h2>
        <p>Use this option if you're experiencing database issues:</p>
        <button class="btn-primary" @click="showRecovery = true">
          Open Emergency Recovery
        </button>
      </div>

      <div class="settings-section">
        <h2>Security</h2>
        <div class="security-status">
          <div class="status-item">
            <span class="status-label">Encryption Status</span>
            <span :class="['status-value', isUnlocked ? 'active' : 'inactive']">
              {{ isUnlocked ? 'Unlocked' : 'Locked' }}
            </span>
          </div>
          <div class="status-item">
            <span class="status-label">Session Key</span>
            <span :class="['status-value', hasSessionKey ? 'active' : 'inactive']">
              {{ hasSessionKey ? 'Active' : 'Inactive' }}
            </span>
          </div>
          <div class="status-item">
            <span class="status-label">Degraded Mode</span>
            <span :class="['status-value', isDegradedMode ? 'warning' : 'normal']">
              {{ isDegradedMode ? 'Active' : 'Inactive' }}
            </span>
          </div>
        </div>
        
        <div class="security-actions">
          <button 
            v-if="isUnlocked" 
            class="btn-warning" 
            @click="lockDatabase"
          >
            Lock Database
          </button>
          <button 
            class="btn-secondary" 
            @click="rotateKeyHandler"
            :disabled="!hasSessionKey"
          >
            Rotate Key
          </button>
          <button 
            v-if="isDegradedMode" 
            class="btn-success" 
            @click="exitDegradedMode"
          >
            Exit Degraded Mode
          </button>
          <button 
            v-if="!isDegradedMode" 
            class="btn-danger" 
            @click="showDegradedModal = true"
          >
            Enable Degraded Mode
          </button>
        </div>
      </div>

      <div class="settings-section">
        <h2>Key Information</h2>
        <div class="key-info">
          <div class="info-item">
            <span class="info-label">Key ID</span>
            <span class="info-value monospace">{{ currentKeyId || 'N/A' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Key Age</span>
            <span class="info-value">{{ keyAgeFormatted }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Device ID</span>
            <span class="info-value monospace">{{ deviceId }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showRecovery" class="recovery-modal">
      <div class="recovery-container">
        <button class="close-btn" @click="showRecovery = false">✕</button>
        <EmergencyRecovery />
      </div>
    </div>

    <div v-if="showDegradedModal" class="modal-overlay" @click.self="showDegradedModal = false">
      <div class="modal-content">
        <h3>⚠️ Enable Degraded Mode</h3>
        <p>Degraded mode will:</p>
        <ul>
          <li>Skip encryption for new data</li>
          <li>Allow access to uncorrupted data</li>
          <li>Only allow recovery operations</li>
        </ul>
        <div class="modal-actions">
          <button class="btn-danger" @click="enableDegradedModeHandler">
            Enable Degraded Mode
          </button>
          <button class="btn-secondary" @click="showDegradedModal = false">
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSecurityStore } from '~/stores/security';
import { useKeyManager } from '~/composables/useKeyManager';
import { useAppInit } from '~/composables/useAppInit';
import DbHealthDashboard from '~/components/DbHealthDashboard.vue';
import EmergencyRecovery from '~/components/EmergencyRecovery.vue';

const securityStore = useSecurityStore();
const { 
  hasSessionKey, 
  currentKeyId, 
  keyAge,
  rotateKey
} = useKeyManager();

const { isDegradedMode, enableDegradedMode, disableDegradedMode } = useAppInit();

const showRecovery = ref(false);
const showDegradedModal = ref(false);

const isUnlocked = computed(() => securityStore.isUnlocked);
const deviceId = ref('');

const keyAgeFormatted = computed(() => {
  if (keyAge.value === 0) return 'N/A';
  const hours = Math.floor(keyAge.value / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} day(s)`;
  return `${hours} hour(s)`;
});

onMounted(() => {
  try {
    deviceId.value = localStorage.getItem('healthbridge_device_id') || 'Unknown';
  } catch {
    deviceId.value = 'Unknown';
  }
});

async function lockDatabase() {
  await securityStore.lock();
}

async function rotateKeyHandler() {
  const result = await rotateKey();
  if (result.success) {
    console.log('[Settings] Key rotated successfully');
  } else {
    console.error('[Settings] Key rotation failed:', result.error);
  }
}

function enableDegradedModeHandler() {
  enableDegradedMode('User enabled from settings');
  showDegradedModal.value = false;
}
</script>

<style scoped>
.settings-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.page-header {
  margin-bottom: 32px;
}

.page-header h1 {
  font-size: 28px;
  margin: 0 0 8px;
}

.page-header p {
  color: #666;
  margin: 0;
}

.settings-section {
  margin-bottom: 32px;
  padding: 24px;
  background: #f8f9fa;
  border-radius: 12px;
}

.settings-section h2 {
  font-size: 18px;
  margin: 0 0 16px;
}

.settings-section p {
  margin: 0 0 16px;
  color: #666;
}

.security-status {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.status-item {
  padding: 16px;
  background: white;
  border-radius: 8px;
  text-align: center;
}

.status-label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.status-value {
  font-size: 16px;
  font-weight: 600;
}

.status-value.active {
  color: #2b8a3e;
}

.status-value.inactive {
  color: #666;
}

.status-value.warning {
  color: #e67700;
}

.status-value.normal {
  color: #2b8a3e;
}

.security-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.key-info {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.info-item {
  padding: 12px;
  background: white;
  border-radius: 8px;
}

.info-label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.info-value {
  font-size: 14px;
  word-break: break-all;
}

.monospace {
  font-family: monospace;
  font-size: 12px;
}

.btn-primary {
  padding: 10px 20px;
  background: #4dabf7;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-secondary {
  padding: 10px 20px;
  background: #e9ecef;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-warning {
  padding: 10px 20px;
  background: #ffc107;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-success {
  padding: 10px 20px;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-danger {
  padding: 10px 20px;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-secondary:disabled,
.btn-warning:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.recovery-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.recovery-container {
  background: white;
  border-radius: 12px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  width: 100%;
  max-width: 900px;
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  z-index: 10;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 32px;
  border-radius: 12px;
  max-width: 400px;
}

.modal-content h3 {
  margin: 0 0 16px;
}

.modal-content ul {
  margin: 0 0 16px;
  padding-left: 20px;
}

.modal-content li {
  margin-bottom: 8px;
}

.modal-actions {
  display: flex;
  gap: 12px;
}
</style>
