<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class OllamaClient
{
    protected string $baseUrl;
    protected string $model;
    protected int $timeout;

    public function __construct()
    {
        $this->baseUrl = config('ai_policy.ollama.base_url', 'http://localhost:11434');
        $this->model = config('ai_policy.ollama.model', 'gemma3:4b');
        $this->timeout = config('ai_policy.ollama.timeout', 60);
    }

    /**
     * Generate a completion using Ollama.
     *
     * @param string $prompt The prompt to send
     * @param array $options Generation options
     * @return array{success: bool, response: string|null, error: string|null, metadata: array}
     */
    public function generate(string $prompt, array $options = []): array
    {
        $startTime = microtime(true);

        try {
            $response = Http::timeout($this->timeout)
                ->post("{$this->baseUrl}/api/generate", [
                    'model' => $options['model'] ?? $this->model,
                    'prompt' => $prompt,
                    'stream' => false,
                    'options' => [
                        'temperature' => $options['temperature'] ?? 0.3,
                        'num_predict' => $options['max_tokens'] ?? 500,
                        'top_p' => $options['top_p'] ?? 0.9,
                        'top_k' => $options['top_k'] ?? 40,
                    ],
                ]);

            $latencyMs = (int) ((microtime(true) - $startTime) * 1000);

            if (!$response->successful()) {
                Log::error('OllamaClient: Request failed', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                return [
                    'success' => false,
                    'response' => null,
                    'error' => "Ollama request failed with status {$response->status()}",
                    'metadata' => [
                        'latency_ms' => $latencyMs,
                        'model' => $this->model,
                    ],
                ];
            }

            $data = $response->json();

            return [
                'success' => true,
                'response' => $data['response'] ?? '',
                'error' => null,
                'metadata' => [
                    'latency_ms' => $latencyMs,
                    'model' => $data['model'] ?? $this->model,
                    'total_duration' => $data['total_duration'] ?? null,
                    'load_duration' => $data['load_duration'] ?? null,
                    'prompt_eval_count' => $data['prompt_eval_count'] ?? null,
                    'eval_count' => $data['eval_count'] ?? null,
                ],
            ];
        } catch (\Exception $e) {
            $latencyMs = (int) ((microtime(true) - $startTime) * 1000);

            Log::error('OllamaClient: Exception', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return [
                'success' => false,
                'response' => null,
                'error' => $e->getMessage(),
                'metadata' => [
                    'latency_ms' => $latencyMs,
                    'model' => $this->model,
                ],
            ];
        }
    }

    /**
     * Check if Ollama is available.
     */
    public function isAvailable(): bool
    {
        try {
            $response = Http::timeout(5)->get("{$this->baseUrl}/api/tags");
            return $response->successful();
        } catch (\Exception $e) {
            return false;
        }
    }

    /**
     * Get available models.
     */
    public function getModels(): array
    {
        try {
            $response = Http::timeout(5)->get("{$this->baseUrl}/api/tags");

            if ($response->successful()) {
                return $response->json('models', []);
            }

            return [];
        } catch (\Exception $e) {
            return [];
        }
    }

    /**
     * Check if a specific model is available.
     */
    public function hasModel(string $model): bool
    {
        $models = $this->getModels();
        
        foreach ($models as $availableModel) {
            if (($availableModel['name'] ?? '') === $model) {
                return true;
            }
        }

        return false;
    }

    /**
     * Pull a model if not available.
     */
    public function pullModel(string $model): bool
    {
        try {
            $response = Http::timeout(300)->post("{$this->baseUrl}/api/pull", [
                'name' => $model,
                'stream' => false,
            ]);

            return $response->successful();
        } catch (\Exception $e) {
            Log::error('OllamaClient: Failed to pull model', [
                'model' => $model,
                'error' => $e->getMessage(),
            ]);
            return false;
        }
    }
}
