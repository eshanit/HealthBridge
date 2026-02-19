<?php

namespace App\Ai\Agents;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Attributes\Provider;
use Laravel\Ai\Attributes\Temperature;
use Laravel\Ai\Attributes\MaxTokens;
use Laravel\Ai\Enums\Lab;

/**
 * Triage Explanation Agent
 *
 * Provides clinical decision support for triage decisions, explaining
 * the rationale behind triage categories and identifying warning signs.
 *
 * This agent integrates with:
 * - PromptBuilder: Uses database-stored prompts for triage explanation
 * - ContextBuilder: Fetches patient vitals, danger signs, and symptoms
 * - OutputValidator: Ensures output is safe and appropriate for the user's role
 *
 * @see https://laravel.com/docs/ai#structured-output
 */
#[Provider([Lab::Ollama, Lab::OpenAI])]
#[Temperature(0.3)]
#[MaxTokens(600)]
class TriageExplanationAgent extends ClinicalAgent
{
    /**
     * The task identifier for prompt and context building.
     */
    protected string $task = 'explain_triage';

    /**
     * Define the structured output schema for triage explanations.
     *
     * This schema ensures the AI always returns a consistent, parseable
     * structure that can be integrated with the EMR system.
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'triage_category' => $schema->string()->required()
                ->enum(['emergency', 'urgent', 'routine', 'self_care'])
                ->description('The triage category assigned to the patient'),

            'category_rationale' => $schema->string()->required()
                ->description('Explanation of why this category was assigned'),

            'key_findings' => $schema->array()->required()
                ->items($schema->string())
                ->description('Key clinical findings that influenced the triage'),

            'danger_signs_present' => $schema->array()->required()
                ->items($schema->string())
                ->description('Danger signs identified in the patient presentation'),

            'immediate_actions' => $schema->array()->required()
                ->items($schema->string())
                ->description('Immediate actions required based on triage'),

            'recommended_investigations' => $schema->array()->required()
                ->items($schema->string())
                ->description('Recommended tests or investigations'),

            'referral_recommendation' => $schema->string()->required()
                ->enum(['immediate', 'within_24h', 'within_week', 'not_required'])
                ->description('Referral urgency recommendation'),

            'follow_up_instructions' => $schema->array()->required()
                ->items($schema->string())
                ->description('Instructions for patient follow-up'),

            'confidence_level' => $schema->string()->required()
                ->enum(['high', 'medium', 'low'])
                ->description('Confidence level of the triage assessment'),

            'uncertainty_factors' => $schema->array()->required()
                ->items($schema->string())
                ->description('Factors contributing to uncertainty, if any'),
        ];
    }

    /**
     * Get the tools available to this agent.
     *
     * Triage explanation may need access to clinical calculators
     * for vital sign interpretation.
     */
    public function tools(): iterable
    {
        return [
            // Will be added in Phase 2
            // new \App\Ai\Tools\VitalSignsCalculator(),
            // new \App\Ai\Tools\IMCIClassificationTool(),
        ];
    }
}
