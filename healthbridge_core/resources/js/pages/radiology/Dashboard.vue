<script setup lang="ts">
import { Head, router } from '@inertiajs/vue3';
import { Link } from '@inertiajs/vue3';
import AppLayout from '@/layouts/AppLayout.vue';
import { type BreadcrumbItem } from '@/types';
import RadiologyWorklist from '@/components/radiology/RadiologyWorklist.vue';
import { Button } from '@/components/ui/button';
import { ref } from 'vue';
import { UserPlus, FilePlus } from 'lucide-vue-next';

interface Study {
    id: number;
    study_uuid: string;
    modality: string;
    body_part: string;
    study_type: string;
    priority: 'stat' | 'urgent' | 'routine' | 'scheduled';
    status: string;
    clinical_indication: string;
    ordered_at: string;
    patient_cpt: string;
    ai_priority_score: number | null;
    ai_critical_flag: boolean;
    waiting_time: number;
    is_overdue: boolean;
    referring_user?: {
        name: string;
    };
    assigned_radiologist?: {
        name: string;
    };
}

interface Stats {
    pending_studies: number;
    my_studies: number;
    critical_studies: number;
    completed_today: number;
    reports_pending: number;
}

const props = defineProps<{
    stats: Stats;
    recentStudies: Study[];
}>();

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Radiology Dashboard',
        href: '/radiology/dashboard',
    },
];

// State
const selectedStudyId = ref<number | null>(null);
const isLoading = ref(false);

// Methods
const selectStudy = (studyId: number) => {
    router.visit(`/radiology/studies/${studyId}`);
};

const getPriorityColor = (priority: string) => {
    switch (priority) {
        case 'stat':
            return 'bg-red-500';
        case 'urgent':
            return 'bg-orange-500';
        case 'routine':
            return 'bg-yellow-500';
        case 'scheduled':
            return 'bg-green-500';
        default:
            return 'bg-gray-500';
    }
};

const getStatusColor = (status: string) => {
    switch (status) {
        case 'pending':
            return 'text-gray-500';
        case 'ordered':
            return 'text-blue-500';
        case 'in_progress':
            return 'text-yellow-500';
        case 'completed':
            return 'text-green-500';
        case 'reported':
            return 'text-purple-500';
        default:
            return 'text-gray-500';
    }
};

const formatWaitingTime = (minutes: number) => {
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
};
</script>

<template>
    <Head title="Radiology Dashboard" />

    <AppLayout :breadcrumbs="breadcrumbs">
        <div class="flex h-full flex-1 flex-col gap-6 p-6">
            <!-- Header with Register Patient Button -->
            <div class="flex items-center justify-between">
                <h1 class="text-2xl font-bold">Radiology Dashboard</h1>
                <div class="flex gap-2">
                    <Link href="/radiology/studies/new">
                        <Button class="gap-2">
                            <FilePlus class="h-4 w-4" />
                            New Study
                        </Button>
                    </Link>
                    <Link href="/patients/new">
                        <Button variant="outline" class="gap-2">
                            <UserPlus class="h-4 w-4" />
                            Register Patient
                        </Button>
                    </Link>
                </div>
            </div>

            <!-- Stats Cards -->
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div class="rounded-lg border bg-card p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-muted-foreground">Pending Studies</p>
                            <p class="text-2xl font-bold">{{ stats.pending_studies }}</p>
                        </div>
                        <div class="rounded-full bg-blue-100 p-3">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div class="rounded-lg border bg-card p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-muted-foreground">My Studies</p>
                            <p class="text-2xl font-bold">{{ stats.my_studies }}</p>
                        </div>
                        <div class="rounded-full bg-purple-100 p-3">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div class="rounded-lg border bg-card p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-muted-foreground">Critical (AI)</p>
                            <p class="text-2xl font-bold">{{ stats.critical_studies }}</p>
                        </div>
                        <div class="rounded-full bg-red-100 p-3">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div class="rounded-lg border bg-card p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-muted-foreground">Completed Today</p>
                            <p class="text-2xl font-bold">{{ stats.completed_today }}</p>
                        </div>
                        <div class="rounded-full bg-green-100 p-3">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div class="rounded-lg border bg-card p-6 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-muted-foreground">Reports Pending</p>
                            <p class="text-2xl font-bold">{{ stats.reports_pending }}</p>
                        </div>
                        <div class="rounded-full bg-yellow-100 p-3">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Worklist -->
            <div class="flex flex-1 flex-col">
                <RadiologyWorklist 
                    :initial-studies="recentStudies"
                    @select="selectStudy"
                />
            </div>
        </div>
    </AppLayout>
</template>
