<?php

namespace App\Events;

use App\Models\ClinicalSession;
use App\Models\StateTransition;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class SessionStateChanged implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public ClinicalSession $session;
    public StateTransition $transition;

    /**
     * Create a new event instance.
     */
    public function __construct(ClinicalSession $session, StateTransition $transition)
    {
        $this->session = $session;
        $this->transition = $transition;
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
            new Channel('sessions.'.$this->session->couch_id),
            new Channel('referrals'),
        ];
    }

    /**
     * The event's broadcast name.
     */
    public function broadcastAs(): string
    {
        return 'session.state_changed';
    }

    /**
     * Get the data to broadcast.
     *
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'session_id' => $this->session->id,
            'couch_id' => $this->session->couch_id,
            'from_state' => $this->transition->from_state,
            'to_state' => $this->transition->to_state,
            'reason' => $this->transition->reason,
            'user' => $this->transition->user?->name,
            'patient' => $this->session->patient ? [
                'cpt' => $this->session->patient->cpt,
                'name' => $this->session->patient->full_name,
            ] : null,
            'timestamp' => $this->transition->created_at->toISOString(),
        ];
    }
}
