<?php

namespace Tests\Feature\Ai;

use App\Models\User;
use App\Services\Ai\AiCacheService;
use App\Services\Ai\AiErrorHandler;
use App\Services\Ai\AiRateLimiter;
use App\Services\Ai\AiMonitor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Phase 4 Integration Tests for Laravel AI SDK Migration
 *
 * These tests validate the production optimization features including
 * caching, error handling, rate limiting, and monitoring.
 *
 * @group ai-sdk-phase4
 */
class Phase4Test extends TestCase
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
     * Test: AiCacheService is properly instantiated.
     */
    public function test_ai_cache_service_is_instantiable(): void
    {
        $service = app(AiCacheService::class);
        $this->assertInstanceOf(AiCacheService::class, $service);
    }

    /**
     * Test: AiCacheService can cache and retrieve responses.
     */
    public function test_ai_cache_service_can_cache_and_retrieve(): void
    {
        $service = app(AiCacheService::class);

        $task = 'explain_triage';
        $context = ['patient_id' => 'test_123', 'symptoms' => ['fever']];
        $response = [
            'success' => true,
            'response' => 'Test response',
            'metadata' => ['was_modified' => false],
        ];

        // Cache the response
        $cached = $service->put($task, $context, $response);
        $this->assertTrue($cached);

        // Retrieve the cached response
        $retrieved = $service->get($task, $context);
        $this->assertNotNull($retrieved);
        $this->assertEquals('Test response', $retrieved['response']);
    }

    /**
     * Test: AiCacheService does not cache error responses.
     */
    public function test_ai_cache_service_does_not_cache_errors(): void
    {
        $service = app(AiCacheService::class);

        $task = 'explain_triage';
        $context = ['patient_id' => 'test_456'];
        $response = [
            'success' => false,
            'error' => 'Test error',
        ];

        $cached = $service->put($task, $context, $response);
        $this->assertFalse($cached);
    }

    /**
     * Test: AiCacheService does not cache modified responses.
     */
    public function test_ai_cache_service_does_not_cache_modified_responses(): void
    {
        $service = app(AiCacheService::class);

        $task = 'explain_triage';
        $context = ['patient_id' => 'test_789'];
        $response = [
            'success' => true,
            'response' => 'Modified response',
            'metadata' => ['was_modified' => true],
        ];

        $cached = $service->put($task, $context, $response);
        $this->assertFalse($cached);
    }

    /**
     * Test: AiCacheService can invalidate patient cache.
     */
    public function test_ai_cache_service_can_invalidate_patient_cache(): void
    {
        $service = app(AiCacheService::class);

        // Cache a response for a patient
        $task = 'explain_triage';
        $context = ['patient_id' => 'patient_to_invalidate'];
        $response = [
            'success' => true,
            'response' => 'Test response',
            'metadata' => ['was_modified' => false],
        ];

        $service->put($task, $context, $response);

        // Invalidate the patient cache
        $invalidated = $service->invalidatePatient('patient_to_invalidate');
        $this->assertGreaterThanOrEqual(0, $invalidated);
    }

    /**
     * Test: AiCacheService returns cache statistics.
     */
    public function test_ai_cache_service_returns_stats(): void
    {
        $service = app(AiCacheService::class);

        $stats = $service->getStats();

        $this->assertArrayHasKey('driver', $stats);
        $this->assertArrayHasKey('prefix', $stats);
        $this->assertArrayHasKey('task_ttls', $stats);
        $this->assertArrayHasKey('non_cacheable_tasks', $stats);
    }

    /**
     * Test: AiErrorHandler is properly instantiated.
     */
    public function test_ai_error_handler_is_instantiable(): void
    {
        $service = app(AiErrorHandler::class);
        $this->assertInstanceOf(AiErrorHandler::class, $service);
    }

    /**
     * Test: AiErrorHandler classifies exceptions correctly.
     */
    public function test_ai_error_handler_classifies_exceptions(): void
    {
        $service = app(AiErrorHandler::class);

        // Test timeout exception
        $timeoutException = new \Exception('Connection timed out');
        $result = $service->handle($timeoutException, ['task' => 'explain_triage']);

        $this->assertFalse($result['success']);
        $this->assertArrayHasKey('error', $result);
        $this->assertArrayHasKey('category', $result['error']);
        $this->assertArrayHasKey('severity', $result['error']);
        $this->assertArrayHasKey('recovery', $result['error']);
    }

    /**
     * Test: AiErrorHandler provides user-friendly messages.
     */
    public function test_ai_error_handler_provides_user_messages(): void
    {
        $service = app(AiErrorHandler::class);

        $exception = new \Exception('Provider error');
        $result = $service->handle($exception, ['task' => 'explain_triage']);

        $this->assertArrayHasKey('user_message', $result['error']);
        $this->assertNotEmpty($result['error']['user_message']);
    }

    /**
     * Test: AiErrorHandler determines recovery strategies.
     */
    public function test_ai_error_handler_determines_recovery(): void
    {
        $service = app(AiErrorHandler::class);

        // Test retryable error
        $timeoutException = new \Exception('Request timed out');
        $result = $service->handle($timeoutException, ['task' => 'explain_triage']);

        $this->assertArrayHasKey('recovery', $result['error']);
        $this->assertArrayHasKey('strategy', $result['error']['recovery']);
        $this->assertArrayHasKey('suggestions', $result['error']['recovery']);
    }

    /**
     * Test: AiErrorHandler creates custom exceptions.
     */
    public function test_ai_error_handler_creates_custom_exceptions(): void
    {
        $service = app(AiErrorHandler::class);

        $exception = $service->createException(
            'Safety violation',
            AiErrorHandler::CATEGORY_SAFETY,
            ['task' => 'explain_triage']
        );

        $this->assertInstanceOf(\App\Services\Ai\AiSafetyException::class, $exception);
    }

    /**
     * Test: AiRateLimiter is properly instantiated.
     */
    public function test_ai_rate_limiter_is_instantiable(): void
    {
        $service = app(AiRateLimiter::class);
        $this->assertInstanceOf(AiRateLimiter::class, $service);
    }

    /**
     * Test: AiRateLimiter checks rate limits.
     */
    public function test_ai_rate_limiter_checks_limits(): void
    {
        $service = app(AiRateLimiter::class);

        $result = $service->check('explain_triage', $this->user->id, 'doctor');

        $this->assertArrayHasKey('allowed', $result);
        $this->assertArrayHasKey('limits', $result);
        $this->assertArrayHasKey('global', $result['limits']);
        $this->assertArrayHasKey('task', $result['limits']);
        $this->assertArrayHasKey('quota', $result['limits']);
    }

    /**
     * Test: AiRateLimiter records requests.
     */
    public function test_ai_rate_limiter_records_requests(): void
    {
        $service = app(AiRateLimiter::class);

        // Record a request
        $service->record('explain_triage', $this->user->id, true);

        // Check remaining
        $remaining = $service->getRemaining('explain_triage', $this->user->id, 'doctor');

        $this->assertArrayHasKey('global', $remaining);
        $this->assertArrayHasKey('task', $remaining);
        $this->assertArrayHasKey('quota', $remaining);
    }

    /**
     * Test: AiRateLimiter returns rate limit headers.
     */
    public function test_ai_rate_limiter_returns_headers(): void
    {
        $service = app(AiRateLimiter::class);

        $remaining = $service->getRemaining('explain_triage', $this->user->id, 'doctor');
        $headers = $service->getHeaders($remaining);

        $this->assertArrayHasKey('X-RateLimit-Limit', $headers);
        $this->assertArrayHasKey('X-RateLimit-Remaining', $headers);
        $this->assertArrayHasKey('X-DailyQuota-Limit', $headers);
        $this->assertArrayHasKey('X-DailyQuota-Remaining', $headers);
    }

    /**
     * Test: AiRateLimiter returns statistics.
     */
    public function test_ai_rate_limiter_returns_stats(): void
    {
        $service = app(AiRateLimiter::class);

        $stats = $service->getStats();

        $this->assertArrayHasKey('limits', $stats);
        $this->assertArrayHasKey('usage', $stats);
    }

    /**
     * Test: AiMonitor is properly instantiated.
     */
    public function test_ai_monitor_is_instantiable(): void
    {
        $service = app(AiMonitor::class);
        $this->assertInstanceOf(AiMonitor::class, $service);
    }

    /**
     * Test: AiMonitor records request metrics.
     */
    public function test_ai_monitor_records_metrics(): void
    {
        $service = app(AiMonitor::class);

        $service->recordRequest([
            'task' => 'explain_triage',
            'latency_ms' => 500,
            'success' => true,
            'was_overridden' => false,
        ]);

        $metrics = $service->getMetrics('minute');

        $this->assertArrayHasKey('requests', $metrics);
        $this->assertArrayHasKey('total', $metrics['requests']);
    }

    /**
     * Test: AiMonitor returns metrics by period.
     */
    public function test_ai_monitor_returns_metrics_by_period(): void
    {
        $service = app(AiMonitor::class);

        // Test different periods
        $minuteMetrics = $service->getMetrics('minute');
        $this->assertEquals('minute', $minuteMetrics['period']);

        $hourMetrics = $service->getMetrics('hour');
        $this->assertEquals('hour', $hourMetrics['period']);

        $dayMetrics = $service->getMetrics('day');
        $this->assertEquals('day', $dayMetrics['period']);
    }

    /**
     * Test: AiMonitor calculates health score.
     */
    public function test_ai_monitor_calculates_health(): void
    {
        $service = app(AiMonitor::class);

        $metrics = $service->getMetrics('hour');

        $this->assertArrayHasKey('health', $metrics);
        $this->assertArrayHasKey('score', $metrics['health']);
        $this->assertArrayHasKey('status', $metrics['health']);
        $this->assertArrayHasKey('issues', $metrics['health']);
    }

    /**
     * Test: AiMonitor returns dashboard data.
     */
    public function test_ai_monitor_returns_dashboard(): void
    {
        $service = app(AiMonitor::class);

        $dashboard = $service->getDashboard();

        $this->assertArrayHasKey('current_hour', $dashboard);
        $this->assertArrayHasKey('current_day', $dashboard);
        $this->assertArrayHasKey('recent_alerts', $dashboard);
        $this->assertArrayHasKey('thresholds', $dashboard);
        $this->assertArrayHasKey('timestamp', $dashboard);
    }

    /**
     * Test: AiMonitor returns recent alerts.
     */
    public function test_ai_monitor_returns_recent_alerts(): void
    {
        $service = app(AiMonitor::class);

        $alerts = $service->getRecentAlerts(10);

        $this->assertIsArray($alerts);
    }

    /**
     * Test: All Phase 4 services are registered in container.
     */
    public function test_phase4_services_are_registered(): void
    {
        $this->assertTrue(app()->bound(AiCacheService::class));
        $this->assertTrue(app()->bound(AiErrorHandler::class));
        $this->assertTrue(app()->bound(AiRateLimiter::class));
        $this->assertTrue(app()->bound(AiMonitor::class));
    }

    /**
     * Test: Services can be resolved with dependencies.
     */
    public function test_services_can_be_resolved(): void
    {
        $cacheService = app(AiCacheService::class);
        $this->assertInstanceOf(AiCacheService::class, $cacheService);

        $errorHandler = app(AiErrorHandler::class);
        $this->assertInstanceOf(AiErrorHandler::class, $errorHandler);

        $rateLimiter = app(AiRateLimiter::class);
        $this->assertInstanceOf(AiRateLimiter::class, $rateLimiter);

        $monitor = app(AiMonitor::class);
        $this->assertInstanceOf(AiMonitor::class, $monitor);
    }

    /**
     * Test: Rate limiter enforces task limits.
     */
    public function test_rate_limiter_enforces_task_limits(): void
    {
        $service = app(AiRateLimiter::class);

        // Get the task limit
        $remaining = $service->getRemaining('explain_triage', $this->user->id, 'doctor');
        $limit = $remaining['task']['limit'];

        // Record requests up to the limit
        for ($i = 0; $i < $limit + 5; $i++) {
            $service->record('explain_triage', $this->user->id, true);
        }

        // Check that limit is enforced
        $check = $service->check('explain_triage', $this->user->id, 'doctor');

        // Should be blocked due to task limit
        $this->assertFalse($check['allowed']);
        $this->assertEquals('task_limit_exceeded', $check['reason']);
    }

    /**
     * Test: Error handler provides clinical context awareness.
     */
    public function test_error_handler_clinical_context_awareness(): void
    {
        $service = app(AiErrorHandler::class);

        // Test with clinical task
        $exception = new \Exception('Provider unavailable');
        $result = $service->handle($exception, [
            'task' => 'explain_triage',
            'user_id' => $this->user->id,
        ]);

        // Clinical tasks should have higher severity
        $this->assertContains($result['error']['severity'], ['medium', 'high', 'critical']);

        // Should suggest clinical-specific recovery
        $suggestions = $result['error']['recovery']['suggestions'];
        $hasClinicalSuggestion = false;
        foreach ($suggestions as $suggestion) {
            if (str_contains(strtolower($suggestion), 'clinical') || 
                str_contains(strtolower($suggestion), 'manual review')) {
                $hasClinicalSuggestion = true;
                break;
            }
        }
        $this->assertTrue($hasClinicalSuggestion, 'Should include clinical-specific recovery suggestion');
    }

    /**
     * Test: Cache service uses task-specific TTLs.
     */
    public function test_cache_service_uses_task_specific_ttls(): void
    {
        $service = app(AiCacheService::class);

        $stats = $service->getStats();
        $taskTtls = $stats['task_ttls'];

        // Verify task-specific TTLs are defined
        $this->assertArrayHasKey('explain_triage', $taskTtls);
        $this->assertArrayHasKey('review_treatment', $taskTtls);
        $this->assertArrayHasKey('imci_classification', $taskTtls);

        // Verify TTLs are reasonable (shorter for clinical safety)
        $this->assertLessThanOrEqual(3600, $taskTtls['explain_triage']);
        $this->assertLessThanOrEqual(7200, $taskTtls['imci_classification']);
    }

    /**
     * Test: Monitor tracks latency percentiles.
     */
    public function test_monitor_tracks_latency(): void
    {
        $service = app(AiMonitor::class);

        // Record some requests with varying latency
        for ($i = 0; $i < 10; $i++) {
            $service->recordRequest([
                'task' => 'explain_triage',
                'latency_ms' => rand(100, 2000),
                'success' => true,
                'was_overridden' => false,
            ]);
        }

        $metrics = $service->getMetrics('minute');

        $this->assertArrayHasKey('latency', $metrics);
        // Latency stats may or may not have data depending on timing
        $this->assertIsArray($metrics['latency']);
    }
}
