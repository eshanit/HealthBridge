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
        Schema::create('interventional_procedures', function (Blueprint $table) {
            $table->id();
            $table->string('procedure_uuid', 50)->unique();
            
            // References
            $table->string('session_couch_id')->nullable();
            $table->string('patient_cpt', 20)->index();
            $table->foreignId('study_id')->nullable()->constrained('radiology_studies')->nullOnDelete();
            $table->foreignId('radiologist_id')->constrained('users');
            $table->foreignId('referring_user_id')->nullable()->constrained('users')->nullOnDelete();
            
            // Procedure Details
            $table->string('procedure_type', 255);
            $table->string('procedure_code', 50)->nullable();
            $table->string('target', 255);
            $table->text('indications');
            $table->text('technique')->nullable();
            
            // Status
            $table->enum('status', ['scheduled', 'prep', 'in_progress', 'complete', 'cancelled'])->default('scheduled')->index();
            
            // Consent
            $table->enum('consent_status', ['pending', 'obtained', 'refused', 'waiver'])->default('pending');
            $table->timestamp('consent_obtained_at')->nullable();
            $table->text('consent_notes')->nullable();
            
            // Procedure Times
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('patient_arrived_at')->nullable();
            $table->timestamp('procedure_started_at')->nullable();
            $table->timestamp('procedure_ended_at')->nullable();
            $table->timestamp('patient_discharged_at')->nullable();
            
            // Documentation
            $table->text('findings')->nullable();
            $table->text('description')->nullable();
            $table->json('complications')->nullable();
            $table->json('equipment_used')->nullable();
            $table->json('post_procedure_orders')->nullable();
            
            // Radiation Dose (if applicable)
            $table->decimal('dlp_gy_cm', 10, 2)->nullable();
            $table->decimal('dap_gy_cm2', 10, 2)->nullable();
            
            $table->timestamps();
            
            $table->index(['status', 'scheduled_at']);
            $table->index('radiologist_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('interventional_procedures');
    }
};
