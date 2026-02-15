<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class OutputValidator
{
    protected array $denyPhrases;
    protected array $warningPhrases;

    public function __construct()
    {
        $this->denyPhrases = config('ai_policy.deny', []);
        $this->warningPhrases = config('ai_policy.warnings', []);
    }

    /**
     * Validate AI output for safety.
     *
     * @param string $output The AI-generated output
     * @param string $task The task that generated this output
     * @return array{valid: bool, output: string, warnings: array, blocked: array}
     */
    public function validate(string $output, string $task): array
    {
        $blocked = [];
        $warnings = [];
        $sanitizedOutput = $output;

        // Check for blocked phrases
        foreach ($this->denyPhrases as $phrase) {
            if ($this->containsPhrase($sanitizedOutput, $phrase)) {
                $blocked[] = $phrase;
                Log::warning('OutputValidator: Blocked phrase detected', [
                    'phrase' => $phrase,
                    'task' => $task,
                ]);
            }
        }

        // Check for warning phrases
        foreach ($this->warningPhrases as $phrase) {
            if ($this->containsPhrase($sanitizedOutput, $phrase)) {
                $warnings[] = $phrase;
            }
        }

        // If blocked phrases found, sanitize the output
        if (!empty($blocked)) {
            $sanitizedOutput = $this->sanitize($sanitizedOutput, $blocked);
        }

        return [
            'valid' => empty($blocked),
            'output' => $sanitizedOutput,
            'warnings' => $warnings,
            'blocked' => $blocked,
        ];
    }

    /**
     * Check if output contains a phrase (case-insensitive).
     */
    protected function containsPhrase(string $output, string $phrase): bool
    {
        return Str::contains(strtolower($output), strtolower($phrase));
    }

    /**
     * Sanitize output by redacting blocked phrases.
     */
    protected function sanitize(string $output, array $blockedPhrases): string
    {
        foreach ($blockedPhrases as $phrase) {
            // Case-insensitive replacement
            $output = preg_replace(
                '/' . preg_quote($phrase, '/') . '/i',
                '[REDACTED]',
                $output
            );
        }

        // Add disclaimer
        $disclaimer = "\n\n[Note: This response was modified by the safety system. Please verify all clinical decisions with appropriate medical staff.]";
        
        return $output . $disclaimer;
    }

    /**
     * Validate that output is appropriate for the given role.
     *
     * @param string $output The AI-generated output
     * @param string $role The user's role
     * @param string $task The task
     * @return array{valid: bool, reason: string|null}
     */
    public function validateForRole(string $output, string $role, string $task): array
    {
        // Managers should not receive clinical recommendations
        if ($role === 'manager') {
            $clinicalTerms = ['diagnosis', 'treatment', 'prescribe', 'medication'];
            foreach ($clinicalTerms as $term) {
                if ($this->containsPhrase($output, $term)) {
                    return [
                        'valid' => false,
                        'reason' => "Output contains clinical terminology inappropriate for manager role",
                    ];
                }
            }
        }

        // Nurses should not receive specialist-level recommendations
        if ($role === 'nurse') {
            $specialistTerms = ['specialist review', 'refer immediately', 'consult specialist'];
            foreach ($specialistTerms as $term) {
                if ($this->containsPhrase($output, $term)) {
                    // This is a warning, not a block
                    Log::info('OutputValidator: Specialist terminology in nurse output', [
                        'term' => $term,
                        'task' => $task,
                    ]);
                }
            }
        }

        return [
            'valid' => true,
            'reason' => null,
        ];
    }

    /**
     * Check if output contains potential hallucination indicators.
     *
     * @param string $output The AI-generated output
     * @return array{has_hallucination_risk: bool, indicators: array}
     */
    public function checkHallucinationRisk(string $output): array
    {
        $indicators = [];
        
        // Check for specific patterns that might indicate hallucination
        $patterns = [
            '/specific dosage of \d+/',
            '/exactly \d+ (mg|ml|tablets)/',
            '/I (definitely|certainly|absolutely) (recommend|prescribe|diagnose)/',
            '/the (patient|child) (definitely|certainly) has/',
            '/this is (definitely|certainly) (a|an) (diagnosis|condition)/',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, strtolower($output))) {
                $indicators[] = "Potential overconfident medical claim detected";
            }
        }

        // Check for made-up references
        if (preg_match('/according to (study|research|guidelines) \d{4}/i', $output)) {
            $indicators[] = "Potential fabricated reference detected";
        }

        return [
            'has_hallucination_risk' => !empty($indicators),
            'indicators' => array_unique($indicators),
        ];
    }

    /**
     * Add safety framing to the output.
     */
    public function addSafetyFraming(string $output, string $task): string
    {
        // Don't add framing if already present
        if (str_contains($output, 'clinical decision support')) {
            return $output;
        }

        $taskConfig = config("ai_policy.tasks.{$task}", []);
        $description = $taskConfig['description'] ?? $task;

        $header = "**Clinical Decision Support - {$description}**\n\n";
        $footer = "\n\n---\n*This is clinical decision support information. All decisions should be verified by qualified medical staff.*";

        return $header . $output . $footer;
    }

    /**
     * Full validation pipeline.
     *
     * @param string $output The AI-generated output
     * @param string $task The task
     * @param string $role The user's role
     * @return array{valid: bool, output: string, warnings: array, blocked: array, risk_flags: array}
     */
    public function fullValidation(string $output, string $task, string $role): array
    {
        // Step 1: Basic phrase validation
        $phraseResult = $this->validate($output, $task);

        // Step 2: Role-based validation
        $roleResult = $this->validateForRole($phraseResult['output'], $role, $task);

        // Step 3: Hallucination check
        $hallucinationResult = $this->checkHallucinationRisk($phraseResult['output']);

        // Combine results
        $isValid = $phraseResult['valid'] && $roleResult['valid'];
        
        $riskFlags = [];
        if (!$roleResult['valid']) {
            $riskFlags[] = $roleResult['reason'];
        }
        if ($hallucinationResult['has_hallucination_risk']) {
            $riskFlags = array_merge($riskFlags, $hallucinationResult['indicators']);
        }

        // Add safety framing if valid
        $finalOutput = $isValid 
            ? $this->addSafetyFraming($phraseResult['output'], $task)
            : $phraseResult['output'];

        return [
            'valid' => $isValid,
            'output' => $finalOutput,
            'warnings' => $phraseResult['warnings'],
            'blocked' => $phraseResult['blocked'],
            'risk_flags' => $riskFlags,
        ];
    }
}
