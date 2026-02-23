<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { router } from '@inertiajs/vue3';
import AppLayout from '@/layouts/AppLayout.vue';
import { type BreadcrumbItem } from '@/types';
import { ref, computed } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowLeft, FilePlus, AlertCircle, CheckCircle2 } from 'lucide-vue-next';

interface Patient {
    id: number;
    cpt: string;
    full_name: string;
    date_of_birth: string;
    gender: string;
}

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Radiology Dashboard',
        href: '/radiology/dashboard',
    },
    {
        title: 'New Study',
        href: '/radiology/studies/new',
    },
];

// Form state
const isSubmitting = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const errors = ref<Record<string, string>>({});

// Form data
const formData = ref({
    patient_cpt: '',
    modality: '',
    body_part: '',
    study_type: '',
    clinical_indication: '',
    clinical_question: '',
    priority: 'routine',
});

// Options
const modalities = [
    { value: 'CT', label: 'CT (Computed Tomography)' },
    { value: 'MRI', label: 'MRI (Magnetic Resonance Imaging)' },
    { value: 'XRAY', label: 'X-Ray' },
    { value: 'ULTRASOUND', label: 'Ultrasound' },
    { value: 'PET', label: 'PET (Positron Emission Tomography)' },
    { value: 'MAMMO', label: 'Mammography' },
    { value: 'FLUORO', label: 'Fluoroscopy' },
    { value: 'ANGIO', label: 'Angiography' },
];

const bodyParts = [
    { value: 'Head', label: 'Head/Brain' },
    { value: 'Neck', label: 'Neck' },
    { value: 'Chest', label: 'Chest' },
    { value: 'Abdomen', label: 'Abdomen' },
    { value: 'Pelvis', label: 'Pelvis' },
    { value: 'Spine', label: 'Spine' },
    { value: 'Upper Extremity', label: 'Upper Extremity' },
    { value: 'Lower Extremity', label: 'Lower Extremity' },
    { value: 'Vascular', label: 'Vascular' },
    { value: 'Cardiac', label: 'Cardiac' },
];

const studyTypes: Record<string, string[]> = {
    CT: ['CT Head', 'CT Chest', 'CT Abdomen/Pelvis', 'CT Angiography', 'CT Spine', 'CT Cardiac'],
    MRI: ['MRI Brain', 'MRI Spine', 'MRI Joint', 'MRI Abdomen', 'MRI Pelvis', 'MR Angiography'],
    XRAY: ['Chest PA/AP', 'Chest Lateral', 'Abdomen AP', 'Bone Series', 'Skull', 'Sinus'],
    ULTRASOUND: ['Abdominal', 'Pelvic', 'Thyroid', 'Breast', 'Vascular', 'Obstetric'],
    PET: ['PET/CT Whole Body', 'PET Brain', 'PET Cardiac'],
    MAMMO: ['Screening Diagnostic', 'Diagnostic', 'BI-RADS'],
    FLUORO: ['Upper GI', 'Lower GI', 'Barium Swallow', 'Hysterosalpingogram'],
    ANGIO: ['Cerebral', 'Carotid', 'Coronary', 'Peripheral', 'Pulmonary'],
};

const priorities = [
    { value: 'stat', label: 'STAT (Immediate)' },
    { value: 'urgent', label: 'Urgent (< 4 hours)' },
    { value: 'routine', label: 'Routine (< 24 hours)' },
    { value: 'scheduled', label: 'Scheduled (Appointment)' },
];

// Computed
const availableStudyTypes = computed(() => {
    if (!formData.value.modality) return [];
    return studyTypes[formData.value.modality] || [];
});

// Methods
const validateForm = (): boolean => {
    errors.value = {};
    
    if (!formData.value.patient_cpt.trim()) {
        errors.value.patient_cpt = 'Patient CPT is required';
    }
    if (!formData.value.modality) {
        errors.value.modality = 'Modality is required';
    }
    if (!formData.value.body_part) {
        errors.value.body_part = 'Body part is required';
    }
    if (!formData.value.study_type) {
        errors.value.study_type = 'Study type is required';
    }
    if (!formData.value.clinical_indication.trim()) {
        errors.value.clinical_indication = 'Clinical indication is required';
    }
    
    return Object.keys(errors.value).length === 0;
};

const submitForm = async () => {
    if (!validateForm()) {
        return;
    }
    
    isSubmitting.value = true;
    errorMessage.value = '';
    successMessage.value = '';
    
    try {
        const response = await fetch('/radiology/studies', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
            body: JSON.stringify(formData.value),
        });
        
        const data = await response.json();
        
        if (response.ok && data.study) {
            successMessage.value = 'Study created successfully!';
            setTimeout(() => {
                router.visit('/radiology/dashboard');
            }, 1500);
        } else {
            errorMessage.value = data.message || 'Failed to create study';
            if (data.errors) {
                errors.value = data.errors;
            }
        }
    } catch (error) {
        console.error('Error creating study:', error);
        errorMessage.value = 'An error occurred while creating the study. Please try again.';
    } finally {
        isSubmitting.value = false;
    }
};

const goBack = () => {
    router.visit('/radiology/dashboard');
};

const clearError = (field: string) => {
    delete errors.value[field];
    errorMessage.value = '';
};
</script>

<template>
    <Head title="New Radiology Study" />
    
    <AppLayout :breadcrumbs="breadcrumbs">
        <div class="flex flex-col gap-6 p-6 w-full">
            <!-- Header -->
            <div class="flex items-center gap-4">
                <Button variant="ghost" size="sm" @click="goBack" class="gap-2">
                    <ArrowLeft class="h-4 w-4" />
                    Back to Dashboard
                </Button>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle class="flex items-center gap-2">
                        <FilePlus class="h-5 w-5" />
                        Create New Radiology Study
                    </CardTitle>
                    <CardDescription>
                        Enter the study details to order a new radiology imaging study
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form @submit.prevent="submitForm" class="space-y-6">
                        <!-- Error Alert -->
                        <Alert v-if="errorMessage" variant="destructive">
                            <AlertCircle class="h-4 w-4" />
                            <AlertDescription>{{ errorMessage }}</AlertDescription>
                        </Alert>
                        
                        <!-- Success Alert -->
                        <Alert v-if="successMessage" class="border-green-500 bg-green-50">
                            <CheckCircle2 class="h-4 w-4 text-green-500" />
                            <AlertDescription class="text-green-700">{{ successMessage }}</AlertDescription>
                        </Alert>
                        
                        <!-- Patient Selection -->
                        <div class="space-y-2">
                            <Label for="patient_cpt">Patient CPT <span class="text-red-500">*</span></Label>
                            <Input
                                id="patient_cpt"
                                v-model="formData.patient_cpt"
                                placeholder="e.g., CPT-2026-00001"
                                :class="{ 'border-red-500': errors.patient_cpt }"
                                @input="clearError('patient_cpt')"
                            />
                            <p class="text-sm text-muted-foreground">Enter the patient's CPT ID</p>
                            <p v-if="errors.patient_cpt" class="text-sm text-red-500">{{ errors.patient_cpt }}</p>
                        </div>
                        
                        <!-- Modality -->
                        <div class="space-y-2">
                            <Label for="modality">Modality <span class="text-red-500">*</span></Label>
                            <Select v-model="formData.modality">
                                <SelectTrigger id="modality" :class="{ 'border-red-500': errors.modality }">
                                    <SelectValue placeholder="Select modality" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="mod in modalities" :key="mod.value" :value="mod.value">
                                        {{ mod.label }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <p v-if="errors.modality" class="text-sm text-red-500">{{ errors.modality }}</p>
                        </div>
                        
                        <!-- Body Part -->
                        <div class="space-y-2">
                            <Label for="body_part">Body Part <span class="text-red-500">*</span></Label>
                            <Select v-model="formData.body_part">
                                <SelectTrigger id="body_part" :class="{ 'border-red-500': errors.body_part }">
                                    <SelectValue placeholder="Select body part" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="part in bodyParts" :key="part.value" :value="part.value">
                                        {{ part.label }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <p v-if="errors.body_part" class="text-sm text-red-500">{{ errors.body_part }}</p>
                        </div>
                        
                        <!-- Study Type -->
                        <div class="space-y-2">
                            <Label for="study_type">Study Type <span class="text-red-500">*</span></Label>
                            <Select v-model="formData.study_type" :disabled="!formData.modality">
                                <SelectTrigger id="study_type" :class="{ 'border-red-500': errors.study_type }">
                                    <SelectValue placeholder="Select study type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="type in availableStudyTypes" :key="type" :value="type">
                                        {{ type }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <p v-if="errors.study_type" class="text-sm text-red-500">{{ errors.study_type }}</p>
                        </div>
                        
                        <!-- Priority -->
                        <div class="space-y-2">
                            <Label for="priority">Priority</Label>
                            <Select v-model="formData.priority">
                                <SelectTrigger id="priority">
                                    <SelectValue placeholder="Select priority" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="p in priorities" :key="p.value" :value="p.value">
                                        {{ p.label }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <!-- Clinical Indication -->
                        <div class="space-y-2">
                            <Label for="clinical_indication">Clinical Indication <span class="text-red-500">*</span></Label>
                            <textarea
                                id="clinical_indication"
                                v-model="formData.clinical_indication"
                                rows="3"
                                class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="Enter the clinical reason for this study..."
                                :class="{ 'border-red-500': errors.clinical_indication }"
                                @input="clearError('clinical_indication')"
                            ></textarea>
                            <p v-if="errors.clinical_indication" class="text-sm text-red-500">{{ errors.clinical_indication }}</p>
                        </div>
                        
                        <!-- Clinical Question -->
                        <div class="space-y-2">
                            <Label for="clinical_question">Clinical Question (Optional)</Label>
                            <textarea
                                id="clinical_question"
                                v-model="formData.clinical_question"
                                rows="2"
                                class="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="Specific question to be answered by this study..."
                            ></textarea>
                        </div>
                        
                        <!-- Submit Button -->
                        <div class="flex justify-end gap-4">
                            <Button type="button" variant="outline" @click="goBack">
                                Cancel
                            </Button>
                            <Button type="submit" :disabled="isSubmitting">
                                <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
                                {{ isSubmitting ? 'Creating...' : 'Create Study' }}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    </AppLayout>
</template>
