<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class AiRequest extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'request_uuid',
        'user_id',
        'role',
        'session_couch_id',
        'form_couch_id',
        'form_section_id',
        'form_field_id',
        'form_schema_id',
        'patient_cpt',
        'task',
        'use_case',
        'prompt_version',
        'triage_ruleset_version',
        'input_hash',
        'prompt',
        'response',
        'safe_output',
        'model',
        'model_version',
        'latency_ms',
        'was_overridden',
        'risk_flags',
        'blocked_phrases',
        'override_reason',
        'requested_at',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'was_overridden' => 'boolean',
        'risk_flags' => 'array',
        'blocked_phrases' => 'array',
        'requested_at' => 'datetime',
    ];

    /**
     * The "booted" method of the model.
     */
    protected static function booted(): void
    {
        static::creating(function (self $model) {
            if (empty($model->request_uuid)) {
                $model->request_uuid = (string) Str::uuid();
            }
        });
    }

    /**
     * Get the user that made the request.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the session for this request.
     */
    public function session()
    {
        return $this->belongsTo(ClinicalSession::class, 'session_couch_id', 'couch_id');
    }

    /**
     * Get the form for this request.
     */
    public function form()
    {
        return $this->belongsTo(ClinicalForm::class, 'form_couch_id', 'couch_id');
    }

    /**
     * Scope for specific task.
     */
    public function scopeByTask($query, string $task)
    {
        return $query->where('task', $task);
    }

    /**
     * Scope for requests with risk flags.
     */
    public function scopeWithRiskFlags($query)
    {
        return $query->whereNotNull('risk_flags')->where('risk_flags', '!=', '[]');
    }

    /**
     * Scope for overridden requests.
     */
    public function scopeOverridden($query)
    {
        return $query->where('was_overridden', true);
    }

    /**
     * Scope for specific form section.
     */
    public function scopeByFormSection($query, string $sectionId)
    {
        return $query->where('form_section_id', $sectionId);
    }

    /**
     * Scope for specific form schema.
     */
    public function scopeByFormSchema($query, string $schemaId)
    {
        return $query->where('form_schema_id', $schemaId);
    }

    /**
     * Scope for requests in a specific session.
     */
    public function scopeBySession($query, string $sessionId)
    {
        return $query->where('session_couch_id', $sessionId);
    }

    /**
     * Sync AI log from CouchDB document.
     */
    public static function syncFromCouch(array $doc): self
    {
        return self::updateOrCreate(
            ['request_uuid' => $doc['_id']],
            [
                'session_couch_id' => $doc['sessionId'] ?? null,
                'form_couch_id' => $doc['formInstanceId'] ?? null,
                'form_section_id' => $doc['formSectionId'] ?? $doc['sectionId'] ?? null,
                'form_field_id' => $doc['formFieldId'] ?? $doc['fieldId'] ?? null,
                'form_schema_id' => $doc['formSchemaId'] ?? $doc['schemaId'] ?? null,
                'task' => $doc['task'] ?? null,
                'use_case' => $doc['useCase'] ?? null,
                'prompt_version' => $doc['promptVersion'] ?? null,
                'input_hash' => $doc['promptHash'] ?? null,
                'prompt' => $doc['prompt'] ?? null,
                'response' => $doc['output'] ?? null,
                'model' => $doc['model'] ?? null,
                'model_version' => $doc['modelVersion'] ?? null,
                'latency_ms' => $doc['latencyMs'] ?? null,
                'was_overridden' => $doc['wasOverridden'] ?? false,
                'risk_flags' => $doc['riskFlags'] ?? null,
                'requested_at' => $doc['createdAt'] ?? now(),
            ]
        );
    }
}
