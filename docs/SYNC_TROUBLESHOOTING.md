# PouchDB → CouchDB Sync Troubleshooting Guide

**Issue:** Patient documents created in nurse_mobile are not appearing in CouchDB `health_clinic` database.

**Date:** February 16, 2026

---

## Architecture Overview

The sync architecture has changed from direct CouchDB connection to a **Laravel proxy**:

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  nurse_mobile   │      │    Laravel      │      │    CouchDB      │
│   (PouchDB)     │─────▶│  Proxy API      │─────▶│  (Database)     │
│                 │      │ /api/couchdb/*  │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
       │                        │                        │
   Local DB              Sanctum Auth             healthbridge_clinic
   (IndexedDB)           Token Required           (or health_clinic?)
```

---

## Identified Issues

### 1. Database Name Mismatch ⚠️

**Problem:** You mentioned checking `health_clinic` database, but the configuration shows different names.

**Configuration in [`healthbridge_core/.env.example`](healthbridge_core/.env.example:69):**
```env
COUCHDB_DATABASE=healthbridge_clinic
```

**Action Required:**
1. Check your actual `.env` file in `healthbridge_core/`
2. Verify the CouchDB database name matches what you're checking

```bash
# List all CouchDB databases
curl -X GET http://admin:password@localhost:5984/_all_dbs

# Check specific database
curl -X GET http://admin:password@localhost:5984/healthbridge_clinic
```

---

### 2. Server Authentication Required ⚠️

**Problem:** Sync requires Sanctum token authentication, but the user may not be authenticated.

**Code Reference ([`nurse_mobile/app/services/syncManager.ts:291-297`](nurse_mobile/app/services/syncManager.ts:291)):**
```typescript
// Check if authenticated with server
if (!serverAuth.isAuthenticated.value) {
  console.log('[SyncManager] Not authenticated with server - cannot sync');
  _status.value = 'offline';
  _lastError.value = 'Server authentication required';
  return;
}
```

**Verification Steps:**

1. **Check browser console for this message:**
   ```
   [SyncManager] Not authenticated with server - cannot sync
   ```

2. **Check authentication status in browser console:**
   ```javascript
   // Open browser DevTools (F12) on nurse_mobile app
   const serverAuth = window.__SERVER_AUTH__;
   console.log('Is Authenticated:', serverAuth?.isAuthenticated?.value);
   console.log('Server Token:', serverAuth?.getToken?.());
   ```

3. **Check localStorage for token:**
   ```javascript
   // In browser console
   console.log('Server Token:', localStorage.getItem('healthbridge_server_token'));
   console.log('Server User:', localStorage.getItem('healthbridge_server_user'));
   ```

**Solution:**
- Ensure user is logged in through the server authentication flow
- Check that the login API returns a valid Sanctum token

---

### 3. Sync Not Started ⚠️

**Problem:** The sync service may not have been started.

**Code Reference ([`nurse_mobile/app/services/syncManager.ts:280-314`](nurse_mobile/app/services/syncManager.ts:280)):**
```typescript
export async function startSync(): Promise<void> {
  if (_isRunning.value) {
    console.log('[SyncManager] Sync already running');
    return;
  }
  // ...
}
```

**Verification Steps:**

1. **Check if sync is running:**
   ```javascript
   // In browser console
   console.log('Sync Status:', window.__SYNC_STATUS__);
   console.log('Is Running:', window.__IS_RUNNING__);
   ```

2. **Manually start sync:**
   ```javascript
   // In browser console
   await window.startSync?.();
   ```

3. **Check for sync events in console:**
   - Look for `[SyncManager] Starting sync with Laravel proxy:`
   - Look for `[SyncManager] Sync started`

---

### 4. Laravel Proxy Not Running ⚠️

**Problem:** The Laravel backend may not be running or accessible.

**Verification Steps:**

1. **Check Laravel is running:**
   ```bash
   curl http://localhost:8000/api/auth/check
   ```

2. **Check CouchDB proxy endpoint:**
   ```bash
   # This requires authentication
   curl -X GET http://localhost:8000/api/couchdb/health \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Check Laravel logs:**
   ```bash
   tail -f healthbridge_core/storage/logs/laravel.log
   ```

---

### 5. CORS Issues ⚠️

**Problem:** Cross-origin requests may be blocked.

**Verification:**
- Open browser DevTools → Network tab
- Look for failed requests to `/api/couchdb/*`
- Check for CORS errors in console

**Solution:**
Ensure Laravel CORS is configured in [`healthbridge_core/config/cors.php`](healthbridge_core/config/cors.php):
```php
'paths' => ['api/*'],
'allowed_methods' => ['*'],
'allowed_origins' => ['http://localhost:3000'], // nurse_mobile origin
'allowed_headers' => ['*'],
```

---

## Diagnostic Checklist

### Step 1: Check Local PouchDB

```javascript
// In nurse_mobile browser console (F12)

// 1. Check if documents exist locally
const db = window.__HEALTHBRIDGE_DB__;
if (db) {
  db.allDocs({ include_docs: true }).then(result => {
    console.log('Local documents:', result.rows.length);
    console.table(result.rows.map(r => ({
      id: r.id,
      type: r.doc.type,
      updatedAt: r.doc.updatedAt
    })));
  });
} else {
  console.error('PouchDB not initialized');
}
```

### Step 2: Check Server Authentication

```javascript
// In nurse_mobile browser console

// Check if authenticated
const token = localStorage.getItem('healthbridge_server_token');
const user = localStorage.getItem('healthbridge_server_user');

console.log('Has Token:', !!token);
console.log('User:', user ? JSON.parse(user) : null);

// If no token, need to login first
if (!token) {
  console.error('NOT AUTHENTICATED - Please login first');
}
```

### Step 3: Check Sync Status

```javascript
// In nurse_mobile browser console

// Check sync status
const syncStatus = localStorage.getItem('healthbridge_sync_status');
console.log('Sync Status:', syncStatus ? JSON.parse(syncStatus) : 'Not stored');

// Check for errors
console.log('Last Sync Error:', window.__LAST_SYNC_ERROR__);
```

### Step 4: Test Laravel Connectivity

```javascript
// In nurse_mobile browser console

const apiBaseUrl = 'http://localhost:8000';
const token = JSON.parse(localStorage.getItem('healthbridge_server_token'))?.token;

fetch(`${apiBaseUrl}/api/couchdb/health`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  }
})
.then(r => r.json())
.then(data => console.log('CouchDB Health:', data))
.catch(err => console.error('Connection failed:', err));
```

### Step 5: Check CouchDB Directly

```bash
# In terminal

# List databases
curl http://admin:password@localhost:5984/_all_dbs

# Check correct database
curl http://admin:password@localhost:5984/healthbridge_clinic

# List documents
curl http://admin:password@localhost:5984/healthbridge_clinic/_all_docs?include_docs=true
```

---

## Quick Fix Steps

### If Not Authenticated:

1. Login through the nurse_mobile app
2. Or manually trigger login:
   ```javascript
   // In browser console
   const { login } = await import('~/services/serverAuth');
   await login({ email: 'nurse@test.com', password: 'password' });
   ```

### If Sync Not Started:

1. Refresh the page
2. Or manually start sync:
   ```javascript
   // In browser console
   const { startSync } = await import('~/services/syncManager');
   await startSync();
   ```

### If Database Name Wrong:

1. Update `healthbridge_core/.env`:
   ```env
   COUCHDB_DATABASE=health_clinic
   ```
2. Restart Laravel

---

## Expected Console Output

When sync is working correctly, you should see:

```
[SyncManager] Starting sync with Laravel proxy: http://localhost:8000/api/couchdb
[SyncManager] Sync started
[SYNC SYNC_START] Starting live sync {remoteUrl: "http://localhost:8000/api/couchdb"}
[SYNC SYNC_ACTIVE] Replication active
[SYNC SYNC_CHANGE] Data change detected {direction: "push", changesCount: 1}
[SYNC SYNC_PAUSED] Replication paused (no changes)
```

---

## Files to Review

| File | Purpose |
|------|---------|
| [`nurse_mobile/app/services/syncManager.ts`](nurse_mobile/app/services/syncManager.ts) | Main sync orchestration |
| [`nurse_mobile/app/services/serverAuth.ts`](nurse_mobile/app/services/serverAuth.ts) | Server authentication |
| [`healthbridge_core/app/Http/Controllers/Api/CouchProxyController.php`](healthbridge_core/app/Http/Controllers/Api/CouchProxyController.php) | Laravel proxy endpoint |
| [`healthbridge_core/routes/api.php`](healthbridge_core/routes/api.php) | API routes including `/api/couchdb/*` |
| [`healthbridge_core/.env`](healthbridge_core/.env) | CouchDB configuration |

---

## Next Steps

1. **Run the diagnostic checklist above** in the nurse_mobile browser console
2. **Share the console output** so we can identify the specific failure point
3. **Check Laravel logs** for any proxy errors:
   ```bash
   tail -f healthbridge_core/storage/logs/laravel.log
   ```

---

**Document Version:** 1.0  
**Last Updated:** February 16, 2026
