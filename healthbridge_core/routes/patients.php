<?php

use App\Http\Controllers\GP\PatientController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Patient Routes
|--------------------------------------------------------------------------
|
| Role-agnostic routes for patient management. These routes are accessible
| by both doctors and radiologists for registering and managing patients.
|
*/

Route::middleware(['auth', 'verified', 'role:doctor|radiologist|admin'])->prefix('patients')->name('patients.')->group(function () {
    // Patient Management
    Route::get('/', [PatientController::class, 'index'])->name('index');
    Route::get('/new', [PatientController::class, 'create'])->name('create');
    Route::post('/', [PatientController::class, 'store'])->name('store');
    Route::get('/search', [PatientController::class, 'search'])->name('search');
    Route::get('/{identifier}', [PatientController::class, 'show'])->name('show');
});
