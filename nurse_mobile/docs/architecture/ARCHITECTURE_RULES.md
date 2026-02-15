# **HealthBridge Frontliner App - Implementation Covenant**

**Project:** HealthBridge Companion  
**Status:** AUTHORITATIVE - NON-NEGOTIABLE  
**Effective:** 2026-01-31  
**For:** KiloCode Development Team  

---

## 🚨 **ARCHITECTURE RULES - ABSOLUTE REQUIREMENTS**

### **1. UI FRAMEWORK - MANDATORY**
All user interfaces **MUST** be built using **NuxtUI v4** components. No exceptions.

| Component Type | Must Use | Forbidden |
|----------------|----------|-----------|
| Forms | `UForm`, `UFormGroup`, `UFormField` | `<form>`, `<input>`, manual validation |
| Inputs | `UInput`, `UTextarea` | Raw `<input>`, `<textarea>` |
| Selection | `USelect`, `URadioGroup`, `UCheckbox`, `UToggle` | `<select>`, manual radio/checkbox |
| Buttons | `UButton` | `<button>` |
| Layout | `UCard`, `UContainer`, `UGrid`, `UModal` | Manual CSS grids, basic divs |
| Feedback | `UAlert`, `UProgress`, `USpinner`, `UToast` | Manual alerts, loaders |
| Navigation | `UTabs`, `UBreadcrumb`, `UPagination` | Manual tab systems |

**Example - CORRECT:**
```vue
<template>
  <UForm :schema="clinicalSchema" :state="formState" @submit="handleSubmit">
    <UFormField name="respiratoryRate" label="Respiratory Rate (breaths/min)">
      <UInput 
        v-model="formState.respiratoryRate" 
        type="number" 
        placeholder="Count for 60 seconds"
        :ui="{ icon: 'i-heroicons-heart' }"
      />
    </UFormField>
  </UForm>
</template>
```

**Example - FORBIDDEN:**
```vue
<template>
  <!-- ❌ NEVER DO THIS -->
  <form @submit.prevent="handleSubmit">
    <label>Respiratory Rate</label>
    <input v-model="rr" type="number" />
    <button type="submit">Save</button>
  </form>
</template>
```

### **2. VALIDATION LAYER - MANDATORY**
All form validation **MUST** use **Zod schemas**. No manual validation logic in components.

**Clinical Field Schema Pattern:**
```typescript
// ~/schemas/clinical/fieldSchemas.ts
import { z } from 'zod';

export const pediatricRespiratorySchema = z.object({
  // Basic validation
  ageMonths: z.number()
    .min(2, "Child must be at least 2 months old")
    .max(59, "Child must be under 5 years (59 months)"),
    
  // Clinical validation with WHO thresholds
  respiratoryRate: z.number()
    .min(10, "Rate too low. Re-count for 60 seconds.")
    .max(120, "Rate too high. Verify measurement.")
    .refine(
      (value, ctx) => {
        const ageMonths = ctx.parent.ageMonths;
        const threshold = ageMonths < 12 ? 50 : 40;
        return value <= threshold;
      },
      {
        message: (value, ctx) => {
          const ageMonths = ctx.parent.ageMonths;
          const threshold = ageMonths < 12 ? 50 : 40;
          return `Fast breathing detected (>${threshold}/min). Consider pneumonia.`;
        },
        path: ["respiratoryRate"]
      }
    ),
    
  // Cross-field clinical validation
  dangerSigns: z.object({
    unableToDrink: z.boolean(),
    vomitingEverything: z.boolean(),
    convulsions: z.boolean(),
    lethargic: z.boolean()
  }).refine(
    data => !(data.unableToDrink && !data.lethargic),
    {
      message: "If unable to drink, check lethargy status",
      path: ["dangerSigns", "lethargic"]
    }
  )
});

// Type inference for TypeScript
export type PediatricRespiratoryInput = z.infer<typeof pediatricRespiratorySchema>;
```

### **3. CLINICAL ENGINE INTEGRATION - MANDATORY**
All data operations **MUST** flow through the `ClinicalFormEngine`.

**Component Pattern - REQUIRED:**
```vue
<script setup lang="ts">
// ~/components/clinical/forms/ClinicalForm.vue
import { useClinicalFormEngine } from '~/composables/useClinicalFormEngine';
import { pediatricRespiratorySchema } from '~/schemas/clinical/fieldSchemas';

const { formEngine, formState, saveField, validateForm } = useClinicalFormEngine({
  schemaId: 'peds_respiratory',
  zodSchema: pediatricRespiratorySchema
});

// Field change handler - ONLY approved pattern
const handleFieldChange = async (fieldId: string, value: any) => {
  // 1. Update local state (optimistic UI)
  formState[fieldId] = value;
  
  // 2. Save through clinical engine (MANDATORY)
  const result = await saveField(fieldId, value);
  
  if (!result.success) {
    // 3. Handle clinical validation errors
    showError(result.clinicalError);
  }
};
</script>

<template>
  <UForm :schema="pediatricRespiratorySchema" :state="formState">
    <UFormField name="respiratoryRate">
      <template #label>
        <div class="clinical-field-header">
          <span>Respiratory Rate</span>
          <UBadge color="orange" variant="soft" size="xs">
            Clinical Priority
          </UBadge>
        </div>
      </template>
      <UInput 
        :model-value="formState.respiratoryRate"
        @update:model-value="(val) => handleFieldChange('respiratoryRate', val)"
        type="number"
        :ui="{ 
          base: 'clinical-input',
          icon: { trailing: 'i-heroicons-clock' }
        }"
      />
    </UFormField>
  </UForm>
</template>
```

### **4. FIELD RENDERER ARCHITECTURE - MANDATORY**
All form fields **MUST** use the `FieldRenderer` component.

**FieldRenderer Implementation:**
```vue
<!-- ~/components/clinical/fields/FieldRenderer.vue -->
<script setup lang="ts">
interface Props {
  field: ClinicalFieldDefinition;
  modelValue: any;
  clinicalContext?: ClinicalContext;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:modelValue': [value: any];
  'clinicalWarning': [warning: ClinicalWarning];
}>();

// Field type to NuxtUI component mapping
const componentMap = {
  text: UInput,
  number: UInput,
  select: USelect,
  radio: URadioGroup,
  checkbox: UCheckboxGroup,
  toggle: UToggle,
  date: UInput, // with type="date"
  time: UInput, // with type="time"
  textarea: UTextarea
};

const SelectedComponent = computed(() => 
  componentMap[props.field.type] || UInput
);

const fieldProps = computed(() => {
  const base = {
    modelValue: props.modelValue,
    'onUpdate:modelValue': (val: any) => emit('update:modelValue', val),
    placeholder: props.field.placeholder,
    required: props.field.required
  };
  
  // Type-specific props
  switch (props.field.type) {
    case 'number':
      return { ...base, type: 'number' };
    case 'select':
      return { ...base, options: props.field.options };
    case 'date':
      return { ...base, type: 'date' };
    default:
      return base;
  }
});
</script>

<template>
  <UFormField 
    :name="field.id" 
    :label="field.label"
    :description="field.clinicalNote"
    :required="field.required"
  >
    <component
      :is="SelectedComponent"
      v-bind="fieldProps"
      :ui="{
        base: field.uiHint === 'urgent' ? 'clinical-input-urgent' : '',
        color: field.uiHint === 'urgent' ? 'red' : 'primary'
      }"
    />
    
    <!-- Clinical context display -->
    <template v-if="field.clinicalNote" #help>
      <UAlert
        :title="field.clinicalNote"
        :icon="field.uiHint === 'urgent' ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-information-circle'"
        :color="field.uiHint === 'urgent' ? 'red' : 'blue'"
        variant="soft"
        size="xs"
        class="mt-2"
      />
    </template>
  </UFormField>
</template>
```

### **5. SECURITY & PERSISTENCE - MANDATORY**
All data **MUST** be encrypted and saved through `secureDb`.

**Data Flow Pattern:**
```typescript
// ~/composables/useClinicalFormEngine.ts
export const useClinicalFormEngine = (options: UseClinicalFormEngineOptions) => {
  const saveField = async (fieldId: string, value: any): Promise<SaveResult> => {
    try {
      // 1. Validate with Zod schema
      const validation = options.zodSchema.safeParse({
        ...formState.value,
        [fieldId]: value
      });
      
      if (!validation.success) {
        return {
          success: false,
          clinicalError: validation.error.format()[fieldId]?._errors[0]
        };
      }
      
      // 2. Save through ClinicalFormEngine
      const engineResult = await clinicalFormEngine.saveFieldValue(
        formInstanceId.value,
        fieldId,
        value
      );
      
      if (!engineResult.success) {
        return {
          success: false,
          clinicalError: engineResult.reason
        };
      }
      
      // 3. Encrypt and persist
      await secureDb.put(engineResult.formInstance);
      
      return { success: true };
      
    } catch (error) {
      // 4. Handle errors with user-friendly messages
      console.error('Clinical save failed:', error);
      return {
        success: false,
        clinicalError: 'Failed to save clinical data. Working offline?'
      };
    }
  };
  
  return { saveField, formState, validateForm };
};
```

### **6. CLINICAL WORKFLOW ENFORCEMENT**
All clinical forms **MUST** enforce the workflow state machine.

**Workflow Guard Implementation:**
```vue
<!-- ~/components/clinical/workflow/WorkflowGuard.vue -->
<script setup lang="ts">
const { currentWorkflowState, allowedTransitions } = useClinicalWorkflow();

// Navigation guard - prevents protocol violations
const route = useRoute();
const router = useRouter();

router.beforeEach((to, from, next) => {
  const targetState = to.params.workflowState as string;
  
  if (!allowedTransitions.value.includes(targetState)) {
    // Show clinical error modal
    useToast().add({
      title: 'Clinical Protocol Violation',
      description: `Cannot skip from ${currentWorkflowState.value} to ${targetState}`,
      icon: 'i-heroicons-exclamation-triangle',
      color: 'red',
      timeout: 5000
    });
    
    // Block navigation
    next(false);
  } else {
    next();
  }
});
</script>
```

### **7. ERROR HANDLING & USER FEEDBACK**
All errors **MUST** use NuxtUI toast system with clinical context.

**Error Handler Pattern:**
```typescript
// ~/utils/clinicalErrorHandler.ts
export const handleClinicalError = (error: ClinicalError) => {
  const toast = useToast();
  
  switch (error.type) {
    case 'validation_error':
      toast.add({
        title: 'Clinical Validation Error',
        description: error.message,
        icon: 'i-heroicons-document-magnifying-glass',
        color: 'orange',
        actions: [{
          label: 'View Details',
          click: () => showValidationDetails(error)
        }]
      });
      break;
      
    case 'protocol_violation':
      toast.add({
        title: 'Protocol Violation',
        description: error.message,
        icon: 'i-heroicons-exclamation-triangle',
        color: 'red',
        timeout: 10000
      });
      break;
      
    case 'sync_error':
      toast.add({
        title: 'Sync Issue',
        description: 'Data saved locally. Will sync when online.',
        icon: 'i-heroicons-signal',
        color: 'blue',
        timeout: 3000
      });
      break;
  }
};
```

---

## 🚫 **FORBIDDEN PATTERNS - IMMEDIATE REJECTION**

If KiloCode attempts any of these, **STOP AND ASK**:

1. **Raw HTML inputs** (`<input>`, `<select>`, `<button>`)
2. **Manual validation** in Vue components (no `if (!value) throw error`)
3. **Direct state mutation** (no `formState.value.rr = 45` without clinical engine)
4. **Bypassing encryption** (no `localStorage.setItem('patient-data', json)`)
5. **Custom CSS for basic components** (use NuxtUI variants instead)
6. **Inline styles for layout** (use NuxtUI `UGrid`, `UFlex`)
7. **Manual modal/dialog creation** (use `UModal`)
8. **Custom toast/notification systems** (use `useToast()`)

---

## ✅ **PRE-IMPLEMENTATION CHECKLIST**

Before writing ANY code, KiloCode **MUST** verify:

### **For New Components:**
- [ ] Uses NuxtUI components exclusively
- [ ] Has corresponding Zod schema defined
- [ ] Integrates with `ClinicalFormEngine`
- [ ] Handles errors with `useToast()`
- [ ] Includes audit logging for clinical actions
- [ ] Works offline (no external dependencies)
- [ ] Follows clinical workflow state machine

### **For Form Fields:**
- [ ] Uses `FieldRenderer.vue` wrapper
- [ ] Maps to NuxtUI component
- [ ] Includes clinical context/help text
- [ ] Has appropriate `uiHint` (urgent/warning/normal)
- [ ] Validates via Zod schema
- [ ] Auto-saves on change

### **For Data Operations:**
- [ ] Goes through `secureDb` service
- [ ] Encrypted at rest
- [ ] Includes audit log entry
- [ ] Handles offline queuing
- [ ] Respects clinical priority (RED first)

---

## 🆘 **ARCHITECTURE VIOLATION RESPONSE PROTOCOL**

If a request violates these rules, KiloCode **MUST** respond:

```
🚨 ARCHITECTURE VIOLATION DETECTED

Request: [Brief description of requested code]
Violation: [Specific rule violated - e.g., "Raw HTML input instead of UInput"]
Rule Reference: [e.g., "Section 1.1 - UI Framework"]

Required Fix: [Specific alternative using approved patterns]
Example: 
```vue
<!-- Use this instead -->
<UInput v-model="value" type="number" placeholder="Enter value" />
```

Please confirm you want to proceed with the corrected implementation.
```

**DO NOT** proceed with violating code. Wait for confirmation of corrected approach.

---

## 📁 **PROJECT STRUCTURE ENFORCEMENT**

```
app/
├── components/
│   ├── clinical/
│   │   ├── forms/          # Form-level components
│   │   ├── fields/         # FieldRenderer and field types
│   │   ├── workflow/       # State machine components
│   │   └── display/        # Clinical data display
│   └── ui/                 # NuxtUI wrapper components (if needed)
├── composables/
│   ├── useClinicalFormEngine.ts   # REQUIRED for all forms
│   └── useClinicalWorkflow.ts     # REQUIRED for workflow
├── schemas/
│   ├── clinical/           # Zod schemas for forms
│   └── validation/         # Custom Zod validators
└── services/
    ├── formEngine.ts       # ClinicalFormEngine
    ├── secureDb.ts         # Encrypted persistence
    └── clinicalCalculations.ts  # WHO IMCI logic
```

---

## 🏁 **IMPLEMENTATION SUCCESS CRITERIA**

Code is **APPROVED** when:

1. **Zero raw HTML** - All UI uses NuxtUI
2. **Zero manual validation** - All validation uses Zod
3. **Zero direct state mutation** - All changes go through clinical engine
4. **Zero unencrypted data** - All persistence uses secureDb
5. **Zero protocol violations** - Workflow state machine enforced
6. **Zero offline failures** - All features work without internet
7. **Zero audit gaps** - Every clinical action logged

---

## **8. DARK MODE COLOR SCHEME - MANDATORY**

All UI components **MUST** use consistent dark mode color schemes with proper Tailwind CSS dark mode classes.

### **Dark Mode Color Palette:**
```
Background:    bg-gray-900 (primary), bg-gray-800 (secondary), bg-gray-700 (tertiary)
Text:          text-white (primary), text-gray-300 (secondary), text-gray-400 (tertiary)
Borders:       border-gray-700 (default), border-gray-600 (hover)
Accents:       text-blue-400, text-green-400, text-yellow-400, text-red-400
```

### **TWCard Dark Mode Pattern:**
```vue
<TWCard color="gray" variant="solid">
  <div class="bg-gray-800 rounded-lg p-4">
    <h3 class="text-white font-semibold">Title</h3>
    <p class="text-gray-300">Content text</p>
  </div>
</TWCard>
```

### **TWAlert Dark Mode Pattern:**
```vue
<TWAlert color="info" variant="soft">
  <p class="text-blue-300">Information message</p>
</TWAlert>
```

### **Component Dark Mode Requirements:**
- All components must use `dark:` prefix for dark mode variants
- Text contrast must meet WCAG 2.1 AA standards (4.5:1 ratio)
- Use semantic colors: `text-gray-300` for body, `text-white` for headings
- Background colors should use opacity modifiers: `bg-gray-800/50` for depth

---

## **9. NAVIGATION PATTERNS - MANDATORY**

Use `<NuxtLink>` for user-initiated navigation and `navigateTo` for programmatic navigation.

### **Use `<NuxtLink>` for:**
- Navigation links in templates
- Menu items and navigation menus
- Buttons that navigate to another page
- Any visible link that users click to navigate

### **Use `navigateTo()` for:**
- Form submissions with conditional redirects
- Authentication guards and middleware redirects
- Event handlers that require programmatic control
- Navigation after async operations complete
- Conditional redirects based on application state

### **`<NuxtLink>` Pattern (RECOMMENDED):**
```vue
<!-- Navigation button in template -->
<TWButton to="/dashboard" icon="i-heroicons-home">Dashboard</TWButton>

<!-- Direct NuxtLink in template -->
<NuxtLink to="/sessions" class="text-blue-400 hover:text-blue-300">
  View Sessions
</NuxtLink>
```

### **`navigateTo()` Pattern (when required):**
```typescript
// After form submission
async function handleSubmit() {
  await saveForm();
  navigateTo('/dashboard');
}

// Auth guard
router.beforeEach((to) => {
  if (to.path requiresAuth && !isAuthenticated.value) {
    navigateTo('/login');
  }
});
```

### **TWButton Navigation Prop:**
The `TWButton` component supports the `to` prop for NuxtLink navigation:
```vue
<TWButton to="/sessions" color="primary">View Sessions</TWButton>
```

---

## **10. DATE-FNS USAGE - MANDATORY**

All date formatting and manipulation **MUST** use the `date-fns` library for tree-shakable modularity.

### **Import Pattern:**
```typescript
import { format, formatDistanceToNow, parseISO } from 'date-fns';
```

### **Common Formatting Patterns:**
```typescript
// Format date for display
format(new Date(), 'MMM d, yyyy');  // "Feb 8, 2026"

// Format with time
format(new Date(), 'MMM d, yyyy h:mm a');  // "Feb 8, 2026 4:18 AM"

// Relative time (best for activity feeds)
formatDistanceToNow(parseISO(dateString), { addSuffix: true });  // "2 hours ago"

// ISO date
formatISO(new Date());  // "2026-02-08T09:18:00Z"
```

### **Forbidden Patterns:**
```typescript
// ❌ NEVER do this - manual date formatting
new Date().toLocaleDateString();
new Date().toISOString();
Intl.DateTimeFormat().format(new Date());
```

### **Allowed Patterns:**
```typescript
// ✅ Use date-fns
import { format } from 'date-fns';
format(date, 'PPP');  // "Feb 8th, 2026"
format(date, 'PPPP');  // "Saturday, February 8th, 2026"
```

---

## **11. VUEUSE INTEGRATION - MANDATORY**

Use `@vueuse/core` for reactive browser APIs and composable utilities.

### **Commonly Used Composables:**
```typescript
// Clipboard access
import { useClipboard } from '@vueuse/core';
const { copy, copied } = useClipboard();

// Dark mode detection
import { useDark, usePreferredDark } from '@vueuse/core';
const isDark = useDark();
const prefersDark = usePreferredDark();

// Local storage (reactive)
import { useLocalStorage } from '@vueuse/core';
const state = useLocalStorage('key', defaultValue);

// Viewport tracking
import { useWindowSize, useWindowScroll } from '@vueuse/core';
const { width, height } = useWindowSize();

// Debounced utilities
import { useDebounceFn, useThrottleFn } from '@vueuse/core';
const debouncedFn = useDebounceFn(() => { /* ... */ }, 300);

// Online/offline status
import { useOnline } from '@vueuse/core';
const isOnline = useOnline();

// Clipboard with reactivity
import { useClipboard } from '@vueuse/core';
const { copy, paste } = useClipboard();
```

### **Network Status Pattern:**
```typescript
import { useOnline, useNavigator } from '@vueuse/core';

const isOnline = useOnline();

// Watch for online/offline changes
watch(isOnline, (online) => {
  if (online) {
    syncOfflineData();
  }
});
```

### **Local Storage Pattern (with encryption):**
```typescript
import { useLocalStorage } from '@vueuse/core';

// For sensitive data, wrap with encryption
const secureState = computed({
  get: () => decrypt(useLocalStorage('secure-key').value),
  set: (val) => useLocalStorage('secure-key', encrypt(val))
});
```

### **Debounced Search Pattern:**
```typescript
import { useDebounceFn } from '@vueuse/core';

const searchQuery = ref('');
const searchResults = ref([]);

const debouncedSearch = useDebounceFn(async (query) => {
  searchResults.value = await performSearch(query);
}, 300);

watch(searchQuery, (query) => {
  debouncedSearch(query);
});
```

---

## **12. DARK MODE IMPLEMENTATION**

The app uses `@nuxtjs/color-mode` for dark mode management.

### **Forcing Dark Mode:**
```typescript
// In components
const colorMode = useColorMode();
colorMode.preference = 'dark';  // Force dark mode
```

### **Tailwind Dark Mode Classes:**
```vue
<!-- Light mode: bg-white text-gray-900 -->
<!-- Dark mode: bg-gray-900 text-white -->
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
  Content
</div>
```

### **Color Scheme Variables:**
```css
:root {
  --color-background: #ffffff;
  --color-surface: #f3f4f6;
  --color-text: #111827;
}

.dark {
  --color-background: #030712;
  --color-surface: #1f2937;
  --color-text: #f9fafb;
}
```

---

**This document is the single source of truth for HealthBridge implementation.**  
Any deviation requires explicit approval from the clinical lead and technical architect.

**KiloCode: Acknowledge understanding and compliance before proceeding.**
