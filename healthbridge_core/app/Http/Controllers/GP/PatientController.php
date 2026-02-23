<?php

namespace App\Http\Controllers\GP;

use App\Http\Controllers\Controller;
use App\Models\ClinicalSession;
use App\Models\Patient;
use App\Services\CouchDbService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class PatientController extends Controller
{
    public function __construct(
        protected CouchDbService $couchDbService
    ) {}

    /**
     * List all active patients with pagination, sorting, and filtering.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'min:2'],
            'triage' => ['nullable', 'string', 'in:red,yellow,green,unknown'],
            'status' => ['nullable', 'string'],
            'sort_by' => ['nullable', 'string', 'in:last_visit_at,created_at,full_name'],
            'sort_dir' => ['nullable', 'string', 'in:asc,desc'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $query = Patient::query()
            ->with(['latestSession'])
            ->active();

        // Search filter
        if (!empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('cpt', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        // Triage filter (via latest session relationship)
        if (!empty($validated['triage'])) {
            $query->whereHas('latestSession', function ($q) use ($validated) {
                $q->where('triage_priority', $validated['triage']);
            });
        }

        // Status filter (via latest session relationship)
        if (!empty($validated['status'])) {
            $query->whereHas('latestSession', function ($q) use ($validated) {
                $q->where('workflow_state', $validated['status']);
            });
        }

        // Sorting
        $sortBy = $validated['sort_by'] ?? 'last_visit_at';
        $sortDir = $validated['sort_dir'] ?? 'desc';
        $query->orderBy($sortBy, $sortDir);

        // Pagination
        $perPage = $validated['per_page'] ?? 20;
        $patients = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $patients->map(fn ($patient) => $this->formatPatientSummary($patient)),
            'pagination' => [
                'current_page' => $patients->currentPage(),
                'last_page' => $patients->lastPage(),
                'per_page' => $patients->perPage(),
                'total' => $patients->total(),
                'from' => $patients->firstItem(),
                'to' => $patients->lastItem(),
            ],
        ]);
    }

    /**
     * Format patient for summary list view.
     */
    protected function formatPatientSummary(Patient $patient): array
    {
        $latestSession = $patient->latestSession;

        return [
            'couch_id' => $patient->couch_id,
            'cpt' => $patient->cpt,
            'full_name' => $patient->full_name,
            'age' => $patient->age,
            'gender' => $patient->gender,
            'triage_priority' => $latestSession?->triage_priority,
            'status' => $latestSession?->workflow_state,
            'waiting_minutes' => $latestSession?->waiting_minutes,
            'danger_signs' => $latestSession?->danger_signs ?? [],
            'last_updated' => $patient->last_visit_at?->toIso8601String(),
            'source' => $patient->source,
            'is_from_nurse' => $patient->isFromNurseMobile(),
        ];
    }

    /**
     * Show the new patient registration form.
     */
    public function create(): Response
    {
        return Inertia::render('gp/NewPatient', [
            'genders' => ['male', 'female', 'other'],
        ]);
    }

    /**
     * Store a newly registered patient.
     * 
     * Creates a patient record in both MySQL and CouchDB with proper
     * document structure matching nurse_mobile's clinicalPatient format.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'date_of_birth' => ['required', 'date', 'before:today'],
            'gender' => ['required', 'in:male,female,other'],
            'phone' => ['nullable', 'string', 'max:30'],
            'weight_kg' => ['nullable', 'numeric', 'min:0', 'max:500'],
        ]);

        try {
            DB::beginTransaction();

            // Generate unique CPT (Clinical Patient Tracker) ID
            $cpt = $this->generateCptId();

            // Calculate age in months
            $ageMonths = null;
            if ($validated['date_of_birth']) {
                $dob = \Carbon\Carbon::parse($validated['date_of_birth']);
                $ageMonths = $dob->diffInMonths(now());
            }

            // Create patient in MySQL with GP source
            $patient = Patient::create([
                'cpt' => $cpt,
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'date_of_birth' => $validated['date_of_birth'],
                'age_months' => $ageMonths,
                'gender' => $validated['gender'],
                'phone' => $validated['phone'] ?? null,
                'weight_kg' => $validated['weight_kg'] ?? null,
                'visit_count' => 1,
                'is_active' => true,
                'source' => Patient::SOURCE_GP_MANUAL,
                'created_by_user_id' => $request->user()->id,
                'last_visit_at' => now(),
            ]);

            // Create patient document in CouchDB using clinicalPatient format
            // This matches the structure used by nurse_mobile for consistency
            $couchDoc = [
                '_id' => 'patient:' . $cpt,
                'type' => 'clinicalPatient',
                'patient' => [
                    'id' => $cpt,
                    'cpt' => $cpt,
                    'firstName' => $patient->first_name,
                    'lastName' => $patient->last_name,
                    'dateOfBirth' => $patient->date_of_birth?->format('Y-m-d'),
                    'ageMonths' => $ageMonths,
                    'gender' => $patient->gender,
                    'phone' => $patient->phone,
                    'weightKg' => $patient->weight_kg,
                    'visitCount' => 1,
                    'isActive' => true,
                    'createdAt' => now()->toIso8601String(),
                    'updatedAt' => now()->toIso8601String(),
                    'createdBy' => $request->user()->id,
                    'source' => Patient::SOURCE_GP_MANUAL,
                ],
            ];

            $couchResult = $this->couchDbService->saveDocument($couchDoc);

            // CouchDB returns {ok: true, id: "...", rev: "..."} on success
            $couchSuccess = isset($couchResult['ok']) && $couchResult['ok'] === true;

            if ($couchSuccess) {
                // Update patient with CouchDB ID and revision
                $patient->update([
                    'couch_id' => $couchResult['id'],
                    'raw_document' => array_merge($couchDoc, ['_rev' => $couchResult['rev']]),
                ]);
            }

            // Create initial clinical session for the new patient
            $session = $this->createInitialSession($patient, $request->user()->id);

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Patient registered successfully',
                'patient' => [
                    'id' => $patient->id,
                    'cpt' => $patient->cpt,
                    'couch_id' => $patient->couch_id,
                    'full_name' => $patient->full_name,
                    'date_of_birth' => $patient->date_of_birth?->format('Y-m-d'),
                    'gender' => $patient->gender,
                    'phone' => $patient->phone,
                    'source' => $patient->source,
                ],
                'session' => [
                    'id' => $session->id,
                    'couch_id' => $session->couch_id,
                ],
                // Role-based redirect
                'redirect' => $this->getRoleBasedRedirect($request->user(), $session->couch_id ?? $session->id),
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            
            return response()->json([
                'success' => false,
                'message' => 'Failed to register patient',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Search for patients by name, CPT, or phone.
     */
    public function search(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['required', 'string', 'min:2'],
        ]);

        $patients = Patient::search($validated['q'])
            ->active()
            ->orderBy('last_visit_at', 'desc')
            ->limit(20)
            ->get()
            ->map(fn ($patient) => [
                'id' => $patient->id,
                'cpt' => $patient->cpt,
                'couch_id' => $patient->couch_id,
                'full_name' => $patient->full_name,
                'date_of_birth' => $patient->date_of_birth?->format('Y-m-d'),
                'age' => $patient->age,
                'gender' => $patient->gender,
                'phone' => $patient->phone,
                'visit_count' => $patient->visit_count,
            ]);

        return response()->json([
            'success' => true,
            'patients' => $patients,
        ]);
    }

    /**
     * Get patient details.
     */
    public function show(string $identifier): JsonResponse
    {
        $patient = Patient::where('cpt', $identifier)
            ->orWhere('couch_id', $identifier)
            ->orWhere('id', $identifier)
            ->firstOrFail();

        return response()->json([
            'success' => true,
            'patient' => [
                'id' => $patient->id,
                'cpt' => $patient->cpt,
                'couch_id' => $patient->couch_id,
                'full_name' => $patient->full_name,
                'first_name' => $patient->first_name,
                'last_name' => $patient->last_name,
                'date_of_birth' => $patient->date_of_birth?->format('Y-m-d'),
                'age' => $patient->age,
                'age_months' => $patient->age_months,
                'gender' => $patient->gender,
                'phone' => $patient->phone,
                'weight_kg' => $patient->weight_kg,
                'visit_count' => $patient->visit_count,
                'last_visit_at' => $patient->last_visit_at?->toIso8601String(),
            ],
        ]);
    }

    /**
     * Generate a unique CPT ID.
     * Format: CPT-YYYY-XXXXX (e.g., CPT-2026-00001)
     */
    protected function generateCptId(): string
    {
        $year = now()->year;
        $prefix = "CPT-{$year}-";

        // Get the last CPT ID for this year
        $lastPatient = Patient::where('cpt', 'like', $prefix . '%')
            ->orderBy('cpt', 'desc')
            ->first();

        if ($lastPatient) {
            $lastNumber = (int) substr($lastPatient->cpt, -5);
            $newNumber = str_pad($lastNumber + 1, 5, '0', STR_PAD_LEFT);
        } else {
            $newNumber = '00001';
        }

        return $prefix . $newNumber;
    }

    /**
     * Create an initial clinical session for a new patient.
     */
    protected function createInitialSession(Patient $patient, int $userId): ClinicalSession
    {
        // Create session in CouchDB
        $sessionDoc = [
            'type' => 'clinical_session',
            'patientCpt' => $patient->cpt,
            'patientCouchId' => $patient->couch_id,
            'state' => 'in_review',
            'triageLevel' => 'green',
            'dangerSigns' => [],
            'chiefComplaint' => null,
            'providerId' => $userId,
            'createdAt' => now()->toIso8601String(),
            'updatedAt' => now()->toIso8601String(),
            'createdBy' => $userId,
        ];

        $couchResult = $this->couchDbService->saveDocument($sessionDoc);

        // CouchDB returns {ok: true, id: "...", rev: "..."} on success
        $couchSuccess = isset($couchResult['ok']) && $couchResult['ok'] === true;

        // Create session in MySQL
        $session = ClinicalSession::create([
            'couch_id' => $couchSuccess ? $couchResult['id'] : null,
            'session_uuid' => $couchSuccess ? $couchResult['id'] : null,
            'patient_cpt' => $patient->cpt,
            'state' => 'in_review',
            'triage_level' => 'green',
            'provider_id' => $userId,
            'session_date' => now(),
            'raw_document' => $couchSuccess 
                ? array_merge($sessionDoc, ['_id' => $couchResult['id'], '_rev' => $couchResult['rev']]) 
                : $sessionDoc,
        ]);

        return $session;
    }

    /**
     * Get role-based redirect URL after patient registration.
     */
    protected function getRoleBasedRedirect($user, string $sessionId): string
    {
        if (!$user) {
            return route('gp.dashboard');
        }

        // Check if user has radiologist role
        if ($user->hasRole('radiologist')) {
            return route('radiology.dashboard');
        }

        // Default to GP dashboard
        return route('gp.sessions.show', $sessionId);
    }
}
