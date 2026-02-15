/**
 * Database Diagnostics Composable
 * 
 * Phase 1: Quick Diagnostic Tools
 * Provides reactive diagnostics for encrypted database health monitoring.
 * 
 * Features:
 * - Corrupted document tracking with VueUse reactive storage
 * - Quick diagnostic functions for document analysis
 * - Storage inspection utilities
 * - Integration with existing audit logging
 */

import { computed, ref } from 'vue';
import { useStorage, useTimestamp } from '@vueuse/core';
import { format, formatDistance, isAfter, subMonths, subDays } from 'date-fns';
import { 
  getCorruptedDocuments, 
  clearCorruptedDocuments,
  type CorruptedDocument 
} from '~/services/secureDb';
import { 
  logAuditEvent, 
  logCorruption, 
  logRecovery,
  getRecentAuditEvents,
  logDataExport,
  type AuditEvent 
} from '~/services/auditLogger';

// ============================================
// Types
// ============================================

export interface DiagnosticResult {
  documentId: string;
  encryptedAt: string;
  dateDifference: string;
  isRecent: boolean;
  dataLength: number;
  hasKeyVersion: boolean;
  recoverable: boolean;
  rawPreview: string;
}

export interface DatabaseHealthSummary {
  totalDocuments: number;
  corruptedDocuments: number;
  successRate: number;
  lastSync: Date | null;
  corruptionLevel: 'healthy' | 'warning' | 'critical';
  recentErrors: number;
  uptime: string;
}

// ============================================
// State (VueUse Reactive Storage)
// ============================================

/**
 * Track corrupted documents with VueUse for automatic reactivity
 * Stores: Array of corrupted document metadata
 */
const corruptedDocs = useStorage<CorruptedDocument[]>('healthbridge_corrupted_docs', []);

/**
 * Track diagnostic scan timestamps
 */
const lastScanTimestamp = useStorage<number>('healthbridge_last_diagnostic_scan', 0);

/**
 * Real-time clock for uptime calculations
 */
const nowRef = useTimestamp({ interval: 1000 });
const now = computed(() => nowRef.value);

// ============================================
// Composables
// ============================================

export function useDbDiagnostics() {
  /**
   * Get all tracked corrupted documents
   */
  const corruptedDocumentList = computed(() => corruptedDocs.value);

  /**
   * Count of corrupted documents
   */
  const corruptedCount = computed(() => corruptedDocs.value.length);

  /**
   * Calculate database health summary
   */
  const healthSummary = computed((): DatabaseHealthSummary => {
    const recentErrors = corruptedDocs.value.filter(doc => {
      const docDate = new Date(doc.timestamp);
      const sevenDaysAgo = subDays(new Date(), 7);
      return isAfter(docDate, sevenDaysAgo);
    }).length;

    const successRate = corruptedDocs.value.length > 0 
      ? Math.max(0, 100 - (corruptedDocs.value.length * 0.1)) // Simplified calculation
      : 100;

    let corruptionLevel: 'healthy' | 'warning' | 'critical';
    if (corruptedDocs.value.length === 0) {
      corruptionLevel = 'healthy';
    } else if (corruptedDocs.value.length < 10 && recentErrors < 3) {
      corruptionLevel = 'healthy';
    } else if (corruptedDocs.value.length < 50 && recentErrors < 10) {
      corruptionLevel = 'warning';
    } else {
      corruptionLevel = 'critical';
    }

    return {
      totalDocuments: 0, // Will be populated by caller
      corruptedDocuments: corruptedDocs.value.length,
      successRate: Math.round(successRate),
      lastSync: lastScanTimestamp.value > 0 ? new Date(lastScanTimestamp.value) : null,
      corruptionLevel,
      recentErrors,
      uptime: formatDistance(new Date(lastScanTimestamp.value || Date.now()), new Date(), { addSuffix: false })
    };
  });

  /**
   * Get health score as a number
   */
  function getHealthScore(): number {
    if (corruptedDocs.value.length === 0) return 100;
    if (corruptedDocs.value.length < 10) return Math.max(0, 100 - (corruptedDocs.value.length * 2));
    if (corruptedDocs.value.length < 50) return Math.max(0, 80 - (corruptedDocs.value.length * 1));
    return Math.max(0, 50 - corruptedDocs.value.length);
  }

  /**
   * Get count of corrupted documents
   */
  function getCorruptedCount(): number {
    return corruptedDocs.value.length;
  }

  /**
   * Quick diagnostic function for a single document
   * Analyzes document metadata and determines recoverability
   */
  async function quickDiagnose(documentId: string): Promise<DiagnosticResult | null> {
    try {
      // Get corrupted document info if available
      const corruptedInfo = corruptedDocs.value.find(doc => doc.id === documentId);
      
      if (!corruptedInfo) {
        // Document not in corrupted list - check if it's a valid document
        return {
          documentId,
          encryptedAt: new Date().toISOString(),
          dateDifference: 'Unknown',
          isRecent: true,
          dataLength: 0,
          hasKeyVersion: false,
          recoverable: true,
          rawPreview: 'Document not in corrupted list'
        };
      }

      const encryptedDate = new Date(corruptedInfo.encryptedAt);
      const currentDate = new Date();
      
      const diagnostic: DiagnosticResult = {
        documentId,
        encryptedAt: corruptedInfo.encryptedAt,
        dateDifference: formatDistance(encryptedDate, currentDate, { addSuffix: true }),
        isRecent: isAfter(encryptedDate, subMonths(currentDate, 3)), // Within 3 months
        dataLength: corruptedInfo.error.length || 0,
        hasKeyVersion: false, // Would require document inspection
        recoverable: corruptedInfo.recoverable,
        rawPreview: corruptedInfo.error.substring(0, 200)
      };

      console.log('📊 Document Diagnostic:', diagnostic);
      return diagnostic;
    } catch (error) {
      console.error('❌ Diagnosis failed:', error);
      
      // Log diagnostic failure
      logAuditEvent(
        'security_exception',
        'error',
        'dbDiagnostics',
        { documentId, error: String(error) },
        'failure'
      );
      
      return null;
    }
  }

  /**
   * Run full database diagnostic scan
   * Updates corrupted document tracking and health summary
   */
  async function runFullDiagnostic(): Promise<DatabaseHealthSummary> {
    console.log('[Diagnostics] Starting full database diagnostic scan...');
    
    try {
      // Get corrupted documents from secureDb service
      const existingCorrupted = getCorruptedDocuments();
      
      // Merge with reactive tracking
      if (existingCorrupted.length > 0) {
        const existingIds = new Set(corruptedDocs.value.map(d => d.id));
        const newCorrupted = existingCorrupted.filter(d => !existingIds.has(d.id));
        corruptedDocs.value = [...corruptedDocs.value, ...newCorrupted];
      }

      // Update scan timestamp
      lastScanTimestamp.value = Date.now();

      console.log(`[Diagnostics] Scan complete. Found ${corruptedDocs.value.length} corrupted documents.`);
      
      return healthSummary.value;
    } catch (error) {
      console.error('[Diagnostics] Scan failed:', error);
      
      logAuditEvent(
        'security_exception',
        'error',
        'dbDiagnostics',
        { operation: 'full_diagnostic', error: String(error) },
        'failure'
      );
      
      throw error;
    }
  }

  /**
   * Clear all corrupted document tracking
   * Use with caution - only for confirmed healthy databases
   */
  function clearCorruptedTracking(): void {
    console.warn('[Diagnostics] Clearing corrupted document tracking...');
    
    // Clear reactive storage
    corruptedDocs.value = [];
    
    // Clear service storage
    clearCorruptedDocuments();
    
    // Log the action
    logAuditEvent(
      'configuration_change',
      'warning',
      'dbDiagnostics',
      { operation: 'clear_corrupted_tracking', timestamp: Date.now() },
      'success'
    );
    
    console.info('[Diagnostics] Corrupted tracking cleared.');
  }

  /**
   * Export corrupted documents for analysis
   * Creates downloadable JSON file
   */
  async function exportCorruptedDocuments(): Promise<string> {
    console.log('[Diagnostics] Exporting corrupted documents...');
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      corruptedDocuments: corruptedDocs.value,
      auditEvents: getRecentAuditEvents(10)
    };
    
    // Log the export
    logDataExport('corrupted_docs', corruptedDocs.value.length, true);
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Get diagnostic summary for display
   */
  function getDisplaySummary(): Record<string, unknown> {
    const summary = healthSummary.value;
    
    return {
      status: summary.corruptionLevel.toUpperCase(),
      corruptedDocuments: `${summary.corruptedDocuments} document(s)`,
      successRate: `${summary.successRate}%`,
      lastScan: summary.lastSync 
        ? format(summary.lastSync, 'MMM dd, yyyy HH:mm')
        : 'Never',
      recentErrors: `${summary.recentErrors} in last 7 days`,
      uptime: summary.uptime
    };
  }

  return {
    // State
    corruptedDocumentList,
    corruptedCount,
    healthSummary,
    now,
    
    // Methods
    quickDiagnose,
    runFullDiagnostic,
    clearCorruptedTracking,
    exportCorruptedDocuments,
    getDisplaySummary,
    getHealthScore,
    getCorruptedCount
  };
}

/**
 * Hook for console-based diagnostics (Phase 1.1)
 * Ready-to-use browser console functions
 */
export function useConsoleDiagnostics() {
  /**
   * Check system state - paste into browser console
   */
  function checkSystemState(): void {
    console.log('=== SECURE DB STATUS ===');
    console.log('Current Date:', new Date().toISOString());
    console.log('Timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
    
    // Check storage
    const storageItems: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.includes('healthbridge')) {
        try {
          storageItems[key] = JSON.parse(localStorage.getItem(key) || '');
        } catch {
          storageItems[key] = localStorage.getItem(key);
        }
      }
    }
    console.log('HealthBridge Storage:', storageItems);
  }

  /**
   * Quick document diagnostic - paste into browser console
   */
  async function quickCheck(documentId: string): Promise<void> {
    const { quickDiagnose } = useDbDiagnostics();
    const result = await quickDiagnose(documentId);
    console.log('Diagnostic Result:', result);
  }

  /**
   * Full health check - paste into browser console
   */
  async function fullHealthCheck(): Promise<void> {
    const { runFullDiagnostic, getDisplaySummary } = useDbDiagnostics();
    await runFullDiagnostic();
    console.log('Health Summary:', getDisplaySummary());
  }

  return {
    checkSystemState,
    quickCheck,
    fullHealthCheck
  };
}