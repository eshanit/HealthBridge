<?php

namespace Database\Seeders;

use App\Models\ClinicalForm;
use App\Models\ClinicalSession;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class GPDashboardTestSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Get or create a doctor user
        $doctor = User::whereHas('roles', function ($query) {
            $query->where('name', 'doctor');
        })->first();

        if (!$doctor) {
            $doctor = User::factory()->create([
                'name' => 'Dr. Test User',
                'email' => 'doctor@test.com',
            ]);
            $doctor->assignRole('doctor');
        }

        // Get or create a nurse user for referrals
        $nurse = User::whereHas('roles', function ($query) {
            $query->where('name', 'nurse');
        })->first();

        if (!$nurse) {
            $nurse = User::factory()->create([
                'name' => 'Nurse Test User',
                'email' => 'nurse@test.com',
            ]);
            $nurse->assignRole('nurse');
        }

        // Create test patients if not enough exist
        $patients = Patient::all();
        if ($patients->count() < 10) {
            for ($i = $patients->count(); $i < 10; $i++) {
                Patient::create([
                    'couch_id' => 'patient_' . Str::uuid()->toString(),
                    'cpt' => 'CPT' . str_pad($i + 100, 6, '0', STR_PAD_LEFT),
                    'first_name' => fake()->firstName(),
                    'last_name' => fake()->lastName(),
                    'gender' => fake()->randomElement(['male', 'female']),
                    'date_of_birth' => fake()->date('Y-m-d', '-80 years'),
                    'phone' => fake()->phoneNumber(),
                    'address' => fake()->address(),
                ]);
            }
            $patients = Patient::all();
        }

        // Create clinical sessions in different workflow states
        $workflowStates = [
            ClinicalSession::WORKFLOW_REFERRED => 5,      // Pending referrals
            ClinicalSession::WORKFLOW_IN_GP_REVIEW => 3,  // In review by GP
            ClinicalSession::WORKFLOW_UNDER_TREATMENT => 2, // Under treatment
        ];

        foreach ($workflowStates as $state => $count) {
            for ($i = 0; $i < $count; $i++) {
                $patient = $patients->random();
                $couchId = 'session_' . Str::uuid()->toString();
                
                $triagePriority = fake()->randomElement(['red', 'yellow', 'green']);
                
                // For REFERRED state, make some red priority
                if ($state === ClinicalSession::WORKFLOW_REFERRED && $i < 2) {
                    $triagePriority = 'red';
                }

                // Generate onboarding data
                $vitals = [
                    'rr' => fake()->numberBetween(16, 40),
                    'hr' => fake()->numberBetween(60, 150),
                    'temp' => fake()->randomFloat(1, 36.0, 40.0),
                    'spo2' => fake()->numberBetween(88, 100),
                    'weight' => fake()->randomFloat(1, 40, 100),
                ];

                $dangerSigns = [];
                if ($triagePriority === 'red') {
                    $dangerSigns = fake()->randomElements([
                        'Chest indrawing',
                        'Cyanosis',
                        'Stridor',
                        'Fast breathing',
                        'Severe dehydration',
                        'Convulsions',
                    ], fake()->numberBetween(1, 3));
                }

                $chiefComplaint = fake()->randomElement([
                    'Fever and cough',
                    'Abdominal pain',
                    'Headache',
                    'Chest pain',
                    'Shortness of breath',
                    'Back pain',
                    'Nausea and vomiting',
                    'Dizziness',
                ]);

                // Determine stage based on workflow state
                $stage = match($state) {
                    ClinicalSession::WORKFLOW_REFERRED => 'assessment',
                    ClinicalSession::WORKFLOW_IN_GP_REVIEW => 'assessment',
                    ClinicalSession::WORKFLOW_UNDER_TREATMENT => 'treatment',
                    default => 'registration',
                };

                $session = ClinicalSession::create([
                    'couch_id' => $couchId,
                    'session_uuid' => Str::uuid()->toString(),
                    'patient_cpt' => $patient->cpt,
                    'created_by_user_id' => $nurse->id,
                    'provider_role' => 'nurse',
                    'stage' => $stage,
                    'status' => 'open',
                    'workflow_state' => $state,
                    'workflow_state_updated_at' => now()->subMinutes(fake()->numberBetween(5, 120)),
                    'triage_priority' => $triagePriority,
                    'chief_complaint' => $chiefComplaint,
                    'notes' => fake()->paragraph(),
                    'session_created_at' => now()->subHours(fake()->numberBetween(1, 24)),
                    'session_updated_at' => now(),
                ]);

                // Create referral for REFERRED and IN_GP_REVIEW states
                if (in_array($state, [ClinicalSession::WORKFLOW_REFERRED, ClinicalSession::WORKFLOW_IN_GP_REVIEW])) {
                    Referral::create([
                        'session_couch_id' => $couchId,
                        'referring_user_id' => $nurse->id,
                        'assigned_to_user_id' => $state === ClinicalSession::WORKFLOW_IN_GP_REVIEW ? $doctor->id : null,
                        'priority' => $triagePriority,
                        'reason' => fake()->randomElement([
                            'Requires GP assessment',
                            'Need doctor evaluation',
                            'Complex case requiring physician review',
                            'Patient condition needs doctor attention',
                        ]),
                        'clinical_notes' => fake()->paragraph(),
                        'status' => $state === ClinicalSession::WORKFLOW_REFERRED ? 'pending' : 'accepted',
                    ]);
                }

                // Create clinical form with onboarding data
                ClinicalForm::create([
                    'couch_id' => 'form_' . Str::uuid()->toString(),
                    'form_uuid' => 'form_' . Str::random(8),
                    'session_couch_id' => $couchId,
                    'patient_cpt' => $patient->cpt,
                    'created_by_user_id' => $nurse->id,
                    'creator_role' => 'nurse',
                    'schema_id' => 'onboarding_v1',
                    'schema_version' => '1.0',
                    'status' => 'completed',
                    'sync_status' => 'synced',
                    'answers' => [
                        'chiefComplaint' => $chiefComplaint,
                        'presentingSymptoms' => fake()->sentences(3),
                        'symptomDuration' => fake()->numberBetween(1, 14) . ' days',
                        'painLevel' => fake()->numberBetween(1, 10),
                        'medicalHistory' => fake()->randomElements([
                            'Hypertension',
                            'Diabetes',
                            'Asthma',
                            'HIV',
                            'TB',
                            'Heart disease',
                        ], fake()->numberBetween(0, 3)),
                        'currentMedications' => fake()->randomElements([
                            'Paracetamol',
                            'Ibuprofen',
                            'Amoxicillin',
                            'Metformin',
                            'Amlodipine',
                        ], fake()->numberBetween(0, 3)),
                        'allergies' => fake()->randomElements([
                            'Penicillin',
                            'Sulfa drugs',
                            'Aspirin',
                            'None known',
                        ], fake()->numberBetween(0, 2)),
                        'vitals' => $vitals,
                    ],
                    'calculated' => [
                        'triagePriority' => $triagePriority,
                        'hasDangerSign' => count($dangerSigns) > 0,
                        'dangerSigns' => $dangerSigns,
                        'vitals' => $vitals,
                    ],
                    'form_created_at' => now()->subHours(fake()->numberBetween(1, 24)),
                    'form_updated_at' => now(),
                    'completed_at' => now()->subMinutes(fake()->numberBetween(30, 120)),
                    'synced_at' => now(),
                ]);
            }
        }

        $this->command->info('GP Dashboard test data seeded successfully.');
        $this->command->info('Created sessions in states:');
        foreach ($workflowStates as $state => $count) {
            $actualCount = ClinicalSession::where('workflow_state', $state)->count();
            $this->command->info("  - $state: $actualCount sessions");
        }
    }
}

