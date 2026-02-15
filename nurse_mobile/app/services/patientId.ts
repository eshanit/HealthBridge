/**
 * Clinical Patient Token (CPT) Generator Service
 * 
 * Generates unique, human-readable patient identifiers for the HealthBridge
 * clinical workflow system. Supports offline generation and follows the
 * CP-XXXX-XXXX format.
 * 
 * Features:
 * - Cryptographically secure random generation
 * - No confusing characters (I, O, 0, 1)
 * - Local generation for offline support
 * - Collision detection
 * - Deterministic for testing
 */

import { ref } from 'vue';
import type { CPTValidationResult } from '~/types/patient';

// ============================================
// Constants
// ============================================

/**
 * Valid CPT characters (excludes confusing characters I, O, 0, 1)
 */
export const CPT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * CPT prefix
 */
export const CPT_PREFIX = 'CP';

/**
 * Block length (4 characters per block)
 */
export const CPT_BLOCK_LENGTH = 4;

/**
 * Full CPT length (CP + 4 + 4 = 11 characters)
 */
export const CPT_LENGTH = 11;

// ============================================
// State
// ============================================

/**
 * Track generated CPTs in current session to avoid duplicates
 */
const generatedCPTs = ref<Set<string>>(new Set());

/**
 * Testing mode flag - when true, uses deterministic generation
 */
const isTestingMode = ref(false);

/**
 * Seed for deterministic testing
 */
let testSeed = 0;

// ============================================
// Character Set Validation
// ============================================

/**
 * Check if a character is valid for CPT
 */
export function isValidCPTChar(char: string): boolean {
  return CPT_ALPHABET.includes(char.toUpperCase());
}

/**
 * Validate all characters in a string
 */
export function validateCPTChars(cpt: string): boolean {
  const normalized = cpt.replace(/-/g, '');
  for (const char of normalized) {
    if (!isValidCPTChar(char)) {
      return false;
    }
  }
  return true;
}

// ============================================
// Random Generation
// ============================================

/**
 * Generate a cryptographically secure random number
 */
function getSecureRandom(): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0]! / (0xFFFFFFFF + 1);
}

/**
 * Generate a single CPT block (4 characters)
 */
function generateBlock(): string {
  let block = '';
  for (let i = 0; i < CPT_BLOCK_LENGTH; i++) {
    const randomIndex = Math.floor(getSecureRandom() * CPT_ALPHABET.length);
    block += CPT_ALPHABET[randomIndex];
  }
  return block;
}

/**
 * Generate a deterministic block (for testing)
 */
function generateBlockDeterministic(seed: number): string {
  // Simple LCG for deterministic generation
  const lcg = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  
  let block = '';
  for (let i = 0; i < CPT_BLOCK_LENGTH; i++) {
    const randomIndex = Math.floor(lcg() * CPT_ALPHABET.length);
    block += CPT_ALPHABET[randomIndex];
  }
  return block;
}

// ============================================
// Main Generator Functions
// ============================================

/**
 * Generate a unique Clinical Patient Token (CPT)
 * 
 * Format: CP-XXXX-XXXX (11 characters)
 * - Prefix: CP
 * - Two blocks of 4 characters each
 * - No confusing characters: I, O, 0, 1
 * 
 * @returns A unique CPT string
 * @throws Error if unable to generate unique CPT after maximum attempts
 */
export function generateCPT(): string {
  let maxAttempts = 10;
  let cpt = '';
  
  do {
    if (isTestingMode.value) {
      // Deterministic generation for testing
      const block1 = generateBlockDeterministic(testSeed++);
      const block2 = generateBlockDeterministic(testSeed++);
      cpt = `${CPT_PREFIX}-${block1}-${block2}`;
    } else {
      // Cryptographically random for production
      const block1 = generateBlock();
      const block2 = generateBlock();
      cpt = `${CPT_PREFIX}-${block1}-${block2}`;
    }
    maxAttempts--;
  } while (generatedCPTs.value.has(cpt) && maxAttempts > 0);
  
  if (generatedCPTs.value.has(cpt)) {
    throw new Error('Failed to generate unique CPT after maximum attempts');
  }
  
  // Track generated CPTs in current session
  generatedCPTs.value.add(cpt);
  
  return cpt;
}

/**
 * Generate multiple CPTs for batch operations
 * 
 * @param count Number of CPTs to generate
 * @returns Array of unique CPTs
 */
export function generateCPTBatch(count: number): string[] {
  const cpts: string[] = [];
  for (let i = 0; i < count; i++) {
    cpts.push(generateCPT());
  }
  return cpts;
}

// ============================================
// Validation Functions
// ============================================

/**
 * Validate CPT format
 * 
 * @param cpt CPT string to validate
 * @returns Validation result with isValid flag and optional error
 */
export function validateCPTFormat(cpt: string): CPTValidationResult {
  const normalized = cpt.trim().toUpperCase().replace(/\s/g, '');
  
  // Check minimum length
  if (normalized.length < CPT_LENGTH) {
    return { 
      isValid: false, 
      error: `CPT must be ${CPT_LENGTH} characters (got ${normalized.length})` 
    };
  }
  
  // Check prefix
  if (!normalized.startsWith(CPT_PREFIX)) {
    return { 
      isValid: false, 
      error: `CPT must start with '${CPT_PREFIX}'` 
    };
  }
  
  // Check format with dashes
  const pattern = /^CP([A-Z2-9]{4})-([A-Z2-9]{4})$/;
  const match = normalized.match(pattern);
  
  if (!match) {
    return { 
      isValid: false, 
      error: 'CPT must match format CP-XXXX-XXXX' 
    };
  }
  
  // Validate each character
  const chars = normalized.replace(/-/g, '');
  for (const char of chars) {
    if (!isValidCPTChar(char)) {
      return { 
        isValid: false, 
        error: `Invalid character '${char}' in CPT` 
      };
    }
  }
  
  return {
    isValid: true,
    formattedCPT: `CP-${match[1]}-${match[2]}`
  };
}

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
 * Quick check if a string looks like a valid CPT
 */
export function looksLikeCPT(input: string): boolean {
  const normalized = input.trim().toUpperCase().replace(/\s/g, '');
  return /^CP[A-Z2-9]{8}$/.test(normalized);
}

// ============================================
// Input Sanitization
// ============================================

/**
 * Sanitize user input to valid CPT format
 * 
 * - Converts to uppercase
 * - Removes invalid characters
 * - Auto-inserts dashes
 * - Limits to valid length
 * 
 * @param input Raw user input
 * @returns Sanitized CPT string
 */
export function sanitizeCPTInput(input: string): string {
  let sanitized = input.toUpperCase();
  
  // Remove invalid characters (keep alphanumeric)
  sanitized = sanitized.replace(/[^A-Z0-9]/g, '');
  
  // Remove confusing characters
  sanitized = sanitized.replace(/[IO01]/g, '');
  
  // Ensure starts with CP
  if (sanitized.length >= 2 && !sanitized.startsWith('CP')) {
    sanitized = 'CP' + sanitized.slice(2);
  } else if (sanitized.length < 2) {
    sanitized = 'CP' + sanitized.slice(2);
  }
  
  // Insert dashes at correct positions
  if (sanitized.length > 6) {
    const firstBlock = sanitized.slice(2, 6);
    const rest = sanitized.slice(6);
    sanitized = `CP-${firstBlock}-${rest}`;
  }
  
  // Limit to valid length
  return sanitized.slice(0, 11);
}

// ============================================
// Testing Utilities
// ============================================

/**
 * Enable testing mode with deterministic generation
 */
export function enableTestingMode(seed?: number): void {
  isTestingMode.value = true;
  testSeed = seed ?? 0;
  generatedCPTs.value.clear();
}

/**
 * Disable testing mode (use secure random)
 */
export function disableTestingMode(): void {
  isTestingMode.value = false;
  testSeed = 0;
}

/**
 * Reset CPT generation cache
 */
export function resetCPTGenerationCache(): void {
  generatedCPTs.value.clear();
}

/**
 * Set testing seed
 */
export function setTestSeed(seed: number): void {
  testSeed = seed;
}

// ============================================
// Entropy Analysis
// ============================================

/**
 * Calculate entropy bits for CPT
 * 
 * Per character: log2(32) = 5 bits
 * Per block (4 chars): 20 bits
 * Full CPT (2 blocks): 40 bits
 */
export function calculateCPTEntropy(): number {
  const charsPerBlock = CPT_BLOCK_LENGTH;
  const blocks = 2;
  const charSetSize = CPT_ALPHABET.length;
  
  const bitsPerBlock = charsPerBlock * Math.log2(charSetSize);
  return bitsPerBlock * blocks;
}

/**
 * Calculate collision probability
 * 
 * @param n Number of CPTs to generate
 * @returns Probability of collision (birthday attack)
 */
export function calculateCollisionProbability(n: number): number {
  // P ≈ n² / (2 × 32^8) for CPT
  // Simplified birthday problem calculation
  const totalCombinations = Math.pow(CPT_ALPHABET.length, CPT_BLOCK_LENGTH * 2);
  return (n * (n - 1)) / (2 * totalCombinations);
}

// ============================================
// Named Exports
// ============================================

export {
  generatedCPTs as _generatedCPTsCache,
  isTestingMode as _isTestingMode
};

// Re-export for convenience
export type { CPTValidationResult } from '~/types/patient';
