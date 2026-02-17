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

interface Props {
    patient: Patient;
    referral: Referral | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'stateChange', newState: string): void;
    (e: 'aiCall', task: string): void;
}>();

// State
const activeTab = ref('summary');
const showAIPanel = ref(true);
const aiExplanation = ref<string | null>(null);

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
    
    // Call AI API
    try {
        const response = await fetch('/api/ai/medgemma', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
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
        
        if (response.ok) {
            const data = await response.json();
            aiExplanation.value = data.output || data.explanation || null;
        }
    } catch (error) {
        console.error('AI call failed:', error);
    }
};

const toggleAIPanel = () => {
    showAIPanel.value = !showAIPanel.value;
};
</script>

<template>
    <div class="flex flex-col h-full overflow-hidden">
        <!-- Patient Header -->
        <PatientHeader
            :patient="patient"
            :referral="referral"
            :triage-label="triageLabel"
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
                    @update:active-tab="activeTab = $event"
                    @ai-task="handleAITask"
                />
            </div>

            <!-- AI Explainability Panel (Right Sidebar) -->
            <div
                v-if="showAIPanel"
                class="w-80 border-l border-sidebar-border/70 bg-sidebar/50 overflow-hidden"
            >
                <AIExplainabilityPanel
                    :patient="patient"
                    :explanation="aiExplanation"
                    @close="toggleAIPanel"
                    @request-explanation="handleAITask('explain_triage')"
                />
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
