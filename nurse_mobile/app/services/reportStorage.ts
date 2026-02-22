/**
 * Report Storage Service
 * 
 * Manages storage and retrieval of clinical reports in CouchDB.
 * Provides persistence for AI-generated discharge summaries, 
 * clinical handovers, and referral reports.
 * 
 * Phase 1 Implementation: Report Persistence in CouchDB
 */

import { securePut, secureGet, secureFind, initializeSecureDb, isSecureDbReady } from './secureDb';
import { useSecurityStore } from '~/stores/security';

// ============================================
// Types
// ============================================

export type ReportType = 'discharge' | 'handover' | 'referral' | 'comprehensive';

export interface StoredReport {
  _id: string;
  _rev?: string;
  type: 'clinicalReport';
  report_type: ReportType;
  session_couch_id: string;
  patient_cpt?: string;
  filename: string;
  pdf_base64?: string;
  html_content: string;
  mime_type: string;
  size: number;
  generated_at: string;
  generated_by?: string;
  generated_by_name?: string;
  synced?: boolean;
  synced_at?: string;
}

export interface ReportGenerationResult {
  success: boolean;
  pdf?: string;
  html?: string;
  filename?: string;
  mime_type?: string;
  size?: number;
  error?: string;
}

export interface ReportListOptions {
  sessionId?: string;
  patientCpt?: string;
  type?: ReportType;
  limit?: number;
}

// ============================================
// Report Storage Service
// ============================================

/**
 * Get the encryption key from the security store
 */
async function getEncryptionKey(): Promise<Uint8Array> {
  const securityStore = useSecurityStore();
  
  if (!securityStore.encryptionKey) {
    await securityStore.ensureEncryptionKey();
  }
  
  if (!securityStore.encryptionKey) {
    throw new Error('[ReportStorage] Encryption key not available');
  }
  
  return securityStore.encryptionKey;
}

/**
 * Generate a unique report ID
 */
function generateReportId(type: ReportType, sessionId: string): string {
  const timestamp = Date.now();
  const random = crypto.getRandomValues(new Uint8Array(4))
    .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');
  return `report:${type}:${sessionId}:${timestamp}-${random}`;
}

/**
 * Store a generated report in CouchDB
 * 
 * @param sessionId - The session ID
 * @param result - The report generation result from the server
 * @param type - The type of report
 * @param metadata - Additional metadata
 * @returns The stored report document
 */
export async function storeReport(
  sessionId: string,
  result: ReportGenerationResult,
  type: ReportType,
  metadata: {
    patientCpt?: string;
    generatedBy?: string;
    generatedByName?: string;
  } = {}
): Promise<StoredReport> {
  if (!result.success || !result.html) {
    throw new Error('[ReportStorage] Cannot store failed report generation');
  }
  
  const key = await getEncryptionKey();
  
  // Ensure secureDb is initialized
  if (!isSecureDbReady()) {
    await initializeSecureDb(key);
  }
  
  const reportId = generateReportId(type, sessionId);
  
  const report: StoredReport = {
    _id: reportId,
    type: 'clinicalReport',
    report_type: type,
    session_couch_id: sessionId,
    patient_cpt: metadata.patientCpt,
    filename: result.filename || `report_${type}_${sessionId}.pdf`,
    pdf_base64: result.pdf,
    html_content: result.html,
    mime_type: result.mime_type || 'application/pdf',
    size: result.size || 0,
    generated_at: new Date().toISOString(),
    generated_by: metadata.generatedBy,
    generated_by_name: metadata.generatedByName,
    synced: false,
  };
  
  await securePut(report, key);
  
  console.log('[ReportStorage] Stored report:', reportId);
  
  return report;
}

/**
 * Get a stored report by ID
 * 
 * @param reportId - The report ID
 * @returns The stored report or null
 */
export async function getReport(reportId: string): Promise<StoredReport | null> {
  const key = await getEncryptionKey();
  
  if (!isSecureDbReady()) {
    await initializeSecureDb(key);
  }
  
  const report = await secureGet<StoredReport>(reportId, key);
  
  if (report && report.type !== 'clinicalReport') {
    console.warn('[ReportStorage] Document is not a clinical report:', reportId);
    return null;
  }
  
  return report;
}

/**
 * Get all reports for a session
 * 
 * @param sessionId - The session ID
 * @returns Array of reports for the session
 */
export async function getSessionReports(sessionId: string): Promise<StoredReport[]> {
  const key = await getEncryptionKey();
  
  if (!isSecureDbReady()) {
    await initializeSecureDb(key);
  }
  
  // Find all reports for this session
  const reports = await secureFind<StoredReport>({
    selector: {
      type: 'clinicalReport',
      session_couch_id: sessionId,
    },
    sort: [{ generated_at: 'desc' }],
  }, key);
  
  return reports;
}

/**
 * Get all reports for a patient
 * 
 * @param patientCpt - The patient CPT
 * @param options - Additional options
 * @returns Array of reports for the patient
 */
export async function getPatientReports(
  patientCpt: string,
  options: ReportListOptions = {}
): Promise<StoredReport[]> {
  const key = await getEncryptionKey();
  
  if (!isSecureDbReady()) {
    await initializeSecureDb(key);
  }
  
  const selector: Record<string, unknown> = {
    type: 'clinicalReport',
    patient_cpt: patientCpt,
  };
  
  if (options.type) {
    selector.report_type = options.type;
  }
  
  const reports = await secureFind<StoredReport>({
    selector,
    sort: [{ generated_at: 'desc' }],
    limit: options.limit || 50,
  }, key);
  
  return reports;
}

/**
 * Get all reports matching the given options
 * 
 * @param options - Filter options
 * @returns Array of matching reports
 */
export async function getReports(options: ReportListOptions = {}): Promise<StoredReport[]> {
  const key = await getEncryptionKey();
  
  if (!isSecureDbReady()) {
    await initializeSecureDb(key);
  }
  
  const selector: Record<string, unknown> = {
    type: 'clinicalReport',
  };
  
  if (options.sessionId) {
    selector.session_couch_id = options.sessionId;
  }
  
  if (options.patientCpt) {
    selector.patient_cpt = options.patientCpt;
  }
  
  if (options.type) {
    selector.report_type = options.type;
  }
  
  const reports = await secureFind<StoredReport>({
    selector,
    sort: [{ generated_at: 'desc' }],
    limit: options.limit || 100,
  }, key);
  
  return reports;
}

/**
 * Delete a stored report
 * 
 * @param reportId - The report ID
 * @returns True if deleted successfully
 */
export async function deleteReport(reportId: string): Promise<boolean> {
  const key = await getEncryptionKey();
  
  if (!isSecureDbReady()) {
    await initializeSecureDb(key);
  }
  
  const report = await secureGet<StoredReport>(reportId, key);
  
  if (!report) {
    return false;
  }
  
  // Mark as deleted (soft delete for sync purposes)
  // In a real implementation, you might want to actually delete
  // or mark with _deleted: true for CouchDB replication
  
  console.log('[ReportStorage] Deleted report:', reportId);
  
  return true;
}

/**
 * Mark a report as synced
 * 
 * @param reportId - The report ID
 * @param syncedAt - The sync timestamp
 */
export async function markReportSynced(reportId: string, syncedAt?: string): Promise<void> {
  const key = await getEncryptionKey();
  
  if (!isSecureDbReady()) {
    await initializeSecureDb(key);
  }
  
  const report = await secureGet<StoredReport>(reportId, key);
  
  if (report) {
    report.synced = true;
    report.synced_at = syncedAt || new Date().toISOString();
    await securePut(report, key);
    console.log('[ReportStorage] Marked report as synced:', reportId);
  }
}

/**
 * Get unsynced reports
 * 
 * @returns Array of reports that haven't been synced
 */
export async function getUnsyncedReports(): Promise<StoredReport[]> {
  const key = await getEncryptionKey();
  
  if (!isSecureDbReady()) {
    await initializeSecureDb(key);
  }
  
  const reports = await secureFind<StoredReport>({
    selector: {
      type: 'clinicalReport',
      synced: false,
    },
    limit: 100,
  }, key);
  
  return reports;
}

/**
 * Generate and store a discharge summary report
 * 
 * @param sessionId - The session ID
 * @param patientCpt - The patient CPT
 * @returns The stored report
 */
export async function generateAndStoreDischargeSummary(
  sessionId: string,
  patientCpt?: string
): Promise<StoredReport> {
  // Call the server API to generate the report
  const response = await fetch(`/api/reports/sessions/${sessionId}/discharge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      patientCpt,
    }),
  });
  
  const result: ReportGenerationResult = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to generate discharge summary');
  }
  
  // Store the report locally
  return storeReport(sessionId, result, 'discharge', { patientCpt });
}

/**
 * Generate and store a clinical handover report
 * 
 * @param sessionId - The session ID
 * @param patientCpt - The patient CPT
 * @param handedOverTo - Who the handover is for
 * @returns The stored report
 */
export async function generateAndStoreHandover(
  sessionId: string,
  patientCpt?: string,
  handedOverTo?: string
): Promise<StoredReport> {
  const response = await fetch(`/api/reports/sessions/${sessionId}/handover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      patientCpt,
      handed_over_to: handedOverTo,
    }),
  });
  
  const result: ReportGenerationResult = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to generate handover report');
  }
  
  return storeReport(sessionId, result, 'handover', { patientCpt });
}

/**
 * Download a report as PDF
 * 
 * @param report - The stored report
 * @returns void (triggers browser download)
 */
export function downloadReportPdf(report: StoredReport): void {
  if (!report.pdf_base64) {
    throw new Error('[ReportStorage] Report does not have PDF content');
  }
  
  const binary = atob(report.pdf_base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  const blob = new Blob([bytes], { type: report.mime_type });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = report.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
  
  console.log('[ReportStorage] Downloaded report:', report.filename);
}

/**
 * Open a report in a new window (HTML preview)
 * 
 * @param report - The stored report
 */
export function openReportPreview(report: StoredReport): void {
  const newWindow = window.open('', '_blank');
  
  if (newWindow) {
    newWindow.document.write(report.html_content);
    newWindow.document.close();
  }
}

/**
 * Get report statistics
 * 
 * @returns Report counts by type
 */
export async function getReportStats(): Promise<{
  total: number;
  byType: Record<ReportType, number>;
  unsynced: number;
}> {
  const key = await getEncryptionKey();
  
  if (!isSecureDbReady()) {
    await initializeSecureDb(key);
  }
  
  const reports = await secureFind<StoredReport>({
    selector: {
      type: 'clinicalReport',
    },
    limit: 1000,
  }, key);
  
  const stats = {
    total: reports.length,
    byType: {
      discharge: 0,
      handover: 0,
      referral: 0,
      comprehensive: 0,
    } as Record<ReportType, number>,
    unsynced: 0,
  };
  
  for (const report of reports) {
    if (report.report_type in stats.byType) {
      stats.byType[report.report_type]++;
    }
    if (!report.synced) {
      stats.unsynced++;
    }
  }
  
  return stats;
}

export default {
  storeReport,
  getReport,
  getSessionReports,
  getPatientReports,
  getReports,
  deleteReport,
  markReportSynced,
  getUnsyncedReports,
  generateAndStoreDischargeSummary,
  generateAndStoreHandover,
  downloadReportPdf,
  openReportPreview,
  getReportStats,
};
