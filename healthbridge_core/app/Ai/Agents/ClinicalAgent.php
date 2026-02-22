<?php

namespace App\Ai\Agents;

use App\Services\Ai\ContextBuilder;
use App\Services\Ai\PromptBuilder;
use App\Services\Ai\OutputValidator;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Contracts\HasMiddleware;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\Contracts\Conversational;
use Laravel\Ai\Concerns\RemembersConversations;
use Laravel\Ai\Promptable;
use Laravel\Ai\Attributes\Provider;
use Laravel\Ai\Attributes\Temperature;
use Laravel\Ai\Attributes\MaxTokens;
use Laravel\Ai\Enums\Lab;
use Laravel\Ai\Messages\Message;
use Stringable;

/**
 * Base Clinical Agent for HealthBridge
 *
 * This abstract class provides the foundation for all clinical AI agents
 * in the HealthBridge system. It integrates with the Laravel AI SDK while
 * preserving the clinical-specific services (PromptBuilder, ContextBuilder,
 * OutputValidator) that provide PHI sanitization and FHIR-compliant output.
 *
 * @see https://laravel.com/docs/ai
 */
#[Provider([Lab::Ollama, Lab::OpenAI])]
#[Temperature(0.3)]
#[MaxTokens(500)]
abstract class ClinicalAgent implements Agent, HasStructuredOutput, HasMiddleware, Conversational
{
    use Promptable;
    use RemembersConversations;

    /**
     * The task identifier for this agent.
     * Override in subclasses.
     */
    protected string $task = 'clinical';

    /**
     * The patient ID for context building.
     */
    protected ?string $patientId = null;

    /**
     * Additional context data.
     */
    protected array $context = [];

    /**
     * The user making the request (for role-based validation).
     */
    protected ?object $user = null;

    /**
     * Create a new clinical agent instance.
     */
    public function __construct(
        protected PromptBuilder $promptBuilder,
        protected ContextBuilder $contextBuilder,
        protected OutputValidator $outputValidator,
    ) {}

    /**
     * Set the patient ID for context building.
     *
     * @param string $patientId The patient CPT or couch_id
     * @return static
     */
    public function forPatient(string $patientId): static
    {
        $this->patientId = $patientId;
        return $this;
    }

    /**
     * Set additional context data.
     *
     * @param array $context Additional context for the prompt
     * @return static
     */
    public function withContext(array $context): static
    {
        $this->context = array_merge($this->context, $context);
        return $this;
    }

    /**
     * Set the user making the request.
     *
     * @param object $user The authenticated user
     * @return static
     */
    public function forUser(object $user): static
    {
        $this->user = $user;
        return $this;
    }

    /**
     * Get the instructions that the agent should follow.
     *
     * This method integrates with PromptBuilder to use database-stored
     * prompts with version control and A/B testing capabilities.
     */
    public function instructions(): Stringable|string
    {
        $promptData = $this->promptBuilder->build($this->task, $this->buildContext());
        return $promptData['prompt'];
    }

    /**
     * Get the list of messages comprising the conversation so far.
     *
     * This method integrates with ContextBuilder to automatically fetch
     * patient data from MySQL/CouchDB for clinical context.
     */
    public function messages(): iterable
    {
        $context = $this->buildContext();

        if (!empty($context)) {
            // Format context as a structured message
            $contextJson = json_encode($context, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            return [
                new Message('user', "Patient Context:\n```\n{$contextJson}\n```"),
            ];
        }

        return [];
    }

    /**
     * Build clinical context using ContextBuilder.
     *
     * @return array The built context
     */
    protected function buildContext(): array
    {
        $requestData = $this->context;

        if ($this->patientId) {
            $requestData['patient_id'] = $this->patientId;
        }

        return $this->contextBuilder->build($this->task, $requestData);
    }

    /**
     * Define structured output schema.
     *
     * Override in subclasses to define task-specific schemas.
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'clinical_interpretation' => $schema->string()->required()
                ->description('Analysis of the clinical presentation'),

            'recommendations' => $schema->array()->required()
                ->items($schema->string())
                ->description('List of clinical recommendations'),

            'warnings' => $schema->array()->required()
                ->items($schema->string())
                ->description('Warning signs or red flags to monitor'),

            'confidence_level' => $schema->string()->required()
                ->enum(['high', 'medium', 'low'])
                ->description('Confidence level of the analysis'),
        ];
    }

    /**
     * Get the tools available to the agent.
     *
     * Override in subclasses to add clinical tools.
     */
    public function tools(): iterable
    {
        return [];
    }

    /**
     * Get the agent's middleware.
     *
     * Applies clinical safety validation to all responses.
     */
    public function middleware(): array
    {
        return [
            new \App\Ai\Middleware\ClinicalSafetyMiddleware(
                $this->outputValidator,
                $this->task,
                $this->user?->role ?? 'clinician'
            ),
        ];
    }

    /**
     * Get the task identifier.
     */
    public function getTask(): string
    {
        return $this->task;
    }

    /**
     * Get the configured model name.
     */
    public function getModel(): string
    {
        return config('ai.providers.ollama.model', 'gemma3:4b');
    }

    /**
     * Get the configured provider.
     */
    public function getProvider(): string
    {
        return config('ai.default', 'ollama');
    }

    /**
     * Get temperature for this agent.
     */
    public function getTemperature(): float
    {
        return config("ai_policy.tasks.{$this->task}.temperature", 0.3);
    }

    /**
     * Get max tokens for this agent.
     */
    public function getMaxTokens(): int
    {
        return config("ai_policy.tasks.{$this->task}.max_tokens", 500);
    }
}
