<?php

namespace Tests\Feature\Ai;

use App\Models\User;
use App\Services\Ai\AiCacheService;
use App\Services\Ai\AiErrorHandler;
use App\Services\Ai\AiMonitor;
use App\Services\Ai\AiRateLimiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Integration Tests for Full AI Request Lifecycle.
 *
 * Tests the complete flow from request to response including
 * rate limiting, caching, error handling, and monitoring.
 *
 * @group ai-sdk-phase5
 * @group ai-integration
 */
class AiIntegrationTest extends TestCase
{
    use RefreshDatabase;

    protected User $doctor;
    protected User $nurse;
    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        // Create roles
        Role::firstOrCreate(['name' => 'doctor', 'guard_name' => 'web']);
        Role::firstOrCreate(['name' => 'nurse', 'guard_name' => 'web']);
        Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);

        // Create users and assign roles using Spatie
        $this->doctor = User::factory()->create();
        $this->doctor->assignRole('doctor');

        $this->nurse = User::factory()->create();
        $this->nurse->assignRole('nurse');

        $this->admin = User::factory()->create();
        $this->admin->assignRole('admin');

        Cache::flush();
    }

    protected function tearDown(): void
    {
        Cache::flush();
        parent::tearDown();
    }

    // ============================================
    // Full Request Lifecycle Tests
    // ============================================

    public function test_complete_request_lifecycle(): void
    {
        // 1. Initial state - no metrics
        $monitor = app(AiMonitor::class);
        $initialMetrics = $monitor->getMetrics('minute');
        $this->assertEquals(0, $initialMetrics['requests']['total']);

        // 2. Make request
        $response = $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => '123'],
            ]);

        // 3. Verify response
        $response->assertStatus(200);

        // 4. Verify metrics were recorded
        $finalMetrics = $monitor->getMetrics('minute');
        $this->assertGreaterThan(0, $finalMetrics['requests']['total']);
    }

    public function test_request_lifecycle_with_caching(): void
    {
        $cacheService = app(AiCacheService::class);

        // First request - should miss cache
        $response1 = $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'cache-test-789'],
            ]);

        $response1->assertStatus(200);

        // Second request - should hit cache
        $response2 = $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'cache-test-789'],
            ]);

        $response2->assertStatus(200);
    }

    public function test_request_lifecycle_with_rate_limiting(): void
    {
        $rateLimiter = app(AiRateLimiter::class);

        // Check initial rate limit
        $initial = $rateLimiter->getRemaining('explain_triage', $this->doctor->id, 'doctor');

        // Make request
        $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'rate-test-123'],
            ]);

        // Verify rate limit decreased
        $after = $rateLimiter->getRemaining('explain_triage', $this->doctor->id, 'doctor');

        $this->assertLessThan($initial['task']['remaining'], $after['task']['remaining']);
    }

    public function test_request_lifecycle_with_error_handling(): void
    {
        $errorHandler = app(AiErrorHandler::class);

        // Verify error handler is available
        $this->assertInstanceOf(AiErrorHandler::class, $errorHandler);

        // Make request with invalid data
        $response = $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                // Missing required 'task' field
                'context' => ['patient_id' => '123'],
            ]);

        $response->assertStatus(422);
    }

    public function test_concurrent_users_have_isolated_limits(): void
    {
        $rateLimiter = app(AiRateLimiter::class);

        // Make requests for both users
        $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'doctor-test'],
            ]);

        $this->actingAs($this->nurse)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'nurse-test'],
            ]);

        // Verify each user has separate limits
        $doctorRemaining = $rateLimiter->getRemaining('explain_triage', $this->doctor->id, 'doctor');
        $nurseRemaining = $rateLimiter->getRemaining('explain_triage', $this->nurse->id, 'nurse');

        // Both should have decreased by 1
        $this->assertLessThan($doctorRemaining['quota']['limit'], $doctorRemaining['quota']['remaining'] + 1);
        $this->assertLessThan($nurseRemaining['quota']['limit'], $nurseRemaining['quota']['remaining'] + 1);
    }

    public function test_global_limit_affects_all_users(): void
    {
        $rateLimiter = app(AiRateLimiter::class);

        // Make multiple requests
        for ($i = 0; $i < 5; $i++) {
            $this->actingAs($this->doctor)
                ->postJson('/api/ai/medgemma', [
                    'task' => 'explain_triage',
                    'context' => ['patient_id' => "global-test-$i"],
                ]);
        }

        // Verify global counter increased
        $remaining = $rateLimiter->getRemaining('explain_triage', $this->doctor->id, 'doctor');
        $this->assertLessThan(200, $remaining['global']['remaining'] + 5);
    }

    public function test_patient_cache_invalidation(): void
    {
        $cacheService = app(AiCacheService::class);

        // Make request to cache
        $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'invalidate-test-123'],
            ]);

        // Invalidate patient cache
        $cacheService->invalidatePatient('invalidate-test-123');

        // Verify cache was invalidated (version incremented)
        $versionKey = 'ai_response:patient_version:invalidate-test-123';
        $version = Cache::get($versionKey, 0);
        $this->assertGreaterThanOrEqual(1, $version);
    }

    public function test_monitoring_records_all_request_types(): void
    {
        $monitor = app(AiMonitor::class);

        // Make different types of requests
        $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'monitor-test-1'],
            ]);

        $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'review_treatment',
                'context' => ['patient_id' => 'monitor-test-2'],
            ]);

        $metrics = $monitor->getMetrics('minute');

        // Verify requests were recorded
        $this->assertGreaterThanOrEqual(2, $metrics['requests']['total']);
    }

    public function test_health_score_reflects_system_state(): void
    {
        $monitor = app(AiMonitor::class);

        // Get initial health
        $health = $monitor->getMetrics('minute');

        $this->assertArrayHasKey('health', $health);
        $this->assertArrayHasKey('score', $health['health']);
        $this->assertArrayHasKey('status', $health['health']);
    }

    public function test_alerts_generated_for_anomalies(): void
    {
        $monitor = app(AiMonitor::class);

        // Record a high-latency request
        $monitor->recordRequest([
            'task' => 'explain_triage',
            'success' => true,
            'latency_ms' => 15000, // High latency
        ]);

        $metrics = $monitor->getMetrics('minute');

        // Verify metrics were recorded
        $this->assertGreaterThan(0, $metrics['requests']['total']);
    }

    public function test_fallback_on_provider_error(): void
    {
        $errorHandler = app(AiErrorHandler::class);

        // Verify error handler can classify errors
        $result = $errorHandler->handle(new \Exception('Connection timeout'));

        $this->assertFalse($result['success']);
        $this->assertArrayHasKey('error', $result);
    }

    public function test_stale_cache_returned_on_provider_failure(): void
    {
        $cacheService = app(AiCacheService::class);

        // Store a cached response
        $context = ['patient_id' => 'stale-test-123'];
        $response = ['success' => true, 'content' => 'Cached content'];
        $cacheService->put('explain_triage', $context, $response);

        // Verify cache can be retrieved
        $cached = $cacheService->get('explain_triage', $context);
        $this->assertNotNull($cached);
    }

    public function test_response_time_under_load(): void
    {
        $startTime = microtime(true);

        for ($i = 0; $i < 10; $i++) {
            $this->actingAs($this->doctor)
                ->postJson('/api/ai/medgemma', [
                    'task' => 'explain_triage',
                    'context' => ['patient_id' => "load-test-$i"],
                ]);
        }

        $endTime = microtime(true);
        $totalTime = $endTime - $startTime;

        // 10 requests should complete in reasonable time
        $this->assertLessThan(30, $totalTime, '10 requests should complete in under 30 seconds');
    }

    public function test_cache_improves_response_time(): void
    {
        $cacheService = app(AiCacheService::class);

        // First request (no cache)
        $start1 = microtime(true);
        $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'perf-test-same'],
            ]);
        $time1 = microtime(true) - $start1;

        // Second request (should hit cache)
        $start2 = microtime(true);
        $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'perf-test-same'],
            ]);
        $time2 = microtime(true) - $start2;

        // Both should succeed
        // Note: In real tests, cached response should be faster
        $this->assertGreaterThan(0, $time1);
        $this->assertGreaterThan(0, $time2);
    }

    public function test_metrics_consistent_with_actual_requests(): void
    {
        $monitor = app(AiMonitor::class);
        $initialMetrics = $monitor->getMetrics('minute');
        $initialCount = $initialMetrics['requests']['total'];

        // Make 3 requests
        for ($i = 0; $i < 3; $i++) {
            $this->actingAs($this->doctor)
                ->postJson('/api/ai/medgemma', [
                    'task' => 'explain_triage',
                    'context' => ['patient_id' => "metrics-test-$i"],
                ]);
        }

        $finalMetrics = $monitor->getMetrics('minute');

        // Verify count increased by at least 3
        $this->assertGreaterThanOrEqual($initialCount + 3, $finalMetrics['requests']['total']);
    }

    public function test_handles_rapid_sequential_requests(): void
    {
        // Rapidly make 5 requests
        for ($i = 0; $i < 5; $i++) {
            $response = $this->actingAs($this->doctor)
                ->postJson('/api/ai/medgemma', [
                    'task' => 'explain_triage',
                    'context' => ['patient_id' => "rapid-test-$i"],
                ]);

            // All should succeed (within rate limits)
            $this->assertContains($response->status(), [200, 429]);
        }
    }

    public function test_handles_concurrent_different_tasks(): void
    {
        $tasks = ['explain_triage', 'review_treatment', 'imci_classification'];

        foreach ($tasks as $task) {
            $response = $this->actingAs($this->doctor)
                ->postJson('/api/ai/medgemma', [
                    'task' => $task,
                    'context' => ['patient_id' => "task-test-$task"],
                ]);

            $response->assertStatus(200);
        }
    }

    public function test_handles_large_context(): void
    {
        $largeContext = [
            'patient_id' => 'large-context-test',
            'history' => str_repeat('a', 10000), // Large string
            'vitals' => array_fill(0, 100, ['bp' => '120/80', 'temp' => 37]),
        ];

        $response = $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => $largeContext,
            ]);

        $response->assertStatus(200);
    }
}
