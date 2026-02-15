Based on my review of the codebase, here's what "pending" means and the other states in the Dashboard's recent activities:

## What "Pending" Means

**"Pending"** refers to sessions that have been **finalized but not yet synced to the server**. According to [`dashboard.ts`](app/stores/dashboard.ts:47) and the [dashboard spec](docs/specs/dashboard-state-machine.md:55):

```typescript
awaitingSync = find({ status: { $in: ['finalized', 'ai_processed'] }, synced: false })
```

These are encounters where:
- The clinical work is complete (`finalized` or `ai_processed` status)
- They haven't been uploaded to the server yet (`synced: false`)

---

## All Session States

### Clinical Session Status ([`sessionEngine.ts`](app/services/sessionEngine.ts:38)):
| Status | Meaning |
|--------|---------|
| `open` | Session is actively being worked on |
| `completed` | Session is fully completed |
| `referred` | Patient was referred elsewhere |
| `cancelled` | Session was cancelled |

### Clinical Session Stage ([`SessionCard.vue`](app/components/clinical/SessionCard.vue:79)):
| Stage | Meaning |
|-------|---------|
| `registration` | Initial patient registration |
| `assessment` | Clinical assessment in progress |
| `treatment` | Treatment phase |
| `discharge` | Ready for discharge |

### Sync Status ([`dashboard-state-machine.md`](docs/specs/dashboard-state-machine.md:138)):
| Sync Status | Meaning |
|-------------|---------|
| `synced` | Successfully uploaded to server |
| `pending` | Waiting to be synced (offline) |
| `error` | Sync failed |

### Triage Priority ([`SessionCard.vue`](app/components/clinical/SessionCard.vue:35)):
| Triage | Meaning |
|--------|---------|
| `red` | Urgent/emergent |
| `yellow` | Needs attention |
| `green` | Stable |
| `unknown` | Not yet triaged |