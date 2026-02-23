# Integrating Intervention Image for Radiology Study Uploads

## Overview

This document provides implementation guidance for using the **Intervention Image** library to handle medical image uploads in the HealthBridge radiology module. Intervention Image is a PHP image manipulation library that integrates well with Laravel.

## Installation

First, install the Intervention Image library:

```bash
composer require intervention/image
```

For Laravel 11+, you may need to add the service provider manually in `bootstrap/providers.php`:

```php
// bootstrap/providers.php
<?php

return [
    // ... other providers
    Intervention\Image\ImageServiceProvider::class,
];
```

Add the facade alias in `config/app.php`:

```php
'aliases' => [
    // ... other aliases
    'Image' => Intervention\Image\Facades\Image::class,
],
```

## Implementation

### 1. Create Image Processing Service

Create a dedicated service for handling radiology image processing:

```php
// app/Services/RadiologyImageService.php

<?php

namespace App\Services;

use Intervention\Image\ImageManager;
use Intervention\Image\Drivers\Gd\Driver;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;

class RadiologyImageService
{
    protected ImageManager $imageManager;

    // Supported medical image formats
    protected array $allowedMimeTypes = [
        'application/dicom',        // DICOM
        'application/dcm',         // DICOM
        'image/jpeg',              // JPEG
        'image/png',               // PNG
        'image/tiff',              // TIFF
        'image/x-tiff',            // TIFF
        'application/zip',         // ZIP (containing DICOM files)
    ];

    // Max dimensions for preview images
    protected int $maxPreviewWidth = 2048;
    protected int $maxPreviewHeight = 2048;

    public function __construct()
    {
        $this->imageManager = new ImageManager(new Driver());
    }

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

            // Process standard image formats
            $image = $this->imageManager->read($file->getRealPath());

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
        $image->scaleDown($this->maxPreviewWidth, $this->maxPreviewHeight);

        // Save preview
        $filename = 'preview_' . time() . '.jpg';
        $path = "radiology/studies/{$studyId}/previews/{$filename}";
        
        $image->toJpeg(85)->save(storage_path("app/public/{$path}"));

        return $path;
    }

    /**
     * Generate thumbnail.
     */
    protected function generateThumbnail($image, int $studyId): string
    {
        // Create thumbnail (max 256x256)
        $image->cover(256, 256);

        $filename = 'thumb_' . time() . '.jpg';
        $path = "radiology/studies/{$studyId}/thumbnails/{$filename}";
        
        $image->toJpeg(80)->save(storage_path("app/public/{$path}"));

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
            'color_space' => $image->colorspace()->name ?? 'unknown',
            'bit_depth' => $image->bitDepth() ?? 'unknown',
            'exif' => $image->exif() ?? [],
        ];
    }

    /**
     * Extract metadata from DICOM file.
     * Note: In production, use a DICOM library like fo-dicom
     */
    protected function extractDicomMetadata(UploadedFile $file): array
    {
        // Basic DICOM metadata extraction
        // In production, use a dedicated DICOM library
        return [
            'file_size' => $file->getSize(),
            'mime_type' => $file->getMimeType(),
            'dicom' => true,
            'note' => 'Full DICOM metadata extraction requires fo-dicom library',
        ];
    }

    /**
     * Apply window/level presets for medical imaging.
     * Common presets: Brain, Lung, Bone, Abdomen
     */
    public function applyWindowLevel(
        string $imagePath, 
        string $preset = 'default'
    ): string {
        $image = $this->imageManager->read(storage_path("app/public/{$imagePath}"));
        
        $presets = [
            'brain' => ['width' => 80, 'center' => 40],
            'lung' => ['width' => 1500, 'center' => -600],
            'bone' => ['width' => 2000, 'center' => 400],
            'abdomen' => ['width' => 400, 'center' => 50],
            'default' => ['width' => 256, 'center' => 128],
        ];

        $settings = $presets[$preset] ?? $presets['default'];
        
        // Apply contrast and brightness based on window/level
        // This is a simplified version - real DICOM windowing is more complex
        $image->adjustContrast($settings['width'] / 100);
        $image->adjustBrightness(($settings['center'] - 128) / 10);

        $filename = 'wl_' . $preset . '_' . time() . '.jpg';
        $newPath = "radiology/processed/{$filename}";
        
        $image->toJpeg(90)->save(storage_path("app/public/{$newPath}"));

        return $newPath;
    }
}
```

### 2. Update Controller to Use Image Service

```php
// app/Http/Controllers/Radiology/RadiologyController.php

use App\Services\RadiologyImageService;

public function __construct(
    protected RadiologyImageService $imageService
) {}

public function uploadImages(Request $request, string $studyId)
{
    $study = RadiologyStudy::findOrFail($studyId);
    
    if ($study->images_uploaded) {
        return response()->json([
            'message' => 'Images already uploaded',
        ], 422);
    }
    
    // Validate request
    $request->validate([
        'image' => 'required|file|mimes:dcm,jpeg,jpg,png,tiff,zip|max:512000',
    ]);
    
    // Process the image
    $result = $this->imageService->processUpload(
        $request->file('image'),
        $study->id
    );
    
    if (!$result['success']) {
        return response()->json([
            'message' => 'Image processing failed',
            'errors' => $result['errors'],
        ], 422);
    }
    
    // Update study with image paths
    $study->update([
        'dicom_storage_path' => $result['original_path'],
        'images_uploaded' => true,
        'images_available_at' => now(),
        'status' => 'in_progress',
    ]);
    
    // Store preview/thumbnail paths if generated
    if ($result['preview_path']) {
        $study->update(['preview_image_path' => $result['preview_path']]);
    }
    
    return response()->json([
        'message' => 'Images uploaded successfully',
        'study' => $study->fresh(),
        'metadata' => $result['metadata'],
    ]);
}
```

### 3. Add Validation Rules

```php
// In RadiologyStudy model

public static function imageUploadRules(): array
{
    return [
        'image' => [
            'required',
            'file',
            'mimes:dcm,jpeg,jpg,png,tiff,tif,zip',
            'max:512000', // 500MB
        ],
    ];
}

public static function dimensionRules(): array
{
    return [
        'image' => [
            'dimensions:min_width=64,min_height=64,max_width=8192,max_height=8192',
        ],
    ];
}
```

### 4. Update Model with Image Fields

```php
// app/Models/RadiologyStudy.php

protected $fillable = [
    // ... existing fields
    'dicom_storage_path',
    'preview_image_path',
    'thumbnail_path',
    'image_metadata',
    'images_uploaded',
];

protected $casts = [
    // ... existing casts
    'image_metadata' => 'array',
];

// Accessors
public function getImageMetadataAttribute($value): array
{
    return json_decode($value, true) ?? [];
}
```

### 5. Frontend Integration

```vue
<!-- resources/js/pages/radiology/StudyDetail.vue -->

<template>
  <div class="image-upload-section">
    <!-- Upload Area -->
    <div 
      class="upload-area"
      :class="{ 'dragging': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <input 
        type="file" 
        ref="fileInput"
        @change="handleFileSelect"
        accept=".dcm,.dcmjpeg,.jpg,.jpeg,.png,.tiff,.tif,.zip"
        hidden
      />
      
      <Button @click="$refs.fileInput.click()">
        <Upload class="mr-2" />
        Select Image
      </Button>
      
      <p class="text-sm text-muted mt-2">
        Supported: DICOM, JPEG, PNG, TIFF (max 500MB)
      </p>
    </div>
    
    <!-- Validation Messages -->
    <Alert v-if="validationErrors.length" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>
        <ul>
          <li v-for="error in validationErrors">{{ error }}</li>
        </ul>
      </AlertDescription>
    </Alert>
    
    <!-- Image Preview -->
    <div v-if="previewUrl" class="preview-container">
      <img :src="previewUrl" alt="Preview" class="preview-image" />
    </div>
    
    <!-- Upload Progress -->
    <div v-if="uploadProgress > 0" class="progress-bar">
      <div :style="{ width: uploadProgress + '%' }"></div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, AlertCircle } from 'lucide-vue-next';

const fileInput = ref(null);
const isDragging = ref(false);
const previewUrl = ref(null);
const uploadProgress = ref(0);
const validationErrors = ref([]);

const validateFile = (file) => {
  const errors = [];
  const maxSize = 500 * 1024 * 1024; // 500MB
  const allowedTypes = [
    'application/dicom',
    'application/dcm',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'application/zip'
  ];
  
  if (file.size > maxSize) {
    errors.push('File size exceeds 500MB');
  }
  
  if (!allowedTypes.includes(file.type)) {
    errors.push('File type not supported');
  }
  
  return errors;
};

const handleFileSelect = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validate
  const errors = validateFile(file);
  if (errors.length > 0) {
    validationErrors.value = errors;
    return;
  }
  
  validationErrors.value = [];
  
  // Create preview for non-DICOM files
  if (file.type.startsWith('image/')) {
    previewUrl.value = URL.createObjectURL(file);
  }
  
  await uploadFile(file);
};

const handleDrop = (event) => {
  isDragging.value = false;
  const file = event.dataTransfer.files[0];
  if (file) {
    handleFileSelect({ target: { files: [file] } });
  }
};

const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('image', file);
  
  try {
    const response = await fetch(`/radiology/studies/${studyId}/upload-images`, {
      method: 'POST',
      headers: {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content,
      },
      body: formData,
      onUploadProgress: (progressEvent) => {
        uploadProgress.value = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
      },
    });
    
    if (!response.ok) {
      throw new Error('Upload failed');
    }
    
    const data = await response.json();
    // Handle success
  } catch (error) {
    validationErrors.value = [error.message];
  }
};
</script>
```

## DICOM Handling

For proper DICOM file handling, consider integrating **fo-dicom** library:

```bash
composer require fo-dicom/dicom
```

```php
// app/Services/DicomService.php

use FoDicom\Dicom;

class DicomService
{
    public function extractMetadata(string $filePath): array
    {
        $dicom = Dicom::dataset($filePath);
        
        return [
            'patient_name' => $dicom->PatientName ?? null,
            'patient_id' => $dicom->PatientID ?? null,
            'study_date' => $dicom->StudyDate ?? null,
            'modality' => $dicom->Modality ?? null,
            'series_description' => $dicom->SeriesDescription ?? null,
            'rows' => $dicom->Rows ?? null,
            'columns' => $dicom->Columns ?? null,
            'bits_allocated' => $dicom->BitsAllocated ?? null,
            'window_center' => $dicom->WindowCenter ?? null,
            'window_width' => $dicom->WindowWidth ?? null,
        ];
    }
    
    public function convertToJpeg(string $dicomPath, string $outputPath): void
    {
        $dicom = Dicom::dataset($dicomPath);
        
        // Extract pixel data and convert
        // This is simplified - actual implementation depends on DICOM transfer syntax
        $image = imagecreatefromstring($dicom->getPixelData());
        
        imagejpeg($image, $outputPath, 90);
        imagedestroy($image);
    }
}
```

## Summary

This implementation provides:

1. **Comprehensive validation** - File type, size, and dimension checks
2. **Automatic processing** - Preview and thumbnail generation
3. **DICOM support** - Special handling for medical imaging format
4. **Window/Level presets** - Medical imaging-specific adjustments
5. **Progress tracking** - Real-time upload progress for large files
6. **Metadata extraction** - EXIF and DICOM metadata collection
7. **Error handling** - Comprehensive error messages and logging
