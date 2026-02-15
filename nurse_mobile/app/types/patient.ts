/**
 * Clinical Patient Types
 * 
 * Type definitions for patient identity and registration.
 * Supports the Clinical Patient Token (CPT) system for offline-first
 * patient management in the HealthBridge workflow.
 */

import { z } from 'zod';

// ============================================
// Zod Schemas
// ============================================

/**
 * Patient gender enum schema
 */
export const PatientGenderSchema = z.enum(['male', 'female', 'other']);

/**
 * Patient address schema
 */
export const PatientAddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional()
});

/**
 * Emergency contact schema
 */
export const EmergencyContactSchema = z.object({
  name: z.string(),
  relationship: z.string(),
  phone: z.string()
});

/**
 * Insurance information schema
 */
export const InsuranceInfoSchema = z.object({
  provider: z.string().optional(),
  policyNumber: z.string().optional(),
  groupNumber: z.string().optional()
});

/**
 * Medical history entry schema
 */
export const MedicalHistoryEntrySchema = z.object({
  id: z.string(),
  condition: z.string(),
  dateDiagnosed: z.string().optional(),
  notes: z.string().optional()
});

/**
 * Allergy schema
 */
export const AllergySchema = z.object({
  id: z.string(),
  allergen: z.string(),
  severity: z.enum(['mild', 'moderate', 'severe']),
  reaction: z.string().optional()
});

/**
 * Medication schema
 */
export const MedicationSchema = z.object({
  id: z.string(),
  name: z.string(),
  dosage: z.string().optional(),
  frequency: z.string().optional(),
  prescribedDate: z.string().optional(),
  active: z.boolean()
});

/**
 * Patient registration data schema (input)
 */
export const PatientRegistrationDataSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().optional(),
  gender: PatientGenderSchema.optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email format').optional().or(z.literal('')),
  address: PatientAddressSchema.optional(),
  emergencyContact: EmergencyContactSchema.optional(),
  insuranceInfo: InsuranceInfoSchema.optional(),
  medicalHistory: z.array(MedicalHistoryEntrySchema).optional(),
  allergies: z.array(AllergySchema).optional(),
  medications: z.array(MedicationSchema).optional(),
  weightKg: z.number().min(0.5, 'Weight must be at least 0.5kg').max(500, 'Weight must be less than 500kg').optional()
});

/**
 * Patient document schema (for storage)
 */
export const PatientDocumentSchema = z.object({
  _id: z.string(),
  _rev: z.string().optional(),
  type: z.literal('clinicalPatient'),
  patient: PatientRegistrationDataSchema.extend({
    id: z.string(), // CPT format
    cpt: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    lastVisit: z.string().optional(),
    visitCount: z.number().default(1),
    isActive: z.boolean().default(true)
  })
});

// ============================================
// TypeScript Types
// ============================================

export type PatientGender = z.infer<typeof PatientGenderSchema>;
export type PatientAddress = z.infer<typeof PatientAddressSchema>;
export type EmergencyContact = z.infer<typeof EmergencyContactSchema>;
export type InsuranceInfo = z.infer<typeof InsuranceInfoSchema>;
export type MedicalHistoryEntry = z.infer<typeof MedicalHistoryEntrySchema>;
export type Allergy = z.infer<typeof AllergySchema>;
export type Medication = z.infer<typeof MedicationSchema>;
export type PatientRegistrationData = z.infer<typeof PatientRegistrationDataSchema>;
export type PatientDocument = z.infer<typeof PatientDocumentSchema>;

/**
 * Clinical Patient - Core patient type with CPT identifier
 */
export interface ClinicalPatient {
  /** CPT identifier (format: CP-XXXX-XXXX) */
  id: string;
  
  /** CPT token for display */
  cpt: string;
  
  /** Patient personal information */
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: PatientGender;
  
  /** Vitals - optional weight in kilograms */
  weightKg?: number;
  
  /** Contact information */
  phone?: string;
  email?: string;
  address?: PatientAddress;
  
  /** Emergency contact */
  emergencyContact?: EmergencyContact;
  
  /** Insurance information */
  insuranceInfo?: InsuranceInfo;
  
  /** Medical information */
  medicalHistory?: MedicalHistoryEntry[];
  allergies?: Allergy[];
  medications?: Medication[];
  
  /** Metadata */
  createdAt: string;
  updatedAt: string;
  lastVisit?: string;
  visitCount: number;
  isActive: boolean;
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
  query?: string;
  cpt?: string;
  name?: string;
  phone?: string;
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

// ============================================
// CPT Format Types
// ============================================

/**
 * Valid CPT character set (excludes confusing characters)
 */
export const CPT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export type CPTChar = typeof CPT_ALPHABET[number];

/**
 * CPT validation result
 */
export interface CPTValidationResult {
  isValid: boolean;
  error?: string;
  formattedCPT?: string;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Generate full name from patient
 */
export function getPatientFullName(patient: ClinicalPatient): string {
  return `${patient.firstName} ${patient.lastName}`.trim();
}

/**
 * Format patient for display
 */
export function formatPatientDisplay(patient: ClinicalPatient): string {
  const name = getPatientFullName(patient);
  const age = patient.dateOfBirth ? calculateAge(patient.dateOfBirth) : null;
  const parts = [name];
  if (age) parts.push(`${age} years`);
  if (patient.gender) parts.push(patient.gender);
  return parts.join(' • ');
}

/**
 * Calculate age from date of birth
 */
export function calculateAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Calculate age in months from date of birth
 * Returns a human-readable format: "X months" or "X years Y months"
 */
export function calculateAgeInMonths(dateOfBirth: string): string {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  
  // Calculate total months
  let totalMonths = (today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth());
  
  // Adjust for days if needed
  if (today.getDate() < dob.getDate()) {
    totalMonths--;
  }
  
  // Ensure non-negative
  const months = Math.max(0, totalMonths);
  
  if (months < 12) {
    return `${months} month${months !== 1 ? 's' : ''} old`;
  } else {
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (remainingMonths === 0) {
      return `${years} year${years !== 1 ? 's' : ''} old`;
    }
    return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''} old`;
  }
}

/**
 * Get age in months as a number for calculations
 */
export function getAgeMonthsNumeric(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  
  const totalMonths = (today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth());
  
  if (today.getDate() < dob.getDate()) {
    return Math.max(0, totalMonths - 1);
  }
  
  return Math.max(0, totalMonths);
}

/**
 * Validate CPT format
 */
export function validateCPTFormat(cpt: string): CPTValidationResult {
  const normalized = cpt.trim().toUpperCase().replace(/\s/g, '');
  
  // Check prefix
  if (!normalized.startsWith('CP')) {
    return { isValid: false, error: 'CPT must start with "CP"' };
  }
  
  // Check format CP-XXXX-XXXX
  const pattern = /^CP([A-Z2-9]{4})([A-Z2-9]{4})$/;
  const match = normalized.match(pattern);
  
  if (!match) {
    return { isValid: false, error: 'CPT must match format CP-XXXX-XXXX' };
  }
  
  // Validate each character
  for (const char of normalized.replace(/-/g, '')) {
    if (!CPT_ALPHABET.includes(char)) {
      return { isValid: false, error: `Invalid character "${char}" in CPT` };
    }
  }
  
  return {
    isValid: true,
    formattedCPT: `CP-${match[1]}-${match[2]}`
  };
}

/**
 * Sanitize CPT input
 */
export function sanitizeCPTInput(input: string): string {
  let sanitized = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Remove confusing characters
  sanitized = sanitized.replace(/[IO01]/g, '');
  
  // Add dashes
  if (sanitized.length >= 2) {
    sanitized = 'CP' + sanitized.slice(2);
  }
  
  if (sanitized.length >= 6) {
    sanitized = `${sanitized.slice(0, 6)}-${sanitized.slice(6)}`;
  }
  
  return sanitized.slice(0, 11); // CP + 4 + 4 = 11 chars
}

/**
 * Check if patient has required fields
 */
export function isPatientComplete(patient: ClinicalPatient): boolean {
  return !!(
    patient.firstName &&
    patient.lastName &&
    patient.createdAt
  );
}

/**
 * Format patient for card display
 */
export function formatPatientCard(patient: ClinicalPatient): {
  name: string;
  details: string[];
  cpt: string;
} {
  const name = getPatientFullName(patient);
  const details: string[] = [];
  
  if (patient.dateOfBirth) {
    const age = calculateAge(patient.dateOfBirth);
    details.push(`${age} years`);
  }
  
  if (patient.gender) {
    details.push(patient.gender);
  }
  
  if (patient.phone) {
    details.push(patient.phone);
  }
  
  return {
    name,
    details,
    cpt: patient.cpt
  };
}
