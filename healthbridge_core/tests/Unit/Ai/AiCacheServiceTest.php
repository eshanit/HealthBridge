<?php

namespace Tests\Unit\Ai;

use App\Services\Ai\AiCacheService;
use Illuminate\Support\Facades\Cache;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * Unit tests for AiCacheService.
 *
 * @group ai-sdk-phase5
 */
#[Group('ai-sdk-phase5')]
class AiCacheServiceTest extends TestCase
{
    protected AiCacheService $cacheService;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cacheService = new AiCacheService();
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

    public function test_cache_service_instantiates(): void
    {
        $this->assertInstanceOf(AiCacheService::class, $this->cacheService);
    }

    // ==========================================
    // Get Method Tests
    // ==========================================

    public function test_get_returns_null_for_missing_key(): void
    {
        $result = $this->cacheService->get('explain_triage', ['patient_id' => '123']);

        $this->assertNull($result);
    }

    public function test_get_returns_cached_response(): void
    {
        $context = ['patient_id' => '123', 'symptoms' => 'fever'];
        $response = [
            'success' => true,
            'content' => 'Test response',
            'metadata' => [],
        ];

        $this->cacheService->put('explain_triage', $context, $response);
        $cached = $this->cacheService->get('explain_triage', $context);

        $this->assertNotNull($cached);
        $this->assertEquals('Test response', $cached['content']);
    }

    public function test_get_returns_null_for_non_cacheable_task(): void
    {
        $result = $this->cacheService->get('emergency_assessment', ['patient_id' => '123']);

        $this->assertNull($result);
    }

    public function test_get_returns_null_for_critical_alert_task(): void
    {
        $result = $this->cacheService->get('critical_alert', ['patient_id' => '123']);

        $this->assertNull($result);
    }

    // ==========================================
    // Put Method Tests
    // ==========================================

    public function test_put_stores_response_in_cache(): void
    {
        $context = ['patient_id' => '123'];
        $response = [
            'success' => true,
            'content' => 'Cached content',
            'metadata' => [],
        ];

        $result = $this->cacheService->put('explain_triage', $context, $response);

        $this->assertTrue($result);
        $this->assertNotNull($this->cacheService->get('explain_triage', $context));
    }

    public function test_put_does_not_cache_error_responses(): void
    {
        $context = ['patient_id' => '123'];
        $response = [
            'success' => false,
            'error' => 'Something went wrong',
        ];

        $result = $this->cacheService->put('explain_triage', $context, $response);

        $this->assertFalse($result);
        $this->assertNull($this->cacheService->get('explain_triage', $context));
    }

    public function test_put_does_not_cache_modified_responses(): void
    {
        $context = ['patient_id' => '123'];
        $response = [
            'success' => true,
            'content' => 'Modified content',
            'metadata' => ['was_modified' => true],
        ];

        $result = $this->cacheService->put('explain_triage', $context, $response);

        $this->assertFalse($result);
    }

    public function test_put_does_not_cache_non_cacheable_tasks(): void
    {
        $context = ['patient_id' => '123'];
        $response = [
            'success' => true,
            'content' => 'Emergency content',
        ];

        $result = $this->cacheService->put('emergency_assessment', $context, $response);

        $this->assertFalse($result);
    }

    public function test_put_adds_cache_metadata(): void
    {
        $context = ['patient_id' => '123'];
        $response = [
            'success' => true,
            'content' => 'Test content',
            'metadata' => [],
        ];

        $this->cacheService->put('explain_triage', $context, $response);
        $cached = $this->cacheService->get('explain_triage', $context);

        $this->assertArrayHasKey('cached_at', $cached);
        $this->assertArrayHasKey('cache_key', $cached);
        $this->assertArrayHasKey('cache_ttl', $cached);
        $this->assertArrayHasKey('task', $cached);
        $this->assertEquals('explain_triage', $cached['task']);
    }

    // ==========================================
    // Cache Key Generation Tests
    // ==========================================

    public function test_different_contexts_generate_different_keys(): void
    {
        $context1 = ['patient_id' => '123', 'symptoms' => 'fever'];
        $context2 = ['patient_id' => '456', 'symptoms' => 'cough'];

        $response1 = ['success' => true, 'content' => 'Response 1'];
        $response2 = ['success' => true, 'content' => 'Response 2'];

        $this->cacheService->put('explain_triage', $context1, $response1);
        $this->cacheService->put('explain_triage', $context2, $response2);

        $cached1 = $this->cacheService->get('explain_triage', $context1);
        $cached2 = $this->cacheService->get('explain_triage', $context2);

        $this->assertEquals('Response 1', $cached1['content']);
        $this->assertEquals('Response 2', $cached2['content']);
    }

    public function test_same_context_returns_same_cache(): void
    {
        $context = ['patient_id' => '123', 'symptoms' => 'fever'];
        $response = ['success' => true, 'content' => 'Original response'];

        $this->cacheService->put('explain_triage', $context, $response);

        // Second put with same context should be retrievable
        $cached = $this->cacheService->get('explain_triage', $context);
        $this->assertEquals('Original response', $cached['content']);
    }

    public function test_different_tasks_generate_different_keys(): void
    {
        $context = ['patient_id' => '123'];
        $response1 = ['success' => true, 'content' => 'Triage response'];
        $response2 = ['success' => true, 'content' => 'Treatment response'];

        $this->cacheService->put('explain_triage', $context, $response1);
        $this->cacheService->put('review_treatment', $context, $response2);

        $cached1 = $this->cacheService->get('explain_triage', $context);
        $cached2 = $this->cacheService->get('review_treatment', $context);

        $this->assertEquals('Triage response', $cached1['content']);
        $this->assertEquals('Treatment response', $cached2['content']);
    }

    // ==========================================
    // Invalidation Tests
    // ==========================================

    public function test_invalidate_patient_increments_version(): void
    {
        $context = ['patient_id' => '123'];
        $response = ['success' => true, 'content' => 'Original'];

        $this->cacheService->put('explain_triage', $context, $response);
        
        // Verify cache was stored
        $cachedBefore = $this->cacheService->get('explain_triage', $context);
        $this->assertNotNull($cachedBefore);
        
        // Invalidate patient
        $result = $this->cacheService->invalidatePatient('123');
        $this->assertEquals(1, $result);
        
        // Verify patient version was incremented
        $versionKey = 'ai_response:patient_version:123';
        $version = Cache::get($versionKey, 0);
        $this->assertGreaterThanOrEqual(1, $version);
    }

    public function test_invalidate_task_increments_version(): void
    {
        $context = ['patient_id' => '123'];
        $response = ['success' => true, 'content' => 'Original'];

        $this->cacheService->put('explain_triage', $context, $response);
        
        // Verify cache was stored
        $cachedBefore = $this->cacheService->get('explain_triage', $context);
        $this->assertNotNull($cachedBefore);
        
        // Invalidate task
        $result = $this->cacheService->invalidateTask('explain_triage');
        $this->assertEquals(1, $result);
        
        // Verify task version was incremented
        $versionKey = 'ai_response:task_version:explain_triage';
        $version = Cache::get($versionKey, 0);
        $this->assertGreaterThanOrEqual(1, $version);
    }

    public function test_clear_all_clears_cache(): void
    {
        $context = ['patient_id' => '123'];
        $response = ['success' => true, 'content' => 'Content'];

        $this->cacheService->put('explain_triage', $context, $response);
        $this->cacheService->clearAll();

        // After clear all, cache should be empty
        $cached = $this->cacheService->get('explain_triage', $context);
        $this->assertNull($cached);
    }

    // ==========================================
    // Stats Tests
    // ==========================================

    public function test_get_stats_returns_correct_structure(): void
    {
        $stats = $this->cacheService->getStats();

        $this->assertArrayHasKey('driver', $stats);
        $this->assertArrayHasKey('prefix', $stats);
        $this->assertArrayHasKey('task_ttls', $stats);
        $this->assertArrayHasKey('non_cacheable_tasks', $stats);
    }

    public function test_stats_show_task_ttls(): void
    {
        $stats = $this->cacheService->getStats();

        $this->assertArrayHasKey('explain_triage', $stats['task_ttls']);
        $this->assertArrayHasKey('review_treatment', $stats['task_ttls']);
        $this->assertArrayHasKey('imci_classification', $stats['task_ttls']);
    }

    public function test_stats_show_non_cacheable_tasks(): void
    {
        $stats = $this->cacheService->getStats();

        $this->assertContains('emergency_assessment', $stats['non_cacheable_tasks']);
        $this->assertContains('critical_alert', $stats['non_cacheable_tasks']);
    }

    // ==========================================
    // Edge Cases
    // ==========================================

    public function test_handles_empty_context(): void
    {
        $response = ['success' => true, 'content' => 'Test'];

        $result = $this->cacheService->put('explain_triage', [], $response);

        $this->assertTrue($result);
        $cached = $this->cacheService->get('explain_triage', []);
        $this->assertNotNull($cached);
    }

    public function test_handles_nested_context(): void
    {
        $context = [
            'patient_id' => '123',
            'vitals' => [
                'temperature' => 38.5,
                'blood_pressure' => '120/80',
            ],
        ];
        $response = ['success' => true, 'content' => 'Nested test'];

        $this->cacheService->put('explain_triage', $context, $response);
        $cached = $this->cacheService->get('explain_triage', $context);

        $this->assertNotNull($cached);
        $this->assertEquals('Nested test', $cached['content']);
    }

    public function test_handles_special_characters_in_context(): void
    {
        $context = [
            'patient_id' => '123',
            'notes' => 'Special chars: <>&"\'',
        ];
        $response = ['success' => true, 'content' => 'Special test'];

        $this->cacheService->put('explain_triage', $context, $response);
        $cached = $this->cacheService->get('explain_triage', $context);

        $this->assertNotNull($cached);
    }

    public function test_context_order_does_not_matter(): void
    {
        $context1 = ['patient_id' => '123', 'symptoms' => 'fever'];
        $context2 = ['symptoms' => 'fever', 'patient_id' => '123'];
        $response = ['success' => true, 'content' => 'Order test'];

        $this->cacheService->put('explain_triage', $context1, $response);
        $cached = $this->cacheService->get('explain_triage', $context2);

        $this->assertNotNull($cached);
        $this->assertEquals('Order test', $cached['content']);
    }

    public function test_volatile_fields_excluded_from_key(): void
    {
        $context1 = ['patient_id' => '123', 'timestamp' => time(), 'user_id' => 1];
        $context2 = ['patient_id' => '123', 'timestamp' => time() + 100, 'user_id' => 2];
        $response = ['success' => true, 'content' => 'Volatile test'];

        $this->cacheService->put('explain_triage', $context1, $response);
        $cached = $this->cacheService->get('explain_triage', $context2);

        // Should return cached response because volatile fields are ignored
        $this->assertNotNull($cached);
        $this->assertEquals('Volatile test', $cached['content']);
    }
}
