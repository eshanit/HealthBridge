import { logAuditEvent } from './auditLogger';
import type { AIUseCase, AIAuditLog } from '~/types/explainability';

const AI_AUDIT_STORAGE_KEY = 'healthbridge_ai_audit_log';
const MAX_AUDIT_ENTRIES = 1000;

export async function logAIInteraction(
  useCase: AIUseCase,
  explainabilityId: string,
  inputData: unknown,
  output: string,
  duration: number,
  safetyBlocks: number = 0,
  sessionId?: string
): Promise<void> {
  const auditEntry: AIAuditLog = {
    timestamp: new Date().toISOString(),
    sessionId: sessionId || 'unknown',
    useCase,
    explainabilityId,
    inputSummary: generateInputSummary(inputData),
    outputLength: output.length,
    safetyBlocks,
    duration
  };

  try {
    const existing = JSON.parse(localStorage.getItem(AI_AUDIT_STORAGE_KEY) || '[]');
    existing.push(auditEntry);
    
    if (existing.length > MAX_AUDIT_ENTRIES) {
      existing.splice(0, existing.length - MAX_AUDIT_ENTRIES);
    }
    
    localStorage.setItem(AI_AUDIT_STORAGE_KEY, JSON.stringify(existing));

    await logAuditEvent(
      'ai_interaction',
      safetyBlocks > 0 ? 'warning' : 'info',
      'clinicalAI',
      {
        useCase,
        explainabilityId,
        duration,
        safetyBlocks,
        outputLength: output.length
      },
      'success'
    );
  } catch (error) {
    console.error('[AIAudit] Failed to log AI interaction:', error);
  }
}

function generateInputSummary(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return 'empty';
  }

  const obj = data as Record<string, unknown>;
  
  const summaryParts: string[] = [];
  
  if (obj.classification) {
    summaryParts.push('has_classification');
  }
  if (obj.reasoning) {
    summaryParts.push('has_reasoning');
  }
  if (obj.recommendedActions) {
    summaryParts.push('has_actions');
  }
  
  if (obj.priority) {
    summaryParts.push(`priority:${obj.priority}`);
  }

  return summaryParts.length > 0 ? summaryParts.join(',') : 'unknown';
}

export function getAIAuditLog(): AIAuditLog[] {
  try {
    return JSON.parse(localStorage.getItem(AI_AUDIT_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearAIAuditLog(): void {
  localStorage.removeItem(AI_AUDIT_STORAGE_KEY);
  console.log('[AIAudit] AI audit log cleared');
}

export function exportAIAuditLog(): string {
  const entries = getAIAuditLog();
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    entries
  }, null, 2);
}

export function getAISessionStats(): {
  totalInteractions: number;
  todayInteractions: number;
  avgDuration: number;
  safetyBlocksToday: number;
} {
  const entries = getAIAuditLog();
  const today = new Date().toDateString();
  
  const todayEntries = entries.filter(e => 
    new Date(e.timestamp).toDateString() === today
  );

  const totalDuration = entries.reduce((sum, e) => sum + e.duration, 0);
  
  return {
    totalInteractions: entries.length,
    todayInteractions: todayEntries.length,
    avgDuration: entries.length > 0 ? Math.round(totalDuration / entries.length) : 0,
    safetyBlocksToday: todayEntries.reduce((sum, e) => sum + e.safetyBlocks, 0)
  };
}
