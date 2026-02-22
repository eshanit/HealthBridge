<?php

namespace App\Http\Controllers\GP;

use App\Http\Controllers\Controller;
use App\Models\Prescription;
use App\Models\ClinicalSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class PrescriptionController extends Controller
{
    /**
     * Verify the user has access to the specified session.
     *
     * @param string $sessionCouchId
     * @return ClinicalSession
     * @throws \Illuminate\Foundation\Exceptions\Handler
     */
    protected function authorizeSessionAccess(string $sessionCouchId): ClinicalSession
    {
        $session = ClinicalSession::where('couch_id', $sessionCouchId)->first();

        if (!$session) {
            abort(404, 'Session not found');
        }

        // Check if user has role-based access
        $user = auth()->user();
        
        // Admin and radiologists can access any session
        if ($user->hasRole(['admin', 'radiologist'])) {
            return $session;
        }

        // GPs can access their own sessions
        if ($user->hasRole('gp') && $session->gp_id === $user->id) {
            return $session;
        }

        // Nurses can access sessions assigned to them
        if ($user->hasRole('nurse') && $session->nurse_id === $user->id) {
            return $session;
        }

        // Deny access otherwise
        abort(403, 'You do not have permission to access this session');
    }

    /**
     * Get all prescriptions for a session.
     */
    public function index(string $sessionCouchId): JsonResponse
    {
        // Authorize session access
        $this->authorizeSessionAccess($sessionCouchId);

        $prescriptions = Prescription::forSession($sessionCouchId)
            ->with(['prescriber'])
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'prescriptions' => $prescriptions,
        ]);
    }

    /**
     * Store a new prescription.
     */
    public function store(Request $request, string $sessionCouchId): RedirectResponse
    {
        // Authorize session access
        $this->authorizeSessionAccess($sessionCouchId);

        $request->validate([
            'medications' => 'required|array|min:1',
            'medications.*.name' => 'required|string|max:255',
            'medications.*.dose' => 'required|string|max:100',
            'medications.*.route' => 'required|string|max:50',
            'medications.*.frequency' => 'required|string|max:100',
            'medications.*.duration' => 'nullable|string|max:100',
            'medications.*.instructions' => 'nullable|string|max:500',
        ]);

        $session = ClinicalSession::where('couch_id', $sessionCouchId)->first();
        $patientCpt = $session?->patient_cpt;

        DB::transaction(function () use ($request, $sessionCouchId, $patientCpt) {
            foreach ($request->medications as $med) {
                Prescription::create([
                    'session_couch_id' => $sessionCouchId,
                    'patient_cpt' => $patientCpt,
                    'prescriber_id' => Auth::id(),
                    'medication_name' => $med['name'],
                    'dose' => $med['dose'],
                    'route' => $med['route'],
                    'frequency' => $med['frequency'],
                    'duration' => $med['duration'] ?? null,
                    'instructions' => $med['instructions'] ?? null,
                    'status' => 'active',
                ]);
            }
        });

        // Update the session's treatment plan if session exists
        if ($session) {
            $session->update([
                'treatment_plan' => json_encode([
                    'medications' => $request->medications,
                    'updated_at' => now()->toIso8601String(),
                    'updated_by' => Auth::id(),
                ]),
            ]);
        }

        return redirect()->back()->with('success', 'Prescription saved successfully.');
    }

    /**
     * Store a single medication as prescription.
     */
    public function storeSingle(Request $request, string $sessionCouchId): RedirectResponse
    {
        // Authorize session access
        $this->authorizeSessionAccess($sessionCouchId);

        $request->validate([
            'name' => 'required|string|max:255',
            'dose' => 'required|string|max:100',
            'route' => 'required|string|max:50',
            'frequency' => 'required|string|max:100',
            'duration' => 'nullable|string|max:100',
            'instructions' => 'nullable|string|max:500',
        ]);

        $session = ClinicalSession::where('couch_id', $sessionCouchId)->first();
        $patientCpt = $session?->patient_cpt;

        Prescription::create([
            'session_couch_id' => $sessionCouchId,
            'patient_cpt' => $patientCpt,
            'prescriber_id' => Auth::id(),
            'medication_name' => $request->name,
            'dose' => $request->dose,
            'route' => $request->route,
            'frequency' => $request->frequency,
            'duration' => $request->duration,
            'instructions' => $request->instructions,
            'status' => 'active',
        ]);

        return redirect()->back()->with('success', 'Medication added to prescription.');
    }

    /**
     * Update a prescription.
     */
    public function update(Request $request, string $sessionCouchId, int $prescriptionId): RedirectResponse
    {
        // Authorize session access
        $this->authorizeSessionAccess($sessionCouchId);

        $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'dose' => 'sometimes|required|string|max:100',
            'route' => 'sometimes|required|string|max:50',
            'frequency' => 'sometimes|required|string|max:100',
            'duration' => 'nullable|string|max:100',
            'instructions' => 'nullable|string|max:500',
            'status' => ['sometimes', Rule::in(['active', 'completed', 'cancelled', 'dispensed'])],
        ]);

        $prescription = Prescription::forSession($sessionCouchId)
            ->findOrFail($prescriptionId);

        $updateData = array_filter([
            'medication_name' => $request->name,
            'dose' => $request->dose,
            'route' => $request->route,
            'frequency' => $request->frequency,
            'duration' => $request->duration,
            'instructions' => $request->instructions,
            'status' => $request->status,
        ], fn($value) => $value !== null);

        $prescription->update($updateData);

        return redirect()->back()->with('success', 'Prescription updated successfully.');
    }

    /**
     * Delete a prescription.
     */
    public function destroy(string $sessionCouchId, int $prescriptionId): RedirectResponse
    {
        // Authorize session access
        $this->authorizeSessionAccess($sessionCouchId);

        $prescription = Prescription::forSession($sessionCouchId)
            ->findOrFail($prescriptionId);

        $prescription->delete();

        return redirect()->back()->with('success', 'Prescription removed.');
    }

    /**
     * Mark a prescription as dispensed.
     */
    public function dispense(string $sessionCouchId, int $prescriptionId): RedirectResponse
    {
        // Authorize session access
        $this->authorizeSessionAccess($sessionCouchId);

        $prescription = Prescription::forSession($sessionCouchId)
            ->findOrFail($prescriptionId);

        $prescription->markAsDispensed();

        return redirect()->back()->with('success', 'Prescription marked as dispensed.');
    }

    /**
     * Save complete prescription (batch save with redirect to reports).
     */
    public function saveAndRedirect(Request $request, string $sessionCouchId)
    {
        // Authorize session access
        $this->authorizeSessionAccess($sessionCouchId);

        $request->validate([
            'medications' => 'required|array|min:1',
            'medications.*.name' => 'required|string|max:255',
            'medications.*.dose' => 'required|string|max:100',
            'medications.*.route' => 'required|string|max:50',
            'medications.*.frequency' => 'required|string|max:100',
            'medications.*.duration' => 'nullable|string|max:100',
            'medications.*.instructions' => 'nullable|string|max:500',
        ]);

        $session = ClinicalSession::where('couch_id', $sessionCouchId)->first();
        $patientCpt = $session?->patient_cpt;

        DB::transaction(function () use ($request, $sessionCouchId, $patientCpt) {
            foreach ($request->medications as $med) {
                Prescription::create([
                    'session_couch_id' => $sessionCouchId,
                    'patient_cpt' => $patientCpt,
                    'prescriber_id' => Auth::id(),
                    'medication_name' => $med['name'],
                    'dose' => $med['dose'],
                    'route' => $med['route'],
                    'frequency' => $med['frequency'],
                    'duration' => $med['duration'] ?? null,
                    'instructions' => $med['instructions'] ?? null,
                    'status' => 'active',
                ]);
            }
        });

        // Update the session's treatment plan
        if ($session) {
            $session->update([
                'treatment_plan' => json_encode([
                    'medications' => $request->medications,
                    'updated_at' => now()->toIso8601String(),
                    'updated_by' => Auth::id(),
                ]),
            ]);
        }

        // Return JSON for Inertia to handle the redirect on frontend
        return response()->json([
            'success' => true,
            'message' => 'Prescription saved successfully.',
            'activeTab' => 'reports',
        ]);
    }
}
