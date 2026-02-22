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
        Schema::create('prescriptions', function (Blueprint $table) {
            $table->id();
            $table->string('uuid', 36)->unique();
            $table->string('session_couch_id')->index();
            $table->string('patient_cpt')->nullable()->index();
            $table->foreignId('prescriber_id')->constrained('users')->onDelete('cascade');
            
            // Medication details
            $table->string('medication_name');
            $table->string('dose');
            $table->string('route')->default('oral');
            $table->string('frequency');
            $table->string('duration')->nullable();
            $table->text('instructions')->nullable();
            
            // Status tracking
            $table->enum('status', ['active', 'completed', 'cancelled', 'dispensed'])->default('active');
            $table->timestamp('dispensed_at')->nullable();
            $table->foreignId('dispensed_by')->nullable()->constrained('users')->onDelete('set null');
            
            // Audit trail
            $table->timestamps();
            $table->softDeletes();
            
            // Indexes for common queries
            $table->index(['session_couch_id', 'status']);
            $table->index(['prescriber_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('prescriptions');
    }
};
