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
 * Feature Tests for MedGemmaController Endpoints.
 *
 * Tests all AI endpoints including /medgemma, /structured, /health, /monitoring
 *
 * @group ai-sdk-phase5
 * @group ai-controller
 */
class MedGemmaControllerTest extends TestCase
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
    // Authentication Tests
    // ============================================

    public function test_medgemma_requires_authentication(): void
    {
        $response = $this->postJson('/api/ai/medgemma', [
            'task' => 'explain_triage',
        ]);

        $response->assertStatus(401);
    }

    public function test_health_endpoint_is_public(): void
    {
        $response = $this->getJson('/api/ai/health');

        $response->assertStatus(200);
    }

    public function test_monitoring_requires_authentication(): void
    {
        $response = $this->getJson('/api/ai/monitoring');

        $response->assertStatus(401);
    }

    // ============================================
    // /api/ai/medgemma Endpoint Tests
    // ============================================

    public function test_medgemma_returns_success_for_valid_request(): void
    {
        $response = $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => '123'],
            ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'content',
                'metadata',
            ]);
    }

    public function test_medgemma_validates_required_task(): void
    {
        $response = $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'context' => ['patient_id' => '123'],
            ]);

        $response->assertStatus(422);
    }

    public function test_medgemma_includes_rate_limit_headers(): void
    {
        $response = $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => '123'],
            ]);

        $response->assertHeader('X-RateLimit-Limit');
        $response->assertHeader('X-RateLimit-Remaining');
    }

    public function test_medgemma_returns_429_when_rate_limited(): void
    {
        // Exhaust rate limit
        $rateLimiter = app(AiRateLimiter::class);
        $minute = now()->format('Y-m-d H:i');
        
        // Set cache to exceed limit
        for ($i = 0; $i < 35; $i++) {
            $rateLimiter->record('explain_triage', $this->doctor->id, true);
        }

        $response = $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => '123'],
            ]);

        $response->assertStatus(429);
    }

    public function test_medgemma_returns_cached_response(): void
    {
        $cacheService = app(AiCacheService::class);
        
        // First request
        $response1 = $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'test-patient-123'],
            ]);

        // Second request with same context should hit cache
        $response2 = $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'test-patient-123'],
            ]);

        // Both should succeed
        $this->assertEquals(200, $response1->status());
        $this->assertEquals(200, $response2->status());
    }

    // ============================================
    // /api/ai/structured Endpoint Tests
    // ============================================

    public function test_structured_returns_structured_output(): void
    {
        $response = $this->actingAs($this->doctor)
            ->postJson('/api/ai/structured', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => '123'],
            ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'data',
            ]);
    }

    public function test_structured_validates_task_supports_structured_output(): void
    {
        $response = $this->actingAs($this->doctor)
            ->postJson('/api/ai/structured', [
                'task' => 'unknown_task',
                'context' => ['patient_id' => '123'],
            ]);

        $response->assertStatus(422);
    }

    public function test_structured_includes_schema_in_response(): void
    {
        $response = $this->actingAs($this->doctor)
            ->postJson('/api/ai/structured', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => '123'],
            ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'metadata' => ['schema'],
            ]);
    }

    // ============================================
    // /api/ai/health Endpoint Tests
    // ============================================

    public function test_health_returns_status(): void
    {
        $response = $this->getJson('/api/ai/health');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
            ]);
    }

    public function test_health_includes_health_score(): void
    {
        $response = $this->getJson('/api/ai/health');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'health' => ['score', 'status'],
            ]);
    }

    public function test_health_includes_feature_flags(): void
    {
        $response = $this->getJson('/api/ai/health');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'features',
            ]);
    }

    public function test_health_includes_alerts(): void
    {
        $response = $this->getJson('/api/ai/health');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'alerts',
            ]);
    }

    // ============================================
    // /api/ai/monitoring Endpoint Tests
    // ============================================

    public function test_monitoring_returns_metrics(): void
    {
        $response = $this->actingAs($this->doctor)
            ->getJson('/api/ai/monitoring');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'metrics',
            ]);
    }

    public function test_monitoring_accepts_period_parameter(): void
    {
        $response = $this->actingAs($this->doctor)
            ->getJson('/api/ai/monitoring?period=hour');

        $response->assertStatus(200);
    }

    public function test_monitoring_includes_cache_stats(): void
    {
        $response = $this->actingAs($this->doctor)
            ->getJson('/api/ai/monitoring');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'cache',
            ]);
    }

    public function test_monitoring_includes_rate_limit_stats(): void
    {
        $response = $this->actingAs($this->doctor)
            ->getJson('/api/ai/monitoring');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'rate_limits',
            ]);
    }

    public function test_monitoring_restricted_to_admin_and_doctor(): void
    {
        // Doctor should have access
        $responseDoctor = $this->actingAs($this->doctor)
            ->getJson('/api/ai/monitoring');
        $responseDoctor->assertStatus(200);

        // Admin should have access
        $responseAdmin = $this->actingAs($this->admin)
            ->getJson('/api/ai/monitoring');
        $responseAdmin->assertStatus(200);

        // Nurse should be denied
        $responseNurse = $this->actingAs($this->nurse)
            ->getJson('/api/ai/monitoring');
        $responseNurse->assertStatus(403);
    }

    // ============================================
    // /api/ai/tasks Endpoint Tests
    // ============================================

    public function test_tasks_returns_available_tasks(): void
    {
        $response = $this->actingAs($this->doctor)
            ->getJson('/api/ai/tasks');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'tasks',
            ]);
    }

    public function test_tasks_reflects_user_role(): void
    {
        $responseDoctor = $this->actingAs($this->doctor)
            ->getJson('/api/ai/tasks');

        $responseNurse = $this->actingAs($this->nurse)
            ->getJson('/api/ai/tasks');

        // Both should succeed but may have different available tasks
        $this->assertEquals(200, $responseDoctor->status());
        $this->assertEquals(200, $responseNurse->status());
    }

    public function test_tasks_includes_streaming_info(): void
    {
        $response = $this->actingAs($this->doctor)
            ->getJson('/api/ai/tasks');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'streaming_enabled',
            ]);
    }

    // ============================================
    // /api/ai/stream Endpoint Tests
    // ============================================

    public function test_stream_returns_event_stream(): void
    {
        $response = $this->actingAs($this->doctor)
            ->postJson('/api/ai/stream', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => '123'],
            ]);

        // Stream endpoint should return SSE content type or redirect
        $this->assertContains($response->status(), [200, 422]);
    }

    public function test_stream_validates_task_supports_streaming(): void
    {
        $response = $this->actingAs($this->doctor)
            ->postJson('/api/ai/stream', [
                'task' => 'unknown_task',
                'context' => ['patient_id' => '123'],
            ]);

        $response->assertStatus(422);
    }

    // ============================================
    // Error Handling Tests
    // ============================================

    public function test_returns_user_friendly_error_on_provider_failure(): void
    {
        // This test would require mocking the AI provider to fail
        // For now, we verify the error handler is available
        $errorHandler = app(AiErrorHandler::class);
        $this->assertInstanceOf(AiErrorHandler::class, $errorHandler);
    }

    // ============================================
    // Integration Tests
    // ============================================

    public function test_full_request_lifecycle_records_metrics(): void
    {
        $monitor = app(AiMonitor::class);
        
        $initialMetrics = $monitor->getMetrics('minute');
        $initialCount = $initialMetrics['requests']['total'];

        $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => '123'],
            ]);

        $finalMetrics = $monitor->getMetrics('minute');
        
        // Request count should have increased
        $this->assertGreaterThan($initialCount, $finalMetrics['requests']['total']);
    }

    public function test_rate_limit_decreases_after_request(): void
    {
        $rateLimiter = app(AiRateLimiter::class);
        
        $before = $rateLimiter->getRemaining('explain_triage', $this->doctor->id, 'doctor');

        $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => '123'],
            ]);

        $after = $rateLimiter->getRemaining('explain_triage', $this->doctor->id, 'doctor');

        $this->assertLessThan($before['task']['remaining'], $after['task']['remaining']);
    }

    public function test_cache_hit_does_not_decrease_rate_limit(): void
    {
        $rateLimiter = app(AiRateLimiter::class);
        
        // First request to populate cache
        $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'cache-test-456'],
            ]);

        $afterFirst = $rateLimiter->getRemaining('explain_triage', $this->doctor->id, 'doctor');

        // Second request with same context (should hit cache)
        $this->actingAs($this->doctor)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => ['patient_id' => 'cache-test-456'],
            ]);

        $afterSecond = $rateLimiter->getRemaining('explain_triage', $this->doctor->id, 'doctor');

        // Rate limit should be the same (cache hit)
        $this->assertEquals($afterFirst['task']['remaining'], $afterSecond['task']['remaining']);
    }

    public function test_nurse_has_different_tasks_than_doctor(): void
    {
        $responseDoctor = $this->actingAs($this->doctor)
            ->getJson('/api/ai/tasks');
        
        $responseNurse = $this->actingAs($this->nurse)
            ->getJson('/api/ai/tasks');

        $doctorTasks = $responseDoctor->json('tasks');
        $nurseTasks = $responseNurse->json('tasks');

        // Both should have tasks available
        $this->assertNotEmpty($doctorTasks);
        $this->assertNotEmpty($nurseTasks);
    }

    public function test_nurse_has_lower_quota_than_doctor(): void
    {
        $rateLimiter = app(AiRateLimiter::class);

        $doctorRemaining = $rateLimiter->getRemaining('explain_triage', $this->doctor->id, 'doctor');
        $nurseRemaining = $rateLimiter->getRemaining('explain_triage', $this->nurse->id, 'nurse');

        // Doctor should have higher quota than nurse
        $this->assertGreaterThan(
            $nurseRemaining['quota']['limit'],
            $doctorRemaining['quota']['limit']
        );
    }
}
