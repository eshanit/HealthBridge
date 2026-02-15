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
        Schema::create('patients', function (Blueprint $table) {
            $table->id();
            $table->string('couch_id')->unique()->nullable();
            $table->string('cpt', 20)->unique();
            $table->string('short_code', 10)->nullable();
            $table->string('external_id')->nullable();
            $table->date('date_of_birth')->nullable();
            $table->integer('age_months')->nullable();
            $table->enum('gender', ['male', 'female', 'other'])->nullable();
            $table->decimal('weight_kg', 5, 2)->nullable();
            $table->string('phone', 30)->nullable();
            $table->integer('visit_count')->default(1);
            $table->boolean('is_active')->default(true);
            $table->json('raw_document')->nullable();
            $table->timestamp('last_visit_at')->nullable();
            $table->timestamps();

            $table->index(['cpt', 'is_active']);
            $table->index('age_months');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('patients');
    }
};
