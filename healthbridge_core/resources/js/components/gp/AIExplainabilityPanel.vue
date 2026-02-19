<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

// AI Explanation type - can be a string or an error object
interface AIExplanation {
    error?: string;
    message?: string;
    status?: number;
    detail?: string;
}

interface Props {
    patient: Patient;
    explanation: string | AIExplanation | null;
    isLoading?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'requestExplanation'): void;
    (e: 'reset'): void;
}>();

// State
const activeSection = ref<'why' | 'missing' | 'risks' | 'next'>('why');

// Watch for patient changes and reset state
watch(() => props.patient.id, (newPatientId, oldPatientId) => {
    if (oldPatientId && newPatientId !== oldPatientId) {
        // Reset state when patient changes
        activeSection.value = 'why';
        emit('reset');
    }
});

// Check if explanation is an error object
const isErrorObject = computed(() => {
    return typeof props.explanation === 'object' && props.explanation !== null;
});

// Get error message if explanation is an error object
const errorMessage = computed(() => {
    if (isErrorObject.value && props.explanation) {
        const err = props.explanation as AIExplanation;
        return err.error || err.message || 'An error occurred';
    }
    return null;
});

// Get error detail if explanation is an error object
const errorDetail = computed(() => {
    if (isErrorObject.value && props.explanation) {
        const err = props.explanation as AIExplanation;
        return err.detail;
    }
    return null;
});

// Get string explanation
const explanationString = computed(() => {
    if (typeof props.explanation === 'string') {
        return props.explanation;
    }
    return null;
});

// Computed sections from explanation
const parsedExplanation = computed(() => {
    const text = explanationString.value;
    if (!text) return null;
    
    // Try to parse structured explanation
    const sections = {
        why: '',
        missing: '',
        risks: '',
        next: '',
    };
    
    // Parse based on actual section headers from the AI response
    // The AI uses numbered headers like: **1. Clinical Interpretation:**
    const lines = text.split('\n');
    let currentSection: keyof typeof sections | null = null;
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Only match lines that look like section headers:
        // - Start with **N. (numbered bold)
        // - Are relatively short (< 100 chars for a header)
        // - Contain specific section keywords
        
        if (trimmedLine.startsWith('**') && trimmedLine.length < 100) {
            const lowerLine = trimmedLine.toLowerCase();
            
            // WHY section: Clinical Interpretation, Triage Rationale, Differential Diagnoses
            if (lowerLine.includes('clinical interpretation') || 
                lowerLine.includes('triage rationale') ||
                lowerLine.includes('differential')) {
                currentSection = 'why';
                continue; // Skip the header line itself
            }
            
            // MISSING section: Missing data, data gaps, unknown information
            if (lowerLine.includes('missing') || 
                lowerLine.includes('data gaps') ||
                lowerLine.includes('data not available')) {
                currentSection = 'missing';
                continue;
            }
            
            // RISKS section: Red Flags, Warning signs
            if (lowerLine.includes('red flag') || 
                lowerLine.includes('warning') ||
                lowerLine.includes('risk factor')) {
                currentSection = 'risks';
                continue;
            }
            
            // NEXT section: Immediate Actions, Recommended Investigations, Clinical Decision Support
            if (lowerLine.includes('immediate action') || 
                lowerLine.includes('recommended investig') ||
                lowerLine.includes('clinical decision support') ||
                lowerLine.includes('next step')) {
                currentSection = 'next';
                continue;
            }
        }
        
        // Add content to current section
        if (currentSection && trimmedLine) {
            sections[currentSection] += line + '\n';
        }
    }
    
    // If no structured parsing worked, put everything in 'why'
    if (!sections.why && !sections.missing && !sections.risks && !sections.next) {
        sections.why = text;
    }
    
    return sections;
});

// Quick insights based on patient data
const quickInsights = computed(() => {
    const insights: { type: 'warning' | 'info' | 'critical'; message: string }[] = [];
    
    // Check for critical danger signs
    if (props.patient.danger_signs.includes('Cyanosis')) {
        insights.push({ type: 'critical', message: 'Cyanosis indicates possible hypoxia - consider immediate oxygen' });
    }
    if (props.patient.danger_signs.includes('Stridor')) {
        insights.push({ type: 'critical', message: 'Stridor suggests airway obstruction - may need urgent intervention' });
    }
    if (props.patient.danger_signs.includes('Chest indrawing')) {
        insights.push({ type: 'warning', message: 'Chest indrawing indicates severe respiratory distress' });
    }
    
    // Check vitals
    if (props.patient.vitals?.spo2 && props.patient.vitals.spo2 < 90) {
        insights.push({ type: 'critical', message: `SpO2 ${props.patient.vitals.spo2}% is critically low` });
    } else if (props.patient.vitals?.spo2 && props.patient.vitals.spo2 < 95) {
        insights.push({ type: 'warning', message: `SpO2 ${props.patient.vitals.spo2}% is below normal` });
    }
    
    // Check for missing data
    if (!props.patient.vitals?.spo2) {
        insights.push({ type: 'info', message: 'Oxygen saturation not recorded - consider pulse oximetry' });
    }
    
    return insights;
});

const sectionTabs = [
    { id: 'why', label: 'WHY', icon: '❓' },
    { id: 'missing', label: 'MISSING', icon: '⚠️' },
    { id: 'risks', label: 'RISKS', icon: '🚨' },
    { id: 'next', label: 'NEXT', icon: '➡️' },
] as const;

const getInsightColor = (type: 'warning' | 'info' | 'critical') => {
    switch (type) {
        case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800';
        case 'warning': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
        case 'info': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800';
    }
};
</script>

<template>
    <div class="flex flex-col h-full overflow-hidden">
        <!-- Header -->
        <div class="p-3 border-b border-sidebar-border/70 bg-sidebar">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="text-lg">🤖</span>
                    <div>
                        <h3 class="font-semibold text-sidebar-foreground">Clinical Support</h3>
                        <p class="text-xs text-sidebar-foreground/60">MedGemma 1.5</p>
                    </div>
                </div>
                <Button variant="ghost" size="sm" @click="emit('close')">
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </Button>
            </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-3 space-y-3">
            <!-- Support Only Badge -->
            <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-2 text-xs text-yellow-700 dark:text-yellow-300">
                ⚠️ AI outputs are for support only. Verify all suggestions.
            </div>

            <!-- Error Display -->
            <div v-if="isErrorObject" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                <div class="flex items-start gap-2">
                    <span class="text-red-500">❌</span>
                    <div>
                        <h4 class="font-medium text-red-700 dark:text-red-300 text-sm">{{ errorMessage }}</h4>
                        <p v-if="errorDetail" class="text-xs text-red-600 dark:text-red-400 mt-1">{{ errorDetail }}</p>
                    </div>
                </div>
            </div>

            <!-- Quick Insights -->
            <div v-if="quickInsights.length > 0" class="space-y-2">
                <h4 class="text-xs font-medium text-muted-foreground uppercase">Quick Insights</h4>
                <div
                    v-for="(insight, index) in quickInsights"
                    :key="index"
                    :class="cn('text-xs p-2 rounded border', getInsightColor(insight.type))"
                >
                    {{ insight.message }}
                </div>
            </div>

            <!-- Explanation Sections -->
            <div v-if="parsedExplanation">
                <!-- Section Tabs -->
                <div class="flex gap-1 mb-2">
                    <Button
                        v-for="tab in sectionTabs"
                        :key="tab.id"
                        :variant="activeSection === tab.id ? 'default' : 'ghost'"
                        size="sm"
                        class="flex-1 text-xs"
                        @click="activeSection = tab.id"
                    >
                        <span class="mr-1">{{ tab.icon }}</span>
                        {{ tab.label }}
                    </Button>
                </div>

                <!-- Section Content -->
                <Card class="overflow-hidden">
                    <CardContent class="p-3 max-h-[400px] overflow-y-auto">
                        <div v-if="parsedExplanation[activeSection]" class="text-sm whitespace-pre-wrap">
                            {{ parsedExplanation[activeSection] }}
                        </div>
                        <div v-else class="text-sm text-muted-foreground">
                            No information available for this section.
                        </div>
                    </CardContent>
                </Card>
            </div>

            <!-- Loading State -->
            <div v-if="isLoading" class="flex items-center justify-center py-8">
                <div class="flex flex-col items-center gap-2">
                    <svg class="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p class="text-sm text-muted-foreground">Generating clinical explanation...</p>
                </div>
            </div>

            <!-- Request Explanation Button -->
            <div v-if="!parsedExplanation && !isErrorObject && !isLoading">
                <Card class="border-dashed">
                    <CardContent class="p-4 text-center">
                        <div class="text-muted-foreground mb-3">
                            <svg class="h-8 w-8 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            <p class="text-sm">No AI explanation available</p>
                        </div>
                        <Button size="sm" @click="emit('requestExplanation')" :disabled="isLoading">
                            <svg v-if="isLoading" class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span v-if="isLoading">Generating...</span>
                            <span v-else>Request Explanation</span>
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <!-- View AI Audit -->
            <Button variant="outline" size="sm" class="w-full" as-child>
                <a :href="`/audit/ai?patient=${patient.id}`" target="_blank">
                    <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    View AI Audit Log
                </a>
            </Button>
        </div>

        <!-- Footer -->
        <div class="p-3 border-t border-sidebar-border/70 bg-sidebar">
            <div class="flex items-center justify-between text-xs text-sidebar-foreground/60">
                <span>Use Case: Explain Triage</span>
                <Badge variant="outline" class="text-xs">Support Only</Badge>
            </div>
        </div>
    </div>
</template>
