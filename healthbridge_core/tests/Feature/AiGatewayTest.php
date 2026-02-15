<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\PromptVersion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AiGatewayTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        
        // Create a test user with nurse role
        $this->nurse = User::factory()->create();
        $this->nurse->assignRole('nurse');
        
        // Create a test user with doctor role
        $this->doctor = User::factory()->create();
        $this->doctor->assignRole('doctor');
        
        // Create a test user with manager role
        $this->manager = User::factory()->create();
        $this->manager->assignRole('manager');
    }

    /** @test */
    public function unauthenticated_user_cannot_access_ai_gateway(): void
    {
        $response = $this->postJson('/api/ai/medgemma', [
            'task' => 'explain_triage',
            'context' => [],
        ]);

        $response->assertStatus(401)
            ->assertJson([
                'error' => 'Unauthenticated',
            ]);
    }

    /** @test */
    public function request_without_task_returns_error(): void
    {
        $response = $this->actingAs($this->nurse)
            ->postJson('/api/ai/medgemma', [
                'context' => [],
            ]);

        $response->assertStatus(400)
            ->assertJson([
                'error' => 'Missing task',
            ]);
    }

    /** @test */
    public function nurse_can_access_allowed_tasks(): void
    {
        $allowedTasks = ['explain_triage', 'caregiver_summary', 'symptom_checklist'];
        
        foreach ($allowedTasks as $task) {
            // This will fail if Ollama is not running, but we're testing authorization
            $response = $this->actingAs($this->nurse)
                ->postJson('/api/ai/medgemma', [
                    'task' => $task,
                    'context' => [
                        'chiefComplaint' => 'Cough',
                        'age' => '2 years',
                        'gender' => 'male',
                    ],
                ]);

            // Should not be 403 (forbidden)
            $this->assertNotEquals(403, $response->status(), "Task {$task} should be allowed for nurse");
        }
    }

    /** @test */
    public function nurse_cannot_access_doctor_only_tasks(): void
    {
        $response = $this->actingAs($this->nurse)
            ->postJson('/api/ai/medgemma', [
                'task' => 'specialist_review',
                'context' => [],
            ]);

        $response->assertStatus(403)
            ->assertJson([
                'error' => 'Unauthorized task',
            ]);
    }

    /** @test */
    public function doctor_can_access_specialist_tasks(): void
    {
        $allowedTasks = ['specialist_review', 'red_case_analysis', 'clinical_summary', 'handoff_report'];
        
        foreach ($allowedTasks as $task) {
            $response = $this->actingAs($this->doctor)
                ->postJson('/api/ai/medgemma', [
                    'task' => $task,
                    'context' => [],
                ]);

            // Should not be 403 (forbidden)
            $this->assertNotEquals(403, $response->status(), "Task {$task} should be allowed for doctor");
        }
    }

    /** @test */
    public function manager_cannot_access_any_ai_tasks(): void
    {
        $response = $this->actingAs($this->manager)
            ->postJson('/api/ai/medgemma', [
                'task' => 'explain_triage',
                'context' => [],
            ]);

        $response->assertStatus(403);
    }

    /** @test */
    public function invalid_task_returns_error(): void
    {
        $response = $this->actingAs($this->nurse)
            ->postJson('/api/ai/medgemma', [
                'task' => 'invalid_task',
                'context' => [],
            ]);

        $response->assertStatus(400)
            ->assertJson([
                'error' => 'Invalid task',
            ]);
    }

    /** @test */
    public function health_endpoint_returns_status(): void
    {
        $response = $this->actingAs($this->nurse)
            ->getJson('/api/ai/health');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'ollama' => [
                    'available',
                    'model',
                    'model_loaded',
                ],
                'timestamp',
            ]);
    }

    /** @test */
    public function tasks_endpoint_returns_allowed_tasks(): void
    {
        $response = $this->actingAs($this->nurse)
            ->getJson('/api/ai/tasks');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'role',
                'tasks',
            ])
            ->assertJson([
                'role' => 'nurse',
            ]);
    }

    /** @test */
    public function rate_limiting_is_applied(): void
    {
        // Make multiple requests to trigger rate limit
        for ($i = 0; $i < 35; $i++) {
            $response = $this->actingAs($this->nurse)
                ->postJson('/api/ai/medgemma', [
                    'task' => 'explain_triage',
                    'context' => [],
                ]);
        }

        // The 31st request should be rate limited
        $response->assertStatus(429);
    }

    /** @test */
    public function blocked_phrases_are_sanitized(): void
    {
        // This test would require mocking the Ollama client
        // to return a response with blocked phrases
        
        // For now, we'll just verify the output validator works
        $validator = new \App\Services\Ai\OutputValidator();
        
        $result = $validator->validate(
            'I diagnose this patient with pneumonia. You should prescribe antibiotics.',
            'explain_triage'
        );
        
        $this->assertFalse($result['valid']);
        $this->assertNotEmpty($result['blocked']);
        $this->assertStringContainsString('[REDACTED]', $result['output']);
    }

    /** @test */
    public function warning_phrases_are_flagged(): void
    {
        $validator = new \App\Services\Ai\OutputValidator();
        
        $result = $validator->validate(
            'This may indicate a respiratory infection. Consider further assessment.',
            'explain_triage'
        );
        
        $this->assertTrue($result['valid']); // Warnings don't block
        $this->assertNotEmpty($result['warnings']);
    }

    /** @test */
    public function prompt_builder_creates_prompt(): void
    {
        $builder = new \App\Services\Ai\PromptBuilder();
        
        $result = $builder->build('explain_triage', [
            'age' => '2 years',
            'gender' => 'male',
            'chiefComplaint' => 'Cough and fever',
            'findings' => 'Fast breathing, chest indrawing',
            'triagePriority' => 'yellow',
        ]);
        
        $this->assertNotEmpty($result['prompt']);
        $this->assertStringContainsString('2 years', $result['prompt']);
        $this->assertStringContainsString('Cough and fever', $result['prompt']);
        $this->assertEquals('default', $result['version']);
    }

    /** @test */
    public function prompt_builder_uses_database_version(): void
    {
        // Create a prompt version in the database
        PromptVersion::create([
            'task' => 'explain_triage',
            'version' => '1.0.0',
            'prompt_template' => 'Custom prompt for {{chiefComplaint}}',
            'is_active' => true,
        ]);
        
        $builder = new \App\Services\Ai\PromptBuilder();
        
        $result = $builder->build('explain_triage', [
            'chiefComplaint' => 'Test complaint',
        ]);
        
        $this->assertEquals('1.0.0', $result['version']);
        $this->assertStringContainsString('Custom prompt', $result['prompt']);
    }

    /** @test */
    public function context_builder_fetches_patient_data(): void
    {
        // Create a patient
        \App\Models\Patient::create([
            'cpt' => 'CP-TEST-001',
            'date_of_birth' => '2024-01-15',
            'gender' => 'male',
            'weight_kg' => 12.5,
            'visit_count' => 1,
            'is_active' => true,
        ]);
        
        $builder = new \App\Services\Ai\ContextBuilder();
        
        $context = $builder->build('explain_triage', [
            'context' => [
                'patientCpt' => 'CP-TEST-001',
            ],
        ]);
        
        $this->assertEquals('CP-TEST-001', $context['patient_cpt']);
        $this->assertEquals('male', $context['gender']);
        $this->assertEquals(12.5, $context['weight_kg']);
    }

    /** @test */
    public function hallucination_check_detects_risky_patterns(): void
    {
        $validator = new \App\Services\Ai\OutputValidator();
        
        $result = $validator->checkHallucinationRisk(
            'I definitely recommend this specific dosage of 500mg amoxicillin.'
        );
        
        $this->assertTrue($result['has_hallucination_risk']);
        $this->assertNotEmpty($result['indicators']);
    }

    /** @test */
    public function safety_framing_is_added(): void
    {
        $validator = new \App\Services\Ai\OutputValidator();
        
        $result = $validator->addSafetyFraming(
            'The patient shows signs of respiratory infection.',
            'explain_triage'
        );
        
        $this->assertStringContainsString('Clinical Decision Support', $result);
        $this->assertStringContainsString('verified by qualified medical staff', $result);
    }
}
