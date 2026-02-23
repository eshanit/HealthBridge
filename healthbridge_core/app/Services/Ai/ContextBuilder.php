<?php

namespace App\Services\Ai;

use App\Models\Patient;
use App\Models\ClinicalSession;
use App\Models\ClinicalForm;
use App\Models\Referral;
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
        
        // If patient_id is provided (from GP dashboard), fetch comprehensive patient data
        if (isset($requestData['patient_id'])) {
            $context = array_merge($context, $this->fetchComprehensivePatientContext($requestData['patient_id']));
        }

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
     * Fetch comprehensive patient context for GP dashboard.
     * This includes patient demographics, clinical session, referral, and form data.
     */
    protected function fetchComprehensivePatientContext(string $patientId): array
    {
        // Patient ID could be CPT or couch_id
        $patient = Patient::where('cpt', $patientId)
            ->orWhere('couch_id', $patientId)
            ->first();

        if (!$patient) {
            Log::warning('ContextBuilder: Patient not found', ['patientId' => $patientId]);
            return [];
        }

        $context = [
            'patient_id' => $patient->cpt,
            'patient_cpt' => $patient->cpt,
            'patient_name' => trim(($patient->first_name ?? '') . ' ' . ($patient->last_name ?? '')) ?: 'Unknown',
            'age' => $this->formatAge($patient->date_of_birth),
            'age_months' => $patient->age_months,
            'gender' => $patient->gender ?? 'Unknown',
            'weight_kg' => $patient->weight_kg,
            'date_of_birth' => $patient->date_of_birth,
            'visit_count' => $patient->visit_count,
            'last_visit_at' => $patient->last_visit_at?->toIso8601String(),
        ];

        // Fetch the latest clinical session for this patient
        $session = ClinicalSession::where('patient_cpt', $patient->cpt)
            ->latest('session_created_at')
            ->first();

        if ($session) {
            $context['session_id'] = $session->couch_id;
            $context['triage_priority'] = $session->triage_priority;
            $context['triage_color'] = $session->triage_priority; // Alias for clarity
            $context['chief_complaint'] = $session->chief_complaint;
            $context['stage'] = $session->stage;
            $context['status'] = $session->status;
            $context['notes'] = $session->notes;
            $context['session_created_at'] = $session->session_created_at?->toIso8601String();
            $context['workflow_state'] = $session->workflow_state;

            // Fetch associated forms
            if ($session->form_instance_ids) {
                $forms = ClinicalForm::whereIn('couch_id', $session->form_instance_ids)->get();
                $context['forms'] = $forms->map(fn ($form) => $this->formatForm($form))->toArray();
                
                // Extract vitals and danger signs from forms
                foreach ($forms as $form) {
                    if ($form->answers) {
                        $context['vitals'] = $this->extractVitalsFromAnswers($form->answers);
                        $context['danger_signs'] = $this->extractDangerSignsFromAnswers($form->answers);
                    }
                    if ($form->calculated) {
                        $context['calculated'] = $form->calculated;
                        if (isset($form->calculated['danger_signs'])) {
                            $context['danger_signs'] = array_merge(
                                $context['danger_signs'] ?? [],
                                $form->calculated['danger_signs']
                            );
                        }
                    }
                }
            }
        }

        // Fetch referral data through session
        if ($session) {
            $referral = Referral::where('session_couch_id', $session->couch_id)
                ->latest('created_at')
                ->first();

            if ($referral) {
                $context['referral_id'] = $referral->id;
                $context['referral_notes'] = $referral->clinical_notes ?? $referral->reason;
                $context['referred_by'] = $referral->referring_user_id;
                $context['referral_status'] = $referral->status;
                $context['referral_priority'] = $referral->priority;
                $context['referral_created_at'] = $referral->created_at?->toIso8601String();
            }
        }

        return $context;
    }

    /**
     * Extract vitals from form answers.
     */
    protected function extractVitalsFromAnswers(array $answers): array
    {
        $vitals = [];
        
        $vitalFields = [
            'rr' => ['rr', 'respiratory_rate', 'resp_rate'],
            'hr' => ['hr', 'heart_rate', 'pulse'],
            'temp' => ['temp', 'temperature', 'temp_c'],
            'spo2' => ['spo2', 'oxygen_saturation', 'o2_sat'],
            'weight' => ['weight', 'weight_kg'],
        ];

        foreach ($vitalFields as $key => $fieldNames) {
            foreach ($fieldNames as $field) {
                if (isset($answers[$field]) && is_numeric($answers[$field])) {
                    $vitals[$key] = $answers[$field];
                    break;
                }
            }
        }

        return $vitals;
    }

    /**
     * Extract danger signs from form answers.
     */
    protected function extractDangerSignsFromAnswers(array $answers): array
    {
        $dangerSigns = [];
        
        $dangerSignFields = [
            'cyanosis', 'stridor', 'chest_indrawing', 'severe_respiratory_distress',
            'unable_to_drink', 'convulsions', 'lethargic', 'unconscious',
            'severe_dehydration', 'severe_pallor', 'severe_anemia',
        ];

        foreach ($dangerSignFields as $field) {
            if (isset($answers[$field]) && $answers[$field] === true) {
                $dangerSigns[] = $this->humanizeKey($field);
            }
        }

        return $dangerSigns;
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
            'gp_chat' => $this->enrichGpChat($context),
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

        // Format vitals for display
        if (isset($context['vitals'])) {
            $context['vitals'] = $this->formatVitals($context['vitals']);
        } else {
            $context['vitals'] = 'No vital signs recorded';
        }

        // Format danger signs for display
        if (isset($context['danger_signs']) && !empty($context['danger_signs'])) {
            $dangerSigns = is_array($context['danger_signs']) ? $context['danger_signs'] : [$context['danger_signs']];
            $context['danger_signs'] = implode("\n- ", array_unique($dangerSigns));
            $context['danger_signs'] = "- " . $context['danger_signs'];
        } else {
            $context['danger_signs'] = 'No danger signs identified';
        }

        // Ensure we have default values for required fields
        $context['patient_name'] = $context['patient_name'] ?? 'Unknown';
        $context['patient_cpt'] = $context['patient_cpt'] ?? $context['patient_id'] ?? 'Unknown';
        $context['age'] = $context['age'] ?? 'Unknown';
        $context['gender'] = $context['gender'] ?? 'Unknown';
        $context['weight_kg'] = $context['weight_kg'] ?? 'Unknown';
        $context['chief_complaint'] = $context['chief_complaint'] ?? $context['chiefComplaint'] ?? 'Not specified';
        $context['triage_priority'] = $context['triage_priority'] ?? $context['triage_color'] ?? 'Unknown';
        $context['referred_by'] = $context['referred_by'] ?? 'Not specified';
        $context['referral_notes'] = $context['referral_notes'] ?? 'None';
        $context['findings'] = $context['findings'] ?? 'No clinical findings recorded';

        return $context;
    }

    /**
     * Format vitals for display.
     */
    protected function formatVitals(array $vitals): string
    {
        $formatted = [];
        
        $labels = [
            'rr' => 'Respiratory Rate',
            'hr' => 'Heart Rate',
            'temp' => 'Temperature',
            'spo2' => 'SpO2',
            'weight' => 'Weight',
        ];

        foreach ($labels as $key => $label) {
            if (isset($vitals[$key])) {
                $unit = match($key) {
                    'rr' => 'breaths/min',
                    'hr' => 'bpm',
                    'temp' => '°C',
                    'spo2' => '%',
                    'weight' => 'kg',
                    default => '',
                };
                $formatted[] = "- {$label}: {$vitals[$key]} {$unit}";
            }
        }

        return empty($formatted) ? 'No vital signs recorded' : implode("\n", $formatted);
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
        // Set referral reason from chief complaint or referral notes
        if (!isset($context['referralReason'])) {
            $context['referralReason'] = $context['chief_complaint'] 
                ?? $context['referral_notes'] 
                ?? 'Not specified';
        }

        // Build clinical history from available data
        if (!isset($context['clinicalHistory'])) {
            $history = [];
            if (isset($context['chief_complaint'])) {
                $history[] = "Chief Complaint: " . $context['chief_complaint'];
            }
            if (isset($context['notes'])) {
                $history[] = "Clinical Notes: " . $context['notes'];
            }
            if (isset($context['referral_notes'])) {
                $history[] = "Referral Notes: " . $context['referral_notes'];
            }
            $context['clinicalHistory'] = !empty($history) ? implode("\n", $history) : 'No clinical history available';
        }

        // Format findings from forms
        if (!isset($context['findings'])) {
            $findings = [];
            if (isset($context['vitals']) && is_array($context['vitals'])) {
                $findings[] = "Vital Signs:";
                foreach ($context['vitals'] as $key => $value) {
                    $findings[] = "  - {$key}: {$value}";
                }
            }
            if (isset($context['danger_signs']) && !empty($context['danger_signs'])) {
                $dangerSigns = is_array($context['danger_signs']) ? $context['danger_signs'] : [$context['danger_signs']];
                $findings[] = "Danger Signs: " . implode(', ', $dangerSigns);
            }
            if (isset($context['forms'])) {
                foreach ($context['forms'] as $form) {
                    if (isset($form['answers']) && is_array($form['answers'])) {
                        $findings[] = "Form Findings:";
                        foreach ($form['answers'] as $key => $value) {
                            if (is_bool($value)) {
                                $value = $value ? 'Yes' : 'No';
                            }
                            if (!is_array($value)) {
                                $findings[] = "  - {$key}: {$value}";
                            }
                        }
                    }
                }
            }
            $context['findings'] = !empty($findings) ? implode("\n", $findings) : 'No clinical findings recorded';
        }

        // Set tests - placeholder as we don't have lab/imaging data
        if (!isset($context['tests'])) {
            $context['tests'] = 'No tests or imaging recorded for this visit';
        }

        // Ensure required fields
        $context['age'] = $context['age'] ?? 'Unknown';
        $context['gender'] = $context['gender'] ?? 'Unknown';

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
        } elseif (isset($context['danger_signs']) && !empty($context['danger_signs'])) {
            $dangerSigns = is_array($context['danger_signs']) ? $context['danger_signs'] : [$context['danger_signs']];
            $context['dangerSigns'] = implode("\n- ", $dangerSigns);
            $context['dangerSigns'] = "- " . $context['dangerSigns'];
        } else {
            $context['dangerSigns'] = 'No danger signs identified';
        }

        // Format vital signs
        if (!isset($context['vitalSigns'])) {
            if (isset($context['vitals']) && is_array($context['vitals'])) {
                $vitalSigns = [];
                foreach ($context['vitals'] as $key => $value) {
                    $vitalSigns[] = "{$key}: {$value}";
                }
                $context['vitalSigns'] = implode("\n", $vitalSigns);
            } else {
                $context['vitalSigns'] = 'No vital signs recorded';
            }
        }

        // Set chief complaint
        if (!isset($context['chiefComplaint'])) {
            $context['chiefComplaint'] = $context['chief_complaint'] ?? 'Not specified';
        }

        // Set actions taken
        if (!isset($context['actionsTaken'])) {
            $context['actionsTaken'] = $context['notes'] ?? 'No actions recorded yet';
        }

        // Ensure required fields
        $context['age'] = $context['age'] ?? 'Unknown';
        $context['gender'] = $context['gender'] ?? 'Unknown';

        return $context;
    }

    /**
     * Enrich context for clinical_summary task.
     */
    protected function enrichClinicalSummary(array $context): array
    {
        $context['visitDate'] = $context['session_created_at'] ?? now()->toIso8601String();
        
        // Set chief complaint
        if (!isset($context['chiefComplaint'])) {
            $context['chiefComplaint'] = $context['chief_complaint'] ?? 'Not specified';
        }

        // Build assessment from available data
        if (!isset($context['assessment'])) {
            $assessment = [];
            if (isset($context['triage_priority'])) {
                $assessment[] = "Triage: " . $context['triage_priority'];
            }
            if (isset($context['danger_signs']) && !empty($context['danger_signs'])) {
                $dangerSigns = is_array($context['danger_signs']) ? $context['danger_signs'] : [$context['danger_signs']];
                $assessment[] = "Danger Signs: " . implode(', ', $dangerSigns);
            }
            if (isset($context['notes'])) {
                $assessment[] = "Notes: " . $context['notes'];
            }
            $context['assessment'] = !empty($assessment) ? implode("\n", $assessment) : 'Assessment pending';
        }

        // Build treatment from available data
        if (!isset($context['treatment'])) {
            $context['treatment'] = $context['referral_notes'] ?? 'Treatment to be determined';
        }

        // Ensure required fields
        $context['age'] = $context['age'] ?? 'Unknown';
        $context['gender'] = $context['gender'] ?? 'Unknown';

        return $context;
    }

    /**
     * Enrich context for handoff_report task.
     */
    protected function enrichHandoffReport(array $context): array
    {
        // Ensure SBAR components are available
        if (!isset($context['situation'])) {
            $context['situation'] = $context['chief_complaint'] ?? 'Unknown patient situation';
        }

        if (!isset($context['background'])) {
            $background = [];
            if (isset($context['age'])) {
                $background[] = "Age: " . $context['age'];
            }
            if (isset($context['gender'])) {
                $background[] = "Gender: " . $context['gender'];
            }
            if (isset($context['visit_count'])) {
                $background[] = "Visit Count: " . $context['visit_count'];
            }
            $context['background'] = !empty($background) ? implode(", ", $background) : 'No background available';
        }

        if (!isset($context['assessment'])) {
            $assessment = [];
            if (isset($context['triage_priority'])) {
                $assessment[] = "Triage: " . $context['triage_priority'];
            }
            if (isset($context['danger_signs']) && !empty($context['danger_signs'])) {
                $dangerSigns = is_array($context['danger_signs']) ? $context['danger_signs'] : [$context['danger_signs']];
                $assessment[] = "Danger Signs: " . implode(', ', $dangerSigns);
            }
            $context['assessment'] = !empty($assessment) ? implode("\n", $assessment) : 'Assessment pending';
        }

        if (!isset($context['recommendation'])) {
            $context['recommendation'] = $context['referral_notes'] ?? 'Continue monitoring and treatment as ordered';
        }

        // Set location
        if (!isset($context['location'])) {
            $context['location'] = 'GP Clinic';
        }

        // Ensure required fields
        $context['age'] = $context['age'] ?? 'Unknown';
        $context['gender'] = $context['gender'] ?? 'Unknown';

        return $context;
    }

    /**
     * Enrich context for gp_chat task.
     * This prepares context for the Specialist GP Chat agent.
     */
    protected function enrichGpChat(array $context): array
    {
        // Format vitals for display
        if (isset($context['vitals'])) {
            $context['vitals'] = $this->formatVitals($context['vitals']);
        } else {
            $context['vitals'] = 'No vital signs recorded';
        }

        // Format danger signs for display
        if (isset($context['danger_signs']) && !empty($context['danger_signs'])) {
            $dangerSigns = is_array($context['danger_signs']) ? $context['danger_signs'] : [$context['danger_signs']];
            $context['danger_signs'] = implode("\n- ", array_unique($dangerSigns));
            $context['danger_signs'] = "- " . $context['danger_signs'];
        } else {
            $context['danger_signs'] = 'No danger signs identified';
        }

        // Ensure we have default values for required fields
        $context['age'] = $context['age'] ?? 'Unknown';
        $context['gender'] = $context['gender'] ?? 'Unknown';
        $context['triage_priority'] = $context['triage_priority'] ?? $context['triage_color'] ?? 'Unknown';
        $context['chief_complaint'] = $context['chief_complaint'] ?? 'Not specified';
        $context['user_question'] = $context['user_question'] ?? 'How can I help?';
        $context['conversation_history'] = $context['conversation_history'] ?? 'No previous conversation.';

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
