<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class RadiologyImageService
{
    // Supported medical image formats
    protected array $allowedMimeTypes = [
        'application/dicom',        // DICOM
        'application/dcm',         // DICOM
        'image/jpeg',             // JPEG
        'image/png',              // PNG
        'image/tiff',             // TIFF
        'image/x-tiff',           // TIFF
        'application/zip',        // ZIP (containing DICOM files)
    ];

    // Max dimensions for preview images
    protected int $maxPreviewWidth = 2048;
    protected int $maxPreviewHeight = 2048;

    /**
     * Process and validate uploaded medical image.
     */
    public function processUpload(
        UploadedFile $file, 
        int $studyId,
        array $options = []
    ): array {
        $results = [
            'success' => false,
            'original_path' => null,
            'preview_path' => null,
            'thumbnail_path' => null,
            'metadata' => [],
            'errors' => [],
        ];

        try {
            // Validate file first
            $validation = $this->validateFile($file);
            if (!$validation['valid']) {
                $results['errors'] = $validation['errors'];
                return $results;
            }

            // Store original file
            $originalPath = $this->storeOriginal($file, $studyId);
            $results['original_path'] = $originalPath;

            // Check if file is a DICOM file (special handling)
            if ($this->isDicomFile($file)) {
                $results['metadata'] = $this->extractDicomMetadata($file);
                $results['success'] = true;
                return $results;
            }

            // Process standard image formats (JPEG, PNG, TIFF)
            $image = \Intervention\Image\Facades\Image::make($file->getRealPath());

            // Generate preview
            $previewPath = $this->generatePreview($image, $studyId);
            $results['preview_path'] = $previewPath;

            // Generate thumbnail
            $thumbnailPath = $this->generateThumbnail($image, $studyId);
            $results['thumbnail_path'] = $thumbnailPath;

            // Extract metadata
            $results['metadata'] = $this->extractMetadata($image);

            $results['success'] = true;

        } catch (\Exception $e) {
            Log::error('Image processing failed', [
                'study_id' => $studyId,
                'error' => $e->getMessage(),
            ]);
            $results['errors'] = [$e->getMessage()];
        }

        return $results;
    }

    /**
     * Validate uploaded file.
     */
    public function validateFile(UploadedFile $file): array
    {
        $errors = [];

        // Check file size (max 500MB for medical images)
        if ($file->getSize() > 500 * 1024 * 1024) {
            $errors[] = 'File size exceeds 500MB limit';
        }

        // Check MIME type
        $mimeType = $file->getMimeType();
        if (!in_array($mimeType, $this->allowedMimeTypes)) {
            $errors[] = "File type {$mimeType} is not supported";
        }

        // Check if file is readable
        if (!$file->isReadable()) {
            $errors[] = 'File is not readable';
        }

        return [
            'valid' => empty($errors),
            'errors' => $errors,
        ];
    }

    /**
     * Check if file is a DICOM file.
     */
    protected function isDicomFile(UploadedFile $file): bool
    {
        $mimeType = $file->getMimeType();
        return in_array($mimeType, ['application/dicom', 'application/dcm']);
    }

    /**
     * Store original file.
     */
    protected function storeOriginal(UploadedFile $file, int $studyId): string
    {
        $path = $file->storeAs(
            "radiology/studies/{$studyId}/original",
            $file->getClientOriginalName(),
            'public'
        );

        return $path;
    }

    /**
     * Generate preview image.
     */
    protected function generatePreview($image, int $studyId): string
    {
        // Resize to max dimensions while maintaining aspect ratio
        $image->resize($this->maxPreviewWidth, $this->maxPreviewHeight, function ($constraint) {
            $constraint->aspectRatio();
            $constraint->upsize();
        });

        // Save preview
        $filename = 'preview_' . time() . '.jpg';
        $path = "radiology/studies/{$studyId}/previews/{$filename}";
        
        $image->save(storage_path("app/public/{$path}"), 85);

        return $path;
    }

    /**
     * Generate thumbnail.
     */
    protected function generateThumbnail($image, int $studyId): string
    {
        // Create thumbnail (max 256x256)
        $image->fit(256, 256);

        $filename = 'thumb_' . time() . '.jpg';
        $path = "radiology/studies/{$studyId}/thumbnails/{$filename}";
        
        $image->save(storage_path("app/public/{$path}"), 80);

        return $path;
    }

    /**
     * Extract metadata from image.
     */
    protected function extractMetadata($image): array
    {
        return [
            'width' => $image->width(),
            'height' => $image->height(),
            'format' => $image->mime(),
        ];
    }

    /**
     * Extract metadata from DICOM file.
     * Note: This is a simplified version. In production, use a DICOM library like fo-dicom
     */
    protected function extractDicomMetadata(UploadedFile $file): array
    {
        return [
            'file_size' => $file->getSize(),
            'mime_type' => $file->getMimeType(),
            'dicom' => true,
            'note' => 'Full DICOM metadata extraction requires fo-dicom library',
        ];
    }
}
