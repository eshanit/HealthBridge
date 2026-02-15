<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CaseComment extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'session_couch_id',
        'user_id',
        'comment',
        'comment_type',
        'suggested_rule_change',
        'requires_followup',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'requires_followup' => 'boolean',
    ];

    /**
     * Get the session for this comment.
     */
    public function session()
    {
        return $this->belongsTo(ClinicalSession::class, 'session_couch_id', 'couch_id');
    }

    /**
     * Get the user who made the comment.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Scope for clinical comments.
     */
    public function scopeClinical($query)
    {
        return $query->where('comment_type', 'clinical');
    }

    /**
     * Scope for feedback comments.
     */
    public function scopeFeedback($query)
    {
        return $query->where('comment_type', 'feedback');
    }

    /**
     * Scope for flagged comments.
     */
    public function scopeFlagged($query)
    {
        return $query->where('comment_type', 'flag');
    }

    /**
     * Scope for comments requiring followup.
     */
    public function scopeRequiresFollowup($query)
    {
        return $query->where('requires_followup', true);
    }
}
