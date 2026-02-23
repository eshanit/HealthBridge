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
        Schema::table('radiology_studies', function (Blueprint $table) {
            $table->string('preview_image_path')->nullable()->after('dicom_storage_path');
            $table->string('thumbnail_path')->nullable()->after('preview_image_path');
            $table->json('image_metadata')->nullable()->after('thumbnail_path');
            $table->boolean('images_uploaded')->default(false)->after('image_metadata');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('radiology_studies', function (Blueprint $table) {
            $table->dropColumn([
                'preview_image_path',
                'thumbnail_path',
                'image_metadata',
                'images_uploaded',
            ]);
        });
    }
};
