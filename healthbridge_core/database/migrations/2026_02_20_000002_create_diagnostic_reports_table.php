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
        Schema::create('diagnostic_reports', function (Blueprint $table) {
            $table->id();
            $table->string('report_uuid', 50)->unique();
            $table->string('report_instance_uid', 64)->unique()->nullable();
            $table->integer('report_version')->default(1);
            
            // Study Reference
            $table->foreignId('study_id')->constrained('radiology_studies')->cascadeOnDelete();
            $table->foreignId('radiologist_id')->constrained('users');
            
            // Report Content
            $table->text('findings')->nullable();
            $table->text('impression')->nullable();
            $table->text('recommendations')->nullable();
            
            // Report Type
            $table->enum('report_type', ['preliminary', 'final', 'addendum', 'amendment', 'canceled'])->default('final');
            $table->boolean('is_locked')->default(false);
            
            // AI Generated Content
            $table->text('ai_findings')->nullable();
            $table->text('ai_impression')->nullable();
            $table->boolean('ai_generated')->default(false);
            
            // Critical Findings
            $table->boolean('critical_findings')->default(false)->index();
            $table->boolean('critical_communicated')->default(false);
            $table->string('communication_method', 50)->nullable();
            $table->timestamp('communicated_at')->nullable();
            $table->foreignId('communicated_to_user_id')->nullable()->constrained('users')->nullOnDelete();
            
            // Digital Signature
            $table->text('digital_signature')->nullable();
            $table->string('signature_hash', 64)->nullable();
            $table->timestamp('signed_at')->nullable();
            
            // Amendment Tracking
            $table->text('amendment_reason')->nullable();
            $table->foreignId('amended_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('amended_at')->nullable();
            
            // Audit
            $table->json('audit_log')->nullable();
            
            // Timestamps
            $table->timestamps();
            
            // Indexes
            $table->index(['study_id', 'report_version']);
            $table->index(['radiologist_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('diagnostic_reports');
    }
};
