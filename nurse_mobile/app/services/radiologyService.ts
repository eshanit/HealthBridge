/**
 * Radiology Service
 * 
 * Handles radiology study documents in PouchDB and syncs with CouchDB.
 * Part of the three-tier data flow:
 * nurse_mobile (PouchDB) → Laravel Proxy → CouchDB → healthbridge_core (MySQL)
 * 
 * @module services/radiologyService
 */

import { getSecureDb, securePut, secureGet, secureAllDocs } from './secureDb';
import { getSyncService, type SyncService } from './sync';
import type { SyncEvent } from './sync';

interface RadiologyStudyDoc {
  _id: string;
  _rev?: string;
  type: 'radiologyStudy';
  patientCpt: string;
  sessionCouchId?: string;
  modality: 'XRAY' | 'CT' | 'MRI' | 'ULTRASOUND' | 'PET' | 'MAMMO' | 'FLUORO' | 'ANGIO';
  bodyPart?: string;
  studyType?: 'Diagnostic' | 'Screening' | 'Follow-up' | 'Pre-operative' | 'Emergency';
  clinicalIndication: string;
  clinicalQuestion?: string;
  priority: 'stat' | 'urgent' | 'routine' | 'scheduled';
  status: 'pending' | 'ordered' | 'scheduled' | 'in_progress' | 'completed' | 'interpreted' | 'reported' | 'cancelled';
  createdBy?: string;
  orderedAt?: string;
  scheduledAt?: string;
  performedAt?: string;
  imagesAvailableAt?: string;
  studyCompletedAt?: string;
  aiPriorityScore?: number;
  aiCriticalFlag?: boolean;
  aiPreliminaryReport?: string;
  dicomSeriesCount?: number;
  dicomStoragePath?: string;
  assignedRadiologistId?: number;
  createdAt: string;
  updatedAt: string;
  synced: boolean;
}

interface CreateRadiologyStudyOptions {
  patientCpt: string;
  sessionCouchId?: string;
  modality: RadiologyStudyDoc['modality'];
  bodyPart?: string;
  studyType?: RadiologyStudyDoc['studyType'];
  clinicalIndication: string;
  clinicalQuestion?: string;
  priority?: RadiologyStudyDoc['priority'];
  createdBy?: string;
}

interface SyncStatus {
  pending: number;
  synced: number;
  conflicts: number;
  lastSyncTime: string | null;
}

class RadiologyService {
  private db: PouchDB.Database | null = null;
  private syncService: SyncService | null = null;
  private syncListeners: Set<(events: SyncEvent[]) => void> = new Set();

  /**
   * Initialize the radiology service
   */
  async initialize(): Promise<void> {
    const { getSecureDb, initializeSecureDb } = await import('./secureDb');
    const securityStore = await import('~/stores/security').then(m => m.useSecurityStore());
    
    // Ensure encryption key is available
    if (!securityStore.encryptionKey) {
      await securityStore.ensureEncryptionKey();
    }
    
    const key = securityStore.encryptionKey;
    if (!key) {
      throw new Error('[RadiologyService] No encryption key available');
    }
    
    // Initialize secure database if needed
    if (!this.db) {
      this.db = getSecureDb(key);
    }
    
    // Get sync service reference
    this.syncService = getSyncService();
    
    console.log('[RadiologyService] Initialized');
  }

  /**
   * Create a new radiology study order
   */
  async createStudy(options: CreateRadiologyStudyOptions): Promise<RadiologyStudyDoc> {
    if (!this.db) {
      await this.initialize();
    }

    const docId = `radiology:${this.generateUuid()}`;
    const now = new Date().toISOString();

    const doc: RadiologyStudyDoc = {
      _id: docId,
      type: 'radiologyStudy',
      patientCpt: options.patientCpt,
      sessionCouchId: options.sessionCouchId,
      modality: options.modality,
      bodyPart: options.bodyPart,
      studyType: options.studyType || 'Diagnostic',
      clinicalIndication: options.clinicalIndication,
      clinicalQuestion: options.clinicalQuestion,
      priority: options.priority || 'routine',
      status: 'ordered',
      createdBy: options.createdBy,
      orderedAt: now,
      createdAt: now,
      updatedAt: now,
      synced: false,
    };

    try {
      const result = await this.db!.put(doc);
      doc._rev = result.rev;
      
      console.log('[RadiologyService] Created radiology study:', docId);
      
      // Trigger sync if online
      this.triggerSync();
      
      return doc;
    } catch (error) {
      console.error('[RadiologyService] Failed to create study:', error);
      throw error;
    }
  }

  /**
   * Update a radiology study
   */
  async updateStudy(
    docId: string,
    updates: Partial<RadiologyStudyDoc>
  ): Promise<RadiologyStudyDoc> {
    if (!this.db) {
      await this.initialize();
    }

    const existing = await this.db!.get(docId) as RadiologyStudyDoc;
    
    // Create updated document with explicit type
    const updated: RadiologyStudyDoc = {
      _id: existing._id,
      _rev: existing._rev,
      type: 'radiologyStudy',
      patientCpt: updates.patientCpt ?? existing.patientCpt,
      sessionCouchId: updates.sessionCouchId ?? existing.sessionCouchId,
      modality: updates.modality ?? existing.modality,
      bodyPart: updates.bodyPart ?? existing.bodyPart,
      studyType: updates.studyType ?? existing.studyType,
      clinicalIndication: updates.clinicalIndication ?? existing.clinicalIndication,
      clinicalQuestion: updates.clinicalQuestion ?? existing.clinicalQuestion,
      priority: updates.priority ?? existing.priority,
      status: updates.status ?? existing.status,
      createdBy: updates.createdBy ?? existing.createdBy,
      orderedAt: updates.orderedAt ?? existing.orderedAt,
      scheduledAt: updates.scheduledAt ?? existing.scheduledAt,
      performedAt: updates.performedAt ?? existing.performedAt,
      imagesAvailableAt: updates.imagesAvailableAt ?? existing.imagesAvailableAt,
      studyCompletedAt: updates.studyCompletedAt ?? existing.studyCompletedAt,
      aiPriorityScore: updates.aiPriorityScore ?? existing.aiPriorityScore,
      aiCriticalFlag: updates.aiCriticalFlag ?? existing.aiCriticalFlag,
      aiPreliminaryReport: updates.aiPreliminaryReport ?? existing.aiPreliminaryReport,
      dicomSeriesCount: updates.dicomSeriesCount ?? existing.dicomSeriesCount,
      dicomStoragePath: updates.dicomStoragePath ?? existing.dicomStoragePath,
      assignedRadiologistId: updates.assignedRadiologistId ?? existing.assignedRadiologistId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      synced: false,
    };

    try {
      const result = await this.db!.put(updated);
      updated._rev = result.rev;
      
      console.log('[RadiologyService] Updated radiology study:', docId);
      
      // Trigger sync
      this.triggerSync();
      
      return updated;
    } catch (error) {
      console.error('[RadiologyService] Failed to update study:', error);
      throw error;
    }
  }

  /**
   * Get a radiology study by ID
   */
  async getStudy(docId: string): Promise<RadiologyStudyDoc | null> {
    if (!this.db) {
      await this.initialize();
    }

    try {
      return await this.db!.get(docId);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get all radiology studies for a patient
   */
  async getStudiesForPatient(patientCpt: string): Promise<RadiologyStudyDoc[]> {
    if (!this.db) {
      await this.initialize();
    }

    const result = await this.db!.allDocs({
      include_docs: true,
      startkey: 'radiology:',
      endkey: 'radiology:\ufff0',
    });

    return result.rows
      .map(row => row.doc as RadiologyStudyDoc)
      .filter(doc => doc.patientCpt === patientCpt);
  }

  /**
   * Get all pending (unsynced) studies
   */
  async getPendingStudies(): Promise<RadiologyStudyDoc[]> {
    if (!this.db) {
      await this.initialize();
    }

    const result = await this.db!.allDocs({
      include_docs: true,
      startkey: 'radiology:',
      endkey: 'radiology:\ufff0',
    });

    return result.rows
      .map(row => row.doc as RadiologyStudyDoc)
      .filter(doc => !doc.synced);
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<SyncStatus> {
    const result = await this.db!.allDocs({
      include_docs: true,
      startkey: 'radiology:',
      endkey: 'radiology:\ufff0',
    });

    const docs = result.rows.map(row => row.doc as RadiologyStudyDoc);
    
    return {
      pending: docs.filter(d => !d.synced).length,
      synced: docs.filter(d => d.synced).length,
      conflicts: 0, // Would need conflict detection logic
      lastSyncTime: null,
    };
  }

  /**
   * Mark a study as synced
   */
  async markAsSynced(docId: string, revision: string): Promise<void> {
    const doc = await this.getStudy(docId);
    if (doc) {
      doc.synced = true;
      doc._rev = revision;
      await this.db!.put(doc);
    }
  }

  /**
   * Delete a radiology study
   */
  async deleteStudy(docId: string): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }

    const doc = await this.db!.get(docId);
    await this.db!.remove(doc);
    
    console.log('[RadiologyService] Deleted radiology study:', docId);
  }

  /**
   * Trigger sync with remote
   */
  private triggerSync(): void {
    // The sync service will handle this automatically for all documents
    console.log('[RadiologyService] Sync triggered for radiology studies');
  }

  /**
   * Register a sync event listener
   */
  onSyncEvents(callback: (events: SyncEvent[]) => void): () => void {
    this.syncListeners.add(callback);
    return () => this.syncListeners.delete(callback);
  }

  /**
   * Generate a UUID
   */
  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Singleton instance
export const radiologyService = new RadiologyService();

// Type exports
export type { RadiologyStudyDoc, CreateRadiologyStudyOptions, SyncStatus };
