<?php

namespace App\Observers;

use App\Models\ClinicalSession;
use App\Models\Referral;
use App\Events\ReferralCreated;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

class ClinicalSessionObserver
{
    /**
     * Handle the ClinicalSession "created" event.
     */
    public function created(ClinicalSession $session): void
    {
        // Auto-create referral for RED triage cases
        if ($session->triage_priority === 'red') {
            $this->createUrgentReferral($session);
        }
    }

    /**
     * Handle the ClinicalSession "updated" event.
     */
    public function updated(ClinicalSession $session): void
    {
        // Check if triage_priority changed to red
        if ($session->wasChanged('triage_priority') && $session->triage_priority === 'red') {
            // Check if referral already exists
            $existingReferral = Referral::where('session_couch_id', $session->couch_id)
                ->where('priority', 'red')
                ->exists();

            if (!$existingReferral) {
                $this->createUrgentReferral($session);
            }
        }
    }

    /**
     * Create an urgent referral for RED triage cases.
     */
    protected function createUrgentReferral(ClinicalSession $session): Referral
    {
        $referral = Referral::create([
            'session_couch_id' => $session->couch_id,
            'referring_user_id' => $session->provider_id ?? Auth::id(),
            'assigned_to_role' => 'gp',
            'status' => 'pending',
            'priority' => 'red',
            'specialty' => 'general_practice',
            'reason' => 'Auto-created: RED triage priority - urgent GP review required',
            'clinical_notes' => $session->chief_complaint ?? 'High priority case requiring immediate attention',
            'assigned_at' => now(),
        ]);

        // Log the auto-creation
        Log::info('Auto-created referral for RED triage case', [
            'session_id' => $session->id,
            'session_couch_id' => $session->couch_id,
            'referral_id' => $referral->id,
            'triage_priority' => $session->triage_priority,
        ]);

        // Broadcast the referral created event
        // Note: The session needs to be loaded with patient relationship
        $session->load('patient');
        event(new ReferralCreated($session));

        return $referral;
    }
}
