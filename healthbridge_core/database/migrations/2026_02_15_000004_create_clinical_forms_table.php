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
        Schema::create('clinical_forms', function (Blueprint $table) {
            $table->id();
            $table->string('couch_id')->unique();
            $table->string('form_uuid', 50)->unique();
            $table->string('session_couch_id')->nullable();
            $table->string('patient_cpt', 20)->nullable();
            
            // Schema Reference
            $table->string('schema_id', 50);
            $table->string('schema_version', 20)->nullable();
            
            // Workflow State
            $table->string('current_state_id')->nullable();
            $table->enum('status', ['draft', 'completed', 'submitted', 'synced', 'error'])
                  ->default('draft');
            $table->enum('sync_status', ['pending', 'syncing', 'synced', 'error'])
                  ->default('pending');
            
            // Clinical Data
            $table->json('answers');
            $table->json('calculated')->nullable();
            $table->json('audit_log')->nullable();
            
            // Timestamps
            $table->timestamp('form_created_at')->nullable();
            $table->timestamp('form_updated_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('synced_at')->nullable();
            
            // Audit
            $table->json('raw_document')->nullable();
            $table->timestamps();

            $table->index(['schema_id', 'status']);
            $table->index('patient_cpt');
            $table->index('session_couch_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('clinical_forms');
    }
};
