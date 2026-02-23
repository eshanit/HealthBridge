# UtanoBridge Documentation

Welcome to the UtanoBridge documentation. This folder contains comprehensive technical documentation organized to help developers understand the application's architecture and logic before reviewing the codebase.

## Documentation Structure

```
docs/
├── architecture/          # System architecture and design documents
│   ├── system-overview.md     # High-level system architecture
│   ├── data-synchronization.md # CouchDB/MySQL sync architecture
│   ├── ai-integration.md      # AI/ML integration patterns
│   └── clinical-workflow.md   # Clinical workflow and data models
│
├── api-reference/         # API documentation
│   └── overview.md            # REST API endpoints and patterns
│
├── deployment/            # Deployment guides
│   └── docker-deployment.md   # Docker deployment instructions
│
├── development/           # Development guidelines
│   └── guidelines.md         # Coding standards and practices
│
└── troubleshooting/       # Troubleshooting guides
    └── overview.md            # Common issues and solutions
```

## Quick Navigation

### For New Developers

1. Start with [System Overview](architecture/system-overview.md) to understand the two-tier architecture
2. Read [Clinical Workflow](architecture/clinical-workflow.md) to understand the clinical data flow
3. Review [Development Guidelines](development/guidelines.md) before making changes

### For DevOps/Deployment

1. [Docker Deployment Guide](deployment/docker-deployment.md) - Complete deployment instructions
2. [Data Synchronization](architecture/data-synchronization.md) - Sync architecture for production

### For Integration Work

1. [API Reference](api-reference/overview.md) - REST API endpoints
2. [AI Integration](architecture/ai-integration.md) - AI service integration patterns

### For Troubleshooting

1. [Troubleshooting Overview](troubleshooting/overview.md) - Common issues and solutions
2. [Data Synchronization](architecture/data-synchronization.md) - Sync-specific troubleshooting

## Architecture Summary

UtanoBridge is a **two-tier clinical system** designed for offline-first healthcare delivery:

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Nurse Mobile** | Nuxt 4 + PouchDB | Frontline data collection (offline-capable) |
| **UtanoBridge Core** | Laravel 11 + MySQL | Governance, reporting, AI integration |
| **CouchDB** | Apache CouchDB | Sync layer between mobile and core |
| **AI Services** | Ollama + MedGemma | Clinical decision support |

### Key Data Flow

```
Mobile App (PouchDB) ←→ CouchDB ←→ Laravel (MySQL)
                                    ↓
                              AI Services (Ollama)
```

## Patient Identification

UtanoBridge uses **Clinical Patient Tokens (CPT)** - 4-character alphanumeric identifiers generated from patient demographics using SHA-256 hashing. This enables:

- Offline patient identification
- Privacy-preserving record linkage
- Duplicate detection across devices

## Clinical Workflow Stages

1. **Registration** - Patient check-in and identification
2. **Triage** - Priority assignment (Red/Yellow/Green)
3. **Assessment** - Clinical examination and AI-assisted diagnosis
4. **Treatment** - Intervention and medication
5. **Discharge/Referral** - Outcome and follow-up

## Contributing

When adding new documentation:

1. Place files in the appropriate subfolder
2. Use lowercase kebab-case naming (e.g., `my-topic.md`)
3. Update this README with links to new documents
4. Cross-reference related documents where appropriate

## Document Standards

- **Format**: Markdown (.md)
- **Naming**: lowercase-kebab-case.md
- **Headers**: Use ATX-style (#) headers
- **Code blocks**: Specify language for syntax highlighting
- **Links**: Use relative paths for internal links
