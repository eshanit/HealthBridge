/**
 * Ollama Service for MedGemma AI Integration
 *
 * Handles communication with local Ollama server for clinical AI features
 */

export interface OllamaRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
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
  endpoint: string;
  apiKey: string;
  defaultModel: string;

  constructor() {
    const config = useRuntimeConfig();
    // Ollama API endpoint for /api/generate
    const envEndpoint = config.public.aiEndpoint || process.env.OLLAMA_URL || 'http://localhost:11434';
    this.endpoint = `${envEndpoint.replace(/\/$/, '')}/api/generate`;
    this.apiKey = String(config.public.aiAuthToken || process.env.MEDGEMMA_API_KEY || 'HB-NURSE-001');
    this.defaultModel = String(config.public.aiModel || process.env.OLLAMA_MODEL || 'gemma3:4b');
    
    console.log('[OllamaService] Initialized with endpoint:', this.endpoint);
    console.log('[OllamaService] Using model:', this.defaultModel);
  }

  async generate(
    prompt: string,
    options: Partial<OllamaRequest> = {}
  ): Promise<string> {
    const request: OllamaRequest = {
      model: options.model || this.defaultModel,
      prompt,
      stream: false,
      options: {
        temperature: 0.3,
        top_p: 0.9,
        top_k: 10,
        num_predict: 512,
        ...options.options
      }
    };

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
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
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      const data = await response.json();
      return (data.models || []).map((model: { name: string }) => model.name);
    } catch {
      return [];
    }
  }

  async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();
    try {
      const healthy = await this.checkHealth();
      if (!healthy) {
        return { success: false, error: 'Ollama server not responding' };
      }
      return { success: true, latency: Date.now() - startTime };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Singleton instance
export const ollamaService = new OllamaService();

// Convenience function for AI narrative generation
export async function generateAINarrative(
  prompt: string,
  _useCase: string
): Promise<string> {
  try {
    const response = await ollamaService.generate(prompt, {
      model: ollamaService.defaultModel,
      options: {
        temperature: 0.3,
        top_p: 0.9,
        top_k: 10,
        num_predict: 512
      }
    });
    return response;
  } catch (error) {
    console.error('[OllamaService] Failed to generate narrative:', error);
    throw error;
  }
}
