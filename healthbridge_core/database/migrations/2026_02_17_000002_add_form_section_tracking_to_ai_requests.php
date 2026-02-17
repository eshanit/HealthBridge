<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migration to add form section tracking to AI requests.
 * 
 * This ensures AI interactions are traceable to their specific session 
 * and form section context, enabling:
 * - Tracking which form section triggered AI assistance
 * - Audit trail for AI-generated content per section
 * - Analytics on AI usage by form section
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('ai_requests', function (Blueprint $table) {
            // Form section tracking
            $table->string('form_section_id', 100)
                ->nullable()
                ->after('form_couch_id')
                ->comment('The specific form section this AI request relates to');
            
            // Additional context fields
            $table->string('form_field_id', 100)
                ->nullable()
                ->after('form_section_id')
                ->comment('The specific form field that triggered this AI request');
            
            $table->string('form_schema_id', 50)
                ->nullable()
                ->after('form_field_id')
                ->comment('The schema ID of the form (e.g., peds_respiratory)');
            
            // Index for efficient querying by section
            $table->index(['form_couch_id', 'form_section_id']);
            $table->index('form_schema_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('ai_requests', function (Blueprint $table) {
            $table->dropIndex(['form_couch_id', 'form_section_id']);
            $table->dropIndex(['form_schema_id']);
            $table->dropColumn(['form_section_id', 'form_field_id', 'form_schema_id']);
        });
    }
};
