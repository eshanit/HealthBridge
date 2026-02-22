<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Prescription extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'uuid',
        'session_couch_id',
        'patient_cpt',
        'prescriber_id',
        'medication_name',
        'dose',
        'route',
        'frequency',
        'duration',
        'instructions',
        'status',
        'dispensed_at',
        'dispensed_by',
    ];

    protected $casts = [
        'dispensed_at' => 'datetime',
    ];

    /**
     * The "booted" method of the model.
     */
    protected static function booted(): void
    {
        static::creating(function (Prescription $prescription) {
            if (empty($prescription->uuid)) {
                $prescription->uuid = (string) Str::uuid();
            }
        });
    }

    /**
     * Get the prescriber (user who wrote the prescription).
     */
    public function prescriber()
    {
        return $this->belongsTo(User::class, 'prescriber_id');
    }

    /**
     * Get the user who dispensed the medication.
     */
    public function dispenser()
    {
        return $this->belongsTo(User::class, 'dispensed_by');
    }

    /**
     * Get the clinical session this prescription belongs to.
     */
    public function clinicalSession()
    {
        return $this->belongsTo(ClinicalSession::class, 'session_couch_id', 'couch_id');
    }

    /**
     * Get the patient this prescription is for.
     */
    public function patient()
    {
        return $this->belongsTo(Patient::class, 'patient_cpt', 'cpt');
    }

    /**
     * Scope to get active prescriptions.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /**
     * Scope to get prescriptions for a specific session.
     */
    public function scopeForSession($query, string $sessionCouchId)
    {
        return $query->where('session_couch_id', $sessionCouchId);
    }

    /**
     * Scope to get prescriptions for a specific patient.
     */
    public function scopeForPatient($query, string $patientCpt)
    {
        return $query->where('patient_cpt', $patientCpt);
    }

    /**
     * Mark the prescription as dispensed.
     */
    public function markAsDispensed(?int $dispensedBy = null): void
    {
        $this->update([
            'status' => 'dispensed',
            'dispensed_at' => now(),
            'dispensed_by' => $dispensedBy ?? auth()->id(),
        ]);
    }

    /**
     * Mark the prescription as cancelled.
     */
    public function markAsCancelled(): void
    {
        $this->update(['status' => 'cancelled']);
    }

    /**
     * Mark the prescription as completed.
     */
    public function markAsCompleted(): void
    {
        $this->update(['status' => 'completed']);
    }

    /**
     * Get the route label.
     */
    public function getRouteLabelAttribute(): string
    {
        return match ($this->route) {
            'oral' => 'Oral',
            'iv' => 'IV (Intravenous)',
            'im' => 'IM (Intramuscular)',
            'sc' => 'SC (Subcutaneous)',
            'topical' => 'Topical',
            'inhalation' => 'Inhalation',
            'nasal' => 'Nasal',
            'rectal' => 'Rectal',
            default => $this->route,
        };
    }

    /**
     * Get the full prescription text.
     */
    public function getFullPrescriptionAttribute(): string
    {
        $parts = [
            $this->medication_name,
            $this->dose,
            $this->route_label,
            $this->frequency,
        ];

        if ($this->duration) {
            $parts[] = "for {$this->duration}";
        }

        if ($this->instructions) {
            $parts[] = "({$this->instructions})";
        }

        return implode(' - ', array_filter($parts));
    }
}
