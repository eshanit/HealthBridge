import { useStorage } from '@vueuse/core';
import type { AIConfig, AIUseCase } from '~/types/explainability';

const aiConfig = useStorage<AIConfig>('healthbridge_ai_config', {
  enabled: true,
  allowExplanations: true,
  allowEducation: true,
  allowHandover: true,
  allowSummary: true,
  model: process.env.AI_MODEL || 'gemma3:4b',
  endpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate'
});

export function getAIConfig(): AIConfig {
  return aiConfig.value;
}

export function updateAIConfig(config: Partial<AIConfig>): void {
  aiConfig.value = { ...aiConfig.value, ...config };
}

export function isAIEnabled(useCase?: AIUseCase): boolean {
  if (!aiConfig.value.enabled) return false;
  
  if (useCase) {
    switch (useCase) {
      case 'EXPLAIN_TRIAGE': return aiConfig.value.allowExplanations;
      case 'CARE_EDUCATION': return aiConfig.value.allowEducation;
      case 'CLINICAL_HANDOVER': return aiConfig.value.allowHandover;
      case 'NOTE_SUMMARY': return aiConfig.value.allowSummary;
      // Phase 3: Cumulative prompts - always enabled when AI is enabled
      case 'SECTION_GUIDANCE': return true;
    }
  }
  
  return true;
}

export function disableAI(): void {
  updateAIConfig({ enabled: false });
}

export function enableAI(): void {
  updateAIConfig({ enabled: true });
}

export function setAIMode(mode: 'full' | 'explanations-only' | 'disabled'): void {
  switch (mode) {
    case 'full':
      updateAIConfig({
        enabled: true,
        allowExplanations: true,
        allowEducation: true,
        allowHandover: true,
        allowSummary: true
      });
      break;
    case 'explanations-only':
      updateAIConfig({
        enabled: true,
        allowExplanations: true,
        allowEducation: false,
        allowHandover: false,
        allowSummary: false
      });
      break;
    case 'disabled':
      disableAI();
      break;
  }
}

export function getAIMode(): 'full' | 'explanations-only' | 'disabled' {
  const config = getAIConfig();
  if (!config.enabled) return 'disabled';
  if (config.allowExplanations && !config.allowEducation && !config.allowHandover && !config.allowSummary) {
    return 'explanations-only';
  }
  return 'full';
}
