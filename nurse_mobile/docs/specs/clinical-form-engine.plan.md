# Clinical Form Engine – Execution Plan (Phase 1)

This plan converts the frozen spec into running code.

---

## Phase 1: Core Engine + One Clinical Path

### Goal
Run one full pediatric respiratory assessment offline,
with triage + persistence.

---

### Step 1 – Type System
**Deliverable**
- ~/types/clinical-form.ts

**Must include**
- ClinicalFormSchema
- FormSection
- FieldDefinition
- Condition
- WorkflowState
- ClinicalFormInstance
- AuditEvent
- All return/result interfaces

**Rules**
- 100% match with canonical spec
- No renaming
- No optional shortcuts

---

### Step 2 – Engine Skeleton
**Deliverable**
- ~/services/formEngine.ts

**Must implement (stubs allowed)**
- loadSchema
- createInstance
- saveFieldValue
- calculateDerivedFields
- transitionState
- validateTransition
- runTriageLogic
- saveInstance
- markForSync

Each must log:
```ts
console.warn('TODO:SPEC-GAP', methodName);
````

if incomplete.

---

### Step 3 – Secure Persistence

**Deliverable**

* integrate secureDb into formEngine
* every saveFieldValue → securePut
* every load → secureGet

---

### Step 4 – Renderer

**Deliverables**

* ~/components/clinical/forms/ClinicalFormRenderer.vue
* ~/components/clinical/fields/FieldRenderer.vue

**Must**

* render sections dynamically
* respect visibleIf / enabledIf
* save on every change
* block navigation if transitionGuard fails

---

### Step 5 – Pilot Schema

**Deliverable**

* ~/schemas/peds_respiratory_v1.0.2.json
* must pass validateSchema()

---

## Acceptance Gate

The build is complete only when:

* App reload resumes same form
* Age-based RR logic changes warnings
* RED/YELLOW/GREEN computed locally
* Audit log shows every change
* Works fully offline

```

---
### Step 6 – Verification & "Done"

The feature is complete when all checks pass:

**Clinical Logic**
- [ ] Changing age from 11 to 12 months updates the fast-breathing threshold from 50 to 40/min.
- [ ] Checking "Unable to drink" immediately flags case as `RED` priority.
- [ ] Form cannot be submitted if `respiratory_rate` is empty.

**Data Integrity**
- [ ] Closing and reopening the app loads the exact same form state (answers, cursor position).
- [ ] The audit log contains an entry for every single field change.
- [ ] A completed form's data survives an app restart and device reboot.

**Offline Resilience**
- [ ] Completing a full assessment works with Airplane Mode enabled.
- [ ] The `SYNCING` state is visually distinct from `READY` and `OFFLINE`.

**Code Quality**
- [ ] No `TODO:SPEC-GAP` warnings remain in the console.
- [ ] All TypeScript interfaces from `/types/clinical-form.ts` are in use.
- [ ] Schema validation passes for `peds_respiratory_v1.0.0.json`.