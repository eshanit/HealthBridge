# HealthBridge Sync Architecture Rationale

## Why Laravel Proxy Instead of Direct PouchDB → CouchDB?

### The Architectural Decision

The HealthBridge platform uses a **Laravel proxy pattern** instead of direct PouchDB → CouchDB replication. This document explains the rationale and addresses the current sync initialization issue.

---

## Architecture Comparison

### Conventional Pattern (Not Used)
```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  nurse_mobile   │      │    CouchDB      │      │    Laravel      │
│   (PouchDB)     │─────▶│   (Direct)      │─────▶│   (MySQL)       │
│                 │◀─────│                 │◀─────│                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │                        │                        │
   Replication            _changes feed            Sync Worker
   Credentials            Auth via DB               (Pull only)
   in client
```

### HealthBridge Pattern (Implemented)
```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  nurse_mobile   │      │    Laravel      │      │    CouchDB      │
│   (PouchDB)     │─────▶│  Proxy API      │─────▶│   (Database)    │
│                 │◀─────│ /api/couchdb/*  │◀─────│                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │                        │                        │
   Sanctum Token          Auth + Context          Basic Auth
   (No DB creds)          Injection               (Server-side)
```

---

## Rationale for Laravel Proxy

### 1. Security: Credential Isolation

**Problem with Direct Connection:**
- CouchDB credentials would need to be embedded in the mobile app
- Credentials could be extracted via reverse engineering
- Database admin access exposed on client devices

**Solution with Proxy:**
```php
// CouchDB credentials stored ONLY server-side
$this->couchDbUser = env('COUCHDB_USERNAME', 'admin');
$this->couchDbPassword = env('COUCHDB_PASSWORD', 'password');
```

Mobile app only has Sanctum token, never sees CouchDB credentials.

### 2. Authentication: Unified Identity

**Problem with Direct Connection:**
- CouchDB has its own user database
- User management would be duplicated (Laravel users + CouchDB users)
- Role-based access control would need to be implemented twice

**Solution with Proxy:**
```php
// User context injected from Laravel authentication
$user = $request->user();
// Can add user context headers for document-level access control
'X-User-ID' => $user->id,
'X-User-Role' => $user->roles->first()->name,
```

Single source of truth for users in Laravel/MySQL.

### 3. Authorization: Role-Based Access Control

**Problem with Direct Connection:**
- CouchDB's security model is document-level based on users
- Complex to map application roles to CouchDB permissions
- Difficult to implement business logic constraints

**Solution with Proxy:**
```php
// Middleware enforces role-based access
Route::middleware(['auth:sanctum', 'throttle:api'])->prefix('couchdb')->group(function () {
    // Can add additional authorization logic
    // e.g., nurses can only sync their own clinic's data
});
```

### 4. Audit Trail: Request Logging

**Problem with Direct Connection:**
- CouchDB logs are separate from application logs
- Difficult to correlate user actions with data changes
- No application-level context in CouchDB logs

**Solution with Proxy:**
```php
Log::debug('CouchDB proxy request', [
    'method' => $method,
    'path' => $path,
    'user_id' => $user?->id,
    'has_body' => !empty($body),
]);
```

All data access logged with user context.

### 5. Data Transformation: Schema Validation

**Problem with Direct Connection:**
- Any document structure can be written to CouchDB
- No server-side validation before persistence
- Schema changes require client updates

**Solution with Proxy:**
```php
// Can validate/transform documents before forwarding to CouchDB
$document = json_decode($body, true);
if ($document['type'] === 'clinicalSession') {
    // Validate required fields
    // Add computed fields
    // Enforce business rules
}
```

### 6. Network: Single Entry Point

**Problem with Direct Connection:**
- Mobile app needs access to both Laravel API and CouchDB
- Two sets of credentials, two authentication flows
- CORS configuration needed for CouchDB

**Solution with Proxy:**
- Single API base URL for all mobile requests
- Single authentication flow (Sanctum)
- CORS only needed for Laravel

---

## Current Issue: Sync Not Initializing

### Diagnosis

Based on your console output:
- `healthbridge_server_token`: `null`
- `healthbridge_server_user`: `null`
- `healthbridge_sync_status`: `null`
- `window.__HEALTHBRIDGE_DB__`: exists (PouchDB is initialized)

**Root Cause:** The user has not logged in through server authentication. The sync service requires a valid Sanctum token to communicate with the Laravel proxy.

### Code Flow

```typescript
// syncManager.ts:291-297
if (!serverAuth.isAuthenticated.value) {
  console.log('[SyncManager] Not authenticated with server - cannot sync');
  _status.value = 'offline';
  _lastError.value = 'Server authentication required';
  return;  // ← Sync never starts
}
```

### Why This Happens

The architecture requires two authentication steps:

1. **Local Authentication** (PIN) - Unlocks the encrypted local database
2. **Server Authentication** (Email/Password) - Obtains Sanctum token for sync

If only local authentication is completed, the app works offline but cannot sync.

---

## Solution: Implement Server Login Flow

### Option 1: Add Login Page

Create a login page that calls the Laravel authentication API:

```typescript
// In nurse_mobile login page
import { useServerAuth } from '~/services/serverAuth';

const serverAuth = useServerAuth();

async function handleLogin(email: string, password: string) {
  const result = await serverAuth.login({ email, password });
  
  if (result.success) {
    // Token is now stored in localStorage
    // Sync will start automatically
    await startSync();
  }
}
```

### Option 2: Check Auth Status on App Start

Add authentication check to app initialization:

```typescript
// In appInit.client.ts or a layout component
import { useServerAuth } from '~/services/serverAuth';
import { startSync } from '~/services/syncManager';

const serverAuth = useServerAuth();

// Check if we have a valid token
if (serverAuth.isAuthenticated.value) {
  // Start sync automatically
  startSync();
} else {
  // Redirect to login page
  navigateTo('/login');
}
```

### Option 3: Test with Manual Token

For testing, you can manually set a token:

```javascript
// In browser console after logging in via Laravel
// First, get a token from Laravel
const response = await fetch('http://localhost:8000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'nurse@test.com', password: 'password' })
});
const data = await response.json();

// Store the token
localStorage.setItem('healthbridge_server_token', JSON.stringify({
  token: data.token,
  expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
}));
localStorage.setItem('healthbridge_server_user', JSON.stringify(data.user));

// Refresh the page to trigger sync
location.reload();
```

---

## Summary

| Aspect | Direct PouchDB → CouchDB | Laravel Proxy Pattern |
|--------|--------------------------|----------------------|
| **Security** | Credentials in client | Credentials server-side |
| **Authentication** | Dual user management | Single source (Laravel) |
| **Authorization** | CouchDB permissions | Laravel RBAC |
| **Audit Trail** | Separate logs | Unified logging |
| **Validation** | Client-side only | Server-side enforcement |
| **Network** | Two endpoints | Single API endpoint |
| **Offline Support** | Native | Native (same) |
| **Complexity** | Lower | Higher (but justified) |

The Laravel proxy pattern is a deliberate architectural choice for healthcare data security. The current sync failure is **not a bug** but expected behavior when server authentication is not completed.

---

## Next Steps

1. **Create a test user in Laravel:**
   ```bash
   cd healthbridge_core
   php artisan tinker
   >>> User::create(['name' => 'Test Nurse', 'email' => 'nurse@test.com', 'password' => bcrypt('password')]);
   ```

2. **Login through the API:**
   ```bash
   curl -X POST http://localhost:8000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"nurse@test.com","password":"password"}'
   ```

3. **Use the token in nurse_mobile** (see Option 3 above)

4. **Verify sync starts** - Check console for `[SyncManager] Sync started`

---

**Document Version:** 1.0  
**Last Updated:** February 16, 2026
