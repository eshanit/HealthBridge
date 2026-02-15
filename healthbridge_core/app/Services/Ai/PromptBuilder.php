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
            default => $this->genericTemplate($task),
        };
    }

    /**
     * Default template for explain_triage task.
     */
    protected function explainTriageTemplate(): string
    {
        return <<<'PROMPT'
You are a clinical decision support assistant helping a nurse understand a triage classification.

PATIENT INFORMATION:
- Age: {{age}}
- Gender: {{gender}}
- Chief Complaint: {{chiefComplaint}}

CLINICAL FINDINGS:
{{findings}}

TRIAGE CLASSIFICATION: {{triagePriority}}

Please explain to the nurse:
1. Why this triage classification was assigned
2. What clinical signs contributed to this decision
3. What immediate actions are recommended
4. What warning signs to monitor

Remember: You are providing decision support, not making diagnoses. Always defer to clinical judgment.
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
You are a clinical assistant preparing a case summary for specialist review.

PATIENT: {{age}} old {{gender}}
REFERRAL REASON: {{referralReason}}

CLINICAL HISTORY:
{{clinicalHistory}}

CURRENT FINDINGS:
{{findings}}

TESTS/IMAGING:
{{tests}}

Prepare a concise specialist handoff that includes:
1. Summary of the case
2. Key clinical findings
3. What has been done so far
4. Specific questions for the specialist
5. Urgency assessment

Be thorough but concise. Focus on information relevant to the specialty.
PROMPT;
    }

    /**
     * Default template for red_caseAnalysis task.
     */
    protected function redCaseAnalysisTemplate(): string
    {
        return <<<'PROMPT'
You are a clinical assistant analyzing a RED (emergency) case for immediate review.

PATIENT: {{age}} old {{gender}}
TRIAGE: RED - EMERGENCY

CHIEF COMPLAINT: {{chiefComplaint}}

DANGER SIGNS IDENTIFIED:
{{dangerSigns}}

VITAL SIGNS:
{{vitalSigns}}

IMMEDIATE ACTIONS TAKEN:
{{actionsTaken}}

Provide an immediate analysis:
1. Most likely diagnoses to consider
2. Critical actions that should be taken immediately
3. What to prepare for potential interventions
4. Key monitoring points

This is an emergency case - be concise and focus on immediate clinical priorities.
PROMPT;
    }

    /**
     * Default template for clinical_summary task.
     */
    protected function clinicalSummaryTemplate(): string
    {
        return <<<'PROMPT'
You are a clinical assistant creating a visit summary.

PATIENT: {{age}} old {{gender}}
VISIT DATE: {{visitDate}}

CHIEF COMPLAINT: {{chiefComplaint}}

ASSESSMENT:
{{assessment}}

TREATMENT PROVIDED:
{{treatment}}

Create a structured clinical summary including:
1. Presenting problem
2. Key findings
3. Assessment/diagnosis
4. Treatment provided
5. Follow-up plan
6. Return precautions

Keep the summary concise and suitable for the medical record.
PROMPT;
    }

    /**
     * Default template for handoff_report task.
     */
    protected function handoffReportTemplate(): string
    {
        return <<<'PROMPT'
You are a clinical assistant creating an SBAR handoff report.

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

Create a structured SBAR handoff report that:
1. Clearly states the current situation
2. Provides relevant background
3. Summarizes the clinical assessment
4. States what is needed from the receiving team

Format for verbal handoff - clear and concise.
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
}
