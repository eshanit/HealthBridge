<script setup lang="ts">
import { ref, reactive } from 'vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

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

// Lab orders state
const labOrders = reactive({
    cbc: false,
    malaria: false,
    blood_culture: false,
    urinalysis: false,
    blood_glucose: false,
    electrolytes: false,
    liver_function: false,
    hiv: false,
    other: '',
});

// Imaging orders state
const imagingOrders = reactive({
    chest_xray: false,
    abdominal_xray: false,
    ultrasound: false,
    ct_scan: false,
    other: '',
});

// Results state
const labResults = ref<string[]>([]);
const imagingResults = ref<string[]>([]);
const specialistNotes = ref('');
const isOrdering = ref(false);

// Common lab tests
const commonLabTests = [
    { id: 'cbc', label: 'CBC (Complete Blood Count)', urgent: false },
    { id: 'malaria', label: 'Malaria RDT/Blood Smear', urgent: false },
    { id: 'blood_culture', label: 'Blood Culture', urgent: true },
    { id: 'urinalysis', label: 'Urinalysis', urgent: false },
    { id: 'blood_glucose', label: 'Blood Glucose', urgent: false },
    { id: 'electrolytes', label: 'Electrolytes', urgent: false },
    { id: 'liver_function', label: 'Liver Function Tests', urgent: false },
    { id: 'hiv', label: 'HIV Test', urgent: false },
];

// Common imaging
const commonImaging = [
    { id: 'chest_xray', label: 'Chest X-Ray', urgent: false },
    { id: 'abdominal_xray', label: 'Abdominal X-Ray', urgent: false },
    { id: 'ultrasound', label: 'Ultrasound', urgent: false },
    { id: 'ct_scan', label: 'CT Scan', urgent: true },
];

const toggleLabOrder = (id: string) => {
    (labOrders as Record<string, boolean | string>)[id] = !(labOrders as Record<string, boolean | string>)[id];
};

const toggleImagingOrder = (id: string) => {
    (imagingOrders as Record<string, boolean | string>)[id] = !(imagingOrders as Record<string, boolean | string>)[id];
};

const submitOrders = async () => {
    isOrdering.value = true;
    
    try {
        const selectedLabs = Object.entries(labOrders)
            .filter(([key, value]) => value === true)
            .map(([key]) => key);
        
        const selectedImaging = Object.entries(imagingOrders)
            .filter(([key, value]) => value === true)
            .map(([key]) => key);
        
        const response = await fetch(`/sessions/${props.patient.id}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
            body: JSON.stringify({
                labs: selectedLabs,
                imaging: selectedImaging,
                other_lab: labOrders.other,
                other_imaging: imagingOrders.other,
            }),
        });
        
        if (response.ok) {
            console.log('Orders submitted successfully');
        }
    } catch (error) {
        console.error('Failed to submit orders:', error);
    } finally {
        isOrdering.value = false;
    }
};
</script>

<template>
    <div class="space-y-4">
        <!-- Lab Orders -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg flex items-center justify-between">
                    <span>Laboratory Orders</span>
                    <Badge variant="outline">Select tests to order</Badge>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div class="grid grid-cols-2 gap-2 mb-4">
                    <Button
                        v-for="test in commonLabTests"
                        :key="test.id"
                        :variant="(labOrders as Record<string, boolean | string>)[test.id] ? 'default' : 'outline'"
                        size="sm"
                        class="justify-start"
                        @click="toggleLabOrder(test.id)"
                    >
                        <span v-if="test.urgent" class="text-red-500 mr-1">⚠️</span>
                        {{ test.label }}
                    </Button>
                </div>
                <div>
                    <Label>Other Lab Tests</Label>
                    <Textarea
                        v-model="labOrders.other"
                        placeholder="Specify other lab tests..."
                        rows="2"
                    />
                </div>
            </CardContent>
        </Card>

        <!-- Imaging Orders -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg">Imaging Orders</CardTitle>
            </CardHeader>
            <CardContent>
                <div class="grid grid-cols-2 gap-2 mb-4">
                    <Button
                        v-for="imaging in commonImaging"
                        :key="imaging.id"
                        :variant="(imagingOrders as Record<string, boolean | string>)[imaging.id] ? 'default' : 'outline'"
                        size="sm"
                        class="justify-start"
                        @click="toggleImagingOrder(imaging.id)"
                    >
                        <span v-if="imaging.urgent" class="text-red-500 mr-1">⚠️</span>
                        {{ imaging.label }}
                    </Button>
                </div>
                <div>
                    <Label>Other Imaging</Label>
                    <Textarea
                        v-model="imagingOrders.other"
                        placeholder="Specify other imaging..."
                        rows="2"
                    />
                </div>
            </CardContent>
        </Card>

        <!-- Results Section -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg">Results</CardTitle>
            </CardHeader>
            <CardContent>
                <div class="space-y-4">
                    <!-- Lab Results -->
                    <div>
                        <Label class="text-sm text-muted-foreground">Lab Results</Label>
                        <div v-if="labResults.length > 0" class="mt-2 space-y-2">
                            <div
                                v-for="(result, index) in labResults"
                                :key="index"
                                class="p-2 rounded bg-muted/50 text-sm"
                            >
                                {{ result }}
                            </div>
                        </div>
                        <div v-else class="text-sm text-muted-foreground mt-2">
                            No lab results available yet
                        </div>
                    </div>
                    
                    <!-- Imaging Results -->
                    <div>
                        <Label class="text-sm text-muted-foreground">Imaging Results</Label>
                        <div v-if="imagingResults.length > 0" class="mt-2 space-y-2">
                            <div
                                v-for="(result, index) in imagingResults"
                                :key="index"
                                class="p-2 rounded bg-muted/50 text-sm"
                            >
                                {{ result }}
                            </div>
                        </div>
                        <div v-else class="text-sm text-muted-foreground mt-2">
                            No imaging results available yet
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>

        <!-- Specialist Notes -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg">Specialist Notes</CardTitle>
            </CardHeader>
            <CardContent>
                <Textarea
                    v-model="specialistNotes"
                    placeholder="Notes from specialist consultations..."
                    rows="4"
                />
            </CardContent>
        </Card>

        <!-- Submit Orders Button -->
        <div class="flex justify-end gap-2">
            <Button variant="outline">
                View Pending Orders
            </Button>
            <Button :disabled="isOrdering" @click="submitOrders">
                {{ isOrdering ? 'Submitting...' : 'Submit Orders' }}
            </Button>
        </div>
    </div>
</template>
