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
        Schema::create('state_transitions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_id')->constrained('clinical_sessions')->cascadeOnDelete();
            $table->string('session_couch_id')->nullable()->index();
            $table->string('from_state');
            $table->string('to_state');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reason')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            // Index for querying by session
            $table->index(['session_id', 'created_at']);
            // Index for querying by state
            $table->index(['from_state', 'to_state']);
        });

        // Add workflow_state column to clinical_sessions
        Schema::table('clinical_sessions', function (Blueprint $table) {
            $table->string('workflow_state')->default('NEW')->after('status');
            $table->timestamp('workflow_state_updated_at')->nullable()->after('workflow_state');
            
            // Index for workflow queries
            $table->index('workflow_state');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('clinical_sessions', function (Blueprint $table) {
            $table->dropColumn(['workflow_state', 'workflow_state_updated_at']);
        });

        Schema::dropIfExists('state_transitions');
    }
};
