<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration to add nurse/frontline worker tracking to clinical tables.
 * 
 * This ensures that AI-generated content created by nurses for patients
 * is correctly attributed to the healthcare worker who created it.
 * 
 * Related documents in CouchDB contain:
 * - createdBy: User ID who created the document
 * - providerId: Healthcare provider ID (for sessions)
 * - userId: User ID (for AI logs)
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Add user tracking to clinical_sessions
        Schema::table('clinical_sessions', function (Blueprint $table) {
            $table->foreignId('created_by_user_id')
                ->nullable()
                ->after('patient_cpt')
                ->constrained('users')
                ->nullOnDelete();
            
            $table->string('provider_role', 50)
                ->nullable()
                ->after('created_by_user_id')
                ->comment('Role of the healthcare provider (nurse, chw, etc.)');
            
            $table->index('created_by_user_id');
        });

        // Add user tracking to clinical_forms
        Schema::table('clinical_forms', function (Blueprint $table) {
            $table->foreignId('created_by_user_id')
                ->nullable()
                ->after('patient_cpt')
                ->constrained('users')
                ->nullOnDelete();
            
            $table->string('creator_role', 50)
                ->nullable()
                ->after('created_by_user_id')
                ->comment('Role of the form creator (nurse, chw, etc.)');
            
            $table->index('created_by_user_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('clinical_forms', function (Blueprint $table) {
            $table->dropForeign(['created_by_user_id']);
            $table->dropColumn(['created_by_user_id', 'creator_role']);
        });

        Schema::table('clinical_sessions', function (Blueprint $table) {
            $table->dropForeign(['created_by_user_id']);
            $table->dropColumn(['created_by_user_id', 'provider_role']);
        });
    }
};
