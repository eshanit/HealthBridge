<?php

namespace App\Providers;

use App\Models\ClinicalSession;
use App\Observers\ClinicalSessionObserver;
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
        //
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
