<?php

namespace App\Console\Commands;

use App\Services\CouchDbService;
use App\Services\SyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class CouchSyncWorker extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'sync:couch 
                            {--interval=4 : Interval in seconds between sync cycles}
                            {--limit=100 : Maximum documents to process per cycle}
                            {--once : Run only once instead of continuously}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'CouchDB to MySQL sync worker. Polls CouchDB for changes and syncs to MySQL.';

    /**
     * Last processed sequence
     */
    protected string $lastSequence = '0';

    /**
     * Create a new command instance.
     *
     * @param CouchDbService $couchDb CouchDB service for fetching changes
     * @param SyncService $syncService Sync service for persisting to MySQL
     */
    public function __construct(
        protected CouchDbService $couchDb,
        protected SyncService $syncService
    ) {
        parent::__construct();
    }

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $interval = (int) $this->option('interval');
        $limit = (int) $this->option('limit');
        $runOnce = $this->option('once');

        $this->info("CouchDB Sync Worker starting...");
        $this->info("Interval: {$interval}s, Limit: {$limit} docs/cycle");
        
        // Load last sequence from storage if available
        $this->lastSequence = $this->getLastSequence();

        if ($runOnce) {
            return $this->runSyncCycle($limit) ? Command::SUCCESS : Command::FAILURE;
        }

        // Continuous mode
        while (true) {
            $this->info("Running sync cycle...");
            
            try {
                $processed = $this->runSyncCycle($limit);
                
                if ($processed > 0) {
                    $this->info("Processed {$processed} documents");
                } else {
                    $this->info("No new documents to sync");
                }
            } catch (\Exception $e) {
                $this->error("Sync error: " . $e->getMessage());
                Log::error('CouchSyncWorker error', ['error' => $e->getMessage()]);
            }

            $this->saveLastSequence();
            sleep($interval);
        }

        return Command::SUCCESS;
    }

    /**
     * Run a single sync cycle
     */
    protected function runSyncCycle(int $limit): int
    {
        try {
            // Get changes since last sequence
            $changes = $this->couchDb->getChanges($this->lastSequence, [
                'limit' => $limit,
                'include_docs' => true,
            ]);

            $results = $changes['results'] ?? [];
            
            if (empty($results)) {
                return 0;
            }

            $processed = 0;
            
            foreach ($results as $change) {
                if (!isset($change['doc'])) {
                    continue;
                }

                $doc = $change['doc'];
                $docId = $doc['_id'] ?? '';
                $docType = $doc['type'] ?? '';

                // Only process our document types
                $allowedTypes = [
                    'clinicalPatient',
                    'clinicalSession', 
                    'clinicalForm',
                    'aiLog',
                    'clinicalReport',
                    'radiologyStudy',
                ];

                if (!in_array($docType, $allowedTypes)) {
                    continue;
                }

                try {
                    $this->syncService->upsert($doc);
                    $processed++;
                    
                    $this->line("Synced {$docType}: {$docId}");
                } catch (\Exception $e) {
                    $this->error("Failed to sync {$docId}: " . $e->getMessage());
                    Log::error('CouchSyncWorker: Document sync failed', [
                        'id' => $docId,
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            // Update sequence
            $this->lastSequence = $changes['last_seq'] ?? $this->lastSequence;

            return $processed;

        } catch (\Exception $e) {
            $this->error("Failed to fetch changes: " . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Get last sequence from storage
     * Uses file cache for persistence in production environments
     */
    protected function getLastSequence(): string
    {
        // Use file cache driver for persistence, fallback to default
        $cacheStore = config('cache.default') === 'array' ? 'file' : config('cache.default');
        return cache()->store($cacheStore)->get('couchdb_last_sequence', '0');
    }

    /**
     * Save last sequence to storage
     */
    protected function saveLastSequence(): void
    {
        $cacheStore = config('cache.default') === 'array' ? 'file' : config('cache.default');
        cache()->store($cacheStore)->put('couchdb_last_sequence', $this->lastSequence, 86400);
    }
}
