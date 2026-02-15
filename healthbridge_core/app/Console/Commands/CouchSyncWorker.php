<?php

namespace App\Console\Commands;

use App\Services\CouchDbService;
use App\Services\SyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class CouchSyncWorker extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'couchdb:sync 
                            {--daemon : Run as a continuous daemon} 
                            {--poll=4 : Polling interval in seconds}
                            {--batch=100 : Maximum batch size per poll}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Sync CouchDB changes to MySQL';

    protected CouchDbService $couchDb;
    protected SyncService $syncService;
    protected string $sequenceCacheKey = 'couchdb_sync_sequence';

    /**
     * Execute the console command.
     */
    public function handle(CouchDbService $couchDb, SyncService $syncService): int
    {
        $this->couchDb = $couchDb;
        $this->syncService = $syncService;

        $this->info('Starting CouchDB Sync Worker...');
        $this->info('Database: ' . $couchDb->getDatabase());

        // Check if CouchDB is accessible
        if (!$couchDb->databaseExists()) {
            $this->error('CouchDB database not found: ' . $couchDb->getDatabase());
            return self::FAILURE;
        }

        $this->info('CouchDB connection established.');

        if ($this->option('daemon')) {
            $this->runContinuous();
        } else {
            $this->runOnce();
        }

        return self::SUCCESS;
    }

    /**
     * Run the sync worker once.
     */
    protected function runOnce(): void
    {
        $lastSeq = $this->getLastSequence();
        $this->info("Starting from sequence: {$lastSeq}");

        $result = $this->processChanges($lastSeq);

        $this->info("Processed {$result['count']} changes.");
        $this->info("New sequence: {$result['lastSeq']}");
    }

    /**
     * Run the sync worker continuously.
     */
    protected function runContinuous(): void
    {
        $pollInterval = (int) $this->option('poll');
        $lastSeq = $this->getLastSequence();

        $this->info("Running in daemon mode (poll interval: {$pollInterval}s)");
        $this->info("Starting from sequence: {$lastSeq}");

        while (true) {
            try {
                $result = $this->processChanges($lastSeq);

                if ($result['count'] > 0) {
                    $this->info("[" . now()->toDateTimeString() . "] Processed {$result['count']} changes");
                }

                $lastSeq = $result['lastSeq'];
                $this->saveLastSequence($lastSeq);

            } catch (\Exception $e) {
                $this->error("Sync error: " . $e->getMessage());
                Log::error('CouchDB sync error', [
                    'error' => $e->getMessage(),
                    'trace' => $e->getTraceAsString(),
                ]);

                // Backoff on error
                sleep(min($pollInterval * 2, 30));
            }

            sleep($pollInterval);
        }
    }

    /**
     * Process changes from CouchDB.
     */
    protected function processChanges(string $since): array
    {
        $batchSize = (int) $this->option('batch');

        try {
            $changes = $this->couchDb->getChanges($since, [
                'include_docs' => 'true',
                'limit' => $batchSize,
            ]);
        } catch (\Exception $e) {
            $this->error("Failed to get changes: " . $e->getMessage());
            throw $e;
        }

        $results = $changes['results'] ?? [];
        $count = 0;

        foreach ($results as $change) {
            // Skip deleted documents
            if (isset($change['deleted']) && $change['deleted']) {
                $this->handleDeletion($change);
                continue;
            }

            // Process the document
            if (isset($change['doc'])) {
                $this->syncService->upsert($change['doc']);
                $count++;
            }
        }

        $lastSeq = $changes['last_seq'] ?? $since;

        return [
            'count' => $count,
            'lastSeq' => $lastSeq,
        ];
    }

    /**
     * Handle a deleted document.
     */
    protected function handleDeletion(array $change): void
    {
        $id = $change['id'] ?? null;

        if (!$id) {
            return;
        }

        // Log the deletion - we don't actually delete from MySQL for audit purposes
        Log::info('CouchDB document deleted', ['id' => $id]);
        $this->warn("Document deleted: {$id}");
    }

    /**
     * Get the last processed sequence number.
     */
    protected function getLastSequence(): string
    {
        return Cache::get($this->sequenceCacheKey, '0');
    }

    /**
     * Save the last processed sequence number.
     */
    protected function saveLastSequence(string $seq): void
    {
        Cache::forever($this->sequenceCacheKey, $seq);
    }

    /**
     * Reset the sequence to start from the beginning.
     */
    public function resetSequence(): void
    {
        Cache::forget($this->sequenceCacheKey);
        $this->info('Sequence reset to 0');
    }
}
