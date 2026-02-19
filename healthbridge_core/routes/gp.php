<?php

use App\Http\Controllers\GP\ClinicalSessionController;
use App\Http\Controllers\GP\GPDashboardController;
use App\Http\Controllers\GP\PatientController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| GP Routes
|--------------------------------------------------------------------------
|
| Routes for General Practitioner workflow. These routes are protected
| by authentication and role-based access control.
|
*/

Route::middleware(['auth', 'verified', 'role:doctor|admin'])->prefix('gp')->name('gp.')->group(function () {
    
    // Dashboard
    Route::get('/dashboard', [GPDashboardController::class, 'index'])->name('dashboard');
    
    // My Cases (combined IN_GP_REVIEW and UNDER_TREATMENT)
    Route::get('/my-cases', [GPDashboardController::class, 'myCases'])->name('my-cases');
    Route::get('/my-cases/json', [GPDashboardController::class, 'myCasesJson'])->name('my-cases.json');
    
    // Patient Management
    Route::prefix('patients')->name('patients.')->group(function () {
        Route::get('/', [PatientController::class, 'index'])->name('index');
        Route::get('/new', [PatientController::class, 'create'])->name('create');
        Route::post('/', [PatientController::class, 'store'])->name('store');
        Route::get('/search', [PatientController::class, 'search'])->name('search');
        Route::get('/{identifier}', [PatientController::class, 'show'])->name('show');
    });
    
    // Referral Queue
    Route::get('/referrals', [GPDashboardController::class, 'referralQueue'])->name('referrals.index');
    Route::get('/referrals/json', [GPDashboardController::class, 'referralsJson'])->name('referrals.json');
    Route::get('/referrals/{couchId}', [GPDashboardController::class, 'showReferral'])->name('referrals.show');
    Route::post('/referrals/{couchId}/accept', [GPDashboardController::class, 'acceptReferral'])->name('referrals.accept');
    Route::post('/referrals/{couchId}/reject', [GPDashboardController::class, 'rejectReferral'])->name('referrals.reject');
    
    // In Review Sessions
    Route::get('/in-review', [GPDashboardController::class, 'inReview'])->name('in-review.index');
    
    // Under Treatment Sessions
    Route::get('/under-treatment', [GPDashboardController::class, 'underTreatment'])->name('under-treatment.index');
    
    // Clinical Session Management
    Route::prefix('sessions')->name('sessions.')->group(function () {
        Route::get('/{couchId}', [ClinicalSessionController::class, 'show'])->name('show');
        Route::get('/{couchId}/timeline', [ClinicalSessionController::class, 'timeline'])->name('timeline');
        Route::post('/{couchId}/transition', [ClinicalSessionController::class, 'transition'])->name('transition');
        Route::post('/{couchId}/start-treatment', [ClinicalSessionController::class, 'startTreatment'])->name('start-treatment');
        Route::post('/{couchId}/request-specialist', [ClinicalSessionController::class, 'requestSpecialistReferral'])->name('request-specialist');
        Route::post('/{couchId}/close', [ClinicalSessionController::class, 'close'])->name('close');
        Route::put('/{couchId}/treatment-plan', [ClinicalSessionController::class, 'updateTreatmentPlan'])->name('treatment-plan.update');
        Route::post('/{couchId}/comments', [ClinicalSessionController::class, 'addComment'])->name('comments.store');
        Route::get('/{couchId}/comments', [ClinicalSessionController::class, 'getComments'])->name('comments.index');
    });
    
    // Workflow Configuration (for frontend state machine)
    Route::get('/workflow/config', [ClinicalSessionController::class, 'getWorkflowConfig'])->name('workflow.config');
});
