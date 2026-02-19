<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import axios from 'axios';

interface PatientSummary {
    couch_id: string;
    cpt: string;
    full_name: string;
    age: number;
    gender: string;
    triage_priority: 'red' | 'yellow' | 'green' | null;
    status: string;
    waiting_minutes?: number;
    danger_signs?: string[];
    last_updated: string;
}

interface Referral {
    id: number;
    couch_id: string; // Session's couch_id - used for accept/reject endpoints
    patient: PatientSummary;
    referred_by: string;
    referral_notes: string;
    created_at: string;
}

interface Props {
    selectedPatientId: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'select', patientId: string): void;
    (e: 'accept', referralId: number): void;
    (e: 'reject', referralId: number): void;
}>();

// Tab state
const activeTab = ref('referrals');

// Referrals data
const highPriorityReferrals = ref<Referral[]>([]);
const normalReferrals = ref<Referral[]>([]);
const referralsLoading = ref(false);

// My Cases data
const myCases = ref<PatientSummary[]>([]);
const myCasesLoading = ref(false);
const myCasesPagination = ref({
    current_page: 1,
    last_page: 1,
    total: 0,
});

// All Patients data
const allPatients = ref<PatientSummary[]>([]);
const allPatientsLoading = ref(false);
const allPatientsPagination = ref({
    current_page: 1,
    last_page: 1,
    total: 0,
});

// Filter state
const searchQuery = ref('');
const activeFilter = ref<string | null>(null);

const triageFilters = [
    { value: 'red', label: 'Red' },
    { value: 'yellow', label: 'Yellow' },
    { value: 'green', label: 'Green' },
];

// Computed counts
const referralCount = computed(() => highPriorityReferrals.value.length + normalReferrals.value.length);
const myCasesCount = computed(() => myCasesPagination.value.total);
const allPatientsCount = computed(() => allPatientsPagination.value.total);

// Triage badge styling
const triageBadgeVariant = {
    red: 'destructive',
    yellow: 'secondary',
    green: 'default',
} as const;

// Format waiting time
const formatWaitingTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
};

// Fetch referrals
const fetchReferrals = async () => {
    referralsLoading.value = true;
    try {
        const response = await axios.get('/gp/referrals/json', {
            params: { search: searchQuery.value || undefined }
        });
        // The API returns { referrals: { high_priority: [], normal_priority: [] } }
        highPriorityReferrals.value = response.data.referrals?.high_priority || [];
        normalReferrals.value = response.data.referrals?.normal_priority || [];
    } catch (error) {
        console.error('Failed to fetch referrals:', error);
    } finally {
        referralsLoading.value = false;
    }
};

// Fetch my cases
const fetchMyCases = async (page = 1) => {
    myCasesLoading.value = true;
    try {
        const response = await axios.get('/gp/my-cases', {
            params: {
                page,
                search: searchQuery.value || undefined,
                state: activeFilter.value || undefined,
            }
        });
        myCases.value = response.data.data || [];
        myCasesPagination.value = response.data.pagination || myCasesPagination.value;
    } catch (error) {
        console.error('Failed to fetch my cases:', error);
    } finally {
        myCasesLoading.value = false;
    }
};

// Fetch all patients
const fetchAllPatients = async (page = 1) => {
    allPatientsLoading.value = true;
    try {
        const response = await axios.get('/gp/patients', {
            params: {
                page,
                search: searchQuery.value || undefined,
                triage: activeFilter.value || undefined,
            }
        });
        allPatients.value = response.data.data || [];
        allPatientsPagination.value = response.data.pagination || allPatientsPagination.value;
    } catch (error) {
        console.error('Failed to fetch patients:', error);
    } finally {
        allPatientsLoading.value = false;
    }
};

// Load more patients
const loadMorePatients = () => {
    if (allPatientsPagination.value.current_page < allPatientsPagination.value.last_page) {
        fetchAllPatients(allPatientsPagination.value.current_page + 1);
    }
};

// Set filter
const setFilter = (filter: string | null) => {
    activeFilter.value = activeFilter.value === filter ? null : filter;
    // Refresh current tab data
    if (activeTab.value === 'my-cases') {
        fetchMyCases();
    } else if (activeTab.value === 'all-patients') {
        fetchAllPatients();
    }
};

// Handle tab change
const handleTabChange = (tab: string | number) => {
    activeTab.value = String(tab);
    if (tab === 'referrals') {
        fetchReferrals();
    } else if (tab === 'my-cases') {
        fetchMyCases();
    } else if (tab === 'all-patients') {
        fetchAllPatients();
    }
};

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>;
watch(searchQuery, () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        handleTabChange(activeTab.value);
    }, 300);
});

// Initial load
onMounted(() => {
    fetchReferrals();
});
</script>

<template>
    <div class="flex flex-col h-full overflow-hidden">
        <!-- Header with Search -->
        <div class="p-4 border-b border-sidebar-border/70">
            <h2 class="text-lg font-semibold text-sidebar-foreground mb-3">Patient Lists</h2>
            
            <!-- Search Input -->
            <div class="relative">
                <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="Search patients..."
                    class="w-full px-3 py-2 text-sm border rounded-md bg-background"
                />
                <svg
                    class="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>
        </div>

        <!-- Tabs -->
        <Tabs v-model="activeTab" class="flex-1 flex flex-col overflow-hidden" @update:model-value="handleTabChange">
            <TabsList class="grid w-full grid-cols-3 mx-4 mt-2">
                <TabsTrigger value="referrals" class="text-xs">
                    Referrals
                    <Badge v-if="referralCount > 0" variant="destructive" class="ml-1 text-xs">
                        {{ referralCount }}
                    </Badge>
                </TabsTrigger>
                <TabsTrigger value="my-cases" class="text-xs">
                    My Cases
                    <Badge v-if="myCasesCount > 0" variant="secondary" class="ml-1 text-xs">
                        {{ myCasesCount }}
                    </Badge>
                </TabsTrigger>
                <TabsTrigger value="all-patients" class="text-xs">
                    All Patients
                </TabsTrigger>
            </TabsList>

            <!-- Filter Chips (for My Cases and All Patients) -->
            <div v-if="activeTab !== 'referrals'" class="flex gap-2 px-4 py-2 border-b border-sidebar-border/70">
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

            <!-- Referrals Tab Content -->
            <TabsContent value="referrals" class="flex-1 overflow-y-auto m-0">
                <div class="p-2 space-y-2">
                    <!-- High Priority -->
                    <div v-if="highPriorityReferrals.length > 0">
                        <div class="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-red-600 dark:text-red-400">
                            <span>🔴</span>
                            <span>High Priority</span>
                            <Badge variant="destructive" class="ml-auto">
                                {{ highPriorityReferrals.length }}
                            </Badge>
                        </div>
                        
                        <Card
                            v-for="referral in highPriorityReferrals"
                            :key="referral.id"
                            :class="cn(
                                'cursor-pointer transition-all hover:shadow-md',
                                selectedPatientId === referral.patient.couch_id && 'ring-2 ring-primary'
                            )"
                            @click="emit('select', referral.patient.couch_id)"
                        >
                            <CardContent class="p-3">
                                <div class="flex items-start justify-between">
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2">
                                            <span class="font-medium truncate">{{ referral.patient.full_name }}</span>
                                            <Badge variant="destructive" class="shrink-0">RED</Badge>
                                        </div>
                                        <div class="text-sm text-muted-foreground mt-0.5">
                                            {{ referral.patient.age }}y • {{ referral.patient.gender }}
                                        </div>
                                    </div>
                                    <div class="text-right shrink-0 ml-2">
                                        <div class="text-sm font-medium text-red-600">
                                            {{ referral.patient.waiting_minutes ? formatWaitingTime(referral.patient.waiting_minutes) : '-' }}
                                        </div>
                                        <div class="text-xs text-muted-foreground">waiting</div>
                                    </div>
                                </div>
                                
                                <div class="flex gap-2 mt-3">
                                    <Button size="sm" variant="default" class="flex-1" @click.stop="emit('accept', referral.id)">
                                        Accept
                                    </Button>
                                    <Button size="sm" variant="outline" @click.stop="emit('reject', referral.id)">
                                        Reject
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <!-- Normal Priority -->
                    <div v-if="normalReferrals.length > 0">
                        <div class="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-yellow-600 dark:text-yellow-400">
                            <span>🟡</span>
                            <span>Normal Priority</span>
                            <Badge variant="secondary" class="ml-auto">
                                {{ normalReferrals.length }}
                            </Badge>
                        </div>
                        
                        <Card
                            v-for="referral in normalReferrals"
                            :key="referral.id"
                            :class="cn(
                                'cursor-pointer transition-all hover:shadow-md',
                                selectedPatientId === referral.patient.couch_id && 'ring-2 ring-primary'
                            )"
                            @click="emit('select', referral.patient.couch_id)"
                        >
                            <CardContent class="p-3">
                                <div class="flex items-start justify-between">
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2">
                                            <span class="font-medium truncate">{{ referral.patient.full_name }}</span>
                                            <Badge :variant="triageBadgeVariant[referral.patient.triage_priority || 'green']" class="shrink-0">
                                                {{ referral.patient.triage_priority?.toUpperCase() || 'GREEN' }}
                                            </Badge>
                                        </div>
                                        <div class="text-sm text-muted-foreground mt-0.5">
                                            {{ referral.patient.age }}y • {{ referral.patient.gender }}
                                        </div>
                                    </div>
                                    <div class="text-right shrink-0 ml-2">
                                        <div class="text-sm font-medium">
                                            {{ referral.patient.waiting_minutes ? formatWaitingTime(referral.patient.waiting_minutes) : '-' }}
                                        </div>
                                        <div class="text-xs text-muted-foreground">waiting</div>
                                    </div>
                                </div>

                                <div class="flex gap-2 mt-3">
                                    <Button size="sm" variant="default" class="flex-1" @click.stop="emit('accept', referral.id)">
                                        Accept
                                    </Button>
                                    <Button size="sm" variant="outline" @click.stop="emit('reject', referral.id)">
                                        Reject
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <!-- Empty State -->
                    <div
                        v-if="highPriorityReferrals.length === 0 && normalReferrals.length === 0"
                        class="flex flex-col items-center justify-center h-48 text-muted-foreground"
                    >
                        <svg class="h-12 w-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <p class="text-sm">No referrals in queue</p>
                    </div>
                </div>
            </TabsContent>

            <!-- My Cases Tab Content -->
            <TabsContent value="my-cases" class="flex-1 overflow-y-auto m-0">
                <div class="p-2 space-y-2">
                    <Card
                        v-for="patient in myCases"
                        :key="patient.couch_id"
                        :class="cn(
                            'cursor-pointer transition-all hover:shadow-md',
                            selectedPatientId === patient.couch_id && 'ring-2 ring-primary'
                        )"
                        @click="emit('select', patient.couch_id)"
                    >
                        <CardContent class="p-3">
                            <div class="flex items-start justify-between">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2">
                                        <span class="font-medium truncate">{{ patient.full_name }}</span>
                                        <Badge v-if="patient.triage_priority" :variant="triageBadgeVariant[patient.triage_priority]" class="shrink-0">
                                            {{ patient.triage_priority.toUpperCase() }}
                                        </Badge>
                                    </div>
                                    <div class="text-sm text-muted-foreground mt-0.5">
                                        {{ patient.age }}y • {{ patient.gender }}
                                    </div>
                                    <div class="text-xs text-muted-foreground mt-1">
                                        Status: {{ patient.status?.replace(/_/g, ' ') }}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <!-- Empty State -->
                    <div
                        v-if="myCases.length === 0 && !myCasesLoading"
                        class="flex flex-col items-center justify-center h-48 text-muted-foreground"
                    >
                        <svg class="h-12 w-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <p class="text-sm">No cases assigned to you</p>
                    </div>

                    <!-- Loading State -->
                    <div v-if="myCasesLoading" class="flex justify-center py-4">
                        <div class="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
                    </div>
                </div>
            </TabsContent>

            <!-- All Patients Tab Content -->
            <TabsContent value="all-patients" class="flex-1 overflow-y-auto m-0">
                <div class="p-2 space-y-2">
                    <Card
                        v-for="patient in allPatients"
                        :key="patient.couch_id"
                        :class="cn(
                            'cursor-pointer transition-all hover:shadow-md',
                            selectedPatientId === patient.couch_id && 'ring-2 ring-primary'
                        )"
                        @click="emit('select', patient.couch_id)"
                    >
                        <CardContent class="p-3">
                            <div class="flex items-start justify-between">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2">
                                        <span class="font-medium truncate">{{ patient.full_name }}</span>
                                        <Badge v-if="patient.triage_priority" :variant="triageBadgeVariant[patient.triage_priority]" class="shrink-0">
                                            {{ patient.triage_priority.toUpperCase() }}
                                        </Badge>
                                    </div>
                                    <div class="text-sm text-muted-foreground mt-0.5">
                                        {{ patient.age }}y • {{ patient.gender }} • {{ patient.cpt }}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <!-- Load More Button -->
                    <div v-if="allPatientsPagination.current_page < allPatientsPagination.last_page" class="flex justify-center py-2">
                        <Button variant="outline" size="sm" @click="loadMorePatients" :disabled="allPatientsLoading">
                            Load More
                        </Button>
                    </div>

                    <!-- Empty State -->
                    <div
                        v-if="allPatients.length === 0 && !allPatientsLoading"
                        class="flex flex-col items-center justify-center h-48 text-muted-foreground"
                    >
                        <svg class="h-12 w-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <p class="text-sm">No patients found</p>
                    </div>

                    <!-- Loading State -->
                    <div v-if="allPatientsLoading" class="flex justify-center py-4">
                        <div class="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
                    </div>
                </div>
            </TabsContent>
        </Tabs>

        <!-- New Patient Button -->
        <div class="p-2 border-t border-sidebar-border/70">
            <Button variant="outline" class="w-full" as-child>
                <a href="/gp/patients/new">
                    <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Register New Patient
                </a>
            </Button>
        </div>
    </div>
</template>
