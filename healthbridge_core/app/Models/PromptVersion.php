<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PromptVersion extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'task',
        'version',
        'content',
        'description',
        'is_active',
        'created_by',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'is_active' => 'boolean',
    ];

    /**
     * Get the user who created this prompt version.
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Scope for active prompts.
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    /**
     * Scope for specific task.
     */
    public function scopeByTask($query, string $task)
    {
        return $query->where('task', $task);
    }

    /**
     * Get the active prompt for a task.
     */
    public static function getActive(string $task): ?self
    {
        return static::where('task', $task)
            ->where('is_active', true)
            ->first();
    }

    /**
     * Activate this prompt version (deactivates others for same task).
     */
    public function activate(): void
    {
        // Deactivate all other versions for this task
        static::where('task', $this->task)
            ->where('id', '!=', $this->id)
            ->update(['is_active' => false]);

        // Activate this one
        $this->update(['is_active' => true]);
    }
}
