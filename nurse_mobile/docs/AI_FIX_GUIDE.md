# **Ollama + MedGemma 2b Integration for Nuxt 4 Clinical App**

## **Project Overview**
Integrate MedGemma 2b AI model via Ollama for AI-enhanced clinical decision support in a Nuxt 4 application for nurse guidance during patient assessments.

**Current State**: AI configuration exists but no actual AI integration
**Goal**: Enable AI-powered triage explanations when triage is calculated

---

## **Prerequisites Check**
Before starting, verify:
- [ ] Ollama is installed and running (`ollama --version`)
- [ ] MedGemma 2b model is pulled (`ollama list | grep medgemma`)
- [ ] Ollama service is running: `curl http://localhost:11434/api/tags`
- [ ] Nuxt 4 project is set up and running

---

## **Step 1: Create Ollama Service**

### **File: `~/services/ollamaService.ts`**
```typescript
import type { AIUseCase } from '~/types/explainability';

export interface OllamaRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
  };
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaService {
  private endpoint: string;
  private defaultModel: string;

  constructor(endpoint?: string, defaultModel?: string) {
    this.endpoint = endpoint || 'http://localhost:11434/api/generate';
    this.defaultModel = defaultModel || 'medgemma:2b';
  }

  async generate(prompt: string, options?: Partial<OllamaRequest>): Promise<string> {
    try {
      const request: OllamaRequest = {
        model: options?.model || this.defaultModel,
        prompt,
        stream: false,
        options: {
          temperature: 0.1, // Lower for medical accuracy
          top_p: 0.9,
          ...options?.options
        },
        ...options
      };

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer HB-NURSE-001'
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data: OllamaResponse = await response.json();
      return data.response.trim();
    } catch (error) {
      console.error('[OllamaService] Error:', error);
      throw error;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      return response.ok;
    } catch {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      const data = await response.json();
      return data.models.map((model: any) => model.name);
    } catch {
      return [];
    }
  }
}

// Singleton instance
export const ollamaService = new OllamaService();
```

### **Installation Steps:**
1. Create the file: `services/ollamaService.ts`
2. No additional dependencies needed (uses native fetch)

---

## **Step 2: Update Explainability Engine**

### **File: `~/services/explainabilityEngine.ts`**
```typescript
import type { ClinicalFormInstance } from '~/types/clinical-form';
import type { ExplainabilityRecord, Priority } from '~/types/explainability';
import { RULE_EXPLANATIONS, ACTION_LABELS } from '~/data/explainabilityMaps';
import { ollamaService } from '~/services/ollamaService';

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'Present' : 'Absent';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  return String(value ?? 'present');
}

interface RuleMatch {
  ruleId: string;
  condition: string;
  matched: boolean;
  value?: unknown;
}

export async function buildExplainabilityModel(
  assessment: ClinicalFormInstance,
  options: { sessionId: string; useAI?: boolean } = { sessionId: '' }
): Promise<ExplainabilityRecord | null> {
  const calculated = assessment.calculated;
  
  if (!calculated?.matchedTriageRule) {
    return null;
  }

  const rule = calculated.matchedTriageRule;
  const priority = calculated.triagePriority as Priority;

  const triggers = ((calculated.ruleMatches || []) as RuleMatch[])
    .filter(r => r.matched)
    .map(r => {
      const explanation = RULE_EXPLANATIONS[r.ruleId];
      return {
        fieldId: r.ruleId,
        value: formatValue(r.value),
        threshold: 'WHO IMCI threshold',
        explanation: explanation?.description || r.condition,
        clinicalMeaning: explanation?.clinicalMeaning || r.condition
      };
    });

  // Generate narrative - use AI if enabled and available
  let clinicalNarrative = '';
  let aiConfidence = 1.0;
  let aiEnhancement = undefined;
  
  if (options.useAI) {
    try {
      // Check if Ollama is available
      const isHealthy = await ollamaService.checkHealth();
      
      if (isHealthy) {
        clinicalNarrative = await generateAINarrative(priority, triggers, rule);
        aiConfidence = 0.95;
        aiEnhancement = {
          used: true,
          useCase: 'EXPLAIN_TRIAGE',
          modelVersion: 'medgemma:2b',
          generatedAt: new Date().toISOString()
        };
      } else {
        // Fall back to rule-based if AI not available
        clinicalNarrative = generateRuleBasedNarrative(priority, triggers);
      }
    } catch (error) {
      console.warn('[Explainability] AI generation failed:', error);
      clinicalNarrative = generateRuleBasedNarrative(priority, triggers);
    }
  } else {
    clinicalNarrative = generateRuleBasedNarrative(priority, triggers);
  }

  const recommendedActions = (rule.actions as string[]).map(code => {
    const action = ACTION_LABELS[code];
    return {
      code,
      label: action?.label || code,
      justification: action?.justification || 'Based on triage classification',
      whoReference: action?.whoReference
    };
  });

  return {
    id: generateId(),
    sessionId: options.sessionId,
    assessmentInstanceId: 'assessment-record',
    timestamp: new Date().toISOString(),

    classification: {
      priority,
      label: getPriorityLabel(priority),
      protocol: 'WHO_IMCI'
    },

    reasoning: {
      primaryRule: {
        id: rule.id,
        description: RULE_EXPLANATIONS[rule.id]?.description || rule.id,
        source: 'WHO IMCI'
      },
      triggers,
      clinicalNarrative
    },

    recommendedActions,

    safetyNotes: aiEnhancement ? [
      'AI-enhanced clinical decision support based on MedGemma',
      'Verify all AI suggestions with clinical judgment',
      'Escalate immediately if patient condition worsens',
      'Follow WHO IMCI guidelines as primary reference'
    ] : [
      'Derived from WHO IMCI guidelines',
      'This is rule-based, not AI-generated',
      'Actions must be clinically confirmed',
      'Escalate if patient condition worsens'
    ],

    confidence: aiConfidence,
    dataCompleteness: 1.0,

    aiEnhancement
  };
}

async function generateAINarrative(
  priority: Priority,
  triggers: Array<{ clinicalMeaning: string }>,
  rule: any
): Promise<string> {
  const priorityText = {
    red: 'emergency',
    yellow: 'urgent',
    green: 'non-urgent'
  }[priority];

  const triggerText = triggers.map(t => t.clinicalMeaning).join(', ');
  
  const prompt = `You are MedGemma, a clinical AI assistant explaining triage decisions to nurses.

CONTEXT:
- Patient triage: ${priority.toUpperCase()} (${priorityText})
- Clinical findings: ${triggerText}
- Rule applied: ${rule.id}

TASK: Provide a concise clinical explanation including:
1. Why these findings warrant ${priority} priority
2. Key clinical implications
3. Critical monitoring parameters
4. When to escalate care

FORMAT: Use plain language for nurses. Max 120 words.`;

  const response = await ollamaService.generate(prompt);
  
  // Clean up the response
  return response
    .replace(/^As an AI.*?:/i, '') // Remove AI intro phrases
    .replace(/\[\*.*?\*\]/g, '') // Remove citation markers
    .trim();
}

function generateRuleBasedNarrative(
  priority: Priority,
  triggers: Array<{ clinicalMeaning: string }>
): string {
  const priorityText = {
    red: 'emergency',
    yellow: 'urgent',
    green: 'non-urgent'
  }[priority];

  if (triggers.length === 0) {
    return `Patient classified as ${priority.toUpperCase()} (${priorityText}) based on clinical assessment.`;
  }

  const meaningList = triggers.map(t => t.clinicalMeaning);
  return `Patient classified as ${priority.toUpperCase()} (${priorityText}) because: ${meaningList.join(', ')}.`;
}

function getPriorityLabel(priority: Priority): string {
  return {
    red: 'Emergency - Immediate Action Required',
    yellow: 'Urgent - Prompt Attention Needed',
    green: 'Non-Urgent - Standard Care'
  }[priority];
}

export function getClinicalTermDefinition(term: string): string {
  const clinicalTerms: Record<string, string> = {
    cyanosis: 'bluish discoloration indicating low oxygen in blood',
    retractions: 'chest muscles pulling in when breathing - sign of respiratory distress',
    lethargic: 'unusually sleepy, difficult to wake',
    unconscious: 'not awake, not responding to stimuli',
    convulsions: 'involuntary muscle spasms (seizures)',
    tachypnea: 'abnormally rapid breathing',
    chest_indrawing: 'skin pulling into chest wall when breathing in',
    nasal_flaring: 'nostrils widening when breathing',
    grunting: 'sound made when breathing out - sign of respiratory distress',
    hypoxemia: 'low oxygen level in blood',
    dehydration: 'loss of body fluids'
  };

  return clinicalTerms[term.toLowerCase()] || 'Clinical term';
}
```

### **Key Changes:**
1. Changed `buildExplainabilityModel` to be `async`
2. Added AI narrative generation when `useAI: true`
3. Added fallback to rule-based when AI unavailable
4. Added AI health check before attempting generation

---

## **Step 3: Update Assessment Page Component**

### **File: `~/pages/assessment/[schemaId]/[formId].vue`**
Update the Vue component with these changes:

```vue
<script setup lang="ts">
// ... existing imports ...
import { ollamaService } from '~/services/ollamaService';

// Add AI status tracking
const aiStatus = ref<'idle' | 'checking' | 'generating' | 'ready' | 'error'>('idle');
const aiErrorMessage = ref<string>('');

// Update the buildExplainability function
async function buildExplainability() {
  if (!instance.value) {
    console.log('[Assessment] No instance.value');
    explainabilityRecord.value = null;
    showExplainability.value = false;
    return;
  }

  if (!isAIEnabled('EXPLAIN_TRIAGE')) {
    console.log('[Assessment] AI not enabled for EXPLAIN_TRIAGE');
    explainabilityRecord.value = null;
    showExplainability.value = false;
    return;
  }

  console.log('[Assessment] Building explainability with AI check');
  
  try {
    // Reset states
    aiStatus.value = 'checking';
    aiErrorMessage.value = '';
    
    const config = getAIConfig();
    const useAI = config.enabled && config.allowExplanations;
    
    if (!useAI) {
      console.log('[Assessment] AI disabled in config');
      // Use rule-based without AI
      const record = buildExplainabilityModel(instance.value, {
        sessionId: resolvedSessionId.value || instance.value?.sessionId || '',
        useAI: false
      });
      explainabilityRecord.value = await record;
      showExplainability.value = !!explainabilityRecord.value;
      aiStatus.value = 'idle';
      return;
    }

    // Check Ollama availability
    const isOllamaHealthy = await ollamaService.checkHealth();
    
    if (!isOllamaHealthy) {
      console.warn('[Assessment] Ollama not available, using rule-based');
      aiErrorMessage.value = 'AI server unavailable. Showing rule-based explanation.';
      
      // Fall back to rule-based
      const record = buildExplainabilityModel(instance.value, {
        sessionId: resolvedSessionId.value || instance.value?.sessionId || '',
        useAI: false
      });
      explainabilityRecord.value = await record;
      showExplainability.value = !!explainabilityRecord.value;
      aiStatus.value = 'error';
      return;
    }

    // Generate AI-enhanced explanation
    aiStatus.value = 'generating';
    
    const record = await buildExplainabilityModel(instance.value, {
      sessionId: resolvedSessionId.value || instance.value?.sessionId || '',
      useAI: true
    });

    console.log('[Assessment] AI explainability built:', record);
    explainabilityRecord.value = record;
    showExplainability.value = !!record;
    aiStatus.value = 'ready';
    
  } catch (error) {
    console.error('[Assessment] Failed to build explainability:', error);
    aiErrorMessage.value = error instanceof Error ? error.message : 'AI generation failed';
    explainabilityRecord.value = null;
    showExplainability.value = false;
    aiStatus.value = 'error';
  }
}

// Update watchers to handle async
watch(instance, () => {
  console.log('[Assessment] instance changed, calling buildExplainability');
  buildExplainability();
}, { deep: true });

// Update the AI config watcher
watch([() => instance.value?.calculated, () => isAIEnabled('EXPLAIN_TRIAGE')], () => {
  console.log('[Assessment] calculated or AI state changed, calling buildExplainability');
  buildExplainability();
}, { deep: true });
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4 max-w-4xl mx-auto">
    <!-- ... existing header and patient info ... -->
    
    <!-- AI Status Indicators -->
    <div v-if="aiStatus === 'checking'" class="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
      <div class="flex items-center gap-2 text-blue-300">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>Checking AI availability...</span>
      </div>
    </div>

    <div v-if="aiStatus === 'generating'" class="mb-4 p-3 bg-purple-900/30 border border-purple-700 rounded-lg">
      <div class="flex items-center gap-2 text-purple-300">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>Generating AI clinical insights with MedGemma...</span>
      </div>
    </div>

    <div v-if="aiStatus === 'error' && aiErrorMessage" class="mb-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
      <div class="flex items-start gap-2 text-yellow-300">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>{{ aiErrorMessage }}</span>
      </div>
    </div>

    <!-- Triage Badge with AI indicator -->
    <div v-if="triagePriority" class="mb-4">
      <div class="flex items-center gap-2">
        <span
          class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold"
          :class="{
            'bg-red-600 text-white': triagePriority === 'red',
            'bg-yellow-500 text-white': triagePriority === 'yellow',
            'bg-green-600 text-white': triagePriority === 'green' || triagePriority === 'stable'
          }"
        >
          {{ triagePriority?.toUpperCase() }} Priority
        </span>
        
        <span 
          v-if="explainabilityRecord?.aiEnhancement" 
          class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-600 text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          AI-Enhanced
        </span>
      </div>
    </div>

    <!-- AI Explainability Panel -->
    <div v-if="showExplainability && explainabilityRecord" class="mb-6">
      <ExplainabilityCard :model="explainabilityRecord" />
    </div>

    <!-- ... rest of the template remains the same ... -->
  </div>
</template>
```

---

## **Step 4: Create AI Setup Page**

### **File: `~/pages/setup/ai.vue`**
```vue
<template>
  <div class="min-h-screen bg-gray-900 p-4 md:p-6">
    <div class="max-w-4xl mx-auto">
      <!-- Back Navigation -->
      <div class="mb-6">
        <NuxtLink to="/dashboard" class="inline-flex items-center gap-2 text-gray-300 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Dashboard
        </NuxtLink>
      </div>

      <!-- Main Title -->
      <div class="mb-8">
        <h1 class="text-2xl md:text-3xl font-bold text-white mb-2">AI Configuration</h1>
        <p class="text-gray-400">Configure MedGemma AI for clinical decision support</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left Column: Ollama Status -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Ollama Status Card -->
          <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-xl font-semibold text-white">Ollama Status</h2>
              <button 
                @click="checkOllama" 
                :disabled="checkingOllama"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ checkingOllama ? 'Checking...' : 'Check Connection' }}
              </button>
            </div>

            <!-- Status Indicator -->
            <div class="flex items-center gap-4 mb-6">
              <div class="relative">
                <div class="w-4 h-4 rounded-full" :class="{
                  'bg-green-500': ollamaStatus === 'connected',
                  'bg-yellow-500': ollamaStatus === 'checking',
                  'bg-red-500': ollamaStatus === 'disconnected'
                }"></div>
                <div v-if="ollamaStatus === 'checking'" class="absolute inset-0 animate-ping rounded-full bg-yellow-500 opacity-75"></div>
              </div>
              <div>
                <p class="text-white font-medium">Status: {{ ollamaStatusLabel }}</p>
                <p class="text-gray-400 text-sm">
                  {{ ollamaStatus === 'connected' ? 'Connected to Ollama API' : 'Cannot connect to Ollama' }}
                </p>
              </div>
            </div>

            <!-- Available Models -->
            <div v-if="availableModels.length > 0" class="mb-6">
              <h3 class="text-lg font-medium text-white mb-3">Available Models</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div 
                  v-for="model in availableModels" 
                  :key="model"
                  class="p-3 bg-gray-900/50 rounded-lg border border-gray-700"
                >
                  <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full bg-green-500"></div>
                    <span class="text-gray-300 font-mono text-sm">{{ model }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Quick Test -->
            <div>
              <h3 class="text-lg font-medium text-white mb-3">Quick AI Test</h3>
              <div class="space-y-3">
                <input 
                  v-model="testPrompt"
                  type="text" 
                  placeholder="Enter a test prompt..."
                  class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                >
                <button 
                  @click="testAI" 
                  :disabled="!canTestAI"
                  class="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Test MedGemma
                </button>
                
                <!-- Test Result -->
                <div v-if="testResult" class="mt-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
                  <div class="flex items-center gap-2 mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span class="text-white font-medium">AI Response</span>
                  </div>
                  <p class="text-gray-300 whitespace-pre-wrap">{{ testResult }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Installation Instructions -->
          <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 class="text-xl font-semibold text-white mb-4">Setup Instructions</h2>
            
            <div class="space-y-4">
              <div class="bg-gray-900 p-4 rounded-lg">
                <h3 class="text-lg font-medium text-white mb-2">1. Install Ollama</h3>
                <p class="text-gray-400 mb-3">Download and install Ollama from <a href="https://ollama.ai" target="_blank" class="text-blue-400 hover:underline">ollama.ai</a></p>
                
                <h3 class="text-lg font-medium text-white mb-2">2. Install MedGemma</h3>
                <p class="text-gray-400 mb-2">Open terminal and run:</p>
                <code class="block bg-black p-3 rounded-lg text-gray-300 font-mono text-sm mb-3">
                  ollama pull medgemma:2b
                </code>
                
                <h3 class="text-lg font-medium text-white mb-2">3. Start Ollama</h3>
                <p class="text-gray-400">Ollama usually runs automatically. If not, run:</p>
                <code class="block bg-black p-3 rounded-lg text-gray-300 font-mono text-sm">
                  ollama serve
                </code>
              </div>
              
              <div class="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
                <div class="flex items-start gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p class="text-blue-300 font-medium">Privacy & Security</p>
                    <p class="text-blue-400/80 text-sm">AI processing happens locally on your device. No patient data is sent to external servers.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column: AI Configuration -->
        <div class="space-y-6">
          <!-- AI Features Card -->
          <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 class="text-xl font-semibold text-white mb-6">AI Features</h2>
            
            <div class="space-y-6">
              <!-- Master Toggle -->
              <div class="p-4 bg-gray-900/50 rounded-lg">
                <div class="flex items-center justify-between mb-2">
                  <div>
                    <p class="text-white font-medium">Enable AI Features</p>
                    <p class="text-gray-400 text-sm">Master toggle for all AI capabilities</p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      v-model="aiConfig.enabled" 
                      class="sr-only peer"
                      @change="saveConfig"
                    >
                    <div class="w-12 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                  </label>
                </div>
              </div>

              <!-- Individual Features -->
              <div class="space-y-4">
                <div class="flex items-center justify-between p-3 hover:bg-gray-900/30 rounded-lg transition-colors">
                  <div>
                    <p class="text-white">Triage Explanations</p>
                    <p class="text-gray-400 text-sm">AI-enhanced triage reasoning</p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      v-model="aiConfig.allowExplanations" 
                      :disabled="!aiConfig.enabled"
                      class="sr-only peer"
                      @change="saveConfig"
                    >
                    <div class="w-10 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50"></div>
                  </label>
                </div>

                <div class="flex items-center justify-between p-3 hover:bg-gray-900/30 rounded-lg transition-colors">
                  <div>
                    <p class="text-white">Clinical Education</p>
                    <p class="text-gray-400 text-sm">Patient education materials</p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      v-model="aiConfig.allowEducation" 
                      :disabled="!aiConfig.enabled"
                      class="sr-only peer"
                      @change="saveConfig"
                    >
                    <div class="w-10 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50"></div>
                  </label>
                </div>

                <div class="flex items-center justify-between p-3 hover:bg-gray-900/30 rounded-lg transition-colors">
                  <div>
                    <p class="text-white">Clinical Handover</p>
                    <p class="text-gray-400 text-sm">AI-assisted shift handover</p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      v-model="aiConfig.allowHandover" 
                      :disabled="!aiConfig.enabled"
                      class="sr-only peer"
                      @change="saveConfig"
                    >
                    <div class="w-10 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50"></div>
                  </label>
                </div>

                <div class="flex items-center justify-between p-3 hover:bg-gray-900/30 rounded-lg transition-colors">
                  <div>
                    <p class="text-white">Note Summarization</p>
                    <p class="text-gray-400 text-sm">AI-powered note summaries</p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      v-model="aiConfig.allowSummary" 
                      :disabled="!aiConfig.enabled"
                      class="sr-only peer"
                      @change="saveConfig"
                    >
                    <div class="w-10 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50"></div>
                  </label>
                </div>
              </div>

              <!-- Model Selection -->
              <div class="pt-4 border-t border-gray-700">
                <label class="block text-white font-medium mb-2">AI Model</label>
                <select 
                  v-model="aiConfig.model"
                  @change="saveConfig"
                  class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="medgemma:2b">MedGemma 2B (Recommended)</option>
                  <option value="medgemma:latest">MedGemma Latest</option>
                  <option value="llama2:7b">Llama 2 7B</option>
                  <option value="mistral:7b">Mistral 7B</option>
                </select>
                <p class="text-gray-400 text-sm mt-2">Select the AI model for clinical reasoning</p>
              </div>

              <!-- Save Button -->
              <button 
                @click="saveConfig"
                class="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
              >
                Save Configuration
              </button>
            </div>
          </div>

          <!-- Status Overview -->
          <div class="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 class="text-xl font-semibold text-white mb-4">System Status</h2>
            
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <span class="text-gray-300">AI Service</span>
                <span :class="{
                  'text-green-400': ollamaStatus === 'connected',
                  'text-yellow-400': ollamaStatus === 'checking',
                  'text-red-400': ollamaStatus === 'disconnected'
                }">
                  {{ ollamaStatus === 'connected' ? 'Online' : 'Offline' }}
                </span>
              </div>
              
              <div class="flex items-center justify-between">
                <span class="text-gray-300">AI Features</span>
                <span :class="aiConfig.enabled ? 'text-green-400' : 'text-gray-400'">
                  {{ aiConfig.enabled ? 'Enabled' : 'Disabled' }}
                </span>
              </div>
              
              <div class="flex items-center justify-between">
                <span class="text-gray-300">Active Model</span>
                <span class="text-gray-300 font-mono text-sm">{{ aiConfig.model }}</span>
              </div>
              
              <div class="flex items-center justify-between">
                <span class="text-gray-300">Last Check</span>
                <span class="text-gray-400 text-sm">{{ lastCheckTime }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ollamaService } from '~/services/ollamaService';
import { getAIConfig, updateAIConfig } from '~/services/aiConfig';

// State
const ollamaStatus = ref<'checking' | 'connected' | 'disconnected'>('checking');
const checkingOllama = ref(false);
const availableModels = ref<string[]>([]);
const aiConfig = ref(getAIConfig());
const testPrompt = ref('Explain why chest retractions indicate respiratory distress in simple terms for a nurse.');
const testResult = ref<string>('');
const testingAI = ref(false);
const lastCheckTime = ref<string>('');

// Computed
const ollamaStatusLabel = computed(() => {
  return {
    checking: 'Checking...',
    connected: 'Connected',
    disconnected: 'Not Connected'
  }[ollamaStatus.value];
});

const canTestAI = computed(() => {
  return ollamaStatus.value === 'connected' && !testingAI.value && testPrompt.value.trim().length > 0;
});

// Methods
async function checkOllama() {
  checkingOllama.value = true;
  ollamaStatus.value = 'checking';
  
  try {
    const isHealthy = await ollamaService.checkHealth();
    ollamaStatus.value = isHealthy ? 'connected' : 'disconnected';
    
    if (isHealthy) {
      const models = await ollamaService.getAvailableModels();
      availableModels.value = models;
    } else {
      availableModels.value = [];
    }
    
    lastCheckTime.value = new Date().toLocaleTimeString();
  } catch (error) {
    console.error('[AISetup] Error checking Ollama:', error);
    ollamaStatus.value = 'disconnected';
    availableModels.value = [];
  } finally {
    checkingOllama.value = false;
  }
}

async function testAI() {
  if (!canTestAI.value) return;
  
  testingAI.value = true;
  testResult.value = '';
  
  try {
    const result = await ollamaService.generate(testPrompt.value, {
      model: aiConfig.value.model
    });
    testResult.value = result;
  } catch (error) {
    testResult.value = `Error: ${error instanceof Error ? error.message : 'Failed to generate response'}`;
  } finally {
    testingAI.value = false;
  }
}

function saveConfig() {
  updateAIConfig(aiConfig.value);
  
  // Show success feedback
  const saveBtn = document.activeElement as HTMLElement;
  const originalText = saveBtn.textContent;
  saveBtn.textContent = 'Saved!';
  saveBtn.classList.add('bg-green-700');
  
  setTimeout(() => {
    saveBtn.textContent = originalText;
    saveBtn.classList.remove('bg-green-700');
  }, 2000);
}

// Lifecycle
onMounted(() => {
  checkOllama();
});
</script>
```

---

## **Step 5: Update Navigation**

### **File: `~/components/layout/Navigation.vue`** (or your navigation component)
Add a link to the AI setup page:

```vue
<template>
  <!-- ... existing navigation ... -->
  <NuxtLink 
    to="/setup/ai" 
    class="flex items-center gap-2 px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
  >
    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
    <span>AI Setup</span>
  </NuxtLink>
  <!-- ... rest of navigation ... -->
</template>
```

### **File: `~/nuxt.config.ts`** (if needed)
Ensure your route is recognized:

```typescript
export default defineNuxtConfig({
  // ... existing config ...
  routeRules: {
    '/setup/**': { ssr: false } // Optional: disable SSR for setup pages
  }
});
```

---

## **Step 6: Test the Integration**

### **Test Sequence:**
1. **Start your Nuxt app**: `npm run dev`
2. **Verify Ollama is running**: Open terminal, run `ollama serve`
3. **Navigate to AI Setup**: Go to `/setup/ai` in your app
4. **Check connection**: Click "Check Connection" - should show "Connected"
5. **Enable features**: Turn on "Enable AI Features" and "Triage Explanations"
6. **Save configuration**: Click "Save Configuration"
7. **Test AI**: Use the test prompt to verify MedGemma responds
8. **Use assessment**: Create an assessment, trigger triage calculation, verify AI appears

### **Troubleshooting:**
- **Ollama not connecting**: Check if Ollama is running (`ps aux | grep ollama`)
- **Model not found**: Ensure medgemma:2b is pulled (`ollama pull medgemma:2b`)
- **CORS issues**: Add to Nuxt config if needed:
  ```typescript
  nitro: {
    devProxy: {
      '/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true
      }
    }
  }
  ```

---

## **Step 7: Environment Variables (Optional)**

### **File: `.env`**
```bash
# Ollama Configuration
OLLAMA_ENDPOINT="http://localhost:11434/api/generate"
AI_MODEL="medgemma:2b"
AI_ENABLED="true"

# Fallback configuration
FALLBACK_TO_RULEBASED="true"
AI_TIMEOUT_MS="10000"
```

### **File: `~/services/aiConfig.ts`** (update)
```typescript
// Update getAIConfig to use env vars
export function getAIConfig(): AIConfig {
  const defaultConfig = {
    enabled: process.env.AI_ENABLED === 'true',
    allowExplanations: true,
    allowEducation: true,
    allowHandover: true,
    allowSummary: true,
    model: process.env.AI_MODEL || 'medgemma:2b',
    endpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate'
  };
  
  return { ...defaultConfig, ...aiConfig.value };
}
```

---

## **Implementation Summary**

### **Files Created:**
1. `~/services/ollamaService.ts` - Ollama API service
2. `~/pages/setup/ai.vue` - AI configuration page

### **Files Modified:**
1. `~/services/explainabilityEngine.ts` - Added AI integration
2. `~/pages/assessment/[schemaId]/[formId].vue` - Updated for async AI
3. `~/services/aiConfig.ts` - Enhanced with environment variables
4. Navigation component - Added AI Setup link

### **Key Features Added:**
1. **Local AI Processing**: MedGemma runs locally via Ollama
2. **Graceful Degradation**: Falls back to rule-based if AI unavailable
3. **User Configuration**: Nurses can enable/disable AI features
4. **Status Monitoring**: Real-time Ollama connection status
5. **Privacy-First**: All data stays on local device

---

## **Expected Behavior**
After implementation:
1. **When triage is calculated** and AI is enabled → AI-enhanced explanation appears
2. **When Ollama is unavailable** → Rule-based explanation shows with warning
3. **When AI is disabled** → Rule-based explanation shows
4. **Setup page** → Allows configuration and testing of AI features

---

## **Next Steps After Implementation**
1. **Test thoroughly** with different triage scenarios
2. **Monitor performance** - AI generation may take 2-5 seconds
3. **Consider caching** AI responses for similar cases
4. **Add loading states** for better UX during AI generation
5. **Implement error boundaries** for failed AI requests

---

**Time Estimate**: 2-3 hours for full implementation  
**Difficulty**: Medium  
**Dependencies**: Ollama running locally with MedGemma 2b

---

## **Need Help?**
If you encounter issues:
1. Check browser console for errors
2. Verify Ollama is running: `curl http://localhost:11434/api/tags`
3. Test Ollama directly: `ollama run medgemma:2b "Hello"`
4. Check Nuxt server logs for API errors

---

**Copy this entire document and paste it into Kilocode for step-by-step implementation assistance.** The implementation is structured to work incrementally, so you can test each step as you go.