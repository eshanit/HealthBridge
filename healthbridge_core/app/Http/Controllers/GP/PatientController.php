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

            // Create patient in MySQL
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
                'last_visit_at' => now(),
            ]);

            // Create patient document in CouchDB
            $couchDoc = [
                'type' => 'patient',
                'cpt' => $patient->cpt,
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
            ];

            $couchResult = $this->couchDbService->createDocument($couchDoc);

            if ($couchResult['success']) {
                // Update patient with CouchDB ID
                $patient->update([
                    'couch_id' => $couchResult['id'],
                    'raw_document' => array_merge($couchDoc, ['_id' => $couchResult['id'], '_rev' => $couchResult['rev']]),
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
                ],
                'session' => [
                    'id' => $session->id,
                    'couch_id' => $session->couch_id,
                ],
                'redirect' => route('gp.sessions.show', $session->couch_id ?? $session->id),
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

        $couchResult = $this->couchDbService->createDocument($sessionDoc);

        // Create session in MySQL
        $session = ClinicalSession::create([
            'couch_id' => $couchResult['success'] ? $couchResult['id'] : null,
            'patient_cpt' => $patient->cpt,
            'state' => 'in_review',
            'triage_level' => 'green',
            'provider_id' => $userId,
            'session_date' => now(),
            'raw_document' => $couchResult['success'] 
                ? array_merge($sessionDoc, ['_id' => $couchResult['id'], '_rev' => $couchResult['rev']]) 
                : $sessionDoc,
        ]);

        return $session;
    }
}
