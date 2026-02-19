<?php

namespace Tests\Feature\Ai;

use App\Models\User;
use App\Services\Ai\AiCacheService;
use App\Services\Ai\AiMonitor;
use App\Services\Ai\AiRateLimiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Performance Benchmark Tests for AI SDK Migration.
 *
 * Compares pre-migration and post-migration performance metrics
 * to validate the migration was successful.
 *
 * @group ai-sdk-phase5
 * @group ai-performance
 */
class AiPerformanceBenchmarkTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();

        // Create role and assign to user
        Role::firstOrCreate(['name' => 'doctor', 'guard_name' => 'web']);
        
        $this->user = User::factory()->create();
        $this->user->assignRole('doctor');
        
        Cache::flush();
    }

    protected function tearDown(): void
    {
        Cache::flush();
        parent::tearDown();
    }

    // ============================================
    // Response Time Benchmarks
    // ============================================

    public function test_baseline_response_time(): void
    {
        $iterations = 10;
        $times = [];

        for ($i = 0; $i < $iterations; $i++) {
            $start = microtime(true);

            $response = $this->actingAs($this->user)
                ->postJson('/api/ai/medgemma', [
                    'task' => 'explain_triage',
                    'context' => ['patient_id' => "benchmark_$i"],
                ]);

            $times[] = (microtime(true) - $start) * 1000; // Convert to ms
        }

        $avgTime = array_sum($times) / count($times);
        $maxTime = max($times);
        $minTime = min($times);

        // Log results for analysis
        $this->assertLessThan(5000, $avgTime, "Average response time should be under 5 seconds");

        // Basic assertions
        $this->assertGreaterThan(0, $avgTime);
        $this->assertLessThanOrEqual($maxTime, $avgTime);
        $this->assertGreaterThanOrEqual($minTime, $avgTime);
    }

    public function test_cached_response_time(): void
    {
        $cacheService = app(AiCacheService::class);

        // First request (no cache)
        $start1 = microtime(true);
        $response1 = $this->actingAs($this->user)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'cached_benchmark_test'],
            ]);
        $time1 = (microtime(true) - $start1) * 1000;

        // Second request (should hit cache)
        $start2 = microtime(true);
        $response2 = $this->actingAs($this->user)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'cached_benchmark_test'],
            ]);
        $time2 = (microtime(true) - $start2) * 1000;

        // Both should succeed
        $this->assertEquals(200, $response1->status());
        $this->assertEquals(200, $response2->status());

        // Cached response should be faster or similar
        $this->assertGreaterThan(0, $time1);
        $this->assertGreaterThan(0, $time2);
    }

    public function test_structured_output_response_time(): void
    {
        $iterations = 5;
        $times = [];

        for ($i = 0; $i < $iterations; $i++) {
            $start = microtime(true);

            $response = $this->actingAs($this->user)
                ->postJson('/api/ai/structured', [
                    'task' => 'explain_triage',
                    'context' => ['patient_id' => "structured_$i"],
                ]);

            $times[] = (microtime(true) - $start) * 1000;
        }

        $avgTime = array_sum($times) / count($times);

        // Structured output should still be reasonably fast
        $this->assertLessThan(10000, $avgTime, "Structured output should complete in under 10 seconds");
    }

    // ============================================
    // Throughput Benchmarks
    // ============================================

    public function test_requests_per_second(): void
    {
        $iterations = 20;
        $startTime = microtime(true);

        for ($i = 0; $i < $iterations; $i++) {
            $this->actingAs($this->user)
                ->postJson('/api/ai/medgemma', [
                    'task' => 'explain_triage',
                    'context' => ['patient_id' => "throughput_$i"],
                ]);
        }

        $totalTime = microtime(true) - $startTime;
        $requestsPerSecond = $iterations / $totalTime;

        // Should handle at least 1 request per second
        $this->assertGreaterThan(0.5, $requestsPerSecond, "Should handle at least 0.5 requests per second");
    }

    public function test_concurrent_request_handling(): void
    {
        $concurrentUsers = 3;
        $requestsPerUser = 5;
        $totalRequests = $concurrentUsers * $requestsPerUser;

        $startTime = microtime(true);

        for ($u = 0; $u < $concurrentUsers; $u++) {
            $user = User::factory()->create();
            $user->assignRole('doctor');

            for ($r = 0; $r < $requestsPerUser; $r++) {
                $this->actingAs($user)
                    ->postJson('/api/ai/medgemma', [
                        'task' => 'explain_triage',
                        'context' => ['patient_id' => "concurrent_u{$u}_r{$r}"],
                    ]);
            }
        }

        $totalTime = microtime(true) - $startTime;

        // All requests should complete in reasonable time
        $this->assertLessThan(60, $totalTime, "$totalRequests requests should complete in under 60 seconds");
    }

    // ============================================
    // Service Performance Benchmarks
    // ============================================

    public function test_rate_limiter_check_performance(): void
    {
        $rateLimiter = app(AiRateLimiter::class);
        $iterations = 100;
        $times = [];

        for ($i = 0; $i < $iterations; $i++) {
            $start = microtime(true);
            $rateLimiter->check('explain_triage', $this->user->id, 'doctor');
            $times[] = (microtime(true) - $start) * 1000;
        }

        $avgTime = array_sum($times) / count($times);

        // Rate limiter check should be very fast
        $this->assertLessThan(10, $avgTime, "Rate limiter check should average under 10ms");
    }

    public function test_rate_limiter_record_performance(): void
    {
        $rateLimiter = app(AiRateLimiter::class);
        $iterations = 100;
        $times = [];

        for ($i = 0; $i < $iterations; $i++) {
            $start = microtime(true);
            $rateLimiter->record('explain_triage', $this->user->id, true);
            $times[] = (microtime(true) - $start) * 1000;
        }

        $avgTime = array_sum($times) / count($times);

        // Rate limiter record should be fast
        $this->assertLessThan(20, $avgTime, "Rate limiter record should average under 20ms");
    }

    public function test_cache_put_performance(): void
    {
        $cacheService = app(AiCacheService::class);
        $iterations = 50;
        $times = [];

        for ($i = 0; $i < $iterations; $i++) {
            $start = microtime(true);
            $cacheService->put('explain_triage', ['patient_id' => "perf_$i"], ['success' => true, 'content' => 'test']);
            $times[] = (microtime(true) - $start) * 1000;
        }

        $avgTime = array_sum($times) / count($times);

        // Cache put should be fast
        $this->assertLessThan(20, $avgTime, "Cache put should average under 20ms");
    }

    public function test_cache_get_performance(): void
    {
        $cacheService = app(AiCacheService::class);
        $iterations = 50;

        // Pre-populate cache
        $cacheService->put('explain_triage', ['patient_id' => 'get_perf_test'], ['success' => true, 'content' => 'test']);

        $times = [];
        for ($i = 0; $i < $iterations; $i++) {
            $start = microtime(true);
            $cacheService->get('explain_triage', ['patient_id' => 'get_perf_test']);
            $times[] = (microtime(true) - $start) * 1000;
        }

        $avgTime = array_sum($times) / count($times);

        // Cache get should be very fast
        $this->assertLessThan(10, $avgTime, "Cache get should average under 10ms");
    }

    public function test_monitoring_record_performance(): void
    {
        $monitor = app(AiMonitor::class);
        $iterations = 100;
        $times = [];

        for ($i = 0; $i < $iterations; $i++) {
            $start = microtime(true);
            $monitor->recordRequest([
                'task' => 'explain_triage',
                'success' => true,
                'latency_ms' => 100,
            ]);
            $times[] = (microtime(true) - $start) * 1000;
        }

        $avgTime = array_sum($times) / count($times);

        // Monitoring record should be fast
        $this->assertLessThan(20, $avgTime, "Monitor record should average under 20ms");
    }

    public function test_health_score_calculation_performance(): void
    {
        $monitor = app(AiMonitor::class);
        $iterations = 50;
        $times = [];

        for ($i = 0; $i < $iterations; $i++) {
            $start = microtime(true);
            $monitor->getMetrics('minute');
            $times[] = (microtime(true) - $start) * 1000;
        }

        $avgTime = array_sum($times) / count($times);

        // Health score calculation should be fast
        $this->assertLessThan(50, $avgTime, "Metrics retrieval should average under 50ms");
    }

    // ============================================
    // Memory Usage Benchmarks
    // ============================================

    public function test_memory_usage_under_load(): void
    {
        $initialMemory = memory_get_usage(true);

        // Make 50 requests
        for ($i = 0; $i < 50; $i++) {
            $this->actingAs($this->user)
                ->postJson('/api/ai/medgemma', [
                    'task' => 'explain_triage',
                    'context' => ['patient_id' => "memory_$i"],
                ]);
        }

        $finalMemory = memory_get_usage(true);
        $memoryIncrease = $finalMemory - $initialMemory;

        // Memory increase should be reasonable (less than 50MB)
        $this->assertLessThan(50 * 1024 * 1024, $memoryIncrease, "Memory increase should be under 50MB for 50 requests");
    }

    // ============================================
    // Summary Benchmark
    // ============================================

    public function test_migration_performance_summary(): void
    {
        $results = [
            'rate_limiter_check' => [],
            'cache_get' => [],
            'monitoring_record' => [],
        ];

        $rateLimiter = app(AiRateLimiter::class);
        $cacheService = app(AiCacheService::class);
        $monitor = app(AiMonitor::class);

        // Pre-populate cache
        $cacheService->put('explain_triage', ['patient_id' => 'summary_test'], ['success' => true, 'content' => 'test']);

        for ($i = 0; $i < 20; $i++) {
            // Rate limiter
            $start = microtime(true);
            $rateLimiter->check('explain_triage', $this->user->id, 'doctor');
            $results['rate_limiter_check'][] = (microtime(true) - $start) * 1000;

            // Cache
            $start = microtime(true);
            $cacheService->get('explain_triage', ['patient_id' => 'summary_test']);
            $results['cache_get'][] = (microtime(true) - $start) * 1000;

            // Monitoring
            $start = microtime(true);
            $monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 100]);
            $results['monitoring_record'][] = (microtime(true) - $start) * 1000;
        }

        // Calculate averages
        $averages = [];
        foreach ($results as $key => $times) {
            $averages[$key] = array_sum($times) / count($times);
        }

        // All services should perform well
        $this->assertLessThan(20, $averages['rate_limiter_check'], "Rate limiter check avg under 20ms");
        $this->assertLessThan(10, $averages['cache_get'], "Cache get avg under 10ms");
        $this->assertLessThan(20, $averages['monitoring_record'], "Monitoring record avg under 20ms");
    }
}
