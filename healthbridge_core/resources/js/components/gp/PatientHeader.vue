<script setup lang="ts">
import { ref, computed } from 'vue';
import { router } from '@inertiajs/vue3';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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
    };
}

interface Referral {
    id: number;
    couch_id: string; // Session's couch_id - used for accept/reject endpoints
    patient: Patient;
    referred_by: string;
    referral_notes: string;
    created_at: string;
}

interface Props {
    patient: Patient;
    referral: Referral | null;
    triageLabel: string;
    isAccepted?: boolean; // Whether the referral has been accepted
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'stateChange', newState: string): void;
}>();

// State
const isTransitioning = ref(false);
const showConfirmDialog = ref(false);
const pendingAction = ref<string | null>(null);

// Computed
const statusColor = computed(() => {
    switch (props.patient.status) {
        case 'NEW': return 'bg-blue-500';
        case 'TRIAGED': return 'bg-yellow-500';
        case 'REFERRED': return 'bg-purple-500';
        case 'IN_GP_REVIEW': return 'bg-orange-500';
        case 'UNDER_TREATMENT': return 'bg-green-500';
        case 'CLOSED': return 'bg-gray-500';
        default: return 'bg-gray-400';
    }
});

const triageColorClass = computed(() => {
    switch (props.patient.triage_color) {
        case 'RED': return 'bg-red-500/10 border-red-500 text-red-700 dark:text-red-400';
        case 'YELLOW': return 'bg-yellow-500/10 border-yellow-500 text-yellow-700 dark:text-yellow-400';
        case 'GREEN': return 'bg-green-500/10 border-green-500 text-green-700 dark:text-green-400';
        default: return 'bg-gray-500/10 border-gray-500 text-gray-700 dark:text-gray-400';
    }
});

const triageIcon = computed(() => {
    switch (props.patient.triage_color) {
        case 'RED': return '🔴';
        case 'YELLOW': return '🟡';
        case 'GREEN': return '🟢';
        default: return '⚪';
    }
});

// Methods
const handleAction = async (action: string) => {
    pendingAction.value = action;
    
    // Actions that need confirmation
    const needsConfirmation = ['discharge', 'refer_again', 'close'];
    if (needsConfirmation.includes(action)) {
        showConfirmDialog.value = true;
        return;
    }
    
    await executeAction(action);
};

const executeAction = async (action: string) => {
    isTransitioning.value = true;
    showConfirmDialog.value = false;
    
    // Get the session's couch_id from the referral
    const sessionCouchId = props.referral?.couch_id;
    
    // Debug log
    console.log('executeAction:', action, 'sessionCouchId:', sessionCouchId, 'referral:', props.referral);
    
    let endpoint = '';
    let newState = '';
    
    switch (action) {
        case 'accept':
            // Use couch_id for the accept endpoint
            endpoint = `/gp/referrals/${sessionCouchId}/accept`;
            newState = 'IN_GP_REVIEW';
            break;
        case 'start_consultation':
            // Transition from IN_GP_REVIEW to UNDER_TREATMENT
            endpoint = `/gp/sessions/${sessionCouchId}/transition`;
            newState = 'UNDER_TREATMENT';
            break;
        case 'discharge':
            endpoint = `/gp/sessions/${sessionCouchId}/close`;
            newState = 'CLOSED';
            break;
        case 'refer_again':
            endpoint = `/gp/sessions/${sessionCouchId}/transition`;
            newState = 'REFERRED';
            break;
        case 'close':
            endpoint = `/gp/sessions/${sessionCouchId}/close`;
            newState = 'CLOSED';
            break;
    }
    
    if (endpoint) {
        // Use Inertia router which automatically handles CSRF tokens and redirects
        router.post(
            endpoint,
            { to_state: newState },
            {
                preserveScroll: true,
                onSuccess: () => {
                    emit('stateChange', newState);
                },
                onError: (errors: Record<string, string>) => {
                    console.error('Action failed:', errors);
                },
                onFinish: () => {
                    isTransitioning.value = false;
                    pendingAction.value = null;
                },
            }
        );
    }
};

const cancelAction = () => {
    showConfirmDialog.value = false;
    pendingAction.value = null;
};

const formatGender = (gender: string | null | undefined): string => {
    if (!gender) return '-';
    return gender.charAt(0).toUpperCase();
};
</script>

<template>
    <div class="border-b border-sidebar-border/70 bg-card">
        <CardContent class="p-4">
            <div class="flex items-start justify-between gap-4">
                <!-- Patient Info -->
                <div class="flex-1">
                    <div class="flex items-center gap-3">
                        <h1 class="text-xl font-semibold">
                            {{ patient.name }}
                        </h1>
                        <div class="flex items-center gap-2 text-muted-foreground">
                            <span>{{ patient.age ?? '-' }}y</span>
                            <span>•</span>
                            <span>{{ formatGender(patient.gender) }}</span>
                            <span>•</span>
                            <span class="text-sm font-mono text-muted-foreground/60">{{ patient.cpt }}</span>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-3 mt-2">
                        <!-- Status Badge -->
                        <div class="flex items-center gap-1.5">
                            <div :class="cn('w-2 h-2 rounded-full', statusColor)"></div>
                            <span class="text-sm font-medium">{{ patient.status }}</span>
                        </div>
                        
                        <!-- Triage Badge -->
                        <div
                            :class="cn(
                                'flex items-center gap-1.5 px-2 py-0.5 rounded-md border',
                                triageColorClass
                            )"
                        >
                            <span>{{ triageIcon }}</span>
                            <span class="text-sm font-medium">{{ triageLabel }}</span>
                        </div>
                    </div>
                    
                    <!-- Referral Info -->
                    <div v-if="referral" class="mt-2 text-sm text-muted-foreground">
                        Referred by: <span class="font-medium">{{ referral.referred_by }}</span>
                        <span v-if="referral.referral_notes" class="ml-2">
                            • {{ referral.referral_notes }}
                        </span>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex items-center gap-2">
                    <!-- Accept Referral Button - Only show if not already accepted -->
                    <Button
                        v-if="patient.status === 'REFERRED' && !isAccepted"
                        variant="default"
                        :disabled="isTransitioning"
                        @click="handleAction('accept')"
                    >
                        Accept Referral
                    </Button>
                    
                    <!-- Accepted indicator -->
                    <div
                        v-if="patient.status === 'REFERRED' && isAccepted"
                        class="flex items-center gap-2 px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md"
                    >
                        <span>✓</span>
                        <span class="font-medium">Accepted</span>
                    </div>
                    
                    <Button
                        v-if="patient.status === 'IN_GP_REVIEW'"
                        variant="default"
                        :disabled="isTransitioning"
                        @click="handleAction('start_consultation')"
                    >
                        Start Consultation
                    </Button>
                    
                    <Button
                        v-if="['IN_GP_REVIEW', 'UNDER_TREATMENT'].includes(patient.status)"
                        variant="outline"
                        :disabled="isTransitioning"
                        @click="handleAction('refer_again')"
                    >
                        Refer Again
                    </Button>
                    
                    <Button
                        v-if="['IN_GP_REVIEW', 'UNDER_TREATMENT'].includes(patient.status)"
                        variant="secondary"
                        :disabled="isTransitioning"
                        @click="handleAction('discharge')"
                    >
                        Discharge
                    </Button>
                </div>
            </div>
        </CardContent>
        
        <!-- Confirmation Dialog -->
        <div
            v-if="showConfirmDialog"
            class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        >
            <Card class="w-full max-w-md mx-4">
                <CardContent class="p-6">
                    <h3 class="text-lg font-semibold mb-2">Confirm Action</h3>
                    <p class="text-muted-foreground mb-4">
                        Are you sure you want to {{ pendingAction?.replace('_', ' ') }} this patient?
                        This action will be logged.
                    </p>
                    <div class="flex justify-end gap-2">
                        <Button variant="outline" @click="cancelAction">
                            Cancel
                        </Button>
                        <Button
                            variant="default"
                            @click="executeAction(pendingAction!)"
                        >
                            Confirm
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    </div>
</template>
