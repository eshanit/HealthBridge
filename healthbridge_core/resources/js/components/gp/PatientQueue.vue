<script setup lang="ts">
import { computed } from 'vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, formatDistanceToNowStrict, parseISO, isValid } from 'date-fns';

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
    waiting_time?: string;
    state_updated_at?: string;
    danger_signs: string[];
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
    highPriorityReferrals: Referral[];
    normalReferrals: Referral[];
    selectedPatientId: string | null;
    actionInProgress?: number | null;
    acceptedReferralIds?: Set<string>;
    isMyCases?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'select', patientId: string): void;
    (e: 'accept', referralId: number): void;
    (e: 'reject', referralId: number): void;
}>();

const triageColorClasses = {
    RED: 'bg-red-500/10 border-red-500 text-red-700 dark:text-red-400',
    YELLOW: 'bg-yellow-500/10 border-yellow-500 text-yellow-700 dark:text-yellow-400',
    GREEN: 'bg-green-500/10 border-green-500 text-green-700 dark:text-green-400',
};

const triageBadgeVariant = {
    RED: 'destructive',
    YELLOW: 'secondary',
    GREEN: 'default',
} as const;

/**
 * Format waiting time using date-fns for human-readable relative timestamps.
 * Falls back to backend-provided waiting_time or a simple minutes format.
 */
const formatWaitingTime = (patient: Patient): string => {
    // If we have an ISO timestamp, use date-fns for accurate relative time
    if (patient.state_updated_at) {
        try {
            const date = parseISO(patient.state_updated_at);
            if (isValid(date)) {
                return formatDistanceToNow(date, { addSuffix: false });
            }
        } catch {
            // Fall through to fallback
        }
    }
    
    // Fallback to backend-provided human-readable time
    if (patient.waiting_time) {
        return patient.waiting_time;
    }
    
    // Final fallback: format minutes manually
    const minutes = Math.max(0, Math.abs(patient.waiting_minutes || 0));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

const getTriageIcon = (color: string): string => {
    switch (color) {
        case 'RED': return '🔴';
        case 'YELLOW': return '🟡';
        case 'GREEN': return '🟢';
        default: return '⚪';
    }
};
</script>

<template>
    <div class="flex flex-col h-full overflow-hidden">
        <!-- Header -->
        <div class="p-4 border-b border-sidebar-border/70">
            <h2 class="text-lg font-semibold text-sidebar-foreground">
                {{ isMyCases ? 'My Cases' : 'Patient Queue' }}
            </h2>
            <p class="text-sm text-sidebar-foreground/60">
                {{ highPriorityReferrals.length + normalReferrals.length }} {{ isMyCases ? 'active cases' : 'patients waiting' }}
            </p>
        </div>

        <!-- Queue Lists -->
        <div class="flex-1 overflow-y-auto">
            <!-- High Priority Section -->
            <div v-if="highPriorityReferrals.length > 0" class="p-2">
                <div class="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-red-600 dark:text-red-400">
                    <span>🔴</span>
                    <span>High Priority</span>
                    <Badge variant="destructive" class="ml-auto">
                        {{ highPriorityReferrals.length }}
                    </Badge>
                </div>
                
                <div class="space-y-1 mt-1">
                    <Card
                        v-for="referral in highPriorityReferrals"
                        :key="referral.id"
                        :class="cn(
                            'cursor-pointer transition-all hover:shadow-md',
                            selectedPatientId === referral.patient.id && 'ring-2 ring-primary'
                        )"
                        @click="emit('select', referral.patient.id)"
                    >
                        <CardContent class="p-3">
                            <div class="flex items-start justify-between">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2">
                                        <span class="font-medium truncate">{{ referral.patient.name }}</span>
                                        <Badge :variant="triageBadgeVariant[referral.patient.triage_color]" class="shrink-0">
                                            {{ referral.patient.triage_color }}
                                        </Badge>
                                    </div>
                                    <div class="text-sm text-muted-foreground mt-0.5">
                                        {{ referral.patient.age ?? '-' }}y • {{ referral.patient.gender ?? '-' }}
                                    </div>
                                    <div class="text-xs text-muted-foreground mt-1">
                                        {{ isMyCases ? 'In Review' : 'Referred by: ' + referral.referred_by }}
                                    </div>
                                </div>
                                <div class="text-right shrink-0 ml-2">
                                    <div class="text-sm font-medium text-red-600 dark:text-red-400">
                                        {{ formatWaitingTime(referral.patient) }}
                                    </div>
                                    <div class="text-xs text-muted-foreground">{{ isMyCases ? 'active' : 'waiting' }}</div>
                                </div>
                            </div>
                            
                            <!-- Danger Signs -->
                            <div v-if="referral.patient.danger_signs?.length > 0" class="mt-2">
                                <div class="flex flex-wrap gap-1">
                                    <span
                                        v-for="sign in referral.patient.danger_signs.slice(0, 3)"
                                        :key="sign"
                                        class="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded"
                                    >
                                        {{ sign }}
                                    </span>
                                    <span
                                        v-if="referral.patient.danger_signs.length > 3"
                                        class="text-xs text-muted-foreground"
                                    >
                                        +{{ referral.patient.danger_signs.length - 3 }} more
                                    </span>
                                </div>
                            </div>

                            <!-- Action Buttons - Only show for referrals, not my-cases -->
                            <div v-if="!isMyCases && !acceptedReferralIds?.has(referral.couch_id)" class="flex gap-2 mt-3">
                                <Button
                                    size="sm"
                                    variant="default"
                                    class="flex-1"
                                    :disabled="actionInProgress === referral.id"
                                    @click.stop="emit('accept', referral.id)"
                                >
                                    <span v-if="actionInProgress === referral.id" class="animate-spin mr-1">⏳</span>
                                    {{ actionInProgress === referral.id ? 'Accepting...' : 'Accept' }}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    :disabled="actionInProgress === referral.id"
                                    @click.stop="emit('reject', referral.id)"
                                >
                                    Reject
                                </Button>
                            </div>
                            <!-- Accepted indicator -->
                            <div v-else-if="!isMyCases && acceptedReferralIds?.has(referral.couch_id)" class="flex items-center justify-center gap-2 mt-3 text-sm text-green-600 dark:text-green-400">
                                <span>✓</span>
                                <span>Accepted</span>
                            </div>
                            <!-- My Cases status indicator -->
                            <div v-else-if="isMyCases" class="flex items-center gap-2 mt-3 text-sm text-green-600 dark:text-green-400">
                                <span class="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 rounded text-xs">
                                    In Review
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <!-- Normal Priority Section -->
            <div v-if="normalReferrals.length > 0" class="p-2">
                <div class="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-yellow-600 dark:text-yellow-400">
                    <span>🟡</span>
                    <span>Normal Priority</span>
                    <Badge variant="secondary" class="ml-auto">
                        {{ normalReferrals.length }}
                    </Badge>
                </div>
                
                <div class="space-y-1 mt-1">
                    <Card
                        v-for="referral in normalReferrals"
                        :key="referral.id"
                        :class="cn(
                            'cursor-pointer transition-all hover:shadow-md',
                            selectedPatientId === referral.patient.id && 'ring-2 ring-primary'
                        )"
                        @click="emit('select', referral.patient.id)"
                    >
                        <CardContent class="p-3">
                            <div class="flex items-start justify-between">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2">
                                        <span class="font-medium truncate">{{ referral.patient.name }}</span>
                                        <Badge :variant="triageBadgeVariant[referral.patient.triage_color]" class="shrink-0">
                                            {{ referral.patient.triage_color }}
                                        </Badge>
                                    </div>
                                    <div class="text-sm text-muted-foreground mt-0.5">
                                        {{ referral.patient.age ?? '-' }}y • {{ referral.patient.gender ?? '-' }}
                                    </div>
                                    <div class="text-xs text-muted-foreground mt-1">
                                        {{ isMyCases ? 'In Review' : 'Referred by: ' + referral.referred_by }}
                                    </div>
                                </div>
                                <div class="text-right shrink-0 ml-2">
                                    <div class="text-sm font-medium">
                                        {{ formatWaitingTime(referral.patient) }}
                                    </div>
                                    <div class="text-xs text-muted-foreground">{{ isMyCases ? 'active' : 'waiting' }}</div>
                                </div>
                            </div>

                            <!-- Action Buttons - Only show for referrals, not my-cases -->
                            <div v-if="!isMyCases && !acceptedReferralIds?.has(referral.couch_id)" class="flex gap-2 mt-3">
                                <Button
                                    size="sm"
                                    variant="default"
                                    class="flex-1"
                                    :disabled="actionInProgress === referral.id"
                                    @click.stop="emit('accept', referral.id)"
                                >
                                    <span v-if="actionInProgress === referral.id" class="animate-spin mr-1">⏳</span>
                                    {{ actionInProgress === referral.id ? 'Accepting...' : 'Accept' }}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    :disabled="actionInProgress === referral.id"
                                    @click.stop="emit('reject', referral.id)"
                                >
                                    Reject
                                </Button>
                            </div>
                            <!-- Accepted indicator -->
                            <div v-else-if="!isMyCases && acceptedReferralIds?.has(referral.couch_id)" class="flex items-center justify-center gap-2 mt-3 text-sm text-green-600 dark:text-green-400">
                                <span>✓</span>
                                <span>Accepted</span>
                            </div>
                            <!-- My Cases status indicator -->
                            <div v-else-if="isMyCases" class="flex items-center gap-2 mt-3 text-sm text-green-600 dark:text-green-400">
                                <span class="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 rounded text-xs">
                                    In Review
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <!-- Empty State -->
            <div
                v-if="highPriorityReferrals.length === 0 && normalReferrals.length === 0"
                class="flex flex-col items-center justify-center h-48 text-muted-foreground"
            >
                <svg class="h-12 w-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p class="text-sm">{{ isMyCases ? 'No active cases' : 'No patients in queue' }}</p>
            </div>
        </div>

        <!-- New Walk-ins Section - Only show for referrals tab -->
        <div v-if="!isMyCases" class="p-2 border-t border-sidebar-border/70">
            <Button variant="outline" class="w-full" as-child>
                <a href="/patients/new">
                    <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Register New Patient
                </a>
            </Button>
        </div>
    </div>
</template>
