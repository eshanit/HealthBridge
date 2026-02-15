<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Referral extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'referral_uuid',
        'session_couch_id',
        'referring_user_id',
        'assigned_to_user_id',
        'assigned_to_role',
        'status',
        'priority',
        'specialty',
        'reason',
        'clinical_notes',
        'rejection_reason',
        'assigned_at',
        'accepted_at',
        'completed_at',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'assigned_at' => 'datetime',
        'accepted_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    /**
     * The "booted" method of the model.
     */
    protected static function booted(): void
    {
        static::creating(function (self $model) {
            if (empty($model->referral_uuid)) {
                $model->referral_uuid = 'ref_' . Str::random(8);
            }
        });
    }

    /**
     * Get the session for this referral.
     */
    public function session()
    {
        return $this->belongsTo(ClinicalSession::class, 'session_couch_id', 'couch_id');
    }

    /**
     * Get the referring user.
     */
    public function referringUser()
    {
        return $this->belongsTo(User::class, 'referring_user_id');
    }

    /**
     * Get the assigned user.
     */
    public function assignedTo()
    {
        return $this->belongsTo(User::class, 'assigned_to_user_id');
    }

    /**
     * Scope for pending referrals.
     */
    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    /**
     * Scope for accepted referrals.
     */
    public function scopeAccepted($query)
    {
        return $query->where('status', 'accepted');
    }

    /**
     * Scope for red priority.
     */
    public function scopeRed($query)
    {
        return $query->where('priority', 'red');
    }

    /**
     * Accept the referral.
     */
    public function accept(int $userId): void
    {
        $this->update([
            'status' => 'accepted',
            'assigned_to_user_id' => $userId,
            'accepted_at' => now(),
        ]);
    }

    /**
     * Reject the referral.
     */
    public function reject(string $reason): void
    {
        $this->update([
            'status' => 'rejected',
            'rejection_reason' => $reason,
        ]);
    }

    /**
     * Complete the referral.
     */
    public function complete(): void
    {
        $this->update([
            'status' => 'completed',
            'completed_at' => now(),
        ]);
    }
}
