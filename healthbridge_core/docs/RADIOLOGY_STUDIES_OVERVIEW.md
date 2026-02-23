# Medical Imaging Studies in Radiology Workflow

## Overview

A **medical imaging study** is a clinical examination that uses imaging technology to visualize internal body structures for diagnosis, treatment planning, and monitoring of medical conditions. In radiology workflow, studies are the core unit of work that radiologists review, interpret, and report on.

## Types of Medical Imaging Studies

### 1. X-Ray (Radiography)
- **Description**: Uses electromagnetic radiation to create 2D images of bones and internal structures
- **Common Uses**: 
  - Chest X-rays (pneumonia, tuberculosis, lung conditions)
  - Bone fractures
  - Dental imaging
  - Abdominal imaging
- **Characteristics**: 
  - Fast acquisition (seconds)
  - Low cost
  - Limited soft tissue detail

### 2. CT (Computed Tomography)
- **Description**: Uses X-rays from multiple angles to create cross-sectional 3D images
- **Common Uses**:
  - Trauma imaging (head, chest, abdomen, pelvis)
  - Stroke evaluation
  - Cancer staging
  - Pulmonary embolism detection
- **Characteristics**:
  - Fast scan time (minutes)
  - Excellent bone and soft tissue detail
  - Higher radiation dose than plain X-ray

### 3. MRI (Magnetic Resonance Imaging)
- **Description**: Uses strong magnetic fields and radio waves to create detailed images
- **Common Uses**:
  - Brain and spine imaging
  - Joint injuries (ACL, meniscus)
  - Soft tissue tumors
  - Cardiac imaging
- **Characteristics**:
  - No ionizing radiation
  - Excellent soft tissue contrast
  - Longer scan time (30-60 minutes)

### 4. Ultrasound
- **Description**: Uses high-frequency sound waves to create real-time images
- **Common Uses**:
  - Pregnancy monitoring
  - Abdominal organ evaluation
  - Vascular studies
  - Musculoskeletal imaging
- **Characteristics**:
  - No radiation
  - Real-time imaging
  - Operator-dependent

### 5. Nuclear Medicine (PET/CT, SPECT)
- **Description**: Uses radioactive tracers to visualize metabolic activity
- **Common Uses**:
  - Cancer detection and staging
  - Cardiac perfusion imaging
  - Bone scans
  - Thyroid imaging
- **Characteristics**:
  - Functional/physiological information
  - Combined with CT for anatomical correlation

## Radiology Workflow

### 1. Study Ordering
- **Initiator**: Referring physician (GP, specialist, emergency doctor)
- **Process**: 
  - Clinical indication provided
  - Modality selected (X-ray, CT, MRI, etc.)
  - Body part specified
  - Priority assigned (STAT, Urgent, Routine, Scheduled)

### 2. Study Acquisition
- **Performed by**: Radiologic technologists
- **Process**:
  - Patient preparation
  - Image acquisition following protocols
  - Quality assurance checks
  - Images sent to PACS

### 3. Worklist Management
- **Radiologist Access**: View all pending studies in worklist
- **Sorting Options**:
  - By priority (STAT first)
  - By modality
  - By body part
  - By date/time
  - By assigned radiologist

### 4. Image Review
- **Tools**:
  - DICOM viewer
  - Manipulation tools (zoom, pan, window/level)
  - Comparison with prior studies
  - Measurement tools
- **AI Assistance** (in modern systems):
  - Automated triage
  - Critical findings detection
  - Preliminary reads

### 5. Report Generation
- **Components**:
  - Technique description
  - Findings (normal/abnormal)
  - Impression/conclusion
  - Recommendations
- **Workflow**:
  - Draft report
  - Add structured findings
  - Review and edit
  - Digital signature

### 6. Report Distribution
- **Available to**:
  - Ordering physician
  - Patient chart
  - Other authorized clinicians

## Technical Mechanisms

### DICOM (Digital Imaging and Communications in Medicine)

The standard format for medical imaging:

```javascript
// Example DICOM metadata structure
{
  "StudyInstanceUID": "1.2.840.113619.2.55.3.42789.123",
  "PatientID": "CPT-2026-00001",
  "PatientName": "Doe^John",
  "Modality": "CT",
  "StudyDate": "20260222",
  "SeriesDescription": "CHEST WO CONTRAST",
  "Rows": 512,
  "Columns": 512,
  "BitsAllocated": 16
}
```

### PACS (Picture Archiving and Communication System)

- **Function**: Storage, retrieval, and display of medical images
- **Components**:
  - Image acquisition modalities
  - Archive servers
  - Display workstations
  - Network infrastructure

### WADO (Web Access to DICOM Objects)

- **Purpose**: Web-based retrieval of DICOM images
- **Used in**: Browser-based viewers, mobile apps

### IHE (Integrating the Healthcare Enterprise)

Standards for system integration:
- **SWF (Scheduled Workflow)**: Integration of ordering, acquisition, viewing
- **PIR (Patient Information Reconciliation)**: Matching images to correct patient

## HealthBridge Implementation

### RadiologyStudy Model

```php
// Key fields in HealthBridge
class RadiologyStudy extends Model
{
    protected $fillable = [
        'study_uuid',      // Unique identifier
        'modality',        // CT, MRI, XRAY, ULTRASOUND, etc.
        'body_part',       // Chest, Abdomen, Head, etc.
        'study_type',      // Protocol or study type
        'priority',        // stat, urgent, routine, scheduled
        'status',          // pending, ordered, in_progress, completed, reported
        'clinical_indication',
        'ordered_at',
        'patient_cpt',     // Patient identifier
    ];
}
```

### Worklist Integration

The Radiology Dashboard worklist displays:
- All pending studies
- Priority-sorted
- Filterable by modality, body part
- AI-priority scoring (when enabled)

### DICOM Viewer Integration

Browser-based DICOM viewer component for image review:
- Window/level adjustment
- Zoom and pan
- Measurement tools
- Prior study comparison

## Priority Levels

| Priority | Description | Typical Turnaround |
|----------|-------------|-------------------|
| STAT | Life-threatening | < 1 hour |
| Urgent | Serious condition | < 4 hours |
| Routine | Standard priority | < 24 hours |
| Scheduled | Pre-planned | By appointment |

## AI Integration in Modern Radiology

Modern RIS/PACS systems include AI for:
- **Automated Triage**: Flag critical findings
- **Quantitative Analysis**: Measure lesions, volumes
- **Detection Assistance**: Highlight potential abnormalities
- **Workflow Optimization**: Prioritize worklist

## References

- DICOM Standard: https://www.dicomstandard.org/
- IHE Radiology Technical Framework: https://www.ihe.net/resources/technical_frameworks/
- ACR Appropriateness Criteria: https://www.acr.org/Clinical-Resources/ACR-Appropriateness-Criteria
