<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Patient extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'couch_id',
        'cpt',
        'first_name',
        'last_name',
        'short_code',
        'external_id',
        'date_of_birth',
        'age_months',
        'gender',
        'weight_kg',
        'phone',
        'visit_count',
        'is_active',
        'raw_document',
        'last_visit_at',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'date_of_birth' => 'date',
        'weight_kg' => 'decimal:2',
        'visit_count' => 'integer',
        'is_active' => 'boolean',
        'raw_document' => 'array',
        'last_visit_at' => 'datetime',
    ];

    /**
     * Get the clinical sessions for this patient.
     */
    public function sessions()
    {
        return $this->hasMany(ClinicalSession::class, 'patient_cpt', 'cpt');
    }

    /**
     * Get the latest clinical session for this patient.
     */
    public function latestSession()
    {
        return $this->hasOne(ClinicalSession::class, 'patient_cpt', 'cpt')
            ->latest('session_created_at');
    }

    /**
     * Get the patient's full name.
     */
    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    /**
     * Get the patient's age.
     */
    public function getAgeAttribute(): ?int
    {
        return $this->date_of_birth?->age;
    }

    /**
     * Calculate age in months from date of birth.
     */
    public function calculateAgeMonths(): ?int
    {
        if (!$this->date_of_birth) {
            return null;
        }

        return $this->date_of_birth->diffInMonths(now());
    }

    /**
     * Scope for active patients.
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    /**
     * Scope for searching by name or CPT.
     */
    public function scopeSearch($query, string $term)
    {
        return $query->where(function ($q) use ($term) {
            $q->where('cpt', 'like', "%{$term}%")
                ->orWhere('first_name', 'like', "%{$term}%")
                ->orWhere('last_name', 'like', "%{$term}%")
                ->orWhere('phone', 'like', "%{$term}%");
        });
    }

    /**
     * Sync patient data from CouchDB document.
     */
    public static function syncFromCouch(array $doc): self
    {
        $patient = $doc['patient'] ?? $doc;

        return self::updateOrCreate(
            ['couch_id' => $doc['_id']],
            [
                'cpt' => $patient['cpt'] ?? $patient['id'] ?? null,
                'first_name' => $patient['firstName'] ?? $patient['first_name'] ?? null,
                'last_name' => $patient['lastName'] ?? $patient['last_name'] ?? null,
                'short_code' => $patient['shortCode'] ?? null,
                'external_id' => $patient['externalId'] ?? null,
                'date_of_birth' => $patient['dateOfBirth'] ?? null,
                'age_months' => $patient['ageMonths'] ?? null,
                'gender' => $patient['gender'] ?? null,
                'weight_kg' => $patient['weightKg'] ?? null,
                'phone' => $patient['phone'] ?? null,
                'visit_count' => $patient['visitCount'] ?? 1,
                'is_active' => $patient['isActive'] ?? true,
                'raw_document' => $doc,
                'last_visit_at' => isset($patient['lastVisit']) ? $patient['lastVisit'] : null,
            ]
        );
    }
}
