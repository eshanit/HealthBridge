<?php

namespace App\Console\Commands;

use App\Models\ClinicalForm;
use App\Models\ClinicalSession;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\User;
use App\Services\CouchDbService;
use App\Services\SyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Command to synchronize CouchDB data to MySQL for GP Dashboard test environment.
 * 
 * This command provides a comprehensive solution for populating the GP dashboard
 * with data from CouchDB, including schema transformation and test data generation.
 * 
 * @see docs/GP_DASHBOARD_SYNC_GUIDE.md
 */
class GpDashboardSyncCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'gp:dashboard-sync
                            {--mode=auto : Sync mode: auto|couchdb|test|verify}
                            {--reset : Reset sync sequence and reprocess all documents}
                            {--daemon : Run as continuous daemon (only for couchdb mode)}
                            {--poll=4 : Polling interval in seconds for daemon mode}
                            {--batch=100 : Maximum batch size per poll}
                            {--force : Force operation without confirmation}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Synchronize data from CouchDB to MySQL for GP Dashboard test environment';

    protected CouchDbService $couchDb;
    protected SyncService $syncService;

    /**
     * Execute the console command.
     */
    public function handle(CouchDbService $couchDb, SyncService $syncService): int
    {
        $this->couchDb = $couchDb;
        $this->syncService = $syncService;

        $mode = $this->option('mode');

        $this->info("╔════════════════════════════════════════════════════════════╗");
        $this->info("║       GP Dashboard Sync - CouchDB to MySQL                 ║");
        $this->info("╚════════════════════════════════════════════════════════════╝");
        $this->newLine();

        return match ($mode) {
            'auto' => $this->runAutoMode(),
            'couchdb' => $this->runCouchDbMode(),
            'test' => $this->runTestMode(),
            'verify' => $this->runVerifyMode(),
            default => $this->invalidMode($mode),
        };
    }

    /**
     * Auto mode: Detect CouchDB data and sync, or fall back to test data.
     */
    protected function runAutoMode(): int
    {
        $this->info('🔍 Auto-detecting data source...');

        // Check if CouchDB has data
        if ($this->couchDb->databaseExists()) {
            $info = $this->couchDb->getDatabaseInfo();
            $docCount = $info['doc_count'] ?? 0;

            if ($docCount > 0) {
                $this->info("✅ CouchDB database found with {$docCount} documents.");
                return $this->runCouchDbMode();
            }
        }

        $this->info('📦 No CouchDB data found. Using test data seeder.');
        return $this->runTestMode();
    }

    /**
     * CouchDB mode: Sync from CouchDB to MySQL.
     */
    protected function runCouchDbMode(): int
    {
        $this->info('📡 CouchDB Sync Mode');
        $this->newLine();

        // Check CouchDB connection
        if (!$this->couchDb->databaseExists()) {
            $this->error('❌ CouchDB database not found: ' . $this->couchDb->getDatabase());
            $this->info('💡 Run: php artisan couchdb:setup');
            return self::FAILURE;
        }

        $info = $this->couchDb->getDatabaseInfo();
        $this->info("   Database: {$info['db_name']}");
        $this->info("   Documents: {$info['doc_count']}");
        $this->info("   Size: " . $this->formatBytes($info['sizes']['active'] ?? 0));
        $this->newLine();

        // Handle reset
        if ($this->option('reset')) {
            if ($this->option('force') || $this->confirm('Reset sync sequence and reprocess all documents?')) {
                Cache::forget('couchdb_sync_sequence');
                $this->info('🔄 Sync sequence reset to 0');
            }
        }

        // Run sync
        if ($this->option('daemon')) {
            return $this->runDaemonSync();
        }

        return $this->runBatchSync();
    }

    /**
     * Run a single batch sync.
     */
    protected function runBatchSync(): int
    {
        $this->info('🔄 Running batch sync...');

        $lastSeq = Cache::get('couchdb_sync_sequence', '0');
        $this->info("   Starting from sequence: {$lastSeq}");

        $batchSize = (int) $this->option('batch');
        $totalProcessed = 0;
        $batchCount = 0;

        do {
            $changes = $this->couchDb->getChanges($lastSeq, [
                'include_docs' => 'true',
                'limit' => $batchSize,
            ]);

            $results = $changes['results'] ?? [];
            $batchProcessed = 0;

            foreach ($results as $change) {
                if (isset($change['deleted']) && $change['deleted']) {
                    continue;
                }

                if (isset($change['doc'])) {
                    $this->syncService->upsert($change['doc']);
                    $batchProcessed++;
                    $totalProcessed++;
                }
            }

            $lastSeq = $changes['last_seq'] ?? $lastSeq;
            Cache::forever('couchdb_sync_sequence', $lastSeq);

            if ($batchProcessed > 0) {
                $batchCount++;
                $this->info("   Batch {$batchCount}: Processed {$batchProcessed} documents");
            }

        } while (count($results ?? []) >= $batchSize);

        $this->newLine();
        $this->info("✅ Sync complete!");
        $this->info("   Total documents processed: {$totalProcessed}");
        $this->info("   Final sequence: {$lastSeq}");

        $this->displaySyncStats();

        return self::SUCCESS;
    }

    /**
     * Run continuous daemon sync.
     */
    protected function runDaemonSync(): int
    {
        $pollInterval = (int) $this->option('poll');
        $lastSeq = Cache::get('couchdb_sync_sequence', '0');

        $this->info("🚀 Running in daemon mode (poll interval: {$pollInterval}s)");
        $this->info("   Starting from sequence: {$lastSeq}");
        $this->info("   Press Ctrl+C to stop");
        $this->newLine();

        while (true) {
            try {
                $batchSize = (int) $this->option('batch');
                $changes = $this->couchDb->getChanges($lastSeq, [
                    'include_docs' => 'true',
                    'limit' => $batchSize,
                ]);

                $results = $changes['results'] ?? [];
                $count = 0;

                foreach ($results as $change) {
                    if (isset($change['deleted']) && $change['deleted']) {
                        continue;
                    }

                    if (isset($change['doc'])) {
                        $this->syncService->upsert($change['doc']);
                        $count++;
                    }
                }

                if ($count > 0) {
                    $this->info("[" . now()->toDateTimeString() . "] Processed {$count} changes");
                }

                $lastSeq = $changes['last_seq'] ?? $lastSeq;
                Cache::forever('couchdb_sync_sequence', $lastSeq);

            } catch (\Exception $e) {
                $this->error("Sync error: " . $e->getMessage());
                sleep(min($pollInterval * 2, 30));
            }

            sleep($pollInterval);
        }
    }

    /**
     * Test mode: Generate test data directly in MySQL.
     */
    protected function runTestMode(): int
    {
        $this->info('🧪 Test Data Generation Mode');
        $this->newLine();

        // Check if data already exists
        $existingSessions = ClinicalSession::count();
        if ($existingSessions > 0 && !$this->option('force')) {
            if (!$this->confirm("Found {$existingSessions} existing sessions. Continue and add more?")) {
                $this->info('Operation cancelled.');
                return self::SUCCESS;
            }
        }

        $this->info('📊 Generating test data...');

        // Get or create users
        $doctor = $this->ensureDoctorUser();
        $nurse = $this->ensureNurseUser();

        // Generate patients
        $patients = $this->generatePatients(10);

        // Generate sessions with referrals
        $this->generateSessionsWithReferrals($patients, $doctor, $nurse);

        $this->newLine();
        $this->info('✅ Test data generation complete!');
        $this->displaySyncStats();

        return self::SUCCESS;
    }

    /**
     * Verify mode: Check data integrity and display statistics.
     */
    protected function runVerifyMode(): int
    {
        $this->info('🔍 Verification Mode');
        $this->newLine();

        // Check CouchDB connection
        $couchDbStatus = $this->couchDb->databaseExists() ? '✅ Connected' : '❌ Not found';
        $this->info("   CouchDB: {$couchDbStatus}");

        // Check MySQL connection
        try {
            DB::connection()->getPdo();
            $this->info('   MySQL: ✅ Connected');
        } catch (\Exception $e) {
            $this->info('   MySQL: ❌ ' . $e->getMessage());
        }

        $this->newLine();
        $this->displaySyncStats();

        // Check sync sequence
        $sequence = Cache::get('couchdb_sync_sequence', '0');
        $this->info("   Sync Sequence: {$sequence}");

        // Check data integrity
        $this->newLine();
        $this->info('📋 Data Integrity Check:');

        $integrityChecks = [
            'Sessions without patients' => ClinicalSession::whereNotIn('patient_cpt', Patient::pluck('cpt'))->count(),
            'Forms without sessions' => ClinicalForm::whereNotIn('session_couch_id', ClinicalSession::pluck('couch_id'))->count(),
            'Referrals without sessions' => Referral::whereNotIn('session_couch_id', ClinicalSession::pluck('couch_id'))->count(),
        ];

        foreach ($integrityChecks as $check => $count) {
            $status = $count === 0 ? '✅' : '⚠️';
            $this->info("   {$status} {$check}: {$count}");
        }

        return self::SUCCESS;
    }

    /**
     * Display sync statistics.
     */
    protected function displaySyncStats(): void
    {
        $this->newLine();
        $this->info('📈 Database Statistics:');
        $this->info('   ┌─────────────────────────────────────┐');

        $stats = [
            'Patients' => Patient::count(),
            'Clinical Sessions' => ClinicalSession::count(),
            'Clinical Forms' => ClinicalForm::count(),
            'AI Requests' => \App\Models\AiRequest::count(),
            'Referrals' => Referral::count(),
        ];

        foreach ($stats as $label => $count) {
            $this->info(sprintf('   │ %-20s %10d │', $label, $count));
        }

        $this->info('   └─────────────────────────────────────┘');

        // Workflow state breakdown
        $this->newLine();
        $this->info('📊 Sessions by Workflow State:');

        $workflowStates = ClinicalSession::select('workflow_state', DB::raw('count(*) as total'))
            ->groupBy('workflow_state')
            ->get();

        foreach ($workflowStates as $state) {
            $this->info("   • {$state->workflow_state}: {$state->total}");
        }

        // Triage priority breakdown
        $this->newLine();
        $this->info('🚨 Sessions by Triage Priority:');

        $triagePriorities = ClinicalSession::select('triage_priority', DB::raw('count(*) as total'))
            ->groupBy('triage_priority')
            ->get();

        foreach ($triagePriorities as $priority) {
            $color = match ($priority->triage_priority) {
                'red' => '🔴',
                'yellow' => '🟡',
                'green' => '🟢',
                default => '⚪',
            };
            $this->info("   {$color} {$priority->triage_priority}: {$priority->total}");
        }
    }

    /**
     * Ensure a doctor user exists.
     */
    protected function ensureDoctorUser(): User
    {
        $doctor = User::whereHas('roles', fn($q) => $q->where('name', 'doctor'))->first();

        if (!$doctor) {
            $doctor = User::create([
                'name' => 'Dr. Test User',
                'email' => 'doctor@test.com',
                'password' => bcrypt('password'),
            ]);
            $doctor->assignRole('doctor');
        }

        return $doctor;
    }

    /**
     * Ensure a nurse user exists.
     */
    protected function ensureNurseUser(): User
    {
        $nurse = User::whereHas('roles', fn($q) => $q->where('name', 'nurse'))->first();

        if (!$nurse) {
            $nurse = User::create([
                'name' => 'Nurse Test User',
                'email' => 'nurse@test.com',
                'password' => bcrypt('password'),
            ]);
            $nurse->assignRole('nurse');
        }

        return $nurse;
    }

    /**
     * Generate test patients.
     */
    protected function generatePatients(int $count): array
    {
        $patients = [];
        $existingCount = Patient::count();

        for ($i = 0; $i < $count; $i++) {
            $patient = Patient::create([
                'couch_id' => 'patient_' . Str::uuid()->toString(),
                'cpt' => 'CPT' . str_pad($existingCount + $i + 100, 6, '0', STR_PAD_LEFT),
                'first_name' => fake()->firstName(),
                'last_name' => fake()->lastName(),
                'gender' => fake()->randomElement(['male', 'female']),
                'date_of_birth' => fake()->date('Y-m-d', '-80 years'),
                'phone' => fake()->phoneNumber(),
            ]);
            $patients[] = $patient;
        }

        $this->info("   ✓ Created {$count} patients");

        return $patients;
    }

    /**
     * Generate sessions with referrals for GP dashboard.
     */
    protected function generateSessionsWithReferrals(array $patients, User $doctor, User $nurse): void
    {
        $workflowStates = [
            ClinicalSession::WORKFLOW_REFERRED => 5,
            ClinicalSession::WORKFLOW_IN_GP_REVIEW => 3,
            ClinicalSession::WORKFLOW_UNDER_TREATMENT => 2,
        ];

        $totalSessions = 0;

        foreach ($workflowStates as $state => $count) {
            for ($i = 0; $i < $count; $i++) {
                $patient = $patients[array_rand($patients)];
                $couchId = 'session_' . Str::uuid()->toString();

                $triagePriority = fake()->randomElement(['red', 'yellow', 'green']);

                if ($state === ClinicalSession::WORKFLOW_REFERRED && $i < 2) {
                    $triagePriority = 'red';
                }

                $chiefComplaint = fake()->randomElement([
                    'Fever and cough',
                    'Abdominal pain',
                    'Headache',
                    'Chest pain',
                    'Shortness of breath',
                ]);

                $stage = match ($state) {
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

                // Create referral
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
                        ]),
                        'clinical_notes' => fake()->paragraph(),
                        'status' => $state === ClinicalSession::WORKFLOW_REFERRED ? 'pending' : 'accepted',
                    ]);
                }

                // Create clinical form
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
                    ],
                    'calculated' => [
                        'triagePriority' => $triagePriority,
                    ],
                    'form_created_at' => now()->subHours(fake()->numberBetween(1, 24)),
                    'form_updated_at' => now(),
                    'completed_at' => now()->subMinutes(fake()->numberBetween(30, 120)),
                    'synced_at' => now(),
                ]);

                $totalSessions++;
            }
        }

        $this->info("   ✓ Created {$totalSessions} clinical sessions with referrals");
    }

    /**
     * Handle invalid mode.
     */
    protected function invalidMode(string $mode): int
    {
        $this->error("Invalid mode: {$mode}");
        $this->info('Valid modes: auto, couchdb, test, verify');
        return self::FAILURE;
    }

    /**
     * Format bytes to human readable string.
     */
    protected function formatBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $i = 0;

        while ($bytes >= 1024 && $i < count($units) - 1) {
            $bytes /= 1024;
            $i++;
        }

        return round($bytes, 2) . ' ' . $units[$i];
    }
}
