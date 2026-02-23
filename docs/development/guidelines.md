# UtanoBridge Development Guidelines

**Version:** 1.0  
**Last Updated:** February 2026  
**Status:** Authoritative Reference

---

## Table of Contents

1. [Architecture Rules](#1-architecture-rules)
2. [UI Framework Requirements](#2-ui-framework-requirements)
3. [Validation Layer](#3-validation-layer)
4. [Clinical Engine Integration](#4-clinical-engine-integration)
5. [Code Style](#5-code-style)
6. [Testing Requirements](#6-testing-requirements)

---

## 1. Architecture Rules

### Absolute Requirements

These rules are **NON-NEGOTIABLE** and apply to all development:

1. **Offline-First**: All features must work without network connectivity
2. **Data Integrity**: Clinical data must never be lost or corrupted
3. **Audit Trail**: All clinical actions must be logged
4. **Safety First**: AI outputs must be validated before display
5. **Role-Based Access**: All endpoints must enforce role permissions

### Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Mobile Frontend | Nuxt 4 + NuxtUI v4 | Required |
| Web Frontend | Vue 3 + Inertia.js | Required |
| Backend | Laravel 11 | Required |
| Mobile Database | PouchDB | Encrypted |
| Sync Database | CouchDB | Source of truth |
| Operational Database | MySQL | Mirror |
| AI Engine | Ollama + MedGemma | Local inference |

---

## 2. UI Framework Requirements

### Mobile Application (NuxtUI v4)

All user interfaces **MUST** use NuxtUI v4 components. No exceptions.

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

---

## 3. Validation Layer

### Zod Schemas Required

All form validation **MUST** use Zod schemas. No manual validation logic in components.

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

---

## 4. Clinical Engine Integration

### Data Flow Pattern

All data operations **MUST** flow through the `ClinicalFormEngine`.

**Component Pattern - REQUIRED:**
```vue
<script setup lang="ts">
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
```

### Field Renderer Architecture

All form fields **MUST** use the `FieldRenderer` component.

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
  date: UInput,
  time: UInput,
  textarea: UTextarea
};
</script>
```

---

## 5. Code Style

### PHP (Laravel)

Follow Laravel Pint formatting:

```bash
# Format code
./vendor/bin/pint

# Check formatting
./vendor/bin/pint --test
```

**Key Conventions:**
- Use strict typing: `declare(strict_types=1);`
- Return type declarations required
- Use Laravel's helper functions over facades when possible
- Use dependency injection in controllers

**Example:**
```php
<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\ClinicalSession;
use Illuminate\Support\Collection;

final class SessionService
{
    /**
     * Get active sessions for a patient.
     */
    public function getActiveSessions(string $patientCpt): Collection
    {
        return ClinicalSession::query()
            ->where('patient_cpt', $patientCpt)
            ->where('status', 'open')
            ->orderByDesc('session_created_at')
            ->get();
    }
}
```

### TypeScript (Vue/Nuxt)

Follow ESLint configuration:

```bash
# Lint code
npm run lint

# Fix issues
npm run lint:fix
```

**Key Conventions:**
- Use Composition API with `<script setup>`
- Use TypeScript for all new code
- Use Zod for runtime validation
- Use Pinia for state management

**Example:**
```vue
<script setup lang="ts">
import { z } from 'zod';
import { useClinicalFormEngine } from '~/composables/useClinicalFormEngine';

// Props with TypeScript
interface Props {
  sessionId: string;
  patientCpt: string;
}

const props = defineProps<Props>();

// Emits with TypeScript
const emit = defineEmits<{
  saved: [session: ClinicalSession];
  error: [message: string];
}>();

// Reactive state
const isLoading = ref(false);

// Methods
async function saveSession(): Promise<void> {
  isLoading.value = true;
  try {
    const session = await saveSessionData(props.sessionId);
    emit('saved', session);
  } catch (error) {
    emit('error', (error as Error).message);
  } finally {
    isLoading.value = false;
  }
}
</script>
```

---

## 6. Testing Requirements

### Backend Tests

```bash
# Run all tests
php artisan test

# Run specific test
php artisan test --filter=ClinicalSessionTest

# Run with coverage
php artisan test --coverage
```

**Test Structure:**
```php
// tests/Feature/ClinicalSessionTest.php

class ClinicalSessionTest extends TestCase
{
    use RefreshDatabase;
    
    /** @test */
    public function it_creates_session_for_new_patient(): void
    {
        $user = User::factory()->create()->assignRole('nurse');
        
        $response = $this->actingAs($user)
            ->postJson('/api/sessions', [
                'patient_cpt' => 'AB12',
                'chief_complaint' => 'Fever',
            ]);
        
        $response->assertStatus(201)
            ->assertJsonStructure([
                'session' => [
                    'id',
                    'patient_cpt',
                    'stage',
                    'status',
                ],
            ]);
    }
}
```

### Frontend Tests

```bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage

# Run e2e tests
npm run test:e2e
```

**Component Test Structure:**
```typescript
// tests/components/ClinicalForm.test.ts
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import ClinicalForm from '~/components/clinical/ClinicalForm.vue';

describe('ClinicalForm', () => {
  it('validates required fields', async () => {
    const wrapper = mount(ClinicalForm, {
      props: {
        schemaId: 'peds_respiratory',
      },
    });
    
    await wrapper.find('form').trigger('submit');
    
    expect(wrapper.find('.error-message').exists()).toBe(true);
  });
});
```

### AI Safety Tests

All AI-related code must have safety tests:

```php
/** @test */
public function ai_output_blocks_prescription_language(): void
{
    $validator = app(OutputValidator::class);
    
    $result = $validator->fullValidation(
        'I recommend prescribing amoxicillin 500mg',
        'explain_triage',
        'nurse'
    );
    
    $this->assertFalse($result['valid']);
    $this->assertContains('prescribe', $result['blocked']);
}
```

---

## Related Documentation

- [System Overview](../architecture/system-overview.md)
- [AI Integration](../architecture/ai-integration.md)
- [API Reference](../api-reference/overview.md)
