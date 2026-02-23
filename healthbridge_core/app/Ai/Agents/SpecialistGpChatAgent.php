<?php

namespace App\Ai\Agents;

use App\Services\Ai\ContextBuilder;
use App\Services\Ai\PromptBuilder;
use App\Services\Ai\OutputValidator;
use Illuminate\Contracts\Auth\Authenticatable;
use Laravel\Ai\Enums\Lab;
use Stringable;

/**
 * Specialist GP Chat Agent for HealthBridge
 *
 * This agent provides interactive chat functionality with a professional
 * Specialist GP persona. It uses the RemembersConversations trait to
 * persist conversations to the database.
 *
 * @see https://laravel.com/docs/ai
 */
#[Lab([Lab::Ollama, Lab::OpenAI])]
class SpecialistGpChatAgent extends ClinicalAgent
{
    /**
     * The task identifier for this agent.
     */
    protected string $task = 'gp_chat';

    /**
     * The session/couch ID for the clinical session.
     */
    protected ?string $sessionCouchId = null;

    /**
     * Create a new Specialist GP Chat agent instance.
     */
    public function __construct(
        PromptBuilder $promptBuilder,
        ContextBuilder $contextBuilder,
        OutputValidator $outputValidator,
    ) {
        parent::__construct($promptBuilder, $contextBuilder, $outputValidator);
    }

    /**
     * Set the session/couch ID for clinical context.
     *
     * @param string $sessionCouchId The clinical session couch ID
     * @return static
     */
    public function forSession(string $sessionCouchId): static
    {
        $this->sessionCouchId = $sessionCouchId;
        return $this;
    }

    /**
     * Get the instructions that the agent should follow.
     *
     * This uses the specialistGpChatTemplate from PromptBuilder.
     */
    public function instructions(): Stringable|string
    {
        $promptData = $this->promptBuilder->build($this->task, $this->buildContext());
        return $promptData['prompt'];
    }

    /**
     * Get the list of messages comprising the conversation so far.
     *
     * For chat, we include patient context as part of the system prompt
     * rather than as separate messages.
     */
    public function messages(): iterable
    {
        // For gp_chat, context is handled in the instructions
        // The RemembersConversations trait handles the actual conversation history
        return [];
    }

    /**
     * Build clinical context for the GP chat.
     *
     * @return array The built context
     */
    protected function buildContext(): array
    {
        $requestData = $this->context;

        if ($this->patientId) {
            $requestData['patient_id'] = $this->patientId;
        }

        if ($this->sessionCouchId) {
            $requestData['session_couch_id'] = $this->sessionCouchId;
        }

        return $this->contextBuilder->build($this->task, $requestData);
    }

    /**
     * Get the tools available to the agent.
     *
     * GP Chat agent has access to clinical tools for enhanced responses.
     */
    public function tools(): iterable
    {
        // Return any clinical tools if needed
        return [];
    }

    /**
     * Get temperature for this agent.
     *
     * GP Chat uses a slightly higher temperature for more natural responses.
     */
    public function getTemperature(): float
    {
        return config("ai_policy.tasks.{$this->task}.temperature", 0.5);
    }

    /**
     * Get max tokens for this agent.
     */
    public function getMaxTokens(): int
    {
        return config("ai_policy.tasks.{$this->task}.max_tokens", 1000);
    }
}
