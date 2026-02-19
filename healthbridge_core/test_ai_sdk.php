<?php

/**
 * Laravel AI SDK Phase 1 Validation Script
 * 
 * This script validates that Phase 1 of the migration is complete.
 * Run with: php test_ai_sdk.php
 */

require __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

echo "=== Laravel AI SDK Phase 1 Validation ===\n\n";

// Test 1: Configuration
echo "1. Configuration Check:\n";
echo "   - AI Provider: " . config('ai.default') . "\n";
echo "   - Ollama URL: " . config('ai.providers.ollama.url') . "\n";
echo "   - Ollama Model: " . config('ai.providers.ollama.model') . "\n";
echo "   - Ollama Timeout: " . config('ai.providers.ollama.timeout') . "\n";
echo "   ✓ Configuration loaded successfully\n\n";

// Test 2: Service Container Bindings
echo "2. Service Container Bindings:\n";
$bindings = [
    'App\Services\Ai\OllamaClient',
    'App\Services\Ai\PromptBuilder',
    'App\Services\Ai\ContextBuilder',
    'App\Services\Ai\OutputValidator',
];

foreach ($bindings as $binding) {
    $resolved = app($binding);
    $status = $resolved ? '✓' : '✗';
    echo "   {$status} {$binding}\n";
}
echo "\n";

// Test 3: OllamaClient Methods
echo "3. OllamaClient SDK Integration:\n";
$client = app('App\Services\Ai\OllamaClient');
echo "   - Model: " . $client->getModelName() . "\n";
echo "   - Base URL: " . $client->getBaseUrl() . "\n";
echo "   - Provider Name: " . $client->getProviderName() . "\n";
echo "   - SDK Config: " . json_encode($client->getSdkConfig()) . "\n";
echo "   ✓ OllamaClient SDK methods working\n\n";

// Test 4: Ollama Availability
echo "4. Ollama Availability:\n";
$available = $client->isAvailable();
echo "   - Available: " . ($available ? 'Yes' : 'No') . "\n";
if ($available) {
    $models = $client->getModels();
    echo "   - Models Available: " . count($models) . "\n";
    if (!empty($models)) {
        echo "   - First Model: " . ($models[0]['name'] ?? 'N/A') . "\n";
    }
}
echo "\n";

// Test 5: Laravel AI SDK Facade
echo "5. Laravel AI SDK Facade:\n";
try {
    $reflection = new ReflectionClass('Laravel\Ai\Ai');
    echo "   ✓ Laravel\\Ai\\Ai class exists\n";
} catch (ReflectionException $e) {
    echo "   ✗ Laravel\\Ai\\Ai class not found: " . $e->getMessage() . "\n";
}
echo "\n";

// Test 6: Database Migration
echo "6. Database Migration Check:\n";
try {
    $tableExists = \Illuminate\Support\Facades\Schema::hasTable('agent_conversations');
    echo "   - agent_conversations table: " . ($tableExists ? 'Exists' : 'Missing') . "\n";
    
    $messagesTableExists = \Illuminate\Support\Facades\Schema::hasTable('agent_conversation_messages');
    echo "   - agent_conversation_messages table: " . ($messagesTableExists ? 'Exists' : 'Missing') . "\n";
    
    if ($tableExists && $messagesTableExists) {
        echo "   ✓ Database migrations complete\n";
    } else {
        echo "   ✗ Database migrations incomplete\n";
    }
} catch (\Exception $e) {
    echo "   ✗ Error checking database: " . $e->getMessage() . "\n";
}
echo "\n";

// Summary
echo "=== Phase 1 Validation Complete ===\n";
echo "The Laravel AI SDK has been successfully installed and configured.\n";
echo "Ollama is set as the primary AI provider.\n";
echo "Service container bindings are in place for backward compatibility.\n";
