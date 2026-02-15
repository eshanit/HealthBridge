<?php

namespace App\Services;

use App\Models\ClinicalSession;
use App\Models\StateTransition;
use App\Events\SessionStateChanged;
use Illuminate\Support\Facades\Auth;
use InvalidArgumentException;

class WorkflowStateMachine
{
    /**
     * Valid state transitions map.
     * Each state maps to an array of allowed next states.
     */
    protected array $transitions = [
        ClinicalSession::WORKFLOW_NEW => [
            ClinicalSession::WORKFLOW_TRIAGED,
        ],
        ClinicalSession::WORKFLOW_TRIAGED => [
            ClinicalSession::WORKFLOW_REFERRED,
            ClinicalSession::WORKFLOW_UNDER_TREATMENT,
            ClinicalSession::WORKFLOW_CLOSED,
        ],
        ClinicalSession::WORKFLOW_REFERRED => [
            ClinicalSession::WORKFLOW_IN_GP_REVIEW,
            ClinicalSession::WORKFLOW_CLOSED,
        ],
        ClinicalSession::WORKFLOW_IN_GP_REVIEW => [
            ClinicalSession::WORKFLOW_UNDER_TREATMENT,
            ClinicalSession::WORKFLOW_REFERRED,
            ClinicalSession::WORKFLOW_CLOSED,
        ],
        ClinicalSession::WORKFLOW_UNDER_TREATMENT => [
            ClinicalSession::WORKFLOW_CLOSED,
            ClinicalSession::WORKFLOW_IN_GP_REVIEW,
        ],
        ClinicalSession::WORKFLOW_CLOSED => [],
    ];

    /**
     * Transition reasons map.
     * Defines valid reasons for each transition.
     */
    protected array $transitionReasons = [
        'NEW->TRIAGED' => ['assessment_completed', 'vitals_recorded'],
        'TRIAGED->REFERRED' => ['specialist_needed', 'gp_consultation_required', 'complex_case'],
        'TRIAGED->UNDER_TREATMENT' => ['treatment_started', 'medication_prescribed'],
        'TRIAGED->CLOSED' => ['patient_discharged', 'referred_externally'],
        'REFERRED->IN_GP_REVIEW' => ['gp_accepted', 'review_started'],
        'REFERRED->CLOSED' => ['referral_cancelled', 'patient_no_show'],
        'IN_GP_REVIEW->UNDER_TREATMENT' => ['treatment_plan_created', 'medication_started'],
        'IN_GP_REVIEW->REFERRED' => ['specialist_referral', 'secondary_consultation'],
        'IN_GP_REVIEW->CLOSED' => ['treatment_completed', 'patient_discharged'],
        'UNDER_TREATMENT->CLOSED' => ['treatment_completed', 'patient_recovered'],
        'UNDER_TREATMENT->IN_GP_REVIEW' => ['follow_up_needed', 'complication_detected'],
    ];

    /**
     * Transition a session to a new state.
     *
     * @param ClinicalSession $session
     * @param string $newState
     * @param string|null $reason
     * @param array $metadata
     * @return StateTransition
     * @throws InvalidArgumentException
     */
    public function transition(
        ClinicalSession $session,
        string $newState,
        ?string $reason = null,
        array $metadata = []
    ): StateTransition {
        $currentState = $session->workflow_state;

        // Validate the transition
        if (!$this->canTransition($session, $newState)) {
            throw new InvalidArgumentException(
                "Invalid transition from {$currentState} to {$newState}"
            );
        }

        // Create the transition record
        $transition = StateTransition::create([
            'session_id' => $session->id,
            'session_couch_id' => $session->couch_id,
            'from_state' => $currentState,
            'to_state' => $newState,
            'user_id' => Auth::id(),
            'reason' => $reason,
            'metadata' => $metadata,
        ]);

        // Update the session state
        $session->update([
            'workflow_state' => $newState,
            'workflow_state_updated_at' => now(),
        ]);

        // Broadcast the state change event
        event(new SessionStateChanged($session, $transition));

        return $transition;
    }

    /**
     * Check if a session can transition to a new state.
     *
     * @param ClinicalSession $session
     * @param string $newState
     * @return bool
     */
    public function canTransition(ClinicalSession $session, string $newState): bool
    {
        $currentState = $session->workflow_state;

        // Check if the new state is valid
        if (!in_array($newState, ClinicalSession::getWorkflowStates())) {
            return false;
        }

        // Check if the transition is allowed
        $allowedTransitions = $this->transitions[$currentState] ?? [];

        return in_array($newState, $allowedTransitions);
    }

    /**
     * Get all allowed transitions for a session.
     *
     * @param ClinicalSession $session
     * @return array
     */
    public function getAllowedTransitions(ClinicalSession $session): array
    {
        $currentState = $session->workflow_state;

        return $this->transitions[$currentState] ?? [];
    }

    /**
     * Get valid reasons for a transition.
     *
     * @param string $fromState
     * @param string $toState
     * @return array
     */
    public function getValidReasons(string $fromState, string $toState): array
    {
        $key = "{$fromState}->{$toState}";

        return $this->transitionReasons[$key] ?? [];
    }

    /**
     * Accept a referral (transition from REFERRED to IN_GP_REVIEW).
     *
     * @param ClinicalSession $session
     * @param string|null $notes
     * @return StateTransition
     */
    public function acceptReferral(ClinicalSession $session, ?string $notes = null): StateTransition
    {
        return $this->transition(
            $session,
            ClinicalSession::WORKFLOW_IN_GP_REVIEW,
            'gp_accepted',
            ['notes' => $notes]
        );
    }

    /**
     * Reject a referral (transition from REFERRED to CLOSED).
     *
     * @param ClinicalSession $session
     * @param string $reason
     * @param string|null $notes
     * @return StateTransition
     */
    public function rejectReferral(
        ClinicalSession $session,
        string $reason,
        ?string $notes = null
    ): StateTransition {
        return $this->transition(
            $session,
            ClinicalSession::WORKFLOW_CLOSED,
            $reason,
            ['notes' => $notes, 'referral_rejected' => true]
        );
    }

    /**
     * Start treatment (transition from IN_GP_REVIEW to UNDER_TREATMENT).
     *
     * @param ClinicalSession $session
     * @param string|null $treatmentPlan
     * @return StateTransition
     */
    public function startTreatment(ClinicalSession $session, ?string $treatmentPlan = null): StateTransition
    {
        return $this->transition(
            $session,
            ClinicalSession::WORKFLOW_UNDER_TREATMENT,
            'treatment_plan_created',
            ['treatment_plan' => $treatmentPlan]
        );
    }

    /**
     * Close a session.
     *
     * @param ClinicalSession $session
     * @param string $reason
     * @param array $metadata
     * @return StateTransition
     */
    public function closeSession(
        ClinicalSession $session,
        string $reason,
        array $metadata = []
    ): StateTransition {
        // Check if we can close from current state
        if (!$this->canTransition($session, ClinicalSession::WORKFLOW_CLOSED)) {
            // Some states need to go through intermediate states first
            throw new InvalidArgumentException(
                "Cannot close session from state {$session->workflow_state}. " .
                "Please transition to a valid state first."
            );
        }

        return $this->transition(
            $session,
            ClinicalSession::WORKFLOW_CLOSED,
            $reason,
            array_merge($metadata, ['closed_at' => now()->toIso8601String()])
        );
    }

    /**
     * Request specialist referral (transition from IN_GP_REVIEW to REFERRED).
     *
     * @param ClinicalSession $session
     * @param string $specialistType
     * @param string|null $notes
     * @return StateTransition
     */
    public function requestSpecialistReferral(
        ClinicalSession $session,
        string $specialistType,
        ?string $notes = null
    ): StateTransition {
        return $this->transition(
            $session,
            ClinicalSession::WORKFLOW_REFERRED,
            'specialist_referral',
            [
                'specialist_type' => $specialistType,
                'notes' => $notes,
            ]
        );
    }

    /**
     * Get the transition history for a session.
     *
     * @param ClinicalSession $session
     * @return \Illuminate\Database\Eloquent\Collection
     */
    public function getTransitionHistory(ClinicalSession $session)
    {
        return $session->stateTransitions()->with('user')->orderBy('created_at')->get();
    }

    /**
     * Get the last transition for a session.
     *
     * @param ClinicalSession $session
     * @return StateTransition|null
     */
    public function getLastTransition(ClinicalSession $session): ?StateTransition
    {
        return $session->stateTransitions()->latest()->first();
    }

    /**
     * Check if a session is in a final state.
     *
     * @param ClinicalSession $session
     * @return bool
     */
    public function isInFinalState(ClinicalSession $session): bool
    {
        return $session->workflow_state === ClinicalSession::WORKFLOW_CLOSED;
    }

    /**
     * Get state machine configuration for frontend.
     *
     * @return array
     */
    public function getConfig(): array
    {
        return [
            'states' => ClinicalSession::getWorkflowStates(),
            'transitions' => $this->transitions,
            'transition_reasons' => $this->transitionReasons,
        ];
    }
}
