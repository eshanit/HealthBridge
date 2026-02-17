<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Props {
    patientWeight?: number;
    patientAgeMonths?: number;
}

const props = withDefaults(defineProps<Props>(), {
    patientWeight: undefined,
    patientAgeMonths: undefined,
});

// Active calculator
const activeCalculator = ref<'dosage' | 'gcs' | 'parkland' | 'growth'>('dosage');

// Dosage Calculator State
const weight = ref<number>(props.patientWeight || 0);
const selectedDrug = ref<string>('');
const doseResult = ref<string | null>(null);

// Drug dosage database (simplified - in production, this would come from a proper drug database)
const drugDatabase: Record<string, { name: string; dosePerKg: number; unit: string; maxDose: number; frequency: string }> = {
    paracetamol: { name: 'Paracetamol', dosePerKg: 15, unit: 'mg', maxDose: 1000, frequency: 'Every 4-6 hours' },
    amoxicillin: { name: 'Amoxicillin', dosePerKg: 25, unit: 'mg', maxDose: 500, frequency: 'Three times daily' },
    ibuprofen: { name: 'Ibuprofen', dosePerKg: 10, unit: 'mg', maxDose: 400, frequency: 'Every 6-8 hours' },
    azithromycin: { name: 'Azithromycin', dosePerKg: 10, unit: 'mg', maxDose: 500, frequency: 'Once daily' },
    ceftriaxone: { name: 'Ceftriaxone', dosePerKg: 50, unit: 'mg', maxDose: 2000, frequency: 'Once daily (IV/IM)' },
    'co-trimoxazole': { name: 'Co-trimoxazole', dosePerKg: 4, unit: 'mg (trimethoprim)', maxDose: 160, frequency: 'Twice daily' },
    oral_rehydration: { name: 'ORS', dosePerKg: 50, unit: 'ml', maxDose: 1000, frequency: 'After each loose stool' },
};

// GCS Calculator State
const eyeOpening = ref<number>(4);
const verbalResponse = ref<number>(5);
const motorResponse = ref<number>(6);

const gcsOptions = {
    eyeOpening: [
        { value: 4, label: 'Spontaneous' },
        { value: 3, label: 'To voice' },
        { value: 2, label: 'To pain' },
        { value: 1, label: 'None' },
    ],
    verbalResponse: [
        { value: 5, label: 'Oriented' },
        { value: 4, label: 'Confused' },
        { value: 3, label: 'Inappropriate words' },
        { value: 2, label: 'Incomprehensible sounds' },
        { value: 1, label: 'None' },
    ],
    motorResponse: [
        { value: 6, label: 'Obeys commands' },
        { value: 5, label: 'Localizes pain' },
        { value: 4, label: 'Withdraws from pain' },
        { value: 3, label: 'Abnormal flexion' },
        { value: 2, label: 'Extension' },
        { value: 1, label: 'None' },
    ],
};

// Parkland Formula State
const burnPercentage = ref<number>(0);
const burnWeight = ref<number>(props.patientWeight || 0);

// Computed values
const gcsScore = computed(() => eyeOpening.value + verbalResponse.value + motorResponse.value);

const gcsSeverity = computed(() => {
    const score = gcsScore.value;
    if (score >= 13) return { label: 'Mild', color: 'bg-green-500' };
    if (score >= 9) return { label: 'Moderate', color: 'bg-yellow-500' };
    return { label: 'Severe', color: 'bg-red-500' };
});

const parklandFluid = computed(() => {
    // Parkland formula: 4ml × body weight (kg) × %TBSA burned
    const totalFluid = 4 * burnWeight.value * burnPercentage.value;
    const first8Hours = totalFluid / 2;
    const next16Hours = totalFluid / 2;
    return { totalFluid, first8Hours, next16Hours };
});

// Calculate dosage
const calculateDose = () => {
    if (!selectedDrug.value || weight.value <= 0) {
        doseResult.value = null;
        return;
    }

    const drug = drugDatabase[selectedDrug.value];
    if (!drug) return;

    const calculatedDose = weight.value * drug.dosePerKg;
    const actualDose = Math.min(calculatedDose, drug.maxDose);

    doseResult.value = `${drug.name}: ${actualDose} ${drug.unit} ${drug.frequency}${
        calculatedDose > drug.maxDose ? ' (max dose applied)' : ''
    }`;
};

// Watch for changes
watch([weight, selectedDrug], calculateDose);

// Reset form when switching calculators
watch(activeCalculator, () => {
    doseResult.value = null;
});
</script>

<template>
    <Sheet>
        <SheetTrigger as-child>
            <Button variant="outline" size="sm">
                <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Calculators
            </Button>
        </SheetTrigger>
        <SheetContent class="w-[400px] sm:w-[540px] overflow-y-auto">
            <SheetHeader>
                <SheetTitle>Clinical Calculators</SheetTitle>
            </SheetHeader>

            <div class="mt-6 space-y-4">
                <!-- Calculator Tabs -->
                <div class="flex gap-2 flex-wrap">
                    <Button
                        v-for="(calc, key) in { dosage: 'Dosage', gcs: 'GCS', parkland: 'Parkland' }"
                        :key="key"
                        :variant="activeCalculator === key ? 'default' : 'outline'"
                        size="sm"
                        @click="activeCalculator = key as any"
                    >
                        {{ calc }}
                    </Button>
                </div>

                <!-- Dosage Calculator -->
                <Card v-if="activeCalculator === 'dosage'">
                    <CardHeader>
                        <CardTitle class="text-base">Weight-Based Dosage Calculator</CardTitle>
                    </CardHeader>
                    <CardContent class="space-y-4">
                        <div class="space-y-2">
                            <Label for="weight">Weight (kg)</Label>
                            <Input
                                id="weight"
                                v-model.number="weight"
                                type="number"
                                step="0.1"
                                min="0"
                                placeholder="Enter weight"
                            />
                        </div>

                        <div class="space-y-2">
                            <Label for="drug">Drug</Label>
                            <Select v-model="selectedDrug">
                                <SelectTrigger id="drug">
                                    <SelectValue placeholder="Select drug" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-for="(drug, key) in drugDatabase" :key="key" :value="key">
                                        {{ drug.name }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div v-if="doseResult" class="p-4 bg-muted rounded-lg">
                            <div class="text-sm font-medium mb-1">Recommended Dose:</div>
                            <div class="text-lg font-semibold">{{ doseResult }}</div>
                        </div>

                        <div class="text-xs text-muted-foreground">
                            <strong>Note:</strong> Always verify doses with current clinical guidelines.
                            Maximum doses are applied where appropriate.
                        </div>
                    </CardContent>
                </Card>

                <!-- GCS Calculator -->
                <Card v-if="activeCalculator === 'gcs'">
                    <CardHeader>
                        <CardTitle class="text-base">Glasgow Coma Scale (GCS)</CardTitle>
                    </CardHeader>
                    <CardContent class="space-y-4">
                        <!-- Eye Opening -->
                        <div class="space-y-2">
                            <Label>Eye Opening (E)</Label>
                            <Select v-model.number="eyeOpening">
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem
                                        v-for="option in gcsOptions.eyeOpening"
                                        :key="option.value"
                                        :value="option.value"
                                    >
                                        {{ option.value }} - {{ option.label }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <!-- Verbal Response -->
                        <div class="space-y-2">
                            <Label>Verbal Response (V)</Label>
                            <Select v-model.number="verbalResponse">
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem
                                        v-for="option in gcsOptions.verbalResponse"
                                        :key="option.value"
                                        :value="option.value"
                                    >
                                        {{ option.value }} - {{ option.label }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <!-- Motor Response -->
                        <div class="space-y-2">
                            <Label>Motor Response (M)</Label>
                            <Select v-model.number="motorResponse">
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem
                                        v-for="option in gcsOptions.motorResponse"
                                        :key="option.value"
                                        :value="option.value"
                                    >
                                        {{ option.value }} - {{ option.label }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <!-- Result -->
                        <div class="p-4 bg-muted rounded-lg">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-sm font-medium">GCS Score:</span>
                                <span class="text-2xl font-bold">{{ gcsScore }}/15</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-sm text-muted-foreground">Severity:</span>
                                <Badge :class="gcsSeverity.color">
                                    {{ gcsSeverity.label }}
                                </Badge>
                            </div>
                            <div class="text-xs text-muted-foreground mt-2">
                                E{{ eyeOpening }} V{{ verbalResponse }} M{{ motorResponse }}
                            </div>
                        </div>

                        <div class="text-xs text-muted-foreground">
                            <strong>Severity:</strong> Mild (13-15), Moderate (9-12), Severe (≤8)
                        </div>
                    </CardContent>
                </Card>

                <!-- Parkland Formula -->
                <Card v-if="activeCalculator === 'parkland'">
                    <CardHeader>
                        <CardTitle class="text-base">Parkland Formula (Burns)</CardTitle>
                    </CardHeader>
                    <CardContent class="space-y-4">
                        <div class="space-y-2">
                            <Label for="burn-weight">Weight (kg)</Label>
                            <Input
                                id="burn-weight"
                                v-model.number="burnWeight"
                                type="number"
                                step="0.1"
                                min="0"
                                placeholder="Enter weight"
                            />
                        </div>

                        <div class="space-y-2">
                            <Label for="burn-percent">% TBSA Burned</Label>
                            <Input
                                id="burn-percent"
                                v-model.number="burnPercentage"
                                type="number"
                                step="1"
                                min="0"
                                max="100"
                                placeholder="Enter % of total body surface area"
                            />
                        </div>

                        <!-- Result -->
                        <div v-if="burnPercentage > 0 && burnWeight > 0" class="p-4 bg-muted rounded-lg space-y-3">
                            <div class="text-sm font-medium">Fluid Resuscitation (24h):</div>
                            
                            <div class="grid grid-cols-2 gap-2">
                                <div class="p-2 bg-background rounded">
                                    <div class="text-xs text-muted-foreground">Total 24h Fluid</div>
                                    <div class="text-lg font-semibold">{{ parklandFluid.totalFluid.toFixed(0) }} ml</div>
                                </div>
                                <div class="p-2 bg-background rounded">
                                    <div class="text-xs text-muted-foreground">Fluid Type</div>
                                    <div class="text-sm font-medium">Lactated Ringer's</div>
                                </div>
                            </div>

                            <div class="text-xs space-y-1">
                                <div class="font-medium">Administration Schedule:</div>
                                <ul class="list-disc list-inside text-muted-foreground">
                                    <li>First 8 hours: {{ parklandFluid.first8Hours.toFixed(0) }} ml</li>
                                    <li>Next 16 hours: {{ parklandFluid.next16Hours.toFixed(0) }} ml</li>
                                </ul>
                            </div>
                        </div>

                        <div class="text-xs text-muted-foreground">
                            <strong>Formula:</strong> 4ml × weight (kg) × %TBSA
                            <br />
                            <strong>Note:</strong> For burns >20% TBSA in adults or >10% in children.
                        </div>
                    </CardContent>
                </Card>

                <!-- Disclaimer -->
                <div class="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div class="flex gap-2">
                        <svg class="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div class="text-xs text-yellow-800 dark:text-yellow-200">
                            <strong>Disclaimer:</strong> These calculators are for reference only.
                            Always verify with current clinical guidelines and use clinical judgment.
                        </div>
                    </div>
                </div>
            </div>
        </SheetContent>
    </Sheet>
</template>
