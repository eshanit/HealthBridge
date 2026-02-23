<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * Adds CouchDB synchronization fields to support the three-tier data flow:
     * nurse_mobile (PouchDB) → Laravel API → CouchDB → MySQL
     */
    public function up(): void
    {
        Schema::table('radiology_studies', function (Blueprint $table) {
            // CouchDB document identification
            $table->string('couch_id', 255)->nullable()->unique()->after('id');
            $table->string('couch_rev', 50)->nullable()->after('couch_id');
            $table->timestamp('couch_updated_at')->nullable()->after('couch_rev');
            
            // Additional foreign key for session linking
            $table->string('session_couch_id', 255)->nullable()->after('accession_number');
            
            // AI analysis results
            $table->float('ai_priority_score')->nullable()->after('procedure_technician_id');
            $table->text('ai_preliminary_report')->nullable()->after('ai_priority_score');
            
            // DICOM storage
            $table->integer('dicom_series_count')->nullable()->after('dicom_storage_path');
            
            // Sync metadata
            $table->json('raw_document')->nullable()->after('study_completed_at');
            $table->timestamp('synced_at')->nullable()->after('raw_document');
            
            // Add index for CouchDB ID lookups
            $table->index('couch_id');
            $table->index('session_couch_id');
            $table->index('patient_cpt');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('radiology_studies', function (Blueprint $table) {
            $table->dropIndex(['couch_id', 'session_couch_id', 'patient_cpt']);
            $table->dropColumn([
                'couch_id',
                'couch_rev',
                'couch_updated_at',
                'session_couch_id',
                'ai_priority_score',
                'ai_preliminary_report',
                'dicom_series_count',
                'raw_document',
                'synced_at',
            ]);
        });
    }
};
