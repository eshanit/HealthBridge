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
        $patient = $doc['patient'] ?? $doc;

        Patient::updateOrCreate(
            ['couch_id' => $doc['_id']],
            [
                'cpt' => $patient['cpt'] ?? $patient['id'] ?? null,
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

        Log::debug('SyncService: Synced patient', ['cpt' => $patient['cpt'] ?? 'unknown']);
    }

    /**
     * Sync a clinical session document.
     */
    protected function syncSession(array $doc): void
    {
        ClinicalSession::updateOrCreate(
            ['couch_id' => $doc['_id']],
            [
                'session_uuid' => $doc['id'] ?? $doc['_id'],
                'patient_cpt' => $doc['patientCpt'] ?? $doc['patientId'] ?? null,
                'stage' => $doc['stage'] ?? 'registration',
                'status' => $doc['status'] ?? 'open',
                'workflow_state' => $doc['workflowState'] ?? $doc['workflow_state'] ?? null,
                'workflow_state_updated_at' => $this->parseTimestamp($doc['workflowStateUpdatedAt'] ?? $doc['workflow_state_updated_at'] ?? null),
                'triage_priority' => $doc['triage'] ?? $doc['triagePriority'] ?? $doc['triage_priority'] ?? 'unknown',
                'chief_complaint' => $doc['chiefComplaint'] ?? $doc['chief_complaint'] ?? null,
                'notes' => $doc['notes'] ?? null,
                'form_instance_ids' => $doc['formInstanceIds'] ?? $doc['form_instance_ids'] ?? [],
                'session_created_at' => $this->parseTimestamp($doc['createdAt'] ?? null),
                'session_updated_at' => $this->parseTimestamp($doc['updatedAt'] ?? null),
                'raw_document' => $doc,
                'synced_at' => now(),
            ]
        );

        Log::debug('SyncService: Synced session', ['id' => $doc['_id'], 'workflow_state' => $doc['workflowState'] ?? 'unknown']);
    }

    /**
     * Sync a clinical form document.
     */
    protected function syncForm(array $doc): void
    {
        ClinicalForm::updateOrCreate(
            ['couch_id' => $doc['_id']],
            [
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
            ]
        );

        Log::debug('SyncService: Synced form', ['id' => $doc['_id']]);
    }

    /**
     * Sync an AI log document.
     */
    protected function syncAiLog(array $doc): void
    {
        AiRequest::updateOrCreate(
            ['request_uuid' => $doc['_id']],
            [
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
            ]
        );

        Log::debug('SyncService: Synced AI log', ['id' => $doc['_id']]);
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
