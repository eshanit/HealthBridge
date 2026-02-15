# AI Policy - HealthBridge Clinical Support Layer

**Version:** 1.0  
**Effective Date:** February 2026  
**Status:** Policy Document

---

## 1. Purpose

This policy governs the use of AI-powered clinical support features in the HealthBridge Nurse Mobile Application. The AI layer provides explainability, education, and summarization capabilities to assist healthcare workers in delivering quality care.

---

## 2. Core Principles

### 2.1 AI is Advisory Only

The AI system is designed to **support, not replace** clinical judgment. All AI outputs are advisory in nature and must be validated by qualified healthcare professionals before acting on them.

### 2.2 Safety First

The AI system is built with multiple safety layers to prevent harmful outputs:
- System prompts enforce strict boundaries
- Output filters block prescription language
- Context validators ensure clinical data is present
- Scope guards prevent out-of-scope requests

### 2.3 Transparency

All AI interactions are logged for audit purposes. Users can see when AI has been used and can verify the source of AI-generated content.

---

## 3. Allowed AI Use Cases

| Use Case | Description | Example |
|----------|-------------|---------|
| **Explain Triage** | Explain why a triage result occurred | "Why is this patient classified as RED?" |
| **Care Education** | Provide educational information for caregivers | "What should I watch for at home?" |
| **Clinical Handover** | Summarize case for doctor handover | "Generate a handover summary" |
| **Note Summary** | Summarize session for records | "Summarize this encounter" |

---

## 4. Prohibited AI Use Cases

The AI system **MUST NOT** be used for:

- ❌ **Diagnosis**: "What disease does this patient have?"
- ❌ **Prescription**: "What medication should I prescribe?"
- ❌ **Treatment Decisions**: "Should I ignore the referral?"
- ❌ **Dosage Recommendations**: "What dose should I give?"
- ❌ **Overriding Rules**: "Can I skip the triage classification?"
- ❌ **Medical Advice**: "What should I do for this condition?"

---

## 5. Safety Framework

### 5.1 Multi-Layer Safety Architecture

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Context Validator                     │
│  - Verifies session exists                     │
│  - Checks assessment is complete              │
│  - Confirms triage result exists               │
├─────────────────────────────────────────────────┤
│  Layer 2: Scope Guard                          │
│  - Blocks diagnostic questions                │
│  - Blocks treatment recommendations           │
├─────────────────────────────────────────────────┤
│  Layer 3: Guideline Binding                    │
│  - Uses only WHO IMCI rules                   │
│  - No hallucinated data                       │
├─────────────────────────────────────────────────┤
│  Layer 4: Risk Escalation                      │
│  - RED = Emergency banner                     │
│  - Danger signs = Immediate referral          │
├─────────────────────────────────────────────────┤
│  Layer 5: Output Filter                        │
│  - Blocks prescription language               │
│  - Blocks dosage recommendations              │
├─────────────────────────────────────────────────┤
│  Layer 6: UI Safety                            │
│  - Marked as "Clinical Support"               │
│  - Requires clinical confirmation             │
└─────────────────────────────────────────────────┘
```

### 5.2 Response Templates

When AI cannot help:

> "I cannot make clinical decisions or recommendations. I can only explain clinical findings and provide educational information. Please consult clinical protocols for treatment decisions."

---

## 6. Human-in-the-Loop Requirements

### 6.1 Mandatory Human Review

All AI outputs must be reviewed by a qualified healthcare worker before:
- Sharing with patients or caregivers
- Acting upon the information
- Including in clinical documentation

### 6.2 Confirmation for High-Risk Cases

For RED classification cases, users must confirm:
- [ ] "I have reviewed the AI output"
- [ ] "I understand the clinical implications"
- [ ] "I will follow escalation protocols"

---

## 7. Audit and Logging

### 7.1 What is Logged

Every AI interaction is logged with:
- Timestamp
- Session ID
- Use case (explain/handover/education/summary)
- Input summary (no PHI)
- Output length
- Duration
- Safety blocks (if any)

### 7.2 Data Retention

AI audit logs are retained for:
- **Active logs**: 90 days
- **Archived logs**: 7 years (compliance requirement)

### 7.3 Access Control

AI audit logs can be accessed by:
- System administrators
- Clinical governance teams
- Quality assurance personnel

---

## 8. Model and Infrastructure

### 8.1 AI Model

- **Primary Model**: MedGemma 4b
- **Provider**: Ollama (local deployment)
- **Hosting**: Hospital server/workstation (no cloud)

### 8.2 Data Privacy

- **No cloud processing**: All AI runs locally
- **No data transmission**: Patient data never leaves the device
- **No model training**: Data is not used for training

### 8.3 Fallback

If AI is unavailable:
- System continues without AI features
- Explainability engine still works (rule-based)
- Clear messaging to users: "AI service temporarily unavailable"

---

## 9. Admin Controls

### 9.1 Kill Switch

Administrators can:
- **Disable AI entirely**: Set system to "AI Disabled" mode
- **Restrict features**: Enable only explanations
- **Monitor usage**: View AI interaction statistics

### 9.2 Configuration Options

| Setting | Options | Default |
|---------|---------|---------|
| AI Enabled | true/false | true |
| Allow Explanations | true/false | true |
| Allow Education | true/false | true |
| Allow Handover | true/false | true |
| Allow Summary | true/false | true |

---

## 10. Clinical Governance

### 10.1 Review Process

- Monthly review of AI interaction statistics
- Quarterly safety audits
- Annual policy review

### 10.2 Incident Reporting

Any harmful or incorrect AI output must be reported:
1. Document the incident
2. Contact system administrator
3. Log in incident management system

### 10.3 Continuous Improvement

- Monitor for edge cases
- Update prompts based on feedback
- Review and refine safety filters

---

## 11. User Training

All users must complete training on:
- AI capabilities and limitations
- Safety protocols
- Proper use of explainability features
- Recognizing when AI should not be used

---

## 12. Compliance

This policy is designed to meet:
- **Data Protection**: Local processing, no cloud storage
- **Clinical Governance**: Full audit trail
- **Regulatory Requirements**: Human-in-the-loop, documentation
- **Clinical Safety**: Multiple safety layers

---

## 13. Emergency Procedures

### 13.1 If AI Provides Harmful Output

1. Do NOT act on the harmful output
2. Report immediately to supervisor
3. Document the incident
4. System administrator will investigate

### 13.2 If AI System Fails

1. Continue clinical work without AI
2. Use rule-based explainability
3. Contact IT support
4. Document the incident

---

## 14. Policy Review

This policy is reviewed:
- **Annually**: Full policy review
- **After incidents**: Incident-triggered review
- **As needed**: Based on regulatory changes

---

## 15. Acknowledgment

By using the HealthBridge AI features, users acknowledge:
1. AI is advisory only
2. Clinical judgment is required
3. All AI outputs must be verified
4. Audit logs are maintained
5. This policy must be followed

---

**Document Version:** 1.0  
**Last Updated:** February 2026  
**Next Review:** February 2027
