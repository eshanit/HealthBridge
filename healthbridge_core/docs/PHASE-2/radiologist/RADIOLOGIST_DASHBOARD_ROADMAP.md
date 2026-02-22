# HealthBridge Phase 2 – Radiologist Dashboard Product Roadmap

**Document Version:** 4.0 (Consolidated)
**Status:** Production-Ready
**Created:** 2026-02-19
**Last Updated:** 2026-02-20
**Target Phase:** Phase 2
**Classification:** Technical Specification
**Merged From:** V0 (2.0) + V1 (3.0)

---

## Executive Summary

This document outlines the comprehensive product roadmap for the **Radiologist Dashboard** in HealthBridge Phase 2. It builds upon the foundation laid in Phase 1 (GP Dashboard) and extends the platform to support the full radiology workflow. The dashboard is designed for **radiologists**—medical doctors specializing in diagnostic imaging—and integrates closely with **radiology technologists** who capture images via the mobile app.

Key new features include **AI‑powered assistance** (automated preliminary reporting, visual question answering, longitudinal analysis, intelligent triage, anatomical localization), a seamless **mobile‑to‑web handoff**, and a complete **DICOM‑compliant** imaging pipeline. The roadmap is structured into clear phases with explicit dependencies, technical specifications, and success criteria.

### What's New in v4.0 (Consolidated)

- **Full Database Schema Integration** – Complete schema definitions for radiology_studies, diagnostic_reports, consultations, interventional_procedures, and treatment_plans tables
- **CouchDB Document Types** – Complete JSON schemas for all radiology document types with sync specifications
- **Detailed API Endpoints** – Comprehensive REST API specifications for all dashboard modules
- **Enhanced AI Integration Deep‑dive** – Detailed specifications for five requested AI capabilities, including how they integrate with the existing AI Gateway and prompt versioning
- **Mobile Technologist Workflow** – Explicitly describes how a nurse or radiology technologist can initiate a study from the mobile app, capture/upload images, and refer to a radiologist
- **Radiologist‑Initiated Sessions** – Covers the use case where a radiologist directly registers a patient and orders imaging (e.g., in an outpatient clinic)
- **Enhanced DICOM Pipeline** – Added image compression strategies, CDN caching, and progressive loading for mobile viewing
- **Refined Phases** – Realigned phase boundaries to better accommodate AI feature delivery and reduce cross‑phase dependencies
- **Scalability & Performance** – Expanded on image delivery, lazy loading, and database indexing strategies
- **Complete UI Module Specifications** – Detailed component architecture for all six core modules

---

## Table of Contents

1. [Role Definition & Scope](#1-role-definition--scope)
2. [Core Responsibilities Mapping](#2-core-responsibilities-mapping)
3. [Radiologist vs. Radiology Technologist](#3-radiologist-vs-radiology-technologist)
4. [Technical Architecture](#4-technical-architecture)
   - 4.1 System Context
   - 4.2 DICOM Integration
   - 4.3 Image Delivery Strategy
   - 4.4 AI Gateway Integration
5. [Dashboard Architecture](#5-dashboard-architecture)
   - 5.1 Global App Frame
   - 5.2 Navigation Structure
6. [UI Modules & Components](#6-ui-modules--components)
   - 6.1 Core Modules
   - 6.2 Supporting Components
7. [API Endpoints](#7-api-endpoints)
   - 7.1 Naming Conventions
   - 7.2 Radiology Dashboard & Queue
   - 7.3 Diagnostic Reporting
   - 7.4 Consultation Management
   - 7.5 Interventional Procedures
   - 7.6 Treatment Planning
   - 7.7 AI Integration
   - 7.8 Real-Time Updates
8. [Database Schema Extensions](#8-database-schema-extensions)
   - 8.1 Migration Naming Convention
   - 8.2 radiology_studies Table
   - 8.3 diagnostic_reports Table
   - 8.4 consultations Table
   - 8.5 interventional_procedures Table
   - 8.6 treatment_plans Table
   - 8.7 Existing Table Extensions
9. [CouchDB Document Types](#9-couchdb-document-types)
   - 9.1 radiologyStudy Document
   - 9.2 diagnosticReport Document
   - 9.3 consultation Document
10. [AI Integration for Imaging](#10-ai-integration-for-imaging)
    - 10.1 Radiology AI Tasks
    - 10.2 AI in Workflow
    - 10.3 Governance & Safety
    - 10.4 Prompt Templates
11. [Workflow Optimizations](#11-workflow-optimizations)
    - 11.1 Intelligent Triage & Prioritization
    - 11.2 Automated Preliminary Reporting
    - 11.3 Visual Question Answering
    - 11.4 Longitudinal Analysis
    - 11.5 Anatomical Localization
    - 11.6 Critical Findings Communication
    - 11.7 Report Turnaround Tracking
    - 11.8 Stat / On‑Call Workflow
12. [Collaborative Tools](#12-collaborative-tools)
13. [Implementation Phases](#13-implementation-phases)
14. [Success Criteria](#14-success-criteria)
15. [Risk Assessment & Mitigation](#15-risk-assessment--mitigation)
16. [Compliance & Regulatory](#16-compliance--regulatory)
17. [Appendix A: Keyboard Shortcuts](#17-appendix-a-keyboard-shortcuts)
18. [Appendix B: Accessibility Requirements](#18-appendix-b-accessibility-requirements)
19. [Appendix C: Integration Points](#19-appendix-c-integration-points)

---

## 1. Role Definition & Scope

### 1.1 Radiologist Role in HealthBridge

The radiologist is a **consulting specialist** who:

- Receives imaging referrals from GPs, nurses, specialists, or radiology technologists.
- Interprets medical images (X‑ray, CT, MRI, Ultrasound, PET, Mammography).
- Generates structured diagnostic reports.
- Provides consultation to referring physicians.
- Performs image‑guided interventional procedures.
- Tracks treatment planning based on imaging findings.

### 1.2 Current Permissions (from RoleSeeder)

| Permission | Description | Status |
|------------|-------------|--------|
| `use-ai` | Access to AI assistance | ✅ Implemented |
| `ai-imaging-interpretation` | AI‑powered imaging interpretation support | ✅ Implemented |
| `view-cases` | View clinical cases | ✅ Implemented |
| `view-all-cases` | View all cases across the system | ✅ Implemented |
| `accept-referrals` | Accept imaging referrals | ✅ Implemented |
| `add-case-comments` | Add clinical comments to cases | ✅ Implemented |

### 1.3 Additional Permissions Required (v4.0)

| Permission | Description | Phase |
|------------|-------------|-------|
| `view-radiology-worklist` | Access radiology worklist | 2A |
| `sign-reports` | Digitally sign reports | 2B |
| `request-second-opinion` | Request colleague review | 2C |
| `manage-procedures` | Schedule interventional procedures | 2D |
| `view-critical-findings` | View critical findings dashboard | 2B |
| `receive-critical-alerts` | Receive critical findings notifications | 2B |
| `initiate-session` | Start a session directly (no referral) | 2A |

### 1.4 Patient Intake Pathways

| Pathway | Source | Typical Trigger |
|---------|--------|-----------------|
| **Technologist‑Initiated Referral** | Nurse / Technologist (mobile) | Image capture complete, requires interpretation |
| **Radiologist‑Initiated Session** | Radiologist (web) | Walk‑in patient, direct order |
| **GP / Specialist Referral** | GP Dashboard | Clinical suspicion requiring imaging |
| **Emergency / Stat** | Emergency Department | Acute trauma, stroke, etc. |
| **Follow‑up Review** | Previous Session | Disease progression monitoring |
| **Interventional Procedure** | Referring Physician | Image‑guided intervention request |

---

## 2. Core Responsibilities Mapping

| # | Core Responsibility | Dashboard Module | Priority | Dependencies |
|---|-------------------|------------------|----------|--------------|
| 1 | Interpreting imaging and generating diagnostic reports | Diagnostic Reporting Module | P0 | 2A |
| 2 | Acting as consultant to referring physicians | Consultation & Communication Hub | P0 | 2C |
| 3 | Performing interventional radiology procedures | Interventional Procedure Suite | P1 | 2D |
| 4 | Tracking treatment planning | Treatment Planning Tracker | P1 | 2D |

---

## 3. Radiologist vs. Radiology Technologist

### 3.1 Role Distinction

| Aspect | Radiologist | Radiology Technologist |
|--------|-------------|------------------------|
| **Medical Training** | Medical degree (MD) + Radiology residency | Technical certification (RT) |
| **Clinical Authority** | Can diagnose, interpret, report | Operates equipment, captures images |
| **Decision Making** | Final diagnostic authority | Equipment settings, positioning |
| **Report Signing** | Signs off on official reports | Cannot generate diagnostic reports |
| **Consultation Role** | Provides clinical consultation | No patient consultation |
| **DICOM Access** | Full (WADO‑RS) | Limited (STOW‑RS) |

### 3.2 Radiology Technologist Permissions (v4.0)

| Permission | Description | Phase |
|------------|-------------|-------|
| `view-assigned-studies` | View studies assigned to them | 2A |
| `capture-imaging` | Record imaging data via mobile | 2A |
| `equipment-status` | Update equipment availability | 2B |
| `quality-check` | Perform preliminary quality check | 2B |
| `refer-to-radiologist` | Refer completed study to radiologist | 2A |

### 3.3 Workflow Separation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MOBILE APP (TECHNOLOGIST)                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ Patient Onboard │  │ Capture Images  │  │ Quality Check  │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│           │                   │                  │                         │
│           └───────────────────┴──────────────────┘                         │
│                              │                                              │
│                              ▼                                              │
│                     ┌─────────────────┐                                    │
│                     │  Refer to       │                                    │
│                     │  Radiologist    │                                    │
│                     └────────┬────────┘                                    │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │ (via CouchDB sync)
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WEB APP (RADIOLOGIST)                               │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ Worklist        │  │ DICOM Viewer    │  │ Report Editor   │             │
│  │ (with AI triage)│  │ (with AI tools) │  │ (with AI draft) │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│           │                   │                  │                         │
│           └───────────────────┴──────────────────┘                         │
│                              │                                              │
│                              ▼                                              │
│                     ┌─────────────────┐                                    │
│                     │  Consultation   │                                    │
│                     │  & Follow‑up    │                                    │
│                     └─────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Technical Architecture

### 4.1 System Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HEALTHBRIDGE RADIOLOGY ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐                    ┌─────────────────────────────┐ │
│  │   MOBILE TIER       │                    │      WEB TIER               │ │
│  │   (Nuxt 4 SPA)      │                    │   (Laravel 11 + Inertia)    │ │
│  ├─────────────────────┤                    ├─────────────────────────────┤ │
│  │ • Technologist App  │                    │ • Radiologist Dashboard     │ │
│  │ • Image Capture     │                    │ • DICOM Viewer (Cornerstone)│ │
│  │ • Offline Sync      │                    │ • Report Editor             │ │
│  │ • Referral Creation │                    │ • AI Co‑Pilot               │ │
│  └──────────┬──────────┘                    └──────────────┬──────────────┘ │
│             │                                              │               │
│             │ PouchDB                                      │ MySQL         │
│             │ (Encrypted)                                  │ (Operational) │
│             ▼                                              ▼               │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         SYNC LAYER                                   │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │   PouchDB ◄──────────────► CouchDB ◄──────────────► Sync Worker     │  │
│  │   (Mobile)     bi‑dir       (Source     continuous    (Laravel      │  │
│  │                sync         of Truth)   _changes      Daemon)       │  │
│  └─────────────────────────────┬──────────────────────┬───────────────────┘  │
│                                │                      │                       │
│                                │                      ▼                       │
│                                │            ┌─────────────────────┐          │
│                                │            │   DICOM ARCHIVE     │          │
│                                │            │   (Orthanc)         │          │
│                                │            │   WADO‑RS / STOW‑RS │          │
│                                │            └──────────┬──────────┘          │
│                                │                       │                      │
│                                ▼                       ▼                      │
│                       ┌─────────────────────────────────────────┐          │
│                       │            AI GATEWAY                   │          │
│                       │         (Laravel + Ollama)              │          │
│                       │                                         │          │
│                       │  • MedGemma 27B / 4B                    │          │
│                       │  • Radiology‑specific prompts           │          │
│                       │  • Multimodal support (future)          │          │
│                       │  • Full audit logging                   │          │
│                       └─────────────────────────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 DICOM Integration

| Component | Technology | Purpose |
|-----------|------------|---------|
| **DICOM Viewer** | Cornerstone.js + cornerstone‑wado‑image‑loader | Web‑based image display |
| **DICOM Storage** | Orthanc DICOM Server | WADO‑RS / STOW‑RS compliant |
| **Image Compression** | JPEG 2000 (lossy/lossless) | Mobile‑optimized delivery |
| **Prior Studies** | Orthanc + PostgreSQL Index | Fast prior search |
| **CDN** | CloudFront / similar | Global image distribution |

### 4.3 Image Delivery Strategy

| Use Case | Format | Compression | Latency Target | Cache Strategy |
|----------|--------|-------------|----------------|----------------|
| **Desktop Review** | Original DICOM | None | < 500ms | Edge cache (1 hour) |
| **Mobile Viewer** | JPEG 2000 | 80% lossy | < 2s | Device cache (session) |
| **Thumbnail** | JPEG | 90% lossy | < 200ms | CDN cache (24h) |
| **Prior Comparison** | JPEG 2000 | 70% lossy | < 3s | Edge cache (1 day) |

### 4.4 AI Gateway Integration

All AI requests pass through the existing Laravel AI Gateway, ensuring:
- **Authentication** – Sanctum token required.
- **Authorization** – `AiGuard` middleware checks role permissions.
- **Audit Logging** – Every request stored in `ai_requests`.
- **Prompt Versioning** – Version‑controlled prompts in `prompt_versions`.
- **Safety Validation** – Output sanitization blocks prohibited phrases.

---

## 5. Dashboard Architecture

### 5.1 Global App Frame

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  HealthBridge | Radiologist Dashboard                      Dr. Scanwell ⌄  │
│  Worklist | Studies | Reports | Consultations | Cases | Settings           │
├──────────────────────────────────────────────────────────────────────────────┤
│  🔔 [3]  ⚙️                                                            │
│                                                                              │
│  LEFT WORKLIST PANEL                MAIN RADIOLOGY WORKSPACE                │
│  ─────────────────────               ────────────────────────                │
│                                                                              │
│  ┌─────────────────────┐            ┌───────────────────────────────────┐   │
│  │ 🔴 Urgent Studies  │            │                                   │   │
│  │ ─────────────────  │            │     DICOM VIEWER / IMAGE DISPLAY  │   │
│  │ CT Brain - #4521  │            │                                   │   │
│  │  Waiting: 15 min  │            │     [Toolbar: Zoom, Pan, Window,   │   │
│  │                   │            │      Measure, Annotate, Stack]     │   │
│  │ ─────────────────  │            │                                   │   │
│  │ 🟡 Routine Studies│            └───────────────────────────────────┘   │
│  │ Chest X-Ray #4518                                                      │
│  │ MRI Spine #4520   │            ┌───────────────────────────────────┐   │
│  │                   │            │  PATIENT CONTEXT & REFERRAL INFO   │   │
│  │ ─────────────────  │            │  Patient: John D. | 45y | Male    │   │
│  │ 📋 Completed Today │            │  Referring: Dr. Moyo (GP)        │   │
│  │ 12 studies        │            │  Clinical: Suspected pneumonia    │   │
│  └─────────────────────┘            │  Priority: Routine                │   │
│                                     └───────────────────────────────────┘   │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  REPORTING PANEL                                                         ▼   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Findings | Impression | Recommendation | AI Assistance               │   │
│  ├──────────────────────────────────────────────────────────────────────┤   │
│  │ [Structured Report Editor with Templates]                            │   │
│  │ [Ctrl+Enter: Save Draft] [Ctrl+Shift+Enter: Sign & Finalize]       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Navigation Structure

| Main Tab | Purpose | Keyboard Shortcut | Dependencies |
|----------|---------|-------------------|--------------|
| **Worklist** | Primary study queue with priority sorting | `W` | 2A |
| **Studies** | Browse all assigned imaging studies | `S` | 2A |
| **Reports** | View generated diagnostic reports | `R` | 2B |
| **Consultations** | Active consultation requests | `C` | 2C |
| **Cases** | Patient cases with imaging history | `X` | 2A |
| **Procedures** | Interventional procedure management | `P` | 2D |
| **Settings** | Preferences, equipment, templates | `,` | 2A |

---

## 6. UI Modules & Components

### 6.1 Core Modules

#### Module 1: Radiology Worklist (Phase 2A)

**Purpose:** Display incoming imaging studies with priority sorting

**Components:**
- `RadiologyWorklist.vue` - Main worklist container
- `StudyCard.vue` - Individual study display
- `PriorityBadge.vue` - Urgency indicator
- `WaitingTimer.vue` - Time elapsed tracking
- `WorklistFilters.vue` - Advanced filtering

**Features:**
- Priority-based sorting (Stat → Urgent → Routine → Scheduled)
- Filter by modality (CT, MRI, X-Ray, Ultrasound, PET, Mammography)
- Filter by body part/system
- Filter by date range
- Filter by radiologist assignment
- Quick search by patient name or study ID
- Real-time updates via WebSocket
- Auto-refresh every 30 seconds

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `↑/↓` | Navigate studies |
| `Enter` | Open selected study |
| `A` | Accept selected study |
| `Esc` | Clear selection |
| `/` | Focus search |

#### Module 2: DICOM Viewer Integration (Phase 2B)

**Purpose:** Display and manipulate medical images

**Components:**
- `DicomViewer.vue` - Main viewer container
- `ViewerToolbar.vue` - Manipulation tools
- `ImageStack.vue` - Multi-frame navigation
- `MeasurementOverlay.vue` - Quantitative measurements
- `AnnotationLayer.vue` - Radiologist annotations
- `HangingProtocol.vue` - View layout management
- `PriorComparison.vue` - Prior study viewer

**Features:**
- Window/Level adjustment (click + drag)
- Zoom and pan
- Length and angle measurements
- Region of interest (ROI) analysis
- Hanging protocols (customizable view layouts)
- Prior study comparison (side-by-side, overlay)
- Multi-frame scrolling (mouse wheel, scrollbar)
- Image annotation (arrows, circles, freehand)
- Measurement calibration

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `1-9` | Preset window/level |
| `W` | Window/level tool |
| `Z` | Zoom tool |
| `P` | Pan tool |
| `M` | Measure tool |
| `R` | Rotate |
| `H` | Flip H |
| `V` | Flip V |
| `Space` | Play/pause cine |

#### Module 3: Diagnostic Reporting (Phase 2B)

**Purpose:** Generate structured diagnostic reports

**Components:**
- `DiagnosticReport.vue` - Report container
- `StructuredFindings.vue` - Findings editor with templates
- `ImpressionBuilder.vue` - Impression section builder
- `RecommendationEngine.vue` - AI-powered recommendations
- `ReportTemplates.vue` - Template library
- `ReportPreview.vue` - Final report preview
- `DigitalSignature.vue` - Signature workflow

**Features:**
- Voice-to-text dictation support (Web Speech API)
- Structured report templates by modality/body part
- Auto-population from clinical context
- Critical findings alert (with communication tracking)
- Digital signature and finalization
- Amendment workflow with reason tracking
- Macro system for common findings
- Auto-save every 30 seconds

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `Ctrl+S` | Save draft |
| `Ctrl+Shift+F` | Sign & finalize |
| `Ctrl+B` | Bold text |
| `Ctrl+I` | Italic text |
| `Tab` | Next section |
| `Shift+Tab` | Previous section |

#### Module 4: Consultation Hub (Phase 2C)

**Purpose:** Facilitate communication with referring physicians

**Components:**
- `ConsultationQueue.vue` - Incoming consultation requests
- `ConsultationThread.vue` - Message thread display
- `QuickReply.vue` - Pre-defined response templates
- `UrgencyEscalation.vue` - Escalation controls

**Features:**
- Real-time messaging with referring physicians
- Pre-defined consultation templates
- Urgent findings notification workflow
- Follow-up scheduling integration
- Message read receipts
- Consultation SLA tracking

#### Module 5: Interventional Procedure Suite (Phase 2D)

**Purpose:** Document image-guided procedures

**Components:**
- `ProcedureList.vue` - Scheduled procedures
- `ProcedureWorkspace.vue` - Documentation workspace
- `ConsentTracker.vue` - Consent status tracking
- `ComplicationLog.vue` - Complication documentation
- `PostProcedure.vue` - Post-procedure orders
- `ProcedureTemplates.vue` - Common procedure templates

**Features:**
- Procedure booking and scheduling
- Informed consent tracking with e-signature
- Real-time procedure documentation
- Equipment and supply logging
- Post-procedure orders and instructions
- Radiation dose tracking

#### Module 6: Treatment Planning Tracker (Phase 2D)

**Purpose:** Track treatment planning based on imaging findings

**Components:**
- `TreatmentPlanList.vue` - Active treatment plans
- `ImagingMilestone.vue` - Follow-up imaging schedule
- `ResponseAssessment.vue` - Treatment response tracking
- `MultidisciplinaryTracking.vue` - MDT meeting coordination

**Features:**
- Link imaging findings to treatment plans
- Follow-up imaging reminders
- Response evaluation workflows (RECIST, WHO)
- MDT scheduling and documentation
- Integration with oncology systems

### 6.2 Supporting Components

| Component | Description | Phase |
|-----------|-------------|-------|
| `PatientHeader` | Patient demographics, allergies, clinical context | 2A |
| `StudyMetadata` | Modality, body part, technique, contrast | 2A |
| `ClinicalHistoryPanel` | Relevant clinical history from referral | 2A |
| `PriorStudiesComparator` | Side-by-side comparison with priors | 2B |
| `AICoPilot` | AI-assisted interpretation panel | 2C |
| `ReportAuditStrip` | Report history and modification tracking | 2B |
| `CriticalFindingsAlert` | Critical findings notification workflow | 2B |
| `NotificationCenter` | Real-time alerts and messages | 2C |

---

## 7. API Endpoints

### 7.1 Naming Conventions

| Pattern | Example | Description |
|---------|---------|-------------|
| Collection | `/radiologist/worklist` | List resources |
| Single | `/radiologist/worklist/{studyId}` | Single resource |
| Action | `/radiologist/worklist/{studyId}/accept` | Custom action |
| Relationship | `/radiologist/studies/{studyId}/images` | Related resources |

### 7.2 Radiology Dashboard & Queue

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/radiologist/dashboard` | Dashboard statistics | radiologist |
| GET | `/api/radiologist/worklist` | Radiology worklist (paginated) | radiologist |
| GET | `/api/radiologist/worklist/stats` | Queue statistics | radiologist |
| GET | `/api/radiologist/worklist/{studyId}` | Study details | radiologist |
| POST | `/api/radiologist/worklist/{studyId}/accept` | Accept study | radiologist |
| POST | `/api/radiologist/worklist/{studyId}/claim` | Claim unassigned | radiologist |
| POST | `/api/radiologist/worklist/{studyId}/assign` | Assign to radiologist | radiologist |
| GET | `/api/radiologist/studies` | All assigned studies | radiologist |
| GET | `/api/radiologist/studies/{studyId}` | Study with images | radiologist |
| GET | `/api/radiologist/studies/{studyId}/images` | DICOM image list | radiologist |
| GET | `/api/radiologist/studies/{studyId}/priors` | Prior studies | radiologist |

### 7.3 Diagnostic Reporting

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/radiologist/reports` | List reports (paginated) | radiologist |
| GET | `/api/radiologist/reports/templates` | Report templates | radiologist |
| GET | `/api/radiologist/reports/{reportId}` | Report details | radiologist |
| POST | `/api/radiologist/reports` | Create new report | radiologist |
| PUT | `/api/radiologist/reports/{reportId}` | Update draft | radiologist |
| POST | `/api/radiologist/reports/{reportId}/finalize` | Sign & finalize | sign-reports |
| POST | `/api/radiologist/reports/{reportId}/amend` | Amend finalized | sign-reports |
| POST | `/api/radiologist/reports/{reportId}/critical-findings` | Report critical | radiologist |
| GET | `/api/radiologist/reports/{reportId}/history` | Report audit trail | radiologist |

### 7.4 Consultation Management

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/radiologist/consultations` | Consultation queue | radiologist |
| GET | `/api/radiologist/consultations/{id}` | Consultation details | radiologist |
| POST | `/api/radiologist/consultations` | Create consultation | radiologist |
| POST | `/api/radiologist/consultations/{id}/reply` | Send reply | radiologist |
| POST | `/api/radiologist/consultations/{id}/escalate` | Escalate urgent | radiologist |

### 7.5 Interventional Procedures

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/radiologist/procedures` | Procedure list | radiologist |
| GET | `/api/radiologist/procedures/{id}` | Procedure details | radiologist |
| POST | `/api/radiologist/procedures` | Schedule procedure | manage-procedures |
| PUT | `/api/radiologist/procedures/{id}` | Update procedure | manage-procedures |
| POST | `/api/radiologist/procedures/{id}/start` | Start procedure | manage-procedures |
| POST | `/api/radiologist/procedures/{id}/complete` | Complete procedure | manage-procedures |
| POST | `/api/radiologist/procedures/{id}/complications` | Log complication | manage-procedures |

### 7.6 Treatment Planning

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/radiologist/treatment-plans` | Treatment plans | radiologist |
| GET | `/api/radiologist/treatment-plans/{id}` | Plan details | radiologist |
| POST | `/api/radiologist/treatment-plans` | Create plan | radiologist |
| PUT | `/api/radiologist/treatment-plans/{id}` | Update plan | radiologist |
| POST | `/api/radiologist/treatment-plans/{id}/imaging-milestone` | Add follow-up | radiologist |
| GET | `/api/radiologist/treatment-plans/{id}/response` | Response assessment | radiologist |

### 7.7 AI Integration

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/ai/radiology/interpret` | AI interpretation | ai-imaging-interpretation |
| POST | `/api/ai/radiology/findings` | Generate findings | ai-imaging-interpretation |
| POST | `/api/ai/radiology/differential` | Differential diagnosis | ai-imaging-interpretation |
| POST | `/api/ai/radiology/report-check` | Quality check | ai-imaging-interpretation |
| POST | `/api/ai/radiology/triage` | Priority scoring | ai-imaging-interpretation |
| POST | `/api/ai/radiology/preliminary-report` | Auto-generate preliminary report | ai-imaging-interpretation |
| POST | `/api/ai/radiology/vqa` | Visual question answering | ai-imaging-interpretation |
| POST | `/api/ai/radiology/longitudinal` | Longitudinal analysis | ai-imaging-interpretation |
| POST | `/api/ai/radiology/localization` | Anatomical localization | ai-imaging-interpretation |

### 7.8 Real-Time Updates

| Channel | Event | Description |
|---------|-------|-------------|
| `/ws/radiology/worklist` | `study.created` | New study in queue |
| `/ws/radiology/worklist` | `study.updated` | Study status changed |
| `/ws/radiology/consultations` | `consultation.new` | New consultation |
| `/ws/radiology/alerts` | `critical.findings` | Critical alert |

---

## 8. Database Schema Extensions

### 8.1 Migration Naming Convention

```
YYYY_MM_DD_HHMMSS_create_radiology_studies_table.php
YYYY_MM_DD_HHMMSS_create_diagnostic_reports_table.php
...
```

### 8.2 radiology_studies Table

```php
Schema::create('radiology_studies', function (Blueprint $table) {
    $table->id();
    $table->string('study_uuid', 50)->unique();
    $table->string('study_instance_uid', 64)->unique()->nullable();
    $table->string('accession_number', 50)->nullable();
    
    // Session & Patient
    $table->string('session_couch_id')->nullable();
    $table->string('patient_cpt', 20);
    
    // Ordering
    $table->foreignId('referring_user_id')->nullable()->constrained('users')->nullOnDelete();
    $table->foreignId('assigned_radiologist_id')->nullable()->constrained('users')->nullOnDelete();
    
    // Study Details
    $table->enum('modality', ['CT', 'MRI', 'XRAY', 'ULTRASOUND', 'PET', 'MAMMO', 'FLUORO', 'ANGIO']);
    $table->string('body_part', 100);
    $table->string('study_type', 255);
    $table->text('clinical_indication');
    $table->text('clinical_question')->nullable();
    
    // Priority & Status
    $table->enum('priority', ['stat', 'urgent', 'routine', 'scheduled'])->default('routine');
    $table->enum('status', [
        'pending', 'ordered', 'scheduled', 'in_progress', 
        'completed', 'interpreted', 'reported', 'amended', 'cancelled'
    ])->default('pending');
    
    // Procedure Info
    $table->enum('procedure_status', ['not_started', 'in_progress', 'completed', 'verified'])->nullable();
    $table->string('procedure_technician_id')->nullable();
    
    // AI Fields
    $table->integer('ai_priority_score')->nullable();
    $table->boolean('ai_critical_flag')->default(false);
    $table->text('ai_preliminary_report')->nullable();
    
    // Timestamps
    $table->timestamp('ordered_at');
    $table->timestamp('scheduled_at')->nullable();
    $table->timestamp('performed_at')->nullable();
    $table->timestamp('images_available_at')->nullable();
    $table->timestamp('study_completed_at')->nullable();
    $table->timestamps();
    
    // Indexes
    $table->index(['status', 'priority']);
    $table->index(['assigned_radiologist_id', 'status']);
    $table->index(['patient_cpt', 'created_at']);
    $table->index('modality');
    $table->index('study_instance_uid');
    $table->index('ai_priority_score');
});
```

### 8.3 diagnostic_reports Table

```php
Schema::create('diagnostic_reports', function (Blueprint $table) {
    $table->id();
    $table->string('report_uuid', 50)->unique();
    $table->string('report_instance_uid', 64)->unique()->nullable();
    $table->integer('report_version')->default(1);
    
    // Study Reference
    $table->foreignId('study_id')->constrained('radiology_studies')->cascadeOnDelete();
    $table->foreignId('radiologist_id')->constrained('users');
    
    // Report Content
    $table->text('findings')->nullable();
    $table->text('impression')->nullable();
    $table->text('recommendations')->nullable();
    
    // Report Type
    $table->enum('report_type', ['preliminary', 'final', 'addendum', 'amendment', 'canceled'])->default('final');
    $table->boolean('is_locked')->default(false);
    
    // AI Generated Content
    $table->text('ai_findings')->nullable();
    $table->text('ai_impression')->nullable();
    $table->boolean('ai_generated')->default(false);
    
    // Critical Findings
    $table->boolean('critical_findings')->default(false);
    $table->boolean('critical_communicated')->default(false);
    $table->string('communication_method', 50)->nullable();
    $table->timestamp('communicated_at')->nullable();
    $table->foreignId('communicated_to_user_id')->nullable()->constrained('users')->nullOnDelete();
    
    // Digital Signature
    $table->text('digital_signature')->nullable();
    $table->string('signature_hash', 64)->nullable();
    $table->timestamp('signed_at')->nullable();
    
    // Amendment Tracking
    $table->text('amendment_reason')->nullable();
    $table->foreignId('amended_by')->nullable()->constrained('users')->nullOnDelete();
    $table->timestamp('amended_at')->nullable();
    
    // Audit
    $table->json('audit_log')->nullable();
    
    // Timestamps
    $table->timestamps();
    
    // Indexes
    $table->index(['study_id', 'report_version']);
    $table->index(['radiologist_id', 'created_at']);
    $table->index('critical_findings');
});
```

### 8.4 consultations Table

```php
Schema::create('consultations', function (Blueprint $table) {
    $table->id();
    $table->string('consultation_uuid', 50)->unique();
    
    // References
    $table->foreignId('study_id')->constrained('radiology_studies')->cascadeOnDelete();
    $table->foreignId('requesting_user_id')->constrained('users');
    $table->foreignId('radiologist_id')->nullable()->constrained('users')->nullOnDelete();
    
    // Consultation Details
    $table->enum('consultation_type', ['preliminary', 'formal', 'urgent', 'second_opinion']);
    $table->string('consultation_category', 100)->nullable();
    $table->text('question');
    $table->text('clinical_context')->nullable();
    
    // Status & SLA
    $table->enum('status', ['pending', 'in_progress', 'answered', 'closed'])->default('pending');
    $table->timestamp('first_response_at')->nullable();
    $table->timestamp('answered_at')->nullable();
    $table->timestamp('closed_at')->nullable();
    $table->integer('sla_hours')->default(24);
    
    // Messages (JSON for threading)
    $table->json('messages')->nullable();
    
    $table->timestamps();
    
    $table->index(['status', 'created_at']);
    $table->index('radiologist_id');
});
```

### 8.5 interventional_procedures Table

```php
Schema::create('interventional_procedures', function (Blueprint $table) {
    $table->id();
    $table->string('procedure_uuid', 50)->unique();
    
    // References
    $table->string('session_couch_id')->nullable();
    $table->string('patient_cpt', 20);
    $table->foreignId('study_id')->nullable()->constrained('radiology_studies')->nullOnDelete();
    $table->foreignId('radiologist_id')->constrained('users');
    $table->foreignId('referring_user_id')->nullable()->constrained('users')->nullOnDelete();
    
    // Procedure Details
    $table->string('procedure_type', 255);
    $table->string('procedure_code', 50)->nullable();
    $table->string('target', 255);
    $table->text('indications');
    $table->text('technique')->nullable();
    
    // Status
    $table->enum('status', ['scheduled', 'prep', 'in_progress', 'complete', 'cancelled'])->default('scheduled');
    
    // Consent
    $table->enum('consent_status', ['pending', 'obtained', 'refused', 'waiver'])->default('pending');
    $table->timestamp('consent_obtained_at')->nullable();
    $table->text('consent_notes')->nullable();
    
    // Procedure Times
    $table->timestamp('scheduled_at');
    $table->timestamp('patient_arrived_at')->nullable();
    $table->timestamp('procedure_started_at')->nullable();
    $table->timestamp('procedure_ended_at')->nullable();
    $table->timestamp('patient_discharged_at')->nullable();
    
    // Documentation
    $table->text('findings')->nullable();
    $table->text('description')->nullable();
    $table->json('complications')->nullable();
    $table->json('equipment_used')->nullable();
    $table->json('post_procedure_orders')->nullable();
    
    // Radiation Dose (if applicable)
    $table->decimal('dlp_gy_cm', 10, 2)->nullable();
    $table->decimal('dap_gy_cm2', 10, 2)->nullable();
    
    $table->timestamps();
    
    $table->index(['status', 'scheduled_at']);
    $table->index('radiologist_id');
});
```

### 8.6 treatment_plans Table

```php
Schema::create('treatment_plans', function (Blueprint $table) {
    $table->id();
    $table->string('plan_uuid', 50)->unique();
    
    // References
    $table->string('session_couch_id')->nullable();
    $table->string('patient_cpt', 20);
    $table->foreignId('created_by')->constrained('users');
    $table->foreignId('study_id')->nullable()->constrained('radiology_studies')->nullOnDelete();
    
    // Plan Details
    $table->enum('plan_type', ['monitoring', 'therapeutic', 'surgical_planning', 'diagnostic']);
    $table->string('diagnosis', 500);
    $table->text('imaging_based_findings')->nullable();
    $table->text('treatment_goals')->nullable();
    
    // Imaging Milestones
    $table->json('imaging_milestones')->nullable();
    
    // Response Assessment
    $table->string('response_criteria', 50)->nullable(); // RECIST, WHO, etc.
    $table->json('baseline_measurements')->nullable();
    
    // Status
    $table->enum('status', ['active', 'completed', 'discontinued', 'on_hold'])->default('active');
    $table->date('next_review_date')->nullable();
    $table->timestamp('completed_at')->nullable();
    $table->text('completion_reason')->nullable();
    
    // MDT
    $table->boolean('requires_mdt')->default(false);
    $table->timestamp('mdt_scheduled_at')->nullable();
    
    $table->timestamps();
    
    $table->index(['patient_cpt', 'status']);
    $table->index('next_review_date');
});
```

### 8.7 Existing Table Extensions

#### Extend `referrals` Table

```php
Schema::table('referrals', function (Blueprint $table) {
    // Imaging-specific referral data
    $table->enum('imaging_modality', ['CT', 'MRI', 'XRAY', 'ULTRASOUND', 'PET', 'MAMMO'])->nullable()->after('specialty');
    $table->string('imaging_body_part', 100)->nullable()->after('imaging_modality');
    $table->text('clinical_question')->nullable()->after('imaging_body_part');
    $table->enum('urgency', ['routine', 'urgent', 'stat', 'emergency'])->default('routine')->after('priority');
    
    // Study reference (for tracking completed imaging)
    $table->foreignId('radiology_study_id')->nullable()->constrained('radiology_studies')->nullOnDelete()->after('clinical_notes');
});
```

#### Extend `clinical_sessions` Table

```php
Schema::table('clinical_sessions', function (Blueprint $table) {
    // Radiology-specific fields
    $table->json('imaging_studies')->nullable()->after('form_instance_ids');
    $table->boolean('has_radiology_referral')->default(false)->after('imaging_studies');
});
```

---

## 9. CouchDB Document Types

### 9.1 radiologyStudy Document

```json
{
  "_id": "radstud_A7F3B2C1",
  "type": "radiologyStudy",
  "studyUuid": "RAD-2026-0004521",
  "studyInstanceUid": "1.2.840.113619.2.55.3.12345.67890",
  "accessionNumber": "ACC-2026-0001234",
  
  "patient": {
    "cpt": "CP-7F3A-9B2C",
    "patientId": "pat_A7F3"
  },
  
  "ordering": {
    "referringUserId": "usr_12345",
    "clinicalIndication": "Persistent cough, suspected pneumonia",
    "clinicalQuestion": "Evaluate for pulmonary infiltrates or masses",
    "orderedAt": "2026-02-20T08:30:00Z",
    "urgency": "routine"
  },
  
  "studyDetails": {
    "modality": "CT",
    "bodyPart": "CHEST",
    "studyType": "CT Chest with Contrast",
    "technique": "Axial images from lung apices to adrenals...",
    "contrast": true,
    "contrastType": "Iohexol 300"
  },
  
  "assignment": {
    "assignedRadiologistId": null,
    "assignedAt": null
  },
  
  "workflow": {
    "status": "pending",
    "procedureStatus": "not_started",
    "orderedAt": "2026-02-20T08:30:00Z",
    "scheduledAt": "2026-02-20T14:00:00Z",
    "performedAt": null,
    "imagesAvailableAt": null,
    "completedAt": null
  },
  
  "ai": {
    "priorityScore": null,
    "criticalFlag": false,
    "preliminaryReport": null
  },
  
  "metadata": {
    "version": "1.0.0",
    "createdBy": "system",
    "createdAt": "2026-02-20T08:30:00Z",
    "updatedAt": "2026-02-20T08:30:00Z"
  }
}
```

### 9.2 diagnosticReport Document

```json
{
  "_id": "dgrpt_F8G4H3I2",
  "type": "diagnosticReport",
  "reportUuid": "RPT-2026-0000987",
  "reportInstanceUid": "1.2.840.113619.2.55.3.12345.67891",
  "reportVersion": 1,
  
  "studyReference": {
    "studyUuid": "RAD-2026-0004521",
    "studyId": 123
  },
  
  "radiologist": {
    "id": "usr_67890",
    "name": "Dr. Scanwell"
  },
  
  "content": {
    "findings": "There is a 2.5 cm solid nodule in the right upper lobe...",
    "impression": "1. Right upper lobe nodule, recommend follow-up in 3 months...",
    "recommendations": "1. CT chest in 3 months\n2. PET/CT if growth detected"
  },
  
  "aiGenerated": {
    "findings": null,
    "impression": null,
    "wasUsed": false
  },
  
  "reportType": "final",
  
  "criticalFindings": {
    "flagged": false,
    "communicated": false
  },
  
  "signature": {
    "signedAt": "2026-02-20T10:15:00Z",
    "signatureHash": "sha256:abc123...",
    "digitalSignature": "MIIDQT..."
  },
  
  "auditLog": [
    {
      "action": "created",
      "timestamp": "2026-02-20T09:00:00Z",
      "userId": "usr_67890"
    },
    {
      "action": "finalized",
      "timestamp": "2026-02-20T10:15:00Z",
      "userId": "usr_67890"
    }
  ],
  
  "metadata": {
    "version": "1.0.0",
    "createdAt": "2026-02-20T09:00:00Z",
    "updatedAt": "2026-02-20T10:15:00Z"
  }
}
```

### 9.3 consultation Document

```json
{
  "_id": "cons_J9K5L4M3",
  "type": "consultation",
  "consultationUuid": "CON-2026-0000567",
  
  "studyReference": {
    "studyUuid": "RAD-2026-0004521"
  },
  
  "participants": {
    "requestingUserId": "usr_12345",
    "radiologistId": "usr_67890"
  },
  
  "consultationType": "formal",
  "question": "What is the recommended follow-up interval for this nodule?",
  "clinicalContext": "65-year-old male, former smoker...",
  
  "status": {
    "current": "answered",
    "firstResponseAt": "2026-02-20T11:00:00Z",
    "answeredAt": "2026-02-20T11:30:00Z",
    "closedAt": null,
    "slaHours": 24
  },
  
  "messages": [
    {
      "id": "msg_001",
      "senderId": "usr_12345",
      "content": "Please advise on follow-up for the above nodule.",
      "timestamp": "2026-02-20T11:00:00Z"
    },
    {
      "id": "msg_002",
      "senderId": "usr_67890",
      "content": "Given the size and characteristics, I recommend CT in 3 months.",
      "timestamp": "2026-02-20T11:30:00Z"
    }
  ],
  
  "metadata": {
    "version": "1.0.0",
    "createdAt": "2026-02-20T11:00:00Z",
    "updatedAt": "2026-02-20T11:30:00Z"
  }
}
```

---

## 10. AI Integration for Imaging

### 10.1 Radiology AI Tasks (Expanded)

| Task | Purpose | Use Case | Model | Max Tokens | Latency Target |
|------|---------|----------|-------|------------|----------------|
| `ai‑imaging‑interpretation` | General imaging interpretation assistance | Assist with differential diagnosis | MedGemma 27B | 1000 | < 10s |
| `imaging‑findings‑generation` | Auto‑generate structured findings | Speed up reporting | MedGemma 4B | 800 | < 8s |
| `preliminary‑report` | Create a first‑draft structured report (findings + impression) | Automated preliminary reporting | MedGemma 4B | 1500 | < 15s |
| `vqa‑interactive` | Visual question answering – user asks about image | "Does this CT show hemorrhage?" | MedGemma 4B (multimodal) | 600 | < 5s |
| `longitudinal‑analysis` | Compare current study with prior, describe changes | Tumor growth/shrinkage | MedGemma 4B | 800 | < 10s |
| `priority‑scoring` | AI‑assisted priority assignment | Intelligent triage | MedGemma 4B | 300 | < 3s |
| `anatomical‑localization` | Label structures and pinpoint abnormalities | Precision measurements | MedGemma 4B | 400 | < 5s |
| `differential‑diagnosis` | Generate differential diagnoses | Based on imaging findings | MedGemma 27B | 600 | < 5s |
| `report‑quality‑check` | Validate report completeness | Quality assurance | MedGemma 4B | 400 | < 3s |
| `critical‑findings‑detection` | Flag potential critical findings | Triage urgent cases | MedGemma 4B | 500 | < 5s |

### 10.2 AI in Workflow – Detailed Feature Specifications

#### 10.2.1 Automated Preliminary Reporting
- **When triggered:** After images are available and assigned to a radiologist (or immediately for stat cases).
- **What it does:** The AI generates a structured preliminary report containing:
  - Findings (bulleted list)
  - Impression (summary)
  - Recommendations (optional)
- **How it's presented:** The report editor is pre‑filled with the AI draft; the radiologist can accept, modify, or discard it.
- **Audit:** The draft is logged as an `ai_requests` entry with task `preliminary-report`. The final signed report references the AI version used.
- **Model:** MedGemma 4B (fine‑tuned for radiology reporting).

#### 10.2.2 Visual Question Answering (VQA)
- **Interface:** A chat‑style panel within the DICOM viewer where the radiologist can type natural language questions about the image(s).
- **Examples:**
  - "Does this CT show any signs of intracranial hemorrhage?"
  - "Measure the largest nodule in the right lung."
  - "What anatomical structures are visible in this slice?"
- **Processing:** The question and a reference to the current image(s) are sent to the AI Gateway. The AI returns a textual answer; if location‑specific, it may include coordinates (to be highlighted in the viewer).
- **Implementation:** Uses MedGemma 4B multimodal capabilities. Responses are logged for audit.
- **Highlighting:** For spatial answers, the frontend can overlay a circle or box on the image using Cornerstone's annotation tools.

#### 10.2.3 Longitudinal Analysis
- **Trigger:** When a prior study exists, the radiologist can invoke "Compare with prior" from the toolbar.
- **Function:** The AI compares the current and prior series (by series UID or manually selected) and generates a description of changes, e.g.:
  - "The 2.3 cm nodule in the right upper lobe has grown to 3.1 cm (34% increase)."
  - "New pleural effusion not seen on prior study."
- **Output:** A text summary that can be inserted into the report.
- **Model:** MedGemma 4B with access to both image series (or their metadata).

#### 10.2.4 Intelligent Triage & Prioritization
- **When:** Immediately after images are uploaded and before any radiologist assignment.
- **Process:**
  1. The AI Gateway receives the study metadata and a thumbnail set (or a compressed version of key images).
  2. It computes a priority score (0‑100) based on likelihood of critical findings, urgency of clinical indication, and study type.
  3. The score is attached to the study; the worklist can be sorted by it.
  4. If the score exceeds a threshold (e.g., 80), the study is flagged as "Stat" and a notification is sent to on‑call radiologists.
- **Model:** MedGemma 4B (optimized for fast inference). The score is logged for audit and can be overridden by the radiologist.

#### 10.2.5 Anatomical Localization
- **Usage:** Within the viewer, the radiologist can select a point or region and ask "What is this?" or "Label this structure." The AI returns the anatomical name (e.g., "Right upper lobe bronchus") and optionally suggests measurements.
- **Integration:** The AI can also automatically label structures on hover or upon request, improving the radiologist's orientation.
- **Model:** MedGemma 4B (multimodal). The output can be used to pre‑populate measurement annotations.

### 10.3 AI Governance & Safety

- All AI outputs include the required disclaimer: "AI‑assisted, not a substitute for clinical judgment."
- Critical findings flagged by AI require human confirmation before notification is sent.
- Prompt versions for each AI task are stored and can be audited.
- Override tracking: if a radiologist modifies an AI‑generated report, the difference is logged.

### 10.4 Prompt Templates

New prompt templates will be created for each AI task and stored in the `prompt_versions` table. Examples:

```json
// preliminary-report prompt
{
  "task": "preliminary-report",
  "version": "1.0.0",
  "content": "You are a radiology AI assistant. Based on the following imaging study details, generate a preliminary report in a structured format with 'Findings', 'Impression', and 'Recommendations'. Use clinical language. Study: {{modality}} of {{bodyPart}}. Clinical indication: {{indication}}. Findings: {{findings_placeholder}} ..."
}
```

---

## 11. Workflow Optimizations

### 11.1 Intelligent Triage & Prioritization (AI‑driven)

- **Worklist Sorting:** By default, worklist sorted by priority score (descending) and wait time.
- **Visual Indicators:** Icons for "AI‑flagged critical" and "AI priority score."
- **Manual Override:** Radiologist can re‑prioritize; override logged.

### 11.2 Automated Preliminary Reporting (AI‑assisted)

- **Default State:** New studies in worklist show a "Preliminary Report Available" badge.
- **One‑Click Accept:** Radiologist can click to open the report editor pre‑filled with AI draft.
- **Edit & Sign:** Standard report editing with AI suggestions in the margin (future).

### 11.3 Visual Question Answering (VQA)

- **Access:** Via a "Ask AI" button in the viewer toolbar.
- **History:** VQA interactions are saved per study and can be reviewed.
- **Integration with Report:** The answer can be inserted into the report with a click.

### 11.4 Longitudinal Analysis

- **Access:** "Compare with prior" button that triggers AI analysis.
- **Side‑by‑side Display:** The viewer shows current and prior series; the AI analysis panel displays textual comparison.
- **Insert into Report:** One‑click insertion of the comparison summary.

### 11.5 Anatomical Localization

- **Automatic Labeling:** When hovering over an image for >1 second, AI suggests anatomical labels (optional).
- **Measurement Assist:** When drawing a measurement line, AI suggests the structure being measured.

### 11.6 Critical Findings Communication

*(Robust workflow with escalation.)*

### 11.7 Report Turnaround Time Tracking

*(Standard tracking with SLA monitoring.)*

### 11.8 Stat / On‑Call Workflow

- **After‑Hours Routing:** Automatically routes stat studies to on‑call radiologist.
- **Push Notifications:** On‑call radiologist receives mobile push with study details.
- **Escalation:** If no response in 15 minutes, escalates to backup.

---

## 12. Collaborative Tools

*(Messaging, MDT, teaching library, second opinion.)*

---

## 13. Implementation Phases

### Phase 0 – Foundation (Weeks 1‑2)

- Database migrations for radiology tables.
- Add radiology permissions to `RoleSeeder`.
- Configure CouchDB sync for radiology documents.
- Set up Orthanc DICOM server integration (basic).
- **Dependencies:** None.

### Phase 2A – Core Worklist & Study Management (Weeks 3‑5)

- `RadiologyWorklist.vue` with filtering/sorting.
- Study detail view with patient context.
- Basic report editor (draft).
- Technologist mobile app enhancements: image capture, quality check, referral creation.
- Radiologist‑initiated session creation (direct patient registration and imaging order).
- **Dependencies:** Phase 0.
- **AI Integration:** Intelligent triage scoring (basic version) – uses AI Gateway to compute priority.

### Phase 2B – DICOM Viewer & Structured Reporting (Weeks 6‑9)

- DICOM viewer integration (Cornerstone.js) with toolbar.
- Report templates library (by modality/body part).
- Structured report editor (findings, impression, recommendations).
- Digital signature workflow.
- Critical findings communication workflow.
- **Dependencies:** Phase 2A.
- **AI Integration:** Automated preliminary reporting, anatomical localization (basic labeling).

### Phase 2C – Advanced AI & Consultation (Weeks 10‑13)

- Consultation hub (messaging with referrers).
- Prior study comparison (manual).
- AI Co‑Pilot panel.
- Dashboard metrics (turnaround times, SLA).
- Real‑time notifications (WebSockets).
- **Dependencies:** Phase 2B.
- **AI Integration:** Visual question answering (VQA), longitudinal analysis, advanced anatomical localization (measurement assist).

### Phase 2D – Procedures & Treatment Planning (Weeks 14‑17)

- Interventional procedure scheduling and documentation.
- Treatment planning tracker.
- MDT coordination.
- Teaching library.
- **Dependencies:** Phase 2C.
- **AI Integration:** (Optional) AI‑assisted procedure planning.

### Phase 2E – Polish & Hardening (Weeks 18‑20)

- Performance optimization (image caching, CDN).
- Accessibility audit and fixes.
- Mobile‑responsive UI.
- Security audit.
- **Dependencies:** Phase 2D.

### Phase Dependencies Diagram

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Phase 0 │ ──▶ │ Phase 2A│ ──▶ │ Phase 2B│ ──▶ │ Phase 2C│ ──▶ │ Phase 2D│ ──▶ Phase 2E
│  (2 wks)│     │  (3 wks)│     │  (4 wks)│     │  (4 wks)│     │  (4 wks)│     (3 wks)
└─────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘
    │               │               │               │               │
  Foundation    Worklist +      DICOM Viewer +   Consultation    Procedures +
                 Basic UI       Structured Rep.   + AI Core       Treatment
```

---

## 14. Success Criteria

*(Retain v2.0 criteria; add specific AI success metrics.)*

- **Automated Preliminary Report Acceptance Rate:** ≥ 70% of AI drafts accepted without major edits.
- **VQA Accuracy:** ≥ 85% user satisfaction in spot checks.
- **Triage Accuracy:** Critical findings flagged with ≥ 90% sensitivity (measured against final reports).
- **Longitudinal Analysis:** ≥ 80% of comparison summaries used directly.
- **Report Turnaround Time:** ≤ 85% of routine reports completed within 24 hours.
- **Critical Findings Communication:** 100% of critical findings communicated within 30 minutes.

---

## 15. Risk Assessment & Mitigation

*(Add AI‑specific risks: AI misinterpretation, model latency, prompt injection.)*

| Risk | Likelihood | Impact | Mitigation | Contingency |
|------|------------|--------|------------|-------------|
| AI misinterpretation leading to wrong suggestion | Medium | High | Human override mandatory, disclaimers, audit trail | Training, prompt tuning |
| Model latency >5s affecting workflow | Medium | Medium | Async processing, caching, fallback to no‑AI | Optimise model, use smaller model for quick tasks |
| Prompt injection via user questions | Low | Medium | Input sanitisation, output validation | Security review, block suspicious patterns |
| DICOM viewer performance on large studies | Medium | Medium | Progressive loading, compression | Fallback to basic viewer |
| Mobile sync failures | Low | High | Retry logic, offline queue | Manual re-sync trigger |
| Critical findings missed in AI triage | Medium | Critical | Redundant human review for high-priority | Escalation to senior radiologist |

---

## 16. Compliance & Regulatory

*(Add AI‑specific compliance: need to validate AI as a medical device? Not required for "assistance only" if disclaimed.)*

- **AI as Clinical Decision Support (CDS):** The system is classified as a non‑diagnostic assistive tool; it does not make autonomous decisions. This aligns with FDA guidance on CDS.
- **Disclaimers:** All AI outputs are clearly marked as "AI‑generated suggestion – not a final diagnosis."
- **Audit Trail:** Every AI interaction is logged, including model version, prompt, and output.
- **Data Retention:** AI logs retained for 7 years (same as clinical records).
- **DICOM Compliance:** Full compliance with DICOM 3.0, WADO‑RS, and STOW‑RS standards.
- **HIPAA:** All patient data encrypted at rest and in transit; audit logs for all access.

---

## 17. Appendix A: Keyboard Shortcuts

*(Add shortcuts for AI features.)*

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+A` | Ask AI (open VQA panel) |
| `Ctrl+Shift+P` | Generate preliminary report |
| `Ctrl+Shift+C` | Compare with prior |
| `Ctrl+Shift+T` | Show AI triage score |
| `Ctrl+S` | Save draft |
| `Ctrl+Shift+F` | Sign & finalize |
| `Ctrl+B` | Bold text |
| `Ctrl+I` | Italic text |
| `Tab` | Next section |
| `Shift+Tab` | Previous section |
| `↑/↓` | Navigate studies |
| `Enter` | Open selected study |
| `A` | Accept selected study |
| `Esc` | Clear selection |
| `/` | Focus search |

---

## 18. Appendix B: Accessibility Requirements

*(WCAG 2.1 AA Compliance)*

- All interactive elements keyboard accessible
- Screen reader compatible with proper ARIA labels
- Color contrast ratio ≥ 4.5:1 for text
- Focus indicators visible
- Error messages announced to assistive technology

---

## 19. Appendix C: Integration Points

| Existing Component | Radiology Adaptation |
|--------------------|----------------------|
| `PatientQueue.vue` | `RadiologyWorklist.vue` (with AI triage) |
| `PatientHeader.vue` | Enhanced with imaging context |
| `PatientWorkspace.vue` | `RadiologyWorkspace.vue` |
| `ClinicalTabs.vue` | `ReportingTabs.vue` |
| `AIExplainabilityPanel.vue` | `AICoPilotPanel.vue` (with VQA, longitudinal) |
| `ReportActions.vue` | Extended for radiology |
| `TimelineView.vue` | Enhanced for imaging history |
| `WorkflowStateMachine` | Radiology states added |
| `ContextBuilder` | Imaging‑specific context |
| `PromptBuilder` | Radiology prompt templates |
| `AiMonitor` | Radiology AI metrics |
| `NotificationService` | Critical findings alerts |

---

## Document Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026‑02‑19 | PM | Initial roadmap |
| 2.0 | 2026‑02‑20 | PM | Added technical specs, compliance |
| 3.0 | 2026‑02‑20 | PM + AI Specialist | Integrated 5 AI features, mobile technologist workflow, refined phases |
| **4.0** | **2026‑02‑20** | **PM** | **Consolidated V0 + V1: Full database schemas, CouchDB docs, API endpoints, UI modules, AI features** |

---

*Document Version: 4.0 (Consolidated)*
*Created: 2026-02-19*
*Last Updated: 2026-02-20*
*Target Phase: Phase 2*
*Status: Production-Ready*
