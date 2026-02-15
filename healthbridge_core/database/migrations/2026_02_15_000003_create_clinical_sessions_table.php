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
        Schema::create('clinical_sessions', function (Blueprint $table) {
            $table->id();
            $table->string('couch_id')->unique();
            $table->string('session_uuid', 50)->unique();
            $table->string('patient_cpt', 20)->nullable();
            
            // Workflow State
            $table->enum('stage', ['registration', 'assessment', 'treatment', 'discharge'])
                  ->default('registration');
            $table->enum('status', ['open', 'completed', 'archived', 'referred', 'cancelled'])
                  ->default('open');
            $table->enum('triage_priority', ['red', 'yellow', 'green', 'unknown'])
                  ->default('unknown');
            
            // Clinical Context
            $table->string('chief_complaint')->nullable();
            $table->text('notes')->nullable();
            $table->json('form_instance_ids')->nullable();
            
            // Timestamps (from CouchDB)
            $table->timestamp('session_created_at')->nullable();
            $table->timestamp('session_updated_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('synced_at')->nullable();
            
            // Audit
            $table->json('raw_document')->nullable();
            $table->timestamps();

            $table->index(['status', 'triage_priority']);
            $table->index(['patient_cpt', 'status']);
            $table->index('session_created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('clinical_sessions');
    }
};
