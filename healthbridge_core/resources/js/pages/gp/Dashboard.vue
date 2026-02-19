<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import AppLayout from '@/layouts/AppLayout.vue';
import { type BreadcrumbItem } from '@/types';
import PatientQueue from '@/components/gp/PatientQueue.vue';
import PatientWorkspace from '@/components/gp/PatientWorkspace.vue';
import AuditStrip from '@/components/gp/AuditStrip.vue';
import GlobalPatientSearch from '@/components/gp/GlobalPatientSearch.vue';
import { ref, computed, onMounted, onUnmounted, TransitionGroup } from 'vue';
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
    couch_id: string; // Session's couch_id - used for accept/reject endpoints
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

interface Toast {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
    visible: boolean;
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
const myCases = ref<Referral[]>([]);
const auditLog = ref<AuditEntry[]>([]);
const isLoading = ref(false);
const pollingInterval = ref<number | null>(null);
const showSearch = ref(false);
const toasts = ref<Toast[]>([]);
const toastId = ref(0);
const actionInProgress = ref<number | null>(null); // Track which referral is being processed
const acceptedReferralIds = ref<Set<string>>(new Set()); // Track accepted referral couch_ids
const activeQueueTab = ref<'referrals' | 'my-cases'>('referrals'); // Tab state

// Check if the currently selected patient's referral has been accepted
// This is true if: (1) the referral was just accepted, or (2) the patient is from my-cases
const isSelectedReferralAccepted = computed(() => {
    if (!selectedPatientId.value) return false;
    
    // Check if it's in the accepted referrals set
    const referral = referrals.value.find(r => r.patient.id === selectedPatientId.value);
    if (referral && acceptedReferralIds.value.has(referral.couch_id)) {
        return true;
    }
    
    // Check if it's in my-cases (already accepted)
    const myCase = myCases.value.find(c => c.patient.id === selectedPatientId.value);
    if (myCase) {
        return true;
    }
    
    return false;
});

// Check if selected patient is from my-cases
const isSelectedFromMyCases = computed(() => {
    if (!selectedPatientId.value) return false;
    return myCases.value.some(c => c.patient.id === selectedPatientId.value);
});

// Toast methods
const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++toastId.value;
    toasts.value.push({ id, message, type, visible: true });
    setTimeout(() => {
        const toast = toasts.value.find(t => t.id === id);
        if (toast) toast.visible = false;
        setTimeout(() => {
            toasts.value = toasts.value.filter(t => t.id !== id);
        }, 300);
    }, 3000);
};

// Computed
const selectedPatient = computed(() => {
    if (!selectedPatientId.value) return null;
    // Check both referrals and my-cases
    const referral = referrals.value.find(r => r.patient.id === selectedPatientId.value);
    if (referral) return referral.patient;
    const myCase = myCases.value.find(c => c.patient.id === selectedPatientId.value);
    return myCase?.patient || null;
});

const selectedReferral = computed(() => {
    if (!selectedPatientId.value) return null;
    // Check both referrals and my-cases
    const referral = referrals.value.find(r => r.patient.id === selectedPatientId.value);
    if (referral) return referral;
    return myCases.value.find(c => c.patient.id === selectedPatientId.value) || null;
});

const highPriorityReferrals = computed(() => 
    referrals.value.filter(r => r.patient.triage_color === 'RED')
);

const normalReferrals = computed(() => 
    referrals.value.filter(r => r.patient.triage_color === 'YELLOW' || r.patient.triage_color === 'GREEN')
);

// My Cases computed
const highPriorityMyCases = computed(() => 
    myCases.value.filter(c => c.patient.triage_color === 'RED')
);

const normalMyCases = computed(() => 
    myCases.value.filter(c => c.patient.triage_color === 'YELLOW' || c.patient.triage_color === 'GREEN')
);

// Methods
const selectPatient = (patientId: string) => {
    selectedPatientId.value = patientId;
    addAuditEntry('Patient Selected', `Viewed patient ${patientId}`);
};

const acceptReferral = async (referralId: number) => {
    // Find the referral to get the couch_id
    const referral = referrals.value.find(r => r.id === referralId);
    if (!referral) {
        console.error('Referral not found:', referralId);
        showToast('Referral not found', 'error');
        return;
    }
    
    // Prevent double-clicks and already accepted referrals
    if (actionInProgress.value === referralId) return;
    if (acceptedReferralIds.value.has(referral.couch_id)) return;
    
    actionInProgress.value = referralId;
    
    try {
        const response = await fetch(`/gp/referrals/${referral.couch_id}/accept`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Mark this referral as accepted
            acceptedReferralIds.value.add(referral.couch_id);
            
            // Move the referral from the queue to my-cases
            referrals.value = referrals.value.filter(r => r.id !== referralId);
            myCases.value.unshift(referral);
            
            // Switch to my-cases tab and keep the patient selected
            activeQueueTab.value = 'my-cases';
            
            showToast(`Accepted ${referral.patient.name}'s referral`, 'success');
            addAuditEntry('Referral Accepted', `Referral for ${referral.patient.name} accepted`);
            
            // Refresh both lists to get updated data
            await Promise.all([fetchReferrals(), fetchMyCases()]);
        } else {
            const errorData = await response.json();
            showToast(errorData.message || 'Failed to accept referral', 'error');
        }
    } catch (error) {
        console.error('Failed to accept referral:', error);
        showToast('Failed to accept referral. Please try again.', 'error');
    } finally {
        actionInProgress.value = null;
    }
};

const rejectReferral = async (referralId: number) => {
    // Find the referral to get the couch_id
    const referral = referrals.value.find(r => r.id === referralId);
    if (!referral) {
        console.error('Referral not found:', referralId);
        showToast('Referral not found', 'error');
        return;
    }
    
    // Prevent double-clicks
    if (actionInProgress.value === referralId) return;
    actionInProgress.value = referralId;
    
    try {
        const response = await fetch(`/gp/referrals/${referral.couch_id}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
            body: JSON.stringify({ reason: 'referral_cancelled' }),
        });
        
        if (response.ok) {
            // Remove the referral from the queue immediately
            referrals.value = referrals.value.filter(r => r.id !== referralId);
            
            // Clear selection if this patient was selected
            if (selectedPatientId.value === referral.patient.id) {
                selectedPatientId.value = null;
            }
            
            showToast(`Rejected ${referral.patient.name}'s referral`, 'info');
            addAuditEntry('Referral Rejected', `Referral for ${referral.patient.name} rejected`);
            
            // Refresh the list
            await fetchReferrals();
        } else {
            const errorData = await response.json();
            showToast(errorData.message || 'Failed to reject referral', 'error');
        }
    } catch (error) {
        console.error('Failed to reject referral:', error);
        showToast('Failed to reject referral. Please try again.', 'error');
    } finally {
        actionInProgress.value = null;
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

const fetchMyCases = async () => {
    try {
        const response = await fetch('/gp/my-cases/json');
        if (response.ok) {
            const data = await response.json();
            const highPriority = data.cases?.high_priority || [];
            const normalPriority = data.cases?.normal_priority || [];
            myCases.value = [...highPriority, ...normalPriority];
        }
    } catch (error) {
        console.error('Failed to fetch my cases:', error);
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
    fetchMyCases();
    
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
            <!-- Toast Notifications -->
            <div class="fixed top-4 right-4 z-50 space-y-2">
                <TransitionGroup name="toast">
                    <div
                        v-for="toast in toasts"
                        :key="toast.id"
                        v-show="toast.visible"
                        :class="[
                            'px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 min-w-[300px]',
                            toast.type === 'success' ? 'bg-green-600 text-white' : '',
                            toast.type === 'error' ? 'bg-red-600 text-white' : '',
                            toast.type === 'info' ? 'bg-blue-600 text-white' : ''
                        ]"
                    >
                        <span v-if="toast.type === 'success'">✓</span>
                        <span v-if="toast.type === 'error'">✕</span>
                        <span v-if="toast.type === 'info'">ℹ</span>
                        <span>{{ toast.message }}</span>
                    </div>
                </TransitionGroup>
            </div>
            
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
                    <!-- Queue Tabs -->
                    <div class="flex border-b border-sidebar-border/70">
                        <button
                            @click="activeQueueTab = 'referrals'"
                            :class="[
                                'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                                activeQueueTab === 'referrals'
                                    ? 'text-sidebar-foreground border-b-2 border-primary bg-sidebar-accent'
                                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                            ]"
                        >
                            Referrals
                            <span v-if="referrals.length > 0" class="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                                {{ referrals.length }}
                            </span>
                        </button>
                        <button
                            @click="activeQueueTab = 'my-cases'"
                            :class="[
                                'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                                activeQueueTab === 'my-cases'
                                    ? 'text-sidebar-foreground border-b-2 border-primary bg-sidebar-accent'
                                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                            ]"
                        >
                            My Cases
                            <span v-if="myCases.length > 0" class="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-green-500/10 text-green-600">
                                {{ myCases.length }}
                            </span>
                        </button>
                    </div>
                    
                    <!-- Referrals Queue -->
                    <PatientQueue
                        v-if="activeQueueTab === 'referrals'"
                        :high-priority-referrals="highPriorityReferrals"
                        :normal-referrals="normalReferrals"
                        :selected-patient-id="selectedPatientId"
                        :action-in-progress="actionInProgress"
                        :accepted-referral-ids="acceptedReferralIds"
                        @select="selectPatient"
                        @accept="acceptReferral"
                        @reject="rejectReferral"
                    />
                    
                    <!-- My Cases Queue -->
                    <PatientQueue
                        v-else
                        :high-priority-referrals="highPriorityMyCases"
                        :normal-referrals="normalMyCases"
                        :selected-patient-id="selectedPatientId"
                        :is-my-cases="true"
                        @select="selectPatient"
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
                                :is-accepted="isSelectedReferralAccepted"
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

<style scoped>
.toast-enter-active,
.toast-leave-active {
    transition: all 0.3s ease;
}

.toast-enter-from {
    opacity: 0;
    transform: translateX(100%);
}

.toast-leave-to {
    opacity: 0;
    transform: translateX(100%);
}
</style>
