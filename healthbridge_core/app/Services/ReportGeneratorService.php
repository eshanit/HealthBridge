<?php

namespace App\Services;

use App\Models\ClinicalSession;
use App\Models\Patient;
use App\Models\ClinicalForm;
use App\Models\AiRequest;
use App\Models\Referral;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\View;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Report Generator Service
 *
 * Generates PDF and HTML reports for clinical sessions including:
 * - Discharge summaries
 * - Clinical handover reports (SBAR format)
 * - Referral reports
 * - AI-assisted comprehensive reports
 *
 * Phase 1 Implementation: PDF Generation and Report Persistence
 */
class ReportGeneratorService
{
    /**
     * Report types
     */
    const TYPE_DISCHARGE = 'discharge';
    const TYPE_HANDOVER = 'handover';
    const TYPE_REFERRAL = 'referral';
    const TYPE_COMPREHENSIVE = 'comprehensive';

    /**
     * Generate a discharge summary PDF for a session.
     *
     * @param string $sessionCouchId The CouchDB ID of the session
     * @param array $options Additional options
     * @return array{success: bool, pdf?: string, html?: string, filename?: string, error?: string}
     */
    public function generateDischargePdf(string $sessionCouchId, array $options = []): array
    {
        try {
            $session = ClinicalSession::with(['patient', 'forms', 'aiRequests', 'referrals', 'stateTransitions.user'])
                ->where('couch_id', $sessionCouchId)
                ->first();

            if (!$session) {
                return [
                    'success' => false,
                    'error' => "Session not found: {$sessionCouchId}",
                ];
            }

            $data = $this->buildDischargeData($session, $options);

            $pdf = Pdf::loadView('reports.discharge-summary', $data);
            $pdf->setPaper('a4', 'portrait');

            $filename = $this->generateFilename($session, self::TYPE_DISCHARGE);

            // Return PDF content
            $pdfContent = $pdf->output();

            return [
                'success' => true,
                'pdf' => base64_encode($pdfContent),
                'html' => view('reports.discharge-summary', $data)->render(),
                'filename' => $filename,
                'mime_type' => 'application/pdf',
                'size' => strlen($pdfContent),
            ];
        } catch (\Exception $e) {
            \Log::error('Report generation failed', [
                'session_couch_id' => $sessionCouchId,
                'type' => self::TYPE_DISCHARGE,
                'error' => $e->getMessage(),
            ]);

            return [
                'success' => false,
                'error' => 'Failed to generate discharge summary. Please try again.',
            ];
        }
    }

    /**
     * Generate a clinical handover report (SBAR format).
     *
     * @param string $sessionCouchId The CouchDB ID of the session
     * @param array $options Additional options
     * @return array{success: bool, pdf?: string, html?: string, filename?: string, error?: string}
     */
    public function generateHandoverPdf(string $sessionCouchId, array $options = []): array
    {
        try {
            $session = ClinicalSession::with(['patient', 'forms', 'aiRequests', 'referrals'])
                ->where('couch_id', $sessionCouchId)
                ->first();

            if (!$session) {
                return [
                    'success' => false,
                    'error' => "Session not found: {$sessionCouchId}",
                ];
            }

            $data = $this->buildHandoverData($session, $options);

            $pdf = Pdf::loadView('reports.clinical-handover', $data);
            $pdf->setPaper('a4', 'portrait');

            $filename = $this->generateFilename($session, self::TYPE_HANDOVER);
            $pdfContent = $pdf->output();

            return [
                'success' => true,
                'pdf' => base64_encode($pdfContent),
                'html' => view('reports.clinical-handover', $data)->render(),
                'filename' => $filename,
                'mime_type' => 'application/pdf',
                'size' => strlen($pdfContent),
            ];
        } catch (\Exception $e) {
            \Log::error('Report generation failed', [
                'session_couch_id' => $sessionCouchId,
                'type' => self::TYPE_HANDOVER,
                'error' => $e->getMessage(),
            ]);

            return [
                'success' => false,
                'error' => 'Failed to generate handover report. Please try again.',
            ];
        }
    }

    /**
     * Generate a referral report.
     *
     * @param string $sessionCouchId The CouchDB ID of the session
     * @param array $options Additional options
     * @return array{success: bool, pdf?: string, html?: string, filename?: string, error?: string}
     */
    public function generateReferralPdf(string $sessionCouchId, array $options = []): array
    {
        try {
            $session = ClinicalSession::with(['patient', 'forms', 'referrals.referringUser', 'referrals.assignedTo'])
                ->where('couch_id', $sessionCouchId)
                ->first();

            if (!$session) {
                return [
                    'success' => false,
                    'error' => "Session not found: {$sessionCouchId}",
                ];
            }

            $referral = $session->referrals->first();
            if (!$referral) {
                return [
                    'success' => false,
                    'error' => "No referral found for session: {$sessionCouchId}",
                ];
            }

            $data = $this->buildReferralData($session, $referral, $options);

            $pdf = Pdf::loadView('reports.referral', $data);
            $pdf->setPaper('a4', 'portrait');

            $filename = $this->generateFilename($session, self::TYPE_REFERRAL);
            $pdfContent = $pdf->output();

            return [
                'success' => true,
                'pdf' => base64_encode($pdfContent),
                'html' => view('reports.referral', $data)->render(),
                'filename' => $filename,
                'mime_type' => 'application/pdf',
                'size' => strlen($pdfContent),
            ];
        } catch (\Exception $e) {
            \Log::error('Report generation failed', [
                'session_couch_id' => $sessionCouchId,
                'type' => self::TYPE_REFERRAL,
                'error' => $e->getMessage(),
            ]);

            return [
                'success' => false,
                'error' => 'Failed to generate referral report. Please try again.',
            ];
        }
    }

    /**
     * Generate a comprehensive report with AI-generated content.
     *
     * @param string $sessionCouchId The CouchDB ID of the session
     * @param array $aiContent AI-generated content to include
     * @param array $options Additional options
     * @return array{success: bool, pdf?: string, html?: string, filename?: string, error?: string}
     */
    public function generateComprehensivePdf(string $sessionCouchId, array $aiContent = [], array $options = []): array
    {
        try {
            $session = ClinicalSession::with(['patient', 'forms', 'aiRequests', 'referrals', 'stateTransitions.user', 'comments.user'])
                ->where('couch_id', $sessionCouchId)
                ->first();

            if (!$session) {
                return [
                    'success' => false,
                    'error' => "Session not found: {$sessionCouchId}",
                ];
            }

            $data = $this->buildComprehensiveData($session, $aiContent, $options);

            $pdf = Pdf::loadView('reports.comprehensive', $data);
            $pdf->setPaper('a4', 'portrait');

            $filename = $this->generateFilename($session, self::TYPE_COMPREHENSIVE);
            $pdfContent = $pdf->output();

            return [
                'success' => true,
                'pdf' => base64_encode($pdfContent),
                'html' => view('reports.comprehensive', $data)->render(),
                'filename' => $filename,
                'mime_type' => 'application/pdf',
                'size' => strlen($pdfContent),
            ];
        } catch (\Exception $e) {
            \Log::error('Report generation failed', [
                'session_couch_id' => $sessionCouchId,
                'type' => self::TYPE_COMPREHENSIVE,
                'error' => $e->getMessage(),
            ]);

            return [
                'success' => false,
                'error' => 'Failed to generate comprehensive report. Please try again.',
            ];
        }
    }

    /**
     * Build data for discharge summary report.
     *
     * @param ClinicalSession $session
     * @param array $options
     * @return array
     */
    protected function buildDischargeData(ClinicalSession $session, array $options = []): array
    {
        $patient = $session->patient;
        $forms = $session->forms;
        $aiRequests = $session->aiRequests;

        // Get the primary/completed form
        $primaryForm = $forms->firstWhere('status', 'completed') ?? $forms->first();

        // Extract vitals from form
        $vitals = $this->extractVitals($primaryForm);

        // Extract danger signs
        $dangerSigns = $this->extractDangerSigns($primaryForm);

        // Extract assessment data
        $assessment = $this->extractAssessment($primaryForm);

        // Get AI-generated summary if available
        $aiSummary = $aiRequests->where('task', 'note_summary')->first();

        return [
            'report_type' => 'Discharge Summary',
            'generated_at' => now()->toIso8601String(),
            'facility' => $options['facility'] ?? config('app.name', 'UtanoBridge'),
            'session' => [
                'id' => $session->couch_id,
                'uuid' => $session->session_uuid,
                'stage' => $session->stage,
                'status' => $session->status,
                'workflow_state' => $session->workflow_state,
                'triage_priority' => $session->triage_priority,
                'chief_complaint' => $session->chief_complaint,
                'created_at' => $session->session_created_at?->toIso8601String(),
                'completed_at' => $session->session_updated_at?->toIso8601String(),
            ],
            'patient' => [
                'cpt' => $patient?->cpt,
                'name' => $patient?->full_name ?? 'Unknown',
                'age' => $patient?->age,
                'age_months' => $patient?->age_months,
                'gender' => $patient?->gender,
                'date_of_birth' => $patient?->date_of_birth,
                'weight_kg' => $patient?->weight_kg,
            ],
            'vitals' => $vitals,
            'danger_signs' => $dangerSigns,
            'assessment' => $assessment,
            'treatment_plan' => $session->treatment_plan,
            'ai_summary' => $aiSummary?->response,
            'notes' => $session->notes,
            'show_ai_content' => $options['show_ai_content'] ?? true,
        ];
    }

    /**
     * Build data for clinical handover report (SBAR format).
     *
     * @param ClinicalSession $session
     * @param array $options
     * @return array
     */
    protected function buildHandoverData(ClinicalSession $session, array $options = []): array
    {
        $patient = $session->patient;
        $forms = $session->forms;
        $primaryForm = $forms->firstWhere('status', 'completed') ?? $forms->first();

        // Build SBAR components
        $situation = $this->buildSituation($session, $patient);
        $background = $this->buildBackground($session, $primaryForm);
        $assessment = $this->buildAssessment($session, $primaryForm);
        $recommendation = $this->buildRecommendation($session);

        return [
            'report_type' => 'Clinical Handover (SBAR)',
            'generated_at' => now()->toIso8601String(),
            'facility' => $options['facility'] ?? config('app.name', 'UtanoBridge'),
            'session_id' => $session->couch_id,
            'patient' => [
                'cpt' => $patient?->cpt,
                'name' => $patient?->full_name ?? 'Unknown',
                'age' => $patient?->age,
                'gender' => $patient?->gender,
                'triage_priority' => $session->triage_priority,
            ],
            'sbar' => [
                'situation' => $situation,
                'background' => $background,
                'assessment' => $assessment,
                'recommendation' => $recommendation,
            ],
            'handed_over_by' => $options['handed_over_by'] ?? auth()->user()?->name,
            'handed_over_to' => $options['handed_over_to'] ?? null,
        ];
    }

    /**
     * Build data for referral report.
     *
     * @param ClinicalSession $session
     * @param Referral $referral
     * @param array $options
     * @return array
     */
    protected function buildReferralData(ClinicalSession $session, Referral $referral, array $options = []): array
    {
        $patient = $session->patient;
        $forms = $session->forms;
        $primaryForm = $forms->firstWhere('status', 'completed') ?? $forms->first();

        return [
            'report_type' => 'Referral Report',
            'generated_at' => now()->toIso8601String(),
            'facility' => $options['facility'] ?? config('app.name', 'UtanoBridge'),
            'referral' => [
                'id' => $referral->referral_uuid,
                'status' => $referral->status,
                'priority' => $referral->priority,
                'specialty' => $referral->specialty,
                'reason' => $referral->reason,
                'clinical_notes' => $referral->clinical_notes,
                'created_at' => $referral->created_at?->toIso8601String(),
            ],
            'session' => [
                'id' => $session->couch_id,
                'chief_complaint' => $session->chief_complaint,
                'triage_priority' => $session->triage_priority,
            ],
            'patient' => [
                'cpt' => $patient?->cpt,
                'name' => $patient?->full_name ?? 'Unknown',
                'age' => $patient?->age,
                'gender' => $patient?->gender,
                'weight_kg' => $patient?->weight_kg,
            ],
            'vitals' => $this->extractVitals($primaryForm),
            'danger_signs' => $this->extractDangerSigns($primaryForm),
            'referring_user' => $referral->referringUser?->name,
            'assigned_to' => $referral->assignedTo?->name,
        ];
    }

    /**
     * Build data for comprehensive report.
     *
     * @param ClinicalSession $session
     * @param array $aiContent
     * @param array $options
     * @return array
     */
    protected function buildComprehensiveData(ClinicalSession $session, array $aiContent = [], array $options = []): array
    {
        $patient = $session->patient;
        $forms = $session->forms;
        $primaryForm = $forms->firstWhere('status', 'completed') ?? $forms->first();

        // Get all AI requests for this session
        $aiRequests = $session->aiRequests;

        return [
            'report_type' => 'Comprehensive Clinical Report',
            'generated_at' => now()->toIso8601String(),
            'facility' => $options['facility'] ?? config('app.name', 'UtanoBridge'),
            'session' => [
                'id' => $session->couch_id,
                'uuid' => $session->session_uuid,
                'stage' => $session->stage,
                'status' => $session->status,
                'workflow_state' => $session->workflow_state,
                'triage_priority' => $session->triage_priority,
                'chief_complaint' => $session->chief_complaint,
                'treatment_plan' => $session->treatment_plan,
                'notes' => $session->notes,
                'created_at' => $session->session_created_at?->toIso8601String(),
                'updated_at' => $session->session_updated_at?->toIso8601String(),
            ],
            'patient' => [
                'cpt' => $patient?->cpt,
                'name' => $patient?->full_name ?? 'Unknown',
                'age' => $patient?->age,
                'age_months' => $patient?->age_months,
                'gender' => $patient?->gender,
                'date_of_birth' => $patient?->date_of_birth,
                'weight_kg' => $patient?->weight_kg,
            ],
            'vitals' => $this->extractVitals($primaryForm),
            'danger_signs' => $this->extractDangerSigns($primaryForm),
            'assessment' => $this->extractAssessment($primaryForm),
            'forms' => $forms->map(fn ($form) => [
                'id' => $form->couch_id,
                'schema_id' => $form->schema_id,
                'status' => $form->status,
                'created_at' => $form->form_created_at,
            ]),
            'ai_interactions' => $aiRequests->map(fn ($ai) => [
                'task' => $ai->task,
                'created_at' => $ai->requested_at,
                'latency_ms' => $ai->latency_ms,
            ]),
            'ai_content' => $aiContent,
            'state_transitions' => $session->stateTransitions->map(fn ($transition) => [
                'from' => $transition->from_state,
                'to' => $transition->to_state,
                'reason' => $transition->reason,
                'user' => $transition->user?->name,
                'created_at' => $transition->created_at?->toIso8601String(),
            ]),
            'show_ai_content' => $options['show_ai_content'] ?? true,
        ];
    }

    /**
     * Extract vitals from a clinical form.
     *
     * @param ClinicalForm|null $form
     * @return array
     */
    protected function extractVitals(?ClinicalForm $form): array
    {
        if (!$form) {
            return [];
        }

        $calculated = $form->calculated ?? [];
        $answers = $form->answers ?? [];

        $vitals = $calculated['vitals'] ?? $answers['vitals'] ?? [];

        return [
            'respiratory_rate' => $vitals['rr'] ?? $vitals['respiratory_rate'] ?? null,
            'heart_rate' => $vitals['hr'] ?? $vitals['heart_rate'] ?? null,
            'temperature' => $vitals['temp'] ?? $vitals['temperature'] ?? null,
            'spo2' => $vitals['spo2'] ?? $vitals['oxygen_saturation'] ?? null,
            'weight' => $vitals['weight'] ?? $vitals['weight_kg'] ?? null,
        ];
    }

    /**
     * Extract danger signs from a clinical form.
     *
     * @param ClinicalForm|null $form
     * @return array
     */
    protected function extractDangerSigns(?ClinicalForm $form): array
    {
        if (!$form) {
            return [];
        }

        $calculated = $form->calculated ?? [];
        $answers = $form->answers ?? [];

        $dangerSigns = $calculated['dangerSigns'] ?? [];

        if (empty($dangerSigns) && ($calculated['hasDangerSign'] ?? false)) {
            $dangerSigns = ['Danger signs detected'];
        }

        // Also check answers for specific danger sign fields
        $dangerSignFields = [
            'unableToDrink',
            'convulsions',
            'lethargic',
            'vomitingEverything',
            'chestIndrawing',
            'stridor',
            'severeWasting',
        ];

        foreach ($dangerSignFields as $field) {
            if (($answers[$field] ?? false) === true) {
                $dangerSigns[] = $this->formatDangerSignLabel($field);
            }
        }

        return array_unique($dangerSigns);
    }

    /**
     * Extract assessment data from a clinical form.
     *
     * @param ClinicalForm|null $form
     * @return array
     */
    protected function extractAssessment(?ClinicalForm $form): array
    {
        if (!$form) {
            return [];
        }

        $calculated = $form->calculated ?? [];
        $answers = $form->answers ?? [];

        return [
            'classification' => $calculated['classification'] ?? $calculated['triageClassification'] ?? null,
            'severity' => $calculated['severity'] ?? null,
            'symptoms' => $answers['symptoms'] ?? [],
            'duration' => $answers['duration'] ?? null,
            'onset' => $answers['onset'] ?? null,
        ];
    }

    /**
     * Build the Situation component for SBAR.
     *
     * @param ClinicalSession $session
     * @param Patient|null $patient
     * @return string
     */
    protected function buildSituation(ClinicalSession $session, ?Patient $patient): string
    {
        $parts = [];

        if ($patient) {
            $parts[] = "Patient: {$patient->full_name}";
            if ($patient->age_months) {
                $parts[] = "Age: {$this->formatAge($patient->age_months)}";
            }
            if ($patient->gender) {
                $parts[] = "Gender: {$patient->gender}";
            }
        }

        $parts[] = "Triage Priority: " . strtoupper($session->triage_priority ?? 'Unknown');

        if ($session->chief_complaint) {
            $parts[] = "Chief Complaint: {$session->chief_complaint}";
        }

        return implode("\n", $parts);
    }

    /**
     * Build the Background component for SBAR.
     *
     * @param ClinicalSession $session
     * @param ClinicalForm|null $form
     * @return string
     */
    protected function buildBackground(ClinicalSession $session, ?ClinicalForm $form): string
    {
        $parts = [];

        if ($form) {
            $answers = $form->answers ?? [];

            if (!empty($answers['medicalHistory'])) {
                $parts[] = "Medical History: " . implode(', ', (array) $answers['medicalHistory']);
            }

            if (!empty($answers['currentMedications'])) {
                $parts[] = "Current Medications: " . implode(', ', (array) $answers['currentMedications']);
            }

            if (!empty($answers['allergies'])) {
                $parts[] = "Allergies: " . implode(', ', (array) $answers['allergies']);
            }
        }

        $dangerSigns = $this->extractDangerSigns($form);
        if (!empty($dangerSigns)) {
            $parts[] = "Danger Signs: " . implode(', ', $dangerSigns);
        }

        return implode("\n", $parts) ?: "No significant background information available.";
    }

    /**
     * Build the Assessment component for SBAR.
     *
     * @param ClinicalSession $session
     * @param ClinicalForm|null $form
     * @return string
     */
    protected function buildAssessment(ClinicalSession $session, ?ClinicalForm $form): string
    {
        $parts = [];

        $assessment = $this->extractAssessment($form);

        if ($assessment['classification']) {
            $parts[] = "Classification: {$assessment['classification']}";
        }

        if ($assessment['severity']) {
            $parts[] = "Severity: {$assessment['severity']}";
        }

        $vitals = $this->extractVitals($form);
        if (!empty($vitals)) {
            $vitalParts = [];
            if ($vitals['respiratory_rate']) $vitalParts[] = "RR: {$vitals['respiratory_rate']}/min";
            if ($vitals['heart_rate']) $vitalParts[] = "HR: {$vitals['heart_rate']}/min";
            if ($vitals['temperature']) $vitalParts[] = "Temp: {$vitals['temperature']}°C";
            if ($vitals['spo2']) $vitalParts[] = "SpO2: {$vitals['spo2']}%";
            if (!empty($vitalParts)) {
                $parts[] = "Vitals: " . implode(', ', $vitalParts);
            }
        }

        return implode("\n", $parts) ?: "Assessment pending.";
    }

    /**
     * Build the Recommendation component for SBAR.
     *
     * @param ClinicalSession $session
     * @return string
     */
    protected function buildRecommendation(ClinicalSession $session): string
    {
        $parts = [];

        if ($session->treatment_plan) {
            $parts[] = "Treatment Plan: {$session->treatment_plan}";
        }

        // Add workflow state-based recommendations
        switch ($session->workflow_state) {
            case ClinicalSession::WORKFLOW_REFERRED:
                $parts[] = "Action Required: Accept referral and begin GP review.";
                break;
            case ClinicalSession::WORKFLOW_IN_GP_REVIEW:
                $parts[] = "Action Required: Complete assessment and initiate treatment.";
                break;
            case ClinicalSession::WORKFLOW_UNDER_TREATMENT:
                $parts[] = "Action Required: Continue treatment and monitor progress.";
                break;
        }

        return implode("\n", $parts) ?: "Continue monitoring and follow standard protocols.";
    }

    /**
     * Generate a filename for the report.
     *
     * @param ClinicalSession $session
     * @param string $type
     * @return string
     */
    protected function generateFilename(ClinicalSession $session, string $type): string
    {
        $patientCpt = $session->patient?->cpt ?? 'unknown';
        $date = now()->format('Y-m-d');
        $time = now()->format('His');

        return "report_{$type}_{$patientCpt}_{$date}_{$time}.pdf";
    }

    /**
     * Format age from months to human-readable string.
     *
     * @param int $months
     * @return string
     */
    protected function formatAge(int $months): string
    {
        if ($months < 12) {
            return "{$months} month" . ($months !== 1 ? 's' : '');
        }

        $years = floor($months / 12);
        $remainingMonths = $months % 12;

        if ($remainingMonths === 0) {
            return "{$years} year" . ($years !== 1 ? 's' : '');
        }

        return "{$years} year" . ($years !== 1 ? 's' : '') . " {$remainingMonths} month" . ($remainingMonths !== 1 ? 's' : '');
    }

    /**
     * Format a danger sign field name to a human-readable label.
     *
     * @param string $field
     * @return string
     */
    protected function formatDangerSignLabel(string $field): string
    {
        $labels = [
            'unableToDrink' => 'Unable to drink',
            'convulsions' => 'Convulsions',
            'lethargic' => 'Lethargic/unconscious',
            'vomitingEverything' => 'Vomiting everything',
            'chestIndrawing' => 'Chest indrawing',
            'stridor' => 'Stridor',
            'severeWasting' => 'Severe wasting',
        ];

        return $labels[$field] ?? Str::headline($field);
    }
}
