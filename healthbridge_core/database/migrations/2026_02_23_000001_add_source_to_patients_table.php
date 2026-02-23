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
        Schema::table('patients', function (Blueprint $table) {
            // Source tracking: where the patient record originated
            // 'nurse_mobile' - synced from nurse_mobile app via CouchDB
            // 'gp_manual' - created manually by GP in healthbridge_core
            // 'imported' - imported from external system
            $table->string('source')->default('gp_manual')->after('is_active');
            
            // Track which user created this patient record (for GP-created patients)
            $table->unsignedBigInteger('created_by_user_id')->nullable()->after('source');
            
            // Index for filtering by source
            $table->index('source');
            
            // Foreign key to users table
            $table->foreign('created_by_user_id')
                ->references('id')
                ->on('users')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            $table->dropForeign(['created_by_user_id']);
            $table->dropIndex(['source']);
            $table->dropColumn(['source', 'created_by_user_id']);
        });
    }
};
