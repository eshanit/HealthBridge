/**
 * Offline AI Service
 * 
 * Phase 3.5 Task 3.5.1: Offline AI Capabilities
 * Provides rule-based AI assistance when network is unavailable
 * Uses WHO IMCI guidelines for clinical decision support
 */

// ============================================
// Types & Interfaces
// ============================================

/**
 * Offline AI response
 */
export interface OfflineAIResponse {
  success: boolean;
  message: string;
  recommendations: string[];
  warnings: string[];
  triageSuggestion?: 'emergency' | 'urgent' | 'priority' | 'routine';
  confidence: number;
  source: 'offline' | 'cache';
  timestamp: string;
}

/**
 * Patient context for offline analysis
 */
export interface OfflinePatientContext {
  ageMonths: number;
  weightKg?: number;
  temperature?: number;
  respiratoryRate?: number;
  heartRate?: number;
  oxygenSaturation?: number;
  symptoms: string[];
  dangerSigns: string[];
  mentalStatus?: 'alert' | 'lethargic' | 'unconscious';
  feedingStatus?: 'normal' | 'poor' | 'unable';
}

/**
 * Cached AI response
 */
export interface CachedAIResponse {
  id: string;
  query: string;
  response: string;
  sectionId: string;
  timestamp: string;
  expiresAt: string;
}

/**
 * WHO IMCI danger sign rule
 */
interface DangerSignRule {
  id: string;
  name: string;
  condition: (ctx: OfflinePatientContext) => boolean;
  severity: 'critical' | 'severe' | 'moderate';
  message: string;
  action: string;
}

/**
 * Triage rule
 */
interface TriageRule {
  id: string;
  priority: 'emergency' | 'urgent' | 'priority' | 'routine';
  condition: (ctx: OfflinePatientContext) => boolean;
  message: string;
}

// ============================================
// Constants
// ============================================

const CACHE_STORAGE_KEY = 'healthbridge_ai_cache';
const CACHE_DURATION_HOURS = 24;

// ============================================
// WHO IMCI Danger Sign Rules
// ============================================

const DANGER_SIGN_RULES: DangerSignRule[] = [
  {
    id: 'unable_drink',
    name: 'Unable to Drink/Feed',
    condition: (ctx) => ctx.feedingStatus === 'unable',
    severity: 'critical',
    message: 'Child is unable to drink or feed - this is a critical danger sign',
    action: 'Immediate referral to hospital is required'
  },
  {
    id: 'vomits_everything',
    name: 'Vomits Everything',
    condition: (ctx) => ctx.dangerSigns.includes('vomits_everything'),
    severity: 'critical',
    message: 'Child vomits everything - this is a critical danger sign',
    action: 'Immediate referral to hospital is required'
  },
  {
    id: 'convulsions',
    name: 'Convulsions',
    condition: (ctx) => ctx.dangerSigns.includes('convulsions'),
    severity: 'critical',
    message: 'Child has convulsions - this is a critical danger sign',
    action: 'Immediate referral to hospital is required. Keep airway clear.'
  },
  {
    id: 'lethargic_unconscious',
    name: 'Lethargic or Unconscious',
    condition: (ctx) => ctx.mentalStatus === 'lethargic' || ctx.mentalStatus === 'unconscious',
    severity: 'critical',
    message: 'Child is lethargic or unconscious - this is a critical danger sign',
    action: 'Immediate referral to hospital is required'
  },
  {
    id: 'stridor',
    name: 'Stridor',
    condition: (ctx) => ctx.symptoms.includes('stridor'),
    severity: 'critical',
    message: 'Stridor detected - indicates severe airway obstruction',
    action: 'Immediate referral to hospital is required. Keep child calm.'
  },
  {
    id: 'severe_chest_indrawing',
    name: 'Severe Chest Indrawing',
    condition: (ctx) => ctx.symptoms.includes('severe_chest_indrawing'),
    severity: 'critical',
    message: 'Severe chest indrawing detected - indicates severe respiratory distress',
    action: 'Immediate referral to hospital is required'
  },
  {
    id: 'cyanosis',
    name: 'Cyanosis',
    condition: (ctx) => ctx.symptoms.includes('cyanosis'),
    severity: 'critical',
    message: 'Cyanosis detected - indicates severe hypoxia',
    action: 'Immediate oxygen if available. Urgent referral to hospital.'
  },
  {
    id: 'high_fever',
    name: 'High Fever',
    condition: (ctx) => (ctx.temperature ?? 0) >= 39,
    severity: 'severe',
    message: 'High fever detected (≥39°C) - requires urgent attention',
    action: 'Reduce fever with antipyretics if available. Monitor closely.'
  },
  {
    id: 'hypothermia',
    name: 'Hypothermia',
    condition: (ctx) => (ctx.temperature ?? 99) < 35.5,
    severity: 'severe',
    message: 'Hypothermia detected (<35.5°C) - requires urgent warming',
    action: 'Keep child warm. Urgent referral to hospital.'
  },
  {
    id: 'low_oxygen',
    name: 'Low Oxygen Saturation',
    condition: (ctx) => (ctx.oxygenSaturation ?? 100) < 90,
    severity: 'critical',
    message: 'Low oxygen saturation (<90%) - indicates severe respiratory distress',
    action: 'Provide oxygen if available. Immediate referral to hospital.'
  }
];

// ============================================
// Triage Rules
// ============================================

const TRIAGE_RULES: TriageRule[] = [
  {
    id: 'emergency_any_danger',
    priority: 'emergency',
    condition: (ctx) => ctx.dangerSigns.length > 0 || ctx.mentalStatus === 'unconscious',
    message: 'Emergency: Danger signs present requiring immediate hospital referral'
  },
  {
    id: 'emergency_critical_symptoms',
    priority: 'emergency',
    condition: (ctx) => 
      ctx.symptoms.includes('stridor') || 
      ctx.symptoms.includes('cyanosis') ||
      (ctx.oxygenSaturation ?? 100) < 90,
    message: 'Emergency: Critical symptoms requiring immediate attention'
  },
  {
    id: 'urgent_high_rr',
    priority: 'urgent',
    condition: (ctx) => {
      const rr = ctx.respiratoryRate ?? 0;
      const age = ctx.ageMonths;
      // WHO IMCI thresholds for fast breathing
      if (age < 2) return rr >= 60;
      if (age < 12) return rr >= 50;
      return rr >= 40;
    },
    message: 'Urgent: Fast breathing detected - may have pneumonia'
  },
  {
    id: 'urgent_chest_indrawing',
    priority: 'urgent',
    condition: (ctx) => ctx.symptoms.includes('chest_indrawing'),
    message: 'Urgent: Chest indrawing detected - may have severe pneumonia'
  },
  {
    id: 'urgent_high_fever',
    priority: 'urgent',
    condition: (ctx) => (ctx.temperature ?? 0) >= 39,
    message: 'Urgent: High fever requires immediate attention'
  },
  {
    id: 'priority_moderate_symptoms',
    priority: 'priority',
    condition: (ctx) => 
      ctx.symptoms.includes('cough') || 
      ctx.symptoms.includes('fever') ||
      ctx.symptoms.includes('runny_nose'),
    message: 'Priority: Symptoms present that require assessment'
  },
  {
    id: 'routine_well_child',
    priority: 'routine',
    condition: () => true, // Default if no other rules match
    message: 'Routine: No urgent symptoms detected'
  }
];

// ============================================
// Helper Functions
// ============================================

/**
 * Get age-appropriate respiratory rate thresholds
 */
function getRespiratoryRateThreshold(ageMonths: number): { normal: { min: number; max: number }; fast: number } {
  if (ageMonths < 2) {
    return { normal: { min: 30, max: 60 }, fast: 60 };
  } else if (ageMonths < 12) {
    return { normal: { min: 25, max: 50 }, fast: 50 };
  } else {
    return { normal: { min: 20, max: 40 }, fast: 40 };
  }
}

/**
 * Get age-appropriate heart rate thresholds
 */
function getHeartRateThreshold(ageMonths: number): { normal: { min: number; max: number } } {
  if (ageMonths < 2) {
    return { normal: { min: 100, max: 180 } };
  } else if (ageMonths < 12) {
    return { normal: { min: 100, max: 160 } };
  } else {
    return { normal: { min: 80, max: 140 } };
  }
}

/**
 * Load cached responses from storage
 */
function loadCachedResponses(): CachedAIResponse[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!stored) return [];
    
    const cached: CachedAIResponse[] = JSON.parse(stored);
    const now = new Date();
    
    // Filter out expired entries
    return cached.filter(item => new Date(item.expiresAt) > now);
  } catch {
    return [];
  }
}

/**
 * Save cached response to storage
 */
function saveCachedResponse(response: CachedAIResponse): void {
  if (typeof window === 'undefined') return;
  try {
    const cached = loadCachedResponses();
    cached.push(response);
    // Keep only last 50 responses
    const trimmed = cached.slice(-50);
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('[offlineAI] Failed to save cache:', e);
  }
}

/**
 * Find similar cached response
 */
function findCachedResponse(query: string, sectionId: string): CachedAIResponse | null {
  const cached = loadCachedResponses();
  
  // Simple similarity check - look for matching section and similar query
  return cached.find(item => {
    if (item.sectionId !== sectionId) return false;
    
    // Check for keyword overlap
    const queryWords = query.toLowerCase().split(/\s+/);
    const cachedWords = item.query.toLowerCase().split(/\s+/);
    const overlap = queryWords.filter(w => cachedWords.includes(w)).length;
    
    return overlap >= Math.min(queryWords.length, 3);
  }) || null;
}

// ============================================
// Main Offline AI Functions
// ============================================

/**
 * Analyze patient context offline
 */
export function analyzeOffline(ctx: OfflinePatientContext): OfflineAIResponse {
  const recommendations: string[] = [];
  const warnings: string[] = [];
  let triageSuggestion: 'emergency' | 'urgent' | 'priority' | 'routine' = 'routine';
  let confidence = 0.7; // Base confidence for offline analysis

  // Check danger signs
  for (const rule of DANGER_SIGN_RULES) {
    if (rule.condition(ctx)) {
      warnings.push(`${rule.message}. ${rule.action}`);
      
      if (rule.severity === 'critical') {
        triageSuggestion = 'emergency';
        confidence = Math.min(confidence + 0.1, 0.95);
      } else if (rule.severity === 'severe' && triageSuggestion !== 'emergency') {
        triageSuggestion = 'urgent';
      }
    }
  }

  // Apply triage rules
  for (const rule of TRIAGE_RULES) {
    if (rule.condition(ctx)) {
      // Only update if priority is higher
      const priorities = ['routine', 'priority', 'urgent', 'emergency'];
      const currentIndex = priorities.indexOf(triageSuggestion);
      const ruleIndex = priorities.indexOf(rule.priority);
      
      if (ruleIndex > currentIndex) {
        triageSuggestion = rule.priority;
      }
      
      recommendations.push(rule.message);
      break; // Use first matching rule
    }
  }

  // Add vital sign analysis
  if (ctx.respiratoryRate) {
    const rrThreshold = getRespiratoryRateThreshold(ctx.ageMonths);
    if (ctx.respiratoryRate > rrThreshold.fast) {
      recommendations.push(`Fast breathing detected (${ctx.respiratoryRate} breaths/min). WHO IMCI threshold for age: ${rrThreshold.fast} breaths/min.`);
    } else if (ctx.respiratoryRate >= rrThreshold.normal.min && ctx.respiratoryRate <= rrThreshold.normal.max) {
      recommendations.push('Respiratory rate is within normal range for age.');
    }
  }

  if (ctx.heartRate) {
    const hrThreshold = getHeartRateThreshold(ctx.ageMonths);
    if (ctx.heartRate > hrThreshold.normal.max) {
      warnings.push(`Elevated heart rate detected (${ctx.heartRate} bpm). Normal range: ${hrThreshold.normal.min}-${hrThreshold.normal.max} bpm.`);
    } else if (ctx.heartRate >= hrThreshold.normal.min && ctx.heartRate <= hrThreshold.normal.max) {
      recommendations.push('Heart rate is within normal range for age.');
    }
  }

  if (ctx.temperature) {
    if (ctx.temperature >= 37.5 && ctx.temperature < 39) {
      recommendations.push(`Low-grade fever detected (${ctx.temperature}°C). Monitor and provide supportive care.`);
    } else if (ctx.temperature >= 39) {
      warnings.push(`High fever detected (${ctx.temperature}°C). Urgent attention required.`);
    }
  }

  // Add general recommendations based on triage
  if (triageSuggestion === 'emergency') {
    recommendations.unshift('CRITICAL: Immediate hospital referral required.');
    recommendations.push('Keep child warm during transport.');
    recommendations.push('Ensure airway is clear.');
  } else if (triageSuggestion === 'urgent') {
    recommendations.unshift('URGENT: Hospital referral recommended within 24 hours.');
  }

  // Build response message
  let message = '';
  if (warnings.length > 0) {
    message = `⚠️ ${warnings.length} warning(s) detected. ${triageSuggestion === 'emergency' ? 'This is an EMERGENCY.' : ''}`;
  } else {
    message = 'Analysis complete. No critical findings detected.';
  }

  return {
    success: true,
    message,
    recommendations,
    warnings,
    triageSuggestion,
    confidence,
    source: 'offline',
    timestamp: new Date().toISOString()
  };
}

/**
 * Get cached AI response
 */
export function getCachedAIResponse(query: string, sectionId: string): OfflineAIResponse | null {
  const cached = findCachedResponse(query, sectionId);
  
  if (cached) {
    return {
      success: true,
      message: cached.response,
      recommendations: [],
      warnings: ['Response retrieved from offline cache. May not reflect latest data.'],
      confidence: 0.6,
      source: 'cache',
      timestamp: cached.timestamp
    };
  }
  
  return null;
}

/**
 * Store AI response in cache
 */
export function cacheAIResponse(
  query: string,
  response: string,
  sectionId: string
): void {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_DURATION_HOURS * 60 * 60 * 1000);
  
  const cached: CachedAIResponse = {
    id: `cache_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    query,
    response,
    sectionId,
    timestamp: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
  
  saveCachedResponse(cached);
}

/**
 * Get offline response for section
 */
export function getOfflineSectionResponse(
  sectionId: string,
  ctx: OfflinePatientContext
): OfflineAIResponse {
  // First check cache
  const cached = getCachedAIResponse('', sectionId);
  if (cached) {
    return cached;
  }
  
  // Otherwise, use rule-based analysis
  const analysis = analyzeOffline(ctx);
  
  // Customize message based on section
  switch (sectionId) {
    case 'patient_info':
      analysis.message = `Patient: ${ctx.ageMonths} months old${ctx.weightKg ? `, ${ctx.weightKg}kg` : ''}.`;
      break;
    case 'danger_signs':
      if (ctx.dangerSigns.length === 0) {
        analysis.message = 'No danger signs detected. Continue monitoring.';
        analysis.recommendations = ['Continue to monitor for any danger signs.'];
      }
      break;
    case 'vitals':
      analysis.message = 'Vital signs analysis complete.';
      break;
    case 'triage':
      analysis.message = `Triage recommendation: ${analysis.triageSuggestion?.toUpperCase() || 'ROUTINE'}`;
      break;
  }
  
  return analysis;
}

/**
 * Clear AI cache
 */
export function clearAICache(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CACHE_STORAGE_KEY);
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { count: number; oldestTimestamp: string | null } {
  const cached = loadCachedResponses();
  
  if (cached.length === 0) {
    return { count: 0, oldestTimestamp: null };
  }
  
  const oldest = cached.reduce((prev, curr) => 
    new Date(prev.timestamp) < new Date(curr.timestamp) ? prev : curr
  );
  
  return {
    count: cached.length,
    oldestTimestamp: oldest.timestamp
  };
}

/**
 * Check if offline mode is available
 */
export function isOfflineAvailable(): boolean {
  return typeof window !== 'undefined';
}

// ============================================
// Export Service Object
// ============================================

export const offlineAIService = {
  analyzeOffline,
  getCachedAIResponse,
  cacheAIResponse,
  getOfflineSectionResponse,
  clearAICache,
  getCacheStats,
  isOfflineAvailable
};

export default offlineAIService;
