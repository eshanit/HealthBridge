# Secure Database Workflow Documentation

This document describes the user workflows and system architecture for the HealthBridge secure database system, including encryption, decryption, error handling, recovery procedures, and degraded mode operations.

## Table of Contents

1. [User Login Workflow](#user-login-workflow)
2. [Normal Operation Flow](#normal-operation-flow)
3. [Problem Detection Flow](#problem-detection-flow)
4. [Emergency Recovery Flow](#emergency-recovery-flow)
5. [Degraded Mode Flow](#degraded-mode-flow)
6. [Key Management Workflow](#key-management-workflow)
7. [Architecture Overview](#architecture-overview)
8. [File Structure](#file-structure)

---

## User Login Workflow

### Standard PIN Login

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER LOGIN WORKFLOW                          │
└─────────────────────────────────────────────────────────────────┘

1. USER OPENS APP
   │
   ▼
┌─────────────────────┐
│   PIN Entry Screen  │◄─── User sees 4-digit PIN entry
└─────────────────────┘
   │
   │ User enters 4-digit PIN
   ▼
┌──────────────────────────────────────────────────────────────┐
│ useAuth.verifyPin(pin)                                        │
│   ├─ authStore.verifyPin()         ──► Verify PIN in store   │
│   └─ useKeyManager.initializeFromPin() ─► Derive encryption  │
│                                                              │
│   Flow:                                                      │
│   1. Check lockout status                                    │
│   2. Verify PIN against stored hash                          │
│   3. Derive HMAC-SHA256 key from PIN + salt                  │
│   4. Initialize session key (in-memory only)                 │
│   5. Log session_start event                                  │
└──────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────┐
│  Session Key Created │◄─── Key stored in memory only
└─────────────────────┘
   │
   ▼
┌─────────────────────────────────────────┐
│ initializeSecureDb(encryptionKey)       │
│   ├─ Create PouchDB instance             │
│   ├─ Log encryption_start event          │
│   └─ Migrate legacy data if needed       │
└─────────────────────────────────────────┘
   │
   ▼
┌─────────────────────┐
│ navigateTo('/dashboard')
└─────────────────────┘
   │
   ▼
┌─────────────────────────────────────────┐
│           NORMAL OPERATION               │
│   User can now access encrypted data    │
└─────────────────────────────────────────┘
```

### Code Flow

```typescript
// composables/useAuth.ts
async function verifyPin(pin: string): Promise<boolean> {
  // 1. Check if locked out
  if (isLockedOut.value) {
    errorMessage.value = `Too many failed attempts. Try again in ${minutes} minutes.`;
    return false;
  }

  // 2. Verify PIN with auth store
  const authSuccess = await authStore.verifyPin(pin);
  if (!authSuccess) {
    errorMessage.value = `Incorrect PIN. ${remaining} attempts remaining.`;
    return false;
  }

  // 3. Initialize encryption key from PIN
  const keyResult = await initializeFromPin(pin);
  if (!keyResult.valid) {
    errorMessage.value = keyResult.error || 'Failed to initialize encryption key';
    logAuditEvent('security_exception', 'error', 'useAuth', { 
      operation: 'pin_verification_key_init', 
      error: keyResult.error 
    }, 'failure');
    return false;
  }

  // 4. Log successful session start
  logAuditEvent('session_start', 'info', 'useAuth', { 
    keyId: keyResult.keyId, 
    method: 'pin' 
  }, 'success');

  return true;
}
```

---

## Normal Operation Flow

### Data Access Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    NORMAL OPERATION FLOW                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│          User Action                    │
│   (e.g., View Patient, Save Record)     │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ composable/store calls secureDb API     │
│   ├─ secureGet(id, key)                 │
│   ├─ securePut(doc, key)                │
│   └─ secureAllDocs(key)                 │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ getSessionKey() from useKeyManager      │
│   └─ Returns in-memory Uint8Array       │
│      (never stored in localStorage)     │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ encryptData() / decryptData()           │
│   ├─ Import key as AES-GCM              │
│   ├─ Generate random IV (12 bytes)      │
│   ├─ Encrypt/decrypt with AES-256-GCM   │
│   └─ Return ciphertext + IV + auth tag  │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ logEncryption() / logDecryption()       │
│   ├─ Log audit event with correlation   │
│   ├─ Include document ID and timestamp  │
│   └─ Store in localStorage (max 500)    │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│         Return data to UI               │
│   User sees decrypted data              │
└─────────────────────────────────────────┘
```

### Audit Logging

All encryption operations are logged for compliance and forensics:

```typescript
// services/auditLogger.ts
logEncryption(documentId: string, operation: 'encrypt' | 'decrypt', success: boolean, details?: Record<string, unknown>) {
  return logAuditEvent(
    operation === 'encrypt' ? 'encryption_success' : 'decryption_success',
    success ? 'info' : 'error',
    'secureDb',
    { documentId, ...details },
    success ? 'success' : 'failure'
  );
}
```

---

## Problem Detection Flow

### Decryption Failure Handling

```
┌─────────────────────────────────────────────────────────────────┐
│                   PROBLEM DETECTION FLOW                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ secureGet(id, key)                      │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ decryptData(payload, key)               │
└─────────────────────────────────────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
         ▼                   ▼
   Success               FAILURE
   (return data)         OperationError (code: 0)
                            │
                            ▼
┌─────────────────────────────────────────┐
│ trackCorruptedDocument()                │
│   ├─ Check for duplicate                │
│   ├─ Add to corruptedDocs tracking      │
│   ├─ Log document_corruption_detected   │
│   └─ Keep only last 100 entries         │
└─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────┐
│ Return null instead of throwing         │
│ (graceful degradation)                  │
└─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────┐
│ User continues using app                │
│ (unaware of corruption)                 │
└─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────┐
│ User navigates to /settings             │
│   └─ Sees DbHealthDashboard             │
│       ├─ Health Score decreased         │
│       ├─ Corrupted count > 0            │
│       └─ Recent errors shown            │
└─────────────────────────────────────────┘
```

### Automatic Corruption Tracking

```typescript
// services/secureDb.ts
async function trackCorruptedDocument(doc: Omit<CorruptedDocument, 'timestamp'>): Promise<void> {
  const existing = JSON.parse(localStorage.getItem(CORRUPTED_DOCS_KEY) || '[]');
  
  // Check for duplicate
  const isDuplicate = existing.some((d: CorruptedDocument) => d.id === doc.id);
  if (isDuplicate) {
    console.log(`[SecureDB] Document ${doc.id} already tracked, skipping...`);
    return;
  }
  
  // Add timestamp
  const newDoc = { ...doc, timestamp: Date.now() };
  existing.push(newDoc);
  
  // Keep only last 100 corrupted docs
  if (existing.length > 100) {
    existing.splice(0, existing.length - 100);
  }
  
  localStorage.setItem(CORRUPTED_DOCS_KEY, JSON.stringify(existing));
  
  // Log corruption event
  logCorruption(doc.id, doc.error, doc.recoverable, false);
}
```

---

## Emergency Recovery Flow

### Recovery Options

```
┌─────────────────────────────────────────────────────────────────┐
│                   EMERGENCY RECOVERY FLOW                       │
└─────────────────────────────────────────────────────────────────┘

User navigates to /settings
         │
         ▼
┌─────────────────────────────────────────┐
│ Click "Open Emergency Recovery"         │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│     EMERGENCY RECOVERY MODAL            │
│  ┌───────────────────────────────────┐  │
│  │  Database Status: CRITICAL        │  │
│  │  Corrupted Documents: 5           │  │
│  └───────────────────────────────────┘  │
│                                           │
│  Available Actions:                       │
│  ┌─────────────────┐ ┌─────────────────┐ │
│  │ 🔍 Run          │ │ 💾 Export       │ │
│  │   Diagnostics   │ │   Data Backup   │ │
│  └─────────────────┘ └─────────────────┘ │
│  ┌─────────────────┐ ┌─────────────────┐ │
│  │ 🗑️ Reset        │ │ 🔄 Retry        │ │
│  │   Database      │ │   Decryption    │ │
│  └─────────────────┘ └─────────────────┘ │
└─────────────────────────────────────────┘
         │
         ├─► Run Diagnostics
         │   └─► runFullDiagnostic()
         │       └─► Returns healthScore, issues list
         │
         ├─► Export Data
         │   └─► downloadJsonExport()
         │       └─► logDataExport('json', count)
         │       └─► Download JSON file
         │
         ├─► Reset Database
         │   └─► confirmReset()
         │       ├─► User types "DELETE" to confirm
         │       ├─► closeSecureDb()
         │       ├─► deleteSecureDb()
         │       ├─► clearCorruptedDocuments()
         │       └─► logAuditEvent('database_reset')
         │
         └─► Retry Decryption
             └─► retryDecryption()
                 └─► Attempt to decrypt corrupted docs again
```

### Diagnostic Results Display

```typescript
interface DiagnosticResult {
  healthScore: number;       // 0-100
  issues: Array<{
    severity: 'warning' | 'error' | 'info';
    message: string;
  }>;
  corruptedDocs: CorruptedDocument[];
}
```

---

## Degraded Mode Flow

### Enabling Degraded Mode

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEGRADED MODE FLOW                           │
└─────────────────────────────────────────────────────────────────┘

         ┌─────────────────────────────────────────┐
         │         SCENARIOS                        │
         └─────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
   Sync Fails      Decryption       User manually
   Repeatedly      Errors           enables from
                     ↑              settings
         │                │                │
         │                │                │
         └────────────────┼────────────────┘
                          │
                          ▼
               ┌───────────────────────┐
               │ Settings → Enable     │
               │   Degraded Mode       │
               └───────────────────────┘
                          │
                          ▼
               ┌───────────────────────┐
               │ Confirmation Modal    │
               │ Explains:             │
               │ - New data unencrypted│
               │ - Recovery only mode  │
               │ - Can exit anytime    │
               └───────────────────────┘
                          │
                          ▼
               ┌───────────────────────┐
               │ User confirms         │
               │ enableDegradedMode()  │
               └───────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────┐
         │  localStorage.setItem(          │
         │    'healthbridge_degraded_mode',│
         │    'true'                       │
         │  )                              │
         └─────────────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────┐
         │ logDegradedMode(true, reason)   │
         │                                 │
         └─────────────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────┐
         │     APP IN DEGRADED MODE        │
         │                                 │
         │  - New data stored unencrypted  │
         │  - Only recovery operations     │
         │  - Full encrypted access        │
         │    still available              │
         │                                 │
         └─────────────────────────────────┘
                          │
                          ▼
               ┌───────────────────────┐
               │ Settings → Exit       │
               │   Degraded Mode       │
               └───────────────────────┘
                          │
                          ▼
               ┌───────────────────────┐
               │ disableDegradedMode() │
               │   └─► Clear localStorage │
               └───────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────┐
         │     RETURN TO NORMAL MODE       │
         └─────────────────────────────────┘
```

### Degraded Mode API

```typescript
// plugins/appInit.client.ts
// Functions are provided via defineNuxtPlugin() - DO NOT import directly

// composables/useAppInit.ts
// Proper usage - import the composable instead:

import { useAppInit } from '~/composables/useAppInit';

const { isDegradedMode, enableDegradedMode, disableDegradedMode } = useAppInit();

// Check if degraded mode is active
isDegradedMode.value; // computed boolean

// Enable degraded mode with logging
enableDegradedMode('User requested degraded mode');

// Disable degraded mode
disableDegradedMode();
```

> **Important:** The plugin file `appInit.client.ts` should NOT be imported directly.
> Use the `useAppInit()` composable instead for type-safe access.

---

## Key Management Workflow

### Key Derivation (HMAC-SHA256)

```
┌─────────────────────────────────────────────────────────────────┐
│                   KEY DERIVATION WORKFLOW                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ User enters PIN                         │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ deriveKeyFromPinHMAC(pin, salt)         │
│                                          │
│ 1. Encode PIN as UTF-8                  │
│ 2. Import as HMAC-SHA256 key material   │
│ 3. Sign salt with HMAC                  │
│ 4. Generate unique keyId                │
│ 5. Return { key: Uint8Array, keyId }    │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ Store in session (in-memory only)       │
│                                          │
│ sessionKeyState.value = {               │
│   key: new Uint8Array(...),             │
│   keyId: 'abc123...',                   │
│   createdAt: Date.now(),                │
│   deviceId: 'device_xyz'                │
│ }                                       │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ NEVER store key in localStorage         │
│ (security requirement)                  │
└─────────────────────────────────────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
         ▼                   ▼
   Normal            Key Expired
   Operation         (24 hours)
         │                   │
         └───────────────────┘
                          │
                          ▼
               ┌───────────────────────┐
               │ validateKeyForOp()    │
               │   ├─ Check expiration │
               │   └─ Check degraded   │
               └───────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
   Valid           Expired           Degraded
         │                │                │
         └────────────────┴────────────────┘
                          │
                          ▼
               ┌───────────────────────┐
               │ User must re-auth     │
               │ OR use degraded mode  │
               └───────────────────────┘
```

### Key Rotation

```typescript
async function rotateKey(): Promise<KeyRotationResult> {
  const previousKeyId = sessionKeyState.value.keyId;
  
  // Generate new salt
  const newSalt = new Uint8Array(32);
  crypto.getRandomValues(newSalt);
  localStorage.setItem('healthbridge_key_salt', JSON.stringify(Array.from(newSalt)));
  
  // Derive new key from existing key material
  if (keyMaterial.value) {
    const newKeyMaterial = await crypto.subtle.importKey(
      'raw',
      keyMaterial.value,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const derivedKeyBuffer = await crypto.subtle.sign(
      'HMAC',
      newKeyMaterial,
      newSalt as any
    );
    
    const newKey = new Uint8Array(derivedKeyBuffer);
    const newKeyId = generateSecureKeyId();
    
    sessionKeyState.value = {
      key: newKey,
      keyId: newKeyId,
      createdAt: Date.now(),
      deviceId: sessionKeyState.value.deviceId
    };
    
    logKeyManagement('key_rotation', true, {
      newKeyId,
      previousKeyId,
      deviceId: sessionKeyState.value.deviceId
    });
    
    return { success: true, previousKeyId, newKeyId };
  }
  
  return { success: false, previousKeyId, error: 'No key material available' };
}
```

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HEALTHBRIDGE APP                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      VUE LAYER                               │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐               │    │
│  │  │  Pages    │  │ Components│  │Composables│               │    │
│  │  │ /settings │  │Dashboard  │  │useKeyMgr  │               │    │
│  │  │ /dashboard│  │Recovery   │  │useDbDiag  │               │    │
│  │  └───────────┘  └───────────┘  └───────────┘               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      STORES LAYER                            │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────────┐        │    │
│  │  │authStore  │  │security   │  │  dashboardStore   │        │    │
│  │  │           │  │Store      │  │                   │        │    │
│  │  └───────────┘  └───────────┘  └───────────────────┘        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    SERVICES LAYER                            │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────────┐        │    │
│  │  │secureDb   │  │auditLogger│  │  encryptionUtils  │        │    │
│  │  │           │  │           │  │                   │        │    │
│  │  └───────────┘  └───────────┘  └───────────────────┘        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    STORAGE LAYER                             │    │
│  │  ┌───────────────────┐  ┌───────────────────┐               │    │
│  │  │ IndexedDB         │  │ localStorage      │               │    │
│  │  │ (PouchDB adapter) │  │ (audit logs,      │               │    │
│  │  │                   │  │  corrupted docs)  │               │    │
│  │  └───────────────────┘  └───────────────────┘               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

```
User Action
    │
    ▼
Page/Component
    │
    ▼
Composable (useKeyManager, useAuth)
    │
    ▼
Store (securityStore, authStore)
    │
    ▼
Service (secureDb, auditLogger)
    │
    ▼
Encryption (AES-256-GCM)
    │
    ▼
PouchDB → IndexedDB
    │
    ▼
Audit Log → localStorage
```

---

## File Structure

```
app/
├── components/
│   ├── DbHealthDashboard.vue      # Health monitoring UI
│   └── EmergencyRecovery.vue      # Recovery modal UI
├── composables/
│   ├── useAuth.ts                 # Authentication with key integration
│   ├── useKeyManager.ts           # Key derivation & session management
│   └── useDbDiagnostics.ts        # Diagnostic functions
├── pages/
│   ├── settings.vue               # Settings page with full UI
│   └── dashboard.vue              # Main dashboard
├── plugins/
│   └── appInit.client.ts          # Client-side app initialization
├── composables/
│   └── useAppInit.ts              # Composable for plugin access
├── services/
│   ├── secureDb.ts                # Encrypted CRUD operations
│   ├── auditLogger.ts             # Audit logging
│   └── encryptionUtils.ts         # AES-256-GCM encryption
└── stores/
    ├── security.ts                # Security store with logging
    └── auth.ts                    # Authentication store
```

---

## Quick Reference

### Access Points

| Page | URL | Purpose |
|------|-----|---------|
| Settings | `/settings` | Database health, recovery, key management |
| Dashboard | `/dashboard` | Main app dashboard |

### Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `initializeFromPin()` | useKeyManager | Derive key from PIN |
| `getSessionKey()` | useKeyManager | Get current key |
| `rotateKey()` | useKeyManager | Rotate encryption key |
| `runFullDiagnostic()` | useDbDiagnostics | Scan database health |
| `enableDegradedMode()` | useAppInit | Enable degraded mode |
| `disableDegradedMode()` | useAppInit | Exit degraded mode |
| `isDegradedMode` | useAppInit | Computed degraded mode status |

### Storage Keys

| Key | Purpose |
|-----|---------|
| `healthbridge_corrupted_docs` | Tracked corrupted documents |
| `healthbridge_audit_log` | Audit events (max 500) |
| `healthbridge_key_salt` | Key derivation salt |
| `healthbridge_device_id` | Device identifier |
| `healthbridge_degraded_mode` | Degraded mode flag |
| `healthbridge_degraded_mode_reason` | Degraded mode reason |

---

## Document Information

- **Created**: February 2026
- **Based on**: SECURE_DB_FIX_GUIDE.md
- **Last Updated**: February 2026
- **Author**: OpenCode AI Assistant
