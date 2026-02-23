<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { router } from '@inertiajs/vue3';
import AppLayout from '@/layouts/AppLayout.vue';
import { type BreadcrumbItem } from '@/types';
import { ref, onMounted, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, FileEdit, CheckCircle, XCircle, Clock, Upload, AlertCircle } from 'lucide-vue-next';
import DicomViewer from '@/components/radiology/DicomViewer.vue';

interface Study {
    id: number;
    study_uuid: string;
    modality: string;
    body_part: string;
    study_type: string;
    priority: string;
    status: string;
    clinical_indication: string;
    clinical_question: string;
    ordered_at: string;
    patient_cpt: string;
    ai_priority_score: number | null;
    ai_critical_flag: boolean;
    assigned_radiologist?: {
        id: number;
        name: string;
    };
    referring_user?: {
        id: number;
        name: string;
    };
    patient?: {
        id: number;
        cpt: string;
        first_name: string;
        last_name: string;
        date_of_birth: string;
        gender: string;
    };
    diagnostic_reports?: Array<{
        id: number;
        report_type: string;
        findings: string;
        impression: string;
        signed_at: string | null;
    }>;
}

const props = defineProps<{
    study: Study;
}>();

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Radiology Dashboard',
        href: '/radiology/dashboard',
    },
    {
        title: `Study ${props.study.study_uuid}`,
        href: `/radiology/studies/${props.study.id}`,
    },
];

const isLoading = ref(false);

// Image upload state
const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const uploadProgress = ref(0);
const uploadError = ref('');

const getPriorityColor = (priority: string) => {
    switch (priority) {
        case 'stat': return 'bg-red-500';
        case 'urgent': return 'bg-orange-500';
        case 'routine': return 'bg-yellow-500';
        case 'scheduled': return 'bg-green-500';
        default: return 'bg-gray-500';
    }
};

const getStatusColor = (status: string) => {
    switch (status) {
        case 'pending': return 'bg-gray-500';
        case 'ordered': return 'bg-blue-500';
        case 'in_progress': return 'bg-yellow-500';
        case 'completed': return 'bg-green-500';
        case 'reported': return 'bg-purple-500';
        default: return 'bg-gray-500';
    }
};

const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
};

const goBack = () => {
    router.visit('/radiology/dashboard');
};

const acceptStudy = async () => {
    isLoading.value = true;
    try {
        const response = await fetch(`/radiology/studies/${props.study.id}/accept`, {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
        });
        
        if (response.ok) {
            router.reload();
        }
    } catch (error) {
        console.error('Failed to accept study:', error);
    } finally {
        isLoading.value = false;
    }
};

// Image upload methods
const triggerFileUpload = () => {
    fileInput.value?.click();
};

const handleFileSelect = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    
    await uploadImage(file);
};

const uploadImage = async (file: File) => {
    uploadError.value = '';
    isUploading.value = true;
    uploadProgress.value = 0;
    
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        const response = await fetch(`/radiology/studies/${props.study.id}/upload-images`, {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
            body: formData,
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            router.reload();
        } else {
            uploadError.value = data.message || 'Failed to upload image';
        }
    } catch (error) {
        console.error('Upload failed:', error);
        uploadError.value = 'An error occurred during upload';
    } finally {
        isUploading.value = false;
    }
};
</script>

<template>
    <Head :title="`Study ${study.study_uuid}`" />
    
    <AppLayout :breadcrumbs="breadcrumbs">
        <div class="flex flex-col gap-6 p-6 w-full">
            <!-- Header -->
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <Button variant="ghost" size="sm" @click="goBack" class="gap-2">
                        <ArrowLeft class="h-4 w-4" />
                        Back to Dashboard
                    </Button>
                    <h1 class="text-2xl font-bold">Study Details</h1>
                </div>
                <div class="flex gap-2">
                    <Button v-if="!study.assigned_radiologist" @click="acceptStudy" :disabled="isLoading">
                        <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
                        Accept Study
                    </Button>
                    <Button v-if="study.assigned_radiologist && !study.images_uploaded" @click="triggerFileUpload" :disabled="isUploading">
                        <Loader2 v-if="isUploading" class="mr-2 h-4 w-4 animate-spin" />
                        Upload Images
                    </Button>
                    <input
                        ref="fileInput"
                        type="file"
                        accept=".dcm,.dicom,.jpg,.jpeg,.png,.tiff,.tif"
                        class="hidden"
                        @change="handleFileSelect"
                    />
                    <div v-if="uploadError" class="mt-2 flex items-center gap-2 text-red-500 text-sm">
                        <AlertCircle class="h-4 w-4" />
                        {{ uploadError }}
                    </div>
                </div>
            </div>
            
            <!-- Study Info Card -->
            <Card>
                <CardHeader>
                    <div class="flex items-center justify-between">
                        <div>
                            <CardTitle class="text-xl">{{ study.modality }} - {{ study.body_part }}</CardTitle>
                            <CardDescription>UUID: {{ study.study_uuid }}</CardDescription>
                        </div>
                        <div class="flex gap-2">
                            <Badge :class="getPriorityColor(study.priority)">
                                {{ study.priority.toUpperCase() }}
                            </Badge>
                            <Badge :class="getStatusColor(study.status)">
                                {{ study.status.replace('_', ' ').toUpperCase() }}
                            </Badge>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Patient Info -->
                        <div>
                            <h3 class="font-semibold mb-2">Patient Information</h3>
                            <div class="space-y-2 text-sm">
                                <div><span class="font-medium">CPT:</span> {{ study.patient_cpt }}</div>
                                <div v-if="study.patient">
                                    <span class="font-medium">Name:</span> {{ study.patient.first_name }} {{ study.patient.last_name }}
                                </div>
                                <div v-if="study.patient">
                                    <span class="font-medium">DOB:</span> {{ study.patient.date_of_birth }}
                                </div>
                                <div v-if="study.patient">
                                    <span class="font-medium">Gender:</span> {{ study.patient.gender }}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Study Info -->
                        <div>
                            <h3 class="font-semibold mb-2">Study Information</h3>
                            <div class="space-y-2 text-sm">
                                <div><span class="font-medium">Study Type:</span> {{ study.study_type }}</div>
                                <div><span class="font-medium">Ordered:</span> {{ formatDate(study.ordered_at) }}</div>
                                <div v-if="study.referring_user">
                                    <span class="font-medium">Referring:</span> {{ study.referring_user.name }}
                                </div>
                                <div v-if="study.assigned_radiologist">
                                    <span class="font-medium">Assigned to:</span> {{ study.assigned_radiologist.name }}
                                </div>
                                <div v-if="study.ai_priority_score !== null">
                                    <span class="font-medium">AI Priority:</span> {{ study.ai_priority_score }}
                                    <span v-if="study.ai_critical_flag" class="ml-2 text-red-500 font-bold">CRITICAL</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Clinical Info -->
                        <div class="md:col-span-2">
                            <h3 class="font-semibold mb-2">Clinical Information</h3>
                            <div class="space-y-2 text-sm">
                                <div>
                                    <span class="font-medium">Clinical Indication:</span>
                                    <p class="mt-1 p-2 bg-muted rounded">{{ study.clinical_indication }}</p>
                                </div>
                                <div v-if="study.clinical_question">
                                    <span class="font-medium">Clinical Question:</span>
                                    <p class="mt-1 p-2 bg-muted rounded">{{ study.clinical_question }}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
            
            <!-- Image Viewer Section -->
            <Card v-if="study.images_uploaded">
                <CardHeader>
                    <CardTitle class="flex items-center gap-2">
                        <Upload class="h-5 w-5" />
                        Study Images
                    </CardTitle>
                    <CardDescription>
                        DICOM images uploaded on {{ formatDate(study.images_available_at) }}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <!-- DICOM Viewer Component -->
                    <DicomViewer :study-id="study.id" />
                </CardContent>
            </Card>
            
            <!-- Reports Section -->
            <Card v-if="study.diagnostic_reports && study.diagnostic_reports.length > 0">
                <CardHeader>
                    <CardTitle>Diagnostic Reports</CardTitle>
                </CardHeader>
                <CardContent>
                    <div v-for="report in study.diagnostic_reports" :key="report.id" class="border-b pb-4 mb-4 last:border-0">
                        <div class="flex items-center justify-between mb-2">
                            <Badge variant="outline">{{ report.report_type }}</Badge>
                            <div class="flex items-center gap-2 text-sm">
                                <CheckCircle v-if="report.signed_at" class="h-4 w-4 text-green-500" />
                                <XCircle v-else class="h-4 w-4 text-red-500" />
                                <span>{{ report.signed_at ? 'Signed' : 'Unsigned' }}</span>
                                <span v-if="report.signed_at">- {{ formatDate(report.signed_at) }}</span>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <div>
                                <span class="font-medium">Findings:</span>
                                <p class="mt-1 p-2 bg-muted rounded whitespace-pre-wrap">{{ report.findings }}</p>
                            </div>
                            <div>
                                <span class="font-medium">Impression:</span>
                                <p class="mt-1 p-2 bg-muted rounded whitespace-pre-wrap">{{ report.impression }}</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    </AppLayout>
</template>
