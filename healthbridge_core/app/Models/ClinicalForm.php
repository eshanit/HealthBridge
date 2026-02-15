<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ClinicalForm extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'couch_id',
        'form_uuid',
        'session_couch_id',
        'patient_cpt',
        'schema_id',
        'schema_version',
        'current_state_id',
        'status',
        'sync_status',
        'answers',
        'calculated',
        'audit_log',
        'form_created_at',
        'form_updated_at',
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
        'answers' => 'array',
        'calculated' => 'array',
        'audit_log' => 'array',
        'raw_document' => 'array',
        'form_created_at' => 'datetime',
        'form_updated_at' => 'datetime',
        'completed_at' => 'datetime',
        'synced_at' => 'datetime',
    ];

    /**
     * Get the session this form belongs to.
     */
    public function session()
    {
        return $this->belongsTo(ClinicalSession::class, 'session_couch_id', 'couch_id');
    }

    /**
     * Get the patient for this form.
     */
    public function patient()
    {
        return $this->belongsTo(Patient::class, 'patient_cpt', 'cpt');
    }

    /**
     * Get the AI requests for this form.
     */
    public function aiRequests()
    {
        return $this->hasMany(AiRequest::class, 'form_couch_id', 'couch_id');
    }

    /**
     * Scope for completed forms.
     */
    public function scopeCompleted($query)
    {
        return $query->where('status', 'completed');
    }

    /**
     * Scope for synced forms.
     */
    public function scopeSynced($query)
    {
        return $query->where('sync_status', 'synced');
    }

    /**
     * Get triage priority from calculated values.
     */
    public function getTriagePriorityAttribute(): string
    {
        return $this->calculated['triagePriority'] ?? 'unknown';
    }

    /**
     * Check if form has danger signs.
     */
    public function hasDangerSign(): bool
    {
        return $this->calculated['hasDangerSign'] ?? false;
    }

    /**
     * Sync form data from CouchDB document.
     */
    public static function syncFromCouch(array $doc): self
    {
        return self::updateOrCreate(
            ['couch_id' => $doc['_id']],
            [
                'form_uuid' => $doc['_id'],
                'session_couch_id' => $doc['sessionId'] ?? null,
                'patient_cpt' => $doc['patientId'] ?? null,
                'schema_id' => $doc['schemaId'] ?? 'unknown',
                'schema_version' => $doc['schemaVersion'] ?? null,
                'current_state_id' => $doc['currentStateId'] ?? null,
                'status' => $doc['status'] ?? 'draft',
                'sync_status' => 'synced',
                'answers' => $doc['answers'] ?? [],
                'calculated' => $doc['calculated'] ?? null,
                'audit_log' => $doc['auditLog'] ?? null,
                'form_created_at' => $doc['createdAt'] ?? null,
                'form_updated_at' => $doc['updatedAt'] ?? null,
                'completed_at' => $doc['completedAt'] ?? null,
                'raw_document' => $doc,
                'synced_at' => now(),
            ]
        );
    }
}
