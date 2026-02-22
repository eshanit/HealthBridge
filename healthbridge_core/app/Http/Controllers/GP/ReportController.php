<?php

namespace App\Http\Controllers\GP;

use App\Http\Controllers\Controller;
use App\Services\ReportGeneratorService;
use App\Services\CouchDbService;
use App\Models\ClinicalSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Inertia\Inertia;

class ReportController extends Controller
{
    protected ReportGeneratorService $reportGenerator;
    protected CouchDbService $couchDb;

    public function __construct(
        ReportGeneratorService $reportGenerator,
        CouchDbService $couchDb
    ) {
        $this->reportGenerator = $reportGenerator;
        $this->couchDb = $couchDb;
    }

    /**
     * Verify the user has access to the specified session.
     *
     * @param string $sessionCouchId
     * @return ClinicalSession
     * @throws \Illuminate\Foundation\Exceptions\Handler
     */
    protected function authorizeSessionAccess(string $sessionCouchId): ClinicalSession
    {
        $session = ClinicalSession::where('couch_id', $sessionCouchId)->first();

        if (!$session) {
            abort(404, 'Session not found');
        }

        // Check if user has role-based access
        $user = auth()->user();
        
        // Admin and radiologists can access any session
        if ($user->hasRole(['admin', 'radiologist'])) {
            return $session;
        }

        // GPs can access their own sessions
        if ($user->hasRole('gp') && $session->gp_id === $user->id) {
            return $session;
        }

        // Nurses can access sessions assigned to them
        if ($user->hasRole('nurse') && $session->nurse_id === $user->id) {
            return $session;
        }

        // Deny access otherwise
        abort(403, 'You do not have permission to access this session');
    }

    /**
     * Generate a discharge summary PDF.
     *
     * @param string $sessionCouchId
     * @param Request $request
     * @return JsonResponse
     */
    public function dischargePdf(string $sessionCouchId, Request $request): JsonResponse
    {
        // Authorize session access
        $this->authorizeSessionAccess($sessionCouchId);
        
        // Get optional patientCpt from request body
        $patientCpt = $request->input('patientCpt');
        
        $result = $this->reportGenerator->generateDischargePdf($sessionCouchId, [
            'facility' => config('app.name', 'HealthBridge'),
            'show_ai_content' => true,
            'patientCpt' => $patientCpt,
        ]);

        if (!$result['success']) {
            return response()->json([
                'success' => false,
                'error' => $result['error'],
            ], 400);
        }

        // Store the report in CouchDB for persistence
        $this->storeReportInCouchDB($sessionCouchId, $result, 'discharge');

        return response()->json([
            'success' => true,
            'pdf' => $result['pdf'],
            'html' => $result['html'],
            'filename' => $result['filename'],
            'mime_type' => $result['mime_type'],
            'size' => $result['size'],
        ]);
    }

    /**
     * Generate a clinical handover PDF (SBAR format).
     *
     * @param string $sessionCouchId
     * @param Request $request
     * @return JsonResponse
     */
    public function handoverPdf(string $sessionCouchId, Request $request): JsonResponse
    {
        // Authorize session access
        $this->authorizeSessionAccess($sessionCouchId);

        $result = $this->reportGenerator->generateHandoverPdf($sessionCouchId, [
            'facility' => config('app.name', 'HealthBridge'),
            'handed_over_by' => $request->input('handed_over_by', auth()->user()?->name),
            'handed_over_to' => $request->input('handed_over_to'),
        ]);

        if (!$result['success']) {
            return response()->json([
                'success' => false,
                'error' => $result['error'],
            ], 400);
        }

        // Store the report in CouchDB for persistence
        $this->storeReportInCouchDB($sessionCouchId, $result, 'handover');

        return response()->json([
            'success' => true,
            'pdf' => $result['pdf'],
            'html' => $result['html'],
            'filename' => $result['filename'],
            'mime_type' => $result['mime_type'],
            'size' => $result['size'],
        ]);
    }

    /**
     * Generate a referral PDF.
     *
     * @param string $sessionCouchId
     * @return JsonResponse
     */
    public function referralPdf(string $sessionCouchId): JsonResponse
    {
        // Authorize session access
        $this->authorizeSessionAccess($sessionCouchId);

        $result = $this->reportGenerator->generateReferralPdf($sessionCouchId, [
            'facility' => config('app.name', 'HealthBridge'),
        ]);

        if (!$result['success']) {
            return response()->json([
                'success' => false,
                'error' => $result['error'],
            ], 400);
        }

        // Store the report in CouchDB for persistence
        $this->storeReportInCouchDB($sessionCouchId, $result, 'referral');

        return response()->json([
            'success' => true,
            'pdf' => $result['pdf'],
            'html' => $result['html'],
            'filename' => $result['filename'],
            'mime_type' => $result['mime_type'],
            'size' => $result['size'],
        ]);
    }

    /**
     * Generate a comprehensive report with AI content.
     *
     * @param string $sessionCouchId
     * @param Request $request
     * @return JsonResponse
     */
    public function comprehensivePdf(string $sessionCouchId, Request $request): JsonResponse
    {
        // Authorize session access
        $this->authorizeSessionAccess($sessionCouchId);

        $aiContent = $request->input('ai_content', []);

        $result = $this->reportGenerator->generateComprehensivePdf($sessionCouchId, $aiContent, [
            'facility' => config('app.name', 'HealthBridge'),
            'show_ai_content' => true,
        ]);

        if (!$result['success']) {
            return response()->json([
                'success' => false,
                'error' => $result['error'],
            ], 400);
        }

        // Store the report in CouchDB for persistence
        $this->storeReportInCouchDB($sessionCouchId, $result, 'comprehensive');

        return response()->json([
            'success' => true,
            'pdf' => $result['pdf'],
            'html' => $result['html'],
            'filename' => $result['filename'],
            'mime_type' => $result['mime_type'],
            'size' => $result['size'],
        ]);
    }

    /**
     * Download a PDF directly (returns binary PDF).
     *
     * @param string $sessionCouchId
     * @param string $type
     * @return Response|JsonResponse
     */
    public function downloadPdf(string $sessionCouchId, string $type = 'discharge'): Response|JsonResponse
    {
        // Authorize session access
        $this->authorizeSessionAccess($sessionCouchId);

        $method = match ($type) {
            'handover' => 'generateHandoverPdf',
            'referral' => 'generateReferralPdf',
            'comprehensive' => 'generateComprehensivePdf',
            default => 'generateDischargePdf',
        };

        $result = $this->reportGenerator->$method($sessionCouchId, [
            'facility' => config('app.name', 'HealthBridge'),
        ]);

        if (!$result['success']) {
            return response()->json([
                'success' => false,
                'error' => $result['error'],
            ], 400);
        }

        $pdfContent = base64_decode($result['pdf']);

        return response($pdfContent)
            ->header('Content-Type', 'application/pdf')
            ->header('Content-Disposition', 'attachment; filename="' . $result['filename'] . '"')
            ->header('Content-Length', strlen($pdfContent));
    }

    /**
     * Get HTML preview of a report.
     *
     * @param string $sessionCouchId
     * @param string $type
     * @return JsonResponse
     */
    public function previewHtml(string $sessionCouchId, string $type = 'discharge'): JsonResponse
    {
        // Authorize session access
        $this->authorizeSessionAccess($sessionCouchId);

        $method = match ($type) {
            'handover' => 'generateHandoverPdf',
            'referral' => 'generateReferralPdf',
            'comprehensive' => 'generateComprehensivePdf',
            default => 'generateDischargePdf',
        };

        $result = $this->reportGenerator->$method($sessionCouchId, [
            'facility' => config('app.name', 'HealthBridge'),
        ]);

        if (!$result['success']) {
            return response()->json([
                'success' => false,
                'error' => $result['error'],
            ], 400);
        }

        return response()->json([
            'success' => true,
            'html' => $result['html'],
        ]);
    }

    /**
     * Get stored reports for a session.
     *
     * @param string $sessionCouchId
     * @return JsonResponse
     */
    public function getSessionReports(string $sessionCouchId): JsonResponse
    {
        // Authorize session access
        $this->authorizeSessionAccess($sessionCouchId);

        try {
            $reports = $this->couchDb->queryView('reports', 'by_session', [
                'key' => json_encode($sessionCouchId),
                'include_docs' => 'true',
            ]);

            return response()->json([
                'success' => true,
                'reports' => array_map(function ($row) {
                    $doc = $row['doc'] ?? $row;
                    return [
                        'id' => $doc['_id'] ?? null,
                        'type' => $doc['report_type'] ?? 'unknown',
                        'filename' => $doc['filename'] ?? null,
                        'generated_at' => $doc['generated_at'] ?? null,
                        'generated_by' => $doc['generated_by_name'] ?? $doc['generated_by'] ?? null,
                        'size' => $doc['size'] ?? null,
                    ];
                }, $reports['rows'] ?? []),
            ]);
        } catch (\RuntimeException $e) {
            // If design document doesn't exist (404), return empty reports
            if (str_contains($e->getMessage(), '404')) {
                return response()->json([
                    'success' => true,
                    'reports' => [],
                ]);
            }
            
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get a stored report by ID.
     *
     * @param string $reportId
     * @return JsonResponse|Response
     */
    public function getStoredReport(string $reportId): JsonResponse|Response
    {
        try {
            $doc = $this->couchDb->getDocument($reportId);

            if (!$doc || ($doc['type'] ?? null) !== 'clinicalReport') {
                return response()->json([
                    'success' => false,
                    'error' => 'Report not found',
                ], 404);
            }

            // Authorize access to the session this report belongs to
            $sessionCouchId = $doc['session_couch_id'] ?? null;
            if ($sessionCouchId) {
                $this->authorizeSessionAccess($sessionCouchId);
            }

            // Return PDF for download
            if (isset($doc['pdf_base64'])) {
                $pdfContent = base64_decode($doc['pdf_base64']);

                return response($pdfContent)
                    ->header('Content-Type', 'application/pdf')
                    ->header('Content-Disposition', 'attachment; filename="' . ($doc['filename'] ?? 'report.pdf') . '"')
                    ->header('Content-Length', strlen($pdfContent));
            }

            // Return HTML if no PDF
            if (isset($doc['html_content'])) {
                return response()->json([
                    'success' => true,
                    'html' => $doc['html_content'],
                    'report' => $doc,
                ]);
            }

            return response()->json([
                'success' => false,
                'error' => 'Report content not available',
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Store a generated report in CouchDB.
     *
     * @param string $sessionCouchId
     * @param array $result
     * @param string $type
     * @return void
     */
    protected function storeReportInCouchDB(string $sessionCouchId, array $result, string $type): void
    {
        try {
            $session = ClinicalSession::where('couch_id', $sessionCouchId)->first();

            $reportDoc = [
                '_id' => 'report:' . $type . ':' . $sessionCouchId . ':' . time(),
                'type' => 'clinicalReport',
                'report_type' => $type,
                'session_couch_id' => $sessionCouchId,
                'patient_cpt' => $session?->patient_cpt,
                'filename' => $result['filename'],
                'pdf_base64' => $result['pdf'],
                'html_content' => $result['html'],
                'mime_type' => $result['mime_type'],
                'size' => $result['size'],
                'generated_at' => now()->toIso8601String(),
                'generated_by' => auth()->id(),
                'generated_by_name' => auth()->user()?->name,
            ];

            $this->couchDb->saveDocument($reportDoc);
        } catch (\Exception $e) {
            // Log error but don't fail the request
            \Log::error('Failed to store report in CouchDB', [
                'session_id' => $sessionCouchId,
                'type' => $type,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
