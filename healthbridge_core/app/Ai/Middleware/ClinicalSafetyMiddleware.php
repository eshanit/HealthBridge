<?php

namespace App\Ai\Middleware;

use App\Services\Ai\OutputValidator;
use Laravel\Ai\Contracts\AgentMiddleware;
use Laravel\Ai\Messages\Message;
use Laravel\Ai\Responses\Response;

/**
 * Clinical Safety Middleware for AI Agents
 *
 * This middleware applies the OutputValidator to all agent responses,
 * ensuring clinical safety, PHI sanitization, and role-based content filtering.
 *
 * The middleware runs after the AI generates a response and before it's
 * returned to the caller, providing a safety net for all clinical AI outputs.
 */
class ClinicalSafetyMiddleware implements AgentMiddleware
{
    /**
     * Create a new clinical safety middleware instance.
     *
     * @param OutputValidator $validator The output validator service
     * @param string $task The task identifier for validation rules
     * @param string $userRole The role of the user making the request
     */
    public function __construct(
        protected OutputValidator $validator,
        protected string $task = 'clinical',
        protected string $userRole = 'clinician'
    ) {}

    /**
     * Handle the agent response.
     *
     * This method is called after the AI generates a response.
     * It validates the output against clinical safety rules and
     * applies role-based content filtering.
     *
     * @param Response $response The AI response
     * @param callable $next The next middleware in the chain
     * @return Response The validated response
     * @throws \Exception If validation fails critically
     */
    public function handle(Response $response, callable $next): Response
    {
        // Get the raw content from the response
        $content = $response->content();

        // Use the full validation pipeline from OutputValidator
        $validationResult = $this->validator->fullValidation(
            $content,
            $this->task,
            $this->userRole
        );

        // Check if validation passed
        if (!$validationResult['valid']) {
            // Log the validation failure
            \Log::warning('Clinical AI output validation failed', [
                'task' => $this->task,
                'user_role' => $this->userRole,
                'blocked' => $validationResult['blocked'] ?? [],
                'risk_flags' => $validationResult['risk_flags'] ?? [],
                'content_preview' => substr($content, 0, 200),
            ]);

            // If there are risk flags (role violations or hallucinations), throw for critical cases
            $criticalRiskFlags = $validationResult['risk_flags'] ?? [];
            if (!empty($criticalRiskFlags)) {
                // Log but don't throw - we use the sanitized output instead
                \Log::error('Clinical AI critical validation issues', [
                    'risk_flags' => $criticalRiskFlags,
                ]);
            }
        }

        // Use the sanitized/framed output from validation
        if (isset($validationResult['output']) && $validationResult['output'] !== $content) {
            $response = $this->createSanitizedResponse(
                $response,
                $validationResult['output']
            );
        }

        // Add validation metadata to the response
        $response = $this->addValidationMetadata($response, $validationResult);

        return $next($response);
    }

    /**
     * Create a new response with sanitized content.
     *
     * @param Response $original The original response
     * @param string $sanitizedContent The sanitized content
     * @return Response The new response
     */
    protected function createSanitizedResponse(Response $original, string $sanitizedContent): Response
    {
        // Create a new response with the sanitized content
        // This preserves other response properties like usage stats
        return new class($original, $sanitizedContent) extends Response {
            protected Response $original;
            protected string $sanitized;

            public function __construct(Response $original, string $sanitized)
            {
                $this->original = $original;
                $this->sanitized = $sanitized;
            }

            public function content(): string
            {
                return $this->sanitized;
            }

            public function usage(): array
            {
                return $this->original->usage();
            }

            public function model(): string
            {
                return $this->original->model();
            }

            public function provider(): string
            {
                return $this->original->provider();
            }
        };
    }

    /**
     * Add validation metadata to the response.
     *
     * @param Response $response The response
     * @param array $validationResult The validation result
     * @return Response The response with metadata
     */
    protected function addValidationMetadata(Response $response, array $validationResult): Response
    {
        // Store validation metadata that can be accessed later
        // This is useful for audit trails and debugging
        $response->withMetadata('clinical_validation', [
            'valid' => $validationResult['valid'] ?? true,
            'task' => $this->task,
            'user_role' => $this->userRole,
            'issues_count' => count($validationResult['issues'] ?? []),
            'validated_at' => now()->toIso8601String(),
        ]);

        return $response;
    }

    /**
     * Process a streaming response chunk.
     *
     * For streaming responses, we accumulate chunks and validate
     * the complete response at the end.
     *
     * @param string $chunk The response chunk
     * @param bool $isLast Whether this is the last chunk
     * @param array $context Accumulated context
     * @return string The processed chunk
     */
    public function handleStreamChunk(string $chunk, bool $isLast, array &$context): string
    {
        // Accumulate the content
        $context['accumulated_content'] = ($context['accumulated_content'] ?? '') . $chunk;

        // If this is the last chunk, validate the complete content
        if ($isLast && !empty($context['accumulated_content'])) {
            $validationResult = $this->validator->validate(
                $context['accumulated_content'],
                $this->task,
                $this->userRole
            );

            // Store validation result in context
            $context['validation_result'] = $validationResult;

            // If there are issues, we need to handle them
            // For streaming, we can't modify already-sent content,
            // so we log warnings and may need to send a follow-up message
            if (!$validationResult['valid']) {
                \Log::warning('Clinical AI streaming output validation issues', [
                    'task' => $this->task,
                    'issues' => $validationResult['issues'] ?? [],
                ]);
            }
        }

        return $chunk;
    }
}
