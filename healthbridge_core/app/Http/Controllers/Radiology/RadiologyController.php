<?php

namespace App\Http\Controllers\Radiology;

use App\Http\Controllers\Controller;
use App\Models\DiagnosticReport;
use App\Models\RadiologyStudy;
use App\Models\User;
use App\Services\RadiologyImageService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class RadiologyController extends Controller
{
    /**
     * Image processing service.
     */
    protected RadiologyImageService $imageService;

    public function __construct(RadiologyImageService $imageService)
    {
        $this->imageService = $imageService;
    }
    /**
     * Report templates by modality and body part.
     */
    protected function getDefaultTemplates(): array
    {
        return [
            'CT' => [
                'Brain' => [
                    'findings' => "The CT examination of the brain demonstrates:\n\n1. Grey-white matter differentiation is preserved.\n2. No focal mass effect or midline shift.\n3. No abnormal parenchymal hyperdensity to suggest acute hemorrhage.\n4. Ventricles and sulci are appropriate for age.\n5. No evidence of mass, lesion, or infarction.\n6. Bone windows: No calvarial fracture identified.",
                    'impression' => "1. No acute intracranial abnormality.\n2. Normal CT brain study.",
                    'recommendations' => "Clinical correlation recommended. Further evaluation with MRI may be considered if clinical suspicion remains high.",
                ],
                'Chest' => [
                    'findings' => "The CT examination of the chest demonstrates:\n\n1. Lungs: Clear lung fields bilaterally. No focal consolidation, mass, or nodules.\n2. Pleura: No pleural effusion or pneumothorax.\n3. Mediastinum: Normal mediastinal contours. No lymphadenopathy.\n4. Heart: Normal cardiac silhouette.\n5. Osseous: No acute bony abnormalities identified.",
                    'impression' => "1. No acute cardiopulmonary abnormality.\n2. Normal CT chest.",
                    'recommendations' => "None.",
                ],
                'Abdomen' => [
                    'findings' => "The CT examination of the abdomen and pelvis demonstrates:\n\n1. Liver: Normal hepatic contour. No focal lesions. Homogeneous parenchymal attenuation.\n2. Spleen: Normal size and contour. No focal lesions.\n3. Kidneys: Normal renal morphology. No hydronephrosis or stones.\n4. Pancreas: Normal pancreatic duct. No pancreatic mass or stranding.\n5. Bowel: No bowel wall thickening or obstruction.\n6. Pelvis: No free fluid or masses.\n7. No lymphadenopathy.",
                    'impression' => "1. No acute abdominal or pelvic abnormality.\n2. Normal CT abdomen/pelvis.",
                    'recommendations' => "None.",
                ],
            ],
            'MRI' => [
                'Brain' => [
                    'findings' => "The MRI examination of the brain demonstrates:\n\n1. No abnormal T2/FLAIR hyperintensity.\n2. No diffusion restriction to suggest acute infarction.\n3. No mass effect or midline shift.\n4. Ventricles are normal in size.\n5. No extra-axial collection.\n6. Cranial nerves are unremarkable.\n7. No abnormal enhancement.",
                    'impression' => "1. Normal MRI brain study.\n2. No abnormal findings identified.",
                    'recommendations' => "None.",
                ],
                'Spine' => [
                    'findings' => "The MRI examination of the spine demonstrates:\n\n1. Vertebral bodies: Normal height and signal. No compression fracture.\n2. Discs: Appropriate disc heights. No disc herniation or protrusion.\n3. Spinal cord: Normal cord signal and morphology. No cord compression.\n4. Foramen: No significant neural foraminal narrowing.\n5. Soft tissues: No abnormal soft tissue mass or collection.",
                    'impression' => "1. Normal MRI spine study.\n2. No significant spinal abnormality identified.",
                    'recommendations' => "None.",
                ],
            ],
            'XRAY' => [
                'Chest' => [
                    'findings' => "The chest radiograph demonstrates:\n\n1. Lungs: Clear lung fields bilaterally. No consolidation, effusion, or pneumothorax.\n2. Heart: Normal cardiac silhouette.\n3. Mediastinum: Normal mediastinal contours.\n4. Osseous: No acute fractures identified.",
                    'impression' => "1. Normal chest x-ray.\n2. No acute cardiopulmonary abnormality.",
                    'recommendations' => "None.",
                ],
                'Abdomen' => [
                    'findings' => "The abdominal radiograph demonstrates:\n\n1. Bowel gas pattern: Normal distribution of bowel gas. No signs of obstruction or ileus.\n2. Soft tissues: Normal soft tissue shadows.\n3. No visible calculi.\n4. Osseous: No acute fractures identified.",
                    'impression' => "1. Normal abdominal x-ray.\n2. No acute abdominal abnormality.",
                    'recommendations' => "None.",
                ],
            ],
            'ULTRASOUND' => [
                'Abdomen' => [
                    'findings' => "The ultrasound examination of the abdomen demonstrates:\n\n1. Liver: Normal size and echotexture. No focal lesions.\n2. Gallbladder: Normal. No stones or wall thickening.\n3. Pancreas: Normal echotexture. No masses.\n4. Spleen: Normal size. No focal lesions.\n5. Kidneys: Normal corticomedullary differentiation. No hydronephrosis.\n6. Aorta: Normal caliber.",
                    'impression' => "1. Normal abdominal ultrasound study.\n2. No abnormal findings identified.",
                    'recommendations' => "None.",
                ],
            ],
        ];
    }

    /**
     * Display the radiology dashboard.
     */
    public function index()
    {
        $user = Auth::user();
        
        // Get statistics for the dashboard
        $stats = [
            'pending_studies' => RadiologyStudy::where('status', 'pending')
                ->orWhere('status', 'ordered')
                ->count(),
            'my_studies' => RadiologyStudy::where('assigned_radiologist_id', $user->id)
                ->whereIn('status', ['pending', 'ordered', 'in_progress'])
                ->count(),
            'critical_studies' => RadiologyStudy::critical()->count(),
            'completed_today' => RadiologyStudy::whereDate('study_completed_at', today())->count(),
            'reports_pending' => DiagnosticReport::where('report_type', 'preliminary')
                ->whereNull('signed_at')
                ->count(),
        ];

        // Get recent studies for the worklist
        $recentStudies = RadiologyStudy::with(['patient', 'referringUser'])
            ->orderBy('priority', 'asc')
            ->orderBy('ordered_at', 'asc')
            ->limit(20)
            ->get();

        return inertia('radiology/Dashboard', [
            'stats' => $stats,
            'recentStudies' => $recentStudies,
        ]);
    }

    /**
     * Display the new study form.
     */
    public function newStudy()
    {
        return inertia('radiology/NewStudy');
    }

    /**
     * Display the radiology worklist.
     */
    public function worklist(Request $request)
    {
        $user = Auth::user();
        
        $query = RadiologyStudy::with(['patient', 'referringUser', 'assignedRadiologist']);

        // Filter by assigned radiologist if requested
        if ($request->boolean('assigned_to_me')) {
            $query->where('assigned_radiologist_id', $user->id);
        } elseif ($request->boolean('unassigned')) {
            $query->whereNull('assigned_radiologist_id');
        }

        // Apply filters
        if ($request->has('status') && $request->status) {
            $query->status($request->status);
        }

        if ($request->has('priority') && $request->priority) {
            $query->priority($request->priority);
        }

        if ($request->has('modality') && $request->modality) {
            $query->modality($request->modality);
        }

        // Sort by priority and time
        $studies = $query->orderBy('priority', 'asc')
            ->orderBy('ordered_at', 'asc')
            ->paginate(20);

        return response()->json($studies);
    }

    /**
     * Get worklist statistics.
     */
    public function worklistStats()
    {
        $stats = [
            'total' => RadiologyStudy::count(),
            'pending' => RadiologyStudy::status('pending')->count(),
            'ordered' => RadiologyStudy::status('ordered')->count(),
            'in_progress' => RadiologyStudy::status('in_progress')->count(),
            'completed' => RadiologyStudy::status('completed')->count(),
            'reported' => RadiologyStudy::status('reported')->count(),
            'stat' => RadiologyStudy::priority('stat')->count(),
            'urgent' => RadiologyStudy::priority('urgent')->count(),
            'routine' => RadiologyStudy::priority('routine')->count(),
            'critical_ai' => RadiologyStudy::critical()->count(),
        ];

        return response()->json($stats);
    }

    /**
     * Get study details.
     */
    public function showStudy(string $studyId)
    {
        $user = Auth::user();
        $study = RadiologyStudy::with([
            'patient',
            'referringUser',
            'assignedRadiologist',
            'diagnosticReports',
            'consultations',
        ])->findOrFail($studyId);

        // Authorization: only radiologists, referring doctors, or admins can view
        if (!$user->hasRole(['admin', 'radiologist']) && 
            $study->referring_user_id !== $user->id) {
            abort(403, 'You do not have permission to view this study');
        }

        return inertia('radiology/StudyDetail', [
            'study' => $study,
        ]);
    }

    /**
     * Accept/claim a study.
     */
    public function acceptStudy(Request $request, string $studyId)
    {
        $study = RadiologyStudy::findOrFail($studyId);
        $user = Auth::user();

        $study->update([
            'assigned_radiologist_id' => $user->id,
            'status' => 'in_progress',
        ]);

        return response()->json([
            'message' => 'Study accepted successfully',
            'study' => $study->fresh(),
        ]);
    }

    /**
     * Upload images for a study.
     */
    public function uploadImages(Request $request, string $studyId)
    {
        $study = RadiologyStudy::findOrFail($studyId);
        
        // Check if images already exist
        if ($study->images_uploaded) {
            return response()->json([
                'success' => false,
                'message' => 'Images already uploaded for this study',
            ], 422);
        }
        
        $validated = $request->validate(RadiologyStudy::imageUploadRules());
        
        // Process the image
        $result = $this->imageService->processUpload(
            $request->file('image'),
            $study->id
        );
        
        if (!$result['success']) {
            return response()->json([
                'success' => false,
                'message' => 'Image processing failed',
                'errors' => $result['errors'],
            ], 422);
        }
        
        // Update study with image paths
        $study->update([
            'dicom_storage_path' => $result['original_path'],
            'preview_image_path' => $result['preview_path'],
            'thumbnail_path' => $result['thumbnail_path'],
            'image_metadata' => $result['metadata'],
            'images_uploaded' => true,
            'images_available_at' => now(),
            'status' => 'in_progress',
        ]);
        
        return response()->json([
            'success' => true,
            'message' => 'Images uploaded successfully',
            'study' => $study->fresh(),
            'metadata' => $result['metadata'],
        ]);
    }

    /**
     * Assign a study to a radiologist.
     */
    public function assignStudy(Request $request, string $studyId)
    {
        $request->validate([
            'radiologist_id' => 'required|exists:users,id',
        ]);

        // Verify the target user has radiologist role
        $radiologist = User::findOrFail($request->radiologist_id);
        if (!$radiologist->hasRole('radiologist')) {
            return response()->json([
                'success' => false,
                'error' => 'The selected user is not a radiologist',
            ], 422);
        }

        $study = RadiologyStudy::findOrFail($studyId);

        $study->update([
            'assigned_radiologist_id' => $request->radiologist_id,
            'status' => 'ordered',
        ]);

        return response()->json([
            'message' => 'Study assigned successfully',
            'study' => $study->fresh(),
        ]);
    }

    /**
     * Create a new study (radiologist-initiated).
     */
    public function createStudy(Request $request)
    {
        $request->validate([
            'patient_cpt' => 'required|string',
            'modality' => 'required|in:CT,MRI,XRAY,ULTRASOUND,PET,MAMMO,FLUORO,ANGIO',
            'body_part' => 'required|string',
            'study_type' => 'required|string',
            'clinical_indication' => 'required|string',
            'clinical_question' => 'nullable|string',
            'priority' => 'nullable|in:stat,urgent,routine,scheduled',
        ]);

        $user = Auth::user();

        $study = RadiologyStudy::create([
            'study_uuid' => RadiologyStudy::generateUuid(),
            'patient_cpt' => $request->patient_cpt,
            'assigned_radiologist_id' => $user->id,
            'modality' => $request->modality,
            'body_part' => $request->body_part,
            'study_type' => $request->study_type,
            'clinical_indication' => $request->clinical_indication,
            'clinical_question' => $request->clinical_question,
            'priority' => $request->priority ?? 'routine',
            'status' => 'ordered',
            'ordered_at' => now(),
        ]);

        return response()->json([
            'message' => 'Study created successfully',
            'study' => $study,
        ], 201);
    }

    /**
     * Update study status.
     */
    public function updateStudyStatus(Request $request, string $studyId)
    {
        $request->validate([
            'status' => 'required|in:pending,ordered,scheduled,in_progress,completed,interpreted,reported,amended,cancelled',
        ]);

        $study = RadiologyStudy::findOrFail($studyId);

        $updateData = ['status' => $request->status];

        // Set timestamps based on status
        switch ($request->status) {
            case 'completed':
                $updateData['study_completed_at'] = now();
                break;
            case 'images_available':
                $updateData['images_available_at'] = now();
                break;
        }

        $study->update($updateData);

        return response()->json([
            'message' => 'Study status updated successfully',
            'study' => $study->fresh(),
        ]);
    }

    /**
     * List all reports for the authenticated radiologist.
     */
    public function listReports(Request $request)
    {
        $user = Auth::user();

        $query = DiagnosticReport::with(['study.patient', 'radiologist'])
            ->where('radiologist_id', $user->id);

        // Filter by status
        if ($request->has('status') && $request->status) {
            $query->where('report_type', $request->status);
        }

        // Filter by signed status
        if ($request->boolean('signed')) {
            $query->whereNotNull('signed_at');
        } elseif ($request->boolean('unsigned')) {
            $query->whereNull('signed_at');
        }

        // Sort
        $sortBy = $request->get('sort_by', 'created_at');
        $sortDir = $request->get('sort_dir', 'desc');
        $query->orderBy($sortBy, $sortDir);

        $reports = $query->paginate(20);

        return response()->json($reports);
    }

    /**
     * Get available report templates.
     */
    public function getReportTemplates(Request $request)
    {
        $templates = $this->getDefaultTemplates();

        // Filter by modality if provided
        $modality = $request->get('modality');
        $bodyPart = $request->get('body_part');

        if ($modality && isset($templates[$modality])) {
            $templates = [$modality => $templates[$modality]];

            if ($bodyPart && isset($templates[$modality][$bodyPart])) {
                $templates = [$modality => [$bodyPart => $templates[$modality][$bodyPart]]];
            }
        }

        return response()->json([
            'templates' => $templates,
            'modalities' => array_keys($this->getDefaultTemplates()),
        ]);
    }

    /**
     * Get a specific report.
     */
    public function showReport(string $reportId)
    {
        $report = DiagnosticReport::with([
            'study.patient',
            'study.referringUser',
            'radiologist',
        ])->findOrFail($reportId);

        return response()->json($report);
    }

    /**
     * Create a new report for a study.
     */
    public function createReport(Request $request, string $studyId)
    {
        $request->validate([
            'report_type' => 'nullable|in:preliminary,final,addendum',
            'findings' => 'nullable|string',
            'impression' => 'nullable|string',
            'recommendations' => 'nullable|string',
            'use_template' => 'nullable|boolean',
            'template_modality' => 'nullable|string',
            'template_body_part' => 'nullable|string',
        ]);

        $study = RadiologyStudy::findOrFail($studyId);
        $user = Auth::user();

        // Get template if requested
        $findings = $request->findings ?? '';
        $impression = $request->impression ?? '';
        $recommendations = $request->recommendations ?? '';

        if ($request->boolean('use_template')) {
            $templates = $this->getDefaultTemplates();
            $modality = $request->template_modality ?? $study->modality;
            $bodyPart = $request->template_body_part ?? $study->body_part;

            if (isset($templates[$modality][$bodyPart])) {
                $template = $templates[$modality][$bodyPart];
                $findings = $template['findings'] ?? '';
                $impression = $template['impression'] ?? '';
                $recommendations = $template['recommendations'] ?? '';
            }
        }

        $report = DiagnosticReport::create([
            'report_uuid' => Str::uuid()->toString(),
            'study_id' => $study->id,
            'radiologist_id' => $user->id,
            'report_type' => $request->report_type ?? 'final',
            'findings' => $findings,
            'impression' => $impression,
            'recommendations' => $recommendations,
            'is_locked' => false,
        ]);

        // Update study status
        $study->update(['status' => 'reported']);

        return response()->json([
            'message' => 'Report created successfully',
            'report' => $report->load(['study.patient', 'radiologist']),
        ], 201);
    }

    /**
     * Update an existing report (draft).
     */
    public function updateReport(Request $request, string $reportId)
    {
        $request->validate([
            'findings' => 'nullable|string',
            'impression' => 'nullable|string',
            'recommendations' => 'nullable|string',
            'critical_findings' => 'nullable|boolean',
            'critical_communicated' => 'nullable|boolean',
            'communication_method' => 'nullable|string',
        ]);

        $report = DiagnosticReport::findOrFail($reportId);

        // Check if already signed
        if ($report->signed_at) {
            return response()->json([
                'message' => 'Cannot update a signed report. Create an amendment instead.',
            ], 422);
        }

        $updateData = $request->only([
            'findings',
            'impression',
            'recommendations',
            'critical_findings',
            'critical_communicated',
            'communication_method',
        ]);

        // Set communicated timestamp if critical findings communicated
        if ($request->boolean('critical_communicated')) {
            $updateData['communicated_at'] = now();
        }

        $report->update($updateData);

        return response()->json([
            'message' => 'Report updated successfully',
            'report' => $report->fresh(),
        ]);
    }

    /**
     * Sign and finalize a report.
     */
    public function signReport(Request $request, string $reportId)
    {
        $report = DiagnosticReport::findOrFail($reportId);

        // Check if already signed
        if ($report->signed_at) {
            return response()->json([
                'message' => 'Report is already signed.',
            ], 422);
        }

        // Validate required fields before signing
        if (empty($report->findings) || empty($report->impression)) {
            return response()->json([
                'message' => 'Cannot sign report without findings and impression.',
            ], 422);
        }

        $user = Auth::user();

        // Generate digital signature
        $signatureData = sprintf(
            'Report: %s\\nStudy: %s\\nRadiologist: %s\\nDate: %s',
            $report->report_uuid,
            $report->study_id,
            $user->name,
            now()->toIso8601String()
        );

        $signature = hash_hmac('sha256', $signatureData, config('app.key'));

        $report->update([
            'digital_signature' => $signature,
            'signature_hash' => hash('sha256', $signature),
            'signed_at' => now(),
            'is_locked' => true,
            'report_type' => 'final',
        ]);

        // Update study status
        $report->study->update(['status' => 'reported']);

        return response()->json([
            'message' => 'Report signed and finalized successfully',
            'report' => $report->fresh(),
        ]);
    }

    /**
     * Amend a signed report.
     */
    public function amendReport(Request $request, string $reportId)
    {
        $request->validate([
            'amendment_reason' => 'required|string',
            'findings' => 'nullable|string',
            'impression' => 'nullable|string',
            'recommendations' => 'nullable|string',
        ]);

        $originalReport = DiagnosticReport::findOrFail($reportId);
        $user = Auth::user();

        // Create amendment report
        $amendment = DiagnosticReport::create([
            'report_uuid' => Str::uuid()->toString(),
            'study_id' => $originalReport->study_id,
            'radiologist_id' => $user->id,
            'report_type' => 'amendment',
            'findings' => $request->findings ?? $originalReport->findings,
            'impression' => $request->impression ?? $originalReport->impression,
            'recommendations' => $request->recommendations ?? $originalReport->recommendations,
            'is_locked' => false,
            'amendment_reason' => $request->amendment_reason,
            'amended_by' => $originalReport->radiologist_id,
            'amended_at' => now(),
        ]);

        return response()->json([
            'message' => 'Report amendment created successfully',
            'report' => $amendment->load(['study.patient', 'radiologist']),
        ], 201);
    }

    /**
     * Auto-save report draft.
     */
    public function autoSaveReport(Request $request, string $reportId)
    {
        $report = DiagnosticReport::findOrFail($reportId);

        // Check if already signed
        if ($report->signed_at) {
            return response()->json([
                'message' => 'Cannot auto-save a signed report.',
            ], 422);
        }

        $updateData = $request->only([
            'findings',
            'impression',
            'recommendations',
        ]);

        // Add to audit log
        $auditLog = $report->audit_log ?? [];
        $auditLog[] = [
            'action' => 'auto_save',
            'timestamp' => now()->toIso8601String(),
            'user_id' => Auth::id(),
        ];
        $updateData['audit_log'] = $auditLog;

        $report->update($updateData);

        return response()->json([
            'message' => 'Report draft auto-saved',
            'saved_at' => now()->toIso8601String(),
        ]);
    }

    /**
     * Get study image for viewing.
     * Supports both standard images (PNG, JPG) and DICOM files.
     * For DICOM files, returns raw binary data for client-side parsing by CornerstoneJS.
     */
    public function getImage(string $studyId)
    {
        try {
            $study = RadiologyStudy::findOrFail($studyId);
            
            if (!$study->images_uploaded) {
                return response()->json([
                    'message' => 'No image available for this study',
                    'study_id' => $studyId,
                    'images_uploaded' => $study->images_uploaded,
                ], 404);
            }
            
            // Try to serve preview image first (for standard formats like PNG, JPG)
            if ($study->preview_image_path) {
                $filePath = storage_path('app/public/' . $study->preview_image_path);
                
                if (file_exists($filePath)) {
                    $extension = pathinfo($filePath, PATHINFO_EXTENSION);
                    $mimeTypes = [
                        'png' => 'image/png',
                        'jpg' => 'image/jpeg',
                        'jpeg' => 'image/jpeg',
                        'dcm' => 'application/dicom',
                    ];
                    $mimeType = $mimeTypes[$extension] ?? 'application/octet-stream';
                    
                    // If it's a DICOM file, serve as binary for CornerstoneJS
                    if ($extension === 'dcm') {
                        return response()->file($filePath, [
                            'Content-Type' => 'application/dicom',
                            'X-Content-Type-Options' => 'nosniff',
                            'Accept-Ranges' => 'bytes',
                        ]);
                    }
                    
                    return response()->file($filePath);
                }
            }
            
            // Fall back to original DICOM file
            if ($study->dicom_storage_path) {
                $filePath = storage_path('app/' . $study->dicom_storage_path);
                
                if (!file_exists($filePath)) {
                    // Try public path
                    $filePath = storage_path('app/public/' . $study->dicom_storage_path);
                }
                
                if (file_exists($filePath)) {
                    $metadata = $study->image_metadata ?? [];
                    
                    // Serve DICOM file with proper headers for CornerstoneJS
                    return response()->stream(function () use ($filePath) {
                        readfile($filePath);
                    }, 200, [
                        'Content-Type' => 'application/dicom',
                        'Content-Length' => filesize($filePath),
                        'X-Content-Type-Options' => 'nosniff',
                        'Accept-Ranges' => 'bytes',
                        'X-DICOM-File' => 'true',
                    ]);
                }
            }
            
            return response()->json([
                'message' => 'Image file not found on disk',
                'study_id' => $studyId,
                'dicom_storage_path' => $study->dicom_storage_path,
            ], 404);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'message' => 'Study not found',
                'study_id' => $studyId,
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Error loading image',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get study preview image.
     * For DICOM, serves the raw file for client-side rendering.
     */
    public function getPreview(string $studyId)
    {
        try {
            $study = RadiologyStudy::findOrFail($studyId);
            
            if (!$study->images_uploaded || !$study->preview_image_path) {
                // Fall back to original DICOM if no preview
                if ($study->dicom_storage_path) {
                    return $this->serveDicomFile($study);
                }
                
                return response()->json([
                    'message' => 'No preview available for this study',
                    'study_id' => $studyId,
                    'images_uploaded' => $study->images_uploaded,
                    'preview_image_path' => $study->preview_image_path,
                ], 404);
            }
            
            $filePath = storage_path('app/public/' . $study->preview_image_path);
            
            if (!file_exists($filePath)) {
                // Try original path
                $filePath = storage_path('app/' . $study->preview_image_path);
            }
            
            if (!file_exists($filePath)) {
                // Fall back to original DICOM
                if ($study->dicom_storage_path) {
                    return $this->serveDicomFile($study);
                }
                
                return response()->json([
                    'message' => 'Preview file not found on disk',
                    'study_id' => $studyId,
                    'expected_path' => $filePath,
                ], 404);
            }
            
            $extension = pathinfo($filePath, PATHINFO_EXTENSION);
            
            // If it's a DICOM file, serve for CornerstoneJS
            if ($extension === 'dcm') {
                return $this->serveDicomFile($study);
            }
            
            return response()->file($filePath);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'message' => 'Study not found',
                'study_id' => $studyId,
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Error loading preview',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
    
    /**
     * Serve a DICOM file with proper headers for CornerstoneJS.
     */
    private function serveDicomFile(RadiologyStudy $study): \Illuminate\Http\Response
    {
        $filePath = storage_path('app/' . $study->dicom_storage_path);
        
        if (!file_exists($filePath)) {
            // Try public path
            $filePath = storage_path('app/public/' . $study->dicom_storage_path);
        }
        
        if (!file_exists($filePath)) {
            return response()->json([
                'message' => 'DICOM file not found',
                'path' => $study->dicom_storage_path,
            ], 404);
        }
        
        return response()->stream(function () use ($filePath) {
            readfile($filePath);
        }, 200, [
            'Content-Type' => 'application/dicom',
            'Content-Length' => filesize($filePath),
            'X-Content-Type-Options' => 'nosniff',
            'Accept-Ranges' => 'bytes',
            'X-DICOM-File' => 'true',
            'X-Study-UID' => $study->study_instance_uid ?? '',
            'X-Modality' => $study->modality ?? '',
        ]);
    }
}
