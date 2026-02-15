Yes — these suggestions are **excellent** and they *strengthen* the spec without changing the architecture.
I’ve merged them into a **final authoritative version** of the auth spec that you can now treat as **locked**.

Below is the **revised `offline-auth.md`** (v1.1) with all refinements integrated.

---

# 🔐 Offline Authentication & Device Security Spec (v1.1)

**Project:** HealthBridge Companion – Frontliner App
**Scope:** Nuxt 4 + Capacitor
**Status:** 🔒 Authoritative & Implementation-Ready
**Phase:** 1 (Pediatric Respiratory Distress)

---

## 1. Objectives

This system must:

1. Allow **secure login without internet**
2. Protect all local patient data
3. Bind access to **this physical device**
4. Derive encryption keys **only from user knowledge (PIN)**
5. Lock instantly when app is backgrounded or idle

This is **device access control**, not identity authentication.

---

## 2. PIN Policy

| Rule           | Value                                              |
| -------------- | -------------------------------------------------- |
| Minimum length | **6 digits**                                       |
| Maximum length | 8 digits                                           |
| Retry limit    | 5 attempts                                         |
| Lockout        | 30 seconds                                         |
| Wipe threshold | 10 failures                                        |
| Feedback       | Strength meter + “PIN cannot be recovered” warning |

---

## 3. Key Derivation (PBKDF2 → AES-GCM)

### 3.1 Setup

1. Generate `salt (16 bytes)`
2. Store salt in Capacitor Secure Storage
3. Derive key:

```ts
async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 250000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
```

Key is **never stored**, only kept in memory.

---

## 4. Device Binding (Hardened)

On first install:

```ts
device_uuid = Capacitor.getId()
device_secret = randomBytes(32)
```

Store both in Secure Storage.

All encrypted docs include:

```json
{
  device_fingerprint: SHA256(device_uuid + device_secret)
}
```

Mismatch → deny + log.

---

## 5. Known Test Record

On setup:

```json
{
  _id: "_auth_test",
  test: true,
  created_at: "ISO"
}
```

Encrypted and saved.

Login verifies decryption of this doc to validate the key.

---

## 6. Session & Locking Rules

| Event            | Action             |
| ---------------- | ------------------ |
| App background   | Immediate lock     |
| 3 min inactivity | Lock               |
| Screen capture   | Log SECURITY_EVENT |
| Tamper           | Wipe keys          |

---

## 7. Brute Force Protection

| Attempts | Action        |
| -------- | ------------- |
| 5        | 30s lock      |
| 10       | Wipe all data |

---

## 8. Emergency Access

### 8.1 Online

* One-time token (JWT) from Laravel
* Valid 15 min
* Logs AUTH_OVERRIDE

### 8.2 Fully Offline (Break Glass)

* Supervisor QR code (signed JWT)
* Stored physically
* Scan → unlock once
* Logs SECURITY_OVERRIDE

---

## 9. PouchDB Integration Rule

> The derived AES key **must be passed to the PouchDB encryption plugin**
> **NOT used for manual per-field encryption.**

Preferred:

* `pouchdb-adapter-crypto`
* `pouchdb-encryption`

---

## 10. Audit Events

| Event    | Code          |
| -------- | ------------- |
| Success  | AUTH_OK       |
| Failure  | AUTH_FAIL     |
| Lock     | AUTH_LOCK     |
| Wipe     | AUTH_WIPE     |
| Override | AUTH_OVERRIDE |

Stored in `sync_log`.

---

## 11. Test Matrix (Expanded)

| Test              | Expected            |
| ----------------- | ------------------- |
| Wrong PIN         | No decrypt          |
| App kill          | Locked              |
| Multi-user tablet | Encrypted gibberish |
| PIN reset         | Full wipe           |
| Low storage       | Graceful failure    |
| 7 days offline    | All intact          |

---

## 12. Implementation Order (for KiloCode)

1. PIN setup + PBKDF2 + test record
2. Locking + brute force
3. Device binding + emergency access
4. Plugin-based encryption + audit logs

---

This now forms a **secure foundation** you can trust in clinical environments.


