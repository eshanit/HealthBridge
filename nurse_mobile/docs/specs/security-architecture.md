# Security Architecture Rules

**Applies to:** HealthBridge Nurse Mobile App
**Status:** Authoritative
**Last Updated:** 2024-01-31

---

## Zero-Trust Encrypted Database at Rest

This document establishes the security architecture rules for data persistence in the HealthBridge mobile application.

---

## Core Security Principles

### 1. Encryption Key Management

| Rule | Description |
|------|-------------|
| **K1** | Encryption keys must NEVER be stored on disk in plaintext |
| **K2** | Keys must live ONLY in memory (RAM) during app session |
| **K3** | Keys must be cleared from memory when app locks |
| **K4** | Keys must be derived from user PIN using PBKDF2 |

### 2. Database Storage

| Rule | Description |
|------|-------------|
| **D1** | All data MUST be encrypted at rest using AES-256-GCM |
| **D2** | Encryption is handled by secureDb service using AES-256-GCM. This is the ONLY encryption layer in the application. |
| **D3** | All data persistence MUST use secureDb service. No direct PouchDB access outside secureDb. |
| **D4** | Internal encrypted wrapper fields are used by secureDb. Application code sees documents transparently. |


### 3. Authentication Flow

```
User PIN → PBKDF2 (100k iterations, SHA-256)
           ↓
       Derive Key
           ↓
     Attempt device-secret decryption of stored encrypted key
     If fails → require PIN

           ↓
     Load encryptionKey into memory
           ↓
     Initialize SecureDB (PouchDB with crypto)
           ↓
     App is UNLOCKED ✓
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Device                            │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    RAM Memory                        │   │
│  │                                                      │   │
│  │   ┌─────────────────────────────────────────────┐   │   │
│  │   │          Security Store                      │   │   │
│  │   │  ┌─────────────────────────────────────────┐ │   │   │
│  │   │  │    encryptionKey (Uint8Array)           │ │   │   │
│  │   │  │    - In memory only                      │ │   │   │
│  │   │  │    - Cleared on lock                     │ │   │   │
│  │   │  │    - 32 bytes (AES-256)                  │ │   │   │
│  │   │  └─────────────────────────────────────────┘ │   │   │
│  │   └─────────────────────────────────────────────┘   │   │
│  │                                                      │   │
│  │   ┌─────────────────────────────────────────────┐   │   │
│  │   │          SecureDB Service                    │   │   │
│  │   │  ┌─────────────────────────────────────────┐ │   │   │
│  │   │  │  PouchDB (IndexedDB adapter)            │ │   │   │
│  │   │  │  - All documents encrypted              │ │   │   │
│  │   │  │  - Transparent encrypt/decrypt          │ │   │   │
│  │   │  │  - Crypto key from security store       │ │   │   │
│  │   │  └─────────────────────────────────────────┘ │   │   │
│  │   └─────────────────────────────────────────────┘   │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              localStorage (Browser)                  │   │
│  │                                                      │   │
│  │   - Salt (base64) ✓                                 │   │
│  │   - Device Secret (base64) ✓                        │   │
│  │   - Encrypted Key Backup (JSON, encrypted) ✓        │   │
│  │   - Device Binding (JSON) ✓                         │   │
│  │                                                      │   │
│  │   ✗ NO raw encryption keys stored                   │   │
│  │   ✗ NO plaintext sensitive data                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Code Rules

### DO ✅

```typescript
// DO: Use security store for key operations
import { useSecurityStore } from '~/stores/security';

const security = useSecurityStore();
// encryptionKey is available in memory after unlock

// DO: Use secureDb for data persistence
import { securePut, secureGet } from '~/services/secureDb';

await securePut({ _id: 'patient/123', name: 'John' });
const patient = await secureGet('patient/123');

// DO: Initialize secureDb before first use
await initializeSecureDb();
```

### DON'T ❌

```typescript
// DON'T: Store encryption key in localStorage
localStorage.setItem('my_key', key.toString());

// DON'T: Use document-level encryption outside secureDb
const encrypted = encryptObject(data, key);
await db.put({ _id: 'doc', _encrypted: true, data: encrypted });

// DON'T: Access PouchDB directly
const db = new PouchDB('healthbridge');
await db.put({ _id: 'doc', sensitive: 'data' }); // Not encrypted!

// DON'T: Import PouchDB directly anywhere except secureDb.ts
import PouchDB from 'pouchdb-browser'; // forbidden

// DON'T: Store encryption functions in modules
export function encryptData() { ... }
export function decryptData() { ... }
```

---

## File Structure

```
app/
├── stores/
│   ├── auth.ts              # Authentication state
│   └── security.ts          # Encryption key management (AUTHORITATIVE)
│
├── services/
│   ├── secureDb.ts          # Encrypted database wrapper (AUTHORITATIVE)
│   ├── pouchdb.ts           # ⚠️ DEPRECATED - wraps secureDb
│   ├── sync.ts              # Sync service (uses secureDb)
│   └── index.ts             # Service exports
│
└── pages/
    ├── index.vue            # Login/PIN entry
    └── dashboard.vue        # Main dashboard
```

---

## API Reference

### Security Store

```typescript
// Key derivation
deriveKeyFromPin(pin: string): Promise<boolean>

// State
encryptionKey: Uint8Array | null  // In memory only
isUnlocked: boolean
```

### SecureDB Service

```typescript
// Initialization
initializeSecureDb(config?: SecureDbConfig): Promise<void>
getSecureDb(): PouchDB.Database  // Throws if locked

// CRUD Operations
securePut<T>(doc: T): Promise<{ id: string; rev: string }>
secureGet<T>(id: string): Promise<T | null>
secureFind<T>(selector: Record<string, unknown>): Promise<T[]>
secureDelete(id: string, rev: string): Promise<{ id: string; ok: boolean }>

// Bulk Operations
secureBulkDocs<T>(docs: T[]): Promise<BulkResult[]>
secureAllDocs<T>(): Promise<T[]>

// Maintenance
closeSecureDb(): Promise<void>
deleteSecureDb(): Promise<void>
secureInfo(): Promise<{ dbName: string; docCount: number; updateSeq: number }>
```

---

## Testing Checklist

- [ ] Encryption key cleared on app lock
- [ ] Cannot access database without PIN
- [ ] Device secret backup works
- [ ] Encrypted data cannot be read from disk
- [ ] 404 error on invalid document access
- [ ] Sync respects encryption boundaries

---

## Compliance Notes

This architecture ensures:

1. **Data at Rest**: All data encrypted with AES-256-GCM
2. **Key Management**: Keys derived from PIN, never stored raw
3. **Memory Safety**: Keys cleared on lock/suspend
4. **Zero Trust**: Device access doesn't grant data access
5. **Single Layer**: Only secureDb handles encryption

---
