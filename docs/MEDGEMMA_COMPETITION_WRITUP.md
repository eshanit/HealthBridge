# MedGemma HealthBridge Competition Writeup

## Revolutionizing Rural Healthcare Through AI-Powered Mobile Clinical Decision Support

---

## Executive Summary

HealthBridge represents a transformative approach to healthcare delivery in resource-limited settings. By combining a mobile-first frontend application for frontline healthcare workers with a sophisticated specialist dashboard, the platform enables continuity of care across the entire healthcare continuum. The integration of MedGemma AI capabilities provides intelligent clinical guidance at the point of care, while the innovative PouchDB-to-CouchDB-to-MySQL synchronization architecture ensures data availability even in environments with unreliable connectivity.

This document presents HealthBridge as a comprehensive solution for rural healthcare ecosystems, demonstrating how modern technology can bridge the gap between community health workers and specialist physicians, ultimately improving health outcomes for underserved populations.

---

## Table of Contents

1. [The Healthcare Challenge](#the-healthcare-challenge)
2. [System Architecture Overview](#system-architecture-overview)
3. [nurse_mobile: Frontline Healthcare Companion](#nurse_mobile-frontline-healthcare-companion)
4. [healthbridge_core: Specialist Collaboration Platform](#healthbridge_core-specialist-collaboration-platform)
5. [Data Synchronization Pipeline](#data-synchronization-pipeline)
6. [MedGemma AI Integration](#medgemma-ai-integration)
7. [Clinical Use Cases](#clinical-use-cases)
8. [Technical Implementation Details](#technical-implementation-details)
9. [Security and Compliance](#security-and-compliance)
10. [Future Expansion](#future-expansion)

---

## The Healthcare Challenge

### Rural Healthcare Realities

In many developing regions, healthcare delivery faces significant challenges:

- **Insufficient Documentation Systems**: Paper-based records are lost, illegible, or incomplete
- **Limited Internet Connectivity**: Rural clinics may have intermittent or no network access
- **Lack of Specialist Access**: Remote areas have no specialists; patients must travel hours for care
- **Workforce Shortages**: Fewer nurses, midwives, and community health workers than needed
- **Language Barriers**: Clinical protocols often in English, not local languages

### The HealthBridge Solution

HealthBridge addresses these challenges through:

1. **Offline-First Mobile Application**: Frontline workers can document patient encounters without internet
2. **Guided Clinical Workflows**: Step-by-step protocols ensure complete documentation
3. **AI-Powered Assistance**: MedGemma provides real-time clinical guidance
4. **Seamless Specialist Handoffs**: Referrals reach specialists with complete clinical context
5. **Bi-directional Synchronization**: Data flows between mobile and central systems reliably

---

## System Architecture Overview

### High-Level Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    HEALTHBRIDGE ECOSYSTEM                                              │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                         │
│   ┌────────────────────────────────┐         ┌─────────────────────────────────────────────────┐       │
│   │         nurse_mobile            │         │              healthbridge_core                  │       │
│   │    (Nuxt 4 + Capacitor)        │         │            (Laravel 11 + Inertia)              │       │
│   │                                 │         │                                                  │       │
│   │  ┌──────────────────────────┐   │         │  ┌─────────────────────────────────────────┐  │       │
│   │  │      PouchDB (Local)     │   │         │  │            GP / Specialist Dashboard      │  │       │
│   │  │   (Encrypted Storage)    │   │         │  │                                         │  │       │
│   │  └────────────┬─────────────┘   │         │  │  • Patient Queue Management             │  │       │
│   │               │                   │         │  │  • Clinical Session Review              │  │       │
│   │               │  Live Sync       │         │  │  • Radiology Worklist                   │  │       │
│   │               ▼                   │         │  │  • AI-Powered Insights                  │  │       │
│   │  ┌──────────────────────────┐   │   HTTPS │  └────────────────────┬──────────────────┘  │       │
│   │  │      Secure Sync Service │──────────────►│                      │                      │       │
│   │  └────────────┬─────────────┘   │         │                      ▼                      │       │
│   │               │                   │         │  ┌─────────────────────────────────────────┐  │       │
│   └───────────────┼───────────────────┘         │  │           Laravel API Gateway           │  │       │
│                   │                               │  │  • Authentication (Sanctum)            │  │       │
│                   │                               │  │  • CouchDB Proxy                       │  │       │
│                   │                               │  │  • AI Orchestration                    │  │       │
│                   │                               │  └────────────────────┬──────────────────┘  │       │
│                   │                               │                       │                      │       │
│                   │                               │                       ▼                      │       │
│                   │                               │  ┌──────────────────────────┐              │       │
│                   │                               │  │     CouchDB Bridge       │              │       │
│                   │                               │  │  (Sync Database)        │              │       │
│                   │                               │  └────────────┬───────────┘              │       │
│                   │                               │               │                          │       │
│                   │                               │               │  Sync Worker             │       │
│                   │                               │               │  (polls every 4s)        │       │
│                   │                               │               ▼                          │       │
│                   │                               │  ┌──────────────────────────┐              │       │
│                   └───────────────────────────────►  │      MySQL Database      │◄─────────────┘       │
│                                                     │  (Analytics & Reporting) │                  │
│                                                     └──────────────────────────┘                  │
│                                                                                                         │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    MEDGEMMA AI LAYER                                                  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────────┐       │
│   │                                    Ollama / MedGemma Server                                   │       │
│   │                                                                                              │       │
│   │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │       │
│   │   │  Triage Agent   │  │  Treatment      │  │  Radiology      │  │  Clinical       │  │       │
│   │   │                 │  │  Review Agent    │  │  Analysis Agent │  │  Summarizer     │  │       │
│   │   │  • IMCI Class   │  │                 │  │                 │  │                 │  │       │
│   │   │  • Explain Why  │  │  • Plan Review  │  │  • X-Ray Parse   │  │  • EHR Summary  │  │       │
│   │   │  • Next Steps   │  │  • Drug Check   │  │  • CT/MRI Scan  │  │  • SBAR Handoff │  │       │
│   │   │  • Education    │  │  • Guidelines   │  │  • Histopath    │  │  • Guidelines   │  │       │
│   │   └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘  │       │
│   │                                                                                              │       │
│   │   Model: gemma3:4b (configurable)  │  Endpoint: http://localhost:11434                   │       │
│   └─────────────────────────────────────────────────────────────────────────────────────────────┘       │
│                                                                                                         │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack Summary

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Mobile App Framework | Nuxt | 4.x | Vue 3 based web application |
| Mobile Wrapper | Capacitor | 5.x | Cross-platform mobile deployment |
| Local Database | PouchDB | 8.x | Offline-first encrypted storage |
| Backend Framework | Laravel | 11.x | API gateway and business logic |
| Frontend (Core) | Vue 3 + Inertia | Latest | Specialist dashboard |
| Sync Database | CouchDB | 3.x | Document-oriented sync layer |
| Primary Database | MySQL | 8.x | Analytics and reporting |
| AI Engine | Ollama | Latest | Local LLM inference |
| AI Model | MedGemma/Gemma | 3:4b | Clinical decision support |

---

## nurse_mobile: Frontline Healthcare Companion

### Application Overview

**nurse_mobile** is a mobile-first clinical documentation application designed specifically for frontline healthcare workers in rural environments. Built with Nuxt 4 and wrapped with Capacitor, it deploys as a native application on both Android and iOS devices while remaining accessible via web browser on computers.

### Target Users

The application serves a diverse range of frontline healthcare workers:

- **Nurses**: Registered nurses at primary care facilities
- **Nursing Trainees**: Students gaining practical experience
- **Clinical Officers**: Mid-level healthcare providers
- **Midwives**: Maternal health specialists
- **Village Health Workers (VHWs)**: Community-based health volunteers
- **Village Health Foot Workers**: Outreach health personnel

### Key Features

#### 1. Offline-First Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    OFFLINE-FIRST DATA FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│   │   Patient    │───►│   Assess     │───►│   Complete   │    │
│   │   Arrives    │    │   Patient    │    │   Encounter │    │
│   └──────────────┘    └──────────────┘    └──────┬───────┘    │
│                                                  │              │
│                                                  ▼              │
│                                         ┌──────────────┐       │
│   ┌────────────────────────────────────│   PouchDB    │       │
│   │                                    │  (Local Enc- │       │
│   │  • Works without internet         │   rypted DB) │       │
│   │  • AES-256 encryption             └──────┬───────┘       │
│   │  • Automatic conflict resolution           │               │
│   │                                            │               │
│   │         When connectivity returns:         │               │
│   │                                            │               │
│   └───────────────────────────────────────────►│               │
│                                                 │               │
│                                                 ▼               │
│                                        ┌──────────────┐        │
│                                        │  Sync with   │        │
│                                        │  CouchDB     │        │
│                                        └──────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 2. Guided Clinical Workflows

The application implements WHO IMCI (Integrated Management of Childhood Illness) protocols with step-by-step guidance:

- **Pediatric Respiratory Assessment**: Cough and difficulty breathing evaluation
- **Pediatric Diarrhea Assessment**: Dehydration classification and treatment
- **Pediatric Fever Assessment**: Malaria and fever management
- **Adult Wound Care**: Basic wound assessment protocols
- **Radiology Orders**: X-ray, CT, MRI ordering with clinical indication

#### 3. Schema-Based Protocols

```json
// Example: Pediatric Respiratory Schema Structure
{
  "schemaId": "peds_respiratory",
  "name": "Pediatric Respiratory Distress Assessment",
  "protocol": "WHO_IMCI",
  "version": "1.0.0",
  "applicableAgeRange": {
    "minMonths": 2,
    "maxMonths": 59
  },
  "status": "active",
  "metadata": {
    "estimatedCompletionMinutes": 5,
    "riskLevel": "high",
    "requiresSupervisorReview": false
  }
}
```

#### 4. MedGemma AI Integration for Frontline Workers

The application leverages MedGemma AI to provide:

**Triage Explanation**
- Explains WHY a particular triage priority was assigned
- Connects clinical findings to classification logic
- Builds confidence in clinical decision-making

**Inconsistency Detection**
- Identifies potential errors between findings and triage
- Flags missing critical danger signs
- Suggests corrections before submission

**Caregiver Education**
- Generates simple explanations for families
- Lists warning signs requiring return visits
- Provides home care instructions

**Clinical Handover**
- Creates structured SBAR summaries
- Ensures continuity when patients are referred

```typescript
// Clinical AI Service - Frontline Worker Interface
export async function askClinicalAI(
  useCase: AIUseCase,
  explainability: ExplainabilityRecord
): Promise<string> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ai-token': authToken
    },
    body: JSON.stringify({
      useCase,
      payload: explainability
    })
  });

  return response.json();
}
```

#### 5. Radiology Integration

Frontline workers can order radiology studies directly from the application:

```typescript
interface RadiologyStudyDoc {
  type: 'radiologyStudy';
  patientCpt: string;
  modality: 'XRAY' | 'CT' | 'MRI' | 'ULTRASOUND';
  bodyPart?: string;
  clinicalIndication: string;
  priority: 'stat' | 'urgent' | 'routine';
  status: 'pending' | 'ordered' | 'completed';
  aiPriorityScore?: number;
  aiCriticalFlag?: boolean;
  aiPreliminaryReport?: string;
}
```

---

## healthbridge_core: Specialist Collaboration Platform

### Application Overview

**healthbridge_core** is the companion Laravel-based application utilized by specialists, Senior RGNs, radiologists, and doctors to receive well-structured referrals from frontline workers and continue patient care efficiently.

### Target Users

- **General Practitioners (GPs)**: Primary care physicians
- **Specialists**: Cardiologists, pulmonologists, pediatricians
- **Senior RGNs**: Senior Registered General Nurses
- **Radiologists**: Medical imaging specialists
- **Consultants**: Senior medical consultants

### Key Features

#### 1. Patient Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              PATIENT WORKSPACE                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Patient Header                                                               │    │
│  │  ┌──────────────┐  Age: 3 years  │  Sex: M  │  Weight: 14kg  │  CPT: A1B2  │    │
│  │  └──────────────┘                                                               │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Tabs: [Overview] [Vitals] [Forms] [AI Guidance] [Timeline] [Reports]         │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Active Tab Content                                                           │    │
│  │                                                                                │    │
│  │  ┌──────────────────────────────┐  ┌──────────────────────────────────────┐  │    │
│  │  │     Clinical Session         │  │        AI Explanation Panel          │  │    │
│  │  │                              │  │                                       │  │    │
│  │  │  Stage: Assessment Complete  │  │  "This patient was classified as     │  │    │
│  │  │  Triage: RED (Urgent)        │  │   YELLOW due to fast breathing..."  │  │    │
│  │  │  Chief Complaint: Cough +    │  │                                       │  │    │
│  │  │    Difficulty Breathing     │  │  Key Findings:                       │  │    │
│  │  │                              │  │  • RR: 52/min (fast)                 │  │    │
│  │  │  Danger Signs:               │  │  • Chest indrawing present           │  │    │
│  │  │  • Chest indrawing          │  │                                       │  │    │
│  │  │  • Fast breathing           │  │  Recommended Actions:                 │  │    │
│  │  │                              │  │  • Start antibiotic therapy          │  │    │
│  │  │  Referrer: Nurse Mary        │  │  • Arrange chest X-ray               │  │    │
│  │  │  Facility: Rural Clinic A   │  │  • Monitor oxygen saturation         │  │    │
│  │  └──────────────────────────────┘  └──────────────────────────────────────┘  │    │
│  │                                                                                │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### 2. AI-Powered Clinical Decision Support

The platform provides specialists with advanced AI capabilities:

**Medical Imaging Analysis**
- Chest X-ray interpretation with preliminary findings
- CT/MRI scan analysis and anomaly detection
- Histopathology slide examination assistance
- Dermatology image evaluation with condition classification
- Automated critical finding flagging

**EHR Processing**
- Automatic extraction of relevant clinical information
- Summary generation for patient handoffs
- Previous visit history analysis
- Medication and allergy reconciliation

**Clinical Decision Support**
- Evidence-based guideline recommendations
- Drug interaction checking
- Differential diagnosis suggestions
- Literature synthesis for rare conditions

#### 3. Radiology Workflow

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           RADIOLOGIST WORKFLOW                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐  │
│   │    Queue     │────►│    Review    │────►│   Interpret  │────►│    Report    │  │
│   │   Management │     │   Study      │     │   Findings   │     │   Complete   │  │
│   └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘  │
│         │                    │                   │                   │              │
│         ▼                    ▼                   ▼                   ▼              │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐  │
│   │ • AI Triaged │     │ • DICOM      │     │ • AI Assisted│     │ • PDF Export│  │
│   │ • Priority   │     │   Viewer     │     │   Findings   │     │ • Send to   │  │
│   │   Sort       │     │ • Comparison │     │ • Normalize  │     │   Referrer  │  │
│   │ • Filters    │     │   Prior      │     │   Findings   │     │ • Archive   │  │
│   └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘  │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### 4. Multi-Tab Patient List

Specialists can manage multiple patient queues simultaneously:

```vue
<!-- GP Multi-Tab Patient List Component -->
<template>
  <div class="patient-queue">
    <div class="queue-tabs">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        :class="{ active: activeTab === tab.id }"
        @click="switchTab(tab.id)"
      >
        {{ tab.label }}
        <span class="badge">{{ tab.count }}</span>
      </button>
    </div>
    
    <div class="patient-list">
      <div 
        v-for="patient in currentPatients" 
        :key="patient.cpt"
        class="patient-card"
        :class="patient.triagePriority"
      >
        <!-- Patient info and triage status -->
      </div>
    </div>
  </div>
</template>
```

---

## Data Synchronization Pipeline

### The Three-Tier Data Flow

The synchronization architecture enables healthcare data to flow seamlessly between mobile devices in the field and central hospital systems:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              DATA SYNCHRONIZATION PIPELINE                                               │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                          │
│   TIER 1: MOBILE DEVICE                         TIER 2: SYNC BRIDGE                 TIER 3: CENTRAL    │
│   ┌─────────────────────┐                        ┌─────────────────────┐               ┌─────────────────┐ │
│   │    nurse_mobile     │                        │    healthbridge_     │               │                 │ │
│   │                     │                        │        core          │               │                 │ │
│   │  ┌───────────────┐  │                        │                     │               │                 │ │
│   │  │    PouchDB    │  │    HTTPS + Bearer     │  ┌───────────────┐ │               │                 │ │
│   │  │  (Encrypted   │◄─────────────────────────►│  │   Laravel     │ │               │                 │ │
│   │  │   Local DB)   │  │       Token            │  │   Proxy API   │ │               │                 │ │
│   │  └───────────────┘  │                        │  └───────┬───────┘ │               │                 │ │
│   │                     │                        │          │         │               │                 │ │
│   │  Documents:        │                        │          ▼         │               │                 │ │
│   │  • clinicalPatient│                        │  ┌───────────────┐ │               │                 │ │
│   │  • clinicalSession│                        │  │   CouchDB     │ │               │                 │ │
│   │  • clinicalForm   │                        │  │               │ │──────────────►│                 │ │
│   │  • radiologyStudy │                        │  └───────────────┘ │   _changes   │                 │ │
│   │  • clinicalReport │                        │          ▲         │    feed       │                 │ │
│   │                   │                        │          │         │               │                 │ │
│   │  Key Features:   │                        │  ┌───────┴───────┐ │               │                 │ │
│   │  • Offline-first  │                        │  │  Sync Worker  │ │               │                 │ │
│   │  • AES-256       │                        │  │  (polls 4s)   │ │               │                 │ │
│   │  • Auto-retry    │                        │  └───────────────┘ │               │                 │ │
│   │  • Conflict res. │                        │                     │               │                 │ │
│   └───────────────────┘                        └─────────────────────┘               │                 │ │
│                                                                                     │                 │ │
│                                                                                     │    ┌────────────┴────┐ │
│                                                                                     │    │                 │ │
│                                                                                     │    │     MySQL       │ │
│                                                                                     │    │   Database      │ │
│                                                                                     │    │                 │ │
│                                                                                     │    │ Tables:         │ │
│                                                                                     │    │ • patients      │ │
│                                                                                     │    │ • clinical_     │ │
│                                                                                     │    │   sessions      │ │
│                                                                                     │    │ • clinical_     │ │
│                                                                                     │    │   forms         │ │
│                                                                                     │    │ • radiology_    │ │
│                                                                                     │    │   studies       │ │
│                                                                                     │    │ • ai_requests   │ │
│                                                                                     │    │ • stored_       │ │
│                                                                                     │    │   reports       │ │
│                                                                                     │    └────────────────┘ │
│                                                                                     └──────────────────────┘
│                                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Document Types and Synchronization

| Document Type | Source | Destination | Sync Behavior |
|--------------|--------|-------------|---------------|
| `clinicalPatient` | nurse_mobile | MySQL | Upsert on change |
| `clinicalSession` | nurse_mobile | MySQL | Upsert on change |
| `clinicalForm` | nurse_mobile | MySQL | Upsert on change |
| `aiLog` | nurse_mobile | MySQL | Append only |
| `clinicalReport` | Both | MySQL | Upsert on change |
| `radiologyStudy` | nurse_mobile | MySQL | Upsert on change |

### Sync Worker Implementation

```php
// healthbridge_core/app/Services/SyncService.php
class SyncService
{
    public function upsert(array $doc): void
    {
        $type = $doc['type'] ?? null;

        match ($type) {
            'clinicalPatient' => $this->syncPatient($doc),
            'clinicalSession' => $this->syncSession($doc),
            'clinicalForm' => $this->syncForm($doc),
            'aiLog' => $this->syncAiLog($doc),
            'clinicalReport' => $this->syncReport($doc),
            'radiologyStudy' => $this->syncRadiologyStudy($doc),
            default => $this->handleUnknown($doc),
        };
    }
}
```

### Conflict Resolution Strategy

The system employs "last write wins" based on timestamp comparison:

```php
// Conflict resolution in syncRadiologyStudy
if ($existingStudy && $incomingRev && $existingRev) {
    $incomingTime = isset($doc['updatedAt']) ? strtotime($doc['updatedAt']) : 0;
    $existingTime = strtotime($existingStudy->couch_updated_at);
    
    // If incoming is older, skip update
    if ($incomingTime < $existingTime) {
        Log::debug('SyncService: Skipping older revision');
        return;
    }
}
```

---

## MedGemma AI Integration

### AI Architecture Overview

MedGemma serves as the intelligent core of the HealthBridge platform, providing clinical decision support across both applications:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 MEDGEMMA AI INTEGRATION                                                │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                                         FRONTEND LAYER                                            │   │
│  │  ┌──────────────────────────────┐              ┌────────────────────────────────────────────┐  │   │
│  │  │      nurse_mobile             │              │           healthbridge_core               │  │   │
│  │  │                              │              │                                             │  │   │
│  │  │  • Stream responses          │              │  • Structured output schemas               │  │   │
│  │  │  • Real-time guidance       │              │  • Batch processing                       │  │   │
│  │  │  • Simple explanations      │              │  • Complex analysis                       │  │   │
│  │  │  • Form field validation    │              │  • Multi-modal inputs                     │  │   │
│  │  └──────────────┬───────────────┘              └────────────────────┬───────────────────┘  │   │
│  │                 │                                                │                          │   │
│  │                 └────────────────────────┬───────────────────────┘                          │   │
│  │                                          ▼                                                   │   │
│  └────────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                              │                                                        │
│                                              ▼                                                        │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                                    API GATEWAY LAYER                                            │   │
│  │  ┌──────────────────────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │                              Laravel API Endpoints                                         │  │   │
│  │  │                                                                                              │  │   │
│  │  │  POST /api/ai/medgemma          → Main AI orchestration endpoint                            │  │   │
│  │  │  POST /api/ai/stream           → Streaming AI responses                                    │  │   │
│  │  │  GET  /api/ai/health           → AI service health check                                    │  │   │
│  │  │  GET  /api/ai/tasks            → Available AI task types                                  │  │   │
│  │  │                                                                                              │  │   │
│  │  │  Middleware: ['auth', 'ai.guard', 'throttle:ai']                                          │  │   │
│  │  └──────────────────────────────────────────────────────────────────────────────────────────┘  │   │
│  │                                              │                                                   │   │
│  │                                              ▼                                                   │   │
│  └────────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                              │                                                       │
│                                              ▼                                                       │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                                    AI PROCESSING LAYER                                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │   │
│  │  │Rate Limiter  │─►│  Cache Check │─►│ Context Build│─►│Prompt Build │─►│ AI Provider  │    │   │
│  │  │              │  │              │  │              │  │              │  │              │    │   │
│  │  │• Per-user    │  │• Context-    │  │• Patient     │  │• Template   │  │• Ollama      │    │   │
│  │  │• Per-task    │  │  aware keys  │  │  data        │  │  selection  │  │• Structured │    │   │
│  │  │• Global      │  │• TTL per     │  │• Session     │  │• Variable   │  │  output      │    │   │
│  │  │              │  │  task        │  │  history     │  │  injection  │  │• Tools      │    │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └──────┬───────┘    │   │
│  │                                                                      │           │            │   │
│  │                                              ┌───────────────────────┘           │            │   │
│  │                                              ▼                                   ▼            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────┴───────┐    │   │
│  │  │Output Valid  │◄─│Error Handler│◄─│Monitor Log   │◄─│Cache Store  │◄─│ Ollama/Gemma │    │   │
│  │  │              │  │              │  │              │  │              │  │              │    │   │
│  │  │• Schema      │  │• Categorize │  │• Latency     │  │• Response   │  │• gemma3:4b   │    │   │
│  │  │• Safety      │  │• Recovery    │  │• Success     │  │  caching    │  │• localhost   │    │   │
│  │  │• PII Filter  │  │• Fallback    │  │• Usage       │  │              │  │  :11434      │    │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │   │
│  │                                                                                              │   │
│  └────────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### AI Use Cases by Application

#### nurse_mobile (Frontline Worker)

| Use Case | Description | Output |
|----------|-------------|--------|
| `EXPLAIN_TRIAGE` | Explain why a triage priority was assigned | Natural language explanation |
| `INCONSISTENCY_CHECK` | Flag potential errors in documentation | List of inconsistencies |
| `CARE_EDUCATION` | Prepare caregiver instructions | Educational content |
| `CLINICAL_HANDOVER` | Create SBAR summary | Structured handover |
| `NOTE_SUMMARY` | Generate encounter note | Brief clinical summary |
| `REACTIVE_GUIDANCE` | Real-time field-by-field guidance | Instant feedback |

#### healthbridge_core (Specialist)

| Use Case | Description | Output |
|----------|-------------|--------|
| `explain_triage` | Detailed triage explanation | Structured JSON |
| `review_treatment` | Treatment plan analysis | Recommendations |
| `imci_classification` | IMCI classification support | Classification + rationale |
| `radiology_analysis` | Medical imaging interpretation | Findings + critical flags |
| `ehr_summarization` | Clinical note processing | Concise summaries |
| `guideline_synthesis` | Evidence-based recommendations | Literature-backed guidance |

### Clinical Safety Guardrails

```typescript
// Safety configuration in nurse_mobile
const BLOCKED_PATTERNS = /prescribe|prescription|take dose|mg\/kg|mg per|ml\/kg|inject|iv drip|antibiotic prescription|diagnosis of|diagnosed with|treat with|give.*medicine|recommend.*drug/i;

const DANGEROUS_TERMS = /will die|certainly|definitely|guaranteed|no risk|100% sure/i;

function validateAIOutput(text: string): { allowed: boolean; reason?: string } {
  if (BLOCKED_PATTERNS.test(text)) {
    return { allowed: false, reason: 'Output contains prescription language' };
  }
  if (DANGEROUS_TERMS.test(text)) {
    return { allowed: false, reason: 'Output contains overly certain language' };
  }
  return { allowed: true };
}
```

### Rate Limiting Implementation

```php
// Multi-tier rate limiting in healthbridge_core
$rateLimitResult = $this->rateLimiter->attempt($task, $user->id, $userRole);

if (!$rateLimitResult['allowed']) {
    return response()->json([
        'success' => false,
        'error' => 'Rate limit exceeded',
        'retry_after' => $rateLimitResult['retry_after'],
    ], 429);
}
```

---

## Clinical Use Cases

### Primary Demonstrative Use Case: Pediatric Respiratory Illnesses

The platform uses pediatric respiratory illnesses as the initial demonstrative scenario, following WHO IMCI protocols for children 2 months to 5 years presenting with cough or difficulty breathing.

#### Assessment Workflow

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                 PEDIATRIC RESPIRATORY ASSESSMENT WORKFLOW                           │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  1. PATIENT REGISTRATION                                                             │
│     └─► Enter patient demographics (name, DOB, gender, weight)                       │
│                                                                                      │
│  2. HISTORY TAKING                                                                  │
│     ├─► Cough duration                                                              │
│     ├─► Difficulty breathing                                                         │
│     ├─► Fever history                                                                │
│     ├─► Ability to drink/feed                                                       │
│     └─► Previous treatments                                                         │
│                                                                                      │
│  3. DANGER SIGN ASSESSMENT                                                           │
│     ├─► Unable to drink/breastfeed                                                  │
│     ├─► Lethargic or unconscious                                                    │
│     ├─► Convulsions                                                                 │
│     ├─► Stridor in calm child                                                       │
│     └─► Severe malnutrition                                                         │
│                                                                                      │
│  4. PHYSICAL EXAMINATION                                                            │
│     ├─► Respiratory rate (count for 1 minute)                                        │
│     ├─► Chest indrawing                                                              │
│     ├─► Wheezing                                                                   │
│     ├─► Crackles                                                                    │
│     ├─► Oxygen saturation                                                           │
│     └─► Temperature                                                                 │
│                                                                                      │
│  5. AI-POWERD TRIAGE                                                                │
│     ├─► System calculates priority (RED/YELLOW/GREEN)                              │
│     ├─► MedGemma explains WHY                                                       │
│     ├─► Flags any inconsistencies                                                   │
│     └─► Suggests next steps                                                         │
│                                                                                      │
│  6. CLASSIFICATION & TREATMENT                                                       │
│     ├─► Very Severe Disease (RED) → Refer URGENTLY                                 │
│     ├─► Pneumonia (YELLOW) → Antibiotics + Home care                               │
│     ├─► Bronchiolitis (YELLOW) → Clear nose + Feeding support                      │
│     ├─► Cough/Cold (GREEN) → Home care + Follow-up                                  │
│     └─► No Pneumonia (GREEN) → No antibiotics                                       │
│                                                                                      │
│  7. REFERRAL (if needed)                                                            │
│     ├─► Create referral to healthbridge_core                                        │
│     └─► Include complete clinical summary                                           │
│                                                                                      │
│  8. RADIOLOGY ORDER (optional)                                                      │
│     ├─► Order chest X-ray if indicated                                              │
│     └─► Include clinical indication                                                 │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Extended Use Cases

While pediatric respiratory illnesses demonstrate the platform's capabilities, HealthBridge is designed to support a broad spectrum of conditions:

| Category | Protocols | Status |
|----------|-----------|--------|
| Pediatric Respiratory | WHO IMCI - Cough/Difficulty Breathing | Active |
| Pediatric Diarrhea | WHO IMCI - Diarrhea Assessment | Beta |
| Pediatric Fever | WHO IMCI - Fever Management | Development |
| Adult Respiratory | Pneumonia, COPD, Asthma | Planned |
| Adult Cardiovascular | Hypertension, Heart Failure | Planned |
| Maternal Health | Antenatal, Postnatal Care | Planned |
| Dermatology | Skin Conditions Assessment | Planned |
| Trauma | Injury Assessment & Management | Planned |

---

## Technical Implementation Details

### nurse_mobile Technical Stack

```json
{
  "framework": "Nuxt 4",
  "ui": "Vue 3 + TypeScript",
  "mobile": "Capacitor 5",
  "localDb": "PouchDB 8.x",
  "encryption": "AES-256-GCM",
  "state": "Pinia stores",
  "api": "Nitro server routes"
}
```

### healthbridge_core Technical Stack

```json
{
  "framework": "Laravel 11",
  "frontend": "Vue 3 + Inertia",
  "database": "MySQL 8",
  "sync": "CouchDB 3",
  "auth": "Laravel Sanctum",
  "ai": "Laravel AI SDK (Prism)",
  "queue": "Redis + Supervisor"
}
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | Mobile authentication |
| `/api/couchdb/*` | * | CouchDB proxy |
| `/api/ai/medgemma` | POST | AI request |
| `/api/ai/stream` | POST | Streaming AI |
| `/api/radiology/worklist` | GET | Radiologist queue |
| `/api/reports/generate` | POST | PDF generation |

---

## Security and Compliance

### Authentication Layers

| Layer | Mechanism | Protection |
|-------|-----------|------------|
| Transport | HTTPS/TLS | Network encryption |
| Application | Bearer Token | API authentication |
| Database | Basic Auth | CouchDB access |
| Data | AES-256 | Mobile data at rest |
| Access Control | Role-Based | Document-level permissions |

### User Context Injection

The Laravel proxy injects user context headers for CouchDB validation:

```php
// Headers injected by proxy
X-User-ID: 123
X-User-Role: nurse
X-User-Email: nurse@healthbridge.org
```

---

## Future Expansion

### Planned Features

1. **Telemedicine Integration**: Video consultations between frontline workers and specialists
2. **Offline Maps**: Location-aware referral routing
3. **Lab Integration**: Connect to point-of-care diagnostic devices
4. **Pharmacy Module**: Stock management and drug interaction checking
5. **Multi-language Support**: Expand beyond English and Shona
6. **Health Analytics**: Population health dashboards
7. **Wearables Integration**: Connect to Bluetooth health devices

### Scalability Considerations

- Horizontal scaling with Laravel Vapor
- CouchDB cluster for high availability
- Redis caching for performance
- CDN for static assets

---

## Conclusion

HealthBridge represents a comprehensive solution for healthcare delivery in resource-limited settings. By combining offline-first mobile technology with sophisticated AI capabilities and seamless data synchronization, the platform enables:

- **Frontline workers** to provide quality care with AI-guided clinical decision support
- **Specialists** to receive complete patient context and continue care efficiently
- **Healthcare systems** to maintain data continuity across the entire care continuum

The integration of MedGemma AI transforms the platform from a simple documentation tool into an intelligent clinical companion, empowering healthcare workers at all levels to deliver evidence-based care.

---

*Document Version: 1.0*  
*Last Updated: February 2026*  
*HealthBridge Platform - MedGemma Competition Entry*
