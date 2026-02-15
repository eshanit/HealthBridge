Great — let’s lock Phase 4 in so KiloCode can execute it cleanly 🔒🌍
Below is the **CouchDB Sync + Conflict Resolution spec** you can paste as your next instruction.

---

# 📄 `PHASE_4_SYNC_CONFLICTS.prompt.md`

> Paste this entire file into KiloCode.

---

## 🎯 Objective

Make the app **multi-device safe** by implementing:

* Bi-directional CouchDB sync
* Deterministic conflict resolution
* Audit trail for all merges
* Zero data loss

This must work with the existing **secure encrypted PouchDB** layer.

---

## 🔗 Sync Architecture

### Databases

| Layer          | Role                    |
| -------------- | ----------------------- |
| Local PouchDB  | Offline source of truth |
| Remote CouchDB | Sync hub + backup       |

All docs (`clinicalSession`, `formInstance`, `timelineEvent`) sync.

---

## ⚙️ Sync Manager

Extend:

`app/services/syncManager.ts`

### Required

```ts
startLiveSync()
stopLiveSync()
pushNow()
pullNow()
resolveConflicts(doc)
```

Use:

```ts
PouchDB.sync(local, remote, {
  live: true,
  retry: true
})
```

---

## ⚠️ Conflict Strategy

### 1. Detection

When:

```ts
doc._conflicts?.length > 0
```

Log to timeline.

---

### 2. Resolution Rules

| Field           | Strategy            |
| --------------- | ------------------- |
| status          | latest updatedAt    |
| stage           | highest progression |
| triagePriority  | highest severity    |
| formInstanceIds | union               |
| updatedAt       | max                 |

---

### 3. Merge

```ts
await local.put(mergedDoc, { new_edits: false })
```

---

## 🧾 Conflict Event

Append:

```ts
{
  type: 'conflict',
  message: 'Merged conflicting updates',
  timestamp: new Date().toISOString()
}
```

---

## 🧪 Testing

Simulate:

* Two devices edit same session
* Sync online
* Verify merged state

---

## ✅ Done When

* Conflicts merge safely
* Timeline logs conflict
* No data loss
* Works offline → online

---

