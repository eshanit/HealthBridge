<script setup lang="ts">
import { Head, router } from '@inertiajs/vue3';
import AppLayout from '@/layouts/AppLayout.vue';
import { type BreadcrumbItem } from '@/types';
import { ref, computed } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, UserPlus, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-vue-next';

interface Props {
    genders: string[];
}

const props = defineProps<Props>();

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'GP Dashboard',
        href: '/gp/dashboard',
    },
    {
        title: 'New Patient',
        href: '/gp/patients/new',
    },
];

// Form state
const form = ref({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    phone: '',
    weight_kg: '',
});

const isSubmitting = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

// Validation
const errors = ref<Record<string, string>>({});

const validateForm = (): boolean => {
    errors.value = {};
    
    if (!form.value.first_name.trim()) {
        errors.value.first_name = 'First name is required';
    }
    
    if (!form.value.last_name.trim()) {
        errors.value.last_name = 'Last name is required';
    }
    
    if (!form.value.date_of_birth) {
        errors.value.date_of_birth = 'Date of birth is required';
    } else {
        const dob = new Date(form.value.date_of_birth);
        const today = new Date();
        if (dob >= today) {
            errors.value.date_of_birth = 'Date of birth must be in the past';
        }
    }
    
    if (!form.value.gender) {
        errors.value.gender = 'Gender is required';
    }
    
    if (form.value.weight_kg) {
        const weight = parseFloat(form.value.weight_kg);
        if (isNaN(weight) || weight <= 0 || weight > 500) {
            errors.value.weight_kg = 'Weight must be between 0 and 500 kg';
        }
    }
    
    return Object.keys(errors.value).length === 0;
};

// Computed
const hasErrors = computed(() => Object.keys(errors.value).length > 0);

// Methods
const submitForm = async () => {
    if (!validateForm()) {
        return;
    }
    
    isSubmitting.value = true;
    errorMessage.value = '';
    successMessage.value = '';
    
    try {
        const response = await fetch('/gp/patients', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
            body: JSON.stringify({
                first_name: form.value.first_name.trim(),
                last_name: form.value.last_name.trim(),
                date_of_birth: form.value.date_of_birth,
                gender: form.value.gender,
                phone: form.value.phone.trim() || null,
                weight_kg: form.value.weight_kg ? parseFloat(form.value.weight_kg) : null,
            }),
        });
        
        const data = await response.json();
        
        if (data.success) {
            successMessage.value = `Patient ${data.patient.cpt} registered successfully!`;
            
            // Redirect to the clinical session after a short delay
            setTimeout(() => {
                if (data.redirect) {
                    window.location.href = data.redirect;
                } else {
                    router.visit('/gp/dashboard');
                }
            }, 1500);
        } else {
            errorMessage.value = data.message || 'Failed to register patient';
            if (data.errors) {
                errors.value = data.errors;
            }
        }
    } catch (error) {
        console.error('Registration error:', error);
        errorMessage.value = 'An error occurred while registering the patient. Please try again.';
    } finally {
        isSubmitting.value = false;
    }
};

const goBack = () => {
    router.visit('/gp/dashboard');
};

const clearError = (field: string) => {
    delete errors.value[field];
    errorMessage.value = '';
};
</script>

<template>
    <Head title="New Patient Registration" />
    
    <AppLayout :breadcrumbs="breadcrumbs">
        <div class="flex flex-col gap-6 p-6">
            <!-- Header -->
            <div class="flex items-center gap-4">
                <Button variant="ghost" size="sm" @click="goBack" class="gap-2">
                    <ArrowLeft class="h-4 w-4" />
                    Back to Dashboard
                </Button>
            </div>
            
            <!-- Page Title -->
            <div class="flex items-center gap-3">
                <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <UserPlus class="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 class="text-2xl font-semibold tracking-tight">New Patient Registration</h1>
                    <p class="text-muted-foreground">Register a new patient and create their initial clinical session</p>
                </div>
            </div>
            
            <!-- Alert Messages -->
            <Alert v-if="errorMessage" variant="destructive">
                <AlertCircle class="h-4 w-4" />
                <AlertDescription>{{ errorMessage }}</AlertDescription>
            </Alert>
            
            <Alert v-if="successMessage" class="border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200">
                <CheckCircle2 class="h-4 w-4 text-green-500" />
                <AlertDescription>{{ successMessage }}</AlertDescription>
            </Alert>
            
            <!-- Registration Form -->
            <Card class="max-w-2xl">
                <CardHeader>
                    <CardTitle>Patient Information</CardTitle>
                    <CardDescription>
                        Enter the patient's basic information. All fields marked with * are required.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form @submit.prevent="submitForm" class="space-y-6">
                        <!-- Name Row -->
                        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div class="space-y-2">
                                <Label for="first_name" class="required">First Name</Label>
                                <Input
                                    id="first_name"
                                    v-model="form.first_name"
                                    type="text"
                                    placeholder="Enter first name"
                                    :class="{ 'border-destructive': errors.first_name }"
                                    @input="clearError('first_name')"
                                    :disabled="isSubmitting"
                                />
                                <p v-if="errors.first_name" class="text-sm text-destructive">
                                    {{ errors.first_name }}
                                </p>
                            </div>
                            
                            <div class="space-y-2">
                                <Label for="last_name" class="required">Last Name</Label>
                                <Input
                                    id="last_name"
                                    v-model="form.last_name"
                                    type="text"
                                    placeholder="Enter last name"
                                    :class="{ 'border-destructive': errors.last_name }"
                                    @input="clearError('last_name')"
                                    :disabled="isSubmitting"
                                />
                                <p v-if="errors.last_name" class="text-sm text-destructive">
                                    {{ errors.last_name }}
                                </p>
                            </div>
                        </div>
                        
                        <!-- DOB and Gender Row -->
                        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div class="space-y-2">
                                <Label for="date_of_birth" class="required">Date of Birth</Label>
                                <Input
                                    id="date_of_birth"
                                    v-model="form.date_of_birth"
                                    type="date"
                                    :class="{ 'border-destructive': errors.date_of_birth }"
                                    @input="clearError('date_of_birth')"
                                    :disabled="isSubmitting"
                                />
                                <p v-if="errors.date_of_birth" class="text-sm text-destructive">
                                    {{ errors.date_of_birth }}
                                </p>
                            </div>
                            
                            <div class="space-y-2">
                                <Label for="gender" class="required">Gender</Label>
                                <Select
                                    v-model="form.gender"
                                    @update:model-value="clearError('gender')"
                                    :disabled="isSubmitting"
                                >
                                    <SelectTrigger :class="{ 'border-destructive': errors.gender }">
                                        <SelectValue placeholder="Select gender" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem
                                            v-for="genderOption in genders"
                                            :key="genderOption"
                                            :value="genderOption"
                                        >
                                            {{ genderOption.charAt(0).toUpperCase() + genderOption.slice(1) }}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <p v-if="errors.gender" class="text-sm text-destructive">
                                    {{ errors.gender }}
                                </p>
                            </div>
                        </div>
                        
                        <!-- Phone and Weight Row -->
                        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div class="space-y-2">
                                <Label for="phone">Phone Number</Label>
                                <Input
                                    id="phone"
                                    v-model="form.phone"
                                    type="tel"
                                    placeholder="Enter phone number (optional)"
                                    :disabled="isSubmitting"
                                />
                            </div>
                            
                            <div class="space-y-2">
                                <Label for="weight_kg">Weight (kg)</Label>
                                <Input
                                    id="weight_kg"
                                    v-model="form.weight_kg"
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="500"
                                    placeholder="Enter weight in kg (optional)"
                                    :class="{ 'border-destructive': errors.weight_kg }"
                                    @input="clearError('weight_kg')"
                                    :disabled="isSubmitting"
                                />
                                <p v-if="errors.weight_kg" class="text-sm text-destructive">
                                    {{ errors.weight_kg }}
                                </p>
                            </div>
                        </div>
                        
                        <!-- Submit Actions -->
                        <div class="flex items-center justify-end gap-4 pt-4 border-t">
                            <Button
                                type="button"
                                variant="outline"
                                @click="goBack"
                                :disabled="isSubmitting"
                            >
                                Cancel
                            </Button>
                            <Button type="submit" :disabled="isSubmitting">
                                <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
                                <UserPlus v-else class="mr-2 h-4 w-4" />
                                {{ isSubmitting ? 'Registering...' : 'Register Patient' }}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
            
            <!-- Help Text -->
            <div class="max-w-2xl text-sm text-muted-foreground">
                <p>
                    <strong>Note:</strong> Registering a new patient will automatically create an initial clinical session
                    in "In Review" state. You will be redirected to the session workspace after successful registration.
                </p>
            </div>
        </div>
    </AppLayout>
</template>

<style scoped>
.required::after {
    content: ' *';
    color: hsl(var(--destructive));
}
</style>
