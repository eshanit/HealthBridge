<?php

use App\Http\Controllers\Api\Ai\MedGemmaController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application.
|
*/

// AI Gateway Routes
Route::middleware(['auth:sanctum', 'ai.guard', 'throttle:ai'])->prefix('ai')->group(function () {
    // Main AI completion endpoint
    Route::post('/medgemma', MedGemmaController::class);
    
    // AI service health check
    Route::get('/health', [MedGemmaController::class, 'health']);
    
    // Get available tasks for current user
    Route::get('/tasks', [MedGemmaController::class, 'tasks']);
});
