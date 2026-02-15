# Clinical Patient Token (CPT) System Architecture

## Document Information

| Attribute | Value |
|-----------|-------|
| Version | 2.0.0 |
| Status | Draft |
| Last Updated | 2024 |
| Related Documents | [patient-id.md](../specs/patient-id.md), [SESSION_LIFECYCLE.md](../Lifecycles/SESSION_LIFECYCLE.md) |

---

## Core Identity Principles

The following principles govern all patient identity operations:

1. **CPT is Permanent Primary Identifier** - The Clinical Patient Token (CPT) is the permanent, primary patient identifier used across all visits and sessions. It never changes once assigned.

2. **External IDs are Secondary** - External Patient IDs (such as hospital MRN) are secondary identifiers that may change over time or differ across institutions.

3. **Never Re-register Existing Patients** - Always attempt lookup first before registering a new patient. Duplicate registrations must be prevented.

4. **Offline Operation Support** - Patient identity must support full offline operation, including manual CPT entry when no network is available.

5. **QR Code Enhancement** - QR codes are an optional enhancement that follows the same lookup path as manual entry.

---

## 1. CPT Format Specification

### 1.1 Format Definition

```
CPT Format: CP-XXXX-XXXX
- Prefix: CP (Clinical Patient)
- Two blocks of 4 characters each
- Total: 11 characters
- Separator: Hyphen (-)
```

### 1.2 Character Set

The CPT uses a deliberately chosen character set that excludes confusing characters:

```
Character Set: ABCDEFGHJKLMNPQRSTUVWXYZ23456789
- Removed: I, O, 0, 1 (easily confused)
- Letters: A-Z excluding I, O = 22 letters
- Numbers: 2-9 excluding 0, 1 = 8 numbers
- Total: 30 characters per position
```

**Note:** The original document incorrectly stated 32 characters (24 letters + 8 numbers). The correct count is 22 letters (A-Z minus I, O) plus 8 numbers = 30 characters.

### 1.3 Entropy Analysis

```
Entropy Calculation:
- Per character: log2(30) = ~4.907 bits
- Per block (4 chars): 4 × 4.907 = ~19.63 bits
- Full CPT (2 blocks): 2 × 19.63 = ~39.26 bits

Collision Probability (Birthday Attack):
- For 1,000 patients: ~0.0000000000001%
- For 10,000 patients: ~0.00000001%
- For 100,000 patients: ~0.0001%

Security Rating: SUFFICIENT for clinical use
(~39 bits provides excellent uniqueness for patient identification)
```

---

## 2. Input Normalization Rules

### 2.1 Normalization Process

All CPT input must be normalized to the standard format `CP-XXXX-XXXX` before lookup or validation.

**Input Variations and Their Normalized Output:**

| Input Format | Normalized Output |
|-------------|-------------------|
| `cp7f3ak92q` | `CP-7F3A-K92Q` |
| `7f3ak92q` | `CP-7F3A-K92Q` |
| `7F3AK92Q` | `CP-7F3A-K92Q` |
| `CP7F3AK92Q` | `CP-7F3A-K92Q` |
| `cp-7f3a-k92q` | `CP-7F3A-K92Q` |
| `cp 7f3a k92q` | `CP-7F3A-K92Q` |
| `CP-7F3A-K92Q` | `CP-7F3A-K92Q` |

### 2.2 Normalization Algorithm

```typescript
/**
 * Normalize CPT input to standard format
 * 
 * Steps:
 * 1. Remove all whitespace
 * 2. Convert to uppercase
 * 3. Remove all non-alphanumeric characters
 * 4. Add 'CP' prefix if missing
 * 5. Insert hyphens at correct positions
 * 6. Validate final format
 */
export function normalizeCPTInput(input: string): {
  normalized: string;
  isValid: boolean;
  error?: string;
} {
  // Step 1-3: Clean input
  let cleaned = input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  
  // Step 4: Add prefix if missing
  if (!cleaned.startsWith('CP')) {
    cleaned = 'CP' + cleaned;
  }
  
  // Step 5: Insert hyphens
  // Expected format: CP + 8 characters = 10 characters total
  if (cleaned.length === 10 && !cleaned.includes('-')) {
    cleaned = `${cleaned.slice(0, 2)}-${cleaned.slice(2, 6)}-${cleaned.slice(6, 10)}`;
  }
  
  // Step 6: Validate
  const validation = validateCPTFormat(cleaned);
  if (!validation.isValid) {
    return { normalized: cleaned, isValid: false, error: validation.error };
  }
  
  return { normalized: cleaned, isValid: true };
}
```

### 2.3 Validation Rules

```typescript
/**
 * Validate CPT format
 */
export function validateCPTFormat(cpt: string): {
  isValid: boolean;
  error?: string;
} {
  const normalized = cpt.trim().toUpperCase();
  
  // Must start with CP
  if (!normalized.startsWith('CP')) {
    return { isValid: false, error: 'CPT must start with "CP"' };
  }
  
  // Remove prefix for format check
  const body = normalized.slice(2);
  
  // Must have 8 characters after prefix
  if (body.length !== 8) {
    return { isValid: false, error: 'CPT body must be 8 characters' };
  }
  
  // Must have format XXXX-XXXX (with or without hyphens)
  const noHyphens = body.replace(/-/g, '');
  if (noHyphens.length !== 8) {
    return { isValid: false, error: 'CPT must match format CP-XXXX-XXXX' };
  }
  
  // Validate each character
  const CPT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (const char of noHyphens) {
    if (!CPT_ALPHABET.includes(char)) {
      return { isValid: false, error: `Invalid character "${char}" in CPT` };
    }
  }
  
  // Validate hyphen positions
  if (body.includes('-')) {
    const parts = body.split('-');
    if (parts.length !== 2 || parts[0].length !== 4 || parts[1].length !== 4) {
      return { isValid: false, error: 'CPT must match format CP-XXXX-XXXX' };
    }
  }
  
  return { isValid: true };
}
```

---

## 3. Lookup Priority

### 3.1 Priority Order

Patient lookup follows this strict priority order:

1. **Primary: CPT Lookup** - Look up by Clinical Patient Token (fastest, most reliable)
2. **Secondary: External Patient ID** - Look up by hospital MRN or external identifier
3. **Fallback: Name + Date of Birth** - Look up by patient name and DOB combination

### 3.2 Lookup Implementation

```typescript
/**
 * Unified patient lookup with priority order
 */
export async function findPatient(
  criteria: PatientSearchCriteria
): Promise<PatientLookupResult> {
  // Priority 1: CPT Lookup (fastest)
  if (criteria.cpt) {
    const cptResult = await findPatientByCPT(criteria.cpt);
    if (cptResult.found && cptResult.patient) {
      return cptResult;
    }
  }
  
  // Priority 2: External ID Lookup
  if (criteria.externalId) {
    const extResult = await findPatientByExternalId(criteria.externalId);
    if (extResult.found && extResult.patient) {
      return extResult;
    }
  }
  
  // Priority 3: Name + DOB Fallback
  if (criteria.name && criteria.dateOfBirth) {
    const nameResult = await findPatientByNameAndDOB(
      criteria.name,
      criteria.dateOfBirth
    );
    if (nameResult.found && nameResult.patient) {
      return nameResult;
    }
  }
  
  return { found: false, error: 'Patient not found' };
}

/**
 * Find patient by external ID (hospital MRN)
 */
export async function findPatientByExternalId(
  externalId: string
): Promise<PatientLookupResult> {
  const key = await getEncryptionKey();
  const documents = await secureFind<PatientDocument>(
    { selector: { 'patient.externalPatientId': externalId } },
    key
  );
  
  if (documents.length === 0) {
    return { found: false, error: 'Patient not found with this external ID' };
  }
  
  return { found: true, patient: documents[0].patient };
}

/**
 * Find patient by name and date of birth
 */
export async function findPatientByNameAndDOB(
  name: string,
  dateOfBirth: string
): Promise<PatientLookupResult> {
  const key = await getEncryptionKey();
  const documents = await secureFind<PatientDocument>(
    { 
      selector: { 
        'patient.firstName': name,
        'patient.dateOfBirth': dateOfBirth
      } 
    },
    key
  );
  
  if (documents.length === 0) {
    return { found: false, error: 'Patient not found with this name and DOB' };
  }
  
  return { found: true, patient: documents[0].patient };
}
```

---

## 4. Patient Data Model

### 4.1 Type Definitions

**File:** `app/types/patient.ts`

```typescript
/**
 * Clinical Patient Data Types
 * 
 * Patient identity and demographic information
 * Stored encrypted in secureDb
 */

// ============================================
// Core Identity Types
// ============================================

/**
 * Primary patient identifier - CPT format
 */
export type ClinicalPatientId = string; // Format: CP-XXXX-XXXX

/**
 * External patient identifier (hospital MRN)
 * May change over time or differ across institutions
 */
export type ExternalPatientId = string;

/**
 * Gender options
 */
export type PatientGender = 'male' | 'female' | 'other';

// ============================================
// Core Patient Types
// ============================================

/**
 * Patient core data - clinical view
 */
export interface ClinicalPatient {
  /** Primary CPT identifier (permanent, never changes) */
  id: ClinicalPatientId;
  
  /** CPT token for display (same as id) */
  cpt: string;
  
  /** External hospital MRN (secondary, may change) */
  externalPatientId?: ExternalPatientId;
  
  /** Patient given name */
  firstName?: string;
  
  /** Patient family name */
  lastName?: string;
  
  /** Date of birth in ISO format (YYYY-MM-DD) */
  dateOfBirth?: string;
  
  /** Patient gender */
  gender?: PatientGender;
  
  /** Patient phone number */
  phone?: string;
  
  /** Patient email address */
  email?: string;
  
  /** Patient address (structured) */
  address?: PatientAddress;
  
  /** Guardian/parent name (for pediatric patients) */
  guardianName?: string;
  
  /** Record timestamps */
  createdAt: string;  // ISO 8601
  updatedAt: string;
  
  /** Last visit timestamp */
  lastSeenAt?: string;
  
  /** Visit count */
  visitCount: number;
  
  /** Patient active status */
  isActive: boolean;
}

/**
 * Patient address structure
 */
export interface PatientAddress {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

// ============================================
// Document Types
// ============================================

/**
 * Patient document as stored in database
 * Derived from PatientDocumentSchema Zod schema
 */
export type PatientDocument = z.infer<typeof PatientDocumentSchema>;

/**
 * Patient document schema (for storage)
 */
export const PatientDocumentSchema = z.object({
  _id: z.string(), // Format: patient:CP-XXXX-XXXX
  _rev: z.string().optional(), // CouchDB/PouchDB revision
  type: z.literal('clinicalPatient'),
  patient: PatientRegistrationDataSchema.extend({
    id: z.string(), // CPT format
    cpt: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    lastSeenAt: z.string().optional(),
    visitCount: z.number().default(1),
    isActive: z.boolean().default(true)
  })
});

/**
 * Patient registration input
 */
export interface PatientRegistrationData {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: PatientGender;
  phone?: string;
  email?: string;
  address?: PatientAddress;
  guardianName?: string;
  externalPatientId?: string;
}

/**
 * Patient lookup result
 */
export interface PatientLookupResult {
  found: boolean;
  patient?: ClinicalPatient;
  error?: string;
}

/**
 * Patient search criteria
 */
export interface PatientSearchCriteria {
  cpt?: string;
  externalId?: string;
  name?: string;
  dateOfBirth?: string;
  limit?: number;
}

/**
 * Patient statistics
 */
export interface PatientStatistics {
  totalPatients: number;
  activePatients: number;
  newPatientsThisMonth: number;
}
```

---

## 5. Session Linking

### 5.1 Session Linking Requirements

When linking a patient to a session, the following operations must occur:

1. **Attach patientCpt to session** - Store the patient's CPT in the session document
2. **Update lastSeenAt timestamp** - Update the patient's last visit timestamp
3. **Log timeline event** - Record the linking in the clinical timeline

### 5.2 Session Linking Implementation

```typescript
/**
 * Link patient to session with all required operations
 */
export async function linkPatientToSession(
  sessionId: string,
  patientCpt: string
): Promise<void> {
  // Step 1: Validate patient exists
  const lookup = await findPatientByCPT(patientCpt);
  if (!lookup.found || !lookup.patient) {
    throw new Error('Cannot link to non-existent patient');
  }
  
  // Step 2: Update session with patient reference
  const { updateSession } = await import('./sessionEngine');
  await updateSession(sessionId, {
    patientCpt: patientCpt,
    patientId: lookup.patient.id,
    patientName: `${lookup.patient.firstName || ''} ${lookup.patient.lastName || ''}`.trim()
  });
  
  // Step 3: Update patient's lastSeenAt timestamp
  await updatePatient(patientCpt, {
    // Trigger lastSeenAt update
  });
  
  // Step 4: Log timeline event
  const timelineService = await import('./clinicalTimeline');
  await timelineService.logEvent({
    id: `link_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    sessionId: sessionId,
    type: 'patient_linked',
    data: {
      patientCpt: patientCpt,
      action: 'session_link'
    },
    timestamp: Date.now()
  });
  
  console.log(`[PatientEngine] Linked patient ${patientCpt} to session ${sessionId}`);
}

/**
 * Update patient with lastSeenAt tracking
 */
export async function updatePatient(
  cpt: string,
  updates: Partial<PatientRegistrationData>
): Promise<ClinicalPatient> {
  const key = await getEncryptionKey();
  
  // Get current patient
  const lookup = await findPatientByCPT(cpt);
  if (!lookup.found || !lookup.patient) {
    throw new Error('Patient not found');
  }
  
  const current = lookup.patient;
  
  // Apply updates
  const updated: ClinicalPatient = {
    ...current,
    ...updates,
    id: current.id, // Prevent ID change
    cpt: current.cpt, // Prevent CPT change
    updatedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(), // Always update on session
    visitCount: (current.visitCount || 0) + 1 // Increment visit count
  };
  
  // Create and store updated document
  const document = await createPatientDocument(updated);
  
  // Preserve revision if exists
  const existingDoc = await secureGet<PatientDocument>(
    `patient:${cpt}`,
    key
  );
  if (existingDoc?._rev) {
    document._rev = existingDoc._rev;
  }
  
  await securePut(document, key);
  
  // Update cache
  patientCache.value.set(cpt, updated);
  
  console.log(`[PatientEngine] Updated patient: ${cpt}, visitCount: ${updated.visitCount}`);
  
  return updated;
}
```

---

## 6. Duplicate Prevention

### 6.1 Registration Flow with Lookup First

The registration process must always attempt lookup before creating a new patient:

```typescript
/**
 * Register or lookup patient
 * Always tries lookup first to prevent duplicates
 */
export async function registerPatient(
  data: PatientRegistrationData
): Promise<ClinicalPatient> {
  // Step 1: Attempt lookup first (critical for duplicate prevention)
  
  // Priority 1: Check by CPT if provided
  if (data.cpt) {
    const cptLookup = await findPatientByCPT(data.cpt);
    if (cptLookup.found && cptLookup.patient) {
      // Patient already exists with this CPT
      // Update their information instead of creating duplicate
      console.log(`[PatientEngine] Patient already exists with CPT: ${data.cpt}`);
      return await updatePatient(data.cpt, data);
    }
  }
  
  // Priority 2: Check by external ID if provided
  if (data.externalPatientId) {
    const extLookup = await findPatientByExternalId(data.externalPatientId);
    if (extLookup.found && extLookup.patient) {
      // Patient already exists with this external ID
      // Link CPT to existing patient record
      console.log(`[PatientEngine] Patient found with external ID: ${data.externalPatientId}`);
      const { generateCPT } = await import('./patientId');
      
      // Generate new CPT for this existing patient
      const newCPT = generateCPT();
      const updated = await updatePatient(extLookup.patient.id, {
        ...data,
        // Preserve original CPT if exists
        cpt: extLookup.patient.cpt || newCPT
      });
      
      return updated;
    }
  }
  
  // Priority 3: Check by Name + DOB if both provided
  if (data.firstName && data.lastName && data.dateOfBirth) {
    const nameLookup = await findPatientByNameAndDOB(
      `${data.firstName} ${data.lastName}`,
      data.dateOfBirth
    );
    if (nameLookup.found && nameLookup.patient) {
      // Patient found by name and DOB
      // May be same person - require manual verification
      throw new Error(
        'Possible duplicate patient found. ' +
        'A patient with this name and date of birth already exists. ' +
        'Please verify and use the existing record or contact an administrator.'
      );
    }
  }
  
  // Step 2: Create new patient if no existing record found
  return await createNewPatient(data);
}

/**
 * Create completely new patient record
 */
async function createNewPatient(
  data: PatientRegistrationData
): Promise<ClinicalPatient> {
  const key = await getEncryptionKey();
  const { generateCPT } = await import('./patientId');
  
  // Generate unique CPT
  const cpt = generateCPT();
  
  // Create patient record
  const patient: ClinicalPatient = {
    id: cpt,
    cpt: cpt,
    externalPatientId: data.externalPatientId,
    firstName: data.firstName,
    lastName: data.lastName,
    dateOfBirth: data.dateOfBirth,
    gender: data.gender,
    phone: data.phone,
    email: data.email,
    address: data.address,
    guardianName: data.guardianName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    visitCount: 1,
    isActive: true
  };
  
  // Create document with metadata
  const document = await createPatientDocument(patient);
  
  // Store encrypted
  await securePut(document, key);
  
  // Update cache
  patientCache.value.set(cpt, patient);
  
  // Log creation event
  const timelineService = await import('./clinicalTimeline');
  await timelineService.logEvent({
    id: `create_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    sessionId: 'system',
    type: 'patient_created',
    data: {
      patientCpt: cpt,
      action: 'initial_registration'
    },
    timestamp: Date.now()
  });
  
  console.log(`[PatientEngine] Registered new patient: ${cpt}`);
  
  return patient;
}
```

---

## 7. Offline Operation Support

### 7.1 Offline Capabilities

The patient identity system must support full offline operation:

- **CPT Generation** - Can generate new CPTs offline using crypto.getRandomValues
- **Patient Registration** - Can register new patients offline (stored in local encrypted DB)
- **Patient Lookup** - Can look up patients by CPT offline (reads from local encrypted DB)
- **Session Linking** - Can link patients to sessions offline
- **Queue for Sync** - All operations queued for synchronization when online

### 7.2 Offline Storage Layers

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ OFFLINE STORAGE LAYERS                                                                  │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: Memory Cache (Pinia Store)                                                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Purpose: Fast access to recently used patient data                                      │
│ Type: In-memory JavaScript Map                                                         │
│ Capacity: ~50 patients (recent)                                                        │
│ Persistence: Lost on app close                                                          │
│                                                                                         │
│ Structure:                                                                              │
│ {                                                                                       │
│   'CP-7F3A-K92Q': { id: 'CP-7F3A-K92Q', firstName: 'John', lastName: 'Doe', ... },  │
│   'CP-3B2D-M456': { id: 'CP-3B2D-M456', firstName: 'Jane', lastName: 'Smith', ... } │
│ }                                                                                       │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         │ cache miss
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: SecureDB (IndexedDB Wrapper)                                                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Purpose: Permanent encrypted storage                                                    │
│ Type: IndexedDB with AES-256 encryption                                                │
│ Capacity: Unlimited (device storage)                                                    │
│ Persistence: Permanent until deleted                                                    │
│                                                                                         │
│ Document Structure:                                                                    │
│ {                                                                                       │
│   _id: 'patient:CP-7F3A-K92Q',                                                        │
│   type: 'clinicalPatient',                                                             │
│   patient: { /* encrypted ClinicalPatient */ },                                        │
│   metadata: {                                                                           │
│     version: 1,                                                                         │
│     checksum: 'sha256-hash...',                                                         │
│     lastSync: timestamp                                                                 │
│   }                                                                                     │
│ }                                                                                       │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         │ sync needed
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: Sync Queue (pending operations)                                               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Purpose: Queue operations for when online                                              │
│ Type: IndexedDB queue                                                                   │
│ Capacity: Unlimited (queue)                                                            │
│ Persistence: Until sync complete                                                        │
│                                                                                         │
│ Operation Structure:                                                                   │
│ {                                                                                       │
│   id: 'op_12345',                                                                      │
│   type: 'create' | 'update' | 'delete',                                                │
│   payload: { ... },                                                                    │
│   timestamp: Date.now(),                                                                │
│   retries: 0,                                                                          │
│   status: 'pending' | 'syncing' | 'failed'                                             │
│ }                                                                                       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. QR Code Integration (Future Enhancement)

### 8.1 QR Code Format

QR codes encode the CPT in a standardized format for easy scanning:

```typescript
/**
 * QR Code content format
 * 
 * Format: HEALTHBRIDGE:CPT:CP-XXXX-XXXX
 * Version: 1
 * 
 * Example: HEALTHBRIDGE:CPT:CP-7F3A-K92Q
 */
export interface QRCodeContent {
  format: 'HEALTHBRIDGE:CPT';
  version: number;
  cpt: string;
  timestamp: number; // When QR was generated
}

/**
 * Generate QR code content from patient
 */
export function generateQRContent(patient: ClinicalPatient): string {
  const content: QRCodeContent = {
    format: 'HEALTHBRIDGE:CPT',
    version: 1,
    cpt: patient.cpt,
    timestamp: Date.now()
  };
  
  return JSON.stringify(content);
}

/**
 * Parse QR code content
 */
export function parseQRContent(raw: string): {
  cpt: string | null;
  error?: string;
} {
  try {
    const content = JSON.parse(raw) as QRCodeContent;
    
    if (content.format !== 'HEALTHBRIDGE:CPT') {
      return { cpt: null, error: 'Invalid QR code format' };
    }
    
    if (!content.cpt) {
      return { cpt: null, error: 'Missing CPT in QR code' };
    }
    
    // Validate CPT format
    const validation = validateCPTFormat(content.cpt);
    if (!validation.isValid) {
      return { cpt: null, error: validation.error };
    }
    
    return { cpt: content.cpt };
  } catch {
    return { cpt: null, error: 'Invalid QR code content' };
  }
}
```

### 8.2 QR Code Lookup Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ QR CODE PATIENT LOOKUP FLOW                                                             │
└────────────────────────────────────────────────────────────────────────────────────────┘

      ┌───────────────┐
      │  Scan QR     │──────────┌────────────────────────────────────────────────────────┐
      │  Code        │          │ QR Content: HEALTHBRIDGE:CPT:CP-7F3A-K92Q              │
      └───────┬───────┘          └────────────────────────────────────────────────────────┘
              │
              │ parseQRContent()
              ▼
      ┌───────────────┐                    ┌─────────────────────────────────────────────┐
      │ Validate QR   │                    │ Extract CPT from parsed content             │
      │ Format       │                    │ - Verify format: HEALTHBRIDGE:CPT           │
      └───────┬───────┘                    │ - Validate CPT format                       │
              │                            │ - Return normalized CPT                      │
              │ valid                      └─────────────────────────────────────────────┘
              ▼
      ┌───────────────┐                    ┌─────────────────────────────────────────────┐
      │ Extract CPT   │                    │ Note: Same lookup flow as manual entry     │
      └───────┬───────┘                    │ Uses findPatientByCPT() internally          │
              │                            └─────────────────────────────────────────────┘
              │ findPatientByCPT(cpt)
              ▼
      ┌───────────────┐
      │ Patient Found?│──────────┐                         ┌─────────────────────────────┐
      └───────┬───────┘          │                         │ Follows exact same path    │
              │                  │                         │ as manual CPT entry         │
              │                  ▼                         │ - Cache check              │
              │          ┌───────────────┐                 │ - SecureDB lookup          │
              │          │ Yes           │                 │ - Checksum verification    │
              │          └───────┬───────┘                 │ - Return result            │
              │                  │                         └─────────────────────────────┘
              │                  ▼
              │          ┌───────────────┐
              │          │ Load Patient  │
              │          │ Proceed with  │
              │          │ Session        │
              │          └───────────────┘
              │
              ▼
      ┌───────────────┐
      │ No            │──────────┌────────────────────────────────────────────────────────┐
      └───────┬───────┘          │ UX Options:                                                            │
              │                  │ - "Patient not found" error                                         │
              │                  │ - Prompt to register as new patient                                  │
              │                  │ - Verify CPT with patient before registration                        │
              │                  └────────────────────────────────────────────────────────┘
```

---

## 9. High-Level System Architecture

### 9.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          CLINICAL PATIENT TOKEN SYSTEM                                │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                     │
│  │   Dashboard     │  │  Registration   │  │   Patient       │                     │
│  │   Component     │  │   Form Vue      │  │   Card Vue      │                     │
│  │   + QR Scanner  │  │                 │  │                 │                     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘                     │
│           │                     │                     │                               │
│           └─────────────────────┼─────────────────────┘                               │
│                                 │                                                   │
│                                 ▼                                                   │
│                    ┌─────────────────────────────────┐                              │
│                    │    Vue Composables Layer        │                              │
│                    │  usePatient | usePatientLookup  │                              │
│                    │           + useQRScanner         │                              │
│                    └─────────────────────────────────┘                              │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              APPLICATION LAYER                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐│
│  │                          Patient Engine Service                                 ││
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 ││
│  │  │  registerPatient │  │ findPatient    │  │ linkToSession   │                 ││
│  │  │  + lookup first │  │ + by CPT       │  │ + update        │                 ││
│  │  │                 │  │ + by ext ID    │  │   lastSeenAt   │                 ││
│  │  │                 │  │ + by name/DOB  │  │ + log timeline │                 ││
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘                 ││
│  └─────────────────────────────────────────────────────────────────────────────────┘│
│                                         │                                           │
│                    ┌────────────────────┼────────────────────┐                      │
│                    ▼                    ▼                    ▼                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                     │
│  │   CPT Generator  │  │   Session       │  │   Timeline      │                     │
│  │   Service       │  │   Engine        │  │   Service       │                     │
│  │   + normalize   │  │                 │  │                 │                     │
│  │   + validate    │  │                 │  │                 │                     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐│
│  │                         Secure Database (IndexedDB)                             ││
│  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐   ││
│  │  │  Patient Documents │  │  Session Documents │  │  Form Instances     │   ││
│  │  │  - Encrypted JSON  │  │  - Encrypted JSON  │  │  - Encrypted JSON  │   ││
│  │  │  - _id: patient:CP-│  │  - _id: session:xx │  │  - _id: form:xxx   │   ││
│  │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐│
│  │                         Local Cache (Pinia Store)                               ││
│  │  ┌─────────────────────┐  ┌─────────────────────┐                              ││
│  │  │  patientCache       │  │  cptValidationCache │                              ││
│  │  │  - Map<CPT, Patient │  │  - Set<ValidCPTs>  │                              ││
│  │  └─────────────────────┘  └─────────────────────┘                              ││
│  └─────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐│
│  │                         Sync Queue (Offline Operations)                        ││
│  │  ┌─────────────────────┐                                                      ││
│  │  │  pendingOperations  │  - create | update | delete                          ││
│  │  │  - Queue for sync  │  - Auto-sync when online                              ││
│  │  └─────────────────────┘                                                      ││
│  └─────────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. API Reference

### 10.1 Patient Engine API

```typescript
export interface IPatientEngine {
  // Registration (always attempts lookup first)
  registerPatient(data: PatientRegistrationData): Promise<ClinicalPatient>;
  
  // Lookup (follows priority order)
  findPatient(criteria: PatientSearchCriteria): Promise<PatientLookupResult>;
  findPatientByCPT(cpt: string): Promise<PatientLookupResult>;
  findPatientByExternalId(externalId: string): Promise<PatientLookupResult>;
  findPatientByNameAndDOB(name: string, dob: string): Promise<PatientLookupResult>;
  
  // Update
  updatePatient(cpt: string, updates: Partial<PatientRegistrationData>): Promise<ClinicalPatient>;
  
  // Session Integration
  linkPatientToSession(sessionId: string, patientCpt: string): Promise<void>;
  
  // Utilities
  getPatientStatistics(): Promise<PatientStatistics>;
  normalizeCPTInput(input: string): { normalized: string; isValid: boolean; error?: string };
  clearCache(): void;
}
```

### 10.2 CPT Generator API

```typescript
export interface ICPTGenerator {
  // Generation
  generateCPT(): string;
  generateCPTBatch(count: number): string[];
  
  // Validation
  validateCPTFormat(cpt: string): { isValid: boolean; error?: string };
  
  // Normalization
  normalizeCPTInput(input: string): { normalized: string; isValid: boolean; error?: string };
}
```

### 10.3 QR Scanner API

```typescript
export interface IQRScanner {
  // QR Code Operations
  generateQRContent(patient: ClinicalPatient): string;
  parseQRContent(raw: string): { cpt: string | null; error?: string };
  
  // Scanner Controls
  startScanning(): Promise<void>;
  stopScanning(): void;
  onScan(callback: (content: string) => void): void;
}
```

---

## 11. Security Considerations

### 11.1 Privacy Principles

1. **Data Minimization** - Only collect data necessary for clinical workflow
2. **Encryption** - AES-256-GCM for data at rest
3. **Access Control** - CPT alone cannot reveal identity (no PHI in token)
4. **Audit Trail** - All access logged for 7 years

### 11.2 Tamper Detection

```typescript
/**
 * Verify document integrity using checksum
 */
async function verifyDocumentIntegrity(
  document: PatientDocument
): Promise<{ isTampered: boolean; reason?: string }> {
  const { checksum, ...patientWithoutChecksum } = document.metadata;
  
  const calculatedChecksum = await calculateChecksum(patientWithoutChecksum);
  
  if (calculatedChecksum !== checksum) {
    return {
      isTampered: true,
      reason: 'Checksum mismatch - document may have been modified'
    };
  }
  
  // Verify CPT format hasn't been altered
  const cptValidation = validateCPTFormat(document.patient.id);
  if (!cptValidation.isValid) {
    return {
      isTampered: true,
      reason: 'CPT format validation failed'
    };
  }
  
  return { isTampered: false };
}
```

---

## 12. Implementation Checklist

### 12.1 Core Services

- [ ] Create `app/types/patient.ts`
  - [ ] ClinicalPatient interface with all required fields
  - [ ] PatientDocument type from Zod schema
  - [ ] PatientRegistrationData interface
  - [ ] PatientLookupResult type
  - [ ] PatientSearchCriteria interface

- [ ] Create `app/services/patientId.ts`
  - [ ] generateCPT() function
  - [ ] validateCPTFormat() function
  - [ ] normalizeCPTInput() function
  - [ ] Collision detection
  - [ ] Unit tests

- [ ] Create `app/services/patientEngine.ts`
  - [ ] registerPatient() with lookup-first logic
  - [ ] findPatient() with priority order
  - [ ] findPatientByCPT() function
  - [ ] findPatientByExternalId() function
  - [ ] findPatientByNameAndDOB() function
  - [ ] updatePatient() with lastSeenAt tracking
  - [ ] linkPatientToSession() with timeline logging
  - [ ] Search functionality

### 12.2 QR Code Integration

- [ ] Create `app/services/qrScanner.ts`
  - [ ] generateQRContent() function
  - [ ] parseQRContent() function
  - [ ] Scanner integration

- [ ] Create `app/components/ui/QRScanner.vue`
  - [ ] Camera access
  - [ ] QR code detection
  - [ ] Callback on scan

### 12.3 State Management

- [ ] Update `app/stores/patient.ts`
  - [ ] Pinia store definition
  - [ ] State properties
  - [ ] Getters
  - [ ] Actions with offline support

### 12.4 UI Components

- [ ] Patient Card Component
  - [ ] Display patient info
  - [ ] Show CPT
  - [ ] Show QR code
  - [ ] Print-friendly version

- [ ] Returning Patient Form
  - [ ] CPT input field
  - [ ] Validation
  - [ ] Lookup handler
  - [ ] Error handling
  - [ ] QR code scanner integration

- [ ] Registration Form Updates
  - [ ] Patient creation on submit
  - [ ] Link to session

### 12.5 Testing

- [ ] Unit tests for CPT generator (normalization, validation)
- [ ] Unit tests for lookup priority
- [ ] Integration tests for patient engine
- [ ] E2E tests for registration flow
- [ ] E2E tests for lookup flow
- [ ] E2E tests for QR code scanning

---

## 13. References

| Document | Location |
|----------|----------|
| Patient ID Specification | [patient-id.md](../specs/patient-id.md) |
| Session Lifecycle | [SESSION_LIFECYCLE.md](../Lifecycles/SESSION_LIFECYCLE.md) |
| Session Engine | `app/services/sessionEngine.ts` |
| SecureDB Service | `app/services/secureDb.ts` |
| Timeline Service | `app/services/clinicalTimeline.ts` |

---

**End of Document**
