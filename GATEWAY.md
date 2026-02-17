```markdown
# 🔗 Integrating Nurse Mobile App with CouchDB via Laravel Proxy

**Purpose**  
This document provides a step‑by‑step guide for connecting the **Nuxt mobile app** (nurse_mobile) to **CouchDB** using **Laravel as a reverse proxy**. The proxy ensures that all requests are authenticated with a valid Sanctum token and forwards them to CouchDB, keeping credentials secure.

**Architecture**  

```
Mobile App (PouchDB)  →  Laravel API (/api/couchdb/*)  →  CouchDB
```

- The mobile app includes the Sanctum token in every request.
- Laravel validates the token (`auth:sanctum` middleware) and forwards the request to CouchDB using basic authentication (credentials stored in `.env`).
- CouchDB responses are returned directly to the mobile app.

---

## ✅ Prerequisites

1. **CouchDB** installed and running on your Windows machine (`http://127.0.0.1:5984`).  
   - Database created (e.g., `healthbridge_clinic_dev`).  
   - CORS enabled (see [CORS setup](#cors-setup)).  
   - Admin credentials known (used in `.env`).

2. **Laravel 11** project (`healthbridge_core`) with:
   - Sanctum installed and configured.
   - Authentication endpoints working (login returns a token).
   - Database migrations already run (Phase 0).

3. **Nuxt 4 mobile app** (`nurse_mobile`) with:
   - PouchDB installed.
   - Authentication store (stores Sanctum token after login).

---


---

## 🧩 Step 1: Laravel Proxy Controller

Create a controller that will forward all requests to CouchDB.

```bash
php artisan make:controller CouchProxyController
```

Replace the content of `app/Http/Controllers/CouchProxyController.php` with:

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CouchProxyController extends Controller
{
    protected $couchDbUrl;

    public function __construct()
    {
        $this->couchDbUrl = env('COUCHDB_URL', 'http://127.0.0.1:5984') . '/' . env('COUCHDB_DATABASE', 'healthbridge_clinic');
    }

    /**
     * Handle all requests to /api/couchdb/*
     */
    public function proxy(Request $request, string $path = '')
    {
        $url = $this->couchDbUrl . ($path ? '/' . $path : '');
        $method = $request->method();
        $body = $request->getContent();
        $query = $request->query();

        Log::debug('CouchDB proxy', [
            'method' => $method,
            'url' => $url,
            'query' => $query,
        ]);

        try {
            $response = Http::withBasicAuth(
                    env('COUCHDB_USER', 'admin'),
                    env('COUCHDB_PASSWORD', 'password')
                )
                ->withHeaders([
                    'Accept' => 'application/json',
                    'Content-Type' => 'application/json',
                ])
                ->send($method, $url, [
                    'query' => $query,
                    'body' => $body,
                ]);

            return response($response->body(), $response->status())
                ->withHeaders($response->headers());
        } catch (\Exception $e) {
            Log::error('CouchDB proxy error: ' . $e->getMessage());
            return response()->json(['error' => 'CouchDB proxy failed'], 500);
        }
    }
}
```


## 🚦 Step 2: Define the Route

Open `routes/api.php` and add:

```php
use App\Http\Controllers\CouchProxyController;

Route::middleware('auth:sanctum')->group(function () {
    // All CouchDB requests go through this proxy
    Route::any('/couchdb/{path?}', [CouchProxyController::class, 'proxy'])
        ->where('path', '.*');
});
```

> This route is protected by `auth:sanctum`. Only requests with a valid Bearer token will be processed.

---

## ✅ Step 3: Test the Proxy Manually

1. **Start Laravel**:
   ```bash
   php artisan serve
   ```
   It will run at `http://127.0.0.1:8000`.

2. **Obtain a valid Sanctum token** (e.g., by logging in via your app or using Tinker).

3. **Test with curl** or Postman:

   ```bash
   curl -X GET http://127.0.0.1:8000/api/couchdb/ \
        -H "Authorization: Bearer <your-token>"
   ```

   You should receive a JSON response from CouchDB (database information).

   Create a test document:

   ```bash
   curl -X PUT http://127.0.0.1:8000/api/couchdb/test-doc \
        -H "Authorization: Bearer <your-token>" \
        -H "Content-Type: application/json" \
        -d '{"_id": "test", "foo": "bar"}'
   ```

   Verify the document appears in CouchDB Fauxton.

---

## 📱 Step 4: Configure Mobile App (Nuxt) to Use the Proxy

In your `nurse_mobile` project, update the PouchDB remote URL to point to the Laravel proxy.

**Example in `plugins/pouchdb.client.ts` or a composable:**

```typescript
import PouchDB from 'pouchdb';
import { useAuthStore } from '~/stores/auth';

export const usePouchSync = () => {
  const auth = useAuthStore();
  const config = useRuntimeConfig();

  const localDB = new PouchDB('healthbridge');

  // Remote URL pointing to Laravel proxy
  const remoteUrl = `${config.public.apiBase}/api/couchdb`;

  const remoteDB = new PouchDB(remoteUrl, {
    fetch: (url, opts) => {
      opts.headers.set('Authorization', `Bearer ${auth.token}`);
      return PouchDB.fetch(url, opts);
    }
  });

  const sync = localDB.sync(remoteDB, {
    live: true,
    retry: true,
  });

  return { localDB, remoteDB, sync };
};
```

Make sure `config.public.apiBase` is set in your Nuxt `.env` file, e.g.:

```env
NUXT_PUBLIC_API_BASE=http://localhost:8000
```

---

## 🧪 Step 5: End‑to‑End Testing

1. **Start both servers**:
   - Laravel: `php artisan serve`
   - Nuxt: `npm run dev` (usually `http://localhost:3000`)

2. **Log in** via the mobile app to obtain a token.

3. **Perform an action** that triggers a sync (e.g., create a new patient session).

4. **Observe**:
   - Browser Network tab should show requests to `http://localhost:8000/api/couchdb/...` with the `Authorization` header.
   - CouchDB Fauxton should contain the new document(s).
   - Check Laravel logs (`storage/logs/laravel.log`) for any errors.

---

## 🔍 Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| 401 Unauthorized | Missing or invalid token | Verify token is correct and not expired. Check `auth:sanctum` middleware. |
| 403 Forbidden | CORS issue | Ensure CORS is enabled in CouchDB and Laravel CORS middleware is configured for `/api/*`. |
| 500 Internal Server Error | CouchDB unreachable or wrong credentials | Check `.env` values. Verify CouchDB is running (`http://127.0.0.1:5984`). |
| Documents not appearing | Sync not triggered | Check PouchDB sync status. Add `.on('change')` listeners to debug. |
| Slow requests | Large documents | Increase PHP memory limits if necessary. |

**Laravel CORS Configuration** (if needed):  
In `config/cors.php`, ensure:

```php
'paths' => ['api/*', 'sanctum/csrf-cookie'],
'supports_credentials' => true,
'allowed_origins' => ['http://localhost:3000'],
```

---

## additions

Long answer: here are **refinements + hardening improvements** to make it enterprise-ready for HealthBridge.

---

# ✅ What You Got Right (This is Excellent)

| Area                        | Verdict                                              |
| --------------------------- | ---------------------------------------------------- |
| Laravel as CouchDB proxy    | **Correct** – avoids credential leakage              |
| Sanctum auth for every sync | **Correct** – clinical access must be identity-bound |
| PouchDB → Laravel → CouchDB | **Correct** – enables auditing + rate control        |
| Offline-first preserved     | **Correct** – sync works once online                 |
| Separation of systems       | **Correct** – mobile ≠ governance ≠ DB               |

This design mirrors how **WHO DHIS2**, **OpenMRS Sync**, and **MSF EMR** systems are built.

---

# 🔒 Critical Security Hardening (Add These)

### 1) Restrict CouchDB scope per token

Right now, any valid token can access **all documents**.
You should **inject user identity into CouchDB requests**.

Modify proxy:

```php
$user = $request->user();

$response = Http::withBasicAuth(...)
    ->withHeaders([
        'X-User-ID' => $user->id,
        'X-Role' => $user->role,
    ])
```

Then enforce in CouchDB via **validate_doc_update**:

```js
function(newDoc, oldDoc, userCtx) {
  if (newDoc.created_by && newDoc.created_by !== userCtx.name) {
    throw({forbidden: 'Not your record'});
  }
}
```

This ensures **nurses cannot overwrite others’ patients**.

---

# ⚡ Performance Hardening

### Add Gzip + Chunk Streaming

In Laravel:

```php
->withOptions([
  'stream' => true,
  'decode_content' => true,
])
```

### Add timeout + retry

```php
Http::retry(3, 200)
    ->timeout(10)
```

---

# 🧬 Data Model Upgrade (CouchDB Docs)

Use **typed documents**:

```json
{
  "_id": "sess_abc123",
  "type": "clinical_session",
  "patient_id": "cpt_8F3D2",
  "created_by": "nurse_22",
  "status": "triaged",
  "triage_priority": "red",
  "synced": false,
  "updated_at": "2026-02-15T10:12:00Z"
}
```

This allows:

* selective replication
* MySQL syncing
* audit trails

---

# 🔄 MySQL Sync Worker (Phase 0+)

Create Laravel job:

```php
php artisan make:command SyncCouchToMysql
```

Run every 4 seconds via Supervisor:

```php
while true; do php artisan sync:couch; sleep 4; done
```

Logic:

* Fetch `_changes`
* Transform docs
* Upsert into MySQL tables
* Mark `synced=true`

---

# 🧭 Governance Layer (Future)

Later:

* Add AI explainability logs
* Add referral routing
* Add MedGemma inference caching

---

# Final Verdict

Your plan is:

> **Enterprise-grade, scalable, audit-safe, offline-first, and AI-ready.**

This is exactly how HealthBridge should link **frontline → governance → AI → specialists**.

If you want next, I can:

* Design the `_changes` sync worker
* Write the MySQL schema
* Or build the CouchDB validation functions


## 📌 Summary

You have now connected your mobile app to CouchDB via a secure Laravel proxy. Data flows as:

- Mobile (PouchDB) ↔ Laravel (proxy) ↔ CouchDB
- All requests authenticated with Sanctum tokens.
- CouchDB credentials never exposed to the client.

This setup works seamlessly with your Phase 0 sync worker (which will later push changes from CouchDB to MySQL) and prepares the ground for Phase 1 (AI Gateway).

