<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiagnosticReport extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'report_uuid',
        'report_instance_uid',
        'report_version',
        'study_id',
        'radiologist_id',
        'findings',
        'impression',
        'recommendations',
        'report_type',
        'is_locked',
        'ai_findings',
        'ai_impression',
        'ai_generated',
        'critical_findings',
        'critical_communicated',
        'communication_method',
        'communicated_at',
        'communicated_to_user_id',
        'digital_signature',
        'signature_hash',
        'signed_at',
        'amendment_reason',
        'amended_by',
        'amended_at',
        'audit_log',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'ai_generated' => 'boolean',
        'critical_findings' => 'boolean',
        'critical_communicated' => 'boolean',
        'is_locked' => 'boolean',
        'signed_at' => 'datetime',
        'amended_at' => 'datetime',
        'communicated_at' => 'datetime',
        'audit_log' => 'array',
    ];

    /**
     * Report types.
     */
    public const REPORT_TYPES = [
        'preliminary' => 'Preliminary',
        'final' => 'Final',
        'addendum' => 'Addendum',
        'amendment' => 'Amendment',
        'canceled' => 'Canceled',
    ];

    /**
     * Get the study associated with this report.
     */
    public function study(): BelongsTo
    {
        return $this->belongsTo(RadiologyStudy::class);
    }

    /**
     * Get the radiologist who created the report.
     */
    public function radiologist(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the user who the critical findings were communicated to.
     */
    public function communicatedToUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'communicated_to_user_id');
    }

    /**
     * Get the user who amended the report.
     */
    public function amendedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'amended_by');
    }

    /**
     * Scope to filter by report type.
     */
    public function scopeType($query, $type)
    {
        return $query->where('report_type', $type);
    }

    /**
     * Scope to filter finalized reports.
     */
    public function scopeFinal($query)
    {
        return $query->where('report_type', 'final');
    }

    /**
     * Scope to filter preliminary reports.
     */
    public function scopePreliminary($query)
    {
        return $query->where('report_type', 'preliminary');
    }

    /**
     * Scope to filter reports with critical findings.
     */
    public function scopeCritical($query)
    {
        return $query->where('critical_findings', true);
    }

    /**
     * Scope to filter reports by radiologist.
     */
    public function scopeByRadiologist($query, $radiologistId)
    {
        return $query->where('radiologist_id', $radiologistId);
    }

    /**
     * Generate a unique report UUID.
     */
    public static function generateUuid(): string
    {
        return 'RPT-' . date('Y') . '-' . str_pad(random_int(1, 999999), 6, '0', STR_PAD_LEFT);
    }

    /**
     * Check if the report can be edited.
     */
    public function getCanEditAttribute(): bool
    {
        return !$this->is_locked && $this->report_type !== 'canceled';
    }

    /**
     * Check if the report can be signed.
     */
    public function getCanSignAttribute(): bool
    {
        return !$this->signed_at && $this->findings && $this->impression;
    }

    /**
     * Check if the report can be amended.
     */
    public function getCanAmendAttribute(): bool
    {
        return $this->signed_at && !$this->is_locked;
    }

    /**
     * Add an audit log entry.
     */
    public function addAuditLog(string $action, int $userId): void
    {
        $log = $this->audit_log ?? [];
        $log[] = [
            'action' => $action,
            'user_id' => $userId,
            'timestamp' => now()->toISOString(),
        ];
        $this->update(['audit_log' => $log]);
    }

    /**
     * Sign the report.
     */
    public function sign(int $userId, string $signature, string $hash): void
    {
        $this->update([
            'digital_signature' => $signature,
            'signature_hash' => $hash,
            'signed_at' => now(),
            'is_locked' => true,
        ]);
        
        $this->addAuditLog('signed', $userId);
    }

    /**
     * Amend the report.
     */
    public function amend(int $userId, string $reason): void
    {
        $this->update([
            'amendment_reason' => $reason,
            'amended_by' => $userId,
            'amended_at' => now(),
            'report_version' => $this->report_version + 1,
        ]);
        
        $this->addAuditLog('amended', $userId);
    }
}
