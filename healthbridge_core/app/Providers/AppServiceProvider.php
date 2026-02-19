<?php

namespace App\Providers;

use App\Models\ClinicalSession;
use App\Observers\ClinicalSessionObserver;
use App\Services\Ai\AiCacheService;
use App\Services\Ai\AiErrorHandler;
use App\Services\Ai\AiMonitor;
use App\Services\Ai\AiRateLimiter;
use App\Services\Ai\ContextBuilder;
use App\Services\Ai\OutputValidator;
use App\Services\Ai\OllamaClient;
use App\Services\Ai\PromptBuilder;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->registerAiServices();
    }

    /**
     * Register AI-related services.
     *
     * This method sets up the service container bindings for the AI integration.
     * Services are registered as singletons to ensure consistent state across
     * the application while maintaining backward compatibility.
     */
    protected function registerAiServices(): void
    {
        // Register OllamaClient as a singleton for backward compatibility
        $this->app->singleton(OllamaClient::class, function ($app) {
            return new OllamaClient();
        });

        // Register PromptBuilder for database-stored prompt templates
        $this->app->singleton(PromptBuilder::class, function ($app) {
            return new PromptBuilder();
        });

        // Register ContextBuilder for clinical data aggregation
        $this->app->singleton(ContextBuilder::class, function ($app) {
            return new ContextBuilder();
        });

        // Register OutputValidator for clinical safety validation
        $this->app->singleton(OutputValidator::class, function ($app) {
            return new OutputValidator();
        });

        // Register Phase 4 services
        // AiCacheService - Intelligent caching for AI responses
        $this->app->singleton(AiCacheService::class, function ($app) {
            return new AiCacheService();
        });

        // AiErrorHandler - Comprehensive error handling with recovery strategies
        $this->app->singleton(AiErrorHandler::class, function ($app) {
            return new AiErrorHandler();
        });

        // AiRateLimiter - Sophisticated rate limiting for AI requests
        $this->app->singleton(AiRateLimiter::class, function ($app) {
            return new AiRateLimiter();
        });

        // AiMonitor - Monitoring, metrics collection, and alerting
        $this->app->singleton(AiMonitor::class, function ($app) {
            return new AiMonitor();
        });

        // Register aliases for easier injection
        $this->app->alias(OllamaClient::class, 'ai.ollama');
        $this->app->alias(PromptBuilder::class, 'ai.prompt-builder');
        $this->app->alias(ContextBuilder::class, 'ai.context-builder');
        $this->app->alias(OutputValidator::class, 'ai.output-validator');
        $this->app->alias(AiCacheService::class, 'ai.cache');
        $this->app->alias(AiErrorHandler::class, 'ai.error-handler');
        $this->app->alias(AiRateLimiter::class, 'ai.rate-limiter');
        $this->app->alias(AiMonitor::class, 'ai.monitor');
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
        $this->configureRateLimiting();
        $this->registerObservers();
    }

    /**
     * Register model observers.
     */
    protected function registerObservers(): void
    {
        ClinicalSession::observe(ClinicalSessionObserver::class);
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null
        );
    }

    /**
     * Configure rate limiting for the application.
     */
    protected function configureRateLimiting(): void
    {
        // API rate limiter (for CouchDB proxy and general API)
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(60)
                ->by($request->user()?->id ?: $request->ip())
                ->response(function () {
                    return response()->json([
                        'success' => false,
                        'error' => 'Rate limit exceeded',
                        'message' => 'Too many requests. Please wait before trying again.',
                    ], 429);
                });
        });

        // AI Gateway rate limiter
        RateLimiter::for('ai', function (Request $request) {
            $limit = config('ai_policy.rate_limit', 30);
            
            return Limit::perMinute($limit)
                ->by($request->user()?->id ?: $request->ip())
                ->response(function () {
                    return response()->json([
                        'success' => false,
                        'error' => 'Rate limit exceeded',
                        'message' => 'Too many AI requests. Please wait before trying again.',
                    ], 429);
                });
        });
    }
}
