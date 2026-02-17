<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ClinicalSession extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'couch_id',
        'session_uuid',
        'patient_cpt',
        'created_by_user_id',
        'provider_role',
        'stage',
        'status',
        'workflow_state',
        'workflow_state_updated_at',
        'triage_priority',
        'chief_complaint',
        'notes',
        'treatment_plan',
        'form_instance_ids',
        'session_created_at',
        'session_updated_at',
        'completed_at',
        'synced_at',
        'raw_document',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'form_instance_ids' => 'array',
        'treatment_plan' => 'array',
        'raw_document' => 'array',
        'session_created_at' => 'datetime',
        'session_updated_at' => 'datetime',
        'completed_at' => 'datetime',
        'synced_at' => 'datetime',
        'workflow_state_updated_at' => 'datetime',
    ];

    /**
     * Workflow state constants.
     */
    const WORKFLOW_NEW = 'NEW';
    const WORKFLOW_TRIAGED = 'TRIAGED';
    const WORKFLOW_REFERRED = 'REFERRED';
    const WORKFLOW_IN_GP_REVIEW = 'IN_GP_REVIEW';
    const WORKFLOW_UNDER_TREATMENT = 'UNDER_TREATMENT';
    const WORKFLOW_CLOSED = 'CLOSED';

    /**
     * All valid workflow states.
     */
    public static function getWorkflowStates(): array
    {
        return [
            self::WORKFLOW_NEW,
            self::WORKFLOW_TRIAGED,
            self::WORKFLOW_REFERRED,
            self::WORKFLOW_IN_GP_REVIEW,
            self::WORKFLOW_UNDER_TREATMENT,
            self::WORKFLOW_CLOSED,
        ];
    }

    /**
     * Get the patient for this session.
     */
    public function patient()
    {
        return $this->belongsTo(Patient::class, 'patient_cpt', 'cpt');
    }

    /**
     * Get the user (nurse/frontline worker) who created this session.
     */
    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    /**
     * Get the clinical forms for this session.
     */
    public function forms()
    {
        return $this->hasMany(ClinicalForm::class, 'session_couch_id', 'couch_id');
    }

    /**
     * Get the referrals for this session.
     */
    public function referrals()
    {
        return $this->hasMany(Referral::class, 'session_couch_id', 'couch_id');
    }

    /**
     * Get the case comments for this session.
     */
    public function comments()
    {
        return $this->hasMany(CaseComment::class, 'session_couch_id', 'couch_id');
    }

    /**
     * Get the AI requests for this session.
     */
    public function aiRequests()
    {
        return $this->hasMany(AiRequest::class, 'session_couch_id', 'couch_id');
    }

    /**
     * Scope for open sessions.
     */
    public function scopeOpen($query)
    {
        return $query->where('status', 'open');
    }

    /**
     * Scope for triage priority.
     */
    public function scopeByPriority($query, string $priority)
    {
        return $query->where('triage_priority', $priority);
    }

    /**
     * Scope for red cases.
     */
    public function scopeRed($query)
    {
        return $query->where('triage_priority', 'red');
    }

    /**
     * Get the state transitions for this session.
     */
    public function stateTransitions()
    {
        return $this->hasMany(StateTransition::class, 'session_id');
    }

    /**
     * Scope for workflow state.
     */
    public function scopeByWorkflowState($query, string $state)
    {
        return $query->where('workflow_state', $state);
    }

    /**
     * Scope for sessions in GP review.
     */
    public function scopeInGpReview($query)
    {
        return $query->where('workflow_state', self::WORKFLOW_IN_GP_REVIEW);
    }

    /**
     * Scope for referred sessions.
     */
    public function scopeReferred($query)
    {
        return $query->where('workflow_state', self::WORKFLOW_REFERRED);
    }

    /**
     * Scope for active sessions (not closed).
     */
    public function scopeActive($query)
    {
        return $query->where('workflow_state', '!=', self::WORKFLOW_CLOSED);
    }

    /**
     * Check if session is in a specific workflow state.
     */
    public function isInState(string $state): bool
    {
        return $this->workflow_state === $state;
    }

    /**
     * Check if session is in GP review.
     */
    public function isInGpReview(): bool
    {
        return $this->workflow_state === self::WORKFLOW_IN_GP_REVIEW;
    }

    /**
     * Get human-readable workflow state label.
     */
    public function getWorkflowStateLabelAttribute(): string
    {
        return match ($this->workflow_state) {
            self::WORKFLOW_NEW => 'New Patient',
            self::WORKFLOW_TRIAGED => 'Assessment Completed',
            self::WORKFLOW_REFERRED => 'Referred',
            self::WORKFLOW_IN_GP_REVIEW => 'GP Review',
            self::WORKFLOW_UNDER_TREATMENT => 'Under Treatment',
            self::WORKFLOW_CLOSED => 'Closed',
            default => $this->workflow_state,
        };
    }

    /**
     * Sync session data from CouchDB document.
     */
    public static function syncFromCouch(array $doc): self
    {
        return self::updateOrCreate(
            ['couch_id' => $doc['_id']],
            [
                'session_uuid' => $doc['id'] ?? $doc['_id'],
                'patient_cpt' => $doc['patientCpt'] ?? $doc['patientId'] ?? null,
                'stage' => $doc['stage'] ?? 'registration',
                'status' => $doc['status'] ?? 'open',
                'triage_priority' => $doc['triage'] ?? 'unknown',
                'chief_complaint' => $doc['chiefComplaint'] ?? null,
                'notes' => $doc['notes'] ?? null,
                'form_instance_ids' => $doc['formInstanceIds'] ?? [],
                'session_created_at' => self::parseTimestamp($doc['createdAt'] ?? null),
                'session_updated_at' => self::parseTimestamp($doc['updatedAt'] ?? null),
                'raw_document' => $doc,
                'synced_at' => now(),
            ]
        );
    }

    /**
     * Parse timestamp from CouchDB format.
     */
    protected static function parseTimestamp($value): ?string
    {
        if (!$value) {
            return null;
        }

        // Handle numeric timestamp (milliseconds)
        if (is_numeric($value)) {
            return now()->setTimestampMs($value)->toDateTimeString();
        }

        // Handle ISO string
        return $value;
    }
}
