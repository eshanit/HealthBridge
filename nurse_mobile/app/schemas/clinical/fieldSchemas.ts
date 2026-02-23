/**
 * Clinical Field Zod Schemas
 * 
 * REQUIRED per ARCHITECTURE_RULES.md Section 2 - VALIDATION LAYER
 * 
 * All form validation MUST use these Zod schemas.
 * No manual validation logic in components.
 */

import { z } from 'zod';

// ============================================
// Common Validation Patterns
// ============================================

/**
 * Age validation for pediatric patients (2-59 months per WHO IMCI)
 */
export const pediatricAgeSchema = z.number()
  .min(2, "Child must be at least 2 months old")
  .max(59, "Child must be under 5 years (59 months)");

/**
 * Respiratory rate validation per WHO IMCI thresholds
 * Uses context-aware validation based on age
 */
export function createRespiratoryRateSchema(ageMonths: number) {
  const threshold = ageMonths < 12 ? 50 : 40;
  
  return z.number()
    .min(10, "Rate too low. Re-count for 60 seconds.")
    .max(120, "Rate too high. Verify measurement.")
    .refine(
      (value) => value <= threshold,
      (value) => ({
        message: `Fast breathing detected (>${threshold}/min). Consider pneumonia.`,
        path: ["respiratoryRate"]
      })
    );
}

/**
 * Oxygen saturation validation (90-100%)
 */
export const oxygenSaturationSchema = z.number()
  .min(0, "Saturation cannot be below 0%")
  .max(100, "Saturation cannot exceed 100%")
  .refine(
    (value) => value >= 90,
    "Oxygen saturation below 90% indicates hypoxemia - urgent assessment required"
  );

/**
 * Temperature validation (35-42°C)
 */
export const temperatureSchema = z.number()
  .min(35, "Temperature too low - check thermometer")
  .max(42, "Temperature too high - urgent assessment required")
  .refine(
    (value) => value <= 38.5,
    "High fever (>38.5°C) requires urgent attention"
  );

/**
 * Heart rate validation (age-adjusted ranges)
 */
export function createHeartRateSchema(ageMonths: number) {
  // Approximate normal ranges by age group
  const ranges: Record<number, { min: number; max: number }> = {
    2: { min: 100, max: 160 },   // 2-11 months
    12: { min: 90, max: 150 },   // 12-23 months
    24: { min: 80, max: 130 },   // 2-4 years
  };
  
  // Find appropriate range (default to 2-4 years range)
  let range: { min: number; max: number };
  if (ageMonths < 12) {
    range = ranges[2]!;
  } else if (ageMonths < 24) {
    range = ranges[12]!;
  } else {
    range = ranges[24]!;
  }

  return z.number()
    .min(range.min - 20, `Heart rate below ${range.min} may indicate bradycardia`)
    .max(range.max + 20, `Heart rate above ${range.max} may indicate tachycardia`);
}

// ============================================
// Danger Signs Schema (WHO IMCI)
// ============================================

export const dangerSignsSchema = z.object({
  unableToDrink: z.boolean(),
  vomitingEverything: z.boolean(),
  convulsions: z.boolean(),
  lethargic: z.boolean(),
  stridor: z.boolean(),
  cyanosis: z.boolean(),
  severePalmorPallor: z.boolean(),
})
.refine(
  (data) => {
    // If unable to drink, must assess consciousness
    if (data.unableToDrink && !data.lethargic) {
      return false;
    }
    return true;
  },
  {
    message: "If child is unable to drink, assess consciousness level",
    path: ["lethargic"]
  }
);

// ============================================
// Pediatric Respiratory Assessment Schema
// ============================================

// Helper for flexible number parsing (handles string inputs)
const numberSchema = z.union([
  z.number(),
  z.string().transform((val, ctx) => {
    const num = Number(val);
    if (isNaN(num)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Value must be a valid number'
      });
      return z.NEVER;
    }
    return num;
  })
]);

export const pediatricRespiratorySchema = z.object({
  // Patient identification
  patient_name: z.string()
    .min(1, "Patient name is required")
    .max(100, "Name too long"),
  patient_age_months: numberSchema
    .refine((val) => val >= 1 && val <= 59, "Age must be between 1-59 months"),
  patient_weight_kg: numberSchema
    .refine((val) => val >= 1 && val <= 99.9, "Weight must be between 1-99.9 kg"),
  
  // Chief complaint
  chiefComplaint: z.string()
    .min(3, "Please describe the main symptom")
    .max(200, "Chief complaint too long"),
  
  // Danger signs
  dangerSigns: dangerSignsSchema,
  
  // Respiratory assessment
  respiratoryRate: z.number().optional(),
  respiratoryRateCounted: z.boolean().optional(),
  chestIndrawing: z.boolean().optional(),
  stridor: z.boolean().optional(),
  
  // Oxygen saturation
  oxygenSaturation: oxygenSaturationSchema.optional(),
  onOxygen: z.boolean().optional(),
  
  // General assessment
  temperature: temperatureSchema.optional(),
  palmorPallor: z.enum(['normal', 'mild', 'severe']).optional(),
  
  // Nutrition
  feedingStatus: z.enum(['breastfeeding', 'bottle', 'solid', 'poor', 'unable']).optional(),
  
  // Cough and cold symptoms
  coughDuration: z.enum(['<3days', '3-7days', '1-2weeks', '>2weeks']).optional(),
  runnyNose: z.boolean().optional(),
  
  // Clinical notes
  clinicalNotes: z.string().max(500).optional(),
});

// Type inference
export type PediatricRespiratoryInput = z.infer<typeof pediatricRespiratorySchema>;

// ============================================
// Field-Level Schemas (for incremental validation)
// ============================================

export const schemas = {
  patient_name: z.string().min(1).max(100),
  patient_age_months: numberSchema.refine((val) => val >= 2 && val <= 59, "Age must be between 2-59 months"),
  patient_weight_kg: numberSchema.refine((val) => val >= 1 && val <= 99.9, "Weight must be between 1-99.9 kg"),
  chief_complaint: z.string().min(3).max(200),
  
  // Danger signs
  unable_to_drink: z.boolean(),
  vomits_everything: z.boolean(),
  convulsions: z.boolean(),
  lethargic_unconscious: z.boolean(),
  cough_present: z.boolean(),
  cough_duration_days: numberSchema.refine((val) => val >= 0 && val <= 90, "Duration must be 0-90 days"),
  fever_present: z.boolean(),
  resp_rate: numberSchema.refine((val) => val >= 10 && val <= 120, "Respiratory rate must be 10-120"),
  oxygen_sat: numberSchema.refine((val) => val >= 70 && val <= 100, "Oxygen saturation must be 70-100%"),
  retractions: z.boolean(),
  cyanosis: z.boolean(),
  
  // X-ray acquisition
  xray_view: z.enum(['PA', 'AP', 'Lateral', 'Other']),
  xray_quality: z.enum(['Good', 'Adequate', 'Poor']),
  xray_image_id: z.string().min(1).max(100),
  xray_image_url: z.string().min(1).max(500),
  xray_time: z.string(), // datetime string
  
  // AI triage
  ai_findings: z.array(z.string()),
  ai_confidence: numberSchema.refine((val) => val >= 0 && val <= 1, "AI confidence must be 0-1"),
  ai_urgency: z.enum(['Routine', 'Priority', 'Emergency']),
  ai_recommendation: z.string().max(1000).optional(),
  
  // Referral
  referral_required: z.boolean(),
  referral_urgency: z.enum(['Routine', 'Urgent', 'Emergency']).optional(),
  referral_reason: z.string().max(500).optional(),
  referral_facility: z.string().max(200).optional(),
  transport_arranged: z.boolean().optional(),
  
  // Admission
  admission_date: z.string(),
  admission_time: z.string(),
  admitting_diagnosis: z.string().min(1).max(200),
  admission_type: z.enum(['Emergency', 'Urgent', 'Elective', 'Transfer']),
  referred_from: z.string().max(200).optional(),
  
  // Treatment
  treatment_given: z.array(z.string()),
  treatment_response: z.enum(['Full Recovery', 'Partial Improvement', 'No Change', 'Deterioration']),
  clinical_progress: z.string().max(1000).optional(),
  complications_noted: z.string().max(500).optional(),
  treatment_duration_hours: numberSchema.refine((val) => val >= 0 && val <= 8760, "Duration must be 0-8760 hours"),
  
  // Discharge
  discharge_date: z.string(),
  discharge_time: z.string(),
  discharge_condition: z.enum(['Recovered', 'Improved', 'Stable', 'Unchanged', 'AMA']),
  discharge_diagnosis: z.string().min(1).max(200),
  summary_of_stay: z.string().min(1).max(2000),
  procedures_performed: z.string().max(1000).optional(),
  clinical_outcome: z.enum(['Discharged to home', 'Transferred to another facility', 'Deceased', 'AMA']),
  
  // Discharge medications
  discharge_meds_list: z.string().min(1).max(2000),
  medication_count: numberSchema.refine((val) => val >= 0 && val <= 20, "Must be 0-20 medications"),
  medications_verified: z.boolean(),
  
  // Patient education
  education_provided: z.boolean(),
  warning_signs_discussed: z.boolean(),
  red_flags_explained: z.boolean(),
  care_instructions_given: z.boolean(),
  caregiver_questions_answered: z.boolean(),
  
  // Follow-up
  follow_up_required: z.boolean(),
  follow_up_date: z.string().optional(),
  follow_up_facility: z.string().max(200).optional(),
  follow_up_provider: z.string().max(100).optional(),
  follow_up_reason: z.string().max(500).optional(),
  
  // Discharge checklist
  checklist_vitals_stable: z.boolean(),
  checklist_meds_reconciled: z.boolean(),
  checklist_documents_complete: z.boolean(),
  checklist_education_complete: z.boolean(),
  checklist_follow_up_scheduled: z.boolean(),
  
  // Discharge disposition
  discharge_disposition: z.enum(['Home', 'Transfer to hospital', 'Transfer to LTC', 'Against medical advice', 'Deceased']),
  discharge_destination: z.string().max(200).optional(),
  transport_mode: z.enum(['Walking', 'Private vehicle', 'Ambulance', 'Public transport', 'Taxi']).optional(),
  escort_required: z.boolean(),
  accompanying_person: z.string().max(100).optional(),
  
  // Sign-off
  caregiver_signoff: z.boolean(),
  caregiver_name: z.string().min(1).max(100),
  caregiver_relationship: z.enum(['Mother', 'Father', 'Grandmother', 'Grandfather', 'Guardian', 'Other']),
  signoff_datetime: z.string(),
  nurse_name: z.string().min(1).max(100),
  nurse_signature: z.boolean(),
  discharge_complete: z.boolean(),
};

// Helper to get schema for a specific field
export function getFieldSchema(fieldId: string): z.ZodTypeAny | undefined {
  return schemas[fieldId as keyof typeof schemas];
}

// ============================================
// Cross-Field Clinical Validation
// ============================================

/**
 * Pneumonia classification based on WHO IMCI criteria
 */
export const pneumoniaClassificationSchema = z.object({
  ageMonths: pediatricAgeSchema,
  respiratoryRate: z.number(),
  chestIndrawing: z.boolean(),
  dangerSigns: dangerSignsSchema,
}).superRefine((data, ctx) => {
  const threshold = data.ageMonths < 12 ? 50 : 40;
  const fastBreathing = data.respiratoryRate > threshold;
  
  // Severe pneumonia: any danger sign OR chest indrawing
  if (data.dangerSigns.unableToDrink || 
      data.dangerSigns.lethargic || 
      data.dangerSigns.convulsions ||
      data.chestIndrawing) {
    // This is severe - no additional refinement needed
    return;
  }
  
  // Pneumonia: fast breathing without severe signs
  if (fastBreathing && !data.chestIndrawing) {
    return;
  }
  
  // No pneumonia: not fast breathing and no chest indrawing
  if (!fastBreathing && !data.chestIndrawing) {
    return;
  }
  
  // If we get here, there's an inconsistency
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Clinical assessment inconsistent - please verify respiratory rate and chest indrawing",
    path: ["respiratoryRate"]
  });
});

export type PneumoniaClassificationInput = z.infer<typeof pneumoniaClassificationSchema>;
