<script setup lang="ts">
import { cn } from '@/lib/utils';
import SummaryTab from './tabs/SummaryTab.vue';
import AssessmentTab from './tabs/AssessmentTab.vue';
import DiagnosticsTab from './tabs/DiagnosticsTab.vue';
import TreatmentTab from './tabs/TreatmentTab.vue';
import AIGuidanceTab from './tabs/AIGuidanceTab.vue';
import TimelineView from './TimelineView.vue';
import StructuredPrescription from './StructuredPrescription.vue';
import InteractiveAIGuidance from './InteractiveAIGuidance.vue';
import ClinicalCalculators from './ClinicalCalculators.vue';

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

interface Props {
    patient: Patient;
    activeTab: string;
    chiefComplaint?: string;
    medicalHistory?: string[];
    currentMedications?: string[];
    allergies?: string[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'update:activeTab', tab: string): void;
    (e: 'aiTask', task: string): void;
}>();

const tabs = [
    { id: 'summary', label: 'Summary', icon: '📋' },
    { id: 'assessment', label: 'Assessment', icon: '🩺' },
    { id: 'diagnostics', label: 'Diagnostics', icon: '🔬' },
    { id: 'treatment', label: 'Treatment', icon: '💊' },
    { id: 'prescription', label: 'Prescription', icon: '📝' },
    { id: 'timeline', label: 'Timeline', icon: '📅' },
    { id: 'ai_guidance', label: 'AI Guidance', icon: '🤖' },
    { id: 'calculators', label: 'Calculators', icon: '🔢' },
];

const selectTab = (tabId: string) => {
    emit('update:activeTab', tabId);
};

const handleAITask = (task: string) => {
    emit('aiTask', task);
};
</script>

<template>
    <div class="flex flex-col h-full overflow-hidden">
        <!-- Tab Headers -->
        <div class="border-b border-sidebar-border/70 bg-card">
            <div class="flex overflow-x-auto">
                <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    :class="cn(
                        'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
                        activeTab === tab.id
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                    )"
                    @click="selectTab(tab.id)"
                >
                    <span>{{ tab.icon }}</span>
                    <span>{{ tab.label }}</span>
                </button>
            </div>
        </div>

        <!-- Tab Content -->
        <div class="flex-1 overflow-y-auto p-4">
            <SummaryTab
                v-if="activeTab === 'summary'"
                :patient="patient"
                :chief-complaint="chiefComplaint"
                :medical-history="medicalHistory"
                :current-medications="currentMedications"
                :allergies="allergies"
                @ai-task="handleAITask"
            />
            
            <AssessmentTab
                v-else-if="activeTab === 'assessment'"
                :patient="patient"
            />
            
            <DiagnosticsTab
                v-else-if="activeTab === 'diagnostics'"
                :patient="patient"
            />
            
            <TreatmentTab
                v-else-if="activeTab === 'treatment'"
                :patient="patient"
            />
            
            <!-- Structured Prescription Tab -->
            <StructuredPrescription
                v-else-if="activeTab === 'prescription'"
                :session-couch-id="patient.id"
            />
            
            <!-- Timeline Tab -->
            <TimelineView
                v-else-if="activeTab === 'timeline'"
                :session-couch-id="patient.id"
            />
            
            <!-- Interactive AI Guidance Tab -->
            <InteractiveAIGuidance
                v-else-if="activeTab === 'ai_guidance'"
                :session-couch-id="patient.id"
                :patient-context="{
                    age: patient.age ?? undefined,
                    triage_priority: patient.triage_color,
                    vitals: patient.vitals,
                    danger_signs: patient.danger_signs
                }"
            />
            
            <!-- Clinical Calculators Tab -->
            <ClinicalCalculators
                v-else-if="activeTab === 'calculators'"
                :patient-weight="patient.vitals?.weight"
                :patient-age-months="patient.age ? patient.age * 12 : undefined"
            />
        </div>
    </div>
</template>
