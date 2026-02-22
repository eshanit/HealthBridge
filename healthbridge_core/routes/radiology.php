<?php

use App\Http\Controllers\Radiology\RadiologyController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Radiology Routes
|--------------------------------------------------------------------------
|
| Routes for Radiologist workflow. These routes are protected
| by authentication and role-based access control.
|
*/

Route::middleware(['auth', 'verified', 'role:radiologist|admin'])->prefix('radiology')->name('radiology.')->group(function () {
    
    // Dashboard
    Route::get('/dashboard', [RadiologyController::class, 'index'])->name('dashboard');
    
    // Worklist
    Route::get('/worklist', [RadiologyController::class, 'worklist'])->name('worklist');
    Route::get('/worklist/stats', [RadiologyController::class, 'worklistStats'])->name('worklist.stats');
    
    // Studies
    Route::post('/studies', [RadiologyController::class, 'createStudy'])->name('studies.create');
    Route::get('/studies/{studyId}', [RadiologyController::class, 'showStudy'])->name('studies.show');
    Route::post('/studies/{studyId}/accept', [RadiologyController::class, 'acceptStudy'])->name('studies.accept');
    Route::post('/studies/{studyId}/assign', [RadiologyController::class, 'assignStudy'])->name('studies.assign');
    Route::patch('/studies/{studyId}/status', [RadiologyController::class, 'updateStudyStatus'])->name('studies.status');
    
    // Additional routes for Phase 2B+ will be added here:
    // - Reports management
    // - Consultations
    // - Procedures
    // - Treatment plans
    
    // Reports (Phase 2B)
    Route::get('/reports', [RadiologyController::class, 'listReports'])->name('reports.index');
    Route::get('/reports/templates', [RadiologyController::class, 'getReportTemplates'])->name('reports.templates');
    Route::get('/reports/{reportId}', [RadiologyController::class, 'showReport'])->name('reports.show');
    Route::post('/studies/{studyId}/reports', [RadiologyController::class, 'createReport'])->name('reports.create');
    Route::patch('/reports/{reportId}', [RadiologyController::class, 'updateReport'])->name('reports.update');
    Route::post('/reports/{reportId}/sign', [RadiologyController::class, 'signReport'])->name('reports.sign');
    Route::post('/reports/{reportId}/amend', [RadiologyController::class, 'amendReport'])->name('reports.amend');
    Route::post('/reports/{reportId}/auto-save', [RadiologyController::class, 'autoSaveReport'])->name('reports.auto-save');
});
