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
        Schema::create('consultations', function (Blueprint $table) {
            $table->id();
            $table->string('consultation_uuid', 50)->unique();
            
            // References
            $table->foreignId('study_id')->constrained('radiology_studies')->cascadeOnDelete();
            $table->foreignId('requesting_user_id')->constrained('users');
            $table->foreignId('radiologist_id')->nullable()->constrained('users')->nullOnDelete();
            
            // Consultation Details
            $table->enum('consultation_type', ['preliminary', 'formal', 'urgent', 'second_opinion']);
            $table->string('consultation_category', 100)->nullable();
            $table->text('question');
            $table->text('clinical_context')->nullable();
            
            // Status & SLA
            $table->enum('status', ['pending', 'in_progress', 'answered', 'closed'])->default('pending')->index();
            $table->timestamp('first_response_at')->nullable();
            $table->timestamp('answered_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->integer('sla_hours')->default(24);
            
            // Messages (JSON for threading)
            $table->json('messages')->nullable();
            
            $table->timestamps();
            
            $table->index(['status', 'created_at']);
            $table->index('radiologist_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('consultations');
    }
};
