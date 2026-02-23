# User Story: Radiology Patient Onboarding System

## Project
**HealthBridge Core - Radiology Patient Onboarding**

---

## User Story

**As a** radiologist or radiology technician,
**I want to** onboard new patients with minimal registration and create initial imaging study orders,
**So that** patients can receive timely imaging services with accurate identity management and zero tolerance for identity mismatches.

---

## Background

HealthBridge Core is a clinical workflow assistant that integrates with radiology services. This is **not the main hospital EMR** - it is a specialized system for managing radiology workflows, imaging studies, and AI-assisted diagnostics. Therefore, patient onboarding should be **minimal** to reduce administrative burden while maintaining accurate patient identity for proper study attribution.

### Key Principles
1. **Minimal Onboarding** - Only essential information required for radiology workflows
2. **Zero Tolerance for Identity Mismatches** - Every study must be correctly attributed to the right patient
3. **HIPAA Compliance** - All patient data handled with strict privacy and security controls
4. **Audit Trail** - Complete logging of all onboarding actions for compliance and troubleshooting

---

## User Stories & Acceptance Criteria

### 1. Patient Registration with Minimal Demographics

**User Story**: As a radiologist, I want to register a patient with minimal essential information so that they can be quickly onboarded for imaging studies.

#### Acceptance Criteria

| ID | Criterion | Validation Rule |
|----|-----------|-----------------|
| REG-001 | System must accept patient first name | Required, 2-100 characters, letters only, trimmed |
| REG-002 | System must accept patient last name | Required, 2-100 characters, letters only, trimmed |
| REG-003 | System must accept date of birth | Required, valid date, not in future, patient must be born after 1900 |
| REG-004 | System must accept gender | Required, enum: male, female, other, unknown |
| REG-005 | System must accept phone number | Optional, valid phone format (international allowed) |
| REG-006 | System must accept email | Optional, valid email format |
| REG-007 | System must auto-generate unique patient CPT | 4-character format (see Patient ID Generation below) |
| REG-008 | System must accept external MRN (Medical Record Number) | Optional, alphanumeric, 1-50 characters |
| REG-009 | System must display confirmation after successful registration | Show patient summary with all details |

#### Form Fields Specification

```php
// Registration Form Fields
[
    'first_name' => [
        'type' => 'text',
        'label' => 'First Name',
        'required' => true,
        'validation' => 'required|string|min:2|max:100|regex:/^[a-zA-Z\s\-\']+$/'
    ],
    'last_name' => [
        'type' => 'text',
        'label' => 'Last Name', 
        'required' => true,
        'validation' => 'required|string|min:2|max:100|regex:/^[a-zA-Z\s\-\']+$/'
    ],
    'date_of_birth' => [
        'type' => 'date',
        'label' => 'Date of Birth',
        'required' => true,
        'validation' => 'required|date|before:today|after:1900-01-01'
    ],
    'gender' => [
        'type' => 'select',
        'label' => 'Gender',
        'required' => true,
        'options' => ['male', 'female', 'other', 'unknown'],
        'validation' => 'required|in:male,female,other,unknown'
    ],
    'phone' => [
        'type' => 'tel',
        'label' => 'Phone Number',
        'required' => false,
        'validation' => 'nullable|string|max:20|regex:/^[+]?[\d\s\-\(\)]{7,20}$/'
    ],
    'email' => [
        'type' => 'email',
        'label' => 'Email Address',
        'required' => false,
        'validation' => 'nullable|email|max:255'
    ],
    'external_mrn' => [
        'type' => 'text',
        'label' => 'Medical Record Number (MRN)',
        'required' => false,
        'placeholder' => 'Enter hospital MRN if available',
        'validation' => 'nullable|string|min:1|max:50|alphanumeric'
    ]
]
```

#### Validation Error Messages

| Field | Error | Message |
|-------|-------|---------|
| first_name | required | "First name is required" |
| first_name | min | "First name must be at least 2 characters" |
| first_name | max | "First name cannot exceed 100 characters" |
| first_name | regex | "First name can only contain letters, spaces, hyphens, and apostrophes" |
| last_name | required | "Last name is required" |
| date_of_birth | required | "Date of birth is required" |
| date_of_birth | before | "Date of birth cannot be in the future" |
| date_of_birth | after | "Date of birth must be after 1900" |
| gender | required | "Gender is required" |
| gender | in | "Please select a valid gender option" |
| email | email | "Please enter a valid email address" |
| phone | regex | "Please enter a valid phone number" |
| external_mrn | alphanumeric | "MRN can only contain letters and numbers" |

---

### 2. Patient ID Generation

**User Story**: As a system, I need to generate unique patient identifiers that are short, practical, and avoid confusion.

#### Acceptance Criteria

| ID | Criterion | Details |
|----|-----------|---------|
| PID-001 | System must generate 4-character CPT | Format: 4 alphanumeric characters |
| PID-002 | System must exclude confusing characters | Exclude: I, O, 0, 1 |
| PID-003 | System must guarantee uniqueness | Check against existing CPTs before assignment |
| PID-004 | System must handle collision scenarios | Retry up to 10 times, then return error |
| PID-005 | CPT must be displayable | Show in patient card and confirmation |

#### Character Set
```
ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```
- **Excluded**: I, O, 0, 1 (visually ambiguous)
- **Total combinations**: 32^4 = 1,048,576

#### Laravel Implementation

```php
<?php
// app/Services/RadiologyPatientIdService.php

namespace App\Services;

use App\Models\Patient;

class RadiologyPatientIdService
{
    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    private const LENGTH = 4;
    private const MAX_ATTEMPTS = 10;

    /**
     * Generate a unique 4-character CPT for radiology patients
     */
    public function generateUniqueCpt(): string
    {
        for ($attempt = 1; $attempt <= self::MAX_ATTEMPTS; $attempt++) {
            $cpt = $this->generateCpt();
            
            if (!$this->cptExists($cpt)) {
                return $cpt;
            }
        }
        
        throw new \RuntimeException('Failed to generate unique patient ID after ' . self::MAX_ATTEMPTS . ' attempts');
    }

    /**
     * Generate a random CPT
     */
    private function generateCpt(): string
    {
        $chars = str_split(self::ALPHABET);
        $result = '';
        
        for ($i = 0; $i < self::LENGTH; $i++) {
            $result .= $chars[array_rand($chars)];
        }
        
        return $result;
    }

    /**
     * Check if CPT already exists
     */
    private function cptExists(string $cpt): bool
    {
        return Patient::where('cpt', $cpt)->exists();
    }

    /**
     * Validate CPT format
     */
    public function validateCptFormat(string $cpt): bool
    {
        return preg_match('/^[' . self::ALPHABET . ']{4}$/', $cpt) === 1;
    }
}
```

---

### 3. Duplicate Patient Verification

**User Story**: As a radiologist, I want the system to detect potential duplicate patients before registration so that we avoid creating duplicate records.

#### Acceptance Criteria

| ID | Criterion | Implementation |
|----|-----------|----------------|
| DUP-001 | System must check for existing patients by name + DOB | Exact match on (first_name, last_name, date_of_birth) |
| DUP-002 | System must check for existing patients by phone | If phone provided |
| DUP-003 | System must check for existing patients by external MRN | If MRN provided |
| DUP-004 | System must present potential matches to user | Show list with "Use Existing" option |
| DUP-005 | User must confirm before creating duplicate | Explicit confirmation dialog |
| DUP-006 | System must log all duplicate check results | Store search criteria and results |

#### Duplicate Search Flow

```
1. User enters patient demographics
2. System performs duplicate checks:
   a) Exact match: (first_name + last_name + date_of_birth)
   b) Phone match: if phone provided
   c) MRN match: if external_mrn provided
3. If matches found:
   a) Display "Potential Duplicate Found" modal
   b) Show list of matching patients with details
   c) Options: "Use Existing Patient" OR "Create New Anyway"
4. If no matches: Proceed with registration
5. Log all searches for audit
```

#### UI Mockup - Duplicate Alert

```
┌─────────────────────────────────────────────────────────┐
│  ⚠️  Potential Duplicate Patient Found                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  The following patients match your input:              │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Name: John Smith   DOB: 1985-03-15   CPT: AB12 │   │
│  │ MRN: HRD-12345    Phone: +1-555-0123            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Name: John Smith   DOB: 1985-03-15   CPT: CD34 │   │
│  │ MRN: none         Phone: +1-555-0199            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │ Use Existing    │  │ Create New Patient (I confirm)│ │
│  └──────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

### 4. Initial Imaging Study Order Creation

**User Story**: As a radiologist, I want to create an initial imaging study order during patient registration so that the patient can proceed directly to imaging.

#### Acceptance Criteria

| ID | Criterion | Details |
|----|-----------|---------|
| ORD-001 | System must allow creating study order during registration | Optional, can skip |
| ORD-002 | System must require modality selection | Required if ordering study |
| ORD-003 | System must require body part / study type | Required if ordering study |
| ORD-004 | System must require clinical indication | Required, 10-1000 characters |
| ORD-005 | System must allow priority selection | Options: stat, urgent, routine, scheduled |
| ORD-006 | System must generate unique study UUID | Format: RAD-YYYY-NNNNNN |
| ORD-007 | System must link study to patient CPT | Foreign key relationship |
| ORD-008 | System must set initial study status | Status: "ordered" |

#### Study Order Form Fields

```php
// Study Order Fields
[
    'modality' => [
        'type' => 'select',
        'label' => 'Imaging Modality',
        'required' => true,
        'options' => [
            'CT' => 'Computed Tomography',
            'MRI' => 'Magnetic Resonance Imaging', 
            'XRAY' => 'X-Ray',
            'ULTRASOUND' => 'Ultrasound',
            'PET' => 'Positron Emission Tomography',
            'MAMMO' => 'Mammography',
            'FLUORO' => 'Fluoroscopy',
            'ANGIO' => 'Angiography'
        ],
        'validation' => 'required|in:CT,MRI,XRAY,ULTRASOUND,PET,MAMMO,FLUORO,ANGIO'
    ],
    'body_part' => [
        'type' => 'text',
        'label' => 'Body Part / Region',
        'required' => true,
        'validation' => 'required|string|min:2|max:100'
    ],
    'study_type' => [
        'type' => 'text',
        'label' => 'Study Type',
        'required' => true,
        'placeholder' => 'e.g., Chest CT, Brain MRI',
        'validation' => 'required|string|min:2|max:200'
    ],
    'clinical_indication' => [
        'type' => 'textarea',
        'label' => 'Clinical Indication',
        'required' => true,
        'placeholder' => 'Describe the reason for this imaging study...',
        'validation' => 'required|string|min:10|max:1000'
    ],
    'priority' => [
        'type' => 'select',
        'label' => 'Priority',
        'required' => true,
        'default' => 'routine',
        'options' => [
            'stat' => 'STAT - Immediate',
            'urgent' => 'Urgent - Within 2 hours',
            'routine' => 'Routine - Within 24 hours',
            'scheduled' => 'Scheduled - Booked'
        ],
        'validation' => 'required|in:stat,urgent,routine,scheduled'
    ]
]
```

---

### 5. Error Handling for Invalid Data Entry

**User Story**: As a radiologist, I want clear error messages when I enter invalid data so that I can correct mistakes quickly.

#### Acceptance Criteria

| ID | Criterion | Details |
|----|-----------|---------|
| ERR-001 | System must display field-level validation errors | Inline, next to invalid field |
| ERR-002 | System must display form-level errors | At top of form |
| ERR-003 | System must prevent submission with invalid data | Client-side + server-side validation |
| ERR-004 | System must highlight invalid fields visually | Red border, error icon |
| ERR-005 | System must provide helpful error messages | Plain language, actionable |
| ERR-006 | System must preserve form data on error | Don't clear valid fields |
| ERR-007 | System must handle server errors gracefully | 500 errors show user-friendly message |

#### Error Message Display

```
┌─────────────────────────────────────────────────────────┐
│  ✏️ Register New Patient                                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  First Name *                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │ John123                                           │ ✗ │
│  └─────────────────────────────────────────────────┘   │
│  ⚠️ First name can only contain letters               │
│                                                         │
│  Last Name *                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Smith                                             │ ✓ │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Please correct the errors above before continuing│   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Register Patient]                                     │
└─────────────────────────────────────────────────────────┘
```

---

### 6. Insurance Eligibility Validation

**User Story**: As a radiologist, I want to verify insurance eligibility during patient onboarding so that we can confirm coverage before imaging.

#### Acceptance Criteria

| ID | Criterion | Details |
|----|-----------|---------|
| INS-001 | System must accept insurance provider information | Optional field |
| INS-002 | System must accept insurance policy number | Optional field |
| INS-003 | System must allow manual eligibility verification | Button to check status |
| INS-003 | System must display eligibility status | Verified, Pending, Not Covered, Not Provided |
| INS-004 | System must allow override for manual verification | User can mark as manually verified |
| INS-005 | System must store eligibility verification timestamp | For audit purposes |

#### Insurance Form Fields

```php
[
    'insurance_provider' => [
        'type' => 'text',
        'label' => 'Insurance Provider',
        'required' => false,
        'placeholder' => 'e.g., Blue Cross, Medicare',
        'validation' => 'nullable|string|max:100'
    ],
    'insurance_policy_number' => [
        'type' => 'text',
        'label' => 'Policy Number',
        'required' => false,
        'placeholder' => 'Enter policy number',
        'validation' => 'nullable|string|max:50'
    ],
    'insurance_group_number' => [
        'type' => 'text',
        'label' => 'Group Number',
        'required' => false,
        'validation' => 'nullable|string|max:50'
    ]
]
```

#### Eligibility Status Display

```
Insurance Information
┌─────────────────────────────────────────────────────────┐
│ Provider: Blue Cross Blue Shield    [Check Eligibility]│
│ Policy #: BCB123456789                                    │
│ Group #: GRP-001                                         │
│                                                         │
│ Status: ✓ Verified - Active                             │
│ Verified: 2026-02-22 10:30 AM by Dr. Smith             │
└─────────────────────────────────────────────────────────┘
```

---

### 7. Conflict Resolution for Matching Records

**User Story**: As a radiologist, I want to resolve conflicts when matching patient records are found so that the correct patient is used for imaging.

#### Acceptance Criteria

| ID | Criterion | Details |
|----|-----------|---------|
| CON-001 | System must present conflict resolution UI | Show side-by-side comparison |
| CON-002 | System must allow user to choose correct record | Select from matches or create new |
| CON-003 | System must allow merging of partial data | If user selects existing patient |
| CON-004 | System must log conflict resolution decisions | Audit trail for compliance |
| CON-005 | System must require justification for override | If creating new despite match |

#### Conflict Resolution UI

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 Match Found - Please Confirm Patient Identity               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  New Patient Input              │  Existing Patient Record     │
│  ─────────────────────          │  ─────────────────────────    │
│  Name: John Smith               │  Name: John Smith            │
│  DOB: 1985-03-15               │  DOB: 1985-03-15             │
│  Phone: +1-555-0177            │  Phone: +1-555-0199           │
│  MRN: (not provided)           │  MRN: HRD-12345              │
│                                │  CPT: AB12                   │
│                                │  Last Visit: 2026-01-15      │
│                                                                 │
│  What would you like to do?                                    │
│  ────────────────────────                                      │
│  ○ Use Existing Patient (John Smith, CPT: AB12)               │
│    [ ] Update phone number to +1-555-0177                      │
│                                                                 │
│  ○ Create New Patient (I confirm these are different people)   │
│    Justification: Different phone number, new patient         │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────────────────────┐  │
│  │ Cancel           │  │ Confirm Selection                │  │
│  └──────────────────┘  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 8. HIPAA Compliance Requirements

**User Story**: As a compliance officer, I want the patient onboarding system to maintain HIPAA compliance so that patient data is protected.

#### Acceptance Criteria

| ID | Criterion | Implementation |
|----|-----------|----------------|
| HIPAA-001 | All patient data must be encrypted at rest | Database encryption enabled |
| HIPAA-002 | All data transmission must use TLS 1.2+ | HTTPS enforced |
| HIPAA-003 | System must implement access controls | Role-based access (radiologist, tech, admin) |
| HIPAA-004 | System must log all PHI access | Audit logging enabled |
| HIPAA-005 | System must support data retention policies | Configurable retention |
| HIPAA-006 | System must allow data export for patients | Patient data portability |
| HIPAA-007 | System must allow data deletion requests | Right to be forgotten (with exceptions) |

#### HIPAA Audit Log Requirements

```php
// Every patient-related action must be logged
[
    'event_type' => 'patient.created|patient.updated|patient.viewed|patient.deleted',
    'user_id' => 'ID of user performing action',
    'patient_cpt' => 'Patient identifier',
    'ip_address' => 'Client IP',
    'user_agent' => 'Browser/application info',
    'action_details' => 'JSON of changes',
    'timestamp' => 'UTC timestamp',
    'compliance_flag' => 'PHI_ACCESS | PHI_CREATE | PHI_UPDATE | PHI_DELETE'
]
```

---

### 9. Audit Logging of All Patient Onboarding Actions

**User Story**: As a system administrator, I want complete audit logging of all patient onboarding actions so that I can investigate issues and maintain compliance.

#### Acceptance Criteria

| ID | Criterion | Details |
|----|-----------|---------|
| AUD-001 | Log patient registration | Event: PATIENT_CREATED, capture all fields |
| AUD-002 | Log patient lookup/verification | Event: PATIENT_LOOKUP, capture search criteria |
| AUD-003 | Log duplicate detection | Event: DUPLICATE_CHECK, capture matches found |
| AUD-004 | Log conflict resolution | Event: CONFLICT_RESOLVED, capture decision + justification |
| AUD-005 | Log study order creation | Event: STUDY_ORDERED, capture study details |
| AUD-006 | Log eligibility verification | Event: ELIGIBILITY_CHECKED, capture result |
| AUD-007 | Log user actions | Event: USER_ACTION, capture all CRUD operations |
| AUD-008 | Log failed authentication attempts | Event: AUTH_FAILED, capture attempt details |
| AUD-009 | Logs must be tamper-proof | Immutable storage, hash chain |
| AUD-010 | Logs must be queryable | Search by date, user, patient, event type |

#### Audit Log Model

```php
<?php
// app/Models/AuditLog.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $fillable = [
        'event_type',
        'event_category',
        'user_id',
        'patient_cpt',
        'patient_id',
        'ip_address',
        'user_agent',
        'action_details',
        'old_values',
        'new_values',
        'metadata',
        'created_at'
    ];

    protected $casts = [
        'old_values' => 'array',
        'new_values' => 'array',
        'metadata' => 'array',
    ];

    public const EVENT_CATEGORIES = [
        'PATIENT' => 'Patient Management',
        'STUDY' => 'Imaging Study',
        'AUTH' => 'Authentication',
        'SYSTEM' => 'System Events'
    ];
}
```

---

### 10. Manual Data Entry and Batch Import

**User Story**: As a radiology administrator, I want to import patient data in batches so that I can efficiently onboard multiple patients at once.

#### Acceptance Criteria

| ID | Criterion | Details |
|----|-----------|---------|
| BATCH-001 | System must accept CSV file upload | .csv format only |
| BATCH-002 | System must validate CSV structure | Header row must match template |
| BATCH-003 | System must validate each row individually | Process all rows, report errors |
| BATCH-004 | System must provide import preview | Show first 10 rows before confirmation |
| BATCH-005 | System must show import progress | Progress bar for large files |
| BATCH-006 | System must generate import report | Summary of success/failure per row |
| BATCH-007 | System must allow partial imports | Continue on error, skip invalid rows |
| BATCH-008 | System must log all batch operations | Capture entire import session |

#### CSV Import Template

```csv
first_name,last_name,date_of_birth,gender,phone,email,external_mrn,insurance_provider,insurance_policy_number,modality,body_part,study_type,clinical_indication,priority
John,Smith,1985-03-15,male,+15550123,john@example.com,HRD-12345,BlueCross,BC123456,CT,Chest,Chest CT,Cough and fever,urgent
Jane,Doe,1990-07-22,female,+15550199,jane@example.com,HRD-12346,Medicare,MED789012,MRI,Brain,Brain MRI,Headache,routine
```

#### Import Validation Rules

| Column | Rule | Error Message |
|--------|------|---------------|
| first_name | Required, 2-100 chars | "Row {n}: First name is required" |
| last_name | Required, 2-100 chars | "Row {n}: Last name is required" |
| date_of_birth | Required, valid date | "Row {n}: Invalid date format" |
| gender | Required, enum | "Row {n}: Invalid gender" |
| phone | Optional, valid format | "Row {n}: Invalid phone format" |
| email | Optional, valid email | "Row {n}: Invalid email format" |
| modality | If present, valid enum | "Row {n}: Invalid modality" |
| priority | If present, valid enum | "Row {n}: Invalid priority" |

#### Import Report UI

```
┌─────────────────────────────────────────────────────────┐
│  Import Complete                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Total Rows: 50                                         │
│  ✓ Successful: 47                                       │
│  ✗ Failed: 3                                           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Errors:                                          │   │
│  │ Row 12: Invalid date format (DOB)              │   │
│  │ Row 25: Duplicate patient (John Smith)        │   │
│  │ Row 38: Missing required field (gender)        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Download Full Report]  [Download Valid Records]     │
└─────────────────────────────────────────────────────────┘
```

---

### 11. Patient-Study Attribution (Zero Tolerance for Mismatches)

**User Story**: As a radiologist, I want every imaging study to be correctly attributed to the right patient so that there are no diagnostic errors due to patient identity mix-ups.

#### Acceptance Criteria

| ID | Criterion | Implementation |
|----|-----------|----------------|
| ATTR-001 | Study must always link to valid CPT | Foreign key constraint |
| ATTR-002 | System must display patient verification before study | Confirmation dialog |
| ATTR-003 | System must allow patient re-identification | If wrong patient selected |
| ATTR-004 | System must log all attribution changes | Audit trail |
| ATTR-005 | System must prevent study completion without valid attribution | Validation gate |
| ATTD-006 | System must support patient wristband scanning | Barcode/QR integration (future) |

#### Study Attribution Flow

```
┌─────────────────────────────────────────────────────────┐
│  Confirm Patient for Study                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Study: Chest CT (RAD-2026-000123)                     │
│  Priority: Urgent                                       │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Patient: John Smith                             │   │
│  │ CPT: AB12                                       │   │
│  │ DOB: 1985-03-15                                │   │
│  │ Gender: Male                                   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Is this the correct patient for this study?           │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ ✗ Wrong Patient  │  │ ✓ Confirm & Proceed      │  │
│  └──────────────────┘  └──────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

### 12. User Interface Requirements

**User Story**: As a radiologist, I want an intuitive user interface for patient onboarding so that I can efficiently register patients without errors.

#### UI Requirements

| ID | Requirement | Details |
|----|-------------|---------|
| UI-001 | Registration form must be single-page | No multi-step wizard |
| UI-002 | Form must be mobile-responsive | Works on tablets in clinic |
| UI-003 | Auto-save draft every 30 seconds | Prevent data loss |
| UI-004 | Keyboard navigation support | Tab through fields |
| UI-005 | Accessible form labels | WCAG 2.1 AA compliant |
| UI-006 | Loading states for async operations | Spinners, progress indicators |
| UI-007 | Success confirmation with patient summary | Show CPT prominently |
| UI-008 | Quick actions after registration | "Create Study", "View Patient", "Print Card" |

#### Registration Confirmation UI

```
┌─────────────────────────────────────────────────────────┐
│  ✓ Patient Registered Successfully                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Patient Information                                    │
│  ─────────────────────                                  │
│  Name: John Smith                                      │
│  CPT: AB12  [Copy]                                     │
│  DOB: March 15, 1985 (40 years)                       │
│  Gender: Male                                          │
│  Phone: +1 555-0123                                   │
│  MRN: HRD-12345                                       │
│                                                         │
│  ─────────────────────                                  │
│  Insurance: Blue Cross - Verified                      │
│                                                         │
│  ─────────────────────                                  │
│  Study Ordered: Chest CT (URGENT)                     │
│  Study ID: RAD-2026-000123                            │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐           │
│  │ Create Another   │  │ View Patient     │           │
│  └──────────────────┘  └──────────────────┘           │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🖨️ Print Patient Card                           │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Integration with Existing Radiology Workflow

### Workflow Diagram

```
┌──────────────┐    ┌────────────────┐    ┌──────────────┐
│ Patient      │───>│ Registration   │───>│ Study Order  │
│ Arrives      │    │ (Minimal)      │    │ (Optional)   │
└──────────────┘    └────────────────┘    └──────────────┘
                           │                      │
                           v                      v
                    ┌────────────┐         ┌────────────┐
                    │ Duplicate  │         │ Imaging    │
                    │ Check      │         │ Queue      │
                    └────────────┘         └────────────┘
                           │
                           v
                    ┌────────────┐
                    │ Patient    │
                    │ CPT Card   │
                    └────────────┘
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/radiology/patients` | POST | Register new patient |
| `/api/radiology/patients` | GET | List patients (paginated) |
| `/api/radiology/patients/{cpt}` | GET | Get patient details |
| `/api/radiology/patients/{cpt}` | PUT | Update patient |
| `/api/radiology/patients/search` | POST | Search for duplicates |
| `/api/radiology/patients/import` | POST | Batch import patients |
| `/api/radiology/studies` | POST | Create study order |
| `/api/radiology/insurance/verify` | POST | Verify insurance eligibility |

---

## Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| Performance | Registration form loads in < 2 seconds |
| Performance | Patient search returns in < 500ms |
| Availability | System available 99.9% uptime |
| Scalability | Support 1000+ concurrent users |
| Security | All endpoints require authentication |
| Compliance | HIPAA, SOC 2 Type II |

---

## Future Enhancements (Out of Scope)

- QR code / barcode scanning for patient identification
- Integration with hospital EMR systems
- Advanced insurance eligibility API integration
- Patient portal for self-registration
- Voice-assisted data entry

---

## Dependencies

- HealthBridge Core Patient Model (`App\Models\Patient`)
- Radiology Study Model (`App\Models\RadiologyStudy`)
- Audit Logging Service
- CouchDB Sync Service
- Authentication & Authorization (Laravel Sanctum)

---

**Document Version**: 1.0  
**Created**: 2026-02-22  
**Author**: HealthBridge Technical Team  
**Status**: Ready for Implementation
