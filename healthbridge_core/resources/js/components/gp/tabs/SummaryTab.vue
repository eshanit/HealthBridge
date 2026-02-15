<script setup lang="ts">
import { ref, computed } from 'vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'aiTask', task: string): void;
}>();

// Computed
const triageExplanation = computed(() => {
    const explanations: string[] = [];
    
    if (props.patient.danger_signs.includes('Chest indrawing')) {
        explanations.push('Chest indrawing indicates severe respiratory distress');
    }
    if (props.patient.danger_signs.includes('Cyanosis')) {
        explanations.push('Cyanosis suggests hypoxia requiring immediate attention');
    }
    if (props.patient.danger_signs.includes('Stridor')) {
        explanations.push('Stridor indicates upper airway obstruction');
    }
    if (props.patient.danger_signs.includes('Fast breathing')) {
        explanations.push('Fast breathing is a sign of respiratory infection');
    }
    
    return explanations;
});

const vitalsStatus = computed(() => {
    const vitals = props.patient.vitals;
    if (!vitals) return null;
    
    const status: { name: string; value: number | undefined; status: 'normal' | 'warning' | 'critical' }[] = [];
    
    // Respiratory Rate
    if (vitals.rr) {
        let rrStatus: 'normal' | 'warning' | 'critical' = 'normal';
        if (props.patient.age < 5) {
            if (vitals.rr > 40) rrStatus = 'warning';
            if (vitals.rr > 60) rrStatus = 'critical';
        } else {
            if (vitals.rr > 30) rrStatus = 'warning';
            if (vitals.rr > 40) rrStatus = 'critical';
        }
        status.push({ name: 'RR', value: vitals.rr, status: rrStatus });
    }
    
    // Heart Rate
    if (vitals.hr) {
        let hrStatus: 'normal' | 'warning' | 'critical' = 'normal';
        if (props.patient.age < 5) {
            if (vitals.hr > 140) hrStatus = 'warning';
            if (vitals.hr > 180) hrStatus = 'critical';
        } else {
            if (vitals.hr > 120) hrStatus = 'warning';
            if (vitals.hr > 160) hrStatus = 'critical';
        }
        status.push({ name: 'HR', value: vitals.hr, status: hrStatus });
    }
    
    // Temperature
    if (vitals.temp) {
        let tempStatus: 'normal' | 'warning' | 'critical' = 'normal';
        if (vitals.temp > 38.5) tempStatus = 'warning';
        if (vitals.temp > 40) tempStatus = 'critical';
        status.push({ name: 'Temp', value: vitals.temp, status: tempStatus });
    }
    
    // SpO2
    if (vitals.spo2) {
        let spo2Status: 'normal' | 'warning' | 'critical' = 'normal';
        if (vitals.spo2 < 95) spo2Status = 'warning';
        if (vitals.spo2 < 90) spo2Status = 'critical';
        status.push({ name: 'SpO2', value: vitals.spo2, status: spo2Status });
    }
    
    return status;
});

const vitalStatusColor = (status: 'normal' | 'warning' | 'critical') => {
    switch (status) {
        case 'normal': return 'text-green-600 dark:text-green-400';
        case 'warning': return 'text-yellow-600 dark:text-yellow-400';
        case 'critical': return 'text-red-600 dark:text-red-400';
    }
};

// Methods
const requestAIExplanation = () => {
    emit('aiTask', 'explain_triage');
};
</script>

<template>
    <div class="space-y-4">
        <!-- Triage Summary Card -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg flex items-center justify-between">
                    <span>Triage Summary</span>
                    <Badge
                        :variant="patient.triage_color === 'RED' ? 'destructive' : patient.triage_color === 'YELLOW' ? 'secondary' : 'default'"
                    >
                        {{ patient.triage_color }} - {{ patient.triage_color === 'RED' ? 'Emergency' : patient.triage_color === 'YELLOW' ? 'Urgent' : 'Routine' }}
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <!-- Danger Signs -->
                <div v-if="patient.danger_signs?.length > 0" class="mb-4">
                    <h4 class="text-sm font-medium text-muted-foreground mb-2">Danger Signs</h4>
                    <div class="flex flex-wrap gap-2">
                        <span
                            v-for="sign in patient.danger_signs"
                            :key="sign"
                            class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-sm"
                        >
                            <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                            </svg>
                            {{ sign }}
                        </span>
                    </div>
                </div>

                <!-- Vitals -->
                <div v-if="vitalsStatus && vitalsStatus.length > 0" class="mb-4">
                    <h4 class="text-sm font-medium text-muted-foreground mb-2">Vitals</h4>
                    <div class="grid grid-cols-4 gap-3">
                        <div
                            v-for="vital in vitalsStatus"
                            :key="vital.name"
                            class="text-center p-2 rounded-lg bg-muted/50"
                        >
                            <div class="text-xs text-muted-foreground">{{ vital.name }}</div>
                            <div :class="cn('text-lg font-semibold', vitalStatusColor(vital.status))">
                                {{ vital.value }}
                                <span class="text-xs font-normal">
                                    {{ vital.name === 'Temp' ? '°C' : vital.name === 'SpO2' ? '%' : vital.name === 'RR' ? '/min' : '/min' }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Why This Classification -->
                <div v-if="triageExplanation.length > 0" class="p-3 rounded-lg bg-muted/30 border border-muted">
                    <h4 class="text-sm font-medium mb-2 flex items-center gap-2">
                        <svg class="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Why This Classification?
                    </h4>
                    <ul class="text-sm text-muted-foreground space-y-1">
                        <li v-for="(explanation, index) in triageExplanation" :key="index">
                            • {{ explanation }}
                        </li>
                    </ul>
                </div>
            </CardContent>
        </Card>

        <!-- AI Explanation Card -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg flex items-center gap-2">
                    <span>🤖</span>
                    <span>AI Clinical Support</span>
                    <Badge variant="outline" class="text-xs">Support Only</Badge>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p class="text-sm text-muted-foreground mb-4">
                    Request AI-powered clinical guidance for this patient's triage classification.
                </p>
                <Button variant="outline" @click="requestAIExplanation">
                    <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Explain Triage Decision
                </Button>
            </CardContent>
        </Card>

        <!-- Patient History Summary -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg">Patient History</CardTitle>
            </CardHeader>
            <CardContent>
                <div class="text-sm text-muted-foreground">
                    <p class="mb-2">
                        <span class="font-medium text-foreground">Age:</span> {{ patient.age }} years old
                    </p>
                    <p class="mb-2">
                        <span class="font-medium text-foreground">Gender:</span> {{ patient.gender }}
                    </p>
                    <p class="mb-2">
                        <span class="font-medium text-foreground">CPT:</span> {{ patient.cpt }}
                    </p>
                    <p>
                        <span class="font-medium text-foreground">Referral Source:</span> {{ patient.referral_source }}
                    </p>
                </div>
            </CardContent>
        </Card>
    </div>
</template>
