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

        // Create reports design document for clinical reports
        $this->createReportsDesignDocument();

        // Create validation document for document structure
        $this->createValidationDocument();
    }

    /**
     * Create reports design document for clinical reports.
     */
    protected function createReportsDesignDocument(): void
    {
        $reportsDesignDoc = [
            '_id' => '_design/reports',
            'views' => [
                'by_session' => [
                    'map' => "function(doc) { if (doc.type === 'clinicalReport' && doc.session_couch_id) { emit(doc.session_couch_id, doc); } }"
                ],
                'by_patient' => [
                    'map' => "function(doc) { if (doc.type === 'clinicalReport' && doc.patient_cpt) { emit(doc.patient_cpt, doc); } }"
                ],
                'by_type' => [
                    'map' => "function(doc) { if (doc.type === 'clinicalReport' && doc.report_type) { emit(doc.report_type, doc); } }"
                ],
                'by_date' => [
                    'map' => "function(doc) { if (doc.type === 'clinicalReport' && doc.generated_at) { emit(doc.generated_at, doc); } }"
                ],
            ],
        ];

        // Check if reports design doc exists and get revision
        $existingDoc = $this->couchDb->getDocument('_design/reports');
        if ($existingDoc && isset($existingDoc['_rev'])) {
            $reportsDesignDoc['_rev'] = $existingDoc['_rev'];
        }

        try {
            $this->couchDb->saveDocument($reportsDesignDoc);
            $this->info('✓ Reports design document created/updated');
        } catch (\Exception $e) {
            $this->error('Failed to create reports design document: ' . $e->getMessage());
        }
    }

    /**
     * Create validation document.
     * 
     * This validation function enforces:
     * - Document type requirements
     * - User ownership for document modifications
     * - Required fields for clinical documents
     * - Role-based access control
     */
    protected function createValidationDocument(): void
    {
        $validationDoc = [
            '_id' => '_design/validation',
            'validate_doc_update' => $this->getValidationFunction()
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
     * Get the validation function JavaScript code.
     */
    protected function getValidationFunction(): string
    {
        return <<<'JS'
function(newDoc, oldDoc, userCtx) {
  // ============================================
  // ADMIN BYPASS
  // ============================================
  
  // Allow server admins to do anything
  if (userCtx.roles.indexOf('_admin') !== -1) {
    return;
  }
  
  // Allow healthbridge_admin role to do anything
  if (userCtx.roles.indexOf('healthbridge_admin') !== -1) {
    return;
  }
  
  // ============================================
  // AUTHENTICATION CHECK
  // ============================================
  
  // Require authentication for all writes
  if (!userCtx.name) {
    throw({forbidden: 'Authentication required. Please log in.'});
  }
  
  // ============================================
  // DOCUMENT TYPE VALIDATION
  // ============================================
  
  // Valid document types
  var validTypes = [
    'clinicalPatient',
    'clinicalSession', 
    'clinicalForm',
    'aiLog',
    'ruleVersion',
    'config'
  ];
  
  if (newDoc.type && validTypes.indexOf(newDoc.type) === -1) {
    throw({forbidden: 'Invalid document type: ' + newDoc.type});
  }
  
  // Require type field for new documents
  if (!newDoc.type) {
    throw({forbidden: 'Document must have a type field'});
  }
  
  // ============================================
  // REQUIRED FIELDS
  // ============================================
  
  // All documents must have created_at
  if (!newDoc.created_at && !oldDoc) {
    throw({forbidden: 'New documents must have a created_at field'});
  }
  
  // All documents must have created_by for new documents
  if (!newDoc.created_by && !oldDoc) {
    throw({forbidden: 'New documents must have a created_by field'});
  }
  
  // ============================================
  // OWNERSHIP VALIDATION
  // ============================================
  
  // For updates, check ownership
  if (oldDoc && oldDoc.created_by) {
    var isOwner = (oldDoc.created_by === userCtx.name);
    var isDoctor = (userCtx.roles.indexOf('doctor') !== -1);
    var isSeniorNurse = (userCtx.roles.indexOf('senior-nurse') !== -1);
    var isAdmin = (userCtx.roles.indexOf('admin') !== -1);
    
    // Only owner, doctors, senior nurses, or admins can modify
    if (!isOwner && !isDoctor && !isSeniorNurse && !isAdmin) {
      throw({
        forbidden: 'You can only modify documents you created. ' +
                   'This document was created by ' + oldDoc.created_by
      });
    }
  }
  
  // ============================================
  // DOCUMENT-SPECIFIC VALIDATION
  // ============================================
  
  // Clinical Patient validation
  if (newDoc.type === 'clinicalPatient') {
    if (!newDoc.patient || !newDoc.patient.cpt) {
      throw({forbidden: 'Patient documents must have a patient.cpt field'});
    }
  }
  
  // Clinical Session validation
  if (newDoc.type === 'clinicalSession') {
    if (!newDoc.patientCpt && !newDoc.patient_cpt) {
      throw({forbidden: 'Clinical session must reference a patient'});
    }
    
    // Validate triage priority
    var validTriage = ['red', 'yellow', 'green', 'unknown'];
    if (newDoc.triage && validTriage.indexOf(newDoc.triage) === -1) {
      throw({forbidden: 'Invalid triage priority: ' + newDoc.triage});
    }
    
    // Validate status
    var validStatus = ['open', 'completed', 'archived', 'referred', 'cancelled'];
    if (newDoc.status && validStatus.indexOf(newDoc.status) === -1) {
      throw({forbidden: 'Invalid session status: ' + newDoc.status});
    }
  }
  
  // Clinical Form validation
  if (newDoc.type === 'clinicalForm') {
    if (!newDoc.sessionId && !newDoc.session_couch_id) {
      throw({forbidden: 'Clinical form must reference a session'});
    }
    if (!newDoc.schemaId && !newDoc.schema_id) {
      throw({forbidden: 'Clinical form must have a schema ID'});
    }
  }
  
  // AI Log validation
  if (newDoc.type === 'aiLog') {
    if (!newDoc.task) {
      throw({forbidden: 'AI log must have a task field'});
    }
  }
  
  // ============================================
  // DELETION PROTECTION
  // ============================================
  
  // Prevent deletion of clinical documents by non-admins
  if (newDoc._deleted) {
    var isClinicalDoc = ['clinicalPatient', 'clinicalSession', 'clinicalForm']
                        .indexOf(oldDoc.type) !== -1;
    
    if (isClinicalDoc) {
      var isAdmin = (userCtx.roles.indexOf('admin') !== -1);
      if (!isAdmin) {
        throw({
          forbidden: 'Clinical documents cannot be deleted. ' +
                     'Use status changes instead. Contact admin for assistance.'
        });
      }
    }
  }
  
  // ============================================
  // AUDIT TRAIL
  // ============================================
  
  // Ensure updated_by is set for updates
  if (oldDoc && !newDoc._deleted) {
    if (!newDoc.updated_by) {
      throw({forbidden: 'Document updates must have an updated_by field'});
    }
    if (!newDoc.updated_at) {
      throw({forbidden: 'Document updates must have an updated_at field'});
    }
  }
}
JS;
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
