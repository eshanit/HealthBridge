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
  patient_age_months: numberSchema.refine((val) => val >= 1 && val <= 59, "Age must be between 1-59 months"),
  patient_weight_kg: numberSchema.refine((val) => val >= 1 && val <= 99.9, "Weight must be between 1-99.9 kg"),
  chiefComplaint: z.string().min(3).max(200),
  dangerSigns: dangerSignsSchema,
  respiratoryRate: z.number().min(10).max(120),
  oxygenSaturation: oxygenSaturationSchema,
  temperature: temperatureSchema,
  palmorPallor: z.enum(['normal', 'mild', 'severe']),
  feedingStatus: z.enum(['breastfeeding', 'bottle', 'solid', 'poor', 'unable']),
  coughDuration: z.enum(['<3days', '3-7days', '1-2weeks', '>2weeks']),
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
