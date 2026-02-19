<?php

use App\Http\Controllers\Api\Ai\MedGemmaController;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Laravel\Fortify\Features;

Route::get('/', function () {
    return Inertia::render('Welcome', [
        'canRegister' => Features::enabled(Features::registration()),
    ]);
})->name('home');

Route::get('dashboard', function () {
    return Inertia::render('Dashboard');
})->middleware(['auth', 'verified'])->name('dashboard');

// Broadcasting authentication route for private channels
Broadcast::routes(['middleware' => ['auth']]);

// AI Gateway Routes for web session authentication (GP Dashboard)
Route::middleware(['auth', 'ai.guard', 'throttle:ai'])->prefix('api/ai')->group(function () {
    Route::post('/medgemma', MedGemmaController::class);
    Route::get('/health', [MedGemmaController::class, 'health']);
    Route::get('/tasks', [MedGemmaController::class, 'tasks']);
});

require __DIR__.'/settings.php';
require __DIR__.'/gp.php';
