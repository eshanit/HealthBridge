# 📘 Patient Identity & Lookup System

**Unified Patient Identity & Return Visit System for Nurse Mobile**

---

## 1. Purpose

The HealthBridge Nurse Mobile application is a **clinical workflow assistant** that helps nurses follow WHO IMCI protocols with AI, structured forms, and decision support.

The patient lookup system must support:

- **Return patients** - Quick lookup for patients returning for follow-up visits
- **Offline clinics** - Works without network connectivity
- **Multiple nurses** - Shared patient data across devices
- **No re-registration** - Patients keep their ID across visits
- **Manual lookup** - Fast manual entry when QR is unavailable

---

## 2. Patient ID Format (4-Digit CPT)

### 2.1 Why 4-Digits?

A shorter 4-digit patient ID is more practical for frontline nurses managing long queues of patients in busy hospital or clinic environments:

| Benefit | Description |
|---------|-------------|
| **Fast Manual Entry** | 4 digits can be typed quickly on mobile keyboards |
| **Reduced Errors** | Shorter IDs have fewer input mistakes |
| **Queue Management** | Quick lookup essential for high-volume patient flow |
| **Memory Friendly** | Staff can remember frequent patients' IDs |

### 2.2 Format Specification

```
CPT: ABCD
```

- **Length**: Exactly 4 characters
- **Case**: Uppercase (system auto-converts)
- **Character Set**: 32 valid characters (excludes confusing characters)
- **Format**: Pure alphanumeric (no dashes, prefixes, or separators)

### 2.3 Valid Characters

The CPT uses a carefully curated character set that excludes visually ambiguous characters:

```
ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```

**Excluded Characters** (to avoid confusion):
- `I` - looks like `1` and `l`
- `O` - looks like `0`
- `0` - looks like `O`
- `1` - looks like `I` and `l`

---

## 3. ID Generator

### File: `services/cptService.ts`

```ts
/**
 * CPT Generation Service
 * Generates unique 4-character patient lookup identifiers
 * 
 * CPT Format: 4 characters, uppercase alphanumeric
 * Excludes visually ambiguous characters (I, O, 0, 1)
 * Character set: A-Z (except I,O) + 2-9 (except 0,1)
 */

const PERMITTED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generates a random CPT code conforming to the specification
 * Does not guarantee uniqueness - uniqueness must be verified by caller
 */
export function generateCpt(): string {
  const chars = PERMITTED_CHARS;
  const length = 4;
  
  const result = Array.from({ length }, () => {
    const randomIndex = Math.floor(Math.random() * chars.length);
    return chars[randomIndex];
  });
  
  return result.join('');
}

/**
 * Generates a unique CPT and verifies it does not exist in the database
 * Returns a promise resolving to a unique CPT string
 * Throws error after maximum retry attempts exceeded
 */
export async function generateUniqueCpt(
  existsFn: (cpt: string) => Promise<boolean>,
  maxRetries: number = 10
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const candidate = generateCpt();
    const exists = await existsFn(cpt);
    
    if (!exists) {
      return candidate;
    }
  }
  
  throw new Error('Failed to generate unique CPT after maximum retry attempts');
}
```

---

## 4. Validation Rules

### File: `services/patientId.ts`

The system includes validation for the 4-digit CPT format:

```ts
/**
 * Validate 4-character CPT format (for rapid lookup)
 * 
 * @param cpt CPT string to validate
 * @returns Validation result with isValid flag and optional error
 */
export function validateShortCPTFormat(cpt: string): CPTValidationResult {
  const normalized = cpt.trim().toUpperCase().replace(/\s/g, '');
  
  // Check length (exactly 4 characters)
  if (normalized.length !== 4) {
    return { 
      isValid: false, 
      error: `Short CPT must be 4 characters (got ${normalized.length})` 
    };
  }
  
  // Validate each character
  for (const char of normalized) {
    if (!isValidCPTChar(char)) {
      return { 
        isValid: false, 
        error: `Invalid character '${char}' in CPT` 
      };
    }
  }
  
  return {
    isValid: true,
    formattedCPT: normalized
  };
}

/**
 * Validates a CPT string against the specification
 * Returns true if valid, false otherwise
 */
export function isValidCpt(cpt: string): boolean {
  if (!cpt || typeof cpt !== 'string') return false;
  if (cpt.length !== 4) return false;
  
  const permittedChars = new Set(PERMITTED_CHARS);
  return cpt.split('').every(char => permittedChars.has(char));
}

/**
 * Normalizes a CPT string to uppercase and validates
 * Returns normalized CPT or null if invalid
 */
export function normalizeCpt(input: string): string | null {
  const normalized = input.toUpperCase().trim();
  return isValidCpt(normalized) ? normalized : null;
}
```

### Validation Rules Summary

| Rule | Description |
|------|-------------|
| **Length** | Exactly 4 characters |
| **Case** | Auto-converted to uppercase |
| **Characters** | Only A-Z (excluding I,O) and 2-9 (excluding 0,1) |
| **Whitespace** | Trimmed and ignored |
| **Format** | Pure alphanumeric - no dashes or separators |

---

## 5. Input Requirements

### 5.1 User Input Guidelines

- Enter exactly 4 characters
- Use only valid characters (A-Z, 2-9 excluding I, O, 0, 1)
- System auto-converts to uppercase
- No spaces, dashes, or special characters needed

### 5.2 Valid Examples

| Input | Normalized | Valid |
|-------|------------|-------|
| `abcd` | `ABCD` | ✅ Yes |
| `ABCD` | `ABCD` | ✅ Yes |
| `  AB12  ` | `AB12` | ✅ Yes |
| `WXYZ` | `WXYZ` | ✅ Yes |
| `7890` | `7890` | ✅ Yes |

### 5.3 Invalid Examples

| Input | Reason |
|-------|--------|
| `AB` | Too short (only 2 characters) |
| `ABCD1` | Too long (5 characters) |
| `ABCI` | Contains invalid character 'I' |
| `ABCO` | Contains invalid character 'O' |
| `AB01` | Contains invalid character '0' and '1' |

---

## 6. Patient Data Model

### File: `types/patient.ts`

```ts
export interface ClinicalPatient {
  cpt: string;              // 4-character CPT identifier
  externalPatientId?: string; // hospital MRN if available
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  createdAt: string;
  lastSeenAt?: string;
}
```

---

## 7. Storage Layer

### File: `services/patientEngine.ts`

```ts
import { generateCpt, validateShortCPTFormat } from './patientId';
import { generateUniqueCpt } from './cptService';
import type { ClinicalPatient } from '~/types/patient';
import { securePut, secureGet } from './secureDb';
import { useSecurityStore } from '~/stores/security';

export async function createPatient(data: Partial<ClinicalPatient>) {
  const security = useSecurityStore();
  if (!security.encryptionKey) throw new Error('DB locked');

  const patient: ClinicalPatient = {
    cpt: generateCpt(),  // Generates 4-character CPT
    createdAt: new Date().toISOString(),
    ...data
  };

  await securePut(
    { _id: `patient:${patient.cpt}`, type: 'clinicalPatient', ...patient },
    security.encryptionKey
  );

  return patient;
}

export async function getPatient(cpt: string) {
  const security = useSecurityStore();
  if (!security.encryptionKey) throw new Error('DB locked');

  // Validate format first
  const validation = validateShortCPTFormat(cpt);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  return await secureGet(`patient:${cpt}`, security.encryptionKey);
}
```

---

## 8. Entry Paths

### 8.1 New Patient

```
Start Session
→ Registration Form
→ createPatient()
→ Assign 4-character CPT
→ Show patient card
→ Continue to assessment
```

```ts
const patient = await createPatient(formData.value);
await updateSession(session.id, { patientId: patient.cpt });
```

---

### 8.2 Returning Patient

UI:

```
[ New Patient ]
[ Returning Patient ]
```

Flow:

```
Enter CPT (manual entry)
→ validateShortCPTFormat(cpt)
→ getPatient(cpt)
→ Create new session
→ Attach patient CPT
→ Skip registration
→ Assessment
```

---

## 9. Patient Card Screen

```
-------------------------
Name: Sarah M
CPT: AB12
-------------------------
"Please bring this card for your next visit"
```

This is the **only permanent identifier** the patient keeps.

---

## 10. Why 4-Digits Works

| Problem | Solution |
|---------|----------|
| Re-registration | CPT lookup (4 chars) |
| Offline clinics | Local generation |
| Multiple nurses | Session-based |
| No EMR access | External ID optional |
| Manual search | Fast 4-char entry |

---

## 11. Architecture Separation

| Layer | Responsibility |
|-------|----------------|
| Patient | Identity only |
| Session | Workflow lifecycle |
| Form | WHO + AI clinical logic |

---

## 12. Technical Considerations

### 12.1 Entropy & Uniqueness

With a 4-character format using 32 valid characters per position:
- **Total combinations**: 32^4 = 1,048,576 possible CPTs
- **Collision probability**: Very low for typical clinic volumes
- **Uniqueness**: Verified at generation time against existing patients

### 12.2 Use with Sessions

```ts
interface ClinicalSession {
  id: string;
  patientCpt?: string;    // 4-character CPT for patient lookup
  patientId?: string;
  patientName?: string;
  // ...
}
```

---

## 13. Future Enhancements (Not Required Now)

- QR code generation and scanning
- Patient timeline/history view
- Merge duplicate CPTs
- Hospital EMR system linking

---

**End of Spec**
