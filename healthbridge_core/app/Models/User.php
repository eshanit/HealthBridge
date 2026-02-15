<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Fortify\TwoFactorAuthenticatable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, HasApiTokens, Notifiable, TwoFactorAuthenticatable, HasRoles;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'two_factor_secret',
        'two_factor_recovery_codes',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'two_factor_confirmed_at' => 'datetime',
        ];
    }

    /**
     * Get the AI requests made by this user.
     */
    public function aiRequests()
    {
        return $this->hasMany(AiRequest::class);
    }

    /**
     * Get the referrals made by this user.
     */
    public function referredBy()
    {
        return $this->hasMany(Referral::class, 'referring_user_id');
    }

    /**
     * Get the referrals assigned to this user.
     */
    public function assignedReferrals()
    {
        return $this->hasMany(Referral::class, 'assigned_to_user_id');
    }

    /**
     * Get the case comments by this user.
     */
    public function caseComments()
    {
        return $this->hasMany(CaseComment::class);
    }

    /**
     * Get the prompt versions created by this user.
     */
    public function createdPrompts()
    {
        return $this->hasMany(PromptVersion::class, 'created_by');
    }

    /**
     * Check if user can use AI for a specific task.
     */
    public function canUseAi(string $task): bool
    {
        $policy = config('ai_policy.roles', []);
        $userRoles = $this->roles->pluck('name')->toArray();

        foreach ($userRoles as $role) {
            if (isset($policy[$role]) && in_array($task, $policy[$role])) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get the user's primary role.
     */
    public function primaryRole(): ?string
    {
        return $this->roles->first()?->name;
    }
}
