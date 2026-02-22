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
        'study_uuid',
        'study_instance_uid',
        'accession_number',
        'session_couch_id',
        'patient_cpt',
        'referring_user_id',
        'assigned_radiologist_id',
        'modality',
        'body_part',
        'study_type',
        'clinical_indication',
        'clinical_question',
        'priority',
        'status',
        'procedure_status',
        'procedure_technician_id',
        'ai_priority_score',
        'ai_critical_flag',
        'ai_preliminary_report',
        'dicom_series_count',
        'dicom_storage_path',
        'ordered_at',
        'scheduled_at',
        'performed_at',
        'images_available_at',
        'study_completed_at',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'ai_critical_flag' => 'boolean',
        'ordered_at' => 'datetime',
        'scheduled_at' => 'datetime',
        'performed_at' => 'datetime',
        'images_available_at' => 'datetime',
        'study_completed_at' => 'datetime',
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
        return $this->hasMany(DiagnosticReport::class);
    }

    /**
     * Get the consultations for this study.
     */
    public function consultations(): HasMany
    {
        return $this->hasMany(Consultation::class);
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
