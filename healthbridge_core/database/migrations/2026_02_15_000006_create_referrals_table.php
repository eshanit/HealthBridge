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
        Schema::create('referrals', function (Blueprint $table) {
            $table->id();
            $table->string('referral_uuid', 50)->unique();
            
            // Session Reference
            $table->string('session_couch_id');
            
            // Participants
            $table->foreignId('referring_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('assigned_to_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('assigned_to_role', 50)->nullable();
            
            // Status
            $table->enum('status', ['pending', 'accepted', 'rejected', 'completed', 'cancelled'])
                  ->default('pending');
            $table->enum('priority', ['red', 'yellow', 'green']);
            
            // Clinical Context
            $table->string('specialty', 50)->nullable();
            $table->text('reason')->nullable();
            $table->text('clinical_notes')->nullable();
            $table->text('rejection_reason')->nullable();
            
            // Timestamps
            $table->timestamp('assigned_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'priority']);
            $table->index(['assigned_to_user_id', 'status']);
            $table->index('session_couch_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('referrals');
    }
};
