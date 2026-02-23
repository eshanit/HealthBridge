# UtanoBridge System Architecture Overview

**Version:** 1.0  
**Last Updated:** February 2026  
**Status:** Authoritative Reference

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Platform Vision](#2-platform-vision)
3. [System Architecture](#3-system-architecture)
4. [Technology Stack](#4-technology-stack)
5. [User Roles & Access Control](#5-user-roles--access-control)
6. [Development Phases](#6-development-phases)
7. [Related Documentation](#7-related-documentation)

---

## 1. Executive Summary

UtanoBridge is a **two-tier clinical system** designed for offline-first operation in resource-limited settings. The platform provides clinical decision support, AI-assisted triage explainability, and comprehensive patient management across mobile and web interfaces.

### Key Capabilities

- **Offline-First Design**: Full functionality without network connectivity
- **Real-Time Synchronization**: Near real-time data sync (~4 seconds) between mobile and web tiers
- **AI Integration**: Local MedGemma model for clinical decision support
- **WHO IMCI Compliance**: Built-in WHO Integrated Management of Childhood Illness protocols
- **Role-Based Access**: Granular permissions for nurses, doctors, specialists, and administrators

---

## 2. Platform Vision

### Architecture Layers

| Layer | Technology | Users | Purpose |
|-------|------------|-------|---------|
| **Mobile App** | Nuxt 4 + PouchDB + Capacitor | Nurses, VHWs, Frontline Staff | Data capture, IMCI workflows, AI explainability |
| **Web App** | Laravel 11 + Inertia + MySQL | Senior Nurses, Doctors, Specialists, Managers | Oversight, audit, governance, quality improvement |

### Key Integration Goals

1. **Near Real-Time Data Mirror** - MySQL updated within ~4 seconds of mobile sync
2. **Unified AI Gateway** - MedGemma (Ollama) accessible from both tiers with role-based policies
3. **Closed Learning Loop** - Clinical feedback improves rules and prompts
4. **Complete Audit Trail** - Every clinical action traceable across systems

---

## 3. System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HEALTHBRIDGE PLATFORM                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐                    ┌─────────────────────────────┐│
│  │   MOBILE TIER       │                    │      WEB TIER               ││
│  │   (Nuxt 4 SPA)      │                    │   (Laravel 11 + Inertia)    ││
│  ├─────────────────────┤                    ├─────────────────────────────┤│
│  │ • Patient Reg       │                    │ • Clinical Dashboards       ││
│  │ • Clinical Forms    │                    │ • Case Review               ││
│  │ • Triage (IMCI)     │                    │ • Referral Management       ││
│  │ • Treatment Plans   │                    │ • AI Safety Console         ││
│  │ • Offline AI        │                    │ • Prompt Registry           ││
│  └──────────┬──────────┘                    └──────────────┬──────────────┘│
│             │                                              │               │
│             │ PouchDB                                      │ MySQL         │
│             │ (Encrypted)                                  │ (Operational) │
│             ▼                                              ▼               │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         SYNC LAYER                                   │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │                                                                      │  │
│  │   PouchDB ◄──────────────► CouchDB ◄──────────────► Sync Worker     │  │
│  │   (Mobile)     bi-dir       (Source     continuous    (Laravel      │  │
│  │                sync         of Truth)   _changes      Daemon)       │  │
│  │                             │                        │               │  │
│  └─────────────────────────────┼────────────────────────┼───────────────┘  │
│                                │                        │                   │
│                                │                        ▼                   │
│                                │              ┌─────────────────┐           │
│                                │              │  MySQL Mirror   │           │
│                                │              │  (Denormalized) │           │
│                                │              └────────┬────────┘           │
│                                │                       │                    │
│                                ▼                       ▼                    │
│                       ┌─────────────────────────────────────────┐          │
│                       │            AI GATEWAY                   │          │
│                       │         (Laravel + Ollama)              │          │
│                       │                                         │          │
│                       │  • MedGemma 27B/4B                      │          │
│                       │  • Role-based prompts                   │          │
│                       │  • Safety enforcement                   │          │
│                       │  • Full audit logging                   │          │
│                       └─────────────────────────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

| Flow | Source | Destination | Mechanism | Latency |
|------|--------|-------------|-----------|---------|
| Clinical Data Capture | Mobile PouchDB | CouchDB | PouchDB Sync | Instant (online) |
| Data Mirroring | CouchDB | MySQL | Laravel Sync Worker | ~4 seconds |
| AI Requests | Both Tiers | Ollama | Laravel AI Gateway | Variable |
| Rule Updates | Web App | Mobile | CouchDB Sync Doc | Next sync |

---

## 4. Technology Stack

### Mobile Application (Nurse Mobile)

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | Nuxt 4 | Vue.js meta-framework |
| UI Library | NuxtUI v4 | Component library |
| Local Database | PouchDB | Offline-first storage |
| Encryption | AES-256-GCM | Data at rest encryption |
| Validation | Zod | Schema validation |
| State Management | Pinia | Application state |
| Mobile Bridge | Capacitor | Native device access |

### Web Application (UtanoBridge Core)

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | Laravel 11 | PHP backend framework |
| Frontend | Inertia.js + Vue 3 | SPA without API |
| Database | MySQL 8.0 | Relational data store |
| Sync Database | CouchDB 3.x | Document store |
| AI Engine | Ollama + MedGemma | Local LLM inference |
| Authentication | Laravel Fortify | Session-based auth |
| Authorization | Spatie Permission | Role-based access |

### AI Infrastructure

| Component | Technology | Purpose |
|-----------|------------|---------|
| Inference Engine | Ollama | Local LLM serving |
| Primary Model | MedGemma 4B/27B | Clinical language model |
| SDK | Laravel AI SDK | AI integration layer |
| Safety | Custom Middleware | Output validation |

---

## 5. User Roles & Access Control

### Role Hierarchy

| Role | Description | Access Level |
|------|-------------|--------------|
| `nurse` | Frontline health workers | Mobile app, patient registration, assessments |
| `senior-nurse` | Experienced nurses | All nurse access + case review |
| `doctor` | General practitioners | Web dashboard, referrals, prescriptions |
| `radiologist` | Imaging specialists | Radiology dashboard, study interpretation |
| `dermatologist` | Skin condition specialists | Specialty referrals |
| `manager` | Clinical managers | Dashboards, quality metrics, AI monitoring |
| `admin` | System administrators | Full system access, user management |

### Role-Based AI Task Permissions

| Role | Allowed AI Tasks |
|------|------------------|
| `nurse` | `explain_triage`, `caregiver_summary`, `symptom_checklist` |
| `doctor` | All nurse tasks + `specialist_review`, `red_case_analysis`, `treatment_review` |
| `radiologist` | `imaging_interpretation`, `report_drafting` |
| `manager` | `quality_metrics`, `audit_summary` |
| `admin` | All tasks |

---

## 6. Development Phases

### Phase 0: Foundation (Completed)
- Laravel project setup with authentication
- Role-based access control implementation
- CouchDB → MySQL sync worker
- Database migrations for core tables

### Phase 1: AI Gateway (Completed)
- Laravel AI SDK integration
- Ollama driver configuration
- Agent architecture implementation
- Streaming and structured output support

### Phase 2: Dashboards & Case Review (Completed)
- Clinical quality dashboard
- AI safety console
- Case review interface
- Referral management

### Phase 3: Referral Workflow (Completed)
- RED-case automatic escalation
- Specialist workbench
- Real-time notifications
- Workflow state machine

### Phase 4: Governance & Learning Loop (In Progress)
- Prompt version management
- Rule suggestion system
- Learning dashboard
- Feedback integration

---

## 7. Related Documentation

### Architecture Documentation
- [Data Synchronization Architecture](./data-synchronization.md)
- [Clinical Workflow Architecture](./clinical-workflow.md)
- [AI Integration Architecture](./ai-architecture.md)

### Implementation Guides
- [Deployment Guide](../deployment/docker-deployment.md)
- [API Reference](../api-reference/overview.md)
- [Development Guidelines](../development/architecture-rules.md)

### Troubleshooting
- [Sync Troubleshooting](../troubleshooting/sync-troubleshooting.md)
- [WebSocket Troubleshooting](../troubleshooting/websocket-troubleshooting.md)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 2026 | UtanoBridge Team | Initial consolidated documentation |
