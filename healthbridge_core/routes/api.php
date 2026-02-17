<?php

use App\Http\Controllers\Api\Ai\MedGemmaController;
use App\Http\Controllers\Api\Auth\MobileAuthController;
use App\Http\Controllers\Api\CouchProxyController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application.
|
*/

// Base API route - provide API info for PouchDB compatibility
// This route is public and returns CORS-friendly response
Route::get('/', function () {
    return response()->json([
        'status' => 'ok',
        'version' => '1.0.0',
        'endpoints' => [
            'auth' => '/api/auth',
            'couchdb' => '/api/couchdb',
            'ai' => '/api/ai',
        ],
    ])->header('Access-Control-Allow-Origin', '*');
});

// Handle OPTIONS requests for CORS preflight on base API route
Route::options('/', function () {
    return response()->json([], 204)
        ->header('Access-Control-Allow-Origin', '*')
        ->header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
});

/*
|--------------------------------------------------------------------------
| Mobile Authentication Routes
|--------------------------------------------------------------------------
|
| These endpoints handle authentication for the nurse_mobile app.
| Uses Laravel Sanctum for token-based API authentication.
|
*/
Route::prefix('auth')->group(function () {
    // Public routes (no authentication required)
    Route::post('/login', [MobileAuthController::class, 'login']);
    Route::get('/check', [MobileAuthController::class, 'check']);
    
    // Protected routes (Sanctum authentication required)
    Route::middleware(['auth:sanctum'])->group(function () {
        Route::post('/logout', [MobileAuthController::class, 'logout']);
        Route::post('/logout-all', [MobileAuthController::class, 'logoutAll']);
        Route::get('/user', [MobileAuthController::class, 'user']);
        Route::post('/refresh', [MobileAuthController::class, 'refresh']);
    });
});

// AI Gateway Routes
Route::middleware(['auth:sanctum', 'ai.guard', 'throttle:ai'])->prefix('ai')->group(function () {
    // Main AI completion endpoint
    Route::post('/medgemma', MedGemmaController::class);
    
    // AI service health check
    Route::get('/health', [MedGemmaController::class, 'health']);
    
    // Get available tasks for current user
    Route::get('/tasks', [MedGemmaController::class, 'tasks']);
});

/*
|--------------------------------------------------------------------------
| CouchDB Proxy Routes
|--------------------------------------------------------------------------
|
| These routes proxy all CouchDB requests through Laravel, providing:
| - Sanctum token authentication
| - User context injection for document-level access control
| - Secure credential management (CouchDB credentials server-side only)
|
| Architecture: Mobile App (PouchDB) → Laravel Proxy → CouchDB
|
| @see GATEWAY.md for full specification
*/
Route::middleware(['auth:sanctum', 'throttle:api'])->prefix('couchdb')->group(function () {
    
    // Health check endpoint (for monitoring)
    Route::get('/health', [CouchProxyController::class, 'health']);
    
    // Database info (GET /api/couchdb)
    Route::get('/', [CouchProxyController::class, 'info']);
    
    // _changes feed - core of PouchDB sync mechanism
    Route::get('/_changes', [CouchProxyController::class, 'changes']);
    Route::post('/_changes', [CouchProxyController::class, 'changes']);
    
    // _all_docs - list all documents
    Route::get('/_all_docs', [CouchProxyController::class, 'allDocs']);
    Route::post('/_all_docs', [CouchProxyController::class, 'allDocs']);
    
    // _bulk_docs - bulk document operations (used by PouchDB sync)
    Route::post('/_bulk_docs', [CouchProxyController::class, 'bulkDocs']);
    
    // _revs_diff - revision difference check (used by PouchDB sync)
    Route::post('/_revs_diff', [CouchProxyController::class, 'revsDiff']);
    
    // Design document views
    Route::get('/_design/{ddoc}/_view/{view}', [CouchProxyController::class, 'view']);
    Route::post('/_design/{ddoc}/_view/{view}', [CouchProxyController::class, 'view']);
    
    // Catch-all for document operations (must be last)
    // Handles: GET, PUT, DELETE /api/couchdb/{id}
    Route::match(['GET', 'PUT', 'DELETE', 'POST'], '/{id}', [CouchProxyController::class, 'document'])
        ->where('id', '.*');
});
