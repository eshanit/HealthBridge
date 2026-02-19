<?php

namespace Tests\Unit\Ai;

use App\Services\Ai\AiRateLimiter;
use Illuminate\Support\Facades\Cache;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * Unit tests for AiRateLimiter service.
 *
 * @group ai-sdk-phase5
 */
#[Group('ai-sdk-phase5')]
class AiRateLimiterTest extends TestCase
{
    protected AiRateLimiter $rateLimiter;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rateLimiter = new AiRateLimiter();
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

    public function test_rate_limiter_instantiates(): void
    {
        $this->assertInstanceOf(AiRateLimiter::class, $this->rateLimiter);
    }

    // ==========================================
    // Check Method Tests
    // ==========================================

    public function test_check_returns_allowed_when_under_limit(): void
    {
        $result = $this->rateLimiter->check('explain_triage', 1, 'doctor');

        $this->assertTrue($result['allowed']);
        $this->assertArrayHasKey('limits', $result);
        $this->assertArrayHasKey('global', $result['limits']);
        $this->assertArrayHasKey('task', $result['limits']);
        $this->assertArrayHasKey('quota', $result['limits']);
    }

    public function test_check_returns_not_allowed_when_over_task_limit(): void
    {
        // Simulate hitting task limit (30 for explain_triage)
        $minute = now()->format('Y-m-d H:i');
        Cache::put('ai_rate:task:explain_triage:1:' . $minute, 30, 120);

        $result = $this->rateLimiter->check('explain_triage', 1, 'doctor');

        $this->assertFalse($result['allowed']);
        $this->assertEquals('task_limit_exceeded', $result['reason']);
    }

    public function test_check_returns_not_allowed_when_over_global_limit(): void
    {
        // Simulate hitting global limit (200)
        $minute = now()->format('Y-m-d H:i');
        Cache::put('ai_rate:global:' . $minute, 200, 120);

        $result = $this->rateLimiter->check('explain_triage', 1, 'doctor');

        $this->assertFalse($result['allowed']);
        $this->assertEquals('global_limit_exceeded', $result['reason']);
    }

    public function test_check_returns_not_allowed_when_over_user_quota(): void
    {
        // Simulate hitting user daily quota (500 for doctor)
        $day = now()->format('Y-m-d');
        Cache::put('ai_rate:quota:1:' . $day, 500, 86400);

        $result = $this->rateLimiter->check('explain_triage', 1, 'doctor');

        $this->assertFalse($result['allowed']);
        $this->assertEquals('quota_exceeded', $result['reason']);
    }

    public function test_check_uses_default_role_for_unknown_role(): void
    {
        $result = $this->rateLimiter->check('explain_triage', 1, 'unknown_role');

        $this->assertTrue($result['allowed']);
        // Default quota is 100
        $this->assertEquals(100, $result['limits']['quota']['limit']);
    }

    public function test_check_uses_default_task_limit_for_unknown_task(): void
    {
        $result = $this->rateLimiter->check('unknown_task', 1, 'doctor');

        $this->assertTrue($result['allowed']);
        // Default task limit is 20
        $this->assertEquals(20, $result['limits']['task']['limit']);
    }

    // ==========================================
    // Record Method Tests
    // ==========================================

    public function test_record_increments_global_counter(): void
    {
        $this->rateLimiter->record('explain_triage', 1, true);

        $minute = now()->format('Y-m-d H:i');
        $globalCount = Cache::get('ai_rate:global:' . $minute, 0);

        $this->assertEquals(1, $globalCount);
    }

    public function test_record_increments_task_counter(): void
    {
        $this->rateLimiter->record('explain_triage', 1, true);

        $minute = now()->format('Y-m-d H:i');
        $taskCount = Cache::get('ai_rate:task:explain_triage:1:' . $minute, 0);

        $this->assertEquals(1, $taskCount);
    }

    public function test_record_increments_user_quota(): void
    {
        $this->rateLimiter->record('explain_triage', 1, true);

        $day = now()->format('Y-m-d');
        $quotaCount = Cache::get('ai_rate:quota:1:' . $day, 0);

        $this->assertEquals(1, $quotaCount);
    }

    public function test_record_tracks_success_and_failure(): void
    {
        $this->rateLimiter->record('explain_triage', 1, true);
        $this->rateLimiter->record('explain_triage', 1, false);

        $day = now()->format('Y-m-d');
        $successCount = Cache::get('ai_rate:success:explain_triage:' . $day, 0);
        $failureCount = Cache::get('ai_rate:failure:explain_triage:' . $day, 0);

        $this->assertEquals(1, $successCount);
        $this->assertEquals(1, $failureCount);
    }

    // ==========================================
    // GetRemaining Method Tests
    // ==========================================

    public function test_get_remaining_returns_correct_values(): void
    {
        $remaining = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');

        $this->assertArrayHasKey('global', $remaining);
        $this->assertArrayHasKey('task', $remaining);
        $this->assertArrayHasKey('quota', $remaining);

        $this->assertArrayHasKey('limit', $remaining['global']);
        $this->assertArrayHasKey('used', $remaining['global']);
        $this->assertArrayHasKey('remaining', $remaining['global']);
    }

    public function test_get_remaining_decreases_after_record(): void
    {
        $before = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');

        $this->rateLimiter->record('explain_triage', 1, true);

        $after = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');

        $this->assertEquals($before['task']['remaining'] - 1, $after['task']['remaining']);
    }

    public function test_get_remaining_does_not_go_negative(): void
    {
        // Fill up the task limit
        $minute = now()->format('Y-m-d H:i');
        Cache::put('ai_rate:task:explain_triage:1:' . $minute, 50, 120);

        $remaining = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');

        $this->assertGreaterThanOrEqual(0, $remaining['task']['remaining']);
    }

    // ==========================================
    // GetHeaders Method Tests
    // ==========================================

    public function test_get_headers_returns_correct_format(): void
    {
        $remaining = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');
        $headers = $this->rateLimiter->getHeaders($remaining);

        $this->assertArrayHasKey('X-RateLimit-Limit', $headers);
        $this->assertArrayHasKey('X-RateLimit-Remaining', $headers);
        $this->assertArrayHasKey('X-RateLimit-Reset', $headers);
        $this->assertArrayHasKey('X-DailyQuota-Limit', $headers);
        $this->assertArrayHasKey('X-DailyQuota-Remaining', $headers);
        $this->assertArrayHasKey('X-DailyQuota-Reset', $headers);
    }

    public function test_headers_contain_numeric_values(): void
    {
        $remaining = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');
        $headers = $this->rateLimiter->getHeaders($remaining);

        $this->assertIsNumeric($headers['X-RateLimit-Limit']);
        $this->assertIsNumeric($headers['X-RateLimit-Remaining']);
        $this->assertIsNumeric($headers['X-DailyQuota-Limit']);
        $this->assertIsNumeric($headers['X-DailyQuota-Remaining']);
    }

    // ==========================================
    // GetStats Method Tests
    // ==========================================

    public function test_get_stats_returns_correct_structure(): void
    {
        $stats = $this->rateLimiter->getStats();

        $this->assertArrayHasKey('limits', $stats);
        $this->assertArrayHasKey('usage', $stats);
        $this->assertArrayHasKey('task_limits', $stats['limits']);
        $this->assertArrayHasKey('user_quotas', $stats['limits']);
        $this->assertArrayHasKey('global_limit', $stats['limits']);
    }

    public function test_stats_reflect_actual_usage(): void
    {
        $this->rateLimiter->record('explain_triage', 1, true);
        $this->rateLimiter->record('explain_triage', 1, false);

        $stats = $this->rateLimiter->getStats();

        $this->assertEquals(1, $stats['usage']['explain_triage']['success']);
        $this->assertEquals(1, $stats['usage']['explain_triage']['failure']);
    }

    // ==========================================
    // Role-Based Quota Tests
    // ==========================================

    public function test_concurrent_users_have_separate_quotas(): void
    {
        $this->rateLimiter->record('explain_triage', 1, 'doctor');
        $this->rateLimiter->record('explain_triage', 2, 'doctor');

        $remaining1 = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');
        $remaining2 = $this->rateLimiter->getRemaining('explain_triage', 2, 'doctor');

        // Each user should have their own quota tracking
        $this->assertEquals(1, $remaining1['quota']['used']);
        $this->assertEquals(1, $remaining2['quota']['used']);
    }

    public function test_different_tasks_have_separate_limits(): void
    {
        $this->rateLimiter->record('explain_triage', 1, 'doctor');
        $this->rateLimiter->record('review_treatment', 1, 'doctor');

        $triageRemaining = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');
        $reviewRemaining = $this->rateLimiter->getRemaining('review_treatment', 1, 'doctor');

        // Each task should have its own limit tracking
        $this->assertEquals(1, $triageRemaining['task']['used']);
        $this->assertEquals(1, $reviewRemaining['task']['used']);
    }

    public function test_doctor_has_higher_quota_than_nurse(): void
    {
        $doctorRemaining = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');
        $nurseRemaining = $this->rateLimiter->getRemaining('explain_triage', 2, 'nurse');

        $this->assertGreaterThan(
            $nurseRemaining['quota']['limit'],
            $doctorRemaining['quota']['limit']
        );
    }

    public function test_admin_has_lower_quota_than_clinical_staff(): void
    {
        $doctorRemaining = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');
        $adminRemaining = $this->rateLimiter->getRemaining('explain_triage', 2, 'admin');

        $this->assertLessThan(
            $doctorRemaining['quota']['limit'],
            $adminRemaining['quota']['limit']
        );
    }

    // ==========================================
    // ResetForUser Method Tests
    // ==========================================

    public function test_reset_for_user_clears_user_limits(): void
    {
        $this->rateLimiter->record('explain_triage', 1, 'doctor');
        $this->rateLimiter->resetForUser(1);

        $remaining = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');

        $this->assertEquals(0, $remaining['quota']['used']);
    }

    // ==========================================
    // UpdateLimits Method Tests
    // ==========================================

    public function test_update_limits_changes_task_limits(): void
    {
        $this->rateLimiter->updateLimits(['explain_triage' => 50]);

        $remaining = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');

        $this->assertEquals(50, $remaining['task']['limit']);
    }

    public function test_update_limits_changes_user_quotas(): void
    {
        $this->rateLimiter->updateLimits([], ['doctor' => 1000]);

        $remaining = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');

        $this->assertEquals(1000, $remaining['quota']['limit']);
    }

    public function test_update_limits_changes_global_limit(): void
    {
        $this->rateLimiter->updateLimits([], [], 500);

        $remaining = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');

        $this->assertEquals(500, $remaining['global']['limit']);
    }

    // ==========================================
    // Edge Cases
    // ==========================================

    public function test_handles_zero_usage(): void
    {
        $remaining = $this->rateLimiter->getRemaining('explain_triage', 999, 'doctor');

        $this->assertEquals(0, $remaining['task']['used']);
        $this->assertEquals(0, $remaining['quota']['used']);
        $this->assertEquals(0, $remaining['global']['used']);
    }

    public function test_handles_multiple_records(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->rateLimiter->record('explain_triage', 1, true);
        }

        $remaining = $this->rateLimiter->getRemaining('explain_triage', 1, 'doctor');

        $this->assertEquals(10, $remaining['task']['used']);
    }
}
