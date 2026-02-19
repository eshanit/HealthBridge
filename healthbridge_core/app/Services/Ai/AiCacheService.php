<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * AI Response Caching Service
 *
 * Provides intelligent caching for AI responses to reduce latency and API costs.
 * Implements cache invalidation strategies appropriate for clinical data.
 *
 * @package App\Services\Ai
 */
class AiCacheService
{
    /**
     * Cache prefix for all AI responses.
     */
    protected string $cachePrefix = 'ai_response:';

    /**
     * Default TTL for cached responses (in seconds).
     * Clinical data should have shorter cache times for safety.
     */
    protected int $defaultTtl = 3600; // 1 hour

    /**
     * Task-specific TTL configurations.
     */
    protected array $taskTtls = [
        'explain_triage' => 1800,      // 30 minutes - triage can change
        'review_treatment' => 3600,    // 1 hour - treatment plans are relatively stable
        'imci_classification' => 7200, // 2 hours - IMCI is guideline-based
        'clinical_assistance' => 1800, // 30 minutes - clinical context changes
    ];

    /**
     * Tasks that should never be cached.
     */
    protected array $nonCacheableTasks = [
        'emergency_assessment',
        'critical_alert',
    ];

    /**
     * Get a cached AI response.
     *
     * @param string $task The task identifier
     * @param array $context The context used to generate the response
     * @param array $options Additional options (model, temperature, etc.)
     * @return array|null The cached response or null if not found
     */
    public function get(string $task, array $context, array $options = []): ?array
    {
        if ($this->shouldNotCache($task)) {
            return null;
        }

        $cacheKey = $this->generateCacheKey($task, $context, $options);

        $cached = Cache::get($cacheKey);

        if ($cached) {
            Log::debug('AI cache hit', [
                'task' => $task,
                'cache_key' => $cacheKey,
                'age_seconds' => time() - ($cached['cached_at'] ?? time()),
            ]);

            return $cached;
        }

        Log::debug('AI cache miss', [
            'task' => $task,
            'cache_key' => $cacheKey,
        ]);

        return null;
    }

    /**
     * Store an AI response in cache.
     *
     * @param string $task The task identifier
     * @param array $context The context used to generate the response
     * @param array $response The AI response to cache
     * @param array $options Additional options
     * @return bool True if cached successfully
     */
    public function put(string $task, array $context, array $response, array $options = []): bool
    {
        if ($this->shouldNotCache($task)) {
            return false;
        }

        // Don't cache error responses
        if (isset($response['success']) && !$response['success']) {
            return false;
        }

        // Don't cache responses with validation issues
        if (isset($response['metadata']['was_modified']) && $response['metadata']['was_modified']) {
            Log::debug('Not caching modified response', [
                'task' => $task,
            ]);
            return false;
        }

        $cacheKey = $this->generateCacheKey($task, $context, $options);
        $ttl = $this->getTtl($task);

        $cachedData = array_merge($response, [
            'cached_at' => time(),
            'cache_key' => $cacheKey,
            'cache_ttl' => $ttl,
            'task' => $task,
        ]);

        Cache::put($cacheKey, $cachedData, $ttl);

        Log::debug('AI response cached', [
            'task' => $task,
            'cache_key' => $cacheKey,
            'ttl_seconds' => $ttl,
        ]);

        return true;
    }

    /**
     * Invalidate cache for a specific patient.
     *
     * @param string $patientId The patient identifier
     * @return int Number of cache entries invalidated
     */
    public function invalidatePatient(string $patientId): int
    {
        $pattern = $this->cachePrefix . '*:patient:' . $patientId . '*';
        
        // Use Redis pattern matching if available
        if (Cache::getStore() instanceof \Illuminate\Cache\RedisStore) {
            $invalidated = 0;
            $redis = Cache::getStore()->connection();
            $keys = $redis->keys($pattern);
            
            foreach ($keys as $key) {
                Cache::forget($key);
                $invalidated++;
            }

            Log::info('Patient AI cache invalidated', [
                'patient_id' => $patientId,
                'keys_invalidated' => $invalidated,
            ]);

            return $invalidated;
        }

        // For other cache drivers, we can't pattern match
        // Store a version key that gets included in cache keys
        $versionKey = $this->cachePrefix . 'patient_version:' . $patientId;
        $currentVersion = Cache::get($versionKey, 0);
        Cache::put($versionKey, $currentVersion + 1, 86400 * 30); // 30 days

        Log::info('Patient AI cache version incremented', [
            'patient_id' => $patientId,
        ]);

        return 1;
    }

    /**
     * Invalidate cache for a specific task.
     *
     * @param string $task The task identifier
     * @return int Number of cache entries invalidated
     */
    public function invalidateTask(string $task): int
    {
        $pattern = $this->cachePrefix . $task . ':*';
        
        if (Cache::getStore() instanceof \Illuminate\Cache\RedisStore) {
            $invalidated = 0;
            $redis = Cache::getStore()->connection();
            $keys = $redis->keys($pattern);
            
            foreach ($keys as $key) {
                Cache::forget($key);
                $invalidated++;
            }

            Log::info('Task AI cache invalidated', [
                'task' => $task,
                'keys_invalidated' => $invalidated,
            ]);

            return $invalidated;
        }

        // Increment task version
        $versionKey = $this->cachePrefix . 'task_version:' . $task;
        $currentVersion = Cache::get($versionKey, 0);
        Cache::put($versionKey, $currentVersion + 1, 86400 * 30); // 30 days

        return 1;
    }

    /**
     * Clear all AI response cache.
     *
     * @return bool True if cache was cleared
     */
    public function clearAll(): bool
    {
        if (Cache::getStore() instanceof \Illuminate\Cache\RedisStore) {
            $redis = Cache::getStore()->connection();
            $keys = $redis->keys($this->cachePrefix . '*');
            
            foreach ($keys as $key) {
                Cache::forget($key);
            }

            Log::warning('All AI cache cleared', [
                'keys_cleared' => count($keys),
            ]);

            return true;
        }

        // For other drivers, flush the entire cache (use with caution)
        Cache::flush();

        Log::warning('All cache flushed');

        return true;
    }

    /**
     * Get cache statistics.
     *
     * @return array Cache statistics
     */
    public function getStats(): array
    {
        $stats = [
            'driver' => config('cache.default'),
            'prefix' => $this->cachePrefix,
            'task_ttls' => $this->taskTtls,
            'non_cacheable_tasks' => $this->nonCacheableTasks,
        ];

        if (Cache::getStore() instanceof \Illuminate\Cache\RedisStore) {
            $redis = Cache::getStore()->connection();
            $keys = $redis->keys($this->cachePrefix . '*');
            
            $stats['total_keys'] = count($keys);
            $stats['keys_by_task'] = [];

            foreach ($keys as $key) {
                $task = $this->extractTaskFromKey($key);
                if ($task) {
                    $stats['keys_by_task'][$task] = ($stats['keys_by_task'][$task] ?? 0) + 1;
                }
            }
        }

        return $stats;
    }

    /**
     * Generate a cache key for the given parameters.
     *
     * @param string $task The task identifier
     * @param array $context The context data
     * @param array $options Additional options
     * @return string The cache key
     */
    protected function generateCacheKey(string $task, array $context, array $options): string
    {
        // Include patient version for cache invalidation
        $patientId = $context['patient_id'] ?? $context['patientId'] ?? null;
        $patientVersion = 0;
        
        if ($patientId) {
            $patientVersion = Cache::get($this->cachePrefix . 'patient_version:' . $patientId, 0);
        }

        // Include task version for cache invalidation
        $taskVersion = Cache::get($this->cachePrefix . 'task_version:' . $task, 0);

        // Include prompt version if available
        $promptVersion = $context['prompt_version'] ?? 'default';

        // Include model and temperature in key
        $model = $options['model'] ?? config('ai.providers.ollama.model', 'default');
        $temperature = $options['temperature'] ?? 0.3;

        // Create a hash of the context for uniqueness
        $contextHash = md5(json_encode($this->normalizeContext($context)));

        // Build the cache key
        $keyParts = [
            $this->cachePrefix . $task,
            'v' . $taskVersion,
            'p' . $patientVersion,
            'pv' . $promptVersion,
            'm' . $model,
            't' . $temperature,
            'h' . $contextHash,
        ];

        if ($patientId) {
            $keyParts[] = 'patient:' . $patientId;
        }

        return implode(':', $keyParts);
    }

    /**
     * Normalize context for consistent hashing.
     *
     * @param array $context The context to normalize
     * @return array The normalized context
     */
    protected function normalizeContext(array $context): array
    {
        // Remove volatile fields that shouldn't affect caching
        $volatileFields = [
            'timestamp',
            'request_id',
            'session_id',
            'user_id',
            '_token',
        ];

        $normalized = array_filter(
            $context,
            fn($key) => !in_array($key, $volatileFields),
            ARRAY_FILTER_USE_KEY
        );

        // Sort keys for consistent ordering
        ksort($normalized);

        return $normalized;
    }

    /**
     * Get TTL for a specific task.
     *
     * @param string $task The task identifier
     * @return int TTL in seconds
     */
    protected function getTtl(string $task): int
    {
        return $this->taskTtls[$task] ?? $this->defaultTtl;
    }

    /**
     * Check if a task should not be cached.
     *
     * @param string $task The task identifier
     * @return bool True if task should not be cached
     */
    protected function shouldNotCache(string $task): bool
    {
        return in_array($task, $this->nonCacheableTasks);
    }

    /**
     * Extract task name from cache key.
     *
     * @param string $key The cache key
     * @return string|null The task name or null
     */
    protected function extractTaskFromKey(string $key): ?string
    {
        // Remove prefix
        $withoutPrefix = str_replace($this->cachePrefix, '', $key);
        
        // Get first segment before colon
        $parts = explode(':', $withoutPrefix);
        
        return $parts[0] ?? null;
    }
}
