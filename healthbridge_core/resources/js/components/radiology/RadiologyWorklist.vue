<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { router } from '@inertiajs/vue3';

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

const props = defineProps<{
    initialStudies?: Study[];
}>();

const emit = defineEmits<{
    (e: 'select', studyId: number): void;
}>();

// State
const studies = ref<Study[]>(props.initialStudies || []);
const isLoading = ref(false);
const pollingInterval = ref<number | null>(null);

// Filters
const filters = ref({
    status: '',
    priority: '',
    modality: '',
    assignedToMe: false,
    unassigned: false,
});

// Computed
const filteredStudies = computed(() => {
    let result = studies.value;

    if (filters.value.status) {
        result = result.filter(s => s.status === filters.value.status);
    }

    if (filters.value.priority) {
        result = result.filter(s => s.priority === filters.value.priority);
    }

    if (filters.value.modality) {
        result = result.filter(s => s.modality === filters.value.modality);
    }

    return result;
});

// Methods
const loadStudies = async () => {
    isLoading.value = true;
    try {
        const params = new URLSearchParams();
        if (filters.value.status) params.append('status', filters.value.status);
        if (filters.value.priority) params.append('priority', filters.value.priority);
        if (filters.value.modality) params.append('modality', filters.value.modality);
        if (filters.value.assignedToMe) params.append('assigned_to_me', 'true');
        if (filters.value.unassigned) params.append('unassigned', 'true');

        const response = await fetch(`/radiology/worklist?${params.toString()}`);
        const data = await response.json();
        studies.value = data.data || data;
    } catch (error) {
        console.error('Failed to load studies:', error);
    } finally {
        isLoading.value = false;
    }
};

const acceptStudy = async (studyId: number) => {
    try {
        const response = await fetch(`/radiology/studies/${studyId}/accept`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
        });

        if (response.ok) {
            await loadStudies();
        }
    } catch (error) {
        console.error('Failed to accept study:', error);
    }
};

const selectStudy = (study: Study) => {
    emit('select', study.id);
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

const getPriorityLabel = (priority: string) => {
    switch (priority) {
        case 'stat':
            return 'STAT';
        case 'urgent':
            return 'Urgent';
        case 'routine':
            return 'Routine';
        case 'scheduled':
            return 'Scheduled';
        default:
            return priority;
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

// Lifecycle
onMounted(() => {
    loadStudies();
    // Auto-refresh every 30 seconds
    pollingInterval.value = window.setInterval(loadStudies, 30000);
});

onUnmounted(() => {
    if (pollingInterval.value) {
        clearInterval(pollingInterval.value);
    }
});
</script>

<template>
    <div class="flex h-full flex-col rounded-lg border bg-card">
        <!-- Header -->
        <div class="flex items-center justify-between border-b p-4">
            <h2 class="text-lg font-semibold">Radiology Worklist</h2>
            <div class="flex gap-2">
                <!-- Filters -->
                <select
                    v-model="filters.priority"
                    class="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    @change="loadStudies"
                >
                    <option value="">All Priorities</option>
                    <option value="stat">STAT</option>
                    <option value="urgent">Urgent</option>
                    <option value="routine">Routine</option>
                    <option value="scheduled">Scheduled</option>
                </select>

                <select
                    v-model="filters.modality"
                    class="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    @change="loadStudies"
                >
                    <option value="">All Modalities</option>
                    <option value="CT">CT</option>
                    <option value="MRI">MRI</option>
                    <option value="XRAY">X-Ray</option>
                    <option value="ULTRASOUND">Ultrasound</option>
                    <option value="PET">PET</option>
                    <option value="MAMMO">Mammography</option>
                </select>

                <label class="flex items-center gap-2 text-sm">
                    <input
                        v-model="filters.assignedToMe"
                        type="checkbox"
                        class="rounded border-gray-300"
                        @change="loadStudies"
                    />
                    My Studies
                </label>

                <label class="flex items-center gap-2 text-sm">
                    <input
                        v-model="filters.unassigned"
                        type="checkbox"
                        class="rounded border-gray-300"
                        @change="loadStudies"
                    />
                    Unassigned
                </label>

                <button
                    class="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                    @click="loadStudies"
                >
                    Refresh
                </button>
            </div>
        </div>

        <!-- Study List -->
        <div class="flex-1 overflow-auto">
            <div v-if="isLoading" class="flex h-full items-center justify-center">
                <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            </div>

            <div v-else-if="filteredStudies.length === 0" class="flex h-full items-center justify-center text-muted-foreground">
                No studies found
            </div>

            <table v-else class="w-full">
                <thead class="sticky top-0 bg-muted/95">
                    <tr class="text-left text-sm">
                        <th class="p-3 font-medium">Priority</th>
                        <th class="p-3 font-medium">Modality</th>
                        <th class="p-3 font-medium">Body Part</th>
                        <th class="p-3 font-medium">Study Type</th>
                        <th class="p-3 font-medium">Clinical Indication</th>
                        <th class="p-3 font-medium">Referring</th>
                        <th class="p-3 font-medium">Radiologist</th>
                        <th class="p-3 font-medium">Waiting</th>
                        <th class="p-3 font-medium">AI Score</th>
                        <th class="p-3 font-medium">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="study in filteredStudies"
                        :key="study.id"
                        class="cursor-pointer border-b hover:bg-muted/50"
                        :class="{ 'bg-red-50': study.is_overdue, 'bg-red-50/50': study.ai_critical_flag }"
                        @click="selectStudy(study)"
                    >
                        <td class="p-3">
                            <span
                                class="rounded-full px-2 py-1 text-xs font-medium text-white"
                                :class="getPriorityColor(study.priority)"
                            >
                                {{ getPriorityLabel(study.priority) }}
                            </span>
                        </td>
                        <td class="p-3 text-sm">{{ study.modality }}</td>
                        <td class="p-3 text-sm">{{ study.body_part }}</td>
                        <td class="p-3 text-sm">{{ study.study_type }}</td>
                        <td class="p-3 text-sm max-w-xs truncate">{{ study.clinical_indication }}</td>
                        <td class="p-3 text-sm">{{ study.referring_user?.name || '-' }}</td>
                        <td class="p-3 text-sm">{{ study.assigned_radiologist?.name || 'Unassigned' }}</td>
                        <td class="p-3 text-sm">
                            <span :class="{ 'text-red-600 font-medium': study.is_overdue }">
                                {{ formatWaitingTime(study.waiting_time) }}
                            </span>
                        </td>
                        <td class="p-3 text-sm">
                            <span v-if="study.ai_priority_score !== null" class="font-medium">
                                {{ study.ai_priority_score }}
                            </span>
                            <span v-else class="text-muted-foreground">-</span>
                            <span v-if="study.ai_critical_flag" class="ml-1 text-red-500">⚠️</span>
                        </td>
                        <td class="p-3">
                            <button
                                v-if="!study.assigned_radiologist"
                                class="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                                @click.stop="acceptStudy(study.id)"
                            >
                                Accept
                            </button>
                            <span v-else class="text-sm text-muted-foreground">
                                {{ study.status }}
                            </span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
