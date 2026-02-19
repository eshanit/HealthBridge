<script setup lang="ts">
import { ref, computed } from 'vue';
import PatientHeader from './PatientHeader.vue';
import ClinicalTabs from './ClinicalTabs.vue';
import AIExplainabilityPanel from './AIExplainabilityPanel.vue';

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

interface Props {
    patient: Patient;
    referral: Referral | null;
    isAccepted?: boolean; // Whether the referral has been accepted - enables editing and AI features
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'stateChange', newState: string): void;
    (e: 'aiCall', task: string): void;
}>();

// AI Explanation type
interface AIExplanation {
    error?: string;
    message?: string;
    status?: number;
    detail?: string;
}

// State
const activeTab = ref('summary');
const showAIPanel = ref(true);
const aiExplanation = ref<string | AIExplanation | null>(null);
const isAILoading = ref(false);

// Reset AI state when patient changes
const resetAIState = () => {
    aiExplanation.value = null;
    isAILoading.value = false;
};

// Computed
const triageLabel = computed(() => {
    switch (props.patient.triage_color) {
        case 'RED': return 'Emergency';
        case 'YELLOW': return 'Urgent';
        case 'GREEN': return 'Routine';
        default: return 'Unknown';
    }
});

// Extract onboarding data from referral
const chiefComplaint = computed(() => props.referral?.chief_complaint);
const medicalHistory = computed(() => props.referral?.medical_history ?? []);
const currentMedications = computed(() => props.referral?.current_medications ?? []);
const allergies = computed(() => props.referral?.allergies ?? []);

// Merge vitals from patient and referral
const mergedVitals = computed(() => ({
    ...props.referral?.vitals,
    ...props.patient.vitals,
}));

// Patient with merged vitals
const patientWithVitals = computed(() => ({
    ...props.patient,
    vitals: mergedVitals.value,
}));

// Methods
const handleStateChange = (newState: string) => {
    emit('stateChange', newState);
};

const handleAITask = async (task: string) => {
    emit('aiCall', task);
    
    // Set loading state
    isAILoading.value = true;
    aiExplanation.value = null;
    
    // Call AI API
    try {
        const response = await fetch('/api/ai/medgemma', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                task,
                patient_id: props.patient.id,
                context: {
                    triage_color: props.patient.triage_color,
                    danger_signs: props.patient.danger_signs,
                    vitals: mergedVitals.value,
                },
            }),
        });
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text.substring(0, 500));
            aiExplanation.value = {
                error: 'Server returned non-JSON response',
                status: response.status,
                detail: text.substring(0, 200),
            };
            return;
        }
        
        const data = await response.json();
        
        if (response.ok) {
            aiExplanation.value = data.response || data.output || data.explanation || null;
        } else {
            console.error('AI request failed:', data);
            aiExplanation.value = {
                error: data.error || 'AI request failed',
                message: data.message || data.detail || 'Unknown error',
            };
        }
    } catch (error) {
        console.error('AI call failed:', error);
        aiExplanation.value = {
            error: 'Network or parsing error',
            detail: error instanceof Error ? error.message : String(error),
        };
    } finally {
        isAILoading.value = false;
    }
};

const toggleAIPanel = () => {
    showAIPanel.value = !showAIPanel.value;
};
</script>

<template>
    <div class="flex flex-col h-full overflow-hidden">
        <!-- View-Only Mode Banner -->
        <div v-if="!isAccepted" class="bg-amber-100 dark:bg-amber-900/30 border-b border-amber-300 dark:border-amber-700 px-4 py-2">
            <div class="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <span class="text-lg">🔒</span>
                <div>
                    <span class="font-medium">View-Only Mode:</span>
                    <span class="ml-1">Accept the referral to enable editing and AI features.</span>
                </div>
            </div>
        </div>

        <!-- Patient Header -->
        <PatientHeader
            :patient="patient"
            :referral="referral"
            :triage-label="triageLabel"
            :is-accepted="isAccepted"
            @state-change="handleStateChange"
        />

        <!-- Main Content Area -->
        <div class="flex flex-1 overflow-hidden">
            <!-- Clinical Tabs (Main Content) -->
            <div class="flex-1 overflow-hidden">
                <ClinicalTabs
                    :patient="patientWithVitals"
                    :active-tab="activeTab"
                    :chief-complaint="chiefComplaint"
                    :medical-history="medicalHistory"
                    :current-medications="currentMedications"
                    :allergies="allergies"
                    :read-only="!isAccepted"
                    :session-couch-id="referral?.couch_id"
                    @update:active-tab="activeTab = $event"
                    @ai-task="handleAITask"
                />
            </div>

            <!-- AI Explainability Panel (Right Sidebar) - Only show when accepted -->
            <div
                v-if="showAIPanel && isAccepted"
                class="w-80 border-l border-sidebar-border/70 bg-sidebar/50 overflow-hidden"
            >
                <AIExplainabilityPanel
                    :patient="patient"
                    :explanation="aiExplanation"
                    :is-loading="isAILoading"
                    @close="toggleAIPanel"
                    @request-explanation="handleAITask('explain_triage')"
                    @reset="resetAIState"
                />
            </div>
            
            <!-- AI Disabled Panel (when not accepted) -->
            <div
                v-if="showAIPanel && !isAccepted"
                class="w-80 border-l border-sidebar-border/70 bg-sidebar/50 overflow-hidden flex items-center justify-center"
            >
                <div class="text-center p-4 text-muted-foreground">
                    <span class="text-4xl">🔒</span>
                    <p class="mt-2 font-medium">AI Features Disabled</p>
                    <p class="text-sm mt-1">Accept the referral to enable AI assistance.</p>
                </div>
            </div>
        </div>

        <!-- AI Panel Toggle Button (when hidden) -->
        <button
            v-if="!showAIPanel"
            class="fixed right-4 top-1/2 -translate-y-1/2 bg-primary text-primary-foreground p-2 rounded-l-md shadow-lg hover:bg-primary/90 transition-colors"
            @click="toggleAIPanel"
        >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
        </button>
    </div>
</template>
