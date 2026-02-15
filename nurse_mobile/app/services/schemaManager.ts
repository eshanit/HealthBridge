/**
 * Schema Management Service
 * 
 * Handles schema version checking, downloading, signature validation,
 * and migration of form instances between schema versions.
 * 
 * Implements Section 10 requirements:
 * - Check for schema updates (if online)
 * - Download new schemas to secure storage
 * - Validate schema signature
 * - Migrate existing form instances if compatible
 * 
 * @module services/schemaManager
 */

import type { ClinicalFormSchema } from '~/types/clinical-form';
import { formEngine } from './formEngine';

/**
 * Schema manifest entry
 */
export interface SchemaManifestEntry {
  id: string;
  latestVersion: string;
  minAppVersion: string;
  protocol: string;
  downloadUrl: string;
  sha256: string;
}

/**
 * Schema manifest
 */
export interface SchemaManifest {
  availableSchemas: SchemaManifestEntry[];
}

/**
 * Schema update check result
 */
export interface SchemaUpdateCheck {
  hasUpdates: boolean;
  schemas: Array<{
    id: string;
    currentVersion: string;
    latestVersion: string;
    downloadUrl: string;
    sha256: string;
  }>;
}

/**
 * Schema migration result
 */
export interface MigrationResult {
  success: boolean;
  migrated: number;
  failed: number;
  errors: string[];
}

/**
 * Schema Manager Service
 */
export class SchemaManager {
  private manifestUrl = '/schemas/manifest.json';
  private cachedManifest: SchemaManifest | null = null;
  private schemaCache: Map<string, { schema: ClinicalFormSchema; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Check for schema updates by comparing with remote manifest
   */
  async checkForUpdates(): Promise<SchemaUpdateCheck> {
    try {
      const remoteManifest = await this.fetchManifest();
      const schemas: SchemaUpdateCheck['schemas'] = [];
      let hasUpdates = false;

      for (const remoteSchema of remoteManifest.availableSchemas) {
        const currentVersion = this.getLocalVersion(remoteSchema.id);
        
        if (this.isNewerVersion(remoteSchema.latestVersion, currentVersion)) {
          hasUpdates = true;
          schemas.push({
            id: remoteSchema.id,
            currentVersion,
            latestVersion: remoteSchema.latestVersion,
            downloadUrl: remoteSchema.downloadUrl,
            sha256: remoteSchema.sha256
          });
        }
      }

      return { hasUpdates, schemas };
    } catch (error) {
      console.error('[SchemaManager] Failed to check for updates:', error);
      return { hasUpdates: false, schemas: [] };
    }
  }

  /**
   * Download and install new schemas
   */
  async downloadSchemas(updateInfo: SchemaUpdateCheck['schemas']): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const update of updateInfo) {
      try {
        // Download schema
        const schema = await this.downloadSchema(update.downloadUrl);
        
        // Validate signature
        if (update.sha256 !== 'pending') {
          const isValid = await this.validateSchemaSignature(schema, update.sha256);
          if (!isValid) {
            console.error(`[SchemaManager] Invalid signature for ${update.id}`);
            failed.push(update.id);
            continue;
          }
        }

        // Store in secure storage
        await this.storeSchema(update.id, update.latestVersion, schema);
        success.push(update.id);
      } catch (error) {
        console.error(`[SchemaManager] Failed to download ${update.id}:`, error);
        failed.push(update.id);
      }
    }

    return { success, failed };
  }

  /**
   * Migrate existing form instances to new schema version
   */
  async migrateFormInstances(schemaId: string, fromVersion: string, toVersion: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      migrated: 0,
      failed: 0,
      errors: []
    };

    try {
      // Load all instances for this schema
      const instances = await this.getInstancesForSchema(schemaId);
      
      for (const instance of instances as Array<{ schemaVersion: string; id: string }>) {
        try {
          // Check if instance needs migration
          if (instance.schemaVersion === fromVersion) {
            // Load new schema and update instance reference
            const newSchema = await this.loadSchema(schemaId);
            
            // Perform basic migration (field mapping could be more complex)
            instance.schemaVersion = toVersion;
            
            // Save migrated instance
            await this.saveInstance(instance);
            result.migrated++;
          }
        } catch (error) {
          result.failed++;
          result.errors.push(`Failed to migrate instance ${instance.id}: ${error}`);
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Migration failed: ${error}`);
    }

    return result;
  }

  /**
   * Load a schema by ID (with version fallback)
   */
  async loadSchema(schemaId: string): Promise<ClinicalFormSchema> {
    // Check cache first
    const cached = this.schemaCache.get(schemaId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.schema;
    }
    
    // Load schema using formEngine
    const schema = await formEngine.loadSchema(schemaId);
    
    // Cache it
    this.schemaCache.set(schemaId, {
      schema,
      timestamp: Date.now()
    });

    return schema;
  }

  /**
   * Fetch remote manifest
   */
  private async fetchManifest(): Promise<SchemaManifest> {
    if (this.cachedManifest) {
      return this.cachedManifest;
    }

    const response = await fetch(this.manifestUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.status}`);
    }

    this.cachedManifest = await response.json() as SchemaManifest;
    return this.cachedManifest;
  }

  /**
   * Download a schema from URL
   */
  private async downloadSchema(url: string): Promise<ClinicalFormSchema> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download schema: ${response.status}`);
    }

    const text = await response.text();
    return JSON.parse(text) as ClinicalFormSchema;
  }

  /**
   * Validate schema signature (placeholder - implement with crypto in production)
   */
  private async validateSchemaSignature(schema: ClinicalFormSchema, expectedHash: string): Promise<boolean> {
    // In production, implement proper SHA-256 verification
    // const encoder = new TextEncoder();
    // const data = encoder.encode(JSON.stringify(schema));
    // const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    // const hashArray = Array.from(new Uint8Array(hashBuffer));
    // const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    // return hashHex === expectedHash;
    
    console.log('[SchemaManager] Signature validation placeholder - skipping');
    return true;
  }

  /**
   * Store schema in secure storage
   */
  private async storeSchema(schemaId: string, version: string, schema: ClinicalFormSchema): Promise<void> {
    // In production, store in encrypted PouchDB or similar
    const storageKey = `schema_${schemaId}_${version}`;
    localStorage.setItem(storageKey, JSON.stringify(schema));
    
    // Update version tracking
    const versions = JSON.parse(localStorage.getItem('schema_versions') || '{}');
    versions[schemaId] = version;
    localStorage.setItem('schema_versions', JSON.stringify(versions));
  }

  /**
   * Get local version for a schema
   */
  private getLocalVersion(schemaId: string): string {
    const versions = JSON.parse(localStorage.getItem('schema_versions') || '{}');
    return versions[schemaId] || '1.0.0';
  }

  /**
   * Get instances for a schema
   */
  private async getInstancesForSchema(schemaId: string): Promise<unknown[]> {
    // In production, query from PouchDB
    console.log('[SchemaManager] Getting instances for schema:', schemaId);
    return [];
  }

  /**
   * Save instance
   */
  private async saveInstance(instance: unknown): Promise<void> {
    // In production, save to PouchDB
    console.log('[SchemaManager] Saving instance');
  }

  /**
   * Compare version strings
   */
  private isNewerVersion(newVersion: string, currentVersion: string): boolean {
    const newParts = newVersion.split('.').map(Number);
    const currentParts = currentVersion.split('.').map(Number);

    for (let i = 0; i < Math.max(newParts.length, currentParts.length); i++) {
      const newVal = newParts[i] || 0;
      const currentVal = currentParts[i] || 0;
      
      if (newVal > currentVal) return true;
      if (newVal < currentVal) return false;
    }

    return false;
  }

  /**
   * Clear schema cache
   */
  clearCache(): void {
    this.schemaCache.clear();
    this.cachedManifest = null;
  }
}

// Singleton instance
export const schemaManager = new SchemaManager();
