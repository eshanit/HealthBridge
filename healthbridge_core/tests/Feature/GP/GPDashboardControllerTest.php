<?php

namespace Tests\Feature\GP;

use App\Models\CaseComment;
use App\Models\ClinicalSession;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class GPDashboardControllerTest extends TestCase
{
    use RefreshDatabase;

    protected User $gpUser;
    protected User $adminUser;

    protected function setUp(): void
    {
        parent::setUp();

        // Create roles
        Role::create(['name' => 'gp']);
        Role::create(['name' => 'admin']);
        Role::create(['name' => 'nurse']);

        // Create GP user
        $this->gpUser = User::factory()->create();
        $this->gpUser->assignRole('gp');

        // Create admin user
        $this->adminUser = User::factory()->create();
        $this->adminUser->assignRole('admin');
    }

    /** @test */
    public function gp_can_access_dashboard()
    {
        $response = $this->actingAs($this->gpUser)->get('/gp/dashboard');

        $response->assertStatus(200);
    }

    /** @test */
    public function non_gp_cannot_access_dashboard()
    {
        $nurseUser = User::factory()->create();
        $nurseUser->assignRole('nurse');

        $response = $this->actingAs($nurseUser)->get('/gp/dashboard');

        $response->assertStatus(403);
    }

    /** @test */
    public function admin_can_access_gp_dashboard()
    {
        $response = $this->actingAs($this->adminUser)->get('/gp/dashboard');

        $response->assertStatus(200);
    }

    /** @test */
    public function dashboard_shows_correct_statistics()
    {
        // Create patient
        $patient = Patient::create([
            'cpt' => 'CPT001',
            'first_name' => 'John',
            'last_name' => 'Doe',
            'gender' => 'male',
        ]);

        // Create sessions in different states
        $referredSession = ClinicalSession::create([
            'couch_id' => 'session_001',
            'session_uuid' => 'uuid_001',
            'patient_cpt' => 'CPT001',
            'workflow_state' => ClinicalSession::WORKFLOW_REFERRED,
            'status' => 'open',
        ]);

        $inReviewSession = ClinicalSession::create([
            'couch_id' => 'session_002',
            'session_uuid' => 'uuid_002',
            'patient_cpt' => 'CPT001',
            'workflow_state' => ClinicalSession::WORKFLOW_IN_GP_REVIEW,
            'status' => 'open',
        ]);

        // Create referral for in-review session assigned to GP
        Referral::create([
            'session_couch_id' => 'session_002',
            'referring_user_id' => $this->adminUser->id,
            'assigned_to_user_id' => $this->gpUser->id,
            'status' => 'accepted',
            'reason' => 'GP consultation needed',
        ]);

        $response = $this->actingAs($this->gpUser)->get('/gp/dashboard');

        $response->assertStatus(200);
        $response->assertInertia(fn ($page) => $page
            ->has('stats')
            ->where('stats.pending_referrals', 1)
            ->where('stats.in_review', 1)
        );
    }

    /** @test */
    public function gp_can_view_referral_queue()
    {
        $patient = Patient::create([
            'cpt' => 'CPT002',
            'first_name' => 'Jane',
            'last_name' => 'Smith',
            'gender' => 'female',
        ]);

        ClinicalSession::create([
            'couch_id' => 'session_003',
            'session_uuid' => 'uuid_003',
            'patient_cpt' => 'CPT002',
            'workflow_state' => ClinicalSession::WORKFLOW_REFERRED,
            'status' => 'open',
            'chief_complaint' => 'Headache',
        ]);

        $response = $this->actingAs($this->gpUser)->get('/gp/referrals');

        $response->assertStatus(200);
        $response->assertInertia(fn ($page) => $page
            ->has('referrals')
        );
    }

    /** @test */
    public function gp_can_accept_referral()
    {
        $patient = Patient::create([
            'cpt' => 'CPT003',
            'first_name' => 'Test',
            'last_name' => 'Patient',
            'gender' => 'male',
        ]);

        $session = ClinicalSession::create([
            'couch_id' => 'session_004',
            'session_uuid' => 'uuid_004',
            'patient_cpt' => 'CPT003',
            'workflow_state' => ClinicalSession::WORKFLOW_REFERRED,
            'status' => 'open',
        ]);

        $response = $this->actingAs($this->gpUser)
            ->postJson("/gp/referrals/{$session->couch_id}/accept", [
                'notes' => 'Accepting for review',
            ]);

        $response->assertStatus(200);
        $response->assertJson(['message' => 'Referral accepted successfully.']);

        $this->assertEquals(
            ClinicalSession::WORKFLOW_IN_GP_REVIEW,
            $session->fresh()->workflow_state
        );
    }

    /** @test */
    public function gp_can_reject_referral()
    {
        $patient = Patient::create([
            'cpt' => 'CPT004',
            'first_name' => 'Reject',
            'last_name' => 'Test',
            'gender' => 'female',
        ]);

        $session = ClinicalSession::create([
            'couch_id' => 'session_005',
            'session_uuid' => 'uuid_005',
            'patient_cpt' => 'CPT004',
            'workflow_state' => ClinicalSession::WORKFLOW_REFERRED,
            'status' => 'open',
        ]);

        $response = $this->actingAs($this->gpUser)
            ->postJson("/gp/referrals/{$session->couch_id}/reject", [
                'reason' => 'patient_no_show',
                'notes' => 'Patient did not arrive',
            ]);

        $response->assertStatus(200);
        $response->assertJson(['message' => 'Referral rejected.']);

        $this->assertEquals(
            ClinicalSession::WORKFLOW_CLOSED,
            $session->fresh()->workflow_state
        );
    }

    /** @test */
    public function gp_can_view_session_details()
    {
        $patient = Patient::create([
            'cpt' => 'CPT005',
            'first_name' => 'Detail',
            'last_name' => 'View',
            'gender' => 'male',
        ]);

        $session = ClinicalSession::create([
            'couch_id' => 'session_006',
            'session_uuid' => 'uuid_006',
            'patient_cpt' => 'CPT005',
            'workflow_state' => ClinicalSession::WORKFLOW_IN_GP_REVIEW,
            'status' => 'open',
            'chief_complaint' => 'Fever',
        ]);

        $response = $this->actingAs($this->gpUser)
            ->getJson("/gp/sessions/{$session->couch_id}");

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'session',
            'allowed_transitions',
            'transition_history',
        ]);
    }

    /** @test */
    public function gp_can_transition_session_state()
    {
        $patient = Patient::create([
            'cpt' => 'CPT006',
            'first_name' => 'State',
            'last_name' => 'Change',
            'gender' => 'female',
        ]);

        $session = ClinicalSession::create([
            'couch_id' => 'session_007',
            'session_uuid' => 'uuid_007',
            'patient_cpt' => 'CPT006',
            'workflow_state' => ClinicalSession::WORKFLOW_IN_GP_REVIEW,
            'status' => 'open',
        ]);

        $response = $this->actingAs($this->gpUser)
            ->postJson("/gp/sessions/{$session->couch_id}/transition", [
                'to_state' => ClinicalSession::WORKFLOW_UNDER_TREATMENT,
                'reason' => 'treatment_plan_created',
            ]);

        $response->assertStatus(200);
        $response->assertJson(['message' => 'Session transitioned successfully.']);

        $this->assertEquals(
            ClinicalSession::WORKFLOW_UNDER_TREATMENT,
            $session->fresh()->workflow_state
        );
    }

    /** @test */
    public function gp_can_close_session()
    {
        $patient = Patient::create([
            'cpt' => 'CPT007',
            'first_name' => 'Close',
            'last_name' => 'Test',
            'gender' => 'male',
        ]);

        $session = ClinicalSession::create([
            'couch_id' => 'session_008',
            'session_uuid' => 'uuid_008',
            'patient_cpt' => 'CPT007',
            'workflow_state' => ClinicalSession::WORKFLOW_UNDER_TREATMENT,
            'status' => 'open',
        ]);

        $response = $this->actingAs($this->gpUser)
            ->postJson("/gp/sessions/{$session->couch_id}/close", [
                'reason' => 'treatment_completed',
                'outcome_notes' => 'Patient recovered fully',
            ]);

        $response->assertStatus(200);
        $response->assertJson(['message' => 'Session closed successfully.']);

        $this->assertEquals(
            ClinicalSession::WORKFLOW_CLOSED,
            $session->fresh()->workflow_state
        );
        $this->assertNotNull($session->fresh()->completed_at);
    }

    /** @test */
    public function gp_can_add_comment_to_session()
    {
        $patient = Patient::create([
            'cpt' => 'CPT008',
            'first_name' => 'Comment',
            'last_name' => 'Test',
            'gender' => 'female',
        ]);

        $session = ClinicalSession::create([
            'couch_id' => 'session_009',
            'session_uuid' => 'uuid_009',
            'patient_cpt' => 'CPT008',
            'workflow_state' => ClinicalSession::WORKFLOW_IN_GP_REVIEW,
            'status' => 'open',
        ]);

        $response = $this->actingAs($this->gpUser)
            ->postJson("/gp/sessions/{$session->couch_id}/comments", [
                'content' => 'Patient is responding well to treatment',
                'visibility' => 'internal',
            ]);

        $response->assertStatus(201);
        $response->assertJson(['message' => 'Comment added successfully.']);

        $this->assertDatabaseHas('case_comments', [
            'session_couch_id' => $session->couch_id,
            'user_id' => $this->gpUser->id,
            'content' => 'Patient is responding well to treatment',
        ]);
    }

    /** @test */
    public function gp_can_get_workflow_config()
    {
        $response = $this->actingAs($this->gpUser)
            ->getJson('/gp/workflow/config');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'config' => [
                'states',
                'transitions',
                'transition_reasons',
            ],
        ]);
    }

    /** @test */
    public function invalid_transition_returns_error()
    {
        $patient = Patient::create([
            'cpt' => 'CPT009',
            'first_name' => 'Invalid',
            'last_name' => 'Transition',
            'gender' => 'male',
        ]);

        $session = ClinicalSession::create([
            'couch_id' => 'session_010',
            'session_uuid' => 'uuid_010',
            'patient_cpt' => 'CPT009',
            'workflow_state' => ClinicalSession::WORKFLOW_NEW,
            'status' => 'open',
        ]);

        $response = $this->actingAs($this->gpUser)
            ->postJson("/gp/sessions/{$session->couch_id}/transition", [
                'to_state' => ClinicalSession::WORKFLOW_IN_GP_REVIEW,
            ]);

        $response->assertStatus(422);
    }
}
