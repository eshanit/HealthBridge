# Radiology Study Image Upload Validation Implementation

## Overview

This document outlines the implementation strategy for adding image upload validation to the RadiologyStudy workflow in HealthBridge. The solution supports multiple workflows:

1. **Pending Imaging**: Create study records before images are captured
2. **Upload During Creation**: Upload images at the time of study creation
3. **Post-Creation Upload**: Upload images after the study record is created

## Current Model Analysis

The `RadiologyStudy` model already has relevant fields:

```php
// Existing fields in $fillable
'dicom_series_count',    // Number of DICOM series
'dicom_storage_path',   // Path to DICOM files

// Timestamps
'images_available_at',  // When images became available
'study_completed_at',   // When study was completed

// Statuses
'pending'           // Study created, awaiting imaging
'ordered'           // Study ordered
'in_progress'       // Currently being performed
'completed'         // Imaging complete
'reported'          // Report finalized
```

## Implementation Strategy

### 1. Add Image Upload Status Field

Add a boolean field to track whether images have been uploaded:

```php
// In the fillable array, add:
'images_uploaded',  // boolean - true when DICOM images are received
```

### 2. Model Validation Rules

Add custom validation methods to the RadiologyStudy model:

```php
// app/Models/RadiologyStudy.php

/**
 * Validation rules for study creation.
 */
public static function creationRules(bool $requireImage = false): array
{
    $rules = [
        'patient_cpt' => 'required|string|exists:patients,cpt',
        'modality' => 'required|in:' . implode(',', array_keys(self::MODALITIES)),
        'body_part' => 'required|string|max:100',
        'study_type' => 'required|string|max:255',
        'clinical_indication' => 'required|string|max:1000',
        'priority' => 'nullable|in:stat,urgent,routine,scheduled',
    ];

    // Conditionally require image upload
    if ($requireImage) {
        $rules['dicom_file'] = 'required|file|mimes:dcm,zip|max:512000';
    }

    return $rules;
}

/**
 * Validation rules for image upload.
 */
public static function imageUploadRules(): array
{
    return [
        'dicom_file' => 'required|file|mimes:dcm,zip|max:512000',
    ];
}

/**
 * Check if study can have a report generated.
 */
public function canGenerateReport(): bool
{
    // Report can only be generated after images are uploaded
    return $this->images_uploaded && 
           $this->status !== 'pending' && 
           $this->status !== 'cancelled';
}

/**
 * Check if images are required for this study.
 */
public function requiresImages(): bool
{
    // Images are required for studies in these statuses
    return in_array($this->status, ['completed', 'interpreted', 'reported']);
}
```

### 3. Controller Implementation

Update the RadiologyController to handle image uploads:

```php
// app/Http/Controllers/Radiology/RadiologyController.php

/**
 * Create a new study (with optional image upload).
 */
public function createStudy(Request $request)
{
    // Check if we should require image upload
    $requireImage = $request->boolean('require_image', false);
    
    $validated = $request->validate(RadiologyStudy::creationRules($requireImage));
    
    $user = Auth::user();
    
    // Handle image upload if provided
    $dicomPath = null;
    $seriesCount = 0;
    
    if ($request->hasFile('dicom_file')) {
        $dicomPath = $this->handleDicomUpload($request->file('dicom_file'));
        $seriesCount = $this->countDicomSeries($dicomPath);
    }
    
    $study = RadiologyStudy::create([
        'study_uuid' => RadiologyStudy::generateUuid(),
        'patient_cpt' => $validated['patient_cpt'],
        'assigned_radiologist_id' => $user->id,
        'modality' => $validated['modality'],
        'body_part' => $validated['body_part'],
        'study_type' => $validated['study_type'],
        'clinical_indication' => $validated['clinical_indication'],
        'clinical_question' => $validated['clinical_question'] ?? null,
        'priority' => $validated['priority'] ?? 'routine',
        'status' => $dicomPath ? 'in_progress' : 'pending',
        'ordered_at' => now(),
        
        // Image-related fields
        'dicom_storage_path' => $dicomPath,
        'dicom_series_count' => $seriesCount,
        'images_uploaded' => !is_null($dicomPath),
        'images_available_at' => $dicomPath ? now() : null,
    ]);

    return response()->json([
        'message' => 'Study created successfully',
        'study' => $study,
        'image_status' => $dicomPath ? 'uploaded' : 'pending',
    ], 201);
}

/**
 * Upload images for an existing study.
 */
public function uploadImages(Request $request, string $studyId)
{
    $study = RadiologyStudy::findOrFail($studyId);
    
    // Check if images already exist
    if ($study->images_uploaded) {
        return response()->json([
            'message' => 'Images already uploaded for this study',
            'error' => 'Cannot overwrite existing images',
        ], 422);
    }
    
    $validated = $request->validate(RadiologyStudy::imageUploadRules());
    
    // Handle the DICOM upload
    $dicomPath = $this->handleDicomUpload($request->file('dicom_file'));
    $seriesCount = $this->countDicomSeries($dicomPath);
    
    $study->update([
        'dicom_storage_path' => $dicomPath,
        'dicom_series_count' => $seriesCount,
        'images_uploaded' => true,
        'images_available_at' => now(),
        'status' => 'in_progress', // Move to in_progress when images arrive
    ]);
    
    return response()->json([
        'message' => 'Images uploaded successfully',
        'study' => $study->fresh(),
    ]);
}

/**
 * Handle DICOM file upload.
 */
protected function handleDicomUpload(UploadedFile $file): string
{
    $path = $file->store('dicom/' . date('Y/m'), 'public');
    return $path;
}

/**
 * Count DICOM series in uploaded file.
 */
protected function countDicomSeries(string $path): int
{
    // In production, this would parse the DICOM file
    // For now, return a placeholder
    return 1;
}
```

### 4. API Routes

Add new routes for image upload:

```php
// routes/radiology.php

Route::post('/studies', [RadiologyController::class, 'createStudy'])->name('studies.create');
Route::post('/studies/{studyId}/upload-images', [RadiologyController::class, 'uploadImages'])->name('studies.upload');
Route::get('/studies/{studyId}', [RadiologyController::class, 'showStudy'])->name('studies.show');
```

### 5. Business Logic - Status Transitions

Add model scope methods to control when images are required:

```php
// app/Models/RadiologyStudy.php

/**
 * Scope to get studies that need images.
 */
public function scopeNeedsImages($query)
{
    return $query->where('images_uploaded', false)
                 ->whereIn('status', ['ordered', 'scheduled']);
}

/**
 * Scope to get studies with uploaded images.
 */
public function scopeWithImages($query)
{
    return $query->where('images_uploaded', true);
}

/**
 * Validate status transition.
 */
public function transitionTo(string $newStatus): bool
{
    $allowedTransitions = [
        'pending' => ['ordered', 'scheduled', 'cancelled'],
        'ordered' => ['scheduled', 'in_progress', 'cancelled'],
        'scheduled' => ['in_progress', 'cancelled'],
        'in_progress' => ['completed', 'cancelled'],
        'completed' => ['interpreted', 'cancelled'],
        'interpreted' => ['reported', 'amended'],
        'reported' => ['amended'],
        'amended' => [], // No transitions from amended
    ];
    
    // Require images before moving to completed
    if ($newStatus === 'completed' && !$this->images_uploaded) {
        return false;
    }
    
    // Require images before moving to interpreted
    if ($newStatus === 'interpreted' && !$this->images_uploaded) {
        return false;
    }
    
    return in_array($newStatus, $allowedTransitions[$this->status] ?? []);
}
```

### 6. UI Workflow Suggestions

#### Workflow 1: Create Study Without Images (Pending)

```
1. User clicks "New Study"
2. Form displays with fields: Patient CPT, Modality, Body Part, etc.
3. "Upload Images" checkbox (unchecked by default)
4. If unchecked: Study is created with status="pending"
5. Study appears in "Pending Imaging" section of worklist
```

#### Workflow 2: Create Study With Images

```
1. User clicks "New Study"
2. Form displays with file upload option
3. User fills in details AND uploads DICOM file
4. Submit creates study with status="in_progress" and images_uploaded=true
5. Study appears in main worklist ready for interpretation
```

#### Workflow 3: Upload Images Later

```
1. User clicks on pending study in worklist
2. Study Detail page shows "Images Required" banner
3. User clicks "Upload Images" button
4. File picker opens for DICOM selection
5. After upload, study status changes to "in_progress"
```

### 7. Database Migration

```php
// database/migrations/xxxx_xx_xx_add_images_uploaded_to_radiology_studies.php

public function up()
{
    Schema::table('radiology_studies', function (Blueprint $table) {
        $table->boolean('images_uploaded')->default(false)->after('dicom_series_count');
        $table->index(['images_uploaded', 'status']);
    });
}

public function down()
{
    Schema::table('radiology_studies', function (Blueprint $table) {
        $table->dropColumn('images_uploaded');
    });
}
```

## Summary

This implementation provides:

1. **Flexible Creation**: Studies can be created with or without images
2. **Status Control**: Images are required before moving to "completed" or "interpreted" status
3. **Post-Creation Uploads**: Pending studies can receive images later
4. **Validation**: Clear rules for when images are required
5. **Audit Trail**: Track when images were uploaded via `images_available_at`

The solution maintains backward compatibility with existing workflows while adding the necessary validation for medical imaging compliance.
