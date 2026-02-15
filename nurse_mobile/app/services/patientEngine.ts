/**
 * Patient Engine Service
 * 
 * Manages patient records: registration, lookup, search, and history.
 * All operations use encrypted secureDb storage for HIPAA compliance.
 * 
 * Features:
 * - Patient registration with automatic CPT generation
 * - Lookup by CPT, name, or phone
 * - Patient profile updates
 * - Visit history tracking
 * - Offline-first architecture
 */

import { ref } from 'vue';
import { generateCPT, validateCPTFormat, validateShortCPTFormat } from './patientId';
import { generateUniqueCpt } from './cptService';
import type {
  ClinicalPatient,
  PatientDocument,
  PatientRegistrationData,
  PatientLookupResult,
  PatientSearchCriteria,
  PatientStatistics,
  MedicalHistoryEntry,
  Allergy,
  Medication
} from '~/types/patient';
import { securePut, secureGet, secureFind } from './secureDb';
import { useSecurityStore } from '~/stores/security';
import type { ClinicalSession } from '~/types/clinical-session';
import { generateCpt as generateShortCpt, isValidCpt } from './cptService';

// ============================================
// State
// ============================================

/**
 * Local cache for patient data (recently accessed)
 */
const patientCache = ref<Map<string, ClinicalPatient>>(new Map());

/**
 * Track recent patient IDs for quick access
 */
const recentPatientCPTs = ref<string[]>([]);

/**
 * Engine initialization state
 */
const isInitialized = ref(false);

// ============================================
// Utility Functions
// ============================================

/**
 * Get encryption key from security store
 */
async function getEncryptionKey(): Promise<Uint8Array> {
  const securityStore = useSecurityStore();
  
  if (!securityStore.encryptionKey) {
    await securityStore.ensureEncryptionKey();
  }
  
  if (!securityStore.encryptionKey) {
    throw new Error('[PatientEngine] Encryption key not available');
  }
  
  return securityStore.encryptionKey;
}

/**
 * Get document ID for patient
 */
function getPatientDocId(cpt: string): string {
  return `patient:${cpt}`;
}

/**
 * Create patient document for storage
 */
function createPatientDocument(patient: ClinicalPatient): PatientDocument {
  return {
    _id: getPatientDocId(patient.cpt),
    type: 'clinicalPatient',
    patient
  };
}

/**
 * Extract patient from document
 */
function extractPatient(document: PatientDocument): ClinicalPatient {
  return document.patient;
}

// ============================================
// Core Patient Operations
// ============================================

/**
 * Register a new patient with automatic CPT generation
 * 
 * @param data Patient registration data
 * @returns Created clinical patient with CPT
 */
export async function registerPatient(
  data: PatientRegistrationData
): Promise<ClinicalPatient> {
  const key = await getEncryptionKey();
  const toast = useToast();
  
  // Validate required fields
  if (!data.firstName?.trim()) {
    throw new Error('First name is required');
  }
  if (!data.lastName?.trim()) {
    throw new Error('Last name is required');
  }
  
  // Generate unique 4-character CPT
  const cpt = await generateUniqueCpt(async (candidate: string) => {
    // Check if CPT already exists
    const docId = getPatientDocId(candidate);
    try {
      const existing = await secureGet<PatientDocument>(docId, key);
      return !!existing;
    } catch {
      return false;
    }
  });
  const now = new Date().toISOString();
  
  // Create patient record
  const patient: ClinicalPatient = {
    id: cpt,
    cpt,
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    dateOfBirth: data.dateOfBirth,
    gender: data.gender,
    phone: data.phone?.trim(),
    email: data.email?.trim(),
    address: data.address,
    emergencyContact: data.emergencyContact,
    insuranceInfo: data.insuranceInfo,
    medicalHistory: data.medicalHistory || [],
    allergies: data.allergies || [],
    medications: data.medications || [],
    createdAt: now,
    updatedAt: now,
    visitCount: 1,
    isActive: true
  };
  
  // Create document and store
  const document = createPatientDocument(patient);
  await securePut(document, key);
  
  // Update cache
  patientCache.value.set(cpt, patient);
  recentPatientCPTs.value.unshift(cpt);
  if (recentPatientCPTs.value.length > 20) {
    recentPatientCPTs.value.pop();
  }
  
  console.log(`[PatientEngine] Registered patient: ${cpt}`);
  
  // Show success toast
  toast.add({
    title: 'Patient Registered',
    description: `CPT: ${cpt}`,
    color: 'success'
  });
  
  return patient;
}

/**
 * Find patient by CPT (supports both 4-char and 11-char formats)
 * 
 * @param cpt Clinical Patient Token
 * @returns Lookup result with patient if found
 */
export async function getPatientByCPT(cpt: string): Promise<PatientLookupResult> {
  const key = await getEncryptionKey();
  
  // Try 4-character format first
  const shortValidation = validateShortCPTFormat(cpt);
  if (shortValidation.isValid) {
    const normalizedCPT = shortValidation.formattedCPT!;
    
    // Check cache first
    if (patientCache.value.has(normalizedCPT)) {
      return { 
        found: true, 
        patient: patientCache.value.get(normalizedCPT)! 
      };
    }
    
    // Lookup in secureDb
    try {
      const document = await secureGet<PatientDocument>(
        getPatientDocId(normalizedCPT),
        key
      );
      
      if (!document) {
        return { found: false, error: 'Patient not found' };
      }
      
      const patient = extractPatient(document);
      patientCache.value.set(normalizedCPT, patient);
      
      return { found: true, patient };
      
    } catch (error) {
      console.error('[PatientEngine] Lookup failed:', error);
      return { found: false, error: 'Failed to retrieve patient' };
    }
  }
  
  // Fall back to 11-character format
  const validation = validateCPTFormat(cpt);
  if (!validation.isValid) {
    return { found: false, error: validation.error };
  }
  
  const normalizedCPT = validation.formattedCPT!;
  
  // Check cache first
  if (patientCache.value.has(normalizedCPT)) {
    return { 
      found: true, 
      patient: patientCache.value.get(normalizedCPT)! 
    };
  }
  
  // Lookup in secureDb
  try {
    const document = await secureGet<PatientDocument>(
      getPatientDocId(normalizedCPT),
      key
    );
    
    if (!document) {
      return { found: false, error: 'Patient not found' };
    }
    
    const patient = extractPatient(document);
    patientCache.value.set(normalizedCPT, patient);
    
    return { found: true, patient };
    
  } catch (error) {
    console.error('[PatientEngine] Lookup failed:', error);
    return { found: false, error: 'Failed to retrieve patient' };
  }
}

/**
 * Search patients by various criteria
 * 
 * @param criteria Search criteria
 * @returns Array of matching patients
 */
export async function searchPatients(
  criteria: PatientSearchCriteria
): Promise<ClinicalPatient[]> {
  const key = await getEncryptionKey();
  const results: ClinicalPatient[] = [];
  const limit = criteria.limit || 20;
  
  // Build query selector
  const selector: Record<string, unknown> = {
    type: 'clinicalPatient'
  };
  
  // If searching by CPT directly
  if (criteria.cpt) {
    selector['patient.cpt'] = { $regex: new RegExp(criteria.cpt, 'i') };
  }
  
  // If searching by name
  if (criteria.name) {
    selector['patient.firstName'] = { $regex: new RegExp(criteria.name, 'i') };
  }
  
  // If searching by phone
  if (criteria.phone) {
    selector['patient.phone'] = { $regex: new RegExp(criteria.phone, 'i') };
  }
  
  // General query search
  if (criteria.query) {
    const query = criteria.query.toLowerCase();
    
    // First try exact CPT match
    const cptResult = await getPatientByCPT(query);
    if (cptResult.found && cptResult.patient) {
      return [cptResult.patient];
    }
    
    // Query for all patients and filter (fallback)
    selector.type = 'clinicalPatient';
  }
  
  try {
    // Query secureDb
    const documents = await secureFind<PatientDocument>({ selector }, key);
    
    for (const doc of documents) {
      const patient = extractPatient(doc);
      
      // Apply additional filtering for query search
      if (criteria.query) {
        const query = criteria.query.toLowerCase();
        const matchesQuery = 
          patient.firstName.toLowerCase().includes(query) ||
          patient.lastName.toLowerCase().includes(query) ||
          patient.phone?.includes(query) ||
          patient.cpt.toLowerCase().includes(query);
        
        if (!matchesQuery) continue;
      }
      
      results.push(patient);
      
      if (results.length >= limit) break;
    }
    
  } catch (error) {
    console.error('[PatientEngine] Search failed:', error);
  }
  
  // Update cache with results
  for (const patient of results) {
    patientCache.value.set(patient.cpt, patient);
  }
  
  return results;
}

/**
 * Update patient profile
 * 
 * @param cpt Patient CPT
 * @param updates Fields to update
 * @returns Updated patient record
 */
export async function updatePatient(
  cpt: string,
  updates: Partial<PatientRegistrationData>
): Promise<ClinicalPatient> {
  const key = await getEncryptionKey();
  
  // Get current patient
  const lookup = await getPatientByCPT(cpt);
  if (!lookup.found || !lookup.patient) {
    throw new Error('Patient not found');
  }
  
  const current = lookup.patient;
  const now = new Date().toISOString();
  
  // Apply updates
  const updated: ClinicalPatient = {
    ...current,
    firstName: updates.firstName?.trim() ?? current.firstName,
    lastName: updates.lastName?.trim() ?? current.lastName,
    dateOfBirth: updates.dateOfBirth ?? current.dateOfBirth,
    gender: updates.gender ?? current.gender,
    phone: updates.phone?.trim() ?? current.phone,
    email: updates.email?.trim() ?? current.email,
    address: updates.address ?? current.address,
    emergencyContact: updates.emergencyContact ?? current.emergencyContact,
    insuranceInfo: updates.insuranceInfo ?? current.insuranceInfo,
    medicalHistory: updates.medicalHistory ?? current.medicalHistory,
    allergies: updates.allergies ?? current.allergies,
    medications: updates.medications ?? current.medications,
    updatedAt: now
  };
  
  // Create and store updated document
  const document = createPatientDocument(updated);
  
  // Get current revision
  try {
    const currentDoc = await secureGet<PatientDocument>(
      getPatientDocId(cpt),
      key
    );
    if (currentDoc?._rev) {
      document._rev = currentDoc._rev;
    }
  } catch {
    // Document might not exist, which shouldn't happen here
  }
  
  await securePut(document, key);
  
  // Update cache
  patientCache.value.set(cpt, updated);
  
  console.log(`[PatientEngine] Updated patient: ${cpt}`);
  
  return updated;
}

/**
 * Get patient visit history
 * 
 * @param cpt Patient CPT
 * @returns Visit history (sessions linked to this patient)
 */
export async function getPatientHistory(
  cpt: string
): Promise<ClinicalSession[]> {
  const { loadSession } = await import('./sessionEngine');
  
  // This would query sessions linked to this patient
  // For now, return empty array as session-patient linking needs implementation
  console.log(`[PatientEngine] Getting history for patient: ${cpt}`);
  
  // In a full implementation, this would:
  // 1. Query sessions where patientCpt === cpt
  // 2. Load each session using loadSession()
  // 3. Return sorted list of sessions
  
  return [];
}

/**
 * Add visit record to patient history
 * 
 * @param cpt Patient CPT
 * @param sessionId Session ID to add
 */
export async function addVisitToHistory(
  cpt: string,
  sessionId: string
): Promise<void> {
  const key = await getEncryptionKey();
  
  const lookup = await getPatientByCPT(cpt);
  if (!lookup.found || !lookup.patient) {
    throw new Error('Patient not found');
  }
  
  const patient = lookup.patient;
  const now = new Date().toISOString();
  
  // Update visit metadata
  const updated: ClinicalPatient = {
    ...patient,
    lastVisit: now,
    visitCount: patient.visitCount + 1,
    updatedAt: now
  };
  
  // Store updated patient
  const document = createPatientDocument(updated);
  await securePut(document, key);
  
  // Update cache
  patientCache.value.set(cpt, updated);
  
  console.log(`[PatientEngine] Added visit to patient history: ${cpt}`);
}

/**
 * Deactivate patient (soft delete)
 * 
 * @param cpt Patient CPT
 */
export async function deactivatePatient(cpt: string): Promise<void> {
  const updated = await updatePatient(cpt, {});
  updated.isActive = false;
  
  console.log(`[PatientEngine] Deactivated patient: ${cpt}`);
}

// ============================================
// Statistics
// ============================================

/**
 * Get patient statistics
 */
export async function getPatientStatistics(): Promise<PatientStatistics> {
  const key = await getEncryptionKey();
  
  // Query all patient documents
  const documents = await secureFind<PatientDocument>(
    { selector: { type: 'clinicalPatient' } },
    key
  );
  
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  let activeCount = 0;
  let newThisMonth = 0;
  
  for (const doc of documents) {
    const patient = doc.patient;
    
    if (patient.isActive) {
      activeCount++;
    }
    
    const created = new Date(patient.createdAt);
    if (created >= monthStart) {
      newThisMonth++;
    }
  }
  
  return {
    totalPatients: documents.length,
    activePatients: activeCount,
    newPatientsThisMonth: newThisMonth
  };
}

// ============================================
// Cache Management
// ============================================

/**
 * Clear patient cache
 */
export function clearPatientCache(): void {
  patientCache.value.clear();
  recentPatientCPTs.value = [];
}

/**
 * Get recent patients
 */
export function getRecentPatients(): ClinicalPatient[] {
  const patients: ClinicalPatient[] = [];
  
  for (const cpt of recentPatientCPTs.value) {
    const patient = patientCache.value.get(cpt);
    if (patient) {
      patients.push(patient);
    }
  }
  
  return patients;
}

/**
 * Preload patient into cache
 */
export function preloadPatient(patient: ClinicalPatient): void {
  patientCache.value.set(patient.cpt, patient);
}

/**
 * Link a patient CPT to a session
 * @param sessionId - The session ID
 * @param patientCpt - The patient's CPT
 */
export async function linkPatientToSession(
  sessionId: string,
  patientCpt: string
): Promise<void> {
  // Get the patient data
  const lookup = await getPatientByCPT(patientCpt);
  if (!lookup.found || !lookup.patient) {
    throw new Error(`[PatientEngine] Patient not found: ${patientCpt}`);
  }
  
  const patient = lookup.patient;
  
  // Construct full name from patient data
  const fullName = `${patient.firstName} ${patient.lastName}`.trim();
  
  // Import updateSession dynamically to avoid circular dependency
  const { updateSession } = await import('./sessionEngine');
  
  // Update session with patient data
  await updateSession(sessionId, {
    patientId: patient.cpt,
    patientName: fullName,
    dateOfBirth: patient.dateOfBirth,
    gender: patient.gender
  });
  
  console.log(`[PatientEngine] Linked patient ${patientCpt} to session ${sessionId}`);
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize patient engine
 */
export async function initializePatientEngine(): Promise<void> {
  if (isInitialized.value) return;
  
  // Any initialization logic here
  isInitialized.value = true;
  console.log('[PatientEngine] Engine initialized');
}

// ============================================
// Default Export (Convenience)
// ============================================

/**
 * Patient Engine Instance
 * 
 * Provides a simple interface for common patient operations.
 */
export const patientEngine = {
  register: registerPatient,
  getByCPT: getPatientByCPT,
  search: searchPatients,
  update: updatePatient,
  getHistory: getPatientHistory,
  addVisit: addVisitToHistory,
  deactivate: deactivatePatient,
  getStatistics: getPatientStatistics,
  getRecent: getRecentPatients,
  clearCache: clearPatientCache
};

export default patientEngine;
