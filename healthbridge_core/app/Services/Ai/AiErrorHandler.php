<?php

namespace App\Services\Ai;

use Exception;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * AI Error Handler Service
 *
 * Provides comprehensive error handling for AI operations with proper
 * categorization, recovery strategies, and clinical safety considerations.
 *
 * @package App\Services\Ai
 */
class AiErrorHandler
{
    /**
     * Error categories for classification.
     */
    const CATEGORY_PROVIDER = 'provider';
    const CATEGORY_VALIDATION = 'validation';
    const CATEGORY_SAFETY = 'safety';
    const CATEGORY_TIMEOUT = 'timeout';
    const CATEGORY_RATE_LIMIT = 'rate_limit';
    const CATEGORY_CONFIGURATION = 'configuration';
    const CATEGORY_UNKNOWN = 'unknown';

    /**
     * Error severity levels.
     */
    const SEVERITY_LOW = 'low';
    const SEVERITY_MEDIUM = 'medium';
    const SEVERITY_HIGH = 'high';
    const SEVERITY_CRITICAL = 'critical';

    /**
     * Recovery strategies.
     */
    const RECOVERY_RETRY = 'retry';
    const RECOVERY_FALLBACK = 'fallback';
    const RECOVERY_CACHE = 'cache';
    const RECOVERY_ABORT = 'abort';
    const RECOVERY_DEGRADE = 'degrade';

    /**
     * Map of exception types to error categories.
     */
    protected array $exceptionMap = [
        \GuzzleHttp\Exception\ConnectException::class => self::CATEGORY_PROVIDER,
        \GuzzleHttp\Exception\TimeoutException::class => self::CATEGORY_TIMEOUT,
        \GuzzleHttp\Exception\RequestException::class => self::CATEGORY_PROVIDER,
        \Illuminate\Http\Client\ConnectionException::class => self::CATEGORY_PROVIDER,
        \Illuminate\Http\Client\TimeoutException::class => self::CATEGORY_TIMEOUT,
        \JsonException::class => self::CATEGORY_VALIDATION,
    ];

    /**
     * Handle an AI-related exception.
     *
     * @param Throwable $exception The exception that occurred
     * @param array $context Additional context about the request
     * @return array Error response with recovery suggestions
     */
    public function handle(Throwable $exception, array $context = []): array
    {
        $errorInfo = $this->classifyError($exception, $context);

        // Log the error with appropriate severity
        $this->logError($exception, $errorInfo, $context);

        // Determine recovery strategy
        $recovery = $this->determineRecovery($errorInfo, $context);

        // Build error response
        return [
            'success' => false,
            'error' => [
                'code' => $errorInfo['code'],
                'category' => $errorInfo['category'],
                'severity' => $errorInfo['severity'],
                'message' => $errorInfo['message'],
                'user_message' => $errorInfo['user_message'],
                'recovery' => $recovery,
                'timestamp' => now()->toIso8601String(),
                'request_id' => $context['request_id'] ?? null,
            ],
            'metadata' => [
                'exception_class' => get_class($exception),
                'file' => $exception->getFile(),
                'line' => $exception->getLine(),
            ],
        ];
    }

    /**
     * Classify an error based on the exception.
     *
     * @param Throwable $exception The exception
     * @param array $context Additional context
     * @return array Error classification
     */
    protected function classifyError(Throwable $exception, array $context): array
    {
        $category = $this->categorizeException($exception);
        $severity = $this->determineSeverity($exception, $category, $context);
        $code = $this->generateErrorCode($category, $exception);

        return [
            'code' => $code,
            'category' => $category,
            'severity' => $severity,
            'message' => $exception->getMessage(),
            'user_message' => $this->getUserMessage($category, $severity),
            'is_retryable' => $this->isRetryable($category),
            'requires_fallback' => $this->requiresFallback($category),
        ];
    }

    /**
     * Categorize an exception.
     *
     * @param Throwable $exception The exception
     * @return string The error category
     */
    protected function categorizeException(Throwable $exception): string
    {
        // Check for specific error patterns in message
        $message = strtolower($exception->getMessage());

        if (str_contains($message, 'timeout') || str_contains($message, 'timed out')) {
            return self::CATEGORY_TIMEOUT;
        }

        if (str_contains($message, 'rate limit') || str_contains($message, 'too many requests')) {
            return self::CATEGORY_RATE_LIMIT;
        }

        if (str_contains($message, 'safety') || str_contains($message, 'validation failed')) {
            return self::CATEGORY_SAFETY;
        }

        if (str_contains($message, 'config') || str_contains($message, 'not configured')) {
            return self::CATEGORY_CONFIGURATION;
        }

        // Check exception class hierarchy
        foreach ($this->exceptionMap as $exceptionClass => $category) {
            if ($exception instanceof $exceptionClass) {
                return $category;
            }
        }

        return self::CATEGORY_UNKNOWN;
    }

    /**
     * Determine error severity.
     *
     * @param Throwable $exception The exception
     * @param string $category The error category
     * @param array $context Additional context
     * @return string The severity level
     */
    protected function determineSeverity(Throwable $exception, string $category, array $context): string
    {
        // Safety errors are always critical
        if ($category === self::CATEGORY_SAFETY) {
            return self::SEVERITY_CRITICAL;
        }

        // Check if this is a clinical context
        $isClinical = isset($context['task']) && 
            in_array($context['task'], ['explain_triage', 'review_treatment', 'emergency_assessment']);

        if ($isClinical) {
            // Clinical context errors are higher severity
            return match ($category) {
                self::CATEGORY_TIMEOUT => self::SEVERITY_HIGH,
                self::CATEGORY_PROVIDER => self::SEVERITY_HIGH,
                self::CATEGORY_RATE_LIMIT => self::SEVERITY_MEDIUM,
                default => self::SEVERITY_MEDIUM,
            };
        }

        return match ($category) {
            self::CATEGORY_TIMEOUT => self::SEVERITY_MEDIUM,
            self::CATEGORY_PROVIDER => self::SEVERITY_MEDIUM,
            self::CATEGORY_RATE_LIMIT => self::SEVERITY_LOW,
            self::CATEGORY_CONFIGURATION => self::SEVERITY_HIGH,
            default => self::SEVERITY_LOW,
        };
    }

    /**
     * Generate a unique error code.
     *
     * @param string $category The error category
     * @param Throwable $exception The exception
     * @return string The error code
     */
    protected function generateErrorCode(string $category, Throwable $exception): string
    {
        $prefix = strtoupper(substr($category, 0, 3));
        $hash = strtoupper(substr(md5(get_class($exception) . $exception->getMessage()), 0, 6));
        
        return "AI_{$prefix}_{$hash}";
    }

    /**
     * Get a user-friendly error message.
     *
     * @param string $category The error category
     * @param string $severity The severity level
     * @return string The user message
     */
    protected function getUserMessage(string $category, string $severity): string
    {
        return match ($category) {
            self::CATEGORY_PROVIDER => 'The AI service is temporarily unavailable. Please try again.',
            self::CATEGORY_TIMEOUT => 'The AI request took too long to process. Please try again.',
            self::CATEGORY_RATE_LIMIT => 'Too many AI requests. Please wait a moment and try again.',
            self::CATEGORY_VALIDATION => 'The AI response could not be processed. Please try again.',
            self::CATEGORY_SAFETY => 'The AI response was blocked for safety reasons. Please review your input.',
            self::CATEGORY_CONFIGURATION => 'The AI service is not properly configured. Please contact support.',
            default => 'An unexpected error occurred. Please try again.',
        };
    }

    /**
     * Determine if the error is retryable.
     *
     * @param string $category The error category
     * @return bool True if retryable
     */
    protected function isRetryable(string $category): bool
    {
        return in_array($category, [
            self::CATEGORY_TIMEOUT,
            self::CATEGORY_PROVIDER,
            self::CATEGORY_RATE_LIMIT,
        ]);
    }

    /**
     * Determine if fallback should be used.
     *
     * @param string $category The error category
     * @return bool True if fallback should be used
     */
    protected function requiresFallback(string $category): bool
    {
        return in_array($category, [
            self::CATEGORY_PROVIDER,
            self::CATEGORY_TIMEOUT,
            self::CATEGORY_CONFIGURATION,
        ]);
    }

    /**
     * Determine recovery strategy.
     *
     * @param array $errorInfo The error classification
     * @param array $context Additional context
     * @return array Recovery strategy information
     */
    protected function determineRecovery(array $errorInfo, array $context): array
    {
        $strategy = self::RECOVERY_ABORT;
        $suggestions = [];

        if ($errorInfo['is_retryable']) {
            $strategy = self::RECOVERY_RETRY;
            $suggestions[] = 'Wait a few seconds and retry the request';
            $suggestions[] = 'Consider using exponential backoff for retries';
        }

        if ($errorInfo['requires_fallback']) {
            $strategy = self::RECOVERY_FALLBACK;
            $suggestions[] = 'Use fallback provider (OpenAI) if available';
            $suggestions[] = 'Return cached response if available';
        }

        if ($errorInfo['category'] === self::CATEGORY_RATE_LIMIT) {
            $strategy = self::RECOVERY_DEGRADE;
            $suggestions[] = 'Reduce request frequency';
            $suggestions[] = 'Implement request queuing';
        }

        // For clinical contexts, always suggest fallback
        if (isset($context['task']) && in_array($context['task'], ['explain_triage', 'review_treatment'])) {
            $suggestions[] = 'Clinical context: Consider manual review if AI is unavailable';
        }

        return [
            'strategy' => $strategy,
            'suggestions' => $suggestions,
            'max_retries' => $errorInfo['is_retryable'] ? 3 : 0,
            'retry_after_seconds' => $this->getRetryAfter($errorInfo['category']),
        ];
    }

    /**
     * Get recommended retry delay in seconds.
     *
     * @param string $category The error category
     * @return int Seconds to wait before retry
     */
    protected function getRetryAfter(string $category): int
    {
        return match ($category) {
            self::CATEGORY_RATE_LIMIT => 60,
            self::CATEGORY_TIMEOUT => 5,
            self::CATEGORY_PROVIDER => 10,
            default => 1,
        };
    }

    /**
     * Log the error with appropriate severity.
     *
     * @param Throwable $exception The exception
     * @param array $errorInfo The error classification
     * @param array $context Additional context
     */
    protected function logError(Throwable $exception, array $errorInfo, array $context): void
    {
        $logContext = [
            'error_code' => $errorInfo['code'],
            'category' => $errorInfo['category'],
            'severity' => $errorInfo['severity'],
            'task' => $context['task'] ?? null,
            'user_id' => $context['user_id'] ?? null,
            'patient_id' => $context['patient_id'] ?? null,
            'exception' => get_class($exception),
            'message' => $exception->getMessage(),
            'file' => $exception->getFile(),
            'line' => $exception->getLine(),
        ];

        $message = "AI Error [{$errorInfo['code']}]: {$errorInfo['message']}";

        match ($errorInfo['severity']) {
            self::SEVERITY_CRITICAL => Log::critical($message, $logContext),
            self::SEVERITY_HIGH => Log::error($message, $logContext),
            self::SEVERITY_MEDIUM => Log::warning($message, $logContext),
            default => Log::info($message, $logContext),
        };
    }

    /**
     * Create a custom AI exception.
     *
     * @param string $message The error message
     * @param string $category The error category
     * @param array $context Additional context
     * @return Exception
     */
    public function createException(string $message, string $category, array $context = []): Exception
    {
        $exceptionClass = match ($category) {
            self::CATEGORY_SAFETY => AiSafetyException::class,
            self::CATEGORY_VALIDATION => AiValidationException::class,
            self::CATEGORY_TIMEOUT => AiTimeoutException::class,
            self::CATEGORY_RATE_LIMIT => AiRateLimitException::class,
            default => AiException::class,
        };

        return new $exceptionClass($message, 0, null, $context);
    }

    /**
     * Check if an exception is an AI-related exception.
     *
     * @param Throwable $exception The exception to check
     * @return bool True if AI-related
     */
    public function isAiException(Throwable $exception): bool
    {
        return $exception instanceof AiException ||
            $exception instanceof \GuzzleHttp\Exception\TransferException ||
            $exception instanceof \Illuminate\Http\Client\HttpClientException;
    }
}

/**
 * Base AI Exception
 */
class AiException extends Exception
{
    protected array $context = [];

    public function __construct(string $message = '', int $code = 0, ?Throwable $previous = null, array $context = [])
    {
        parent::__construct($message, $code, $previous);
        $this->context = $context;
    }

    public function getContext(): array
    {
        return $this->context;
    }
}

/**
 * AI Safety Exception
 */
class AiSafetyException extends AiException
{
    protected string $category = AiErrorHandler::CATEGORY_SAFETY;
}

/**
 * AI Validation Exception
 */
class AiValidationException extends AiException
{
    protected string $category = AiErrorHandler::CATEGORY_VALIDATION;
}

/**
 * AI Timeout Exception
 */
class AiTimeoutException extends AiException
{
    protected string $category = AiErrorHandler::CATEGORY_TIMEOUT;
}

/**
 * AI Rate Limit Exception
 */
class AiRateLimitException extends AiException
{
    protected string $category = AiErrorHandler::CATEGORY_RATE_LIMIT;
}
