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

// All radiology routes - require authentication
// Image routes don't require radiologist role (for viewers)
Route::middleware(['auth', 'verified'])->prefix('radiology')->name('radiology.')->group(function () {
    
    // Dashboard - requires radiologist role
    Route::get('/dashboard', [RadiologyController::class, 'index'])->name('dashboard')->middleware('role:radiologist|admin');
    
    // New Study Page - requires radiologist role
    Route::get('/studies/new', [RadiologyController::class, 'newStudy'])->name('studies.new')->middleware('role:radiologist|admin');
    
    // Worklist - requires radiologist role
    Route::get('/worklist', [RadiologyController::class, 'worklist'])->name('worklist')->middleware('role:radiologist|admin');
    Route::get('/worklist/stats', [RadiologyController::class, 'worklistStats'])->name('worklist.stats')->middleware('role:radiologist|admin');
    
    // Image routes - don't require radiologist role (any authenticated user can view)
    // Put these BEFORE the generic {studyId} route to ensure they match first
    Route::get('/studies/{studyId}/image', [RadiologyController::class, 'getImage'])->name('studies.image');
    Route::get('/studies/{studyId}/preview', [RadiologyController::class, 'getPreview'])->name('studies.preview');
    
    // Studies CRUD - requires radiologist role
    Route::post('/studies', [RadiologyController::class, 'createStudy'])->name('studies.create')->middleware('role:radiologist|admin');
    Route::post('/studies/{studyId}/upload-images', [RadiologyController::class, 'uploadImages'])->name('studies.upload')->middleware('role:radiologist|admin');
    Route::post('/studies/{studyId}/accept', [RadiologyController::class, 'acceptStudy'])->name('studies.accept')->middleware('role:radiologist|admin');
    Route::post('/studies/{studyId}/assign', [RadiologyController::class, 'assignStudy'])->name('studies.assign')->middleware('role:radiologist|admin');
    Route::patch('/studies/{studyId}/status', [RadiologyController::class, 'updateStudyStatus'])->name('studies.status')->middleware('role:radiologist|admin');
    
    // Reports - requires radiologist role
    Route::get('/reports', [RadiologyController::class, 'listReports'])->name('reports.index')->middleware('role:radiologist|admin');
    Route::get('/reports/templates', [RadiologyController::class, 'getReportTemplates'])->name('reports.templates')->middleware('role:radiologist|admin');
    Route::get('/reports/{reportId}', [RadiologyController::class, 'showReport'])->name('reports.show')->middleware('role:radiologist|admin');
    Route::post('/studies/{studyId}/reports', [RadiologyController::class, 'createReport'])->name('reports.create')->middleware('role:radiologist|admin');
    Route::patch('/reports/{reportId}', [RadiologyController::class, 'updateReport'])->name('reports.update')->middleware('role:radiologist|admin');
    Route::post('/reports/{reportId}/sign', [RadiologyController::class, 'signReport'])->name('reports.sign')->middleware('role:radiologist|admin');
    Route::post('/reports/{reportId}/amend', [RadiologyController::class, 'amendReport'])->name('reports.amend')->middleware('role:radiologist|admin');
    Route::post('/reports/{reportId}/auto-save', [RadiologyController::class, 'autoSaveReport'])->name('reports.auto-save')->middleware('role:radiologist|admin');
    
    // Generic study show - requires radiologist role - MUST BE LAST
    Route::get('/studies/{studyId}', [RadiologyController::class, 'showStudy'])->name('studies.show')->middleware('role:radiologist|admin');
});
