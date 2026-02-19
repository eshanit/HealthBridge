<?php

namespace Tests\Unit\Ai;

use App\Services\Ai\AiErrorHandler;
use Exception;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * Unit tests for AiErrorHandler service.
 *
 * @group ai-sdk-phase5
 */
#[Group('ai-sdk-phase5')]
class AiErrorHandlerTest extends TestCase
{
    protected AiErrorHandler $errorHandler;

    protected function setUp(): void
    {
        parent::setUp();
        $this->errorHandler = new AiErrorHandler();
    }

    // ==========================================
    // Instantiation Tests
    // ==========================================

    public function test_error_handler_instantiates(): void
    {
        $this->assertInstanceOf(AiErrorHandler::class, $this->errorHandler);
    }

    // ==========================================
    // Handle Method Tests
    // ==========================================

    public function test_handle_returns_complete_result_structure(): void
    {
        $exception = new Exception('Test error');
        $result = $this->errorHandler->handle($exception);

        $this->assertArrayHasKey('success', $result);
        $this->assertArrayHasKey('error', $result);
        $this->assertArrayHasKey('metadata', $result);

        $this->assertFalse($result['success']);
        $this->assertArrayHasKey('code', $result['error']);
        $this->assertArrayHasKey('category', $result['error']);
        $this->assertArrayHasKey('severity', $result['error']);
        $this->assertArrayHasKey('message', $result['error']);
        $this->assertArrayHasKey('user_message', $result['error']);
        $this->assertArrayHasKey('recovery', $result['error']);
    }

    public function test_handle_includes_context_request_id(): void
    {
        $exception = new Exception('Test error');
        $result = $this->errorHandler->handle($exception, ['request_id' => 'test-123']);

        $this->assertEquals('test-123', $result['error']['request_id']);
    }

    // ==========================================
    // Error Categorization Tests
    // ==========================================

    public function test_categorizes_timeout_error(): void
    {
        $exception = new Exception('Connection timeout occurred');
        $result = $this->errorHandler->handle($exception);

        $this->assertEquals(AiErrorHandler::CATEGORY_TIMEOUT, $result['error']['category']);
    }

    public function test_categorizes_rate_limit_error(): void
    {
        $exception = new Exception('Rate limit exceeded');
        $result = $this->errorHandler->handle($exception);

        $this->assertEquals(AiErrorHandler::CATEGORY_RATE_LIMIT, $result['error']['category']);
    }

    public function test_categorizes_safety_error(): void
    {
        $exception = new Exception('Safety validation failed');
        $result = $this->errorHandler->handle($exception);

        $this->assertEquals(AiErrorHandler::CATEGORY_SAFETY, $result['error']['category']);
    }

    public function test_categorizes_configuration_error(): void
    {
        $exception = new Exception('Service not configured');
        $result = $this->errorHandler->handle($exception);

        $this->assertEquals(AiErrorHandler::CATEGORY_CONFIGURATION, $result['error']['category']);
    }

    public function test_categorizes_unknown_error(): void
    {
        $exception = new Exception('Some random error');
        $result = $this->errorHandler->handle($exception);

        $this->assertEquals(AiErrorHandler::CATEGORY_UNKNOWN, $result['error']['category']);
    }

    // ==========================================
    // Severity Tests
    // ==========================================

    public function test_safety_errors_are_critical(): void
    {
        $exception = new Exception('Safety validation failed');
        $result = $this->errorHandler->handle($exception);

        $this->assertEquals(AiErrorHandler::SEVERITY_CRITICAL, $result['error']['severity']);
    }

    public function test_configuration_errors_are_high_severity(): void
    {
        $exception = new Exception('Service not configured');
        $result = $this->errorHandler->handle($exception);

        $this->assertEquals(AiErrorHandler::SEVERITY_HIGH, $result['error']['severity']);
    }

    public function test_timeout_errors_are_medium_severity(): void
    {
        $exception = new Exception('Connection timeout');
        $result = $this->errorHandler->handle($exception);

        $this->assertEquals(AiErrorHandler::SEVERITY_MEDIUM, $result['error']['severity']);
    }

    public function test_rate_limit_errors_are_low_severity(): void
    {
        $exception = new Exception('Rate limit exceeded');
        $result = $this->errorHandler->handle($exception);

        $this->assertEquals(AiErrorHandler::SEVERITY_LOW, $result['error']['severity']);
    }

    public function test_clinical_tasks_have_elevated_severity(): void
    {
        $exception = new Exception('Connection timeout');

        // Non-clinical context
        $resultNormal = $this->errorHandler->handle($exception, ['task' => 'general_query']);

        // Clinical context
        $resultClinical = $this->errorHandler->handle($exception, ['task' => 'explain_triage']);

        $this->assertEquals(AiErrorHandler::SEVERITY_MEDIUM, $resultNormal['error']['severity']);
        $this->assertEquals(AiErrorHandler::SEVERITY_HIGH, $resultClinical['error']['severity']);
    }

    // ==========================================
    // User Message Tests
    // ==========================================

    public function test_provides_user_friendly_message(): void
    {
        $exception = new Exception('Connection timeout');
        $result = $this->errorHandler->handle($exception);

        $this->assertNotEquals($exception->getMessage(), $result['error']['user_message']);
        $this->assertStringContainsString('try again', strtolower($result['error']['user_message']));
    }

    public function test_user_message_does_not_expose_technical_details(): void
    {
        $exception = new Exception('SQLSTATE[HY000] General error: 1146 Table doesn\'t exist');
        $result = $this->errorHandler->handle($exception);

        $this->assertStringNotContainsString('SQLSTATE', $result['error']['user_message']);
        $this->assertStringNotContainsString('Table', $result['error']['user_message']);
    }

    public function test_safety_error_has_appropriate_user_message(): void
    {
        $exception = new Exception('Safety validation failed');
        $result = $this->errorHandler->handle($exception);

        $this->assertStringContainsString('safety', strtolower($result['error']['user_message']));
    }

    // ==========================================
    // Recovery Strategy Tests
    // ==========================================

    public function test_recovery_strategy_for_timeout(): void
    {
        $exception = new Exception('Connection timeout');
        $result = $this->errorHandler->handle($exception);

        $this->assertArrayHasKey('strategy', $result['error']['recovery']);
        $this->assertArrayHasKey('suggestions', $result['error']['recovery']);
        // Strategy can be 'retry' or 'fallback' for timeout
        $this->assertContains($result['error']['recovery']['strategy'], ['retry', 'fallback']);
    }

    public function test_recovery_strategy_for_rate_limit(): void
    {
        $exception = new Exception('Rate limit exceeded');
        $result = $this->errorHandler->handle($exception);

        $this->assertEquals('degrade', $result['error']['recovery']['strategy']);
    }

    public function test_recovery_strategy_for_safety(): void
    {
        $exception = new Exception('Safety validation failed');
        $result = $this->errorHandler->handle($exception);

        $this->assertEquals('abort', $result['error']['recovery']['strategy']);
    }

    public function test_recovery_includes_max_retries(): void
    {
        $exception = new Exception('Connection timeout');
        $result = $this->errorHandler->handle($exception);

        $this->assertArrayHasKey('max_retries', $result['error']['recovery']);
        $this->assertGreaterThan(0, $result['error']['recovery']['max_retries']);
    }

    public function test_recovery_includes_retry_after(): void
    {
        $exception = new Exception('Connection timeout');
        $result = $this->errorHandler->handle($exception);

        $this->assertArrayHasKey('retry_after_seconds', $result['error']['recovery']);
    }

    // ==========================================
    // Metadata Tests
    // ==========================================

    public function test_metadata_includes_exception_class(): void
    {
        $exception = new Exception('Test error');
        $result = $this->errorHandler->handle($exception);

        $this->assertEquals(Exception::class, $result['metadata']['exception_class']);
    }

    public function test_metadata_includes_file_and_line(): void
    {
        $exception = new Exception('Test error');
        $result = $this->errorHandler->handle($exception);

        $this->assertArrayHasKey('file', $result['metadata']);
        $this->assertArrayHasKey('line', $result['metadata']);
    }

    // ==========================================
    // Error Code Tests
    // ==========================================

    public function test_error_code_format(): void
    {
        $exception = new Exception('Timeout error');
        $result = $this->errorHandler->handle($exception);

        // Error code should start with AI_
        $this->assertStringStartsWith('AI_', $result['error']['code']);
    }

    // ==========================================
    // Edge Cases
    // ==========================================

    public function test_handles_null_context(): void
    {
        $exception = new Exception('Test error');
        $result = $this->errorHandler->handle($exception, []);

        $this->assertFalse($result['success']);
    }

    public function test_handles_empty_context(): void
    {
        $exception = new Exception('Test error');
        $result = $this->errorHandler->handle($exception, []);

        $this->assertFalse($result['success']);
    }

    public function test_handles_nested_exception(): void
    {
        $previousException = new Exception('Previous error');
        $exception = new Exception('Current error', 0, $previousException);
        $result = $this->errorHandler->handle($exception);

        $this->assertFalse($result['success']);
    }

    public function test_handles_exception_with_long_message(): void
    {
        $longMessage = str_repeat('This is a long error message. ', 100);
        $exception = new Exception($longMessage);
        $result = $this->errorHandler->handle($exception);

        $this->assertFalse($result['success']);
        $this->assertEquals($longMessage, $result['error']['message']);
    }

    // ==========================================
    // Constants Tests
    // ==========================================

    public function test_category_constants_are_defined(): void
    {
        $this->assertEquals('provider', AiErrorHandler::CATEGORY_PROVIDER);
        $this->assertEquals('validation', AiErrorHandler::CATEGORY_VALIDATION);
        $this->assertEquals('safety', AiErrorHandler::CATEGORY_SAFETY);
        $this->assertEquals('timeout', AiErrorHandler::CATEGORY_TIMEOUT);
        $this->assertEquals('rate_limit', AiErrorHandler::CATEGORY_RATE_LIMIT);
        $this->assertEquals('configuration', AiErrorHandler::CATEGORY_CONFIGURATION);
        $this->assertEquals('unknown', AiErrorHandler::CATEGORY_UNKNOWN);
    }

    public function test_severity_constants_are_defined(): void
    {
        $this->assertEquals('low', AiErrorHandler::SEVERITY_LOW);
        $this->assertEquals('medium', AiErrorHandler::SEVERITY_MEDIUM);
        $this->assertEquals('high', AiErrorHandler::SEVERITY_HIGH);
        $this->assertEquals('critical', AiErrorHandler::SEVERITY_CRITICAL);
    }

    public function test_recovery_constants_are_defined(): void
    {
        $this->assertEquals('retry', AiErrorHandler::RECOVERY_RETRY);
        $this->assertEquals('fallback', AiErrorHandler::RECOVERY_FALLBACK);
        $this->assertEquals('cache', AiErrorHandler::RECOVERY_CACHE);
        $this->assertEquals('abort', AiErrorHandler::RECOVERY_ABORT);
        $this->assertEquals('degrade', AiErrorHandler::RECOVERY_DEGRADE);
    }
}
