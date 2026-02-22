<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InterventionalProcedure extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'procedure_uuid',
        'session_couch_id',
        'patient_cpt',
        'study_id',
        'radiologist_id',
        'referring_user_id',
        'procedure_type',
        'procedure_code',
        'target',
        'indications',
        'technique',
        'status',
        'consent_status',
        'consent_obtained_at',
        'consent_notes',
        'scheduled_at',
        'patient_arrived_at',
        'procedure_started_at',
        'procedure_ended_at',
        'patient_discharged_at',
        'findings',
        'description',
        'complications',
        'equipment_used',
        'post_procedure_orders',
        'dlp_gy_cm',
        'dap_gy_cm2',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'consent_obtained_at' => 'datetime',
        'scheduled_at' => 'datetime',
        'patient_arrived_at' => 'datetime',
        'procedure_started_at' => 'datetime',
        'procedure_ended_at' => 'datetime',
        'patient_discharged_at' => 'datetime',
        'complications' => 'array',
        'equipment_used' => 'array',
        'post_procedure_orders' => 'array',
        'dlp_gy_cm' => 'decimal:2',
        'dap_gy_cm2' => 'decimal:2',
    ];

    /**
     * Procedure statuses.
     */
    public const STATUSES = [
        'scheduled' => 'Scheduled',
        'prep' => 'Preparation',
        'in_progress' => 'In Progress',
        'complete' => 'Complete',
        'cancelled' => 'Cancelled',
    ];

    /**
     * Consent statuses.
     */
    public const CONSENT_STATUSES = [
        'pending' => 'Pending',
        'obtained' => 'Obtained',
        'refused' => 'Refused',
        'waiver' => 'Waiver',
    ];

    /**
     * Get the patient CPT (for non-Eloquent relationship).
     */
    public function getPatientCptAttribute(): string
    {
        return $this->attributes['patient_cpt'];
    }

    /**
     * Get the study associated with this procedure.
     */
    public function study(): BelongsTo
    {
        return $this->belongsTo(RadiologyStudy::class);
    }

    /**
     * Get the radiologist.
     */
    public function radiologist(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the referring user.
     */
    public function referringUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referring_user_id');
    }

    /**
     * Scope to filter by status.
     */
    public function scopeStatus($query, $status)
    {
        return $query->where('status', $status);
    }

    /**
     * Scope to filter by radiologist.
     */
    public function scopeByRadiologist($query, $radiologistId)
    {
        return $query->where('radiologist_id', $radiologistId);
    }

    /**
     * Scope to filter scheduled procedures.
     */
    public function scopeScheduled($query)
    {
        return $query->where('status', 'scheduled');
    }

    /**
     * Scope to filter today's procedures.
     */
    public function scopeToday($query)
    {
        return $query->whereDate('scheduled_at', today());
    }

    /**
     * Generate a unique procedure UUID.
     */
    public static function generateUuid(): string
    {
        return 'PROC-' . date('Y') . '-' . str_pad(random_int(1, 999999), 6, '0', STR_PAD_LEFT);
    }

    /**
     * Mark patient as arrived.
     */
    public function markArrived(): void
    {
        $this->update(['patient_arrived_at' => now()]);
    }

    /**
     * Start the procedure.
     */
    public function start(): void
    {
        $this->update([
            'status' => 'in_progress',
            'procedure_started_at' => now(),
        ]);
    }

    /**
     * Complete the procedure.
     */
    public function complete(array $findings = [], array $complications = []): void
    {
        $this->update([
            'status' => 'complete',
            'procedure_ended_at' => now(),
            'findings' => $findings['findings'] ?? null,
            'description' => $findings['description'] ?? null,
            'complications' => $complications,
        ]);
    }

    /**
     * Cancel the procedure.
     */
    public function cancel(string $reason): void
    {
        $this->update([
            'status' => 'cancelled',
            'consent_notes' => $reason,
        ]);
    }

    /**
     * Record consent.
     */
    public function recordConsent(string $status, ?string $notes = null): void
    {
        $this->update([
            'consent_status' => $status,
            'consent_obtained_at' => $status === 'obtained' ? now() : null,
            'consent_notes' => $notes,
        ]);
    }
}
