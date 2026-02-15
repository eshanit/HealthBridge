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

interface Props {
    patient: Patient;
    explanation: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'requestExplanation'): void;
}>();

// State
const isLoading = ref(false);
const activeSection = ref<'why' | 'missing' | 'risks' | 'next'>('why');

// Computed sections from explanation
const parsedExplanation = computed(() => {
    if (!props.explanation) return null;
    
    // Try to parse structured explanation
    const sections = {
        why: '',
        missing: '',
        risks: '',
        next: '',
    };
    
    // Simple parsing - look for section headers
    const lines = props.explanation.split('\n');
    let currentSection: keyof typeof sections | null = null;
    
    for (const line of lines) {
        const lowerLine = line.toLowerCase();
        
        if (lowerLine.includes('why') || lowerLine.includes('reason') || lowerLine.includes('classification')) {
            currentSection = 'why';
            continue;
        }
        if (lowerLine.includes('missing') || lowerLine.includes('data not') || lowerLine.includes('unknown')) {
            currentSection = 'missing';
            continue;
        }
        if (lowerLine.includes('risk') || lowerLine.includes('danger') || lowerLine.includes('warning')) {
            currentSection = 'risks';
            continue;
        }
        if (lowerLine.includes('next') || lowerLine.includes('recommend') || lowerLine.includes('suggest')) {
            currentSection = 'next';
            continue;
        }
        
        if (currentSection && line.trim()) {
            sections[currentSection] += line + '\n';
        }
    }
    
    // If no structured parsing worked, put everything in 'why'
    if (!sections.why && !sections.missing && !sections.risks && !sections.next) {
        sections.why = props.explanation;
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
                <Card>
                    <CardContent class="p-3">
                        <div v-if="parsedExplanation[activeSection]" class="text-sm">
                            {{ parsedExplanation[activeSection] }}
                        </div>
                        <div v-else class="text-sm text-muted-foreground">
                            No information available for this section.
                        </div>
                    </CardContent>
                </Card>
            </div>

            <!-- Request Explanation Button -->
            <div v-if="!parsedExplanation">
                <Card class="border-dashed">
                    <CardContent class="p-4 text-center">
                        <div class="text-muted-foreground mb-3">
                            <svg class="h-8 w-8 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            <p class="text-sm">No AI explanation available</p>
                        </div>
                        <Button size="sm" @click="emit('requestExplanation')">
                            Request Explanation
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
