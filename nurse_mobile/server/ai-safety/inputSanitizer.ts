/**
 * Input Sanitizer for AI Safety
 * 
 * Phase 4 Task 4.1.1: Sanitizes user input before sending to AI
 * Removes PHI, normalizes text, strips prompt injection attempts
 */

// ============================================
// Types & Interfaces
// ============================================

export interface SanitizationResult {
  /** Sanitized text safe for AI processing */
  sanitized: string;
  /** Items that were removed */
  removed: string[];
  /** Warning messages */
  warnings: string[];
  /** Whether the input was modified */
  wasModified: boolean;
}

export interface SanitizationOptions {
  /** Maximum allowed input length */
  maxLength?: number;
  /** Remove potential PHI patterns */
  removePHI?: boolean;
  /** Strip prompt injection attempts */
  stripInjection?: boolean;
  /** Escape markdown and HTML */
  escapeMarkup?: boolean;
  /** Normalize whitespace */
  normalizeWhitespace?: boolean;
}

// ============================================
// Patterns
// ============================================

/** Patterns that indicate prompt injection attempts */
const PROMPT_INJECTION_PATTERNS = [
  // Role manipulation
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|context)/gi,
  /you\s+are\s+(now|a|an)\s+/gi,
  /act\s+as\s+(if|a|an)\s+/gi,
  /pretend\s+(to\s+be|you\s+are)/gi,
  /forget\s+(all\s+)?(previous|above|prior)/gi,
  /disregard\s+(all\s+)?(previous|above|prior)/gi,
  
  // System override
  /system\s*:\s*/gi,
  /assistant\s*:\s*/gi,
  /user\s*:\s*/gi,
  /\[SYSTEM\]/gi,
  /\[ADMIN\]/gi,
  /\[OVERRIDE\]/gi,
  
  // Instruction injection
  /new\s+instructions?\s*:/gi,
  /override\s+instructions?\s*:/gi,
  /change\s+(your|the)\s+(behavior|output|response)/gi,
  
  // Data exfiltration attempts
  /print\s+(your|the)\s+(prompt|instructions|system)/gi,
  /show\s+(me\s+)?(your|the)\s+(prompt|instructions)/gi,
  /repeat\s+(your|the)\s+(prompt|instructions)/gi,
  /output\s+(your|the)\s+(prompt|instructions)/gi,
  
  // Delimiter attacks
  /<\|.*?\|>/g,  // Special tokens
  /\{\{.*?\}\}/g,  // Template injection
  /<%.*?%>/g,  // Code injection
];

/** Patterns that may indicate PHI (Protected Health Information) */
const PHI_PATTERNS = [
  // Names (basic pattern - capitalized words)
  /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
  
  // Dates of birth
  /\b(DOB|Date of Birth|Born)\s*:?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi,
  /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,
  
  // Phone numbers
  /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // Medical record numbers
  /\b(MRN|Medical Record|Patient ID)\s*:?\s*[A-Z0-9-]+\b/gi,
  
  // Social Security (basic pattern)
  /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  
  // Addresses (basic pattern)
  /\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr)\b/gi,
];

/** Patterns for dangerous markup */
const DANGEROUS_MARKUP = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^>]*>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,  // Event handlers
];

// ============================================
// Sanitization Functions
// ============================================

/**
 * Remove prompt injection patterns from text
 */
function stripPromptInjection(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  let result = text;
  
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    const matches = result.match(pattern);
    if (matches) {
      removed.push(...matches);
      result = result.replace(pattern, '[REMOVED]');
    }
  }
  
  return { text: result, removed };
}

/**
 * Remove PHI patterns from text
 */
function removePHI(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  let result = text;
  
  for (const pattern of PHI_PATTERNS) {
    const matches = result.match(pattern);
    if (matches) {
      // Only add non-generic matches
      const significantMatches = matches.filter(m => 
        !/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(m) || // Skip generic names
        m.includes('DOB') || 
        m.includes('MRN') ||
        m.includes('@')
      );
      removed.push(...significantMatches);
      result = result.replace(pattern, '[REDACTED]');
    }
  }
  
  return { text: result, removed };
}

/**
 * Escape dangerous markup
 */
function escapeMarkup(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  let result = text;
  
  for (const pattern of DANGEROUS_MARKUP) {
    const matches = result.match(pattern);
    if (matches) {
      removed.push(...matches);
    }
  }
  
  // Escape HTML entities
  result = result
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
  
  return { text: result, removed };
}

/**
 * Normalize whitespace
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')      // Normalize line endings
    .replace(/\r/g, '\n')         // Handle old Mac line endings
    .replace(/\t/g, '  ')         // Tabs to spaces
    .replace(/ {3,}/g, '  ')      // Multiple spaces to double
    .replace(/\n{3,}/g, '\n\n')   // Multiple newlines to double
    .trim();                       // Remove leading/trailing whitespace
}

/**
 * Enforce maximum length
 */
function enforceMaxLength(text: string, maxLength: number): { text: string; truncated: boolean } {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }
  
  // Try to truncate at a sentence boundary
  const truncated = text.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastExclaim = truncated.lastIndexOf('!');
  const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclaim);
  
  if (lastSentenceEnd > maxLength * 0.8) {
    return { text: truncated.substring(0, lastSentenceEnd + 1), truncated: true };
  }
  
  return { text: truncated + '...', truncated: true };
}

// ============================================
// Main Sanitization Function
// ============================================

/**
 * Sanitize user input for safe AI processing
 * 
 * @param input - Raw user input
 * @param options - Sanitization options
 * @returns Sanitization result with cleaned text and metadata
 */
export function sanitizeInput(
  input: string,
  options: SanitizationOptions = {}
): SanitizationResult {
  const {
    maxLength = 2000,
    removePHI: shouldRemovePHI = true,
    stripInjection: shouldStripInjection = true,
    escapeMarkup: shouldEscapeMarkup = true,
    normalizeWhitespace: shouldNormalizeWhitespace = true,
  } = options;
  
  const allRemoved: string[] = [];
  const warnings: string[] = [];
  let sanitized = input;
  
  // 1. Strip prompt injection attempts
  if (shouldStripInjection) {
    const result = stripPromptInjection(sanitized);
    sanitized = result.text;
    allRemoved.push(...result.removed);
    
    if (result.removed.length > 0) {
      warnings.push('Potential prompt injection patterns were removed');
    }
  }
  
  // 2. Remove PHI
  if (shouldRemovePHI) {
    const result = removePHI(sanitized);
    sanitized = result.text;
    allRemoved.push(...result.removed);
    
    if (result.removed.length > 0) {
      warnings.push('Potential PHI was redacted');
    }
  }
  
  // 3. Escape dangerous markup
  if (shouldEscapeMarkup) {
    const result = escapeMarkup(sanitized);
    sanitized = result.text;
    allRemoved.push(...result.removed);
  }
  
  // 4. Normalize whitespace
  if (shouldNormalizeWhitespace) {
    sanitized = normalizeWhitespace(sanitized);
  }
  
  // 5. Enforce max length
  const lengthResult = enforceMaxLength(sanitized, maxLength);
  sanitized = lengthResult.text;
  
  if (lengthResult.truncated) {
    warnings.push(`Input was truncated to ${maxLength} characters`);
  }
  
  return {
    sanitized,
    removed: allRemoved,
    warnings,
    wasModified: allRemoved.length > 0 || lengthResult.truncated,
  };
}

/**
 * Quick sanitization for simple inputs
 */
export function quickSanitize(input: string): string {
  return sanitizeInput(input, { maxLength: 1000 }).sanitized;
}

/**
 * Check if input contains potential injection attempts
 */
export function hasInjectionAttempt(input: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Check if input contains potential PHI
 */
export function hasPHI(input: string): boolean {
  return PHI_PATTERNS.some(pattern => pattern.test(input));
}
