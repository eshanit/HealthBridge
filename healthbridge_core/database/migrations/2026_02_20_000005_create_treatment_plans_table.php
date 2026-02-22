<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('treatment_plans', function (Blueprint $table) {
            $table->id();
            $table->string('plan_uuid', 50)->unique();
            
            // References
            $table->string('session_couch_id')->nullable();
            $table->string('patient_cpt', 20)->index();
            $table->foreignId('created_by')->constrained('users');
            $table->foreignId('study_id')->nullable()->constrained('radiology_studies')->nullOnDelete();
            
            // Plan Details
            $table->enum('plan_type', ['monitoring', 'therapeutic', 'surgical_planning', 'diagnostic']);
            $table->string('diagnosis', 500);
            $table->text('imaging_based_findings')->nullable();
            $table->text('treatment_goals')->nullable();
            
            // Imaging Milestones
            $table->json('imaging_milestones')->nullable();
            
            // Response Assessment
            $table->string('response_criteria', 50)->nullable(); // RECIST, WHO, etc.
            $table->json('baseline_measurements')->nullable();
            
            // Status
            $table->enum('status', ['active', 'completed', 'discontinued', 'on_hold'])->default('active')->index();
            $table->date('next_review_date')->nullable()->index();
            $table->timestamp('completed_at')->nullable();
            $table->text('completion_reason')->nullable();
            
            // MDT
            $table->boolean('requires_mdt')->default(false);
            $table->timestamp('mdt_scheduled_at')->nullable();
            
            $table->timestamps();
            
            $table->index(['patient_cpt', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('treatment_plans');
    }
};
