<?php

namespace App\Services;

use App\Models\Patient;
use App\Models\ClinicalSession;
use App\Models\ClinicalForm;
use App\Models\AiRequest;
use Illuminate\Support\Facades\Log;

class SyncService
{
    /**
     * Upsert a document from CouchDB to MySQL.
     */
    public function upsert(array $doc): void
    {
        $type = $doc['type'] ?? null;

        Log::debug('SyncService: Processing document', [
            'id' => $doc['_id'] ?? 'unknown',
            'type' => $type,
        ]);

        if (!$type) {
            Log::warning('SyncService: Document missing type field', ['id' => $doc['_id'] ?? 'unknown']);
            return;
        }

        try {
            match ($type) {
                'clinicalPatient' => $this->syncPatient($doc),
                'clinicalSession' => $this->syncSession($doc),
                'clinicalForm' => $this->syncForm($doc),
                'aiLog' => $this->syncAiLog($doc),
                default => $this->handleUnknown($doc),
            };
        } catch (\Exception $e) {
            Log::error('SyncService: Failed to sync document', [
                'id' => $doc['_id'] ?? 'unknown',
                'type' => $type,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Sync a patient document.
     */
    protected function syncPatient(array $doc): void
    {
        // Check if patient data is encrypted
        $isEncrypted = $doc['encrypted'] ?? false;
        
        // Extract CPT from document ID (format: "patient:CPT" or just use the ID)
        $couchId = $doc['_id'] ?? '';
        $cpt = null;
        
        if (str_starts_with($couchId, 'patient:')) {
            $cpt = substr($couchId, 8); // Extract CPT after "patient:" prefix
        } elseif (str_starts_with($couchId, 'patient')) {
            $cpt = substr($couchId, 7); // Handle "patient" prefix without colon
        }
        
        // If encrypted, we can only store the CPT and raw document
        if ($isEncrypted) {
            Log::debug('SyncService: Patient document is encrypted, storing metadata only', [
                'id' => $couchId,
                'cpt' => $cpt,
            ]);
            
            Patient::updateOrCreate(
                ['couch_id' => $couchId],
                [
                    'cpt' => $cpt ?? 'UNKNOWN-' . substr($couchId, -8),
                    'visit_count' => 1,
                    'is_active' => true,
                    'raw_document' => $doc,
                ]
            );
            
            Log::debug('SyncService: Synced encrypted patient', ['cpt' => $cpt]);
            return;
        }
        
        // Non-encrypted patient data
        $patient = $doc['patient'] ?? $doc;

        Patient::updateOrCreate(
            ['couch_id' => $couchId],
            [
                'cpt' => $patient['cpt'] ?? $cpt ?? $patient['id'] ?? null,
                'short_code' => $patient['shortCode'] ?? null,
                'external_id' => $patient['externalId'] ?? null,
                'date_of_birth' => $patient['dateOfBirth'] ?? null,
                'age_months' => $this->calculateAgeMonths($patient['dateOfBirth'] ?? null),
                'gender' => $patient['gender'] ?? null,
                'weight_kg' => $patient['weightKg'] ?? null,
                'phone' => $patient['phone'] ?? null,
                'visit_count' => $patient['visitCount'] ?? 1,
                'is_active' => $patient['isActive'] ?? true,
                'raw_document' => $doc,
                'last_visit_at' => $patient['lastVisit'] ?? null,
            ]
        );

        Log::debug('SyncService: Synced patient', ['cpt' => $patient['cpt'] ?? $cpt ?? 'unknown']);
    }

    /**
     * Sync a clinical session document.
     */
    protected function syncSession(array $doc): void
    {
        $data = [
            'session_uuid' => $doc['id'] ?? $doc['_id'],
            'patient_cpt' => $doc['patientCpt'] ?? $doc['patientId'] ?? null,
            'stage' => $doc['stage'] ?? 'registration',
            'status' => $doc['status'] ?? 'open',
            'triage_priority' => $doc['triage'] ?? $doc['triagePriority'] ?? $doc['triage_priority'] ?? 'unknown',
            'chief_complaint' => $doc['chiefComplaint'] ?? $doc['chief_complaint'] ?? null,
            'notes' => $doc['notes'] ?? null,
            'treatment_plan' => $doc['treatmentPlan'] ?? $doc['treatment_plan'] ?? null,
            'form_instance_ids' => $doc['formInstanceIds'] ?? $doc['form_instance_ids'] ?? [],
            'session_created_at' => $this->parseTimestamp($doc['createdAt'] ?? null),
            'session_updated_at' => $this->parseTimestamp($doc['updatedAt'] ?? null),
            'raw_document' => $doc,
            'synced_at' => now(),
        ];

        // Only set workflow_state if provided (column has default 'NEW')
        if (isset($doc['workflowState']) || isset($doc['workflow_state'])) {
            $data['workflow_state'] = $doc['workflowState'] ?? $doc['workflow_state'];
        }
        
        // Only set workflow_state_updated_at if provided
        $workflowStateUpdatedAt = $doc['workflowStateUpdatedAt'] ?? $doc['workflow_state_updated_at'] ?? null;
        if ($workflowStateUpdatedAt) {
            $data['workflow_state_updated_at'] = $this->parseTimestamp($workflowStateUpdatedAt);
        }

        // Extract nurse/frontline worker information
        // createdBy is the user ID who created the session
        // providerId is the healthcare provider ID
        // providerRole is the role (nurse, chw, doctor, etc.)
        $createdBy = $doc['createdBy'] ?? $doc['created_by'] ?? $doc['providerId'] ?? $doc['provider_id'] ?? null;
        if ($createdBy) {
            $data['created_by_user_id'] = $this->resolveUserId($createdBy);
        }
        
        $providerRole = $doc['providerRole'] ?? $doc['provider_role'] ?? $doc['creatorRole'] ?? $doc['creator_role'] ?? null;
        if ($providerRole) {
            $data['provider_role'] = $providerRole;
        }

        ClinicalSession::updateOrCreate(
            ['couch_id' => $doc['_id']],
            $data
        );

        Log::debug('SyncService: Synced session', [
            'id' => $doc['_id'], 
            'workflow_state' => $doc['workflowState'] ?? 'unknown',
            'created_by' => $createdBy,
        ]);
    }

    /**
     * Sync a clinical form document.
     */
    protected function syncForm(array $doc): void
    {
        $data = [
            'form_uuid' => $doc['_id'],
            'session_couch_id' => $doc['sessionId'] ?? null,
            'patient_cpt' => $doc['patientId'] ?? null,
            'schema_id' => $doc['schemaId'] ?? 'unknown',
            'schema_version' => $doc['schemaVersion'] ?? null,
            'current_state_id' => $doc['currentStateId'] ?? null,
            'status' => $doc['status'] ?? 'draft',
            'sync_status' => 'synced',
            'answers' => $doc['answers'] ?? [],
            'calculated' => $doc['calculated'] ?? null,
            'audit_log' => $doc['auditLog'] ?? null,
            'form_created_at' => $doc['createdAt'] ?? null,
            'form_updated_at' => $doc['updatedAt'] ?? null,
            'completed_at' => $doc['completedAt'] ?? null,
            'raw_document' => $doc,
            'synced_at' => now(),
        ];

        // Extract nurse/frontline worker information
        // createdBy is the user ID who created/filled the form
        $createdBy = $doc['createdBy'] ?? $doc['created_by'] ?? $doc['filledBy'] ?? $doc['filled_by'] ?? null;
        if ($createdBy) {
            $data['created_by_user_id'] = $this->resolveUserId($createdBy);
        }
        
        $creatorRole = $doc['creatorRole'] ?? $doc['creator_role'] ?? $doc['filledByRole'] ?? null;
        if ($creatorRole) {
            $data['creator_role'] = $creatorRole;
        }

        ClinicalForm::updateOrCreate(
            ['couch_id' => $doc['_id']],
            $data
        );

        Log::debug('SyncService: Synced form', [
            'id' => $doc['_id'],
            'created_by' => $createdBy,
        ]);
    }

    /**
     * Sync an AI log document.
     */
    protected function syncAiLog(array $doc): void
    {
        $data = [
            'session_couch_id' => $doc['sessionId'] ?? null,
            'form_couch_id' => $doc['formInstanceId'] ?? null,
            'task' => $doc['task'] ?? null,
            'use_case' => $doc['useCase'] ?? null,
            'prompt_version' => $doc['promptVersion'] ?? null,
            'input_hash' => $doc['promptHash'] ?? null,
            'prompt' => $doc['prompt'] ?? null,
            'response' => $doc['output'] ?? null,
            'model' => $doc['model'] ?? null,
            'model_version' => $doc['modelVersion'] ?? null,
            'latency_ms' => $doc['latencyMs'] ?? null,
            'was_overridden' => $doc['wasOverridden'] ?? false,
            'risk_flags' => $doc['riskFlags'] ?? null,
            'requested_at' => $doc['createdAt'] ?? now(),
        ];

        // Extract nurse/frontline worker information for AI requests
        // This links AI-generated content to the healthcare worker who requested it
        $userId = $doc['userId'] ?? $doc['user_id'] ?? $doc['requestedBy'] ?? $doc['requested_by'] ?? null;
        if ($userId) {
            $data['user_id'] = $this->resolveUserId($userId);
        }
        
        $role = $doc['role'] ?? $doc['userRole'] ?? $doc['user_role'] ?? null;
        if ($role) {
            $data['role'] = $role;
        }

        // Extract form section context for precise tracking
        // This enables tracing AI responses to specific form sections
        $formSectionId = $doc['formSectionId'] ?? $doc['form_section_id'] ?? $doc['sectionId'] ?? $doc['section_id'] ?? null;
        if ($formSectionId) {
            $data['form_section_id'] = $formSectionId;
        }
        
        $formFieldId = $doc['formFieldId'] ?? $doc['form_field_id'] ?? $doc['fieldId'] ?? $doc['field_id'] ?? null;
        if ($formFieldId) {
            $data['form_field_id'] = $formFieldId;
        }
        
        $formSchemaId = $doc['formSchemaId'] ?? $doc['form_schema_id'] ?? $doc['schemaId'] ?? $doc['schema_id'] ?? null;
        if ($formSchemaId) {
            $data['form_schema_id'] = $formSchemaId;
        }

        AiRequest::updateOrCreate(
            ['request_uuid' => $doc['_id']],
            $data
        );

        Log::debug('SyncService: Synced AI log', [
            'id' => $doc['_id'],
            'user_id' => $userId,
            'role' => $role,
            'form_section' => $formSectionId,
        ]);
    }

    /**
     * Handle unknown document types.
     */
    protected function handleUnknown(array $doc): void
    {
        Log::info('SyncService: Unknown document type', [
            'id' => $doc['_id'] ?? 'unknown',
            'type' => $doc['type'] ?? 'missing',
        ]);
    }

    /**
     * Parse timestamp from CouchDB format.
     */
    protected function parseTimestamp($value): ?string
    {
        if (!$value) {
            return null;
        }

        // Handle numeric timestamp (milliseconds)
        if (is_numeric($value)) {
            // Convert milliseconds to seconds
            $seconds = $value / 1000;
            return date('Y-m-d H:i:s', (int) $seconds);
        }

        // Handle ISO string
        return $value;
    }

    /**
     * Calculate age in months from date of birth.
     */
    protected function calculateAgeMonths(?string $dateOfBirth): ?int
    {
        if (!$dateOfBirth) {
            return null;
        }

        try {
            $dob = new \DateTime($dateOfBirth);
            $now = new \DateTime();
            $diff = $dob->diff($now);
            
            return ($diff->y * 12) + $diff->m;
        } catch (\Exception $e) {
            return null;
        }
    }

    /**
     * Resolve a user ID from CouchDB to MySQL user ID.
     * 
     * CouchDB documents may contain user IDs in various formats:
     * - Integer ID (direct MySQL user ID)
     * - String numeric ID (convertible to integer)
     * - UUID or other identifier (requires lookup)
     * 
     * @param mixed $userId The user ID from CouchDB
     * @return int|null The MySQL user ID, or null if not found
     */
    protected function resolveUserId($userId): ?int
    {
        if (!$userId) {
            return null;
        }

        // If it's already a numeric ID, return it directly
        if (is_numeric($userId)) {
            return (int) $userId;
        }

        // If it's a string that looks like a numeric ID
        if (is_string($userId) && ctype_digit($userId)) {
            return (int) $userId;
        }

        // For UUID or other string identifiers, try to find the user
        // This handles cases where CouchDB stores user UUIDs instead of MySQL IDs
        $user = \App\Models\User::where('email', $userId)
            ->orWhere('id', $userId)
            ->first();

        return $user?->id;
    }

    /**
     * Process a batch of changes.
     */
    public function processBatch(array $changes): int
    {
        $count = 0;

        foreach ($changes as $change) {
            if (isset($change['doc'])) {
                $this->upsert($change['doc']);
                $count++;
            }
        }

        return $count;
    }
}
