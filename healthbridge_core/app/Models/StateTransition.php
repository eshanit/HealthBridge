<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StateTransition extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'session_id',
        'session_couch_id',
        'from_state',
        'to_state',
        'user_id',
        'reason',
        'metadata',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'metadata' => 'array',
    ];

    /**
     * Get the clinical session for this transition.
     */
    public function session()
    {
        return $this->belongsTo(ClinicalSession::class);
    }

    /**
     * Get the user who made the transition.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Scope for transitions by session.
     */
    public function scopeForSession($query, string $sessionCouchId)
    {
        return $query->where('session_couch_id', $sessionCouchId);
    }

    /**
     * Scope for transitions by user.
     */
    public function scopeByUser($query, int $userId)
    {
        return $query->where('user_id', $userId);
    }

    /**
     * Scope for transitions to a specific state.
     */
    public function scopeToState($query, string $state)
    {
        return $query->where('to_state', $state);
    }

    /**
     * Scope for transitions from a specific state.
     */
    public function scopeFromState($query, string $state)
    {
        return $query->where('from_state', $state);
    }

    /**
     * Get the state label for display.
     */
    public function getFromStateLabelAttribute(): string
    {
        return $this->getStateLabel($this->from_state);
    }

    /**
     * Get the state label for display.
     */
    public function getToStateLabelAttribute(): string
    {
        return $this->getStateLabel($this->to_state);
    }

    /**
     * Get human-readable state label.
     */
    protected function getStateLabel(string $state): string
    {
        return match ($state) {
            'NEW' => 'New Patient',
            'TRIAGED' => 'Assessment Completed',
            'REFERRED' => 'Referred',
            'IN_GP_REVIEW' => 'GP Review',
            'UNDER_TREATMENT' => 'Under Treatment',
            'CLOSED' => 'Closed',
            default => $state,
        };
    }

    /**
     * Get the time elapsed since this transition.
     */
    public function getTimeElapsedAttribute(): string
    {
        return $this->created_at->diffForHumans();
    }
}
