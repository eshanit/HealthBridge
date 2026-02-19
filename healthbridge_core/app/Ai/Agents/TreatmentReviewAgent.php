<?php

namespace App\Ai\Agents;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Attributes\Provider;
use Laravel\Ai\Attributes\Temperature;
use Laravel\Ai\Attributes\MaxTokens;
use Laravel\Ai\Enums\Lab;

/**
 * Treatment Review Agent
 *
 * Reviews treatment plans for safety, appropriateness, and alignment
 * with clinical guidelines. Provides recommendations for modifications
 * and identifies potential drug interactions or contraindications.
 *
 * This agent integrates with:
 * - PromptBuilder: Uses database-stored prompts for treatment review
 * - ContextBuilder: Fetches patient history, current medications, allergies
 * - OutputValidator: Ensures output is safe and appropriate for the user's role
 *
 * @see https://laravel.com/docs/ai#structured-output
 */
#[Provider([Lab::Ollama, Lab::OpenAI])]
#[Temperature(0.2)] // Lower temperature for more conservative recommendations
#[MaxTokens(700)]
class TreatmentReviewAgent extends ClinicalAgent
{
    /**
     * The task identifier for prompt and context building.
     */
    protected string $task = 'review_treatment';

    /**
     * Define the structured output schema for treatment reviews.
     *
     * This schema ensures the AI always returns a consistent, parseable
     * structure that can be integrated with the EMR system.
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'treatment_appropriate' => $schema->boolean()->required()
                ->description('Whether the treatment plan is appropriate for the diagnosis'),

            'appropriateness_rationale' => $schema->string()->required()
                ->description('Explanation of the appropriateness assessment'),

            'medication_review' => $schema->array()->required()
                ->items($schema->object([
                    'medication' => $schema->string()->required(),
                    'dose_appropriate' => $schema->boolean()->required(),
                    'frequency_appropriate' => $schema->boolean()->required(),
                    'duration_appropriate' => $schema->boolean()->required(),
                    'concerns' => $schema->array()->items($schema->string()),
                    'alternatives' => $schema->array()->items($schema->string()),
                ]))
                ->description('Review of each medication in the treatment plan'),

            'drug_interactions' => $schema->array()->required()
                ->items($schema->object([
                    'medications' => $schema->array()->items($schema->string())->required(),
                    'severity' => $schema->string()->enum(['minor', 'moderate', 'major', 'contraindicated']),
                    'description' => $schema->string()->required(),
                    'recommendation' => $schema->string()->required(),
                ]))
                ->description('Identified drug interactions'),

            'allergy_alerts' => $schema->array()->required()
                ->items($schema->object([
                    'allergen' => $schema->string()->required(),
                    'conflicting_medication' => $schema->string()->required(),
                    'severity' => $schema->string()->enum(['mild', 'moderate', 'severe']),
                    'recommendation' => $schema->string()->required(),
                ]))
                ->description('Allergy-related alerts'),

            'guideline_alignment' => $schema->object([
                'follows_guidelines' => $schema->boolean()->required(),
                'guideline_source' => $schema->string()->description('e.g., WHO, local guidelines'),
                'deviations' => $schema->array()->items($schema->string()),
                'justification_needed' => $schema->boolean()->required(),
            ])->required()
                ->description('Assessment of guideline alignment'),

            'recommended_modifications' => $schema->array()->required()
                ->items($schema->object([
                    'current' => $schema->string()->required(),
                    'recommended' => $schema->string()->required(),
                    'rationale' => $schema->string()->required(),
                    'priority' => $schema->string()->enum(['critical', 'important', 'optional']),
                ]))
                ->description('Recommended modifications to the treatment plan'),

            'monitoring_requirements' => $schema->array()->required()
                ->items($schema->string())
                ->description('Parameters to monitor during treatment'),

            'patient_education_points' => $schema->array()->required()
                ->items($schema->string())
                ->description('Key points for patient education'),

            'follow_up_recommendations' => $schema->object([
                'timing' => $schema->string()->required()
                    ->description('When to follow up, e.g., "3-5 days"'),
                'indications_for_earlier_return' => $schema->array()
                    ->items($schema->string())->required(),
                'investigations_to_repeat' => $schema->array()
                    ->items($schema->string()),
            ])->required()
                ->description('Follow-up recommendations'),

            'confidence_level' => $schema->string()->required()
                ->enum(['high', 'medium', 'low'])
                ->description('Confidence level of the review'),

            'requires_physician_review' => $schema->boolean()->required()
                ->description('Whether this case requires physician review before proceeding'),
        ];
    }

    /**
     * Get the tools available to this agent.
     *
     * Treatment review may need access to:
     * - Dosage calculators for verifying doses
     * - Drug interaction databases
     * - Clinical calculators for renal/hepatic function
     */
    public function tools(): iterable
    {
        return [
            // Will be added in Phase 2
            // new \App\Ai\Tools\DosageCalculatorTool(),
            // new \App\Ai\Tools\DrugInteractionTool(),
            // new \App\Ai\Tools\RenalDoseAdjustmentTool(),
        ];
    }
}
