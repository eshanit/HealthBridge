import { defineStore } from 'pinia';
import type { AIUseCase } from '~/types/explainability';

interface AIState {
  loading: boolean;
  output: string;
  error: string;
  lastUseCase: AIUseCase | null;
  lastExplainabilityId: string | null;
}

export const useAIStore = defineStore('ai', {
  state: (): AIState => ({
    loading: false,
    output: '',
    error: '',
    lastUseCase: null,
    lastExplainabilityId: null
  }),

  getters: {
    isLoading: (state) => state.loading,
    hasOutput: (state) => !!state.output,
    hasError: (state) => !!state.error
  },

  actions: {
    start(useCase: AIUseCase, explainabilityId?: string) {
      this.loading = true;
      this.output = '';
      this.error = '';
      this.lastUseCase = useCase;
      this.lastExplainabilityId = explainabilityId || null;
    },

    success(text: string) {
      this.loading = false;
      this.output = text;
    },

    fail(message: string) {
      this.loading = false;
      this.error = message;
    },

    clear() {
      this.loading = false;
      this.output = '';
      this.error = '';
      this.lastUseCase = null;
      this.lastExplainabilityId = null;
    },

    async runAI(
      useCase: AIUseCase,
      explainability: { id: string },
      generateAIResponse: (uc: AIUseCase) => Promise<string>
    ) {
      this.start(useCase, explainability.id);
      
      try {
        const result = await generateAIResponse(useCase);
        this.success(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'AI request failed';
        this.fail(message);
        console.error('[AIStore] Error:', message);
      }
    }
  }
});
