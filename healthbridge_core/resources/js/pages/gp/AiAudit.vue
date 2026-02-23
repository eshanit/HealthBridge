<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import AppLayout from '@/layouts/AppLayout.vue';
import { type BreadcrumbItem } from '@/types';
import { ref, computed } from 'vue';

interface AiRequest {
    id: number;
    request_uuid: string;
    user_id: number;
    user?: {
        name: string;
    };
    session_couch_id: string | null;
    session?: {
        couch_id: string;
    };
    patient_cpt: string | null;
    task: string | null;
    use_case: string | null;
    prompt_version: string | null;
    model: string | null;
    model_version: string | null;
    latency_ms: number | null;
    was_overridden: boolean;
    risk_flags: string[] | null;
    prompt: string | null;
    response: string | null;
    requested_at: string;
    created_at: string;
    updated_at: string;
}

interface Patient {
    id: number;
    couch_id: string;
    cpt: string;
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    gender: string | null;
}

interface Props {
    aiRequests: {
        data: AiRequest[];
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
        links: Array<{
            url: string | null;
            label: string;
            active: boolean;
        }>;
    };
    patient: Patient | null;
    filters: {
        patient: string | null;
    };
}

const props = defineProps<Props>();

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'GP Dashboard',
        href: '/gp/dashboard',
    },
    {
        title: 'AI Audit Log',
        href: '/gp/audit/ai',
    },
];

const selectedRequest = ref<AiRequest | null>(null);

const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
};

const formatLatency = (ms: number | null) => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
};

const getTaskBadgeClass = (task: string | null) => {
    switch (task) {
        case 'triage':
            return 'bg-red-100 text-red-800';
        case 'diagnosis':
            return 'bg-blue-100 text-blue-800';
        case 'treatment':
            return 'bg-green-100 text-green-800';
        case 'prescription':
            return 'bg-purple-100 text-purple-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
};

const viewDetails = (request: AiRequest) => {
    selectedRequest.value = request;
};

const closeDetails = () => {
    selectedRequest.value = null;
};

const getPatientName = () => {
    if (props.patient) {
        return `${props.patient.first_name} ${props.patient.last_name}`;
    }
    if (props.filters.patient) {
        return props.filters.patient;
    }
    return 'All Patients';
};
</script>

<template>
    <Head title="AI Audit Log" />

    <AppLayout :breadcrumbs="breadcrumbs">
        <div class="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
            <!-- Header -->
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-2xl font-bold text-gray-900">AI Audit Log</h1>
                    <p class="text-sm text-gray-500">
                        Viewing AI requests for: <span class="font-medium">{{ getPatientName() }}</span>
                    </p>
                </div>
                <div class="text-sm text-gray-500">
                    Total Requests: {{ props.aiRequests.total }}
                </div>
            </div>

            <!-- Filter Info -->
            <div v-if="props.filters.patient" class="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                <span class="font-medium">Filtered by patient:</span> {{ props.filters.patient }}
                <a href="/gp/audit/ai" class="ml-2 text-blue-600 underline hover:text-blue-800">
                    Clear filter
                </a>
            </div>

            <!-- Requests Table -->
            <div class="flex-1 overflow-auto rounded-lg border border-gray-200 bg-white">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                Timestamp
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                User
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                Task
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                Use Case
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                Model
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                Latency
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                Overridden
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                Risk Flags
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 bg-white">
                        <tr v-for="request in props.aiRequests.data" :key="request.id" class="hover:bg-gray-50">
                            <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                                {{ formatDate(request.requested_at) }}
                            </td>
                            <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                                {{ request.user?.name || 'System' }}
                            </td>
                            <td class="whitespace-nowrap px-6 py-4">
                                <span
                                    :class="[
                                        'inline-flex rounded-full px-2 text-xs font-semibold leading-5',
                                        getTaskBadgeClass(request.task)
                                    ]"
                                >
                                    {{ request.task || '-' }}
                                </span>
                            </td>
                            <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                {{ request.use_case || '-' }}
                            </td>
                            <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                {{ request.model || '-' }}
                            </td>
                            <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                {{ formatLatency(request.latency_ms) }}
                            </td>
                            <td class="whitespace-nowrap px-6 py-4">
                                <span
                                    :class="[
                                        'inline-flex rounded-full px-2 text-xs font-semibold leading-5',
                                        request.was_overridden ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                                    ]"
                                >
                                    {{ request.was_overridden ? 'Yes' : 'No' }}
                                </span>
                            </td>
                            <td class="whitespace-nowrap px-6 py-4">
                                <span v-if="request.risk_flags && request.risk_flags.length > 0" class="text-sm text-red-600">
                                    {{ request.risk_flags.length }} flag(s)
                                </span>
                                <span v-else class="text-sm text-gray-400">-</span>
                            </td>
                            <td class="whitespace-nowrap px-6 py-4 text-sm">
                                <button
                                    @click="viewDetails(request)"
                                    class="text-blue-600 hover:text-blue-900"
                                >
                                    View
                                </button>
                            </td>
                        </tr>
                        <tr v-if="props.aiRequests.data.length === 0">
                            <td colspan="9" class="px-6 py-8 text-center text-sm text-gray-500">
                                No AI requests found.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Pagination -->
            <div v-if="props.aiRequests.last_page > 1" class="flex justify-center">
                <nav class="flex items-center gap-1">
                    <template v-for="link in props.aiRequests.links" :key="link.label">
                        <a
                            v-if="link.url"
                            :href="link.url"
                            :class="[
                                'px-3 py-1 text-sm',
                                link.active
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-700 hover:bg-gray-100'
                            ]"
                            v-html="link.label"
                        />
                    </template>
                </nav>
            </div>
        </div>

        <!-- Details Modal -->
        <div
            v-if="selectedRequest"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
            @click.self="closeDetails"
        >
            <div class="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg bg-white p-6">
                <div class="mb-4 flex items-center justify-between">
                    <h2 class="text-xl font-bold">AI Request Details</h2>
                    <button
                        @click="closeDetails"
                        class="text-gray-400 hover:text-gray-600"
                    >
                        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="text-sm font-medium text-gray-500">Request UUID</label>
                        <p class="text-sm text-gray-900">{{ selectedRequest.request_uuid }}</p>
                    </div>
                    <div>
                        <label class="text-sm font-medium text-gray-500">Timestamp</label>
                        <p class="text-sm text-gray-900">{{ formatDate(selectedRequest.requested_at) }}</p>
                    </div>
                    <div>
                        <label class="text-sm font-medium text-gray-500">User</label>
                        <p class="text-sm text-gray-900">{{ selectedRequest.user?.name || 'System' }}</p>
                    </div>
                    <div>
                        <label class="text-sm font-medium text-gray-500">Session</label>
                        <p class="text-sm text-gray-900">{{ selectedRequest.session_couch_id || '-' }}</p>
                    </div>
                    <div>
                        <label class="text-sm font-medium text-gray-500">Task</label>
                        <p class="text-sm text-gray-900">{{ selectedRequest.task || '-' }}</p>
                    </div>
                    <div>
                        <label class="text-sm font-medium text-gray-500">Use Case</label>
                        <p class="text-sm text-gray-900">{{ selectedRequest.use_case || '-' }}</p>
                    </div>
                    <div>
                        <label class="text-sm font-medium text-gray-500">Model</label>
                        <p class="text-sm text-gray-900">{{ selectedRequest.model || '-' }}</p>
                    </div>
                    <div>
                        <label class="text-sm font-medium text-gray-500">Model Version</label>
                        <p class="text-sm text-gray-900">{{ selectedRequest.model_version || '-' }}</p>
                    </div>
                    <div>
                        <label class="text-sm font-medium text-gray-500">Latency</label>
                        <p class="text-sm text-gray-900">{{ formatLatency(selectedRequest.latency_ms) }}</p>
                    </div>
                    <div>
                        <label class="text-sm font-medium text-gray-500">Was Overridden</label>
                        <p class="text-sm text-gray-900">{{ selectedRequest.was_overridden ? 'Yes' : 'No' }}</p>
                    </div>
                </div>

                <div v-if="selectedRequest.risk_flags && selectedRequest.risk_flags.length > 0" class="mt-4">
                    <label class="text-sm font-medium text-gray-500">Risk Flags</label>
                    <div class="mt-1 flex flex-wrap gap-2">
                        <span
                            v-for="flag in selectedRequest.risk_flags"
                            :key="flag"
                            class="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800"
                        >
                            {{ flag }}
                        </span>
                    </div>
                </div>

                <!-- AI Response Section -->
                <div v-if="selectedRequest.response" class="mt-4">
                    <label class="text-sm font-medium text-gray-500">AI Response</label>
                    <div class="mt-1 max-h-64 overflow-auto rounded-lg bg-gray-50 p-4">
                        <pre class="whitespace-pre-wrap text-sm text-gray-900">{{ selectedRequest.response }}</pre>
                    </div>
                </div>

                <!-- Prompt Section -->
                <div v-if="selectedRequest.prompt" class="mt-4">
                    <label class="text-sm font-medium text-gray-500">Prompt</label>
                    <div class="mt-1 max-h-64 overflow-auto rounded-lg bg-gray-50 p-4">
                        <pre class="whitespace-pre-wrap text-sm text-gray-900">{{ selectedRequest.prompt }}</pre>
                    </div>
                </div>
            </div>
        </div>
    </AppLayout>
</template>
