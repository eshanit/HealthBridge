<?php

namespace App\Console\Commands;

use App\Services\CouchDbService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Command to add type field to existing CouchDB documents.
 * 
 * This is a one-time migration for documents created before the type field
 * requirement was enforced.
 * 
 * Usage:
 *   php artisan couchdb:migrate-types
 *   php artisan couchdb:migrate-types --dry-run
 */
class MigrateCouchDbTypes extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'couchdb:migrate-types 
                            {--dry-run : Show what would be updated without making changes}
                            {--batch=100 : Number of documents to process per batch}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Add type field to CouchDB documents missing it';

    protected CouchDbService $couchDb;

    /**
     * Mapping of document ID prefixes to their types.
     */
    protected array $typeMapping = [
        'session:' => 'clinicalSession',
        'form_peds_respiratory_treatment_' => 'clinicalForm',
        'form_peds_respiratory_' => 'clinicalForm',
        'form_' => 'clinicalForm',
        'patient:' => 'clinicalPatient',
        'patient:CP-' => 'clinicalPatient',
    ];

    /**
     * Execute the console command.
     */
    public function handle(CouchDbService $couchDb): int
    {
        $this->couchDb = $couchDb;
        $dryRun = $this->option('dry-run');
        $batchSize = (int) $this->option('batch');

        $this->info('Starting CouchDB document type migration...');
        $this->info('Database: ' . $couchDb->getDatabase());

        if ($dryRun) {
            $this->warn('DRY RUN MODE - No changes will be made');
        }

        // Check if CouchDB is accessible
        if (!$couchDb->databaseExists()) {
            $this->error('CouchDB database not found: ' . $couchDb->getDatabase());
            return self::FAILURE;
        }

        $this->info('CouchDB connection established.');

        // Get all documents
        $this->info('Fetching all documents...');
        
        $result = $couchDb->getAllDocs();
        $rows = $result['rows'] ?? [];
        
        $total = count($rows);
        $this->info("Found {$total} documents to analyze.");

        $updated = 0;
        $skipped = 0;
        $unknown = 0;
        $batch = [];

        $this->output->progressStart($total);

        foreach ($rows as $row) {
            $doc = $row['doc'] ?? null;
            
            if (!$doc) {
                $skipped++;
                $this->output->progressAdvance();
                continue;
            }

            $id = $doc['_id'] ?? '';
            
            // Skip design documents
            if (str_starts_with($id, '_design/')) {
                $skipped++;
                $this->output->progressAdvance();
                continue;
            }

            // Skip documents that already have a type
            if (isset($doc['type']) && !empty($doc['type'])) {
                $skipped++;
                $this->output->progressAdvance();
                continue;
            }

            // Infer type from _id prefix
            $type = $this->inferType($id);

            if (!$type) {
                $unknown++;
                Log::warning('MigrateCouchDbTypes: Cannot infer type for document', ['id' => $id]);
                $this->output->progressAdvance();
                continue;
            }

            // Add type to document
            $doc['type'] = $type;
            $batch[] = $doc;
            $updated++;

            // Process in batches
            if (count($batch) >= $batchSize) {
                if (!$dryRun) {
                    $this->saveBatch($batch);
                }
                $batch = [];
            }

            $this->output->progressAdvance();
        }

        // Save remaining documents
        if (!empty($batch) && !$dryRun) {
            $this->saveBatch($batch);
        }

        $this->output->progressFinish();

        $this->newLine();
        $this->info('Migration Summary:');
        $this->table(
            ['Status', 'Count'],
            [
                ['Updated', $updated],
                ['Skipped (already had type)', $skipped],
                ['Unknown (could not infer)', $unknown],
                ['Total processed', $total],
            ]
        );

        if ($dryRun) {
            $this->warn('DRY RUN - No actual changes were made.');
            $this->info("Run without --dry-run to apply {$updated} changes.");
        } else {
            $this->info("Migration complete. Updated {$updated} documents.");
            
            // Reset sync sequence to reprocess all documents
            $this->info('Resetting sync sequence...');
            $this->call('couchdb:sync', ['--reset' => true, '--batch' => 500]);
        }

        return self::SUCCESS;
    }

    /**
     * Infer document type from ID prefix.
     */
    protected function inferType(string $id): ?string
    {
        // Check each prefix in order (longer prefixes first for accuracy)
        $sortedMapping = $this->typeMapping;
        uksort($sortedMapping, function ($a, $b) {
            return strlen($b) - strlen($a);
        });

        foreach ($sortedMapping as $prefix => $type) {
            if (str_starts_with($id, $prefix)) {
                return $type;
            }
        }

        // Special cases
        if (preg_match('/^patient:[A-Z0-9-]+$/i', $id)) {
            return 'clinicalPatient';
        }

        if (preg_match('/^timeline:/i', $id)) {
            return 'timeline';  // Not synced to MySQL but has a type
        }

        return null;
    }

    /**
     * Save a batch of documents to CouchDB.
     */
    protected function saveBatch(array $batch): void
    {
        try {
            // Use saveDocument for each document in the batch
            foreach ($batch as $doc) {
                $this->couchDb->saveDocument($doc);
            }
        } catch (\Exception $e) {
            Log::error('MigrateCouchDbTypes: Batch save failed', [
                'error' => $e->getMessage(),
                'batch_size' => count($batch),
            ]);
            
            $this->error('Failed to save batch: ' . $e->getMessage());
        }
    }
}
