/**
 * Document Checksum Service
 * 
 * Provides document integrity verification using SHA-256 checksums.
 * Features:
 * - Generate checksums for document content
 * - Verify document integrity on read
 * - Track checksum failures
 * - Support for offline verification
 */

export interface DocumentChecksum {
  documentId: string;
  checksum: string;
  calculatedAt: number;
  documentVersion: number;
}

export interface ChecksumResult {
  valid: boolean;
  storedChecksum: string;
  calculatedChecksum: string;
  documentVersion: number;
  timestamp: number;
}

export interface ChecksumStatus {
  totalDocuments: number;
  verifiedDocuments: number;
  failedDocuments: number;
  lastVerification: number | null;
}

const CHECKSUMS_KEY = 'healthbridge_document_checksums';
const MAX_CHECKSUMS = 1000;

export async function calculateChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  
  return Array.from(hashArray, b => b.toString(16).padStart(2, '0')).join('');
}

export async function calculateObjectChecksum(obj: Record<string, unknown>): Promise<string> {
  const sortedJson = JSON.stringify(obj, Object.keys(obj).sort());
  return calculateChecksum(sortedJson);
}

export function getStoredChecksums(): DocumentChecksum[] {
  try {
    return JSON.parse(localStorage.getItem(CHECKSUMS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveChecksums(checksums: DocumentChecksum[]): void {
  // Keep only the most recent checksums
  const trimmed = checksums.slice(-MAX_CHECKSUMS);
  localStorage.setItem(CHECKSUMS_KEY, JSON.stringify(trimmed));
}

export function storeChecksum(
  documentId: string,
  checksum: string,
  documentVersion: number = 1
): void {
  const checksums = getStoredChecksums();
  
  // Remove existing checksum for this document
  const filtered = checksums.filter(c => c.documentId !== documentId);
  
  // Add new checksum
  filtered.push({
    documentId,
    checksum,
    calculatedAt: Date.now(),
    documentVersion
  });
  
  saveChecksums(filtered);
}

export function getStoredChecksum(documentId: string): DocumentChecksum | null {
  const checksums = getStoredChecksums();
  return checksums.find(c => c.documentId === documentId) || null;
}

export async function verifyChecksum(
  documentId: string,
  currentData: Record<string, unknown>
): Promise<ChecksumResult> {
  const stored = getStoredChecksum(documentId);
  const currentChecksum = await calculateObjectChecksum(currentData);
  
  const result: ChecksumResult = {
    valid: false,
    storedChecksum: stored?.checksum || '',
    calculatedChecksum: currentChecksum,
    documentVersion: stored?.documentVersion || 1,
    timestamp: Date.now()
  };
  
  if (stored && stored.checksum === currentChecksum) {
    result.valid = true;
  } else if (stored) {
    // Document has been modified
    console.warn(`[Checksum] Document ${documentId} checksum mismatch`);
    logChecksumEvent(documentId, 'mismatch', stored.checksum, currentChecksum);
  }
  
  return result;
}

export async function verifyAllChecksums(
  documents: Array<{ _id: string; _rev?: string } & Record<string, unknown>>
): Promise<{ verified: number; failed: number; failures: Array<{ id: string; error: string }> }> {
  const results = {
    verified: 0,
    failed: 0,
    failures: [] as Array<{ id: string; error: string }>
  };
  
  for (const doc of documents) {
    const result = await verifyChecksum(doc._id, doc);
    
    if (result.valid) {
      results.verified++;
    } else {
      results.failed++;
      results.failures.push({
        id: doc._id,
        error: result.storedChecksum ? 'Checksum mismatch' : 'No stored checksum'
      });
    }
  }
  
  return results;
}

export async function calculateAndStoreChecksum(
  documentId: string,
  data: Record<string, unknown>,
  documentVersion: number = 1
): Promise<string> {
  const checksum = await calculateObjectChecksum(data);
  storeChecksum(documentId, checksum, documentVersion);
  return checksum;
}

export function getChecksumStatus(): ChecksumStatus {
  const checksums = getStoredChecksums();
  const now = Date.now();
  
  let verifiedCount = 0;
  let failedCount = 0;
  let lastVerification: number | null = null;
  
  for (const checksum of checksums) {
    // Documents verified in the last 24 hours
    if (now - checksum.calculatedAt < 24 * 60 * 60 * 1000) {
      verifiedCount++;
    }
  }
  
  // Check for recent failures
  const recentFailures = getChecksumFailures();
  failedCount = recentFailures.length;
  
  if (checksums.length > 0) {
    lastVerification = Math.max(...checksums.map(c => c.calculatedAt));
  }
  
  return {
    totalDocuments: checksums.length,
    verifiedDocuments: verifiedCount,
    failedDocuments: failedCount,
    lastVerification
  };
}

export function getChecksumFailures(): Array<{ documentId: string; timestamp: number }> {
  try {
    return JSON.parse(localStorage.getItem('healthbridge_checksum_failures') || '[]');
  } catch {
    return [];
  }
}

function logChecksumEvent(
  documentId: string,
  event: 'created' | 'verified' | 'mismatch' | 'skipped',
  storedChecksum?: string,
  calculatedChecksum?: string
): void {
  const failures = getChecksumFailures();
  
  if (event === 'mismatch') {
    failures.push({
      documentId,
      timestamp: Date.now()
    });
    
    // Keep only last 100 failures
    const trimmed = failures.slice(-100);
    localStorage.setItem('healthbridge_checksum_failures', JSON.stringify(trimmed));
  }
}

export function clearChecksumData(): void {
  localStorage.removeItem(CHECKSUMS_KEY);
  localStorage.removeItem('healthbridge_checksum_failures');
  console.log('[Checksum] All checksum data cleared');
}

export function exportChecksums(): string {
  const checksums = getStoredChecksums();
  const failures = getChecksumFailures();
  
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    checksums,
    failures
  }, null, 2);
}

export function importChecksums(data: string): { success: boolean; imported: number; errors: string[] } {
  const result = { success: false, imported: 0, errors: [] as string[] };
  
  try {
    const imported = JSON.parse(data);
    
    if (imported.checksums && Array.isArray(imported.checksums)) {
      const current = getStoredChecksums();
      
      for (const checksum of imported.checksums) {
        try {
          // Only import if document doesn't exist
          if (!current.find(c => c.documentId === checksum.documentId)) {
            storeChecksum(
              checksum.documentId,
              checksum.checksum,
              checksum.documentVersion || 1
            );
            result.imported++;
          }
        } catch (err) {
          result.errors.push(`Failed to import checksum for ${checksum.documentId}`);
        }
      }
    }
    
    result.success = result.errors.length === 0;
  } catch (err) {
    result.errors.push('Invalid checksum data format');
  }
  
  return result;
}
