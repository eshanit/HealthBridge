<?php

namespace App\Http\Controllers\Api\Ai;

use App\Http\Controllers\Controller;
use App\Models\AiRequest;
use App\Services\Ai\ContextBuilder;
use App\Services\Ai\OllamaClient;
use App\Services\Ai\OutputValidator;
use App\Services\Ai\PromptBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

class MedGemmaController extends Controller
{
    protected PromptBuilder $promptBuilder;
    protected ContextBuilder $contextBuilder;
    protected OutputValidator $outputValidator;
    protected OllamaClient $ollamaClient;

    public function __construct(
        PromptBuilder $promptBuilder,
        ContextBuilder $contextBuilder,
        OutputValidator $outputValidator,
        OllamaClient $ollamaClient
    ) {
        $this->promptBuilder = $promptBuilder;
        $this->contextBuilder = $contextBuilder;
        $this->outputValidator = $outputValidator;
        $this->ollamaClient = $ollamaClient;
    }

    /**
     * Handle AI completion request.
     *
     * POST /api/ai/medgemma
     */
    public function __invoke(Request $request): JsonResponse
    {
        $startTime = microtime(true);
        $user = Auth::user();
        $task = $request->input('task');
        $taskConfig = $request->attributes->get('ai_task_config', []);
        $userRole = $request->attributes->get('ai_user_role', 'unknown');

        // Step 1: Build context
        $context = $this->contextBuilder->build($task, $request->all());

        // Step 2: Build prompt
        $promptResult = $this->promptBuilder->build($task, $context);

        // Step 3: Generate completion
        $generateResult = $this->ollamaClient->generate($promptResult['prompt'], [
            'temperature' => $promptResult['metadata']['temperature'],
            'max_tokens' => $promptResult['metadata']['max_tokens'],
            'model' => $promptResult['metadata']['model'],
        ]);

        if (!$generateResult['success']) {
            return $this->errorResponse(
                'AI generation failed',
                $generateResult['error'],
                503
            );
        }

        // Step 4: Validate output
        $validationResult = $this->outputValidator->fullValidation(
            $generateResult['response'],
            $task,
            $userRole
        );

        // Step 5: Log the request
        $aiRequest = $this->logRequest([
            'user_id' => $user->id,
            'task' => $task,
            'prompt' => $promptResult['prompt'],
            'response' => $validationResult['output'],
            'prompt_version' => $promptResult['version'],
            'model' => $generateResult['metadata']['model'],
            'latency_ms' => $generateResult['metadata']['latency_ms'],
            'was_overridden' => !$validationResult['valid'],
            'risk_flags' => array_merge(
                $validationResult['blocked'],
                $validationResult['risk_flags']
            ),
            'context' => $context,
            'metadata' => [
                'prompt_id' => $promptResult['metadata']['prompt_id'],
                'warnings' => $validationResult['warnings'],
                'blocked' => $validationResult['blocked'],
                'eval_count' => $generateResult['metadata']['eval_count'],
            ],
        ]);

        // Step 6: Return response
        return response()->json([
            'success' => true,
            'task' => $task,
            'response' => $validationResult['output'],
            'request_id' => $aiRequest->request_uuid,
            'metadata' => [
                'prompt_version' => $promptResult['version'],
                'model' => $generateResult['metadata']['model'],
                'latency_ms' => $generateResult['metadata']['latency_ms'],
                'warnings' => $validationResult['warnings'],
                'was_modified' => !$validationResult['valid'] || !empty($validationResult['blocked']),
            ],
        ]);
    }

    /**
     * Check AI service health.
     *
     * GET /api/ai/health
     */
    public function health(): JsonResponse
    {
        $available = $this->ollamaClient->isAvailable();
        $model = config('ai_policy.ollama.model');
        $hasModel = $this->ollamaClient->hasModel($model);

        return response()->json([
            'status' => $available && $hasModel ? 'healthy' : 'unhealthy',
            'ollama' => [
                'available' => $available,
                'model' => $model,
                'model_loaded' => $hasModel,
            ],
            'timestamp' => now()->toIso8601String(),
        ], $available ? 200 : 503);
    }

    /**
     * Get available tasks for the current user.
     *
     * GET /api/ai/tasks
     */
    public function tasks(): JsonResponse
    {
        $user = Auth::user();
        $userRole = $this->getUserRole($user);
        $allowedTasks = config("ai_policy.roles.{$userRole}", []);
        
        $tasks = [];
        foreach ($allowedTasks as $taskName) {
            $taskConfig = config("ai_policy.tasks.{$taskName}");
            if ($taskConfig) {
                $tasks[] = [
                    'name' => $taskName,
                    'description' => $taskConfig['description'] ?? '',
                    'max_tokens' => $taskConfig['max_tokens'] ?? 500,
                ];
            }
        }

        return response()->json([
            'role' => $userRole,
            'tasks' => $tasks,
        ]);
    }

    /**
     * Return an error response.
     */
    protected function errorResponse(string $message, string $detail, int $status): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error' => $message,
            'detail' => $detail,
        ], $status);
    }

    /**
     * Log the AI request to the database.
     */
    protected function logRequest(array $data): AiRequest
    {
        return AiRequest::create([
            'request_uuid' => $this->generateUuid(),
            'user_id' => $data['user_id'],
            'session_couch_id' => $data['context']['sessionId'] ?? null,
            'form_couch_id' => $data['context']['formInstanceId'] ?? null,
            'form_section_id' => $data['context']['formSectionId'] ?? null,
            'form_field_id' => $data['context']['formFieldId'] ?? null,
            'form_schema_id' => $data['context']['formSchemaId'] ?? $data['context']['schemaId'] ?? null,
            'task' => $data['task'],
            'use_case' => $data['task'],
            'prompt_version' => $data['prompt_version'],
            'prompt' => $data['prompt'],
            'response' => $data['response'],
            'model' => $data['model'],
            'latency_ms' => $data['latency_ms'],
            'was_overridden' => $data['was_overridden'],
            'risk_flags' => $data['risk_flags'],
            'requested_at' => now(),
        ]);
    }

    /**
     * Generate a unique UUID for the request.
     */
    protected function generateUuid(): string
    {
        return 'ai_' . bin2hex(random_bytes(16));
    }

    /**
     * Get the user's primary role.
     */
    protected function getUserRole($user): string
    {
        if (method_exists($user, 'getRoleNames')) {
            return $user->getRoleNames()->first() ?? 'unknown';
        }

        return $user->role ?? 'unknown';
    }
}
