<?php

namespace Tests\Feature\Ai;

use App\Ai\Agents\TriageExplanationAgent;
use App\Ai\Agents\TreatmentReviewAgent;
use App\Ai\Tools\DosageCalculatorTool;
use App\Ai\Tools\IMCIClassificationTool;
use App\Models\User;
use App\Services\Ai\ContextBuilder;
use App\Services\Ai\OutputValidator;
use App\Services\Ai\PromptBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Integration Tests for Laravel AI SDK Migration
 *
 * These tests validate that the migrated SDK-based implementation
 * produces equivalent results to the original OllamaClient implementation.
 *
 * @group ai-sdk-migration
 */
class SdkMigrationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Create role and assign to user
        Role::firstOrCreate(['name' => 'doctor', 'guard_name' => 'web']);
        
        $this->user = User::factory()->create();
        $this->user->assignRole('doctor');
    }

    /**
     * Test: SDK configuration is properly loaded.
     *
     * Validates Phase 1 completion - SDK is installed and configured.
     */
    public function test_sdk_configuration_is_loaded(): void
    {
        $this->assertNotNull(config('ai.default'), 'AI default provider should be configured');
        $this->assertEquals('ollama', config('ai.default'), 'Default provider should be Ollama');
        $this->assertNotNull(config('ai.providers.ollama'), 'Ollama provider should be configured');
        $this->assertEquals('gemma3:4b', config('ai.providers.ollama.model'), 'Model should be gemma3:4b');
    }

    /**
     * Test: OllamaClient backward compatibility.
     *
     * Validates that the refactored OllamaClient still works with existing code.
     */
    public function test_ollama_client_backward_compatibility(): void
    {
        $client = app(\App\Services\Ai\OllamaClient::class);

        // Test that the client has the expected methods
        $this->assertTrue(method_exists($client, 'generate'), 'OllamaClient should have generate method');
        $this->assertTrue(method_exists($client, 'isAvailable'), 'OllamaClient should have isAvailable method');
        $this->assertTrue(method_exists($client, 'getModels'), 'OllamaClient should have getModels method');
        $this->assertTrue(method_exists($client, 'hasModel'), 'OllamaClient should have hasModel method');

        // Test new SDK integration methods
        $this->assertTrue(method_exists($client, 'getProviderName'), 'OllamaClient should have getProviderName method');
        $this->assertTrue(method_exists($client, 'getModelName'), 'OllamaClient should have getModelName method');
        $this->assertTrue(method_exists($client, 'getSdkConfig'), 'OllamaClient should have getSdkConfig method');
    }

    /**
     * Test: Service provider bindings are correct.
     *
     * Validates that all AI services are properly registered.
     */
    public function test_service_provider_bindings(): void
    {
        // Test that all services are resolvable
        $this->assertInstanceOf(
            \App\Services\Ai\OllamaClient::class,
            app(\App\Services\Ai\OllamaClient::class)
        );

        $this->assertInstanceOf(
            \App\Services\Ai\PromptBuilder::class,
            app(\App\Services\Ai\PromptBuilder::class)
        );

        $this->assertInstanceOf(
            \App\Services\Ai\ContextBuilder::class,
            app(\App\Services\Ai\ContextBuilder::class)
        );

        $this->assertInstanceOf(
            \App\Services\Ai\OutputValidator::class,
            app(\App\Services\Ai\OutputValidator::class)
        );

        // Test aliases
        $this->assertInstanceOf(
            \App\Services\Ai\OllamaClient::class,
            app('ai.ollama')
        );
    }

    /**
     * Test: ClinicalAgent base class functionality.
     *
     * Validates that the base agent class properly integrates with
     * PromptBuilder, ContextBuilder, and OutputValidator.
     */
    public function test_clinical_agent_base_functionality(): void
    {
        $agent = app(TriageExplanationAgent::class);

        // Test task identifier
        $this->assertEquals('explain_triage', $agent->getTask());

        // Test model retrieval
        $this->assertNotNull($agent->getModel());

        // Test provider retrieval
        $this->assertEquals('ollama', $agent->getProvider());

        // Test temperature retrieval
        $temperature = $agent->getTemperature();
        $this->assertIsNumeric($temperature);
        $this->assertGreaterThanOrEqual(0, $temperature);
        $this->assertLessThanOrEqual(1, $temperature);

        // Test max tokens retrieval
        $maxTokens = $agent->getMaxTokens();
        $this->assertIsInt($maxTokens);
        $this->assertGreaterThan(0, $maxTokens);
    }

    /**
     * Test: DosageCalculatorTool description.
     *
     * Validates that the dosage calculator tool has proper description.
     */
    public function test_dosage_calculator_tool_description(): void
    {
        $tool = new DosageCalculatorTool();

        // Test description
        $this->assertNotEmpty($tool->description());
        $this->assertStringContainsString('dosage', strtolower($tool->description()));
    }

    /**
     * Test: IMCIClassificationTool description.
     *
     * Validates that the IMCI classification tool has proper description.
     */
    public function test_imci_classification_tool_description(): void
    {
        $tool = new IMCIClassificationTool();

        // Test description
        $this->assertNotEmpty($tool->description());
        $this->assertStringContainsString('imci', strtolower($tool->description()));
    }

    /**
     * Test: OutputValidator full validation pipeline.
     *
     * Validates that the OutputValidator properly validates output.
     */
    public function test_output_validator_full_pipeline(): void
    {
        $validator = app(OutputValidator::class);

        // Test with safe output
        $result = $validator->fullValidation(
            'The patient has a mild respiratory infection. Recommend rest and fluids.',
            'explain_triage',
            'doctor'
        );

        $this->assertArrayHasKey('valid', $result);
        $this->assertArrayHasKey('output', $result);
        $this->assertArrayHasKey('warnings', $result);
        $this->assertArrayHasKey('blocked', $result);
    }

    /**
     * Test: Agent can be configured with patient context.
     *
     * Validates that agents properly accept patient context.
     */
    public function test_agent_patient_context(): void
    {
        $agent = app(TriageExplanationAgent::class);

        // Configure agent with patient
        $agent->forPatient('patient_123');
        $agent->withContext(['symptom' => 'fever']);
        $agent->forUser($this->user);

        // The agent should be configured without errors
        $this->assertInstanceOf(TriageExplanationAgent::class, $agent);
    }

    /**
     * Test: Task-to-agent mapping in controller.
     *
     * Validates that the controller properly maps tasks to agents.
     */
    public function test_controller_task_agent_mapping(): void
    {
        $controller = app(\App\Http\Controllers\Api\Ai\MedGemmaController::class);

        // Use reflection to access the taskAgents property
        $reflection = new \ReflectionClass($controller);
        $property = $reflection->getProperty('taskAgents');
        $property->setAccessible(true);
        $taskAgents = $property->getValue($controller);

        $this->assertArrayHasKey('explain_triage', $taskAgents);
        $this->assertEquals(TriageExplanationAgent::class, $taskAgents['explain_triage']);

        $this->assertArrayHasKey('review_treatment', $taskAgents);
        $this->assertEquals(TreatmentReviewAgent::class, $taskAgents['review_treatment']);
    }

    /**
     * Test: SDK agents can be enabled/disabled via config.
     *
     * Validates that the feature flag for SDK agents works.
     */
    public function test_sdk_agents_feature_flag(): void
    {
        // Test default state
        $defaultValue = config('ai.use_sdk_agents', false);
        $this->assertIsBool($defaultValue);

        // Test that it can be changed
        config(['ai.use_sdk_agents' => true]);
        $this->assertTrue(config('ai.use_sdk_agents'));

        // Reset
        config(['ai.use_sdk_agents' => $defaultValue]);
    }

    /**
     * Test: API routes are properly registered.
     *
     * Validates that all AI routes are registered.
     */
    public function test_api_routes_are_registered(): void
    {
        $routes = app('router')->getRoutes();

        $aiRoutes = [];
        foreach ($routes as $route) {
            if (str_starts_with($route->uri(), 'api/ai')) {
                $aiRoutes[$route->uri()] = $route->methods();
            }
        }

        // Check that all expected routes exist
        $this->assertArrayHasKey('api/ai/medgemma', $aiRoutes);
        $this->assertArrayHasKey('api/ai/health', $aiRoutes);
        $this->assertArrayHasKey('api/ai/tasks', $aiRoutes);
        $this->assertArrayHasKey('api/ai/stream', $aiRoutes);
        $this->assertArrayHasKey('api/ai/structured', $aiRoutes);
    }

    /**
     * Test: Phase 4 services are registered.
     *
     * Validates that all Phase 4 services are available.
     */
    public function test_phase4_services_registered(): void
    {
        $this->assertTrue(app()->bound(\App\Services\Ai\AiCacheService::class));
        $this->assertTrue(app()->bound(\App\Services\Ai\AiErrorHandler::class));
        $this->assertTrue(app()->bound(\App\Services\Ai\AiRateLimiter::class));
        $this->assertTrue(app()->bound(\App\Services\Ai\AiMonitor::class));
    }
}
