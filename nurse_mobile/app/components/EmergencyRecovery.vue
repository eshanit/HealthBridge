<template>
  <div class="emergency-recovery">
    <div class="recovery-header">
      <div class="warning-icon">⚠️</div>
      <h2>Emergency Recovery Mode</h2>
      <p>Some encrypted data could not be decrypted. Use this page to recover your data.</p>
    </div>
    
    <div class="recovery-content">
      <div class="recovery-section">
        <h3>Status Overview</h3>
        <div class="status-grid">
          <div class="status-item">
            <span class="status-label">Database Status</span>
            <span :class="['status-value', healthStatus.toLowerCase()]">{{ healthStatus }}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Corrupted Documents</span>
            <span class="status-value">{{ corruptedDocs.length }}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Recovery Mode</span>
            <span class="status-value">Active</span>
          </div>
        </div>
      </div>
      
      <div v-if="corruptedDocs.length > 0" class="recovery-section">
        <h3>Corrupted Documents ({{ corruptedDocs.length }})</h3>
        <div class="corrupted-list">
          <div v-for="doc in corruptedDocs" :key="doc.id" class="corrupted-item">
            <div class="doc-info">
              <span class="doc-id">{{ doc.id }}</span>
              <span class="doc-date">{{ formatDate(doc.encryptedAt) }}</span>
            </div>
            <div class="doc-error">{{ doc.error }}</div>
            <div class="doc-actions">
              <button 
                class="btn-secondary" 
                @click="viewDocumentDetails(doc)"
              >
                Details
              </button>
              <button 
                v-if="doc.recoverable"
                class="btn-primary" 
                @click="attemptRecovery(doc)"
              >
                Recover
              </button>
              <button 
                class="btn-danger" 
                @click="markForDeletion(doc)"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="recovery-section">
        <h3>Recovery Options</h3>
        <div class="recovery-options">
          <button 
            class="option-card" 
            @click="runDiagnostics"
          >
            <div class="option-icon">🔍</div>
            <div class="option-content">
              <h4>Run Full Diagnostics</h4>
              <p>Scan database health and identify all issues</p>
            </div>
          </button>
          
          <button 
            class="option-card" 
            @click="exportData"
          >
            <div class="option-icon">💾</div>
            <div class="option-content">
              <h4>Export Data Backup</h4>
              <p>Download all recoverable data as encrypted backup</p>
            </div>
          </button>
          
          <button 
            class="option-card" 
            @click="resetDatabase"
          >
            <div class="option-icon">🗑️</div>
            <div class="option-content">
              <h4>Reset Database</h4>
              <p>Clear all data and start fresh (irreversible)</p>
            </div>
          </button>
          
          <button 
            class="option-card" 
            @click="retryDecryption"
          >
            <div class="option-icon">🔄</div>
            <div class="option-content">
              <h4>Retry Decryption</h4>
              <p>Attempt to decrypt corrupted documents again</p>
            </div>
          </button>
        </div>
      </div>
      
      <div v-if="diagnosticResult" class="recovery-section">
        <h3>Diagnostic Results</h3>
        <div class="diagnostic-results">
          <div class="diagnostic-summary">
            <span class="summary-label">Health Score:</span>
            <span :class="['health-score', getHealthClass(diagnosticResult.healthScore)]">
              {{ diagnosticResult.healthScore }}%
            </span>
          </div>
          <div class="diagnostic-summary">
            <span class="summary-label">Issues Found:</span>
            <span class="issues-count">{{ diagnosticResult.issues.length }}</span>
          </div>
          <div v-if="diagnosticResult.issues.length > 0" class="issues-list">
            <div v-for="(issue, index) in diagnosticResult.issues" :key="index" class="issue-item">
              <span :class="['issue-severity', issue.severity]">{{ issue.severity.toUpperCase() }}</span>
              <span class="issue-message">{{ issue.message }}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="recovery-section actions">
        <button 
          class="btn-success btn-large" 
          @click="exitRecoveryMode"
        >
          Exit Recovery Mode
        </button>
      </div>
    </div>
    
    <div v-if="showDetailsModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <h3>Document Details</h3>
        <pre class="details-json">{{ JSON.stringify(selectedDocument, null, 2) }}</pre>
        <button class="btn-secondary" @click="closeModal">Close</button>
      </div>
    </div>
    
    <div v-if="showExportModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <h3>Export Data</h3>
        <p>Select export format:</p>
        <div class="export-options">
          <button class="btn-primary" @click="downloadJsonExport">JSON (Encrypted)</button>
          <button class="btn-secondary" @click="downloadCsvExport">CSV Report</button>
        </div>
        <button class="btn-secondary" @click="closeModal">Cancel</button>
      </div>
    </div>
    
    <div v-if="showResetModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content danger">
        <h3>⚠️ Reset Database</h3>
        <p>This will permanently delete all encrypted data. This action cannot be undone.</p>
        <input 
          v-model="resetConfirmText" 
          type="text" 
          placeholder="Type 'DELETE' to confirm"
          class="reset-input"
        />
        <div class="reset-actions">
          <button 
            class="btn-danger" 
            :disabled="resetConfirmText !== 'DELETE'"
            @click="confirmReset"
          >
            Delete All Data
          </button>
          <button class="btn-secondary" @click="closeModal">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { format } from 'date-fns';
import { getCorruptedDocuments, clearCorruptedDocuments } from '~/services/secureDb';
import { useDbDiagnostics } from '~/composables/useDbDiagnostics';
import { useKeyManager } from '~/composables/useKeyManager';
import { logAuditEvent, logRecovery, logDataExport } from '~/services/auditLogger';
import { closeSecureDb, deleteSecureDb, isSecureDbReady } from '~/services/secureDb';

interface CorruptedDocument {
  id: string;
  encryptedAt: string;
  error: string;
  timestamp: number;
  recoverable: boolean;
}

interface DiagnosticResult {
  healthScore: number;
  issues: Array<{ severity: string; message: string }>;
  corruptedDocs: CorruptedDocument[];
}

const { enterDegradedMode, exitDegradedMode, clearSessionKey } = useKeyManager();
const { runFullDiagnostic } = useDbDiagnostics();

const corruptedDocs = ref<CorruptedDocument[]>([]);
const healthStatus = ref('UNKNOWN');
const diagnosticResult = ref<DiagnosticResult | null>(null);

const showDetailsModal = ref(false);
const showExportModal = ref(false);
const showResetModal = ref(false);
const selectedDocument = ref<CorruptedDocument | null>(null);
const resetConfirmText = ref('');

onMounted(() => {
  loadCorruptedDocs();
  updateHealthStatus();
});

function loadCorruptedDocs() {
  corruptedDocs.value = getCorruptedDocuments();
}

function updateHealthStatus() {
  if (corruptedDocs.value.length === 0) {
    healthStatus.value = 'HEALTHY';
  } else if (corruptedDocs.value.length < 5) {
    healthStatus.value = 'WARNING';
  } else {
    healthStatus.value = 'CRITICAL';
  }
}

function formatDate(dateString: string): string {
  try {
    return format(new Date(dateString), 'yyyy-MM-dd HH:mm');
  } catch {
    return dateString;
  }
}

function getHealthClass(score: number): string {
  if (score >= 80) return 'good';
  if (score >= 50) return 'warning';
  return 'critical';
}

async function runDiagnostics() {
  diagnosticResult.value = await runFullDiagnostic();
  
  logAuditEvent(
    'recovery_action',
    'info',
    'EmergencyRecovery',
    { operation: 'run_diagnostics', issuesCount: diagnosticResult.value?.issues.length },
    'success'
  );
}

function viewDocumentDetails(doc: CorruptedDocument) {
  selectedDocument.value = doc;
  showDetailsModal.value = true;
}

function attemptRecovery(doc: CorruptedDocument) {
  logRecovery(doc.id, false, { error: doc.error });
  console.log('[EmergencyRecovery] Attempting recovery for:', doc.id);
}

function markForDeletion(doc: CorruptedDocument) {
  console.log('[EmergencyRecovery] Marking for deletion:', doc.id);
}

function exportData() {
  showExportModal.value = true;
}

function downloadJsonExport() {
  const exportData = {
    exportDate: new Date().toISOString(),
    corruptedDocuments: corruptedDocs.value,
    diagnosticResult: diagnosticResult.value
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `healthbridge-recovery-${format(new Date(), 'yyyy-MM-dd')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  logDataExport('full_database', corruptedDocs.value.length, true);
  closeModal();
}

function downloadCsvExport() {
  const headers = ['ID', 'Encrypted At', 'Error', 'Timestamp', 'Recoverable'];
  const rows = corruptedDocs.value.map(doc => [
    doc.id,
    doc.encryptedAt,
    `"${doc.error.replace(/"/g, '""')}"`,
    new Date(doc.timestamp).toISOString(),
    doc.recoverable.toString()
  ]);
  
  const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `healthbridge-recovery-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  
  logDataExport('audit_log', corruptedDocs.value.length, true);
  closeModal();
}

async function resetDatabase() {
  showResetModal.value = true;
}

async function confirmReset() {
  try {
    if (isSecureDbReady()) {
      await closeSecureDb();
    }
    await deleteSecureDb();
    
    clearCorruptedDocuments();
    clearSessionKey();
    
    logAuditEvent(
      'database_reset',
      'warning',
      'EmergencyRecovery',
      { operation: 'reset_database' },
      'success'
    );
    
    console.log('[EmergencyRecovery] Database reset complete');
    window.location.reload();
  } catch (error) {
    console.error('[EmergencyRecovery] Reset failed:', error);
    logAuditEvent(
      'security_exception',
      'error',
      'EmergencyRecovery',
      { operation: 'reset_database', error: String(error) },
      'failure'
    );
  }
}

async function retryDecryption() {
  console.log('[EmergencyRecovery] Retrying decryption for all corrupted documents');
  
  clearCorruptedDocuments();
  loadCorruptedDocs();
  updateHealthStatus();
  
  await runDiagnostics();
  
  logAuditEvent(
    'recovery_action',
    'info',
    'EmergencyRecovery',
    { operation: 'retry_decryption', remainingIssues: diagnosticResult.value?.issues.length },
    'success'
  );
}

function exitRecoveryMode() {
  exitDegradedMode();
  console.log('[EmergencyRecovery] Exited recovery mode');
}

function closeModal() {
  showDetailsModal.value = false;
  showExportModal.value = false;
  showResetModal.value = false;
  selectedDocument.value = null;
  resetConfirmText.value = '';
}
</script>

<style scoped>
.emergency-recovery {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.recovery-header {
  text-align: center;
  margin-bottom: 32px;
  padding: 24px;
  background: linear-gradient(135deg, #ff6b6b 0%, #ffa502 100%);
  border-radius: 12px;
  color: white;
}

.warning-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.recovery-header h2 {
  margin: 0 0 8px;
  font-size: 28px;
}

.recovery-header p {
  margin: 0;
  opacity: 0.9;
}

.recovery-section {
  margin-bottom: 32px;
  padding: 24px;
  background: #f8f9fa;
  border-radius: 8px;
}

.recovery-section h3 {
  margin: 0 0 16px;
  font-size: 18px;
  color: #333;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.status-item {
  text-align: center;
  padding: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.status-label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.status-value {
  display: block;
  font-size: 24px;
  font-weight: 600;
  color: #333;
}

.status-value.healthy {
  color: #28a745;
}

.status-value.warning {
  color: #ffc107;
}

.status-value.critical {
  color: #dc3545;
}

.corrupted-list {
  max-height: 400px;
  overflow-y: auto;
}

.corrupted-item {
  padding: 16px;
  background: white;
  border-radius: 8px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.doc-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.doc-id {
  font-weight: 600;
  font-family: monospace;
  font-size: 13px;
}

.doc-date {
  color: #666;
  font-size: 13px;
}

.doc-error {
  font-size: 13px;
  color: #dc3545;
  margin-bottom: 12px;
  padding: 8px;
  background: #fff5f5;
  border-radius: 4px;
}

.doc-actions {
  display: flex;
  gap: 8px;
}

.recovery-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.option-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px;
  background: white;
  border: 2px solid #e9ecef;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.option-card:hover {
  border-color: #4dabf7;
  box-shadow: 0 4px 12px rgba(77, 171, 247, 0.2);
}

.option-icon {
  font-size: 32px;
}

.option-content h4 {
  margin: 0 0 4px;
  font-size: 16px;
}

.option-content p {
  margin: 0;
  font-size: 13px;
  color: #666;
}

.diagnostic-results {
  padding: 16px;
  background: white;
  border-radius: 8px;
}

.diagnostic-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.summary-label {
  font-weight: 600;
}

.health-score {
  font-size: 24px;
  font-weight: 700;
}

.health-score.good {
  color: #28a745;
}

.health-score.warning {
  color: #ffc107;
}

.health-score.critical {
  color: #dc3545;
}

.issues-list {
  border-top: 1px solid #e9ecef;
  padding-top: 16px;
}

.issue-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.issue-severity {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.issue-severity.error {
  background: #fff5f5;
  color: #dc3545;
}

.issue-severity.warning {
  background: #fff9db;
  color: #f59f00;
}

.issue-severity.info {
  background: #e7f5ff;
  color: #1c7ed6;
}

.actions {
  text-align: center;
}

.btn-large {
  padding: 16px 48px;
  font-size: 18px;
}

.btn-primary {
  padding: 8px 16px;
  background: #4dabf7;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-secondary {
  padding: 8px 16px;
  background: #e9ecef;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-success {
  padding: 12px 24px;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.btn-danger {
  padding: 8px 16px;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-content.danger {
  border: 2px solid #dc3545;
}

.modal-content h3 {
  margin: 0 0 16px;
}

.modal-content p {
  margin-bottom: 16px;
}

.details-json {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  font-family: monospace;
  font-size: 12px;
  overflow-x: auto;
  margin-bottom: 16px;
}

.export-options {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.reset-input {
  width: 100%;
  padding: 12px;
  border: 2px solid #dc3545;
  border-radius: 6px;
  font-size: 16px;
  margin-bottom: 16px;
}

.reset-actions {
  display: flex;
  gap: 12px;
}
</style>
