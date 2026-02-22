<?php

namespace App\Console\Commands;

use App\Services\Ai\OllamaClient;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * Diagnostic command for Ollama connectivity issues.
 * 
 * Usage: php artisan ollama:diagnose
 */
class DiagnoseOllamaCommand extends Command
{
    protected $signature = 'ollama:diagnose {--model= : Specific model to test}';
    protected $description = 'Diagnose Ollama connectivity issues';

    public function handle(): int
    {
        $this->info('╔════════════════════════════════════════════════════════════╗');
        $this->info('║              Ollama Connectivity Diagnostic                ║');
        $this->info('╚════════════════════════════════════════════════════════════╝');
        $this->newLine();

        // Step 1: Check configuration
        $this->info('📋 Step 1: Configuration Check');
        $this->line('   ┌─────────────────────────────────────────────────────────┐');
        
        $baseUrl = config('ai.providers.ollama.url', env('OLLAMA_BASE_URL', 'http://localhost:11434'));
        $model = config('ai.providers.ollama.model', env('OLLAMA_MODEL', 'gemma3:4b'));
        $timeout = config('ai.providers.ollama.timeout', env('OLLAMA_TIMEOUT', 60));
        
        $this->line(sprintf('   │ Base URL: %-44s │', $baseUrl));
        $this->line(sprintf('   │ Model: %-47s │', $model));
        $this->line(sprintf('   │ Timeout: %ds %-40s │', $timeout, ''));
        $this->line('   └─────────────────────────────────────────────────────────┘');
        $this->newLine();

        // Step 2: Check if Ollama is reachable
        $this->info('🔌 Step 2: Connection Test');
        
        $this->line('   Testing direct HTTP connection...');
        
        try {
            $startTime = microtime(true);
            $response = Http::timeout(5)->get("{$baseUrl}/api/tags");
            $latency = round((microtime(true) - $startTime) * 1000);
            
            if ($response->successful()) {
                $this->line("   ✅ Connection successful ({$latency}ms)");
                $this->line('   Status: ' . $response->status());
                
                $data = $response->json();
                $models = $data['models'] ?? [];
                
                if (empty($models)) {
                    $this->warn('   ⚠️ No models found. You may need to pull a model.');
                    $this->line('   Run: ollama pull ' . $model);
                } else {
                    $this->line('   Available models:');
                    foreach ($models as $m) {
                        $this->line(sprintf('     - %s (size: %s)', $m['name'], $this->formatBytes($m['size'] ?? 0)));
                    }
                }
            } else {
                $this->error('   ❌ Connection failed');
                $this->line('   Status: ' . $response->status());
                $this->line('   Body: ' . $response->body());
            }
        } catch (\Exception $e) {
            $this->error('   ❌ Connection failed with exception');
            $this->line('   Error: ' . $e->getMessage());
            $this->newLine();
            
            // Provide troubleshooting steps
            $this->showTroubleshootingSteps($baseUrl);
            return self::FAILURE;
        }
        
        $this->newLine();

        // Step 3: Test OllamaClient
        $this->info('🔧 Step 3: OllamaClient Test');
        
        try {
            $client = app(OllamaClient::class);
            
            $this->line('   Client Base URL: ' . $client->getBaseUrl());
            $this->line('   Client Model: ' . $client->getModelName());
            
            if ($client->isAvailable()) {
                $this->line('   ✅ OllamaClient reports available');
                
                if ($client->hasModel($model)) {
                    $this->line("   ✅ Model '{$model}' is available");
                } else {
                    $this->warn("   ⚠️ Model '{$model}' not found");
                    $this->line('   Available models: ' . collect($client->getModels())->pluck('name')->join(', '));
                }
            } else {
                $this->error('   ❌ OllamaClient reports unavailable');
            }
        } catch (\Exception $e) {
            $this->error('   ❌ OllamaClient test failed');
            $this->line('   Error: ' . $e->getMessage());
        }
        
        $this->newLine();

        // Step 4: Test simple generation
        $this->info('🧪 Step 4: Simple Generation Test');
        
        // Allow model override
        $testModel = $this->option('model') ?? $model;
        $this->line("   Testing with model: {$testModel}");
        
        try {
            $client = app(OllamaClient::class);
            
            $this->line('   Sending test prompt...');
            $startTime = microtime(true);
            
            $result = $client->generate('Say "Hello" in one word.', [
                'temperature' => 0.1,
                'max_tokens' => 10,
                'model' => $testModel,
            ]);
            
            $latency = round((microtime(true) - $startTime) * 1000);
            
            if ($result['success']) {
                $this->line("   ✅ Generation successful ({$latency}ms)");
                $this->line('   Response: ' . trim($result['response']));
                $this->line('   Model: ' . ($result['metadata']['model'] ?? 'unknown'));
            } else {
                $this->error('   ❌ Generation failed');
                $this->line('   Error: ' . $result['error']);
                
                // Try to get more details from Ollama
                $this->newLine();
                $this->line('   Attempting raw API call for more details...');
                
                try {
                    $rawResponse = Http::timeout(30)->post("{$baseUrl}/api/generate", [
                        'model' => $testModel,
                        'prompt' => 'Say "Hello"',
                        'stream' => false,
                    ]);
                    
                    $this->line('   Raw Status: ' . $rawResponse->status());
                    $this->line('   Raw Body: ' . substr($rawResponse->body(), 0, 500));
                } catch (\Exception $e) {
                    $this->line('   Raw Error: ' . $e->getMessage());
                }
            }
        } catch (\Exception $e) {
            $this->error('   ❌ Generation test failed');
            $this->line('   Error: ' . $e->getMessage());
        }
        
        $this->newLine();
        $this->info('✅ Diagnostic complete!');
        
        return self::SUCCESS;
    }

    protected function showTroubleshootingSteps(string $baseUrl): void
    {
        $this->newLine();
        $this->info('🔍 Troubleshooting Steps:');
        $this->newLine();
        
        $this->line('   1. Verify Ollama is running:');
        $this->line('      Windows: ollama serve');
        $this->line('      Check: http://localhost:11434 in browser');
        $this->newLine();
        
        $this->line('   2. Check if port 11434 is blocked:');
        $this->line('      Windows: netstat -an | findstr 11434');
        $this->newLine();
        
        $this->line('   3. Windows Firewall:');
        $this->line('      - Check if ollama.exe is allowed through firewall');
        $this->line('      - Try: netsh advfirewall firewall add rule name="Ollama" dir=in action=allow program="C:\Users\[user]\AppData\Local\Programs\Ollama\ollama.exe" enable=yes');
        $this->newLine();
        
        $this->line('   4. Environment Variables:');
        $this->line('      - OLLAMA_HOST=0.0.0.0:11434 (to listen on all interfaces)');
        $this->line('      - OLLAMA_ORIGINS=* (to allow all origins)');
        $this->newLine();
        
        $this->line('   5. Docker/WSL Issues:');
        $this->line('      - If using Docker, use host.docker.internal:11434');
        $this->line('      - If using WSL, ensure networking is configured correctly');
        $this->newLine();
        
        $this->line('   6. Alternative: Use 127.0.0.1 instead of localhost:');
        $this->line('      OLLAMA_BASE_URL=http://127.0.0.1:11434');
        $this->newLine();
    }

    protected function formatBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $i = 0;
        
        while ($bytes >= 1024 && $i < count($units) - 1) {
            $bytes /= 1024;
            $i++;
        }
        
        return round($bytes, 2) . ' ' . $units[$i];
    }
}
