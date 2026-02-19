<?php

namespace App\Services\Ai;

use App\Models\AiRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

/**
 * AI Monitoring Service
 *
 * Provides comprehensive monitoring, metrics collection, and alerting
 * for AI operations with clinical safety considerations.
 *
 * @package App\Services\Ai
 */
class AiMonitor
{
    /**
     * Metrics cache key prefix.
     */
    protected string $metricsPrefix = 'ai_metrics:';

    /**
     * Alert thresholds.
     */
    protected array $alertThresholds = [
        'latency_ms' => [
            'warning' => 5000,
            'critical' => 10000,
        ],
        'error_rate' => [
            'warning' => 0.05,    // 5%
            'critical' => 0.15,   // 15%
        ],
        'validation_failure_rate' => [
            'warning' => 0.02,    // 2%
            'critical' => 0.05,   // 5%
        ],
        'daily_requests' => [
            'warning' => 1000,
            'critical' => 2000,
        ],
    ];

    /**
     * Record a request metric.
     *
     * @param array $data Request data
     */
    public function recordRequest(array $data): void
    {
        $timestamp = now();
        $minute = $timestamp->format('Y-m-d H:i');
        $hour = $timestamp->format('Y-m-d H:00');
        $day = $timestamp->format('Y-m-d');

        // Increment request counters
        $this->incrementMetric("requests:total:{$minute}", 120);
        $this->incrementMetric("requests:total:{$hour}", 3600);
        $this->incrementMetric("requests:total:{$day}", 86400);

        // Record by task
        $task = $data['task'] ?? 'unknown';
        $this->incrementMetric("requests:task:{$task}:{$minute}", 120);

        // Record latency
        $latencyMs = $data['latency_ms'] ?? 0;
        $this->recordLatency($latencyMs, $task, $minute);

        // Record success/failure
        if ($data['success'] ?? true) {
            $this->incrementMetric("requests:success:{$minute}", 120);
        } else {
            $this->incrementMetric("requests:failure:{$minute}", 120);
            $this->incrementMetric("failures:task:{$task}:{$minute}", 120);
        }

        // Record validation issues
        if ($data['was_overridden'] ?? false) {
            $this->incrementMetric("validation:overridden:{$minute}", 120);
        }

        // Check for alerts
        $this->checkAlerts($data);
    }

    /**
     * Record latency metric.
     *
     * @param int $latencyMs Latency in milliseconds
     * @param string $task Task identifier
     * @param string $minute Current minute key
     */
    protected function recordLatency(int $latencyMs, string $task, string $minute): void
    {
        // Store latency samples for percentile calculation
        $key = $this->metricsPrefix . "latency:{$task}:{$minute}";
        $samples = Cache::get($key, []);
        $samples[] = $latencyMs;
        
        // Keep only last 100 samples
        if (count($samples) > 100) {
            $samples = array_slice($samples, -100);
        }
        
        Cache::put($key, $samples, 120);

        // Update min/max/avg
        $statsKey = $this->metricsPrefix . "latency_stats:{$task}:{$minute}";
        $stats = Cache::get($statsKey, [
            'min' => PHP_INT_MAX,
            'max' => 0,
            'sum' => 0,
            'count' => 0,
        ]);

        $stats['min'] = min($stats['min'], $latencyMs);
        $stats['max'] = max($stats['max'], $latencyMs);
        $stats['sum'] += $latencyMs;
        $stats['count']++;

        Cache::put($statsKey, $stats, 120);
    }

    /**
     * Get current metrics.
     *
     * @param string $period Period (minute, hour, day)
     * @return array Metrics data
     */
    public function getMetrics(string $period = 'hour'): array
    {
        $timestamp = now();
        
        $key = match ($period) {
            'minute' => $timestamp->format('Y-m-d H:i'),
            'hour' => $timestamp->format('Y-m-d H:00'),
            'day' => $timestamp->format('Y-m-d'),
            default => $timestamp->format('Y-m-d H:00'),
        };

        $totalRequests = Cache::get($this->metricsPrefix . "requests:total:{$key}", 0);
        $successRequests = Cache::get($this->metricsPrefix . "requests:success:{$key}", 0);
        $failureRequests = Cache::get($this->metricsPrefix . "requests:failure:{$key}", 0);
        $validationOverridden = Cache::get($this->metricsPrefix . "validation:overridden:{$key}", 0);

        $errorRate = $totalRequests > 0 ? $failureRequests / $totalRequests : 0;
        $validationFailureRate = $totalRequests > 0 ? $validationOverridden / $totalRequests : 0;

        return [
            'period' => $period,
            'key' => $key,
            'requests' => [
                'total' => $totalRequests,
                'success' => $successRequests,
                'failure' => $failureRequests,
                'error_rate' => round($errorRate, 4),
            ],
            'validation' => [
                'overridden' => $validationOverridden,
                'failure_rate' => round($validationFailureRate, 4),
            ],
            'latency' => $this->getLatencyStats($key),
            'by_task' => $this->getTaskMetrics($key),
            'health' => $this->calculateHealth($errorRate, $validationFailureRate),
        ];
    }

    /**
     * Get latency statistics.
     *
     * @param string $key Time key
     * @return array Latency statistics
     */
    protected function getLatencyStats(string $key): array
    {
        $tasks = ['explain_triage', 'review_treatment', 'imci_classification', 'clinical_assistance'];
        $stats = [];

        foreach ($tasks as $task) {
            $taskStats = Cache::get($this->metricsPrefix . "latency_stats:{$task}:{$key}");
            
            if ($taskStats && $taskStats['count'] > 0) {
                $stats[$task] = [
                    'min' => $taskStats['min'],
                    'max' => $taskStats['max'],
                    'avg' => round($taskStats['sum'] / $taskStats['count'], 2),
                    'samples' => $taskStats['count'],
                ];
            }
        }

        return $stats;
    }

    /**
     * Get metrics by task.
     *
     * @param string $key Time key
     * @return array Task metrics
     */
    protected function getTaskMetrics(string $key): array
    {
        $tasks = ['explain_triage', 'review_treatment', 'imci_classification', 'clinical_assistance'];
        $metrics = [];

        foreach ($tasks as $task) {
            $requests = Cache::get($this->metricsPrefix . "requests:task:{$task}:{$key}", 0);
            $failures = Cache::get($this->metricsPrefix . "failures:task:{$task}:{$key}", 0);

            if ($requests > 0) {
                $metrics[$task] = [
                    'requests' => $requests,
                    'failures' => $failures,
                    'error_rate' => round($failures / $requests, 4),
                ];
            }
        }

        return $metrics;
    }

    /**
     * Calculate health score.
     *
     * @param float $errorRate Error rate
     * @param float $validationFailureRate Validation failure rate
     * @return array Health information
     */
    protected function calculateHealth(float $errorRate, float $validationFailureRate): array
    {
        $score = 100;
        $issues = [];

        // Deduct for error rate
        if ($errorRate > $this->alertThresholds['error_rate']['critical']) {
            $score -= 40;
            $issues[] = 'Critical error rate exceeded';
        } elseif ($errorRate > $this->alertThresholds['error_rate']['warning']) {
            $score -= 20;
            $issues[] = 'Warning error rate exceeded';
        }

        // Deduct for validation failures
        if ($validationFailureRate > $this->alertThresholds['validation_failure_rate']['critical']) {
            $score -= 30;
            $issues[] = 'Critical validation failure rate';
        } elseif ($validationFailureRate > $this->alertThresholds['validation_failure_rate']['warning']) {
            $score -= 15;
            $issues[] = 'Warning validation failure rate';
        }

        $status = match (true) {
            $score >= 80 => 'healthy',
            $score >= 60 => 'degraded',
            $score >= 40 => 'unhealthy',
            default => 'critical',
        };

        return [
            'score' => max(0, $score),
            'status' => $status,
            'issues' => $issues,
        ];
    }

    /**
     * Check for alert conditions.
     *
     * @param array $data Request data
     */
    protected function checkAlerts(array $data): void
    {
        // Check latency
        $latencyMs = $data['latency_ms'] ?? 0;
        if ($latencyMs > $this->alertThresholds['latency_ms']['critical']) {
            $this->triggerAlert('critical', 'high_latency', [
                'latency_ms' => $latencyMs,
                'task' => $data['task'] ?? 'unknown',
                'threshold' => $this->alertThresholds['latency_ms']['critical'],
            ]);
        } elseif ($latencyMs > $this->alertThresholds['latency_ms']['warning']) {
            $this->triggerAlert('warning', 'high_latency', [
                'latency_ms' => $latencyMs,
                'task' => $data['task'] ?? 'unknown',
                'threshold' => $this->alertThresholds['latency_ms']['warning'],
            ]);
        }

        // Check for validation override
        if ($data['was_overridden'] ?? false) {
            $riskFlags = $data['risk_flags'] ?? [];
            if (!empty($riskFlags)) {
                $this->triggerAlert('warning', 'validation_override', [
                    'task' => $data['task'] ?? 'unknown',
                    'risk_flags' => $riskFlags,
                ]);
            }
        }
    }

    /**
     * Trigger an alert.
     *
     * @param string $severity Alert severity
     * @param string $type Alert type
     * @param array $context Alert context
     */
    protected function triggerAlert(string $severity, string $type, array $context): void
    {
        $alertKey = $this->metricsPrefix . "alert:{$type}:" . now()->format('Y-m-d H:i');
        
        // Debounce alerts (only one per type per minute)
        if (Cache::has($alertKey)) {
            return;
        }

        Cache::put($alertKey, true, 60);

        Log::channel('ai-alerts')->{$severity === 'critical' ? 'critical' : 'warning'}(
            "AI Alert: {$type}",
            array_merge([
                'severity' => $severity,
                'type' => $type,
                'timestamp' => now()->toIso8601String(),
            ], $context)
        );

        // Store alert for dashboard
        $alertsKey = $this->metricsPrefix . 'alerts:recent';
        $alerts = Cache::get($alertsKey, []);
        
        $alerts[] = [
            'severity' => $severity,
            'type' => $type,
            'context' => $context,
            'timestamp' => now()->toIso8601String(),
        ];

        // Keep last 100 alerts
        if (count($alerts) > 100) {
            $alerts = array_slice($alerts, -100);
        }

        Cache::put($alertsKey, $alerts, 3600);
    }

    /**
     * Get recent alerts.
     *
     * @param int $limit Maximum number of alerts to return
     * @return array Recent alerts
     */
    public function getRecentAlerts(int $limit = 20): array
    {
        $alerts = Cache::get($this->metricsPrefix . 'alerts:recent', []);
        
        return array_slice(array_reverse($alerts), 0, $limit);
    }

    /**
     * Get dashboard data.
     *
     * @return array Dashboard data
     */
    public function getDashboard(): array
    {
        return [
            'current_hour' => $this->getMetrics('hour'),
            'current_day' => $this->getMetrics('day'),
            'recent_alerts' => $this->getRecentAlerts(10),
            'thresholds' => $this->alertThresholds,
            'timestamp' => now()->toIso8601String(),
        ];
    }

    /**
     * Get database statistics.
     *
     * @param int $hours Number of hours to analyze
     * @return array Database statistics
     */
    public function getDatabaseStats(int $hours = 24): array
    {
        $since = now()->subHours($hours);

        $stats = AiRequest::where('requested_at', '>=', $since)
            ->select([
                DB::raw('COUNT(*) as total_requests'),
                DB::raw('AVG(latency_ms) as avg_latency'),
                DB::raw('MAX(latency_ms) as max_latency'),
                DB::raw('SUM(CASE WHEN was_overridden = 1 THEN 1 ELSE 0 END) as overridden_count'),
                DB::raw('task'),
            ])
            ->groupBy('task')
            ->get()
            ->keyBy('task')
            ->toArray();

        return [
            'period_hours' => $hours,
            'since' => $since->toIso8601String(),
            'by_task' => $stats,
        ];
    }

    /**
     * Increment a metric counter.
     *
     * @param string $key Metric key
     * @param int $ttl TTL in seconds
     */
    protected function incrementMetric(string $key, int $ttl): void
    {
        $fullKey = $this->metricsPrefix . $key;
        
        if (Cache::has($fullKey)) {
            Cache::increment($fullKey);
        } else {
            Cache::put($fullKey, 1, $ttl);
        }
    }

    /**
     * Configure alert thresholds.
     *
     * @param array $thresholds New thresholds
     */
    public function configureThresholds(array $thresholds): void
    {
        $this->alertThresholds = array_merge($this->alertThresholds, $thresholds);

        Log::info('AI monitoring thresholds updated', [
            'thresholds' => $this->alertThresholds,
        ]);
    }
}
