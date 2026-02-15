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
        Schema::create('case_comments', function (Blueprint $table) {
            $table->id();
            $table->string('session_couch_id');
            
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('comment');
            $table->enum('comment_type', ['clinical', 'administrative', 'feedback', 'flag'])
                  ->default('clinical');
            
            // For feedback/suggestions
            $table->string('suggested_rule_change')->nullable();
            $table->boolean('requires_followup')->default(false);
            
            $table->timestamps();

            $table->index(['session_couch_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('case_comments');
    }
};
