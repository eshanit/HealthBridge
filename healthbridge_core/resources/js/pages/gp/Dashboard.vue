<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import AppLayout from '@/layouts/AppLayout.vue';
import { type BreadcrumbItem } from '@/types';
import PatientQueue from '@/components/gp/PatientQueue.vue';
import PatientWorkspace from '@/components/gp/PatientWorkspace.vue';
import AuditStrip from '@/components/gp/AuditStrip.vue';
import GlobalPatientSearch from '@/components/gp/GlobalPatientSearch.vue';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useEcho } from '@/composables/useEcho';

interface Patient {
    id: string;
    cpt: string;
    name: string;
    age: number | null;
    gender: string | null;
    triage_color: 'RED' | 'YELLOW' | 'GREEN';
    status: string;
    referral_source: string;
    waiting_minutes: number;
    danger_signs: string[];
    vitals?: {
        rr?: number;
        hr?: number;
        temp?: number;
        spo2?: number;
        weight?: number;
    };
}

interface Referral {
    id: number;
    couch_id?: string;
    patient: Patient;
    referred_by: string;
    referral_notes: string;
    created_at: string;
    chief_complaint?: string;
    vitals?: {
        rr?: number;
        hr?: number;
        temp?: number;
        spo2?: number;
        weight?: number;
    };
    medical_history?: string[];
    current_medications?: string[];
    allergies?: string[];
}

interface AuditEntry {
    timestamp: string;
    action: string;
    user: string;
    details: string;
}

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'GP Dashboard',
        href: '/gp/dashboard',
    },
];

// State
const selectedPatientId = ref<string | null>(null);
const referrals = ref<Referral[]>([]);
const auditLog = ref<AuditEntry[]>([]);
const isLoading = ref(false);
const pollingInterval = ref<number | null>(null);
const showSearch = ref(false);

// Computed
const selectedPatient = computed(() => {
    if (!selectedPatientId.value) return null;
    const referral = referrals.value.find(r => r.patient.id === selectedPatientId.value);
    return referral?.patient || null;
});

const selectedReferral = computed(() => {
    if (!selectedPatientId.value) return null;
    return referrals.value.find(r => r.patient.id === selectedPatientId.value) || null;
});

const highPriorityReferrals = computed(() => 
    referrals.value.filter(r => r.patient.triage_color === 'RED')
);

const normalReferrals = computed(() => 
    referrals.value.filter(r => r.patient.triage_color === 'YELLOW' || r.patient.triage_color === 'GREEN')
);

// Methods
const selectPatient = (patientId: string) => {
    selectedPatientId.value = patientId;
    addAuditEntry('Patient Selected', `Viewed patient ${patientId}`);
};

const acceptReferral = async (referralId: number) => {
    try {
        const response = await fetch(`/gp/referrals/${referralId}/accept`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
        });
        
        if (response.ok) {
            await fetchReferrals();
            addAuditEntry('Referral Accepted', `Referral ${referralId} accepted`);
        }
    } catch (error) {
        console.error('Failed to accept referral:', error);
    }
};

const rejectReferral = async (referralId: number) => {
    try {
        const response = await fetch(`/gp/referrals/${referralId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
        });
        
        if (response.ok) {
            await fetchReferrals();
            addAuditEntry('Referral Rejected', `Referral ${referralId} rejected`);
        }
    } catch (error) {
        console.error('Failed to reject referral:', error);
    }
};

const fetchReferrals = async () => {
    try {
        const response = await fetch('/gp/referrals/json');
        if (response.ok) {
            const data = await response.json();
            const highPriority = data.referrals?.high_priority || [];
            const normalPriority = data.referrals?.normal_priority || [];
            referrals.value = [...highPriority, ...normalPriority];
        }
    } catch (error) {
        console.error('Failed to fetch referrals:', error);
    }
};

const addAuditEntry = (action: string, details: string) => {
    const entry: AuditEntry = {
        timestamp: new Date().toISOString(),
        action,
        user: 'Dr. Moyo', // TODO: Get from auth
        details,
    };
    auditLog.value.unshift(entry);
    if (auditLog.value.length > 10) {
        auditLog.value.pop();
    }
};

const handleStateChange = (newState: string) => {
    if (selectedPatientId.value) {
        addAuditEntry('State Changed', `Patient ${selectedPatientId.value} → ${newState}`);
    }
};

const handleAICall = (task: string) => {
    addAuditEntry('AI Call', `Task: ${task}`);
};

const handleSearchSelect = (patient: { id: number | string; couch_id?: string }) => {
    const patientId = patient.couch_id || String(patient.id);
    selectPatient(patientId);
    showSearch.value = false;
};

// Keyboard shortcuts
const handleKeydown = (event: KeyboardEvent) => {
    // Ctrl+K or Cmd+K to open search
    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        showSearch.value = !showSearch.value;
    }
    // Escape to close search
    if (event.key === 'Escape' && showSearch.value) {
        showSearch.value = false;
    }
};

// Lifecycle
onMounted(() => {
    fetchReferrals();
    
    // Add keyboard event listener
    window.addEventListener('keydown', handleKeydown);
    
    // Initialize WebSocket connection for real-time updates
    const echo = useEcho();
    if (echo) {
        echo.join('gp.dashboard')
            .here((users: unknown[]) => {
                console.log('Users online:', users);
            })
            .joining((user: unknown) => {
                console.log('User joined:', user);
            })
            .leaving((user: unknown) => {
                console.log('User left:', user);
            })
            .error((error: unknown) => {
                console.error('Presence channel error:', error);
            });
        
        echo.channel('referrals')
            .listen('ReferralCreated', (event: { session: Referral }) => {
                referrals.value.unshift(event.session);
                addAuditEntry('New Referral', `Patient ${event.session.patient?.name || 'Unknown'} added`);
            })
            .listen('SessionStateChanged', (event: { couch_id: string; to_state: string; patient: { name: string } }) => {
                const index = referrals.value.findIndex(r => r.patient.id === event.couch_id);
                if (index > -1) {
                    referrals.value[index].patient.status = event.to_state;
                }
                addAuditEntry('State Changed', `${event.patient?.name || 'Patient'} → ${event.to_state}`);
            });
    } else {
        pollingInterval.value = window.setInterval(fetchReferrals, 30000);
    }
});

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
    
    if (pollingInterval.value) {
        clearInterval(pollingInterval.value);
    }
    
    const echo = useEcho();
    if (echo) {
        echo.leave('gp.dashboard');
        echo.leave('referrals');
    }
});
</script>

<template>
    <Head title="GP Dashboard" />

    <AppLayout :breadcrumbs="breadcrumbs">
        <div class="flex h-full flex-1 flex-col overflow-hidden">
            <!-- Global Search Modal -->
            <GlobalPatientSearch 
                v-if="showSearch" 
                @close="showSearch = false"
                @select="handleSearchSelect"
            />
            
            <!-- Main Content Area -->
            <div class="flex flex-1 overflow-hidden">
                <!-- Left Panel - Patient Queues -->
                <div class="w-80 border-r border-sidebar-border/70 bg-sidebar flex flex-col">
                    <PatientQueue
                        :high-priority-referrals="highPriorityReferrals"
                        :normal-referrals="normalReferrals"
                        :selected-patient-id="selectedPatientId"
                        @select="selectPatient"
                        @accept="acceptReferral"
                        @reject="rejectReferral"
                    />
                </div>

                <!-- Main Workspace -->
                <div class="flex-1 flex flex-col overflow-hidden bg-background">
                    <template v-if="selectedPatient">
                        <!-- Patient Header with Quick Actions -->
                        <div class="border-b p-4 bg-card">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h2 class="text-xl font-semibold">{{ selectedPatient.name }}</h2>
                                    <p class="text-sm text-muted-foreground">
                                        {{ selectedPatient.age }}y {{ selectedPatient.gender }} • 
                                        <span :class="{
                                            'text-red-600': selectedPatient.triage_color === 'RED',
                                            'text-yellow-600': selectedPatient.triage_color === 'YELLOW',
                                            'text-green-600': selectedPatient.triage_color === 'GREEN'
                                        }">
                                            {{ selectedPatient.triage_color }} Priority
                                        </span>
                                    </p>
                                </div>
                                <div class="flex gap-2">
                                    <button 
                                        @click="showSearch = true"
                                        class="text-sm text-muted-foreground hover:text-foreground"
                                    >
                                        Search (Ctrl+K)
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Workspace with Tabs -->
                        <div class="flex-1 overflow-hidden">
                            <PatientWorkspace
                                :patient="selectedPatient"
                                :referral="selectedReferral"
                                @state-change="handleStateChange"
                                @ai-call="handleAICall"
                            />
                        </div>
                    </template>
                    
                    <!-- Empty State -->
                    <div v-else class="flex-1 flex items-center justify-center text-muted-foreground">
                        <div class="text-center">
                            <svg class="mx-auto h-12 w-12 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <p class="text-lg font-medium">No Patient Selected</p>
                            <p class="text-sm">Select a patient from the queue to begin</p>
                            <p class="text-xs mt-2 text-muted-foreground/60">
                                Press <kbd class="px-1 py-0.5 bg-muted rounded text-xs">Ctrl+K</kbd> to search patients
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Footer - Audit Strip -->
            <AuditStrip :entries="auditLog" />
        </div>
    </AppLayout>
</template>
