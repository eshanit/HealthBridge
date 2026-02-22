<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Consultation extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'consultation_uuid',
        'study_id',
        'requesting_user_id',
        'radiologist_id',
        'consultation_type',
        'consultation_category',
        'question',
        'clinical_context',
        'status',
        'first_response_at',
        'answered_at',
        'closed_at',
        'sla_hours',
        'messages',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'first_response_at' => 'datetime',
        'answered_at' => 'datetime',
        'closed_at' => 'datetime',
        'messages' => 'array',
    ];

    /**
     * Consultation types.
     */
    public const CONSULTATION_TYPES = [
        'preliminary' => 'Preliminary',
        'formal' => 'Formal',
        'urgent' => 'Urgent',
        'second_opinion' => 'Second Opinion',
    ];

    /**
     * Consultation statuses.
     */
    public const STATUSES = [
        'pending' => 'Pending',
        'in_progress' => 'In Progress',
        'answered' => 'Answered',
        'closed' => 'Closed',
    ];

    /**
     * Get the study associated with this consultation.
     */
    public function study(): BelongsTo
    {
        return $this->belongsTo(RadiologyStudy::class);
    }

    /**
     * Get the requesting user.
     */
    public function requestingUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requesting_user_id');
    }

    /**
     * Get the assigned radiologist.
     */
    public function radiologist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'radiologist_id');
    }

    /**
     * Scope to filter by status.
     */
    public function scopeStatus($query, $status)
    {
        return $query->where('status', $status);
    }

    /**
     * Scope to filter by consultation type.
     */
    public function scopeType($query, $type)
    {
        return $query->where('consultation_type', $type);
    }

    /**
     * Scope to filter by radiologist.
     */
    public function scopeByRadiologist($query, $radiologistId)
    {
        return $query->where('radiologist_id', $radiologistId);
    }

    /**
     * Scope to filter urgent consultations.
     */
    public function scopeUrgent($query)
    {
        return $query->where('consultation_type', 'urgent');
    }

    /**
     * Scope to filter open consultations.
     */
    public function scopeOpen($query)
    {
        return $query->whereIn('status', ['pending', 'in_progress']);
    }

    /**
     * Generate a unique consultation UUID.
     */
    public static function generateUuid(): string
    {
        return 'CON-' . date('Y') . '-' . str_pad(random_int(1, 999999), 6, '0', STR_PAD_LEFT);
    }

    /**
     * Check if the consultation is overdue.
     */
    public function getIsOverdueAttribute(): bool
    {
        if ($this->closed_at) {
            return false;
        }
        
        $slaEnd = $this->created_at->addHours($this->sla_hours);
        return now()->gt($slaEnd);
    }

    /**
     * Add a message to the consultation.
     */
    public function addMessage(int $senderId, string $content): void
    {
        $messages = $this->messages ?? [];
        $messages[] = [
            'id' => 'msg_' . str_pad(count($messages) + 1, 3, '0', STR_PAD_LEFT),
            'sender_id' => $senderId,
            'content' => $content,
            'timestamp' => now()->toISOString(),
        ];
        $this->update(['messages' => $messages]);
    }

    /**
     * Mark as in progress.
     */
    public function markInProgress(): void
    {
        $this->update(['status' => 'in_progress']);
    }

    /**
     * Mark as answered.
     */
    public function markAnswered(): void
    {
        $this->update([
            'status' => 'answered',
            'answered_at' => now(),
        ]);
    }

    /**
     * Close the consultation.
     */
    public function close(): void
    {
        $this->update(['closed_at' => now()]);
    }
}
