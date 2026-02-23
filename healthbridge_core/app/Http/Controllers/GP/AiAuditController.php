<?php

namespace App\Http\Controllers\GP;

use App\Http\Controllers\Controller;
use App\Models\AiRequest;
use App\Models\Patient;
use App\Models\ClinicalSession;
use Illuminate\Http\Request;
use Inertia\Inertia;

class AiAuditController extends Controller
{
    /**
     * Display the AI Audit log page.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Inertia\Response
     */
    public function index(Request $request)
    {
        $patientId = $request->query('patient');
        
        $query = AiRequest::with(['user', 'session'])
            ->orderBy('requested_at', 'desc');

        // Filter by patient if provided
        if ($patientId) {
            // First try to find by patient_cpt
            $cpt = null;
            $sessionIds = [];
            
            // Check if it's a CouchDB patient ID (starts with patient_)
            if (str_starts_with($patientId, 'patient_')) {
                // It's a CouchDB patient ID - find the patient by couch_id first
                $patient = Patient::where('couch_id', $patientId)->first();
                if ($patient) {
                    $cpt = $patient->cpt;
                    // Get sessions for this patient to filter by session_couch_id
                    $sessionIds = ClinicalSession::where('patient_cpt', $cpt)
                        ->pluck('couch_id')
                        ->toArray();
                }
            } else {
                // Assume it's a CPT
                $cpt = $patientId;
                // Get sessions for this patient to filter by session_couch_id
                $sessionIds = ClinicalSession::where('patient_cpt', $patientId)
                    ->pluck('couch_id')
                    ->toArray();
            }
            
            if ($cpt || !empty($sessionIds)) {
                $query->where(function ($q) use ($cpt, $sessionIds) {
                    if ($cpt) {
                        $q->orWhere('patient_cpt', $cpt);
                    }
                    if (!empty($sessionIds)) {
                        $q->orWhereIn('session_couch_id', $sessionIds);
                    }
                });
            }
        }

        $aiRequests = $query->paginate(50);

        // Get patient info if available
        $patient = null;
        if ($patientId) {
            if (str_starts_with($patientId, 'patient_')) {
                $patient = Patient::where('couch_id', $patientId)->first();
            } else {
                $patient = Patient::where('cpt', $patientId)->first();
            }
        }

        return Inertia::render('gp/AiAudit', [
            'aiRequests' => $aiRequests,
            'patient' => $patient,
            'filters' => [
                'patient' => $patientId,
            ],
        ]);
    }

    /**
     * Display a specific AI request details.
     *
     * @param  string  $id
     * @return \Inertia\Response
     */
    public function show(string $id)
    {
        $aiRequest = AiRequest::with(['user', 'session'])
            ->where('request_uuid', $id)
            ->firstOrFail();

        return Inertia::render('gp/AiAuditDetail', [
            'aiRequest' => $aiRequest,
        ]);
    }
}
