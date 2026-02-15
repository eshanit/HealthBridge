# Clinical Dashboard – State Machine & Data Contract

**Applies to:** Frontliner Mobile App (Nuxt 4 + PouchDB)
**Status:** Authoritative
**Depends on:** `offline-auth.md`, `pouchdb-sync-service.md`

---

## 1. Dashboard State Machine

### 1.1 Global States

| State       | Description                          |
| ----------- | ------------------------------------ |
| `LOCKED`    | App is locked (PIN not entered)      |
| `UNLOCKING` | Deriving key + verifying test record |
| `READY`     | DB unlocked, dashboard loading       |
| `OFFLINE`   | No network but usable                |
| `SYNCING`   | Sync in progress                     |
| `ERROR`     | Sync or DB error                    |

---

### 1.2 Transitions

```
LOCKED -> (PIN OK) -> UNLOCKING
UNLOCKING -> (KEY VALID) -> READY
READY -> (network lost) -> OFFLINE
OFFLINE -> (network back) -> SYNCING
SYNCING -> (done) -> READY
ANY -> (critical error) -> ERROR
```

---

## 2. UI State Binding

| State   | Header Badge | Main Action    | Banner            |
| ------- | ------------ | -------------- | ----------------- |
| LOCKED  | Locked       | —              | Enter PIN         |
| READY   | Online       | New Assessment | —                 |
| OFFLINE | Offline      | New Assessment | "Working offline" |
| SYNCING | Syncing      | Disabled       | Progress bar      |
| ERROR   | Error        | Retry Sync     | "Check network"   |

---

## 3. Data Contract (from PouchDB)

### 3.1 Queries

```ts
draft = find({ type: 'encounter', status: 'draft' })
awaitingSync = find({ status: { $in: ['finalized', 'ai_processed'] }, synced: false })
urgent = find({ priority: 'red' })
recent = find({ type: 'encounter' }, { sort: ['updated_at'], limit: 5 })
```

---

## 4. Derived Dashboard Model

```ts
DashboardState = {
  hasDraft: boolean,
  draftMeta?: { workflow, updated_at },
  awaitingSyncCount: number,
  urgentCount: number,
  stats: {
    red: number,
    yellow: number,
    green: number
  },
  recent: ActivityItem[],
  sync: {
    status: 'online' | 'offline' | 'syncing' | 'error',
    lastSuccess?: ISODate
  }
}
```

---

## 5. Event Handlers

| Event             | Action            |
| ----------------- | ----------------- |
| `onUnlock()`      | loadDashboard()   |
| `onSyncStart()`   | set state SYNCING |
| `onSyncSuccess()` | refresh stats     |
| `onNetworkLost()` | OFFLINE           |
| `onCritical()`    | ERROR             |

---

## 6. UI Components Mapping

| Component    | Data                |
| ------------ | ------------------- |
| Header       | sync.status, clinic |
| Action Cards | hasDraft            |
| Stats Bar    | stats               |
| Feed         | recent              |
| Alerts Tab   | urgent              |

---

## 7. Offline Guarantees

* Dashboard must render even if **0 network**.
* Sync status is informational, never blocking.
* All counts derived from local DB only.

---

## 8. Records Navigation

### 8.1 Dashboard Card Navigation

Dashboard cards are now clickable and navigate to filtered records lists:

| Card           | Filter Parameter | Route                      |
| -------------- | ---------------- | -------------------------- |
| Urgent (Red)   | `filter=urgent`  | `/records?filter=urgent`   |
| Attention (Yellow) | `filter=attention` | `/records?filter=attention` |
| Stable (Green) | `filter=stable` | `/records?filter=stable`   |
| Pending Sync   | `filter=pending` | `/records?filter=pending`  |

### 8.2 Records List Page

**Route:** `/records?filter={filter}`

**Supported Filters:**
- `urgent` - Records with triage priority 'red'
- `attention` - Records with triage priority 'yellow'
- `stable` - Records with triage priority 'green' or no priority
- `pending` - Records with sync status 'pending' or 'error'
- `all` - All records (default)

**Records List Features:**
- Color-coded priority indicator (vertical bar)
- Status badges (Draft, Completed, In Progress)
- Sync status badges (Synced, Pending, Error)
- Click to navigate to record detail/edit page
- Sorted by most recent first
- Loading, error, and empty states

### 8.3 Navigation Handlers

```ts
// Dashboard navigation handler
function handleViewRecords(filter: string) {
  navigateTo(`/records?filter=${filter}`);
}

// Records list navigation - opens record detail page
function handleRecordClick(record: ClinicalFormInstance) {
  router.push(`/records/${record._id}`);
}
```

### 8.4 Record Detail Page

**Route:** `/records/{id}`

**Features:**
- Triage priority banner with color coding
- Form status badge (Draft, Completed, In Progress)
- Sync status badge (Synced, Pending, Error)
- Patient information (ID, Name, Age)
- Assessment details (Type, Current Step, Timestamps)
- Danger signs summary
- Edit button for draft records

**Data Retrieved:**
- Single record by ID from secure PouchDB
- Decrypted using user's encryption key
- Computed fields (triagePriority, hasDangerSign, etc.)

---

This ensures your UI is **truthful, fast, and safe** under all conditions.
