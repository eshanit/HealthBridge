<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RadiologyStudy extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        // CouchDB integration
        'couch_id',
        'couch_rev',
        'couch_updated_at',
        
        // Core identifiers
        'study_uuid',
        'study_instance_uid',
        'accession_number',
        'session_couch_id',
        'patient_cpt',
        
        // Relationships
        'referring_user_id',
        'assigned_radiologist_id',
        
        // Study details
        'modality',
        'body_part',
        'study_type',
        'clinical_indication',
        'clinical_question',
        
        // Status and priority
        'priority',
        'status',
        'procedure_status',
        'procedure_technician_id',
        
        // AI fields
        'ai_priority_score',
        'ai_critical_flag',
        'ai_preliminary_report',
        
        // DICOM
        'dicom_series_count',
        'dicom_storage_path',
        
        // Image fields
        'images_uploaded',
        'preview_image_path',
        'thumbnail_path',
        'image_metadata',
        
        // Timestamps
        'ordered_at',
        'scheduled_at',
        'performed_at',
        'images_available_at',
        'study_completed_at',
        
        // Sync metadata
        'raw_document',
        'synced_at',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'ai_critical_flag' => 'boolean',
        'images_uploaded' => 'boolean',
        'ordered_at' => 'datetime',
        'scheduled_at' => 'datetime',
        'performed_at' => 'datetime',
        'images_available_at' => 'datetime',
        'study_completed_at' => 'datetime',
        'synced_at' => 'datetime',
        'image_metadata' => 'array',
    ];

    /**
     * Valid modalities.
     */
    public const MODALITIES = [
        'CT' => 'Computed Tomography',
        'MRI' => 'Magnetic Resonance Imaging',
        'XRAY' => 'X-Ray',
        'ULTRASOUND' => 'Ultrasound',
        'PET' => 'Positron Emission Tomography',
        'MAMMO' => 'Mammography',
        'FLUORO' => 'Fluoroscopy',
        'ANGIO' => 'Angiography',
    ];

    /**
     * Priority levels.
     */
    public const PRIORITIES = [
        'stat' => 'STAT',
        'urgent' => 'Urgent',
        'routine' => 'Routine',
        'scheduled' => 'Scheduled',
    ];

    /**
     * Study statuses.
     */
    public const STATUSES = [
        'pending' => 'Pending',
        'ordered' => 'Ordered',
        'scheduled' => 'Scheduled',
        'in_progress' => 'In Progress',
        'completed' => 'Completed',
        'interpreted' => 'Interpreted',
        'reported' => 'Reported',
        'amended' => 'Amended',
        'cancelled' => 'Cancelled',
    ];

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

        return $rules;
    }

    /**
     * Validation rules for image upload.
     */
    public static function imageUploadRules(): array
    {
        return [
            'image' => 'required|file|mimes:dcm,dicom,jpeg,jpg,png,tiff,tif,zip|max:512000',
        ];
    }

    /**
     * Check if study can have a report generated.
     */
    public function canGenerateReport(): bool
    {
        return $this->images_uploaded && 
               $this->status !== 'pending' && 
               $this->status !== 'cancelled';
    }

    /**
     * Check if images are required for this study.
     */
    public function requiresImages(): bool
    {
        return in_array($this->status, ['completed', 'interpreted', 'reported']);
    }

    /**
     * Get the patient associated with this study.
     */
    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class, 'patient_cpt', 'cpt');
    }

    /**
     * Get the referring user.
     */
    public function referringUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referring_user_id');
    }

    /**
     * Get the assigned radiologist.
     */
    public function assignedRadiologist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_radiologist_id');
    }

    /**
     * Get the diagnostic reports for this study.
     */
    public function diagnosticReports(): HasMany
    {
        return $this->hasMany(DiagnosticReport::class, 'study_id');
    }

    /**
     * Get the consultations for this study.
     */
    public function consultations(): HasMany
    {
        return $this->hasMany(Consultation::class, 'study_id');
    }

    /**
     * Get the interventional procedures for this study.
     */
    public function interventionalProcedures(): HasMany
    {
        return $this->hasMany(InterventionalProcedure::class);
    }

    /**
     * Scope to filter by status.
     */
    public function scopeStatus($query, $status)
    {
        return $query->where('status', $status);
    }

    /**
     * Scope to filter by priority.
     */
    public function scopePriority($query, $priority)
    {
        return $query->where('priority', $priority);
    }

    /**
     * Scope to filter by modality.
     */
    public function scopeModality($query, $modality)
    {
        return $query->where('modality', $modality);
    }

    /**
     * Scope to filter by assigned radiologist.
     */
    public function scopeAssignedTo($query, $radiologistId)
    {
        return $query->where('assigned_radiologist_id', $radiologistId);
    }

    /**
     * Scope to filter unassigned studies.
     */
    public function scopeUnassigned($query)
    {
        return $query->whereNull('assigned_radiologist_id');
    }

    /**
     * Scope to filter studies with AI critical flag.
     */
    public function scopeCritical($query)
    {
        return $query->where('ai_critical_flag', true);
    }

    /**
     * Get the waiting time in minutes since ordered.
     */
    public function getWaitingTimeAttribute(): int
    {
        if (!$this->ordered_at) {
            return 0;
        }
        
        return $this->ordered_at->diffInMinutes(now());
    }

    /**
     * Check if the study is overdue based on priority.
     */
    public function getIsOverdueAttribute(): bool
    {
        $thresholds = [
            'stat' => 30,      // 30 minutes
            'urgent' => 120,   // 2 hours
            'routine' => 1440, // 24 hours
            'scheduled' => null, // No threshold
        ];

        $threshold = $thresholds[$this->priority] ?? null;
        
        return $threshold !== null && $this->waiting_time > $threshold;
    }

    /**
     * Generate a unique study UUID.
     */
    public static function generateUuid(): string
    {
        return 'RAD-' . date('Y') . '-' . str_pad(random_int(1, 999999), 6, '0', STR_PAD_LEFT);
    }
}
