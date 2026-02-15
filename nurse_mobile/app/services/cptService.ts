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
    const exists = await existsFn(candidate);
    
    if (!exists) {
      return candidate;
    }
  }
  
  throw new Error('Failed to generate unique CPT after maximum retry attempts');
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
