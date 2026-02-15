<?php

namespace App\Events;

use App\Models\ClinicalSession;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ReferralCreated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public ClinicalSession $session;

    /**
     * Create a new event instance.
     */
    public function __construct(ClinicalSession $session)
    {
        $this->session = $session;
    }

    /**
     * Get the channels the event should broadcast on.
     *
     * @return array<int, \Illuminate\Broadcasting\Channel>
     */
    public function broadcastOn(): array
    {
        return [
            new PresenceChannel('gp.dashboard'),
            new Channel('referrals'),
        ];
    }

    /**
     * The event's broadcast name.
     */
    public function broadcastAs(): string
    {
        return 'referral.created';
    }

    /**
     * Get the data to broadcast.
     *
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'id' => $this->session->id,
            'couch_id' => $this->session->couch_id,
            'workflow_state' => $this->session->workflow_state,
            'triage_priority' => $this->session->triage_priority,
            'chief_complaint' => $this->session->chief_complaint,
            'patient' => $this->session->patient ? [
                'cpt' => $this->session->patient->cpt,
                'name' => $this->session->patient->full_name,
                'age' => $this->session->patient->date_of_birth?->age,
                'gender' => $this->session->patient->gender,
            ] : null,
            'created_at' => $this->session->session_created_at?->toISOString(),
        ];
    }
}
