<?php

namespace App\Http\Controllers\GP;

use App\Http\Controllers\Controller;
use App\Models\ClinicalSession;
use App\Models\CaseComment;
use App\Services\WorkflowStateMachine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class ClinicalSessionController extends Controller
{
    protected WorkflowStateMachine $stateMachine;

    public function __construct(WorkflowStateMachine $stateMachine)
    {
        $this->stateMachine = $stateMachine;
    }

    /**
     * Display a clinical session.
     */
    public function show(string $couchId): JsonResponse
    {
        $session = ClinicalSession::with([
            'patient',
            'referrals.referredBy',
            'referrals.referredTo',
            'forms',
            'comments.user',
            'aiRequests',
            'stateTransitions.user',
        ])
            ->where('couch_id', $couchId)
            ->firstOrFail();

        return response()->json([
            'session' => $this->formatSession($session),
            'allowed_transitions' => $this->stateMachine->getAllowedTransitions($session),
            'transition_history' => $this->stateMachine->getTransitionHistory($session),
        ]);
    }

    /**
     * Transition a session to a new state.
     */
    public function transition(Request $request, string $couchId): JsonResponse
    {
        $request->validate([
            'to_state' => 'required|string',
            'reason' => 'nullable|string|max:255',
            'metadata' => 'nullable|array',
        ]);

        $session = ClinicalSession::where('couch_id', $couchId)->firstOrFail();

        $toState = $request->to_state;

        // Validate the transition is allowed
        if (!$this->stateMachine->canTransition($session, $toState)) {
            throw ValidationException::withMessages([
                'to_state' => [
                    "Cannot transition from {$session->workflow_state} to {$toState}.",
                ],
            ]);
        }

        // Validate reason if required for this transition
        $validReasons = $this->stateMachine->getValidReasons($session->workflow_state, $toState);
        if (!empty($validReasons) && !$request->reason) {
            throw ValidationException::withMessages([
                'reason' => ['A reason is required for this transition.'],
            ]);
        }

        $transition = $this->stateMachine->transition(
            $session,
            $toState,
            $request->reason,
            $request->metadata ?? []
        );

        return response()->json([
            'message' => 'Session transitioned successfully.',
            'session' => $session->fresh(['patient', 'referrals']),
            'transition' => $transition->load('user'),
        ]);
    }

    /**
     * Start treatment for a session.
     */
    public function startTreatment(Request $request, string $couchId): JsonResponse
    {
        $request->validate([
            'treatment_plan' => 'nullable|string|max:5000',
        ]);

        $session = ClinicalSession::where('couch_id', $couchId)->firstOrFail();

        if (!$this->stateMachine->canTransition($session, ClinicalSession::WORKFLOW_UNDER_TREATMENT)) {
            return response()->json([
                'message' => 'Cannot start treatment in the current state.',
            ], 422);
        }

        $transition = $this->stateMachine->startTreatment(
            $session,
            $request->treatment_plan
        );

        return response()->json([
            'message' => 'Treatment started successfully.',
            'session' => $session->fresh(['patient', 'referrals']),
            'transition' => $transition->load('user'),
        ]);
    }

    /**
     * Request specialist referral.
     */
    public function requestSpecialistReferral(Request $request, string $couchId): JsonResponse
    {
        $request->validate([
            'specialist_type' => 'required|string|max:255',
            'notes' => 'nullable|string|max:1000',
        ]);

        $session = ClinicalSession::where('couch_id', $couchId)->firstOrFail();

        if (!$this->stateMachine->canTransition($session, ClinicalSession::WORKFLOW_REFERRED)) {
            return response()->json([
                'message' => 'Cannot request specialist referral in the current state.',
            ], 422);
        }

        $transition = $this->stateMachine->requestSpecialistReferral(
            $session,
            $request->specialist_type,
            $request->notes
        );

        return response()->json([
            'message' => 'Specialist referral requested.',
            'session' => $session->fresh(['patient', 'referrals']),
            'transition' => $transition->load('user'),
        ]);
    }

    /**
     * Close a session.
     */
    public function close(Request $request, string $couchId): JsonResponse
    {
        $request->validate([
            'reason' => 'required|string|max:255',
            'outcome_notes' => 'nullable|string|max:5000',
            'follow_up_required' => 'nullable|boolean',
            'follow_up_date' => 'nullable|date|after:today',
        ]);

        $session = ClinicalSession::where('couch_id', $couchId)->firstOrFail();

        try {
            $metadata = [
                'outcome_notes' => $request->outcome_notes,
                'follow_up_required' => $request->follow_up_required ?? false,
            ];

            if ($request->follow_up_date) {
                $metadata['follow_up_date'] = $request->follow_up_date;
            }

            $transition = $this->stateMachine->closeSession(
                $session,
                $request->reason,
                $metadata
            );

            // Update the session's completed_at timestamp
            $session->update(['completed_at' => now()]);

            return response()->json([
                'message' => 'Session closed successfully.',
                'session' => $session->fresh(['patient', 'referrals']),
                'transition' => $transition->load('user'),
            ]);
        } catch (\InvalidArgumentException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Add a comment to a session.
     */
    public function addComment(Request $request, string $couchId): JsonResponse
    {
        $request->validate([
            'content' => 'required|string|max:5000',
            'visibility' => 'nullable|string|in:internal,patient_visible',
        ]);

        $session = ClinicalSession::where('couch_id', $couchId)->firstOrFail();

        $comment = CaseComment::create([
            'session_couch_id' => $session->couch_id,
            'user_id' => Auth::id(),
            'content' => $request->content,
            'visibility' => $request->visibility ?? 'internal',
        ]);

        return response()->json([
            'message' => 'Comment added successfully.',
            'comment' => $comment->load('user'),
        ], 201);
    }

    /**
     * Get comments for a session.
     */
    public function getComments(string $couchId): JsonResponse
    {
        $session = ClinicalSession::where('couch_id', $couchId)->firstOrFail();

        $comments = $session->comments()
            ->with('user')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'comments' => $comments,
        ]);
    }

    /**
     * Get the workflow state machine configuration.
     */
    public function getWorkflowConfig(): JsonResponse
    {
        return response()->json([
            'config' => $this->stateMachine->getConfig(),
        ]);
    }

    /**
     * Update the treatment plan for a session.
     */
    public function updateTreatmentPlan(Request $request, string $couchId): JsonResponse
    {
        $request->validate([
            'treatment_plan' => 'required|array',
            'treatment_plan.*.id' => 'required|string',
            'treatment_plan.*.name' => 'required|string|max:255',
            'treatment_plan.*.dose' => 'required|string|max:100',
            'treatment_plan.*.route' => 'required|string|max:50',
            'treatment_plan.*.frequency' => 'required|string|max:100',
            'treatment_plan.*.duration' => 'required|string|max:100',
            'treatment_plan.*.instructions' => 'nullable|string|max:500',
        ]);

        $session = ClinicalSession::where('couch_id', $couchId)->firstOrFail();

        $session->update([
            'treatment_plan' => $request->treatment_plan,
        ]);

        return response()->json([
            'message' => 'Treatment plan updated successfully.',
            'session' => $session->fresh(['patient', 'referrals']),
        ]);
    }

    /**
     * Get the timeline for a session.
     */
    public function timeline(string $couchId): JsonResponse
    {
        $session = ClinicalSession::with([
            'patient',
            'stateTransitions.user',
            'aiRequests',
            'comments.user',
            'forms',
            'referrals',
        ])
            ->where('couch_id', $couchId)
            ->firstOrFail();

        $timeline = collect();

        // Add state transitions
        foreach ($session->stateTransitions as $transition) {
            $timeline->push([
                'id' => "transition_{$transition->id}",
                'type' => 'state_change',
                'title' => "Status changed to {$transition->to_state}",
                'description' => $transition->reason ?? 'No reason provided',
                'user' => $transition->user?->name,
                'timestamp' => $transition->created_at->toIso8601String(),
                'metadata' => $transition->metadata,
            ]);
        }

        // Add AI requests
        foreach ($session->aiRequests as $aiRequest) {
            $timeline->push([
                'id' => "ai_{$aiRequest->id}",
                'type' => 'ai_request',
                'title' => "AI Task: {$aiRequest->task}",
                'description' => "Model: {$aiRequest->model}",
                'user' => null,
                'timestamp' => $aiRequest->requested_at?->toIso8601String() ?? $aiRequest->created_at->toIso8601String(),
                'metadata' => [
                    'task' => $aiRequest->task,
                    'model' => $aiRequest->model,
                    'latency_ms' => $aiRequest->latency_ms,
                ],
            ]);
        }

        // Add comments
        foreach ($session->comments as $comment) {
            $timeline->push([
                'id' => "comment_{$comment->id}",
                'type' => 'comment',
                'title' => 'Case Comment',
                'description' => $comment->content,
                'user' => $comment->user?->name,
                'timestamp' => $comment->created_at->toIso8601String(),
                'metadata' => [
                    'visibility' => $comment->visibility,
                ],
            ]);
        }

        // Add forms
        foreach ($session->forms as $form) {
            $timeline->push([
                'id' => "form_{$form->id}",
                'type' => 'form',
                'title' => "Form: {$form->form_type}",
                'description' => $form->is_complete ? 'Completed' : 'In Progress',
                'user' => null,
                'timestamp' => $form->created_at->toIso8601String(),
                'metadata' => [
                    'form_type' => $form->form_type,
                    'is_complete' => $form->is_complete,
                ],
            ]);
        }

        // Add referrals
        foreach ($session->referrals as $referral) {
            $timeline->push([
                'id' => "referral_{$referral->id}",
                'type' => 'referral',
                'title' => "Referral: {$referral->specialty}",
                'description' => $referral->reason,
                'user' => null,
                'timestamp' => $referral->created_at->toIso8601String(),
                'metadata' => [
                    'status' => $referral->status,
                    'priority' => $referral->priority,
                    'specialty' => $referral->specialty,
                ],
            ]);
        }

        // Sort by timestamp descending
        $timeline = $timeline->sortByDesc('timestamp')->values();

        return response()->json([
            'timeline' => $timeline,
        ]);
    }

    /**
     * Format session for API response.
     */
    protected function formatSession(ClinicalSession $session): array
    {
        return [
            'id' => $session->id,
            'couch_id' => $session->couch_id,
            'session_uuid' => $session->session_uuid,
            'workflow_state' => $session->workflow_state,
            'workflow_state_label' => $session->workflow_state_label,
            'workflow_state_updated_at' => $session->workflow_state_updated_at?->toISOString(),
            'status' => $session->status,
            'stage' => $session->stage,
            'triage_priority' => $session->triage_priority,
            'chief_complaint' => $session->chief_complaint,
            'notes' => $session->notes,
            'created_at' => $session->session_created_at?->toISOString(),
            'updated_at' => $session->session_updated_at?->toISOString(),
            'completed_at' => $session->completed_at?->toISOString(),
            'patient' => $session->patient ? [
                'cpt' => $session->patient->cpt,
                'first_name' => $session->patient->first_name,
                'last_name' => $session->patient->last_name,
                'date_of_birth' => $session->patient->date_of_birth?->toISOString(),
                'age' => $session->patient->date_of_birth?->age,
                'gender' => $session->patient->gender,
                'phone' => $session->patient->phone,
            ] : null,
            'referrals' => $session->referrals->map(function ($referral) {
                return [
                    'id' => $referral->id,
                    'reason' => $referral->reason,
                    'status' => $referral->status,
                    'referred_by' => $referral->referredBy?->name,
                    'referred_to' => $referral->referredTo?->name,
                    'created_at' => $referral->created_at->toISOString(),
                ];
            }),
            'forms' => $session->forms->map(function ($form) {
                return [
                    'id' => $form->id,
                    'form_type' => $form->form_type,
                    'form_data' => $form->form_data,
                    'created_at' => $form->created_at->toISOString(),
                ];
            }),
            'comments' => $session->comments->map(function ($comment) {
                return [
                    'id' => $comment->id,
                    'content' => $comment->content,
                    'visibility' => $comment->visibility,
                    'user' => [
                        'id' => $comment->user?->id,
                        'name' => $comment->user?->name,
                    ],
                    'created_at' => $comment->created_at->toISOString(),
                ];
            }),
            'ai_requests' => $session->aiRequests->map(function ($request) {
                return [
                    'id' => $request->id,
                    'task' => $request->task,
                    'status' => $request->status,
                    'model_used' => $request->model_used,
                    'created_at' => $request->created_at->toISOString(),
                ];
            }),
        ];
    }
}
