<?php

namespace Tests\Feature\GP;

use App\Models\ClinicalSession;
use App\Models\ClinicalForm;
use App\Models\Patient;
use App\Models\User;
use App\Models\StoredReport;
use App\Models\Referral;
use App\Services\ReportGeneratorService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportGenerationTest extends TestCase
{
    use RefreshDatabase;

    protected User $gpUser;
    protected User $nurseUser;
    protected Patient $patient;
    protected ClinicalSession $session;
    protected ClinicalForm $form;

    protected function setUp(): void
    {
        parent::setUp();

        // Create users
        $this->gpUser = User::factory()->create([
            'name' => 'Dr. Test User',
            'email' => 'gp@test.com',
        ]);
        $this->gpUser->assignRole('gp');

        $this->nurseUser = User::factory()->create([
            'name' => 'Nurse Test User',
            'email' => 'nurse@test.com',
        ]);
        $this->nurseUser->assignRole('nurse');

        // Create patient
        $this->patient = Patient::create([
            'cpt' => 'TEST-001',
            'short_code' => 'T001',
            'gender' => 'male',
            'age_months' => 36, // 3 years old
            'weight_kg' => 14.5,
            'visit_count' => 1,
            'is_active' => true,
        ]);

        // Create clinical session
        $this->session = ClinicalSession::create([
            'couch_id' => 'session:test-session-001',
            'session_uuid' => 'test-uuid-001',
            'patient_cpt' => $this->patient->cpt,
            'stage' => 'treatment',
            'status' => 'open',
            'workflow_state' => 'IN_GP_REVIEW',
            'triage_priority' => 'yellow',
            'chief_complaint' => 'Fever and cough for 3 days',
            'treatment_plan' => 'Paracetamol 250mg TDS, Amoxicillin 125mg TDS for 5 days',
            'notes' => 'Patient responding well to treatment',
            'session_created_at' => now()->subDays(1),
            'session_updated_at' => now(),
            'created_by_user_id' => $this->nurseUser->id,
            'provider_role' => 'nurse',
        ]);

        // Create clinical form
        $this->form = ClinicalForm::create([
            'couch_id' => 'form:test-form-001',
            'form_uuid' => 'form-uuid-001',
            'session_couch_id' => $this->session->couch_id,
            'patient_cpt' => $this->patient->cpt,
            'schema_id' => 'imci_0_2_months',
            'status' => 'completed',
            'answers' => [
                'vitals' => [
                    'rr' => 32,
                    'hr' => 110,
                    'temp' => 37.8,
                    'spo2' => 98,
                    'weight' => 14.5,
                ],
                'symptoms' => ['fever', 'cough', 'runny_nose'],
            ],
            'calculated' => [
                'vitals' => [
                    'respiratory_rate' => 32,
                    'heart_rate' => 110,
                    'temperature' => 37.8,
                    'spo2' => 98,
                    'weight' => 14.5,
                ],
                'dangerSigns' => [],
                'hasDangerSign' => false,
            ],
            'form_created_at' => now()->subDays(1),
            'form_updated_at' => now(),
            'completed_at' => now(),
            'created_by_user_id' => $this->nurseUser->id,
            'creator_role' => 'nurse',
        ]);
    }

    /** @test */
    public function it_generates_discharge_summary_pdf()
    {
        $service = new ReportGeneratorService();

        $result = $service->generateDischargePdf($this->session->couch_id);

        $this->assertTrue($result['success']);
        $this->assertArrayHasKey('pdf', $result);
        $this->assertArrayHasKey('html', $result);
        $this->assertArrayHasKey('filename', $result);
        $this->assertEquals('application/pdf', $result['mime_type']);
        $this->assertGreaterThan(0, $result['size']);

        // Verify PDF content is valid base64
        $pdfContent = base64_decode($result['pdf']);
        $this->assertStringStartsWith('%PDF', $pdfContent);
    }

    /** @test */
    public function it_generates_handover_report_pdf()
    {
        $service = new ReportGeneratorService();

        $result = $service->generateHandoverPdf($this->session->couch_id, [
            'handed_over_by' => 'Nurse Test User',
            'handed_over_to' => 'Dr. Test User',
        ]);

        $this->assertTrue($result['success']);
        $this->assertArrayHasKey('pdf', $result);
        $this->assertArrayHasKey('html', $result);

        // Verify SBAR content in HTML
        $this->assertStringContainsString('Situation', $result['html']);
        $this->assertStringContainsString('Background', $result['html']);
        $this->assertStringContainsString('Assessment', $result['html']);
        $this->assertStringContainsString('Recommendation', $result['html']);
    }

    /** @test */
    public function it_generates_referral_report_pdf()
    {
        // Create a referral for the session
        $referral = Referral::create([
            'referral_uuid' => 'ref-uuid-001',
            'session_couch_id' => $this->session->couch_id,
            'patient_cpt' => $this->patient->cpt,
            'referring_user_id' => $this->nurseUser->id,
            'assigned_to_user_id' => $this->gpUser->id,
            'specialty' => 'General Practice',
            'reason' => 'Persistent symptoms requiring GP review',
            'clinical_notes' => 'Patient has fever and cough for 3 days, not responding to initial treatment',
            'priority' => 'yellow',
            'status' => 'accepted',
        ]);

        $service = new ReportGeneratorService();

        $result = $service->generateReferralPdf($this->session->couch_id);

        $this->assertTrue($result['success']);
        $this->assertArrayHasKey('pdf', $result);
        $this->assertArrayHasKey('html', $result);

        // Verify referral content in HTML
        $this->assertStringContainsString('REFERRAL REPORT', $result['html']);
        $this->assertStringContainsString('General Practice', $result['html']);
    }

    /** @test */
    public function it_generates_comprehensive_report_pdf()
    {
        $service = new ReportGeneratorService();

        $aiContent = [
            'summary' => 'Patient is a 3-year-old male with fever and cough for 3 days.',
            'recommendations' => [
                'Continue current treatment',
                'Monitor for danger signs',
                'Follow up in 2 days',
            ],
            'differential_diagnosis' => 'Viral upper respiratory infection vs bacterial pneumonia',
        ];

        $result = $service->generateComprehensivePdf($this->session->couch_id, $aiContent);

        $this->assertTrue($result['success']);
        $this->assertArrayHasKey('pdf', $result);
        $this->assertArrayHasKey('html', $result);

        // Verify comprehensive content in HTML
        $this->assertStringContainsString('COMPREHENSIVE CLINICAL REPORT', $result['html']);
        $this->assertStringContainsString('AI-Generated Content', $result['html']);
    }

    /** @test */
    public function it_returns_error_for_nonexistent_session()
    {
        $service = new ReportGeneratorService();

        $result = $service->generateDischargePdf('nonexistent-session-id');

        $this->assertFalse($result['success']);
        $this->assertArrayHasKey('error', $result);
        $this->assertStringContainsString('not found', $result['error']);
    }

    /** @test */
    public function it_returns_error_for_referral_without_referral_record()
    {
        $service = new ReportGeneratorService();

        // Session without referral
        $result = $service->generateReferralPdf($this->session->couch_id);

        $this->assertFalse($result['success']);
        $this->assertArrayHasKey('error', $result);
        $this->assertStringContainsString('No referral found', $result['error']);
    }

    /** @test */
    public function gp_user_can_download_discharge_pdf_via_api()
    {
        $this->actingAs($this->gpUser);

        $response = $this->postJson("/gp/reports/sessions/{$this->session->couch_id}/discharge");

        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'pdf',
                'html',
                'filename',
                'mime_type',
                'size',
            ]);
    }

    /** @test */
    public function gp_user_can_download_handover_pdf_via_api()
    {
        $this->actingAs($this->gpUser);

        $response = $this->postJson("/gp/reports/sessions/{$this->session->couch_id}/handover", [
            'handed_over_by' => 'Nurse Test User',
            'handed_over_to' => 'Dr. GP User',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'pdf',
                'html',
                'filename',
            ]);
    }

    /** @test */
    public function gp_user_can_download_referral_pdf_via_api()
    {
        // Create referral
        Referral::create([
            'referral_uuid' => 'ref-uuid-002',
            'session_couch_id' => $this->session->couch_id,
            'patient_cpt' => $this->patient->cpt,
            'referring_user_id' => $this->nurseUser->id,
            'assigned_to_user_id' => $this->gpUser->id,
            'specialty' => 'General Practice',
            'reason' => 'Test referral',
            'priority' => 'green',
            'status' => 'pending',
        ]);

        $this->actingAs($this->gpUser);

        $response = $this->postJson("/gp/reports/sessions/{$this->session->couch_id}/referral");

        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'pdf',
                'html',
                'filename',
            ]);
    }

    /** @test */
    public function it_can_download_pdf_directly()
    {
        $this->actingAs($this->gpUser);

        $response = $this->get("/gp/reports/sessions/{$this->session->couch_id}/download/discharge");

        $response->assertStatus(200);
        $response->assertHeader('Content-Type', 'application/pdf');
        $response->assertHeader('Content-Disposition');
    }

    /** @test */
    public function it_can_preview_html_report()
    {
        $this->actingAs($this->gpUser);

        $response = $this->getJson("/gp/reports/sessions/{$this->session->couch_id}/preview/discharge");

        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'html',
            ]);
    }

    /** @test */
    public function report_includes_patient_information()
    {
        $service = new ReportGeneratorService();

        $result = $service->generateDischargePdf($this->session->couch_id);

        $this->assertTrue($result['success']);

        // Check HTML contains patient info
        $this->assertStringContainsString('TEST-001', $result['html']);
        $this->assertStringContainsString('male', $result['html']);
    }

    /** @test */
    public function report_includes_vitals()
    {
        $service = new ReportGeneratorService();

        $result = $service->generateDischargePdf($this->session->couch_id);

        $this->assertTrue($result['success']);

        // Check HTML contains vitals
        $this->assertStringContainsString('32', $result['html']); // RR
        $this->assertStringContainsString('110', $result['html']); // HR
        $this->assertStringContainsString('37.8', $result['html']); // Temp
    }

    /** @test */
    public function report_includes_treatment_plan()
    {
        $service = new ReportGeneratorService();

        $result = $service->generateDischargePdf($this->session->couch_id);

        $this->assertTrue($result['success']);

        // Check HTML contains treatment plan
        $this->assertStringContainsString('Paracetamol', $result['html']);
        $this->assertStringContainsString('Amoxicillin', $result['html']);
    }

    /** @test */
    public function report_includes_danger_signs_when_present()
    {
        // Update form to have danger signs
        $this->form->update([
            'calculated' => [
                'dangerSigns' => ['Unable to drink', 'Convulsions'],
                'hasDangerSign' => true,
            ],
        ]);

        $service = new ReportGeneratorService();

        $result = $service->generateDischargePdf($this->session->couch_id);

        $this->assertTrue($result['success']);

        // Check HTML contains danger signs
        $this->assertStringContainsString('Danger Signs', $result['html']);
        $this->assertStringContainsString('Unable to drink', $result['html']);
    }

    /** @test */
    public function stored_report_model_can_be_created()
    {
        $report = StoredReport::create([
            'report_uuid' => 'test-report-uuid',
            'couch_id' => 'report:discharge:session:123:456',
            'report_type' => 'discharge',
            'session_couch_id' => $this->session->couch_id,
            'patient_cpt' => $this->patient->cpt,
            'filename' => 'discharge_summary.pdf',
            'mime_type' => 'application/pdf',
            'size_bytes' => 12345,
            'pdf_base64' => base64_encode('test pdf content'),
            'html_content' => '<html>test</html>',
            'generated_at' => now(),
            'generated_by_user_id' => $this->gpUser->id,
            'generated_by_name' => $this->gpUser->name,
            'synced' => true,
            'synced_at' => now(),
        ]);

        $this->assertDatabaseHas('stored_reports', [
            'report_uuid' => 'test-report-uuid',
            'report_type' => 'discharge',
        ]);

        // Test relationships
        $this->assertEquals($this->gpUser->id, $report->generatedBy->id);
        $this->assertEquals($this->session->couch_id, $report->session->couch_id);
        $this->assertEquals($this->patient->cpt, $report->patient->cpt);
    }

    /** @test */
    public function stored_report_can_retrieve_pdf_content()
    {
        $pdfContent = 'test pdf binary content';
        
        $report = StoredReport::create([
            'report_uuid' => 'test-report-uuid-2',
            'couch_id' => 'report:discharge:session:123:789',
            'report_type' => 'discharge',
            'session_couch_id' => $this->session->couch_id,
            'filename' => 'discharge_summary.pdf',
            'mime_type' => 'application/pdf',
            'size_bytes' => strlen($pdfContent),
            'pdf_base64' => base64_encode($pdfContent),
            'generated_at' => now(),
        ]);

        $this->assertEquals($pdfContent, $report->getPdfBinary());
        $this->assertEquals(base64_encode($pdfContent), $report->getPdfContent());
    }

    /** @test */
    public function stored_report_scopes_work_correctly()
    {
        // Create multiple reports
        StoredReport::create([
            'report_uuid' => 'report-1',
            'couch_id' => 'report:1',
            'report_type' => 'discharge',
            'session_couch_id' => $this->session->couch_id,
            'patient_cpt' => $this->patient->cpt,
            'synced' => true,
            'generated_at' => now(),
        ]);

        StoredReport::create([
            'report_uuid' => 'report-2',
            'couch_id' => 'report:2',
            'report_type' => 'handover',
            'session_couch_id' => $this->session->couch_id,
            'patient_cpt' => $this->patient->cpt,
            'synced' => false,
            'generated_at' => now(),
        ]);

        // Test scopes
        $this->assertEquals(1, StoredReport::ofType('discharge')->count());
        $this->assertEquals(1, StoredReport::ofType('handover')->count());
        $this->assertEquals(2, StoredReport::forSession($this->session->couch_id)->count());
        $this->assertEquals(2, StoredReport::forPatient($this->patient->cpt)->count());
        $this->assertEquals(1, StoredReport::synced()->count());
        $this->assertEquals(1, StoredReport::unsynced()->count());
    }

    /** @test */
    public function stored_report_stats_are_calculated_correctly()
    {
        StoredReport::create([
            'report_uuid' => 'report-stats-1',
            'couch_id' => 'report:stats:1',
            'report_type' => 'discharge',
            'size_bytes' => 1000,
            'synced' => true,
            'generated_at' => now(),
        ]);

        StoredReport::create([
            'report_uuid' => 'report-stats-2',
            'couch_id' => 'report:stats:2',
            'report_type' => 'discharge',
            'size_bytes' => 2000,
            'synced' => true,
            'generated_at' => now(),
        ]);

        StoredReport::create([
            'report_uuid' => 'report-stats-3',
            'couch_id' => 'report:stats:3',
            'report_type' => 'handover',
            'size_bytes' => 1500,
            'synced' => false,
            'generated_at' => now(),
        ]);

        $stats = StoredReport::getStats();

        $this->assertEquals(3, $stats['total']);
        $this->assertEquals(2, $stats['by_type']['discharge']);
        $this->assertEquals(1, $stats['by_type']['handover']);
        $this->assertEquals(4500, $stats['total_size_bytes']);
        $this->assertEquals(2, $stats['synced']);
        $this->assertEquals(1, $stats['unsynced']);
    }
}
