<template>
  <div class="admin-dashboard">
    <div class="dashboard-header">
      <h1>🔐 Admin Dashboard</h1>
      <p>Security management and monitoring</p>
      
      <!-- Phase 3: Analytics Navigation -->
      <div class="header-actions">
        <NuxtLink to="/admin/analytics" class="btn-analytics">
          📊 View Analytics
        </NuxtLink>
      </div>
    </div>

    <div class="dashboard-content">
      <!-- Key Management Section -->
      <div class="section">
        <h2>Key Management</h2>
        <div class="key-status-card">
          <div class="status-row">
            <span class="label">Current Key ID</span>
            <span class="value monospace">{{ keyStatus.currentVersion?.keyId || 'N/A' }}</span>
          </div>
          <div class="status-row">
            <span class="label">Key Version</span>
            <span class="value">{{ keyStatus.currentVersion?.version || 'N/A' }}</span>
          </div>
          <div class="status-row">
            <span class="label">Key Age</span>
            <span class="value">{{ keyAgeText }}</span>
          </div>
          <div class="status-row">
            <span class="label">Days Until Rotation</span>
            <span :class="['value', keyStatus.daysUntilRotation < 7 ? 'warning' : '']">
              {{ keyStatus.daysUntilRotation }} days
            </span>
          </div>
          <div class="status-row">
            <span class="label">Operations Until Rotation</span>
            <span class="value">{{ keyStatus.operationsUntilRotation }}</span>
          </div>
        </div>

        <div class="actions-row">
          <button class="btn-primary" @click="rotateKey" :disabled="rotating">
            {{ rotating ? 'Rotating...' : '🔄 Rotate Key Now' }}
          </button>
          <button class="btn-secondary" @click="backupKey">
            💾 Backup Key
          </button>
        </div>

        <div class="version-history">
          <h3>Key Version History</h3>
          <div class="version-list">
            <div 
              v-for="version in keyVersions" 
              :key="version.keyId"
              class="version-item"
              :class="{ active: version.isActive }"
            >
              <div class="version-info">
                <span class="version-badge">{{ version.version }}</span>
                <span class="version-date">{{ formatDate(version.rotatedAt) }}</span>
                <span class="version-type">{{ version.rotatedBy }}</span>
              </div>
              <span :class="['status-badge', version.isActive ? 'active' : 'inactive']">
                {{ version.isActive ? 'Active' : 'Inactive' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Document Integrity Section -->
      <div class="section">
        <h2>Document Integrity</h2>
        <div class="integrity-stats">
          <div class="stat-card">
            <span class="stat-value">{{ checksumStatus.totalDocuments }}</span>
            <span class="stat-label">Tracked Documents</span>
          </div>
          <div class="stat-card success">
            <span class="stat-value">{{ checksumStatus.verifiedDocuments }}</span>
            <span class="stat-label">Verified (24h)</span>
          </div>
          <div class="stat-card danger">
            <span class="stat-value">{{ checksumStatus.failedDocuments }}</span>
            <span class="stat-label">Failed</span>
          </div>
        </div>

        <div class="actions-row">
          <button class="btn-primary" @click="verifyAllDocuments">
            ✅ Verify All Documents
          </button>
          <button class="btn-secondary" @click="clearChecksumData">
            🗑️ Clear Checksum Data
          </button>
        </div>
      </div>

      <!-- Cross-Device Sync Section -->
      <div class="section">
        <h2>Cross-Device Sync</h2>
        <div class="sync-status">
          <div class="sync-indicator" :class="{ online: syncStatus.isOnline }">
            <span class="status-dot"></span>
            {{ syncStatus.isOnline ? 'Online' : 'Offline' }}
          </div>
          <div class="sync-stats">
            <span>{{ syncStatus.pairedDevices }} Paired Devices</span>
            <span>{{ syncStatus.pendingTransfers }} Pending Transfers</span>
          </div>
        </div>

        <div class="paired-devices">
          <h3>Paired Devices</h3>
          <div class="device-list">
            <div 
              v-for="device in pairedDevices" 
              :key="device.deviceId"
              class="device-item"
            >
              <div class="device-info">
                <span class="device-icon">{{ getDeviceIcon(device.deviceType) }}</span>
                <div class="device-details">
                  <span class="device-name">{{ device.deviceName }}</span>
                  <span class="device-id monospace">{{ device.deviceId }}</span>
                </div>
              </div>
              <div class="device-meta">
                <span class="last-sync">{{ device.lastSync ? formatDate(device.lastSync) : 'Never' }}</span>
                <button class="btn-danger btn-small" @click="unpairDevice(device.deviceId)">
                  Unpair
                </button>
              </div>
            </div>
            <div v-if="pairedDevices.length === 0" class="empty-state">
              No devices paired yet
            </div>
          </div>
        </div>

        <div class="actions-row">
          <button class="btn-primary" @click="syncKeysToDevices">
            🔄 Sync Keys to All Devices
          </button>
          <button class="btn-secondary" @click="showPairModal = true">
            ➕ Pair New Device
          </button>
        </div>
      </div>

      <!-- Audit Log Section -->
      <div class="section">
        <h2>Recent Audit Events</h2>
        <div class="audit-list">
          <div 
            v-for="event in recentAuditEvents" 
            :key="event.id"
            class="audit-item"
            :class="event.severity"
          >
            <div class="audit-header">
              <span class="audit-type">{{ formatEventType(event.eventType) }}</span>
              <span class="audit-time">{{ formatTime(event.timestamp) }}</span>
            </div>
            <div class="audit-details">{{ event.details }}</div>
            <span :class="['audit-outcome', event.outcome]">{{ event.outcome }}</span>
          </div>
          <div v-if="recentAuditEvents.length === 0" class="empty-state">
            No recent audit events
          </div>
        </div>

        <div class="actions-row">
          <button class="btn-secondary" @click="exportAuditLog">
            📥 Export Audit Log
          </button>
          <button class="btn-danger" @click="clearAuditLog">
            🗑️ Clear Audit Log
          </button>
        </div>
      </div>

      <!-- Phase 4: AI Safety Controls Section -->
      <div class="section ai-safety-section">
        <h2>🤖 AI Safety Controls</h2>
        <p class="section-description">
          Emergency controls for MedGemma AI system. Use these to disable or restrict AI functionality 
          across all sessions when safety concerns arise.
        </p>

        <div class="ai-controls-grid">
          <!-- Master Kill Switch -->
          <div class="control-card" :class="{ disabled: aiControls.aiDisabled }">
            <div class="control-header">
              <span class="control-icon">🛑</span>
              <div class="control-title">
                <h3>Master Kill Switch</h3>
                <span class="control-status" :class="aiControls.aiDisabled ? 'danger' : 'success'">
                  {{ aiControls.aiDisabled ? 'DISABLED' : 'ACTIVE' }}
                </span>
              </div>
            </div>
            <p class="control-description">
              Completely disable all AI suggestions. Use in emergency situations.
            </p>
            <button 
              class="btn-control"
              :class="aiControls.aiDisabled ? 'btn-enable' : 'btn-danger'"
              @click="toggleAIKillSwitch"
            >
              {{ aiControls.aiDisabled ? '✅ Re-enable AI' : '🛑 Disable AI' }}
            </button>
          </div>

          <!-- Explanations Only Mode -->
          <div class="control-card" :class="{ active: aiControls.explanationsOnly }">
            <div class="control-header">
              <span class="control-icon">📖</span>
              <div class="control-title">
                <h3>Explanations Only</h3>
                <span class="control-status" :class="aiControls.explanationsOnly ? 'warning' : 'neutral'">
                  {{ aiControls.explanationsOnly ? 'RESTRICTED' : 'NORMAL' }}
                </span>
              </div>
            </div>
            <p class="control-description">
              Restrict AI to only provide explanations, no treatment suggestions.
            </p>
            <button 
              class="btn-control"
              :class="aiControls.explanationsOnly ? 'btn-primary' : 'btn-secondary'"
              @click="toggleExplanationsOnly"
            >
              {{ aiControls.explanationsOnly ? '✓ Active' : 'Enable' }}
            </button>
          </div>

          <!-- Force Referral Mode -->
          <div class="control-card" :class="{ active: aiControls.forceReferral }">
            <div class="control-header">
              <span class="control-icon">🏥</span>
              <div class="control-title">
                <h3>Force Referral Mode</h3>
                <span class="control-status" :class="aiControls.forceReferral ? 'warning' : 'neutral'">
                  {{ aiControls.forceReferral ? 'ENFORCED' : 'NORMAL' }}
                </span>
              </div>
            </div>
            <p class="control-description">
              AI will always recommend facility referral regardless of assessment.
            </p>
            <button 
              class="btn-control"
              :class="aiControls.forceReferral ? 'btn-primary' : 'btn-secondary'"
              @click="toggleForceReferral"
            >
              {{ aiControls.forceReferral ? '✓ Active' : 'Enable' }}
            </button>
          </div>

          <!-- Risk Threshold -->
          <div class="control-card">
            <div class="control-header">
              <span class="control-icon">⚠️</span>
              <div class="control-title">
                <h3>Risk Threshold</h3>
                <span class="control-status neutral">
                  Level: {{ aiControls.riskThreshold }}
                </span>
              </div>
            </div>
            <p class="control-description">
              Block AI responses when risk score exceeds threshold (0-10).
            </p>
            <div class="threshold-control">
              <input 
                type="range" 
                min="0" 
                max="10" 
                v-model.number="aiControls.riskThreshold"
                @change="updateRiskThreshold"
                class="threshold-slider"
              />
              <div class="threshold-labels">
                <span>Permissive (0)</span>
                <span>Strict (10)</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Session Escalation Stats -->
        <div class="escalation-stats">
          <h3>Session Escalation Status</h3>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-value">{{ escalationStats.activeSessions }}</span>
              <span class="stat-label">Active Sessions</span>
            </div>
            <div class="stat-item warning">
              <span class="stat-value">{{ escalationStats.warningSessions }}</span>
              <span class="stat-label">Warning (1-2)</span>
            </div>
            <div class="stat-item danger">
              <span class="stat-value">{{ escalationStats.escalatedSessions }}</span>
              <span class="stat-label">Escalated (3+)</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ escalationStats.totalWarnings }}</span>
              <span class="stat-label">Total Warnings</span>
            </div>
          </div>
        </div>

        <!-- Emergency Actions -->
        <div class="emergency-actions">
          <h3>⚠️ Emergency Actions</h3>
          <div class="actions-row">
            <button class="btn-danger" @click="resetAllSessions">
              🔄 Reset All Session Warnings
            </button>
            <button class="btn-danger" @click="lockdownAI">
              🔒 Emergency Lockdown (Disable + Referral)
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Pair Device Modal -->
    <div v-if="showPairModal" class="modal-overlay" @click.self="showPairModal = false">
      <div class="modal-content">
        <h3>Pair New Device</h3>
        
        <div class="form-group">
          <label>Device Name</label>
          <input v-model="newDevice.name" type="text" placeholder="e.g., My Tablet" />
        </div>
        
        <div class="form-group">
          <label>Device Type</label>
          <select v-model="newDevice.type">
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
            <option value="tablet">Tablet</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>Device Public Key</label>
          <textarea 
            v-model="newDevice.publicKey" 
            placeholder="Paste the device's public key here"
            rows="4"
          ></textarea>
        </div>
        
        <div class="modal-actions">
          <button class="btn-primary" @click="pairNewDevice" :disabled="pairing">
            {{ pairing ? 'Pairing...' : 'Pair Device' }}
          </button>
          <button class="btn-secondary" @click="showPairModal = false">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { format, formatDistanceToNow } from 'date-fns';
import { getKeyVersions, getKeyRotationStatus, rotateAndMigrate, clearKeyRotationData } from '~/services/keyRotation';
import { 
  getChecksumStatus, 
  verifyAllChecksums, 
  clearChecksumData,
  exportChecksums 
} from '~/services/documentChecksum';
import { 
  getPairedDevices, 
  unpairDevice, 
  getSyncStatus, 
  initiateKeySync,
  pairDevice,
  exportSyncData,
  clearSyncData,
  getDeviceId,
  storeLocalPublicKey
} from '~/services/keySync';
import { getRecentAuditEvents, exportAuditLog as exportAudit, clearAuditLog as clearAudit } from '~/services/auditLogger';

interface KeyVersion {
  keyId: string;
  version: number;
  createdAt: number;
  rotatedAt: number;
  rotatedBy: string;
  keyHash: string;
  isActive: boolean;
}

interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  publicKey: string;
  pairedAt: number;
  lastSync: number | null;
  isActive: boolean;
}

interface AuditEvent {
  id: string;
  timestamp: number;
  eventType: string;
  severity: string;
  details: Record<string, unknown>;
  outcome: string;
}

// State
const keyStatus = ref<{
  shouldRotate: boolean;
  currentVersion: KeyVersion | null;
  daysUntilRotation: number;
  operationsUntilRotation: number;
}>({
  shouldRotate: false,
  currentVersion: null,
  daysUntilRotation: 0,
  operationsUntilRotation: 0
});

const checksumStatus = ref<{
  totalDocuments: number;
  verifiedDocuments: number;
  failedDocuments: number;
  lastVerification: number | null;
}>({
  totalDocuments: 0,
  verifiedDocuments: 0,
  failedDocuments: 0,
  lastVerification: null
});

const syncStatus = ref<{
  isOnline: boolean;
  lastSyncTime: number | null;
  pendingTransfers: number;
  pairedDevices: number;
}>({
  isOnline: false,
  lastSyncTime: null,
  pendingTransfers: 0,
  pairedDevices: 0
});

const keyVersions = ref<KeyVersion[]>([]);
const pairedDevices = ref<DeviceInfo[]>([]);
const recentAuditEvents = ref<AuditEvent[]>([]);

const rotating = ref(false);
const pairing = ref(false);
const showPairModal = ref(false);

const newDevice = ref({
  name: '',
  type: 'mobile' as 'mobile' | 'desktop' | 'tablet',
  publicKey: ''
});

// Phase 4: AI Safety Controls State
const aiControls = ref({
  aiDisabled: false,
  explanationsOnly: false,
  forceReferral: false,
  riskThreshold: 7
});

const escalationStats = ref({
  activeSessions: 0,
  warningSessions: 0,
  escalatedSessions: 0,
  totalWarnings: 0
});

onMounted(() => {
  refreshAllData();
  loadAIControls();
});

function refreshAllData() {
  keyStatus.value = getKeyRotationStatus();
  keyVersions.value = getKeyVersions();
  checksumStatus.value = getChecksumStatus();
  syncStatus.value = getSyncStatus();
  pairedDevices.value = getPairedDevices();
  recentAuditEvents.value = getRecentAuditEvents(20).reverse();
}

const keyAgeText = computed(() => {
  if (!keyStatus.value.currentVersion) return 'N/A';
  const age = Date.now() - keyStatus.value.currentVersion.rotatedAt;
  return formatDistanceToNow(age, { addSuffix: true });
});

function formatDate(timestamp: number): string {
  return format(new Date(timestamp), 'MMM dd, yyyy HH:mm');
}

function formatTime(timestamp: number): string {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
}

function formatEventType(eventType: string): string {
  return eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getDeviceIcon(type: string): string {
  switch (type) {
    case 'mobile': return '📱';
    case 'desktop': return '🖥️';
    case 'tablet': return '📟';
    default: return '💻';
  }
}

async function rotateKey() {
  rotating.value = true;
  try {
    const { getSessionKey } = await import('~/composables/useKeyManager');
    const currentKey = getSessionKey();
    
    if (currentKey) {
      // Generate a new key
      const newKey = crypto.getRandomValues(new Uint8Array(32));
      
      await rotateAndMigrate(currentKey, newKey, async (doc, key) => {
        const { securePut } = await import('~/services/secureDb');
        await securePut(doc as { _id: string; _rev?: string }, key);
      });
      
      refreshAllData();
      console.log('[AdminDashboard] Key rotation complete');
    }
  } catch (error) {
    console.error('[AdminDashboard] Key rotation failed:', error);
  } finally {
    rotating.value = false;
  }
}

function backupKey() {
  console.log('[AdminDashboard] Key backup initiated');
  const data = exportSyncData();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `healthbridge-key-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function verifyAllDocuments() {
  const { secureAllDocs } = await import('~/services/secureDb');
  const { getSessionKey } = await import('~/composables/useKeyManager');
  
  const key = getSessionKey();
  if (!key) return;
  
  const docs = await secureAllDocs(key);
  const results = await verifyAllChecksums(docs);
  
  console.log('[AdminDashboard] Verification complete:', results);
  refreshAllData();
  
  alert(`Verified: ${results.verified}, Failed: ${results.failed}`);
}

function clearChecksumData() {
  if (confirm('Clear all checksum data?')) {
    clearChecksumData();
    refreshAllData();
  }
}

async function syncKeysToDevices() {
  const { getSessionKey } = await import('~/composables/useKeyManager');
  const key = getSessionKey();
  
  if (key) {
    const result = await initiateKeySync(key);
    console.log('[AdminDashboard] Sync result:', result);
    alert(`Synced to ${result.transferredTo.length} devices, failed: ${result.failedDevices.length}`);
    refreshAllData();
  }
}

async function pairNewDevice() {
  if (!newDevice.value.name || !newDevice.value.publicKey) {
    alert('Please fill in all fields');
    return;
  }
  
  pairing.value = true;
  try {
    const deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await pairDevice(
      deviceId,
      newDevice.value.name,
      newDevice.value.type,
      newDevice.value.publicKey
    );
    
    showPairModal.value = false;
    newDevice.value = { name: '', type: 'mobile', publicKey: '' };
    refreshAllData();
  } catch (error) {
    console.error('[AdminDashboard] Pairing failed:', error);
  } finally {
    pairing.value = false;
  }
}

function unpairDevice(deviceId: string) {
  if (confirm('Unpair this device?')) {
    unpairDevice(deviceId);
    refreshAllData();
  }
}

function exportAuditLog() {
  const data = exportAudit();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `healthbridge-audit-log-${format(new Date(), 'yyyy-MM-dd')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearAuditLog() {
  if (confirm('Clear all audit logs? This cannot be undone.')) {
    clearAudit();
    refreshAllData();
  }
}

// Phase 4: AI Safety Control Functions
function toggleAIKillSwitch() {
  aiControls.value.aiDisabled = !aiControls.value.aiDisabled;
  saveAIControls();
  console.log('[AdminDashboard] AI Kill Switch:', aiControls.value.aiDisabled ? 'DISABLED' : 'ENABLED');
}

function toggleExplanationsOnly() {
  aiControls.value.explanationsOnly = !aiControls.value.explanationsOnly;
  saveAIControls();
  console.log('[AdminDashboard] Explanations Only Mode:', aiControls.value.explanationsOnly ? 'ENABLED' : 'DISABLED');
}

function toggleForceReferral() {
  aiControls.value.forceReferral = !aiControls.value.forceReferral;
  saveAIControls();
  console.log('[AdminDashboard] Force Referral Mode:', aiControls.value.forceReferral ? 'ENABLED' : 'DISABLED');
}

function updateRiskThreshold() {
  saveAIControls();
  console.log('[AdminDashboard] Risk Threshold updated to:', aiControls.value.riskThreshold);
}

function saveAIControls() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('healthbridge_ai_controls', JSON.stringify(aiControls.value));
  }
}

function loadAIControls() {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('healthbridge_ai_controls');
    if (saved) {
      try {
        aiControls.value = JSON.parse(saved);
      } catch (e) {
        console.error('[AdminDashboard] Failed to load AI controls:', e);
      }
    }
  }
}

function resetAllSessions() {
  if (confirm('Reset all session warning counts? This will re-enable AI for escalated sessions.')) {
    // Clear session escalation data
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('healthbridge_session_warnings');
    }
    escalationStats.value = {
      activeSessions: 0,
      warningSessions: 0,
      escalatedSessions: 0,
      totalWarnings: 0
    };
    console.log('[AdminDashboard] All session warnings reset');
  }
}

function lockdownAI() {
  if (confirm('EMERGENCY LOCKDOWN: This will disable AI and force referral mode. Continue?')) {
    aiControls.value.aiDisabled = true;
    aiControls.value.forceReferral = true;
    saveAIControls();
    console.log('[AdminDashboard] EMERGENCY LOCKDOWN activated');
  }
}
</script>

<style scoped>
.admin-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.dashboard-header {
  margin-bottom: 32px;
}

.dashboard-header h1 {
  font-size: 28px;
  margin: 0 0 8px;
}

.dashboard-header p {
  color: #666;
  margin: 0;
}

.section {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
}

.section h2 {
  font-size: 18px;
  margin: 0 0 16px;
}

.section h3 {
  font-size: 14px;
  color: #666;
  margin: 16px 0 12px;
}

.key-status-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.status-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #e9ecef;
}

.status-row:last-child {
  border-bottom: none;
}

.status-row .label {
  color: #666;
}

.status-row .value {
  font-weight: 500;
}

.status-row .value.warning {
  color: #e67700;
}

.monospace {
  font-family: monospace;
  font-size: 12px;
}

.actions-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.integrity-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}

.stat-card.success .stat-value {
  color: #2b8a3e;
}

.stat-card.danger .stat-value {
  color: #c92a2a;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
}

.stat-label {
  font-size: 12px;
  color: #666;
}

.sync-status {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.sync-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: white;
  border-radius: 20px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #dc3545;
}

.sync-indicator.online .status-dot {
  background: #2b8a3e;
}

.sync-stats {
  display: flex;
  gap: 16px;
  color: #666;
  font-size: 14px;
}

.device-list {
  margin-bottom: 16px;
}

.device-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: white;
  border-radius: 8px;
  margin-bottom: 8px;
}

.device-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.device-icon {
  font-size: 24px;
}

.device-details {
  display: flex;
  flex-direction: column;
}

.device-name {
  font-weight: 500;
}

.device-id {
  font-size: 11px;
  color: #666;
}

.device-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.last-sync {
  font-size: 12px;
  color: #666;
}

.audit-list {
  margin-bottom: 16px;
}

.audit-item {
  padding: 12px;
  background: white;
  border-radius: 8px;
  margin-bottom: 8px;
  border-left: 4px solid #e9ecef;
}

.audit-item.info {
  border-left-color: #4dabf7;
}

.audit-item.warning {
  border-left-color: #ffc107;
}

.audit-item.error {
  border-left-color: #dc3545;
}

.audit-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.audit-type {
  font-weight: 500;
  font-size: 13px;
}

.audit-time {
  font-size: 12px;
  color: #666;
}

.audit-details {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.audit-outcome {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.audit-outcome.success {
  background: #d3f9d8;
  color: #2b8a3e;
}

.audit-outcome.failure {
  background: #ffe3e3;
  color: #c92a2a;
}

.version-list {
  background: white;
  border-radius: 8px;
  overflow: hidden;
}

.version-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #e9ecef;
}

.version-item:last-child {
  border-bottom: none;
}

.version-item.active {
  background: #f0f9ff;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.version-badge {
  background: #4dabf7;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.version-date {
  font-size: 13px;
}

.version-type {
  font-size: 11px;
  color: #666;
  text-transform: uppercase;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.status-badge.active {
  background: #d3f9d8;
  color: #2b8a3e;
}

.status-badge.inactive {
  background: #e9ecef;
  color: #666;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: #666;
  background: white;
  border-radius: 8px;
}

.btn-primary, .btn-secondary, .btn-danger {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-primary {
  background: #4dabf7;
  color: white;
}

.btn-secondary {
  background: #e9ecef;
  color: #333;
}

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn-primary:disabled, .btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-small {
  padding: 4px 12px;
  font-size: 12px;
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
  width: 90%;
}

.modal-content h3 {
  margin: 0 0 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  color: #666;
  margin-bottom: 4px;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  font-size: 14px;
}

.form-group textarea {
  resize: vertical;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

/* Phase 4: AI Safety Controls Styles */
.ai-safety-section {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: #fff;
}

.ai-safety-section h2 {
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 12px;
}

.ai-safety-section h3 {
  color: rgba(255, 255, 255, 0.8);
}

.section-description {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  margin-bottom: 20px;
}

.ai-controls-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.control-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  transition: all 0.3s ease;
}

.control-card.disabled {
  border-color: #dc3545;
  background: rgba(220, 53, 69, 0.1);
}

.control-card.active {
  border-color: #ffc107;
  background: rgba(255, 193, 7, 0.1);
}

.control-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.control-icon {
  font-size: 24px;
}

.control-title h3 {
  font-size: 14px;
  margin: 0 0 4px;
  color: #fff;
}

.control-status {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.control-status.success {
  background: rgba(40, 167, 69, 0.2);
  color: #28a745;
}

.control-status.danger {
  background: rgba(220, 53, 69, 0.2);
  color: #dc3545;
}

.control-status.warning {
  background: rgba(255, 193, 7, 0.2);
  color: #ffc107;
}

.control-status.neutral {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
}

.control-description {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 12px;
  line-height: 1.4;
}

.btn-control {
  width: 100%;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  font-size: 13px;
  transition: all 0.2s ease;
}

.btn-enable {
  background: #28a745;
  color: white;
}

.btn-enable:hover {
  background: #218838;
}

.threshold-control {
  margin-top: 8px;
}

.threshold-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.1);
  outline: none;
  -webkit-appearance: none;
}

.threshold-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #4dabf7;
  cursor: pointer;
}

.threshold-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 4px;
}

.escalation-stats {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.escalation-stats h3 {
  margin: 0 0 12px;
  font-size: 14px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat-item {
  text-align: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.stat-item .stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
}

.stat-item .stat-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.stat-item.warning .stat-value {
  color: #ffc107;
}

.stat-item.danger .stat-value {
  color: #dc3545;
}

.emergency-actions {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 16px;
}

.emergency-actions h3 {
  color: #dc3545;
  margin-bottom: 12px;
}

.header-actions {
  margin-top: 16px;
}

.btn-analytics {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: #4dabf7;
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 500;
  transition: background 0.2s ease;
}

.btn-analytics:hover {
  background: #3d8bd4;
}

@media (max-width: 768px) {
  .ai-controls-grid {
    grid-template-columns: 1fr;
  }
  
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
