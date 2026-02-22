<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { router } from '@inertiajs/vue3';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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

interface Props {
    patient: Patient;
    readOnly?: boolean;
    sessionCouchId?: string; // The clinical session's CouchDB ID
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'tabChange', tab: string): void;
}>();

// Treatment state
const treatment = reactive({
    // Medications
    medications: [] as { name: string; dose: string; route: string; frequency: string; duration: string }[],
    newMedication: { name: '', dose: '', route: 'oral', frequency: '', duration: '' },
    
    // Fluids
    fluids: [] as { type: string; volume: string; rate: string }[],
    newFluid: { type: '', volume: '', rate: '' },
    
    // Oxygen
    oxygenRequired: false,
    oxygenType: '',
    oxygenFlow: '',
    
    // Disposition
    disposition: '' as 'admit' | 'discharge' | 'refer' | '',
    admissionWard: '',
    referralFacility: '',
    referralReason: '',
    
    // Follow-up
    followUpInstructions: '',
    returnPrecautions: '',
});

const isSaving = ref(false);

// Common medications for pediatric patients
const commonMedications = [
    { name: 'Amoxicillin', dose: '25-50 mg/kg/day', route: 'oral', frequency: 'TID' },
    { name: 'Artemether-Lumefantrine', dose: 'Weight-based', route: 'oral', frequency: 'BD x 3 days' },
    { name: 'Paracetamol', dose: '15 mg/kg', route: 'oral', frequency: 'QID PRN' },
    { name: 'ORS', dose: 'Ad lib', route: 'oral', frequency: 'PRN' },
    { name: 'Ceftriaxone', dose: '50-100 mg/kg/day', route: 'IV', frequency: 'OD' },
    { name: 'Gentamicin', dose: '7.5 mg/kg/day', route: 'IV', frequency: 'OD' },
    { name: 'Benzyl Penicillin', dose: '100,000 U/kg/day', route: 'IV', frequency: 'QID' },
    { name: 'Salbutamol Nebulizer', dose: '2.5-5 mg', route: 'nebulized', frequency: 'Q4-6H PRN' },
];

const addMedication = (med?: typeof commonMedications[0]) => {
    if (med) {
        treatment.medications.push({
            name: med.name,
            dose: med.dose,
            route: med.route,
            frequency: med.frequency,
            duration: '',
        });
    } else if (treatment.newMedication.name) {
        treatment.medications.push({ ...treatment.newMedication });
        treatment.newMedication = { name: '', dose: '', route: 'oral', frequency: '', duration: '' };
    }
};

const removeMedication = (index: number) => {
    treatment.medications.splice(index, 1);
};

const addFluid = () => {
    if (treatment.newFluid.type) {
        treatment.fluids.push({ ...treatment.newFluid });
        treatment.newFluid = { type: '', volume: '', rate: '' };
    }
};

const removeFluid = (index: number) => {
    treatment.fluids.splice(index, 1);
};

const saveTreatment = async () => {
    isSaving.value = true;
    
    // Use Inertia router which automatically handles CSRF tokens and redirects
    router.put(
        `/gp/sessions/${props.sessionCouchId || props.patient.id}/treatment-plan`,
        { treatment_plan: treatment },
        {
            preserveScroll: true,
            onSuccess: () => {
                // Emit event to change to prescription tab
                emit('tabChange', 'prescription');
            },
            onError: (errors: Record<string, string>) => {
                console.error('Failed to save treatment:', errors);
            },
            onFinish: () => {
                isSaving.value = false;
            },
        }
    );
};
</script>

<template>
    <div class="space-y-4">
        <!-- Medications -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg flex items-center justify-between">
                    <span>Medications</span>
                    <Badge variant="outline">{{ treatment.medications.length }} prescribed</Badge>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <!-- Quick Add Common Medications -->
                <div class="mb-4">
                    <Label class="text-sm text-muted-foreground mb-2 block">Quick Add Common Medications</Label>
                    <div class="flex flex-wrap gap-2">
                        <Button
                            v-for="med in commonMedications"
                            :key="med.name"
                            variant="outline"
                            size="sm"
                            :disabled="readOnly"
                            @click="addMedication(med)"
                        >
                            {{ med.name }}
                        </Button>
                    </div>
                </div>

                <!-- Prescribed Medications List -->
                <div v-if="treatment.medications.length > 0" class="mb-4 space-y-2">
                    <Label class="text-sm text-muted-foreground">Prescribed Medications</Label>
                    <div
                        v-for="(med, index) in treatment.medications"
                        :key="index"
                        class="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                        <div>
                            <div class="font-medium">{{ med.name }}</div>
                            <div class="text-sm text-muted-foreground">
                                {{ med.dose }} | {{ med.route }} | {{ med.frequency }}
                                <span v-if="med.duration">| {{ med.duration }}</span>
                            </div>
                        </div>
                        <Button v-if="!readOnly" variant="ghost" size="sm" @click="removeMedication(index)">
                            <svg class="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </Button>
                    </div>
                </div>

                <!-- Add Custom Medication -->
                <div v-if="!readOnly" class="grid grid-cols-5 gap-2">
                    <Input v-model="treatment.newMedication.name" placeholder="Medication" />
                    <Input v-model="treatment.newMedication.dose" placeholder="Dose" />
                    <select
                        v-model="treatment.newMedication.route"
                        class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    >
                        <option value="oral">Oral</option>
                        <option value="IV">IV</option>
                        <option value="IM">IM</option>
                        <option value="nebulized">Nebulized</option>
                        <option value="topical">Topical</option>
                    </select>
                    <Input v-model="treatment.newMedication.frequency" placeholder="Frequency" />
                    <Button @click="addMedication()">Add</Button>
                </div>
            </CardContent>
        </Card>

        <!-- Fluids -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg">IV Fluids</CardTitle>
            </CardHeader>
            <CardContent>
                <div v-if="treatment.fluids.length > 0" class="mb-4 space-y-2">
                    <div
                        v-for="(fluid, index) in treatment.fluids"
                        :key="index"
                        class="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                        <div>
                            <span class="font-medium">{{ fluid.type }}</span>
                            <span class="text-muted-foreground ml-2">{{ fluid.volume }} @ {{ fluid.rate }}</span>
                        </div>
                        <Button v-if="!readOnly" variant="ghost" size="sm" @click="removeFluid(index)">
                            <svg class="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </Button>
                    </div>
                </div>
                <div v-if="!readOnly" class="grid grid-cols-4 gap-2">
                    <Input v-model="treatment.newFluid.type" placeholder="Fluid Type" />
                    <Input v-model="treatment.newFluid.volume" placeholder="Volume" />
                    <Input v-model="treatment.newFluid.rate" placeholder="Rate" />
                    <Button @click="addFluid()">Add</Button>
                </div>
            </CardContent>
        </Card>

        <!-- Oxygen -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg flex items-center gap-2">
                    <span>Oxygen Therapy</span>
                    <Badge v-if="treatment.oxygenRequired" variant="destructive">Required</Badge>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div class="flex items-center gap-4 mb-4">
                    <Button
                        :variant="treatment.oxygenRequired ? 'default' : 'outline'"
                        :disabled="readOnly"
                        @click="treatment.oxygenRequired = !treatment.oxygenRequired"
                    >
                        {{ treatment.oxygenRequired ? 'Oxygen Required' : 'No Oxygen Required' }}
                    </Button>
                </div>
                <div v-if="treatment.oxygenRequired" class="grid grid-cols-2 gap-4">
                    <div>
                        <Label>Delivery Method</Label>
                        <select
                            v-model="treatment.oxygenType"
                            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                            :disabled="readOnly"
                        >
                            <option value="">Select...</option>
                            <option value="nasal_cannula">Nasal Cannula</option>
                            <option value="face_mask">Face Mask</option>
                            <option value="non_rebreather">Non-Rebreather Mask</option>
                            <option value="high_flow">High Flow Nasal Cannula</option>
                        </select>
                    </div>
                    <div>
                        <Label>Flow Rate (L/min)</Label>
                        <Input v-model="treatment.oxygenFlow" placeholder="e.g., 2-4" :disabled="readOnly" />
                    </div>
                </div>
            </CardContent>
        </Card>

        <!-- Disposition -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg">Disposition</CardTitle>
            </CardHeader>
            <CardContent>
                <div class="flex gap-2 mb-4">
                    <Button
                        :variant="treatment.disposition === 'admit' ? 'default' : 'outline'"
                        :disabled="readOnly"
                        @click="treatment.disposition = 'admit'"
                    >
                        Admit
                    </Button>
                    <Button
                        :variant="treatment.disposition === 'discharge' ? 'default' : 'outline'"
                        :disabled="readOnly"
                        @click="treatment.disposition = 'discharge'"
                    >
                        Discharge
                    </Button>
                    <Button
                        :variant="treatment.disposition === 'refer' ? 'default' : 'outline'"
                        :disabled="readOnly"
                        @click="treatment.disposition = 'refer'"
                    >
                        Refer
                    </Button>
                </div>

                <!-- Admission Details -->
                <div v-if="treatment.disposition === 'admit'" class="space-y-2">
                    <Label>Admission Ward</Label>
                    <select
                        v-model="treatment.admissionWard"
                        class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                        :disabled="readOnly"
                    >
                        <option value="">Select ward...</option>
                        <option value="pediatric">Pediatric Ward</option>
                        <option value="icu">ICU</option>
                        <option value="high_dependency">High Dependency Unit</option>
                        <option value="isolation">Isolation</option>
                    </select>
                </div>

                <!-- Referral Details -->
                <div v-if="treatment.disposition === 'refer'" class="space-y-2">
                    <Label>Referral Facility</Label>
                    <Input v-model="treatment.referralFacility" placeholder="Hospital/Facility name" :disabled="readOnly" />
                    <Label>Referral Reason</Label>
                    <Textarea v-model="treatment.referralReason" rows="2" placeholder="Reason for referral..." :disabled="readOnly" />
                </div>

                <!-- Discharge Instructions -->
                <div v-if="treatment.disposition === 'discharge'" class="space-y-2">
                    <Label>Follow-up Instructions</Label>
                    <Textarea v-model="treatment.followUpInstructions" rows="2" placeholder="Follow-up instructions..." :disabled="readOnly" />
                    <Label>Return Precautions</Label>
                    <Textarea v-model="treatment.returnPrecautions" rows="2" placeholder="When to return..." :disabled="readOnly" />
                </div>
            </CardContent>
        </Card>

        <!-- Save Button -->
        <div v-if="!readOnly" class="flex justify-end gap-2">
            <Button variant="outline">
                Save Draft
            </Button>
            <Button :disabled="isSaving" @click="saveTreatment">
                {{ isSaving ? 'Saving...' : 'Save Treatment Plan' }}
            </Button>
        </div>
    </div>
</template>
