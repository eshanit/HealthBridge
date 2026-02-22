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
        Schema::create('radiology_studies', function (Blueprint $table) {
            $table->id();
            $table->string('study_uuid', 50)->unique();
            $table->string('study_instance_uid', 64)->unique()->nullable();
            $table->string('accession_number', 50)->nullable();
            
            // Session & Patient
            $table->string('session_couch_id')->nullable();
            $table->string('patient_cpt', 20)->index();
            
            // Ordering
            $table->foreignId('referring_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('assigned_radiologist_id')->nullable()->constrained('users')->nullOnDelete();
            
            // Study Details
            $table->enum('modality', ['CT', 'MRI', 'XRAY', 'ULTRASOUND', 'PET', 'MAMMO', 'FLUORO', 'ANGIO']);
            $table->string('body_part', 100);
            $table->string('study_type', 255);
            $table->text('clinical_indication');
            $table->text('clinical_question')->nullable();
            
            // Priority & Status
            $table->enum('priority', ['stat', 'urgent', 'routine', 'scheduled'])->default('routine')->index();
            $table->enum('status', [
                'pending', 'ordered', 'scheduled', 'in_progress', 
                'completed', 'interpreted', 'reported', 'amended', 'cancelled'
            ])->default('pending')->index();
            
            // Procedure Info
            $table->enum('procedure_status', ['not_started', 'in_progress', 'completed', 'verified'])->nullable();
            $table->string('procedure_technician_id')->nullable();
            
            // AI Fields
            $table->integer('ai_priority_score')->nullable()->index();
            $table->boolean('ai_critical_flag')->default(false)->index();
            $table->text('ai_preliminary_report')->nullable();
            
            // DICOM Info
            $table->string('dicom_series_count')->nullable();
            $table->string('dicom_storage_path')->nullable();
            
            // Timestamps
            $table->timestamp('ordered_at');
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('performed_at')->nullable();
            $table->timestamp('images_available_at')->nullable();
            $table->timestamp('study_completed_at')->nullable();
            $table->timestamps();
            
            // Indexes for common queries
            $table->index(['status', 'priority']);
            $table->index(['assigned_radiologist_id', 'status']);
            $table->index(['patient_cpt', 'created_at']);
            $table->index('study_instance_uid');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('radiology_studies');
    }
};
