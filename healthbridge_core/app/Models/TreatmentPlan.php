<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TreatmentPlan extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'plan_uuid',
        'session_couch_id',
        'patient_cpt',
        'created_by',
        'study_id',
        'plan_type',
        'diagnosis',
        'imaging_based_findings',
        'treatment_goals',
        'imaging_milestones',
        'response_criteria',
        'baseline_measurements',
        'status',
        'next_review_date',
        'completed_at',
        'completion_reason',
        'requires_mdt',
        'mdt_scheduled_at',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'imaging_milestones' => 'array',
        'baseline_measurements' => 'array',
        'next_review_date' => 'date',
        'completed_at' => 'datetime',
        'requires_mdt' => 'boolean',
        'mdt_scheduled_at' => 'datetime',
    ];

    /**
     * Plan types.
     */
    public const PLAN_TYPES = [
        'monitoring' => 'Monitoring',
        'therapeutic' => 'Therapeutic',
        'surgical_planning' => 'Surgical Planning',
        'diagnostic' => 'Diagnostic',
    ];

    /**
     * Plan statuses.
     */
    public const STATUSES = [
        'active' => 'Active',
        'completed' => 'Completed',
        'discontinued' => 'Discontinued',
        'on_hold' => 'On Hold',
    ];

    /**
     * Response criteria options.
     */
    public const RESPONSE_CRITERIA = [
        'RECIST' => 'RECIST 1.1',
        'WHO' => 'WHO',
        'iRECIST' => 'iRECIST',
        'mRECIST' => 'mRECIST',
        'RANO' => 'RANO',
        'OTHER' => 'Other',
    ];

    /**
     * Get the patient CPT (for non-Eloquent relationship).
     */
    public function getPatientCptAttribute(): string
    {
        return $this->attributes['patient_cpt'];
    }

    /**
     * Get the study associated with this plan.
     */
    public function study(): BelongsTo
    {
        return $this->belongsTo(RadiologyStudy::class);
    }

    /**
     * Get the user who created the plan.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Scope to filter by status.
     */
    public function scopeStatus($query, $status)
    {
        return $query->where('status', $status);
    }

    /**
     * Scope to filter by plan type.
     */
    public function scopeType($query, $type)
    {
        return $query->where('plan_type', $type);
    }

    /**
     * Scope to filter active plans.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /**
     * Scope to filter plans requiring follow-up.
     */
    public function scopeDueForReview($query)
    {
        return $query->where('status', 'active')
            ->where('next_review_date', '<=', now()->addDays(7));
    }

    /**
     * Scope to filter plans requiring MDT.
     */
    public function scopeRequiresMdt($query)
    {
        return $query->where('requires_mdt', true);
    }

    /**
     * Generate a unique plan UUID.
     */
    public static function generateUuid(): string
    {
        return 'PLAN-' . date('Y') . '-' . str_pad(random_int(1, 999999), 6, '0', STR_PAD_LEFT);
    }

    /**
     * Check if the plan is due for review.
     */
    public function getIsDueForReviewAttribute(): bool
    {
        return $this->status === 'active' && $this->next_review_date && $this->next_review_date->lte(today());
    }

    /**
     * Add an imaging milestone.
     */
    public function addImagingMilestone(array $milestone): void
    {
        $milestones = $this->imaging_milestones ?? [];
        $milestones[] = array_merge($milestone, [
            'id' => 'ms_' . (count($milestones) + 1),
            'created_at' => now()->toISOString(),
        ]);
        $this->update(['imaging_milestones' => $milestones]);
    }

    /**
     * Update baseline measurements.
     */
    public function setBaselineMeasurements(array $measurements): void
    {
        $this->update(['baseline_measurements' => $measurements]);
    }

    /**
     * Complete the plan.
     */
    public function complete(?string $reason = null): void
    {
        $this->update([
            'status' => 'completed',
            'completed_at' => now(),
            'completion_reason' => $reason,
        ]);
    }

    /**
     * Discontinue the plan.
     */
    public function discontinue(string $reason): void
    {
        $this->update([
            'status' => 'discontinued',
            'completed_at' => now(),
            'completion_reason' => $reason,
        ]);
    }

    /**
     * Put on hold.
     */
    public function putOnHold(string $reason): void
    {
        $this->update([
            'status' => 'on_hold',
            'completion_reason' => $reason,
        ]);
    }

    /**
     * Schedule MDT meeting.
     */
    public function scheduleMdt(\Carbon\Carbon $dateTime): void
    {
        $this->update([
            'mdt_scheduled_at' => $dateTime,
            'requires_mdt' => false,
        ]);
    }
}
