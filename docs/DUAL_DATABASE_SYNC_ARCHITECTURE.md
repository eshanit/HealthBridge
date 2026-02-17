# Dual-Database Sync Architecture

## Overview

This document describes the dual-database sync architecture implemented to solve the encryption mismatch problem between the mobile app and the server-side sync worker.

## Problem Statement

The mobile app encrypts all documents before storing them in PouchDB using AES-256-GCM encryption with a PIN-derived key. When these encrypted documents are synced to CouchDB, the server-side sync worker cannot read them because:

1. The encryption key never leaves the device
2. The `type` field (used for document routing) is inside the encrypted payload
3. The server sees documents with only `encrypted: true` and `data: "..."` fields

## Solution: Dual-Database Pattern

The dual-database pattern uses two separate databases:

1. **Encrypted Local DB (secureDb)**: Stores all documents encrypted at rest
2. **Sync Cache (syncDb)**: Temporary in-memory cache for plaintext documents during sync

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Mobile Device                                │
│                                                                      │
│  ┌──────────────────┐     ┌──────────────────┐                     │
│  │   Encrypted      │     │   Sync Cache     │                     │
│  │   Local DB       │────▶│   (In-Memory)    │                     │
│  │   (secureDb)     │     │   (syncDb)       │                     │
│  │                  │     │                  │                     │
│  │  - Encrypted     │     │  - Plaintext     │                     │
│  │  - Persistent    │     │  - Temporary     │                     │
│  │  - AES-256-GCM   │     │  - Map-based     │                     │
│  └──────────────────┘     └────────┬─────────┘                     │
│                                    │                                │
│                                    │ PouchDB Replication            │
│                                    ▼                                │
└─────────────────────────────────────────────────────────────────────┐
                                      │                              
                                      │ HTTPS                        
                                      ▼                              
┌─────────────────────────────────────────────────────────────────────┐
│                         Laravel API                                  │
│                                                                      │
│  ┌──────────────────┐     ┌──────────────────┐                     │
│  │   CouchDB        │────▶│   Sync Worker    │                     │
│  │   Proxy          │     │   (couchdb:sync) │                     │
│  │                  │     │                  │                     │
│  │  - Auth check    │     │  - Read docs     │                     │
│  │  - Route to DB   │     │  - Route by type │                     │
│  └──────────────────┘     │  - Write to MySQL│                     │
│                           └──────────────────┘                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### Phase 1: Sync Cache Module (`syncDb.ts`)

The sync cache module provides an in-memory cache for plaintext documents:

```typescript
// Key functions
export function addToSyncCache(doc: SyncCacheEntry): void
export function getAllFromSyncCache(): SyncCacheEntry[]
export function clearSyncCache(): void
export function getSyncDb(): PouchDB.Database
export function getSyncCacheStats(): SyncCacheStats
```

**Features:**
- In-memory Map-based storage for O(1) access
- Automatic eviction when cache is full
- Temporary PouchDB instance for replication
- Memory usage tracking

### Phase 2: Sync Manager Integration

The sync manager was updated to use the dual-database pattern:

```typescript
// Before sync
const prepareResult = await prepareDocumentsForSync({ includeAll: true });

// Get populated sync database
const syncDb = await getPopulatedSyncDb();

// Replicate from sync cache
const replication = syncDb.replicate.to(remoteDB, { ... });

// After successful sync
clearSyncCache();
```

**Key Changes:**
- `startSync()` now prepares documents before syncing
- `syncSession()` decrypts session documents before push
- `stopSync()` clears the sync cache
- `cleanupSyncManager()` clears all sync data

### Phase 3: Incremental Sync (Future)

Track which documents have been synced to enable incremental syncs:

```typescript
interface SyncCheckpoint {
  lastSeq: string;
  syncedDocIds: string[];
  timestamp: number;
}
```

### Phase 4: Migration (Future)

Handle migration of existing encrypted documents:

1. On first run after update, detect existing documents
2. Decrypt and prepare all documents for sync
3. Sync to server
4. Mark migration complete

## Security Considerations

### Memory Exposure

The sync cache holds plaintext documents in memory. To minimize exposure:

1. **Clear after sync**: Cache is cleared immediately after successful sync
2. **Limited lifetime**: Cache only exists during sync operations
3. **No persistence**: Cache is never written to disk
4. **Automatic eviction**: Oldest entries are evicted when cache is full

### Encryption Key

The encryption key:
- Never leaves the device
- Is derived from the user's PIN
- Is stored in memory only while the app is unlocked
- Is cleared on logout

## Usage Examples

### Manual Sync

```typescript
import { startSync, forceSync } from '~/services/syncManager';

// Start automatic sync
await startSync();

// Force a full sync
await forceSync();
```

### Session Sync (Discharge)

```typescript
import { syncSession, ensureSessionSynced } from '~/services/syncManager';

// Sync a specific session
const result = await syncSession(sessionId);
console.log(`Synced ${result.documentsSynced} documents`);

// Ensure session is synced before proceeding
const success = await ensureSessionSynced(sessionId, 30000);
if (!success) {
  // Handle sync failure
}
```

### Check Sync Status

```typescript
import { useSyncStatus, getSessionSyncStatus } from '~/services/syncManager';

// Global sync status
const status = useSyncStatus();
console.log(`Status: ${status.value.status}`);

// Session-specific status
const sessionStatus = getSessionSyncStatus(sessionId);
console.log(`Session status: ${sessionStatus?.status}`);
```

## Troubleshooting

### Sync Not Starting

1. Check server authentication: `serverAuth.isAuthenticated.value`
2. Check encryption key availability: `securityStore.encryptionKey`
3. Check network connectivity: `navigator.onLine`

### Documents Not Syncing

1. Check sync cache stats: `getSyncCacheStats()`
2. Check for decryption errors in console
3. Verify document structure (must have `_id` field)

### Memory Issues

1. Check cache size: `getSyncCacheStats().estimatedSize`
2. Reduce `maxDocuments` in cache config
3. Clear cache manually: `clearSyncCache()`

## Configuration

```typescript
import { configureSyncCache } from '~/services/syncDb';

configureSyncCache({
  maxDocuments: 1000,    // Maximum documents in cache
  maxMemoryMB: 50        // Maximum memory usage (approximate)
});
```

## Related Files

- [`nurse_mobile/app/services/syncDb.ts`](../nurse_mobile/app/services/syncDb.ts) - Sync cache module
- [`nurse_mobile/app/services/syncManager.ts`](../nurse_mobile/app/services/syncManager.ts) - Sync manager
- [`nurse_mobile/app/services/secureDb.ts`](../nurse_mobile/app/services/secureDb.ts) - Encrypted local DB
- [`nurse_mobile/app/services/encryptionUtils.ts`](../nurse_mobile/app/services/encryptionUtils.ts) - Encryption utilities
- [`healthbridge_core/app/Services/SyncService.php`](../healthbridge_core/app/Services/SyncService.php) - Server-side sync worker

## References

- [GATEWAY.md](../GATEWAY.md) - API Gateway specification
- [SYNC_TROUBLESHOOTING.md](./SYNC_TROUBLESHOOTING.md) - Sync troubleshooting guide
- [E2E_SYNC_TESTING_GUIDE.md](./E2E_SYNC_TESTING_GUIDE.md) - End-to-end testing guide
