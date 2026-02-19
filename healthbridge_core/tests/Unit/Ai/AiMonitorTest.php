<?php

namespace Tests\Unit\Ai;

use App\Services\Ai\AiMonitor;
use Illuminate\Support\Facades\Cache;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * Unit tests for AiMonitor service.
 *
 * @group ai-sdk-phase5
 */
#[Group('ai-sdk-phase5')]
class AiMonitorTest extends TestCase
{
    protected AiMonitor $monitor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monitor = new AiMonitor();
        Cache::flush();
    }

    protected function tearDown(): void
    {
        Cache::flush();
        parent::tearDown();
    }

    // ==========================================
    // Instantiation Tests
    // ==========================================

    public function test_monitor_instantiates(): void
    {
        $this->assertInstanceOf(AiMonitor::class, $this->monitor);
    }

    // ==========================================
    // Record Request Tests
    // ==========================================

    public function test_record_request_stores_metrics(): void
    {
        $this->monitor->recordRequest([
            'task' => 'explain_triage',
            'success' => true,
            'latency_ms' => 500,
        ]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(1, $metrics['requests']['total']);
        $this->assertEquals(1, $metrics['requests']['success']);
    }

    public function test_record_request_tracks_success(): void
    {
        $this->monitor->recordRequest([
            'task' => 'explain_triage',
            'success' => true,
            'latency_ms' => 500,
        ]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(1, $metrics['requests']['success']);
        $this->assertEquals(0, $metrics['requests']['failure']);
    }

    public function test_record_request_tracks_failure(): void
    {
        $this->monitor->recordRequest([
            'task' => 'explain_triage',
            'success' => false,
            'latency_ms' => 500,
        ]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(0, $metrics['requests']['success']);
        $this->assertEquals(1, $metrics['requests']['failure']);
    }

    public function test_record_request_tracks_latency(): void
    {
        $this->monitor->recordRequest([
            'task' => 'explain_triage',
            'success' => true,
            'latency_ms' => 500,
        ]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertArrayHasKey('explain_triage', $metrics['latency']);
        $this->assertEquals(500, $metrics['latency']['explain_triage']['min']);
        $this->assertEquals(500, $metrics['latency']['explain_triage']['max']);
    }

    public function test_record_request_tracks_validation_override(): void
    {
        $this->monitor->recordRequest([
            'task' => 'explain_triage',
            'success' => true,
            'latency_ms' => 500,
            'was_overridden' => true,
        ]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(1, $metrics['validation']['overridden']);
    }

    // ==========================================
    // Get Metrics Tests
    // ==========================================

    public function test_get_metrics_by_minute(): void
    {
        $this->monitor->recordRequest([
            'task' => 'explain_triage',
            'success' => true,
            'latency_ms' => 500,
        ]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals('minute', $metrics['period']);
    }

    public function test_get_metrics_by_hour(): void
    {
        $this->monitor->recordRequest([
            'task' => 'explain_triage',
            'success' => true,
            'latency_ms' => 500,
        ]);

        $metrics = $this->monitor->getMetrics('hour');

        $this->assertEquals('hour', $metrics['period']);
    }

    public function test_get_metrics_by_day(): void
    {
        $this->monitor->recordRequest([
            'task' => 'explain_triage',
            'success' => true,
            'latency_ms' => 500,
        ]);

        $metrics = $this->monitor->getMetrics('day');

        $this->assertEquals('day', $metrics['period']);
    }

    public function test_metrics_aggregate_multiple_requests(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->monitor->recordRequest([
                'task' => 'explain_triage',
                'success' => true,
                'latency_ms' => 100 * ($i + 1),
            ]);
        }

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(5, $metrics['requests']['total']);
        $this->assertEquals(5, $metrics['requests']['success']);
    }

    // ==========================================
    // Latency Stats Tests
    // ==========================================

    public function test_tracks_min_latency(): void
    {
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 500]);
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 200]);
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 800]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(200, $metrics['latency']['explain_triage']['min']);
    }

    public function test_tracks_max_latency(): void
    {
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 500]);
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 200]);
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 800]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(800, $metrics['latency']['explain_triage']['max']);
    }

    public function test_tracks_average_latency(): void
    {
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 500]);
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 200]);
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 800]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(500, $metrics['latency']['explain_triage']['avg']);
    }

    // ==========================================
    // Health Score Tests
    // ==========================================

    public function test_health_score_starts_at_100(): void
    {
        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(100, $metrics['health']['score']);
        $this->assertEquals('healthy', $metrics['health']['status']);
    }

    public function test_health_score_decreases_with_errors(): void
    {
        // Record 20% error rate (exceeds warning threshold of 5%)
        for ($i = 0; $i < 8; $i++) {
            $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 100]);
        }
        for ($i = 0; $i < 2; $i++) {
            $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => false, 'latency_ms' => 100]);
        }

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertLessThan(100, $metrics['health']['score']);
    }

    public function test_health_status_reflects_score(): void
    {
        // Record high error rate to degrade health
        for ($i = 0; $i < 5; $i++) {
            $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => false, 'latency_ms' => 100]);
        }

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertContains($metrics['health']['status'], ['degraded', 'unhealthy', 'critical']);
    }

    // ==========================================
    // Task Metrics Tests
    // ==========================================

    public function test_tracks_metrics_by_task(): void
    {
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 100]);
        $this->monitor->recordRequest(['task' => 'review_treatment', 'success' => true, 'latency_ms' => 200]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertArrayHasKey('explain_triage', $metrics['by_task']);
        $this->assertArrayHasKey('review_treatment', $metrics['by_task']);
    }

    public function test_task_metrics_include_count(): void
    {
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 100]);
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 200]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(2, $metrics['by_task']['explain_triage']['requests']);
    }

    // ==========================================
    // Error Rate Tests
    // ==========================================

    public function test_calculates_error_rate(): void
    {
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 100]);
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => true, 'latency_ms' => 100]);
        $this->monitor->recordRequest(['task' => 'explain_triage', 'success' => false, 'latency_ms' => 100]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEqualsWithDelta(0.3333, $metrics['requests']['error_rate'], 0.01);
    }

    // ==========================================
    // Edge Cases
    // ==========================================

    public function test_handles_zero_latency(): void
    {
        $this->monitor->recordRequest([
            'task' => 'explain_triage',
            'success' => true,
            'latency_ms' => 0,
        ]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(0, $metrics['latency']['explain_triage']['min']);
    }

    public function test_handles_very_high_latency(): void
    {
        $this->monitor->recordRequest([
            'task' => 'explain_triage',
            'success' => true,
            'latency_ms' => 60000, // 1 minute
        ]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(60000, $metrics['latency']['explain_triage']['max']);
    }

    public function test_handles_missing_optional_fields(): void
    {
        $this->monitor->recordRequest([
            'task' => 'explain_triage',
        ]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(1, $metrics['requests']['total']);
    }

    public function test_handles_unknown_task(): void
    {
        $this->monitor->recordRequest([
            'task' => 'unknown_task',
            'success' => true,
            'latency_ms' => 100,
        ]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(1, $metrics['requests']['total']);
    }

    public function test_handles_empty_data(): void
    {
        $this->monitor->recordRequest([]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertEquals(1, $metrics['requests']['total']);
    }

    // ==========================================
    // Metrics Structure Tests
    // ==========================================

    public function test_metrics_has_required_structure(): void
    {
        $this->monitor->recordRequest([
            'task' => 'explain_triage',
            'success' => true,
            'latency_ms' => 100,
        ]);

        $metrics = $this->monitor->getMetrics('minute');

        $this->assertArrayHasKey('period', $metrics);
        $this->assertArrayHasKey('key', $metrics);
        $this->assertArrayHasKey('requests', $metrics);
        $this->assertArrayHasKey('validation', $metrics);
        $this->assertArrayHasKey('latency', $metrics);
        $this->assertArrayHasKey('by_task', $metrics);
        $this->assertArrayHasKey('health', $metrics);
    }

    public function test_requests_has_required_fields(): void
    {
        $metrics = $this->monitor->getMetrics('minute');

        $this->assertArrayHasKey('total', $metrics['requests']);
        $this->assertArrayHasKey('success', $metrics['requests']);
        $this->assertArrayHasKey('failure', $metrics['requests']);
        $this->assertArrayHasKey('error_rate', $metrics['requests']);
    }

    public function test_health_has_required_fields(): void
    {
        $metrics = $this->monitor->getMetrics('minute');

        $this->assertArrayHasKey('score', $metrics['health']);
        $this->assertArrayHasKey('status', $metrics['health']);
        $this->assertArrayHasKey('issues', $metrics['health']);
    }
}
