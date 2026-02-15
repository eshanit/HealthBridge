<?php

namespace App\Services\Ai;

use App\Models\Patient;
use App\Models\ClinicalSession;
use App\Models\ClinicalForm;
use Illuminate\Support\Facades\Log;

class ContextBuilder
{
    /**
     * Build context for the given task and request data.
     *
     * @param string $task The AI task
     * @param array $requestData The request data from the API call
     * @return array The built context
     */
    public function build(string $task, array $requestData): array
    {
        $context = $requestData['context'] ?? [];
        
        // If sessionId is provided, fetch session data
        if (isset($context['sessionId'])) {
            $context = array_merge($context, $this->fetchSessionContext($context['sessionId']));
        }

        // If patientCpt is provided, fetch patient data
        if (isset($context['patientCpt'])) {
            $context = array_merge($context, $this->fetchPatientContext($context['patientCpt']));
        }

        // If formInstanceId is provided, fetch form data
        if (isset($context['formInstanceId'])) {
            $context = array_merge($context, $this->fetchFormContext($context['formInstanceId']));
        }

        // Task-specific context enrichment
        $context = $this->enrichForTask($task, $context);

        return $context;
    }

    /**
     * Fetch session context from MySQL.
     */
    protected function fetchSessionContext(string $sessionId): array
    {
        // Try to find by couch_id or session_uuid
        $session = ClinicalSession::where('couch_id', $sessionId)
            ->orWhere('session_uuid', $sessionId)
            ->first();

        if (!$session) {
            Log::warning('ContextBuilder: Session not found', ['sessionId' => $sessionId]);
            return [];
        }

        $context = [
            'session_id' => $session->couch_id,
            'patient_cpt' => $session->patient_cpt,
            'triage_priority' => $session->triage_priority,
            'chief_complaint' => $session->chief_complaint,
            'stage' => $session->stage,
            'status' => $session->status,
            'notes' => $session->notes,
            'session_created_at' => $session->session_created_at?->toIso8601String(),
        ];

        // Fetch associated forms
        if ($session->form_instance_ids) {
            $forms = ClinicalForm::whereIn('couch_id', $session->form_instance_ids)->get();
            $context['forms'] = $forms->map(fn ($form) => $this->formatForm($form))->toArray();
        }

        return $context;
    }

    /**
     * Fetch patient context from MySQL.
     */
    protected function fetchPatientContext(string $patientCpt): array
    {
        $patient = Patient::where('cpt', $patientCpt)->first();

        if (!$patient) {
            Log::warning('ContextBuilder: Patient not found', ['patientCpt' => $patientCpt]);
            return [];
        }

        return [
            'patient_cpt' => $patient->cpt,
            'age' => $this->formatAge($patient->date_of_birth),
            'age_months' => $patient->age_months,
            'gender' => $patient->gender,
            'weight_kg' => $patient->weight_kg,
            'date_of_birth' => $patient->date_of_birth,
            'visit_count' => $patient->visit_count,
            'last_visit_at' => $patient->last_visit_at?->toIso8601String(),
        ];
    }

    /**
     * Fetch form context from MySQL.
     */
    protected function fetchFormContext(string $formId): array
    {
        $form = ClinicalForm::where('couch_id', $formId)
            ->orWhere('form_uuid', $formId)
            ->first();

        if (!$form) {
            Log::warning('ContextBuilder: Form not found', ['formId' => $formId]);
            return [];
        }

        return [
            'form_id' => $form->couch_id,
            'schema_id' => $form->schema_id,
            'status' => $form->status,
            'answers' => $form->answers,
            'calculated' => $form->calculated,
        ];
    }

    /**
     * Enrich context based on task type.
     */
    protected function enrichForTask(string $task, array $context): array
    {
        return match ($task) {
            'explain_triage' => $this->enrichExplainTriage($context),
            'caregiver_summary' => $this->enrichCaregiverSummary($context),
            'symptom_checklist' => $this->enrichSymptomChecklist($context),
            'treatment_review' => $this->enrichTreatmentReview($context),
            'specialist_review' => $this->enrichSpecialistReview($context),
            'red_case_analysis' => $this->enrichRedCaseAnalysis($context),
            'clinical_summary' => $this->enrichClinicalSummary($context),
            'handoff_report' => $this->enrichHandoffReport($context),
            default => $context,
        };
    }

    /**
     * Enrich context for explain_triage task.
     */
    protected function enrichExplainTriage(array $context): array
    {
        // Format findings for the prompt
        if (isset($context['answers'])) {
            $context['findings'] = $this->formatFindings($context['answers']);
        }

        // Add calculated values
        if (isset($context['calculated'])) {
            $context['calculated_summary'] = $this->formatCalculated($context['calculated']);
        }

        return $context;
    }

    /**
     * Enrich context for caregiver_summary task.
     */
    protected function enrichCaregiverSummary(array $context): array
    {
        // Ensure we have treatment plan information
        if (!isset($context['treatmentPlan']) && isset($context['forms'])) {
            $context['treatmentPlan'] = $this->extractTreatmentPlan($context['forms']);
        }

        return $context;
    }

    /**
     * Enrich context for symptom_checklist task.
     */
    protected function enrichSymptomChecklist(array $context): array
    {
        // Chief complaint is essential
        if (!isset($context['chiefComplaint']) && isset($context['chief_complaint'])) {
            $context['chiefComplaint'] = $context['chief_complaint'];
        }

        return $context;
    }

    /**
     * Enrich context for treatment_review task.
     */
    protected function enrichTreatmentReview(array $context): array
    {
        // Ensure weight is available for dosage calculations
        if (isset($context['weight_kg'])) {
            $context['weight'] = $context['weight_kg'];
        }

        return $context;
    }

    /**
     * Enrich context for specialist_review task.
     */
    protected function enrichSpecialistReview(array $context): array
    {
        // Build clinical history from available data
        if (!isset($context['clinicalHistory']) && isset($context['forms'])) {
            $context['clinicalHistory'] = $this->buildClinicalHistory($context['forms']);
        }

        // Format findings
        if (isset($context['answers'])) {
            $context['findings'] = $this->formatFindings($context['answers']);
        }

        return $context;
    }

    /**
     * Enrich context for red_case_analysis task.
     */
    protected function enrichRedCaseAnalysis(array $context): array
    {
        // Extract danger signs from calculated data
        if (isset($context['calculated']['danger_signs'])) {
            $context['dangerSigns'] = $context['calculated']['danger_signs'];
        }

        // Format vital signs
        if (isset($context['answers'])) {
            $context['vitalSigns'] = $this->extractVitalSigns($context['answers']);
        }

        return $context;
    }

    /**
     * Enrich context for clinical_summary task.
     */
    protected function enrichClinicalSummary(array $context): array
    {
        $context['visitDate'] = $context['session_created_at'] ?? now()->toIso8601String();

        return $context;
    }

    /**
     * Enrich context for handoff_report task.
     */
    protected function enrichHandoffReport(array $context): array
    {
        // Ensure SBAR components are available
        if (!isset($context['situation'])) {
            $context['situation'] = $context['chief_complaint'] ?? 'Unknown';
        }

        return $context;
    }

    /**
     * Format a clinical form for context.
     */
    protected function formatForm(ClinicalForm $form): array
    {
        return [
            'id' => $form->couch_id,
            'schema_id' => $form->schema_id,
            'status' => $form->status,
            'answers' => $form->answers,
            'calculated' => $form->calculated,
            'completed_at' => $form->completed_at?->toIso8601String(),
        ];
    }

    /**
     * Format age from date of birth.
     */
    protected function formatAge(?string $dateOfBirth): string
    {
        if (!$dateOfBirth) {
            return 'Unknown age';
        }

        try {
            $dob = new \DateTime($dateOfBirth);
            $now = new \DateTime();
            $diff = $dob->diff($now);

            if ($diff->y > 0) {
                return "{$diff->y} years";
            } elseif ($diff->m > 0) {
                return "{$diff->m} months";
            } else {
                return "{$diff->d} days";
            }
        } catch (\Exception $e) {
            return 'Unknown age';
        }
    }

    /**
     * Format findings from answers.
     */
    protected function formatFindings(array $answers): string
    {
        $findings = [];
        
        foreach ($answers as $key => $value) {
            if ($value === true) {
                $findings[] = "✓ " . $this->humanizeKey($key);
            } elseif ($value === false) {
                // Skip false boolean values
                continue;
            } elseif (is_numeric($value)) {
                $findings[] = $this->humanizeKey($key) . ": " . $value;
            } elseif (is_string($value) && !empty($value)) {
                $findings[] = $this->humanizeKey($key) . ": " . $value;
            }
        }

        return implode("\n", $findings);
    }

    /**
     * Format calculated values.
     */
    protected function formatCalculated(array $calculated): string
    {
        $items = [];
        
        foreach ($calculated as $key => $value) {
            $items[] = "- " . $this->humanizeKey($key) . ": " . json_encode($value);
        }

        return implode("\n", $items);
    }

    /**
     * Humanize a key for display.
     */
    protected function humanizeKey(string $key): string
    {
        return ucwords(str_replace(['_', '-'], ' ', $key));
    }

    /**
     * Extract treatment plan from forms.
     */
    protected function extractTreatmentPlan(array $forms): string
    {
        $treatments = [];

        foreach ($forms as $form) {
            if (isset($form['answers']['treatment'])) {
                $treatments[] = $form['answers']['treatment'];
            }
            if (isset($form['answers']['medications'])) {
                $treatments[] = "Medications: " . json_encode($form['answers']['medications']);
            }
        }

        return implode("\n", $treatments) ?: 'No treatment plan documented';
    }

    /**
     * Build clinical history from forms.
     */
    protected function buildClinicalHistory(array $forms): string
    {
        $history = [];

        foreach ($forms as $form) {
            $schemaId = $form['schema_id'] ?? 'Unknown form';
            $status = $form['status'] ?? 'unknown';
            $history[] = "- {$schemaId} ({$status})";
        }

        return implode("\n", $history);
    }

    /**
     * Extract vital signs from answers.
     */
    protected function extractVitalSigns(array $answers): string
    {
        $vitalKeys = [
            'respiratory_rate', 'heart_rate', 'temperature', 'oxygen_saturation',
            'weight_kg', 'blood_pressure', 'pulse_ox'
        ];

        $vitals = [];
        foreach ($vitalKeys as $key) {
            if (isset($answers[$key])) {
                $vitals[] = $this->humanizeKey($key) . ": " . $answers[$key];
            }
        }

        return implode(", ", $vitals) ?: 'Not documented';
    }
}
