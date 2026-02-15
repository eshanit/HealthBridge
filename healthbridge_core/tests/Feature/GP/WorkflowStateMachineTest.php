<?php

namespace Tests\Feature\GP;

use App\Models\ClinicalSession;
use App\Models\Patient;
use App\Models\StateTransition;
use App\Models\User;
use App\Services\WorkflowStateMachine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WorkflowStateMachineTest extends TestCase
{
    use RefreshDatabase;

    protected WorkflowStateMachine $stateMachine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->stateMachine = app(WorkflowStateMachine::class);
    }

    /** @test */
    public function it_can_transition_from_new_to_triaged()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $session = ClinicalSession::create([
            'couch_id' => 'session_001',
            'session_uuid' => 'uuid_001',
            'patient_cpt' => 'CPT001',
            'workflow_state' => ClinicalSession::WORKFLOW_NEW,
            'status' => 'open',
        ]);

        $transition = $this->stateMachine->transition(
            $session,
            ClinicalSession::WORKFLOW_TRIAGED,
            'assessment_completed'
        );

        $this->assertEquals(ClinicalSession::WORKFLOW_TRIAGED, $session->fresh()->workflow_state);
        $this->assertInstanceOf(StateTransition::class, $transition);
        $this->assertEquals(ClinicalSession::WORKFLOW_NEW, $transition->from_state);
        $this->assertEquals(ClinicalSession::WORKFLOW_TRIAGED, $transition->to_state);
        $this->assertEquals($user->id, $transition->user_id);
    }

    /** @test */
    public function it_prevents_invalid_transitions()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $session = ClinicalSession::create([
            'couch_id' => 'session_002',
            'session_uuid' => 'uuid_002',
            'patient_cpt' => 'CPT002',
            'workflow_state' => ClinicalSession::WORKFLOW_NEW,
            'status' => 'open',
        ]);

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Invalid transition from NEW to IN_GP_REVIEW');

        $this->stateMachine->transition(
            $session,
            ClinicalSession::WORKFLOW_IN_GP_REVIEW
        );
    }

    /** @test */
    public function it_can_accept_referral()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $session = ClinicalSession::create([
            'couch_id' => 'session_003',
            'session_uuid' => 'uuid_003',
            'patient_cpt' => 'CPT003',
            'workflow_state' => ClinicalSession::WORKFLOW_REFERRED,
            'status' => 'open',
        ]);

        $transition = $this->stateMachine->acceptReferral($session, 'Accepting for review');

        $this->assertEquals(ClinicalSession::WORKFLOW_IN_GP_REVIEW, $session->fresh()->workflow_state);
        $this->assertEquals('gp_accepted', $transition->reason);
    }

    /** @test */
    public function it_can_reject_referral()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $session = ClinicalSession::create([
            'couch_id' => 'session_004',
            'session_uuid' => 'uuid_004',
            'patient_cpt' => 'CPT004',
            'workflow_state' => ClinicalSession::WORKFLOW_REFERRED,
            'status' => 'open',
        ]);

        $transition = $this->stateMachine->rejectReferral($session, 'patient_no_show', 'Patient did not arrive');

        $this->assertEquals(ClinicalSession::WORKFLOW_CLOSED, $session->fresh()->workflow_state);
        $this->assertEquals('patient_no_show', $transition->reason);
    }

    /** @test */
    public function it_can_start_treatment()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $session = ClinicalSession::create([
            'couch_id' => 'session_005',
            'session_uuid' => 'uuid_005',
            'patient_cpt' => 'CPT005',
            'workflow_state' => ClinicalSession::WORKFLOW_IN_GP_REVIEW,
            'status' => 'open',
        ]);

        $transition = $this->stateMachine->startTreatment($session, 'Prescribed antibiotics');

        $this->assertEquals(ClinicalSession::WORKFLOW_UNDER_TREATMENT, $session->fresh()->workflow_state);
        $this->assertEquals('treatment_plan_created', $transition->reason);
        $this->assertEquals('Prescribed antibiotics', $transition->metadata['treatment_plan']);
    }

    /** @test */
    public function it_can_close_session()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $session = ClinicalSession::create([
            'couch_id' => 'session_006',
            'session_uuid' => 'uuid_006',
            'patient_cpt' => 'CPT006',
            'workflow_state' => ClinicalSession::WORKFLOW_UNDER_TREATMENT,
            'status' => 'open',
        ]);

        $transition = $this->stateMachine->closeSession($session, 'treatment_completed', [
            'outcome_notes' => 'Patient recovered fully',
        ]);

        $this->assertEquals(ClinicalSession::WORKFLOW_CLOSED, $session->fresh()->workflow_state);
        $this->assertEquals('treatment_completed', $transition->reason);
    }

    /** @test */
    public function it_can_request_specialist_referral()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $session = ClinicalSession::create([
            'couch_id' => 'session_007',
            'session_uuid' => 'uuid_007',
            'patient_cpt' => 'CPT007',
            'workflow_state' => ClinicalSession::WORKFLOW_IN_GP_REVIEW,
            'status' => 'open',
        ]);

        $transition = $this->stateMachine->requestSpecialistReferral(
            $session,
            'Cardiologist',
            'Patient shows cardiac symptoms'
        );

        $this->assertEquals(ClinicalSession::WORKFLOW_REFERRED, $session->fresh()->workflow_state);
        $this->assertEquals('specialist_referral', $transition->reason);
        $this->assertEquals('Cardiologist', $transition->metadata['specialist_type']);
    }

    /** @test */
    public function it_returns_allowed_transitions()
    {
        $session = ClinicalSession::create([
            'couch_id' => 'session_008',
            'session_uuid' => 'uuid_008',
            'patient_cpt' => 'CPT008',
            'workflow_state' => ClinicalSession::WORKFLOW_REFERRED,
            'status' => 'open',
        ]);

        $allowedTransitions = $this->stateMachine->getAllowedTransitions($session);

        $this->assertContains(ClinicalSession::WORKFLOW_IN_GP_REVIEW, $allowedTransitions);
        $this->assertContains(ClinicalSession::WORKFLOW_CLOSED, $allowedTransitions);
        $this->assertCount(2, $allowedTransitions);
    }

    /** @test */
    public function it_can_check_if_transition_is_possible()
    {
        $session = ClinicalSession::create([
            'couch_id' => 'session_009',
            'session_uuid' => 'uuid_009',
            'patient_cpt' => 'CPT009',
            'workflow_state' => ClinicalSession::WORKFLOW_IN_GP_REVIEW,
            'status' => 'open',
        ]);

        $this->assertTrue($this->stateMachine->canTransition($session, ClinicalSession::WORKFLOW_UNDER_TREATMENT));
        $this->assertTrue($this->stateMachine->canTransition($session, ClinicalSession::WORKFLOW_REFERRED));
        $this->assertTrue($this->stateMachine->canTransition($session, ClinicalSession::WORKFLOW_CLOSED));
        $this->assertFalse($this->stateMachine->canTransition($session, ClinicalSession::WORKFLOW_NEW));
    }

    /** @test */
    public function it_tracks_transition_history()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $session = ClinicalSession::create([
            'couch_id' => 'session_010',
            'session_uuid' => 'uuid_010',
            'patient_cpt' => 'CPT010',
            'workflow_state' => ClinicalSession::WORKFLOW_NEW,
            'status' => 'open',
        ]);

        // Create multiple transitions
        $this->stateMachine->transition($session, ClinicalSession::WORKFLOW_TRIAGED, 'assessment_completed');
        $this->stateMachine->transition($session, ClinicalSession::WORKFLOW_REFERRED, 'gp_consultation_required');
        $this->stateMachine->transition($session, ClinicalSession::WORKFLOW_IN_GP_REVIEW, 'gp_accepted');

        $history = $this->stateMachine->getTransitionHistory($session);

        $this->assertCount(3, $history);
        $this->assertEquals(ClinicalSession::WORKFLOW_TRIAGED, $history[0]->to_state);
        $this->assertEquals(ClinicalSession::WORKFLOW_REFERRED, $history[1]->to_state);
        $this->assertEquals(ClinicalSession::WORKFLOW_IN_GP_REVIEW, $history[2]->to_state);
    }

    /** @test */
    public function it_returns_workflow_config()
    {
        $config = $this->stateMachine->getConfig();

        $this->assertArrayHasKey('states', $config);
        $this->assertArrayHasKey('transitions', $config);
        $this->assertArrayHasKey('transition_reasons', $config);

        $this->assertContains(ClinicalSession::WORKFLOW_NEW, $config['states']);
        $this->assertContains(ClinicalSession::WORKFLOW_CLOSED, $config['states']);
    }

    /** @test */
    public function it_detects_final_state()
    {
        $openSession = ClinicalSession::create([
            'couch_id' => 'session_011',
            'session_uuid' => 'uuid_011',
            'patient_cpt' => 'CPT011',
            'workflow_state' => ClinicalSession::WORKFLOW_IN_GP_REVIEW,
            'status' => 'open',
        ]);

        $closedSession = ClinicalSession::create([
            'couch_id' => 'session_012',
            'session_uuid' => 'uuid_012',
            'patient_cpt' => 'CPT012',
            'workflow_state' => ClinicalSession::WORKFLOW_CLOSED,
            'status' => 'closed',
        ]);

        $this->assertFalse($this->stateMachine->isInFinalState($openSession));
        $this->assertTrue($this->stateMachine->isInFinalState($closedSession));
    }
}
