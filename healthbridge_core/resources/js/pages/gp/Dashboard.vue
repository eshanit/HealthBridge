<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import AppLayout from '@/layouts/AppLayout.vue';
import { type BreadcrumbItem } from '@/types';
import PatientQueue from '@/components/gp/PatientQueue.vue';
import PatientWorkspace from '@/components/gp/PatientWorkspace.vue';
import AuditStrip from '@/components/gp/AuditStrip.vue';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useEcho } from '@/composables/useEcho';

interface Patient {
    id: string;
    cpt: string;
    name: string;
    age: number;
    gender: string;
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
    };
}

interface Referral {
    id: number;
    patient: Patient;
    referred_by: string;
    referral_notes: string;
    created_at: string;
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
        const response = await fetch('/gp/referrals');
        if (response.ok) {
            const data = await response.json();
            referrals.value = data.referrals || [];
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

// Lifecycle
onMounted(() => {
    fetchReferrals();
    
    // Initialize WebSocket connection for real-time updates
    const echo = useEcho();
    if (echo) {
        // Join the GP dashboard presence channel
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
        
        // Listen for referral events
        echo.channel('referrals')
            .listen('ReferralCreated', (event: { session: Referral }) => {
                referrals.value.unshift(event.session);
                addAuditEntry('New Referral', `Patient ${event.session.patient?.name || 'Unknown'} added`);
            })
            .listen('SessionStateChanged', (event: { couch_id: string; to_state: string; patient: { name: string } }) => {
                // Update the referral in the list
                const index = referrals.value.findIndex(r => r.patient.id === event.couch_id);
                if (index > -1) {
                    referrals.value[index].patient.status = event.to_state;
                }
                addAuditEntry('State Changed', `${event.patient?.name || 'Patient'} → ${event.to_state}`);
            });
    } else {
        // Fallback to polling if WebSocket is not available
        pollingInterval.value = window.setInterval(fetchReferrals, 30000);
    }
});

onUnmounted(() => {
    if (pollingInterval.value) {
        clearInterval(pollingInterval.value);
    }
    
    // Leave channels
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
                    <PatientWorkspace
                        v-if="selectedPatient"
                        :patient="selectedPatient"
                        :referral="selectedReferral"
                        @state-change="handleStateChange"
                        @ai-call="handleAICall"
                    />
                    
                    <!-- Empty State -->
                    <div v-else class="flex-1 flex items-center justify-center text-muted-foreground">
                        <div class="text-center">
                            <svg class="mx-auto h-12 w-12 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <p class="text-lg font-medium">No Patient Selected</p>
                            <p class="text-sm">Select a patient from the queue to begin</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Footer - Audit Strip -->
            <AuditStrip :entries="auditLog" />
        </div>
    </AppLayout>
</template>
