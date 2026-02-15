<?php

namespace App\Http\Controllers\GP;

use App\Http\Controllers\Controller;
use App\Models\ClinicalSession;
use App\Models\Patient;
use App\Models\Referral;
use App\Services\WorkflowStateMachine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class GPDashboardController extends Controller
{
    protected WorkflowStateMachine $stateMachine;

    public function __construct(WorkflowStateMachine $stateMachine)
    {
        $this->stateMachine = $stateMachine;
    }

    /**
     * Display the GP dashboard.
     */
    public function index(): Response
    {
        $user = auth()->user();

        // Get statistics for dashboard cards
        $stats = [
            'pending_referrals' => ClinicalSession::referred()->count(),
            'in_review' => ClinicalSession::inGpReview()->whereHas('referrals', function ($query) use ($user) {
                $query->where('assigned_to_user_id', $user->id);
            })->count(),
            'under_treatment' => ClinicalSession::byWorkflowState(ClinicalSession::WORKFLOW_UNDER_TREATMENT)
                ->whereHas('referrals', function ($query) use ($user) {
                    $query->where('assigned_to_user_id', $user->id);
                })->count(),
            'completed_today' => ClinicalSession::where('workflow_state', ClinicalSession::WORKFLOW_CLOSED)
                ->whereDate('workflow_state_updated_at', today())
                ->whereHas('referrals', function ($query) use ($user) {
                    $query->where('assigned_to_user_id', $user->id);
                })->count(),
        ];

        // Get recent referrals queue
        $recentReferrals = ClinicalSession::with(['patient', 'referrals'])
            ->referred()
            ->orderBy('workflow_state_updated_at', 'desc')
            ->limit(10)
            ->get()
            ->map(function ($session) {
                return $this->formatSessionForDashboard($session);
            });

        // Get urgent cases (red triage)
        $urgentCases = ClinicalSession::with(['patient', 'referrals'])
            ->where(function ($query) {
                $query->referred()
                    ->orWhereIn('workflow_state', [
                        ClinicalSession::WORKFLOW_IN_GP_REVIEW,
                        ClinicalSession::WORKFLOW_UNDER_TREATMENT,
                    ]);
            })
            ->red()
            ->orderBy('workflow_state_updated_at', 'desc')
            ->limit(5)
            ->get()
            ->map(function ($session) {
                return $this->formatSessionForDashboard($session);
            });

        return Inertia::render('gp/Dashboard', [
            'stats' => $stats,
            'recentReferrals' => $recentReferrals,
            'urgentCases' => $urgentCases,
        ]);
    }

    /**
     * Get the referral queue.
     */
    public function referralQueue(Request $request): Response
    {
        $query = ClinicalSession::with(['patient', 'referrals'])
            ->referred()
            ->orderBy('workflow_state_updated_at', 'desc');

        // Filter by priority if provided
        if ($request->has('priority')) {
            $query->byPriority($request->priority);
        }

        // Filter by search term
        if ($request->has('search')) {
            $search = $request->search;
            $query->whereHas('patient', function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('cpt', 'like', "%{$search}%");
            });
        }

        $referrals = $query->paginate(20)->through(function ($session) {
            return $this->formatSessionForDashboard($session);
        });

        return Inertia::render('gp/ReferralQueue', [
            'referrals' => $referrals,
            'filters' => $request->only(['priority', 'search']),
        ]);
    }

    /**
     * Get a single referral details.
     */
    public function showReferral(string $couchId): JsonResponse
    {
        $session = ClinicalSession::with([
            'patient',
            'referrals',
            'forms',
            'comments.user',
            'aiRequests',
            'stateTransitions.user',
        ])
            ->where('couch_id', $couchId)
            ->firstOrFail();

        // Get allowed transitions
        $allowedTransitions = $this->stateMachine->getAllowedTransitions($session);

        // Get transition history
        $transitionHistory = $this->stateMachine->getTransitionHistory($session);

        return response()->json([
            'session' => $this->formatSessionDetail($session),
            'allowed_transitions' => $allowedTransitions,
            'transition_history' => $transitionHistory,
            'workflow_config' => $this->stateMachine->getConfig(),
        ]);
    }

    /**
     * Accept a referral.
     */
    public function acceptReferral(Request $request, string $couchId): JsonResponse
    {
        $request->validate([
            'notes' => 'nullable|string|max:1000',
        ]);

        $session = ClinicalSession::where('couch_id', $couchId)->firstOrFail();

        if (!$this->stateMachine->canTransition($session, ClinicalSession::WORKFLOW_IN_GP_REVIEW)) {
            return response()->json([
                'message' => 'This referral cannot be accepted in its current state.',
            ], 422);
        }

        $transition = $this->stateMachine->acceptReferral(
            $session,
            $request->notes
        );

        return response()->json([
            'message' => 'Referral accepted successfully.',
            'session' => $session->fresh(['patient', 'referrals']),
            'transition' => $transition,
        ]);
    }

    /**
     * Reject a referral.
     */
    public function rejectReferral(Request $request, string $couchId): JsonResponse
    {
        $request->validate([
            'reason' => 'required|string|in:referral_cancelled,patient_no_show,invalid_referral',
            'notes' => 'nullable|string|max:1000',
        ]);

        $session = ClinicalSession::where('couch_id', $couchId)->firstOrFail();

        if (!$this->stateMachine->canTransition($session, ClinicalSession::WORKFLOW_CLOSED)) {
            return response()->json([
                'message' => 'This referral cannot be rejected in its current state.',
            ], 422);
        }

        $transition = $this->stateMachine->rejectReferral(
            $session,
            $request->reason,
            $request->notes
        );

        return response()->json([
            'message' => 'Referral rejected.',
            'session' => $session->fresh(['patient', 'referrals']),
            'transition' => $transition,
        ]);
    }

    /**
     * Get sessions in GP review (accepted by this GP).
     */
    public function inReview(Request $request): Response
    {
        $user = auth()->user();

        $query = ClinicalSession::with(['patient', 'referrals'])
            ->inGpReview()
            ->whereHas('referrals', function ($q) use ($user) {
                $q->where('referred_to_user_id', $user->id);
            })
            ->orderBy('workflow_state_updated_at', 'desc');

        // Filter by search term
        if ($request->has('search')) {
            $search = $request->search;
            $query->whereHas('patient', function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('cpt', 'like', "%{$search}%");
            });
        }

        $sessions = $query->paginate(20)->through(function ($session) {
            return $this->formatSessionForDashboard($session);
        });

        return Inertia::render('gp/InReview', [
            'sessions' => $sessions,
            'filters' => $request->only(['search']),
        ]);
    }

    /**
     * Get sessions under treatment (managed by this GP).
     */
    public function underTreatment(Request $request): Response
    {
        $user = auth()->user();

        $query = ClinicalSession::with(['patient', 'referrals'])
            ->byWorkflowState(ClinicalSession::WORKFLOW_UNDER_TREATMENT)
            ->whereHas('referrals', function ($q) use ($user) {
                $q->where('referred_to_user_id', $user->id);
            })
            ->orderBy('workflow_state_updated_at', 'desc');

        // Filter by search term
        if ($request->has('search')) {
            $search = $request->search;
            $query->whereHas('patient', function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('cpt', 'like', "%{$search}%");
            });
        }

        $sessions = $query->paginate(20)->through(function ($session) {
            return $this->formatSessionForDashboard($session);
        });

        return Inertia::render('gp/UnderTreatment', [
            'sessions' => $sessions,
            'filters' => $request->only(['search']),
        ]);
    }

    /**
     * Format session for dashboard list view.
     */
    protected function formatSessionForDashboard(ClinicalSession $session): array
    {
        return [
            'id' => $session->id,
            'couch_id' => $session->couch_id,
            'workflow_state' => $session->workflow_state,
            'workflow_state_label' => $session->workflow_state_label,
            'triage_priority' => $session->triage_priority,
            'chief_complaint' => $session->chief_complaint,
            'created_at' => $session->session_created_at?->toISOString(),
            'updated_at' => $session->session_updated_at?->toISOString(),
            'state_updated_at' => $session->workflow_state_updated_at?->toISOString(),
            'patient' => $session->patient ? [
                'cpt' => $session->patient->cpt,
                'first_name' => $session->patient->first_name,
                'last_name' => $session->patient->last_name,
                'age' => $session->patient->date_of_birth?->age,
                'gender' => $session->patient->gender,
            ] : null,
            'referral' => $session->referrals->first() ? [
                'id' => $session->referrals->first()->id,
                'reason' => $session->referrals->first()->reason,
                'referred_at' => $session->referrals->first()->created_at->toISOString(),
            ] : null,
        ];
    }

    /**
     * Format session for detail view.
     */
    protected function formatSessionDetail(ClinicalSession $session): array
    {
        $base = $this->formatSessionForDashboard($session);

        $base['notes'] = $session->notes;
        $base['forms'] = $session->forms->map(function ($form) {
            return [
                'id' => $form->id,
                'form_type' => $form->form_type,
                'created_at' => $form->created_at->toISOString(),
            ];
        });
        $base['comments'] = $session->comments->map(function ($comment) {
            return [
                'id' => $comment->id,
                'content' => $comment->content,
                'user' => $comment->user?->name,
                'created_at' => $comment->created_at->toISOString(),
            ];
        });
        $base['ai_requests'] = $session->aiRequests->map(function ($request) {
            return [
                'id' => $request->id,
                'task' => $request->task,
                'status' => $request->status,
                'created_at' => $request->created_at->toISOString(),
            ];
        });

        return $base;
    }
}
