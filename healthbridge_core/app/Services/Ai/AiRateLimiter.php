<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter as LaravelRateLimiter;

/**
 * AI Rate Limiter Service
 *
 * Provides sophisticated rate limiting for AI requests with task-based
 * limits, user quotas, and graceful degradation.
 *
 * @package App\Services\Ai
 */
class AiRateLimiter
{
    /**
     * Rate limit key prefix.
     */
    protected string $keyPrefix = 'ai_rate:';

    /**
     * Default rate limits per task (requests per minute).
     */
    protected array $taskLimits = [
        'explain_triage' => 30,
        'review_treatment' => 20,
        'imci_classification' => 40,
        'clinical_assistance' => 30,
        'default' => 20,
    ];

    /**
     * User-based daily quotas.
     */
    protected array $userDailyQuotas = [
        'doctor' => 500,
        'nurse' => 300,
        'clinician' => 400,
        'admin' => 100,
        'default' => 100,
    ];

    /**
     * Global rate limit (requests per minute across all users).
     */
    protected int $globalLimit = 200;

    /**
     * Attempt a request under rate limits.
     *
     * This method checks rate limits and automatically records the request
     * if allowed. Use this for convenience instead of check() + record().
     *
     * @param string $task The task identifier
     * @param int $userId The user ID
     * @param string $userRole The user's role
     * @return array Rate limit status with retry_after and headers if limited
     */
    public function attempt(string $task, int $userId, string $userRole): array
    {
        $result = $this->check($task, $userId, $userRole);

        if ($result['allowed']) {
            $this->record($task, $userId, true);
        }

        // Add convenience fields for HTTP responses
        if (!$result['allowed']) {
            $remaining = $this->getRemaining($task, $userId, $userRole);
            $result['retry_after'] = $this->calculateRetryAfter($result);
            $result['headers'] = $this->getHeaders($remaining);
        }

        return $result;
    }

    /**
     * Check if a request is allowed under rate limits.
     *
     * @param string $task The task identifier
     * @param int $userId The user ID
     * @param string $userRole The user's role
     * @return array Rate limit status
     */
    public function check(string $task, int $userId, string $userRole): array
    {
        $results = [
            'allowed' => true,
            'limits' => [],
        ];

        // Check global limit
        $globalCheck = $this->checkGlobalLimit();
        $results['limits']['global'] = $globalCheck;
        
        if (!$globalCheck['allowed']) {
            $results['allowed'] = false;
            $results['reason'] = 'global_limit_exceeded';
            return $results;
        }

        // Check task-specific limit
        $taskCheck = $this->checkTaskLimit($task, $userId);
        $results['limits']['task'] = $taskCheck;
        
        if (!$taskCheck['allowed']) {
            $results['allowed'] = false;
            $results['reason'] = 'task_limit_exceeded';
            return $results;
        }

        // Check user daily quota
        $quotaCheck = $this->checkUserQuota($userId, $userRole);
        $results['limits']['quota'] = $quotaCheck;
        
        if (!$quotaCheck['allowed']) {
            $results['allowed'] = false;
            $results['reason'] = 'quota_exceeded';
            return $results;
        }

        return $results;
    }

    /**
     * Calculate retry-after time in seconds.
     *
     * @param array $result The rate limit check result
     * @return int Seconds until retry is allowed
     */
    protected function calculateRetryAfter(array $result): int
    {
        $reason = $result['reason'] ?? '';

        return match ($reason) {
            'global_limit_exceeded', 'task_limit_exceeded' => 60, // 1 minute
            'quota_exceeded' => 86400, // 1 day
            default => 60,
        };
    }

    /**
     * Record a request for rate limiting.
     *
     * @param string $task The task identifier
     * @param int $userId The user ID
     * @param bool $success Whether the request was successful
     */
    public function record(string $task, int $userId, bool $success = true): void
    {
        $minute = now()->format('Y-m-d H:i');
        $day = now()->format('Y-m-d');

        // Record global request
        $globalKey = $this->keyPrefix . "global:{$minute}";
        $this->incrementWithTtl($globalKey, 120);

        // Record task request
        $taskKey = $this->keyPrefix . "task:{$task}:{$userId}:{$minute}";
        $this->incrementWithTtl($taskKey, 120);

        // Record user daily quota
        $quotaKey = $this->keyPrefix . "quota:{$userId}:{$day}";
        $this->incrementWithTtl($quotaKey, 86400);

        // Record success/failure
        if ($success) {
            $successKey = $this->keyPrefix . "success:{$task}:{$day}";
            $this->incrementWithTtl($successKey, 86400);
        } else {
            $failureKey = $this->keyPrefix . "failure:{$task}:{$day}";
            $this->incrementWithTtl($failureKey, 86400);
        }
    }

    /**
     * Increment a cache key with TTL (compatible with all cache drivers).
     *
     * @param string $key The cache key
     * @param int $ttl Time to live in seconds
     * @return int The new value
     */
    protected function incrementWithTtl(string $key, int $ttl): int
    {
        $value = Cache::get($key, 0);
        $value++;
        Cache::put($key, $value, $ttl);
        return $value;
    }

    /**
     * Get remaining requests for a user.
     *
     * @param string $task The task identifier
     * @param int $userId The user ID
     * @param string $userRole The user's role
     * @return array Remaining request counts
     */
    public function getRemaining(string $task, int $userId, string $userRole): array
    {
        $minute = now()->format('Y-m-d H:i');
        $day = now()->format('Y-m-d');

        // Get current usage
        $globalUsed = Cache::get($this->keyPrefix . "global:{$minute}", 0);
        $taskUsed = Cache::get($this->keyPrefix . "task:{$task}:{$userId}:{$minute}", 0);
        $quotaUsed = Cache::get($this->keyPrefix . "quota:{$userId}:{$day}", 0);

        // Get limits
        $taskLimit = $this->taskLimits[$task] ?? $this->taskLimits['default'];
        $quotaLimit = $this->userDailyQuotas[$userRole] ?? $this->userDailyQuotas['default'];

        return [
            'global' => [
                'limit' => $this->globalLimit,
                'used' => $globalUsed,
                'remaining' => max(0, $this->globalLimit - $globalUsed),
                'reset_at' => now()->addMinute()->startOfMinute(),
            ],
            'task' => [
                'limit' => $taskLimit,
                'used' => $taskUsed,
                'remaining' => max(0, $taskLimit - $taskUsed),
                'reset_at' => now()->addMinute()->startOfMinute(),
            ],
            'quota' => [
                'limit' => $quotaLimit,
                'used' => $quotaUsed,
                'remaining' => max(0, $quotaLimit - $quotaUsed),
                'reset_at' => now()->addDay()->startOfDay(),
            ],
        ];
    }

    /**
     * Get rate limit statistics.
     *
     * @return array Rate limit statistics
     */
    public function getStats(): array
    {
        $day = now()->format('Y-m-d');
        $stats = [
            'limits' => [
                'task_limits' => $this->taskLimits,
                'user_quotas' => $this->userDailyQuotas,
                'global_limit' => $this->globalLimit,
            ],
            'usage' => [],
        ];

        // Get usage by task
        foreach (array_keys($this->taskLimits) as $task) {
            if ($task === 'default') continue;

            $successKey = $this->keyPrefix . "success:{$task}:{$day}";
            $failureKey = $this->keyPrefix . "failure:{$task}:{$day}";

            $stats['usage'][$task] = [
                'success' => Cache::get($successKey, 0),
                'failure' => Cache::get($failureKey, 0),
            ];
        }

        return $stats;
    }

    /**
     * Reset rate limits for a user.
     *
     * @param int $userId The user ID
     */
    public function resetForUser(int $userId): void
    {
        $day = now()->format('Y-m-d');
        $minute = now()->format('Y-m-d H:i');

        // Reset quota
        Cache::forget($this->keyPrefix . "quota:{$userId}:{$day}");

        // Reset task limits for current minute
        foreach (array_keys($this->taskLimits) as $task) {
            Cache::forget($this->keyPrefix . "task:{$task}:{$userId}:{$minute}");
        }

        Log::info('AI rate limits reset for user', [
            'user_id' => $userId,
        ]);
    }

    /**
     * Update rate limits dynamically.
     *
     * @param array $taskLimits New task limits
     * @param array $userQuotas New user quotas
     * @param int|null $globalLimit New global limit
     */
    public function updateLimits(array $taskLimits = [], array $userQuotas = [], ?int $globalLimit = null): void
    {
        if (!empty($taskLimits)) {
            $this->taskLimits = array_merge($this->taskLimits, $taskLimits);
        }

        if (!empty($userQuotas)) {
            $this->userDailyQuotas = array_merge($this->userDailyQuotas, $userQuotas);
        }

        if ($globalLimit !== null) {
            $this->globalLimit = $globalLimit;
        }

        Log::info('AI rate limits updated', [
            'task_limits' => $this->taskLimits,
            'user_quotas' => $this->userDailyQuotas,
            'global_limit' => $this->globalLimit,
        ]);
    }

    /**
     * Check global rate limit.
     *
     * @return array Check result
     */
    protected function checkGlobalLimit(): array
    {
        $minute = now()->format('Y-m-d H:i');
        $key = $this->keyPrefix . "global:{$minute}";
        $used = Cache::get($key, 0);

        return [
            'allowed' => $used < $this->globalLimit,
            'limit' => $this->globalLimit,
            'used' => $used,
            'remaining' => max(0, $this->globalLimit - $used),
            'reset_at' => now()->addMinute()->startOfMinute(),
        ];
    }

    /**
     * Check task-specific rate limit.
     *
     * @param string $task The task identifier
     * @param int $userId The user ID
     * @return array Check result
     */
    protected function checkTaskLimit(string $task, int $userId): array
    {
        $minute = now()->format('Y-m-d H:i');
        $key = $this->keyPrefix . "task:{$task}:{$userId}:{$minute}";
        $used = Cache::get($key, 0);
        $limit = $this->taskLimits[$task] ?? $this->taskLimits['default'];

        return [
            'allowed' => $used < $limit,
            'limit' => $limit,
            'used' => $used,
            'remaining' => max(0, $limit - $used),
            'reset_at' => now()->addMinute()->startOfMinute(),
        ];
    }

    /**
     * Check user daily quota.
     *
     * @param int $userId The user ID
     * @param string $userRole The user's role
     * @return array Check result
     */
    protected function checkUserQuota(int $userId, string $userRole): array
    {
        $day = now()->format('Y-m-d');
        $key = $this->keyPrefix . "quota:{$userId}:{$day}";
        $used = Cache::get($key, 0);
        $limit = $this->userDailyQuotas[$userRole] ?? $this->userDailyQuotas['default'];

        return [
            'allowed' => $used < $limit,
            'limit' => $limit,
            'used' => $used,
            'remaining' => max(0, $limit - $used),
            'reset_at' => now()->addDay()->startOfDay(),
        ];
    }

    /**
     * Get rate limit headers for HTTP response.
     *
     * @param array $remaining Remaining request counts
     * @return array HTTP headers
     */
    public function getHeaders(array $remaining): array
    {
        return [
            'X-RateLimit-Limit' => $remaining['task']['limit'],
            'X-RateLimit-Remaining' => $remaining['task']['remaining'],
            'X-RateLimit-Reset' => $remaining['task']['reset_at']->timestamp,
            'X-DailyQuota-Limit' => $remaining['quota']['limit'],
            'X-DailyQuota-Remaining' => $remaining['quota']['remaining'],
            'X-DailyQuota-Reset' => $remaining['quota']['reset_at']->timestamp,
        ];
    }
}
