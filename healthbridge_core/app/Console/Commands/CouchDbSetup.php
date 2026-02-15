<?php

namespace App\Console\Commands;

use App\Services\CouchDbService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class CouchDbSetup extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'couchdb:setup
                            {--create-db : Create the database if it doesn\'t exist}
                            {--design-docs : Create design documents for views}
                            {--reset : Reset and recreate everything}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Setup and configure CouchDB for HealthBridge';

    protected CouchDbService $couchDb;

    /**
     * Execute the console command.
     */
    public function handle(CouchDbService $couchDb): int
    {
        $this->couchDb = $couchDb;
        $this->info('Setting up CouchDB for HealthBridge...');
        $this->info('Host: ' . $couchDb->getBaseUrl());
        $this->info('Database: ' . $couchDb->getDatabase());

        // Test connection to CouchDB server
        if (!$this->testConnection()) {
            $this->error('Cannot connect to CouchDB server. Please ensure CouchDB is running.');
            return self::FAILURE;
        }

        $this->info('✓ Connected to CouchDB server');

        // Handle database creation
        if ($this->option('create-db') || $this->option('reset')) {
            $this->setupDatabase();
        }

        // Handle design documents
        if ($this->option('design-docs') || $this->option('reset')) {
            $this->createDesignDocuments();
        }

        // Show status
        $this->showStatus();

        return self::SUCCESS;
    }

    /**
     * Test connection to CouchDB server.
     */
    protected function testConnection(): bool
    {
        try {
            $response = Http::withBasicAuth(
                config('services.couchdb.username', env('COUCHDB_USERNAME', '')),
                config('services.couchdb.password', env('COUCHDB_PASSWORD', ''))
            )->get($this->couchDb->getBaseUrl() . '/_up');

            return $response->successful();
        } catch (\Exception $e) {
            return false;
        }
    }

    /**
     * Setup the database.
     */
    protected function setupDatabase(): void
    {
        $database = $this->couchDb->getDatabase();
        $url = $this->couchDb->getBaseUrl() . '/' . $database;

        // Check if database exists
        $exists = $this->couchDb->databaseExists();

        if ($exists && $this->option('reset')) {
            $this->warn('Deleting existing database...');
            Http::withBasicAuth(
                config('services.couchdb.username', env('COUCHDB_USERNAME', '')),
                config('services.couchdb.password', env('COUCHDB_PASSWORD', ''))
            )->delete($url);
            $exists = false;
        }

        if (!$exists) {
            $this->info('Creating database: ' . $database);
            $response = Http::withBasicAuth(
                config('services.couchdb.username', env('COUCHDB_USERNAME', '')),
                config('services.couchdb.password', env('COUCHDB_PASSWORD', ''))
            )->put($url);

            if ($response->successful()) {
                $this->info('✓ Database created successfully');
            } else {
                $this->error('Failed to create database: ' . $response->body());
            }
        } else {
            $this->info('✓ Database already exists');
        }
    }

    /**
     * Create design documents for views.
     */
    protected function createDesignDocuments(): void
    {
        $this->info('Creating design documents...');

        // Main design document with views
        $designDoc = [
            '_id' => '_design/main',
            'views' => [
                'by_type' => [
                    'map' => "function(doc) { if (doc.type) { emit(doc.type, doc); } }"
                ],
                'by_patient' => [
                    'map' => "function(doc) { if (doc.patient_id) { emit(doc.patient_id, doc); } }"
                ],
                'by_session' => [
                    'map' => "function(doc) { if (doc.session_id) { emit(doc.session_id, doc); } }"
                ],
                'by_created_at' => [
                    'map' => "function(doc) { if (doc.created_at) { emit(doc.created_at, doc); } }"
                ],
                'by_status' => [
                    'map' => "function(doc) { if (doc.status) { emit(doc.status, doc); } }"
                ],
                'patients_by_name' => [
                    'map' => "function(doc) { if (doc.type === 'patient' && doc.name) { emit(doc.name.toLowerCase(), doc); } }"
                ],
                'clinical_forms_by_date' => [
                    'map' => "function(doc) { if (doc.type === 'clinical_form' && doc.form_date) { emit(doc.form_date, doc); } }"
                ],
                'referrals_pending' => [
                    'map' => "function(doc) { if (doc.type === 'referral' && doc.status === 'pending') { emit(doc.created_at, doc); } }"
                ],
            ],
            'lists' => [
                'only_ids' => "function(head, req) { var row; var result = []; while (row = getRow()) { result.push(row.id); } return JSON.stringify(result); }"
            ]
        ];

        // Check if design doc exists and get revision
        $existingDoc = $this->couchDb->getDocument('_design/main');
        if ($existingDoc && isset($existingDoc['_rev'])) {
            $designDoc['_rev'] = $existingDoc['_rev'];
        }

        try {
            $this->couchDb->saveDocument($designDoc);
            $this->info('✓ Design document created/updated');
        } catch (\Exception $e) {
            $this->error('Failed to create design document: ' . $e->getMessage());
        }

        // Create validation document for document structure
        $this->createValidationDocument();
    }

    /**
     * Create validation document.
     */
    protected function createValidationDocument(): void
    {
        $validationDoc = [
            '_id' => '_design/validation',
            'validate_doc_update' => "function(newDoc, oldDoc, userCtx) { 
                // Allow admins to do anything
                if (userCtx.roles.indexOf('_admin') !== -1) { return; }
                
                // Require type field
                if (!newDoc.type) {
                    throw({forbidden: 'Document must have a type field'});
                }
                
                // Require created_at field
                if (!newDoc.created_at) {
                    throw({forbidden: 'Document must have a created_at field'});
                }
            }"
        ];

        // Check if validation doc exists
        $existingDoc = $this->couchDb->getDocument('_design/validation');
        if ($existingDoc && isset($existingDoc['_rev'])) {
            $validationDoc['_rev'] = $existingDoc['_rev'];
        }

        try {
            $this->couchDb->saveDocument($validationDoc);
            $this->info('✓ Validation document created/updated');
        } catch (\Exception $e) {
            $this->error('Failed to create validation document: ' . $e->getMessage());
        }
    }

    /**
     * Show current status.
     */
    protected function showStatus(): void
    {
        $this->newLine();
        $this->info('=== CouchDB Status ===');

        if ($this->couchDb->databaseExists()) {
            $info = $this->couchDb->getDatabaseInfo();
            $this->info('Database: ' . $this->couchDb->getDatabase());
            $this->info('Document Count: ' . ($info['doc_count'] ?? 0));
            $this->info('Data Size: ' . $this->formatBytes($info['data_size'] ?? 0));
            $this->info('Update Sequence: ' . ($info['update_seq'] ?? '0'));

            // Check design documents
            $this->newLine();
            $this->info('Design Documents:');
            $designDoc = $this->couchDb->getDocument('_design/main');
            if ($designDoc) {
                $viewCount = count($designDoc['views'] ?? []);
                $this->info("  - _design/main ({$viewCount} views)");
            } else {
                $this->warn('  - _design/main (not found)');
            }
        } else {
            $this->warn('Database does not exist. Run with --create-db to create it.');
        }
    }

    /**
     * Format bytes to human readable.
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
