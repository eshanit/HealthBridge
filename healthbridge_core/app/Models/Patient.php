<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Patient extends Model
{
    use HasFactory;

    /**
     * Patient source constants
     */
    public const SOURCE_NURSE_MOBILE = 'nurse_mobile';
    public const SOURCE_GP_MANUAL = 'gp_manual';
    public const SOURCE_IMPORTED = 'imported';

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
        'source',
        'created_by_user_id',
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
     * Get the user who created this patient record.
     */
    public function createdByUser()
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
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
     * Check if patient was synced from nurse_mobile.
     */
    public function isFromNurseMobile(): bool
    {
        return $this->source === self::SOURCE_NURSE_MOBILE;
    }

    /**
     * Check if patient was created manually by GP.
     */
    public function isGpCreated(): bool
    {
        return $this->source === self::SOURCE_GP_MANUAL;
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
     * Scope for patients from a specific source.
     */
    public function scopeFromSource($query, string $source)
    {
        return $query->where('source', $source);
    }

    /**
     * Scope for patients synced from nurse_mobile.
     */
    public function scopeFromNurseMobile($query)
    {
        return $query->where('source', self::SOURCE_NURSE_MOBILE);
    }

    /**
     * Scope for patients created by GP.
     */
    public function scopeGpCreated($query)
    {
        return $query->where('source', self::SOURCE_GP_MANUAL);
    }

    /**
     * Sync patient data from CouchDB document.
     * This is called by SyncService when receiving documents from nurse_mobile.
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
                'source' => self::SOURCE_NURSE_MOBILE, // Always set source when syncing from CouchDB
                'raw_document' => $doc,
                'last_visit_at' => isset($patient['lastVisit']) ? $patient['lastVisit'] : null,
            ]
        );
    }
}
