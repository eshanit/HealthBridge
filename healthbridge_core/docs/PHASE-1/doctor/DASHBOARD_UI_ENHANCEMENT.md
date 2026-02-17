```markdown
# GP Dashboard Enhancements – Phase 1 Extensions

**Document Type:** Technical Specification  
**Created:** February 17, 2026  
**Scope:** Enhancements to the existing GP Dashboard to improve patient visibility, filtering, and clinical workflows.  
**UI Library:** shadcn-vue (https://www.shadcn-vue.com/) – all components are available and should be used consistently.

---

## 1. Current State Summary

The GP Dashboard is already fully functional with:

- Left panel showing **referrals** (grouped by priority)
- Main workspace with patient header, clinical tabs, AI explainability panel, and audit strip
- Backend APIs for referral management, session transitions, patient search, and AI tasks
- WebSocket real‑time updates (with polling fallback)

**However**, the left panel is limited to referrals only. GPs need to see **all patients** they are responsible for, apply filters, and quickly search across all records.

---

## 2. Enhancement Goals

1. **Expand the left panel** into a multi‑tab patient list:
   - **Referrals** (existing)
   - **My Cases** – sessions assigned to the logged‑in GP (states: `IN_GP_REVIEW`, `UNDER_TREATMENT`)
   - **All Patients** – searchable, filterable list of all active patients (with pagination)
2. **Add global patient search** – accessible from any tab, using the existing `/gp/patients/search` API.
3. **Add filter chips** to quickly narrow lists by triage priority, status, or date.
4. **Enhance the Treatment tab** with a structured prescription component.
5. **Add a timeline view** to show the full patient journey (events, forms, AI calls, comments).
6. **Make the AI Guidance tab interactive** – allow free‑text questions and predefined actions.
7. **Include clinical calculators** (e.g., weight‑based dosage, paediatric growth charts) for quick reference.

---

## 3. Detailed Specifications

### 3.1 Multi‑Tab Patient List

**Location:** Left panel (replacing the current `PatientQueue.vue` component).

**UI Components:** Use `Tabs` from shadcn-vue.

**Structure:**

```vue
<template>
  <Tabs default-value="referrals" class="w-full">
    <TabsList class="grid w-full grid-cols-3">
      <TabsTrigger value="referrals">Referrals</TabsTrigger>
      <TabsTrigger value="my-cases">My Cases</TabsTrigger>
      <TabsTrigger value="all-patients">All Patients</TabsTrigger>
    </TabsList>
    <TabsContent value="referrals">
      <PatientQueueList
        :referrals="highPriorityReferrals"
        :normal-referrals="normalReferrals"
        :selected-patient-id="selectedPatientId"
        @select="selectPatient"
        @accept="acceptReferral"
        @reject="rejectReferral"
      />
    </TabsContent>
    <TabsContent value="my-cases">
      <MyCasesList
        :cases="myCases"
        :selected-patient-id="selectedPatientId"
        @select="selectPatient"
      />
    </TabsContent>
    <TabsContent value="all-patients">
      <AllPatientsList
        :patients="allPatients"
        :loading="loadingPatients"
        :pagination="patientPagination"
        :selected-patient-id="selectedPatientId"
        @select="selectPatient"
        @search="searchPatients"
        @filter="filterPatients"
        @load-more="loadMorePatients"
      />
    </TabsContent>
  </Tabs>
</template>
```

**Backend requirements:**
- `GET /gp/my-cases` – returns sessions assigned to current GP (states `IN_GP_REVIEW`, `UNDER_TREATMENT`). Already implemented in `GPDashboardController@inReview` and `@underTreatment` – can be merged into one endpoint with a `state` parameter.
- `GET /gp/patients` – list all active patients with pagination, sorting, and filtering. (Currently only search exists; need a full index endpoint.)

**Data format for each patient card (reusable component):**

```typescript
interface PatientSummary {
  couch_id: string;
  cpt: string;
  full_name: string;
  age: number;
  gender: string;
  triage_priority: 'red' | 'yellow' | 'green' | null;
  status: string;          // workflow state
  waiting_minutes?: number; // for referrals
  danger_signs?: string[];
  last_updated: string;
}
```

### 3.2 Global Patient Search

**Location:** Above the tabs in the left panel.

**UI Component:** Use `Command` (shadcn-vue) for a search dropdown that appears as the user types.

**Implementation idea:**

```vue
<template>
  <Command class="rounded-lg border shadow-md">
    <CommandInput
      placeholder="Search by name, CPT, or phone..."
      @update:model-value="debouncedSearch"
    />
    <CommandList>
      <CommandEmpty>No patients found.</CommandEmpty>
      <CommandGroup heading="Patients">
        <CommandItem
          v-for="patient in searchResults"
          :key="patient.couch_id"
          :value="patient.full_name"
          @select="() => selectPatient(patient.couch_id)"
        >
          <span>{{ patient.full_name }}</span>
          <span class="ml-2 text-xs text-muted-foreground">{{ patient.cpt }}</span>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
</template>
```

**Backend:** Uses existing `GET /gp/patients/search?q=...`. Should return up to 10 results quickly.

### 3.3 Filter Chips

**Location:** Below the search bar or inside each tab.

**UI Component:** Use `Badge` with `variant="outline"` and click handlers.

**Example for "All Patients" tab:**

```vue
<div class="flex gap-2 mb-2">
  <Badge
    v-for="filter in triageFilters"
    :key="filter.value"
    :variant="activeFilter === filter.value ? 'default' : 'outline'"
    class="cursor-pointer"
    @click="setFilter(filter.value)"
  >
    {{ filter.label }}
  </Badge>
</div>
```

**Filters could include:** Red/Yellow/Green triage, status (New, In Review, Under Treatment, Closed), date range.

### 3.4 Structured Prescription Component

**Location:** Treatment tab.

**UI Component:** Use a table (`Table`) with rows for each medication, plus a form to add new ones.

**Data model:**

```typescript
interface Medication {
  id: string;
  name: string;
  dose: string;         // e.g., "250 mg"
  route: string;        // oral, IV, topical
  frequency: string;    // e.g., "3 times daily"
  duration: string;     // e.g., "7 days"
  instructions?: string;
}
```

**Implementation sketch:**

```vue
<template>
  <div class="space-y-4">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Medication</TableHead>
          <TableHead>Dose</TableHead>
          <TableHead>Route</TableHead>
          <TableHead>Frequency</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="med in medications" :key="med.id">
          <TableCell>{{ med.name }}</TableCell>
          <TableCell>{{ med.dose }}</TableCell>
          <TableCell>{{ med.route }}</TableCell>
          <TableCell>{{ med.frequency }}</TableCell>
          <TableCell>{{ med.duration }}</TableCell>
          <TableCell>
            <Button variant="ghost" size="sm" @click="removeMedication(med.id)">Remove</Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <Card>
      <CardHeader>
        <CardTitle>Add Medication</CardTitle>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="addMedication" class="grid grid-cols-2 gap-4">
          <Input v-model="newMed.name" placeholder="Medication name" />
          <Input v-model="newMed.dose" placeholder="Dose" />
          <Select v-model="newMed.route">
            <SelectTrigger><SelectValue placeholder="Route" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="oral">Oral</SelectItem>
              <SelectItem value="iv">IV</SelectItem>
              <SelectItem value="topical">Topical</SelectItem>
            </SelectContent>
          </Select>
          <Input v-model="newMed.frequency" placeholder="Frequency" />
          <Input v-model="newMed.duration" placeholder="Duration" />
          <Button type="submit" class="col-span-2">Add</Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
```

**Backend:** This data should be saved to the session. Currently the treatment plan is stored as free text in `session.notes` or a separate field. We could add a `treatment_plan` JSON column to `clinical_sessions` to store structured medications.

### 3.5 Timeline View

**Location:** New tab "Timeline" or a side drawer accessible from the patient header.

**UI Component:** Use a vertical list (`div` with left border and dots) to show events.

**Data format:**

```typescript
interface TimelineEvent {
  id: string;
  type: 'state_change' | 'ai_request' | 'comment' | 'form' | 'referral';
  title: string;
  description: string;
  user: string;
  timestamp: string;
  metadata?: any;
}
```

**Implementation idea:**

```vue
<div class="relative pl-6 space-y-6">
  <div v-for="event in timeline" :key="event.id" class="relative">
    <div class="absolute left-0 top-1 w-2 h-2 rounded-full bg-muted-foreground" />
    <div class="text-sm">
      <span class="font-medium">{{ event.title }}</span>
      <span class="text-muted-foreground ml-2">{{ formatTime(event.timestamp) }}</span>
    </div>
    <div class="text-sm text-muted-foreground">{{ event.description }}</div>
    <div class="text-xs text-muted-foreground mt-1">by {{ event.user }}</div>
  </div>
</div>
```

**Backend:** The session detail endpoint (`GET /gp/sessions/{couchId}`) already includes forms, comments, referrals, and AI requests. Combine them into a single timeline array sorted by timestamp.

### 3.6 Interactive AI Guidance

**Location:** AI Guidance tab (and optionally a chat panel).

**UI Component:** Use a `Card` with a message list and an input area (similar to a chat UI).

**Two modes:**
- **Predefined tasks**: Buttons for common requests (e.g., "Suggest differentials", "Explain treatment", "Summarize for handoff").
- **Free‑text question**: Input field where GP can type any clinical question.

**Implementation sketch:**

```vue
<template>
  <div class="space-y-4">
    <!-- Quick action buttons -->
    <div class="flex gap-2">
      <Button size="sm" @click="askAI('differential')">Suggest Differentials</Button>
      <Button size="sm" @click="askAI('treatment')">Explain Treatment Options</Button>
      <Button size="sm" @click="askAI('handoff')">Summarize for Handoff</Button>
    </div>

    <!-- Chat history -->
    <div v-if="messages.length" class="space-y-2 max-h-80 overflow-y-auto">
      <div v-for="msg in messages" :key="msg.id" class="flex">
        <div :class="msg.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted'"
             class="max-w-[80%] rounded-lg px-3 py-2 text-sm">
          {{ msg.content }}
        </div>
      </div>
    </div>

    <!-- Free‑text input -->
    <div class="flex gap-2">
      <Input v-model="question" placeholder="Ask a clinical question..." @keyup.enter="sendQuestion" />
      <Button @click="sendQuestion">Send</Button>
    </div>
  </div>
</template>
```

**Backend:** Use the existing `/api/ai/medgemma` endpoint with `task = 'free_text'` or map to a specific task based on the question. The prompt should be crafted to restrict the AI to safe, supportive answers (no diagnoses, no prescriptions). All responses are logged in `ai_requests`.

### 3.7 Clinical Calculators

**Location:** A small utility drawer that can be toggled from the patient header or a button in the workspace.

**UI Component:** Use a `Sheet` (shadcn-vue) sliding from the right.

**Calculators to include:**
- **Weight‑based dosage calculator** – given weight (kg) and drug (select from a list), suggest dose range.
- **Paediatric growth chart** – plot weight/age on WHO z‑scores (simple chart using `recharts` or `chart.js`).
- **Fluid resuscitation (Parkland formula)** – for burns.
- **Glasgow Coma Scale (GCS)** – interactive calculator.

**Example: dosage calculator**

```vue
<Sheet>
  <SheetTrigger as-child>
    <Button variant="outline" size="sm">Calculators</Button>
  </SheetTrigger>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>Clinical Calculators</SheetTitle>
    </SheetHeader>
    <div class="space-y-4 py-4">
      <div>
        <Label>Weight (kg)</Label>
        <Input v-model="weight" type="number" />
      </div>
      <div>
        <Label>Drug</Label>
        <Select v-model="selectedDrug">
          <SelectTrigger><SelectValue placeholder="Select drug" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="paracetamol">Paracetamol</SelectItem>
            <SelectItem value="amoxicillin">Amoxicillin</SelectItem>
            <SelectItem value="ibuprofen">Ibuprofen</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button @click="calculateDose">Calculate</Button>
      <div v-if="doseResult" class="mt-4 p-3 bg-muted rounded">
        Recommended dose: {{ doseResult }}
      </div>
    </div>
  </SheetContent>
</Sheet>
```

**Backend:** Dose calculations can be done on the frontend with a simple lookup table, or we can create an API endpoint if the logic is complex.

---

## 4. Integration Notes

- All enhancements must preserve the existing **offline‑first** architecture. The frontend should cache patient lists and handle temporary network failures gracefully.
- Use the **existing authentication and role checks** – only users with `doctor` or `admin` role can access these features.
- WebSocket events (`SessionStateChanged`, `ReferralCreated`) should update the patient lists in real‑time (e.g., when a new referral arrives, it appears in the queue without a refresh).
- The structured prescription data should be saved to the session via the existing `transition` or `close` endpoints, or a dedicated `updateTreatment` endpoint.

---

## 5. Implementation Roadmap (Priority Order)

| Feature | Priority | Estimated Effort | Dependencies |
|--------|----------|------------------|--------------|
| **Multi‑tab patient list** | High | 3 days | Backend endpoints for "My Cases" and "All Patients" |
| **Global patient search** | High | 1 day | Existing search API |
| **Filter chips** | High | 1 day | None |
| **Structured prescription** | Medium | 2 days | Add `treatment_plan` JSON column to `clinical_sessions` |
| **Timeline view** | Medium | 2 days | Combine existing data from session detail |
| **Interactive AI** | Medium | 3 days | Needs careful prompt engineering |
| **Clinical calculators** | Low | 2 days | None |

**Total estimated effort:** ~2 weeks for a single developer.

---

## 6. Code Examples for Key Components (shadcn-vue)

All examples assume shadcn-vue components are already installed and configured.

### 6.1 Tabs + Patient Queue List

```vue
<script setup lang="ts">
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import PatientQueueList from './PatientQueueList.vue'
import MyCasesList from './MyCasesList.vue'
import AllPatientsList from './AllPatientsList.vue'
</script>
```

### 6.2 Search Command

```vue
<script setup lang="ts">
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
</script>
```

### 6.3 Filter Badges

```vue
<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
</script>
```

### 6.4 Prescription Table

```vue
<script setup lang="ts">
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
</script>
```

### 6.5 Timeline

No special components needed – just custom CSS.

### 6.6 AI Chat

Use standard `Button` and `Input`.

---

## 7. Conclusion

These enhancements will transform the GP Dashboard from a referral‑only view into a comprehensive patient management tool, enabling GPs to efficiently handle all their cases, collaborate with AI, and document care in a structured way. The use of shadcn-vue ensures a consistent, accessible UI with minimal custom CSS.

All suggestions are designed to be built incrementally on top of the existing solid foundation.

**Ready for KiloCode to begin.**