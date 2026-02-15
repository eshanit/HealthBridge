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
        Schema::create('ai_requests', function (Blueprint $table) {
            $table->id();
            $table->uuid('request_uuid')->unique();
            
            // User & Role
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('role', 50)->nullable();
            
            // Context
            $table->string('session_couch_id')->nullable();
            $table->string('form_couch_id')->nullable();
            $table->string('patient_cpt', 20)->nullable();
            
            // Request Details
            $table->string('task', 50);
            $table->string('use_case', 50)->nullable();
            $table->string('prompt_version', 20)->nullable();
            $table->string('triage_ruleset_version', 20)->nullable();
            
            // Input/Output
            $table->string('input_hash', 64)->nullable();
            $table->text('prompt')->nullable();
            $table->longText('response')->nullable();
            $table->longText('safe_output')->nullable();
            
            // Model Info
            $table->string('model', 50)->nullable();
            $table->string('model_version', 50)->nullable();
            $table->integer('latency_ms')->nullable();
            
            // Safety & Governance
            $table->boolean('was_overridden')->default(false);
            $table->json('risk_flags')->nullable();
            $table->json('blocked_phrases')->nullable();
            $table->text('override_reason')->nullable();
            
            // Timestamps
            $table->timestamp('requested_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'task']);
            $table->index(['session_couch_id']);
            $table->index('requested_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ai_requests');
    }
};
