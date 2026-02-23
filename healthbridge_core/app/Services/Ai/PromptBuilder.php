<?php

namespace App\Services\Ai;

use App\Models\PromptVersion;
use Illuminate\Support\Facades\Log;

class PromptBuilder
{
    /**
     * Build a prompt for the given task and context.
     *
     * @param string $task The AI task to perform
     * @param array $context The context data for the prompt
     * @param string|null $promptVersion Optional specific prompt version to use
     * @return array{prompt: string, version: string, metadata: array}
     */
    public function build(string $task, array $context = [], ?string $promptVersion = null): array
    {
        // Try to get the prompt from the database
        $version = $this->getPromptVersion($task, $promptVersion);
        
        if ($version) {
            return $this->buildFromVersion($version, $context);
        }

        // Fallback to default prompts
        return $this->buildDefaultPrompt($task, $context);
    }

    /**
     * Get the prompt version from the database.
     */
    protected function getPromptVersion(string $task, ?string $versionId = null): ?PromptVersion
    {
        $query = PromptVersion::where('task', $task);
        
        if ($versionId) {
            return $query->where('version', $versionId)->first();
        }

        // Get the active version
        return $query->where('is_active', true)->latest()->first();
    }

    /**
     * Build prompt from a stored version.
     */
    protected function buildFromVersion(PromptVersion $version, array $context): array
    {
        $prompt = $version->prompt_template;
        
        // Replace placeholders with context values
        $prompt = $this->interpolate($prompt, $context);

        return [
            'prompt' => $prompt,
            'version' => $version->version,
            'metadata' => [
                'task' => $version->task,
                'model' => $version->model,
                'temperature' => $version->temperature ?? config("ai_policy.tasks.{$version->task}.temperature", 0.3),
                'max_tokens' => $version->max_tokens ?? config("ai_policy.tasks.{$version->task}.max_tokens", 500),
                'prompt_id' => $version->id,
            ],
        ];
    }

    /**
     * Build a default prompt when no version is stored.
     */
    protected function buildDefaultPrompt(string $task, array $context): array
    {
        $template = $this->getDefaultTemplate($task);
        $prompt = $this->interpolate($template, $context);
        
        $taskConfig = config("ai_policy.tasks.{$task}", []);

        return [
            'prompt' => $prompt,
            'version' => 'default',
            'metadata' => [
                'task' => $task,
                'model' => config('ai_policy.ollama.model'),
                'temperature' => $taskConfig['temperature'] ?? 0.3,
                'max_tokens' => $taskConfig['max_tokens'] ?? 500,
                'prompt_id' => null,
            ],
        ];
    }

    /**
     * Interpolate context values into the prompt template.
     */
    protected function interpolate(string $template, array $context): string
    {
        foreach ($context as $key => $value) {
            if (is_array($value)) {
                $value = json_encode($value, JSON_PRETTY_PRINT);
            }
            $template = str_replace("{{{$key}}}", $value, $template);
        }

        return $template;
    }

    /**
     * Get default prompt templates for each task.
     */
    protected function getDefaultTemplate(string $task): string
    {
        return match ($task) {
            'explain_triage' => $this->explainTriageTemplate(),
            'caregiver_summary' => $this->caregiverSummaryTemplate(),
            'symptom_checklist' => $this->symptomChecklistTemplate(),
            'treatment_review' => $this->treatmentReviewTemplate(),
            'specialist_review' => $this->specialistReviewTemplate(),
            'red_case_analysis' => $this->redCaseAnalysisTemplate(),
            'clinical_summary' => $this->clinicalSummaryTemplate(),
            'handoff_report' => $this->handoffReportTemplate(),
            'gp_chat' => $this->specialistGpChatTemplate(),
            default => $this->genericTemplate($task),
        };
    }

    /**
     * Default template for explain_triage task.
     */
    protected function explainTriageTemplate(): string
    {
        return <<<'PROMPT'
You are a clinical support AI assistant with direct access to the patient database. Provide a comprehensive clinical explanation for the following patient:

**PATIENT IDENTIFICATION:**
- Name: {{patient_name}}
- MRN (CPT): {{patient_cpt}}

**PATIENT DEMOGRAPHICS:**
- Age: {{age}}
- Gender: {{gender}}
- Weight: {{weight_kg}} kg

**CLINICAL PRESENTATION:**
- Chief Complaint: {{chief_complaint}}
- Triage Priority: {{triage_priority}} (RED=Emergency, YELLOW=Urgent, GREEN=Routine)

**VITAL SIGNS:**
{{vitals}}

**DANGER SIGNS IDENTIFIED:**
{{danger_signs}}

**CLINICAL FINDINGS:**
{{findings}}

**REFERRAL INFORMATION:**
- Referred by: {{referred_by}}
- Referral Notes: {{referral_notes}}

---

Based on the above information, provide a detailed clinical explanation that includes:

1. **Clinical Interpretation**: Analyze the presenting symptoms and vital signs. What do these findings suggest clinically?

2. **Differential Diagnoses**: List 3-5 potential differential diagnoses to consider based on the presentation, ranked by likelihood.

3. **Triage Rationale**: Explain why this patient was assigned the {{triage_priority}} triage priority. What specific findings contributed to this classification?

4. **Immediate Actions**: What immediate actions or interventions should be considered?

5. **Red Flags**: What warning signs should be monitored that would indicate deterioration or need for escalation?

6. **Recommended Investigations**: What further tests, labs, or imaging should be considered?

7. **Clinical Decision Support**: Any additional clinical guidance relevant to this case.

**IMPORTANT**: You are providing clinical decision support, not making definitive diagnoses. All recommendations should be validated by the treating clinician. If critical information is missing, explicitly state what data is unavailable.

Format your response in a clear, professional manner suitable for clinical staff review.
PROMPT;
    }

    /**
     * Default template for caregiver_summary task.
     */
    protected function caregiverSummaryTemplate(): string
    {
        return <<<'PROMPT'
You are a clinical assistant helping create a plain-language summary for a child's caregiver.

PATIENT: {{age}} old {{gender}}
CHIEF COMPLAINT: {{chiefComplaint}}

CLINICAL ASSESSMENT:
{{findings}}

TREATMENT PLAN:
{{treatmentPlan}}

Create a simple, compassionate summary that:
1. Explains what is happening in plain language
2. Describes the treatment in simple terms
3. Lists warning signs that should prompt return to clinic
4. Provides reassurance where appropriate

Use language appropriate for a caregiver with basic education. Avoid medical jargon.
PROMPT;
    }

    /**
     * Default template for symptom_checklist task.
     */
    protected function symptomChecklistTemplate(): string
    {
        return <<<'PROMPT'
You are a clinical assistant helping generate a symptom checklist.

CHIEF COMPLAINT: {{chiefComplaint}}
PATIENT AGE: {{age}}

Generate a focused symptom checklist that the nurse should ask about, based on the chief complaint.
Format as a simple list of yes/no questions appropriate for the clinical context.

Include:
1. Key symptoms related to the chief complaint
2. Associated symptoms to rule out
3. Red flag symptoms that would escalate priority

Keep the checklist concise (maximum 10 items).
PROMPT;
    }

    /**
     * Default template for treatment_review task.
     */
    protected function treatmentReviewTemplate(): string
    {
        return <<<'PROMPT'
You are a clinical assistant reviewing a treatment plan for completeness and safety.

PATIENT: {{age}} old {{gender}}
WEIGHT: {{weight}} kg
DIAGNOSIS/ASSESSMENT: {{assessment}}

CURRENT TREATMENT PLAN:
{{treatmentPlan}}

Please review:
1. Is the treatment plan complete for this condition?
2. Are there any potential safety concerns given the patient's age/weight?
3. Are there any missing elements that should be considered?
4. Is follow-up appropriately scheduled?

Provide a concise review. Do not prescribe or change treatments - only identify potential issues for the clinician to consider.
PROMPT;
    }

    /**
     * Default template for specialist_review task.
     */
    protected function specialistReviewTemplate(): string
    {
        return <<<'PROMPT'
You are a clinical assistant preparing a case summary for specialist review. You MUST use the actual patient data provided below - do NOT return a template with placeholders.

PATIENT: {{age}} old {{gender}}
REFERRAL REASON: {{referralReason}}

CLINICAL HISTORY:
{{clinicalHistory}}

CURRENT FINDINGS:
{{findings}}

TESTS/IMAGING:
{{tests}}

Based on the ACTUAL patient data above, prepare a concise specialist handoff that includes:
1. Summary of the case (use the actual patient information, not placeholders)
2. Key clinical findings (list the actual findings from the data)
3. What has been done so far (based on available information)
4. Specific questions for the specialist (relevant to this specific case)
5. Urgency assessment (based on the actual clinical presentation)

IMPORTANT: Fill in ALL information using the actual patient data provided. Do NOT use placeholders like {{...}} in your response. If specific information is not available, state "Not available" rather than using placeholder syntax.
PROMPT;
    }

    /**
     * Default template for red_caseAnalysis task.
     */
    protected function redCaseAnalysisTemplate(): string
    {
        return <<<'PROMPT'
You are a clinical assistant analyzing a RED (emergency) case for immediate review. You MUST use the actual patient data provided below - do NOT return a template with placeholders.

PATIENT: {{age}} old {{gender}}
TRIAGE: RED - EMERGENCY

CHIEF COMPLAINT: {{chiefComplaint}}

DANGER SIGNS IDENTIFIED:
{{dangerSigns}}

VITAL SIGNS:
{{vitalSigns}}

IMMEDIATE ACTIONS TAKEN:
{{actionsTaken}}

Based on the ACTUAL patient data above, provide an immediate analysis:
1. Most likely diagnoses to consider (based on the actual symptoms and findings)
2. Critical actions that should be taken immediately (specific to this case)
3. What to prepare for potential interventions (based on likely diagnoses)
4. Key monitoring points (specific to this patient's condition)

This is an emergency case - be concise and focus on immediate clinical priorities.

IMPORTANT: Fill in ALL information using the actual patient data provided. Do NOT use placeholders like {{...}} in your response.
PROMPT;
    }

    /**
     * Default template for clinical_summary task.
     */
    protected function clinicalSummaryTemplate(): string
    {
        return <<<'PROMPT'
You are a clinical assistant creating a visit summary. You MUST use the actual patient data provided below - do NOT return a template with placeholders.

PATIENT: {{age}} old {{gender}}
VISIT DATE: {{visitDate}}

CHIEF COMPLAINT: {{chiefComplaint}}

ASSESSMENT:
{{assessment}}

TREATMENT PROVIDED:
{{treatment}}

Based on the ACTUAL patient data above, create a structured clinical summary including:
1. Presenting problem (use the actual chief complaint)
2. Key findings (from the assessment data)
3. Assessment/diagnosis (based on clinical findings)
4. Treatment provided (from the treatment data)
5. Follow-up plan (recommend based on the condition)
6. Return precautions (specific to this patient's condition)

IMPORTANT: Fill in ALL information using the actual patient data provided. Do NOT use placeholders like {{...}} in your response.
PROMPT;
    }

    /**
     * Default template for handoff_report task.
     */
    protected function handoffReportTemplate(): string
    {
        return <<<'PROMPT'
You are a clinical assistant creating an SBAR handoff report. You MUST use the actual patient data provided below - do NOT return a template with placeholders.

PATIENT: {{age}} old {{gender}}
UNIT/LOCATION: {{location}}

SITUATION:
{{situation}}

BACKGROUND:
{{background}}

ASSESSMENT:
{{assessment}}

RECOMMENDATION:
{{recommendation}}

Based on the ACTUAL patient data above, create a structured SBAR handoff report that:
1. Clearly states the current situation (use the actual chief complaint)
2. Provides relevant background (use the actual patient demographics)
3. Summarizes the clinical assessment (from the assessment data)
4. States what is needed from the receiving team (based on the recommendation)

Format for verbal handoff - clear and concise.

IMPORTANT: Fill in ALL information using the actual patient data provided. Do NOT use placeholders like {{...}} in your response.
PROMPT;
    }

    /**
     * Generic template for unknown tasks.
     */
    protected function genericTemplate(string $task): string
    {
        return <<<PROMPT
You are a clinical decision support assistant.

TASK: {$task}

CONTEXT:
{{context}}

Please provide appropriate clinical decision support for this task.
Remember: You are providing information to support clinical decisions, not making diagnoses or prescribing treatments.
PROMPT;
    }

    /**
     * Specialist GP Chat template for interactive conversation.
     * This template defines the AI as a professional Specialist GP.
     */
    protected function specialistGpChatTemplate(): string
    {
        return <<<'PROMPT'
You are a professional Specialist GP (General Practitioner) with extensive clinical experience. You provide medical guidance and answer questions in your capacity as a specialist physician.

ROLE DEFINITION:
- You are a qualified General Practitioner with specialist knowledge in primary care medicine
- You provide clinical guidance, explanations, and decision support
- You answer medical questions with professionalism and accuracy
- You always remind users that your responses are for decision support only and must be verified by a qualified healthcare provider

PATIENT CONTEXT:
- Patient Age: {{age}}
- Patient Gender: {{gender}}
- Triage Priority: {{triage_priority}}
- Chief Complaint: {{chief_complaint}}
- Vital Signs: {{vitals}}
- Danger Signs: {{danger_signs}}

CONVERSATION HISTORY:
{{conversation_history}}

USER QUESTION:
{{user_question}}

GUIDELINES FOR RESPONSE:
1. Provide accurate, evidence-based medical information
2. Use clear, professional language appropriate for healthcare professionals
3. Include relevant clinical considerations for the specific patient context
4. When appropriate, suggest additional investigations or considerations
5. Always include appropriate clinical disclaimers
6. If the question is outside your scope or requires specialist consultation, recommend appropriate referral
7. Be concise but comprehensive in your responses

Remember: You are providing clinical decision support, not making definitive diagnoses. All recommendations should be validated by the treating clinician.
PROMPT;
    }
}
