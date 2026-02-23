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
     * Get referrals as JSON for the dashboard.
     */
    public function referralsJson(Request $request): JsonResponse
    {
        $query = ClinicalSession::with(['patient', 'referrals.referringUser', 'forms'])
            ->referred()
            ->orderBy('workflow_state_updated_at', 'desc');

        // Filter by priority if provided
        if ($request->has('priority')) {
            $query->byPriority($request->priority);
        }

        // Filter by search term
        if ($request->has('search') && strlen($request->search) >= 2) {
            $search = $request->search;
            $query->whereHas('patient', function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('cpt', 'like', "%{$search}%");
            });
        }

        $sessions = $query->get();

        // Separate into high priority (red) and normal priority
        $highPriority = $sessions->filter(function ($session) {
            return $session->triage_priority === 'red';
        })->map(function ($session) {
            return $this->formatReferralForQueue($session);
        })->values();

        $normalPriority = $sessions->filter(function ($session) {
            return $session->triage_priority !== 'red';
        })->map(function ($session) {
            return $this->formatReferralForQueue($session);
        })->values();

        return response()->json([
            'referrals' => [
                'high_priority' => $highPriority,
                'normal_priority' => $normalPriority,
            ],
        ]);
    }

    /**
     * Format a session as a referral for the queue.
     */
    protected function formatReferralForQueue(ClinicalSession $session): array
    {
        $referral = $session->referrals->first();
        
        // Get onboarding form data (first completed form with calculated data)
        $onboardingForm = $session->forms->firstWhere('status', 'completed');
        
        // Extract onboarding data from form
        $vitals = null;
        $dangerSigns = [];
        $medicalHistory = [];
        $currentMedications = [];
        $allergies = [];
        
        if ($onboardingForm) {
            $calculated = $onboardingForm->calculated ?? [];
            $answers = $onboardingForm->answers ?? [];
            
            // Get vitals from calculated or answers
            $vitals = $calculated['vitals'] ?? $answers['vitals'] ?? null;
            
            // Get danger signs
            $dangerSigns = $calculated['dangerSigns'] ?? [];
            if (empty($dangerSigns) && ($calculated['hasDangerSign'] ?? false)) {
                $dangerSigns = ['Danger signs detected'];
            }
            
            // Get medical history, medications, allergies from answers
            $medicalHistory = $answers['medicalHistory'] ?? [];
            $currentMedications = $answers['currentMedications'] ?? [];
            $allergies = $answers['allergies'] ?? [];
        }
        
        // Calculate waiting time using Carbon's diffForHumans for human-readable output
        $waitingTime = $session->workflow_state_updated_at
            ? $session->workflow_state_updated_at->diffForHumans(now(), true)
            : 'unknown';
        
        // Also calculate absolute minutes for frontend calculations
        $waitingMinutes = $session->workflow_state_updated_at
            ? abs(now()->diffInMinutes($session->workflow_state_updated_at))
            : 0;
        
        return [
            'id' => $referral?->id ?? $session->id,
            'couch_id' => $session->couch_id,
            'patient' => [
                'id' => $session->patient?->couch_id ?? $session->couch_id,
                'cpt' => $session->patient?->cpt,
                'name' => $session->patient?->full_name ?? 'Unknown',
                'age' => $session->patient?->age,
                'gender' => $session->patient?->gender,
                'triage_color' => strtoupper($session->triage_priority ?? 'GREEN'),
                'status' => $session->workflow_state,
                'waiting_minutes' => $waitingMinutes,
                'waiting_time' => $waitingTime,
                'state_updated_at' => $session->workflow_state_updated_at?->toIso8601String(),
                'danger_signs' => $dangerSigns,
            ],
            'chief_complaint' => $session->chief_complaint,
            'vitals' => $vitals ? [
                'rr' => $vitals['rr'] ?? null,
                'hr' => $vitals['hr'] ?? null,
                'temp' => $vitals['temp'] ?? null,
                'spo2' => $vitals['spo2'] ?? null,
                'weight' => $vitals['weight'] ?? null,
            ] : null,
            'medical_history' => $medicalHistory,
            'current_medications' => $currentMedications,
            'allergies' => $allergies,
            'referred_by' => $referral?->referringUser?->name ?? 'Unknown',
            'referral_notes' => $referral?->reason ?? '',
            'created_at' => $session->workflow_state_updated_at?->toIso8601String() ?? now()->toIso8601String(),
        ];
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
    public function acceptReferral(Request $request, string $couchId)
    {
        $request->validate([
            'notes' => 'nullable|string|max:1000',
        ]);

        $user = auth()->user();
        $session = ClinicalSession::where('couch_id', $couchId)->firstOrFail();

        if (!$this->stateMachine->canTransition($session, ClinicalSession::WORKFLOW_IN_GP_REVIEW)) {
            return redirect()->back()->withErrors(['message' => 'This referral cannot be accepted in its current state.']);
        }

        // Transition the session state
        $transition = $this->stateMachine->acceptReferral(
            $session,
            $request->notes
        );

        // Assign the referral to the current GP
        $referral = $session->referrals->first();
        if ($referral) {
            $referral->accept($user->id);
        }

        // Redirect back with success message (Inertia response)
        return redirect()->back()->with('success', 'Referral accepted successfully.');
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
     * Get all cases assigned to the current GP (combined IN_GP_REVIEW and UNDER_TREATMENT).
     */
    public function myCases(Request $request): JsonResponse
    {
        $user = auth()->user();

        $validated = $request->validate([
            'state' => ['nullable', 'string', 'in:IN_GP_REVIEW,UNDER_TREATMENT'],
            'search' => ['nullable', 'string', 'min:2'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $states = $validated['state'] 
            ? [$validated['state']]
            : [ClinicalSession::WORKFLOW_IN_GP_REVIEW, ClinicalSession::WORKFLOW_UNDER_TREATMENT];

        $query = ClinicalSession::with(['patient', 'referrals'])
            ->whereIn('workflow_state', $states)
            ->whereHas('referrals', function ($q) use ($user) {
                $q->where('assigned_to_user_id', $user->id);
            })
            ->orderBy('workflow_state_updated_at', 'desc');

        // Filter by search term
        if (!empty($validated['search'])) {
            $search = $validated['search'];
            $query->whereHas('patient', function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('cpt', 'like', "%{$search}%");
            });
        }

        $perPage = $validated['per_page'] ?? 20;
        $sessions = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $sessions->map(fn ($session) => $this->formatSessionForDashboard($session)),
            'pagination' => [
                'current_page' => $sessions->currentPage(),
                'last_page' => $sessions->lastPage(),
                'per_page' => $sessions->perPage(),
                'total' => $sessions->total(),
            ],
        ]);
    }

    /**
     * Get my cases as JSON for the dashboard (same format as referralsJson).
     */
    public function myCasesJson(Request $request): JsonResponse
    {
        $user = auth()->user();

        $query = ClinicalSession::with(['patient', 'referrals.referringUser', 'forms'])
            ->whereIn('workflow_state', [
                ClinicalSession::WORKFLOW_IN_GP_REVIEW,
                ClinicalSession::WORKFLOW_UNDER_TREATMENT,
            ])
            ->whereHas('referrals', function ($q) use ($user) {
                $q->where('assigned_to_user_id', $user->id);
            })
            ->orderBy('workflow_state_updated_at', 'desc');

        // Filter by search term
        if ($request->has('search') && strlen($request->search) >= 2) {
            $search = $request->search;
            $query->whereHas('patient', function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('cpt', 'like', "%{$search}%");
            });
        }

        $sessions = $query->get();

        // Separate into high priority (red) and normal priority
        $highPriority = $sessions->filter(function ($session) {
            return $session->triage_priority === 'red';
        })->map(function ($session) {
            return $this->formatReferralForQueue($session);
        })->values();

        $normalPriority = $sessions->filter(function ($session) {
            return $session->triage_priority !== 'red';
        })->map(function ($session) {
            return $this->formatReferralForQueue($session);
        })->values();

        return response()->json([
            'cases' => [
                'high_priority' => $highPriority,
                'normal_priority' => $normalPriority,
            ],
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
                'session_couch_id' => $session->referrals->first()->session_couch_id,
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
