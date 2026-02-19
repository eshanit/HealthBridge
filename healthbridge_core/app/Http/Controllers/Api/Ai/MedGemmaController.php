<?php

namespace App\Http\Controllers\Api\Ai;

use App\Ai\Agents\TriageExplanationAgent;
use App\Ai\Agents\TreatmentReviewAgent;
use App\Ai\Tools\DosageCalculatorTool;
use App\Ai\Tools\IMCIClassificationTool;
use App\Http\Controllers\Controller;
use App\Models\AiRequest;
use App\Services\Ai\AiCacheService;
use App\Services\Ai\AiErrorHandler;
use App\Services\Ai\AiMonitor;
use App\Services\Ai\AiRateLimiter;
use App\Services\Ai\ContextBuilder;
use App\Services\Ai\OllamaClient;
use App\Services\Ai\OutputValidator;
use App\Services\Ai\PromptBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Laravel\Ai\Facades\Prism;
use Laravel\Ai\PrismRequest;
use Laravel\Ai\Enums\Provider;

/**
 * MedGemma AI Controller - Phase 4 Implementation
 *
 * This controller handles AI completion requests for clinical decision support
 * using the Laravel AI SDK's Prism facade for direct AI calls with streaming
 * and structured output support.
 *
 * Phase 4 adds:
 * - Intelligent caching with AiCacheService
 * - Comprehensive error handling with AiErrorHandler
 * - Multi-level rate limiting with AiRateLimiter
 * - Metrics collection and monitoring with AiMonitor
 *
 * @see https://laravel.com/docs/ai#prism-facade
 */
class MedGemmaController extends Controller
{
    protected PromptBuilder $promptBuilder;
    protected ContextBuilder $contextBuilder;
    protected OutputValidator $outputValidator;
    protected OllamaClient $ollamaClient;
    protected AiCacheService $cacheService;
    protected AiErrorHandler $errorHandler;
    protected AiRateLimiter $rateLimiter;
    protected AiMonitor $monitor;

    /**
     * Task to Agent mapping for SDK-based processing.
     */
    protected array $taskAgents = [
        'explain_triage' => TriageExplanationAgent::class,
        'review_treatment' => TreatmentReviewAgent::class,
    ];

    /**
     * Task to structured output schema mapping.
     */
    protected array $taskSchemas = [
        'explain_triage' => 'triageExplanation',
        'review_treatment' => 'treatmentReview',
        'imci_classification' => 'imciClassification',
    ];

    /**
     * Tasks that support streaming.
     */
    protected array $streamableTasks = [
        'explain_triage',
        'review_treatment',
        'clinical_assistance',
    ];

    public function __construct(
        PromptBuilder $promptBuilder,
        ContextBuilder $contextBuilder,
        OutputValidator $outputValidator,
        OllamaClient $ollamaClient,
        AiCacheService $cacheService,
        AiErrorHandler $errorHandler,
        AiRateLimiter $rateLimiter,
        AiMonitor $monitor
    ) {
        $this->promptBuilder = $promptBuilder;
        $this->contextBuilder = $contextBuilder;
        $this->outputValidator = $outputValidator;
        $this->ollamaClient = $ollamaClient;
        $this->cacheService = $cacheService;
        $this->errorHandler = $errorHandler;
        $this->rateLimiter = $rateLimiter;
        $this->monitor = $monitor;
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
        $userRole = $request->attributes->get('ai_user_role', 'unknown');

        // Apply rate limiting
        $rateLimitResult = $this->rateLimiter->attempt($task, $user->id, $userRole);
        if (!$rateLimitResult['allowed']) {
            $this->monitor->recordRequest([
                'task' => $task,
                'user_id' => $user->id,
                'success' => false,
                'latency_ms' => 0,
                'error' => 'Rate limit exceeded',
                'from_cache' => false,
            ]);

            return response()->json([
                'success' => false,
                'error' => 'Rate limit exceeded',
                'retry_after' => $rateLimitResult['retry_after'],
                'limits' => $rateLimitResult['limits'],
            ], 429)->withHeaders($rateLimitResult['headers']);
        }

        // Check if streaming is requested and supported
        if ($request->input('stream', false) && in_array($task, $this->streamableTasks)) {
            return $this->handleStreamingRequest($request, $task, $user, $userRole);
        }

        // Use SDK with Prism facade
        if (config('ai.use_sdk_agents', false)) {
            return $this->handleWithPrism($request, $task, $user, $userRole, $startTime);
        }

        // Fall back to legacy OllamaClient
        return $this->handleWithLegacyClient($request, $task, $user, $userRole, $startTime);
    }

    /**
     * Handle request using Laravel AI SDK Prism facade.
     *
     * This method uses the Prism facade for direct AI calls with structured output
     * and automatic schema validation. Phase 4 adds caching, error handling, and monitoring.
     */
    protected function handleWithPrism(
        Request $request,
        string $task,
        $user,
        string $userRole,
        float $startTime
    ): JsonResponse {
        try {
            // Build context using existing ContextBuilder
            $context = $this->contextBuilder->build($task, $request->all());

            // Check cache first
            $cacheKey = $this->cacheService->generateKey($task, $context, $request->all());
            $cachedResponse = $this->cacheService->get($cacheKey, $task);

            if ($cachedResponse !== null) {
                $latencyMs = round((microtime(true) - $startTime) * 1000);

                // Record cache hit in monitor
                $this->monitor->recordRequest([
                    'task' => $task,
                    'user_id' => $user->id,
                    'success' => true,
                    'latency_ms' => $latencyMs,
                    'from_cache' => true,
                ]);

                return response()->json([
                    'success' => true,
                    'task' => $task,
                    'response' => $cachedResponse['response'],
                    'structured' => $cachedResponse['structured'] ?? false,
                    'request_id' => $cachedResponse['request_id'],
                    'metadata' => array_merge($cachedResponse['metadata'], [
                        'from_cache' => true,
                        'latency_ms' => $latencyMs,
                    ]),
                ]);
            }

            // Build prompt using existing PromptBuilder
            $promptResult = $this->promptBuilder->build($task, $context);

            // Create Prism request with structured output
            $prismRequest = Prism::request()
                ->using(Provider::Ollama)
                ->withModel(config('ai.providers.ollama.model', 'gemma3:4b'))
                ->withPrompt($promptResult['prompt'])
                ->withTemperature($promptResult['metadata']['temperature'] ?? 0.3)
                ->withMaxTokens($promptResult['metadata']['max_tokens'] ?? 500);

            // Add structured output schema if applicable
            if (isset($this->taskSchemas[$task])) {
                $prismRequest = $this->applyStructuredOutput($prismRequest, $task);
            }

            // Add tools if applicable
            $prismRequest = $this->applyTools($prismRequest, $task);

            // Execute the request
            $response = $prismRequest->generate();

            // Get the response content
            $content = $response->content;

            // Validate output using OutputValidator
            $validationResult = $this->outputValidator->fullValidation(
                is_array($content) ? json_encode($content) : $content,
                $task,
                $userRole
            );

            // Calculate latency
            $latencyMs = round((microtime(true) - $startTime) * 1000);

            // Log the request
            $aiRequest = $this->logRequest([
                'user_id' => $user->id,
                'task' => $task,
                'prompt' => $promptResult['prompt'],
                'response' => is_array($content) ? json_encode($content) : $validationResult['output'],
                'prompt_version' => 'prism_' . $task,
                'model' => config('ai.providers.ollama.model'),
                'latency_ms' => $latencyMs,
                'was_overridden' => !$validationResult['valid'],
                'risk_flags' => array_merge(
                    $validationResult['blocked'],
                    $validationResult['risk_flags']
                ),
                'context' => $context,
                'metadata' => [
                    'provider' => 'prism',
                    'structured_output' => isset($this->taskSchemas[$task]),
                    'warnings' => $validationResult['warnings'],
                ],
            ]);

            // Prepare response data
            $responseData = [
                'success' => true,
                'task' => $task,
                'response' => is_array($content) ? $content : $validationResult['output'],
                'structured' => is_array($content),
                'request_id' => $aiRequest->request_uuid,
                'metadata' => [
                    'provider' => 'prism',
                    'model' => config('ai.providers.ollama.model'),
                    'latency_ms' => $latencyMs,
                    'structured_output' => isset($this->taskSchemas[$task]),
                    'warnings' => $validationResult['warnings'],
                    'was_modified' => !$validationResult['valid'] || !empty($validationResult['blocked']),
                    'from_cache' => false,
                ],
            ];

            // Cache the response if validation passed and no modifications
            if ($validationResult['valid'] && empty($validationResult['blocked'])) {
                $this->cacheService->put($cacheKey, $responseData, $task);
            }

            // Record in monitor
            $this->monitor->recordRequest([
                'task' => $task,
                'user_id' => $user->id,
                'success' => true,
                'latency_ms' => $latencyMs,
                'from_cache' => false,
                'validation_passed' => $validationResult['valid'],
            ]);

            return response()->json($responseData);

        } catch (\Exception $e) {
            // Handle error with AiErrorHandler
            $errorResult = $this->errorHandler->handle($e, [
                'task' => $task,
                'user_id' => $user->id,
                'context' => $context ?? [],
            ]);

            // Record error in monitor
            $this->monitor->recordRequest([
                'task' => $task,
                'user_id' => $user->id,
                'success' => false,
                'latency_ms' => round((microtime(true) - $startTime) * 1000),
                'from_cache' => false,
                'error' => $errorResult['category'],
            ]);

            // Check recovery strategy
            if ($errorResult['recovery_strategy'] === 'fallback') {
                Log::info('Falling back to legacy OllamaClient due to error', [
                    'error_category' => $errorResult['category'],
                ]);
                return $this->handleWithLegacyClient($request, $task, $user, $userRole, $startTime);
            }

            if ($errorResult['recovery_strategy'] === 'cache') {
                $staleCache = $this->cacheService->getStale($cacheKey ?? '', $task);
                if ($staleCache !== null) {
                    Log::info('Returning stale cache due to error', [
                        'error_category' => $errorResult['category'],
                    ]);
                    return response()->json(array_merge($staleCache, [
                        'metadata' => array_merge($staleCache['metadata'] ?? [], [
                            'stale_cache' => true,
                            'error' => $errorResult['message'],
                        ]),
                    ]));
                }
            }

            return response()->json([
                'success' => false,
                'error' => $errorResult['message'],
                'category' => $errorResult['category'],
                'severity' => $errorResult['severity'],
            ], $errorResult['status_code']);
        }
    }

    /**
     * Handle streaming request using Server-Sent Events.
     *
     * GET/POST /api/ai/stream
     */
    public function stream(Request $request)
    {
        $user = Auth::user();
        $task = $request->input('task');
        $userRole = $request->attributes->get('ai_user_role', 'unknown');

        if (!in_array($task, $this->streamableTasks)) {
            return response()->json([
                'success' => false,
                'error' => 'Task does not support streaming',
                'streamable_tasks' => $this->streamableTasks,
            ], 400);
        }

        return response()->stream(function () use ($request, $task, $user, $userRole) {
            $startTime = microtime(true);

            try {
                // Build context and prompt
                $context = $this->contextBuilder->build($task, $request->all());
                $promptResult = $this->promptBuilder->build($task, $context);

                // Create streaming Prism request
                $prismRequest = Prism::request()
                    ->using(Provider::Ollama)
                    ->withModel(config('ai.providers.ollama.model', 'gemma3:4b'))
                    ->withPrompt($promptResult['prompt'])
                    ->withTemperature($promptResult['metadata']['temperature'] ?? 0.3)
                    ->withMaxTokens($promptResult['metadata']['max_tokens'] ?? 500);

                // Stream the response
                $accumulatedContent = '';
                $stream = $prismRequest->stream();

                foreach ($stream as $chunk) {
                    $content = $chunk->content ?? '';
                    $accumulatedContent .= $content;

                    // Send SSE event
                    echo "data: " . json_encode([
                        'chunk' => $content,
                        'done' => false,
                        'timestamp' => now()->toIso8601String(),
                    ]) . "\n\n";

                    // Flush output
                    if (ob_get_level() > 0) {
                        ob_flush();
                    }
                    flush();
                }

                // Validate the complete response
                $validationResult = $this->outputValidator->fullValidation(
                    $accumulatedContent,
                    $task,
                    $userRole
                );

                // Log the request
                $this->logRequest([
                    'user_id' => $user->id,
                    'task' => $task,
                    'prompt' => $promptResult['prompt'],
                    'response' => $validationResult['output'],
                    'prompt_version' => 'prism_stream_' . $task,
                    'model' => config('ai.providers.ollama.model'),
                    'latency_ms' => round((microtime(true) - $startTime) * 1000),
                    'was_overridden' => !$validationResult['valid'],
                    'risk_flags' => array_merge(
                        $validationResult['blocked'],
                        $validationResult['risk_flags']
                    ),
                    'context' => $context,
                    'metadata' => [
                        'provider' => 'prism_stream',
                        'warnings' => $validationResult['warnings'],
                    ],
                ]);

                // Send completion event
                echo "data: " . json_encode([
                    'done' => true,
                    'latency_ms' => round((microtime(true) - $startTime) * 1000),
                    'validation' => [
                        'valid' => $validationResult['valid'],
                        'warnings' => $validationResult['warnings'],
                    ],
                ]) . "\n\n";

            } catch (\Exception $e) {
                Log::error('Streaming failed', [
                    'task' => $task,
                    'error' => $e->getMessage(),
                ]);

                echo "data: " . json_encode([
                    'error' => true,
                    'message' => 'Streaming failed: ' . $e->getMessage(),
                    'done' => true,
                ]) . "\n\n";
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
            'Connection' => 'keep-alive',
        ]);
    }

    /**
     * Handle structured output request with JSON schema validation.
     *
     * POST /api/ai/structured
     */
    public function structured(Request $request): JsonResponse
    {
        $startTime = microtime(true);
        $user = Auth::user();
        $task = $request->input('task');
        $userRole = $request->attributes->get('ai_user_role', 'unknown');

        if (!isset($this->taskSchemas[$task])) {
            return response()->json([
                'success' => false,
                'error' => 'Task does not support structured output',
                'supported_tasks' => array_keys($this->taskSchemas),
            ], 400);
        }

        try {
            // Build context and prompt
            $context = $this->contextBuilder->build($task, $request->all());
            $promptResult = $this->promptBuilder->build($task, $context);

            // Create Prism request with structured output
            $prismRequest = Prism::request()
                ->using(Provider::Ollama)
                ->withModel(config('ai.providers.ollama.model', 'gemma3:4b'))
                ->withPrompt($promptResult['prompt'])
                ->withTemperature($promptResult['metadata']['temperature'] ?? 0.3)
                ->withMaxTokens($promptResult['metadata']['max_tokens'] ?? 500);

            // Apply structured output schema
            $prismRequest = $this->applyStructuredOutput($prismRequest, $task);

            // Execute with structured output
            $response = $prismRequest->generate();
            $structuredData = $response->structured;

            // Validate the structured output against schema
            $schemaValidation = $this->validateStructuredOutput($structuredData, $task);

            if (!$schemaValidation['valid']) {
                Log::warning('Structured output schema validation failed', [
                    'task' => $task,
                    'errors' => $schemaValidation['errors'],
                ]);

                return response()->json([
                    'success' => false,
                    'error' => 'Schema validation failed',
                    'details' => $schemaValidation['errors'],
                ], 422);
            }

            // Apply clinical safety validation
            $validationResult = $this->outputValidator->fullValidation(
                json_encode($structuredData),
                $task,
                $userRole
            );

            // Log the request
            $aiRequest = $this->logRequest([
                'user_id' => $user->id,
                'task' => $task,
                'prompt' => $promptResult['prompt'],
                'response' => json_encode($structuredData),
                'prompt_version' => 'prism_structured_' . $task,
                'model' => config('ai.providers.ollama.model'),
                'latency_ms' => round((microtime(true) - $startTime) * 1000),
                'was_overridden' => !$validationResult['valid'],
                'risk_flags' => array_merge(
                    $validationResult['blocked'],
                    $validationResult['risk_flags']
                ),
                'context' => $context,
                'metadata' => [
                    'provider' => 'prism_structured',
                    'schema_valid' => true,
                    'warnings' => $validationResult['warnings'],
                ],
            ]);

            return response()->json([
                'success' => true,
                'task' => $task,
                'data' => $structuredData,
                'schema' => $this->getSchemaDefinition($task),
                'request_id' => $aiRequest->request_uuid,
                'metadata' => [
                    'provider' => 'prism_structured',
                    'model' => config('ai.providers.ollama.model'),
                    'latency_ms' => round((microtime(true) - $startTime) * 1000),
                    'schema_validation' => $schemaValidation,
                    'clinical_validation' => [
                        'valid' => $validationResult['valid'],
                        'warnings' => $validationResult['warnings'],
                    ],
                ],
            ]);
        } catch (\Exception $e) {
            Log::error('Structured output request failed', [
                'task' => $task,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'error' => 'Structured output generation failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Apply structured output schema to Prism request.
     */
    protected function applyStructuredOutput(PrismRequest $request, string $task): PrismRequest
    {
        $schema = $this->getSchemaDefinition($task);

        if (empty($schema)) {
            return $request;
        }

        return $request->withStructuredOutput($schema);
    }

    /**
     * Apply tools to Prism request based on task.
     */
    protected function applyTools(PrismRequest $request, string $task): PrismRequest
    {
        $tools = [];

        // Add dosage calculator for treatment-related tasks
        if (Str::contains($task, ['treatment', 'medication', 'dosage'])) {
            $tools[] = new DosageCalculatorTool();
        }

        // Add IMCI classification for pediatric tasks
        if (Str::contains($task, ['imci', 'pediatric', 'child'])) {
            $tools[] = new IMCIClassificationTool();
        }

        if (!empty($tools)) {
            return $request->withTools($tools);
        }

        return $request;
    }

    /**
     * Get schema definition for structured output.
     */
    protected function getSchemaDefinition(string $task): array
    {
        return match ($task) {
            'explain_triage' => [
                'type' => 'object',
                'required' => ['triage_category', 'category_rationale', 'key_findings', 'danger_signs_present', 'immediate_actions', 'confidence_level'],
                'properties' => [
                    'triage_category' => [
                        'type' => 'string',
                        'enum' => ['emergency', 'urgent', 'routine', 'self_care'],
                        'description' => 'The triage category assigned to the patient',
                    ],
                    'category_rationale' => [
                        'type' => 'string',
                        'description' => 'Explanation of why this category was assigned',
                    ],
                    'key_findings' => [
                        'type' => 'array',
                        'items' => ['type' => 'string'],
                        'description' => 'Key clinical findings that influenced the triage',
                    ],
                    'danger_signs_present' => [
                        'type' => 'array',
                        'items' => ['type' => 'string'],
                        'description' => 'Danger signs identified in the patient presentation',
                    ],
                    'immediate_actions' => [
                        'type' => 'array',
                        'items' => ['type' => 'string'],
                        'description' => 'Immediate actions required based on triage',
                    ],
                    'recommended_investigations' => [
                        'type' => 'array',
                        'items' => ['type' => 'string'],
                        'description' => 'Recommended tests or investigations',
                    ],
                    'referral_recommendation' => [
                        'type' => 'string',
                        'enum' => ['immediate', 'within_24h', 'within_week', 'not_required'],
                        'description' => 'Referral urgency recommendation',
                    ],
                    'follow_up_instructions' => [
                        'type' => 'array',
                        'items' => ['type' => 'string'],
                        'description' => 'Instructions for patient follow-up',
                    ],
                    'confidence_level' => [
                        'type' => 'string',
                        'enum' => ['high', 'medium', 'low'],
                        'description' => 'Confidence level of the triage assessment',
                    ],
                    'uncertainty_factors' => [
                        'type' => 'array',
                        'items' => ['type' => 'string'],
                        'description' => 'Factors contributing to uncertainty, if any',
                    ],
                ],
            ],
            'review_treatment' => [
                'type' => 'object',
                'required' => ['treatment_appropriate', 'appropriateness_rationale', 'medication_review', 'drug_interactions', 'confidence_level', 'requires_physician_review'],
                'properties' => [
                    'treatment_appropriate' => [
                        'type' => 'boolean',
                        'description' => 'Whether the treatment plan is appropriate for the diagnosis',
                    ],
                    'appropriateness_rationale' => [
                        'type' => 'string',
                        'description' => 'Explanation of the appropriateness assessment',
                    ],
                    'medication_review' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'medication' => ['type' => 'string'],
                                'dose_appropriate' => ['type' => 'boolean'],
                                'frequency_appropriate' => ['type' => 'boolean'],
                                'duration_appropriate' => ['type' => 'boolean'],
                                'concerns' => ['type' => 'array', 'items' => ['type' => 'string']],
                                'alternatives' => ['type' => 'array', 'items' => ['type' => 'string']],
                            ],
                        ],
                        'description' => 'Review of each medication in the treatment plan',
                    ],
                    'drug_interactions' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'medications' => ['type' => 'array', 'items' => ['type' => 'string']],
                                'severity' => ['type' => 'string', 'enum' => ['minor', 'moderate', 'major', 'contraindicated']],
                                'description' => ['type' => 'string'],
                                'recommendation' => ['type' => 'string'],
                            ],
                        ],
                        'description' => 'Identified drug interactions',
                    ],
                    'allergy_alerts' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'allergen' => ['type' => 'string'],
                                'conflicting_medication' => ['type' => 'string'],
                                'severity' => ['type' => 'string', 'enum' => ['mild', 'moderate', 'severe']],
                                'recommendation' => ['type' => 'string'],
                            ],
                        ],
                        'description' => 'Allergy-related alerts',
                    ],
                    'recommended_modifications' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'current' => ['type' => 'string'],
                                'recommended' => ['type' => 'string'],
                                'rationale' => ['type' => 'string'],
                                'priority' => ['type' => 'string', 'enum' => ['critical', 'important', 'optional']],
                            ],
                        ],
                        'description' => 'Recommended modifications to the treatment plan',
                    ],
                    'confidence_level' => [
                        'type' => 'string',
                        'enum' => ['high', 'medium', 'low'],
                        'description' => 'Confidence level of the review',
                    ],
                    'requires_physician_review' => [
                        'type' => 'boolean',
                        'description' => 'Whether this case requires physician review before proceeding',
                    ],
                ],
            ],
            'imci_classification' => [
                'type' => 'object',
                'required' => ['age_months', 'classifications', 'overall', 'requires_urgent_referral'],
                'properties' => [
                    'age_months' => [
                        'type' => 'integer',
                        'minimum' => 2,
                        'maximum' => 60,
                        'description' => 'Child age in months',
                    ],
                    'age_category' => [
                        'type' => 'string',
                        'enum' => ['infant', 'child'],
                        'description' => 'Age category for IMCI',
                    ],
                    'classifications' => [
                        'type' => 'object',
                        'description' => 'IMCI classifications by condition',
                        'additionalProperties' => [
                            'type' => 'object',
                            'properties' => [
                                'color' => ['type' => 'string', 'enum' => ['severe', 'moderate', 'mild', 'no_disease']],
                                'classification' => ['type' => 'string'],
                                'signs_present' => ['type' => 'object'],
                                'action' => ['type' => 'string'],
                                'treatment' => ['type' => 'object'],
                            ],
                        ],
                    ],
                    'overall' => [
                        'type' => 'object',
                        'properties' => [
                            'color' => ['type' => 'string', 'enum' => ['severe', 'moderate', 'mild', 'no_disease']],
                            'primary_condition' => ['type' => 'string'],
                            'action_summary' => ['type' => 'string'],
                        ],
                    ],
                    'requires_urgent_referral' => [
                        'type' => 'boolean',
                        'description' => 'Whether urgent referral is required',
                    ],
                ],
            ],
            default => [],
        };
    }

    /**
     * Validate structured output against schema.
     */
    protected function validateStructuredOutput(array $data, string $task): array
    {
        $schema = $this->getSchemaDefinition($task);
        $errors = [];

        if (empty($schema)) {
            return ['valid' => true, 'errors' => []];
        }

        // Check required fields
        foreach ($schema['required'] ?? [] as $requiredField) {
            if (!isset($data[$requiredField])) {
                $errors[] = "Missing required field: {$requiredField}";
            }
        }

        // Validate field types and enums
        foreach ($schema['properties'] as $field => $fieldSchema) {
            if (!isset($data[$field])) {
                continue;
            }

            $value = $data[$field];

            // Type validation
            $expectedType = $fieldSchema['type'] ?? null;
            if ($expectedType && !$this->validateType($value, $expectedType)) {
                $errors[] = "Field {$field} has invalid type. Expected: {$expectedType}";
            }

            // Enum validation
            if (isset($fieldSchema['enum']) && !in_array($value, $fieldSchema['enum'])) {
                $errors[] = "Field {$field} has invalid value. Allowed: " . implode(', ', $fieldSchema['enum']);
            }
        }

        return [
            'valid' => empty($errors),
            'errors' => $errors,
        ];
    }

    /**
     * Validate value type.
     */
    protected function validateType($value, string $type): bool
    {
        return match ($type) {
            'string' => is_string($value),
            'integer' => is_int($value),
            'number' => is_numeric($value),
            'boolean' => is_bool($value),
            'array' => is_array($value),
            'object' => is_array($value) && array_keys($value) !== range(0, count($value) - 1),
            default => true,
        };
    }

    /**
     * Handle request using legacy OllamaClient.
     */
    protected function handleWithLegacyClient(
        Request $request,
        string $task,
        $user,
        string $userRole,
        float $startTime
    ): JsonResponse {
        // Build context
        $context = $this->contextBuilder->build($task, $request->all());

        // Build prompt
        $promptResult = $this->promptBuilder->build($task, $context);

        // Generate completion
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

        // Validate output
        $validationResult = $this->outputValidator->fullValidation(
            $generateResult['response'],
            $task,
            $userRole
        );

        // Log the request
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

        // Get health score from monitor
        $healthScore = $this->monitor->getHealthScore();
        $alerts = $this->monitor->getActiveAlerts();

        return response()->json([
            'status' => $available && $hasModel && $healthScore >= 70 ? 'healthy' : 'unhealthy',
            'health_score' => $healthScore,
            'ollama' => [
                'available' => $available,
                'model' => $model,
                'model_loaded' => $hasModel,
            ],
            'sdk' => [
                'configured' => config('ai.default') !== null,
                'provider' => config('ai.default'),
                'agents_enabled' => config('ai.use_sdk_agents', false),
                'prism_available' => class_exists(Prism::class),
            ],
            'features' => [
                'streaming' => true,
                'structured_output' => true,
                'tools' => true,
                'caching' => true,
                'rate_limiting' => true,
                'monitoring' => true,
            ],
            'alerts' => $alerts,
            'timestamp' => now()->toIso8601String(),
        ], $available ? 200 : 503);
    }

    /**
     * Get monitoring dashboard data.
     *
     * GET /api/ai/monitoring
     */
    public function monitoring(Request $request): JsonResponse
    {
        $user = Auth::user();
        
        // Only allow admins and doctors to access monitoring
        if (!in_array($user->role, ['admin', 'doctor'])) {
            return response()->json([
                'success' => false,
                'error' => 'Unauthorized access to monitoring data',
            ], 403);
        }

        $period = $request->input('period', 'hour');

        return response()->json([
            'success' => true,
            'period' => $period,
            'metrics' => $this->monitor->getMetrics($period),
            'health_score' => $this->monitor->getHealthScore(),
            'alerts' => $this->monitor->getActiveAlerts(),
            'cache_stats' => $this->cacheService->getStats(),
            'rate_limit_stats' => $this->rateLimiter->getStats(),
            'timestamp' => now()->toIso8601String(),
        ]);
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
                    'supports_streaming' => in_array($taskName, $this->streamableTasks),
                    'supports_structured_output' => isset($this->taskSchemas[$taskName]),
                    'schema_fields' => isset($this->taskSchemas[$taskName]) 
                        ? array_keys($this->getSchemaDefinition($taskName)['properties'] ?? [])
                        : [],
                ];
            }
        }

        return response()->json([
            'role' => $userRole,
            'tasks' => $tasks,
            'sdk_enabled' => config('ai.use_sdk_agents', false),
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
